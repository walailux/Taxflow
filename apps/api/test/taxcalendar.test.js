'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const cal = require('../lib/taxcalendar');

test('nextMonthlyDeadline — วันนี้ยังไม่ถึงวันกำหนด ให้ใช้เดือนเดียวกัน', () => {
  assert.equal(cal.nextMonthlyDeadline(15, '2026-03-10').toISOString().slice(0, 10), '2026-03-15');
});

test('nextMonthlyDeadline — วันนี้เลยวันกำหนดของเดือนนี้แล้ว ให้เลื่อนไปเดือนถัดไป', () => {
  assert.equal(cal.nextMonthlyDeadline(7, '2026-03-10').toISOString().slice(0, 10), '2026-04-07');
});

test('nextMonthlyDeadline — ข้ามปีตอนธันวาคมต่อมกราคมถูกต้อง', () => {
  assert.equal(cal.nextMonthlyDeadline(15, '2026-12-20').toISOString().slice(0, 10), '2027-01-15');
});

test('nextAnnualDeadline — ก่อนถึงเดือน/วันกำหนดของปีนี้ ให้ใช้ปีนี้', () => {
  assert.equal(cal.nextAnnualDeadline(3, 31, '2026-01-10').toISOString().slice(0, 10), '2026-03-31');
});

test('nextAnnualDeadline — เลยกำหนดของปีนี้แล้ว ให้เลื่อนไปปีถัดไป', () => {
  assert.equal(cal.nextAnnualDeadline(3, 31, '2026-06-01').toISOString().slice(0, 10), '2027-03-31');
});

test('upcomingDeadlines — เอเจนซี่จด VAT นิติบุคคล ต้องเห็นทั้ง VAT และ WHT แต่ไม่เห็น PIT', () => {
  const items = cal.upcomingDeadlines({ role: 'agency', entityType: 'juristic', vatRegistered: true }, '2026-03-01');
  const keys = items.map((i) => i.key).sort((a, b) => (a < b ? -1 : Number(a > b)));
  assert.deepEqual(keys, ['VAT', 'WHT']);
});

test('upcomingDeadlines — ครีเอเตอร์บุคคลธรรมดาไม่จด VAT เห็นเฉพาะ PIT', () => {
  const items = cal.upcomingDeadlines({ role: 'creator', entityType: 'individual', vatRegistered: false }, '2026-03-01');
  assert.deepEqual(items.map((i) => i.key), ['PIT']);
});

test('upcomingDeadlines — เรียงจากใกล้ถึงไกล (daysLeft น้อยไปมาก)', () => {
  const items = cal.upcomingDeadlines({ role: 'agency', entityType: 'individual', vatRegistered: true }, '2026-03-01');
  for (let i = 1; i < items.length; i++) assert.ok(items[i].daysLeft >= items[i - 1].daysLeft);
});
