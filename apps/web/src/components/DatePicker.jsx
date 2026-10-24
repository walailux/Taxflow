/**
 * DatePicker.jsx ช่องเลือกวันที่แบบกำหนดหน้าตาเอง ใช้แทน <input type="date"> ของเบราว์เซอร์ทั้งเว็บ
 * หน้าตาแบบปฏิทินของ Apple: หัวเดือน/ปีกดเปิดตารางเลือกเดือนและปี · ลูกศรเลื่อนเดือน · วันเป็นปุ่มกลม
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
  const [picker, setPicker] = useState(false); // ตารางเลือกเดือน/ปี
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
    setPicker(false);
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

  function shiftMonth(delta) {
    setView((v) => {
      const t = new Date(v.y, v.m + delta, 1);
      return { y: t.getFullYear(), m: t.getMonth() };
    });
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

  // โฟกัสวันที่กำลังเลือกด้วยคีย์บอร์ด (ปุ่มวันมี data-day)
  useEffect(() => {
    if (open && !picker) panel.current?.querySelector(`[data-day="${focusDay}"]`)?.focus();
  }, [open, picker, focusDay, view]);

  function onGridKey(e) {
    const dim = daysIn(view.y, view.m);
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (move) {
      e.preventDefault();
      const t = new Date(view.y, view.m, focusDay + move);
      setView({ y: t.getFullYear(), m: t.getMonth() });
      setFocusDay(t.getDate());
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const t = new Date(view.y, view.m + (e.key === 'PageUp' ? -1 : 1), 1);
      setView({ y: t.getFullYear(), m: t.getMonth() });
      setFocusDay(Math.min(focusDay, daysIn(t.getFullYear(), t.getMonth())));
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
          {/* หัวแผง: เดือน ปี (กดเปิดตารางเดือน/ปี) · ลูกศรเลื่อนเดือน */}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPicker((v) => !v)}
              aria-expanded={picker}
              className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-0.5 text-[1.0625rem] font-semibold text-ink transition-colors hover:text-orange-deep"
            >
              {MONTHS[view.m]} {view.y + 543}
              <svg viewBox="0 0 24 24" className={cx('size-3 text-orange transition-transform duration-200', picker && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div className="flex items-center gap-0.5">
              <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => (picker ? setView((v) => ({ ...v, y: v.y - 1 })) : shiftMonth(-1))} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-orange transition-colors hover:bg-orange-pale"><Chevron dir="left" /></button>
              <button type="button" aria-label="เดือนถัดไป" onClick={() => (picker ? setView((v) => ({ ...v, y: v.y + 1 })) : shiftMonth(1))} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-orange transition-colors hover:bg-orange-pale"><Chevron dir="right" /></button>
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

            {/* ตารางเลือกเดือน (ปีเลื่อนด้วยลูกศรด้านบน) ทับบนตารางวัน */}
            {picker && (
              <div className="tf-reveal absolute inset-0 z-20 flex flex-col rounded-2xl bg-white/95 backdrop-blur-sm">
                <p className="mb-2 text-center text-[0.9375rem] font-semibold text-ink">พ.ศ. {view.y + 543}</p>
                <div className="grid flex-1 grid-cols-3 gap-1.5">
                  {MONTHS_SHORT.map((m, idx) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setView((v) => ({ ...v, m: idx })); setFocusDay((d) => Math.min(d, daysIn(view.y, idx))); setPicker(false); }}
                      className={cx('cursor-pointer rounded-xl text-[0.875rem] font-semibold transition-all',
                        idx === view.m ? 'bg-orange text-white shadow-sm' : 'text-ink hover:bg-orange-pale hover:text-orange-deep')}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
