/**
 * Toast.jsx ข้อความแจ้งผลสั้น ๆ มุมล่างของจอ หายเองใน 2.8 วินาที
 * const toast = useToast(); toast('บันทึกแล้ว'); toast('ผิดพลาด', 'err');
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { cx } from './ui.jsx';

const ToastCtx = createContext(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const toast = useCallback((message, kind = 'ok') => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, message: String(message || ''), kind }]);
    setTimeout(() => setItems((xs) => xs.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite" role="status">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'tf-pop pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-[0.96875rem] font-medium text-white shadow-[0_18px_40px_-16px_rgba(24,24,27,0.5)]',
              t.kind === 'err' ? 'bg-danger' : 'bg-ink',
            )}
          >
            <span aria-hidden="true" className={cx('flex size-5 shrink-0 items-center justify-center rounded-full text-[0.84375rem]', t.kind === 'err' ? 'bg-white/20' : 'bg-ok')}>
              {t.kind === 'err' ? '!' : '✓'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
