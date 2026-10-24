/**
 * LoginPage.jsx หน้าเข้าสู่ระบบ (ภาคผนวก ข ข้อ 1)
 * ขั้นที่ 1 ตรวจอีเมล/รหัสผ่าน แล้ว API ส่ง OTP ทางอีเมล (หรือขอรหัส TOTP) จึงไปต่อที่ /verify
 * - จำอีเมลล่าสุดบนเครื่องนี้ (ไม่เก็บรหัสผ่าน)
 * - การจำกัดจำนวนครั้งที่ลองผิดอยู่ที่ API (8 ครั้ง/10 นาที ต่ออีเมล) หน้านี้แสดงข้อความ 429 ที่ได้รับ
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import GoogleButton from '../features/auth/GoogleButton.jsx';
import { authApi } from '../features/auth/authApi.js';
import { saveOtpSession } from '../features/auth/otpSession.js';
import { useMe } from '../features/auth/useMe.js';
import { liveEmailError, loginErrors, normalizeEmail, otpModeFromLogin } from '../features/auth/validation.js';
import { Alert, Button, TextField } from '../components/ui.jsx';

const LAST_EMAIL_KEY = 'tf_last_email';
const readLastEmail = () => { try { return localStorage.getItem(LAST_EMAIL_KEY) || ''; } catch { return ''; } };
const rememberEmail = (e) => { try { localStorage.setItem(LAST_EMAIL_KEY, e); } catch { /* ไม่จำก็ได้ */ } };

export default function LoginPage() {
  const navigate = useNavigate();
  const me = useMe();
  const [email, setEmail] = useState(readLastEmail);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);

  if (me.data && me.data.user) return <Navigate to="/app" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    setFormError('');
    const errs = loginErrors({ email, password });
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(errs.email ? 'l-email' : 'l-pass')?.focus();
      return;
    }
    setPending(true);
    try {
      const addr = normalizeEmail(email);
      const data = await authApi.login(addr, password);
      rememberEmail(addr);
      saveOtpSession(data, otpModeFromLogin(data));
      void navigate('/verify');
    } catch (err) {
      setFormError(err.message);
      setPassword('');
      document.getElementById('l-pass')?.focus();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <h1 className="mb-1.5 text-[1.875rem]">เข้าสู่ระบบ</h1>
      <p className="mb-7 text-[1rem] text-ink-soft">ยินดีต้อนรับกลับ กรอกข้อมูลเพื่อเข้าใช้งาน</p>
      <Alert>{formError}</Alert>
      <GoogleButton onError={setFormError} />
      <form noValidate onSubmit={onSubmit}>
        <TextField
          id="l-email"
          label="อีเมล"
          type="email"
          placeholder="you@example.com"
          autoComplete="username"
          value={email}
          error={errors.email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((x) => ({ ...x, email: liveEmailError(e.target.value) }));
          }}
          onBlur={() => setErrors((x) => ({ ...x, email: liveEmailError(email) }))}
        />
        <TextField
          id="l-pass"
          label="รหัสผ่าน"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password && e.target.value) setErrors((x) => ({ ...x, password: null }));
          }}
        />
        <Button type="submit" block loading={pending} className="mt-2">{pending ? 'กำลังตรวจสอบ' : 'เข้าสู่ระบบ'}</Button>
      </form>
      <p className="mt-6 text-center text-[0.96875rem] text-ink-soft lg:hidden">
        ยังไม่มีบัญชี? <Link to="/register" className="font-semibold text-orange-deep">สมัครสมาชิก</Link>
      </p>
    </>
  );
}
