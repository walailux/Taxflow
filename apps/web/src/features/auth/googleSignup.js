/**
 * googleSignup.js ส่งต่อผลจาก Google ไปหน้าสมัคร (ยังไม่มีบัญชี) ผ่าน sessionStorage
 * signupToken มีอายุ 30 นาทีฝั่ง API ที่นี่ทิ้งก่อนหมดเล็กน้อย รีเฟรชหน้าแล้วยังกรอกต่อได้
 */
const KEY = 'tf_google_signup';
const MAX_AGE_MS = 28 * 60 * 1000;

function store() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

/** data = ผลจาก /api/auth/google ที่ needsRegistration = true */
export function saveGoogleSignup(data, now = Date.now()) {
  const g = { token: data.signupToken, email: data.email || '', name: data.name || '', at: now };
  try { store()?.setItem(KEY, JSON.stringify(g)); } catch { /* ใช้ต่อได้แม้เขียนไม่ได้ */ }
  return g;
}

export function loadGoogleSignup(now = Date.now()) {
  try {
    const g = JSON.parse(store()?.getItem(KEY) || 'null');
    if (!g || !g.token || !g.email) return null;
    if (now - Number(g.at || 0) > MAX_AGE_MS) { clearGoogleSignup(); return null; }
    return g;
  } catch { return null; }
}

export function clearGoogleSignup() {
  try { store()?.removeItem(KEY); } catch { /* ไม่มีอะไรต้องทำ */ }
}
