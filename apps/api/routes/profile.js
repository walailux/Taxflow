'use strict';
/** โปรไฟล์ผู้ใช้ โลโก้ และตราประทับ — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { storage, store, auth, otp, profile, filestore, magicbytes, readJsonBody, sendJson, publicUser, requireAuth,
  logAudit, IMG_MIME, IMG_MAX,
} = require('../core/context');
const { profileMeta,
} = require('../core/docs');

const api = express.Router();
api.put('/api/auth/profile', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const { patch, errors } = profile.buildPatch(req.user, b);
  if (errors.length) return sendJson(res, 400, { error: errors[0], errors });

  // เลขประจำตัวผู้เสียภาษีต้องไม่ซ้ำกับบัญชีอื่น
  if (patch.taxId && await store.findOne('users', (u) => u.id !== req.user.id && u.taxId === patch.taxId)) {
    return sendJson(res, 409, { error: 'เลขประจำตัวผู้เสียภาษีนี้ถูกใช้โดยบัญชีอื่นแล้ว' });
  }

  // ข้อ: การเปลี่ยนเลขบัญชีธนาคารรับเงินเป็นช่องทางหลักของการโกงเปลี่ยนบัญชีรับเงิน
  // ต้องยืนยันด้วย OTP ก่อนบันทึกทุกครั้ง (เดิมแก้ได้ทันทีเหมือนข้อมูลอื่นๆ ในโปรไฟล์)
  const bankChanged = patch.bank && JSON.stringify(patch.bank) !== JSON.stringify(req.user.bank || {});
  if (bankChanged) {
    const check = await otp.verify(b.otpId, b.code, { userId: req.user.id, purpose: 'change-bank' });
    if (!check.ok) return sendJson(res, 400, { error: 'เปลี่ยนบัญชีธนาคารต้องยืนยันด้วยรหัส OTP ก่อน: ' + check.error, requireOtp: true });
  }

  // ถ้าแก้ข้อมูลสำคัญหลังผ่านการตรวจสอบแล้ว ต้องกลับไปรอตรวจสอบใหม่
  const critical = ['taxId', 'companyName', 'displayName', 'entityType', 'vatRegistered'];
  const changedCritical = critical.some((k) => JSON.stringify(patch[k]) !== undefined && patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(req.user[k]));
  const extra = {};
  if (changedCritical && req.user.verifyStatus === 'verified') {
    extra.verifyStatus = 'pending';
    extra.verifyNote = 'ข้อมูลสำคัญถูกแก้ไข ระบบส่งกลับไปตรวจสอบอีกครั้งโดยอัตโนมัติ';
  }

  // สิทธิ์ e-Tax ผูกกับเลขผู้เสียภาษี ชื่อ และสถานะ VAT ที่แอดมินตรวจไว้ เปลี่ยนแล้วต้องยื่นตรวจใหม่
  const etaxCritical = ['taxId', 'companyName', 'vatRegistered', 'entityType'];
  if (['pending', 'approved'].includes(req.user.etaxStatus)
    && etaxCritical.some((k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(req.user[k]))) {
    extra.etaxStatus = 'none';
    extra.etaxNote = 'ข้อมูลผู้ประกอบการ (เลขผู้เสียภาษี/ชื่อ/สถานะ VAT) ถูกแก้ไข สิทธิ์ออกเอกสาร e-Tax ถูกระงับ กรุณายื่นขอใหม่';
  }
  const u = await store.update('users', req.user.id, { ...patch, ...extra });
  await logAudit(req.user.id, null, 'profile-update', bankChanged ? 'แก้ไขข้อมูลโปรไฟล์ (รวมถึงเปลี่ยนบัญชีธนาคาร ยืนยันด้วย OTP แล้ว)' : 'แก้ไขข้อมูลโปรไฟล์', req.user.displayName);
  sendJson(res, 200, { user: publicUser(u), profile: profileMeta(u) });
}));

/* ---------- โลโก้และตราประทับสำหรับพิมพ์บนเอกสาร + รูปโปรไฟล์ (แสดงในเมนูของแอป ไม่พิมพ์บนเอกสาร) ---------- */
const BRAND_FIELD = { logo: 'logoFile', seal: 'sealFile', avatar: 'avatarFile' };
const BRAND_LABEL = { logo: 'โลโก้บริษัท', seal: 'ตราประทับบริษัท', avatar: 'รูปโปรไฟล์' };
const brandKind = (k) => (Object.hasOwn(BRAND_FIELD, k) ? k : 'logo');
api.post('/api/auth/brand-image', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const kind = brandKind(b.kind);
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์รูปภาพ' });
  if (!IMG_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PNG, JPG, WEBP เท่านั้น' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (buf.length > IMG_MAX) return sendJson(res, 413, { error: 'ไฟล์รูปภาพต้องมีขนาดไม่เกิน 1 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์รูปภาพจริง' });

  const field = BRAND_FIELD[kind];
  const old = req.user[field];
  if (old && old.storedName) await storage.remove(old.storedName);

  const storedName = await storage.put(buf, IMG_MIME[b.mime], { prefix: 'brand_', mime: b.mime });
  const meta = { storedName, mime: b.mime, size: buf.length, filename: String(b.filename || '').slice(0, 120), at: new Date().toISOString() };
  const u = await store.update('users', req.user.id, { [field]: meta });
  await logAudit(req.user.id, null, 'brand-image', `อัปโหลด${BRAND_LABEL[kind]}`, req.user.displayName);
  sendJson(res, 201, { user: publicUser(u), kind });
}));

api.delete('/api/auth/brand-image/:kind', requireAuth(async (req, res) => {
  const field = BRAND_FIELD[brandKind(req.params.kind)];
  const cur = req.user[field];
  if (cur && cur.storedName) await storage.remove(cur.storedName);
  const u = await store.update('users', req.user.id, { [field]: null });
  sendJson(res, 200, { user: publicUser(u) });
}));

api.get('/api/auth/brand-image/:kind', requireAuth(async (req, res) => {
  const meta = req.user[BRAND_FIELD[brandKind(req.params.kind)]];
  if (!meta) return sendJson(res, 404, { error: 'ยังไม่ได้อัปโหลดรูปภาพนี้' });
  try {
    const buf = await storage.get(meta.storedName);
    res.writeHead(200, { 'Content-Type': meta.mime, 'Cache-Control': 'no-store', 'Content-Length': buf.length });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'ไม่พบไฟล์รูปภาพ' }); }
}));

module.exports = api;
