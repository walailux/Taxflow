/**
 * OtpPage.jsx ยืนยันรหัส OTP (ภาคผนวก ข ข้อ 3) ใช้ร่วมกันทั้ง 3 กรณี
 * - login    : OTP ทางอีเมลตอนเข้าสู่ระบบ
 * - register : ยืนยันอีเมลตอนสมัคร (หรือบัญชีเก่าที่ยังไม่ยืนยันแล้วมาเข้าสู่ระบบ)
 * - totp     : รหัสจากแอป Authenticator ไม่มีปุ่มส่งรหัสใหม่ เพราะรหัสเปลี่ยนเองทุก 30 วินาที
 * กรอกครบ 6 หลักแล้วส่งเอง · สำเร็จแล้วแสดงมาสคอตติ๊กถูกก่อนไปหน้าถัดไป
 * ขอรหัสใหม่ได้หลังนับถอยหลัง 45 วินาที การจำกัดกรอกผิด 5 ครั้งอยู่ที่ API (lib/otp.js)
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '../features/auth/authApi.js';
import OtpInput from '../features/auth/OtpInput.jsx';
import { clearOtpSession, loadOtpSession, saveOtpSession } from '../features/auth/otpSession.js';
import { clearRegisterDraft } from '../features/auth/registerDraft.js';
import { ME_KEY } from '../features/auth/useMe.js';
import { useCountdown } from '../features/auth/useCountdown.js';
import { otpError } from '../features/auth/validation.js';
import { homeUrl } from '../lib/home.js';
import { Alert, BackButton, Button } from '../components/ui.jsx';

export const RESEND_COOLDOWN_SEC = 45;

const TITLE = {
  login: 'ยืนยันตัวตนด้วย OTP',
  register: 'ยืนยันอีเมลของคุณ',
  totp: 'ยืนยันด้วยแอป Authenticator',
};

export default function OtpPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ctx, setCtx] = useState(loadOtpSession);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [info, setInfo] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(null); // { user, isNew } เมื่อยืนยันสำเร็จ
  const [resending, setResending] = useState(false);
  const [left, startCooldown] = useCountdown();
  const mode = ctx && ctx.mode;
  const canResend = !!mode && authApi.canResend(mode);

  useEffect(() => {
    if (canResend) startCooldown(RESEND_COOLDOWN_SEC);
  }, [canResend, startCooldown]);

  if (done) return <SuccessView {...done} />;
  if (!ctx) return <Navigate to="/login" replace />;

  async function verify(value = code) {
    if (pending) return;
    const msg = otpError(value);
    if (msg) { setError(msg); setShake((n) => n + 1); return; }
    setPending(true);
    setError('');
    try {
      const data = await authApi.verify(mode, ctx.otpId, value);
      clearOtpSession();
      if (mode === 'register') clearRegisterDraft();
      queryClient.setQueryData(ME_KEY, { user: data.user });
      setDone({ user: data.user, isNew: mode === 'register' });
    } catch (err) {
      setError(err.message);
      setCode('');
      setShake((n) => n + 1);
      setPending(false);
    }
  }

  async function onResend() {
    if (resending || left > 0) return;
    setResending(true);
    setError('');
    setInfo('');
    try {
      const data = await authApi.resend(mode, ctx.otpId);
      // เก็บรหัสโหมดพัฒนาใหม่ และรีเซ็ตเวลาของรายการ เพื่อให้รีเฟรชหน้าแล้วยังใช้ต่อได้
      setCtx(saveOtpSession({ ...ctx, notice: '', devCode: data.devCode || '' }, mode));
      setInfo('ส่งรหัสใหม่แล้ว กรุณาตรวจสอบอีเมล');
      setCode('');
      setShake((n) => n + 1);
      startCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  function backToLogin() {
    clearOtpSession();
    void navigate('/login', { replace: true });
  }
  // สมัครสมาชิกแต่ยังไม่พร้อมกรอก OTP: กลับไปหน้าสมัคร ข้อมูลที่กรอกไว้ยังอยู่ (registerDraft.js) กดสมัครใหม่ได้
  function backToRegister() {
    clearOtpSession();
    void navigate('/register', { replace: true });
  }

  return (
    <>
      <div className="mb-4">
        {mode === 'register'
          ? <BackButton onClick={backToRegister}>กลับไปแก้ไขข้อมูลสมัคร</BackButton>
          : <BackButton onClick={backToLogin}>กลับไปหน้าเข้าสู่ระบบ</BackButton>}
      </div>
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-orange-pale text-orange">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {mode === 'totp' ? (
            <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18h3" /></>
          ) : (
            <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>
          )}
        </svg>
      </div>
      <h1 className="mb-1.5 text-[1.75rem]">{TITLE[mode]}</h1>
      <p className="mb-7 text-[1rem] leading-relaxed text-ink-soft">
        {mode === 'totp' ? (
          'เปิดแอป Authenticator (Google Authenticator, Authy หรือแอปอื่น) แล้วกรอกรหัส 6 หลักที่แสดงอยู่ตอนนี้'
        ) : (
          <>
            ส่งรหัส 6 หลักไปที่ <b className="font-semibold text-ink">{ctx.emailMasked}</b>{' '}
            {mode === 'register' ? 'กรอกเพื่อเปิดใช้งานบัญชี รหัสมีอายุ 5 นาที' : 'กรอกภายใน 5 นาที'}
          </>
        )}
      </p>

      <Alert kind="info">{ctx.notice}</Alert>
      {ctx.devCode && (
        <Alert kind="dev">
          โหมดพัฒนา: รหัส OTP คือ{' '}
          <b className="font-mono text-[1.03125rem] tracking-[3px]">{ctx.devCode}</b>
        </Alert>
      )}
      <Alert kind="ok">{info}</Alert>

      <form noValidate onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <OtpInput
          value={code}
          onChange={(v) => { setCode(v); if (error) setError(''); }}
          onComplete={verify}
          state={error ? 'error' : 'idle'}
          disabled={pending}
          autoFocus
          shakeKey={shake}
          describedBy={error ? 'otp-err' : undefined}
        />
        <p id="otp-err" role="alert" className="mb-4 mt-3 min-h-[1.25rem] text-center text-[0.90625rem] font-medium text-danger">{error}</p>
        <Button type="submit" block loading={pending}>{pending ? 'กำลังยืนยัน' : 'ยืนยัน'}</Button>
      </form>

      {canResend && (
        <p className="mt-5 text-center text-[0.9375rem] text-ink-soft" aria-live="polite">
          ไม่ได้รับรหัส?{' '}
          {left > 0 ? (
            <span>ขอรหัสใหม่ได้ในอีก <b className="font-mono font-semibold text-ink">{left}</b> วินาที</span>
          ) : (
            <button type="button" onClick={onResend} disabled={resending} className="cursor-pointer font-semibold text-orange-deep disabled:opacity-60">
              {resending ? 'กำลังส่ง' : 'ส่งรหัสอีกครั้ง'}
            </button>
          )}
        </p>
      )}
    </>
  );
}

/** หน้าสำเร็จ: มาสคอตติ๊กถูก แล้วไปหน้าถัดไปเอง (สมัครใหม่ 3.2 วินาที · เข้าสู่ระบบ 1.8 วินาที) */
function SuccessView({ user, isNew }) {
  const delay = isNew ? 3200 : 1800;
  const target = homeUrl(user.role, { isNew });
  const btn = useRef(null);

  useEffect(() => {
    btn.current?.focus();
    const t = setTimeout(() => window.location.assign(target), delay);
    return () => clearTimeout(t);
  }, [target, delay]);

  return (
    <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
      <div className="relative mb-3">
        <span aria-hidden="true" className="tf-ring absolute inset-6 rounded-full bg-ok/25" />
        <img src="/img/mascot-success.webp" alt="" className="tf-success-in relative h-[220px] w-auto" />
        <svg aria-hidden="true" viewBox="0 0 52 52" className="tf-pop absolute bottom-3 right-2 size-14 drop-shadow-[0_8px_16px_rgba(22,163,74,0.35)] [animation-delay:.35s]">
          <circle cx="26" cy="26" r="25" fill="var(--color-ok)" />
          <path d="M15 27l7 7 15-16" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="40" strokeDashoffset="40" style={{ animation: 'tf-check-draw .45s .6s ease-out forwards' }} />
        </svg>
      </div>
      <h1 className="tf-fade-up mb-2 text-[1.75rem]">{isNew ? 'สมัครสมาชิกสำเร็จ!' : 'เข้าสู่ระบบสำเร็จ'}</h1>
      <p className="tf-fade-up-late mb-7 max-w-[340px] text-[1rem] leading-relaxed text-ink-soft">
        {isNew
          ? `ยินดีต้อนรับ ${user.displayName || ''} บัญชีของคุณพร้อมใช้งานแล้ว ขั้นต่อไปอัปโหลดเอกสารยืนยันตัวตนที่หน้าโปรไฟล์`
          : `ยินดีต้อนรับกลับ ${user.displayName || ''} กำลังพาไปหน้าแดชบอร์ด`}
      </p>
      <Button ref={btn} block onClick={() => window.location.assign(target)} className="tf-fade-up-late">
        {isNew ? 'เริ่มใช้งาน' : 'ไปที่แดชบอร์ด'}
      </Button>
      <div aria-hidden="true" className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[#EFEBE7]">
        <div className="h-full origin-left bg-orange" style={{ animation: `tf-progress ${delay}ms linear both` }} />
      </div>
    </div>
  );
}
