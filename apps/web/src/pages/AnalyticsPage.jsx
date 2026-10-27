/**
 * AnalyticsPage.jsx วิเคราะห์ข้อมูลเอกสารแบบละเอียด (/app/analytics) ข้อมูลจาก /api/dashboard/analytics
 * - ตัวกรองแถวเดียวด้านบน: ช่วงเวลา (6 เดือน / 12 เดือน / ปีนี้) · ประเภทเอกสาร (อนุมัติแล้ว / ทุกฉบับ)
 * - ตัวเลขสรุป 4 ใบ · กราฟรายเดือน (แท่ง / เส้น / พื้นที่ / ตาราง) เลือกตัวชี้วัดได้
 * - สัดส่วนตามประเภทเอกสาร (โดนัท / แท่งเคียงกันรายเดือนมีแกน x เดือน · y มูลค่าหรือจำนวน) · สถานะเอกสาร · คู่ค้าที่มียอดสูงสุด
 * กราฟทุกแบบชี้แล้วเห็นค่า และมีป้าย/ตารางกำกับ ไม่ต้องแยกด้วยสีอย่างเดียว
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { STATUS_LABEL, thb } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { PageHeader, Skeleton, cx } from '../components/ui.jsx';
import { CAT, Donut, HBars, StackBar, GroupedColumns, TimeChart } from '../components/charts.jsx';
import { yearFromInput } from '../components/DatePicker.jsx';

const TH_MONTH = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${TH_MONTH[m]} ${String(y + 543).slice(2)}`; };
const moneyWhole = (n) => `฿${Math.round(n).toLocaleString('th-TH')}`;
const docs = (n) => `${Math.round(n).toLocaleString('th-TH')} ฉบับ`;

const METRICS = [
  { key: 'income', label: 'มูลค่าเอกสาร', format: moneyWhole },
  { key: 'vat', label: 'VAT', format: moneyWhole },
  { key: 'wht', label: 'หัก ณ ที่จ่าย', format: moneyWhole },
  { key: 'count', label: 'จำนวนเอกสาร', format: docs },
];
// สีสถานะ (สงวนไว้สำหรับสถานะเท่านั้น และแสดงคู่กับชื่อสถานะเสมอ)
const STATUS_COLOR = { approved: '#0ca30c', pending: '#fab219', rejected: '#d03b3b', archived: '#2a78d6', draft: '#A8A29E', cancelled: '#57534E' };

function Seg({ value, onChange, options, label, small }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex max-w-full overflow-x-auto rounded-full bg-tile p-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.tip}
          onClick={() => onChange(o.value)}
          className={cx('flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-all', small ? 'h-8 px-3 text-[0.84375rem]' : 'h-9 px-4 text-[0.90625rem]',
            value === o.value ? 'bg-white text-ink shadow-[0_2px_8px_-3px_rgba(24,24,27,0.3)]' : 'text-[#78716C] hover:text-ink')}
        >
          {o.icon && <Icon name={o.icon} className="size-4" />}{o.label}
        </button>
      ))}
    </div>
  );
}

const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const ymNow = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };
const ymShift = (ym, delta) => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1 + delta, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; };

/** เลือกเดือน (รายการ) + พิมพ์ปี พ.ศ. แยกกัน ค่าเป็น 'YYYY-MM' (ค.ศ.) */
function MonthYearField({ label, value, onChange }) {
  const [y, m] = value.split('-').map(Number);
  const [yearText, setYearText] = useState(String(y + 543));
  useEffect(() => { setYearText(String(y + 543)); }, [y]);
  const setYear = (ce) => onChange(`${ce}-${String(m).padStart(2, '0')}`);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[0.84375rem] text-ink-soft">{label}</span>
      <select aria-label={`${label}: เดือน`} value={m} onChange={(e) => onChange(`${y}-${String(Number(e.target.value)).padStart(2, '0')}`)}
        className="h-9 cursor-pointer rounded-full border border-line bg-white px-3 text-[0.90625rem] font-medium text-ink focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30">
        {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
      </select>
      <input
        type="text" inputMode="numeric" maxLength={4} aria-label={`${label}: ปี พ.ศ.`} title="พิมพ์ปี พ.ศ. เช่น 2568"
        value={yearText}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
          setYearText(digits);
          const ce = digits.length === 4 ? yearFromInput(digits) : null;
          if (ce) setYear(ce);
        }}
        onBlur={() => setYearText(String(y + 543))}
        className="h-9 w-[4.5rem] rounded-full border border-line bg-white px-2 text-center font-mono text-[0.90625rem] font-semibold text-ink focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
      />
    </div>
  );
}

/** ตัวเลือกพร้อมหัวข้อที่มองเห็น เช่น "คิดจาก [มูลค่า | จำนวน]" */
function Control({ label, children }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[0.84375rem] text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

/** การ์ดกราฟ: หัวข้อ + คำอธิบาย แล้วแถวตัวเลือกอยู่ใต้หัวข้อ (ไม่ทับคำอธิบาย) · เป็น container ให้เนื้อหาปรับตามความกว้างการ์ด */
function Card({ title, sub, controls, children, className }) {
  return (
    <section className={cx('@container tf-fade-up min-w-0 rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6', className)}>
      <div className="mb-5">
        <h2 className="text-[1.125rem] font-semibold leading-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-[0.875rem] text-ink-soft">{sub}</p>}
        {controls && <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5">{controls}</div>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, note, icon, accent }) {
  return (
    <div className={cx('tf-fade-up relative min-w-0 overflow-hidden rounded-[18px] p-3.5 [container-type:inline-size] sm:rounded-[22px] sm:p-5', accent ? 'bg-gradient-to-br from-orange to-[#D9480F] text-white shadow-[0_18px_40px_-22px_rgba(232,90,0,0.85)]' : 'bg-white shadow-[0_1px_2px_rgba(24,24,27,0.03)]')}>
      <span className={accent ? 'tf-dots-light' : 'tf-dots'} aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-2">
        <span className={cx('min-w-0 text-[0.875rem] leading-snug', accent ? 'text-white/85' : 'text-ink-soft')}>{label}</span>
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-xl sm:size-9', accent ? 'bg-white/20' : 'bg-tile text-ink')}><Icon name={icon} className="size-[1.125rem]" /></span>
      </div>
      <b className="relative mt-2 block whitespace-nowrap font-display text-[clamp(1.0625rem,12cqw,1.625rem)] font-semibold leading-tight tracking-tight">{value}</b>
      {note && <small className={cx('relative line-clamp-2 block text-[0.8125rem]', accent ? 'text-white/80' : 'text-ink-soft')}>{note}</small>}
    </div>
  );
}

const pct = (v, total) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '-');

/** รายการคำอธิบายสี + ค่า + % พร้อมแถบสัดส่วนเล็ก (อ่านได้โดยไม่ต้องเทียบสี) */
function Legend({ items, format, total, active, onHover }) {
  return (
    <ul className="flex flex-col gap-1" onMouseLeave={() => onHover?.(null)}>
      {items.map((d) => (
        <li
          key={d.key}
          onMouseEnter={() => onHover?.(d.key)}
          className={cx('rounded-2xl px-3 py-2.5 transition-all', active === d.key ? 'bg-tile' : 'hover:bg-tile/60', active != null && active !== d.key && 'opacity-55')}
        >
          {/* แถวบน: ชื่อประเภท (ยาวได้เต็มบรรทัด) · แถวล่าง: แถบสัดส่วน + ค่า + % ไม่แย่งที่กับชื่อจึงไม่ล้นกรอบ */}
          <div className="flex items-center gap-3 text-[0.90625rem]">
            <i className="size-3 shrink-0 rounded-full" style={{ background: d.color, boxShadow: `0 0 0 4px ${d.color}22` }} />
            <span className="min-w-0 flex-1 truncate" title={d.label}>{d.label}</span>
          </div>
          <div className="ml-6 mt-1.5 flex items-center gap-3">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line/70">
              <div className="h-full rounded-full" style={{ width: total > 0 ? `${(d.value / total) * 100}%` : 0, background: d.color, transition: 'width .6s var(--ease-slide)' }} />
            </div>
            <b className="shrink-0 font-mono text-[0.875rem] font-medium tabular-nums">{format(d.value)}</b>
            <span className="w-[52px] shrink-0 text-right text-[0.8125rem] font-medium text-ink-soft tabular-nums">{pct(d.value, total)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** ช่องสถานะแต่ละแบบ: ตัวเลขใหญ่ + % ใช้คู่กับแท่งสัดส่วนด้านบน */
function StatusTiles({ items, total, active, onHover }) {
  return (
    <ul className="mt-5 grid grid-cols-2 gap-3 @[520px]:grid-cols-3" onMouseLeave={() => onHover?.(null)}>
      {items.map((d) => (
        <li
          key={d.key}
          onMouseEnter={() => onHover?.(d.key)}
          className={cx('relative overflow-hidden rounded-2xl px-4 py-3 transition-all', active === d.key ? 'bg-tile' : 'bg-tile/60', active != null && active !== d.key && 'opacity-50')}
        >
          <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: d.color }} aria-hidden="true" />
          <div className="flex items-center gap-2 text-[0.84375rem] text-ink-soft">
            <i className="size-2 rounded-full" style={{ background: d.color }} />
            <span className="truncate">{d.label}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <b className="font-display text-[1.5rem] font-semibold leading-none tabular-nums">{d.value}</b>
            <span className="text-[0.8125rem] text-ink-soft">ฉบับ</span>
            <span className="ml-auto text-[0.8125rem] font-medium text-ink-soft tabular-nums">{pct(d.value, total)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

const MEDAL = ['from-[#FFB020] to-[#F59E0B]', 'from-[#D6D3D1] to-[#A8A29E]', 'from-[#E0A070] to-[#C2410C]'];

/** อันดับคู่ค้า: เหรียญอันดับ + แท่งไล่สี + สัดส่วนของยอดรวม */
function PartnerRank({ items }) {
  const max = Math.max(...items.map((p) => p.total), 0) || 1;
  const sum = items.reduce((s, p) => s + p.total, 0);
  return (
    <ol className="flex flex-col gap-4">
      {items.map((p, i) => (
        <li key={p.name} className="flex items-center gap-3">
          <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-full text-[0.875rem] font-semibold', i < 3 ? `bg-gradient-to-br text-white ${MEDAL[i]}` : 'bg-tile text-ink-soft')}>{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[0.90625rem] font-medium">{p.name}</span>
              <b className="shrink-0 font-mono text-[0.90625rem] font-medium tabular-nums">{moneyWhole(p.total)}</b>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-tile">
              <div className="h-full rounded-full bg-gradient-to-r from-[#FF8A3D] to-orange" style={{ width: `${Math.max(3, (p.total / max) * 100)}%`, transition: 'width .6s var(--ease-slide)' }} />
            </div>
            <div className="mt-1 flex justify-between text-[0.78125rem] text-ink-soft">
              <span>{p.count} ฉบับ</span>
              <span className="tabular-nums">{pct(p.total, sum)} ของยอดรวม {items.length} อันดับ</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState('12m');
  // ช่วงเวลากำหนดเอง (เดือนเริ่ม–เดือนสุดท้าย) ค่าเริ่มต้น 12 เดือนล่าสุด
  const [from, setFrom] = useState(() => ymShift(ymNow(), -11));
  const [to, setTo] = useState(ymNow);
  const [basis, setBasis] = useState('approved');
  const [metric, setMetric] = useState('income');
  const [chart, setChart] = useState('bar');
  const [shareBy, setShareBy] = useState('total');
  const [shareChart, setShareChart] = useState('donut');
  const [hoverShare, setHoverShare] = useState(null);
  const [hoverStatus, setHoverStatus] = useState(null);

  const q = useQuery({
    queryKey: ['analytics', range, basis, range === 'custom' ? `${from}_${to}` : ''],
    queryFn: () => api.get(`/api/dashboard/analytics?range=${range}&basis=${basis}${range === 'custom' ? `&from=${from}&to=${to}` : ''}`),
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  const m = METRICS.find((x) => x.key === metric);
  const labels = d ? d.months.map(monthLabel) : [];

  // สัดส่วนตามประเภท: เกิน 7 ประเภทรวมเป็น "อื่น ๆ" (ไม่สร้างสีที่ 9)
  const typeRows = d ? d.byType.map((t) => ({ key: t.type, label: t.label, value: shareBy === 'total' ? t.total : t.count })).filter((t) => t.value > 0) : [];
  const shown = typeRows.length > 8 ? [...typeRows.slice(0, 7), { key: 'other', label: 'อื่น ๆ', value: typeRows.slice(7).reduce((s, t) => s + t.value, 0) }] : typeRows;
  const shares = shown.map((t, i) => ({ ...t, color: CAT[i] }));
  const shareTotal = shares.reduce((s, t) => s + t.value, 0);
  const shareFormat = shareBy === 'total' ? moneyWhole : docs;
  // กราฟแท่งซ้อนตามเดือน: ค่ารายเดือนของแต่ละประเภท (ประเภทที่รวมเป็น "อื่น ๆ" ก็รวมรายเดือนด้วย)
  const monthlyOf = (t) => (shareBy === 'total' ? t.monthlyTotal : t.monthlyCount);
  const hasMonthly = !!(d && d.byType.length && monthlyOf(d.byType[0]));
  const shareSeries = !hasMonthly ? [] : shares.map((sh) => {
    const src = sh.key === 'other' ? d.byType.filter((t) => !shown.slice(0, 7).some((x) => x.key === t.type)) : d.byType.filter((t) => t.type === sh.key);
    return { key: sh.key, label: sh.label, color: sh.color, values: d.months.map((_, i) => src.reduce((acc, t) => acc + (monthlyOf(t)[i] || 0), 0)) };
  });

  const statusRows = d ? d.byStatus.map((s) => ({ key: s.status, label: STATUS_LABEL[s.status] || s.status, value: s.count, color: STATUS_COLOR[s.status] || '#A8A29E' })) : [];
  const statusTotal = statusRows.reduce((s, x) => s + x.value, 0);
  const avg = d && d.totals.count ? d.totals.income / d.totals.count : 0;
  const ymText = (ym) => { const [y, mo] = ym.split('-').map(Number); return `${MONTH_NAMES[mo - 1]} ${y + 543}`; };
  const customText = d && d.months.length ? `${ymText(d.months[0])} – ${ymText(d.months.at(-1))}` : 'ช่วงที่เลือก';
  const rangeText = { '6m': '6 เดือนล่าสุด', '12m': '12 เดือนล่าสุด', ytd: 'ต้นปีถึงเดือนนี้', custom: customText }[range];

  return (
    <>
      <PageHeader title="วิเคราะห์ข้อมูลเอกสาร" subtitle="ดูแนวโน้มและสัดส่วนของเอกสารในหลายรูปแบบ ชี้ที่กราฟเพื่อดูตัวเลขของแต่ละจุด" />

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Control label="ช่วงเวลา"><Seg label="ช่วงเวลา" value={range} onChange={setRange} options={[{ value: '6m', label: '6 เดือน' }, { value: '12m', label: '12 เดือน' }, { value: 'ytd', label: 'ปีนี้' }, { value: 'custom', label: 'กำหนดเอง' }]} /></Control>
        {range === 'custom' && (
          <div className="tf-reveal flex flex-wrap items-center gap-x-3 gap-y-2">
            <MonthYearField label="ตั้งแต่" value={from} onChange={setFrom} />
            <MonthYearField label="ถึง" value={to} onChange={setTo} />
            {from > to && <span className="text-[0.84375rem] text-ink-soft">เดือนเริ่มอยู่หลังเดือนสุดท้าย ระบบสลับให้อัตโนมัติ</span>}
            <span className="text-[0.84375rem] text-ink-soft">(สูงสุด 60 เดือน)</span>
          </div>
        )}
        <Control label="ประเภทเอกสาร"><Seg label="ประเภทเอกสาร" value={basis} onChange={setBasis} options={[
          { value: 'approved', label: 'อนุมัติ/เก็บถาวร', tip: 'นับเฉพาะเอกสารที่อนุมัติแล้วหรือเก็บถาวร เป็นยอดที่เกิดขึ้นจริงแน่นอน (ไม่รวมเอกสารที่รอคู่ค้าตอบกลับ)' },
          { value: 'effective', label: 'ทุกฉบับ', tip: 'นับทุกฉบับที่ออกเลขที่แล้วและยังมีผล รวมเอกสารที่รอคู่ค้าตรวจสอบ/ลงนาม ไม่รวมแบบร่าง ยกเลิก และไม่อนุมัติ' },
        ]} /></Control>
        {q.isFetching && <span className="text-[0.84375rem] text-ink-soft">กำลังโหลด...</span>}
      </div>

      {/* ---------- ตัวเลขสรุป ---------- */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {!d ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[128px] w-full rounded-[22px]" />) : (
          <>
            <Stat accent label="มูลค่าเอกสารรวม" icon="wallet" value={moneyWhole(d.totals.income)} note={rangeText} />
            <Stat label="VAT รวม" icon="calc" value={moneyWhole(d.totals.vat)} note="จากเอกสารที่มี VAT" />
            <Stat label="หัก ณ ที่จ่ายรวม" icon="receipt" value={moneyWhole(d.totals.wht)} note="จาก 50 ทวิ" />
            <Stat label="จำนวนเอกสาร" icon="file" value={docs(d.totals.count)} note={`เฉลี่ย ${moneyWhole(avg)} ต่อฉบับ`} />
          </>
        )}
      </div>

      {/* ---------- กราฟรายเดือน ---------- */}
      <Card
        title={`${m.label}รายเดือน`}
        sub={`${rangeText} · ${basis === 'approved' ? 'เฉพาะเอกสารที่อนุมัติ/เก็บถาวร' : 'ทุกฉบับ (ไม่รวมแบบร่าง ยกเลิก ไม่อนุมัติ)'}`}
        controls={(
          <>
            <Control label="ตัวชี้วัด"><Seg small label="ตัวชี้วัด" value={metric} onChange={setMetric} options={METRICS.map((x) => ({ value: x.key, label: x.label }))} /></Control>
            <Control label="แสดงเป็น"><Seg small label="แสดงเป็น" value={chart} onChange={setChart} options={[{ value: 'bar', label: 'กราฟแท่ง' }, { value: 'line', label: 'กราฟเส้น' }, { value: 'area', label: 'กราฟพื้นที่' }, { value: 'table', label: 'ตาราง' }]} /></Control>
          </>
        )}
        className="mb-5"
      >
        {!d ? <Skeleton className="h-[280px] w-full" /> : chart === 'table' ? (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
            <table className="w-full min-w-[560px] text-[0.90625rem]">
              <thead className="bg-tile text-[0.84375rem] text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 text-left font-normal">เดือน</th>
                  {METRICS.map((x) => <th key={x.key} className={cx('px-4 py-2.5 text-right font-normal', x.key === metric && 'text-ink')}>{x.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.months.map((ym, i) => (
                  <tr key={ym} className="border-t border-line">
                    <td className="px-4 py-2">{monthLabel(ym)}</td>
                    {METRICS.map((x) => <td key={x.key} className={cx('px-4 py-2 text-right font-mono tabular-nums', x.key === metric ? 'font-medium' : 'text-ink-soft')}>{x.format(d[x.key][i])}</td>)}
                  </tr>
                ))}
                <tr className="border-t border-line bg-tile font-medium">
                  <td className="px-4 py-2">รวม</td>
                  {METRICS.map((x) => <td key={x.key} className="px-4 py-2 text-right font-mono tabular-nums">{x.format(x.key === 'count' ? d.totals.count : d.totals[x.key])}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <TimeChart title={`${m.label}รายเดือน`} labels={labels} values={d[metric]} type={chart} format={m.format} />
        )}
      </Card>

      <div className="grid items-stretch gap-5 xl:grid-cols-2">
        {/* ---------- สัดส่วนตามประเภทเอกสาร ---------- */}
        <Card
          className="flex flex-col"
          title="สัดส่วนตามประเภทเอกสาร"
          sub={shareBy === 'total' ? 'คิดจากมูลค่าเอกสาร' : 'คิดจากจำนวนฉบับ'}
          controls={(
            <>
              <Control label="คิดจาก"><Seg small label="คิดจาก" value={shareBy} onChange={setShareBy} options={[{ value: 'total', label: 'มูลค่า (บาท)' }, { value: 'count', label: 'จำนวนฉบับ' }]} /></Control>
              <Control label="แสดงเป็น"><Seg small label="แสดงเป็น" value={shareChart} onChange={setShareChart} options={[{ value: 'donut', label: 'กราฟโดนัท' }, { value: 'bars', label: 'กราฟแท่ง' }]} /></Control>
            </>
          )}
        >
          {!d ? <Skeleton className="h-[240px] w-full" /> : !shares.length ? <p className="py-10 text-center text-[0.90625rem] text-ink-soft">ยังไม่มีเอกสารในช่วงเวลานี้</p> : shareChart === 'donut' ? (
            // วางข้างกันเมื่อ "การ์ด" กว้างพอ (ไม่ใช่ตามจอ) การ์ดแคบจึงเรียงบน-ล่าง ตัวเลขไม่ล้น
            <div className="flex flex-1 flex-col items-center justify-center gap-6 @[600px]:flex-row @[600px]:gap-8">
              <Donut data={shares} format={shareFormat} centerLabel="รวม" />
              <div className="w-full min-w-0 @[600px]:flex-1"><Legend items={shares} format={shareFormat} total={shareTotal} active={hoverShare} onHover={setHoverShare} /></div>
            </div>
          ) : (
            // กราฟแท่งแบบมีแกน: แกน x = เดือน · แกน y = มูลค่า/จำนวน · แต่ละเดือนมีแท่งของแต่ละประเภทวางเคียงกัน
            <div className="flex flex-1 flex-col">
              <div className="mb-4 flex items-end justify-between gap-3 rounded-2xl bg-tile px-4 py-3">
                <div className="min-w-0">
                  <span className="block text-[0.8125rem] text-ink-soft">รวมทั้งหมด</span>
                  <b className="block truncate font-display text-[1.5rem] font-semibold leading-tight tracking-tight tabular-nums">{shareFormat(shareTotal)}</b>
                </div>
                <span className="shrink-0 pb-1 text-[0.84375rem] text-ink-soft">{shares.length} ประเภท</span>
              </div>
              {hasMonthly
                ? <GroupedColumns title="สัดส่วนตามประเภทเอกสารรายเดือน" labels={labels} series={shareSeries} format={shareFormat} yLabel={shareBy === 'total' ? 'บาท' : 'ฉบับ'} />
                : <HBars fill data={shares.map((s) => ({ ...s, sub: pct(s.value, shareTotal) }))} format={shareFormat} />}
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          {/* ---------- สถานะเอกสาร ---------- */}
          <Card title="สถานะเอกสาร" sub={`ทุกฉบับใน ${rangeText} รวม ${statusTotal} ฉบับ`}>
            {!d ? <Skeleton className="h-[120px] w-full" /> : (
              <>
                <StackBar data={statusRows} active={hoverStatus} onHover={setHoverStatus} />
                <StatusTiles items={statusRows} total={statusTotal} active={hoverStatus} onHover={setHoverStatus} />
              </>
            )}
          </Card>

          {/* ---------- คู่ค้าที่มียอดสูงสุด ---------- */}
          <Card className="flex-1" title="คู่ค้าที่มียอดสูงสุด" sub="5 อันดับแรก ตามมูลค่าเอกสาร">
            {!d ? <Skeleton className="h-[120px] w-full" /> : !d.topParties.length ? <p className="py-6 text-center text-[0.90625rem] text-ink-soft">ยังไม่มีข้อมูล</p> : (
              <PartnerRank items={d.topParties} />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
