/**
 * Select.jsx รายการตัวเลือกแบบกำหนดหน้าตาเอง ใช้แทน <select> ของเบราว์เซอร์ทั้งเว็บ
 * - options: ['ก', 'ข'] หรือ [{ value, label, group? }]  group ใช้แบ่งหัวข้อกลุ่ม
 * - onChange ได้อ็อบเจกต์หน้าตาเหมือน event ({ target: { value, name, id } }) โค้ดเดิมที่อ่าน e.target.value ใช้ต่อได้
 * - แผงตัวเลือกวาดที่ document.body แบบ fixed จึงไม่ถูกตัดในตาราง/หน้าต่างที่เลื่อนได้ และพลิกขึ้นด้านบนเมื่อที่ด้านล่างไม่พอ
 * - คีย์บอร์ด: ↑ ↓ Home End เลื่อน · Enter/Space เลือก · Esc ปิด · ตัวเลือกมากกว่า 8 รายการมีช่องค้นหา
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
const cx = (...xs) => xs.filter(Boolean).join(' ');

const norm = (o) => (typeof o === 'object' && o !== null ? { value: String(o.value), label: String(o.label ?? o.value), group: o.group } : { value: String(o), label: String(o) });

export default function Select({
  id, name, value, onChange, onBlur, options = [], placeholder, className, disabled, readOnly,
  'aria-label': ariaLabel, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy, size = 'md',
}) {
  const auto = useId();
  const listId = `${id || auto}-list`;
  const items = useMemo(() => {
    const list = options.map(norm);
    return placeholder != null ? [{ value: '', label: placeholder, placeholder: true }, ...list] : list;
  }, [options, placeholder]);
  const current = items.find((o) => o.value === String(value ?? ''));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const panel = useRef(null);
  const search = useRef(null);
  const searchable = items.length > 8;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((o) => !o.placeholder && o.label.toLowerCase().includes(q)) : items;
  }, [items, query]);

  function place() {
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const want = Math.min(320, shown.length * 44 + (searchable ? 60 : 12));
    const up = below < Math.min(want, 220) && above > below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 8)),
      width: Math.max(r.width, 220),
      maxHeight: Math.max(160, Math.min(320, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }

  function openList() {
    if (disabled || readOnly) return;
    setQuery('');
    setActive(Math.max(0, items.findIndex((o) => o.value === String(value ?? ''))));
    setOpen(true);
  }

  function choose(o) {
    setOpen(false);
    btn.current?.focus();
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value, name, id }, currentTarget: { value: o.value, name, id } });
  }

  useLayoutEffect(() => { if (open) place(); }, [open, shown.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    if (searchable) search.current?.focus();
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
  }, [open, searchable]);

  // เลื่อนรายการที่ไฮไลต์ให้อยู่ในกรอบ
  useEffect(() => {
    if (!open || !panel.current) return;
    panel.current.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function onKey(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === 'Tab') setOpen(false);
  }

  const sm = size === 'sm';
  let lastGroup;
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onBlur={(e) => { if (!open) onBlur?.(e); }}
        onKeyDown={onKey}
        className={cx(
          'tf-input flex cursor-pointer items-center justify-between gap-2 text-left',
          sm && '!py-2 text-[0.9375rem]',
          open && '!border-orange !bg-white ring-4 ring-orange/15',
          (disabled || readOnly) && 'cursor-default opacity-70',
          className,
        )}
      >
        <span className={cx('min-w-0 truncate', (!current || current.placeholder) && 'text-ink-soft')}>
          {current ? current.label : (placeholder ?? '')}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={cx('size-4 shrink-0 text-ink-soft transition-transform duration-200', open && 'rotate-180 text-orange')} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      {open && pos && createPortal(
        <div
          ref={panel}
          role="presentation"
          onKeyDown={onKey}
          className="tf-pop fixed z-[400] flex flex-col overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(24,24,27,0.4)] ring-1 ring-line"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        >
          {searchable && (
            <div className="relative mb-1 shrink-0 p-1">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input
                ref={search}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                placeholder="พิมพ์เพื่อค้นหา"
                aria-label="ค้นหาตัวเลือก"
                aria-controls={listId}
                className="h-10 w-full rounded-xl bg-tile pl-9 pr-3 text-[0.96875rem] focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange"
              />
            </div>
          )}
          <ul id={listId} role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {shown.length === 0 && <li className="px-3 py-3 text-[0.96875rem] text-ink-soft">ไม่พบตัวเลือกที่ค้นหา</li>}
            {shown.map((o, i) => {
              const head = o.group && o.group !== lastGroup;
              lastGroup = o.group;
              const selected = o.value === String(value ?? '');
              return (
                <li key={`${o.group || ''}-${o.value}`} role="presentation">
                  {head && <div className="px-3 pb-1 pt-2.5 text-[0.84375rem] font-medium text-ink-soft">{o.group}</div>}
                  <div
                    role="option"
                    tabIndex={-1}
                    data-idx={i}
                    aria-selected={selected}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={cx(
                      'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[1rem] transition-colors',
                      i === active ? 'bg-orange-pale text-ink' : 'text-ink',
                      selected && 'font-medium text-orange-deep',
                      o.placeholder && 'text-ink-soft',
                    )}
                  >
                    <span className="min-w-0 flex-1">{o.label}</span>
                    {selected && <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 text-orange" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
