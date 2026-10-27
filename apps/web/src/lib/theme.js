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

function apply(theme, animate) {
  const root = document.documentElement;
  if (animate) {
    // สีทั้งหน้าค่อย ๆ จางเปลี่ยน 0.8 วินาที (ไม่แสบตา) ระยะเวลาตรงกับ .tf-theme-switching ใน theme-dark.css
    root.classList.add('tf-theme-switching');
    clearTimeout(apply.timer);
    apply.timer = setTimeout(() => root.classList.remove('tf-theme-switching'), 900);
  }
  root.dataset.theme = theme;
  // แถบสีของเบราว์เซอร์บนมือถือให้ตรงกับพื้นหลัง
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121110' : '#FF6A00');
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
