/**
 * Combobox.jsx ช่องพิมพ์ข้อความที่มีรายการแนะนำเลื่อนลงมา (พิมพ์เองได้ หรือเลือกจากรายการ)
 * ใช้แทน <datalist> ของเบราว์เซอร์ซึ่งหน้าตาต่างกันทุกเครื่องและบนมือถือแทบมองไม่เห็น
 * - suggestions: ['ก', 'ข'] หรือ [{ value, hint?, group? }]  group ใช้แบ่งหัวข้อ เช่น "ใช้ล่าสุด" / "จังหวัดทั้งหมด"
 * - กรองตามที่พิมพ์ (มีคำนั้นอยู่ตรงไหนก็ได้) · ปุ่มลูกศรด้านขวาเปิดรายการทั้งหมด
 * - onChange ได้ { target: { value, name, id } } เหมือน input ปกติ
 * - แผงวาดที่ document.body แบบ fixed (เหมือน Select.jsx) ไม่ถูกตัดในการ์ดที่เลื่อนได้ และพลิกขึ้นบนเมื่อด้านล่างไม่พอ
 * - คีย์บอร์ด: ↑ ↓ เลื่อน · Enter เลือก · Esc ปิด
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
const cx = (...xs) => xs.filter(Boolean).join(' ');

const norm = (o) => (typeof o === 'object' && o !== null ? { value: String(o.value), hint: o.hint, group: o.group } : { value: String(o) });
const MAX_SHOWN = 60;

export default function Combobox({
  id, name, value, onChange, onBlur, suggestions = [], placeholder, className, disabled, readOnly,
  'aria-label': ariaLabel, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy, emptyText = 'พิมพ์ค่าที่ต้องการได้เลย',
}) {
  const auto = useId();
  const listId = `${id || auto}-list`;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(''); // '' = แสดงทั้งหมด (เปิดจากปุ่มลูกศร)
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const input = useRef(null);
  const wrap = useRef(null);
  const panel = useRef(null);

  const items = useMemo(() => {
    const seen = new Set();
    return suggestions.map(norm).filter((o) => o.value && !seen.has(o.value) && seen.add(o.value));
  }, [suggestions]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (q ? items.filter((o) => o.value.toLowerCase().includes(q)) : items).slice(0, MAX_SHOWN);
  }, [items, filter]);

  function place() {
    const r = wrap.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 200 && above > below;
    setPos({
      left: r.left,
      width: Math.max(r.width, 220),
      maxHeight: Math.max(150, Math.min(300, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, shown.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!panel.current?.contains(e.target) && !wrap.current?.contains(e.target)) setOpen(false); };
    const onMove = (e) => { if (!panel.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) panel.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const emit = (v) => onChange?.({ target: { value: v, name, id }, currentTarget: { value: v, name, id } });

  function choose(o) {
    emit(o.value);
    setOpen(false);
    input.current?.focus();
  }

  function onKeyDown(e) {
    if (disabled || readOnly) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setFilter(''); setOpen(true); setActive(0); return; }
      const n = shown.length;
      if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) {
      e.preventDefault();
      choose(shown[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  // จัดกลุ่มตามลำดับที่ส่งมา แสดงหัวกลุ่มเมื่อกลุ่มเปลี่ยน
  let lastGroup;

  return (
    <div ref={wrap} className="relative">
      <input
        ref={input}
        id={id}
        name={name}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        value={value ?? ''}
        onChange={(e) => { emit(e.target.value); setFilter(e.target.value); setActive(-1); if (!open && items.length) setOpen(true); }}
        onFocus={() => { if (!readOnly && !disabled && items.length && !value) { setFilter(''); setOpen(true); } }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={cx('tf-input pr-11', className)}
      />
      {items.length > 0 && !disabled && !readOnly && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="แสดงรายการแนะนำ"
          onMouseDown={(e) => e.preventDefault()}
          // โฟกัสก่อนแล้วค่อยตั้งค่า open: ถ้าช่องยังไม่ได้โฟกัส onFocus จะเปิดรายการด้วย การ toggle ทีหลังจึงต้องอิงสถานะก่อนกด
          onClick={() => { const wasOpen = open; setFilter(''); setActive(-1); input.current?.focus(); setOpen(!wasOpen); }}
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-[#EFECE9] hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className={cx('size-4 transition-transform duration-200', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}

      {open && pos && createPortal(
        <div
          ref={panel}
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="tf-pop fixed z-[400] overflow-y-auto rounded-2xl border border-black/5 bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(24,24,27,0.4)]"
          style={pos}
          onMouseDown={(e) => e.preventDefault()}
        >
          {!shown.length && <p className="px-3 py-2.5 text-[0.875rem] text-ink-soft">{emptyText}</p>}
          {shown.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={`${o.group || ''}-${o.value}`}>
                {head && <p className="px-3 pb-1 pt-2 text-[0.75rem] font-semibold tracking-wide text-[#A1A1AA]">{head}</p>}
                <button
                  type="button"
                  role="option"
                  data-i={i}
                  aria-selected={o.value === value}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setActive(i)}
                  className={cx('flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[0.9375rem] transition-colors',
                    i === active ? 'bg-orange-pale text-orange-deep' : 'text-ink',
                    o.value === value && 'font-semibold')}
                >
                  <span className="truncate">{o.value}</span>
                  {o.hint && <span className="shrink-0 text-[0.8125rem] text-ink-soft">{o.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
