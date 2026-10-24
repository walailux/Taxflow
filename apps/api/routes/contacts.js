'use strict';
/** สมุดคู่ค้าและการค้นหาข้ามข้อมูล — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, exporter, thaiid, DS, readJsonBody, sendJson, requireAuth, taxIdError, logAudit,
  notify, docbuild, rateLimited,
} = require('../core/context');

const api = express.Router();

/* =========================================================
 * CONTACTS
 * ========================================================= */
// สมุดคู่ค้า (ver16): เก็บข้อมูลกลางของ Brand / Agency / Influencer ครบชุด เพื่อดึงไปใช้ในเอกสารโดยไม่ต้องกรอกซ้ำ
function contactRecord(b) {
  const t = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
  const errors = [];
  // Data Validation ด้วยกติกาชุดเดียวกับหน้าเว็บ (ค่าว่าง/รูปแบบ/ความยาว)
  const CHECK = [
    ['name', { ...DS.PARTY_FIELDS.name, label: 'ชื่อคู่ค้า' }, true], ['taxId', DS.PARTY_FIELDS.taxId], ['email', DS.PARTY_FIELDS.email],
    ['phone', DS.PARTY_FIELDS.phone], ['bankAccountNo', DS.PARTY_FIELDS.bankAccountNo], ['branch', DS.PARTY_FIELDS.branch],
    ['address', { ...DS.PARTY_FIELDS.address, minLen: 0 }], ['socials', { label: 'ช่องทาง Social Media', type: 'textarea', maxLen: 500 }],
    ['note', { label: 'หมายเหตุ', type: 'text', maxLen: 500 }],
  ];
  for (const [k, def, need] of CHECK) { const m = DS.checkField(def, b[k], { need: !!need }); if (m) errors.push(m); }
  const name = t(b.name, 200);
  const taxId = thaiid.digitsOnly(b.taxId);
  const kind = DS.CONTACT_KINDS.some((k) => k.value === b.kind) ? b.kind : DS.normKind(b.kind);
  const record = {
    name, taxId, kind: DS.CONTACT_KINDS.some((k) => k.value === kind) ? kind : 'other',
    entityType: b.entityType === 'individual' ? 'individual' : b.entityType === 'juristic' ? 'juristic' : (/^0/.test(taxId) ? 'juristic' : 'individual'),
    tradeName: t(b.tradeName, 200), channelName: t(b.channelName, 200), branch: t(b.branch, 60),
    contactPerson: t(b.contactPerson, 150), email: t(b.email, 150), phone: t(b.phone, 40),
    address: t(b.address, 500), authName: t(b.authName, 150), authPosition: t(b.authPosition, 100),
    bankName: t(b.bankName, 100), bankAccountNo: t(b.bankAccountNo, 30).replace(/[^\d-]/g, ''), bankAccountName: t(b.bankAccountName, 150),
    bank: t(b.bank, 200), socials: t(b.socials, 500), note: t(b.note, 500),
  };
  return { errors, record };
}
api.get('/api/contacts', requireAuth(async (req, res) => sendJson(res, 200, { items: (await store.all('contacts', (c) => c.userId === req.user.id)).reverse() })));
api.post('/api/contacts', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const { errors, record } = contactRecord(b);
  if (errors.length) return sendJson(res, 400, { error: errors.join(' · '), errors });
  const dup = await duplicateContact(req.user.id, record);
  if (dup) return sendJson(res, 409, { error: dup, errors: [dup], field: 'taxId' });
  sendJson(res, 201, await store.insert('contacts', { userId: req.user.id, ...record }));
}));
// ตรวจข้อมูลซ้ำในสมุดคู่ค้า: เลขประจำตัวผู้เสียภาษีต้องไม่ซ้ำ (ถ้าไม่มีเลข ห้ามชื่อ+ประเภทซ้ำ)
async function duplicateContact(userId, rec, selfId = null) {
  const list = await store.all('contacts', (c) => c.userId === userId && c.id !== Number(selfId));
  if (rec.taxId) {
    const hit = list.find((c) => c.taxId === rec.taxId && (c.branch || '') === (rec.branch || ''));
    if (hit) return `เลขประจำตัวผู้เสียภาษี ${rec.taxId}${rec.branch ? ' (' + rec.branch + ')' : ''} มีอยู่ในสมุดคู่ค้าแล้ว (${hit.name}) แก้ไขรายการเดิมแทนการเพิ่มใหม่`;
  } else {
    const hit = list.find((c) => !c.taxId && c.name.trim().toLowerCase() === rec.name.trim().toLowerCase() && DS.normKind(c.kind) === rec.kind);
    if (hit) return `คู่ค้าชื่อ "${rec.name}" มีอยู่ในสมุดแล้ว`;
  }
  return null;
}
api.get('/api/contacts/check-duplicate', requireAuth(async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams;
  const msg = await duplicateContact(req.user.id, { taxId: thaiid.digitsOnly(p.get('taxId')), branch: p.get('branch') || '', name: p.get('name') || '', kind: p.get('kind') || 'other' }, p.get('selfId'));
  sendJson(res, 200, { duplicate: !!msg, message: msg || '' });
}));
/* ---------- เชื่อมคู่ค้าที่มีบัญชี TaxFlow: ขออนุญาตดึงข้อมูลจากโปรไฟล์ของเขา ----------
 * 1) ค้นบัญชีด้วยอีเมลหรือเลขประจำตัวผู้เสียภาษี (บอกแค่ "พบ/ไม่พบ" กับชื่อที่แสดง ไม่เปิดข้อมูลอื่นก่อนได้รับอนุญาต)
 * 2) ส่งคำขอ → ไปอยู่ในกล่องแจ้งเตือนของคู่ค้า (เก็บสถานะคำขอไว้ในแถวแจ้งเตือนนั้นเลย ไม่ต้องมีตารางใหม่)
 * 3) คู่ค้ายอมรับ → คัดลอกข้อมูลที่ใช้ออกเอกสาร (ไม่รวมบัญชีธนาคาร) ลงสมุดคู่ค้าของผู้ขอ / ปฏิเสธ → แจ้งผู้ขอ
 * ระหว่างรอ ผู้ขอกรอกข้อมูลเองและสร้างเอกสารต่อได้ตามปกติ */
const LINK_KIND = 'contact_link';
const KIND_OF_ROLE = { creator: 'influencer', agency: 'agency', corporate: 'brand' };
const nameOf = (u) => u.companyName || u.displayName || u.email;

async function findAccount(raw) {
  const q = String(raw || '').trim();
  if (!q) return null;
  if (q.includes('@')) return store.whereOne('users', { email: q.toLowerCase() });
  const digits = thaiid.digitsOnly(q);
  if (digits.length !== 13) return null;
  return (await store.all('users', (u) => u.taxId === digits && u.role !== 'admin'))[0] || null;
}
const linkRows = (fromId, toId) => store.all('notifications', (n) => n.kind === LINK_KIND && n.fromUserId === fromId && (toId == null || n.userId === toId));

api.get('/api/contacts/lookup', requireAuth(async (req, res) => {
  if (rateLimited(res, `contact-lookup:${req.user.id}`, 40, 10 * 60 * 1000, 'ค้นหาถี่เกินไป กรุณารอสักครู่')) return;
  const q = new URL(req.url, 'http://localhost').searchParams.get('q');
  const u = await findAccount(q);
  if (!u || u.role === 'admin') return sendJson(res, 200, { found: false });
  if (u.id === req.user.id) return sendJson(res, 200, { found: true, self: true, name: nameOf(u) });
  const last = (await linkRows(req.user.id, u.id)).pop();
  sendJson(res, 200, { found: true, name: nameOf(u), kind: KIND_OF_ROLE[u.role] || 'other', status: last ? last.linkStatus : null });
}));

api.post('/api/contacts/link-request', requireAuth(async (req, res) => {
  if (rateLimited(res, `contact-link:${req.user.id}`, 20, 60 * 60 * 1000, 'ส่งคำขอถี่เกินไป กรุณาลองใหม่ภายหลัง')) return;
  const b = await readJsonBody(req);
  const u = await findAccount(b.q);
  if (!u || u.role === 'admin') return sendJson(res, 404, { error: 'ไม่พบบัญชี TaxFlow ของคู่ค้านี้ กรอกข้อมูลเองแล้วบันทึกลงสมุดคู่ค้าได้เลย' });
  if (u.id === req.user.id) return sendJson(res, 400, { error: 'นี่คือบัญชีของคุณเอง' });
  const pending = (await linkRows(req.user.id, u.id)).find((n) => n.linkStatus === 'pending');
  if (pending) return sendJson(res, 200, { status: 'pending', name: nameOf(u) });
  const me = nameOf(req.user);
  await notify(u.id, LINK_KIND, `${me} ขออนุญาตดึงข้อมูลของคุณ (ชื่อ เลขประจำตัวผู้เสียภาษี สาขา ที่อยู่ ช่องทางติดต่อ) ไปใช้ในสมุดคู่ค้าและการออกเอกสาร`, null,
    { fromUserId: req.user.id, fromName: me, linkStatus: 'pending' });
  await logAudit(req.user.id, null, 'contact-link', `ขอดึงข้อมูลคู่ค้าจากบัญชี ${nameOf(u)}`, req.user.displayName);
  sendJson(res, 201, { status: 'pending', name: nameOf(u) });
}));

/** ข้อมูลโปรไฟล์ที่ใช้ออกเอกสาร → แถวสมุดคู่ค้า (ไม่รวมบัญชีธนาคาร) */
function contactFromProfile(u) {
  const s = docbuild.issuerSnapshot(u);
  return contactRecord({
    name: s.name, taxId: s.taxId, kind: KIND_OF_ROLE[u.role] || 'other', entityType: s.entityType,
    tradeName: s.tradeName, channelName: s.channelName, branch: s.entityType === 'juristic' ? s.branch : '',
    contactPerson: s.contactName, email: s.email, phone: s.phone, address: s.address,
    authName: s.authName, authPosition: s.authPosition, socials: s.socials,
  }).record;
}

async function answerLink(req, res, accept) {
  const n = await store.find('notifications', req.params.id);
  if (!n || n.userId !== req.user.id || n.kind !== LINK_KIND) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (n.linkStatus !== 'pending') return sendJson(res, 409, { error: 'ตอบคำขอนี้ไปแล้ว', status: n.linkStatus });
  const requester = await store.find('users', n.fromUserId);
  const me = nameOf(req.user);
  if (accept && requester) {
    const rec = contactFromProfile(req.user);
    const book = await store.all('contacts', (c) => c.userId === requester.id);
    const hit = book.find((c) => c.linkedUserId === req.user.id)
      || book.find((c) => rec.taxId && c.taxId === rec.taxId && (c.branch || '') === (rec.branch || ''))
      || book.find((c) => rec.email && String(c.email || '').toLowerCase() === rec.email.toLowerCase());
    // อัปเดตเฉพาะช่องที่โปรไฟล์มีค่า ช่องที่ผู้ขอกรอกเองไว้ (บัญชีธนาคาร หมายเหตุ ฯลฯ) ยังอยู่ครบ
    const filled = Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== '' && v != null));
    if (hit) await store.update('contacts', hit.id, { ...filled, linkedUserId: req.user.id, linkedAt: new Date().toISOString() });
    else await store.insert('contacts', { userId: requester.id, ...rec, linkedUserId: req.user.id, linkedAt: new Date().toISOString() });
  }
  await store.update('notifications', n.id, { linkStatus: accept ? 'accepted' : 'declined', read: true, respondedAt: new Date().toISOString() });
  if (requester) {
    await notify(requester.id, accept ? 'contact_linked' : 'contact_declined', accept
      ? `${me} อนุญาตให้ดึงข้อมูลแล้ว ข้อมูลถูกเพิ่ม/อัปเดตในสมุดคู่ค้าของคุณ`
      : `${me} ปฏิเสธคำขอดึงข้อมูล กรอกข้อมูลคู่ค้าเองได้ตามปกติ`, null, { fromUserId: req.user.id });
  }
  sendJson(res, 200, { status: accept ? 'accepted' : 'declined' });
}
api.post('/api/contacts/link-request/:id/accept', requireAuth((req, res) => answerLink(req, res, true)));
api.post('/api/contacts/link-request/:id/decline', requireAuth((req, res) => answerLink(req, res, false)));

api.put('/api/contacts/:id', requireAuth(async (req, res) => {
  const c = await store.find('contacts', req.params.id);
  if (!c || c.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคู่ค้า' });
  const { errors, record } = contactRecord(await readJsonBody(req));
  if (errors.length) return sendJson(res, 400, { error: errors.join(' · '), errors });
  const dup = await duplicateContact(req.user.id, record, c.id);
  if (dup) return sendJson(res, 409, { error: dup, errors: [dup], field: 'taxId' });
  sendJson(res, 200, await store.update('contacts', c.id, record));
}));
api.delete('/api/contacts/:id', requireAuth(async (req, res) => {
  const c = await store.find('contacts', req.params.id);
  if (!c || c.userId !== req.user.id) return sendJson(res, 404, { error: 'not found' });
  await store.remove('contacts', req.params.id); sendJson(res, 200, { deleted: true });
}));

/* ---------- คู่ค้า: นำเข้า/ส่งออก CSV (ลดงานคีย์ข้อมูลซ้ำสำหรับเอเจนซี่ที่มีคู่ค้าเป็นร้อยราย) ---------- */
api.get('/api/contacts/export.csv', requireAuth(async (req, res) => {
  const contacts = (await store.all('contacts', (c) => c.userId === req.user.id)).reverse();
  const csv = exporter.toContactsCSV(contacts);
  await logAudit(req.user.id, null, 'export', 'ส่งออกคู่ค้าเป็น CSV', req.user.displayName);
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="taxflow-contacts.csv"' });
  res.end(csv);
}));

const CONTACT_IMPORT_MAX = 500; // กันไฟล์ใหญ่ผิดปกติทำให้ช้า/ฐานข้อมูลบวมโดยไม่ตั้งใจ
api.post('/api/contacts/import', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const text = String(b.csv || '');
  if (!text.trim()) return sendJson(res, 400, { error: 'ไม่พบเนื้อหาไฟล์ CSV' });
  const rows = exporter.parseContactsCSV(text);
  if (!rows.length) return sendJson(res, 400, { error: 'ไม่พบรายการคู่ค้าในไฟล์ (ต้องมีอย่างน้อยคอลัมน์ชื่อ)' });
  if (rows.length > CONTACT_IMPORT_MAX) return sendJson(res, 400, { error: `นำเข้าได้ครั้งละไม่เกิน ${CONTACT_IMPORT_MAX} รายการ` });

  const existing = await store.all('contacts', (c) => c.userId === req.user.id);
  let created = 0, updated = 0, skipped = 0;
  for (let row of rows) {
    if (row.taxId && taxIdError(row.taxId, row.name)) { skipped++; continue; } // เลขผู้เสียภาษีผิด check digit ข้ามแถวนี้ ไม่บล็อกทั้งไฟล์
    // จับคู่รายการเดิมด้วยเลขผู้เสียภาษีก่อน แล้วค่อย fallback เป็นชื่อ+ประเภทตรงกันเป๊ะ กันสร้างซ้ำตอนนำเข้าไฟล์เดิมซ้ำ
    row = contactRecord(row).record;
    const match = (row.taxId && existing.find((c) => c.taxId && c.taxId === row.taxId))
      || existing.find((c) => !row.taxId && c.name === row.name && c.kind === row.kind);
    if (match) {
      await store.update('contacts', match.id, { ...row });
      Object.assign(match, row);
      updated++;
    } else {
      existing.push(await store.insert('contacts', { userId: req.user.id, ...row }));
      created++;
    }
  }
  await logAudit(req.user.id, null, 'contacts-import', `นำเข้าคู่ค้าจาก CSV: เพิ่ม ${created}, อัปเดต ${updated}, ข้าม ${skipped} (จากทั้งหมด ${rows.length})`, req.user.displayName);
  sendJson(res, 200, { created, updated, skipped, total: rows.length });
}));

/* =========================================================
 * ค้นหารวมศูนย์ (global search) ข้ามเอกสาร / คู่ค้า / คลังเอกสาร ในบัญชีเดียวกัน
 * ใช้ scan ข้อมูลของผู้ใช้เองด้วย JS เหมือน endpoint อื่นๆ ในระบบ (เหมาะกับขนาดข้อมูลต่อบัญชีปัจจุบัน)
 * ========================================================= */
api.get('/api/search', requireAuth(async (req, res) => {
  const q = (new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return sendJson(res, 200, { query: q, documents: [], contacts: [], library: [] });

  const documents = (await store.all('documents', (d) => d.userId === req.user.id &&
    ((d.docNo || '').toLowerCase().includes(q) || JSON.stringify(d).toLowerCase().includes(q))
  )).reverse().slice(0, 20).map((d) => ({
    id: d.id, docNo: d.docNo || 'แบบร่าง', type: d.type, status: d.status,
    counterparty: d.party || d.buyer || d.payee || d.payer || '',
  }));

  const contacts = (await store.all('contacts', (c) => c.userId === req.user.id &&
    `${c.name || ''}${c.taxId || ''}${c.email || ''}${c.phone || ''}`.toLowerCase().includes(q)
  )).reverse().slice(0, 20).map((c) => ({ id: c.id, name: c.name, kind: c.kind, taxId: c.taxId }));

  const library = (await store.all('library', (l) => l.userId === req.user.id &&
    `${l.title || ''}${l.filename || ''}${l.note || ''}`.toLowerCase().includes(q)
  )).reverse().slice(0, 20).map((l) => ({ id: l.id, title: l.title, category: l.category, year: l.year }));

  sendJson(res, 200, { query: q, documents, contacts, library });
}));

module.exports = api;
