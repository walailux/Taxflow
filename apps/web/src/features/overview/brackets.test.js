import { describe, expect, it } from 'vitest';
import { bracketInfo, grossForNet, netFromGross } from './brackets.js';

describe('มาตรวัดขั้นบันไดภาษี', () => {
  it('เงินได้สุทธิหลังหักค่าใช้จ่าย 50% (ไม่เกิน 100,000) และลดหย่อน 60,000', () => {
    expect(netFromGross(100000)).toBe(0);
    expect(netFromGross(400000)).toBe(240000);
  });
  it('หารายได้ก่อนหักที่ทำให้ถึงเพดานขั้นได้', () => {
    expect(Math.round(grossForNet(150000))).toBe(310000);
  });
  it('รายได้ 400,000 อยู่ขั้น 5% รับงานเพิ่มได้อีกราว 60,000 ก่อนขึ้น 10%', () => {
    const b = bracketInfo({ grossIncome: 400000, estimate: { netIncome: 240000 } });
    expect(b.rate).toBe(5);
    expect(b.nextRate).toBe(10);
    expect(Math.round(b.headroom)).toBe(60000);
    expect(b.segments.map((s) => s.state)).toEqual(['past', 'on', 'future', 'future', 'future']);
  });
  it('ยังไม่มีรายได้ อยู่ขั้น 0%', () => {
    const b = bracketInfo({ grossIncome: 0, estimate: { netIncome: 0 } });
    expect(b.rate).toBe(0);
  });
});
