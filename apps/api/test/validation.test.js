'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DS = require('../lib/docschema.js');
const chk = DS.checkField;

test('1) ค่าว่าง — ช่องบังคับห้ามเว้นว่าง', () => {
  assert.match(chk({ label: 'ชื่อ', type: 'text' }, '', { need: true }), /ห้ามเว้นว่าง/);
  assert.match(chk({ label: 'ชื่อ', type: 'text' }, '   ', { need: true }), /ห้ามเว้นว่าง/);
  assert.strictEqual(chk({ label: 'หมายเหตุ', type: 'text' }, '', {}), null);
});

test('2) ชนิดข้อมูล — ช่องตัวเลขต้องเป็นตัวเลข', () => {
  assert.match(chk({ label: 'จำนวน', type: 'number' }, 'สอง', {}), /ตัวเลขเท่านั้น/);
  assert.match(chk({ label: 'จำนวนงวด', type: 'number', int: true }, 2.5, {}), /จำนวนเต็ม/);
  assert.match(chk({ label: 'เลขผู้เสียภาษี', type: 'taxid' }, '12ab', {}), /ตัวเลขเท่านั้น/);
});

test('3) ช่วงข้อมูล', () => {
  const def = { label: 'จำนวน Content', type: 'number', int: true, min0: 1, max: 1000 };
  assert.match(chk(def, 0, {}), /1–1,000/);
  assert.match(chk(def, 5000, {}), /1–1,000/);
  assert.strictEqual(chk(def, 10, {}), null);
  assert.match(chk({ label: 'อัตรา', type: 'number', oneOf: DS.WHT_RATES }, 4, {}), /หนึ่งใน/);
});

test('4) รูปแบบข้อมูล', () => {
  const email = { label: 'อีเมล', type: 'text', fmt: 'email' };
  assert.match(chk(email, 'abc@', {}), /example@email.com/);
  assert.strictEqual(chk(email, 'example@email.com', {}), null);
  assert.match(chk({ label: 'โทร', type: 'text', fmt: 'phone' }, '12ab', {}), /9–10 หลัก/);
  assert.strictEqual(chk({ label: 'โทร', type: 'text', fmt: 'phone' }, '081-234-5678', {}), null);
  assert.match(chk({ label: 'ลิงก์', type: 'text', fmt: 'url' }, 'tiktok.com/x', {}), /https:\/\//);
  assert.match(chk({ label: 'เลขผู้เสียภาษี', type: 'taxid' }, '1100700123456', {}), /ไม่ถูกต้อง/);
});

test('5) ความยาว', () => {
  assert.match(chk({ label: 'ชื่อ', type: 'text', minLen: 2 }, 'ก', {}), /อย่างน้อย 2/);
  assert.match(chk({ label: 'ชื่อ', type: 'text', maxLen: 10 }, 'x'.repeat(11), {}), /ยาวเกิน 10/);
});

test('6) ข้อมูลที่สัมพันธ์กัน — วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น', () => {
  const r = DS.validateDoc('CONTRACT_BRAND', { fields: { contractDate: '2026-09-01', startDate: '2026-10-01', endDate: '2026-09-15' }, party: {}, items: [] }, { today: '2026-09-17' });
  assert.match(r.fieldErrors.endDate, /ต้องไม่มาก่อน "วันที่เริ่มต้น"/);
  const rc = DS.validateDoc('RECEIPT', { fields: { receiveDate: '2026-12-01', payMethod: 'cash', payDate: '2026-12-02' }, party: { name: 'ลูกค้า' }, items: [{ name: 'x', amount: 1 }] }, { today: '2026-09-17' });
  assert.match(rc.fieldErrors.receiveDate, /อนาคต/);
  const q = DS.validateDoc('QUOTATION', { fields: { issueDate: '2026-09-17', validUntil: '2026-09-18' }, party: { name: 'ลูกค้า', contactPerson: 'ก' }, items: [{ name: 'x', qty: 1, price: 100, discount: 500 }] }, { today: '2026-09-17' });
  assert.ok(q.itemErrors.some((e) => e.col === 'discount'));
});
