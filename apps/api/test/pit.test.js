'use strict';
/**
 * ทดสอบการคำนวณภาษีเงินได้บุคคลธรรมดา (packages/shared/pit.js)
 * ตัวเลขที่คาดหวังคำนวณด้วยมือตามขั้นตอนแบบ ภ.ง.ด.90 ทุกกรณี
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const pit = require('../../../packages/shared/pit.js');

test('40(2) 480,000: หักเหมา 100,000 + ลดหย่อนส่วนตัว 60,000 = เงินได้สุทธิ 320,000 ภาษี 9,500', () => {
  const r = pit.calculate({ year: 2026, incomes: { '40(2)': 480000 } });
  assert.equal(r.totalExpense, 100000);
  assert.equal(r.totalAllowance, 60000);
  assert.equal(r.netIncome, 320000);
  assert.equal(r.method1.tax, 9500); // 150,000 x 5% + 20,000 x 10%
  assert.equal(r.method2.tax, 0); // 480,000 x 0.5% = 2,400 ไม่เกิน 5,000 ได้รับยกเว้น
  assert.equal(r.tax, 9500);
});

test('40(1) + 40(2) ใช้เพดานค่าใช้จ่ายร่วม 100,000', () => {
  const r = pit.calculate({ incomes: { '40(1)': 150000, '40(2)': 150000 } });
  assert.equal(r.incomes[0].expense, 75000);
  assert.equal(r.incomes[1].expense, 25000);
  assert.equal(r.totalExpense, 100000);
});

test('40(8) 1,000,000: หักเหมา 60% เงินได้สุทธิ 340,000 ภาษี 11,500 และวิธี 0.5% ได้ 5,000 จึงยกเว้น', () => {
  const r = pit.calculate({ incomes: { '40(8)': 1000000 } });
  assert.equal(r.totalExpense, 600000);
  assert.equal(r.netIncome, 340000);
  assert.equal(r.method1.tax, 11500);
  assert.equal(r.method2.tax, 0);
  assert.equal(r.tax, 11500);
});

test('40(8) หักค่าใช้จ่ายตามจริงสูง: ต้องเสียตามวิธี 0.5% ที่มากกว่า', () => {
  const r = pit.calculate({ incomes: { '40(8)': { amount: 2000000, actual: 1900000 } } });
  assert.equal(r.netIncome, 40000);
  assert.equal(r.method1.tax, 0);
  assert.equal(r.method2.tax, 10000);
  assert.equal(r.usedMethod, 2);
  assert.equal(r.tax, 10000);
});

test('40(8) 3,000,000: ภาษีขั้นบันได 150,000', () => {
  const r = pit.calculate({ incomes: { '40(8)': 3000000 } });
  assert.equal(r.netIncome, 1140000);
  assert.equal(r.method1.tax, 150000); // 7,500 + 20,000 + 37,500 + 50,000 + 35,000
  assert.equal(r.method2.tax, 15000);
  assert.equal(r.tax, 150000);
});

test('ค่าเช่า 40(5) หักเหมาตามชนิดทรัพย์สิน', () => {
  const r = pit.calculate({ incomes: { '40(5)': { amount: 100000, kind: 'land' } } });
  assert.equal(r.totalExpense, 15000);
});

test('ประกันชีวิต + สุขภาพ รวมไม่เกิน 100,000', () => {
  const r = pit.calculate({ incomes: { '40(8)': 2000000 }, deductions: { lifeInsurance: 90000, healthInsurance: 25000 } });
  const life = r.allowances.find((a) => a.key === 'lifeInsurance');
  const health = r.allowances.find((a) => a.key === 'healthInsurance');
  assert.equal(life.allowed, 90000);
  assert.equal(health.allowed, 10000);
  assert.equal(health.capped, true);
});

test('กลุ่มเงินออมเพื่อการเกษียณรวมกันไม่เกิน 500,000', () => {
  const r = pit.calculate({ incomes: { '40(8)': 3000000 }, deductions: { pensionInsurance: 200000, rmf: 400000 } });
  const pension = r.allowances.find((a) => a.key === 'pensionInsurance');
  const rmf = r.allowances.find((a) => a.key === 'rmf');
  assert.equal(pension.allowed, 200000);
  assert.equal(rmf.allowed, 300000);
  assert.equal(pension.allowed + rmf.allowed, 500000);
});

test('ประกันสังคมใช้เพดานตามปีภาษี: 2568 = 9,000 · 2569 = 10,500', () => {
  const a = pit.calculate({ year: 2025, incomes: { '40(1)': 600000 }, deductions: { socialSecurity: 10500 } });
  const b = pit.calculate({ year: 2026, incomes: { '40(1)': 600000 }, deductions: { socialSecurity: 10500 } });
  assert.equal(a.allowances.find((x) => x.key === 'socialSecurity').allowed, 9000);
  assert.equal(b.allowances.find((x) => x.key === 'socialSecurity').allowed, 10500);
});

test('Easy E-Receipt ใช้ได้เฉพาะปีภาษี 2568 · Solar Rooftop เฉพาะ 2569', () => {
  const a = pit.calculate({ year: 2025, incomes: { '40(8)': 1000000 }, deductions: { easyEReceipt: 50000, solar: 100000 } });
  const b = pit.calculate({ year: 2026, incomes: { '40(8)': 1000000 }, deductions: { easyEReceipt: 50000, solar: 100000 } });
  assert.equal(a.allowances.find((x) => x.key === 'easyEReceipt').allowed, 50000);
  assert.equal(a.allowances.find((x) => x.key === 'solar').allowed, 0);
  assert.equal(b.allowances.find((x) => x.key === 'easyEReceipt').allowed, 0);
  assert.equal(b.allowances.find((x) => x.key === 'solar').allowed, 100000);
});

test('เงินบริจาค 2 เท่า + ทั่วไป รวมไม่เกิน 10% ของเงินได้หลังหักลดหย่อน', () => {
  // 40(8) 1,000,000 - 600,000 - 60,000 = 340,000 -> เพดาน 34,000
  const r = pit.calculate({ incomes: { '40(8)': 1000000 }, deductions: { donationDouble: 10000, donationGeneral: 20000 } });
  assert.equal(r.donationCap, 34000);
  assert.equal(r.donations.find((d) => d.key === 'donationDouble').allowed, 20000);
  assert.equal(r.donations.find((d) => d.key === 'donationGeneral').allowed, 14000);
  assert.equal(r.netIncome, 306000);
});

test('บิดามารดาสูงสุด 4 คน และหักภาษี ณ ที่จ่ายเพื่อหายอดชำระเพิ่ม/ได้คืน', () => {
  const r = pit.calculate({ incomes: { '40(2)': 480000 }, deductions: { parents: 6 }, withholdingPaid: 14400 });
  assert.equal(r.allowances.find((a) => a.key === 'parents').allowed, 120000);
  assert.equal(r.netIncome, 200000);
  assert.equal(r.tax, 2500);
  assert.equal(r.balance, -11900); // ได้รับคืน 11,900
});

test('ไม่มีเงินได้: ภาษี 0 ไม่พัง', () => {
  const r = pit.calculate({});
  assert.equal(r.assessable, 0);
  assert.equal(r.tax, 0);
  assert.equal(r.netIncome, 0);
});
