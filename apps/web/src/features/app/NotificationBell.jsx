/**
 * NotificationBell.jsx กระดิ่งแจ้งเตือนบนแถบบน
 * - แท็บกรอง: ทั้งหมด / ต้องดำเนินการ / เอกสาร / ปฏิทินและภาษี / บัญชี (มีตัวเลขยังไม่อ่านของแต่ละแท็บ)
 * - แต่ละรายการมีไอคอนสีตามประเภท ป้ายประเภท เวลาแบบ "2 ชม.ที่แล้ว" และจุดส้มเมื่อยังไม่อ่าน
 * - จัดกลุ่มตามวัน: วันนี้ / เมื่อวาน / 7 วันที่ผ่านมา / ก่อนหน้านี้
 * - กดรายการแล้วทำเครื่องหมายอ่านแล้ว และพาไปหน้าที่เกี่ยวข้อง · ดึงใหม่ทุก 30 วินาที
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { thDateTime } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { cx } from '../../components/ui.jsx';
import { useToast } from '../../components/Toast.jsx';
import { goView } from './ViewLink.jsx';

/** ไอคอนเส้นล้วนสำหรับการแจ้งเตือน (ไอคอน check ในชุดหลักมีวงกลมในตัว ใส่ในกรอบแล้วดูซ้อน จึงวาดแยกที่นี่) */
const GLYPH = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M7 7l10 10M17 7L7 17',
  clock: 'M12 7.5V12l3 2M20 12a8 8 0 11-16 0 8 8 0 0116 0z',
  inbox: 'M4 13.5l2.4-7A2 2 0 018.3 5h7.4a2 2 0 011.9 1.5l2.4 7M4 13.5V17a2 2 0 002 2h12a2 2 0 002-2v-3.5M4 13.5h4l1.5 2.5h5l1.5-2.5h4',
  pen: 'M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4',
  calendar: 'M7 3.5v3M17 3.5v3M4.5 9.5h15M6.5 5h11a2 2 0 012 2v11a2 2 0 01-2 2h-11a2 2 0 01-2-2V7a2 2 0 012-2z',
  deadline: 'M12 8v4.5M12 16h.01M10.3 4.2L3.3 16.5A2 2 0 005 19.5h14a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z',
  shield: 'M12 3.5l7 2.8v5.2c0 4.3-2.9 7.7-7 9-4.1-1.3-7-4.7-7-9V6.3l7-2.8zM9 12l2 2 4-4',
  bell: 'M6 10a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10zM10 19a2 2 0 004 0',
  link: 'M9 7.5a3.5 3.5 0 100 7M15 9.5a3.5 3.5 0 110 7M4.5 20a5 5 0 019-3M19.5 4l-2 2m0 0l-2 2m2-2l2 2m-2-2l-2-2',
};
function Glyph({ name, className, style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d={GLYPH[name] || GLYPH.bell} />
    </svg>
  );
}

/** ชนิดการแจ้งเตือนจาก API (notify(userId, kind, ...)) -> ป้าย ไอคอน สี และหมวด · สีใช้กับไอคอนเส้นและป้ายเท่านั้น (ไม่มีพื้นหลัง) */
const KIND = {
  request: { label: 'รอคุณดำเนินการ', icon: 'inbox', color: '#EA580C', cat: 'docs', action: true },
  rejected: { label: 'ถูกตีกลับ', icon: 'close', color: '#DC2626', cat: 'docs', action: true },
  signed: { label: 'ลงนามแล้ว', icon: 'pen', color: '#0F766E', cat: 'docs' },
  approved: { label: 'อนุมัติแล้ว', icon: 'check', color: '#15803D', cat: 'docs' },
  pending: { label: 'รอตรวจสอบ', icon: 'clock', color: '#B45309', cat: 'docs' },
  edit: { label: 'แก้ไขเอกสาร', icon: 'pen', color: '#57534E', cat: 'docs' },
  'tax-deadline': { label: 'กำหนดยื่นภาษี', icon: 'deadline', color: '#C2410C', cat: 'calendar', action: true },
  calendar: { label: 'ปฏิทินงาน', icon: 'calendar', color: '#1D4ED8', cat: 'calendar' },
  kyc: { label: 'ยืนยันตัวตน', icon: 'shield', color: '#6D28D9', cat: 'account' },
  contact_link: { label: 'ขอดึงข้อมูลของคุณ', icon: 'link', color: '#EA580C', cat: 'account', action: true },
  contact_linked: { label: 'เชื่อมข้อมูลคู่ค้าแล้ว', icon: 'check', color: '#15803D', cat: 'account' },
  contact_declined: { label: 'คู่ค้าปฏิเสธคำขอ', icon: 'close', color: '#57534E', cat: 'account' },
};
const OTHER = { label: 'ทั่วไป', icon: 'bell', color: '#57534E', cat: 'account' };
const ANSWERED = { label: 'ตอบกลับแล้ว', icon: 'check', color: '#15803D', cat: 'docs' };
// คำขอที่ตอบ/ยกเลิกไปแล้ว (API แนบ reqStatus มาให้) ไม่ใช่งานค้าง จึงไม่ติดป้าย "รอคุณดำเนินการ"
const LINK_DONE = { accepted: { label: 'คุณอนุญาตแล้ว', icon: 'check', color: '#15803D', cat: 'account' }, declined: { label: 'คุณปฏิเสธแล้ว', icon: 'close', color: '#57534E', cat: 'account' } };
const kindOf = (n) => (n.kind === 'request' && n.reqStatus && n.reqStatus !== 'sent' ? ANSWERED
  : n.kind === 'contact_link' && n.linkStatus !== 'pending' ? LINK_DONE[n.linkStatus] || ANSWERED
    : KIND[n.kind] || OTHER);

const TABS = [
  { key: 'all', label: 'ทั้งหมด', match: () => true },
  { key: 'action', label: 'ต้องดำเนินการ', match: (n) => kindOf(n).action },
  { key: 'docs', label: 'เอกสาร', match: (n) => kindOf(n).cat === 'docs' },
  { key: 'calendar', label: 'ปฏิทินและภาษี', match: (n) => kindOf(n).cat === 'calendar' },
  { key: 'account', label: 'บัญชี', match: (n) => kindOf(n).cat === 'account' },
];

/** ปลายทางของการแจ้งเตือนแต่ละชนิด */
function ntfTarget(n) {
  if (n.reqId) return ['inbox', { req: n.reqId }]; // หน้ากล่องรับเลือกคำขอฉบับนั้นให้อัตโนมัติ
  const m = /(\d{4}-\d{2}-\d{2})$/.exec(n.dedupeKey || '');
  if (n.kind === 'calendar' || n.kind === 'tax-deadline') return ['calendar', m ? { date: m[1] } : undefined];
  if (n.kind === 'kyc') return ['profile', { tab: 'kyc' }];
  if (n.kind === 'contact_linked') return ['contacts'];
  if (n.docId) return ['docs', { doc: n.docId }];
  return null;
}

/** "เมื่อสักครู่" / "5 นาทีที่แล้ว" / "3 ชม.ที่แล้ว" / "2 วันที่แล้ว" / วันที่เต็มเมื่อเกิน 7 วัน */
function ago(iso, now) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันที่แล้ว`;
  return thDateTime(iso);
}

// แบ่งกลุ่มตามวันปฏิทินเวลาไทย
const bkkDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
function groupOf(iso, now) {
  const d = bkkDay(iso);
  if (d === bkkDay(now)) return 'วันนี้';
  if (d === bkkDay(now - 86400000)) return 'เมื่อวาน';
  if (now - new Date(iso).getTime() < 7 * 86400000) return '7 วันที่ผ่านมา';
  return 'ก่อนหน้านี้';
}

function useClickOutside(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    const k = (e) => { if (e.key === 'Escape') onOutside(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onOutside, active]);
}

/**
 * ทำให้แถบแท็บแนวนอนเลื่อนได้จริงและรู้ว่ายังมีแท็บซ่อนอยู่
 * - หมุนล้อเมาส์แนวตั้งให้เลื่อนแถบไปแนวนอน (เมาส์ทั่วไปไม่มีล้อแนวนอน เดิมจึงเลื่อนไม่ได้เลย)
 *   ต้องผูก listener เองแบบ passive:false เพราะ React ผูก onWheel เป็น passive ซึ่ง preventDefault ไม่ได้
 * - คืนสถานะว่ามีของเลยขอบซ้าย/ขวาไหม เอาไปวาดเงาไล่สีบอกใบ้ว่าเลื่อนต่อได้
 * @returns {[object, {left: boolean, right: boolean}]} ref ของแถบ และสถานะขอบ
 */
function useRailScroll(deps) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
    };
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      // ทัชแพดที่ปัดแนวนอนอยู่แล้ว ปล่อยให้เบราว์เซอร์จัดการเอง
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY; // ล้อเมาส์หมุนถี่ ๆ ถ้าใส่ smooth จะกระตุก เลื่อนตรง ๆ ลื่นกว่า
    };
    sync();
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('scroll', sync); ro.disconnect(); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [ref, edge];
}

export default function NotificationBell({ role }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const box = useRef(null);
  useClickOutside(box, () => setOpen(false), open);
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/api/notifications'), refetchInterval: 30_000 });
  const items = q.data ? q.data.items : [];
  const unread = q.data ? q.data.unread : 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  // คู่ค้าเพิ่งอนุญาตให้ดึงข้อมูล → โหลดสมุดคู่ค้าใหม่ ข้อมูลที่ดึงมาจะขึ้นทันทีโดยไม่ต้องรีเฟรชหน้า
  const linkedCount = items.filter((n) => n.kind === 'contact_linked' && !n.read).length;
  useEffect(() => { if (linkedCount) void qc.invalidateQueries({ queryKey: ['contacts'] }); }, [linkedCount, qc]);
  const now = Date.now();

  function openItem(n) {
    setOpen(false);
    if (!n.read) api.post(`/api/notifications/${Number(n.id)}/read`, {}).then(refresh, () => {});
    const t = ntfTarget(n);
    if (t && !(t[0] === 'contacts' && role === 'creator')) goView(navigate, role, t[0], t[1]);
  }
  // คำขอดึงข้อมูลคู่ค้า: ตอบได้จากกล่องแจ้งเตือนเลย
  const [answering, setAnswering] = useState(null);
  async function answerLink(n, accept) {
    setAnswering(n.id);
    try {
      await api.post(`/api/contacts/link-request/${Number(n.id)}/${accept ? 'accept' : 'decline'}`, {});
      toast(accept ? 'อนุญาตแล้ว ข้อมูลของคุณถูกส่งเข้าสมุดคู่ค้าของผู้ขอ' : 'ปฏิเสธคำขอแล้ว');
    } catch (err) { toast(err.message, 'err'); } finally { setAnswering(null); void refresh(); }
  }
  async function readAll() {
    try { await api.post('/api/notifications/read-all', {}); void refresh(); toast('อ่านทั้งหมดแล้ว'); } catch (err) { toast(err.message, 'err'); }
  }

  const [railRef, edge] = useRailScroll([open, items.length]);
  const current = TABS.find((t) => t.key === tab) || TABS[0];

  /** เลือกแท็บแล้วเลื่อนให้แท็บนั้นอยู่ในสายตาเสมอ (ใช้ได้ทั้งกดเมาส์และลูกศรคีย์บอร์ด) */
  const pick = (key, el) => {
    setTab(key);
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  };
  /** ลูกศรซ้าย/ขวาเลื่อนแท็บตามมาตรฐาน tablist ทำให้ไปถึงแท็บที่ล้นขอบได้โดยไม่ต้องใช้เมาส์ */
  const onRailKey = (e, keys) => {
    const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const i = keys.indexOf(current.key);
    const next = keys[Math.min(keys.length - 1, Math.max(0, i + dir))];
    const el = railRef.current && railRef.current.querySelector(`[data-tab="${next}"]`);
    pick(next, el);
    if (el) el.focus();
  };
  const shown = items.filter(current.match).slice(0, 60);
  const groups = [];
  shown.forEach((n) => {
    const g = groupOf(n.at, now);
    const last = groups[groups.length - 1];
    if (last && last.label === g) last.items.push(n); else groups.push({ label: g, items: [n] });
  });

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) void refresh(); }}
        aria-label={`การแจ้งเตือน${unread ? ` ยังไม่อ่าน ${unread} รายการ` : ''}`}
        aria-expanded={open}
        className="tf-anim-host relative flex size-11 cursor-pointer items-center justify-center rounded-full bg-white text-ink shadow-[0_1px_2px_rgba(24,24,27,0.05)] transition-all hover:-translate-y-px hover:shadow-[0_8px_18px_-10px_rgba(24,24,27,0.35)]"
      >
        <Icon name="bell" className="size-[1.375rem]" strokeWidth={1.5} alert={unread > 0 && !open} />
        {/* ป้าย +N สีชมพูซ้อนไหล่ขวาของกระดิ่ง: เด้งเข้าเมื่อจำนวนเปลี่ยน (key) และมีวงกระเพื่อมเป็นจังหวะ */}
        {unread > 0 && (
          <span key={unread} className="tf-badge-pop pointer-events-none absolute right-[3px] top-[3px] flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[#EC2D6B] px-1 font-display text-[0.6875rem] font-semibold leading-none text-white ring-2 ring-white">
            <span aria-hidden="true" className="tf-badge-ping absolute inset-0 rounded-full bg-[#EC2D6B]" />
            <span className="relative">+{unread > 99 ? 99 : unread}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="tf-pop fixed inset-x-3 top-[68px] z-40 flex max-h-[78vh] flex-col overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_28px_70px_-28px_rgba(24,24,27,0.45)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[440px]">
          {/* หัวกล่อง */}
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3.5 pt-4">
            <div className="min-w-0">
              <b className="block font-display text-[1.125rem] font-semibold leading-tight">การแจ้งเตือน</b>
              <small className="mt-0.5 flex items-center gap-1.5 text-[0.84375rem] text-ink-soft">
                {unread > 0 ? (
                  <><i className="size-1.5 rounded-full bg-orange" />ยังไม่ได้อ่าน <b className="font-semibold text-ink">{unread}</b> รายการ</>
                ) : 'อ่านครบทุกรายการแล้ว'}
              </small>
            </div>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-tile px-3.5 text-[0.84375rem] font-medium text-ink transition-colors hover:bg-ink hover:text-white">
                <Glyph name="check" className="size-4" />อ่านทั้งหมด
              </button>
            )}
          </div>

          {/* แท็บกรองตามประเภท: เลื่อนด้วยล้อเมาส์หรือลูกศร เงาไล่สีสองข้างบอกว่ายังมีแท็บเลยขอบอยู่ */}
          {(() => {
            const visible = TABS.filter((t) => t.key === 'all' || items.some(t.match));
            const keys = visible.map((t) => t.key);
            return (
              <div className="relative shrink-0 border-b border-line">
                <div
                  ref={railRef}
                  role="tablist"
                  aria-label="ประเภทการแจ้งเตือน"
                  tabIndex={-1}
                  onKeyDown={(e) => onRailKey(e, keys)}
                  className="flex gap-5 overflow-x-auto scroll-smooth px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {visible.map((t) => {
                    const n = items.filter(t.match).filter((x) => !x.read).length;
                    const on = t.key === current.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        data-tab={t.key}
                        aria-selected={on}
                        tabIndex={on ? 0 : -1}
                        onClick={(e) => pick(t.key, e.currentTarget)}
                        className={cx('-mb-px flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 text-[0.875rem] font-medium transition-colors',
                          on ? 'border-ink text-ink' : 'border-transparent text-[#78716C] hover:text-ink')}
                      >
                        {t.label}
                        {n > 0 && <span className={cx('min-w-[18px] rounded-full px-1.5 text-center text-[0.71875rem] font-semibold leading-[18px]', on ? 'bg-ink text-white' : 'bg-tile text-ink')}>{n}</span>}
                      </button>
                    );
                  })}
                </div>
                <span aria-hidden="true" className={cx('pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent transition-opacity', edge.left ? 'opacity-100' : 'opacity-0')} />
                <span aria-hidden="true" className={cx('pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent transition-opacity', edge.right ? 'opacity-100' : 'opacity-0')} />
              </div>
            );
          })()}

          {/* รายการ */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {!shown.length && (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Glyph name="bell" className="size-7 text-[#C9C1BA] [stroke-width:1.6]" />
                <p className="text-[0.9375rem] text-ink-soft">{items.length ? 'ไม่มีการแจ้งเตือนในหมวดนี้' : 'ยังไม่มีการแจ้งเตือน'}</p>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label} className="mb-1">
                <div className="px-3 pb-1 pt-2 text-[0.78125rem] font-semibold tracking-wide text-[#A8A29E]">{g.label}</div>
                {g.items.map((n) => {
                  const k = kindOf(n);
                  const body = (
                    <>
                      <Glyph name={k.icon} className="mt-0.5 size-5 shrink-0 [stroke-width:1.8]" style={{ color: k.color }} />
                      <span className="min-w-0 flex-1">
                        <span className={cx('block text-[0.9375rem] leading-snug', n.kind !== 'contact_link' && 'line-clamp-2', n.read ? 'text-[#57534E]' : 'font-medium text-ink')}>{n.message}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-[0.78125rem]">
                          <span className="font-medium" style={{ color: k.color }}>{k.label}</span>
                          <span className="text-[#A8A29E]">· {ago(n.at, now)}</span>
                        </span>
                        {n.kind === 'contact_link' && n.linkStatus === 'pending' && (
                          <span className="mt-2.5 flex gap-2">
                            <button type="button" disabled={answering === n.id} onClick={() => answerLink(n, true)}
                              className="h-9 cursor-pointer rounded-full bg-ink px-4 text-[0.875rem] font-medium text-white transition-colors hover:bg-ink/85 disabled:opacity-50">ยอมรับ</button>
                            <button type="button" disabled={answering === n.id} onClick={() => answerLink(n, false)}
                              className="h-9 cursor-pointer rounded-full bg-tile px-4 text-[0.875rem] font-medium text-ink transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50">ปฏิเสธ</button>
                          </span>
                        )}
                      </span>
                      {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-orange" aria-label="ยังไม่อ่าน" />}
                    </>
                  );
                  // แถวที่มีปุ่มตอบในตัวใช้ div (ปุ่มซ้อนปุ่มไม่ได้) แถวอื่นกดทั้งแถวเพื่อไปยังหน้าที่เกี่ยวข้อง
                  return n.kind === 'contact_link' && n.linkStatus === 'pending' ? (
                    <div key={n.id} className="flex w-full items-start gap-3.5 rounded-2xl bg-orange-pale/50 px-3 py-3 text-left">{body}</div>
                  ) : (
                    <button key={n.id} type="button" onClick={() => openItem(n)}
                      className="group flex w-full cursor-pointer items-start gap-3.5 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-tile">
                      {body}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
