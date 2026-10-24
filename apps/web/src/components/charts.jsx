/**
 * charts.jsx กราฟ SVG ที่ใช้ในหน้าวิเคราะห์ข้อมูล (ไม่มี dependency)
 * หลักการ: แกนเดียว · แท่งหนาไม่เกิน 24px ปลายมน 4px ฐานเหลี่ยม · เส้น 2px · จุด >= 8px มีวงขอบสีพื้น 2px
 * เส้นกริดบางสีจาง · ข้อความใช้สีตัวอักษรเสมอ (ไม่ใช้สีของซีรีส์) · ชี้แล้วเห็นค่าทุกกราฟ
 * สีหมวดหมู่ (CAT) เป็นชุดที่ผ่านการตรวจตาบอดสีแล้ว ใช้ตามลำดับ ไม่วนสี (เกิน 8 รายการรวมเป็น "อื่น ๆ")
 */
import { useEffect, useRef, useState } from 'react';
import { cx } from './ui.jsx';

export const CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const GRID = 'var(--color-line)';
const AXIS = 'var(--color-ink-soft)';
const MUTED = 'var(--color-ink-soft)';
const INK = 'var(--color-ink)';

export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** ค่าบนแกน y ที่เป็นเลขกลม ๆ (0 / 50k / 100k ...) */
export function niceTicks(max, n = 4) {
  if (!(max > 0)) return [0, 1, 2, 3, 4].map((i) => i * 250);
  const raw = max / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}
export const compact = (v) => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(v >= 1e4 ? 0 : 1)}k` : String(Math.round(v)));

function Tooltip({ x, y, width, children }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div className="tf-tip-box absolute z-10 -translate-x-1/2 -translate-y-full" style={{ left, top: y - 12, '--arrow-x': `${x - left}px` }}>
      {children}
    </div>
  );
}

/**
 * กราฟรายช่วงเวลา ซีรีส์เดียว: type = 'bar' | 'line' | 'area'
 * labels = ['ม.ค.', ...] · values = [...] · format = (v) => string
 */
export function TimeChart({ labels, values, type = 'bar', color = '#FF6A00', format = String, height = 280, title }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 52, r: 16, t: 26, b: 30 }; // t เผื่อป้ายค่าล่าสุดเหนือแท่งสูงสุดไม่ให้ล้นกรอบ
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks[ticks.length - 1] || 1;
  const n = values.length;
  const band = n ? iw / n : 0;
  const xMid = (i) => pad.l + band * i + band / 2;
  const y = (v) => pad.t + ih - (v / top) * ih;
  const barW = Math.min(24, band * 0.55);
  const pts = values.map((v, i) => [xMid(i), y(v)]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const last = n - 1;
  // ป้ายเดือนกว้างราว 52px เว้นระยะให้ไม่ชนกัน นับย้อนจากเดือนล่าสุด (เดือนล่าสุดแสดงเสมอ ระยะห่างเท่ากัน)
  const labelEvery = band > 0 ? Math.max(1, Math.ceil(52 / band)) : 1;

  return (
    <div ref={ref} className="relative w-full" role="img" aria-label={title}>
      {w > 0 && (
        <svg width={w} height={height} className="block overflow-visible" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth="1" />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill={MUTED} className="tabular-nums">{compact(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => ((last - i) % labelEvery === 0 || hover === i) && (
            <text key={l + i} x={xMid(i)} y={height - 8} textAnchor="middle" fontSize="12" fill={hover === i ? INK : MUTED}>{l}</text>
          ))}

          {type === 'bar' && values.map((v, i) => {
            const h = Math.max(0, pad.t + ih - y(v));
            const r = Math.min(4, h, barW / 2);
            const x0 = xMid(i) - barW / 2;
            const y0 = y(v);
            // ปลายบนมน 4px ฐานเหลี่ยม
            const d = h <= 0 ? '' : `M${x0},${y0 + h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barW - r} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} V${y0 + h} Z`;
            return <path key={i} d={d} fill={color} opacity={hover == null || hover === i ? 1 : 0.35} style={{ transition: 'opacity .15s' }} />;
          })}

          {type !== 'bar' && n > 0 && (
            <>
              {type === 'area' && <path d={`${path} L${pts[last][0]},${y(0)} L${pts[0][0]},${y(0)} Z`} fill={color} opacity="0.12" />}
              <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {hover != null && <line x1={xMid(hover)} x2={xMid(hover)} y1={pad.t} y2={pad.t + ih} stroke={AXIS} strokeWidth="1" />}
              {pts.map((p, i) => (hover === i || i === last) && (
                <circle key={i} cx={p[0]} cy={p[1]} r="5" fill={color} stroke="#fff" strokeWidth="2" />
              ))}
            </>
          )}

          {/* ป้ายค่าล่าสุดที่ปลายกราฟ */}
          {n > 0 && hover == null && values[last] > 0 && (
            <text x={xMid(last)} y={(type === 'bar' ? y(values[last]) : pts[last][1]) - 10} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={INK}>{compact(values[last])}</text>
          )}

          {/* พื้นที่รับเมาส์ทั้งช่อง กว้างกว่าแท่ง */}
          {values.map((_, i) => (
            <rect key={i} x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
          ))}
        </svg>
      )}
      {hover != null && w > 0 && (
        <Tooltip x={xMid(hover)} y={type === 'bar' ? y(values[hover]) : pts[hover][1]} width={w}>
          <b className="block font-medium">{labels[hover]}</b>
          <span className="font-mono tabular-nums">{format(values[hover])}</span>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * กราฟแท่งเรียงข้างกันตามช่วงเวลา: แกน x = เดือน · แกน y = ค่า (บาท/ฉบับ) · ในแต่ละเดือนมีแท่งของแต่ละประเภทวางเคียงกัน (ไม่ซ้อน)
 * labels = ['ม.ค.', ...] · series = [{ key, label, color, values: [...] }] · ชี้เดือนเพื่อดูยอดแยกประเภท
 * แท่งปลายบนมน 4px ฐานเหลี่ยม เว้นช่อง 3px ระหว่างแท่ง · ชี้ชื่อประเภทในคำอธิบายเพื่อเน้นเฉพาะประเภทนั้น
 */
export function GroupedColumns({ labels, series, format = String, height = 300, title, yLabel }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const [focus, setFocus] = useState(null); // ประเภทที่ชี้ในคำอธิบาย
  const pad = { l: 52, r: 12, t: 22, b: 30 };
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
  const ticks = niceTicks(Math.max(0, ...series.flatMap((x) => x.values.map((v) => v || 0))));
  const top = ticks[ticks.length - 1] || 1;
  const band = n ? iw / n : 0;
  const xMid = (i) => pad.l + band * i + band / 2;
  const y = (v) => pad.t + ih - (v / top) * ih;
  const k = Math.max(1, series.length);
  const GAP = 3;
  const subW = Math.max(3, Math.min(18, (band * 0.8 - GAP * (k - 1)) / k)); // ความกว้างแต่ละแท่งในกลุ่ม
  const groupW = subW * k + GAP * (k - 1);
  const last = n - 1;
  const labelEvery = band > 0 ? Math.max(1, Math.ceil(52 / band)) : 1;

  return (
    <div className="w-full">
      <div ref={ref} className="relative w-full" role="img" aria-label={title}>
        {w > 0 && (
          <svg width={w} height={height} className="block overflow-visible" onMouseLeave={() => setHover(null)}>
            {yLabel && <text x={pad.l - 8} y={8} textAnchor="end" fontSize="11" fill={MUTED}>{yLabel}</text>}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth="1" />
                <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill={MUTED} className="tabular-nums">{compact(t)}</text>
              </g>
            ))}
            <line x1={pad.l} x2={pad.l} y1={pad.t} y2={pad.t + ih} stroke={AXIS} strokeWidth="1" />
            {labels.map((l, i) => ((last - i) % labelEvery === 0 || hover === i) && (
              <text key={l + i} x={xMid(i)} y={height - 8} textAnchor="middle" fontSize="12" fill={hover === i ? INK : MUTED}>{l}</text>
            ))}

            {labels.map((_, i) => {
              const dim = hover != null && hover !== i;
              const gx = xMid(i) - groupW / 2;
              return (
                <g key={i} opacity={dim ? 0.35 : 1} style={{ transition: 'opacity .15s' }}>
                  {series.map((sr, j) => {
                    const v = sr.values[i] || 0;
                    const yTop = y(v);
                    const yBot = y(0);
                    const h = Math.max(0, yBot - yTop);
                    const x0 = gx + j * (subW + GAP);
                    const r = Math.min(4, h, subW / 2);
                    const d = h <= 0 ? '' : `M${x0},${yBot} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + subW - r} Q${x0 + subW},${yTop} ${x0 + subW},${yTop + r} V${yBot} Z`;
                    return <path key={sr.key} d={d} fill={sr.color} opacity={focus && focus !== sr.key ? 0.25 : 1} style={{ transition: 'opacity .15s' }} />;
                  })}
                </g>
              );
            })}


            {labels.map((_, i) => (
              <rect key={i} x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            ))}
          </svg>
        )}
        {hover != null && w > 0 && (
          <Tooltip x={xMid(hover)} y={y(Math.max(0, ...series.map((sr) => sr.values[hover] || 0)))} width={w}>
            <b className="mb-1 block font-medium">{labels[hover]} · {format(totals[hover])}</b>
            {series.filter((s) => (s.values[hover] || 0) > 0).map((s) => (
              <span key={s.key} className="flex items-center justify-between gap-4 text-[0.78125rem]">
                <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                <span className="tabular-nums">{format(s.values[hover])}</span>
              </span>
            ))}
            {!totals[hover] && <span className="tf-tip-muted text-[0.78125rem]">ไม่มีเอกสาร</span>}
          </Tooltip>
        )}
      </div>
      {/* คำอธิบายสี: ชี้เพื่อเน้นเฉพาะประเภทนั้นในกราฟ */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" onMouseLeave={() => setFocus(null)}>
        {series.map((s) => (
          <span key={s.key} onMouseEnter={() => setFocus(s.key)}
            className={cx('flex cursor-default items-center gap-1.5 text-[0.84375rem] transition-opacity', focus && focus !== s.key ? 'opacity-40' : 'text-ink')}>
            <i className="size-2.5 rounded-full" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * โดนัท: data = [{ key, label, value, color }] · เริ่มที่ 12 นาฬิกา วนตามเข็ม
 * ปลายชิ้นตัดตรง (ปลายมนทำให้ชิ้นเล็กดูใหญ่เกินจริง) คั่นด้วยช่องสีพื้น 2px · ย่อตามความกว้างกรอบ · ชี้แล้วเห็นค่าและ %
 */
export function Donut({ data, format = String, size = 232, centerLabel = 'รวม' }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const s = w > 0 ? Math.min(size, w) : size;
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const thick = Math.round(s * 0.13);
  const rm = s / 2 - thick / 2 - 4; // เผื่อขอบให้ชิ้นที่ชี้ (หนาขึ้น 4px) ไม่ล้นกรอบ
  const C = 2 * Math.PI * rm;
  const GAP = data.filter((d) => d.value > 0).length > 1 ? 2 : 0;
  let acc = 0;
  const arcs = total > 0 ? data.map((d) => {
    const frac = d.value / total;
    const start = acc;
    acc += frac;
    return { ...d, frac, start };
  }) : [];
  const h = hover != null ? arcs[hover] : null;
  const centerText = format(h ? h.value : total);
  // ตัวเลขกลางต้องอยู่ในรูวงใน: ย่อขนาดตามความยาวข้อความ
  const inner = s - 2 * (thick + 4);
  const fontSize = Math.max(15, Math.min(26, (inner * 0.8) / (String(centerText).length * 0.6)));
  return (
    <div ref={ref} className="w-full shrink-0" style={{ maxWidth: size }}>
      <div className="relative mx-auto" style={{ width: s, height: s }} onMouseLeave={() => setHover(null)}>
        <svg width={s} height={s} role="img" aria-label="แผนภูมิโดนัทสัดส่วน" className="block -rotate-90">
          <circle cx={s / 2} cy={s / 2} r={rm} fill="none" stroke="var(--color-tile)" strokeWidth={thick} />
          {arcs.map((a, i) => {
            const px = a.frac * C;
            if (px <= 0) return null;
            const len = Math.max(px - GAP, 1);
            return (
              <circle
                key={a.key}
                cx={s / 2}
                cy={s / 2}
                r={rm}
                fill="none"
                stroke={a.color}
                strokeWidth={hover === i ? thick + 4 : thick}
                strokeDasharray={`${len} ${C}`}
                strokeDashoffset={-(a.start * C + GAP / 2)}
                opacity={hover == null || hover === i ? 1 : 0.35}
                onMouseEnter={() => setHover(i)}
                style={{ transition: 'opacity .15s, stroke-width .15s' }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="truncate text-[0.8125rem] text-ink-soft" style={{ maxWidth: inner * 0.8 }}>{h ? h.label : centerLabel}</span>
          <b className="font-display font-semibold leading-tight tracking-tight tabular-nums" style={{ fontSize }}>{centerText}</b>
          <span className="mt-0.5 rounded-full bg-tile px-2.5 py-0.5 text-[0.78125rem] font-medium text-ink-soft">{h && total > 0 ? `${((h.value / total) * 100).toFixed(1)}%` : '100%'}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * แท่งแนวนอน: data = [{ key, label, value, color, sub }] · ปลายมนเต็ม ค่าอยู่ที่ปลายแท่ง
 * fill = กระจายแถวเต็มความสูงของกรอบ (ใช้ในการ์ดที่สูงตามการ์ดข้าง ๆ) และแท่งหนาขึ้น
 */
export function HBars({ data, format = String, fill = false }) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const [hover, setHover] = useState(null);
  return (
    <ul className={cx('flex flex-col', fill ? 'flex-1 justify-evenly gap-2' : 'gap-4')} onMouseLeave={() => setHover(null)}>
      {data.map((d, i) => (
        <li key={d.key} onMouseEnter={() => setHover(i)} className={cx('rounded-2xl transition-all', fill && 'px-3 py-2.5', fill && hover === i && 'bg-tile', hover != null && hover !== i && 'opacity-50')}>
          <div className="mb-2 flex items-center justify-between gap-3 text-[0.90625rem]">
            <span className="flex min-w-0 items-center gap-2.5">
              {fill && <i className="size-3 shrink-0 rounded-full" style={{ background: d.color, boxShadow: `0 0 0 4px ${d.color}22` }} />}
              <span className="min-w-0 truncate" title={d.label}>{d.label}</span>
              {d.sub && <small className="shrink-0 text-[0.8125rem] font-medium text-ink-soft tabular-nums">{d.sub}</small>}
            </span>
            <b className="shrink-0 font-mono text-[0.90625rem] font-medium tabular-nums">{format(d.value)}</b>
          </div>
          <div className={cx('overflow-hidden rounded-full', fill ? 'h-3.5 bg-line/70' : 'h-2.5 bg-tile')}>
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: d.color, transition: 'width .6s var(--ease-slide)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * แท่งเดียวแบบสัดส่วน 100% (ส่วนของทั้งหมด): ปลายมนเฉพาะหัว-ท้ายของทั้งแท่ง ช่วงในตัดตรง
 * คั่นแต่ละช่วงด้วยช่องสีพื้น 2px ความยาวแต่ละช่วงตรงตามสัดส่วนจริง
 */
export function StackBar({ data, onHover, active }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const rows = data.filter((d) => d.value > 0);
  return (
    <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-full bg-tile" onMouseLeave={() => onHover?.(null)}>
      {rows.map((d) => (
        <div key={d.key} onMouseEnter={() => onHover?.(d.key)} className="h-full transition-opacity duration-200" style={{ flexGrow: d.value, flexBasis: 0, minWidth: 3, background: d.color, opacity: active == null || active === d.key ? 1 : 0.3 }} title={`${d.label} ${d.value} ฉบับ (${((d.value / total) * 100).toFixed(1)}%)`} />
      ))}
    </div>
  );
}
