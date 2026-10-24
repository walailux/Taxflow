/**
 * OtpDialog.jsx ยืนยันตัวตนด้วย OTP ก่อนทำรายการสำคัญ (ย้ายจาก otpGate() ของ common.js)
 * ใช้กับการลงลายมือชื่อ: ขอรหัสตอนเปิด ส่งรหัสใหม่ได้หลัง 45 วินาที และกรอกผิดก็ลองใหม่ได้ในกล่องเดิม
 * action(otpId, code) = ฟังก์ชันที่ยิง API จริง ถ้าสำเร็จคืนผลลัพธ์ให้ onDone
 */
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import OtpInput from '../auth/OtpInput.jsx';
import { api } from '../../lib/api.js';
import { useSubmit } from '../../lib/useSubmit.js';
import { useCountdown } from '../auth/useCountdown.js';
import { otpError } from '../auth/validation.js';
import { Alert, Button, Spinner } from '../../components/ui.jsx';

export default function OtpDialog({ purpose, refId, title, subtitle, action, onDone, onCancel, onSkip, skipText, note }) {
  const [ctx, setCtx] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [left, startCooldown] = useCountdown();
  const [shake, setShake] = useState(0); // เปลี่ยนค่า = สั่นช่องและโฟกัสช่องแรกใหม่หลังกรอกผิด
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return; // StrictMode เรียกซ้ำตอนพัฒนา ไม่ต้องขอรหัสสองรอบ
    asked.current = true;
    api.post('/api/otp/request', { purpose, refId })
      .then((d) => { setCtx(d); startCooldown(45); })
      .catch((err) => setError(err.message));
  }, [purpose, refId, startCooldown]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const [pending, submitOtp] = useSubmit(async () => {
    if (!ctx) return;
    const msg = otpError(code);
    if (msg) { setError(msg); return; }
    setError('');
    try {
      onDone(await action(ctx.otpId, code));
    } catch (err) {
      setError(err.message);
      setCode('');
      setShake((n) => n + 1);
    }
  });
  const submit = (e) => { e.preventDefault(); submitOtp(); };

  async function resend() {
    if (left > 0) return;
    try {
      const d = await api.post('/api/otp/resend', { otpId: ctx.otpId });
      setCtx((c) => ({ ...c, otpId: d.otpId || c.otpId, devCode: d.devCode || '' }));
      startCooldown(45);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  // วาดที่ document.body: ถ้าอยู่ใต้ element ที่มี backdrop-filter/transform กล่อง fixed จะถูกจำกัดอยู่ในกรอบนั้น
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[300] flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="otp-title" className="tf-reveal w-full max-w-[380px] rounded-[var(--radius-card)] bg-white p-5">
        <h2 id="otp-title" className="text-center text-[1.125rem]">{title || 'ยืนยันตัวตนด้วย OTP'}</h2>
        {note && <p className="mt-1 text-center text-[0.875rem] text-ink-soft">{note}</p>}
        <p className="mb-4 mt-1 text-center text-[0.90625rem] text-ink-soft">
          {subtitle || 'ระบบส่งรหัสยืนยัน 6 หลักไปที่'} <b className="text-ink">{ctx ? ctx.emailMasked : ''}</b>
        </p>
        {!ctx && !error && <p className="flex items-center justify-center gap-2 py-4 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังขอรหัส</p>}
        {ctx && ctx.devCode && (
          <Alert kind="dev">โหมดพัฒนา (ยังไม่ได้ตั้งค่าอีเมลผู้ส่งจริง): รหัส OTP ของคุณคือ <b className="font-mono tracking-[2px]">{ctx.devCode}</b></Alert>
        )}
        <Alert>{error}</Alert>
        {ctx && (
          <form noValidate onSubmit={submit}>
            <div className="mb-4">
              <OtpInput
                value={code}
                onChange={(v) => { setCode(v); if (error) setError(''); }}
                state={error ? 'error' : 'idle'}
                disabled={pending}
                autoFocus
                shakeKey={shake}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onCancel} disabled={pending}>ยกเลิก</Button>
              <Button type="submit" className="flex-1" loading={pending}>{pending ? 'กำลังตรวจสอบ' : 'ยืนยัน'}</Button>
            </div>
            <p className="mt-3 text-center text-[0.875rem] text-ink-soft" aria-live="polite">
              ไม่ได้รับรหัส?{' '}
              {left > 0 ? <span>ขอรหัสใหม่ได้ในอีก {left} วินาที</span>
                : <button type="button" onClick={resend} className="cursor-pointer font-bold text-orange-deep">ส่งรหัสอีกครั้ง</button>}
            </p>
            {onSkip && (
              <p className="mt-2 text-center">
                <button type="button" onClick={onSkip} className="cursor-pointer text-[0.875rem] font-semibold text-ink-soft underline">{skipText || 'ข้ามการลงนาม'}</button>
              </p>
            )}
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
