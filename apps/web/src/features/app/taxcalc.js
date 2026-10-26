/**
 * taxcalc.js สูตรเครื่องคิดเลขภาษี (ย้ายจาก ux.js ของหน้าเดิม ผลลัพธ์ต้องเท่าเดิมทุกกรณี)
 * คืนรายการบรรทัด [{ label, value, total?, minus? }] และคำแนะนำ tip
 */
export const CALC_MODES = [
  { id: 'combo', label: 'ยอดจ่ายตามจริง (VAT + หัก ณ ที่จ่าย)', amountLabel: 'ราคาค่าบริการ (ก่อน VAT)', rate: true, vat: true },
  { id: 'vatadd', label: 'บวก VAT', amountLabel: 'ราคาก่อน VAT' },
  { id: 'vatout', label: 'ถอด VAT จากยอดรวม', amountLabel: 'ยอดรวมที่รวม VAT แล้ว' },
  { id: 'wht', label: 'หัก ณ ที่จ่าย', amountLabel: 'ยอดเงินก่อนหัก', rate: true },
  { id: 'gross', label: 'อยากได้สุทธิเท่านี้ ต้องตั้งราคาเท่าไร', amountLabel: 'ยอดที่อยากได้รับจริง (หลังหักภาษี)', rate: true, vat: true },
];

export const WHT_RATES = [
  { value: 1, label: '1% ค่าขนส่ง' },
  { value: 2, label: '2% ค่าโฆษณา' },
  { value: 3, label: '3% ค่าบริการ/ค่าจ้าง' },
  { value: 5, label: '5% ค่าเช่า/รางวัล' },
];

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function taxCalc(mode, amount, rate = 3, vatOn = true) {
  const amt = Number(amount) || 0;
  if (!amt) return { lines: [], tip: '' };
  const line = (label, value, extra = {}) => ({ label, value, ...extra });

  if (mode === 'vatadd') {
    const vat = r2(amt * 0.07);
    return { lines: [line('ราคาก่อน VAT', amt), line('VAT 7%', vat), line('ยอดรวม', r2(amt + vat), { total: true })], tip: '' };
  }
  if (mode === 'vatout') {
    const base = r2((amt * 100) / 107);
    const vat = r2(amt - base);
    return { lines: [line('ราคาก่อน VAT', base), line('VAT 7% ที่อยู่ในยอด', vat), line('ยอดรวม', amt, { total: true })], tip: '' };
  }
  if (mode === 'wht') {
    const w = r2((amt * rate) / 100);
    return { lines: [line('ยอดก่อนหัก', amt), line(`หัก ณ ที่จ่าย ${rate}%`, -w, { minus: true }), line('ยอดสุทธิที่ได้รับ', r2(amt - w), { total: true })], tip: '' };
  }
  if (mode === 'gross') {
    // สุทธิ = ฐาน × (1 + vat − rate) → ฐาน = สุทธิ ÷ (1 + vat − rate)
    const factor = 1 + (vatOn ? 0.07 : 0) - rate / 100;
    const base = r2(amt / factor);
    const vat = vatOn ? r2(base * 0.07) : 0;
    const w = r2((base * rate) / 100);
    return {
      lines: [
        line('ตั้งราคาค่าบริการ (ก่อน VAT)', base, { total: true }),
        ...(vatOn ? [line('VAT 7%', vat)] : []),
        line(`ถูกหัก ณ ที่จ่าย ${rate}%`, -w, { minus: true }),
        line('ได้รับจริง', r2(base + vat - w)),
      ],
      tip: 'ใช้ตอนเสนอราคา: ลูกค้าจะหักภาษีไว้ แต่คุณยังได้รับเงินตามที่ต้องการ (ต่างกันไม่เกินหลักสตางค์จากการปัดเศษ)',
    };
  }
  // combo
  const vat = vatOn ? r2(amt * 0.07) : 0;
  const w = r2((amt * rate) / 100);
  return {
    lines: [
      line('ค่าบริการ (ฐานภาษี)', amt),
      ...(vatOn ? [line('VAT 7%', vat), line('ยอดตามใบกำกับภาษี', r2(amt + vat))] : []),
      line(`หัก ณ ที่จ่าย ${rate}% (คิดจากฐานก่อน VAT)`, -w, { minus: true }),
      line('ยอดจ่ายตามจริง', r2(amt + vat - w), { total: true }),
    ],
    tip: 'ข้อผิดพลาดที่พบบ่อย: คิดหัก ณ ที่จ่ายจากยอดรวม VAT ที่ถูกต้องคือคิดจากค่าบริการก่อน VAT เท่านั้น',
  };
}
