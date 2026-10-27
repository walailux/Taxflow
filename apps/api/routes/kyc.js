'use strict';
/** เอกสารยืนยันตัวตน (KYC) — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { storage, store, profile, filestore, magicbytes, readJsonBody, sendJson, publicUser, requireAuth, logAudit,
  notify, KYC_MIME, KYC_MAX,
} = require('../core/context');
const { disposition } = require('../core/docs');
const DS = require('../lib/docschema.js');

/** เอกสารประกอบคำขอ e-Tax: เปลี่ยน/ลบหลังยื่นหรือหลังได้สิทธิ์แล้ว = ต้องยื่นตรวจใหม่ (หลักฐานที่แอดมินเห็นต้องเป็นชุดปัจจุบัน) */
const ETAX_DOC_TYPES = ['vat_pp20', 'etax_approval', 'etax_sp_cert'];
async function resetEtaxOnEvidenceChange(user, docType) {
  if (!ETAX_DOC_TYPES.includes(docType) || !['pending', 'approved'].includes(user.etaxStatus)) return;
  await store.update('users', user.id, { etaxStatus: 'none', etaxNote: 'หลักฐานประกอบคำขอถูกเปลี่ยนแปลง กรุณายื่นขอสิทธิ์ใหม่เพื่อให้ผู้ดูแลระบบตรวจสอบอีกครั้ง' });
  await logAudit(user.id, null, 'etax-reset', 'สิทธิ์ออกเอกสาร e-Tax ถูกระงับ เนื่องจากหลักฐานประกอบคำขอถูกเปลี่ยนแปลง', user.displayName);
}

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
  await resetEtaxOnEvidenceChange(req.user, b.docType);
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
  await resetEtaxOnEvidenceChange(req.user, row.docType);
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


/* =========================================================
 * สิทธิ์ออกเอกสาร e-Tax (ใบกำกับภาษีอิเล็กทรอนิกส์ / ใบรับอิเล็กทรอนิกส์)
 * ต้อง: ผ่าน KYC แล้ว + จด VAT + แนบ ภ.พ.20 และหลักฐานอนุมัติจากกรมสรรพากร (+ หนังสือรับรองผู้ให้บริการ ถ้าใช้ Service Provider)
 * จากนั้นแอดมินตรวจและอนุมัติที่ /api/admin/users/:id/etax (routes/admin.js)
 * ========================================================= */
async function etaxState(user) {
  const owned = await store.all('kyc_documents', (k) => k.userId === user.id);
  const info = user.etax || {};
  const docs = profile.etaxRequiredDocs(info.method).map((type) => {
    const up = owned.find((o) => o.docType === type);
    return { type, ...profile.KYC_TYPES[type], uploaded: up ? (({ storedName, ...r }) => r)(up) : null };
  });
  const blockers = [];
  if (user.verifyStatus !== 'verified') blockers.push('ยืนยันตัวตน (KYC) ให้ผ่านการอนุมัติก่อน');
  if (!user.vatRegistered) blockers.push('ระบุสถานะจดทะเบียนภาษีมูลค่าเพิ่ม (VAT) ในโปรไฟล์');
  return {
    status: user.etaxStatus || 'none', note: user.etaxNote || '', info, docs, blockers,
    kycConsent: !!(user.consent && (user.consent.purposes || []).includes('kyc')),
  };
}

api.get('/api/etax/permission', requireAuth(async (req, res) => {
  const method = new URL(req.url, 'http://localhost').searchParams.get('method');
  // ?method= ให้หน้าเว็บดูรายการหลักฐานของวิธีที่กำลังเลือกได้ก่อนยื่น
  const u = method ? { ...req.user, etax: { ...(req.user.etax || {}), method } } : req.user;
  sendJson(res, 200, await etaxState(u));
}));

api.post('/api/etax/permission', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const u = req.user;
  if (u.etaxStatus === 'pending') return sendJson(res, 400, { error: 'คำขอเดิมอยู่ระหว่างรอผู้ดูแลระบบตรวจสอบ' });
  if (u.etaxStatus === 'approved') return sendJson(res, 400, { error: 'บัญชีนี้ได้รับสิทธิ์ออกเอกสาร e-Tax แล้ว' });
  if (u.verifyStatus !== 'verified') return sendJson(res, 400, { error: 'ต้องผ่านการยืนยันตัวตน (KYC) ก่อนจึงจะยื่นขอสิทธิ์ออกเอกสาร e-Tax ได้' });
  if (!u.vatRegistered) return sendJson(res, 400, { error: 'ต้องเป็นผู้ประกอบการจดทะเบียนภาษีมูลค่าเพิ่มก่อน (ระบุสถานะ VAT ที่หน้าโปรไฟล์)' });
  const m = DS.ETAX_METHODS.find((x) => x.value === b.method);
  if (!m) return sendJson(res, 400, { error: 'กรุณาเลือกรูปแบบการจัดทำเอกสาร e-Tax ที่ได้รับอนุมัติ' });
  const s = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);
  const info = {
    method: m.value,
    approvalRef: s(b.approvalRef, 80),
    approvalDate: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(b.approvalDate || '')) ? b.approvalDate : '',
    provider: m.needsProvider ? s(b.provider) : '',
    providerCertRef: m.needsProvider ? s(b.providerCertRef, 80) : '',
  };
  const errors = [];
  if (!info.approvalRef) errors.push('เลขที่หนังสืออนุมัติ / เลขที่คำขอ ก.อ.01');
  if (!info.approvalDate) errors.push('วันที่ได้รับอนุมัติจากกรมสรรพากร');
  else if (info.approvalDate > new Date().toISOString().slice(0, 10)) errors.push('วันที่ได้รับอนุมัติต้องไม่เป็นวันในอนาคต');
  if (m.needsProvider && !info.provider) errors.push('ชื่อผู้ให้บริการนำส่งข้อมูล (Service Provider)');
  if (m.needsProvider && !info.providerCertRef) errors.push('เลขที่ใบรับรอง/หนังสือรับรองของผู้ให้บริการ');
  if (!b.declare) errors.push('การรับรองว่าข้อมูลและหลักฐานเป็นความจริง');
  if (errors.length) return sendJson(res, 400, { error: 'กรุณากรอกให้ครบ: ' + errors.join(', ') });
  const owned = await store.all('kyc_documents', (k) => k.userId === u.id);
  const missing = profile.etaxRequiredDocs(m.value).filter((t) => !owned.some((o) => o.docType === t)).map((t) => profile.KYC_TYPES[t].label);
  if (missing.length) return sendJson(res, 400, { error: 'ยังขาดหลักฐาน: ' + missing.join(', ') });

  const updated = await store.update('users', u.id, {
    etaxStatus: 'pending', etaxNote: '', etax: { ...info, submittedAt: new Date().toISOString() },
  });
  await logAudit(u.id, null, 'etax-submit', `ยื่นขอสิทธิ์ออกเอกสาร e-Tax (${m.label})`, u.displayName);
  for (const admin of await store.all('users', (x) => x.role === 'admin')) {
    await notify(admin.id, 'kyc', `มีคำขอสิทธิ์ออกเอกสาร e-Tax ใหม่จาก ${u.companyName || u.displayName}`, null);
  }
  sendJson(res, 200, { user: publicUser(updated), permission: await etaxState(updated) });
}));

module.exports = api;
