/**
 * TaxPage.jsx คำนวณภาษีเงินได้บุคคลธรรมดา (ภ.ง.ด.90/91) ตามประมวลรัษฎากร
 * - โหมด "จากเอกสารในระบบ": ดึงเงินได้และภาษีที่ถูกหักไว้จาก 50 ทวิ ที่บันทึก + เอกสารรายได้ที่ออกเอง (/api/pit/from-documents)
 *   เลือกนับ/ไม่นับเอกสารแต่ละฉบับได้ และเพิ่มเงินได้อื่นที่ไม่มีในระบบได้
 * - โหมด "กรอกเอง": กรอกเงินได้ทุกประเภทตามมาตรา 40 เอง
 * คำนวณทันทีขณะกรอกด้วย packages/shared/pit.js (สูตรเดียวกับ API /api/pit/calculate)
 * แสดงทุกขั้นตอนเหมือนแบบ ภ.ง.ด.90: เงินได้ -> ค่าใช้จ่าย -> ค่าลดหย่อน -> เงินบริจาค -> เงินได้สุทธิ -> ภาษี 2 วิธี
 * ข้อมูลที่กรอกจำไว้ในเครื่องนี้ (localStorage) กลับมาแล้วไม่ต้องกรอกใหม่
 */
import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { DOC_LABEL, thDate, thb } from '../lib/format.js';
import { pit } from '../lib/shared.js';
import Icon from '../components/Icon.jsx';
import { PageHeader, Skeleton, Spinner, cx } from '../components/ui.jsx';
import ViewLink from '../features/app/ViewLink.jsx';

const STORE_KEY = 'tf_pit_v1';
const PRIMARY_TYPES = ['40(1)', '40(2)', '40(8)'];
const GROUPS = [
  { key: 'family', label: 'ครอบครัว' },
  { key: 'insurance', label: 'ประกันสังคมและประกัน' },
  { key: 'retirement', label: 'เงินออมเพื่อการเกษียณ (รวมกันไม่เกิน 500,000 บาท)' },
  { key: 'invest', label: 'การลงทุน' },
  { key: 'other', label: 'ค่าลดหย่อนอื่น' },
  { key: 'donation', label: 'เงินบริจาค' },
];
const thisYear = () => Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 4));
const defaultYear = () => (pit.SUPPORTED_YEARS.includes(thisYear()) ? thisYear() : pit.LATEST_YEAR);
const toNum = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };
const be = (y) => y + 543;

function readSaved(uid) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return all[uid] || null;
  } catch { return null; }
}
function writeSaved(uid, data) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    all[uid] = data;
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch { /* ไม่จำก็ได้ */ }
}

/* ---------- ช่องกรอกตัวเลข ---------- */
function MoneyInput({ id, value, onChange, placeholder = '0', className, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <input
        id={id}
        inputMode="decimal"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className="tf-input !pr-12 text-right tabular-nums"
        {...rest}
      />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.875rem] text-ink-soft">บาท</span>
    </div>
  );
}

function Seg({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-tile p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[0.90625rem] font-medium transition-all',
            value === o.value ? 'bg-white text-ink shadow-[0_2px_8px_-3px_rgba(24,24,27,0.3)]' : 'text-[#78716C] hover:text-ink')}
        >
          {o.icon && <Icon name={o.icon} className="size-4" />}{o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ step, title, sub, children, right }) {
  return (
    <section className="tf-fade-up rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-ink font-display text-[0.9375rem] font-semibold text-white">{step}</span>
          <div>
            <h2 className="text-[1.125rem] font-semibold leading-tight">{title}</h2>
            {sub && <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-soft">{sub}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ---------- แถวกรอกเงินได้หนึ่งประเภท ---------- */
function IncomeRow({ t, v, onChange, docAmount }) {
  const set = (k, val) => onChange({ ...v, [k]: val });
  const canActual = pit.ACTUAL_ALLOWED.includes(t.key);
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="flex flex-wrap items-center gap-2 text-[0.96875rem] font-medium">
            <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[0.78125rem] font-semibold text-white">{t.key}</span>{t.label}
          </b>
          <small className="mt-0.5 block text-[0.8125rem] text-ink-soft">{t.note}</small>
        </div>
        {docAmount > 0 && <span className="rounded-full bg-orange-pale px-2.5 py-1 text-[0.8125rem] font-medium text-orange-deep">จากเอกสาร {thb(docAmount)}</span>}
      </div>
      <div className={cx('mt-3 grid gap-3', (t.kinds || canActual) && 'sm:grid-cols-2')}>
        <label className="block">
          <span className="mb-1 block text-[0.84375rem] text-ink-soft">{docAmount > 0 ? 'เงินได้เพิ่มเติมที่ไม่มีในระบบ' : 'เงินได้ทั้งปี'}</span>
          <MoneyInput value={v.amount} onChange={(x) => set('amount', x)} />
        </label>
        {t.kinds && (
          <label className="block">
            <span className="mb-1 block text-[0.84375rem] text-ink-soft">ชนิด (อัตราหักค่าใช้จ่ายเหมา)</span>
            <select value={v.kind || t.kinds[0].key} onChange={(e) => set('kind', e.target.value)} className="tf-input">
              {t.kinds.map((k) => <option key={k.key} value={k.key}>{k.label} · {k.rate}%</option>)}
            </select>
          </label>
        )}
        {canActual && (
          <label className="block">
            <span className="mb-1 block text-[0.84375rem] text-ink-soft">ค่าใช้จ่ายตามจริง (เว้นว่าง = หักเหมา)</span>
            <MoneyInput value={v.actual} onChange={(x) => set('actual', x)} placeholder="หักเหมา" />
          </label>
        )}
      </div>
    </div>
  );
}

/* ---------- แถวผลลัพธ์ ---------- */
function Line({ label, value, sub, minus, strong, tone }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 py-1.5', strong && 'py-2')}>
      <span className={cx('min-w-0', strong ? 'text-[0.96875rem] font-semibold' : 'text-[0.90625rem] text-[#57534E]')}>
        {label}{sub && <small className="block text-[0.78125rem] font-normal text-ink-soft">{sub}</small>}
      </span>
      <b className={cx('shrink-0 font-mono tabular-nums', strong ? 'text-[1.03125rem] font-semibold' : 'text-[0.90625rem] font-medium', tone)}>
        {minus && value > 0 ? '-' : ''}{thb(value)}
      </b>
    </div>
  );
}

function ResultCard({ r, mode, docsLoading }) {
  const [open, setOpen] = useState({ exp: false, allow: true, steps: false });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const refund = r.balance < 0;
  return (
    <section className="tf-fade-up overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(24,24,27,0.03)]">
      <div className="relative overflow-hidden bg-gradient-to-br from-orange to-[#D9480F] p-5 text-white sm:p-6">
        <span className="tf-dots-light" aria-hidden="true" />
        <p className="relative text-[0.875rem] text-white/85">ภาษีเงินได้บุคคลธรรมดา ปีภาษี {r.yearLabel}</p>
        <b className="relative mt-1 block font-display text-[2.125rem] font-semibold leading-tight tracking-tight">{docsLoading && mode === 'docs' ? '...' : thb(r.tax)}</b>
        <p className="relative mt-1 text-[0.84375rem] text-white/80">
          {r.assessable ? `อัตราภาษีเทียบเงินได้ ${r.effectiveRate}% · ใช้${r.usedMethod === 2 ? 'วิธีที่ 2 (0.5%)' : 'วิธีที่ 1 (ขั้นบันได)'}` : 'กรอกเงินได้เพื่อเริ่มคำนวณ'}
        </p>
        {r.withholdingPaid > 0 && (
          <div className="relative mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/15 px-4 py-3 ring-1 ring-white/20">
            <span className="text-[0.90625rem]">{refund ? 'ได้รับคืนภาษี' : r.balance > 0 ? 'ต้องชำระเพิ่ม' : 'ไม่ต้องชำระเพิ่ม'}</span>
            <b className="font-mono text-[1.25rem] font-semibold tabular-nums">{thb(Math.abs(r.balance))}</b>
          </div>
        )}
      </div>

      <div className="divide-y divide-line px-5 sm:px-6">
        <div className="py-3">
          <button type="button" onClick={() => toggle('exp')} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="text-[0.9375rem] font-semibold">เงินได้และค่าใช้จ่าย</span>
            <Icon name="chevron" className={cx('size-4 text-ink-soft transition-transform', open.exp ? '-rotate-90' : 'rotate-90')} />
          </button>
          <Line label="เงินได้พึงประเมิน" value={r.assessable} />
          {open.exp && r.incomes.map((i) => (
            <div key={i.type} className="ml-3 border-l-2 border-line pl-3">
              <Line label={`${i.type} ${i.label}`} value={i.amount} sub={`หักค่าใช้จ่าย ${i.method} = ${thb(i.expense)}`} />
            </div>
          ))}
          <Line label="หักค่าใช้จ่าย" value={r.totalExpense} minus />
          <Line label="คงเหลือ" value={r.afterExpense} strong />
        </div>

        <div className="py-3">
          <button type="button" onClick={() => toggle('allow')} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="text-[0.9375rem] font-semibold">ค่าลดหย่อนและเงินบริจาค</span>
            <Icon name="chevron" className={cx('size-4 text-ink-soft transition-transform', open.allow ? '-rotate-90' : 'rotate-90')} />
          </button>
          {open.allow && [...r.allowances, ...r.donations].map((a) => (
            <div key={a.key} className="ml-3 border-l-2 border-line pl-3">
              <Line label={a.label} value={a.allowed} minus sub={a.capped ? `กรอก ${thb(a.claimed)} · ${a.note}` : undefined} tone={a.capped ? 'text-[#B45309]' : undefined} />
            </div>
          ))}
          <Line label="รวมค่าลดหย่อน" value={r.totalAllowance} minus />
          {r.totalDonation > 0 && <Line label="รวมเงินบริจาค" value={r.totalDonation} minus sub={`เพดาน 10% = ${thb(r.donationCap)}`} />}
          <Line label="เงินได้สุทธิ" value={r.netIncome} strong />
        </div>

        <div className="py-3">
          <button type="button" onClick={() => toggle('steps')} className="flex w-full items-center justify-between gap-3 text-left">
            <span className="text-[0.9375rem] font-semibold">คำนวณภาษี 2 วิธี</span>
            <Icon name="chevron" className={cx('size-4 text-ink-soft transition-transform', open.steps ? '-rotate-90' : 'rotate-90')} />
          </button>
          {open.steps && (
            <div className="my-2 overflow-hidden rounded-xl ring-1 ring-line">
              <table className="w-full text-[0.84375rem]">
                <thead className="bg-tile text-ink-soft"><tr><th className="px-3 py-2 text-left font-normal">เงินได้สุทธิ</th><th className="px-2 py-2 text-right font-normal">อัตรา</th><th className="px-3 py-2 text-right font-normal">ภาษี</th></tr></thead>
                <tbody>
                  {r.method1.steps.map((s) => (
                    <tr key={s.from} className="border-t border-line">
                      <td className="px-3 py-1.5 font-mono">{s.from.toLocaleString('th-TH')}–{s.to === Infinity ? 'ขึ้นไป' : s.to.toLocaleString('th-TH')}</td>
                      <td className="px-2 py-1.5 text-right">{s.rate}%</td>
                      <td className="px-3 py-1.5 text-right font-mono">{thb(s.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Line label="วิธีที่ 1 เงินได้สุทธิ × อัตราขั้นบันได" value={r.method1.tax} tone={r.usedMethod === 1 ? 'text-orange-deep' : 'text-ink-soft'} />
          <Line label="วิธีที่ 2 เงินได้ที่ไม่ใช่ 40(1) × 0.5%" value={r.method2.tax} sub={r.method2.note} tone={r.usedMethod === 2 ? 'text-orange-deep' : 'text-ink-soft'} />
          <Line label="ภาษีที่ต้องเสีย (วิธีที่ได้ภาษีมากกว่า)" value={r.tax} strong />
          <Line label="หักภาษีที่ถูกหัก ณ ที่จ่ายไว้แล้ว" value={r.withholdingPaid} minus />
          <Line label={refund ? 'ได้รับคืน' : 'ต้องชำระเพิ่ม'} value={Math.abs(r.balance)} strong tone={refund ? 'text-ok' : 'text-orange-deep'} />
        </div>
      </div>
      <p className="flex gap-2 border-t border-line bg-[#FCFBFA] px-5 py-3.5 text-[0.78125rem] leading-relaxed text-ink-soft sm:px-6">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        คำนวณตามประมวลรัษฎากร มาตรา 40, 42 ทวิ ถึง 48 และเพดานค่าลดหย่อนปีภาษี {r.yearLabel} ผลลัพธ์ตรงตามข้อมูลที่กรอก ตรวจให้ครบตามเอกสารจริงก่อนยื่นแบบ ภ.ง.ด.90/91
      </p>
    </section>
  );
}

export default function TaxPage() {
  const { user } = useOutletContext();
  const saved = useMemo(() => readSaved(user.id) || {}, [user.id]);
  const [year, setYear] = useState(saved.year && pit.SUPPORTED_YEARS.includes(saved.year) ? saved.year : defaultYear());
  const [mode, setMode] = useState(saved.mode || 'docs');
  const [issuedType, setIssuedType] = useState(saved.issuedType || '40(2)');
  const [incomeForm, setIncomeForm] = useState(saved.incomeForm || {});
  const [deductions, setDeductions] = useState(saved.deductions || {});
  const [whtExtra, setWhtExtra] = useState(saved.whtExtra || '');
  const [excluded, setExcluded] = useState(() => new Set(saved.excluded || []));
  const [showAllTypes, setShowAllTypes] = useState(false);

  useEffect(() => {
    writeSaved(user.id, { year, mode, issuedType, incomeForm, deductions, whtExtra, excluded: [...excluded] });
  }, [user.id, year, mode, issuedType, incomeForm, deductions, whtExtra, excluded]);

  const docs = useQuery({
    queryKey: ['pit', 'from-documents', year, issuedType],
    queryFn: () => api.get(`/api/pit/from-documents?year=${year}&issuedType=${encodeURIComponent(issuedType)}`),
    enabled: mode === 'docs',
  });
  const sources = (docs.data && docs.data.sources) || [];
  const srcKey = (s) => `${s.kind}:${s.id}`;
  const picked = sources.filter((s) => !excluded.has(srcKey(s)));
  const docIncome = {};
  let docWht = 0;
  picked.forEach((s) => { docIncome[s.incomeType] = (docIncome[s.incomeType] || 0) + s.amount; docWht += s.wht; });

  // รวมเงินได้: (จากเอกสาร ถ้าโหมดเอกสาร) + ที่กรอก · ชนิดทรัพย์สิน/ค่าใช้จ่ายจริงใช้ตามที่กรอก
  const incomes = {};
  pit.INCOME_TYPES.forEach((t) => {
    const f = incomeForm[t.key] || {};
    const amount = toNum(f.amount) + (mode === 'docs' ? docIncome[t.key] || 0 : 0);
    if (!amount) return;
    incomes[t.key] = { amount, kind: f.kind || '', actual: String(f.actual ?? '').trim() === '' ? null : toNum(f.actual) };
  });
  const dedNums = Object.fromEntries(Object.entries(deductions).map(([k, v]) => [k, typeof v === 'boolean' ? v : toNum(v)]));
  const withholdingPaid = toNum(whtExtra) + (mode === 'docs' ? docWht : 0);
  const r = pit.calculate({ year, incomes, deductions: dedNums, withholdingPaid });

  const setIncome = (key, v) => setIncomeForm((f) => ({ ...f, [key]: v }));
  const setDed = (key, v) => setDeductions((d) => ({ ...d, [key]: v }));
  const allowanceOf = (key) => [...r.allowances, ...r.donations].find((a) => a.key === key);
  const visibleTypes = pit.INCOME_TYPES.filter((t) => showAllTypes || PRIMARY_TYPES.includes(t.key) || toNum((incomeForm[t.key] || {}).amount) || docIncome[t.key]);
  const fields = pit.DEDUCTION_FIELDS.filter((f) => !f.year || f.year === year);
  const resetForm = () => { setIncomeForm({}); setDeductions({}); setWhtExtra(''); setExcluded(new Set()); };

  return (
    <>
      <PageHeader
        title="คำนวณภาษีเงินได้บุคคลธรรมดา"
        subtitle="คำนวณตามประมวลรัษฎากร ขั้นตอนเดียวกับแบบ ภ.ง.ด.90/91 เลือกคำนวณจากเอกสารในระบบ หรือกรอกเองทั้งหมด"
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-[280px] flex-1 sm:max-w-[420px]">
          <Seg label="ที่มาของเงินได้" value={mode} onChange={setMode} options={[{ value: 'docs', label: 'จากเอกสารในระบบ', icon: 'file' }, { value: 'manual', label: 'กรอกเอง', icon: 'calc' }]} />
        </div>
        <label className="flex items-center gap-2 rounded-full bg-white py-1 pl-4 pr-1 shadow-[0_1px_2px_rgba(24,24,27,0.05)]">
          <span className="text-[0.90625rem] text-ink-soft">ปีภาษี</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-full bg-tile px-3 text-[0.90625rem] font-medium focus:outline-none">
            {[...pit.SUPPORTED_YEARS].sort((a, b) => b - a).map((y) => <option key={y} value={y}>{be(y)}</option>)}
          </select>
        </label>
        <button type="button" onClick={resetForm} className="ml-auto flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[0.875rem] text-ink-soft transition-colors hover:bg-white hover:text-ink">
          ล้างข้อมูลที่กรอก
        </button>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* ---------- 1) เงินได้ ---------- */}
          <Section
            step="1"
            title="เงินได้พึงประเมิน"
            sub={mode === 'docs' ? `จากเอกสารที่มีผลในปีภาษี ${be(year)} (ไม่รวมแบบร่าง ยกเลิก และไม่อนุมัติ) ติ๊กออกได้ถ้าไม่ต้องการนับ` : 'กรอกเงินได้ทั้งปีแยกตามประเภทในมาตรา 40'}
          >
            {mode === 'docs' && (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-tile px-4 py-3">
                  <span className="text-[0.90625rem]">เอกสารรายได้ที่คุณออกเอง นับเป็นเงินได้</span>
                  <div className="w-full sm:w-auto">
                    <Seg label="ประเภทเงินได้ของเอกสารที่ออกเอง" value={issuedType} onChange={setIssuedType} options={[{ value: '40(2)', label: 'มาตรา 40(2)' }, { value: '40(8)', label: 'มาตรา 40(8)' }]} />
                  </div>
                </div>
                {docs.isLoading && <Skeleton className="h-28 w-full rounded-2xl" />}
                {docs.isError && <p className="rounded-xl bg-danger-soft px-4 py-3 text-[0.90625rem] text-danger">{docs.error.message}</p>}
                {docs.data && !sources.length && (
                  <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[0.90625rem] text-ink-soft">
                    ยังไม่มีเอกสารรายได้ในปีภาษี {be(year)}{' '}
                    <ViewLink role="creator" view="add" className="font-medium text-orange-deep underline">บันทึก 50 ทวิ ที่ได้รับ</ViewLink>
                    {' '}หรือสลับเป็น "กรอกเอง"
                  </div>
                )}
                {sources.length > 0 && (
                  <ul className="overflow-hidden rounded-2xl ring-1 ring-line">
                    {sources.map((s) => {
                      const on = !excluded.has(srcKey(s));
                      return (
                        <li key={srcKey(s)} className="border-b border-line last:border-0">
                          <label className={cx('flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FAFAF9]', !on && 'opacity-50')}>
                            <input type="checkbox" checked={on} onChange={() => setExcluded((x) => { const n = new Set(x); if (n.has(srcKey(s))) n.delete(srcKey(s)); else n.add(srcKey(s)); return n; })} className="size-4 shrink-0 accent-[var(--color-orange)]" />
                            <span className="min-w-0 flex-1">
                              <b className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium">
                                {s.kind === 'wht' ? '50 ทวิ ที่ได้รับ' : (DOC_LABEL[s.type] || s.type)}
                                <span className="rounded-md bg-tile px-1.5 font-mono text-[0.75rem] text-[#57534E]">{s.incomeType}</span>
                              </b>
                              <small className="block truncate text-[0.8125rem] text-ink-soft"><span className="font-mono">{s.docNo || '-'}</span> · {s.party || '-'} · {thDate(s.date)}</small>
                            </span>
                            <span className="shrink-0 text-right">
                              <b className="block font-mono text-[0.9375rem] font-medium tabular-nums">{thb(s.amount)}</b>
                              {s.wht > 0 && <small className="block text-[0.78125rem] text-ink-soft">ถูกหัก {thb(s.wht)}</small>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {sources.some((s) => s.kind === 'wht') && sources.some((s) => s.kind === 'issued') && (
                  <p className="mt-2.5 flex gap-2 text-[0.8125rem] leading-relaxed text-[#B45309]">
                    <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                    ถ้าใบแจ้งหนี้/ใบเสร็จที่คุณออก กับ 50 ทวิ ที่ได้รับ เป็นงานเดียวกัน ให้ติ๊กออกฉบับใดฉบับหนึ่ง เพื่อไม่ให้นับเงินได้ซ้ำ
                  </p>
                )}
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-[0.9375rem] font-semibold">เงินได้อื่นที่ไม่มีในระบบ</span>
                  <small className="text-[0.8125rem] text-ink-soft">ไม่บังคับ</small>
                </div>
              </>
            )}

            <div className="mt-3 flex flex-col gap-3">
              {visibleTypes.map((t) => (
                <IncomeRow key={t.key} t={t} v={incomeForm[t.key] || {}} onChange={(v) => setIncome(t.key, v)} docAmount={mode === 'docs' ? docIncome[t.key] || 0 : 0} />
              ))}
            </div>
            {!showAllTypes && visibleTypes.length < pit.INCOME_TYPES.length && (
              <button type="button" onClick={() => setShowAllTypes(true)} className="mt-3 flex h-10 items-center gap-1.5 rounded-full bg-tile px-4 text-[0.875rem] font-medium transition-colors hover:bg-[#EFEBE7]">
                <Icon name="plus" className="size-4" />แสดงเงินได้ประเภทอื่น (40(3)–40(7))
              </button>
            )}

            <div className="mt-5 rounded-2xl bg-tile p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <b className="block text-[0.9375rem] font-medium">ภาษีที่ถูกหัก ณ ที่จ่ายไว้แล้วทั้งปี</b>
                  <small className="text-[0.8125rem] text-ink-soft">{mode === 'docs' ? `จาก 50 ทวิ ที่เลือก ${thb(docWht)} + เพิ่มเติม` : 'รวมทุกฉบับตามหนังสือรับรอง 50 ทวิ'}</small>
                </div>
                <MoneyInput className="w-full sm:w-56" value={whtExtra} onChange={setWhtExtra} placeholder={mode === 'docs' ? 'เพิ่มเติม' : '0'} />
              </div>
            </div>
          </Section>

          {/* ---------- 2) ค่าลดหย่อน ---------- */}
          <Section step="2" title="ค่าลดหย่อนและเงินบริจาค" sub={`กรอกเฉพาะรายการที่มีสิทธิ์ ระบบตัดตามเพดานของปีภาษี ${be(year)} ให้อัตโนมัติ (ค่าลดหย่อนส่วนตัว 60,000 บาท หักให้แล้ว)`}>
            <div className="flex flex-col gap-5">
              {GROUPS.map((g) => {
                const list = fields.filter((f) => f.group === g.key);
                if (!list.length) return null;
                return (
                  <div key={g.key}>
                    <h3 className="mb-2 text-[0.875rem] font-semibold text-[#57534E]">{g.label}</h3>
                    <div className="grid gap-2.5 md:grid-cols-2">
                      {list.map((f) => {
                        const a = allowanceOf(f.key);
                        const val = deductions[f.key];
                        return (
                          <div key={f.key} className={cx('rounded-2xl border p-3.5 transition-colors', a && a.allowed > 0 ? 'border-[#FED7AA] bg-orange-pale/40' : 'border-line')}>
                            {f.kind === 'bool' ? (
                              <label className="flex cursor-pointer items-center justify-between gap-3">
                                <span className="text-[0.90625rem] leading-snug">{f.label} <small className="block text-[0.78125rem] text-ink-soft">{thb(f.each)}</small></span>
                                <input type="checkbox" checked={!!val} onChange={(e) => setDed(f.key, e.target.checked)} className="size-5 shrink-0 accent-[var(--color-orange)]" />
                              </label>
                            ) : (
                              <label className="block">
                                <span className="mb-1.5 block text-[0.875rem] leading-snug">{f.label}</span>
                                {f.kind === 'count' ? (
                                  <div className="flex items-center gap-2">
                                    <button type="button" aria-label="ลด" onClick={() => setDeductions((d) => ({ ...d, [f.key]: Math.max(0, toNum(d[f.key]) - 1) }))} className="flex size-10 items-center justify-center rounded-xl bg-tile text-[1.125rem] hover:bg-[#EFEBE7]">−</button>
                                    <input inputMode="numeric" value={val ?? ''} placeholder="0" onChange={(e) => setDed(f.key, e.target.value.replace(/\D/g, ''))} className="tf-input w-20 text-center tabular-nums" />
                                    <button type="button" aria-label="เพิ่ม" onClick={() => setDeductions((d) => ({ ...d, [f.key]: Math.min(f.maxCount || 99, toNum(d[f.key]) + 1) }))} className="flex size-10 items-center justify-center rounded-xl bg-tile text-[1.125rem] hover:bg-[#EFEBE7]">+</button>
                                    <span className="text-[0.875rem] text-ink-soft">คน</span>
                                  </div>
                                ) : (
                                  <MoneyInput value={val} onChange={(x) => setDed(f.key, x)} />
                                )}
                              </label>
                            )}
                            {a && (a.allowed > 0 || a.capped) && (
                              <small className={cx('mt-1.5 block text-[0.78125rem]', a.capped ? 'text-[#B45309]' : 'text-ok')}>
                                หักได้ {thb(a.allowed)}{a.capped ? ` · ${a.note}` : ''}
                              </small>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        {/* ---------- 3) ผลการคำนวณ ---------- */}
        <div className="xl:sticky xl:top-24">
          {mode === 'docs' && docs.isFetching && !docs.data ? (
            <p className="flex items-center gap-2 rounded-[24px] bg-white p-6 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังดึงข้อมูลจากเอกสาร</p>
          ) : <ResultCard r={r} mode={mode} docsLoading={docs.isLoading} />}
        </div>
      </div>
    </>
  );
}
