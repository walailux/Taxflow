'use strict';
/**
 * core/cors.js เปิดให้หน้าเว็บ React ที่อยู่คนละโดเมน (Vercel) เรียก API นี้ได้ — WP1
 * -----------------------------------------------------------------------------
 * หลักการ 3 ข้อ
 * 1) อนุญาตเฉพาะโดเมนที่ระบุไว้ใน WEB_ORIGINS เท่านั้น ไม่ใช้ '*' เพราะคำขอต้องแนบคุกกี้ session
 *    (Access-Control-Allow-Credentials: true ใช้ร่วมกับ '*' ไม่ได้ตามสเปกของเบราว์เซอร์)
 * 2) คุกกี้ session ต้องเป็น SameSite=None; Secure เมื่อหน้าเว็บกับ API อยู่คนละโดเมน
 *    ตั้งผ่านตัวแปรแวดล้อม COOKIE_CROSS_SITE=1 (ดู lib/auth.js)
 * 3) SameSite=None เปิดช่องให้เว็บอื่นยิงคำขอแนบคุกกี้ได้ จึงต้องมีการป้องกัน CSRF เพิ่ม
 *    ที่นี่ใช้วิธีตรวจ Origin ของคำขอที่เปลี่ยนแปลงข้อมูล (POST/PUT/PATCH/DELETE)
 *    คำขอที่ไม่มี Origin (เรียกจาก curl/แอปมือถือ/เซิร์ฟเวอร์อื่น) ยังผ่านได้ เพราะไม่ใช่คำขอ
 *    ที่เบราว์เซอร์ยิงจากหน้าเว็บของผู้อื่น และ endpoint กลุ่ม /api/v1 ใช้ API key ไม่ใช่คุกกี้อยู่แล้ว
 *
 * ทางเลือกสำรองตามที่ระบุไว้ในแผน WP1: ถ้าเบราว์เซอร์บล็อกคุกกี้ข้ามโดเมนตอนทดสอบบน localhost
 * ให้ตั้ง AUTH_HEADER_MODE=1 แล้วฝั่งหน้าเว็บส่ง token ทาง Authorization: Bearer แทนคุกกี้
 * (lib/auth.js อ่านทั้งสองทางอยู่แล้ว)
 */
const { sendJson } = require('../lib/router');

/** ตัด / ท้ายข้อความออก (เขียนเป็นลูปแทน regex /\/+$/ ที่ backtrack ได้ช้าเมื่อข้อความยาว) */
function stripTrailingSlashes(s) {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

// รายชื่อโดเมนหน้าเว็บที่อนุญาต คั่นด้วยจุลภาค เช่น
// WEB_ORIGINS="http://localhost:5173,https://taxflow.vercel.app"
const ALLOWED = (process.env.WEB_ORIGINS || 'http://localhost:5173,http://localhost:4000')
  .split(',')
  .map((s) => stripTrailingSlashes(s.trim()))
  .filter(Boolean);

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isAllowed(origin) {
  return !!origin && ALLOWED.includes(stripTrailingSlashes(origin));
}

/**
 * คำขอจากโดเมนเดียวกับ API เอง (หน้าเว็บเดิมที่ API เสิร์ฟให้) ไม่ใช่ CSRF จึงต้องผ่านเสมอ
 * เดิมตรวจเฉพาะรายชื่อ WEB_ORIGINS ถ้าเปิดหน้าเว็บจากโดเมนของ API ที่ไม่ได้ใส่ไว้ในรายชื่อ
 * (เช่นพอร์ตอื่นในเครื่อง หรือโดเมนของ Railway ตอน WP7) ทุกปุ่มที่ส่งข้อมูลจะถูกบล็อก
 * เทียบ host ของ Origin กับ Host ที่เบราว์เซอร์ส่งมา ซึ่งหน้าเว็บโจมตีจากโดเมนอื่นปลอมทั้งคู่พร้อมกันไม่ได้
 */
function isSameOrigin(req, origin) {
  if (!origin || !req.headers.host) return false;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function corsAndCsrf(req, res, next) {
  const origin = req.headers.origin;

  if (isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '600');
  // ให้ JavaScript ของหน้าเว็บคนละโดเมนอ่าน token ได้ เมื่อเปิด AUTH_HEADER_MODE (ดู lib/auth.js)
  res.setHeader('Access-Control-Expose-Headers', 'X-Session-Token');

  // preflight ตอบจบที่นี่ ไม่ต้องวิ่งเข้า route
  if (req.method === 'OPTIONS') {
    res.writeHead(isAllowed(origin) ? 204 : 403);
    return res.end();
  }

  // กัน CSRF: คำขอที่เปลี่ยนข้อมูลและมาจากเบราว์เซอร์ ต้องมี Origin ที่อยู่ในรายชื่อที่อนุญาต
  if (MUTATING.has(req.method) && origin && !isAllowed(origin) && !isSameOrigin(req, origin)) {
    return sendJson(res, 403, { error: 'คำขอมาจากโดเมนที่ไม่ได้รับอนุญาต' });
  }

  return next();
}

module.exports = { corsAndCsrf, ALLOWED_ORIGINS: ALLOWED };
