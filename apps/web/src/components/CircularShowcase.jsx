/**
 * CircularShowcase.jsx ภาพหมุนแบบวงกลม 3 ใบ (ใบกลางอยู่หน้า ใบซ้าย/ขวาเอียงอยู่ด้านหลัง) + ข้อความด้านข้าง
 * ดัดแปลงจาก CircularTestimonials (21st.dev) ให้เข้ากับโปรเจกต์นี้: JSX + CSS ธรรมดา (ไม่ใช้ framer-motion / react-icons / styled-jsx)
 * - items: [{ src, alt, title, tag, text }] · autoplay เปลี่ยนเองทุก interval ms (หยุดเมื่อผู้ใช้กดลูกศร หรือตั้งลดการเคลื่อนไหว)
 * - ข้อความค่อย ๆ ชัดทีละคำแบบเบลอ→ชัด (CSS keyframes ct-word ใน landing.css) · ลูกศรซ้าย/ขวาบนคีย์บอร์ดใช้ได้เมื่อโฟกัสอยู่ในส่วนนี้
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

  function styleFor(i) {
    const gap = gapFor(width);
    const lift = gap * 0.8;
    const base = { transition: 'all .8s cubic-bezier(.4,2,.3,1)' };
    if (i === active) return { ...base, zIndex: 3, opacity: 1, transform: 'translateX(0) translateY(0) scale(1) rotateY(0deg)' };
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
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); }}
    >
      <div className="ct-images" ref={box}>
        {items.map((it, i) => (
          <img key={it.src} src={it.src} alt={i === active ? it.alt : ''} aria-hidden={i === active ? undefined : 'true'}
            width="1200" height="900" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" className="ct-image" style={styleFor(i)}
            onClick={() => { if (i !== active) { setActive(i); setPlaying(false); } }} />
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
          <button type="button" className="ct-arrow" onClick={prev} aria-label="ก่อนหน้า"><Icon name="arrow" className="size-5 rotate-180" /></button>
          <button type="button" className="ct-arrow" onClick={next} aria-label="ถัดไป"><Icon name="arrow" className="size-5" /></button>
          <span className="ct-count" aria-hidden="true">{active + 1} / {n}</span>
        </div>
      </div>
    </div>
  );
}
