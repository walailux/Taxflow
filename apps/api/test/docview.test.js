'use strict';
/**
 * docview.test.js หน้า HTML ของเอกสาร (ใช้แทน PDF ในไฟล์ ZIP เมื่อสร้าง PDF ไม่สำเร็จ)
 * เอกสารแบบฟอร์มใหม่ (schemaVersion 2) วาดด้วย lib/docprint.js · เอกสารรุ่นเก่าวาดด้วยแม่แบบเดิมใน lib/docview.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../lib/docschema.js');
const docview = require('../lib/docview.js');
const { bodyFor } = require('../scripts/sample-docs');

const user = {
  role: 'corporate', entityType: 'juristic', displayName: 'บริษัท ผู้ออก จำกัด', companyName: 'บริษัท ผู้ออก จำกัด', tradeName: 'Issuer',
  taxId: '0105561112235', branchType: 'branch', branchCode: '00002', authName: 'สมชาย ใจดี', authPosition: 'กรรมการ',
  address: '55 ถ.สาทรใต้ กรุงเทพมหานคร 10120', phone: '02-111-2233', vatRegistered: true,
};
const SIG = { signerName: 'สมชาย ใจดี', signedAt: '2026-09-20T03:00:00Z', image: 'data:image/png;base64,iVBORw0KGgo=' };
const ctx = {
  qrSvg: '<svg></svg>', brand: { logo: 'data:image/png;base64,iVBORw0KGgo=' },
  attachments: [{ filename: 'หลักฐาน.pdf', kind: 'payment', size: 1200 }],
};

/** เอกสารแบบฟอร์มใหม่ในรูปร่างที่บันทึกจริง (ยอดคำนวณจาก docschema) */
function storedV2(type, status = 'approved') {
  const b = bodyFor(type);
  const calc = DS.compute(type, b, { vatRegistered: true });
  return {
    id: 1, type, schemaVersion: 2, status, docNo: `${DS.FORMS[type].prefix}-2569-00001`, issueDate: '2026-09-20',
    createdAt: '2026-09-20T03:00:00Z', fields: b.fields, items: b.items, partyInfo: b.party, party: b.party.name,
    issuer: { name: user.companyName, taxId: user.taxId, address: user.address }, signature: SIG, signed: true, ...calc,
  };
}

test('เอกสารแบบฟอร์มใหม่ทุกประเภทแสดงเป็น HTML ได้ ทั้งฉบับอนุมัติ แบบร่าง และยกเลิก', () => {
  for (const type of Object.keys(DS.FORMS)) {
    for (const status of ['approved', 'draft', 'cancelled']) {
      const html = docview.render(storedV2(type, status), user, ctx);
      assert.match(html, /<html|<div/i, `${type} ${status}`);
      assert.ok(html.length > 500, `${type} ${status} ต้องมีเนื้อหา`);
    }
  }
});

test('เอกสารรุ่นเก่า (ก่อน schemaVersion 2) ทุกแม่แบบ', () => {
  const base = { id: 2, docNo: 'X-2568-00001', status: 'approved', createdAt: '2025-05-01T03:00:00Z', signature: SIG, signed: true };
  const items = [{ name: 'ค่ารีวิวสินค้า', qty: 2, price: 5000, amount: 10000 }];
  const docs = [
    { ...base, type: 'ETAX', buyer: 'บริษัท ผู้ซื้อ จำกัด', buyerTaxId: '0105559876541', items, base: 10000, vatRate: 7, vat: 700, total: 10700 },
    { ...base, type: 'CREDIT_NOTE', refDocNo: 'ETAX-1', reason: 'ลดราคาสินค้า/บริการ', base: 500, vatRate: 7, vat: 35, total: 535, buyer: 'บริษัท ผู้ซื้อ จำกัด' },
    { ...base, type: 'DEBIT_NOTE', refDocNo: 'ETAX-1', reason: 'อื่น ๆ', base: 500, vatRate: 7, vat: 35, total: 535 },
    { ...base, type: 'WHT', payer: 'บริษัท ผู้จ่าย จำกัด', amount: 10000, rate: 3, wht: 300, net: 9700, incomeType: 'มาตรา 40(2)', description: 'ค่าจ้าง' },
    { ...base, type: 'EWHT', payee: 'นาย ผู้รับ', payeeTaxId: '1100700123455', amount: 10000, rate: 3, wht: 300, net: 9700 },
    { ...base, type: 'QUOTATION', party: 'บริษัท คู่ค้า จำกัด', partyTaxId: '0105559876541', items, base: 10000, vat: 700, total: 10700, note: 'ยืนราคา 30 วัน' },
    { ...base, type: 'INVOICE', party: 'บริษัท คู่ค้า จำกัด', items, base: 10000, vat: 0, total: 10000 },
    { ...base, type: 'CONTRACT_INF', party: 'นางสาว ครีเอเตอร์', scope: 'รีวิว 3 คลิป', base: 30000, fee: 30000, wht: 900 },
    { ...base, type: 'CONTRACT_BRAND', party: 'บริษัท แบรนด์ จำกัด', scope: 'แคมเปญ', base: 50000, vat: 3500, total: 53500 },
    { ...base, type: 'POA', party: 'นาย ผู้รับมอบ', scope: 'ยื่นแบบภาษี', note: 'ภายในปี 2569' },
    { ...base, type: 'OTHER', party: 'ไม่ทราบประเภท' },
  ];
  for (const d of docs) {
    for (const status of ['approved', 'cancelled', 'draft']) {
      const html = docview.render({ ...d, status }, { ...user, role: d.type === 'CONTRACT_INF' ? 'corporate' : 'agency' }, ctx);
      assert.ok(typeof html === 'string' && html.length > 200, `${d.type} ${status}`);
    }
    assert.ok(docview.render({ ...d, signature: null, signed: false }, { role: 'creator', displayName: 'ครีเอเตอร์', entityType: 'individual' }).length > 200);
  }
});

test('จำนวนเงินเป็นตัวอักษรภาษาไทย', () => {
  assert.equal(docview.bahtText(0), 'ศูนย์บาทถ้วน');
  assert.equal(docview.bahtText(21), 'ยี่สิบเอ็ดบาทถ้วน');
  assert.match(docview.bahtText(1234567.5), /ล้าน.*ห้าสิบสตางค์$/);
});
