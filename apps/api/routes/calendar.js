'use strict';
/** ปฏิทินงานและไฟล์แนบของกิจกรรม — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const crypto = require('crypto');
const { storage, store, filestore, magicbytes, calendar, readJsonBody, sendJson, requireAuth, bangkokDateStr, logAudit,
} = require('../core/context');

const api = express.Router();

/* =========================================================
 * CALENDAR ปฏิทินงาน: กำหนดยื่นภาษี เอกสาร สัญญา ลงนาม + กิจกรรมที่ผู้ใช้เพิ่มเอง
 * กิจกรรมจากระบบคำนวณใหม่ทุกครั้ง (ลบไม่ได้) ส่วนผู้ใช้บันทึกสถานะ/โน้ต/ไฟล์แนบของกิจกรรมระบบได้ผ่าน override
 * ========================================================= */
const CAL_FILE_MIME = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const CAL_FILE_MAX = 5 * 1024 * 1024;

async function calOwnDocs(uid) { return store.all('documents', (d) => d.userId === uid); }
function calRangeFromQuery(req) {
  const url = new URL(req.url, 'http://localhost');
  const today = bangkokDateStr();
  let from = url.searchParams.get('from') || today.slice(0, 8) + '01';
  let to = url.searchParams.get('to') || '';
  if (!calendar.isYMD(from)) from = today.slice(0, 8) + '01';
  if (!calendar.isYMD(to) || to < from) {
    const [y, m] = from.split('-').map(Number);
    to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  }
  // จำกัดช่วงไม่เกินประมาณ 1 ปี กันการคำนวณหนักเกินจำเป็น
  const maxTo = new Date(Date.parse(from + 'T00:00:00Z') + 400 * 86400000).toISOString().slice(0, 10);
  if (to > maxTo) to = maxTo;
  return { from, to, today };
}
function calFieldError(res, errors) {
  const field = Object.keys(errors)[0];
  return sendJson(res, 400, { error: errors[field], field, fieldErrors: errors });
}
async function calFindEvent(req, id) {
  const ev = await store.find('calendar_events', id);
  return ev && ev.userId === req.user.id ? ev : null;
}

api.get('/api/calendar/meta', requireAuth(async (req, res) => {
  sendJson(res, 200, { categories: calendar.CATEGORIES, markers: calendar.MARKERS, priorities: calendar.PRIORITIES, maxAttachments: calendar.MAX_ATTACHMENTS, today: bangkokDateStr() });
}));

api.get('/api/calendar', requireAuth(async (req, res) => {
  const { from, to, today } = calRangeFromQuery(req);
  const uid = req.user.id;
  const [docs, requests, userEvents, overrides] = await Promise.all([
    calOwnDocs(uid),
    store.all('requests', (r) => r.toUserId === uid || r.fromUserId === uid),
    store.all('calendar_events', (e) => e.userId === uid),
    store.all('calendar_overrides', (o) => o.userId === uid),
  ]);
  // คำขอที่ได้รับ: ต้องใช้ข้อมูลเอกสารของผู้ส่งเพื่อแสดงชื่อเอกสาร (เฉพาะชื่อ/เลขที่ ไม่ส่งเนื้อหาเอกสาร)
  const foreignIds = [...new Set(requests.filter((r) => r.toUserId === uid).map((r) => r.docId))];
  const foreign = (await Promise.all(foreignIds.map((id) => store.find('documents', id)))).filter(Boolean)
    .map((d) => ({ id: d.id, type: d.type, docNo: d.docNo, status: d.status, userId: d.userId }));
  const items = calendar.collect({ user: req.user, docs: [...docs, ...foreign.filter((f) => !docs.some((d) => d.id === f.id))], requests, userEvents, overrides, from, to });
  sendJson(res, 200, { from, to, today, items });
}));

api.post('/api/calendar', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const count = (await store.all('calendar_events', (e) => e.userId === req.user.id)).length;
  if (count >= 2000) return sendJson(res, 400, { error: 'จำนวนกิจกรรมในปฏิทินเกินขีดจำกัด 2,000 รายการ' });
  const ownDocIds = (await calOwnDocs(req.user.id)).map((d) => d.id);
  const { errors, clean } = calendar.validateEvent(b, { ownDocIds });
  if (Object.keys(errors).length) return calFieldError(res, errors);
  const row = await store.insert('calendar_events', { userId: req.user.id, ...clean, attachments: [], createdAt: new Date().toISOString() });
  await logAudit(req.user.id, clean.linkDocId, 'calendar-add', `เพิ่มกิจกรรมปฏิทิน "${clean.title}" วันที่ ${clean.date}`, req.user.displayName);
  sendJson(res, 201, { id: row.id });
}));

api.put('/api/calendar/:id', requireAuth(async (req, res) => {
  const ev = await calFindEvent(req, req.params.id);
  if (!ev) return sendJson(res, 404, { error: 'ไม่พบกิจกรรม' });
  const b = await readJsonBody(req);
  const ownDocs = await calOwnDocs(req.user.id);
  const merged = { ...ev, ...b };
  const { errors, clean } = calendar.validateEvent(merged, { existing: ev, ownDocIds: ownDocs.map((d) => d.id) });
  // เอกสารที่ยืนยันแล้ว: ห้ามถอดการผูกเอกสารออก (ไม่งั้นจะกลายเป็นช่องทางลบกิจกรรมที่ถูกล็อก)
  const linked = ev.linkDocId ? ownDocs.find((d) => d.id === ev.linkDocId) : null;
  if (linked && calendar.LOCKED_DOC_STATUS.includes(linked.status) && clean.linkDocId !== ev.linkDocId) {
    errors.linkDocId = 'กิจกรรมนี้ผูกกับเอกสารที่ยืนยันแล้ว ไม่สามารถเปลี่ยนเอกสารได้';
  }
  if (Object.keys(errors).length) return calFieldError(res, errors);
  await store.update('calendar_events', ev.id, { ...clean, updatedAt: new Date().toISOString() });
  await logAudit(req.user.id, clean.linkDocId, 'calendar-edit', `แก้ไขกิจกรรมปฏิทิน "${clean.title}"`, req.user.displayName);
  sendJson(res, 200, { ok: true });
}));

api.delete('/api/calendar/:id', requireAuth(async (req, res) => {
  const ev = await calFindEvent(req, req.params.id);
  if (!ev) return sendJson(res, 404, { error: 'ไม่พบกิจกรรม' });
  const docsById = Object.fromEntries((await calOwnDocs(req.user.id)).map((d) => [d.id, d]));
  const lk = calendar.lockState({ ...ev, source: 'user' }, docsById);
  if (lk.locked) return sendJson(res, 423, { error: `ไม่สามารถลบได้: ${lk.reason}` });
  for (const f of (ev.attachments || [])) await storage.remove(f.storedName);
  await store.remove('calendar_events', ev.id);
  await logAudit(req.user.id, ev.linkDocId, 'calendar-del', `ลบกิจกรรมปฏิทิน "${ev.title}"`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

// กิจกรรมจากระบบ: บันทึกได้เฉพาะ เสร็จแล้ว / บันทึกเพิ่มเติม / สัญลักษณ์
api.post('/api/calendar/overrides', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const { errors, clean } = calendar.validateOverride(b);
  if (Object.keys(errors).length) return calFieldError(res, errors);
  const cur = await store.findOne('calendar_overrides', (o) => o.userId === req.user.id && o.sysKey === clean.sysKey);
  if (cur) await store.update('calendar_overrides', cur.id, { ...clean, updatedAt: new Date().toISOString() });
  else await store.insert('calendar_overrides', { userId: req.user.id, ...clean, attachments: [], createdAt: new Date().toISOString() });
  sendJson(res, 200, { ok: true });
}));

async function calFileOwner(req, b) {
  if (b.sysKey) {
    if (!/^sys:[\w:.-]{3,80}$/.test(String(b.sysKey))) return null;
    let o = await store.findOne('calendar_overrides', (x) => x.userId === req.user.id && x.sysKey === b.sysKey);
    if (!o && b.create) o = await store.insert('calendar_overrides', { userId: req.user.id, sysKey: b.sysKey, note: '', marker: 'none', done: false, attachments: [], createdAt: new Date().toISOString() });
    return o ? { table: 'calendar_overrides', row: o } : null;
  }
  const ev = b.eventId ? await calFindEvent(req, b.eventId) : null;
  return ev ? { table: 'calendar_events', row: ev } : null;
}

api.post('/api/calendar/files', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์' });
  if (!CAL_FILE_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PDF, PNG, JPG, WEBP' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (buf.length > CAL_FILE_MAX) return sendJson(res, 413, { error: 'ไฟล์มีขนาดเกิน 5 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์จริง' });
  const owner = await calFileOwner(req, { ...b, create: true });
  if (!owner) return sendJson(res, 404, { error: 'ไม่พบกิจกรรม' });
  const list = owner.row.attachments || [];
  if (list.length >= calendar.MAX_ATTACHMENTS) return sendJson(res, 400, { error: `แนบไฟล์ได้สูงสุด ${calendar.MAX_ATTACHMENTS} ไฟล์ต่อกิจกรรม` });
  const storedName = await storage.put(buf, CAL_FILE_MIME[b.mime], { prefix: 'cal_' });
  const file = { id: crypto.randomBytes(8).toString('hex'), filename: String(b.filename || 'ไฟล์แนบ').slice(0, 150), mime: b.mime, size: buf.length, storedName, at: new Date().toISOString() };
  await store.update(owner.table, owner.row.id, { attachments: [...list, file] });
  await logAudit(req.user.id, null, 'calendar-file', `แนบไฟล์ "${file.filename}" ในกิจกรรมปฏิทิน`, req.user.displayName);
  const { storedName: sn, ...meta } = file;
  sendJson(res, 201, meta);
}));

api.get('/api/calendar/file', requireAuth(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const owner = await calFileOwner(req, { sysKey: url.searchParams.get('sysKey'), eventId: url.searchParams.get('eventId') });
  const f = owner && (owner.row.attachments || []).find((x) => x.id === url.searchParams.get('fileId'));
  if (!f) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  try {
    const buf = await storage.get(f.storedName);
    res.writeHead(200, { 'Content-Type': f.mime, 'Content-Disposition': 'inline; filename="file"', 'Content-Length': buf.length });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'ไฟล์หาย' }); }
}));

api.post('/api/calendar/files/delete', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const owner = await calFileOwner(req, b);
  const f = owner && (owner.row.attachments || []).find((x) => x.id === b.fileId);
  if (!f) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  await storage.remove(f.storedName);
  await store.update(owner.table, owner.row.id, { attachments: owner.row.attachments.filter((x) => x.id !== f.id) });
  await logAudit(req.user.id, null, 'calendar-file-del', `ลบไฟล์แนบ "${f.filename}" จากกิจกรรมปฏิทิน`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

module.exports = api;
