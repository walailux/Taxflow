/**
 * HomeRedirect.jsx เส้นทาง /app (อยู่ใต้ AppLayout ซึ่งตรวจการเข้าสู่ระบบแล้ว) ส่งไปหน้าแรกของบทบาท
 */
import { useEffect } from 'react';
import { Navigate, useOutletContext } from 'react-router';
import { homeUrl } from '../lib/home.js';

export default function HomeRedirect() {
  const { role } = useOutletContext();
  const target = homeUrl(role);
  const inApp = target.startsWith('/app');

  // หน้าที่ยังไม่ได้ย้ายเป็นหน้าเว็บเดิม ต้องโหลดหน้าใหม่ทั้งหน้า
  useEffect(() => { if (!inApp) window.location.replace(target); }, [inApp, target]);

  return inApp ? <Navigate to={target} replace /> : null;
}
