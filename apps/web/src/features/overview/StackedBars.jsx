/**
 * StackedBars.jsx กราฟแท่งซ้อนรายเดือน: มูลค่าสุทธิ (ดำ) + ภาษีในเอกสาร VAT และหัก ณ ที่จ่าย (ส้มลายทแยง)
 * แท่งค่อย ๆ โตขึ้นทีละแท่งตอนเปิดหน้า · ชี้ที่แท่งแล้วเห็นยอดของเดือนนั้น
 * มาตรฐานกราฟ: แกน y เริ่มที่ 0 ใช้เลขกลม (niceTicks) · ฐานแท่งเหลี่ยม ปลายบนมน 4px · ช่วงซ้อนคั่นด้วยช่องสีพื้น 2px
 */
import { useState } from 'react';
import { baht } from '../../lib/format.js';
import { cx } from '../../components/ui.jsx';
import { compact, niceTicks } from '../../components/charts.jsx';

const TH_MONTH = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export default function StackedBars({ months, income, vat, wht, show = 8 }) {
  const [hover, setHover] = useState(null);
  const start = Math.max(0, months.length - show);
  const rows = months.slice(start).map((ym, i) => {
    const k = start + i;
    const tax = Math.min(income[k], (vat[k] || 0) + (wht[k] || 0));
    return { ym, net: Math.max(0, income[k] - tax), tax, total: income[k] };
  });
  const ticks = niceTicks(Math.max(...rows.map((r) => r.total), 0));
  const max = ticks[ticks.length - 1] || 1;

  return (
    <div className="rounded-[18px] bg-tile p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <b className="text-[0.96875rem] font-medium">มูลค่าเอกสารรายเดือน <span className="text-[0.8125rem] font-normal text-ink-soft">(บาท)</span></b>
        <div className="flex gap-3 text-[0.875rem] text-ink-soft">
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-ink" />มูลค่าสุทธิ</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-orange" />ภาษีในเอกสาร</span>
        </div>
      </div>
      {/* พื้นที่กราฟ: แกน y กว้าง 44px (พอสำหรับ "1.5M" / "400k") · แถบล่าง 24px สำหรับชื่อเดือน */}
      <div className="relative h-[190px] pl-11">
        <div className="pointer-events-none absolute inset-x-0 bottom-6 top-0">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(t / max) * 100}%`, transform: 'translateY(50%)' }}>
              <span className="w-9 shrink-0 text-right font-mono text-[0.75rem] text-ink-soft tabular-nums">{compact(t)}</span>
              <span className={cx('h-px flex-1 border-t', t === 0 ? 'border-[#D6D3D1]' : 'border-dashed border-[#E4E1DD]')} />
            </div>
          ))}
        </div>
        <div className="relative flex h-full gap-2">
          {rows.map((r, i) => (
            <div key={r.ym} className="relative flex flex-1 flex-col items-center justify-end pb-6" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div
                className="flex w-full max-w-[24px] origin-bottom flex-col justify-end gap-[2px] transition-opacity"
                style={{ height: `${(r.total / max) * 100}%`, opacity: hover == null || hover === i ? 1 : 0.4, animation: `tf-grow-y .7s var(--ease-slide) ${i * 60}ms both` }}
              >
                {r.tax > 0 && <div className="tf-hatch rounded-t-[4px] bg-orange" style={{ flexGrow: r.tax, flexBasis: 0, minHeight: 2 }} />}
                {r.net > 0 && <div className={cx('bg-ink', !(r.tax > 0) && 'rounded-t-[4px]')} style={{ flexGrow: r.net, flexBasis: 0, minHeight: 2 }} />}
              </div>
              <span className={cx('absolute bottom-0 text-[0.8125rem] transition-colors', hover === i ? 'font-medium text-ink' : 'text-ink-soft')}>{TH_MONTH[Number(r.ym.slice(5, 7))]}</span>
              {hover === i && (
                // ครึ่งซ้ายเปิดไปทางขวา ครึ่งขวาเปิดไปทางซ้าย ป้ายจึงไม่ล้นกรอบการ์ด
                <div className={cx('tf-tip-box absolute bottom-full z-10 mb-2.5', i < rows.length / 2 ? 'left-0' : 'right-0')} style={{ '--arrow-left': i < rows.length / 2 ? '18px' : 'calc(100% - 18px)' }}>
                  <div className="tf-tip-muted mb-0.5">{TH_MONTH[Number(r.ym.slice(5, 7))]} {Number(r.ym.slice(0, 4)) + 543}</div>
                  <div>สุทธิ <b className="font-mono">฿{baht(r.net)}</b></div>
                  <div>ภาษี <b className="font-mono text-orange">฿{baht(r.tax)}</b></div>
                  <div className="mt-0.5 border-t border-current/15 pt-0.5">รวม <b className="font-mono">฿{baht(r.total)}</b></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
