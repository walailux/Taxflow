/**
 * ConfirmDialog.jsx กล่องยืนยันของระบบ (แทน confirm()/prompt() ของเบราว์เซอร์)
 * props: title, message, confirmText, cancelText, danger, onConfirm, onCancel
 *        altText + onAlt = ปุ่มทางเลือกที่สาม (เช่น "ข้ามการลงนาม")
 *        kind="prompt" + placeholder = มีช่องกรอกข้อความ ส่งค่าให้ onConfirm(value)
 *        required = ช่องกรอกข้อความห้ามว่าง (ปุ่มยืนยันกดไม่ได้จนกว่าจะกรอก)
 */
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Button, cx } from './ui.jsx';

export default function ConfirmDialog({
  title, message, confirmText = 'ยืนยัน', cancelText = 'ยกเลิก', danger, altText, onAlt, onConfirm, onCancel, kind, placeholder, required,
}) {
  const okBtn = useRef(null);
  const input = useRef(null);
  const [value, setValue] = useState('');
  const prompt = kind === 'prompt';

  useEffect(() => {
    (prompt ? input : okBtn).current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, prompt]);

  const blocked = prompt && required && !value.trim();
  const confirm = () => { if (blocked) return; if (prompt) onConfirm(value.trim()); else onConfirm(); };

  // วาดที่ document.body: ถ้าอยู่ใต้ element ที่มี backdrop-filter/transform กล่อง fixed จะถูกจำกัดอยู่ในกรอบนั้น
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[210] flex items-center justify-center bg-ink/45 px-4 backdrop-blur-[2px]" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cf-title"
        aria-describedby={message ? 'cf-msg' : undefined}
        className="tf-pop w-full max-w-sm rounded-[24px] bg-white p-6 text-center shadow-[0_30px_80px_-30px_rgba(24,24,27,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cx('mx-auto mb-4 flex size-12 items-center justify-center rounded-full', danger ? 'bg-danger-soft text-danger' : 'bg-orange-pale text-orange')}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {danger ? <><path d="M12 8v5" /><path d="M12 16.5h.01" /><circle cx="12" cy="12" r="9" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>}
          </svg>
        </div>
        <h2 id="cf-title" className="mb-2 text-[1.1875rem] font-medium">{title}</h2>
        {message && <p id="cf-msg" className="mb-5 text-[1rem] leading-relaxed text-ink-soft">{message}</p>}
        {prompt && (
          <textarea
            ref={input}
            rows={3}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) confirm(); }}
            className="tf-input mb-5 text-left"
            aria-label={title}
          />
        )}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            ref={okBtn}
            className={cx('flex-1', danger && '!bg-danger !shadow-[0_10px_24px_-12px_rgba(220,38,38,0.55)] hover:!bg-[#B91C1C]')}
            onClick={confirm}
            disabled={blocked}
          >
            {confirmText}
          </Button>
          {altText && <Button variant="ghost" className="flex-1" onClick={onAlt}>{altText}</Button>}
          <Button variant="ghost" className="flex-1" onClick={onCancel}>{cancelText}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
