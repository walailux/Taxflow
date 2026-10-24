/**
 * googlePopup.js เข้าสู่ระบบด้วย Google แบบ "เลือกบัญชีใหม่ทุกครั้ง" (ไม่จดจำบัญชี)
 * ปุ่มของ Google Identity Services จำบัญชีที่เคยใช้ให้อัตโนมัติและปิดไม่ได้ ทางนี้จึงเปิดหน้า OAuth ของ Google เอง
 * ด้วย prompt=select_account ได้ ID token แบบเดียวกับปุ่มของ Google (API ตรวจด้วยวิธีเดิม)
 * หน้า /auth/google/callback รับ token แล้วส่งกลับมาทาง BroadcastChannel (window.opener ใช้ไม่ได้
 * เพราะหน้าของ Google ตั้ง Cross-Origin-Opener-Policy ตัดการเชื่อมกับหน้าต่างที่เปิด popup)
 */
export const GOOGLE_CALLBACK_PATH = '/auth/google/callback';
export const GOOGLE_CHANNEL = 'tf-google-auth';
const PENDING_KEY = 'tf_google_popup';

export const googleRedirectUri = () => `${window.location.origin}${GOOGLE_CALLBACK_PATH}`;

// ใช้ตัวสุ่มเชิงรหัสลับเสมอ (ค่านี้กันการปลอมคำตอบจาก popup) เบราว์เซอร์ที่ไม่มี randomUUID ใช้ getRandomValues แทน
const randomId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
};

/** อ่าน payload ของ ID token (ไม่ได้ตรวจลายเซ็น ใช้แค่เทียบ nonce ฝั่งหน้าเว็บ API ตรวจลายเซ็นเองอีกชั้น) */
export function tokenNonce(idToken) {
  try {
    const b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64)))).nonce || '';
  } catch {
    return '';
  }
}

/** เปิดหน้าต่างเลือกบัญชี Google คืน { state, nonce } ไว้เทียบตอนได้ผลกลับมา หรือ throw ถ้า popup ถูกบล็อก */
export function openGoogleChooser(clientId) {
  const state = randomId();
  const nonce = randomId();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'id_token',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
    nonce,
  });
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, nonce })); } catch { /* เทียบจาก ref ในหน้าแทน */ }
  const w = 500;
  const h = 640;
  const left = Math.max(0, (window.screenX || 0) + (window.outerWidth - w) / 2);
  const top = Math.max(0, (window.screenY || 0) + (window.outerHeight - h) / 2);
  const popup = window.open(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 'tf-google', `width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) throw new Error('เบราว์เซอร์บล็อกหน้าต่าง popup กรุณาอนุญาต popup สำหรับเว็บนี้แล้วลองอีกครั้ง');
  return { state, nonce };
}

/** ใช้ในหน้า callback: แปลง hash ที่ Google ส่งกลับมาเป็นข้อความ แล้วส่งให้หน้าต่างหลัก */
export function relayGoogleResult(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const msg = { state: p.get('state') || '', idToken: p.get('id_token') || '', error: p.get('error') || '' };
  if (!msg.idToken && !msg.error) msg.error = 'no_token';
  try {
    const ch = new BroadcastChannel(GOOGLE_CHANNEL);
    ch.postMessage(msg);
    ch.close();
  } catch {
    // เบราว์เซอร์เก่าไม่มี BroadcastChannel ใช้ storage event ของ localStorage แทน
    try { localStorage.setItem(GOOGLE_CHANNEL, JSON.stringify({ ...msg, at: Date.now() })); localStorage.removeItem(GOOGLE_CHANNEL); } catch { /* ส่งไม่ได้ */ }
  }
  return msg;
}

/** ใช้ในหน้าต่างหลัก: ฟังผลจากหน้า callback คืนฟังก์ชันยกเลิกการฟัง */
export function listenGoogleResult(onMessage) {
  let ch = null;
  try {
    ch = new BroadcastChannel(GOOGLE_CHANNEL);
    ch.onmessage = (e) => onMessage(e.data);
  } catch { ch = null; }
  const onStorage = (e) => {
    if (e.key !== GOOGLE_CHANNEL || !e.newValue) return;
    try { onMessage(JSON.parse(e.newValue)); } catch { /* ข้อมูลผิดรูปแบบ */ }
  };
  window.addEventListener('storage', onStorage);
  return () => { if (ch) ch.close(); window.removeEventListener('storage', onStorage); };
}

/** ตรวจว่าผลที่ได้ตรงกับคำขอที่เปิดไว้ (state และ nonce) คืน ID token หรือ '' */
export function acceptGoogleResult(msg, expected) {
  let exp = expected;
  if (!exp) {
    try { exp = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch { exp = null; }
  }
  if (!exp || !msg || msg.state !== exp.state) return '';
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ไม่เป็นไร */ }
  if (!msg.idToken || tokenNonce(msg.idToken) !== exp.nonce) return '';
  return msg.idToken;
}
