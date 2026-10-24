/**
 * TaxCalcDialog.jsx เครื่องคิดเลขภาษี (ย้ายจาก ux.js) คำนวณทันทีขณะพิมพ์ คัดลอกผลได้
 */
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { baht } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import { Button, SelectField, cx } from '../../components/ui.jsx';
import { CALC_MODES, WHT_RATES, taxCalc } from './taxcalc.js';
import CalcAppIcon from '../../components/CalcAppIcon.jsx';

export default function TaxCalcDialog({ onClose }) {
  const toast = useToast();
  const [mode, setMode] = useState('combo');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState(3);
  const [vatOn, setVatOn] = useState(true);
  const input = useRef(null);
  const m = CALC_MODES.find((x) => x.id === mode);
  const result = taxCalc(mode, amount, rate, vatOn);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function copy() {
    if (!result.lines.length) { toast('ยังไม่มีผลลัพธ์ให้คัดลอก', 'err'); return; }
    const txt = result.lines.map((l) => `${l.label}: ${l.value < 0 ? '-' : ''}฿${baht(Math.abs(l.value))}`).join('\n');
    navigator.clipboard.writeText(txt).then(() => toast('คัดลอกผลลัพธ์แล้ว'), () => toast('คัดลอกไม่สำเร็จ', 'err'));
  }

  // วาดที่ document.body: ถ้าอยู่ใต้ element ที่มี backdrop-filter/transform กล่อง fixed จะถูกจำกัดอยู่ในกรอบนั้น
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[55] flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center sm:px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-title"
        className="tf-pop max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-white p-6 shadow-[0_30px_80px_-30px_rgba(24,24,27,0.45)] sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="calc-title" className="flex items-center gap-2.5 text-[1.25rem]">
            <span className="tf-anim-host flex size-10 items-center justify-center"><CalcAppIcon className="size-10" /></span>
            เครื่องคิดเลขภาษี
          </h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="flex size-9 cursor-pointer items-center justify-center rounded-xl text-ink-soft hover:bg-field hover:text-ink">
            <Icon name="close" />
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="รูปแบบการคำนวณ">
          {CALC_MODES.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={mode === x.id}
              onClick={() => setMode(x.id)}
              className={cx('cursor-pointer rounded-full px-3.5 py-2 text-[0.9375rem] font-medium transition-colors', mode === x.id ? 'bg-ink text-white' : 'bg-field text-ink-soft hover:text-ink')}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className={cx('grid gap-x-3', m.rate && 'sm:grid-cols-[1fr_auto]')}>
          <div className="mb-4">
            <label htmlFor="calc-amt" className="mb-1.5 block text-[0.9375rem] font-medium">{m.amountLabel}</label>
            <input
              id="calc-amt"
              ref={input}
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="10000"
              className="tf-input text-[1.125rem] tabular-nums"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {m.rate && (
            <SelectField id="calc-rate" label="หัก ณ ที่จ่าย" value={rate} onChange={(e) => setRate(Number(e.target.value))} options={WHT_RATES} />
          )}
        </div>
        {m.vat && (
          <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-[1rem]">
            <input type="checkbox" className="size-4 accent-[var(--color-orange)]" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} />
            ผู้ออกเอกสารจด VAT (บวก 7%)
          </label>
        )}

        <div className="rounded-2xl bg-field p-4" aria-live="polite">
          {result.lines.length ? result.lines.map((l) => (
            <div key={l.label} className={cx('flex items-baseline justify-between gap-4 py-1.5 text-[1rem]', l.total && 'mt-1 border-t border-line pt-3')}>
              <span className={l.total ? 'font-medium' : 'text-ink-soft'}>{l.label}</span>
              <b className={cx('font-mono tabular-nums', l.total ? 'text-[1.25rem] text-orange-deep' : 'font-medium', l.minus && 'text-orange-deep')}>
                {l.value < 0 ? '-' : ''}฿{baht(Math.abs(l.value))}
              </b>
            </div>
          )) : <p className="py-3 text-center text-[0.96875rem] text-ink-soft">กรอกจำนวนเงินเพื่อดูผล</p>}
        </div>
        {result.tip && <p className="mt-3 text-[0.90625rem] leading-relaxed text-ink-soft">{result.tip}</p>}
        <Button variant="ghost" className="mt-4" onClick={copy}>คัดลอกผลลัพธ์</Button>
      </div>
    </div>,
    document.body,
  );
}
