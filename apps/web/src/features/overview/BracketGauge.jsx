/**
 * BracketGauge.jsx มาตรวัดขั้นบันไดภาษีของครีเอเตอร์ (ย้ายจาก renderBracketGauge ใน ux.js)
 */
import { baht } from '../../lib/format.js';
import { cx } from '../../components/ui.jsx';
import { bracketInfo, pct } from './brackets.js';

const TICKS = [0, 150000, 300000, 500000, 750000, 1000000];

export default function BracketGauge({ summary }) {
  const b = bracketInfo(summary);
  const year = (summary.taxYear || new Date().getFullYear()) + 543;
  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
          ปีภาษี {year} · คิดแบบมาตรา 40(2) หักค่าใช้จ่าย 50% (ไม่เกิน 100,000) และลดหย่อนส่วนตัว 60,000
        </p>
        <div className="shrink-0 text-right">
          <b className="block font-display text-[1.875rem] font-semibold leading-none text-orange-deep">{b.rate}%</b>
          <small className="text-[0.875rem] text-ink-soft">อัตราขั้นสูงสุด</small>
        </div>
      </div>
      <div className="relative">
        <div className="flex h-9 overflow-hidden rounded-xl">
          {b.segments.map((s) => (
            <div
              key={s.rate}
              style={{ width: `${pct(s.to) - pct(s.from)}%` }}
              className={cx(
                'flex items-center justify-center border-r-2 border-white text-[0.875rem] font-medium transition-colors last:border-r-0',
                s.state === 'on' ? 'bg-orange text-white' : s.state === 'past' ? 'bg-orange-soft text-orange-deep' : 'bg-field text-ink-soft',
              )}
            >
              {s.rate}%
            </div>
          ))}
        </div>
        <div className="tf-pop absolute -top-1.5 h-12 w-1 -translate-x-1/2 rounded-full bg-ink shadow" style={{ left: `${pct(b.net)}%` }} aria-hidden="true" />
      </div>
      <div className="relative mt-2 h-4 text-[0.8125rem] text-ink-soft">
        {TICKS.map((v) => (
          <span key={v} className="absolute -translate-x-1/2 font-mono first:translate-x-0 last:-translate-x-full" style={{ left: `${pct(v)}%` }}>
            {v === 0 ? '0' : v >= 1000000 ? '1M+' : `${v / 1000}k`}
          </span>
        ))}
      </div>
      <p className="mt-4 text-[1rem] leading-relaxed">
        เงินได้สุทธิ <b className="font-mono">฿{baht(b.net)}</b> · อัตราเฉลี่ยจริง <b>{summary.estimate.effectiveRate}%</b>
        {b.headroom === null ? null : b.net === 0 && b.gross === 0
          ? ' · ยังไม่มีรายได้ที่บันทึกในปีนี้'
          : <> · รับงานเพิ่มได้อีกราว <b className="font-mono">฿{baht(b.headroom)}</b> ก่อนส่วนเกินจะเสียภาษีขั้น {b.nextRate}%</>}
      </p>
      <p className="mt-1.5 text-[0.875rem] text-ink-soft">ขั้นบันไดคิดเฉพาะส่วนที่เกิน การขึ้นขั้นไม่ได้ทำให้รายได้ทั้งหมดเสียอัตราใหม่ · คำนวณจากเอกสารในปีภาษีนี้ ดูรายละเอียดครบทุกขั้นตอนที่เมนู "คำนวณภาษี"</p>
    </div>
  );
}
