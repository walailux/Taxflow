/**
 * RecentTable.jsx เอกสารล่าสุดบนแดชบอร์ด: รายการแถวกระชับ 5 รายการ ไม่มีแถบเลื่อน
 * แต่ละแถว: ไอคอนประเภท · ชื่อเอกสาร + เลขที่ + คู่ค้า · ยอด · ป้ายสถานะ · เมนู ⋯
 * ค้นหา/กรองสถานะซ่อนอยู่หลังปุ่ม ถ้าต้องการดูทั้งหมดใช้ลิงก์ "ดูทั้งหมด" ไปหน้าเอกสารทั้งหมด
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { API_URL } from '../../lib/env.js';
import { DOC_LABEL, STATUS_LABEL, baht, thDate } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { EmptyState, Skeleton, cx } from '../../components/ui.jsx';
import ViewLink, { goView } from '../app/ViewLink.jsx';

const DOT = {
  draft: 'bg-[#A8A29E]', pending: 'bg-[#E0A11B]', approved: 'bg-ok', rejected: 'bg-danger',
  cancelled: 'bg-[#A8A29E]', archived: 'bg-info',
};
const FILTERS = [['', 'ทั้งหมด'], ['draft', 'แบบร่าง'], ['pending', 'รอตรวจสอบ'], ['approved', 'อนุมัติ'], ['rejected', 'ไม่อนุมัติ']];
const MAX_ROWS = 5;

const amountOf = (d) => (['WHT', 'EWHT', 'PAYMENT'].includes(d.type) ? d.net : ['PND3', 'PND53'].includes(d.type) ? d.wht : (d.total ?? d.base));
const partyOf = (d) => d.party || d.payer || d.buyer || d.payee || '-';

/**
 * เมนู ⋯ ต่อแถว: วาดผ่าน portal ที่ body แบบ fixed ตามตำแหน่งปุ่ม
 * (เดิมวางแบบ absolute ในแถว ถูกกล่องตารางตัดและโดนแถวถัดไปทับ จึงเห็นเมนูซ้อนกับข้อความ)
 */
function RowMenu({ d, role, navigate }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return undefined;
    const onDown = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const toggle = (e) => {
    e.stopPropagation();
    if (pos) { close(); return; }
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 150;
    setPos({ left: Math.max(8, r.right - 200), ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) });
  };

  const item = 'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] transition-colors hover:bg-tile';
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`ตัวเลือกของ ${d.docNo || 'แบบร่าง'}`}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={toggle}
        className={cx('flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-tile hover:text-ink', pos && 'bg-tile text-ink')}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" style={{ position: 'fixed', width: 200, ...pos }} className="tf-pop z-50 rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_60px_-24px_rgba(24,24,27,0.4)]">
          <button type="button" role="menuitem" className={item} onClick={() => { close(); goView(navigate, role, 'docs', { doc: d.id }); }}>
            <Icon name="file" className="size-4 text-ink-soft" />เปิดเอกสาร
          </button>
          <a role="menuitem" href={`${API_URL}/api/documents/${Number(d.id)}/pdf`} target="_blank" rel="noreferrer" className={item} onClick={close}>
            <Icon name="download" className="size-4 text-ink-soft" />เปิด PDF
          </a>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function RecentTable({ role, items, loading }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tools, setTools] = useState(false);
  const searchBox = useRef(null);
  // เปิดแผงค้นหาด้วยปุ่มแล้วพิมพ์ได้ทันที (โฟกัสเฉพาะตอนผู้ใช้กดเปิดเอง ไม่ใช่ตอนโหลดหน้า)
  useEffect(() => { if (tools && searchBox.current) searchBox.current.focus(); }, [tools]);

  const needle = q.trim().toLowerCase();
  const filtered = items
    .filter((d) => !status || d.status === status)
    .filter((d) => !needle || [d.docNo, partyOf(d), DOC_LABEL[d.type]].some((v) => String(v || '').toLowerCase().includes(needle)));
  const rows = filtered.slice(0, MAX_ROWS);
  const filtering = !!(status || needle);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[1.1875rem] font-medium">เอกสารล่าสุด</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => { setTools((v) => !v); if (tools) { setQ(''); setStatus(''); } }}
            aria-expanded={tools}
            aria-label="ค้นหาและกรองเอกสาร"
            className={cx('flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors', tools || filtering ? 'bg-ink text-white' : 'bg-tile text-ink hover:bg-[#EFEBE7]')}
          >
            <Icon name="search" className="size-[1.125rem]" />
          </button>
          <ViewLink role={role} view="docs" className="flex h-10 items-center gap-1 rounded-full bg-tile px-3.5 text-[0.90625rem] font-medium text-ink transition-colors hover:bg-[#EFEBE7]">
            ดูทั้งหมด<Icon name="chevron" className="size-3.5" />
          </ViewLink>
        </div>
      </div>

      {tools && (
        <div className="tf-reveal mb-3 flex flex-col gap-2.5">
          <label className="relative block">
            <span className="sr-only">ค้นหาเอกสาร</span>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-[1.0625rem] -translate-y-1/2 text-ink-soft" />
            <input ref={searchBox} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่ / คู่ค้า / ประเภท" className="h-11 w-full rounded-full bg-tile pl-10 pr-4 text-[0.96875rem] transition-shadow focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange" />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามสถานะ">
            {FILTERS.map(([k, label]) => (
              <button key={k || 'all'} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}
                className={cx('flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[0.84375rem] font-medium transition-colors', status === k ? 'bg-ink text-white' : 'bg-tile text-[#57534E] hover:bg-[#EFEBE7]')}>
                {k && <i className={cx('size-2 rounded-full', DOT[k])} />}{label}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="flex flex-1 flex-col">
        {loading && Array.from({ length: 4 }, (_, i) => <li key={i} className="py-2"><Skeleton className="h-14 w-full rounded-2xl" /></li>)}
        {!loading && rows.map((d, i) => (
          <li key={d.id} className="tf-fade-up flex flex-1 flex-col sm:max-h-[104px]" style={{ animationDelay: `${i * 40}ms` }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => goView(navigate, role, 'docs', { doc: d.id })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goView(navigate, role, 'docs', { doc: d.id }); } }}
              aria-label={`เปิดเอกสาร ${d.docNo || 'แบบร่าง'}`}
              className="group -mx-2 my-auto flex cursor-pointer items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-orange-pale text-orange"><Icon name="file" className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[1rem] font-medium leading-tight">{DOC_LABEL[d.type] || d.type}</b>
                <small className="block truncate text-[0.84375rem] text-ink-soft">
                  <span className="font-mono">{d.docNo || 'แบบร่าง'}</span> · {partyOf(d)}
                </small>
                {/* มือถือ: ยอดและสถานะอยู่บรรทัดล่าง (จอใหญ่แสดงเป็นคอลัมน์ทางขวา) */}
                <span className="mt-1 flex items-center gap-2 sm:hidden">
                  <b className="font-mono text-[0.90625rem] font-medium tabular-nums">฿{baht(amountOf(d))}</b>
                  <StatusPill status={d.status} size="sm" />
                </span>
              </span>
              <span className="hidden shrink-0 text-right sm:block">
                <b className="block font-mono text-[0.96875rem] font-medium tabular-nums">฿{baht(amountOf(d))}</b>
                <small className="block text-[0.8125rem] text-ink-soft">{thDate(d.issueDate || d.createdAt)}</small>
              </span>
              <span className="hidden shrink-0 md:block"><StatusPill status={d.status} size="sm" /></span>
              <span role="presentation" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><RowMenu d={d} role={role} navigate={navigate} /></span>
            </div>
            {i < rows.length - 1 && <div className="ml-14 h-px shrink-0 bg-line" aria-hidden="true" />}
          </li>
        ))}
      </ul>

      {!loading && !rows.length && (
        <EmptyState compact title={items.length ? 'ไม่พบเอกสารที่ตรงเงื่อนไข' : 'ยังไม่มีเอกสาร'} text={items.length ? 'ลองเปลี่ยนคำค้นหรือตัวกรอง' : 'เริ่มสร้างเอกสารฉบับแรก ระบบแนะนำขั้นตอนให้ทีละขั้น'} />
      )}
      {!loading && filtered.length > MAX_ROWS && (
        <p className="mt-2 text-center text-[0.84375rem] text-ink-soft">แสดง {MAX_ROWS} จาก {filtered.length} รายการ</p>
      )}
    </>
  );
}
