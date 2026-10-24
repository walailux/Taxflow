'use strict';
/** หน้าผู้ดูแลระบบ: ตรวจและอนุมัติการยืนยันตัวตน — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, profile, readJsonBody, sendJson, publicUser, requireAdmin, logAudit, notify,
} = require('../core/context');
const { profileMeta,
} = require('../core/docs');

const api = express.Router();
/* =========================================================
 * ผู้ดูแลระบบ ตรวจสอบและอนุมัติการยืนยันตัวตน
 * ========================================================= */
api.get('/api/admin/users', requireAdmin(async (req, res) => {
  const status = new URL(req.url, 'http://localhost').searchParams.get('status');
  let list = await store.all('users', (u) => u.role !== 'admin');
  if (status) list = list.filter((u) => (u.verifyStatus || 'unverified') === status);
  const items = (await Promise.all(list.map(async (u) => ({
    id: u.id, email: u.email, role: u.role, entityType: u.entityType,
    displayName: u.displayName, companyName: u.companyName,
    taxId: u.taxId, vatRegistered: !!u.vatRegistered,
    verifyStatus: u.verifyStatus || 'unverified', verifyNote: u.verifyNote || '',
    submittedAt: u.submittedAt || null, createdAt: u.createdAt,
    docCount: await store.count('kyc_documents', (k) => k.userId === u.id),
  })))).reverse();
  sendJson(res, 200, { items });
}));

api.get('/api/admin/users/:id', requireAdmin(async (req, res) => {
  const u = await store.find('users', req.params.id);
  if (!u || u.role === 'admin') return sendJson(res, 404, { error: 'ไม่พบผู้ใช้' });
  const docs = (await store.all('kyc_documents', (k) => k.userId === u.id)).map(({ storedName, ...r }) => r);
  sendJson(res, 200, {
    user: publicUser(u),
    profile: profileMeta(u),
    kycDocs: docs.map((d) => ({ ...d, label: (profile.KYC_TYPES[d.docType] || {}).label || d.docType })),
    addressText: profile.formatAddress(u.addr || {}),
    branchText: profile.branchLabel(u),
  });
}));

api.post('/api/admin/users/:id/verify', requireAdmin(async (req, res) => {
  const b = await readJsonBody(req);
  const u = await store.find('users', req.params.id);
  if (!u || u.role === 'admin') return sendJson(res, 404, { error: 'ไม่พบผู้ใช้' });
  // ข้อ: อนุมัติ/ไม่อนุมัติได้เฉพาะบัญชีที่ "ส่งเอกสารขอตรวจสอบแล้ว" (verifyStatus=pending) เท่านั้น
  // กันแอดมินกดอนุมัติบัญชีที่ยังไม่ได้ submit เอกสารเลย
  if (u.verifyStatus !== 'pending') {
    return sendJson(res, 400, { error: 'ผู้ใช้รายนี้ยังไม่ได้ส่งเอกสารขอตรวจสอบตัวตน จึงยังพิจารณาผลไม่ได้' });
  }
  const approve = !!b.approve;
  const note = String(b.note || '').slice(0, 500);
  if (!approve && !note) return sendJson(res, 400, { error: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ เพื่อให้ผู้ใช้แก้ไขได้ถูกต้อง' });
  const updated = await store.update('users', u.id, {
    verifyStatus: approve ? 'verified' : 'rejected',
    verifyNote: note,
    verifiedAt: approve ? new Date().toISOString() : null,
    verifiedBy: req.user.displayName,
  });
  // ข้อ: สถานะรายเอกสารใน kyc_documents ค้างเป็น pending ตลอด ไม่เคยอัปเดตตามผลตรวจของแอดมิน
  for (const doc of await store.all('kyc_documents', (k) => k.userId === u.id)) {
    await store.update('kyc_documents', doc.id, { status: approve ? 'approved' : 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: req.user.displayName });
  }
  await logAudit(u.id, null, approve ? 'kyc-approve' : 'kyc-reject',
    approve ? 'ผู้ดูแลระบบอนุมัติการยืนยันตัวตน' : `ผู้ดูแลระบบไม่อนุมัติ: ${note}`, req.user.displayName);
  await notify(u.id, 'kyc', approve
    ? 'การยืนยันตัวตนของคุณได้รับการอนุมัติแล้ว'
    : `การยืนยันตัวตนไม่ผ่าน: ${note}`, null);
  sendJson(res, 200, { user: publicUser(updated) });
}));


module.exports = api;
