/**
 * ApiDownDialog.jsx หน้าต่างแจ้งเตือนเมื่อเรียก API ไม่ได้ (ยังไม่ได้เปิด API หรือเครือข่ายขัดข้อง)
 * lib/api.js ส่งเหตุการณ์ tf:api-down ทุกครั้งที่ต่อไม่ติด หน้าต่างนี้ฟังอยู่ทั้งแอป
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_DOWN_EVENT, api } from '../lib/api.js';
import { Button } from './ui.jsx';

const IS_DEV = !!import.meta.env?.DEV;
const MASCOT = '/img/mascot-offline.webp';

// โหลดรูปมาสคอตเก็บไว้ในหน่วยความจำตั้งแต่เปิดแอป เพราะตอนหน้าต่างนี้ขึ้น เซิร์ฟเวอร์อาจปิดไปแล้วทั้งคู่ (รันด้วย dev:all)
// ถ้ารอโหลดรูปตอนนั้นจะได้ไอคอนรูปเสีย
let mascotUrl = null;
if (typeof window !== 'undefined' && typeof fetch === 'function') {
  fetch(MASCOT).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) mascotUrl = URL.createObjectURL(b); }).catch(() => {});
}

export default function ApiDownDialog() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stillDown, setStillDown] = useState(false);
  const retryBtn = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const show = () => { setOpen(true); setStillDown(false); };
    window.addEventListener(API_DOWN_EVENT, show);
    return () => window.removeEventListener(API_DOWN_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    retryBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function retry() {
    setChecking(true);
    try {
      await api.get('/api/health');
      setOpen(false);
      void queryClient.invalidateQueries(); // โหลดข้อมูลที่ค้างใหม่ ฟอร์มที่กรอกไว้ไม่หาย กดส่งซ้ำได้เลย
    } catch {
      setStillDown(true);
      setOpen(true); // คำขอที่ล้มเหลวส่งเหตุการณ์ซ้ำ ให้หน้าต่างค้างไว้
    } finally {
      setChecking(false);
    }
  }

  if (!open) return null;
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="api-down-title"
        aria-describedby="api-down-desc"
        className="tf-pop max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-[var(--radius-card)] bg-white px-6 pb-6 pt-4 text-center shadow-[0_24px_60px_-20px_rgba(28,27,31,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={mascotUrl || MASCOT} alt="" width="180" height="180" className="mx-auto -mb-1 size-[min(180px,26vh)] object-contain" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        <h2 id="api-down-title" className="mb-2 text-[1.3125rem]">เชื่อมต่อระบบไม่ได้</h2>
        <p id="api-down-desc" className="text-[0.96875rem] leading-relaxed text-ink-soft">
          ตอนนี้ติดต่อเซิร์ฟเวอร์ของ TaxFlow ไม่ได้ ข้อมูลที่กรอกไว้ยังอยู่ครบ รอสักครู่แล้วกดลองอีกครั้ง
        </p>
        {IS_DEV && (
          <p className="mt-3 rounded-[10px] bg-dev-soft px-3 py-2 text-left text-[0.875rem] leading-relaxed text-dev">
            โหมดพัฒนา: API ยังไม่ได้เปิด รัน <code className="font-mono font-semibold">npm run dev:all</code> (หรือ <code className="font-mono font-semibold">npm run dev</code> อีกหน้าต่าง) ที่โฟลเดอร์บนสุด
          </p>
        )}
        {stillDown && <p role="status" className="mt-3 text-[0.90625rem] font-semibold text-danger">ยังเชื่อมต่อไม่ได้ ลองใหม่อีกครั้งในอีกสักครู่</p>}
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>ปิด</Button>
          <Button ref={retryBtn} className="flex-1" loading={checking} onClick={retry}>{checking ? 'กำลังตรวจ' : 'ลองอีกครั้ง'}</Button>
        </div>
      </div>
    </div>
  );
}
