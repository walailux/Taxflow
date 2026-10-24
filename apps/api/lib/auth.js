'use strict';

/**
 * auth.js ระบบยืนยันตัวตน (Authentication)
 * -------------------------------------------------------------
 * ใช้ Node.js crypto ล้วน ไม่ต้องพึ่งไลบรารีภายนอก
 * - hashPassword / verifyPassword : เข้ารหัสรหัสผ่านด้วย scrypt + salt
 * - createToken / verifyToken : สร้าง session token แบบ HMAC (คล้าย JWT)
 * - cookie helper : อ่าน/เขียน cookie
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/*
 * SESSION_SECRET ใช้เซ็น session token (HMAC) ถ้าใครรู้ค่านี้จะปลอม token
 * เป็นผู้ใช้คนไหนก็ได้ (รวมถึง admin) จึง "ห้าม" มีค่า default ที่ฝังอยู่ในโค้ด
 * แนวทางเดียวกับ data/file.key: ตั้งผ่าน env var ได้ ถ้าไม่ตั้งจะสุ่มแล้วเก็บลงไฟล์
 * data/session.key (สิทธิ์ไฟล์ 0600) โดยอัตโนมัติในการรันครั้งแรก
 */
const DATA_DIR = path.join(__dirname, '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, 'session.key');

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  console.log('[auth] สร้างคีย์เซ็น session ใหม่ที่ data/session.key อย่าลบไฟล์นี้ มิฉะนั้น session เดิมทั้งหมดจะใช้งานไม่ได้');
  return secret;
}

const SECRET = loadSecret();
const TOKEN_TTL = 7 * 24 * 3600; // 7 วัน

/* ---------- Password hashing ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Session token (HMAC signed) ---------- */
function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function createToken(payload, ttl = TOKEN_TTL) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttl };
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${data}.${sign(data)}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (sign(data) !== sig) return null;
  try {
    const body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (body.exp * 1000 < Date.now()) return null;
    return body;
  } catch {
    return null;
  }
}

/* ---------- Cookie helpers ---------- */
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i > -1) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

/*
 * คุกกี้ session ข้ามโดเมน (WP1/WP2) อ่านค่าตัวแปรแวดล้อมตอนเรียกทุกครั้ง ไม่อ่านตอนโหลดโมดูล (ทดสอบได้)
 * - ค่าเริ่มต้น SameSite=Lax: หน้าเว็บกับ API อยู่โดเมนเดียวกัน หรือ React ผ่าน proxy ของ Vite ตอนพัฒนา
 * - COOKIE_CROSS_SITE=1: SameSite=None; Secure สำหรับ Vercel -> Railway (WP7) การกัน CSRF อยู่ที่ core/cors.js
 * - AUTH_HEADER_MODE=1: ทางสำรองตามแผน WP1 ส่ง token กลับทาง header X-Session-Token ด้วย
 *   หน้าเว็บ React เก็บไว้แล้วแนบกลับมาเป็น Authorization: Bearer (ดู apps/web/src/lib/api.js)
 */
function cookieFlags() {
  return process.env.COOKIE_CROSS_SITE === '1' ? 'SameSite=None; Secure' : 'SameSite=Lax';
}
const headerMode = () => process.env.AUTH_HEADER_MODE === '1';

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `tf_session=${token}; HttpOnly; Path=/; Max-Age=${TOKEN_TTL}; ${cookieFlags()}`);
  if (headerMode()) res.setHeader('X-Session-Token', token);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `tf_session=; HttpOnly; Path=/; Max-Age=0; ${cookieFlags()}`);
}

/** อ่าน session token จากคุกกี้ก่อน ถ้าไม่มีและเปิด AUTH_HEADER_MODE ให้อ่านจาก Authorization: Bearer */
function readToken(req) {
  const fromCookie = parseCookies(req).tf_session;
  if (fromCookie) return fromCookie;
  if (!headerMode()) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  return m ? m[1] : null;
}

module.exports = {
  hashPassword, verifyPassword,
  createToken, verifyToken,
  parseCookies, setSessionCookie, clearSessionCookie, readToken,
};
