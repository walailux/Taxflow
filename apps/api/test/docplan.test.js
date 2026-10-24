'use strict';
/**
 * docplan.test.js ตรวจแผนผังการวาดเอกสาร (WP5)
 * ------------------------------------------------
 * ทดสอบได้เต็มที่เพราะ docplan.js เป็นตรรกะบริสุทธิ์ ไม่แตะ PDFKit
 * สิ่งที่ตรวจคือ "เอกสารมีอะไรอยู่บนนั้นบ้าง" ซึ่งเป็นส่วนที่ผิดแล้วเสียหายจริง
 * ส่วน "วาดออกมาสวยไหม" ต้องดูจากไฟล์ตัวอย่าง (npm run pdf:sample)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../lib/docschema.js');
const docplan = require('../lib/docplan.js');
const pdfbuild = require('../lib/pdfbuild.js');

const ITEMS = [
  { name: 'ค่าผลิตคอนเทนต์', qty: 4, unit: 'ชิ้น', price: 25000, discount: 5000 },
  { name: 'ค่ารีวิวสินค้า', qty: 2, unit: 'ครั้ง', price: 18000 },
];

function doc(overrides = {}) {
  const type = overrides.type || 'ETAX_INVOICE';
  const items = overrides.items || ITEMS;
  return {
    type,
    docNo: 'TIV-2569-00001',
    fields: { issueDate: '2026-09-20', volumeNo: '1' },
    issuer: { name: 'บริษัท ผู้ขาย จำกัด', taxId: '0105561234567', branch: '00000', address: '99 กรุงเทพมหานคร' },
    party: { name: 'บริษัท ผู้ซื้อ จำกัด', taxId: '0105559876543', branch: '00012', address: '1 กรุงเทพมหานคร' },
    items,
    calc: DS.compute(type, { fields: {}, items }, { vatRegistered: true }),
    ...overrides,
  };
}

const findBlock = (plan, type) => plan.blocks.find((b) => b.type === type);

/* ------------------------------------------------------------ โครงของเอกสาร */

test('แผนผังต้องมีบล็อกครบตามลำดับที่เอกสารการเงินควรเป็น', () => {
  const plan = docplan.build(doc());
  const types = plan.blocks.map((b) => b.type);
  assert.equal(types[0], 'header', 'หัวกระดาษต้องมาก่อน');
  assert.ok(types.indexOf('parties') < types.indexOf('table'), 'คู่สัญญาต้องมาก่อนรายการ');
  assert.ok(types.indexOf('table') < types.indexOf('totals'), 'รายการต้องมาก่อนยอดรวม');
  assert.ok(types.includes('signature'), 'ต้องมีช่องลงลายมือชื่อ');
  assert.ok(types.includes('note'), 'ต้องมีข้อความกำกับ');
});

test('ใบกำกับภาษีต้องมีคำว่า "ใบกำกับภาษี" ปรากฏชัดเจนบนเอกสาร', () => {
  // มาตรา 86/4 (1) บังคับให้มีคำนี้อยู่บนเอกสาร ไม่ใช่แค่ในชื่อไฟล์
  const header = findBlock(docplan.build(doc()), 'header');
  assert.ok(header.banner.includes('ใบกำกับภาษี'));
  assert.ok(header.title.includes('ใบกำกับภาษี'));
});

test('เอกสารธุรกิจทั่วไปต้องไม่มีแถบใบกำกับภาษี', () => {
  const header = findBlock(docplan.build(doc({ type: 'INVOICE' })), 'header');
  assert.equal(header.banner, '');
});

test('เอกสารต้องมีเลขที่และวันเดือนปีที่ออก', () => {
  const header = findBlock(docplan.build(doc()), 'header');
  const labels = header.fields.map((f) => f.label);
  assert.ok(labels.includes('เลขที่'));
  assert.ok(labels.includes('วันที่'));
  assert.ok(labels.includes('เล่มที่'), 'กรอกเล่มที่มาต้องแสดงด้วย');
  assert.equal(header.fields.find((f) => f.label === 'เลขที่').value, 'TIV-2569-00001');
});

test('ยังไม่มีเลขที่เอกสารต้องแสดงว่าเป็นฉบับร่าง ไม่ใช่ช่องว่าง', () => {
  const header = findBlock(docplan.build(doc({ docNo: '' })), 'header');
  assert.equal(header.fields.find((f) => f.label === 'เลขที่').value, 'ฉบับร่าง');
});

/* -------------------------------------------------------------- คู่สัญญา */

test('ต้องมีชื่อ เลขผู้เสียภาษี และที่อยู่ของทั้งผู้ขายและผู้ซื้อ', () => {
  const p = findBlock(docplan.build(doc()), 'parties');
  for (const box of [p.left, p.right]) {
    const text = box.lines.map((l) => `${l.label}${l.value}`).join('|');
    assert.match(text, /\d-\d{4}-\d{5}-\d{2}-\d/, 'ต้องมีเลขผู้เสียภาษี');
    assert.ok(text.includes('กรุงเทพมหานคร'), 'ต้องมีที่อยู่');
  }
  assert.ok(p.left.lines[0].value.includes('ผู้ขาย'));
  assert.ok(p.right.lines[0].value.includes('ผู้ซื้อ'));
});

test('เลขผู้เสียภาษีต้องจัดรูปแบบให้อ่านง่าย', () => {
  assert.equal(docplan.taxIdText('0105561234567'), '0-1055-61234-56-7');
  assert.equal(docplan.taxIdText('123'), '123', 'เลขไม่ครบ 13 หลักคืนค่าเดิม ไม่จัดรูปแบบมั่ว');
  assert.equal(docplan.taxIdText(''), '-');
});

test('ไม่ระบุสาขาหรือระบุ 00000 ต้องแสดงว่าเป็นสำนักงานใหญ่', () => {
  assert.equal(docplan.branchText(''), 'สำนักงานใหญ่');
  assert.equal(docplan.branchText('00000'), 'สำนักงานใหญ่');
  assert.equal(docplan.branchText('12'), 'สาขาที่ 00012');
});

/* ---------------------------------------------------------------- ตาราง */

test('ตารางรายการต้องมีคอลัมน์ครบและคำนวณยอดรายบรรทัดถูกต้อง', () => {
  const t = findBlock(docplan.build(doc()), 'table');
  assert.deepEqual(t.columns.map((c) => c.key), ['no', 'name', 'qty', 'unit', 'price', 'amount']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0].amount, '95,000.00'); // 4 x 25,000 - 5,000
  assert.equal(t.rows[1].amount, '36,000.00'); // 2 x 18,000
  assert.equal(t.rows[0].no, '1');
});

test('รายการที่มีส่วนลดต้องบอกไว้ในชื่อรายการ ไม่ใช่หักเงียบ ๆ', () => {
  const t = findBlock(docplan.build(doc()), 'table');
  assert.match(t.rows[0].name, /หักส่วนลด 5,000\.00 บาท/);
  assert.ok(!t.rows[1].name.includes('ส่วนลด'), 'รายการที่ไม่มีส่วนลดต้องไม่มีข้อความนี้');
});

test('เอกสารแบบระบุยอดรวมใช้ตารางแบบสั้น ไม่มีคอลัมน์จำนวนและราคาต่อหน่วย', () => {
  const items = [{ name: 'รับชำระค่าบริการ', amount: 131000 }];
  const t = findBlock(docplan.build(doc({ type: 'ETAX_RECEIPT', items })), 'table');
  assert.deepEqual(t.columns.map((c) => c.key), ['no', 'name', 'amount']);
  assert.equal(t.rows[0].amount, '131,000.00');
});

/* ------------------------------------------------------------- ยอดเงิน */

test('กล่องสรุปยอดต้องแยกภาษีมูลค่าเพิ่มออกจากราคาชัดเจน', () => {
  // มาตรา 86/4 (7) บังคับให้แยกจำนวน VAT ออกจากราคา
  const lines = findBlock(docplan.build(doc()), 'totals').lines;
  const vat = lines.find((l) => l.label.includes('ภาษีมูลค่าเพิ่ม'));
  assert.ok(vat, 'ต้องมีบรรทัดภาษีมูลค่าเพิ่ม');
  assert.equal(vat.label, 'ภาษีมูลค่าเพิ่ม 7%');
  assert.equal(vat.value, '9,170.00'); // (95,000 + 36,000) x 7%
  const total = lines.find((l) => l.label === 'จำนวนเงินรวมทั้งสิ้น');
  assert.equal(total.value, '140,170.00');
  assert.equal(total.bold, true, 'ยอดรวมต้องเน้นให้เห็นชัด');
});

test('ไม่มีส่วนลดต้องไม่มีบรรทัดส่วนลดโผล่มาเป็นศูนย์', () => {
  const items = [{ name: 'ค่าบริการ', qty: 1, price: 1000 }];
  const lines = findBlock(docplan.build(doc({ items })), 'totals').lines;
  assert.ok(!lines.some((l) => l.label.includes('ส่วนลด')));
});

test('จำนวนเงินต้องมีลูกน้ำคั่นหลักพันและทศนิยม 2 ตำแหน่งเสมอ', () => {
  assert.equal(docplan.money(1234567.5), '1,234,567.50');
  assert.equal(docplan.money(0), '0.00');
  assert.equal(docplan.money(null), '0.00', 'ค่าว่างต้องไม่กลายเป็น NaN');
  assert.equal(docplan.money('abc'), '0.00');
});

test('ส่งตัวแปลงจำนวนเงินเป็นตัวหนังสือมาด้วย ต้องมีบรรทัดตัวหนังสือกำกับ', () => {
  const bahtText = require('../lib/docview').bahtText;
  const plan = docplan.build(doc(), { bahtText });
  const line = plan.blocks.find((b) => b.style === 'baht');
  assert.ok(line, 'ต้องมีจำนวนเงินเป็นตัวหนังสือ');
  assert.match(line.value, /^\(.*บาท.*\)$/);
});

/* --------------------------------------------------------- ข้อความกำกับ */

test('ทุกเอกสารต้องมีข้อความกำกับว่าเป็นการสาธิต ไม่มีผลตามกฎหมาย', () => {
  // ความเสี่ยงที่แผนระบุไว้: ผู้ตรวจอาจเข้าใจว่าลายมือชื่อในระบบมีผลตามกฎหมาย
  for (const type of ['ETAX_INVOICE', 'INVOICE', 'RECEIPT']) {
    const notes = docplan.build(doc({ type })).blocks.filter((b) => b.type === 'note');
    const text = notes.map((n) => n.value).join(' ');
    assert.ok(text.includes('เพื่อการศึกษาและสาธิต'), `${type} ต้องมีข้อความกำกับ`);
    assert.ok(text.includes('ไม่มีผลรับรองตามกฎหมาย'), `${type} ต้องบอกว่าลายมือชื่อไม่มีผลทางกฎหมาย`);
  }
});

test('มีลิงก์ตรวจสอบเอกสารต้องแสดงเป็นข้อความ และไม่มี QR Code ในเอกสาร', () => {
  const plan = docplan.build(doc({ verifyUrl: 'https://example.com/verify/abc' }));
  const note = plan.blocks.find((b) => b.type === 'note' && String(b.value).includes('https://example.com/verify/abc'));
  assert.ok(note);
  assert.ok(!plan.blocks.some((b) => b.qr));
});

test('ช่องลงลายมือชื่อต้องมีทั้งฝั่งผู้ออกและฝั่งคู่ค้า', () => {
  const s = findBlock(docplan.build(doc()), 'signature');
  assert.equal(s.boxes.length, 2);
  assert.ok(s.boxes[0].name.includes('ผู้ขาย'));
  assert.ok(s.boxes[1].name.includes('ผู้ซื้อ'));
});

test('ประเภทเอกสารที่ไม่รู้จักต้องโยน error ชัดเจน', () => {
  assert.throws(() => docplan.build({ type: 'ไม่มีจริง' }), /ไม่รู้จักเอกสารประเภท/);
});

/* --------------------------------------------- ส่วนที่ทดสอบได้ของ pdfbuild */

test('คอลัมน์ที่ไม่กำหนดความกว้างต้องได้พื้นที่ที่เหลือทั้งหมด', () => {
  const widths = pdfbuild.columnWidths([{ width: 40 }, { width: 0 }, { width: 60 }], 300);
  assert.deepEqual(widths, [40, 200, 60]);
  assert.equal(widths.reduce((a, b) => a + b, 0), 300, 'รวมกันต้องเต็มความกว้างพอดี');
});

test('คอลัมน์ยืดหยุ่นต้องไม่แคบจนอ่านไม่ออกแม้พื้นที่เหลือน้อย', () => {
  const widths = pdfbuild.columnWidths([{ width: 280 }, { width: 0 }], 300);
  assert.ok(widths[1] >= 60, 'ต้องมีความกว้างขั้นต่ำ');
});

test('ไม่มีไฟล์ฟอนต์ต้องบอกวิธีแก้ ไม่ใช่ error ที่อ่านไม่รู้เรื่อง', () => {
  const st = pdfbuild.fontStatus();
  if (st.ready) return; // เครื่องที่วางฟอนต์แล้วข้ามข้อนี้
  assert.throws(() => pdfbuild.requireFonts(), (err) => {
    assert.ok(err.message.includes('Sarabun'), 'ต้องบอกชื่อฟอนต์ที่ต้องใช้');
    assert.ok(err.message.includes(st.dir), 'ต้องบอกว่าต้องวางไว้ที่ไหน');
    return true;
  });
});

/* --------------------------------- ข้อบกพร่องที่พบจากการตรวจเอกสารจริง */

test('ผลบวกคอลัมน์จำนวนเงินต้องเท่ากับบรรทัด "รวมเป็นเงิน" พอดี', () => {
  // พบจากใบเสนอราคา QT-2026-00001 และไฟล์ตัวอย่าง: คอลัมน์แสดงยอดหลังหักส่วนลด
  // แต่บรรทัดรวมแสดงยอดก่อนหัก คนที่บวกคอลัมน์เองจึงได้ตัวเลขไม่ตรงกับเอกสาร
  const items = [
    { name: 'ค่าผลิตคอนเทนต์', qty: 4, unit: 'ชิ้น', price: 25000, discount: 5000 },
    { name: 'ค่ารีวิว', qty: 2, unit: 'ครั้ง', price: 18000 },
    { name: 'ค่าบริหารจัดการ', qty: 1, unit: 'งาน', price: 7000 },
  ];
  const plan = docplan.build(doc({ items }));
  const colSum = findBlock(plan, 'table').rows
    .reduce((sum, r) => sum + Number(r.amount.replace(/,/g, '')), 0);
  const subtotal = findBlock(plan, 'totals').lines.find((l) => l.label === 'รวมเป็นเงิน');
  assert.equal(docplan.money(colSum), subtotal.value);
  assert.equal(subtotal.value, '138,000.00');
});

test('ปรับบรรทัดรวมแล้ว ยอด VAT และยอดสุทธิต้องไม่เปลี่ยน', () => {
  const items = [
    { name: 'ค่าผลิตคอนเทนต์', qty: 4, unit: 'ชิ้น', price: 25000, discount: 5000 },
    { name: 'ค่ารีวิว', qty: 2, unit: 'ครั้ง', price: 18000 },
    { name: 'ค่าบริหารจัดการ', qty: 1, unit: 'งาน', price: 7000 },
  ];
  const lines = findBlock(docplan.build(doc({ items })), 'totals').lines;
  assert.equal(lines.find((l) => l.label.startsWith('ภาษีมูลค่าเพิ่ม')).value, '9,660.00');
  assert.equal(lines.find((l) => l.label === 'จำนวนเงินรวมทั้งสิ้น').value, '147,660.00');
});

test('ยอดรายการในตารางต้องตรงกับ LineTotalAmount ในไฟล์ XML ทุกบรรทัด', () => {
  const xmlbuild = require('../lib/xmlbuild.js');
  const d = doc();
  const rows = findBlock(docplan.build(d), 'table').rows.map((r) => r.amount.replace(/,/g, ''));
  const xmlLines = [...xmlbuild.build(d).matchAll(/<ram:LineTotalAmount[^>]*>([^<]+)</g)].map((m) => m[1]);
  // บรรทัดสุดท้ายของ LineTotalAmount อยู่ในส่วนสรุปหัวเอกสาร ตัดออกก่อนเทียบ
  assert.deepEqual(rows.map(Number), xmlLines.slice(0, rows.length).map(Number));
});

test('ส่วนลดท้ายบิลยังต้องแสดงแยกบรรทัดเหมือนเดิม', () => {
  const items = [{ name: 'ค่าบริการ', qty: 1, price: 10000 }];
  const d = doc({ items });
  d.calc = DS.compute('ETAX_INVOICE', { fields: { billDiscount: 1000 }, items }, { vatRegistered: true });
  assert.equal(d.calc.billDiscount, 1000, 'ข้อมูลทดสอบต้องมีส่วนลดท้ายบิลจริง มิฉะนั้นข้อนี้ไม่ได้ตรวจอะไร');
  const lines = findBlock(docplan.build(d), 'totals').lines;
  assert.equal(lines.find((l) => l.label === 'รวมเป็นเงิน').value, '10,000.00');
  assert.equal(lines.find((l) => l.label === 'หักส่วนลดท้ายบิล').value, '1,000.00');
  assert.equal(lines.find((l) => l.label === 'ราคาหลังหักส่วนลด').value, '9,000.00');
});
