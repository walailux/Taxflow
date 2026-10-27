'use strict';
/** สิทธิของเจ้าของข้อมูลส่วนบุคคลตาม PDPA — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { storage, store, auth, otp, profile, pdpa, filestore, readJsonBody, sendJson, publicUser, requireAuth, logAudit,
} = require('../core/context');

const docfile = require('../lib/docfile');

const api = express.Router();
/* =========================================================
 * สิทธิของเจ้าของข้อมูลส่วนบุคคล (PDPA)
 * ========================================================= */

// แก้ไข/ถอนความยินยอมในข้อที่ไม่บังคับ
api.put('/api/pdpa/consent', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const check = pdpa.validateConsent(b.consent);
  if (!check.ok) return sendJson(res, 400, { error: check.error });
  const record = pdpa.makeConsentRecord(check.purposes);
  const u = await store.update('users', req.user.id, { consent: record });
  await store.insert('consents', {
    userId: req.user.id, version: record.version, purposes: record.purposes,
    action: 'update', at: record.at,
  });
  await logAudit(req.user.id, null, 'consent-update', 'ปรับปรุงความยินยอมการใช้ข้อมูลส่วนบุคคล', req.user.displayName);
  sendJson(res, 200, { user: publicUser(u) });
}));

// สิทธิขอสำเนาข้อมูล (มาตรา 30) เป็นไฟล์ JSON ที่เครื่องอ่านได้ ใช้ย้ายไปบริการอื่น (มาตรา 31)
api.get('/api/pdpa/my-data', requireAuth(async (req, res) => {
  const data = await pdpa.buildDataExport(store, req.user);
  await logAudit(req.user.id, null, 'data-export', 'ขอสำเนาข้อมูลส่วนบุคคลของตนเอง (ไฟล์ JSON)', req.user.displayName);
  const body = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="taxflow-my-data-${req.user.id}.json"`,
    'Cache-Control': 'private, no-store',
    'Content-Length': body.length,
  });
  res.end(body);
}));

// สิทธิขอลบข้อมูล (มาตรา 33) ลบข้อมูลระบุตัวตน แต่คงเอกสารภาษีตามที่กฎหมายภาษีบังคับให้เก็บ
api.post('/api/pdpa/delete-account', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (req.user.passwordHash) {
    if (!auth.verifyPassword(b.password || '', req.user.passwordHash)) return sendJson(res, 401, { error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  if (String(b.confirm || '').trim() !== 'ลบบัญชีของฉัน') {
    return sendJson(res, 400, { error: 'กรุณาพิมพ์ข้อความยืนยัน "ลบบัญชีของฉัน" ให้ถูกต้อง' });
  }
  if (!req.user.passwordHash) {
    // บัญชีที่สมัครด้วย Google ไม่มีรหัสผ่าน ยืนยันด้วย OTP ทางอีเมลแทน (ตรวจหลังข้อความยืนยัน รหัสจะได้ไม่เสียเปล่า)
    const v = await otp.verify(b.otpId, b.code, { userId: req.user.id, purpose: 'delete-account' });
    if (!v.ok) return sendJson(res, 401, { error: v.error });
  }
  const uid = req.user.id;
  const oldEmail = req.user.email;
  const oldName = req.user.displayName;
  const ANON_LABEL = 'ผู้ใช้ที่ลบบัญชีแล้ว';

  // ข้อ: การลบบัญชีแก้หลายตารางพร้อมกัน ถ้าล้มเหลวกลางทางไม่ควรเหลือข้อมูลค้างครึ่งๆ กลางๆ ครอบด้วย transaction
  await store.transaction(async () => {
  // ลบไฟล์ทั้งหมดที่เป็นข้อมูลส่วนบุคคล
  for (const k of await store.all('kyc_documents', (x) => x.userId === uid)) {
    await storage.remove(k.storedName);
    await store.remove('kyc_documents', k.id);
  }
  // ข้อ PDPA: การลบบัญชีเดิมตกหล่นคลังเอกสาร (library) และไฟล์แนบเอกสาร (attachments) ต้องลบทั้งไฟล์และแถวด้วย
  for (const l of await store.all('library', (x) => x.userId === uid)) {
    await storage.remove(l.storedName);
    await store.remove('library', l.id);
  }
  for (const t of ['calendar_events', 'calendar_overrides']) {
    for (const c of await store.all(t, (x) => x.userId === uid)) {
      for (const f of (c.attachments || [])) await storage.remove(f.storedName);
      await store.remove(t, c.id);
    }
  }
  for (const a of await store.all('attachments', (x) => x.userId === uid)) {
    await storage.remove(a.storedName);
    await store.remove('attachments', a.id);
  }
  for (const f of ['logoFile', 'sealFile', 'avatarFile']) {
    if (req.user[f] && req.user[f].storedName) await storage.remove(req.user[f].storedName);
  }
  for (const t of ['contacts', 'signatures', 'notifications', 'otp_codes']) {
    for (const row of await store.all(t, (x) => x.userId === uid)) await store.remove(t, row.id);
  }

  // ข้อ PDPA: doc_versions เป็น snapshot ของเอกสารภาษีที่ต้องเก็บไว้ตามกฎหมาย (5 ปี) จึงไม่ลบ
  // แต่ชื่อผู้แก้ไข (editor) ที่ฝังไว้ตรงๆ ต้องล้างไม่ให้ระบุตัวตนเจ้าของบัญชีที่ลบไปแล้ว
  const ownDocs = await store.where('documents', { userId: uid });
  const ownDocIds = new Set(ownDocs.map((d) => d.id));
  // WP5: ไฟล์ PDF/XML ที่ cache ไว้เป็นสำเนาที่สร้างใหม่ได้เสมอจากตัวเอกสาร และมีชื่อ/ที่อยู่ฝังอยู่
  // จึงลบทิ้งตอนลบบัญชี ตัวเอกสารภาษียังเก็บไว้ครบตามมาตรา 87/3 (สร้าง PDF ใหม่ได้เมื่อจำเป็น)
  for (const d of ownDocs) {
    if (d.file && await docfile.purge(d)) await store.update('documents', d.id, { file: null });
  }
  for (const v of await store.all('doc_versions', (x) => ownDocIds.has(x.docId) && x.editor === oldName)) {
    await store.update('doc_versions', v.id, { editor: ANON_LABEL });
  }
  // audit_log ก็เก็บไว้เป็นร่องรอยตรวจสอบตามกฎหมาย แต่ต้องล้างชื่อ/อีเมลที่ระบุตัวตนออก
  // (เช่น ข้อความ "ส่งรหัส OTP ไปที่ xxx@example.com" ที่ฝังอีเมลไว้ตรงๆ ในข้อความ)
  for (const a of await store.all('audit_log')) {
    const isOwn = a.userId === uid && a.actor === oldName;
    const mentionsEmail = oldEmail && a.detail && a.detail.includes(oldEmail);
    if (!isOwn && !mentionsEmail) continue;
    await store.update('audit_log', a.id, {
      actor: isOwn ? ANON_LABEL : a.actor,
      detail: mentionsEmail ? a.detail.split(oldEmail).join('[อีเมลบัญชีที่ถูกลบ]') : a.detail,
    });
  }

  // ทำให้บัญชีไม่ระบุตัวตน แทนการลบทิ้งทั้งหมด เพราะเอกสารภาษีต้องเก็บ 5 ปี
  const anon = {
    ...profile.defaults(req.user.role),
    email: `deleted-${uid}@removed.local`,
    passwordHash: auth.hashPassword(crypto.randomBytes(24).toString('hex')),
    googleSub: null, // รหัสบัญชี Google ระบุตัวบุคคลได้ และถ้าค้างไว้จะสมัครใหม่ด้วย Google เดิมไม่ได้
    displayName: ANON_LABEL, companyName: '', taxId: '',
    deleted: true, deletedAt: new Date().toISOString(),
    tokenVersion: (req.user.tokenVersion || 0) + 1, // เพิกถอน session ที่ยังค้างอยู่ทุกอุปกรณ์ทันที
    consent: null, emailVerified: false, verifyStatus: 'unverified',
  };
  await store.update('users', uid, anon);
  await logAudit(uid, null, 'account-delete', 'ผู้ใช้ใช้สิทธิขอลบข้อมูลส่วนบุคคล ลบข้อมูลระบุตัวตนแล้ว คงเหลือเฉพาะเอกสารภาษีที่กฎหมายบังคับให้เก็บ', 'ระบบ');
  }); // จบ store.transaction
  auth.clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}));

/* =========================================================
 * OTP สำหรับขั้นตอนการลงลายมือชื่อดิจิทัล (ข้อกำหนด: ต้องยืนยันด้วย OTP ก่อนลงนามทุกครั้ง)
 * ========================================================= */

module.exports = api;
