/**
 * Pager.jsx เนื้อหาแบบหน้าเลื่อนซ้าย-ขวา (swipe) เหมือนแอปบนแท็บเล็ต
 * - แถบแท็บด้านบน (เลื่อนได้เมื่อแท็บล้น) · ปัดนิ้ว/ลากเมาส์/ปุ่มลูกศร/ปุ่ม ก่อนหน้า-ถัดไป เปลี่ยนหน้าได้
 * - ใช้ CSS scroll-snap เป็นหลัก (ลื่นบนมือถือ) ความสูงปรับตามหน้าที่กำลังแสดง
 * - slides = [{ id, label, content }]
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Pager({ slides, label = 'เนื้อหาแบบเลื่อน' }) {
  const [index, setIndex] = useState(0);
  const [height, setHeight] = useState(null);
  const track = useRef(null);
  const strip = useRef(null);
  const slideEls = useRef([]);
  const raf = useRef(0);
  const drag = useRef(null);
  const justDragged = useRef(false);
  const lock = useRef(false);
  const lockTimer = useRef(0);
  const last = slides.length - 1;

  const step = useCallback(() => {
    const a = slideEls.current[0];
    const b = slideEls.current[1];
    return a && b ? b.offsetLeft - a.offsetLeft : track.current?.clientWidth || 1;
  }, []);

  const goTo = useCallback((i) => {
    const t = track.current;
    if (!t) return;
    const n = Math.max(0, Math.min(last, i));
    setIndex(n);
    // ระหว่างเลื่อนแบบนุ่มนวลไปหน้าเป้าหมาย ไม่ให้ onScroll เปลี่ยนแท็บผ่านหน้ากลางทาง
    lock.current = true;
    clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => { lock.current = false; }, 800);
    t.scrollTo({ left: n * step(), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, [last, step]);

  // ปัดนิ้ว/เลื่อนด้วยทัชแพดแล้วอัปเดตแท็บตามหน้าที่ใกล้ที่สุด
  const onScroll = () => {
    if (lock.current) {
      clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(() => { lock.current = false; }, 120);
      return;
    }
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const t = track.current;
      if (t) setIndex(Math.max(0, Math.min(last, Math.round(t.scrollLeft / step()))));
    });
  };
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(lockTimer.current); }, []);

  // ความสูงของกรอบ = ความสูงของหน้าที่แสดงอยู่ (ปรับตามเมื่อเนื้อหาในหน้านั้นเปลี่ยน เช่น เปิดแท็บย่อย/accordion)
  useEffect(() => {
    const el = slideEls.current[index];
    if (!el) return undefined;
    setHeight(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [index]);

  // เมื่อหน้าต่างเปลี่ยนขนาด คงตำแหน่งหน้าเดิมไว้
  useEffect(() => {
    const onResize = () => { const t = track.current; if (t) t.scrollTo({ left: index * step(), behavior: 'auto' }); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [index, step]);

  // แท็บที่เลือกอยู่ต้องอยู่ในมุมมองของแถบแท็บ (เลื่อนเฉพาะแถบ ไม่ดึงทั้งหน้า)
  useEffect(() => {
    const s = strip.current;
    const b = s?.querySelector('.ip-pg-tab.active');
    if (!s || !b) return;
    const left = b.offsetLeft - (s.clientWidth - b.offsetWidth) / 2;
    s.scrollTo({ left, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, [index]);

  // ลากด้วยเมาส์ (เดสก์ท็อป) · ทัช/ปากกาใช้การเลื่อนของเบราว์เซอร์อยู่แล้ว
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('button, a, summary, input, select, textarea')) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      track.current.classList.add('dragging');
      track.current.setPointerCapture?.(e.pointerId);
    }
    if (d.moved) track.current.scrollLeft = d.left - dx;
  };
  const endDrag = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    const dx = e.clientX - d.x;
    track.current.classList.remove('dragging');
    track.current.releasePointerCapture?.(e.pointerId);
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 0);
    const near = Math.round(track.current.scrollLeft / step());
    goTo(dx < -60 ? Math.max(near, index + 1) : dx > 60 ? Math.min(near, index - 1) : near);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(last); }
  };

  const prev = slides[index - 1];
  const next = slides[index + 1];

  return (
    <section className="ip-pager" aria-roledescription="carousel" aria-label={label}>
      <div className="ip-pg-head">
        <div ref={strip} className="ip-pg-tabs" role="tablist" aria-label={label} tabIndex={-1} onKeyDown={onKey}>
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`tab-${s.id}`}
              aria-selected={i === index}
              aria-controls={`slide-${s.id}`}
              tabIndex={i === index ? 0 : -1}
              className={`ip-pg-tab${i === index ? ' active' : ''}`}
              onClick={() => goTo(i)}
            >
              <span className="n">{i + 1}</span>{s.label}
            </button>
          ))}
        </div>
        <div className="ip-pg-bar" aria-hidden="true"><i style={{ width: `${((index + 1) / slides.length) * 100}%` }} /></div>
      </div>

      <div
        ref={track}
        role="presentation"
        className="ip-pg-track"
        style={height ? { height } : undefined}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => { if (justDragged.current) { e.preventDefault(); e.stopPropagation(); } }}
        onKeyDown={onKey}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            ref={(el) => { slideEls.current[i] = el; }}
            id={`slide-${s.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${s.id}`}
            aria-hidden={i !== index}
            inert={i !== index}
            className={`ip-pg-slide${i === index ? ' on' : ''}`}
          >
            {s.content}
          </div>
        ))}
      </div>

      <div className="ip-pg-foot">
        <button type="button" className="ip-pg-nav" onClick={() => goTo(index - 1)} disabled={!prev} aria-label="หน้าก่อนหน้า">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          <span><small>ก่อนหน้า</small>{prev ? prev.label : ''}</span>
        </button>
        <div className="ip-pg-dots" role="presentation">
          {slides.map((s, i) => (
            <button key={s.id} type="button" tabIndex={-1} aria-label={`ไปหน้า ${s.label}`} className={i === index ? 'active' : undefined} onClick={() => goTo(i)} />
          ))}
        </div>
        <button type="button" className="ip-pg-nav next" onClick={() => goTo(index + 1)} disabled={!next} aria-label="หน้าถัดไป">
          <span><small>ถัดไป</small>{next ? next.label : ''}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
    </section>
  );
}
