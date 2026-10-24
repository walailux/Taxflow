/**
 * Avatar.jsx รูปโปรไฟล์ของผู้ใช้: รูปที่อัปโหลด > โลโก้บริษัท > อักษรแรกของชื่อ
 * ถ้าโหลดรูปไม่ได้จะถอยไปแบบถัดไปเอง · ใช้ในเมนูด้านข้าง แถบบน และหน้าโปรไฟล์
 */
import { useState } from 'react';
import { API_URL } from '../lib/env.js';
import { cx } from './ui.jsx';

export const brandImageUrl = (kind, file) => `${API_URL}/api/auth/brand-image/${kind}?t=${encodeURIComponent((file && file.at) || '')}`;

function AvatarInner({ user, className, textClass }) {
  const sources = [
    user.avatarFile && { src: brandImageUrl('avatar', user.avatarFile), cover: true },
    user.logoFile && { src: brandImageUrl('logo', user.logoFile), cover: false },
  ].filter(Boolean);
  const [idx, setIdx] = useState(0);
  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
  const cur = sources[idx];
  if (cur) {
    return (
      <img
        src={cur.src}
        alt=""
        onError={() => setIdx((i) => i + 1)}
        className={cx('shrink-0', cur.cover ? 'object-cover' : 'bg-white object-contain p-1', className)}
      />
    );
  }
  return (
    <span className={cx('flex shrink-0 items-center justify-center bg-gradient-to-br from-[#FF9A4D] to-orange-deep font-display font-semibold text-white', textClass, className)}>
      {initial}
    </span>
  );
}

/** key ผูกกับเวลาอัปโหลดล่าสุด เปลี่ยนรูปแล้วเริ่มลองแหล่งรูปใหม่ตั้งแต่ต้น */
export default function Avatar({ user, className, textClass }) {
  if (!user) return null;
  return <AvatarInner key={`${user.avatarFile?.at || ''}|${user.logoFile?.at || ''}`} user={user} className={className} textClass={textClass} />;
}
