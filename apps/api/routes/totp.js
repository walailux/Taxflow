'use strict';
/** ยืนยันตัวตนสองชั้นด้วยแอป Authenticator — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, qr, totp, readJsonBody, sendJson, publicUser, requireAuth, logAudit,
} = require('../core/context');

const api = express.Router();

/* =========================================================
 * TOTP ยืนยันตัวตนด้วยแอป Authenticator แทน/เพิ่มเติมจาก OTP ทางอีเมล
 * ========================================================= */
// ขั้นที่ 1: ขอ secret ใหม่ + QR ให้สแกน ยังไม่เปิดใช้งานจริงจนกว่าจะยืนยันรหัสจากแอปสำเร็จ (/confirm)
// เก็บไว้ใน totpPendingSecret ชั่วคราว กัน secret เดิมที่เปิดใช้งานอยู่แล้วถูกเขียนทับก่อนยืนยันได้จริง
api.post('/api/totp/setup', requireAuth(async (req, res) => {
  const secret = totp.generateSecret();
  await store.update('users', req.user.id, { totpPendingSecret: secret });
  const uri = totp.keyUri(secret, { label: req.user.email, issuer: 'TaxFlow' });
  // lib/qr.js เป็นตัวสร้าง QR แบบ pure JS ที่รองรับความยาวข้อมูลจำกัด (version 1–6) อีเมลที่ยาวผิดปกติ
  // อาจทำให้ URI เกินขีดจำกัดจนสร้าง QR ไม่ได้ ในกรณีนั้นให้ผู้ใช้กรอกรหัสด้วยตนเองแทนแทนที่จะตอบ 500
  let qrSvg = null;
  try { qrSvg = qr.toSVG(uri, { scale: 4 }); } catch (e) { console.error('[totp] สร้าง QR ไม่สำเร็จ (URI อาจยาวเกินไป):', e.message); }
  sendJson(res, 200, { secret, otpauthUrl: uri, qrSvg });
}));

api.post('/api/totp/confirm', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!req.user.totpPendingSecret) return sendJson(res, 400, { error: 'กรุณาเริ่มตั้งค่าใหม่อีกครั้ง (กดสร้าง QR ใหม่)' });
  if (!totp.verifyTotp(req.user.totpPendingSecret, b.code)) {
    return sendJson(res, 400, { error: 'รหัสไม่ถูกต้อง ตรวจสอบว่านาฬิกาบนอุปกรณ์ของคุณตรงกับเวลาจริงหรือไม่' });
  }
  const u = await store.update('users', req.user.id, {
    totpSecret: req.user.totpPendingSecret, totpEnabled: true,
    totpPendingSecret: null, totpEnrolledAt: new Date().toISOString(),
  });
  await logAudit(req.user.id, null, 'totp-enable', 'เปิดใช้งานการยืนยันตัวตนด้วยแอป Authenticator (TOTP)', req.user.displayName);
  sendJson(res, 200, { user: publicUser(u) });
}));

api.post('/api/totp/disable', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!req.user.totpEnabled) return sendJson(res, 400, { error: 'ยังไม่ได้เปิดใช้งาน TOTP' });
  if (!totp.verifyTotp(req.user.totpSecret, b.code)) return sendJson(res, 400, { error: 'รหัสไม่ถูกต้อง' });
  const u = await store.update('users', req.user.id, { totpSecret: null, totpEnabled: false, totpPendingSecret: null });
  await logAudit(req.user.id, null, 'totp-disable', 'ปิดใช้งานการยืนยันตัวตนด้วยแอป Authenticator (TOTP)', req.user.displayName);
  sendJson(res, 200, { user: publicUser(u) });
}));


module.exports = api;
