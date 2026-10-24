/**
 * status-main.jsx จุดเริ่มของหน้าสถานะที่ API (พอร์ต 4000) แสดงเมื่อเปิดพอร์ตนี้ตรง ๆ
 * build แยกด้วย `vite build --mode status` ได้ไฟล์ที่ apps/web/dist-status ซึ่ง API ส่งให้เบราว์เซอร์
 * มีเฉพาะหน้าสถานะหน้าเดียว (ไม่มีหน้าเข้าสู่ระบบหรือหน้าอื่นของแอป) ปุ่ม "เข้าสู่หน้าเว็บ" พาไปพอร์ตหน้าเว็บ
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StatusPage from './pages/StatusPage.jsx';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StatusPage standalone />
    </QueryClientProvider>
  </StrictMode>,
);
