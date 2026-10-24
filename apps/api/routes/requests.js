'use strict';
/** ส่งเอกสารข้ามบัญชี ขอลายเซ็น อนุมัติ และคลังลายเซ็น — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, otp, storage, readJsonBody, sendJson, currentUser, requireAuth,
  isValidSignatureImage, contentHash, snapshotVersion, logAudit, notify, deliverWebhook,
} = require('../core/context');
const { ensureIssued, reqPublic, reqPublicMany, ownDoc, sendDocPdf, docFile,
} = require('../core/docs');
const docfile = require('../lib/docfile');

/** ผู้รับตอบคำขอแล้ว แจ้งเตือน "ส่งเอกสารให้คุณ" ของคำขอนั้นไม่ใช่งานค้างอีกต่อไป จึงทำเครื่องหมายว่าอ่านแล้ว */
async function markRequestNotificationsRead(userId, reqId) {
  for (const n of await store.all('notifications', (x) => x.userId === userId && x.reqId === reqId && !x.read)) {
    await store.update('notifications', n.id, { read: true });
  }
}

const api = express.Router();
/* =========================================================
 * ระบบส่งเอกสารข้ามบัญชี (ver6): ขอลายเซ็น/ขอตรวจสอบ พร้อมกำหนดเวลา
 * บริษัท↔อินฟลู · บริษัท↔เอเจนซี่ · เอเจนซี่เป็นตัวกลางส่งทั้งสองฝ่าย
 * ========================================================= */

// ส่งเอกสารให้บัญชีอื่น (ระบุอีเมลผู้ใช้ในระบบ)
api.post('/api/documents/:id/request', requireAuth(async (req, res) => {
  let doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const b = await readJsonBody(req);
  const email = String(b.toEmail || '').trim().toLowerCase();
  if (!email) return sendJson(res, 400, { error: 'กรุณาระบุอีเมลผู้รับ' });
  const target = await store.whereOne('users', { email });
  if (!target) return sendJson(res, 404, { error: 'ไม่พบบัญชีผู้ใช้อีเมลนี้ในระบบ คู่ค้าต้องสมัคร TaxFlow ด้วยอีเมลดังกล่าวก่อน' });
  if (target.id === req.user.id) return sendJson(res, 400, { error: 'ไม่สามารถส่งเอกสารหาตัวเองได้' });
  // ข้อ 4: ผู้ออกเอกสารต้องลงนามฝั่งตนเองก่อน จึงส่งขอลายเซ็นจากคู่ค้าได้
  if ((b.purpose || 'sign') !== 'review' && !doc.signature) {
    return sendJson(res, 400, { error: 'ผู้ออกเอกสารต้องลงนามก่อนส่งขอลายเซ็นจากคู่ค้า ลงนามได้ที่แท็บ "ลายเซ็น" หรือปุ่มลงนามในหน้านี้' });
  }
  // ยกเลิกคำขอเดิมที่ยังค้างของเอกสารนี้
  for (const r of await store.all('requests', (r) => r.docId === doc.id && r.status === 'sent')) await store.update('requests', r.id, { status: 'cancelled' });
  const purpose = b.purpose === 'review' ? 'review' : 'sign';
  const row = await store.insert('requests', {
    docId: doc.id, fromUserId: req.user.id, toUserId: target.id, toEmail: email,
    purpose, message: b.message || '', dueDate: b.dueDate || '', signAs: b.signAs || '', status: 'sent',
  });
  if (doc.status === 'draft') {
    doc = await ensureIssued(doc, req.user.displayName); // ข้อ: ออกเลขที่จริงตอนส่งเอกสารออกจากแบบร่าง
    const updated = await store.update('documents', doc.id, { status: 'pending' });
    await snapshotVersion(updated, req.user.displayName, 'ส่งเอกสารให้คู่ค้า');
    doc = updated;
  }
  await logAudit(req.user.id, doc.id, 'send', `ส่ง ${doc.docNo} ถึง ${email} (${purpose === 'sign' ? 'ขอลายเซ็น' : 'ขอตรวจสอบ'}${b.dueDate ? ' ภายใน ' + b.dueDate : ''})`, req.user.displayName);
  const senderName = req.user.companyName || req.user.displayName;
  await notify(target.id, 'request', `${senderName} ส่งเอกสาร ${doc.docNo} ให้คุณ${purpose === 'sign' ? 'ลงนาม' : 'ตรวจสอบ'}${b.dueDate ? ' ภายในวันที่ ' + b.dueDate : ''}`, null, { reqId: row.id });
  sendJson(res, 201, await reqPublic(row));
}));

// กล่องรับเอกสาร (คำขอที่ส่งมาถึงฉัน)
api.get('/api/requests/inbox', requireAuth(async (req, res) => {
  const items = await reqPublicMany((await store.where('requests', { toUserId: req.user.id })).reverse(), req.user.id);
  sendJson(res, 200, { items, actionCount: items.filter((x) => x.status === 'sent').length });
}));

// คำขอที่ฉันส่งออกไป (ติดตามว่าคู่ค้าตอบหรือยัง) ใช้ในแท็บ "ที่ฉันส่งออก" ของกล่องรับเอกสาร
api.get('/api/requests/outbox', requireAuth(async (req, res) => {
  const items = await reqPublicMany((await store.where('requests', { fromUserId: req.user.id })).reverse());
  sendJson(res, 200, { items, waitingCount: items.filter((x) => x.status === 'sent').length });
}));

// คำขอของเอกสารหนึ่งฉบับ (ฝั่งผู้ส่ง ใช้ในแท็บ "ส่งเอกสาร")
api.get('/api/documents/:id/requests', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  sendJson(res, 200, { items: await Promise.all((await store.all('requests', (r) => r.docId === doc.id)).reverse().map(reqPublic)) });
}));

// ผู้รับเปิดดูเอกสาร (PDF) จากคำขอ
api.get('/api/requests/:id/pdf', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'กรุณาเข้าสู่ระบบก่อน' });
  const r = await store.find('requests', req.params.id);
  if (!r || (r.toUserId !== user.id && r.fromUserId !== user.id)) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  const doc = await store.find('documents', r.docId);
  const issuer = await store.find('users', r.fromUserId);
  if (!doc || !issuer) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  // WP5: ผู้รับได้ไฟล์ PDF/A-3 ฉบับเดียวกับเจ้าของเอกสาร ใช้โลโก้และตราประทับของผู้ออกเอกสาร
  if (!(await sendDocPdf(req, res, doc, issuer))) return;
  await logAudit(r.fromUserId, doc.id, 'view', `${user.displayName} เปิดดูเอกสารจากคำขอ`, user.displayName);
});

// ผู้รับลงนามตอบกลับ (ใช้คลังลายเซ็นของบัญชีตนเอง)
api.post('/api/requests/:id/sign', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.toUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (r.status !== 'sent') return sendJson(res, 400, { error: 'คำขอนี้ถูกตอบไปแล้ว' });
  const b = await readJsonBody(req);
  const doc = await store.find('documents', r.docId);
  if (!doc) return sendJson(res, 404, { error: 'เอกสารถูกลบแล้ว' });
  // ข้อ 5: ต้องตรวจสถานะเอกสารก่อนรับลายเซ็นทุกครั้ง กันกรณีเอกสารถูกยกเลิก/เปลี่ยนสถานะไปแล้ว
  // แต่คำขอยังค้างอยู่ (เช่น เจ้าของยกเลิกเอกสารหลังส่งคำขอ)
  if (doc.status !== 'pending') {
    return sendJson(res, 400, { error: 'เอกสารนี้ไม่อยู่ในสถานะที่รับลายเซ็นได้แล้ว (อาจถูกยกเลิกหรือเปลี่ยนสถานะไปก่อนหน้านี้)' });
  }
  // ต้องยืนยันด้วยรหัส OTP ที่ส่งไปยังอีเมลก่อนลงนามทุกครั้ง
  const check = await otp.verify(b.otpId, b.code, { userId: req.user.id, purpose: 'sign-request', refId: r.id });
  if (!check.ok) return sendJson(res, 400, { error: check.error });
  if (b.image !== undefined && b.image !== null && !isValidSignatureImage(b.image)) {
    return sendJson(res, 400, { error: 'รูปลายเซ็นไม่ถูกต้อง' });
  }
  const signerName = b.signerName || req.user.displayName;
  // ข้อ 5: คู่ค้าลงนามตอบกลับแล้ว = เอกสารผ่านขั้นตอนอนุมัติ (countersign → approved)
  const updated = await store.update('documents', doc.id, {
    status: 'approved',
    counterpartySignature: {
      signerName, image: b.image || null, signedAt: new Date().toISOString(),
      byUserId: req.user.id, byEmail: req.user.email, signAs: r.signAs || '',
      contentHash: contentHash(doc),
    },
  });
  await store.update('requests', r.id, { status: 'signed', respondedAt: new Date().toISOString() });
  await markRequestNotificationsRead(req.user.id, r.id);
  await snapshotVersion(updated, signerName, 'คู่ค้าลงนามตอบกลับ เอกสารอนุมัติแล้ว');
  await logAudit(r.fromUserId, doc.id, 'countersign', `${signerName} (${req.user.email}) ลงนามเอกสาร สถานะเปลี่ยนเป็นอนุมัติ`, signerName);
  const senderName = req.user.companyName || req.user.displayName;
  await notify(r.fromUserId, 'signed', `${senderName} ลงนามเอกสาร ${doc.docNo} เรียบร้อยแล้ว เอกสารอนุมัติแล้ว`, doc.id);
  const owner = await store.find('users', r.fromUserId);
  if (owner) deliverWebhook(owner, 'document.approved', updated);
  sendJson(res, 200, { ok: true });
}));

// ผู้รับตอบรับผลตรวจ (กรณี purpose=review) หรือปฏิเสธ
api.post('/api/requests/:id/approve', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.toUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (r.status !== 'sent') return sendJson(res, 400, { error: 'คำขอนี้ถูกตอบไปแล้ว' });
  const doc = await store.find('documents', r.docId);
  if (!doc) return sendJson(res, 404, { error: 'เอกสารถูกลบแล้ว' });
  if (doc.status !== 'pending') {
    return sendJson(res, 400, { error: 'เอกสารนี้ไม่อยู่ในสถานะที่ตรวจสอบได้แล้ว (อาจถูกยกเลิกหรือเปลี่ยนสถานะไปก่อนหน้านี้)' });
  }
  await store.update('requests', r.id, { status: 'approved', respondedAt: new Date().toISOString() });
  await markRequestNotificationsRead(req.user.id, r.id);
  // ข้อ 5: ผลตรวจสอบ "ผ่าน" จากคู่ค้า = เอกสารอนุมัติแล้ว
  const updated = await store.update('documents', doc.id, { status: 'approved' });
  await snapshotVersion(updated, req.user.displayName, 'คู่ค้าตรวจสอบผ่าน เอกสารอนุมัติแล้ว');
  await logAudit(r.fromUserId, doc.id, 'review-ok', `${req.user.displayName} ตรวจสอบแล้ว ไม่มีแก้ไข สถานะเปลี่ยนเป็นอนุมัติ`, req.user.displayName);
  await notify(r.fromUserId, 'approved', `${req.user.companyName || req.user.displayName} ตรวจสอบเอกสาร ${doc.docNo} แล้ว ผ่าน`, doc.id);
  const owner = await store.find('users', r.fromUserId);
  if (owner) deliverWebhook(owner, 'document.approved', updated);
  sendJson(res, 200, { ok: true });
}));

api.post('/api/requests/:id/decline', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.toUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (r.status !== 'sent') return sendJson(res, 400, { error: 'คำขอนี้ถูกตอบไปแล้ว' });
  const b = await readJsonBody(req);
  // ตีกลับต้องมีเหตุผลเสมอ ผู้ส่งต้องรู้ว่าต้องแก้อะไร และใช้เป็นร่องรอยตรวจสอบย้อนหลัง
  b.reason = String(b.reason || '').trim().slice(0, 500);
  if (!b.reason) return sendJson(res, 400, { error: 'กรุณาระบุเหตุผลที่ตีกลับ เพื่อให้ผู้ส่งทราบว่าต้องแก้ไขอะไร', field: 'reason' });
  const doc = await store.find('documents', r.docId);
  if (!doc) return sendJson(res, 404, { error: 'เอกสารถูกลบแล้ว' });
  if (doc.status !== 'pending') {
    return sendJson(res, 400, { error: 'เอกสารนี้ไม่อยู่ในสถานะที่ตีกลับได้แล้ว (อาจถูกยกเลิกหรือเปลี่ยนสถานะไปก่อนหน้านี้)' });
  }
  await store.update('requests', r.id, { status: 'declined', respondedAt: new Date().toISOString(), declineReason: b.reason });
  await markRequestNotificationsRead(req.user.id, r.id);
  // ข้อ 5: ตีกลับ = เอกสารไม่อนุมัติ
  const updated = await store.update('documents', doc.id, { status: 'rejected' });
  await snapshotVersion(updated, req.user.displayName, `คู่ค้าตีกลับ: ${b.reason || '-'}`);
  await logAudit(r.fromUserId, doc.id, 'declined', `${req.user.displayName} ปฏิเสธ: ${b.reason || '-'} สถานะเปลี่ยนเป็นไม่อนุมัติ`, req.user.displayName);
  await notify(r.fromUserId, 'rejected', `${req.user.companyName || req.user.displayName} ตีกลับเอกสาร ${doc.docNo}${b.reason ? ' ' + b.reason : ''}`, doc.id);
  const owner = await store.find('users', r.fromUserId);
  if (owner) deliverWebhook(owner, 'document.rejected', updated);
  sendJson(res, 200, { ok: true });
}));

// ผู้รับเก็บเอกสารจากคำขอเข้าคลังเอกสารของตนเอง (ไฟล์ PDF/A-3 ฉบับเดียวกับที่เปิดดู) กดซ้ำไม่เก็บซ้ำ
const LIB_CATEGORY = { EWHT: 'WHT50', CONTRACT_INF: 'CONTRACT_INF', CONTRACT_BRAND: 'CONTRACT_BRAND', PO: 'PO', PAYMENT: 'PAYMENT',
  INVOICE: 'INV', RECEIPT: 'RECEIPT', QUOTATION: 'QUOTATION', DELIVERY: 'DELIVERY', ETAX_INVOICE: 'TAXINV', ETAX_RECEIPT: 'RECEIPT' };
api.post('/api/requests/:id/library', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.toUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  const dup = await store.findOne('library', (l) => l.userId === req.user.id && l.sourceReqId === r.id);
  if (dup) return sendJson(res, 200, { id: dup.id, already: true });
  const doc = await store.find('documents', r.docId);
  const issuer = await store.find('users', r.fromUserId);
  if (!doc || !issuer) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  let out;
  try { out = await docFile(req, doc, issuer); } catch (err) {
    return sendJson(res, 503, { error: `สร้างไฟล์ PDF ไม่สำเร็จ (สาเหตุ: ${err.message})` });
  }
  const storedName = await storage.put(out.pdf, 'pdf', { prefix: 'lib_' });
  const sender = issuer.companyName || issuer.displayName;
  const row = await store.insert('library', {
    userId: req.user.id, category: LIB_CATEGORY[doc.type] || 'OTHER',
    title: `${doc.docNo || 'เอกสาร'} จาก ${sender}`, filename: docfile.downloadName(doc, 'pdf'),
    mime: 'application/pdf', size: out.pdf.length, storedName, note: 'เก็บจากกล่องรับเอกสาร',
    year: String(Number((doc.issueDate || '').slice(0, 4) || new Date().getFullYear()) + 543), sourceReqId: r.id,
  });
  await logAudit(req.user.id, null, 'library-add', `เก็บ ${doc.docNo} จาก ${sender} เข้าคลังเอกสาร`, req.user.displayName);
  sendJson(res, 201, { id: row.id });
}));

// ผู้ส่งยกเลิกคำขอ
api.post('/api/requests/:id/cancel', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.fromUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (r.status !== 'sent') return sendJson(res, 400, { error: 'คำขอนี้ปิดไปแล้ว' });
  await store.update('requests', r.id, { status: 'cancelled' });
  sendJson(res, 200, { ok: true });
}));

/* =========================================================
 * คลังลายเซ็น (ข้อ 5): บันทึกลายเซ็น เรียกใช้ซ้ำได้
 * ========================================================= */
api.get('/api/signatures', requireAuth(async (req, res) => {
  sendJson(res, 200, { items: (await store.all('signatures', (x) => x.userId === req.user.id)).reverse() });
}));
api.post('/api/signatures', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!isValidSignatureImage(b.image)) return sendJson(res, 400, { error: 'รูปลายเซ็นไม่ถูกต้อง' });
  const row = await store.insert('signatures', { userId: req.user.id, name: b.name || req.user.displayName, image: b.image });
  await logAudit(req.user.id, null, 'signature-save', `บันทึกลายเซ็น "${row.name}" เข้าคลัง`, req.user.displayName);
  sendJson(res, 201, row);
}));
api.delete('/api/signatures/:id', requireAuth(async (req, res) => {
  const x = await store.find('signatures', req.params.id);
  if (!x || x.userId !== req.user.id) return sendJson(res, 404, { error: 'not found' });
  await store.remove('signatures', x.id);
  sendJson(res, 200, { deleted: true });
}));

/* =========================================================
 * DOCUMENTS list / detail / edit / status / delete
 * ========================================================= */

module.exports = api;
