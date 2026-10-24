'use strict';
/** ขอและส่งรหัส OTP ซ้ำสำหรับการกระทำที่ต้องยืนยัน — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, otp, mailer, readJsonBody, sendJson, maskEmail, MAIL_SEND_ERROR, rateLimited, requireAuth,
} = require('../core/context');

const api = express.Router();
const OTP_SIGN_PURPOSES = {
  // ลงนามเอกสารของตัวเอง ต้องเป็นเจ้าของเอกสาร
  'sign-doc': async (req, refId) => {
    const doc = await store.find('documents', refId);
    return (doc && doc.userId === req.user.id) ? doc : null;
  },
  // ลงนามตอบกลับคำขอจากคู่ค้า ต้องเป็นผู้รับคำขอ และคำขอต้องยังรอตอบอยู่
  'sign-request': async (req, refId) => {
    const r = await store.find('requests', refId);
    return (r && r.toUserId === req.user.id && r.status === 'sent') ? r : null;
  },
  // เปลี่ยนเลขบัญชีธนาคารรับเงิน ไม่มี refId เพราะยืนยันตัวผู้ใช้เองเท่านั้น
  'change-bank': (req) => req.user,
  // ลบบัญชีที่สมัครด้วย Google (ไม่มีรหัสผ่านให้ยืนยัน)
  'delete-account': (req) => req.user,
};

api.post('/api/otp/request', requireAuth(async (req, res) => {
  // ข้อ: ไม่มี rate limit ที่ /api/otp/request ป้องกันการยิงส่งอีเมล OTP ถล่มผู้ใช้คนเดียวซ้ำๆ
  if (rateLimited(res, `otp-req:${req.user.id}`, 8, 10 * 60 * 1000, 'ขอรหัส OTP ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')) return;
  const b = await readJsonBody(req);
  const checker = OTP_SIGN_PURPOSES[b.purpose];
  if (!checker) return sendJson(res, 400, { error: 'ประเภทการยืนยันไม่ถูกต้อง' });
  const target = await checker(req, b.refId);
  if (!target) return sendJson(res, 404, { error: 'ไม่พบรายการที่ต้องการยืนยัน หรือคุณไม่มีสิทธิ์ทำรายการนี้' });
  const { id: otpId, code } = await otp.createOtp(req.user.id, b.purpose, b.refId);
  const mailResult = await mailer.sendOtpEmail(req.user.email, { code, purpose: b.purpose, displayName: req.user.displayName });
  if (mailResult.ok === false) return sendJson(res, 502, { error: MAIL_SEND_ERROR });
  sendJson(res, 200, { otpId, emailMasked: maskEmail(req.user.email), ...(mailResult.dev ? { devCode: code } : {}) });
}));

api.post('/api/otp/resend', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const row = await store.find('otp_codes', b.otpId);
  if (!row || row.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบรายการ OTP นี้' });
  const r = await otp.regenerate(b.otpId);
  if (!r) return sendJson(res, 400, { error: 'ไม่สามารถขอรหัสใหม่ได้ กรุณาเริ่มรายการใหม่' });
  if (r.exhausted) return sendJson(res, 429, { error: 'ขอรหัสใหม่ครบจำนวนครั้งที่กำหนดแล้ว กรุณาเริ่มรายการใหม่' });
  if (r.throttled) return sendJson(res, 429, { error: `กรุณารออีก ${r.waitSec} วินาทีก่อนขอรหัสใหม่` });
  const mailResult = await mailer.sendOtpEmail(req.user.email, { code: r.code, purpose: row.purpose, displayName: req.user.displayName });
  if (mailResult.ok === false) return sendJson(res, 502, { error: MAIL_SEND_ERROR });
  sendJson(res, 200, { otpId: b.otpId, ...(mailResult.dev ? { devCode: r.code } : {}) });
}));


module.exports = api;
