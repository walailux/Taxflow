/**
 * otpSession.js เก็บรายการ OTP ที่รอยืนยันไว้ใน sessionStorage
 * หน้าเดิมเก็บไว้ในตัวแปร กดรีเฟรชหน้าแล้วต้องเข้าสู่ระบบใหม่ ที่นี่รีเฟรชแล้วยังกรอกรหัสต่อได้
 * ปิดแท็บแล้วหายเอง และไม่มีรหัสผ่านอยู่ในนี้
 */
const KEY = 'tf_otp';
const MAX_AGE_MS = 10 * 60 * 1000; // รหัส OTP มีอายุ 5 นาที เผื่อขอรหัสใหม่ได้อีกรอบ

function store() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

/** data = ผลจาก /api/auth/login หรือ /api/auth/register */
export function saveOtpSession(data, mode, now = Date.now()) {
  const ctx = {
    otpId: data.otpId,
    mode,
    emailMasked: data.emailMasked || '',
    notice: data.notice || '',
    devCode: data.devCode || '',
    at: now,
  };
  try { store()?.setItem(KEY, JSON.stringify(ctx)); } catch { /* ใช้ต่อได้แม้เขียนไม่ได้ */ }
  return ctx;
}

export function loadOtpSession(now = Date.now()) {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw);
    if (!ctx || !ctx.otpId || !['login', 'register', 'totp'].includes(ctx.mode)) return null;
    if (now - Number(ctx.at || 0) > MAX_AGE_MS) { clearOtpSession(); return null; }
    return ctx;
  } catch { return null; }
}

export function clearOtpSession() {
  try { store()?.removeItem(KEY); } catch { /* ไม่มีอะไรต้องทำ */ }
}
