/**
 * AppearanceMenu.jsx ปุ่ม "Aa" บนแถบบน: เลือกฟอนต์หน้าเว็บ · ขนาดตัวอักษร · ความหนาตัวอักษร · ฟอนต์เริ่มต้นของเอกสาร PDF
 * ตัวเลือกที่เป็นค่าเริ่มต้นมีป้าย "ค่าเริ่มต้น" กำกับ
 * ค่าเก็บในเครื่อง (lib/appearance.js) · ฟอนต์เอกสารใช้กับเอกสารที่สร้างใหม่ (เอกสารเดิมคงฟอนต์ที่ออกไปแล้ว)
 */
import { useEffect, useRef, useState } from 'react';
import { cx } from '../../components/ui.jsx';
import { DEFAULTS, TEXT_SIZES, WEB_FONTS, WEIGHT_RANGE, useAppearance } from '../../lib/appearance.js';
import { useDocFonts } from '../../lib/docFonts.js';

/** ป้าย "ค่าเริ่มต้น" บอกตัวเลือกที่ระบบตั้งไว้ ผู้ใช้กดกลับได้ง่าย */
const DefaultTag = ({ on }) => (
  <span className={cx('rounded-full px-1.5 text-[0.6875rem] font-medium leading-[1.125rem]', on ? 'bg-orange text-white' : 'bg-orange-pale text-orange-deep')}>ค่าเริ่มต้น</span>
);

function Option({ on, onClick, stack, label, sample, isDefault }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={cx('flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors',
        on ? 'bg-orange-pale ring-orange' : 'ring-line hover:bg-tile')}>
      <span className={cx('flex size-4 shrink-0 items-center justify-center rounded-full ring-[1.5px]', on ? 'bg-orange ring-orange' : 'ring-[#C9C1BA]')}>
        {on && <i className="size-1.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1" style={{ fontFamily: stack }}>
        <b className="flex items-center gap-1.5 text-[0.96875rem] font-semibold leading-tight">{label}{isDefault && <DefaultTag on={on} />}</b>
        <small className="block truncate text-[0.84375rem] text-ink-soft">{sample}</small>
      </span>
    </button>
  );
}

/** docFont=false: ซ่อนส่วนฟอนต์เอกสาร PDF (หน้าข้อมูลสาธารณะที่ยังไม่ได้เข้าสู่ระบบ) */
export default function AppearanceMenu({ docFont = true }) {
  const [a, update] = useAppearance();
  const docFonts = useDocFonts(docFont);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label="ฟอนต์และขนาดตัวอักษร" title="ฟอนต์และขนาดตัวอักษร"
        className={cx('flex size-10 cursor-pointer sm:size-11 items-center justify-center rounded-full font-semibold shadow-[0_1px_2px_rgba(24,24,27,0.05)] transition-all hover:-translate-y-px hover:shadow-[0_8px_18px_-10px_rgba(24,24,27,0.35)]',
          open ? 'bg-orange text-white' : 'bg-white text-ink')}>
        <span className="text-[1.0625rem] leading-none">A<span className="text-[0.8125rem]">a</span></span>
      </button>
      {open && (
        <div role="dialog" aria-label="ฟอนต์และขนาดตัวอักษร"
          className="tf-pop fixed inset-x-3 top-[68px] z-40 max-h-[80vh] overflow-y-auto rounded-[22px] border border-line bg-white p-4 shadow-[0_28px_70px_-28px_rgba(24,24,27,0.45)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[21rem]">
          <b className="mb-2 block text-[0.9375rem] font-semibold">ฟอนต์หน้าเว็บ</b>
          <div role="radiogroup" aria-label="ฟอนต์หน้าเว็บ" className="flex flex-col gap-1.5">
            {WEB_FONTS.map((f) => (
              <Option key={f.value} on={a.font === f.value} onClick={() => update({ font: f.value })} stack={f.stack} label={f.label} sample="กขค ภาษีหัก ณ ที่จ่าย 1,234.50" isDefault={f.value === DEFAULTS.font} />
            ))}
          </div>

          <b className="mb-2 mt-4 block text-[0.9375rem] font-semibold">ขนาดตัวอักษร</b>
          <div role="radiogroup" aria-label="ขนาดตัวอักษร" className="grid grid-cols-4 gap-1 rounded-full bg-tile p-1">
            {TEXT_SIZES.map((s, i) => (
              <button key={s.value} type="button" role="radio" aria-checked={a.scale === s.value} onClick={() => update({ scale: s.value })}
                className={cx('flex cursor-pointer flex-col items-center rounded-full py-1.5 transition-colors', a.scale === s.value ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}>
                <span className="font-semibold leading-none" style={{ fontSize: `${0.8125 + i * 0.1875}rem` }}>ก</span>
                <span className="mt-0.5 text-[0.75rem]">{s.label}</span>
                {s.value === DEFAULTS.scale && <span className={cx('mt-0.5 size-1.5 rounded-full', a.scale === s.value ? 'bg-orange' : 'bg-orange/40')} title="ค่าเริ่มต้น" />}
              </button>
            ))}
          </div>

          <b className="mb-2 mt-4 flex items-center justify-between text-[0.9375rem] font-semibold">
            ความหนาตัวอักษร
            {a.weight !== DEFAULTS.weight && (
              <button type="button" onClick={() => update({ weight: DEFAULTS.weight })} className="cursor-pointer text-[0.8125rem] font-medium text-orange-deep hover:underline">กลับเป็นค่าเริ่มต้น</button>
            )}
          </b>
          {/* แถบเลื่อนตัวเลขน้ำหนัก 300–600 · ขีดค่าเริ่มต้น (400) มีป้ายกำกับใต้แถบ · ตัวอย่างข้อความหนาตามค่าที่เลือก */}
          <div className="rounded-2xl bg-tile px-3.5 pb-2.5 pt-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="truncate text-[1.125rem] leading-none" style={{ fontWeight: a.weight }}>กขค Aa 123</span>
              <b className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[0.84375rem] font-semibold tabular-nums ring-1 ring-line">{a.weight}</b>
            </div>
            <input
              type="range"
              min={WEIGHT_RANGE.min}
              max={WEIGHT_RANGE.max}
              step={WEIGHT_RANGE.step}
              value={a.weight}
              onChange={(e) => update({ weight: Number(e.target.value) })}
              aria-label="ความหนาตัวอักษร"
              aria-valuetext={`${a.weight}${a.weight === DEFAULTS.weight ? ' (ค่าเริ่มต้น)' : ''}`}
              className="w-full cursor-pointer accent-[var(--color-orange)]"
            />
            <div className="relative mt-1 flex justify-between px-[0.4rem] text-[0.75rem] tabular-nums text-ink-soft">
              {Array.from({ length: (WEIGHT_RANGE.max - WEIGHT_RANGE.min) / WEIGHT_RANGE.step + 1 }, (_, i) => WEIGHT_RANGE.min + i * WEIGHT_RANGE.step).map((w) => (
                <button key={w} type="button" onClick={() => update({ weight: w })}
                  className={cx('flex w-0 cursor-pointer flex-col items-center gap-0.5 whitespace-nowrap', a.weight === w && 'font-semibold text-ink')}>
                  <span>{w}</span>
                  {w === DEFAULTS.weight && <DefaultTag on={a.weight === w} />}
                </button>
              ))}
            </div>
          </div>

          {docFont && (<>
          <b className="mb-1 mt-4 block text-[0.9375rem] font-semibold">ฟอนต์ในเอกสาร (PDF)</b>
          <p className="mb-2 text-[0.84375rem] text-ink-soft">ใช้กับเอกสารที่สร้างใหม่ เปลี่ยนรายฉบับได้ในหน้าสร้างเอกสาร</p>
          <div role="radiogroup" aria-label="ฟอนต์ในเอกสาร" className="flex flex-col gap-1.5">
            {docFonts.map((f) => (
              <Option key={f.value} on={a.docFont === f.value} onClick={() => update({ docFont: f.value })} stack={f.stack} label={f.label} sample="ใบแจ้งหนี้ เลขที่ INV-2026-00001" isDefault={f.value === DEFAULTS.docFont} />
            ))}
          </div>
          </>)}
        </div>
      )}
    </div>
  );
}
