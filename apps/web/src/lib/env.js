/**
 * env.js อ่านค่าตัวแปรแวดล้อมของ Vite จุดเดียว
 * ใช้ optional chaining เพราะตอนรันชุดทดสอบใน Node ตรง ๆ import.meta.env ไม่มีอยู่
 */
const E = (typeof import.meta !== 'undefined' && import.meta.env) || {};
/** ตัด / ท้าย URL ด้วยลูปแทน regex /\/+$/ ที่ backtrack ได้ช้า */
const trimSlash = (s) => {
  const v = String(s || '');
  let end = v.length;
  while (end > 0 && v[end - 1] === '/') end -= 1;
  return v.slice(0, end);
};

/** ว่าง = เรียก /api โดเมนเดียวกัน (proxy ของ Vite ตอนพัฒนา) */
export const API_URL = trimSlash(E.VITE_API_URL);
