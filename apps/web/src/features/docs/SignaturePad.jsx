/**
 * SignaturePad.jsx แผงลงลายมือชื่อ: วาด · พิมพ์ · อัปโหลดรูป · ลายเซ็นที่บันทึกไว้
 * ดีไซน์ตามคอมโพเนนต์ SignaturePad (ไอคอน Lucide) แปลงเป็น JSX + Tailwind ของโปรเจกต์ ไม่ใช้ framer-motion
 * - วาด: เส้นเป็นรูปทรงปิดที่หนาบางตามแรงกดปากกา (เมาส์ใช้ความเร็วแทน) และเรียวที่หัว-ท้าย จึงดูเหมือนลายมือจริง
 * - พิมพ์: เลือกฟอนต์ลายมือภาษาไทย 5 แบบ (Charmonman, Srisakdi, Charm, Sriracha, Mali) ขนาดปรับให้พอดีเส้น
 * - อัปโหลด: ตัดพื้นกระดาษออกให้โปร่งใสและครอบเฉพาะลายเซ็น
 * - บันทึกไว้: คลังลายเซ็นของบัญชี (/api/signatures) เลือกแล้วลงนามได้ทันที
 * ทุกแบบส่งออกเป็น PNG พื้นโปร่งใส · โหมดกลางคืนยกความสว่างของหมึกบนจอเท่านั้น สีที่บันทึกยังเป็นสีหมึกจริง
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { docsApi } from './docsApi.js';
import { useToast } from '../../components/Toast.jsx';
import { cx } from '../../components/ui.jsx';
import Lucide from '../../components/lucide.jsx';

/* ------------------------------------------------------------ ค่าตั้งต้น -- */

/** ฟอนต์ลายมือภาษาไทย (Google Fonts, SIL OFL) */
export const SIGN_FACES = [
  { name: 'Charmonman', family: '"Charmonman", cursive', note: 'พลิ้วไหว คลาสสิก' },
  { name: 'Srisakdi', family: '"Srisakdi", cursive', note: 'มีลีลาและเส้นโค้ง' },
  { name: 'Charm', family: '"Charm", cursive', note: 'โค้งมน ประณีต' },
  { name: 'Sriracha', family: '"Sriracha", cursive', note: 'คล้ายลายมือเขียน' },
  { name: 'Mali', family: '"Mali", cursive', note: 'ลายมือเป็นธรรมชาติ' },
];
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Charm:wght@400;700&family=Charmonman:wght@400;700&family=Mali:wght@400;500&family=Sriracha&family=Srisakdi:wght@400;700&display=swap';

const INKS = [
  { name: 'หมึกดำ', value: '#171717' },
  { name: 'หมึกน้ำเงิน', value: '#1d4ed8' },
  { name: 'หมึกแดง', value: '#b91c1c' },
];
const CONSENT = 'การลงลายมือชื่ออิเล็กทรอนิกส์ในเอกสารนี้ ข้าพเจ้ายอมรับว่ามีผลเช่นเดียวกับการลงลายมือชื่อด้วยมือ ตามที่กฎหมายว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์กำหนด';
const SIG_MAX = 5 * 1024 * 1024;
const BOARD_H = 'h-[196px]';

const TABS = [
  { id: 'draw', label: 'วาด', icon: 'pen' },
  { id: 'type', label: 'พิมพ์', icon: 'type' },
  { id: 'upload', label: 'อัปโหลด', icon: 'image-up' },
  { id: 'saved', label: 'บันทึกไว้', icon: 'bookmark-check' },
];

/** ใส่ลิงก์ฟอนต์ลายมือครั้งเดียวต่อหน้า และไม่ถอดออก (ฟอนต์หายระหว่างแสดงลายเซ็นจะทำให้รูปทรงขยับ) */
function useSigningFonts() {
  useEffect(() => {
    if (document.querySelector('link[data-signature-faces="true"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    link.setAttribute('data-signature-faces', 'true');
    document.head.appendChild(link);
  }, []);
}

/* ---------------------------------------------------------------- สี -- */

/** แปลงสี CSS เป็น rgb โดยให้ canvas อ่านค่าให้ */
function toRgb(css) {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1, 1);
  g.fillStyle = css; g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  return [r, gg, b];
}
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** หมึกเดียวกันแต่สว่างขึ้นพอให้อ่านได้บนพื้นมืด (เฉพาะบนจอ) */
function inkOnScreen(color, dark) {
  if (!dark) return color;
  const rgb = toRgb(color);
  if (!rgb || lum(rgb) > 0.5) return color;
  const mix = (v) => Math.round(v + (255 - v) * 0.72);
  return `rgb(${mix(rgb[0])} ${mix(rgb[1])} ${mix(rgb[2])})`;
}

/** อยู่ในโหมดกลางคืนไหม ติดตาม data-theme ของ <html> (สลับจากแถบบนได้ทุกเมื่อ) */
function useOnDark() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

/* ============================================================ เรขาคณิต ==
   เส้นหนึ่งเส้น = จุดที่มีค่าแรงกด → รัศมีที่แต่ละจุด → เดินตามเส้นแล้วเลื่อนออกสองข้าง → ต่อเป็นรูปทรงปิดแล้วเติมสี
   การเติมรูปทรง (แทนการลากเส้น) ทำให้ความหนาเปลี่ยนไปตามแรงกดได้
   ========================================================================= */

const num = (n) => Math.round(n * 100) / 100;

/** ค่าเฉลี่ยสามจุด ลบรอยหยักขั้นบันไดของเมาส์ */
function smooth(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]; const b = points[i]; const c = points[i + 1];
    out.push({ x: (a.x + b.x * 2 + c.x) / 4, y: (a.y + b.y * 2 + c.y) / 4, p: (a.p + b.p * 2 + c.p) / 4 });
  }
  out.push(points[points.length - 1]);
  return out;
}
const easeOut = (t) => 1 - (1 - t) * (1 - t);

/** ด้านหนึ่งของรูปทรง ลากผ่านจุดกึ่งกลางให้รอยต่อนุ่ม */
function side(points, continued = false) {
  const [first, ...rest] = points;
  let d = `${continued ? 'L' : 'M'} ${num(first[0])} ${num(first[1])}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const [x, y] = rest[i]; const [nx, ny] = rest[i + 1];
    d += ` Q ${num(x)} ${num(y)} ${num((x + nx) / 2)} ${num((y + ny) / 2)}`;
  }
  const last = rest[rest.length - 1];
  if (last) d += ` L ${num(last[0])} ${num(last[1])}`;
  return d;
}

/** รูปทรงของเส้นเป็น path SVG ใช้ทั้งวาดบน canvas (Path2D) และตอนส่งออก จึงตรงกันเสมอ */
function strokePath(stroke) {
  const pts = smooth(stroke.points);
  const base = stroke.size / 2;
  if (pts.length === 1) {
    const { x, y, p } = pts[0];
    const r = num(base * (0.4 + 0.6 * p));
    return `M ${num(x - r)} ${num(y)} a ${r} ${r} 0 1 0 ${num(r * 2)} 0 a ${r} ${r} 0 1 0 ${num(-r * 2)} 0 Z`;
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = len[len.length - 1];
  // เรียวหัวท้ายไม่เกินครึ่งเส้น ไม่งั้นเส้นสั้นๆ จะหายไปหมด
  const taper = Math.min(stroke.size * 3.5, total / 2);
  const left = []; const right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]; const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next.x - prev.x; let dy = next.y - prev.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const fromStart = taper > 0 ? Math.min(1, len[i] / taper) : 1;
    const fromEnd = taper > 0 ? Math.min(1, (total - len[i]) / taper) : 1;
    const r = base * (0.32 + 0.68 * pts[i].p) * easeOut(Math.min(fromStart, fromEnd));
    left.push([pts[i].x - dy * r, pts[i].y + dx * r]);
    right.push([pts[i].x + dy * r, pts[i].y - dx * r]);
  }
  return `${side(left)} ${side(right.reverse(), true)} Z`;
}

function bounds(strokes, pad = 10) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const s of strokes) {
    const r = s.size / 2;
    for (const pt of s.points) {
      x0 = Math.min(x0, pt.x - r); y0 = Math.min(y0, pt.y - r);
      x1 = Math.max(x1, pt.x + r); y1 = Math.max(y1, pt.y + r);
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/** PNG ที่ครอบเฉพาะหมึก พื้นโปร่งใส ความละเอียด 2 เท่า */
function strokesToPng(strokes, scale = 2) {
  const b = bounds(strokes);
  if (!b) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(b.w * scale); canvas.height = Math.ceil(b.h * scale);
  const g = canvas.getContext('2d');
  g.scale(scale, scale);
  g.translate(-b.x, -b.y);
  for (const s of strokes) { g.fillStyle = s.color; g.fill(new Path2D(strokePath(s))); }
  return canvas.toDataURL('image/png');
}

/* ============================================================ กระดานวาด == */

function DrawBoard({ strokes, setStrokes, color, onDark }) {
  const canvasRef = useRef(null);
  const liveRef = useRef(null);
  const lastRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const SIZE = 6;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const g = canvas && canvas.getContext('2d');
    if (!g) return;
    const dpr = window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    const all = liveRef.current ? [...strokes, liveRef.current] : strokes;
    for (const s of all) { g.fillStyle = inkOnScreen(s.color, onDark); g.fill(new Path2D(strokePath(s))); }
  }, [strokes, onDark]);

  // canvas ขนาดเป็นพิกเซลจริงของจอแล้วย่อกลับ หมึกจึงคมบนจอความละเอียดสูง
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      paint();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [paint]);

  const point = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    // ปากกาส่งแรงกดมา · เมาส์ให้ 0.5 ทุกจุด จึงใช้ความเร็วมือแทน (เร็ว = บาง ช้า = หนา) และค่อยๆ ไล่เข้าหาค่าเป้าหมาย
    let p;
    const now = performance.now();
    const last = lastRef.current;
    if (e.pointerType === 'pen' && e.pressure > 0 && e.pressure !== 0.5) p = e.pressure;
    else if (last) {
      const dt = Math.max(1, now - last.t);
      const speed = Math.hypot(x - last.x, y - last.y) / dt;
      const target = Math.max(0.28, Math.min(1, 1 - speed / 2.4));
      p = last.p + (target - last.p) * 0.45;
    } else p = 0.65;
    lastRef.current = { x, y, t: now, p };
    return { x, y, p };
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastRef.current = null;
    liveRef.current = { points: [point(e)], color, size: SIZE };
    setDrawing(true);
    paint();
  };
  const onMove = (e) => {
    const live = liveRef.current;
    if (!live) return;
    const pt = point(e);
    const prev = live.points[live.points.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) < 1.1) return;
    live.points.push(pt);
    paint();
  };
  const end = () => {
    const live = liveRef.current;
    liveRef.current = null; lastRef.current = null;
    setDrawing(false);
    if (live && live.points.length) setStrokes((s) => [...s, live]);
  };

  const empty = strokes.length === 0 && !drawing;
  return (
    <div className="relative">
      <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}
        role="img" aria-label="พื้นที่วาดลายเซ็น" className={cx('block w-full cursor-crosshair touch-none', BOARD_H)} />
      <div className="pointer-events-none absolute inset-x-8 bottom-[52px] select-none">
        <div className="h-px w-full bg-black/[0.12] dark:bg-white/20" />
        <p className={cx('m-0 mt-2 text-center text-[0.875rem] text-neutral-400 transition-opacity duration-200 dark:text-neutral-500', empty ? 'opacity-100' : 'opacity-0')}>
          วาดลายเซ็นเหนือเส้นนี้
        </p>
      </div>
    </div>
  );
}

/* ============================================================ ฟอนต์ลายมือ == */

/** ฟอนต์ลายมือขนาดจริงต่างกันมาก ปรับให้ความสูงตัวอักษรเท่ากันโดยวัดจากตัว "ก" */
function useLevelledSizes(faces, target) {
  const [sizes, setSizes] = useState({});
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      const g = document.createElement('canvas').getContext('2d');
      if (!g) return;
      const next = {};
      for (const f of faces) {
        g.font = `100px ${f.family}`;
        const h = g.measureText('ก').actualBoundingBoxAscent || 50;
        next[f.name] = Math.round(Math.max(14, Math.min(28, (target / h) * 100)));
      }
      if (!cancelled) setSizes(next);
    };
    measure();
    // ฟอนต์โหลดไม่สำเร็จก็ใช้ขนาดที่วัดจากฟอนต์สำรองไปก่อน
    if (document.fonts) document.fonts.ready.then(() => !cancelled && measure()).catch(() => {});
    return () => { cancelled = true; };
  }, [faces, target]);
  return sizes;
}

function TypefacePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const sizes = useLevelledSizes(SIGN_FACES, 11);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={cx('flex h-9 items-center gap-1.5 rounded-[9px] px-2.5 font-medium text-neutral-600 transition-colors hover:bg-black/[0.05] hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/[0.08] dark:hover:text-neutral-50',
          open && 'bg-black/[0.05] dark:bg-white/[0.08]')}>
        <span className="leading-none" style={{ fontFamily: value.family, fontSize: Math.round((sizes[value.name] ?? 20) * 0.85) }}>{value.name}</span>
        <Lucide name="chevron-down" className={cx('size-3.5 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <ul role="listbox" className="tf-pop absolute left-0 top-[calc(100%+6px)] z-20 m-0 flex w-[15rem] list-none flex-col gap-[2px] overflow-hidden rounded-[12px] border border-black/[0.07] bg-[#ffffff] p-1 shadow-[0_16px_36px_-14px_rgb(0_0_0/0.28)] dark:border-white/[0.09] dark:bg-neutral-900">
          {SIGN_FACES.map((f) => {
            const active = f.name === value.name;
            return (
              <li key={f.name}>
                <button type="button" role="option" aria-selected={active} onClick={() => { onChange(f); setOpen(false); }}
                  className={cx('flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.07]', active && 'bg-black/[0.05] dark:bg-white/[0.07]')}>
                  <span className="min-w-0">
                    <span className="block truncate leading-tight text-neutral-800 dark:text-neutral-100" style={{ fontFamily: f.family, fontSize: sizes[f.name] ?? 20 }}>{f.name}</span>
                    <span className="block text-[0.75rem] text-neutral-500 dark:text-neutral-400">{f.note}</span>
                  </span>
                  {active && <Lucide name="check" className="size-3.5 shrink-0 text-neutral-500" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ================================================================ พิมพ์ == */

/** ขนาดใหญ่สุดที่ชื่อยังพอดีบรรทัด วัดจากรูปตัวอักษรจริง (ฟอนต์ลายมือมีหางยาวเกินกรอบ em) */
function fitText(text, family, maxWidth, maxHeight, cap = 52) {
  const fallback = { size: cap, ascent: cap * 0.8, descent: cap * 0.2 };
  if (!text.trim()) return fallback;
  const g = document.createElement('canvas').getContext('2d');
  if (!g) return fallback;
  g.font = `100px ${family}`;
  const m = g.measureText(text);
  const w = m.width || 1;
  const ascent = m.actualBoundingBoxAscent || 80;
  const descent = m.actualBoundingBoxDescent || 20;
  const size = Math.max(16, Math.min(cap, (maxWidth / w) * 100, (maxHeight / (ascent + descent)) * 100));
  return { size, ascent: (ascent * size) / 100, descent: (descent * size) / 100 };
}

function TypeBoard({ value, onChange, face, color, onDark }) {
  const inputRef = useRef(null);
  const lineRef = useRef(null);
  const [fit, setFit] = useState({ size: 44, ascent: 35, descent: 9 });
  const [focused, setFocused] = useState(false);
  const BOX = 124;

  // วัดใหม่เมื่อข้อความ/ฟอนต์/ความกว้างเปลี่ยน และอีกครั้งเมื่อฟอนต์โหลดเสร็จ
  useEffect(() => {
    const el = lineRef.current;
    if (!el) return undefined;
    const measure = () => setFit(fitText(value, face.family, el.clientWidth - 10, BOX - 12));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    let cancelled = false;
    if (document.fonts) document.fonts.ready.then(() => !cancelled && measure()).catch(() => {});
    return () => { cancelled = true; ro.disconnect(); };
  }, [value, face.family]);

  return (
    // ช่องพิมพ์ (โปร่งใส) คลุมทั้งกระดาน แตะตรงไหนก็พิมพ์ได้ ไม่ต้องใช้ onClick บน div (เข้าถึงด้วยคีย์บอร์ด/โปรแกรมอ่านหน้าจอได้)
    <div className={cx('relative cursor-text px-8', BOARD_H)}>
      <div className="absolute inset-x-8 bottom-[52px]">
        {/* กล่องสิ้นสุดที่เส้น ชื่อถูกดันลงเท่าหางตัวอักษร ฐานบรรทัดจึงอยู่บนเส้นและหางเลยเส้นแบบลายมือจริง */}
        <div ref={lineRef} style={{ height: BOX }} className="flex items-end justify-center">
          <span className="block whitespace-nowrap leading-none" style={{ fontFamily: face.family, color: inkOnScreen(color, onDark), fontSize: fit.size, paddingBottom: Math.round(fit.descent) }}>{value}</span>
          {focused && <span aria-hidden="true" className="tf-sig-caret ml-[3px] w-px shrink-0 bg-neutral-400 dark:bg-neutral-500" style={{ height: Math.max(18, fit.ascent), marginBottom: Math.round(fit.descent) }} />}
        </div>
        <div className="h-px w-full bg-black/[0.12] dark:bg-white/20" />
        {!value && <p className="pointer-events-none m-0 mt-2 text-center text-[0.875rem] text-neutral-400 dark:text-neutral-500">พิมพ์ชื่อ-นามสกุลของคุณ</p>}
      </div>
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        aria-label="พิมพ์ลายเซ็น" maxLength={40}
        className="absolute inset-0 size-full cursor-text bg-transparent text-center text-transparent caret-transparent outline-none" />
    </div>
  );
}

/* ============================================================== อัปโหลด == */

/** ตัดพื้นกระดาษออกเป็นโปร่งใส แล้วครอบเฉพาะลายเซ็น รูปถ่ายหน้าเอกสารจึงไม่มีกรอบขาวติดมา */
async function cleanUpload(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('อ่านรูปไม่ได้'));
      el.src = url;
    });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale)); const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h);
    const px = data.data;
    let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        const alpha = Math.max(0, Math.min(255, (245 - l) * 1.9));
        px[i + 3] = Math.min(px[i + 3], alpha);
        if (alpha > 24) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      }
    }
    g.putImageData(data, 0, 0);
    if (x1 < 0) return canvas.toDataURL('image/png');
    const pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** รูปลายเซ็นบนพื้นมืด: กลับสีแล้วหมุนเฉดคืน หมึกดำเป็นขาว แต่หมึกน้ำเงิน/แดงยังเป็นเฉดเดิม */
const ON_DARK_IMG = 'dark:[filter:invert(1)_hue-rotate(180deg)]';

function UploadBoard({ image, setImage }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const take = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('ไฟล์นี้ไม่ใช่รูปภาพ'); return; }
    if (file.size > SIG_MAX) { setError('รูปใหญ่เกิน 5 MB'); return; }
    setBusy(true); setError(null);
    try { setImage(await cleanUpload(file)); } catch { setError('อ่านรูปนี้ไม่ได้'); } finally { setBusy(false); }
  };

  return (
    <div className={cx('flex items-center justify-center px-6', BOARD_H)}>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="เลือกรูปลายเซ็น" onChange={(e) => { void take(e.target.files?.[0]); }} />
      {image ? (
        <div className="flex w-full flex-col items-center gap-2">
          <img src={image} alt="ลายเซ็นที่อัปโหลด" className={cx('max-h-[118px] max-w-full object-contain', ON_DARK_IMG)} />
          <div className="flex items-center gap-1.5">
            <GhostButton onClick={() => inputRef.current?.click()} icon="image-up">เปลี่ยนรูป</GhostButton>
            <GhostButton onClick={() => setImage(null)} icon="trash">ลบ</GhostButton>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]); }}
          className={cx('flex h-[156px] w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed transition-colors duration-150',
            over ? 'border-neutral-400 bg-black/[0.04] dark:border-white/30 dark:bg-white/[0.06]' : 'border-neutral-300 hover:bg-black/[0.02] dark:border-white/15 dark:hover:bg-white/[0.03]')}>
          <Lucide name="image-up" className={cx('size-5 text-neutral-400 transition-transform dark:text-neutral-500', over && '-translate-y-0.5')} />
          <span className="text-[0.9375rem] font-medium text-neutral-700 dark:text-neutral-200">{busy ? 'กำลังอ่านรูป…' : 'ลากรูปมาวาง หรือเลือกไฟล์'}</span>
          <span className="text-[0.8125rem] text-neutral-400 dark:text-neutral-500">PNG หรือ JPG ระบบตัดพื้นกระดาษด้านหลังออกให้</span>
          {error && <span className="text-[0.8125rem] text-rose-600 dark:text-rose-400">{error}</span>}
        </button>
      )}
    </div>
  );
}

/* ============================================================ บันทึกไว้ == */

function SavedBoard({ saved, loading, selected, onSelect, onDelete }) {
  if (loading) return <div className={cx('flex items-center justify-center text-[0.875rem] text-neutral-400', BOARD_H)}>กำลังโหลด…</div>;
  if (!saved.length) {
    return (
      <div className={cx('flex flex-col items-center justify-center gap-1.5 px-8 text-center', BOARD_H)}>
        <Lucide name="bookmark-check" className="size-5 text-neutral-400 dark:text-neutral-500" />
        <p className="m-0 text-[0.9375rem] font-medium text-neutral-700 dark:text-neutral-200">ยังไม่มีลายเซ็นที่บันทึกไว้</p>
        <p className="m-0 text-[0.8125rem] text-neutral-400 dark:text-neutral-500">วาดหรือพิมพ์ลายเซ็น แล้วกด “บันทึกลายเซ็น”</p>
      </div>
    );
  }
  return (
    <div className={cx('overflow-y-auto p-3', BOARD_H)}>
      <div className="grid grid-cols-2 gap-2">
        {saved.map((sig) => {
          const active = sig.id === selected;
          return (
            <button key={sig.id} type="button" aria-pressed={active} onClick={() => onSelect(sig.id)}
              className={cx('group relative flex h-[84px] flex-col items-center justify-center gap-1 rounded-[12px] border px-3 transition-colors duration-150',
                active ? 'border-neutral-900 bg-[#ffffff] dark:border-neutral-100 dark:bg-white/[0.08]' : 'border-black/[0.08] bg-[#ffffff] hover:border-black/20 dark:border-white/[0.1] dark:bg-white/[0.03] dark:hover:border-white/25')}>
              <img src={sig.image} alt={sig.name || 'ลายเซ็นที่บันทึกไว้'} className={cx('max-h-[44px] max-w-full object-contain', ON_DARK_IMG)} />
              <span className="max-w-full truncate text-[0.75rem] text-neutral-500 dark:text-neutral-400">{sig.name || 'ลายเซ็น'}</span>
              {active && (
                <span className="tf-pop absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
                  <Lucide name="check" className="size-2.5" strokeWidth={3.5} />
                </span>
              )}
              <span role="button" tabIndex={0} aria-label={`ลบ ${sig.name || 'ลายเซ็น'}`}
                onClick={(e) => { e.stopPropagation(); onDelete(sig.id); }}
                onKeyDown={(e) => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); e.stopPropagation(); onDelete(sig.id); }}
                className="absolute left-1.5 top-1.5 grid size-[22px] place-items-center rounded-[7px] text-neutral-400 transition-colors hover:bg-black/[0.06] hover:text-neutral-800 dark:text-neutral-500 dark:hover:bg-white/[0.1] dark:hover:text-neutral-100">
                <Lucide name="trash" className="size-3.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ ชิ้นส่วนย่อย == */

function GhostButton({ onClick, icon, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-[9px] px-2.5 text-[0.875rem] font-medium text-neutral-600 transition-colors hover:bg-black/[0.05] hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-white/[0.08] dark:hover:text-neutral-50">
      {icon && <Lucide name={icon} className="size-3.5" />}
      {children}
    </button>
  );
}

function InkSwatches({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="สีหมึก" className="flex items-center gap-1.5">
      {INKS.map((ink) => {
        const active = ink.value === value;
        return (
          <button key={ink.value} type="button" role="radio" aria-checked={active} aria-label={ink.name} title={ink.name} onClick={() => onChange(ink.value)}
            className="grid size-8 place-items-center rounded-full transition-transform duration-150 hover:scale-110">
            <span style={{ backgroundColor: ink.value }}
              className={cx('grid size-[1.375rem] place-items-center rounded-full ring-offset-2 ring-offset-[#ffffff] transition-all duration-150 dark:ring-offset-neutral-900',
                active ? 'ring-2 ring-black/25 dark:ring-white/40' : 'ring-0 dark:ring-1 dark:ring-white/20')}>
              {active && <span className="tf-pop flex"><Lucide name="check" className="size-3 text-white" strokeWidth={3.5} /></span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** แท็บวิธีลงนาม: แถบเม็ดยาสีขาวเลื่อนไปตามแท็บที่เลือก · ลูกศรซ้าย/ขวาเปลี่ยนแท็บได้ */
function Tabs({ value, onChange }) {
  const i = TABS.findIndex((t) => t.id === value);
  const n = TABS.length;
  return (
    <div role="tablist" aria-label="วิธีลงลายมือชื่อ" className="relative grid w-full gap-1 rounded-[12px] bg-neutral-100 p-1 dark:bg-white/[0.04]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span aria-hidden="true"
        className="absolute left-1 top-1 h-[calc(100%-0.5rem)] rounded-[9px] bg-[#ffffff] shadow-[0_1px_2px_rgb(0_0_0/0.14),0_0_0_1px_rgb(0_0_0/0.07)] transition-transform duration-300 ease-[cubic-bezier(.3,.9,.3,1.05)] dark:bg-neutral-700 dark:shadow-[0_1px_3px_rgb(0_0_0/0.55),0_0_0_1px_rgb(255_255_255/0.14)]"
        style={{ width: `calc((100% - 0.5rem - ${(n - 1) * 0.25}rem) / ${n})`, transform: `translateX(calc(${i} * (100% + 0.25rem)))` }} />
      {TABS.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              onChange(TABS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n].id);
            }}
            className={cx('relative z-[1] flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[0.9375rem] transition-colors duration-150',
              active ? 'font-semibold text-neutral-900 dark:text-white' : 'font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200')}>
            <Lucide name={t.icon} className="size-4 shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================= แผงหลัก == */

/**
 * savedItems / loadingSaved = คลังลายเซ็นของบัญชี · onUseSaved(item) ลงนามด้วยลายเซ็นที่บันทึกไว้
 * onSign(pngDataUrl, ชื่อที่พิมพ์, false) ลงนามด้วยลายเซ็นใหม่ · onDeleteSaved(id) ลบออกจากคลัง
 * signerName = ชื่อตั้งต้นของแท็บพิมพ์ · onCancel (ถ้ามี) แสดงปุ่มปิดมุมขวาบน และปุ่มยกเลิกจะปิดแผง
 */
export default function SignaturePad({ savedItems = [], loadingSaved, onUseSaved, onDeleteSaved, onSign, signerName = '', onCancel, title = 'ลายมือชื่อ' }) {
  useSigningFonts();
  const toast = useToast();
  const qc = useQueryClient();
  const onDark = useOnDark();

  const [method, setMethod] = useState('draw');
  const [color, setColor] = useState(INKS[0].value);
  const [strokes, setStrokes] = useState([]);
  const [typed, setTyped] = useState(signerName);
  const [face, setFace] = useState(SIGN_FACES[0]);
  const [image, setImage] = useState(null);
  const [pick, setPick] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // มีลายเซ็นในคลังแล้ว เปิดที่แท็บ "บันทึกไว้" และเลือกอันล่าสุดไว้ให้
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || loadingSaved) return;
    seeded.current = true;
    if (savedItems.length) { setMethod('saved'); setPick(savedItems[0].id); }
  }, [loadingSaved, savedItems]);
  // ชื่อผู้ลงนามเปลี่ยน และยังไม่ได้พิมพ์เอง → ตามชื่อนั้น
  const typedTouched = useRef(false);
  useEffect(() => { if (!typedTouched.current) setTyped(signerName); }, [signerName]);

  const chosen = savedItems.find((s) => s.id === pick) || null;
  const ready = method === 'draw' ? strokes.length > 0 : method === 'type' ? typed.trim().length > 0 : method === 'upload' ? !!image : !!chosen;

  useEffect(() => setJustSaved(false), [method, strokes, typed, image, face, color]);
  useEffect(() => {
    if (!justSaved) return undefined;
    const t = setTimeout(() => setJustSaved(false), 1800);
    return () => clearTimeout(t);
  }, [justSaved]);

  /** พิมพ์ชื่อลง canvas ด้วยฟอนต์ที่เลือก (รอฟอนต์โหลดก่อน ไม่งั้นได้ฟอนต์สำรอง) */
  async function typedToPng() {
    const text = typed.trim();
    if (!text) return undefined;
    const size = Math.round(fitText(text, face.family, 560, 96, 64).size);
    const font = `${size}px ${face.family}`;
    try { await document.fonts.load(font, text); } catch { /* ใช้ฟอนต์ที่มี */ }
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const m = probe.measureText(text);
    const asc = Math.ceil(m.actualBoundingBoxAscent || size * 0.8);
    const desc = Math.ceil(m.actualBoundingBoxDescent || size * 0.25);
    const w = Math.ceil(m.width) + 40; const h = asc + desc + 30;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale; canvas.height = h * scale;
    const g = canvas.getContext('2d');
    g.scale(scale, scale);
    g.font = font; g.fillStyle = color; g.textBaseline = 'alphabetic';
    g.fillText(text, 20, 15 + asc);
    return canvas.toDataURL('image/png');
  }

  /** ลายเซ็นปัจจุบันเป็น PNG ไม่ว่าจะมาจากแท็บไหน */
  async function compose() {
    if (method === 'draw') return strokesToPng(strokes);
    if (method === 'type') return typedToPng();
    if (method === 'upload') return image || undefined;
    return undefined;
  }

  async function save() {
    const png = await compose();
    if (!png) return;
    setSaving(true);
    try {
      const name = (method === 'type' ? typed.trim() : '') || signerName || '';
      await docsApi.saveSignature({ name: name || (method === 'upload' ? 'ลายเซ็นที่อัปโหลด' : 'ลายเซ็นที่วาด'), image: png });
      await qc.invalidateQueries({ queryKey: ['signatures'] });
      setJustSaved(true);
    } catch (err) { toast(err.message, 'err'); } finally { setSaving(false); }
  }

  async function accept() {
    if (!ready) return;
    if (method === 'saved') { onUseSaved(chosen); return; }
    const png = await compose();
    if (!png) return;
    onSign(png, method === 'type' ? typed.trim() : '', false);
  }

  function cancel() {
    if (onCancel) { onCancel(); return; }
    if (method === 'draw') setStrokes([]);
    else if (method === 'type') { setTyped(''); typedTouched.current = true; }
    else if (method === 'upload') setImage(null);
    else setPick(null);
  }

  return (
    <div className="w-full overflow-hidden rounded-[18px] border border-black/[0.07] bg-[#ffffff] text-neutral-950 antialiased shadow-[0_1px_2px_rgb(0_0_0/0.05)] dark:border-white/[0.08] dark:bg-neutral-900 dark:text-neutral-50">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="m-0 text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label="ปิด"
            className="grid size-8 place-items-center rounded-[8px] text-neutral-400 transition-colors hover:bg-black/[0.06] hover:text-neutral-800 dark:text-neutral-500 dark:hover:bg-white/[0.1] dark:hover:text-neutral-100">
            <Lucide name="x" className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-3.5 px-4"><Tabs value={method} onChange={setMethod} /></div>
      <div className="mt-4 h-px bg-black/[0.06] dark:bg-white/[0.08]" />

      <div className="flex min-h-[3.5rem] items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          {method === 'type' && <TypefacePicker value={face} onChange={setFace} />}
          {method === 'draw' && (
            <div className="flex items-center gap-0.5">
              <GhostButton onClick={() => setStrokes((s) => s.slice(0, -1))} icon="undo" disabled={!strokes.length}>ย้อนกลับ</GhostButton>
              <GhostButton onClick={() => setStrokes([])} icon="eraser" disabled={!strokes.length}>ล้าง</GhostButton>
            </div>
          )}
          {method === 'upload' && <span className="text-[0.875rem] text-neutral-400 dark:text-neutral-500">รูปถ่ายหรือสแกนลายเซ็นของคุณ</span>}
          {method === 'saved' && <span className="text-[0.875rem] text-neutral-400 dark:text-neutral-500">{savedItems.length ? 'เลือกลายเซ็นแล้วกดลงนาม' : 'ยังไม่มีลายเซ็นที่บันทึกไว้'}</span>}
        </div>
        {(method === 'draw' || method === 'type') && <InkSwatches value={color} onChange={setColor} />}
      </div>

      <div className="px-4">
        <div className="overflow-hidden rounded-[14px] bg-neutral-100/70 dark:bg-white/[0.04]">
          <div key={method} className="tf-sig-swap">
            {method === 'draw' && <DrawBoard strokes={strokes} setStrokes={setStrokes} color={color} onDark={onDark} />}
            {method === 'type' && <TypeBoard value={typed} onChange={(v) => { typedTouched.current = true; setTyped(v); }} face={face} color={color} onDark={onDark} />}
            {method === 'upload' && <UploadBoard image={image} setImage={setImage} />}
            {method === 'saved' && <SavedBoard saved={savedItems} loading={loadingSaved} selected={pick} onSelect={setPick} onDelete={(id) => { if (pick === id) setPick(null); onDeleteSaved(id); }} />}
          </div>
        </div>
      </div>

      <p className="m-0 px-4 pb-4 pt-3 text-[0.8125rem] leading-relaxed text-neutral-500 dark:text-neutral-400">{CONSENT}</p>
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.08]" />

      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
        {method !== 'saved' && (
          <div className="mr-auto">
            <GhostButton onClick={save} disabled={!ready || justSaved || saving} icon={justSaved ? 'check' : 'bookmark-check'}>
              {justSaved ? 'บันทึกแล้ว' : saving ? 'กำลังบันทึก…' : 'บันทึกลายเซ็น'}
            </GhostButton>
          </div>
        )}
        <button type="button" onClick={cancel}
          className="inline-flex h-10 items-center rounded-[10px] px-3 text-[0.9375rem] font-medium text-neutral-600 transition-colors hover:bg-black/[0.05] hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/[0.08] dark:hover:text-neutral-50">
          ยกเลิก
        </button>
        <button type="button" onClick={accept} disabled={!ready}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-neutral-900 px-3.5 text-[0.9375rem] font-medium text-white transition-[background-color,transform] hover:bg-neutral-800 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-[#ffffff]">
          <Lucide name="check" className="size-3.5" strokeWidth={2.75} />
          ยอมรับและลงนาม
        </button>
      </div>
    </div>
  );
}
