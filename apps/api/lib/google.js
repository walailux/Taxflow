'use strict';
/**
 * lib/google.js ตรวจ ID token จากปุ่ม "Sign in with Google" (Google Identity Services)
 * ตรวจลายเซ็น RS256 กับกุญแจสาธารณะของ Google เอง ด้วย crypto ของ Node ไม่ต้องติดตั้งไลบรารีเพิ่ม
 * ใช้แค่ Client ID (ไม่ต้องมี client secret) เพราะหน้าเว็บได้ token มาจาก Google โดยตรง
 */
const crypto = require('crypto');

// GOOGLE_CERTS_URL ใช้เฉพาะชุดทดสอบ API (scripts/api-smoke.js) ที่จำลองเซิร์ฟเวอร์กุญแจของ Google
const certsUrl = () => process.env.GOOGLE_CERTS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_SEC = 60;

let cache = { keys: new Map(), until: 0 };

const clientId = () => String(process.env.GOOGLE_CLIENT_ID || '').trim();

async function fetchKeys(fetchImpl) {
  const res = await fetchImpl(certsUrl());
  if (!res.ok) throw new Error(`โหลดกุญแจของ Google ไม่สำเร็จ (${res.status})`);
  const { keys } = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  cache = {
    keys: new Map((keys || []).map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])),
    until: Date.now() + (maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000),
  };
}

async function keyFor(kid, fetchImpl) {
  if (Date.now() < cache.until && cache.keys.has(kid)) return cache.keys.get(kid);
  // Google หมุนกุญแจเป็นระยะ kid ที่ไม่รู้จักจึงโหลดใหม่หนึ่งครั้งก่อนตัดสินว่าไม่ถูกต้อง
  await fetchKeys(fetchImpl);
  return cache.keys.get(kid) || null;
}

const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/**
 * คืน { ok: true, sub, email, name, picture } หรือ { ok: false, error }
 * opts.fetchImpl / opts.now / opts.clientId ใช้ตอนทดสอบ
 */
async function verifyIdToken(credential, opts = {}) {
  const aud = opts.clientId || clientId();
  const fetchImpl = opts.fetchImpl || fetch;
  const now = Math.floor((opts.now || Date.now()) / 1000);
  if (!aud) return { ok: false, error: 'ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google' };

  const parts = String(credential || '').split('.');
  if (parts.length !== 3) return { ok: false, error: 'ข้อมูลจาก Google ไม่ถูกต้อง' };
  let header, payload;
  try { header = b64json(parts[0]); payload = b64json(parts[1]); } catch { return { ok: false, error: 'ข้อมูลจาก Google ไม่ถูกต้อง' }; }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, error: 'ข้อมูลจาก Google ไม่ถูกต้อง' };

  let key;
  try { key = await keyFor(header.kid, fetchImpl); } catch { return { ok: false, error: 'เชื่อมต่อ Google เพื่อตรวจสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }; }
  if (!key) return { ok: false, error: 'ข้อมูลจาก Google ไม่ถูกต้อง' };
  const signed = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
  if (!signed) return { ok: false, error: 'ข้อมูลจาก Google ไม่ถูกต้อง' };

  if (!ISSUERS.has(payload.iss) || payload.aud !== aud) return { ok: false, error: 'ข้อมูลจาก Google ไม่ได้ออกให้ระบบนี้' };
  if (!payload.exp || payload.exp + CLOCK_SKEW_SEC < now) return { ok: false, error: 'การเข้าสู่ระบบด้วย Google หมดเวลาแล้ว กรุณากดปุ่มอีกครั้ง' };
  if (payload.iat && payload.iat - CLOCK_SKEW_SEC > now) return { ok: false, error: 'ข้อมูลจาก Google ไม่ถูกต้อง' };
  if (!payload.sub || !payload.email || payload.email_verified !== true) {
    return { ok: false, error: 'บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล จึงใช้สมัครหรือเข้าสู่ระบบไม่ได้' };
  }
  return {
    ok: true,
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: String(payload.name || '').trim(),
    picture: payload.picture || '',
  };
}

function resetKeyCache() { cache = { keys: new Map(), until: 0 }; }

module.exports = { verifyIdToken, clientId, resetKeyCache };
