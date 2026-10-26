/**
 * DocPreview.jsx ภาพพรีวิวหน้าแรกของเอกสาร (มุมมอง "ใหญ่" ในหน้าเอกสารทั้งหมด)
 * ดึงไฟล์ PDF จริงจาก API แล้ววาดหน้าแรกลง canvas ด้วย pdf.js (โหลดไลบรารีเฉพาะตอนใช้มุมมองนี้)
 * วาดเฉพาะการ์ดที่เลื่อนมาเห็นบนจอ (IntersectionObserver) และจำภาพไว้ เปิดมุมมองซ้ำไม่ต้องโหลดใหม่
 */
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../../lib/env.js';
import { getToken } from '../../lib/api.js';
import { Spinner, cx } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

const cache = new Map(); // key -> data URL ของภาพหน้าแรก
let pdfjsLoading = null;
let queue = Promise.resolve(); // วาดทีละฉบับ กันเซิร์ฟเวอร์สร้าง PDF พร้อมกันหลายฉบับ

/** โหลด pdf.js ครั้งเดียว (ใช้ร่วมกับตัวอ่านไฟล์ 50 ทวิ ใน features/wht) */
export function loadPdfjs() {
  if (!pdfjsLoading) {
    pdfjsLoading = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      // ?v=… บังคับให้เบราว์เซอร์โหลด worker ใหม่: ไฟล์เดิมเคยถูกส่งเป็น application/octet-stream และ cache แบบ immutable 1 ปี
      // เบราว์เซอร์ที่เก็บไว้แล้วจะใช้ของเก่าต่อ (โหลด module ไม่ได้ ตัวอย่างเอกสารไม่ขึ้น) แม้ nginx จะแก้ชนิดไฟล์แล้ว
      lib.GlobalWorkerOptions.workerSrc = `${worker.default}?v=js-mime`;
      return lib;
    }).catch((err) => { pdfjsLoading = null; throw err; });
  }
  return pdfjsLoading;
}

/** ที่อยู่ไฟล์ PDF ของเอกสาร: ของฉันเอง หรือฉบับที่คู่ค้าส่งมา (เปิดผ่านคำขอในกล่องรับเอกสาร) */
export const pdfPathOf = (doc) => (doc.received ? `/api/requests/${Number(doc.received.reqId)}/pdf` : `/api/documents/${Number(doc.id)}/pdf`);

async function renderFirstPage(path, width) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include', headers });
  if (!res.ok || !(res.headers.get('Content-Type') || '').includes('pdf')) throw new Error('load');
  return pdfFirstPage(new Uint8Array(await res.arrayBuffer()), width);
}

/** วาดหน้าแรกของ PDF (ไบต์) เป็นภาพ JPEG data URL กว้าง width px (ใช้ทั้งการ์ดเอกสารและตัวอย่างไฟล์ก่อนอัปโหลด) */
export async function pdfFirstPage(data, width) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data });
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = (width * Math.min(window.devicePixelRatio || 1, 2)) / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    task.destroy();
  }
}

/** aspect: สัดส่วนกรอบ (ค่าเริ่มต้น A4 เต็มหน้า) การ์ดใช้แบบเตี้ยลงเพื่อเห็นแค่หัวเอกสาร (ภาพชิดบน) */
export default function DocPreview({ doc, className, aspect = 'aspect-[210/297]' }) {
  // เปลี่ยนเนื้อหาเอกสาร (updatedAt) แล้วต้องวาดใหม่ ไม่ใช้ภาพเก่า
  const path = pdfPathOf(doc);
  const key = `${path}:${doc.updatedAt || doc.createdAt || ''}`;
  const [src, setSrc] = useState(() => cache.get(key) || '');
  const [state, setState] = useState(src ? 'done' : 'idle');
  const box = useRef(null);

  useEffect(() => {
    if (cache.has(key) || !box.current) return undefined;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setState('loading');
      const width = box.current ? box.current.clientWidth : 320;
      queue = queue.then(() => (cancelled ? null : renderFirstPage(path, width)
        .then((url) => { cache.set(key, url); if (!cancelled) { setSrc(url); setState('done'); } })
        .catch(() => { if (!cancelled) setState('error'); })));
    }, { rootMargin: '200px' });
    io.observe(box.current);
    return () => { cancelled = true; io.disconnect(); };
  }, [key, path]);

  return (
    <div ref={box} className={cx('relative overflow-hidden rounded-xl bg-tile ring-1 ring-line', aspect, className)}>
      {src ? (
        <img src={src} alt={`ตัวอย่างหน้าแรกของเอกสาร ${doc.docNo || 'แบบร่าง'}`} className="tf-reveal size-full object-cover object-top" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[0.84375rem] text-ink-soft">
          {state === 'error' ? (
            <><Icon name="file" className="size-8 text-[#C9C3BD]" />แสดงตัวอย่างไม่ได้</>
          ) : (
            <><Spinner />{state === 'loading' ? 'กำลังสร้างตัวอย่าง' : ''}</>
          )}
        </div>
      )}
    </div>
  );
}
