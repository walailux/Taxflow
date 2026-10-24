/**
 * CalcAppIcon.jsx ไอคอนเครื่องคิดเลขแบบแอป (กรอบมุมมนสีเข้ม + ปุ่มกลม 4 ปุ่ม: + − × สีเทา และ = สีส้ม)
 * เคลื่อนไหวเมื่อแม่ที่มีคลาส tf-anim-host ถูกชี้/โฟกัส: ปุ่มถูกกดทีละปุ่มจาก + ไป = แล้ว = เรืองแสงสั้น ๆ
 * (คีย์เฟรมอยู่ที่ index.css ส่วน tf-calc) · ใช้ id ไม่ซ้ำต่ออินสแตนซ์ เพราะไล่สีใน <defs> ต้องอ้างด้วย id
 */
import { useId } from 'react';

export default function CalcAppIcon({ className = 'size-8' }) {
  const uid = useId().replace(/:/g, '');
  const tile = `calc-tile-${uid}`;
  const key = `calc-key-${uid}`;
  const eq = `calc-eq-${uid}`;
  const keys = [
    { x: 15.5, y: 15.5, sym: 'M12.3 15.5h6.4M15.5 12.3v6.4', fill: key },
    { x: 32.5, y: 15.5, sym: 'M29.3 15.5h6.4', fill: key },
    { x: 15.5, y: 32.5, sym: 'M13.2 30.2l4.6 4.6M17.8 30.2l-4.6 4.6', fill: key },
    { x: 32.5, y: 32.5, sym: 'M29.3 30.9h6.4M29.3 34.1h6.4', fill: eq, eq: true },
  ];
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={`tf-calc ${className}`}>
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4A4A4D" />
          <stop offset="1" stopColor="#1C1C1E" />
        </linearGradient>
        <linearGradient id={key} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E4E4E7" />
          <stop offset="1" stopColor="#A9A9AE" />
        </linearGradient>
        <linearGradient id={eq} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB547" />
          <stop offset="1" stopColor="#FF8A00" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill={`url(#${tile})`} />
      <rect x="2.5" y="2.5" width="43" height="43" rx="11.5" fill="none" stroke="rgba(255,255,255,.12)" />
      {keys.map((k, i) => (
        <g key={i} className={`tf-calc-key${k.eq ? ' tf-calc-eq' : ''}`} style={{ '--i': i }}>
          <circle cx={k.x} cy={k.y} r="6.9" fill={`url(#${k.fill})`} />
          <path d={k.sym} fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
