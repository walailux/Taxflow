/**
 * CountUp.jsx ตัวเลขนับขึ้นแบบนุ่มนวล 0.7 วินาที (ย้ายจาก countUp ใน ux.js) ผู้ใช้ที่ปิดการเคลื่อนไหวเห็นค่าทันที
 */
import { useEffect, useRef, useState } from 'react';

const reduce = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function CountUp({ value, format = (n) => String(Math.round(n)), duration = 700 }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(reduce() ? target : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce() || !target) { setShown(target); from.current = target; return undefined; }
    const start = from.current;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.max(0, Math.min((t - t0) / duration, 1));
      setShown(start + (target - start) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return <span className="tabular-nums">{format(shown)}</span>;
}
