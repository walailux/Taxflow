'use strict';
/**
 * etax.test.js ตรวจงาน WP5 ส่วนที่ไม่ต้องพึ่งไลบรารีภายนอก
 * คือ นิยามเอกสาร e-Tax ใน docschema และตัวสร้างไฟล์ XML
 * (ส่วน PDF/A-3 ต้องใช้ PDFKit และตรวจด้วย veraPDF จึงทดสอบแยกต่างหาก)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../lib/docschema.js');
const xmlbuild = require('../lib/xmlbuild.js');

/* ---------------------------------------------- ข้อมูลตัวอย่างใช้ร่วมกัน */

const ITEMS = [
  { name: 'ค่าผลิตคอนเทนต์ TikTok', qty: 2, unit: 'ชิ้น', price: 15000, discount: 1000 },
  { name: 'ค่ารีวิวสินค้า', qty: 1, unit: 'ครั้ง', price: 8000 },
];

function sampleDoc(overrides = {}) {
  const items = overrides.items || ITEMS;
  const calc = DS.compute('ETAX_INVOICE', { fields: {}, items }, { vatRegistered: true });
  return {
    type: 'ETAX_INVOICE',
    docNo: 'TIV-2569-00001',
    fields: { issueDate: '2026-09-20', volumeNo: '1' },
    issuer: {
      name: 'บริษัท แท็กซ์โฟลว์ จำกัด', taxId: '0105561234567', branch: '00000',
      address: '99 ถนนสุขุมวิท แขวงคลองเตย กรุงเทพมหานคร 10110',
    },
    party: {
      name: 'บริษัท ผู้ซื้อ จำกัด', taxId: '0105559876543', branch: '00001',
      address: '1 ถนนพระรามที่ 4 กรุงเทพมหานคร 10500',
    },
    items,
    calc,
    ...overrides,
  };
}

/* ------------------------------------------------------ นิยามเอกสาร e-Tax */

test('มีประเภทเอกสาร e-Tax ครบสองแบบ และรวมเป็น 14 ประเภท', () => {
  assert.ok(DS.FORMS.ETAX_INVOICE, 'ต้องมีใบกำกับภาษีอิเล็กทรอนิกส์');
  assert.ok(DS.FORMS.ETAX_RECEIPT, 'ต้องมีใบรับอิเล็กทรอนิกส์');
  assert.equal(Object.keys(DS.FORMS).length, 14, 'ของเดิม 12 ประเภท บวกใหม่ 2 ประเภท');
});

test('ใบกำกับภาษีบังคับข้อมูลผู้ซื้อครบตามมาตรา 86/4', () => {
  // กฎหมายบังคับให้มีชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีของผู้ซื้อ
  const required = DS.FORMS.ETAX_INVOICE.party.required;
  for (const key of ['name', 'taxId', 'address']) {
    assert.ok(required.includes(key), `ต้องบังคับกรอก ${key} ของผู้ซื้อ`);
  }
});

test('ผู้ที่ยังไม่จดทะเบียน VAT ต้องไม่เห็นเอกสารกลุ่ม e-Tax ในรายการที่เลือกได้', () => {
  const noVat = DS.rolesFor('creator', { vatRegistered: false });
  const withVat = DS.rolesFor('creator', { vatRegistered: true });
  assert.ok(!noVat.includes('ETAX_INVOICE'));
  assert.ok(!noVat.includes('ETAX_RECEIPT'));
  assert.ok(withVat.includes('ETAX_INVOICE'));
  assert.ok(withVat.includes('ETAX_RECEIPT'));
});

test('เรียกใช้ rolesFor แบบเดิม (ไม่ส่ง opts) ต้องยังทำงานเหมือนเดิม', () => {
  // กันไม่ให้โค้ดเดิมที่เรียก rolesFor(role) เฉย ๆ พังจากการเพิ่มพารามิเตอร์
  const all = DS.rolesFor('agency');
  assert.ok(all.includes('INVOICE'));
  assert.ok(all.includes('ETAX_INVOICE'));
});

test('validateDoc ต้องปฏิเสธเมื่อผู้ใช้ยังไม่จดทะเบียน VAT', () => {
  const v = DS.validateDoc('ETAX_INVOICE', { fields: {}, party: {}, items: [] }, { vatRegistered: false });
  assert.equal(v.vatRequired, true);
  assert.ok(v.errors.some((e) => e.includes('จดทะเบียนภาษีมูลค่าเพิ่ม')));
});

test('ไม่ส่ง vatRegistered มา ต้องไม่ขึ้น error เรื่อง VAT ค้างไว้', () => {
  // หน้าเว็บบางจังหวะยังไม่รู้สถานะผู้ใช้ ไม่ควรขึ้น error ทั้งที่ยังไม่ได้ตัดสิน
  const v = DS.validateDoc('ETAX_INVOICE', { fields: {}, party: {}, items: [] }, {});
  assert.ok(!v.errors.some((e) => e.includes('จดทะเบียนภาษีมูลค่าเพิ่ม')));
});

test('ใบกำกับภาษีต้องแยกภาษีมูลค่าเพิ่มเสมอ แม้ไม่ได้ติ๊กช่องคิด VAT', () => {
  // มาตรา 86/4 (7) บังคับให้แยกจำนวน VAT ออกจากราคาชัดเจน จึงไม่ปล่อยให้เป็นตัวเลือก
  const calc = DS.compute('ETAX_INVOICE', { fields: {}, items: ITEMS }, { vatRegistered: true });
  assert.equal(calc.vatRate, 7);
  assert.equal(calc.base, 37000); // (15000*2 - 1000) + 8000
  assert.equal(calc.vat, 2590);
  assert.equal(calc.total, 39590);
});

test('ใบแจ้งหนี้: ผู้ออกจดทะเบียน VAT ต้องคิด VAT เสมอ · ไม่ได้จดคิดไม่ได้ (ไม่ขึ้นกับช่องติ๊ก)', () => {
  const regOff = DS.compute('INVOICE', { fields: {}, items: ITEMS }, { vatRegistered: true });
  const regOn = DS.compute('INVOICE', { fields: { includeVat: true }, items: ITEMS }, { vatRegistered: true });
  const notReg = DS.compute('INVOICE', { fields: { includeVat: true }, items: ITEMS }, { vatRegistered: false });
  assert.equal(regOff.vat, 2590);
  assert.equal(regOn.vat, 2590);
  assert.equal(notReg.vat, 0);
});

test('ใบสั่งซื้อ: คิด VAT ตามที่ระบุว่าผู้ขายจดทะเบียน VAT หรือไม่', () => {
  assert.equal(DS.compute('PO', { fields: {}, items: ITEMS }, { vatRegistered: true }).vat, 0);
  assert.equal(DS.compute('PO', { fields: { includeVat: true }, items: ITEMS }, { vatRegistered: false }).vat, 2590);
});

test('สัญญา: หัก ณ ที่จ่ายเป็นตัวเลือก · เอกสารเก่าที่ไม่มีช่อง hasWht ยังหักตามอัตราเดิม', () => {
  const base = { fee: 10000, whtRate: '3' };
  assert.equal(DS.compute('CONTRACT_INF', { fields: { ...base, hasWht: false }, items: [] }).wht, 0);
  assert.equal(DS.compute('CONTRACT_INF', { fields: { ...base, hasWht: true }, items: [] }).wht, 300);
  assert.equal(DS.compute('CONTRACT_INF', { fields: base, items: [] }).wht, 300);
  assert.equal(DS.compute('CONTRACT_BRAND', { fields: { ...base, hasWht: true }, items: [] }, { vatRegistered: true }).vat, 700);
  assert.equal(DS.compute('CONTRACT_BRAND', { fields: { ...base, includeVat: true }, items: [] }, { vatRegistered: false }).vat, 0);
});

/* ----------------------------------------------------------- ไฟล์ XML */

test('สร้างไฟล์ XML ได้และผ่านการตรวจโครงสร้าง', () => {
  const doc = sampleDoc();
  const xml = xmlbuild.build(doc);
  assert.deepEqual(xmlbuild.validate(xml, doc), []);
});

test('ไฟล์ XML มีข้อมูลที่กฎหมายบังคับครบถ้วน', () => {
  const doc = sampleDoc();
  const xml = xmlbuild.build(doc);
  assert.match(xml, /<ram:ID>TIV-2569-00001<\/ram:ID>/, 'ต้องมีเลขที่เอกสาร');
  assert.match(xml, /<ram:TypeCode>380<\/ram:TypeCode>/, 'ใบกำกับภาษีใช้รหัส 380');
  assert.match(xml, /format="102">20260920</, 'ต้องมีวันเดือนปีที่ออกแบบ YYYYMMDD');
  assert.ok(xml.includes('0105561234567'), 'ต้องมีเลขผู้เสียภาษีผู้ขาย');
  assert.ok(xml.includes('0105559876543'), 'ต้องมีเลขผู้เสียภาษีผู้ซื้อ');
  assert.ok(xml.includes('บริษัท ผู้ซื้อ จำกัด'), 'ต้องมีชื่อผู้ซื้อ');
  assert.match(xml, /<ram:TaxTotalAmount currencyID="THB">2590\.00</, 'ต้องแยกจำนวน VAT');
  assert.match(xml, /<ram:GrandTotalAmount currencyID="THB">39590\.00</, 'ต้องมียอดรวม');
});

test('ต้องระบุสำนักงานใหญ่หรือเลขที่สาขาของทั้งสองฝ่าย', () => {
  const xml = xmlbuild.build(sampleDoc());
  const branches = [...xml.matchAll(/schemeID="BRN">(\d{5})</g)].map((m) => m[1]);
  assert.deepEqual(branches, ['00000', '00001']);
});

test('ไม่ได้กรอกเลขสาขา ต้องถือเป็นสำนักงานใหญ่ (00000)', () => {
  const doc = sampleDoc();
  delete doc.issuer.branch;
  delete doc.party.branch;
  const xml = xmlbuild.build(doc);
  const branches = [...xml.matchAll(/schemeID="BRN">(\d{5})</g)].map((m) => m[1]);
  assert.deepEqual(branches, ['00000', '00000']);
});

test('อักขระพิเศษในชื่อหรือหมายเหตุต้องถูกแทนค่า ไม่ทำให้ไฟล์เสีย', () => {
  const doc = sampleDoc();
  doc.party.name = 'บริษัท เอ แอนด์ บี <กรุ๊ป> จำกัด';
  doc.fields.note = 'ส่วนลด 5% & ค่าขนส่ง "ฟรี"';
  const xml = xmlbuild.build(doc);
  assert.ok(xml.includes('&amp;'), 'เครื่องหมาย & ต้องถูกแทนค่า');
  assert.ok(xml.includes('&lt;กรุ๊ป&gt;'), 'วงเล็บมุมต้องถูกแทนค่า');
  assert.ok(!/<กรุ๊ป>/.test(xml), 'ต้องไม่เหลือวงเล็บมุมดิบในไฟล์');
  assert.deepEqual(xmlbuild.validate(xml, doc), []);
});

test('หน่วยนับภาษาไทยต้องถูกแปลงเป็นรหัสมาตรฐาน ไม่ใส่ข้อความไทยดิบ', () => {
  const xml = xmlbuild.build(sampleDoc());
  for (const m of xml.matchAll(/unitCode="([^"]*)"/g)) {
    assert.match(m[1], /^[A-Z0-9]+$/, `unitCode ต้องเป็นรหัสมาตรฐาน ไม่ใช่ "${m[1]}"`);
  }
  assert.equal(xmlbuild.unitCodeOf('ชั่วโมง'), 'HUR');
  assert.equal(xmlbuild.unitCodeOf('หน่วยที่ไม่รู้จัก'), 'C62');
});

test('ไฟล์ต้องมีข้อความกำกับว่าเป็นการสาธิต ไม่ใช่เอกสารภาษีที่ใช้อ้างอิงได้', () => {
  const xml = xmlbuild.build(sampleDoc());
  assert.ok(xml.includes('เพื่อการศึกษาและสาธิตกระบวนการ'));
  assert.ok(xml.includes('ยังไม่ได้ยื่นคำขอ'));
});

test('validate ต้องจับได้เมื่อขาดข้อมูลที่กฎหมายบังคับ', () => {
  const doc = sampleDoc();
  delete doc.party.taxId;
  delete doc.party.address;
  const errors = xmlbuild.validate(xmlbuild.build(doc), doc);
  assert.ok(errors.some((e) => e.includes('เลขประจำตัวผู้เสียภาษีของผู้ซื้อ')));
  assert.ok(errors.some((e) => e.includes('ที่อยู่ผู้ซื้อ')));
});

test('validate ต้องจับได้เมื่อยอดรวมไม่ลงกัน', () => {
  const doc = sampleDoc();
  doc.calc = { ...doc.calc, total: 1 };
  const errors = xmlbuild.validate(xmlbuild.build(doc), doc);
  assert.ok(errors.some((e) => e.includes('ยอดรวมไม่ตรงกัน')));
});

test('validate ต้องจับได้เมื่อแท็กเปิดปิดไม่สมดุล', () => {
  const doc = sampleDoc();
  const xml = xmlbuild.build(doc);
  const broken = xml.replace('</rsm:ExchangedDocument>', '');
  assert.notEqual(broken, xml, 'ต้องตัดแท็กปิดออกได้จริง มิฉะนั้นการทดสอบนี้ไม่ได้ตรวจอะไรเลย');
  assert.ok(xmlbuild.validate(broken, doc).some((e) => e.includes('เปิดปิดไม่สมดุล')));
});

test('ใบรับอิเล็กทรอนิกส์ใช้รหัสประเภทเอกสารคนละตัวกับใบกำกับภาษี', () => {
  const items = [{ name: 'รับชำระค่าบริการ', amount: 37000 }];
  const calc = DS.compute('ETAX_RECEIPT', { fields: {}, items }, { vatRegistered: true });
  const doc = sampleDoc({ type: 'ETAX_RECEIPT', docNo: 'ERC-2569-00001', items, calc });
  doc.fields = { receiveDate: '2026-09-20', payDate: '2026-09-20', payMethod: 'transfer' };
  const xml = xmlbuild.build(doc);
  assert.match(xml, /<ram:TypeCode>T01<\/ram:TypeCode>/);
  assert.ok(xml.includes('<ram:Name>ใบรับ</ram:Name>'));
  assert.deepEqual(xmlbuild.validate(xml, doc), []);
});

test('เอกสารประเภทที่ยังไม่รองรับต้องโยน error ชัดเจน ไม่สร้างไฟล์ผิด ๆ', () => {
  assert.equal(xmlbuild.supports('INVOICE'), false);
  assert.throws(() => xmlbuild.build({ type: 'INVOICE' }), /ยังไม่รองรับ/);
});

test('ชื่อไฟล์ XML ต้องมาจากเลขที่เอกสารและปลอดภัยกับระบบไฟล์', () => {
  assert.equal(xmlbuild.fileName({ docNo: 'TIV-2569-00001' }), 'TIV-2569-00001.xml');
  assert.equal(xmlbuild.fileName({ docNo: 'TIV/2569 #1' }), 'TIV-2569--1.xml');
  assert.equal(xmlbuild.fileName({}), 'document.xml');
});
