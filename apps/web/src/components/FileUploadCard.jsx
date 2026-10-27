/**
 * FileUploadCard.jsx การ์ดอัปโหลดไฟล์ (ดีไซน์ File Upload Card: หัวการ์ดมีไอคอนเมฆ · กล่องลากวาง · รายการไฟล์พร้อมสถานะ)
 * แปลงเป็น JSX + สีของระบบ (bg-white/bg-tile/text-ink-soft/orange) จึงเปลี่ยนตามโหมดกลางคืนผ่าน theme-dark.css
 * ไม่อัปโหลดเอง: หน้าที่ใช้ส่ง files เข้ามา (สถานะ ready | uploading | completed | error) และรับ onFilesChange/onFileRemove
 * children = ส่วนท้ายการ์ด (เช่น ช่องกรอกชื่อ/หมวด และปุ่มบันทึก)
 */
import { useEffect, useRef, useState } from 'react';
import { cx } from './ui.jsx';
import Lucide from './lucide.jsx';

export function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  const k = 1024;
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / k ** i).toFixed(i ? 2 : 0))} ${units[i]}`;
}

/** ป้ายชนิดไฟล์ 3 ตัวอักษรในกล่องสี่เหลี่ยม (PDF / PNG / JPE ...) */
const typeBadge = (file) => (file.type.split('/')[1] || file.name.split('.').pop() || 'file').toUpperCase().replace('JPEG', 'JPG').slice(0, 3);

/**
 * ความคืบหน้าระหว่างอัปโหลด: API ส่งไฟล์ทีเดียว (ไม่มีตัวเลขความคืบหน้าจริง)
 * จึงค่อยๆ เดินไปถึง 90% ระหว่างรอ แล้วเต็มเมื่อเสร็จ ผู้ใช้เห็นว่ายังทำงานอยู่
 */
export function useUploadProgress(uploading) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!uploading) { setP(0); return undefined; }
    setP(8);
    const t = setInterval(() => setP((v) => Math.min(90, v + Math.max(1, (90 - v) * 0.12))), 250);
    return () => clearInterval(t);
  }, [uploading]);
  return p;
}

export default function FileUploadCard({
  title = 'อัปโหลดไฟล์',
  subtitle = 'เลือกไฟล์ที่ต้องการแล้วอัปโหลด',
  hint = 'PDF, PNG, JPG, WEBP · ไม่เกิน 10 MB',
  accept,
  multiple = false,
  files = [],
  onFilesChange,
  onFileRemove,
  onClose,
  inputLabel = 'เลือกไฟล์',
  className,
  children,
}) {
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const take = (list) => {
    const arr = Array.from(list || []);
    if (arr.length) onFilesChange(multiple ? arr : arr.slice(0, 1));
  };

  return (
    <div className={cx('tf-fade-up w-full rounded-[22px] border border-line bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04)]', className)}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-tile text-ink-soft"><Lucide name="upload-cloud" className="size-6" /></span>
            <div className="min-w-0">
              <h3 className="text-[1.125rem] font-semibold leading-snug text-ink">{title}</h3>
              <p className="mt-0.5 text-[0.90625rem] text-ink-soft">{subtitle}</p>
            </div>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="ปิด" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-tile hover:text-ink">
              <Lucide name="x" className="size-4" />
            </button>
          )}
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label={inputLabel}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files); }}
          className={cx('mt-5 flex cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed px-6 py-8 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
            dragging ? 'border-orange bg-orange-pale' : 'border-line hover:border-orange-soft')}
        >
          <input ref={input} type="file" multiple={multiple} accept={accept} aria-label={inputLabel} className="hidden"
            onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
          <Lucide name="upload-cloud" className={cx('mb-3 size-10 transition-transform duration-200', dragging ? '-translate-y-1 text-orange' : 'text-ink-soft')} />
          <p className="text-[1rem] font-semibold text-ink">เลือกไฟล์ หรือลากมาวางที่นี่</p>
          <p className="mt-1 text-[0.8125rem] text-ink-soft">{hint}</p>
          <span className="pointer-events-none mt-4 inline-flex h-9 items-center rounded-[10px] border border-line bg-white px-3.5 text-[0.875rem] font-medium text-ink">เลือกไฟล์</span>
        </div>
      </div>

      {files.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-4 border-t border-line p-5 sm:p-6">
          {files.map((f) => (
            <li key={f.id} className="tf-reveal flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {f.previewUrl
                  ? <img src={f.previewUrl} alt="" className="size-10 shrink-0 rounded-[10px] bg-tile object-cover" />
                  : <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-tile text-[0.8125rem] font-bold text-ink-soft">{typeBadge(f.file)}</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium text-ink" title={f.file.name}>{f.file.name}</p>
                  <div className="text-[0.8125rem] text-ink-soft">
                    {f.status === 'uploading'
                      ? <span>{formatFileSize((f.file.size * (f.progress || 0)) / 100)} จาก {formatFileSize(f.file.size)}</span>
                      : <span>{formatFileSize(f.file.size)}</span>}
                    <span className="mx-1">•</span>
                    <span className={cx(f.status === 'uploading' && 'text-orange-deep', f.status === 'completed' && 'text-ok', f.status === 'error' && 'text-danger')}>
                      {f.status === 'uploading' ? 'กำลังอัปโหลด…' : f.status === 'completed' ? 'อัปโหลดแล้ว' : f.status === 'error' ? (f.error || 'อัปโหลดไม่สำเร็จ') : 'พร้อมบันทึก'}
                    </span>
                  </div>
                  {f.status === 'uploading' && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-tile" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f.progress || 0)}>
                      <div className="h-full rounded-full bg-orange transition-[width] duration-300" style={{ width: `${f.progress || 0}%` }} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {f.status === 'completed' && <Lucide name="check-circle" className="size-5 text-ok" />}
                {f.href && <a href={f.href} target="_blank" rel="noreferrer" className="rounded-full px-2.5 py-1 text-[0.8125rem] font-medium text-ink-soft transition-colors hover:bg-tile hover:text-ink">เปิดดู</a>}
                {onFileRemove && f.status !== 'uploading' && (
                  <button type="button" onClick={() => onFileRemove(f.id)} aria-label={`เอา ${f.file.name} ออก`}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-tile hover:text-ink">
                    <Lucide name={f.status === 'completed' ? 'trash' : 'x'} className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {children && <div className="border-t border-line p-5 sm:p-6">{children}</div>}
    </div>
  );
}
