/**
 * appearance.js ฟอนต์และขนาดตัวอักษรของหน้าเว็บ + ฟอนต์เริ่มต้นของเอกสาร PDF
 * - เก็บใน localStorage ('tf.appearance') เป็นค่าของเครื่องนี้
 * - หน้าเว็บ: ตั้ง --app-font / --app-scale ที่ <html> (index.css ใช้ตัวแปรนี้กับฟอนต์ทั้งเว็บและขนาด rem)
 *   index.html ตั้งค่าเดียวกันก่อนวาดหน้า จึงไม่กระพริบตอนเปิดเว็บ (ชุดฟอนต์ต้องตรงกับในนั้น)
 * - เอกสาร: เลือกได้แค่ Google Sans หรือ Sarabun ส่งไปกับเอกสารตอนสร้าง (docFont) แล้วเก็บไว้กับเอกสารนั้น
 */
import { useEffect, useState } from 'react';

const KEY = 'tf.appearance';

export const WEB_FONTS = [
  { value: 'googlesans', label: 'Google Sans', stack: '"Google Sans", "IBM Plex Sans Thai", sans-serif' },
  { value: 'ibm', label: 'IBM Plex Sans Thai', stack: '"IBM Plex Sans Thai", "Noto Sans Thai", sans-serif' },
  { value: 'sarabun', label: 'Sarabun', stack: '"Sarabun", "IBM Plex Sans Thai", sans-serif' },
  { value: 'itim', label: 'Itim', stack: '"Itim", "IBM Plex Sans Thai", sans-serif' },
];
export const TEXT_SIZES = [
  { value: 0.9, label: 'เล็ก' },
  { value: 1, label: 'ปกติ' },
  { value: 1.1, label: 'ใหญ่' },
  { value: 1.2, label: 'ใหญ่มาก' },
];
// ความหนาตัวอักษร (ตัวเลขน้ำหนักของเนื้อหา 300–600) · ระดับอื่นเลื่อนตาม: กลาง +100 · กึ่งหนา +200 · หนา +300
export const WEIGHT_RANGE = { min: 300, max: 600, step: 100 };
const LEGACY_WEIGHT = { light: 300, normal: 400, bold: 500 }; // ค่าแบบเดิม (บาง/ปกติ/หนา) ที่อาจเก็บไว้แล้ว
export const DOC_FONTS = [
  { value: 'googlesans', label: 'Google Sans', stack: '"Google Sans", sans-serif' },
  { value: 'sarabun', label: 'Sarabun', stack: '"Sarabun", sans-serif' },
];
export const DEFAULTS = { font: 'googlesans', scale: 1, weight: 400, docFont: 'sarabun' };

function normWeight(w) {
  const n = typeof w === 'string' && LEGACY_WEIGHT[w] ? LEGACY_WEIGHT[w] : Number(w);
  if (!Number.isFinite(n)) return DEFAULTS.weight;
  const { min, max, step } = WEIGHT_RANGE;
  return Math.min(max, Math.max(min, Math.round(n / step) * step));
}

export function readAppearance() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* ใช้ค่าเริ่มต้น */ }
  return {
    font: WEB_FONTS.some((f) => f.value === v.font) ? v.font : DEFAULTS.font,
    scale: TEXT_SIZES.some((s) => s.value === v.scale) ? v.scale : DEFAULTS.scale,
    weight: normWeight(v.weight),
    docFont: DOC_FONTS.some((f) => f.value === v.docFont) ? v.docFont : DEFAULTS.docFont,
  };
}

function apply(a) {
  const root = document.documentElement.style;
  root.setProperty('--app-font', (WEB_FONTS.find((f) => f.value === a.font) || WEB_FONTS[0]).stack);
  root.setProperty('--app-scale', String(a.scale));
  root.setProperty('--font-weight-normal', String(a.weight));
  root.setProperty('--font-weight-medium', String(a.weight + 100));
  root.setProperty('--font-weight-semibold', String(a.weight + 200));
  root.setProperty('--font-weight-bold', String(a.weight + 300));
}

export function useAppearance() {
  const [a, setA] = useState(readAppearance);
  useEffect(() => { apply(a); }, [a]);
  // แท็บอื่นเปลี่ยนค่า → ตามกัน
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setA(readAppearance()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const update = (patch) => setA((prev) => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* จำไม่ได้ก็ใช้ในหน้านี้ไป */ }
    return next;
  });
  return [a, update];
}
