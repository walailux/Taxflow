'use strict';
const test = require('node:test');
const assert = require('node:assert');
const cal = require('../lib/calendar');

test('กำหนดยื่นภาษีตามบทบาท: บริษัทจด VAT ได้ ภ.ง.ด.3/53 และ ภ.พ.30', () => {
  const ev = cal.taxEvents({ role: 'corporate', entityType: 'juristic', vatRegistered: true }, '2026-09-01', '2026-09-30');
  assert.deepStrictEqual(ev.map((e) => e.date).sort((a, b) => (a < b ? -1 : Number(a > b))), ['2026-09-07', '2026-09-15']);
  assert.ok(ev.every((e) => e.locked && e.source === 'system'));
});

test('ครีเอเตอร์บุคคลธรรมดาไม่จด VAT ได้เฉพาะ ภ.ง.ด.94 ในเดือนกันยายน', () => {
  const ev = cal.taxEvents({ role: 'creator', entityType: 'individual', vatRegistered: false }, '2026-09-01', '2026-09-30');
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].date, '2026-09-30');
});

test('กิจกรรมจากสัญญาจ้าง Influencer และงวดชำระ', () => {
  const docs = [{ id: 7, userId: 1, schemaVersion: 2, type: 'CONTRACT_INF', status: 'approved', docNo: 'CTR-1', fields: { startDate: '2026-09-02', endDate: '2026-09-28', submitDate: '2026-09-10', postDate: '2026-09-15' }, items: [{ name: 'งวด 1', amount: 5000, dueDate: '2026-09-20' }] }];
  const ev = cal.docEvents(docs, '2026-09-01', '2026-09-30');
  assert.strictEqual(ev.length, 5);
  assert.ok(ev.every((e) => e.priority === 'critical' && e.lockReason === 'ผูกกับเอกสารที่ยืนยันแล้ว'));
  assert.strictEqual(cal.docEvents([{ ...docs[0], status: 'cancelled' }], '2026-09-01', '2026-09-30').length, 0);
});

test('ตรวจสอบข้อมูลกิจกรรม: ค่าว่าง ช่วงวันที่ เวลา หมวดหมู่', () => {
  const { errors } = cal.validateEvent({ title: '', date: '2026-02-30', category: 'x', time: '25:00' });
  assert.ok(errors.title && errors.date && errors.category && errors.time);
  const r2 = cal.validateEvent({ title: 'ก', date: '2026-09-10', endDate: '2026-09-09' });
  assert.strictEqual(r2.errors.endDate, 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น');
  const r3 = cal.validateEvent({ title: 'ก', date: '2026-09-10', time: '10:00', endTime: '09:00' });
  assert.ok(r3.errors.endTime);
  const r4 = cal.validateEvent({ title: 'ก', date: '2026-09-10', linkDocId: 99 }, { ownDocIds: [1] });
  assert.ok(r4.errors.linkDocId);
});

test('กฎการล็อก: สำคัญมาก และเอกสารที่ยืนยันแล้ว ลบไม่ได้ ลดระดับไม่ได้', () => {
  assert.strictEqual(cal.lockState({ source: 'user', priority: 'normal' }).locked, false);
  assert.strictEqual(cal.lockState({ source: 'user', priority: 'critical' }).locked, true);
  assert.strictEqual(cal.lockState({ source: 'user', priority: 'normal', linkDocId: 3 }, { 3: { status: 'archived' } }).locked, true);
  assert.strictEqual(cal.lockState({ source: 'user', priority: 'normal', linkDocId: 3 }, { 3: { status: 'draft' } }).locked, false);
  const r = cal.validateEvent({ title: 'ก', date: '2026-09-10', priority: 'normal' }, { existing: { priority: 'critical' } });
  assert.ok(r.errors.priority);
});

test('collect รวมกิจกรรมหลายวันและ override ของกิจกรรมระบบ', () => {
  const items = cal.collect({
    user: { id: 1, role: 'agency', entityType: 'juristic', vatRegistered: false }, docs: [], requests: [],
    userEvents: [{ id: 5, userId: 1, title: 'ทริป', date: '2026-08-30', endDate: '2026-09-02', priority: 'normal', category: 'meeting', attachments: [{ id: 'a', storedName: 'x' }] }],
    overrides: [{ id: 1, sysKey: 'sys:tax:WHT:2026-9', done: true, note: 'นำส่งแล้ว' }],
    from: '2026-09-01', to: '2026-09-30',
  });
  const trip = items.find((e) => e.id === 5);
  assert.ok(trip && trip.attachments[0].storedName === undefined);
  const wht = items.find((e) => e.id === 'sys:tax:WHT:2026-9');
  assert.ok(wht.done && wht.userNote === 'นำส่งแล้ว');
});
