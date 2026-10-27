/**
 * theme.js โหมดกลางวัน / กลางคืน
 * - เก็บค่าที่ผู้ใช้เลือกไว้ใน localStorage ('tf.theme' = 'light' | 'dark')
 * - ยังไม่เคยเลือก: ตามการตั้งค่าของเครื่อง (prefers-color-scheme) และเปลี่ยนตามเมื่อเครื่องเปลี่ยน
 * - index.html ตั้ง data-theme ให้ <html> ก่อนวาดหน้า (สคริปต์สั้นในหัวไฟล์) จึงไม่มีจอขาวแวบตอนเปิดเว็บ
 * สีของโหมดกลางคืนอยู่ที่ theme-dark.css
 */
import { useEffect, useState } from 'react';

const KEY = 'tf.theme';
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function stored() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
}
export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // แถบสีของเบราว์เซอร์บนมือถือให้ตรงกับพื้นหลัง
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121110' : '#FF6A00');
}

/**
 * เปลี่ยนโหมด: ทั้งหน้าค่อย ๆ จางเปลี่ยนพร้อมกันราว 0.45 วินาที (ไม่แสบตา)
 * - เบราว์เซอร์ที่รองรับ View Transitions: ถ่ายภาพหน้าเดิมแล้วจางไปหน้าใหม่ทีเดียว ตัวอักษร พื้น ไล่สี และภาพเปลี่ยนไปด้วยกัน
 * - เบราว์เซอร์อื่น: ใส่ .tf-theme-switching ให้สีพื้น/ตัวอักษร/เส้นขอบเปลี่ยนแบบ transition (theme-dark.css)
 */
function apply(theme, animate) {
  const root = document.documentElement;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduce) { setTheme(theme); return; }
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => setTheme(theme));
    return;
  }
  root.classList.add('tf-theme-switching');
  clearTimeout(apply.timer);
  apply.timer = setTimeout(() => root.classList.remove('tf-theme-switching'), 500);
  setTheme(theme);
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);

  // ยังไม่เคยเลือกเอง: เปลี่ยนตามเครื่อง
  useEffect(() => {
    const m = media();
    if (!m) return undefined;
    const onChange = () => { if (!stored()) { const t = m.matches ? 'dark' : 'light'; apply(t, true); setTheme(t); } };
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* โหมดส่วนตัว: ใช้ได้เฉพาะรอบนี้ */ }
    apply(next, true);
    setTheme(next);
  }
  return [theme, toggle];
}
