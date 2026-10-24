'use strict';
/** ลงลายมือชื่อ แชร์ QR Code และออกไฟล์ PDF/A-3 + XML — แยกจาก server.js เดิมใน WP1 · WP5 เปลี่ยน /pdf เป็นไฟล์ PDF จริง */
const express = require('express');
const { store, qr, otp, readJsonBody, sendJson, currentUser, requireAuth,
  isValidSignatureImage, contentHash, snapshotVersion, logAudit,
} = require('../core/context');
const { ownDoc, ensureShare, verifyUrl, sendDocPdf, sendDocXml,
} = require('../core/docs');
const docfile = require('../lib/docfile');

const api = express.Router();

/* =========================================================
 * E-SIGNATURE
 * ========================================================= */
api.post('/api/documents/:id/sign', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const b = await readJsonBody(req);
  // ต้องยืนยันด้วยรหัส OTP ที่ส่งไปยังอีเมลก่อนลงนามทุกครั้ง
  const check = await otp.verify(b.otpId, b.code, { userId: req.user.id, purpose: 'sign-doc', refId: doc.id });
  if (!check.ok) return sendJson(res, 400, { error: check.error });
  if (b.image !== undefined && b.image !== null && !isValidSignatureImage(b.image)) {
    return sendJson(res, 400, { error: 'รูปลายเซ็นไม่ถูกต้อง' });
  }
  const signature = { signerName: b.signerName || req.user.displayName, signedAt: new Date().toISOString(), image: b.image || null, contentHash: contentHash(doc) };
  const updated = await store.update('documents', doc.id, { signed: true, signature });
  await snapshotVersion(updated, req.user.displayName, 'ลงลายมือชื่อดิจิทัล (ยืนยันด้วย OTP)');
  await logAudit(req.user.id, doc.id, 'sign', `ลงนามโดย ${signature.signerName} (ยืนยันด้วย OTP)`, req.user.displayName);
  sendJson(res, 200, updated);
}));

/* =========================================================
 * SHARE + VERIFY + QR
 * ========================================================= */

api.post('/api/documents/:id/share', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const share = await ensureShare(doc, req.user.id);
  await logAudit(req.user.id, doc.id, 'share', `สร้างลิงก์แชร์ ${doc.docNo}`, req.user.displayName);
  sendJson(res, 200, { token: share.token, url: verifyUrl(req, share.token) });
}));

api.get('/api/documents/:id/qr.svg', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const share = await ensureShare(doc, req.user.id);
  const svg = qr.toSVG(verifyUrl(req, share.token), { scale: 4 });
  res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' }); res.end(svg);
}));


/* =========================================================
 * PDF / EXPORT / PRINT
 * ========================================================= */


/*
 * WP5: เดิมเส้นทางนี้คืนหน้า HTML ให้เบราว์เซอร์สั่งพิมพ์เอง (Content-Type: text/html)
 * ตอนนี้คืนไฟล์ PDF/A-3 จริง (application/pdf) ที่วาดฝั่งเซิร์ฟเวอร์และเก็บบน Storage
 * ปุ่ม "PDF" ในหน้าเว็บทุกจุดชี้มาที่เส้นทางนี้อยู่แล้ว จึงไม่ต้องแก้ลิงก์ในหน้าเว็บ
 * API ไม่ตอบหน้า HTML แล้ว ถ้าสร้าง PDF ไม่ได้จะตอบ 503 เป็น JSON (ดู sendDocPdf ใน core/docs.js)
 */
api.get('/api/documents/:id/pdf', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'กรุณาเข้าสู่ระบบก่อน' });
  const doc = await store.find('documents', req.params.id);
  if (!doc || doc.userId !== user.id) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (await sendDocPdf(req, res, doc, user)) {
    await logAudit(user.id, doc.id, 'download', `ดาวน์โหลด PDF/A-3 ${doc.docNo || '(ฉบับร่าง)'}`, user.displayName);
  }
});

// ไฟล์ XML ตามมาตรฐาน ขมธอ. 3-2560 เฉพาะเอกสาร e-Tax (ไฟล์เดียวกับที่แนบอยู่ภายใน PDF)
api.get('/api/documents/:id/xml', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (!docfile.supportsXml(doc.type)) {
    return sendJson(res, 404, { error: 'เอกสารประเภทนี้ไม่มีไฟล์ XML มีเฉพาะใบกำกับภาษีและใบรับอิเล็กทรอนิกส์' });
  }
  try {
    await sendDocXml(req, res, doc, req.user);
  } catch (err) {
    return sendJson(res, 400, { error: `สร้างไฟล์ XML ไม่สำเร็จ: ${err.message}` });
  }
  await logAudit(req.user.id, doc.id, 'download', `ดาวน์โหลด XML ${doc.docNo || '(ฉบับร่าง)'}`, req.user.displayName);
}));


module.exports = api;
