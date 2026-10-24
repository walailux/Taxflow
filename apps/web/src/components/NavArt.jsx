/**
 * NavArt.jsx ไอคอนภาพประกอบของเมนูหลัก (แดชบอร์ด · ปฏิทินงาน · วิเคราะห์ข้อมูล · กล่องรับเอกสาร)
 * แบบสองโทนสีเรียบ: เส้นสีเข้ม + พื้นกระดาษ + ส้ม/ส้มอ่อน + เทาอ่อน (ไม่หลายสีเกินไป)
 * สีมาจากตัวแปร --na-* ใน index.css จึงเปลี่ยนตามโหมดกลางคืนเอง
 * เคลื่อนไหวเมื่อแม่ที่มี tf-anim-host ถูกชี้ / โฟกัส / เป็นหน้าปัจจุบัน (คีย์เฟรม tf-na-* ใน index.css)
 */
import { useId } from 'react';

export const NAV_ART = new Set(['grid', 'calendar', 'trend', 'inbox']);

const S = { stroke: 'var(--na-line)', strokeWidth: 1.05, strokeLinecap: 'round', strokeLinejoin: 'round' }; // เส้นบาง ดูเป็นทางการ (เดิม 1.5)

function Dashboard() {
  return (
    <>
      <rect x="2.75" y="3.75" width="18.5" height="16.5" rx="2.6" fill="var(--na-paper)" {...S} />
      <path d="M2.75 6.35a2.6 2.6 0 0 1 2.6 -2.6h13.3a2.6 2.6 0 0 1 2.6 2.6v1.65h-18.5z" fill="var(--na-soft)" />
      <path d="M2.75 8h18.5" {...S} />
      <circle cx="5.4" cy="5.9" r=".6" fill="var(--na-line)" />
      <circle cx="7.3" cy="5.9" r=".6" fill="var(--na-line)" />
      {/* โดนัท: วงเทา + ส่วนส้มที่ลากเติมตอนเคลื่อนไหว */}
      <circle cx="8.2" cy="12.6" r="2.4" fill="none" stroke="var(--na-mute)" strokeWidth="1.5" />
      <circle className="na-donut" cx="8.2" cy="12.6" r="2.4" fill="none" stroke="var(--na-accent)" strokeWidth="1.5" pathLength="10" strokeDasharray="6.5 10" strokeDashoffset="2.5" />
      {/* แท่ง: โตจากฐาน */}
      <rect className="na-bar" style={{ '--i': 0 }} x="13.4" y="13.2" width="1.7" height="3.3" rx=".5" fill="var(--na-soft)" stroke="var(--na-line)" strokeWidth="0.8" />
      <rect className="na-bar" style={{ '--i': 1 }} x="15.9" y="11.4" width="1.7" height="5.1" rx=".5" fill="var(--na-accent)" stroke="var(--na-line)" strokeWidth="0.8" />
      <rect className="na-bar" style={{ '--i': 2 }} x="18.2" y="12.3" width="1.4" height="4.2" rx=".5" fill="var(--na-soft)" stroke="var(--na-line)" strokeWidth="0.8" />
      <path className="na-lines" d="M5.6 17.6h3.6M13 17.6h6.8" {...S} strokeWidth="0.9" />
    </>
  );
}

function Calendar() {
  return (
    <>
      <rect x="3.75" y="5.25" width="16.5" height="15.5" rx="2.6" fill="var(--na-paper)" {...S} />
      {/* แผ่นบน (หัวสีส้ม) พลิกขึ้นตอนเคลื่อนไหว */}
      <g className="na-flip">
        <path d="M3.75 7.85a2.6 2.6 0 0 1 2.6 -2.6h11.3a2.6 2.6 0 0 1 2.6 2.6v2.15h-16.5z" fill="var(--na-accent)" {...S} />
      </g>
      {/* ห่วง */}
      <rect x="7.4" y="2.75" width="1.7" height="4.4" rx=".85" fill="var(--na-mute)" {...S} strokeWidth="0.85" />
      <rect x="14.9" y="2.75" width="1.7" height="4.4" rx=".85" fill="var(--na-mute)" {...S} strokeWidth="0.85" />
      {/* วันที่ + วันที่ไฮไลต์ */}
      <path d="M7.2 13.3h1.6M11.2 13.3h1.6M7.2 16.6h1.6" {...S} strokeWidth="1" />
      <rect className="na-day" x="14.4" y="15.1" width="3" height="3" rx=".9" fill="var(--na-soft)" stroke="var(--na-accent)" strokeWidth="0.85" />
      {/* มุมกระดาษม้วน */}
      <path d="M3.75 17.4l3.6 3.35h-1a2.6 2.6 0 0 1 -2.6 -2.6z" fill="var(--na-mute)" {...S} strokeWidth="0.85" />
    </>
  );
}

function Analytics() {
  return (
    <>
      <path d="M3 20.25h18" {...S} />
      <rect className="na-bar" style={{ '--i': 0 }} x="4.6" y="14.2" width="2.7" height="6" rx=".7" fill="var(--na-soft)" {...S} strokeWidth="0.9" />
      <rect className="na-bar" style={{ '--i': 1 }} x="9" y="11.4" width="2.7" height="8.8" rx=".7" fill="var(--na-soft)" {...S} strokeWidth="0.9" />
      <rect className="na-bar" style={{ '--i': 2 }} x="13.4" y="13.2" width="2.7" height="7" rx=".7" fill="var(--na-soft)" {...S} strokeWidth="0.9" />
      <rect className="na-bar" style={{ '--i': 3 }} x="17.8" y="9.6" width="2.7" height="10.6" rx=".7" fill="var(--na-accent)" {...S} strokeWidth="0.9" />
      <path className="na-line" d="M6 9.4l4.4 -3l4.4 2l4.4 -4.2" fill="none" {...S} pathLength="10" />
      {[[6, 9.4], [10.4, 6.4], [14.8, 8.4], [19.2, 4.2]].map(([x, y], i) => (
        <circle key={i} className="na-dot" style={{ '--i': i }} cx={x} cy={y} r="1.25" fill="var(--na-paper)" stroke="var(--na-accent)" strokeWidth="0.9" />
      ))}
    </>
  );
}

/**
 * กล่องรับเอกสาร: แฟ้มทรง FolderCard ย่อส่วน · ปกสีส้มไล่เฉดอยู่ด้านหลัง มีเอกสารโผล่ออกมา
 * แผ่นหน้าแฟ้ม (มีแถบแท็บโค้งรับกับตัวแฟ้ม) ทับอยู่ด้านหน้า พร้อมแถบสถิติด้านล่าง
 * ตอนชี้: แผ่นหน้าเลื่อนลง ปกขยายขึ้นเล็กน้อย เอกสารยกตัว (แบบเดียวกับ FolderCard แต่ทำด้วย CSS)
 */
function Inbox() {
  const id = `na-inbox-${useId().replace(/:/g, '')}`; // ไม่ซ้ำกันเมื่อมีหลายไอคอนในหน้า (เช่น เมนูข้าง + แถบล่างมือถือ)
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--na-accent)" />
          <stop offset="1" stopColor="var(--na-soft)" />
        </linearGradient>
      </defs>
      {/* ปกด้านหลัง */}
      <rect className="na-cover" x="2.75" y="4.25" width="18.5" height="11" rx="2.4" fill={`url(#${id})`} {...S} />
      {/* เอกสารที่อยู่ในแฟ้ม */}
      <g className="na-doc">
        <rect x="7.25" y="2.75" width="9.5" height="9" rx="1.2" fill="var(--na-paper)" {...S} strokeWidth="0.9" />
        <path d="M9.2 5.6h5.6M9.2 7.7h3.8" {...S} strokeWidth="0.85" />
      </g>
      {/* แผ่นหน้าแฟ้ม: แท็บซ้ายบน โค้งลงรับตัวแฟ้มแบบ FolderCard */}
      <g className="na-panel">
        <path d="M2.75 12.4a1.6 1.6 0 0 1 1.6 -1.6h5.1c1.35 0 2.05 2.2 3.3 2.2h6.9a1.6 1.6 0 0 1 1.6 1.6v4.85a1.8 1.8 0 0 1 -1.8 1.8h-14.9a1.8 1.8 0 0 1 -1.8 -1.8z" fill="var(--na-paper)" {...S} />
        <path d="M5.6 17.9h2.6" stroke="var(--na-accent)" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M14.4 17.9h3.6" {...S} strokeWidth="0.85" stroke="var(--na-mute)" />
      </g>
    </>
  );
}

const ART = { grid: Dashboard, calendar: Calendar, trend: Analytics, inbox: Inbox };

export default function NavArt({ name, className = 'size-[1.375rem]', alert = false }) {
  const Art = ART[name];
  if (!Art) return null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-art={name} className={`tf-na${alert ? ' na-alert' : ''} ${className}`} fill="none">
      <Art />
    </svg>
  );
}
