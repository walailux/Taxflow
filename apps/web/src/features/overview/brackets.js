/**
 * brackets.js ขั้นบันไดภาษีเงินได้บุคคลธรรมดา สำหรับมาตรวัดของครีเอเตอร์ (ย้ายจาก ux.js)
 * ต้องตรงกับ PIT_BRACKETS ใน packages/shared/tax.js และค่าหักเหมา 40(2) 50% ไม่เกิน 100,000 + ลดหย่อนส่วนตัว 60,000
 */
export const BRACKETS = [[150000, 0], [300000, 5], [500000, 10], [750000, 15], [1000000, 20], [2000000, 25], [5000000, 30], [Infinity, 35]];
export const SCALE_MAX = 1000000;

export const netFromGross = (g) => Math.max(0, g - Math.min(g * 0.5, 100000) - 60000);

/** รายได้ก่อนหักที่ทำให้เงินได้สุทธิถึงเป้า (ฟังก์ชันเพิ่มขึ้นทางเดียว ใช้ binary search ได้) */
export function grossForNet(target) {
  let lo = 0;
  let hi = target * 2 + 200000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (netFromGross(mid) >= target) hi = mid; else lo = mid;
  }
  return hi;
}

/** ข้อมูลมาตรวัดจากผลสรุปของครีเอเตอร์ (/api/creator/summary) */
export function bracketInfo(summary) {
  const net = Number(summary.estimate && summary.estimate.netIncome) || 0;
  const gross = Number(summary.grossIncome) || 0;
  const idx = BRACKETS.findIndex(([cap]) => net <= cap);
  const [cap, rate] = BRACKETS[idx];
  const nextRate = BRACKETS[idx + 1] ? BRACKETS[idx + 1][1] : null;
  const headroom = cap === Infinity ? null : Math.max(0, grossForNet(cap) - gross);
  let prev = 0;
  const segments = BRACKETS.slice(0, 5).map(([c, r], i) => {
    const seg = { rate: r, from: prev, to: c, state: i === idx ? 'on' : i < idx ? 'past' : 'future' };
    prev = c;
    return seg;
  });
  return { net, gross, idx, rate, nextRate, headroom, segments };
}

export const pct = (v) => Math.min(100, (v / SCALE_MAX) * 100);
