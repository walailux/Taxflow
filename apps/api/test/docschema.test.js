'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DS = require('../lib/docschema.js');

test('ใบเสนอราคา: ส่วนลดรายการ + ส่วนลดท้ายบิล + VAT 7%', () => {
  const c = DS.compute('QUOTATION', {
    fields: { includeVat: true, billDiscount: 1000 },
    items: [{ qty: 1, price: 30000, discount: 0 }, { qty: 2, price: 25000, discount: 500 }],
  }, { vatRegistered: true });
  assert.strictEqual(c.subtotal, 80000);
  assert.strictEqual(c.base, 78500);
  assert.strictEqual(c.vat, 5495);
  assert.strictEqual(c.total, 83995);
});

test('ไม่จด VAT คิด VAT ไม่ได้ (ยกเว้น PO ที่ผู้ขายเป็นคนคิด)', () => {
  const items = [{ qty: 1, price: 1000 }];
  assert.strictEqual(DS.compute('INVOICE', { fields: { includeVat: true }, items }, { vatRegistered: false }).vat, 0);
  assert.strictEqual(DS.compute('PO', { fields: { includeVat: true }, items }, { vatRegistered: false }).vat, 70);
});

test('หัก ณ ที่จ่าย 3 เงื่อนไข', () => {
  assert.deepStrictEqual(DS.calcWht(10000, 3, '1'), { base: 10000, rate: 3, wht: 300, income: 10000, net: 9700, condition: '1' });
  const t = DS.calcWht(10000, 3, '2'); // ออกให้ตลอดไป: 10000 × 3/97
  assert.strictEqual(t.wht, 309.28); assert.strictEqual(t.income, 10309.28); assert.strictEqual(t.net, 10000);
  const o = DS.calcWht(10000, 3, '3'); // ออกให้ครั้งเดียว
  assert.strictEqual(o.wht, 300); assert.strictEqual(o.income, 10300); assert.strictEqual(o.net, 10000);
});

test('เลือกแบบ ภ.ง.ด. อัตโนมัติ', () => {
  assert.strictEqual(DS.autoPndForm({ taxId: '0105561112235' }, '5'), 'PND53');
  assert.strictEqual(DS.autoPndForm({ taxId: '1100700123455' }, '5'), 'PND3');
  assert.strictEqual(DS.autoPndForm({ entityType: 'individual', taxId: '1100700123455' }, '2'), 'PND1A');
});

test('ใบสำคัญจ่าย และ ภ.ง.ด.3', () => {
  const pv = DS.compute('PAYMENT', { fields: { hasWht: true, whtRate: '3', whtCondition: '1' }, items: [{ amount: 15000 }] });
  assert.strictEqual(pv.wht, 450); assert.strictEqual(pv.net, 14550);
  const p = DS.compute('PND3', { fields: { surcharge: 10 }, items: [{ amount: 15000, wht: 450 }, { amount: 5000, wht: 150 }] });
  assert.strictEqual(p.base, 20000); assert.strictEqual(p.wht, 600); assert.strictEqual(p.total, 610);
});

/*
 * ตัวย่อเดือนไทยย่อไม่ได้ตามกติกาเดียวกันทุกเดือน จึงตัดสามตัวอักษรแรกมาใช้ไม่ได้
 * (ของเดิมทำแบบนั้น ได้ "ตุล." "กัน." "มีน." ซึ่งไม่ใช่ตัวย่อที่ใช้กันจริง)
 */
test('thaiDate: ตัวย่อเดือนต้องตรงตามราชบัณฑิตยสภาครบ 12 เดือน', () => {
  const want = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  want.forEach((abbr, i) => {
    const iso = `2026-${String(i + 1).padStart(2, '0')}-15`;
    assert.strictEqual(DS.thaiDate(iso, true), `15 ${abbr} 2569`);
    assert.strictEqual(DS.thaiDate(iso), `15 ${DS.THAI_MONTHS[i]} 2569`);
  });
});

test('thaiDate: วันที่ว่างหรือรูปแบบผิดคืนค่าว่าง ไม่ใช่ NaN', () => {
  for (const bad of ['', null, undefined, 'ไม่ใช่วันที่', '2026-13']) {
    assert.strictEqual(DS.thaiDate(bad, true), '');
  }
});
