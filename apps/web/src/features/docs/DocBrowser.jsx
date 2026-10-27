/**
 * DocBrowser.jsx รายการเอกสารพร้อมตัวกรองและมุมมอง ใช้ร่วมกันระหว่าง "เอกสารทั้งหมด" และแท็บ "เอกสารที่ฉันสร้าง" ในคลังเอกสาร
 * ชิปสถานะพร้อมจำนวน · ค้นหาแบบหน่วงเวลา · กรองประเภท/ช่วงวันที่ · ส่งออก CSV / Excel / ZIP
 * มุมมองเล็ก/กลาง (ตาราง) และใหญ่ (การ์ดพร้อมพรีวิวหน้าแรก) · เลือกคอลัมน์ · ดาวน์โหลดรายฉบับเป็น PDF/Excel/CSV/XML
 * จอมือถือ (ต่ำกว่า 640px) มุมมองเล็ก/กลางแสดงเป็นการ์ดรายการแทนตาราง ไม่ต้องเลื่อนซ้ายขวา
 */
import Select from '../../components/Select.jsx';
import DatePicker from '../../components/DatePicker.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { API_URL } from '../../lib/env.js';
import { DOC_LABEL, STATUS_LABEL, baht, inkOfType, thDate, toneOfType } from '../../lib/format.js';
import { docschema } from '../../lib/shared.js';
import Icon from '../../components/Icon.jsx';
import { Card, EmptyState, Skeleton, cx } from '../../components/ui.jsx';
import DownloadMenu from './DownloadMenu.jsx';
import DocPreview from './DocPreview.jsx';
import StatusPill from '../../components/StatusPill.jsx';

const DOT = {
  draft: 'bg-[#A8A29E]', pending: 'bg-[#E0A11B]', approved: 'bg-ok', rejected: 'bg-danger',
  cancelled: 'bg-[#A8A29E]', archived: 'bg-info', issued: 'bg-ok', stored: 'bg-info',
};
const CHIPS = ['', 'draft', 'pending', 'approved', 'rejected', 'cancelled', 'archived'];
const whtType = (t) => ['EWHT', 'PAYMENT', 'PND3', 'PND53', 'WHT'].includes(t);
const partyOf = (d) => (d.received ? `จาก ${d.received.fromName}` : d.party || d.payer || d.buyer || d.payee || '-');
/** ป้ายบอกว่าเป็นเอกสารที่คู่ค้าส่งมา */
const ReceivedTag = () => <span className="inline-flex shrink-0 items-center rounded-full bg-orange-pale px-2 py-0.5 text-[0.75rem] font-semibold text-orange-deep">คู่ค้าส่งมา</span>;
const EXPORT_BTN = 'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 text-[0.90625rem] font-medium text-ink transition-all hover:bg-white hover:shadow-[0_2px_8px_-4px_rgba(24,24,27,0.35)] disabled:cursor-not-allowed disabled:opacity-40';
const amountsOf = (d) => ({
  tax: whtType(d.type) ? d.wht : d.vat,
  total: ['EWHT', 'PAYMENT', 'WHT'].includes(d.type) ? d.net : (d.total ?? d.base),
});

/* ---------- มุมมอง: ขนาด (เล็ก/กลาง/ใหญ่ + พรีวิว) และคอลัมน์ที่แสดง จำไว้ในเครื่องนี้ ---------- */
const VIEW_SIZES = [
  { key: 'sm', label: 'เล็ก', icon: 'menu', title: 'ตารางแบบกะทัดรัด เห็นได้หลายรายการ' },
  { key: 'md', label: 'กลาง', icon: 'table', title: 'ตารางปกติ' },
  { key: 'lg', label: 'ใหญ่', icon: 'grid', title: 'การ์ดพร้อมตัวอย่างเอกสาร' },
];
const COLS = [
  { key: 'base', label: 'ฐาน' },
  { key: 'tax', label: 'ภาษี/VAT' },
  { key: 'total', label: 'รวม' },
  { key: 'status', label: 'สถานะ' },
  { key: 'date', label: 'วันที่' },
];
const DEFAULT_VIEW = { size: 'md', cols: Object.fromEntries(COLS.map((c) => [c.key, true])) };

/**
 * ไฮไลท์ประเภทเอกสาร: กล่องไอคอนพื้นสีอ่อนของประเภทนั้น ใช้ทั้งสามมุมมอง
 * sm = ตารางแบบกะทัดรัด (แถวเตี้ย ย่อกล่องลงให้พอดี) · md = ตารางปกติและการ์ด
 */
function TypeMark({ type, size = 'md' }) {
  const sm = size === 'sm';
  return (
    <span
      aria-hidden="true"
      title={DOC_LABEL[type] || type}
      className={cx('tf-tone-ico flex shrink-0 items-center justify-center rounded-lg', sm ? 'size-6' : 'size-8')}
      style={{ background: `color-mix(in srgb, ${toneOfType(type)} 18%, var(--color-surface))` }}
    >
      <Icon name="file" className={sm ? 'size-[0.8125rem]' : 'size-4'} />
    </span>
  );
}

/**
 * ความกว้างคอลัมน์ (rem) สำหรับ table-fixed: ทุกคอลัมน์กว้างคงที่ตามเนื้อหาจริง คอลัมน์ "เอกสาร" รับพื้นที่ที่เหลือ
 * ตารางจึงพอดีการ์ด คอลัมน์ไม่เบียดกัน (เดิมกว้างตามเนื้อหาจนล้นการ์ด วันที่ถูกคอลัมน์ดาวน์โหลดทับ)
 */
// dl = ปุ่มดาวน์โหลดกว้างคงที่ 8.25rem (MD_W ใน DownloadMenu) + ระยะขอบซ้ายขวา 1.5rem — ปุ่มไม่ล้นไปทับคอลัมน์วันที่
const COL_REM = { no: 10.5, base: 7, tax: 6, total: 7, status: 8, date: 7.5, dl: 9.75 };
const COL_REM_SM = { no: 9.5, base: 6.5, tax: 5.5, total: 6.5, status: 7.5, date: 7, dl: 9.75 };
const DOC_MIN_REM = 11; // คอลัมน์ "เอกสาร" แคบสุด
/** คอลัมน์ที่เลือกแสดงได้ เรียงตามความสำคัญ: การ์ดแคบลงจะซ่อนจากท้ายรายการก่อน (ฐาน → ภาษี → วันที่ → ...) */
const OPTIONAL_PRIORITY = ['status', 'total', 'date', 'tax', 'base'];

/** วัดความกว้าง element ด้วย callback ref (ตารางโผล่ทีหลังได้ เช่น สลับจากมุมมองการ์ดใหญ่มาเป็นตาราง) */
function useBoxWidth() {
  const [el, setEl] = useState(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return undefined;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

/**
 * เลือกคอลัมน์ที่จะแสดงให้พอดีความกว้างการ์ดจริง ตารางจึงไม่ล้นจนต้องเลื่อนแนวนอน
 * (คอลัมน์ดาวน์โหลดที่ตรึงขวาเลยไม่ไปทับคอลัมน์อื่น) · ผู้ใช้ปิดคอลัมน์ไหนไว้ก็ไม่แสดงเหมือนเดิม
 */
function fitColumns(widthPx, cols, W) {
  if (!widthPx) return cols;
  const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  let room = widthPx / rootPx - DOC_MIN_REM - W.no - W.dl;
  const out = {};
  for (const k of OPTIONAL_PRIORITY) {
    if (cols[k] && W[k] <= room) { out[k] = true; room -= W[k]; }
  }
  return out;
}

/** คลาสของแต่ละคอลัมน์ในตาราง ใช้ชุดเดียวกันทั้งหัวตารางและเซลล์ข้อมูล หัวตารางกับค่าข้างล่างจึงตรงกัน */
const COL_CLS = {
  no: 'pl-4 pr-3 text-left',
  doc: 'pr-3 text-left',
  base: 'px-3 text-right',
  tax: 'px-3 text-right',
  total: 'px-3 text-right',
  status: 'px-3 text-left',
  date: 'px-3 text-left',
  // คอลัมน์ดาวน์โหลดตรึงชิดขวาเสมอ ตารางกว้างกว่าการ์ดแล้วเลื่อนแนวนอน ปุ่มก็ยังอยู่ในกรอบ ไม่ตกขอบ
  dl: 'sticky right-0 z-[1] pl-3 pr-3 text-right shadow-[-10px_0_12px_-12px_rgba(24,24,27,0.35)]',
};

function readView(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    if (!v || !VIEW_SIZES.some((s) => s.key === v.size)) return DEFAULT_VIEW;
    return { size: v.size, cols: { ...DEFAULT_VIEW.cols, ...(v.cols || {}) } };
  } catch { return DEFAULT_VIEW; }
}

/**
 * การ์ดเอกสารหนึ่งฉบับบนมือถือ (แทนแถวตาราง): ประเภท + เลขที่ + สถานะ · คู่ค้า · วันที่/ยอดรวม · ปุ่มดาวน์โหลด
 * ค่าที่แสดงตามคอลัมน์ที่เลือกไว้ (cols) เหมือนตาราง · compact = มุมมองเล็ก ซ่อนคู่ค้าและฐาน/ภาษี
 */
function DocCard({ d, cols, compact, onOpen, delay }) {
  const { tax, total } = amountsOf(d);
  return (
    <li>
      <article
        onClick={onOpen}
        className="tf-fade-up tf-tone cursor-pointer rounded-[18px] bg-white p-3.5 ring-1 ring-line"
        style={{ animationDelay: `${delay}ms`, '--tone': 'var(--color-orange)', '--tone-ink': inkOfType(d.type) }}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <TypeMark type={d.type} size={compact ? 'sm' : 'md'} />
          <span className="min-w-0 flex-1">
            <b className="block text-[0.96875rem] font-medium leading-snug [overflow-wrap:anywhere]">{DOC_LABEL[d.type] || d.type}</b>
            <small className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[0.84375rem] text-ink-soft"><span className="truncate">{d.docNo || 'แบบร่าง'}</span>{d.received && <ReceivedTag />}</small>
          </span>
          {cols.status && <span className="shrink-0"><StatusPill status={d.status} size="sm" /></span>}
        </div>
        {!compact && <p className="mt-2 truncate text-[0.875rem] text-ink-soft">{partyOf(d)}</p>}
        {!compact && (cols.base || cols.tax) && (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[0.8125rem]">
            {cols.base && <div className="min-w-0 rounded-lg bg-tile px-2.5 py-1.5"><dt className="text-ink-soft">ฐาน</dt><dd className="truncate font-mono tabular-nums">{baht(d.base)}</dd></div>}
            {cols.tax && <div className="min-w-0 rounded-lg bg-tile px-2.5 py-1.5"><dt className="text-ink-soft">ภาษี/VAT</dt><dd className="truncate font-mono tabular-nums">{baht(tax)}</dd></div>}
          </dl>
        )}
        <div className="mt-2.5 flex items-end justify-between gap-3 border-t border-line pt-2.5">
          <span className="min-w-0">
            {cols.total && <b className="block font-mono text-[1.0625rem] font-semibold tabular-nums text-orange-deep">฿{baht(total)}</b>}
            {cols.date && <small className="block text-[0.8125rem] text-ink-soft">{thDate(d.issueDate || d.createdAt)}</small>}
          </span>
          <DownloadMenu doc={d} />
        </div>
      </article>
    </li>
  );
}

/** ปุ่ม "คอลัมน์" เปิดรายการติ๊กเลือกคอลัมน์ที่จะแสดง (เลขที่และชื่อเอกสารแสดงเสมอ) */
function ColumnPicker({ cols, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !box.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const hidden = COLS.filter((c) => !cols[c.key]).length;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx('flex h-11 items-center gap-2 rounded-full px-3.5 text-[0.90625rem] font-medium transition-colors sm:px-4', open ? 'bg-ink text-white' : 'bg-tile text-ink hover:bg-[#EFEBE7]')}
      >
        <Icon name="table" className="size-4" />คอลัมน์
        {hidden > 0 && <span className={cx('rounded-full px-1.5 text-[0.78125rem]', open ? 'bg-white/20' : 'bg-white')}>ซ่อน {hidden}</span>}
      </button>
      {open && (
        <div className="tf-pop absolute right-0 top-[calc(100%+6px)] z-30 w-56 rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-24px_rgba(24,24,27,0.4)]">
          <p className="px-2 pb-1 pt-1 text-[0.8125rem] text-ink-soft">แสดงคอลัมน์</p>
          {COLS.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-[0.9375rem] hover:bg-tile">
              <input type="checkbox" className="size-4 accent-[var(--color-orange)]" checked={!!cols[c.key]} onChange={(e) => onChange({ ...cols, [c.key]: e.target.checked })} />
              {c.label}
            </label>
          ))}
          <button type="button" onClick={() => onChange(DEFAULT_VIEW.cols)} className="mt-1 w-full rounded-xl px-2 py-2 text-left text-[0.875rem] text-orange-deep hover:bg-orange-pale">แสดงทั้งหมด</button>
        </div>
      )}
    </div>
  );
}

/**
 * scope = all | mine | received (ส่งต่อให้ /api/documents) · onOpenDoc(d) เมื่อกดแถว/การ์ด
 * viewKey = คีย์ localStorage ที่จำมุมมอง (แต่ละหน้าจำแยกกัน)
 * panel = วางในกล่องสีขาวที่มีอยู่แล้ว (คลังเอกสาร): ไม่ห่อด้วย Card และชิปใช้พื้นสีเทาให้เห็นบนพื้นขาว
 */
export default function DocBrowser({ scope = 'all', role, user, onOpenDoc, viewKey = 'tf_docs_view', panel = false }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState(() => readView(viewKey));
  useEffect(() => { try { localStorage.setItem(viewKey, JSON.stringify(view)); } catch { /* ไม่จำก็ได้ */ } }, [view, viewKey]);
  const compact = view.size === 'sm';
  const [tableBox, tableBoxPx] = useBoxWidth();
  const W = compact ? COL_REM_SM : COL_REM;
  const show = fitColumns(tableBoxPx, view.cols, W);
  const cellY = compact ? 'py-2' : 'py-3.5';

  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);

  const all = useQuery({ queryKey: ['documents', 'all-sources', scope], queryFn: () => api.get(`/api/documents?scope=${scope}`) });
  const qs = new URLSearchParams(Object.entries({ scope, q, status, type, from, to }).filter(([, v]) => v));
  const list = useQuery({ queryKey: ['documents', 'list', qs.toString()], queryFn: () => api.get(`/api/documents?${qs}`), placeholderData: (prev) => prev });

  const count = { '': 0 };
  (all.data ? all.data.items : []).forEach((d) => { count[''] += 1; count[d.status] = (count[d.status] || 0) + 1; });
  const items = list.data ? list.data.items : [];
  const types = [...new Set([...docschema.rolesFor(role, { vatRegistered: !!user.vatRegistered }), ...(all.data ? all.data.items.map((d) => d.type) : [])])];

  const exportQs = new URLSearchParams(Object.entries({ status, type }).filter(([, v]) => v)).toString();
  const exportZip = () => {
    const mine = items.filter((d) => !d.received);
    if (!mine.length) return;
    window.location.href = `${API_URL}/api/documents/export-zip?ids=${mine.map((d) => d.id).join(',')}`;
  };

  const chips = (
    <div className="mb-4 flex min-w-0 items-center gap-2">
      {/* ป้าย "สถานะ" กว้างเท่าป้าย "ที่มา" ของหน้าเอกสารทั้งหมด ชิปสองแถวจึงเริ่มตรงกัน */}
      {!panel && <span className="w-10 shrink-0 text-[0.875rem] text-ink-soft">สถานะ</span>}
      <div className="-my-1 flex min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:none]" role="group" aria-label="กรองตามสถานะ">
      {CHIPS.filter((k) => k === '' || count[k]).map((k) => (
        <button
          key={k || 'all'}
          type="button"
          aria-pressed={status === k}
          onClick={() => setStatus(k)}
          className={cx('flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-[0.90625rem] font-medium transition-all duration-200',
            status === k ? 'bg-ink text-white shadow-[0_8px_18px_-10px_rgba(24,24,27,0.6)]' : cx(panel ? 'bg-tile' : 'bg-white', 'text-ink-soft hover:text-ink'))}
        >
          {k && <i className={cx('size-2 rounded-full', DOT[k])} />}
          {k ? STATUS_LABEL[k] : 'ทั้งหมด'}
          <span className={cx('rounded-full px-1.5 text-[0.84375rem]', status === k ? 'bg-white/20' : panel ? 'bg-white' : 'bg-tile')}>{count[k] || 0}</span>
        </button>
      ))}
      </div>
    </div>
  );

  const body = (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="relative w-full min-w-0 sm:w-auto sm:min-w-[220px] sm:flex-1">
          <span className="sr-only">ค้นหาเอกสาร</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-[1.0625rem] -translate-y-1/2 text-ink-soft" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="เลขที่ / คู่ค้า / เลขภาษี" className="h-11 w-full rounded-full bg-tile pl-10 pr-4 text-[0.96875rem] transition-shadow focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange" />
        </label>
        <Select aria-label="ประเภทเอกสาร" value={type} onChange={(e) => setType(e.target.value)} placeholder="ทุกประเภท"
          className="!h-11 !w-full min-w-0 !rounded-full !border-transparent !py-0 text-[0.96875rem] sm:!w-auto sm:min-w-[190px]"
          options={types.map((t) => ({ value: t, label: DOC_LABEL[t] || (docschema.FORMS[t] && docschema.FORMS[t].label) || t }))} />
        <DatePicker aria-label="ตั้งแต่วันที่" placeholder="ตั้งแต่วันที่" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="!h-11 !w-auto min-w-0 flex-1 basis-[7rem] !rounded-full !py-0 sm:flex-none sm:min-w-[10rem]" />
        <DatePicker aria-label="ถึงวันที่" placeholder="ถึงวันที่" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="!h-11 !w-auto min-w-0 flex-1 basis-[7rem] !rounded-full !py-0 sm:flex-none sm:min-w-[10rem]" />
        {/* ส่งออก: ป้ายอยู่เหนือปุ่ม (แถวตัวกรองชิดด้านล่าง ปุ่มจึงตรงแนวกับช่องอื่น) */}
        <div className="flex w-full flex-col gap-1 sm:ml-auto sm:w-auto">
          <span className="text-center text-[0.8125rem] font-medium text-ink-soft" id="export-label">ส่งออกเอกสารทั้งหมด</span>
          <div className="flex items-center justify-between gap-1 rounded-full bg-tile p-1 sm:justify-start" role="group" aria-labelledby="export-label">
          <a className={EXPORT_BTN} href={`${API_URL}/api/export/csv?${exportQs}`} download title="ส่งออกรายการตามตัวกรองเป็น CSV">
            <i className="size-2 rounded-full bg-[#1967D2]" />CSV
          </a>
          <a className={EXPORT_BTN} href={`${API_URL}/api/export/xls?${exportQs}`} download title="ส่งออกรายการตามตัวกรองเป็น Excel">
            <i className="size-2 rounded-full bg-[#188038]" />Excel
          </a>
          <button type="button" className={EXPORT_BTN} onClick={exportZip} disabled={!items.length} title="ส่งออกเอกสารที่แสดงอยู่เป็น PDF/A-3 ในไฟล์ ZIP">
            <Icon name="download" className="size-4 text-orange-deep" />ZIP
          </button>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.90625rem] text-ink-soft">{list.isLoading ? 'กำลังโหลด' : `${items.length} รายการ`}</p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="ขนาดการแสดงผล" className="flex rounded-full bg-tile p-1">
            {VIEW_SIZES.map((v) => (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={view.size === v.key}
                onClick={() => setView((x) => ({ ...x, size: v.key }))}
                title={v.title}
                className={cx('flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.90625rem] font-medium transition-all sm:px-3.5',
                  view.size === v.key ? 'bg-white text-ink shadow-[0_2px_8px_-4px_rgba(24,24,27,0.35)]' : 'text-ink-soft hover:text-ink')}
              >
                <Icon name={v.icon} className="size-4" />{v.label}
              </button>
            ))}
          </div>
          <ColumnPicker cols={view.cols} onChange={(cols) => setView((x) => ({ ...x, cols }))} />
        </div>
      </div>

      {view.size === 'lg' ? (
        <>
          {list.isLoading && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[4/5] w-full rounded-[18px]" />)}
            </div>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
            {items.map((d, i) => {
              const { tax, total } = amountsOf(d);
              return (
                <article
                  key={d.id}
                  onClick={() => onOpenDoc(d)}
                  className="tf-fade-up tf-tone group flex cursor-pointer flex-col rounded-[18px] bg-white p-2.5 ring-1 ring-line"
                  // ขอบและเงาตอนชี้เป็นสีส้มของแบรนด์เหมือนกันทุกการ์ด (ไม่เปลี่ยนตามประเภทเอกสาร)
                  style={{ animationDelay: `${Math.min(i, 10) * 30}ms`, '--tone': 'var(--color-orange)', '--tone-ink': inkOfType(d.type) }}
                >
                  {/* ตัวอย่างเฉพาะครึ่งบนของหน้าแรก (หัวเอกสาร) การ์ดจึงเตี้ยลงจนเห็นข้อมูลและปุ่มด้านล่างในจอเดียว */}
                  {/* ป้ายสถานะอยู่มุมขวาบนของภาพตัวอย่าง ชื่อประเภทและเลขที่เอกสารด้านล่างจึงแสดงได้เต็มความกว้าง */}
                  <div className="relative">
                    <DocPreview doc={d} aspect="aspect-[4/3]" className="transition-transform group-hover:scale-[1.01]" />
                    {view.cols.status && (
                      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-white/95 shadow-[0_2px_8px_-3px_rgba(24,24,27,0.35)]">
                        <StatusPill status={d.status} size="sm" />
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 flex min-w-0 items-start gap-2.5 px-1">
                    <TypeMark type={d.type} size="md" />
                    <span className="min-w-0 flex-1">
                      <b className="block text-[1rem] font-medium leading-snug [overflow-wrap:anywhere]" title={DOC_LABEL[d.type] || d.type}>{DOC_LABEL[d.type] || d.type}</b>
                      <small className="flex min-w-0 items-center gap-1.5 font-mono text-[0.84375rem] text-ink-soft" title={d.docNo || 'แบบร่าง'}><span className="truncate">{d.docNo || 'แบบร่าง'}</span>{d.received && <ReceivedTag />}</small>
                    </span>
                  </div>
                  <p className="mt-1 truncate px-1 text-[0.875rem] text-ink-soft">{partyOf(d)}</p>
                  <dl className="mt-2 space-y-0.5 rounded-xl bg-tile px-3 py-2 text-[0.84375rem]">
                    {view.cols.base && <div className="flex justify-between gap-2"><dt className="text-ink-soft">ฐาน</dt><dd className="font-mono tabular-nums">{baht(d.base)}</dd></div>}
                    {view.cols.tax && <div className="flex justify-between gap-2"><dt className="text-ink-soft">ภาษี/VAT</dt><dd className="font-mono tabular-nums text-ink-soft">{baht(tax)}</dd></div>}
                    {view.cols.date && <div className="flex justify-between gap-2"><dt className="text-ink-soft">วันที่</dt><dd>{thDate(d.issueDate || d.createdAt)}</dd></div>}
                    {view.cols.total && (
                      <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-line pt-1.5">
                        <dt className="font-medium">ยอดรวม</dt>
                        <dd className="font-mono text-[1.03125rem] font-semibold tabular-nums text-orange-deep">{baht(total)}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-auto pt-2.5"><DownloadMenu doc={d} size="lg" /></div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <>
        <ul className="flex flex-col gap-2.5 sm:hidden" aria-label="รายการเอกสาร">
          {list.isLoading && Array.from({ length: 3 }, (_, i) => <li key={i}><Skeleton className="h-28 w-full rounded-[18px]" /></li>)}
          {items.map((d, i) => <DocCard key={d.id} d={d} cols={view.cols} compact={compact} onOpen={() => onOpenDoc(d)} delay={Math.min(i, 10) * 30} />)}
        </ul>
        <div ref={tableBox} className="hidden overflow-x-auto rounded-[18px] ring-1 ring-line sm:block">
          <table
            className={cx('w-full table-fixed text-left', compact ? 'text-[0.90625rem]' : 'text-[0.96875rem]')}
            style={{ minWidth: `${DOC_MIN_REM + W.no + W.dl}rem` }}
          >
            <colgroup>
              <col style={{ width: `${W.no}rem` }} />
              <col />
              {['base', 'tax', 'total', 'status', 'date'].filter((k) => show[k]).map((k) => <col key={k} style={{ width: `${W[k]}rem` }} />)}
              <col style={{ width: `${W.dl}rem` }} />
            </colgroup>
            <thead className="bg-tile text-[0.90625rem] text-ink-soft">
              <tr>
                <th className={cx(COL_CLS.no, 'font-normal', cellY)}>เลขที่</th>
                <th className={cx(COL_CLS.doc, 'font-normal', cellY)}>เอกสาร</th>
                {show.base && <th className={cx(COL_CLS.base, 'font-normal', cellY)}>ฐาน</th>}
                {show.tax && <th className={cx(COL_CLS.tax, 'font-normal', cellY)}>ภาษี/VAT</th>}
                {show.total && <th className={cx(COL_CLS.total, 'font-normal', cellY)}>รวม</th>}
                {show.status && <th className={cx(COL_CLS.status, 'font-normal', cellY)}>สถานะ</th>}
                {show.date && <th className={cx(COL_CLS.date, 'whitespace-nowrap font-normal', cellY)}>วันที่</th>}
                <th className={cx(COL_CLS.dl, 'bg-tile font-normal', cellY)}>ดาวน์โหลด</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-t border-line"><td colSpan={8} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td></tr>
              ))}
              {items.map((d, i) => {
                const { tax, total } = amountsOf(d);
                return (
                  <tr key={d.id} onClick={() => onOpenDoc(d)} className="tf-fade-up tf-tone-tr cursor-pointer border-t border-line bg-white align-middle" style={{ animationDelay: `${Math.min(i, 10) * 30}ms`, '--tone': toneOfType(d.type), '--tone-ink': inkOfType(d.type) }}>
                    <td className={cx(COL_CLS.no, 'truncate whitespace-nowrap font-mono', compact ? 'text-[0.875rem]' : 'text-[0.9375rem]', cellY)}>{d.docNo || 'แบบร่าง'}</td>
                    <td className={cx(COL_CLS.doc, cellY)}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <TypeMark type={d.type} size={compact ? 'sm' : 'md'} />
                        <span className="min-w-0">
                          <b className="flex min-w-0 items-center gap-1.5 font-medium"><span className="truncate">{DOC_LABEL[d.type] || d.type}</span>{d.received && <ReceivedTag />}</b>
                          {!compact && <small className="block truncate text-[0.875rem] text-ink-soft">{partyOf(d)}</small>}
                        </span>
                      </span>
                    </td>
                    {show.base && <td className={cx(COL_CLS.base, 'font-mono tabular-nums', cellY)}>{baht(d.base)}</td>}
                    {show.tax && <td className={cx(COL_CLS.tax, 'font-mono tabular-nums text-ink-soft', cellY)}>{baht(tax)}</td>}
                    {show.total && <td className={cx(COL_CLS.total, 'font-mono font-medium tabular-nums', cellY)}>{baht(total)}</td>}
                    {show.status && (
                      <td className={cx(COL_CLS.status, 'overflow-hidden', cellY)}>
                        <StatusPill status={d.status} size="sm" />
                        {!compact && d.sentTo && d.status === 'pending' && <small className="mt-0.5 block truncate whitespace-nowrap text-[0.84375rem] text-ink-soft" title={`ส่งถึง ${d.sentTo.name}`}>ส่งถึง {d.sentTo.name}</small>}
                      </td>
                    )}
                    {show.date && <td className={cx(COL_CLS.date, 'truncate whitespace-nowrap text-ink-soft', cellY)}>{thDate(d.issueDate || d.createdAt)}</td>}
                    <td className={cx(COL_CLS.dl, '[background:inherit]', compact ? 'py-1.5' : 'py-2.5')}><DownloadMenu doc={d} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      {!list.isLoading && !items.length && (
        <EmptyState
          compact={panel}
          title={count[''] ? 'ไม่พบเอกสารที่ตรงเงื่อนไข' : 'ยังไม่มีเอกสาร'}
          text={count[''] ? 'ลองเปลี่ยนคำค้น ตัวกรอง หรือช่วงวันที่' : 'เริ่มสร้างเอกสารฉบับแรก ระบบแนะนำขั้นตอนให้ทีละขั้น'}
          action={!count[''] && <Link to="/app/create" className="tf-btn tf-btn-dark">สร้างเอกสาร</Link>}
        />
      )}
    </>
  );

  return (
    <>
      {chips}
      {panel ? body : <Card bodyClassName="!p-4 sm:!p-5">{body}</Card>}
    </>
  );
}
