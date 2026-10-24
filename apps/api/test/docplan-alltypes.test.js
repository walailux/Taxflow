'use strict';
/**
 * docplan-alltypes.test.js ตรวจแผนผังการวาดของเอกสารทุกประเภท (WP5 ต่อยอด)
 * ------------------------------------------------------------------------------
 * docplan.test.js เดิมครอบเอกสารการเงิน 4 แบบ ไฟล์นี้ครอบส่วนที่เพิ่มเข้ามา
 * คือสัญญา หนังสือมอบอำนาจ 50 ทวิ และ ภ.ง.ด. รวมถึง "รูปร่างเอกสารที่บันทึกจริง"
 * ซึ่งต่างจากเอกสารตัวอย่าง และเป็นต้นเหตุของบั๊กที่พบตอนต่อ PDF เข้ากับ route
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../lib/docschema.js');
const docplan = require('../lib/docplan.js');
const docshape = require('../lib/docshape.js');
const xmlbuild = require('../lib/xmlbuild.js');

const issuer = {
  name: 'บริษัท ผู้ออก จำกัด', entityType: 'juristic', taxId: '0105561234567',
  branch: 'สำนักงานใหญ่', branchNo: '00000', address: '99 กรุงเทพมหานคร',
  authName: 'นายสมชาย ใจดี', authPosition: 'กรรมการ',
};
const partyInfo = { name: 'บริษัท คู่ค้า จำกัด', taxId: '0105559876541', branch: 'สาขาที่ 00001', address: '1 กรุงเทพมหานคร' };

const blocksOf = (plan, type) => plan.blocks.filter((b) => b.type === type);
const allText = (plan) => JSON.stringify(plan.blocks);

/** เอกสารในรูปร่างเดียวกับที่ lib/docbuild.js บันทึกลงฐานข้อมูลจริง */
function stored(type, fields = {}, items = []) {
  const calc = DS.compute(type, { fields, items, party: partyInfo }, { vatRegistered: true });
  return {
    id: 7, type, docNo: `${DS.FORMS[type].prefix}-2569-00001`, status: 'approved', schemaVersion: 2,
    fields, items, issuer, partyInfo,
    party: partyInfo.name, partyTaxId: partyInfo.taxId, // ระดับบนเป็นแค่ชื่อ เหมือนของจริง
    subtotal: calc.subtotal, lineDiscount: calc.lineDiscount, billDiscount: calc.billDiscount,
    base: calc.base, vatRate: calc.vatRate, vat: calc.vat, total: calc.total,
    whtRate: calc.whtRate, wht: calc.wht, net: calc.net, income: calc.income, surcharge: calc.surcharge || 0,
  };
}

/* ------------------------------------------------------ ครบทุกประเภท */

test('วาดแผนผังได้ครบทั้ง 14 ประเภทโดยไม่โยน error แม้ข้อมูลว่าง', () => {
  // ทุกประเภทใน FORMS บวก WHT (บันทึก 50 ทวิ ที่ได้รับ ซึ่งไม่ใช่แบบฟอร์มที่ระบบออกเอง)
  assert.equal(docplan.SUPPORTED.length, Object.keys(DS.FORMS).length + 1);
  for (const type of Object.keys(DS.FORMS)) {
    const plan = docplan.build({ type, fields: {}, items: [] });
    assert.ok(plan.blocks.length > 3, `${type} ต้องมีเนื้อหา`);
    assert.ok(allText(plan).includes('เพื่อการศึกษาและสาธิต'), `${type} ต้องมีข้อความกำกับ`);
  }
});

/*
 * หน้า "บันทึก 50 ทวิ (รับ)" บันทึกเอกสารเป็น type=WHT ซึ่งไม่ได้อยู่ใน DS.FORMS
 * เดิม docplan.build โยน "ไม่รู้จักเอกสารประเภท WHT" ทุกครั้ง ผู้ใช้จึงเปิดดู/ดาวน์โหลดเอกสารที่บันทึกไว้ไม่ได้เลย
 */
test('บันทึก 50 ทวิ ที่ได้รับ (WHT) ต้องวาดเป็นเอกสารได้', () => {
  assert.ok(docplan.supports('WHT'), 'WHT ต้องอยู่ในรายการที่วาดได้');
  const doc = {
    type: 'WHT', docNo: 'WHT-2569-00001', status: 'approved', docPurpose: 'record',
    payer: 'บริษัท มีเดีย ทาเลนท์ ครีเอชั่น จำกัด', description: 'ค่าจ้างผลิตเนื้อหา',
    incomeType: 'มาตรา 40(2)', issueDate: '2026-10-14', base: 12990, rate: 3, wht: 389.7, net: 12600.3,
  };
  const plan = docplan.build(doc, { bahtText: () => 'สามร้อยแปดสิบเก้าบาทเจ็ดสิบสตางค์' });
  const text = allText(plan);
  assert.ok(text.includes('บริษัท มีเดีย ทาเลนท์ ครีเอชั่น จำกัด'), 'ต้องมีชื่อผู้จ่ายเงิน');
  assert.ok(text.includes('มาตรา 40(2)'), 'ต้องมีประเภทเงินได้');
  assert.ok(text.includes('12,990.00') && text.includes('12,600.30'), 'ต้องมียอดก่อนหักและยอดสุทธิ');
  // ย้ำว่าไม่ใช่หนังสือรับรองตัวจริง ผู้ออกคือผู้จ่ายเงิน ไม่ใช่เรา
  assert.ok(text.includes('บันทึกภายใน'), 'ต้องบอกว่าเป็นบันทึกภายใน ไม่ใช่หนังสือรับรองฯ ตัวจริง');
});

test('วาดแผนผังของ WHT ไม่โยน error แม้ข้อมูลว่าง', () => {
  const plan = docplan.build({ type: 'WHT', docNo: null });
  assert.ok(plan.blocks.length > 3);
  assert.ok(plan.blocks.some((b) => b.type === 'watermark'), 'ยังไม่ออกเลขที่ ต้องมีลายน้ำฉบับร่าง');
});

test('ทุกบล็อกในทุกประเภทต้องเป็นชนิดที่ pdfbuild วาดได้', () => {
  const known = new Set(['header', 'parties', 'fields', 'table', 'totals', 'text', 'signature', 'note',
    'heading', 'para', 'clauses', 'checks', 'idboxes', 'pagebreak', 'watermark']);
  for (const type of docplan.SUPPORTED) {
    for (const b of docplan.build({ type, fields: {}, items: [] }).blocks) {
      assert.ok(known.has(b.type), `${type} มีบล็อกชนิด ${b.type} ที่วาดไม่ได้ (จะหายไปจากเอกสารเงียบ ๆ)`);
    }
  }
});

/* ---------------------------------------- รูปร่างเอกสารที่บันทึกจริง */

test('เอกสารที่บันทึกจริงต้องอ่านคู่ค้าจาก partyInfo ไม่ใช่ชื่อในช่อง party', () => {
  const d = stored('ETAX_INVOICE', { issueDate: '2026-09-20' }, [{ name: 'ค่าบริการ', qty: 1, price: 1000 }]);
  const p = blocksOf(docplan.build(d), 'parties')[0];
  const text = p.right.lines.map((l) => l.value).join('|');
  assert.ok(text.includes('0-1055-59876-54-1'), 'ต้องมีเลขผู้เสียภาษีของคู่ค้า');
  assert.ok(text.includes('กรุงเทพมหานคร'), 'ต้องมีที่อยู่คู่ค้า');
});

test('เอกสารที่บันทึกจริงต้องได้ยอดเงินจากฟิลด์ระดับบน เมื่อไม่มีก้อน calc', () => {
  const d = stored('ETAX_INVOICE', { issueDate: '2026-09-20' }, [{ name: 'ค่าบริการ', qty: 1, price: 1000 }]);
  const total = blocksOf(docplan.build(d), 'totals')[0].lines.find((l) => l.label === 'จำนวนเงินรวมทั้งสิ้น');
  assert.equal(total.value, '1,070.00');
});

test('XML ของเอกสารที่บันทึกจริงต้องผ่านตัวตรวจ (บั๊กเดิม: แจ้งว่าไม่มีชื่อผู้ซื้อ)', () => {
  const d = stored('ETAX_INVOICE', { issueDate: '2026-09-20' }, [{ name: 'ค่าบริการ', qty: 1, price: 1000 }]);
  const xml = xmlbuild.build(d);
  assert.deepEqual(xmlbuild.validate(xml, d), []);
  assert.ok(xml.includes('0105559876541'));
});

test('docshape คืนค่าเดิมเมื่อเอกสารส่งมาเป็นก้อนอยู่แล้ว', () => {
  const party = { name: 'x' };
  const calc = { total: 1 };
  assert.equal(docshape.partyOf({ party }), party);
  assert.equal(docshape.calcOf({ calc }), calc);
  assert.equal(docshape.partyOf({ party: 'ชื่ออย่างเดียว' }).name, 'ชื่ออย่างเดียว');
});

test('สาขาที่เก็บเป็นข้อความอยู่แล้วต้องแสดงตามเดิม ไม่กลายเป็น "สาขาที่ 00000"', () => {
  assert.equal(docplan.branchText('สำนักงานใหญ่'), 'สำนักงานใหญ่');
  assert.equal(docplan.branchText('สาขาที่ 00003'), 'สาขาที่ 00003');
});

/* ---------------------------------------------------------- สถานะ */

test('เอกสารที่ยกเลิกแล้วต้องมีลายน้ำคาดกลางหน้า ทุกกลุ่มเอกสาร', () => {
  for (const type of ['INVOICE', 'CONTRACT_INF', 'EWHT', 'PND53', 'POA']) {
    const plan = docplan.build({ type, docNo: 'X-1', status: 'cancelled', cancelReason: 'ออกผิด', fields: {}, items: [] });
    const wm = plan.blocks.find((b) => b.type === 'watermark');
    assert.ok(wm, `${type} ต้องมีลายน้ำยกเลิก`);
    assert.equal(wm.value, 'ยกเลิกแล้ว');
    assert.ok(wm.subtitle.includes('ออกผิด'), 'ต้องบอกเหตุผลที่ยกเลิก');
    // สถานะบอกด้วยลายน้ำอย่างเดียว ไม่มีแถบสีแดงเบียดหัวกระดาษอีก
    assert.ok(!plan.blocks.some((b) => b.type === 'note' && b.style === 'alert'), `${type} ต้องไม่มีแถบแจ้งที่หัวกระดาษแล้ว`);
  }
});

test('แบบร่างที่ยังไม่มีเลขที่ต้องมีลายน้ำห้ามใช้อ้างอิง', () => {
  const plan = docplan.build({ type: 'EWHT', docNo: null, fields: {} });
  const wm = plan.blocks.find((b) => b.type === 'watermark');
  assert.ok(wm, 'แบบร่างต้องมีลายน้ำ');
  assert.equal(wm.value, 'ฉบับร่าง');
  assert.ok(wm.subtitle.includes('ห้ามนำไปใช้อ้างอิง'));
  assert.ok(!plan.blocks.some((b) => b.type === 'note' && b.style === 'alert'), 'ต้องไม่มีแถบแจ้งที่หัวกระดาษแล้ว');
});

/* ------------------------------------------------------------ 50 ทวิ */

test('50 ทวิ ต้องออก 2 ฉบับ คั่นด้วยการขึ้นหน้าใหม่', () => {
  const d = stored('EWHT', { payDate: '2026-09-20', incomeCode: '5', incomeDesc: 'ค่าจ้างทำของ', amount: 10000, whtRate: '3', whtCondition: '1', pndForm: 'PND53' });
  const plan = docplan.build(d);
  assert.equal(blocksOf(plan, 'pagebreak').length, 1);
  const tags = blocksOf(plan, 'heading').map((h) => h.tag);
  assert.ok(tags[0].startsWith('ฉบับที่ 1'));
  assert.ok(tags[1].startsWith('ฉบับที่ 2'));
});

test('50 ทวิ ต้องใส่ยอดเฉพาะบรรทัดประเภทเงินได้ที่เลือก และติ๊กแบบยื่นให้ตรง', () => {
  const d = stored('EWHT', { payDate: '2026-09-20', incomeCode: '5', incomeDesc: 'ค่าจ้างทำของ', amount: 10000, whtRate: '3', whtCondition: '1', pndForm: 'PND53' });
  const plan = docplan.build(d);
  const rows = blocksOf(plan, 'table')[0].rows;
  const filled = rows.filter((r) => r.tax && !r.kind.startsWith('รวม'));
  assert.equal(filled.length, 1, 'ต้องมีบรรทัดเดียวที่มียอด');
  assert.ok(filled[0].kind.startsWith('5.'));
  assert.ok(filled[0].kind.includes('ค่าจ้างทำของ'), 'ต้องแสดงคำอธิบายเงินได้ที่ระบุ');
  assert.equal(filled[0].tax, '300.00');

  const forms = blocksOf(plan, 'checks').find((c) => c.title.includes('ในแบบ'));
  assert.deepEqual(forms.items.filter((i) => i.checked).map((i) => i.label), ['(7) ภ.ง.ด.53']);
});

test('50 ทวิ ต้องมีช่องเลขผู้เสียภาษีของทั้งผู้หักและผู้ถูกหัก', () => {
  const plan = docplan.build(stored('EWHT', { incomeCode: '5' }));
  const ids = blocksOf(plan, 'idboxes').slice(0, 2).map((b) => b.taxId);
  assert.deepEqual(ids, ['0105561234567', '0105559876541']);
});

/* ------------------------------------------------------------ ภ.ง.ด. */

test('ภ.ง.ด.53 ใบแนบต้องแบ่งหน้าตามจำนวนรายและเลขลำดับต่อเนื่องข้ามหน้า', () => {
  const n = docplan.PND_ROWS_PER_SHEET + 3;
  const items = Array.from({ length: n }).map((_, i) => ({ payeeName: `ราย ${i + 1}`, payeeTaxId: '0105559876541', amount: 1000, wht: 30, rate: 3 }));
  const plan = docplan.build({ type: 'PND53', docNo: 'PND53-1', fields: { taxMonth: '9', taxYearBE: 2569 }, items, issuer, income: 1000 * n, wht: 30 * n });
  const headings = blocksOf(plan, 'heading').filter((h) => h.title.startsWith('ใบแนบ'));
  assert.equal(headings.length, 2);
  assert.equal(headings[1].tag, 'แผ่นที่ 2 จาก 2');
  const tables = blocksOf(plan, 'table');
  assert.equal(tables[1].rows[0].no, String(docplan.PND_ROWS_PER_SHEET + 1), 'เลขลำดับหน้า 2 ต้องต่อจากหน้า 1');
});

test('ภ.ง.ด. ต้องย้ำว่าระบบจัดทำข้อมูลเท่านั้น ไม่ได้ยื่นแบบแทน', () => {
  const plan = docplan.build({ type: 'PND3', fields: {}, items: [] });
  assert.ok(allText(plan).includes('ไม่ได้ยื่นแบบแทนผู้ใช้'));
});

test('ภ.ง.ด. ติ๊กเดือนภาษีตรงเดือนที่เลือกเพียงเดือนเดียว', () => {
  const plan = docplan.build({ type: 'PND3', fields: { taxMonth: '9' }, items: [] });
  const months = blocksOf(plan, 'checks').find((c) => c.title.includes('เดือนภาษี'));
  assert.equal(months.items.length, 12);
  assert.deepEqual(months.items.filter((i) => i.checked).map((i) => i.label), ['(9) กันยายน']);
});

/* ------------------------------------------------------------- สัญญา */

test('ข้อสัญญาจ้าง Influencer ต้องมีครบและมีข้อ PDPA', () => {
  const plan = docplan.build(stored('CONTRACT_INF', { campaignName: 'Summer', fee: 50000, whtRate: '3', platforms: ['TikTok'] }));
  const clauses = blocksOf(plan, 'clauses')[0].items;
  assert.ok(clauses.length >= 8);
  assert.ok(clauses.some((c) => c.title === 'ข้อมูลส่วนบุคคล'));
  assert.ok(clauses[0].fields.some((f) => f.value === 'TikTok'), 'ต้องแสดงแพลตฟอร์ม');
});

test('สัญญาต้องมีช่องพยานสองคนและคำนวณอากรแสตมป์ 1 บาทต่อทุก 1,000 บาท', () => {
  const plan = docplan.build(stored('CONTRACT_BRAND', { fee: 500000, includeVat: true }));
  const sigs = blocksOf(plan, 'signature');
  assert.equal(sigs.length, 2);
  assert.deepEqual(sigs[1].boxes.map((b) => b.role), ['พยาน', 'พยาน']);
  assert.equal(docplan.stampDuty(1000), 1);
  assert.equal(docplan.stampDuty(1001), 2);
  assert.ok(allText(plan).includes('สัญญานี้ 535 บาท'), 'ยอดรวม 535,000 ต้องได้อากร 535 บาท');
});

test('สัญญากับ Brand: ผู้ออกเอกสาร (เอเจนซี่) ต้องอยู่ฝั่งผู้รับจ้าง ไม่สลับข้าง', () => {
  const d = stored('CONTRACT_BRAND', { fee: 1000, sign1Name: 'ฝั่งเอเจนซี่', sign2Name: 'ฝั่งแบรนด์' });
  d.signature = { signerName: 'ฝั่งเอเจนซี่', signedAt: '2026-09-20T00:00:00Z', image: null };
  const boxes = blocksOf(docplan.build(d), 'signature')[0].boxes;
  const contractor = boxes.find((b) => b.role === 'ผู้รับจ้าง');
  const employer = boxes.find((b) => b.role === 'ผู้ว่าจ้าง');
  assert.equal(contractor.name, 'ฝั่งเอเจนซี่');
  assert.ok(contractor.signedAt, 'ลายเซ็นของผู้ออกเอกสารต้องไปอยู่ช่องผู้รับจ้าง');
  assert.equal(employer.name, 'ฝั่งแบรนด์');
  assert.equal(employer.signedAt, '');
});

/* ------------------------------------------------------ หนังสือมอบอำนาจ */

test('หนังสือมอบอำนาจ: อากรแสตมป์ครั้งเดียว 10 บาท หลายครั้ง 30 บาท', () => {
  const once = blocksOf(docplan.build({ type: 'POA', fields: { actCount: 'once' } }), 'heading')[0];
  const many = blocksOf(docplan.build({ type: 'POA', fields: { actCount: 'many' } }), 'heading')[0];
  assert.match(once.stamp, /10 บาท/);
  assert.match(many.stamp, /30 บาท/);
});

test('หนังสือมอบอำนาจ: ติ๊กเฉพาะเรื่องที่เลือกมอบอำนาจ', () => {
  const opts = DS.FORMS.POA.sections[2].fields[0].options;
  const plan = docplan.build({ type: 'POA', fields: { powers: [opts[0].value] } });
  const checks = blocksOf(plan, 'checks')[0];
  assert.equal(checks.items.length, opts.length);
  assert.deepEqual(checks.items.filter((i) => i.checked).map((i) => i.label), [opts[0].label]);
});
