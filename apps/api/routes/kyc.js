'use strict';
/** เอกสารยืนยันตัวตน (KYC) — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { storage, store, profile, filestore, magicbytes, readJsonBody, sendJson, publicUser, requireAuth, logAudit,
  notify, KYC_MIME, KYC_MAX,
} = require('../core/context');
const { disposition } = require('../core/docs');

const api = express.Router();
/* =========================================================
 * เอกสารยืนยันตัวตน (KYC) จัดเก็บแบบเข้ารหัส
 * ระบบไม่ขอสำเนาบัตรประชาชน เก็บเฉพาะเลข 13 หลักเท่านั้น
 * ========================================================= */
api.get('/api/kyc', requireAuth(async (req, res) => {
  const items = (await store.all('kyc_documents', (k) => k.userId === req.user.id))
    .map(({ storedName, ...rest }) => rest).reverse();
  const required = profile.requiredKyc(req.user).map((r) => ({
    ...r, ...profile.KYC_TYPES[r.type],
    uploaded: items.find((i) => i.docType === r.type) || null,
  }));
  sendJson(res, 200, {
    items, required,
    verifyStatus: req.user.verifyStatus || 'unverified',
    verifyNote: req.user.verifyNote || '',
    kycConsent: !!(req.user.consent && (req.user.consent.purposes || []).includes('kyc')),
  });
}));

api.post('/api/kyc', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!profile.KYC_TYPES[b.docType]) return sendJson(res, 400, { error: 'ประเภทเอกสารไม่ถูกต้อง' });
  if (!(req.user.consent && (req.user.consent.purposes || []).includes('kyc'))) {
    return sendJson(res, 403, { error: 'กรุณาให้ความยินยอมการจัดเก็บเอกสารยืนยันตัวตนก่อน (ตั้งค่าได้ที่หน้าโปรไฟล์ หัวข้อความเป็นส่วนตัว)' });
  }
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์' });
  if (!KYC_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PDF, PNG, JPG, WEBP เท่านั้น' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (!buf.length) return sendJson(res, 400, { error: 'ไฟล์เสียหายหรือว่างเปล่า' });
  if (buf.length > KYC_MAX) return sendJson(res, 413, { error: 'ไฟล์มีขนาดเกิน 5 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์จริง' });

  // อัปโหลดซ้ำประเภทเดิม = แทนที่ของเดิม
  const old = await store.findOne('kyc_documents', (k) => k.userId === req.user.id && k.docType === b.docType);
  if (old) { await storage.remove(old.storedName); await store.remove('kyc_documents', old.id); }

  const storedName = await storage.put(buf, KYC_MIME[b.mime], { prefix: 'kyc_' });
  const row = await store.insert('kyc_documents', {
    userId: req.user.id, docType: b.docType,
    filename: String(b.filename || '').slice(0, 160), mime: b.mime, size: buf.length,
    storedName, status: 'pending', note: '',
  });
  await logAudit(req.user.id, null, 'kyc-upload', `อัปโหลด${profile.KYC_TYPES[b.docType].label} (จัดเก็บแบบเข้ารหัส)`, req.user.displayName);
  const { storedName: _sn, ...meta } = row;
  sendJson(res, 201, meta);
}));

api.get('/api/kyc/:id/file', requireAuth(async (req, res) => {
  const row = await store.find('kyc_documents', req.params.id);
  const isOwner = row && row.userId === req.user.id;
  const isReviewer = req.user.role === 'admin';
  if (!row || (!isOwner && !isReviewer)) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  try {
    const buf = await storage.get(row.storedName);
    // PDPA: บันทึกทุกครั้งที่มีการเปิดดูเอกสารยืนยันตัวตน โดยเฉพาะเมื่อผู้ตรวจสอบเป็นผู้เปิด
    await logAudit(row.userId, null, 'kyc-view',
      `เปิดดู${profile.KYC_TYPES[row.docType] ? profile.KYC_TYPES[row.docType].label : row.docType}` +
      (isReviewer && !isOwner ? ' โดยผู้ตรวจสอบ' : ' โดยเจ้าของบัญชี'), req.user.displayName);
    // ชื่อไฟล์จริงที่ผู้ใช้อัปโหลด ใช้ตอนเปิดในแท็บใหม่/บันทึกไฟล์ (เดิมไม่มี ได้ชื่อเป็นเลข id)
    const ext = KYC_MIME[row.mime] || 'bin';
    const name = row.filename || `kyc-${row.docType}.${ext}`;
    res.writeHead(200, {
      'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'Content-Length': buf.length,
      'Content-Disposition': disposition(req.query.download ? 'attachment' : 'inline', name),
    });
    res.end(buf);
  } catch {
    sendJson(res, 500, { error: 'เปิดไฟล์ไม่สำเร็จ ไฟล์อาจเสียหายหรือคีย์เข้ารหัสไม่ตรงกัน' });
  }
}));

api.delete('/api/kyc/:id', requireAuth(async (req, res) => {
  const row = await store.find('kyc_documents', req.params.id);
  if (!row || row.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  await storage.remove(row.storedName);
  await store.remove('kyc_documents', row.id);
  await logAudit(req.user.id, null, 'kyc-delete', 'ลบเอกสารยืนยันตัวตน', req.user.displayName);
  sendJson(res, 200, { ok: true });
}));

// ส่งเอกสารให้ผู้ดูแลระบบตรวจสอบ
api.post('/api/kyc/submit', requireAuth(async (req, res) => {
  const required = profile.requiredKyc(req.user).filter((r) => r.required);
  const owned = await store.all('kyc_documents', (k) => k.userId === req.user.id);
  const missing = required.filter((r) => !owned.some((o) => o.docType === r.type))
    .map((r) => profile.KYC_TYPES[r.type].label);
  if (missing.length) return sendJson(res, 400, { error: 'ยังขาดเอกสาร: ' + missing.join(', ') });
  const c = profile.completeness(req.user);
  if (!c.ok) return sendJson(res, 400, { error: 'ข้อมูลโปรไฟล์ยังไม่ครบ ขาด: ' + c.missing.join(', ') });

  const u = await store.update('users', req.user.id, { verifyStatus: 'pending', verifyNote: '', submittedAt: new Date().toISOString() });
  await logAudit(req.user.id, null, 'kyc-submit', 'ส่งเอกสารยืนยันตัวตนให้ผู้ดูแลระบบตรวจสอบ', req.user.displayName);
  for (const admin of await store.all('users', (x) => x.role === 'admin')) {
    await notify(admin.id, 'kyc', `มีคำขอยืนยันตัวตนใหม่จาก ${u.companyName || u.displayName}`, null);
  }
  sendJson(res, 200, { user: publicUser(u) });
}));


module.exports = api;
