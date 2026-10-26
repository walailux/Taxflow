/**
 * DatePicker.jsx ช่องเลือกวันที่แบบกำหนดหน้าตาเอง ใช้แทน <input type="date"> ของเบราว์เซอร์ทั้งเว็บ
 * หน้าตาแบบปฏิทินของ Apple: หัวแผงเลือกเดือน (รายการ) กับปี พ.ศ. (พิมพ์ได้) แยกกัน · ลูกศรเลื่อนเดือน · วันเป็นปุ่มกลม
 * - value / onChange ใช้รูปแบบ 'YYYY-MM-DD' เหมือน input type="date" เดิม และ onChange ได้ { target: { value, name, id } }
 *   โค้ดเดิมที่อ่าน e.target.value ใช้ต่อได้ทันที
 * - แสดงผลเป็นวันที่ไทย ปี พ.ศ. (17 ต.ค. 2569) แต่ค่าที่เก็บยังเป็น ค.ศ. ตามที่ API ต้องการ
 * - แผงวาดที่ document.body แบบ fixed (เหมือน Select.jsx) จึงไม่ถูกตัดในตารางหรือหน้าต่างที่เลื่อนได้ และพลิกขึ้นบนเมื่อด้านล่างไม่พอ
 * - คีย์บอร์ด: ลูกศรเลื่อนวัน · PageUp/PageDown เลื่อนเดือน · Enter เลือก · Esc ปิด
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
const cx = (...xs) => xs.filter(Boolean).join(' ');

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const PANEL_W = 300;
const PANEL_H = 370;

const pad = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function parse(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}
const todayParts = () => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; };
/**
 * ปีที่ผู้ใช้พิมพ์ -> ค.ศ. · รับ พ.ศ. (2400–2799) เป็นหลัก ถ้าพิมพ์ ค.ศ. (1900–2299) มาก็รับให้
 * คืน null ถ้าไม่ใช่ปีที่ใช้ได้
 */
export function yearFromInput(text) {
  const n = Number(String(text || '').replace(/\D/g, ''));
  if (n >= 2400 && n <= 2799) return n - 543;
  if (n >= 1900 && n <= 2299) return n;
  return null;
}
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
/** 17 ต.ค. 2569 */
export const thaiShort = (v) => { const p = parse(v); return p ? `${p.d} ${MONTHS_SHORT[p.m]} ${p.y + 543}` : ''; };

const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
  </svg>
);
const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" className="size-[1.125rem] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </svg>
);

export default function DatePicker({
  id, name, value, onChange, onBlur, placeholder = 'เลือกวันที่', className, disabled, readOnly, min, max, size = 'md',
  'aria-label': ariaLabel, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy,
}) {
  const sel = parse(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (sel ? { y: sel.y, m: sel.m } : (({ y, m }) => ({ y, m }))(todayParts())));
  const [focusDay, setFocusDay] = useState(1);
  const [yearText, setYearText] = useState('');
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const panel = useRef(null);
  const today = todayParts();
  const outOfRange = (iso) => (min && iso < min) || (max && iso > max);

  function place() {
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const up = below < PANEL_H && r.top - 12 > below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8)),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }

  function openPanel() {
    if (disabled || readOnly) return;
    const base = sel || today;
    setView({ y: base.y, m: base.m });
    setFocusDay(base.d);
    setYearText(String(base.y + 543));
    setOpen(true);
  }

  function close(focusBack = true) {
    setOpen(false);
    if (focusBack) btn.current?.focus();
  }

  function emit(iso) {
    if (iso !== String(value || '')) onChange?.({ target: { value: iso, name, id }, currentTarget: { value: iso, name, id } });
  }

  function choose(y, m, d) {
    const iso = toIso(y, m, d);
    if (outOfRange(iso)) return;
    emit(iso);
    close();
  }

  function goView(y, m) {
    setView({ y, m });
    setYearText(String(y + 543));
    setFocusDay((d) => Math.min(d, daysIn(y, m)));
  }

  function shiftMonth(delta) {
    const t = new Date(view.y, view.m + delta, 1);
    goView(t.getFullYear(), t.getMonth());
  }

  /** ช่องปี: พิมพ์ครบ 4 หลักแล้วเปลี่ยนปีทันที · ออกจากช่องหรือกด Enter ถ้าปีไม่ถูกต้องคืนค่าเดิม */
  function typeYear(text) {
    const digits = String(text).replace(/\D/g, '').slice(0, 4);
    setYearText(digits);
    const y = digits.length === 4 ? yearFromInput(digits) : null;
    if (y) {
      setView((v) => ({ ...v, y }));
      setFocusDay((d) => Math.min(d, daysIn(y, view.m)));
    }
  }
  function commitYear() {
    goView(yearFromInput(yearText) || view.y, view.m);
  }

  // วัดตำแหน่งซ้ำอีกครั้งในเฟรมถัดไป: ตอนเปิดทันทีหลังหน้าโหลด เลย์เอาต์บางส่วน (ฟอนต์/แอนิเมชันเข้า) อาจยังไม่นิ่ง
  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!panel.current?.contains(e.target) && !btn.current?.contains(e.target)) { setOpen(false); onBlur?.(e); } };
    const onMove = (e) => { if (!panel.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, onBlur]);

  // โฟกัสวันที่กำลังเลือกด้วยคีย์บอร์ด (ปุ่มวันมี data-day) · ไม่แย่งโฟกัสตอนผู้ใช้กำลังเลือกเดือนหรือพิมพ์ปี
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (active && active.dataset && active.dataset.ym) return;
    panel.current?.querySelector(`[data-day="${focusDay}"]`)?.focus();
  }, [open, focusDay, view]);

  function onGridKey(e) {
    const dim = daysIn(view.y, view.m);
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (move) {
      e.preventDefault();
      const t = new Date(view.y, view.m, focusDay + move);
      setView({ y: t.getFullYear(), m: t.getMonth() });
      setYearText(String(t.getFullYear() + 543));
      setFocusDay(t.getDate());
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const t = new Date(view.y, view.m + (e.key === 'PageUp' ? -1 : 1), 1);
      goView(t.getFullYear(), t.getMonth());
    } else if (e.key === 'Home') { e.preventDefault(); setFocusDay(1); }
    else if (e.key === 'End') { e.preventDefault(); setFocusDay(dim); }
  }

  const first = new Date(view.y, view.m, 1).getDay();
  const dim = daysIn(view.y, view.m);
  const prevDim = daysIn(view.y, view.m - 1);
  // 6 แถวคงที่ (42 ช่อง) ความสูงแผงไม่กระโดดเวลาเลื่อนเดือน วันของเดือนข้างเคียงแสดงจาง กดแล้วข้ามไปเดือนนั้น
  const cells = Array.from({ length: 42 }, (_, i) => {
    const n = i - first + 1;
    if (n < 1) return { d: prevDim + n, off: -1 };
    if (n > dim) return { d: n - dim, off: 1 };
    return { d: n, off: 0 };
  });

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); openPanel(); } }}
        className={cx('tf-input flex cursor-pointer items-center justify-between gap-2 text-left',
          size === 'sm' && '!px-2.5 !py-2 text-[0.9375rem]',
          (disabled || readOnly) && 'cursor-default opacity-70', className)}
      >
        <span className={cx('truncate', !sel && 'text-[#A1A1AA]')}>{sel ? thaiShort(value) : placeholder}</span>
        <span className={cx('text-ink-soft transition-colors', open && 'text-orange')}><CalendarIcon /></span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panel}
          role="dialog"
          aria-label="เลือกวันที่"
          className="tf-pop fixed z-[400] rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_24px_60px_-20px_rgba(24,24,27,0.4)]"
          style={{ ...pos, width: PANEL_W }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        >
          {/* หัวแผง: เลือกเดือน · พิมพ์ปี พ.ศ. · ลูกศรเลื่อนเดือน */}
          <div className="mb-3 flex items-center gap-1.5">
            <select
              data-ym="month"
              aria-label="เดือน"
              value={view.m}
              onChange={(e) => goView(view.y, Number(e.target.value))}
              className="h-9 min-w-0 flex-1 cursor-pointer rounded-xl border border-line bg-white px-2 text-[0.96875rem] font-semibold text-ink focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
            >
              {MONTHS.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
            </select>
            <input
              data-ym="year"
              type="text"
              inputMode="numeric"
              maxLength={4}
              aria-label="ปี พ.ศ. (พิมพ์ได้)"
              title="พิมพ์ปี พ.ศ. เช่น 2569"
              value={yearText}
              onChange={(e) => typeYear(e.target.value)}
              onBlur={commitYear}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitYear(); }
                else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); goView(view.y + (e.key === 'ArrowUp' ? 1 : -1), view.m); }
              }}
              className="h-9 w-[4.5rem] shrink-0 rounded-xl border border-line bg-white px-2 text-center font-mono text-[0.96875rem] font-semibold text-ink focus:border-orange focus:outline-none focus:ring-2 focus:ring-orange/30"
            />
            <div className="flex shrink-0 items-center">
              <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => shiftMonth(-1)} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-orange transition-colors hover:bg-orange-pale"><Chevron dir="left" /></button>
              <button type="button" aria-label="เดือนถัดไป" onClick={() => shiftMonth(1)} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-orange transition-colors hover:bg-orange-pale"><Chevron dir="right" /></button>
            </div>
          </div>

          <div className="relative">
            <div className="mb-1 grid grid-cols-7 text-center">
              {WEEKDAYS.map((w, i) => (
                <span key={w} className={cx('py-1 text-[0.75rem] font-semibold tracking-wide', i === 0 ? 'text-orange/80' : 'text-[#A1A1AA]')}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 justify-items-center gap-y-0.5" role="grid" tabIndex={-1} onKeyDown={onGridKey}>
              {cells.map((c, i) => {
                if (c.off) {
                  return (
                    <button
                      key={i}
                      type="button"
                      tabIndex={-1}
                      onClick={() => { const t = new Date(view.y, view.m + c.off, c.d); choose(t.getFullYear(), t.getMonth(), c.d); }}
                      className="flex size-9 cursor-pointer items-center justify-center rounded-full text-[0.875rem] text-[#C9C7C4] transition-colors hover:bg-tile"
                    >
                      {c.d}
                    </button>
                  );
                }
                const iso = toIso(view.y, view.m, c.d);
                const isSel = sel && sel.y === view.y && sel.m === view.m && sel.d === c.d;
                const isToday = today.y === view.y && today.m === view.m && today.d === c.d;
                const blocked = outOfRange(iso);
                return (
                  <button
                    key={i}
                    type="button"
                    data-day={c.d}
                    tabIndex={c.d === focusDay ? 0 : -1}
                    disabled={blocked}
                    aria-selected={isSel || undefined}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${c.d} ${MONTHS[view.m]} ${view.y + 543}`}
                    onClick={() => choose(view.y, view.m, c.d)}
                    onFocus={() => setFocusDay(c.d)}
                    className={cx('relative flex size-9 items-center justify-center rounded-full text-[0.9375rem] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/50',
                      isSel ? 'z-10 scale-105 bg-orange font-semibold text-white shadow-[0_6px_14px_-6px_rgba(255,106,0,0.8)]'
                        : blocked ? 'cursor-not-allowed text-[#D6D3D1]'
                          : cx('cursor-pointer text-ink hover:bg-orange-pale hover:text-orange-deep', isToday && 'font-semibold text-orange'))}
                  >
                    {c.d}
                    {isToday && !isSel && <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-orange" />}
                  </button>
                );
              })}
            </div>

          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <button
              type="button"
              onClick={() => { emit(''); close(); }}
              className="cursor-pointer rounded-lg px-2 py-1 text-[0.875rem] font-medium text-ink-soft transition-colors hover:bg-tile hover:text-ink"
            >
              ล้าง
            </button>
            <button
              type="button"
              disabled={outOfRange(toIso(today.y, today.m, today.d))}
              onClick={() => choose(today.y, today.m, today.d)}
              className="cursor-pointer rounded-full bg-orange-pale px-3.5 py-1 text-[0.875rem] font-semibold text-orange-deep transition-colors hover:bg-orange hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              วันนี้
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
