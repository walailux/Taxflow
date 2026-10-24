/**
 * GoogleCallbackPage.jsx หน้าที่ Google ส่งกลับมาใน popup หลังเลือกบัญชี (/auth/google/callback)
 * ส่ง ID token กลับให้หน้าเข้าสู่ระบบ ลบ token ออกจากแถบที่อยู่ แล้วปิดหน้าต่างเอง
 */
import { useEffect, useState } from 'react';
import { relayGoogleResult } from '../features/auth/googlePopup.js';
import { Spinner } from '../components/ui.jsx';

export default function GoogleCallbackPage() {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    relayGoogleResult(window.location.hash);
    window.history.replaceState(null, '', window.location.pathname);
    window.close();
    // บางเบราว์เซอร์ไม่ยอมให้ปิดหน้าต่าง (เช่น เปิดลิงก์นี้ตรง ๆ) แสดงข้อความให้ปิดเอง
    const t = setTimeout(() => setClosed(true), 800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 p-6 text-center text-[0.96875rem] text-ink-soft">
      {closed ? 'ส่งข้อมูลกลับไปหน้าเข้าสู่ระบบแล้ว ปิดหน้าต่างนี้ได้เลย' : <><Spinner /> กำลังกลับไปหน้าเข้าสู่ระบบ</>}
    </div>
  );
}
