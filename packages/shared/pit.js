'use strict';
/**
 * pit.js คำนวณภาษีเงินได้บุคคลธรรมดา (ภ.ง.ด.90/91) ตามประมวลรัษฎากร
 * --------------------------------------------------------------------
 * ลำดับเดียวกับแบบ ภ.ง.ด.90:
 *   1) เงินได้พึงประเมินแยกตามมาตรา 40(1)-(8)
 *   2) หักค่าใช้จ่าย (แบบเหมาตามอัตราที่กฎหมายกำหนด หรือตามจริงสำหรับ 40(5)-(8))
 *   3) หักค่าลดหย่อน (ตามเพดานของแต่ละรายการ และเพดานรวมกลุ่มเงินออมเพื่อการเกษียณ 500,000 บาท)
 *   4) หักเงินบริจาค (ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อน)
 *   5) เงินได้สุทธิ × อัตราภาษีขั้นบันได (วิธีที่ 1)
 *   6) วิธีที่ 2: เงินได้พึงประเมินที่ไม่ใช่ 40(1) รวมตั้งแต่ 120,000 บาท × 0.5% (ถ้าไม่เกิน 5,000 บาทได้รับยกเว้น)
 *   7) ภาษีที่ต้องชำระ = วิธีที่ได้ภาษีมากกว่า แล้วหักภาษีที่ถูกหัก ณ ที่จ่ายไว้แล้ว
 *
 * เพดานที่เปลี่ยนตามปีภาษีอยู่ใน RULES (ปี ค.ศ.) แก้ที่นี่ที่เดียวเมื่อกฎหมายเปลี่ยน
 * ผลลัพธ์ถูกต้องตามข้อมูลที่ป้อน ผู้ใช้ต้องกรอกเงินได้และค่าลดหย่อนให้ครบตามจริงเอง
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const int = (v) => Math.max(0, Math.floor(num(v)));

/** อัตราภาษีขั้นบันได (มาตรา 48(1)) */
const BRACKETS = [
  { upTo: 150000, rate: 0 },
  { upTo: 300000, rate: 5 },
  { upTo: 500000, rate: 10 },
  { upTo: 750000, rate: 15 },
  { upTo: 1000000, rate: 20 },
  { upTo: 2000000, rate: 25 },
  { upTo: 5000000, rate: 30 },
  { upTo: Infinity, rate: 35 },
];

/**
 * เพดานที่ต่างกันตามปีภาษี (คีย์เป็นปี ค.ศ.)
 * - ประกันสังคม: ปี 2569 เพดานค่าจ้างเพิ่มเป็น 17,500 บาท/เดือน (5% x 12 = 10,500)
 * - Easy E-Receipt 2.0: เฉพาะปีภาษี 2568 (ซื้อสินค้า/บริการ 16 ม.ค. - 28 ก.พ. 2568)
 * - Solar Rooftop: เริ่มปีภาษี 2569
 * - Thai ESG / Thai ESGX: 30% ของเงินได้ ไม่เกิน 300,000 บาท
 */
const RULES = {
  2025: { label: '2568', socialSecurityMax: 9000, easyEReceiptMax: 50000, solarMax: 0, thaiEsgMax: 300000 },
  2026: { label: '2569', socialSecurityMax: 10500, easyEReceiptMax: 0, solarMax: 200000, thaiEsgMax: 300000 },
};
const SUPPORTED_YEARS = Object.keys(RULES).map(Number);
const LATEST_YEAR = Math.max(...SUPPORTED_YEARS);
const rulesFor = (year) => RULES[year] || RULES[LATEST_YEAR];

/** ประเภทเงินได้ตามมาตรา 40 และวิธีหักค่าใช้จ่ายแบบเหมา */
const INCOME_TYPES = [
  { key: '40(1)', label: 'เงินเดือน ค่าจ้าง โบนัส', law: 'มาตรา 40(1)', note: 'หักเหมา 50% รวมกับ 40(2) ไม่เกิน 100,000 บาท' },
  { key: '40(2)', label: 'ค่าธรรมเนียม ค่านายหน้า ค่าจ้างจากหน้าที่/งานที่ทำ', law: 'มาตรา 40(2)', note: 'หักเหมา 50% รวมกับ 40(1) ไม่เกิน 100,000 บาท' },
  { key: '40(3)', label: 'ค่าแห่งลิขสิทธิ์ ค่าสิทธิ', law: 'มาตรา 40(3)', note: 'ค่าลิขสิทธิ์หักเหมา 50% ไม่เกิน 100,000 บาท' },
  { key: '40(4)', label: 'ดอกเบี้ย เงินปันผล', law: 'มาตรา 40(4)', note: 'หักค่าใช้จ่ายไม่ได้' },
  { key: '40(5)', label: 'ค่าเช่าทรัพย์สิน', law: 'มาตรา 40(5)', note: 'หักเหมาตามชนิดทรัพย์สิน หรือตามจริง', kinds: [
    { key: 'building', label: 'บ้าน โรงเรือน สิ่งปลูกสร้าง', rate: 30 },
    { key: 'farm', label: 'ที่ดินที่ใช้ในการเกษตร', rate: 20 },
    { key: 'land', label: 'ที่ดินที่มิได้ใช้ในการเกษตร', rate: 15 },
    { key: 'vehicle', label: 'ยานพาหนะ', rate: 30 },
    { key: 'other', label: 'ทรัพย์สินอื่น', rate: 10 },
  ] },
  { key: '40(6)', label: 'วิชาชีพอิสระ', law: 'มาตรา 40(6)', note: 'หักเหมาตามวิชาชีพ หรือตามจริง', kinds: [
    { key: 'medical', label: 'การประกอบโรคศิลปะ', rate: 60 },
    { key: 'other', label: 'กฎหมาย วิศวกรรม สถาปัตยกรรม บัญชี ประณีตศิลปกรรม', rate: 30 },
  ] },
  { key: '40(7)', label: 'รับเหมาที่ผู้รับเหมาลงทุนจัดหาสัมภาระ', law: 'มาตรา 40(7)', note: 'หักเหมา 60% หรือตามจริง', rate: 60 },
  { key: '40(8)', label: 'ธุรกิจ การพาณิชย์ และเงินได้อื่น', law: 'มาตรา 40(8)', note: 'หักเหมา 60% หรือตามจริง', rate: 60 },
];
const TYPE_KEYS = INCOME_TYPES.map((t) => t.key);
const ACTUAL_ALLOWED = ['40(5)', '40(6)', '40(7)', '40(8)'];

/** รายการค่าลดหย่อนที่รองรับ (ใช้สร้างฟอร์มในหน้าเว็บ) */
const DEDUCTION_FIELDS = [
  { group: 'family', key: 'spouse', label: 'คู่สมรสที่ไม่มีเงินได้', kind: 'bool', each: 60000 },
  { group: 'family', key: 'children', label: 'บุตร (คนละ 30,000 บาท)', kind: 'count', each: 30000 },
  { group: 'family', key: 'children2018', label: 'บุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 (คนละ 60,000 บาท)', kind: 'count', each: 60000 },
  { group: 'family', key: 'parents', label: 'บิดามารดาอายุ 60 ปีขึ้นไป เงินได้ไม่เกิน 30,000 บาท (คนละ 30,000 บาท สูงสุด 4 คน)', kind: 'count', each: 30000, maxCount: 4 },
  { group: 'family', key: 'disabled', label: 'ผู้พิการหรือทุพพลภาพในความอุปการะ (คนละ 60,000 บาท)', kind: 'count', each: 60000 },
  { group: 'family', key: 'pregnancy', label: 'ค่าฝากครรภ์และคลอดบุตร (ไม่เกิน 60,000 บาท)', kind: 'amount', max: 60000 },
  { group: 'insurance', key: 'socialSecurity', label: 'เงินสมทบประกันสังคม', kind: 'amount' },
  { group: 'insurance', key: 'lifeInsurance', label: 'เบี้ยประกันชีวิต (ไม่เกิน 100,000 บาท)', kind: 'amount', max: 100000 },
  { group: 'insurance', key: 'healthInsurance', label: 'เบี้ยประกันสุขภาพตนเอง (ไม่เกิน 25,000 บาท รวมประกันชีวิตไม่เกิน 100,000 บาท)', kind: 'amount', max: 25000 },
  { group: 'insurance', key: 'parentsHealth', label: 'เบี้ยประกันสุขภาพบิดามารดา (ไม่เกิน 15,000 บาท)', kind: 'amount', max: 15000 },
  { group: 'retirement', key: 'pensionInsurance', label: 'เบี้ยประกันชีวิตแบบบำนาญ (15% ของเงินได้ ไม่เกิน 200,000 บาท)', kind: 'amount' },
  { group: 'retirement', key: 'pvd', label: 'กองทุนสำรองเลี้ยงชีพ (15% ของค่าจ้าง ไม่เกิน 500,000 บาท)', kind: 'amount' },
  { group: 'retirement', key: 'gpf', label: 'กองทุนบำเหน็จบำนาญข้าราชการ กบข. (30% ของเงินได้ ไม่เกิน 500,000 บาท)', kind: 'amount' },
  { group: 'retirement', key: 'rmf', label: 'กองทุนรวมเพื่อการเลี้ยงชีพ RMF (30% ของเงินได้ ไม่เกิน 500,000 บาท)', kind: 'amount' },
  { group: 'retirement', key: 'nsf', label: 'กองทุนการออมแห่งชาติ กอช. (ไม่เกิน 30,000 บาท)', kind: 'amount', max: 30000 },
  { group: 'invest', key: 'thaiEsg', label: 'กองทุน Thai ESG / Thai ESGX (30% ของเงินได้ ไม่เกิน 300,000 บาท)', kind: 'amount' },
  { group: 'other', key: 'homeLoan', label: 'ดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย (ไม่เกิน 100,000 บาท)', kind: 'amount', max: 100000 },
  { group: 'other', key: 'solar', label: 'ติดตั้ง Solar Rooftop (ปีภาษี 2569 ไม่เกิน 200,000 บาท)', kind: 'amount', year: 2026 },
  { group: 'other', key: 'easyEReceipt', label: 'Easy E-Receipt 2.0 (ปีภาษี 2568 ไม่เกิน 50,000 บาท)', kind: 'amount', year: 2025 },
  { group: 'other', key: 'otherDeduction', label: 'ค่าลดหย่อนอื่นตามกฎหมาย (ระบุยอดที่มีสิทธิ์)', kind: 'amount' },
  { group: 'donation', key: 'donationDouble', label: 'เงินบริจาคที่หักได้ 2 เท่า (การศึกษา กีฬา โรงพยาบาลรัฐ ฯลฯ)', kind: 'amount' },
  { group: 'donation', key: 'donationGeneral', label: 'เงินบริจาคทั่วไป', kind: 'amount' },
  { group: 'donation', key: 'politicalDonation', label: 'เงินบริจาคพรรคการเมือง (ไม่เกิน 10,000 บาท)', kind: 'amount', max: 10000 },
];

function progressiveTax(netIncome) {
  let remaining = Math.max(0, netIncome);
  let prev = 0;
  let total = 0;
  const steps = [];
  for (const b of BRACKETS) {
    const span = b.upTo - prev;
    const taxable = Math.min(remaining, span);
    const tax = round2((taxable * b.rate) / 100);
    steps.push({ from: prev, to: b.upTo, rate: b.rate, taxable: round2(taxable), tax });
    total += tax;
    remaining -= taxable;
    prev = b.upTo;
    if (remaining <= 0) break;
  }
  return { total: round2(total), steps };
}

/** อ่านค่าเงินได้ของแต่ละประเภท: รับได้ทั้งตัวเลขตรง ๆ หรือ { amount, kind, actual } */
function readIncome(raw) {
  if (raw && typeof raw === 'object') return { amount: num(raw.amount), kind: raw.kind || '', actual: raw.actual === '' || raw.actual == null ? null : num(raw.actual) };
  return { amount: num(raw), kind: '', actual: null };
}

/**
 * input = {
 *   year: 2026,
 *   incomes: { '40(2)': 480000, '40(5)': { amount, kind: 'building', actual: null }, ... },
 *   deductions: { spouse: true, children: 1, lifeInsurance: 20000, ... },
 *   withholdingPaid: 14400,
 * }
 */
function calculate(input = {}) {
  const year = SUPPORTED_YEARS.includes(Number(input.year)) ? Number(input.year) : LATEST_YEAR;
  const R = rulesFor(year);
  const D = input.deductions || {};

  /* ---------- 1-2) เงินได้และค่าใช้จ่าย ---------- */
  const incomes = [];
  const raw = input.incomes || {};
  let employmentExpenseLeft = 100000; // 40(1)+40(2) ใช้เพดานร่วมกัน
  for (const t of INCOME_TYPES) {
    const r = readIncome(raw[t.key]);
    if (!r.amount) continue;
    let expense = 0;
    let method = '';
    if (t.key === '40(1)' || t.key === '40(2)') {
      expense = Math.min(r.amount * 0.5, employmentExpenseLeft);
      employmentExpenseLeft -= expense;
      method = 'เหมา 50% (รวม 40(1)+40(2) ไม่เกิน 100,000)';
    } else if (t.key === '40(3)') {
      expense = Math.min(r.amount * 0.5, 100000);
      method = 'เหมา 50% ไม่เกิน 100,000';
    } else if (t.key === '40(4)') {
      expense = 0;
      method = 'หักค่าใช้จ่ายไม่ได้';
    } else if (ACTUAL_ALLOWED.includes(t.key) && r.actual != null) {
      expense = Math.min(r.actual, r.amount);
      method = 'ตามจริง';
    } else {
      const kind = t.kinds ? (t.kinds.find((k) => k.key === r.kind) || t.kinds[0]) : null;
      const rate = kind ? kind.rate : t.rate;
      expense = (r.amount * rate) / 100;
      method = `เหมา ${rate}%${kind ? ` (${kind.label})` : ''}`;
    }
    incomes.push({ type: t.key, label: t.label, law: t.law, amount: round2(r.amount), expense: round2(expense), method, net: round2(r.amount - expense) });
  }
  const assessable = round2(incomes.reduce((s, i) => s + i.amount, 0));
  const totalExpense = round2(incomes.reduce((s, i) => s + i.expense, 0));
  const afterExpense = round2(assessable - totalExpense);
  const wages = num((incomes.find((i) => i.type === '40(1)') || {}).amount);

  /* ---------- 3) ค่าลดหย่อน ---------- */
  const allowances = [];
  const add = (key, label, claimed, allowed, note) => {
    const a = round2(Math.max(0, allowed));
    if (!claimed && !a) return 0;
    allowances.push({ key, label, claimed: round2(claimed), allowed: a, capped: round2(claimed) > a, note: note || '' });
    return a;
  };
  add('personal', 'ผู้มีเงินได้', 60000, 60000);
  if (D.spouse) add('spouse', 'คู่สมรสที่ไม่มีเงินได้', 60000, 60000);
  if (int(D.children)) add('children', `บุตร ${int(D.children)} คน`, int(D.children) * 30000, int(D.children) * 30000);
  if (int(D.children2018)) add('children2018', `บุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 ${int(D.children2018)} คน`, int(D.children2018) * 60000, int(D.children2018) * 60000);
  if (int(D.parents)) add('parents', `บิดามารดา ${Math.min(4, int(D.parents))} คน`, int(D.parents) * 30000, Math.min(4, int(D.parents)) * 30000, int(D.parents) > 4 ? 'สูงสุด 4 คน' : '');
  if (int(D.disabled)) add('disabled', `ผู้พิการ/ทุพพลภาพ ${int(D.disabled)} คน`, int(D.disabled) * 60000, int(D.disabled) * 60000);
  add('pregnancy', 'ค่าฝากครรภ์และคลอดบุตร', num(D.pregnancy), Math.min(num(D.pregnancy), 60000), 'ไม่เกิน 60,000');
  add('socialSecurity', 'เงินสมทบประกันสังคม', num(D.socialSecurity), Math.min(num(D.socialSecurity), R.socialSecurityMax), `ไม่เกิน ${R.socialSecurityMax.toLocaleString('en-US')} (ปีภาษี ${R.label})`);

  const life = Math.min(num(D.lifeInsurance), 100000);
  const health = Math.min(num(D.healthInsurance), 25000, 100000 - life);
  add('lifeInsurance', 'เบี้ยประกันชีวิต', num(D.lifeInsurance), life, 'ไม่เกิน 100,000');
  add('healthInsurance', 'เบี้ยประกันสุขภาพตนเอง', num(D.healthInsurance), health, 'ไม่เกิน 25,000 และรวมประกันชีวิตไม่เกิน 100,000');
  add('parentsHealth', 'เบี้ยประกันสุขภาพบิดามารดา', num(D.parentsHealth), Math.min(num(D.parentsHealth), 15000), 'ไม่เกิน 15,000');

  // กลุ่มเงินออมเพื่อการเกษียณ รวมกันไม่เกิน 500,000 บาท (เรียงตามลำดับในแบบ ภ.ง.ด.90)
  let retireLeft = 500000;
  const retire = (key, label, claimed, own, note) => {
    const a = Math.min(own, retireLeft);
    retireLeft -= a;
    return add(key, label, claimed, a, a < own ? `${note} · เกินเพดานรวมกลุ่มเกษียณ 500,000` : note);
  };
  retire('pensionInsurance', 'เบี้ยประกันชีวิตแบบบำนาญ', num(D.pensionInsurance), Math.min(num(D.pensionInsurance), assessable * 0.15, 200000), '15% ของเงินได้ ไม่เกิน 200,000');
  retire('pvd', 'กองทุนสำรองเลี้ยงชีพ', num(D.pvd), Math.min(num(D.pvd), wages * 0.15, 500000), '15% ของค่าจ้าง ไม่เกิน 500,000');
  retire('gpf', 'กองทุน กบข.', num(D.gpf), Math.min(num(D.gpf), assessable * 0.3, 500000), '30% ของเงินได้ ไม่เกิน 500,000');
  retire('rmf', 'กองทุน RMF', num(D.rmf), Math.min(num(D.rmf), assessable * 0.3, 500000), '30% ของเงินได้ ไม่เกิน 500,000');
  retire('nsf', 'กองทุนการออมแห่งชาติ (กอช.)', num(D.nsf), Math.min(num(D.nsf), 30000), 'ไม่เกิน 30,000');

  add('thaiEsg', 'กองทุน Thai ESG / Thai ESGX', num(D.thaiEsg), Math.min(num(D.thaiEsg), assessable * 0.3, R.thaiEsgMax), `30% ของเงินได้ ไม่เกิน ${R.thaiEsgMax.toLocaleString('en-US')}`);
  add('homeLoan', 'ดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย', num(D.homeLoan), Math.min(num(D.homeLoan), 100000), 'ไม่เกิน 100,000');
  add('solar', 'ติดตั้ง Solar Rooftop', num(D.solar), Math.min(num(D.solar), R.solarMax), R.solarMax ? `ไม่เกิน ${R.solarMax.toLocaleString('en-US')}` : `ไม่มีสิทธิ์ในปีภาษี ${R.label}`);
  add('easyEReceipt', 'Easy E-Receipt', num(D.easyEReceipt), Math.min(num(D.easyEReceipt), R.easyEReceiptMax), R.easyEReceiptMax ? `ไม่เกิน ${R.easyEReceiptMax.toLocaleString('en-US')}` : `ไม่มีสิทธิ์ในปีภาษี ${R.label}`);
  add('otherDeduction', 'ค่าลดหย่อนอื่น', num(D.otherDeduction), num(D.otherDeduction));

  const totalAllowance = round2(allowances.reduce((s, a) => s + a.allowed, 0));
  const beforeDonation = round2(Math.max(0, afterExpense - totalAllowance));

  /* ---------- 4) เงินบริจาค (ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อน) ---------- */
  const donationCap = round2(beforeDonation * 0.1);
  const doubleAllowed = Math.min(num(D.donationDouble) * 2, donationCap);
  const generalAllowed = Math.min(num(D.donationGeneral), donationCap - doubleAllowed);
  const politicalAllowed = Math.min(num(D.politicalDonation), 10000);
  const donations = [];
  if (num(D.donationDouble)) donations.push({ key: 'donationDouble', label: 'เงินบริจาคที่หักได้ 2 เท่า', claimed: round2(num(D.donationDouble)), allowed: round2(doubleAllowed), capped: num(D.donationDouble) * 2 > doubleAllowed, note: 'หัก 2 เท่าของที่จ่ายจริง รวมไม่เกิน 10%' });
  if (num(D.donationGeneral)) donations.push({ key: 'donationGeneral', label: 'เงินบริจาคทั่วไป', claimed: round2(num(D.donationGeneral)), allowed: round2(generalAllowed), capped: num(D.donationGeneral) > generalAllowed, note: 'รวมกับเงินบริจาค 2 เท่าไม่เกิน 10%' });
  if (num(D.politicalDonation)) donations.push({ key: 'politicalDonation', label: 'เงินบริจาคพรรคการเมือง', claimed: round2(num(D.politicalDonation)), allowed: round2(politicalAllowed), capped: num(D.politicalDonation) > politicalAllowed, note: 'ไม่เกิน 10,000' });
  const totalDonation = round2(doubleAllowed + generalAllowed + politicalAllowed);

  /* ---------- 5) วิธีที่ 1: เงินได้สุทธิ x อัตราก้าวหน้า ---------- */
  const netIncome = round2(Math.max(0, beforeDonation - totalDonation));
  const m1 = progressiveTax(netIncome);

  /* ---------- 6) วิธีที่ 2: 0.5% ของเงินได้พึงประเมินที่ไม่ใช่ 40(1) ---------- */
  const nonWage = round2(assessable - wages);
  let m2 = 0;
  let m2Note = '';
  if (nonWage >= 120000) {
    const raw2 = round2(nonWage * 0.005);
    if (raw2 <= 5000) { m2 = 0; m2Note = `คำนวณได้ ${raw2.toLocaleString('en-US')} บาท ไม่เกิน 5,000 บาท จึงได้รับยกเว้น`; }
    else { m2 = raw2; m2Note = 'เงินได้ที่ไม่ใช่ 40(1) x 0.5%'; }
  } else {
    m2Note = 'เงินได้ที่ไม่ใช่ 40(1) ต่ำกว่า 120,000 บาท ไม่ต้องคำนวณวิธีนี้';
  }

  /* ---------- 7) ภาษีที่ต้องชำระ ---------- */
  const tax = round2(Math.max(m1.total, m2));
  const withholdingPaid = round2(num(input.withholdingPaid));
  const balance = round2(tax - withholdingPaid);

  return {
    year, yearLabel: R.label,
    incomes, assessable, totalExpense, afterExpense,
    allowances, totalAllowance,
    donations, donationCap, totalDonation,
    netIncome,
    method1: { tax: m1.total, steps: m1.steps },
    method2: { base: nonWage, tax: m2, note: m2Note },
    usedMethod: m2 > m1.total ? 2 : 1,
    tax,
    effectiveRate: assessable > 0 ? round2((tax / assessable) * 100) : 0,
    withholdingPaid,
    balance, // บวก = ต้องชำระเพิ่ม · ลบ = ได้รับคืน
  };
}

module.exports = { calculate, progressiveTax, BRACKETS, RULES, SUPPORTED_YEARS, LATEST_YEAR, INCOME_TYPES, DEDUCTION_FIELDS, ACTUAL_ALLOWED };
