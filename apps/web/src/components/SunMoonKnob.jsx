/**
 * SunMoonKnob.jsx วงกลมท้องฟ้าในสวิตช์โหมดกลางวัน/กลางคืน (ดัดแปลงจาก sun-moon-theme-toggle ของ 21st.dev เป็น JSX)
 * - กลางคืน: ท้องฟ้ากรมท่ามีดาวกะพริบ + ดวงจันทร์ · กลางวัน: ท้องฟ้าสีฟ้า + ดวงอาทิตย์
 * - ตอนสลับ: ดวงหนึ่งตกลงตามแนวโค้งด้านล่าง อีกดวงขึ้นมาแทน ท้องฟ้าค่อย ๆ จางเปลี่ยนสี (Web Animations API)
 * - กดซ้ำระหว่างเล่น: เล่นย้อนกลับจากตำแหน่งปัจจุบัน · ตั้งลดการเคลื่อนไหวไว้: เปลี่ยนทันทีไม่มีแอนิเมชัน
 * วางในปุ่มที่กำหนดขนาดเอง (รับ theme จากผู้ใช้ ไม่จัดการสถานะเอง)
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

const MOON = { side: -1, spin: 25 };
const SUN = { side: 1, spin: 120 };
const ARC = 115;
const QUARTER = Math.PI / 2;
const STEPS = 30;
const NIGHT = 'linear-gradient(180deg,#090f2a 0%,#16204b 60%,#2a2f66 100%)';
const DAY = 'linear-gradient(180deg,#4ea8ff 0%,#9fd3ff 60%,#e3f3ff 100%)';
const STARS = [
  { x: 24, y: 22, r: 1.2, t: 2100 }, { x: 66, y: 16, r: 1, t: 2600 }, { x: 78, y: 42, r: 1.3, t: 1900 },
  { x: 36, y: 60, r: 0.9, t: 2900 }, { x: 58, y: 76, r: 1.1, t: 2300 }, { x: 14, y: 72, r: 1, t: 2500 },
];
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';

const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const arc = (side, a) => ({ x: side * ARC * Math.sin(a), y: ARC * (1 - Math.cos(a)) });
const easeIn = (t) => t * t * t;
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

function setting({ side, spin }) {
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    const k = easeIn(t);
    const { x, y } = arc(side, k * QUARTER);
    return { offset: t, transform: `translate(${x}%, ${y}%) rotate(${side * spin * k}deg)`, opacity: t < 0.55 ? 1 : (1 - t) / 0.45 };
  });
}
function rising({ side, spin }) {
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = i / STEPS;
    const k = 1 - easeOutBack(t);
    const { x, y } = arc(side, k * QUARTER);
    return { offset: t, transform: `translate(${x}%, ${y}%) rotate(${side * spin * k}deg) scale(${1 - 0.28 * k})`, opacity: Math.min(1, t / 0.3) };
  });
}
const KF = { moonSets: setting(MOON), moonRises: rising(MOON), sunSets: setting(SUN), sunRises: rising(SUN) };

const rest = (body, visible) => ({ transform: visible ? 'none' : `translate(${body.side * ARC}%, ${ARC}%)`, opacity: visible ? 1 : 0 });
const BODY = 'pointer-events-none absolute inset-0 flex items-center justify-center';

export default function SunMoonKnob({ theme, duration = 1200 }) {
  const moon = useRef(null);
  const sun = useRef(null);
  const night = useRef(null);
  const day = useRef(null);
  const flight = useRef([]);
  const prev = useRef(theme);

  // เปลี่ยนโหมด: เล่นดวงตก/ดวงขึ้น + ท้องฟ้าจางเปลี่ยนสี
  useLayoutEffect(() => {
    if (prev.current === theme) return;
    prev.current = theme;
    if (flight.current.length) { flight.current.forEach((a) => a.reverse()); return; }
    if (!moon.current || typeof moon.current.animate !== 'function' || reduce()) return;
    const toLight = theme === 'light';
    const pair = [
      (toLight ? moon : sun).current.animate(toLight ? KF.moonSets : KF.sunSets, { duration: duration * 0.65, fill: 'both' }),
      (toLight ? sun : moon).current.animate(toLight ? KF.sunRises : KF.moonRises, { duration: duration * 0.64, delay: duration * 0.36, fill: 'both' }),
      night.current.animate([{ opacity: toLight ? 1 : 0 }, { opacity: toLight ? 0 : 1 }], { duration, easing: EASE, fill: 'both' }),
      day.current.animate([{ opacity: toLight ? 0 : 1 }, { opacity: toLight ? 1 : 0 }], { duration, easing: EASE, fill: 'both' }),
    ];
    flight.current = pair;
    Promise.all(pair.map((a) => a.finished)).then(() => {
      if (flight.current !== pair) return;
      flight.current = [];
      pair.forEach((a) => a.cancel());
    }, () => { /* ยกเลิกระหว่างเล่น */ });
  }, [theme, duration]);

  // ดาวกะพริบ
  useEffect(() => {
    const el = night.current;
    if (!el || typeof el.animate !== 'function' || reduce()) return undefined;
    const tw = [...el.querySelectorAll('[data-star]')].map((s, i) => s.animate([{ opacity: 0.35 }, { opacity: 1 }, { opacity: 0.35 }], {
      duration: STARS[i].t, delay: -i * 530, iterations: Infinity, easing: 'ease-in-out',
    }));
    return () => tw.forEach((a) => a.cancel());
  }, []);
  useEffect(() => () => flight.current.forEach((a) => a.cancel()), []);

  const dark = theme === 'dark';
  return (
    <>
      <span ref={night} aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: NIGHT, opacity: dark ? 1 : 0 }}>
        {STARS.map((s, i) => (
          <span key={i} data-star className="absolute rounded-full bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r * 2, height: s.r * 2, opacity: 0.6 }} />
        ))}
      </span>
      <span ref={day} aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: DAY, opacity: dark ? 0 : 1 }} />
      <span ref={moon} aria-hidden="true" className={`${BODY} text-amber-200 drop-shadow-[0_0_6px_rgba(252,211,77,0.6)]`} style={rest(MOON, dark)}>
        <svg viewBox="0 0 24 24" className="size-1/2" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
      </span>
      <span ref={sun} aria-hidden="true" className={`${BODY} text-orange-500 drop-shadow-[0_0_8px_rgba(251,146,60,0.7)]`} style={rest(SUN, !dark)}>
        <svg viewBox="0 0 24 24" className="size-1/2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </span>
    </>
  );
}
