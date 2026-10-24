/**
 * DocArt.jsx ไอคอนภาพประกอบ "ปึกเอกสาร" (แผ่นหลัง + แผ่นหน้าพับมุม + ป้ายสี่เหลี่ยม + บรรทัดข้อความ)
 * ใช้ในหน้าเลือกประเภทเอกสาร โทนส้ม-ขาวตามธีมเว็บทุกกลุ่ม (แผ่นหน้าขาว เส้นส้ม) ต่างกันเล็กน้อยที่ป้ายมุมซ้ายบน
 * เคลื่อนไหวเมื่อแม่ที่มี tf-anim-host ถูกชี้/โฟกัส: แผ่นหน้ายกขึ้นเอียง แผ่นหลังเลื่อนออก บรรทัดเขียนใหม่ทีละเส้น ป้ายเด้ง
 * (คีย์เฟรม tf-da-* ใน index.css) · เส้นขอบใช้ --da-line จึงสลับสีตามโหมดกลางคืนเอง
 */
const TONES = {
  biz: { front: '#FFFFFF', back: '#FFD9BF', fold: '#FFB27A', badge: '#FF6A00' },
  contract: { front: '#FFFFFF', back: '#FFD9BF', fold: '#FFB27A', badge: '#FF8A3D' },
  tax: { front: '#FFFFFF', back: '#FFD9BF', fold: '#FFB27A', badge: '#E85A00' },
};

export default function DocArt({ group = 'biz', className = 'size-11' }) {
  const t = TONES[group] || TONES.biz;
  const line = { stroke: 'var(--da-line)', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={`tf-da ${className}`} fill="none">
      {/* แผ่นหลัง */}
      <rect className="da-back" x="5.5" y="9.5" width="27" height="34" rx="2.5" fill={t.back} {...line} />
      {/* แผ่นหน้า + มุมพับ */}
      <g className="da-front">
        <path d="M12.5 4.5h17.5l8 8v28a2.5 2.5 0 0 1 -2.5 2.5h-23a2.5 2.5 0 0 1 -2.5 -2.5v-33.5a2.5 2.5 0 0 1 2.5 -2.5z" fill={t.front} {...line} />
        <path d="M30 4.5v6a2 2 0 0 0 2 2h6z" fill={t.fold} {...line} />
        <rect className="da-badge" x="15" y="9.5" width="5.5" height="5.5" rx="1" fill={t.badge} {...line} strokeWidth="2" />
        {[20.5, 25.5, 30.5, 35.5].map((y, i) => (
          <g key={y} className="da-line" style={{ '--i': i }}>
            <path d={`M15 ${y}h1`} {...line} />
            <path d={`M20 ${y}h${i === 3 ? 8.5 : 13}`} {...line} pathLength="10" />
          </g>
        ))}
      </g>
    </svg>
  );
}
