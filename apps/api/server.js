'use strict';
/**
 * server.js จุดเริ่มระบบของ TaxFlow API (ver18, WP1)
 * ------------------------------------------------------------------
 * ไฟล์นี้เหลือหน้าที่เพียง 4 อย่าง: ตั้ง middleware กลาง, ประกอบ route จากโฟลเดอร์ routes/,
 * ดักข้อผิดพลาด และเริ่มงานตามเวลา เส้นทางทั้งหมด 111 เส้นอยู่ในโฟลเดอร์ routes/ แล้ว
 * รันด้วย `node server.js` เหมือนเดิม
 */
require('./scripts/_env'); // อ่าน apps/api/.env เข้ามาก่อนโมดูลอื่นจะอ่านค่า process.env
const express = require('express');
const fs = require('fs');
const path = require('path');
const { createRouter, sendJson } = require('./lib/router');
const { corsAndCsrf, ALLOWED_ORIGINS } = require('./core/cors');
const store = require('./core/store');
const storage = require('./lib/storage');
const pdpa = require('./lib/pdpa');
const { PORT, bangkokDateStr, notify, taxcalendar } = require('./core/context');
const { seedUsers } = require('./core/seed');

const api = createRouter();

// ป้องกัน XSS/MIME-sniffing เป็นชั้นที่สอง (defense in depth) ใช้กับทุก response
// ต้องลงทะเบียนเป็น middleware แรกสุด (ก่อน route ทั้งหมด) เพราะ Express รันตามลำดับที่ลงทะเบียน
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
};
api.use((req, res, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  next();
});

// เปิดให้หน้าเว็บ React คนละโดเมนเรียกได้ + กัน CSRF (WP1)
api.use(corsAndCsrf);

/* ---------- ประกอบเส้นทางทั้งหมด ลำดับตรงกับ server.js เดิมทุกประการ ---------- */
api.use(require('./routes/meta'));
api.use(require('./routes/auth'));
api.use(require('./routes/summary'));
api.use(require('./routes/tax'));
api.use(require('./routes/profile'));
api.use(require('./routes/integrations'));
api.use(require('./routes/totp'));
api.use(require('./routes/kyc'));
api.use(require('./routes/admin'));
api.use(require('./routes/pdpa'));
api.use(require('./routes/otp'));
api.use(require('./routes/contacts'));
api.use(require('./routes/doccreate'));
api.use(require('./routes/documents'));
api.use(require('./routes/docsign'));
api.use(require('./routes/pnd'));
api.use(require('./routes/requests'));
api.use(require('./routes/attachments'));
api.use(require('./routes/verify'));
api.use(require('./routes/exportdata'));
api.use(require('./routes/library'));
api.use(require('./routes/calendar'));
api.use(require('./routes/notifications'));

/* ---------- หน้าสถานะ (React) เมื่อเปิดพอร์ตนี้ตรง ๆ ----------
 * API ไม่มีหน้าเว็บของตัวเอง หน้าสถานะเป็น React ที่ build แยกไว้ที่ apps/web/dist-status
 * (`npm run build:status` หรือ build ใหม่อัตโนมัติขณะรัน `npm run dev:all`) เรียก /api/health มาแสดง
 * ถ้ายังไม่ได้ build ส่งต่อไปหน้า /status ของหน้าเว็บแทน · หน้าอื่นทั้งหมดของเว็บอยู่ที่ WEB_URL เท่านั้น
 */
const WEB_URL = ALLOWED_ORIGINS[0] || '';
const STATUS_DIR = path.resolve(__dirname, '..', 'web', 'dist-status');
const STATUS_INDEX = path.join(STATUS_DIR, 'index.html');
const wantsHtml = (req) => req.accepts(['json', 'html']) === 'html';

api.get(['/', '/status'], (req, res) => {
  if (fs.existsSync(STATUS_INDEX)) return res.sendFile(STATUS_INDEX, { headers: { 'Cache-Control': 'no-cache' } });
  if (!WEB_URL) return sendJson(res, 200, { name: 'TaxFlow API', status: 'ok' });
  res.redirect(302, `${WEB_URL}/status`);
});
// ไฟล์ของหน้าสถานะ (ชื่อไฟล์มีแฮชทุกครั้งที่ build จึงเก็บแคชได้นาน) และโลโก้
api.use('/assets', express.static(path.join(STATUS_DIR, 'assets'), { immutable: true, maxAge: '1y', fallthrough: true }));
api.use('/img', express.static(path.join(STATUS_DIR, 'img'), { maxAge: '1d', fallthrough: true }));

api.use((req, res) => {
  // เปิดหน้าของเว็บผิดพอร์ตจากเบราว์เซอร์ (เช่น localhost:4000/login) ส่งไปหน้าเดียวกันที่พอร์ตหน้าเว็บ
  if (WEB_URL && req.method === 'GET' && !req.path.startsWith('/api') && wantsHtml(req)) {
    return res.redirect(302, `${WEB_URL}${req.originalUrl}`);
  }
  sendJson(res, 404, { error: 'ไม่พบ endpoint นี้' });
});

// error-handling middleware ของ Express ต้องรับ 4 พารามิเตอร์ (err, req, res, next) เสมอ และต้องเป็น
// middleware ตัวสุดท้ายจริงๆ ดักทั้ง error จาก route handler (async throw/reject Express 5 จัดการ
// เด้งมาที่นี่ให้อัตโนมัติ ไม่ต้องห่อ try/catch เองแบบ router เดิม) และ error จาก express.json()
// เช่น ผู้เรียกส่ง body ที่ไม่ใช่ JSON ที่ถูกต้องมา
api.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return sendJson(res, 400, { error: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง (JSON)' });
  console.error('API error:', err);
  sendJson(res, err && err.statusCode ? err.statusCode : 500, { error: err && err.statusCode ? err.message : 'เกิดข้อผิดพลาดภายในระบบ' });
});

// แจ้งเตือนกำหนดยื่นภาษีล่วงหน้า เช็คตอนเริ่มระบบและทุก 12 ชั่วโมง แจ้งครั้งเดียวต่อรอบกำหนดยื่นหนึ่งๆ
// เท่านั้น (กันแจ้งซ้ำทุกครั้งที่เช็ค ด้วย dedupeKey = ประเภท+วันครบกำหนด ผูกไว้กับแจ้งเตือนที่เคยส่งแล้ว)
const TAX_REMINDER_WINDOW_DAYS = 7;
async function checkTaxReminders() {
  const today = bangkokDateStr();
  const users = await store.all('users', (u) => u.role !== 'admin' && !u.deleted);
  for (const user of users) {
    const deadlines = taxcalendar.upcomingDeadlines(user, today).filter((d) => d.daysLeft >= 0 && d.daysLeft <= TAX_REMINDER_WINDOW_DAYS);
    for (const d of deadlines) {
      const dedupeKey = `${d.key}-${d.dueDate}`;
      if (await store.findOne('notifications', (n) => n.userId === user.id && n.dedupeKey === dedupeKey)) continue;
      const when = d.daysLeft === 0 ? 'วันนี้' : d.daysLeft === 1 ? 'พรุ่งนี้' : `อีก ${d.daysLeft} วัน`;
      await notify(user.id, 'tax-deadline', `ใกล้ถึงกำหนด${d.label} ครบกำหนด ${d.dueDate} (${when})`, null, { dedupeKey });
    }
    // กิจกรรมปฏิทินที่ผู้ใช้ตั้งแจ้งเตือนล่วงหน้าไว้ (remindDays)
    for (const ev of await store.all('calendar_events', (e) => e.userId === user.id && !e.done && e.remindDays != null)) {
      const left = Math.round((Date.parse(ev.date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
      if (left < 0 || left > ev.remindDays) continue;
      const dedupeKey = `cal-${ev.id}-${ev.date}`;
      if (await store.findOne('notifications', (n) => n.userId === user.id && n.dedupeKey === dedupeKey)) continue;
      const when = left === 0 ? 'วันนี้' : left === 1 ? 'พรุ่งนี้' : `อีก ${left} วัน`;
      await notify(user.id, 'calendar', `กิจกรรมในปฏิทิน "${ev.title}" วันที่ ${ev.date} (${when})`, ev.linkDocId || null, { dedupeKey });
    }
  }
}


// เริ่มระบบ: ต้อง await งาน async ทั้งหมด (ต่อฐานข้อมูล/seed/ล้างข้อมูลหมดอายุ) ให้เสร็จก่อนเปิดรับ request จริง
async function main() {
  await store.ensureReady();
  // WP4: ตรวจว่าที่เก็บไฟล์พร้อมใช้งานตั้งแต่ตอนเริ่ม ล้มเร็วดีกว่าไปพังตอนผู้ใช้กดอัปโหลด
  await storage.ensureReady();
  const seeded = await seedUsers();
  // PDPA มาตรา 37(3): ลบข้อมูลที่พ้นระยะเวลาเก็บรักษาแล้ว ทำตอนเริ่มระบบและทุก 6 ชั่วโมง
  const purged = await pdpa.purgeExpired(store);
  setInterval(() => { pdpa.purgeExpired(store).catch((e) => console.error('purgeExpired error:', e)); }, 6 * 60 * 60 * 1000).unref();

  await checkTaxReminders().catch((e) => console.error('checkTaxReminders error:', e));
  setInterval(() => { checkTaxReminders().catch((e) => console.error('checkTaxReminders error:', e)); }, 12 * 60 * 60 * 1000).unref();

  api.listen(PORT, () => {
    console.log(`\n TaxFlow API running ➜ http://localhost:${PORT}`);
    console.log(store.DB_FILE
      ? ` ฐานข้อมูล (SQLite): ${path.relative(process.cwd(), store.DB_FILE)}`
      : ` ฐานข้อมูล (PostgreSQL): ${(process.env.DATABASE_URL || '').replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@')}`);
    const st = storage.info();
    console.log(st.driver === 's3'
      ? ` ที่เก็บไฟล์ (Supabase Storage): ${st.endpoint} · ถัง ${st.buckets.private} / ${st.buckets.public}`
      : ` ที่เก็บไฟล์ (ดิสก์ในเครื่อง): ${path.relative(process.cwd(), st.localDir)}`);
    // WP6: บอกสถานะลายมือชื่อดิจิทัลตั้งแต่ตอนเปิด ไม่งั้นต้องลงนามเอกสารแล้วตรวจไฟล์ถึงจะรู้ว่าไม่ได้เปิดไว้
    const signer = require('./lib/pdfsign').systemSigner();
    console.log(signer
      ? ` ลายมือชื่อดิจิทัล (PAdES): เปิด · ${signer.subject} · ใช้ได้ถึง ${signer.validTo.slice(0, 10)}`
      : ` ลายมือชื่อดิจิทัล (PAdES): ปิด · ${require('./lib/pdfsign').lastError()
        ? 'ดูสาเหตุที่บรรทัด [sign] ด้านบน'
        : 'ยังไม่ได้ตั้งค่า รัน npm run sign:setup แล้วใส่ SIGN_KEY_PASSPHRASE ใน .env'}`);
    console.log(` โดเมนหน้าเว็บที่อนุญาต (CORS): ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(` เข้าสู่ระบบด้วย Google: ${require('./lib/google').clientId() ? 'เปิด' : 'ปิด · ตั้ง GOOGLE_CLIENT_ID ใน .env เพื่อเปิด'}`);
    if (WEB_URL) console.log(` หน้าเว็บ (React): ${WEB_URL}`);
    console.log(` ล้างข้อมูลหมดอายุตามนโยบายเก็บรักษา: OTP ${purged.otpRemoved} รายการ, แจ้งเตือน ${purged.notifyRemoved} รายการ, บัญชีที่ไม่ยืนยันอีเมลเกิน 24 ชม. ${purged.unverifiedRemoved || 0} บัญชี`);
    if (seeded.length) {
      console.log(`\n สร้างบัญชีผู้ใช้ตัวอย่างให้แล้ว (เข้าสู่ระบบเพื่อทดลองได้ทันที):`);
      for (const u of seeded) console.log(` • ${u.email} (${u.role}) รหัสผ่าน: ${u.password}`);
    }
    console.log('');
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('เริ่มระบบไม่สำเร็จ:', err);
    process.exit(1);
  });
}

module.exports = { api, main, checkTaxReminders };
