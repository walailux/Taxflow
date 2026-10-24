'use strict';
/** เอกสาร: คัดลอก ค้นหา แก้ไข เปลี่ยนสถานะ ลบ และประวัติการแก้ไข — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { storage, store, tax, docview, profile, zip, docbuild, readJsonBody, sendJson, requireAuth, round2,
  bangkokDateStr, validWhtRate, taxIdError, validLineItems, lineItemErrors, snapshotVersion, logAudit, notify,
  deliverWebhook, STATUS_FLOW, STATUS_LABEL, VAT_RATE_FIXED, DS,
} = require('../core/context');
const { lockPndRows, createDoc, ensureIssued, BIZ_TYPES, CONTRACT_TYPES, buildCtx, reqPublic, ownDoc,
  brandCtx, docFile,
} = require('../core/docs');
const docfile = require('../lib/docfile');

/**
 * ข้อมูลไฟล์ที่ส่งให้หน้าเว็บ ตัดชื่อไฟล์จริงบน Storage ออก (เป็นรายละเอียดภายในของเซิร์ฟเวอร์)
 * เหลือเฉพาะสิ่งที่หน้าเว็บใช้ เช่น มีไฟล์ XML ให้ดาวน์โหลดไหม สร้างล่าสุดเมื่อไร
 */
const filePublic = (d) => (d.file ? { at: d.file.at, bytes: d.file.bytes, hasXml: !!d.file.xml } : null);

const api = express.Router();

/* =========================================================
 * คัดลอกเอกสาร (Duplicate ver10)
 * ========================================================= */
api.post('/api/documents/:id/duplicate', requireAuth(async (req, res) => {
  const src = await ownDoc(req);
  if (!src) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  // ข้อ 7: คัดลอกเอกสารก็ต้องผ่านเงื่อนไขการออกเอกสารเหมือนสร้างใหม่ (เดิมข้ามเงื่อนไขนี้ไปทั้งหมด)
  const gate = profile.canIssue(req.user, src.type, { purpose: src.docPurpose });
  if (!gate.ok) return sendJson(res, 403, { error: gate.error, missing: gate.missing });
  const { id, docNo, status, signed, signature, counterpartySignature, file, createdAt, updatedAt, ...rest } = src; // file = PDF ที่ cache ของต้นฉบับ ห้ามติดไปกับสำเนา
  const copy = await createDoc(req.user, src.type, { ...rest, signed: false, signature: null, counterpartySignature: null });
  await logAudit(req.user.id, copy.id, 'duplicate', `คัดลอกจาก ${src.docNo}`, req.user.displayName);
  sendJson(res, 201, copy);
}));



api.get('/api/documents', requireAuth(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams;
  const type = p.get('type'), status = p.get('status'), q = (p.get('q') || '').toLowerCase();
  const contact = (p.get('contact') || '').toLowerCase();
  const from = p.get('from'), to = p.get('to');
  const rows = (await store.all('documents', (d) =>
    d.userId === req.user.id &&
    (!type || d.type === type) &&
    (!status || d.status === status) &&
    (!q || (d.docNo || '').toLowerCase().includes(q) || JSON.stringify(d).toLowerCase().includes(q)) &&
    (!contact || (`${d.party || ''}${d.buyer || ''}${d.payee || ''}${d.payer || ''}`).toLowerCase().includes(contact)) &&
    // ข้อ: กรองตาม "วันที่ออกเอกสาร" ตามเขตเวลาไทย (issueDate) แทน createdAt แบบ UTC ตรงๆ
    // (เอกสารเก่าก่อนมีฟิลด์นี้ fallback ไปใช้ createdAt) กันเอกสารที่สร้างช่วงดึกตกไปอยู่วันก่อนหน้าผิดวัน
    (!from || (d.issueDate || (d.createdAt || '').slice(0, 10)) >= from) &&
    (!to || (d.issueDate || (d.createdAt || '').slice(0, 10)) <= to)
  )).reverse();
  // คำขอล่าสุดของแต่ละเอกสาร + ผู้รับ ดึงครั้งเดียวทั้งชุด (เดิมยิงสองคำสั่งต่อเอกสารพร้อมกันทุกฉบับ
  // จนการเชื่อมต่อในพูลเต็ม คำขออื่นที่หน้าเดียวกันเรียกพร้อมกันรอจนหมดเวลาแล้วตอบ 500)
  const ids = new Set(rows.map((d) => d.id));
  const lastReq = new Map();
  for (const r of await store.all('requests', (r) => ids.has(r.docId))) lastReq.set(r.docId, r); // เรียง id จากเก่าไปใหม่ ตัวท้ายคือล่าสุด
  const toIds = new Set([...lastReq.values()].map((r) => r.toUserId).filter(Boolean));
  const users = new Map(toIds.size ? (await store.all('users', (u) => toIds.has(u.id))).map((u) => [u.id, u]) : []);
  const withReq = rows.map((d) => {
    const last = lastReq.get(d.id);
    if (!last) return { ...d, file: filePublic(d) };
    const toU = users.get(last.toUserId);
    return { ...d, file: filePublic(d), sentTo: { email: last.toEmail, name: toU ? (toU.companyName || toU.displayName) : last.toEmail, status: last.status, dueDate: last.dueDate || '' } };
  });
  sendJson(res, 200, { count: withReq.length, items: withReq });
}));

// ข้อ: ต้องประกาศเส้นทางนี้ "ก่อน" /api/documents/:id เสมอ router (lib/router.js) จับคู่เส้นทางแบบ
// ไล่ตามลำดับที่ประกาศ ไม่ได้เรียงตามความเจาะจงก่อน ถ้าสลับที่กัน /api/documents/export-zip จะถูก
// /api/documents/:id ตีความ id="export-zip" ไปก่อน (Number("export-zip")=NaN หาเอกสารไม่เจอ ตอบ 404 ผิดจุด)
//
// WP5: ส่งออกหลายเอกสารพร้อมกันเป็น ZIP แต่ละไฟล์เป็น PDF/A-3 จริง (เอกสาร e-Tax มีไฟล์ XML แยกให้ด้วย)
// เดิมเป็นหน้า HTML พร้อมพิมพ์ เพราะยังไม่มีตัวสร้าง PDF ฝั่งเซิร์ฟเวอร์
// ใช้ไฟล์ที่ cache ไว้ใน Storage ถ้ามี จึงไม่ต้องวาดใหม่ทุกฉบับทุกครั้ง
// ฉบับไหนสร้าง PDF ไม่ได้ จะถอยไปใส่ HTML ของฉบับนั้นแทน ไม่ล้มทั้งไฟล์ ZIP
const ZIP_EXPORT_MAX = 200; // กันคำขอที่มีรายการเยอะผิดปกติทำให้เซิร์ฟเวอร์ช้า/หน่วยความจำพุ่ง
api.get('/api/documents/export-zip', requireAuth(async (req, res) => {
  const idsParam = new URL(req.url, 'http://localhost').searchParams.get('ids') || '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, ZIP_EXPORT_MAX);
  if (!ids.length) return sendJson(res, 400, { error: 'กรุณาระบุเอกสารที่ต้องการอย่างน้อย 1 ฉบับ' });

  const files = [];
  const usedNames = new Set();
  const uniqueName = (name) => {
    const dot = name.lastIndexOf('.');
    const base = name.slice(0, dot), ext = name.slice(dot);
    let out = name, n = 2;
    while (usedNames.has(out)) out = `${base}-${n++}${ext}`; // กันชื่อซ้ำ (เช่นแบบร่างหลายฉบับที่ยังไม่มีเลขที่)
    usedNames.add(out);
    return out;
  };
  let pdfCount = 0, htmlCount = 0;

  for (const id of ids) {
    const doc = await store.find('documents', id);
    if (!doc || doc.userId !== req.user.id) continue; // ข้ามเอกสารที่ไม่พบ/ไม่ใช่ของผู้ใช้เองแบบเงียบๆ แทนที่จะล้มทั้งคำขอ
    try {
      const out = await docFile(req, doc, req.user);
      files.push({ name: uniqueName(docfile.downloadName(doc, 'pdf')), data: out.pdf });
      if (out.xml) files.push({ name: uniqueName(out.xmlName || docfile.downloadName(doc, 'xml')), data: Buffer.from(out.xml, 'utf8') });
      pdfCount++;
    } catch (err) {
      const attachments = await store.all('attachments', (a) => a.docId === doc.id);
      const share = await store.findOne('shares', (s) => s.docId === doc.id);
      const ctx = { attachments, brand: await brandCtx(req.user) };
      files.push({ name: uniqueName(docfile.downloadName(doc, 'html')), data: Buffer.from(docview.render(doc, req.user, ctx), 'utf8') });
      htmlCount++;
    }
  }
  if (!files.length) return sendJson(res, 404, { error: 'ไม่พบเอกสารที่เลือกไว้ หรือไม่มีสิทธิ์เข้าถึง' });

  const zipBuf = zip.buildZip(files);
  await logAudit(req.user.id, null, 'export',
    `ส่งออกเอกสาร ${pdfCount + htmlCount} ฉบับเป็น ZIP (PDF/A-3 ${pdfCount} ฉบับ${htmlCount ? `, HTML ${htmlCount} ฉบับ` : ''})`,
    req.user.displayName);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="taxflow-documents-${bangkokDateStr()}.zip"`,
    'Content-Length': zipBuf.length,
  });
  res.end(zipBuf);
}));

api.get('/api/documents/:id', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const attachments = (await store.all('attachments', (a) => a.docId === doc.id)).map((a) => { const { dataBase64, storedName, ...meta } = a; return meta; });
  const versions = await store.all('doc_versions', (v) => v.docId === doc.id);
  const audit = (await store.all('audit_log', (a) => a.docId === doc.id)).reverse();
  const share = await store.findOne('shares', (s) => s.docId === doc.id);
  const reqsAll = await store.all('requests', (r) => r.docId === doc.id);
  const lastReq = reqsAll.length ? await reqPublic(reqsAll[reqsAll.length - 1]) : null;
  sendJson(res, 200, { ...doc, file: filePublic(doc), attachments, versions, audit, share: share ? { token: share.token } : null, activeRequest: lastReq, allowedTransitions: STATUS_FLOW[doc.status] || [] });
}));

api.put('/api/documents/:id', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (['approved', 'archived', 'cancelled'].includes(doc.status)) return sendJson(res, 400, { error: 'เอกสารสถานะนี้แก้ไขไม่ได้' });
  // ใบลดหนี้/ใบเพิ่มหนี้อ้างอิงใบกำกับภาษีต้นฉบับตามกฎหมาย ห้ามแก้ไขเนื้อหาภายหลัง ยกเลิกแล้วออกใหม่แทน
  if (['CREDIT_NOTE', 'DEBIT_NOTE'].includes(doc.type)) return sendJson(res, 400, { error: 'ใบลดหนี้/ใบเพิ่มหนี้แก้ไขไม่ได้ หากข้อมูลผิดพลาดให้ยกเลิกเอกสารนี้แล้วออกฉบับใหม่' });
  const b = await readJsonBody(req);
  let patch = {};
  const errors = [];
  const GEN_TYPES = [...BIZ_TYPES, ...CONTRACT_TYPES];
  if (doc.schemaVersion === 2) {
    // ver16: แก้ไขด้วยแบบฟอร์มเต็มชุดเดียวกับตอนสร้าง และผ่านการตรวจสอบ/คำนวณชุดเดียวกันทั้งหมด
    errors.push(...await lockPndRows(req.user, doc.type, b));
    const built = await docbuild.build(req.user, doc.type, b, buildCtx(req.user, doc.id));
    errors.push(...built.errors);
    if (!errors.length) patch = built.record;
  } else if (GEN_TYPES.includes(doc.type)) {
    const partyTaxIdErr = taxIdError(b.partyTaxId ?? doc.partyTaxId, 'คู่สัญญา/คู่ค้า');
    if (partyTaxIdErr) errors.push(partyTaxIdErr);
    patch = { party: b.party ?? doc.party, partyTaxId: b.partyTaxId ?? doc.partyTaxId, note: b.note ?? doc.note, scope: b.scope ?? doc.scope };
    if (b.amount !== undefined || b.fee !== undefined) {
      const base = round2(Number(b.amount ?? b.fee) || doc.base);
      if (!(base > 0)) errors.push('กรุณาระบุยอดเงินให้ถูกต้อง');
      // ข้อ 8: VAT ของเอกสารทั่วไปยังคงล็อกไว้ที่ 7% ตามเดิม (ไม่รับอัตราใหม่จากผู้ใช้ตอนแก้ไข)
      const vat = doc.vatRate ? round2(base * doc.vatRate / 100) : 0;
      Object.assign(patch, { base, vat, total: round2(base + vat), net: round2(base + vat) });
    }
  } else if (doc.type === 'ETAX') {
    const items = b.items !== undefined ? validLineItems(b.items) : doc.items;
    if (!items.length) errors.push('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ');
    errors.push(...lineItemErrors(items));
    const buyerTaxIdErr = taxIdError(b.buyerTaxId ?? doc.buyerTaxId, 'ผู้ซื้อ');
    if (buyerTaxIdErr) errors.push(buyerTaxIdErr);
    const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
    const vat = tax.calcVat(subtotal, VAT_RATE_FIXED); // ข้อ 8: ล็อก VAT ไว้ที่ 7% เสมอ
    patch = { buyer: b.buyer ?? doc.buyer, buyerTaxId: b.buyerTaxId ?? doc.buyerTaxId, items, base: vat.base, vatRate: vat.rate, vat: vat.vat, total: vat.total };
  } else {
    const amount = Number(b.amount ?? doc.base);
    if (!(amount > 0)) errors.push('กรุณาระบุยอดเงินให้ถูกต้อง');
    if (doc.type === 'EWHT') {
      const payeeTaxIdErr = taxIdError(b.payeeTaxId ?? doc.payeeTaxId, 'ผู้รับเงิน');
      if (payeeTaxIdErr) errors.push(payeeTaxIdErr);
    }
    const calc = tax.calcWithholding(amount, validWhtRate(b.rate ?? doc.rate, doc.rate)); // ข้อ 8: จำกัดอัตราเฉพาะชุดที่กฎหมายกำหนด
    patch = { payee: b.payee ?? doc.payee, payer: b.payer ?? doc.payer, description: b.description ?? doc.description, incomeType: b.incomeType ?? doc.incomeType, ...calc };
  }
  if (errors.length) return sendJson(res, 400, { error: 'ข้อมูลไม่ถูกต้อง', errors });
  // ข้อ 6: เนื้อหาที่ลงนามไปแล้วเปลี่ยน = ลายเซ็นเดิมใช้อ้างอิงไม่ได้อีกต่อไป ต้องล้างทิ้งแล้วให้ลงนามใหม่
  // (กันกรณีแก้ยอดเงินหลังลงนามแล้วลายเซ็นเดิมยังติดอยู่กับเนื้อหาใหม่)
  const hadSignature = !!(doc.signature || doc.counterpartySignature);
  if (hadSignature) {
    Object.assign(patch, { signed: false, signature: null, counterpartySignature: null });
  }
  const updated = await store.update('documents', doc.id, patch);
  await snapshotVersion(updated, req.user.displayName, (typeof b.note === 'string' && b.note) || b.changeNote || 'แก้ไขเอกสาร');
  // แบบร่างยังไม่มีเลขที่ (docNo = null) ใช้ชื่อประเภทเอกสารแทน กันข้อความ "แก้ไขเอกสาร null"
  const docName = doc.docNo || `${(DS.FORMS[doc.type] && (DS.FORMS[doc.type].short || DS.FORMS[doc.type].label)) || 'เอกสาร'} (ฉบับร่าง)`;
  await logAudit(req.user.id, doc.id, 'edit', `แก้ไข ${docName}${hadSignature ? ' ลายเซ็นเดิมถูกล้างเพราะเนื้อหาเปลี่ยน ต้องลงนามใหม่' : ''}`, req.user.displayName);
  await notify(req.user.id, 'edit', hadSignature
    ? `แก้ไขเอกสาร ${docName} ลายเซ็นเดิมถูกล้างแล้ว กรุณาลงนามใหม่`
    : `มีการแก้ไขเอกสาร ${docName}`, doc.id);
  sendJson(res, 200, updated);
}));

api.post('/api/documents/:id/status', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const b = await readJsonBody(req);
  const next = b.status;
  if (!(STATUS_FLOW[doc.status] || []).includes(next)) return sendJson(res, 400, { error: `เปลี่ยนจาก "${STATUS_LABEL[doc.status]}" เป็น "${STATUS_LABEL[next] || next}" ไม่ได้` });
  // ข้อ 5: เอกสารที่อยู่ระหว่างส่งให้คู่ค้าลงนาม/ตรวจสอบ (status=pending + docPurpose=send)
  // ต้องอนุมัติผ่านการลงนามหรือผลตรวจของคู่ค้าเท่านั้น เจ้าของเอกสารเปลี่ยนเป็น "อนุมัติ" เองไม่ได้
  // (ก่อนส่ง ยังเป็น draft ยังปิดงานเองได้ตามปกติ เพราะยังไม่มีคำขอค้างอยู่ที่ฝั่งคู่ค้า)
  if (next === 'approved' && doc.status === 'pending' && (doc.docPurpose || 'self') === 'send') {
    return sendJson(res, 400, { error: 'เอกสารนี้ถูกส่งให้คู่ค้าลงนาม/ตรวจสอบแล้ว ต้องรอผลจากคู่ค้าเท่านั้น ไม่สามารถอนุมัติเองได้' });
  }
  // ข้อ: ออกเลขที่จริงตอนเอกสารออกจากสถานะแบบร่างเป็นครั้งแรก (ยกเว้นยกเลิกตั้งแต่ยังเป็นแบบร่าง ไม่ต้องออกเลข)
  if (doc.status === 'draft' && next !== 'cancelled') await ensureIssued(doc, req.user.displayName);
  const updated = await store.update('documents', doc.id, { status: next, statusNote: b.note || '' });
  if (next === 'cancelled') {
    const cancelledAt = new Date().toISOString();
    await store.update('documents', doc.id, { cancelledAt, cancelReason: b.note || '' });
    // ยกเลิกคำขอลงนาม/ตรวจสอบที่ยังค้างอยู่ด้วย กันคู่ค้าลงนามเอกสารที่ถูกยกเลิกไปแล้ว
    for (const r of await store.all('requests', (r) => r.docId === doc.id && r.status === 'sent')) {
      await store.update('requests', r.id, { status: 'cancelled' });
    }
  }
  await snapshotVersion(updated, req.user.displayName, `เปลี่ยนสถานะเป็น ${STATUS_LABEL[next]}`);
  await logAudit(req.user.id, doc.id, 'status', `${STATUS_LABEL[doc.status]} → ${STATUS_LABEL[next]}`, req.user.displayName);
  const notifyMap = { approved: `เอกสาร ${updated.docNo} ได้รับการอนุมัติ`, rejected: `เอกสาร ${updated.docNo} ถูกตีกลับ (ไม่อนุมัติ)`, pending: `เอกสาร ${updated.docNo} ถูกส่งเข้ารอตรวจสอบ` };
  if (notifyMap[next]) await notify(req.user.id, next, notifyMap[next], doc.id);
  if (['approved', 'rejected', 'cancelled'].includes(next)) deliverWebhook(req.user, `document.${next}`, updated);
  sendJson(res, 200, updated);
}));

// ลบถาวรได้เฉพาะเอกสารสถานะ "แบบร่าง" เท่านั้น (ข้อ 41 ของสเปก + หลักเก็บเอกสารภาษี 5 ปี)
// สถานะอื่นต้อง "ยกเลิก" ผ่าน /api/documents/:id/status (status=cancelled) พร้อมระบุเหตุผล
// เพื่อไม่ให้เลขที่เอกสารขาดช่วงและยังมีร่องรอยตรวจสอบย้อนหลังได้
api.delete('/api/documents/:id', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (doc.status !== 'draft') {
    return sendJson(res, 400, {
      error: 'ลบเอกสารที่ไม่ใช่แบบร่างไม่ได้ เอกสารที่ออกแล้วต้อง "ยกเลิก" พร้อมระบุเหตุผลแทน เพื่อรักษาลำดับเลขที่เอกสารและร่องรอยตรวจสอบตามกฎหมาย',
    });
  }
  for (const a of await store.all('attachments', (a) => a.docId === doc.id)) { await storage.remove(a.storedName); await store.remove('attachments', a.id); }
  await docfile.purge(doc); // WP5: ลบ PDF/XML ที่ cache ไว้บน Storage ด้วย ไม่ให้เหลือไฟล์กำพร้า
  await store.remove('documents', doc.id);
  await logAudit(req.user.id, null, 'delete', `ลบเอกสาร ${doc.docNo}`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

/* =========================================================
 * VERSIONS
 * ========================================================= */
api.get('/api/documents/:id/versions', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  sendJson(res, 200, { items: await store.all('doc_versions', (v) => v.docId === doc.id) });
}));

module.exports = api;
