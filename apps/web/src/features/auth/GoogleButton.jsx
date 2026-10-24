/**
 * GoogleButton.jsx ปุ่ม "Sign in with Google" ของหน้าเข้าสู่ระบบและสมัคร
 * แสดงเฉพาะเมื่อ API ตั้ง GOOGLE_CLIENT_ID ไว้ (/api/auth/providers) ได้ ID token แล้วส่งให้ API ตรวจ
 * - มีบัญชีแล้ว: API ส่ง OTP ทางอีเมล -> ไปหน้า /verify เหมือนเข้าสู่ระบบด้วยรหัสผ่าน
 * - ยังไม่มีบัญชี: เรียก onNeedsRegistration (ค่าเริ่มต้นพาไปกรอกข้อมูลที่หน้า /register)
 * ผู้ใช้เลือกเองว่าจะ "จดจำบัญชี Google ในเครื่องนี้" ไหม (ค่าเริ่มต้นไม่จดจำ)
 * - ไม่จดจำ: ปุ่มของเราเปิดหน้าเลือกบัญชี Google ใหม่ทุกครั้ง (googlePopup.js)
 * - จดจำ: ใช้ปุ่มของ Google Identity Services ที่แสดงบัญชีที่เคยใช้ กดครั้งเดียวเข้าได้เลย
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { authApi } from './authApi.js';
import { saveGoogleSignup } from './googleSignup.js';
import { saveOtpSession } from './otpSession.js';
import { otpModeFromLogin } from './validation.js';
import { acceptGoogleResult, listenGoogleResult, openGoogleChooser } from './googlePopup.js';
import { Spinner } from '../../components/ui.jsx';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const REMEMBER_KEY = 'tf_google_remember';
let gisLoading = null;

function loadGis() {
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google);
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => resolve(globalThis.google);
      s.onerror = () => { gisLoading = null; reject(new Error('โหลดปุ่ม Google ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ต')); };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

const readRemember = () => { try { return localStorage.getItem(REMEMBER_KEY) === '1'; } catch { return false; } };
const writeRemember = (on) => { try { if (on) localStorage.setItem(REMEMBER_KEY, '1'); else localStorage.removeItem(REMEMBER_KEY); } catch { /* ไม่จำก็ได้ */ } };

export function useGoogleProvider() {
  const q = useQuery({ queryKey: ['auth', 'providers'], queryFn: authApi.providers, staleTime: Infinity, retry: false });
  return q.data?.google || null;
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-[1.125rem]" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** mode: 'signin' | 'signup' ใช้เลือกข้อความบนปุ่ม */
export default function GoogleButton({ mode = 'signin', divider = 'หรือ', onError, onNeedsRegistration }) {
  const provider = useGoogleProvider();
  const navigate = useNavigate();
  const box = useRef(null);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [remember, setRemember] = useState(readRemember);
  const expected = useRef(null);
  // GIS และหน้าต่าง popup เรียก callback ตัวเดียวทั้งหน้า ใช้ ref ให้เรียกฟังก์ชันล่าสุดเสมอ
  const handler = useRef(null);
  handler.current = async (credential) => {
    onError?.('');
    setPending(true);
    try {
      const data = await authApi.google(credential);
      if (data.needsRegistration) {
        const g = saveGoogleSignup(data);
        if (onNeedsRegistration) onNeedsRegistration(g);
        else void navigate('/register');
        return;
      }
      saveOtpSession(data, otpModeFromLogin(data));
      void navigate('/verify');
    } catch (err) {
      onError?.(err.message);
    } finally {
      setPending(false);
    }
  };
  const errorRef = useRef(onError);
  errorRef.current = onError;

  // ผลจากหน้าต่างเลือกบัญชี (โหมดไม่จดจำ)
  useEffect(() => listenGoogleResult((msg) => {
    const exp = expected.current;
    if (msg?.error) {
      // ผู้ใช้ปิด/ยกเลิกเองไม่ถือเป็นข้อผิดพลาด
      if (msg.error !== 'access_denied' && exp && msg.state === exp.state) {
        errorRef.current?.('เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง');
      }
      return;
    }
    const token = acceptGoogleResult(msg, exp);
    if (!token) return;
    expected.current = null;
    handler.current(token);
  }), []);

  // โหมดจดจำ: วาดปุ่มของ Google (แสดงบัญชีที่เคยใช้)
  useEffect(() => {
    if (!provider || !remember || !box.current) return undefined;
    let cancelled = false;
    loadGis().then((google) => {
      if (cancelled || !box.current) return;
      google.accounts.id.initialize({
        client_id: provider.clientId,
        callback: (resp) => handler.current(resp.credential),
        context: mode === 'signup' ? 'signup' : 'signin',
        ux_mode: 'popup',
        auto_select: true,
      });
      box.current.replaceChildren();
      google.accounts.id.renderButton(box.current, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill', locale: 'th',
        text: mode === 'signup' ? 'signup_with' : 'signin_with', logo_alignment: 'center',
        width: Math.min(400, box.current.clientWidth || 400),
      });
    }).catch((err) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [provider, mode, remember]);

  const toggleRemember = (on) => {
    setRemember(on);
    writeRemember(on);
    setLoadError('');
    // เลิกจดจำ: บอก Google ไม่ให้เลือกบัญชีให้อัตโนมัติอีก
    if (!on) globalThis.google?.accounts?.id?.disableAutoSelect();
  };

  const chooseAccount = () => {
    onError?.('');
    try {
      expected.current = openGoogleChooser(provider.clientId);
    } catch (err) {
      onError?.(err.message);
    }
  };

  if (!provider) return null;
  return (
    <div className="mb-5">
      <div className="relative flex min-h-[44px] items-center justify-center">
        {remember ? (
          <div ref={box} className={pending ? 'pointer-events-none w-full opacity-40' : 'w-full'} />
        ) : (
          <button
            type="button"
            onClick={chooseAccount}
            disabled={pending}
            className="flex h-[44px] w-full max-w-[400px] items-center justify-center gap-2.5 rounded-full border border-[#dadce0] bg-white px-4 text-[0.96875rem] font-medium text-[#3c4043] transition hover:bg-[#f8faff] disabled:opacity-40"
          >
            <GoogleLogo />
            {mode === 'signup' ? 'สมัครด้วย Google' : 'ลงชื่อเข้าใช้ด้วย Google'}
          </button>
        )}
        {pending && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 text-[0.90625rem] text-ink-soft">
            <Spinner /> กำลังตรวจสอบกับ Google
          </span>
        )}
      </div>
      <label className="mx-auto mt-2.5 flex w-fit cursor-pointer select-none items-center gap-2 text-[0.875rem] text-ink-soft">
        <input type="checkbox" className="size-4 accent-[var(--color-orange)]" checked={remember} onChange={(e) => toggleRemember(e.target.checked)} />
        จดจำบัญชี Google ในเครื่องนี้
      </label>
      {loadError && <p className="mt-2 text-center text-[0.875rem] text-danger">{loadError}</p>}
      <div className="mt-5 flex items-center gap-3 text-[0.84375rem] text-ink-soft">
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        {divider}
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
    </div>
  );
}
