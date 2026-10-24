'use strict';
/** ออกเอกสารใหม่: ใบสำคัญจ่าย ใบลดหนี้/เพิ่มหนี้ และแบบฟอร์มทั้ง 12 ประเภท — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, tax, profile, docbuild, DS, readJsonBody, sendJson, requireAuth, round2, validWhtRate,
  validateDocument, logAudit,
} = require('../core/context');
const { lockPndRows, createDoc, buildCtx, purposeOf,
} = require('../core/docs');

const api = express.Router();

/* =========================================================
 * DOCUMENTS create
 * ========================================================= */

// ver16: ตัด e-Tax Invoice และหน้าออก e-Withholding แบบเดิมออก หนังสือรับรอง 50 ทวิ ออกผ่าน /api/docs/create (type=EWHT)
api.post('/api/etax/invoice', (req, res) => sendJson(res, 410, { error: 'ระบบไม่รองรับการออก e-Tax Invoice แล้ว ใช้ใบแจ้งหนี้/ใบเสร็จรับเงินในเมนู "สร้างเอกสาร" แทน' }));
api.post('/api/ewht/certificate', (req, res) => sendJson(res, 410, { error: 'ย้ายไปออกหนังสือรับรอง 50 ทวิ ผ่านเมนู "สร้างเอกสาร" แล้ว' }));
api.post('/api/wht/store', requireAuth(async (req, res) => {
  // หน้า "บันทึก 50 ทวิ (รับ)" เป็นการบันทึกเอกสารที่ผู้ว่าจ้างออกให้ ไม่ใช่การออกเอกสารเอง
  const gate = profile.canIssue(req.user, 'WHT', { purpose: 'record' });
  if (!gate.ok) return sendJson(res, 403, { error: gate.error, missing: gate.missing });
  const b = await readJsonBody(req);
  const v = validateDocument('WHT', b);
  if (!v.ok) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบถ้วน', errors: v.errors });
  const calc = tax.calcWithholding(b.amount, validWhtRate(b.rate)); // ข้อ 8: จำกัดอัตราเฉพาะชุดที่กฎหมายกำหนด
  const doc = await createDoc(req.user, 'WHT', { docPurpose: 'record',
    payer: b.payer || '', description: b.description || 'ค่าจ้างผลิตเนื้อหา', incomeType: b.incomeType || 'มาตรา 40(2)', ...calc,
  });
  sendJson(res, 201, doc);
}));

/* =========================================================
 * ใบลดหนี้ / ใบเพิ่มหนี้ (ตามประมวลรัษฎากร มาตรา 86/9 และ 86/10)
 * ใช้แก้ไขใบกำกับภาษี (ETAX) ที่ออกไปแล้วอย่างถูกต้องตามกฎหมาย แทนการยกเลิกเอกสารทั้งฉบับ
 * ========================================================= */
const CREDIT_NOTE_REASONS = ['ลดราคาสินค้า/บริการ', 'สินค้าชำรุด/บกพร่อง', 'รับคืนสินค้า', 'คำนวณราคาผิดพลาดสูงไป', 'ยกเลิกสัญญาบางส่วน', 'อื่น ๆ'];
const DEBIT_NOTE_REASONS = ['คำนวณราคาผิดพลาดต่ำไป', 'เรียกเก็บเพิ่มเติมตามสัญญา', 'อื่น ๆ'];

function createAdjustmentNote(type, legalRef, reasons) {
  return requireAuth(async (req, res) => {
    const gate = profile.canIssue(req.user, 'ETAX');
    if (!gate.ok) return sendJson(res, 403, { error: gate.error, missing: gate.missing });
    const b = await readJsonBody(req);
    const src = await store.find('documents', b.refDocId);
    if (!src || src.userId !== req.user.id || src.type !== 'ETAX') {
      return sendJson(res, 404, { error: 'ไม่พบใบกำกับภาษีต้นฉบับ หรือไม่ใช่เอกสารของคุณ' });
    }
    // มาตรา 86/9, 86/10 ใช้แก้ไข "ใบกำกับภาษีที่ออกไปแล้ว" เท่านั้น ไม่ใช่แบบร่าง/เอกสารที่ยกเลิกไปแล้ว
    if (!src.docNo || src.status === 'cancelled') {
      return sendJson(res, 400, { error: 'ออกใบลดหนี้/เพิ่มหนี้ได้เฉพาะใบกำกับภาษีที่ออกเลขที่แล้วและยังไม่ถูกยกเลิกเท่านั้น' });
    }
    const errors = [];
    if (!reasons.includes(b.reason)) errors.push('กรุณาเลือกเหตุผลที่ถูกต้องตามกฎหมาย');
    const adjustBase = round2(Number(b.amount) || 0);
    if (!(adjustBase > 0)) errors.push('กรุณาระบุยอดเงินส่วนต่างให้ถูกต้อง');
    if (errors.length) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบถ้วน', errors });
    // ใช้อัตรา VAT เดียวกับใบกำกับภาษีต้นฉบับเสมอ ไม่รับอัตราจากผู้ใช้ตรงๆ (ตามหลักข้อ 8)
    const vat = tax.calcVat(adjustBase, src.vatRate);
    const doc = await createDoc(req.user, type, {
      docPurpose: ['self', 'send', 'record'].includes(b.docPurpose) ? b.docPurpose : 'self',
      refDocId: src.id, refDocNo: src.docNo,
      buyer: src.buyer || '', buyerTaxId: src.buyerTaxId || '',
      reason: b.reason, note: b.note || '',
      base: vat.base, vatRate: vat.rate, vat: vat.vat, total: vat.total,
      legalRef, signatureStandard: 'PAdES (จำลอง)',
    });
    await logAudit(req.user.id, doc.id, 'create', `ออก${type === 'CREDIT_NOTE' ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'}อ้างอิง ${src.docNo} (${b.reason})`, req.user.displayName);
    sendJson(res, 201, doc);
  });
}

api.get('/api/etax/adjustment-reasons', (req, res) => sendJson(res, 200, { creditNote: CREDIT_NOTE_REASONS, debitNote: DEBIT_NOTE_REASONS }));
api.post('/api/etax/credit-note', createAdjustmentNote('CREDIT_NOTE', 'ประมวลรัษฎากร มาตรา 86/9', CREDIT_NOTE_REASONS));
api.post('/api/etax/debit-note', createAdjustmentNote('DEBIT_NOTE', 'ประมวลรัษฎากร มาตรา 86/10', DEBIT_NOTE_REASONS));

/* =========================================================
 * สร้างเอกสาร (ver16) ทุกประเภทใช้นิยามฟิลด์ใน public/js/docschema.js
 * ใบเสนอราคา / PO / ใบแจ้งหนี้ / ใบเสร็จ / ใบส่งมอบงาน / ใบสำคัญจ่าย / สัญญากับ Brand /
 * สัญญาจ้าง Influencer / หนังสือมอบอำนาจ / 50 ทวิ / จัดทำข้อมูล ภ.ง.ด.3 / ภ.ง.ด.53
 * ========================================================= */

api.post('/api/docs/create', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const type = b.type;
  if (!DS.FORMS[type]) return sendJson(res, 400, { error: 'ประเภทเอกสารไม่ถูกต้อง หรือไม่รองรับแล้ว' });
  const gate = profile.canIssue(req.user, type, { purpose: purposeOf(b) });
  if (!gate.ok) return sendJson(res, 403, { error: gate.error, missing: gate.missing });
  const pndErr = await lockPndRows(req.user, type, b);
  if (pndErr.length) return sendJson(res, 400, { error: 'ข้อมูลไม่ถูกต้อง', errors: pndErr });
  const built = await docbuild.build(req.user, type, b, buildCtx(req.user));
  if (built.errors.length) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง', errors: built.errors });
  const doc = await createDoc(req.user, type, {
    docPurpose: purposeOf(b), issuerRole: req.user.role, ...built.record,
  });
  sendJson(res, 201, doc);
}));


module.exports = api;
