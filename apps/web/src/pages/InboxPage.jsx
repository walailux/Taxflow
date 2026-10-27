/**
 * InboxPage.jsx กล่องรับเอกสาร: เอกสารที่คู่ค้าส่งมาให้ลงนาม/ตรวจสอบ (ที่ได้รับ) และคำขอที่ส่งออกไป (ที่ฉันส่งออก)
 * ลงนามด้วยคลังลายเซ็นของบัญชีตนเอง วาดใหม่ หรือแนบรูป แล้วยืนยันด้วย OTP ทุกครั้ง
 * ฝั่งซ้ายเป็นรายการ (ค้นหา/กรอง/เรียง เก็บใน URL) ฝั่งขวาเป็นรายละเอียดของรายการที่เลือก
 */
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '../lib/api.js';
import { API_URL } from '../lib/env.js';
import { DOC_LABEL, TYPE_INK, TYPE_TONE, inkOfType, thDate, thDateTime, thb, toneOfType } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Icon from '../components/Icon.jsx';
import { Button, Card, EmptyState, PageHeader, Skeleton, Spinner, TextField, cx } from '../components/ui.jsx';
import OtpDialog from '../features/docs/OtpDialog.jsx';
import SignaturePad from '../features/docs/SignaturePad.jsx';
import { docsApi } from '../features/docs/docsApi.js';
import { loadPdfjs } from '../features/docs/DocPreview.jsx';
import { goView } from '../features/app/ViewLink.jsx';

const RQ = {
  sent: ['รอดำเนินการ', 'bg-[#FFF4DB] text-[#8A5A00]'],
  signed: ['ลงนามแล้ว', 'bg-ok-soft text-ok'],
  approved: ['ตรวจแล้วผ่าน', 'bg-ok-soft text-ok'],
  declined: ['ตีกลับแล้ว', 'bg-danger-soft text-danger'],
  cancelled: ['ผู้ส่งยกเลิก', 'bg-tile text-ink-soft'],
};

function SignDialog({ req, user, onClose, onSigned }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(user.displayName || '');
  const [otp, setOtp] = useState(null);
  const saved = useQuery({ queryKey: ['signatures'], queryFn: docsApi.savedSignatures });

  function sign(image, fallbackName, keep) {
    const signerName = name.trim() || fallbackName;
    if (!signerName) { toast('กรุณากรอกชื่อผู้ลงนาม', 'err'); return; }
    setOtp({
      action: (otpId, code) => api.post(`/api/requests/${Number(req.id)}/sign`, { signerName, image, otpId, code }),
      onDone: async () => {
        if (keep) await docsApi.saveSignature({ name: signerName, image }).catch(() => {});
        void qc.invalidateQueries({ queryKey: ['signatures'] });
        toast('ลงนามและส่งกลับให้ผู้ส่งเรียบร้อย');
        onSigned();
      },
    });
  }

  // วาดที่ document.body: ถ้าอยู่ใต้ element ที่มี backdrop-filter/transform กล่อง fixed จะถูกจำกัดอยู่ในกรอบนั้น
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="rq-sign-title" className="tf-pop max-h-[92vh] w-full max-w-[600px] overflow-y-auto rounded-t-[28px] bg-white p-6 sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[0.9375rem] text-orange-deep">{req.doc && req.doc.docNo}</p>
            <h2 id="rq-sign-title" className="text-[1.375rem] font-medium">ลงนามเอกสาร</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-tile text-ink-soft hover:text-ink"><Icon name="close" /></button>
        </div>
        <TextField id="rq-signer" label="ชื่อผู้ลงนาม" value={name} onChange={(e) => setName(e.target.value)} />
        <SignaturePad
          savedItems={(saved.data && saved.data.items) || []}
          loadingSaved={saved.isLoading}
          onUseSaved={(s) => sign(s.image, s.name, false)}
          onDeleteSaved={async (id) => { await docsApi.delSignature(id).catch(() => {}); void qc.invalidateQueries({ queryKey: ['signatures'] }); }}
          onSign={sign}
          signerName={name}
        />
      </div>
      {otp && (
        <OtpDialog purpose="sign-request" refId={req.id} title="ยืนยันการลงลายมือชื่อดิจิทัล" action={otp.action} onDone={otp.onDone} onCancel={() => setOtp(null)} />
      )}
    </div>,
    document.body,
  );
}

const PAGE = 10;

/** สีประจำประเภทเอกสาร (ชุดกลางใน lib/format.js ใช้ร่วมกับหน้าเอกสารทั้งหมด) */
const toneOf = (r) => toneOfType(r && r.doc && r.doc.type);   // สีสด: แถบ ไอคอน เงา พื้นอ่อน
const inkOf = (r) => inkOfType(r && r.doc && r.doc.type);     // เฉดเข้ม: ตัวอักษร
/** สีเน้นของยอดเงินในสรุปเอกสาร อิงชุดสีเดียวกัน จะได้ไม่มีสีแปลกปลอมโผล่ในแผงขวา */
const SUM_TONE = { wht: TYPE_INK.EWHT, payment: TYPE_INK.PAYMENT, contract: TYPE_INK.CONTRACT_INF };
const docNameOf = (r) => DOC_LABEL[r.doc && r.doc.type] || (r.doc && r.doc.type) || 'เอกสาร';
const PND_LABEL = { PND3: 'ภ.ง.ด.3', PND53: 'ภ.ง.ด.53', PND1A: 'ภ.ง.ด.1ก', PND1A_SP: 'ภ.ง.ด.1ก พิเศษ', PND2: 'ภ.ง.ด.2', PND2A: 'ภ.ง.ด.2ก', PND3A: 'ภ.ง.ด.3ก' };
const PAY_LABEL = { cash: 'เงินสด', transfer: 'โอนเงิน', cheque: 'เช็ค', other: 'อื่น ๆ' };

/** กล่องรับ (ได้รับ) กับกล่องส่งออก ใช้หน้าจอเดียวกัน ต่างกันที่ข้อความและปุ่มดำเนินการ */
const BOX = {
  in: {
    who: (r) => r.fromName, whoEmail: (r) => r.fromEmail, whoLabel: 'ผู้ส่ง', prefix: 'จาก',
    todo: 'รอคุณดำเนินการ', done: 'ตอบกลับแล้ว',
    waiting: (r) => (r.purpose === 'sign' ? 'รอลงนาม' : 'รอตรวจสอบ'),
    cancelled: 'ผู้ส่งยกเลิก',
  },
  out: {
    who: (r) => r.toName, whoEmail: (r) => r.toEmail, whoLabel: 'ผู้รับ', prefix: 'ถึง',
    todo: 'รอคู่ค้าตอบกลับ', done: 'คู่ค้าตอบแล้ว',
    waiting: (r) => (r.purpose === 'sign' ? 'รอคู่ค้าลงนาม' : 'รอคู่ค้าตรวจ'),
    cancelled: 'ยกเลิกคำขอแล้ว',
  },
};

const FILTER_MATCH = {
  all: () => true,
  todo: (r) => r.status === 'sent',
  late: (r) => r.status === 'sent' && r.overdue,
  done: (r) => r.status !== 'sent',
};

/** ป้ายสถานะของคำขอ (ค้างอยู่ = ส้ม/แดง ตอบแล้ว = ตามผล) */
function StatusBadge({ r, box, className }) {
  const cls = 'whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8125rem] font-medium';
  if (r.status === 'sent') {
    return <span className={cx(cls, r.overdue ? 'bg-danger-soft text-danger' : 'bg-orange-pale text-orange-deep', className)}>{r.overdue ? 'เกินกำหนด' : BOX[box].waiting(r)}</span>;
  }
  if (r.status === 'cancelled') return <span className={cx(cls, 'bg-tile text-ink-soft', className)}>{BOX[box].cancelled}</span>;
  const [label, tone] = RQ[r.status] || [r.status, 'bg-tile text-ink-soft'];
  return <span className={cx(cls, tone, className)}>{label}</span>;
}

/**
 * ดรอปดาวน์ที่ออกแบบเอง แทน <select> ของระบบ (เมนูของเบราว์เซอร์เป็นแถบสีฟ้าเหลี่ยม ไม่เข้ากับหน้าเว็บ)
 * เปิดด้วยคลิก/Enter/Space เลื่อนด้วยลูกศร เลือกด้วย Enter ปิดด้วย Esc หรือคลิกนอกกล่อง
 */
function Dropdown({ label, value, options, onChange, icon, className }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const cur = options.find((o) => o.value === value) || options[0];
  useEffect(() => {
    if (!open) return undefined;
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, options, value]);
  const pick = (o) => { onChange(o.value); setOpen(false); };
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); return; }
    if (!open && ['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(options.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); pick(options[hi]); }
  }
  return (
    <div ref={box} className={cx('relative', className)}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)} onKeyDown={onKey}
        className={cx('flex h-11 w-full cursor-pointer items-center gap-2 rounded-full border-[1.5px] bg-field pl-4 pr-3 text-left text-[0.9375rem] transition-colors',
          open ? 'border-orange bg-white' : 'border-transparent hover:bg-[#EFEDEA]')}>
        {icon && <Icon name={icon} className="size-[1.0625rem] shrink-0 text-ink-soft" />}
        {cur.color && <i className="size-2.5 shrink-0 rounded-full" style={{ background: cur.color }} />}
        <span className="min-w-0 flex-1 truncate">{cur.label}</span>
        <svg viewBox="0 0 24 24" className={cx('size-4 shrink-0 text-ink-soft transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <ul role="listbox" aria-label={label} className="tf-pop absolute right-0 z-30 mt-2 max-h-72 min-w-full overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_60px_-24px_rgba(24,24,27,0.45)]">
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={on} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                className={cx('flex cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-[0.9375rem]', hi === i ? 'bg-tile' : '', on ? 'font-medium text-ink' : 'text-ink-soft')}>
                {o.color ? <i className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} /> : <i className="size-2.5 shrink-0" />}
                <span className="flex-1">{o.label}</span>
                {o.count != null && <span className="rounded-full bg-tile px-2 text-[0.75rem] font-semibold leading-5 text-ink-soft">{o.count}</span>}
                {on && <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-orange-deep" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * แถวคำขอในรายการฝั่งซ้าย: กดแล้วแสดงรายละเอียดที่แผงขวา
 * คำขอที่รอเราทำอยู่มีปุ่มลัด (ลงนาม / ตรวจผ่าน) อยู่ในแถวเลย ไม่ต้องเปิดแผงขวาแล้วเลื่อนไปหาปุ่มท้ายแผง
 * คำขอ "ตรวจสอบ" ที่ค้างอยู่มีช่องติ๊กไว้ตรวจผ่านหลายรายการพร้อมกัน
 */
function RequestRow({ r, box, active, onSelect, checkable, checked, onCheck, quick }) {
  const late = r.status === 'sent' && r.overdue;
  return (
    // แถวที่เลือกและเงาตอนชี้เมาส์ใช้สีประจำประเภทของเอกสารฉบับนั้น (ส่งผ่านตัวแปร --tone ให้คลาส .tf-tone)
    <div id={`rq-${r.id}`} data-active={active ? 'true' : 'false'}
      style={{ scrollMarginTop: 340, scrollMarginBottom: 24, '--tone': toneOf(r), '--tone-ink': inkOf(r) }}
      className={cx('tf-tone relative flex items-center overflow-hidden rounded-2xl',
        active ? '' : late ? 'bg-danger-soft/40 ring-1 ring-danger/30' : 'bg-white ring-1 ring-line shadow-[0_2px_8px_-4px_rgba(24,24,27,0.12)]')}>
      <span aria-hidden="true" className="tf-tone-bar absolute inset-y-0 left-0 w-1" />
      {checkable && (
        <label className="flex cursor-pointer self-stretch items-center pl-4 pr-1" title="เลือกเพื่อตรวจผ่านหลายรายการพร้อมกัน">
          <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`เลือก ${r.doc && r.doc.docNo}`} className="size-[1.125rem] cursor-pointer accent-[var(--color-orange)]" />
        </label>
      )}
      <button type="button" onClick={onSelect} aria-current={active ? 'true' : undefined}
        className={cx('flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pr-2 text-left', checkable ? 'pl-2' : 'pl-4')}>
        <span className="tf-tone-ico shrink-0"><Icon name="file" className="size-[1.375rem]" strokeWidth={1.6} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <b className="truncate text-[0.96875rem] font-medium" style={{ color: inkOf(r) }}>{docNameOf(r)}</b>
            <span className="shrink-0 font-mono text-[0.78125rem] text-ink-soft">{r.doc && r.doc.docNo}</span>
          </span>
          <span className="block truncate text-[0.875rem] text-ink-soft">{BOX[box].prefix} <span className="text-ink">{BOX[box].who(r)}</span></span>
          <span className="mt-0.5 flex flex-wrap gap-x-3 text-[0.8125rem] text-ink-soft">
            {r.doc && r.doc.total ? <b className="font-mono font-medium text-ink">{thb(r.doc.total)}</b> : null}
            {r.dueDate && r.status === 'sent' ? <span className={late ? 'font-medium text-danger' : ''}>กำหนด {thDate(r.dueDate)}</span> : <span>{thDate(r.sentAt)}</span>}
          </span>
        </span>
      </button>
      {/* คลิกตรงป้ายสถานะให้เลือกแถวได้เหมือนกัน จะได้ไม่มีช่องตายทางขวาของแถว */}
      <span role="presentation" onClick={onSelect} className="flex shrink-0 flex-col items-end justify-center gap-1.5 self-stretch py-3 pr-3">
        <StatusBadge r={r} box={box} />
        {quick && (
          <button type="button" onClick={(e) => { e.stopPropagation(); quick.run(); }} title={quick.title}
            className="cursor-pointer whitespace-nowrap rounded-full bg-ink px-3.5 py-1 text-[0.84375rem] font-medium text-white transition-colors hover:bg-ink/85">
            {quick.label}
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * ภาพหน้าแรกของเอกสารในคำขอ (วาดด้วย pdf.js ตัวเดียวกับหน้าเอกสารทั้งหมด)
 * โหลดเมื่อเลื่อนมาถึงกรอบภาพเท่านั้น สลับรายการเร็ว ๆ จึงไม่สั่งสร้าง PDF ทุกฉบับที่ผ่าน
 */
const previewCache = new Map();
function RequestPreview({ r }) {
  const key = `${r.id}:${r.status}`;
  const [src, setSrc] = useState(() => previewCache.get(key) || '');
  const [state, setState] = useState(src ? 'done' : 'idle');
  const box = useRef(null);
  useEffect(() => {
    if (previewCache.has(key)) { setSrc(previewCache.get(key)); setState('done'); return undefined; }
    let cancelled = false;
    setSrc(''); setState('idle');
    const load = async () => {
      setState('loading');
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/requests/${Number(r.id)}/pdf`, { credentials: 'include', headers });
      if (!res.ok || !(res.headers.get('Content-Type') || '').includes('pdf')) throw new Error('load');
      const pdfjs = await loadPdfjs();
      const task = pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) });
      try {
        const page = await (await task.promise).getPage(1);
        const width = (box.current && box.current.clientWidth) || 420;
        const scale = (width * Math.min(window.devicePixelRatio || 1, 2)) / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.85);
      } finally { task.destroy(); }
    };
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      load().then((url) => { previewCache.set(key, url); if (!cancelled) { setSrc(url); setState('done'); } })
        .catch(() => { if (!cancelled) setState('error'); });
    }, { rootMargin: '120px' });
    if (box.current) io.observe(box.current);
    return () => { cancelled = true; io.disconnect(); };
  }, [key, r.id]);
  return (
    <a ref={box} href={`${API_URL}/api/requests/${Number(r.id)}/pdf`} target="_blank" rel="noreferrer" title="เปิด PDF ฉบับเต็มในแท็บใหม่"
      className="group relative block aspect-[210/297] overflow-hidden rounded-2xl bg-tile ring-1 ring-line">
      {src && <img src={src} alt={`หน้าแรกของ ${docNameOf(r)}`} className="size-full object-cover object-top transition-transform group-hover:scale-[1.01]" />}
      {(state === 'loading' || state === 'idle') && <span className="absolute inset-0 flex items-center justify-center gap-2 text-[0.875rem] text-ink-soft">{state === 'loading' && <Spinner />} {state === 'loading' ? 'กำลังโหลดตัวอย่าง' : 'ตัวอย่างเอกสาร'}</span>}
      {state === 'error' && <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[0.875rem] text-ink-soft"><Icon name="file" className="size-6" />แสดงตัวอย่างไม่ได้ กดเพื่อเปิด PDF</span>}
      <span className="absolute bottom-3 right-3 rounded-full bg-ink/80 px-3 py-1 text-[0.78125rem] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">เปิดฉบับเต็ม</span>
    </a>
  );
}

/** ข้อมูลสำคัญของเอกสารตามประเภท (มาจาก doc.summary ที่ API สรุปไว้ให้) */
function DocSummary({ r }) {
  const s = r.doc && r.doc.summary;
  if (!s) return null;
  const Row = ({ k, v, strong, tone }) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-[0.875rem] text-ink-soft">{k}</dt>
      <dd className={cx('text-right text-[0.90625rem]', strong ? 'font-semibold' : 'font-medium')} style={tone ? { color: tone } : undefined}>{v}</dd>
    </div>
  );
  const ItemList = ({ items }) => (items && items.length ? (
    <ul className="mt-2 divide-y divide-line rounded-xl bg-tile/60 px-3">
      {items.map((x, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[0.875rem]">
          <span className="min-w-0">{x.name}{x.qty !== '' && x.qty != null ? <span className="text-ink-soft"> · {x.qty} {x.unit}</span> : null}</span>
          {x.amount ? <span className="shrink-0 font-mono">{thb(x.amount)}</span> : null}
        </li>
      ))}
    </ul>
  ) : null);
  let body;
  if (s.kind === 'wht') {
    body = (
      <dl className="divide-y divide-line">
        <Row k="ประเภทเงินได้" v={`${s.incomeDesc || '-'}${s.incomeType ? ` (${s.incomeType})` : ''}`} />
        <Row k="วันที่จ่ายเงิน" v={s.payDate ? thDate(s.payDate) : '-'} />
        <Row k="เงินได้ก่อนหักภาษี" v={<span className="font-mono">{thb(s.amount)}</span>} />
        <Row k={`ภาษีที่ถูกหัก ณ ที่จ่าย (${s.rate}%)`} v={<span className="font-mono">{thb(s.wht)}</span>} strong tone={SUM_TONE.wht} />
        {s.pndForm && <Row k="ผู้จ่ายนำส่งใน" v={PND_LABEL[s.pndForm] || s.pndForm} />}
      </dl>
    );
  } else if (s.kind === 'payment') {
    body = (
      <>
        <dl className="divide-y divide-line">
          <Row k="ยอดก่อนหักภาษี" v={<span className="font-mono">{thb(s.base)}</span>} />
          {s.rate > 0 && <Row k={`หัก ณ ที่จ่าย (${s.rate}%)`} v={<span className="font-mono">-{thb(s.wht)}</span>} />}
          <Row k="ยอดโอนสุทธิ" v={<span className="font-mono">{thb(s.net)}</span>} strong tone={SUM_TONE.payment} />
          <Row k="วันที่จ่าย" v={`${s.payDate ? thDate(s.payDate) : '-'}${s.payMethod ? ` · ${PAY_LABEL[s.payMethod] || s.payMethod}` : ''}`} />
          {s.transferRef && <Row k="เลขอ้างอิงการโอน" v={<span className="font-mono">{s.transferRef}</span>} />}
        </dl>
        <ItemList items={s.items.map((x) => ({ ...x, qty: '' }))} />
      </>
    );
  } else if (s.kind === 'contract') {
    body = (
      <dl className="divide-y divide-line">
        {s.campaign && <Row k="แคมเปญ" v={s.campaign} />}
        <Row k="ระยะเวลาสัญญา" v={`${thDate(s.startDate)} – ${thDate(s.endDate)}`} />
        {s.submitDate && <Row k="ส่งงาน (Draft)" v={thDate(s.submitDate)} />}
        {s.postDate && <Row k="วันที่ต้องโพสต์" v={thDate(s.postDate)} />}
        {s.contentCount > 0 && <Row k="ชิ้นงาน" v={`${s.contentCount} ชิ้น${s.platforms.length ? ` · ${s.platforms.join(', ')}` : ''}`} />}
        <Row k="ค่าจ้าง" v={<span className="font-mono">{thb(s.fee)}</span>} strong tone={SUM_TONE.contract} />
        <Row k="การชำระ" v={`${s.installmentCount} งวด${s.whtRate > 0 ? ` · หัก ณ ที่จ่าย ${s.whtRate}% (${thb(s.wht)})` : ''}`} />
      </dl>
    );
  } else {
    body = (
      <>
        <dl className="divide-y divide-line">
          {s.vat > 0 && <Row k="มูลค่าก่อน VAT" v={<span className="font-mono">{thb(s.base)}</span>} />}
          {s.vat > 0 && <Row k="ภาษีมูลค่าเพิ่ม" v={<span className="font-mono">{thb(s.vat)}</span>} />}
          <Row k="ยอดรวม" v={<span className="font-mono">{thb(s.total)}</span>} strong tone={inkOf(r)} />
          {s.dueDate && <Row k="วันครบกำหนด / ส่งมอบ" v={thDate(s.dueDate)} />}
        </dl>
        <ItemList items={s.items} />
      </>
    );
  }
  return (
    <section className="rounded-2xl border border-line p-4">
      <p className="mb-1 text-[0.78125rem] font-medium text-ink-soft">รายละเอียดเอกสาร</p>
      {body}
    </section>
  );
}

/** แผงรายละเอียดฝั่งขวา */
function RequestDetail({ r, box, onSign, onApprove, onDecline, onCancelReq, onSaveLibrary, onCalendar, onOpenDoc, onClose, saving }) {
  const actionable = r.status === 'sent';
  const tone = toneOf(r);
  const B = BOX[box];
  const facts = [
    [B.whoLabel, <>{B.who(r)}<span className="block text-[0.8125rem] font-normal text-ink-soft">{B.whoEmail(r)}</span></>],
    ['คำขอ', `${r.purpose === 'sign' ? 'ขอให้ลงนาม' : 'ขอให้ตรวจสอบ'}${r.signAs ? ` ในฐานะ${r.signAs}` : ''}`],
    ['ยอดเงิน', r.doc && r.doc.total ? <span className="font-mono">{thb(r.doc.total)}</span> : '-'],
    ['กำหนดตอบกลับ', r.dueDate ? <span className={r.overdue && actionable ? 'text-danger' : ''}>{thDate(r.dueDate)}{r.overdue && actionable ? ' (เกินกำหนด)' : ''}</span> : 'ไม่ระบุ'],
  ];
  const due = r.dueDate ? Math.round((Date.parse(r.dueDate + 'T00:00:00+07:00') - Date.now()) / 86400000) : null;
  const them = box === 'in' ? 'คุณ' : r.toName;
  const timeline = [
    { at: r.sentAt, title: box === 'in' ? 'ได้รับเอกสาร' : 'ส่งเอกสารแล้ว', text: box === 'in' ? `${r.fromName} ส่ง${docNameOf(r)}ถึงคุณ` : `คุณส่ง${docNameOf(r)}ถึง ${r.toName}`, color: inkOf(r), glyph: 'M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z' },
    r.respondedAt && (r.status === 'declined'
      ? { at: r.respondedAt, title: 'ตีกลับแล้ว', text: `${them}ตีกลับเอกสารพร้อมแจ้งเหตุผล`, color: '#DC2626', glyph: 'M7 7l10 10M17 7L7 17' }
      : { at: r.respondedAt, title: r.status === 'signed' ? 'ลงนามแล้ว' : 'ตรวจสอบผ่าน', text: r.status === 'signed' ? `${them}ลงลายมือชื่อดิจิทัลและส่งกลับแล้ว` : `${them}แจ้งผลตรวจสอบ (ผ่าน) แล้ว`, color: '#16A34A', glyph: 'M5 12.5l4.5 4.5L19 7.5' }),
    r.status === 'cancelled' && { at: null, title: B.cancelled, text: box === 'in' ? 'คำขอนี้ถูกยกเลิกโดยผู้ส่ง ไม่ต้องดำเนินการต่อ' : 'คุณยกเลิกคำขอนี้แล้ว', color: '#A8A29E', glyph: 'M6 12h12' },
    actionable && { at: null, pending: true, title: box === 'in' ? `รอคุณ${r.purpose === 'sign' ? 'ลงนาม' : 'ตรวจสอบ'}` : `รอ ${r.toName} ${r.purpose === 'sign' ? 'ลงนาม' : 'ตรวจสอบ'}`,
      text: due == null ? 'ยังไม่ได้ระบุกำหนดตอบกลับ' : due < 0 ? `เกินกำหนดมาแล้ว ${-due} วัน` : due === 0 ? 'ครบกำหนดวันนี้' : `เหลืออีก ${due} วันก่อนครบกำหนด`,
      color: r.overdue ? '#DC2626' : '#E85A00', glyph: 'M12 7.5V12l3 2' },
  ].filter(Boolean);
  return (
    <div className="tf-fade-up flex h-full flex-col">
      <div className="relative overflow-hidden border-b border-line bg-tile/60 px-5 pb-4 pt-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ring-line" style={{ color: tone }}>
              <Icon name="file" className="size-[1.375rem]" strokeWidth={1.6} />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[0.84375rem] font-medium" style={{ color: inkOf(r) }}>{r.doc && r.doc.docNo}</p>
              <h2 className="text-[1.25rem] font-medium leading-tight">{docNameOf(r)}</h2>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge r={r} box={box} />
            {onClose && <button type="button" onClick={onClose} aria-label="ปิดรายละเอียด" className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/80 text-ink-soft hover:text-ink lg:hidden"><Icon name="close" className="size-4" /></button>}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        <dl className="grid grid-cols-2 gap-2.5">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-tile/70 px-3.5 py-2.5">
              <dt className="text-[0.84375rem] text-ink-soft">{k}</dt>
              <dd className="text-[0.96875rem] font-medium leading-snug">{v}</dd>
            </div>
          ))}
        </dl>

        {r.message && (
          <div className="rounded-2xl border border-line p-3.5">
            <p className="mb-1 text-[0.78125rem] font-medium text-ink-soft">ข้อความจากผู้ส่ง</p>
            <p className="text-[0.9375rem] leading-relaxed">“{r.message}”</p>
          </div>
        )}
        {r.declineReason && <p className="rounded-2xl bg-danger-soft px-3.5 py-2.5 text-[0.90625rem] text-danger"><b className="font-medium">เหตุผลที่ตีกลับ:</b> {r.declineReason}</p>}

        <DocSummary r={r} />

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[0.78125rem] font-medium text-ink-soft">ลำดับเหตุการณ์</p>
            {actionable && r.dueDate && (
              <button type="button" onClick={() => onCalendar(r)} className="inline-flex cursor-pointer items-center gap-1 text-[0.8125rem] font-medium text-orange-deep hover:underline">
                <Icon name="calendar" className="size-4" />ดูในปฏิทินงาน
              </button>
            )}
          </div>
          <ol className="rounded-2xl border border-line p-4">
            {timeline.map((t, i) => {
              const last = i === timeline.length - 1;
              return (
                <li key={i} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full', t.pending ? 'border-2 border-dashed bg-white' : 'text-white shadow-[0_6px_14px_-8px_rgba(24,24,27,0.7)]')}
                      style={t.pending ? { borderColor: t.color, color: t.color } : { background: t.color }}>
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {t.pending ? <><circle cx="12" cy="12" r="8.5" /><path d={t.glyph} /></> : <path d={t.glyph} />}
                      </svg>
                    </span>
                    {!last && <span aria-hidden="true" className="my-1 w-0.5 flex-1 rounded-full" style={{ background: `linear-gradient(${t.color}, ${timeline[i + 1].color})`, opacity: 0.35 }} />}
                  </div>
                  <div className={cx('min-w-0 flex-1', !last && 'pb-4')}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-[0.9375rem] font-medium" style={t.pending ? { color: t.color } : undefined}>{t.title}</p>
                      {t.at && <time className="text-[0.78125rem] text-ink-soft" dateTime={t.at}>{thDateTime(t.at)}</time>}
                    </div>
                    <p className="text-[0.84375rem] leading-snug text-ink-soft">{t.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <RequestPreview r={r} />
      </div>

      {/* งานหลักอยู่บรรทัดบนเต็มความกว้าง ปุ่มรองอยู่บรรทัดล่าง จะได้ไม่ต้องกวาดตาหาปุ่มที่ต้องกดในแถวเดียวกัน */}
      <div className="space-y-2 border-t border-line px-5 py-3.5 sm:px-6">
        {box === 'in' && actionable && (
          <Button variant="dark" block className="!py-2.5 text-[1rem]" onClick={() => (r.purpose === 'sign' ? onSign(r) : onApprove(r))}>
            {r.purpose === 'sign' ? 'ลงนามเอกสาร' : 'ตรวจแล้ว ผ่าน'}
          </Button>
        )}
        {box === 'out' && <Button variant="dark" block className="!py-2.5 text-[1rem]" onClick={() => onOpenDoc(r)}>ไปที่เอกสาร</Button>}
        <div className="flex flex-wrap gap-2">
          <a className="tf-btn tf-btn-soft !px-4 !py-2 text-[0.9375rem]" href={`${API_URL}/api/requests/${Number(r.id)}/pdf`} target="_blank" rel="noreferrer">เปิด PDF</a>
          {box === 'in' && r.status !== 'cancelled' && (
            r.savedToLibrary
              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-4 py-2 text-[0.90625rem] font-medium text-ok"><Icon name="check" className="size-4" />อยู่ในคลังแล้ว</span>
              : <Button variant="soft" className="!px-4 !py-2 text-[0.9375rem]" loading={saving} onClick={() => onSaveLibrary(r)}>เก็บเข้าคลัง</Button>
          )}
          {box === 'in' && actionable && <Button variant="ghost" className="ml-auto !px-4 !py-2 text-[0.9375rem] !text-danger hover:!border-danger" onClick={() => onDecline(r)}>ตีกลับ</Button>}
          {box === 'out' && actionable && <Button variant="ghost" className="ml-auto !px-4 !py-2 text-[0.9375rem] !text-danger hover:!border-danger" onClick={() => onCancelReq(r)}>ยกเลิกคำขอ</Button>}
        </div>
      </div>
    </div>
  );
}

const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function InboxPage() {
  const { user, role } = useOutletContext();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [signing, setSigning] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState(false); // จอเล็ก: แผงรายละเอียดเปิดเป็นแผ่นเลื่อนขึ้นจากด้านล่าง
  const [checked, setChecked] = useState(() => new Set());
  const [saving, setSaving] = useState(null);
  const searchRef = useRef(null);

  // สถานะหน้าจอทั้งหมดเก็บใน URL: รีเฟรช กดย้อนกลับ หรือแชร์ลิงก์แล้วได้หน้าจอเดิม
  const box = params.get('box') === 'out' ? 'out' : 'in';
  const filter = FILTER_MATCH[params.get('tab')] ? params.get('tab') : 'all';
  const search = params.get('q') || '';
  const type = params.get('type') || '';
  const sort = params.get('sort') === 'due' ? 'due' : 'new';
  const reqParam = Number(params.get('req')) || null;
  const setParam = (patch) => setParams((p) => {
    const n = new URLSearchParams(p);
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, String(v)) : n.delete(k)));
    return n;
  }, { replace: true });
  const setFilterParam = (patch) => { setParam(patch); setLimit(PAGE); };

  const inQ = useQuery({ queryKey: ['requests', 'inbox'], queryFn: () => api.get('/api/requests/inbox') });
  const outQ = useQuery({ queryKey: ['requests', 'outbox'], queryFn: () => api.get('/api/requests/outbox') });
  const q = box === 'in' ? inQ : outQ;
  const items = useMemo(() => (q.data ? q.data.items : []), [q.data]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['requests'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }); };

  // ตัวเลขบนแท็บ/แถบสัดส่วน/เมนูประเภทนับจากรายการที่ผ่านตัวกรองอื่นแล้ว ตัวเลขจึงเปลี่ยนตามสิ่งที่เลือกเสมอ
  const term = search.trim().toLowerCase();
  const matchTerm = (r) => !term || [r.doc && r.doc.docNo, DOC_LABEL[r.doc && r.doc.type], r.fromName, r.fromEmail, r.toName, r.toEmail, r.message, r.signAs]
    .filter(Boolean).join(' ').toLowerCase().includes(term);
  const base = items.filter((r) => (!type || (r.doc && r.doc.type) === type) && matchTerm(r));
  const counts = Object.fromEntries(Object.entries(FILTER_MATCH).map(([k, fn]) => [k, base.filter(fn).length]));
  const termed = items.filter(matchTerm);
  const typeOptions = [
    { value: '', label: 'ทุกประเภท', count: termed.length },
    ...[...new Set(items.map((r) => r.doc && r.doc.type).filter(Boolean))]
      .map((t) => ({ value: t, label: DOC_LABEL[t] || t, color: TYPE_TONE[t] || '#78716C', count: termed.filter((r) => r.doc && r.doc.type === t).length })),
  ];
  const cmpNew = (a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || ''));
  const cmpDue = (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || cmpNew(a, b);
  // งานที่ค้างอยู่ขึ้นก่อนเสมอ ภายในกลุ่มเรียงตามที่เลือก
  const shown = base.filter(FILTER_MATCH[filter])
    .sort((a, b) => (Number(b.status === 'sent') - Number(a.status === 'sent')) || (sort === 'due' ? cmpDue(a, b) : cmpNew(a, b)));

  // คำขอจากลิงก์แจ้งเตือน (?req=) อาจอยู่เกินหน้าแรกของรายการ ขยายให้เห็นแล้วเลื่อนไปที่แถวนั้น
  const reqIndex = reqParam ? shown.findIndex((r) => r.id === reqParam) : -1;
  const effLimit = Math.max(limit, reqIndex + 1);
  const visible = shown.slice(0, effLimit);
  const todoVisible = visible.filter((r) => r.status === 'sent');
  const doneVisible = visible.filter((r) => r.status !== 'sent');
  const selected = shown.find((r) => r.id === reqParam) || shown[0] || null;
  const filtering = filter !== 'all' || search || type;
  const B = BOX[box];
  const reviewable = (r) => box === 'in' && r.status === 'sent' && r.purpose === 'review';
  const checkedRows = shown.filter((r) => checked.has(r.id) && reviewable(r));
  const reviewVisible = visible.filter(reviewable);
  const allReviewChecked = reviewVisible.length > 0 && reviewVisible.every((r) => checked.has(r.id));

  useEffect(() => {
    if (!reqParam || !items.length) return;
    const el = document.getElementById(`rq-${reqParam}`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [reqParam, items.length]);

  const select = (r) => { setParam({ req: r.id }); setSheet(true); };
  const switchBox = (b) => { setParams(b === 'out' ? { box: 'out' } : {}, { replace: true }); setLimit(PAGE); setChecked(new Set()); };

  // คีย์ลัด: / ค้นหา · ↑ ↓ (หรือ k j) เลื่อนรายการ · Enter เปิด PDF ของรายการที่เลือก
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || signing || confirm || typing(document.activeElement)) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current && searchRef.current.focus(); return; }
      if (!visible.length) return;
      const i = selected ? visible.findIndex((r) => r.id === selected.id) : -1;
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); const n = visible[Math.min(visible.length - 1, i + 1)]; setParam({ req: n.id }); document.getElementById(`rq-${n.id}`)?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); const n = visible[Math.max(0, i - 1)]; setParam({ req: n.id }); document.getElementById(`rq-${n.id}`)?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && selected && !document.activeElement.closest('button, a, [role="listbox"]')) { e.preventDefault(); window.open(`${API_URL}/api/requests/${Number(selected.id)}/pdf`, '_blank', 'noopener'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function approve(r) {
    setConfirm({
      title: 'ยืนยันผลตรวจสอบ "ผ่าน"?', confirmText: 'ตรวจแล้ว ผ่าน',
      message: `${r.doc && r.doc.docNo} ของ ${r.fromName} จะเปลี่ยนเป็น "อนุมัติ" ทันที และย้อนกลับไม่ได้ ถ้าพบข้อผิดพลาดให้กด "ตีกลับ" แทน`,
      onConfirm: async () => {
        setConfirm(null);
        try { await api.post(`/api/requests/${Number(r.id)}/approve`, {}); toast('แจ้งผลตรวจสอบ (ผ่าน) กลับไปแล้ว'); refresh(); } catch (err) { toast(err.message, 'err'); }
      },
    });
  }
  function approveMany() {
    const list = checkedRows;
    setConfirm({
      title: `ตรวจผ่าน ${list.length} รายการ?`, confirmText: `ตรวจผ่านทั้ง ${list.length} รายการ`,
      message: `${list.map((r) => r.doc && r.doc.docNo).join(', ')} จะเปลี่ยนเป็น "อนุมัติ" ทั้งหมด และย้อนกลับไม่ได้`,
      onConfirm: async () => {
        setConfirm(null);
        let ok = 0;
        const failed = [];
        for (const r of list) {
          try { await api.post(`/api/requests/${Number(r.id)}/approve`, {}); ok++; } catch (err) { failed.push(`${r.doc && r.doc.docNo}: ${err.message}`); }
        }
        setChecked(new Set());
        refresh();
        if (failed.length) toast(`ตรวจผ่าน ${ok} รายการ · ไม่สำเร็จ ${failed.length} รายการ (${failed.join(' · ')})`, 'err');
        else toast(`ตรวจผ่านแล้ว ${ok} รายการ`);
      },
    });
  }
  function decline(r) {
    setConfirm({
      kind: 'prompt', required: true, title: 'ตีกลับเอกสาร', message: 'ระบุเหตุผลที่ตีกลับ ผู้ส่งจะเห็นข้อความนี้และใช้แก้เอกสาร (จำเป็นต้องกรอก)', placeholder: 'เช่น ยอดเงินไม่ตรงกับใบเสนอราคา',
      confirmText: 'ตีกลับเอกสาร', danger: true,
      onConfirm: async (reason) => {
        setConfirm(null);
        try { await api.post(`/api/requests/${Number(r.id)}/decline`, { reason }); toast('ตีกลับเอกสารพร้อมแจ้งเหตุผลแล้ว'); refresh(); } catch (err) { toast(err.message, 'err'); }
      },
    });
  }
  function cancelReq(r) {
    setConfirm({
      title: 'ยกเลิกคำขอนี้?', confirmText: 'ยกเลิกคำขอ', danger: true,
      message: `${r.toName} จะไม่สามารถ${r.purpose === 'sign' ? 'ลงนาม' : 'ตรวจสอบ'} ${r.doc && r.doc.docNo} จากคำขอนี้ได้อีก ส่งคำขอใหม่ได้จากหน้าเอกสาร`,
      onConfirm: async () => {
        setConfirm(null);
        try { await api.post(`/api/requests/${Number(r.id)}/cancel`, {}); toast('ยกเลิกคำขอแล้ว'); refresh(); } catch (err) { toast(err.message, 'err'); }
      },
    });
  }
  async function saveLibrary(r) {
    setSaving(r.id);
    try { await api.post(`/api/requests/${Number(r.id)}/library`, {}); toast('เก็บเข้าคลังเอกสารแล้ว'); void qc.invalidateQueries({ queryKey: ['requests', 'inbox'] }); void qc.invalidateQueries({ queryKey: ['library'] }); }
    catch (err) { toast(err.message, 'err'); } finally { setSaving(null); }
  }

  // ปุ่มลัดในแถว: ทำสิ่งที่ค้างอยู่ได้จากรายการเลย (ยังกดดูรายละเอียดก่อนได้ตามปกติ)
  const quickOf = (r) => {
    if (box !== 'in' || r.status !== 'sent') return null;
    if (r.purpose === 'sign') return { label: 'ลงนาม', title: `ลงนาม ${(r.doc && r.doc.docNo) || 'เอกสาร'}`, run: () => setSigning(r) };
    return { label: 'ตรวจผ่าน', title: `ตรวจผ่าน ${(r.doc && r.doc.docNo) || 'เอกสาร'}`, run: () => approve(r) };
  };
  const renderGroup = (label, list) => (list.length ? (
    <div key={label} className="mb-1">
      <div className="pb-2 pt-4 text-[0.8125rem] font-semibold tracking-wide text-ink-soft">{label} · {list.length}</div>
      <div className="flex flex-col gap-2">{list.map((r) => (
        <RequestRow key={r.id} r={r} box={box} active={selected && selected.id === r.id} onSelect={() => select(r)}
          quick={quickOf(r)}
          checkable={reviewable(r)} checked={checked.has(r.id)}
          onCheck={(on) => setChecked((s) => { const n = new Set(s); if (on) n.add(r.id); else n.delete(r.id); return n; })} />
      ))}</div>
    </div>
  ) : null);
  const detailProps = {
    box, saving: selected && saving === selected.id,
    onSign: setSigning, onApprove: approve, onDecline: decline, onCancelReq: cancelReq, onSaveLibrary: saveLibrary,
    onCalendar: (r) => goView(navigate, role, 'calendar', { date: r.dueDate }),
    onOpenDoc: (r) => goView(navigate, role, 'docs', { doc: r.docId }),
  };
  const SH = 'shadow-[0_24px_60px_-30px_rgba(24,24,27,0.30),0_2px_6px_rgba(24,24,27,0.05)]';
  const boxCount = { in: inQ.data ? inQ.data.actionCount : 0, out: outQ.data ? outQ.data.waitingCount : 0 };

  return (
    <>
      <PageHeader title="กล่องรับเอกสาร" subtitle="เอกสารที่คู่ค้าส่งมาให้คุณลงนามหรือตรวจสอบ และคำขอที่คุณส่งออกไป ติดตามได้ในที่เดียว">
        <div role="tablist" aria-label="กล่องเอกสาร" className="mt-4 inline-flex rounded-full bg-white p-1 shadow-[0_2px_8px_-4px_rgba(24,24,27,0.15)]">
          {[['in', 'ที่ได้รับ'], ['out', 'ที่ฉันส่งออก']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={box === k} onClick={() => switchBox(k)}
              className={cx('inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-[0.9375rem] font-medium transition-colors', box === k ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}>
              {label}
              {boxCount[k] > 0 && <span className={cx('min-w-[20px] rounded-full px-1.5 text-center text-[0.75rem] font-semibold leading-5', box === k ? 'bg-white/20' : 'bg-orange text-white')}>{boxCount[k]}</span>}
            </button>
          ))}
        </div>
      </PageHeader>
      {/* เลื่อนด้วยแถบเลื่อนของหน้าเพียงชั้นเดียว: รายการยาวตามจริง แผงรายละเอียดค้างอยู่ข้างจอ (sticky)
          ทั้งสองฝั่งสูงอย่างน้อยเท่ากับจอ และเลื่อนถึงท้ายแล้วขอบล่างตรงกัน */}
      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        {/* ฝั่งซ้าย: ค้นหา ตัวกรอง และรายการ */}
        <Card className={cx('flex flex-col lg:min-h-[calc(100vh-120px)]', SH)} bodyClassName="!p-0 flex flex-1 flex-col">
          <div className="z-20 rounded-t-[24px] bg-white lg:sticky lg:top-[84px]">
          <div className="space-y-3 border-b border-line px-5 pb-4 pt-5">
            <label className="relative block">
              <span className="sr-only">ค้นหาเอกสาร</span>
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-soft" />
              <input
                ref={searchRef} type="search" value={search} onChange={(e) => setFilterParam({ q: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                placeholder={`ค้นหาเลขที่เอกสาร ${B.whoLabel} หรือข้อความ`}
                className="h-11 w-full rounded-full border-[1.5px] border-transparent bg-field pl-11 pr-12 text-[0.96875rem] outline-none transition-colors placeholder:text-ink-soft/70 focus:border-orange focus:bg-white"
              />
              <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-white px-1.5 font-mono text-[0.75rem] text-ink-soft sm:block">/</kbd>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <Dropdown label="ประเภทเอกสาร" icon="file" value={type} options={typeOptions} onChange={(v) => setFilterParam({ type: v })} />
              <Dropdown label="เรียงลำดับ" icon="clock" value={sort} onChange={(v) => setFilterParam({ sort: v === 'new' ? '' : v })}
                options={[{ value: 'new', label: 'ใหม่ล่าสุดก่อน' }, { value: 'due', label: 'ใกล้ครบกำหนดก่อน' }]} />
            </div>
            <div role="tablist" aria-label="สถานะคำขอ" className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {[['all', 'ทั้งหมด'], ['todo', B.todo], ['late', 'เกินกำหนด'], ['done', B.done]].map(([k, label]) => {
                if (k === 'late' && !counts.late) return null;
                const on = filter === k;
                return (
                  <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setFilterParam({ tab: k === 'all' ? '' : k })}
                    className={cx('inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.875rem] font-medium transition-colors',
                      on ? 'bg-ink text-white' : 'bg-tile text-ink-soft hover:text-ink')}>
                    {label}
                    <span className={cx('min-w-[20px] rounded-full px-1.5 text-center text-[0.75rem] font-semibold leading-5', on ? 'bg-white/20' : k === 'late' ? 'bg-danger-soft text-danger' : k === 'todo' && counts.todo ? 'bg-orange text-white' : 'bg-white')}>{counts[k]}</span>
                  </button>
                );
              })}
              {filtering && <button type="button" onClick={() => setFilterParam({ tab: '', q: '', type: '' })} className="ml-auto shrink-0 cursor-pointer whitespace-nowrap px-2 text-[0.875rem] font-medium text-orange-deep hover:underline">ล้างตัวกรอง</button>}
            </div>
          </div>

          {reviewVisible.length > 1 && (
            <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-2.5', checkedRows.length ? 'tf-reveal bg-orange-pale' : 'bg-white')}>
              <label className="flex cursor-pointer items-center gap-2 text-[0.90625rem]">
                <input type="checkbox" className="size-[1.125rem] cursor-pointer accent-[var(--color-orange)]"
                  checked={allReviewChecked} ref={(el) => { if (el) el.indeterminate = checkedRows.length > 0 && !allReviewChecked; }}
                  onChange={(e) => setChecked(e.target.checked ? new Set(reviewVisible.map((r) => r.id)) : new Set())} />
                เลือกทั้งหมดที่รอตรวจสอบ <span className="text-ink-soft">({reviewVisible.length})</span>
              </label>
              {checkedRows.length > 0 && (
                <>
                  <span className="ml-auto text-[0.90625rem]">เลือกไว้ <b className="font-semibold">{checkedRows.length}</b> รายการ</span>
                  <Button variant="dark" className="!px-4 !py-1.5 text-[0.90625rem]" onClick={approveMany}>ตรวจผ่านที่เลือก</Button>
                </>
              )}
            </div>
          )}
          </div>

          <div className="flex-1 px-5 pb-4">
            {q.isLoading && <div className="space-y-2 pt-4"><Skeleton className="h-[72px] w-full" /><Skeleton className="h-[72px] w-full" /><Skeleton className="h-[72px] w-full" /></div>}
            {!q.isLoading && !items.length && (box === 'in'
              ? <EmptyState img="/img/mascot-success.webp" title="ไม่มีเอกสารในกล่องรับ" text="เมื่อคู่ค้าส่งเอกสารมาให้ลงนามหรือตรวจสอบ จะแสดงที่นี่และแจ้งเตือนที่กระดิ่ง" />
              : <EmptyState title="ยังไม่ได้ส่งเอกสารให้คู่ค้า" text="ส่งเอกสารได้จากแท็บ “ส่งเอกสาร” ในหน้ารายละเอียดเอกสาร แล้วติดตามผลได้ที่นี่" />)}
            {!q.isLoading && items.length > 0 && !shown.length && <EmptyState compact title="ไม่พบรายการที่ตรงกับตัวกรอง" text="ลองเปลี่ยนคำค้นหาหรือกด “ล้างตัวกรอง”" />}
            {renderGroup(B.todo, todoVisible)}
            {renderGroup(B.done, doneVisible)}
            {shown.length > effLimit && (
              <div className="pb-1 pt-2 text-center">
                <Button variant="soft" className="!py-2 text-[0.9375rem]" onClick={() => setLimit(effLimit + PAGE)}>แสดงเพิ่ม ({shown.length - effLimit} รายการที่เหลือ)</Button>
              </div>
            )}
          </div>
          {!q.isLoading && shown.length > 0 && (
            <p className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5 text-[0.84375rem] text-ink-soft">
              <span>แสดง {Math.min(effLimit, shown.length)} จาก {shown.length} รายการ</span>
              <span className="hidden lg:inline">คีย์ลัด <kbd className="font-mono">↑ ↓</kbd> เลื่อน · <kbd className="font-mono">Enter</kbd> เปิด PDF</span>
            </p>
          )}
        </Card>

        {/* ฝั่งขวา: รายละเอียดของรายการที่เลือก (จอใหญ่) */}
        <div className="hidden lg:block">
          <section aria-label="รายละเอียดเอกสาร" className={cx('sticky top-[96px] h-[calc(100vh-120px)] overflow-hidden rounded-[24px] bg-white', SH)}>
            {selected ? <RequestDetail key={`${box}-${selected.id}`} r={selected} {...detailProps} />
              : <div className="flex h-full flex-col items-center justify-center p-8 text-center text-ink-soft"><Icon name="inbox" className="mb-3 size-10 text-[#C9C1BA]" /><p className="text-[0.96875rem]">เลือกเอกสารจากรายการด้านซ้ายเพื่อดูรายละเอียด</p></div>}
          </section>
        </div>
      </div>

      {/* จอเล็ก: แผงรายละเอียดเป็นแผ่นเลื่อนขึ้นจากด้านล่าง */}
      {sheet && selected && createPortal(
        <div role="presentation" className="fixed inset-0 z-[150] flex items-end bg-ink/45 backdrop-blur-[2px] lg:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div role="dialog" aria-modal="true" aria-label="รายละเอียดเอกสาร" className="tf-pop h-[88vh] w-full overflow-hidden rounded-t-[28px] bg-white">
            <RequestDetail key={`${box}-${selected.id}`} r={selected} {...detailProps} onClose={() => setSheet(false)} />
          </div>
        </div>,
        document.body,
      )}
      {signing && <SignDialog req={signing} user={user} onClose={() => setSigning(null)} onSigned={() => { setSigning(null); refresh(); }} />}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </>
  );
}
