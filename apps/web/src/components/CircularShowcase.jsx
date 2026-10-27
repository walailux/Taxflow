/**
 * CircularShowcase.jsx ภาพหมุนแบบวงกลม 3 ใบ (ใบกลางอยู่หน้า ใบซ้าย/ขวาเอียงอยู่ด้านหลัง) + ข้อความด้านข้าง
 * ดัดแปลงจาก CircularTestimonials (21st.dev) ให้เข้ากับโปรเจกต์นี้: JSX + CSS ธรรมดา (ไม่ใช้ framer-motion / react-icons / styled-jsx)
 * - items: [{ src, alt, title, tag, text }] · autoplay เปลี่ยนเองทุก interval ms (หยุดเมื่อผู้ใช้กดลูกศร หรือตั้งลดการเคลื่อนไหว)
 * - ข้อความค่อย ๆ ชัดทีละคำแบบเบลอ→ชัด (CSS keyframes ct-word ใน landing.css) · ลูกศรซ้าย/ขวาบนคีย์บอร์ดใช้ได้เมื่อโฟกัสอยู่ที่ปุ่มลูกศร
 * - ลากหรือปัดภาพซ้าย/ขวาเพื่อเปลี่ยน (นิ้วหรือเมาส์) · แตะครึ่งซ้าย/ขวาของภาพ = ก่อนหน้า/ถัดไป
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/** ระยะเลื่อนของภาพข้าง ๆ ตามความกว้างกล่องภาพ (สูตรเดียวกับต้นฉบับ ปรับให้กล่องแคบบนมือถือ) */
function gapFor(width) {
  const minW = 280, maxW = 560, minGap = 34, maxGap = 70;
  if (width <= minW) return minGap;
  if (width >= maxW) return maxGap;
  return minGap + ((maxGap - minGap) * (width - minW)) / (maxW - minW);
}
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CircularShowcase({ items, autoplay = true, interval = 5000, label }) {
  const [active, setActive] = useState(0);
  const [width, setWidth] = useState(480);
  const [playing, setPlaying] = useState(autoplay);
  const box = useRef(null);
  const drag = useRef(null); // { x, y, id } จุดเริ่มลาก
  const [offset, setOffset] = useState(0); // ระยะที่ลากอยู่ (px) ภาพหน้าสุดเลื่อนตามนิ้ว/เมาส์
  const n = items.length;

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || reduceMotion()) return undefined;
    const t = setInterval(() => setActive((i) => (i + 1) % n), interval);
    return () => clearInterval(t);
  }, [playing, n, interval]);

  const next = useCallback(() => { setActive((i) => (i + 1) % n); setPlaying(false); }, [n]);
  const prev = useCallback(() => { setActive((i) => (i - 1 + n) % n); setPlaying(false); }, [n]);

  // ลาก/ปัด (เมาส์หรือนิ้ว): ภาพหน้าสุดเลื่อนตามระหว่างลาก ปล่อยเมื่อเลื่อนแนวนอนเกิน 40px = เปลี่ยนภาพ
  // ไม่ได้ลาก = แตะ ใช้ตำแหน่งที่แตะ (ครึ่งซ้าย = ก่อนหน้า ครึ่งขวา = ถัดไป)
  // จับ pointer ไว้ (setPointerCapture) ปล่อยนอกกรอบภาพก็ยังรับรู้ · ลากแนวตั้งบนมือถือยังเลื่อนหน้าได้ (touch-action: pan-y)
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const start = drag.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > Math.abs(e.clientY - start.y)) setOffset(dx);
  };
  const endDrag = (e, cancelled) => {
    const start = drag.current;
    drag.current = null;
    setOffset(0);
    if (!start || cancelled) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) next(); else prev(); return; }
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      const r = box.current.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) prev(); else next();
    }
  };
  // ลูกศรซ้าย/ขวาบนคีย์บอร์ดเมื่อโฟกัสอยู่ที่ปุ่มลูกศร
  const onArrowKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
  };

  function styleFor(i) {
    const gap = gapFor(width);
    const lift = gap * 0.8;
    const base = { transition: 'all .8s cubic-bezier(.4,2,.3,1)' };
    if (i === active) {
      // ระหว่างลาก: เลื่อนตามทันที (ไม่มี transition) เอียงเล็กน้อยตามทิศที่ลาก
      if (offset) return { zIndex: 3, opacity: 1, transition: 'none', transform: `translateX(${offset}px) rotateY(${Math.max(-20, Math.min(20, -offset / 12))}deg)` };
      return { ...base, zIndex: 3, opacity: 1, transform: 'translateX(0) translateY(0) scale(1) rotateY(0deg)' };
    }
    if (i === (active - 1 + n) % n) return { ...base, zIndex: 2, opacity: 1, transform: `translateX(-${gap}px) translateY(-${lift}px) scale(.85) rotateY(15deg)` };
    if (i === (active + 1) % n) return { ...base, zIndex: 2, opacity: 1, transform: `translateX(${gap}px) translateY(-${lift}px) scale(.85) rotateY(-15deg)` };
    return { ...base, zIndex: 1, opacity: 0, pointerEvents: 'none' };
  }

  const item = items[active];
  return (
    <div
      className="ct"
      role="region"
      aria-roledescription="ภาพหมุน"
      aria-label={label}
    >
      <div className={offset ? 'ct-images dragging' : 'ct-images'} ref={box} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)} onPointerCancel={(e) => endDrag(e, true)}>
        {items.map((it, i) => (
          <img key={it.src} src={it.src} alt={i === active ? it.alt : ''} aria-hidden={i === active ? undefined : 'true'}
            width="1200" height="900" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" draggable={false} className="ct-image" style={styleFor(i)} />
        ))}
      </div>
      <div className="ct-content">
        {/* key = active ทำให้ข้อความเริ่มแอนิเมชันใหม่ทุกครั้งที่เปลี่ยนภาพ */}
        <div key={active} className="ct-text" aria-live="polite">
          {item.tag && <span className="ct-tag">{item.tag}</span>}
          <h3 className="ct-title">{item.title}</h3>
          <p className="ct-quote">
            {item.text.split(' ').map((w, i) => (
              <span key={i} className="ct-word" style={{ animationDelay: `${0.025 * i}s` }}>{w}&nbsp;</span>
            ))}
          </p>
        </div>
        <div className="ct-nav">
          <button type="button" className="ct-arrow" onClick={prev} onKeyDown={onArrowKey} aria-label="ก่อนหน้า"><Icon name="arrow" className="size-5 rotate-180" /></button>
          <span className="ct-count" aria-hidden="true">{active + 1} / {n}</span>
          <button type="button" className="ct-arrow" onClick={next} onKeyDown={onArrowKey} aria-label="ถัดไป"><Icon name="arrow" className="size-5" /></button>
        </div>
      </div>
    </div>
  );
}
