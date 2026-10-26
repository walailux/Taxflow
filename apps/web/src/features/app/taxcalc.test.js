import { describe, expect, it } from 'vitest';
import { taxCalc } from './taxcalc.js';

const values = (r) => r.lines.map((l) => l.value);

describe('เครื่องคิดเลขภาษี (ผลต้องเท่าหน้าเดิม)', () => {
  it('ยอดจ่ายตามจริง: ค่าบริการ 10,000 จด VAT หัก 3%', () => {
    expect(values(taxCalc('combo', 10000, 3, true))).toEqual([10000, 700, 10700, -300, 10400]);
  });
  it('ยอดจ่ายตามจริง ไม่จด VAT', () => {
    expect(values(taxCalc('combo', 10000, 3, false))).toEqual([10000, -300, 9700]);
  });
  it('บวก VAT และถอด VAT', () => {
    expect(values(taxCalc('vatadd', 1000))).toEqual([1000, 70, 1070]);
    expect(values(taxCalc('vatout', 1070))).toEqual([1000, 70, 1070]);
  });
  it('หัก ณ ที่จ่าย 5%', () => {
    expect(values(taxCalc('wht', 20000, 5))).toEqual([20000, -1000, 19000]);
  });
  it('คิดย้อนจากยอดสุทธิ: อยากได้ 10,400 จด VAT หัก 3% ต้องตั้งราคา 10,000', () => {
    const r = taxCalc('gross', 10400, 3, true);
    expect(r.lines[0].value).toBe(10000);
    expect(r.lines.at(-1).value).toBe(10400);
  });
  it('ยังไม่กรอกจำนวนเงิน ไม่มีผลลัพธ์', () => {
    expect(taxCalc('combo', '', 3, true).lines).toEqual([]);
  });
});
