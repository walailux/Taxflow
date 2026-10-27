'use strict';
/**
 * test/helpers/http.js เปิด API จริงบนพอร์ตสุ่มสำหรับ test/http-*.test.js
 * ----------------------------------------------------------------------------
 * แยกจากข้อมูลจริงทั้งหมด: ฐานข้อมูล SQLite + ที่เก็บไฟล์ในโฟลเดอร์ชั่วคราว ไม่ต่อ Supabase/S3/SMTP
 * (ตั้งค่าว่างไว้ก่อน scripts/_env อ่าน .env เพราะ _env ไม่ทับค่าที่มีอยู่แล้ว)
 * TAXFLOW_DEV=1 ให้ API ส่งรหัส OTP กลับมาใน response (devCode) แทนการส่งอีเมล
 * บัญชีทดลองสร้างจาก core/seed.js (creator / brand / agency / admin @taxflow.test)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taxflow-http-'));
Object.assign(process.env, {
  TAXFLOW_DATA_DIR: dataDir, DATABASE_URL: '', S3_ENDPOINT: '', SMTP_USER: '', SMTP_PASS: '',
  TAXFLOW_DEV: '1', NODE_ENV: 'test', GOOGLE_CLIENT_ID: '', SIGN_KEY_PASSPHRASE: '',
  WEB_ORIGINS: 'http://localhost:5173', AUTH_HEADER_MODE: '1',
});

const { api, checkTaxReminders } = require('../../server.js');
const store = require('../../core/store');
const storage = require('../../lib/storage');
const auth = require('../../lib/auth');
const { seedUsers } = require('../../core/seed');

const EMAILS = { creator: 'creator@taxflow.test', brand: 'brand@taxflow.test', agency: 'agency@taxflow.test', admin: 'admin@taxflow.test' };
// รูป PNG 1x1 และ PDF สั้นที่สุดที่ผ่านการตรวจ magic bytes
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PDF_B64 = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
const SIGNATURE = `data:image/png;base64,${PNG_B64}`;

let server;
let base = '';
const users = {};

/** เปิดเซิร์ฟเวอร์ (เรียกใน before) คืน { users } ที่มี id ของบัญชีทดลองแต่ละบทบาท */
async function start() {
  await store.ensureReady();
  await storage.ensureReady();
  await seedUsers();
  for (const [key, email] of Object.entries(EMAILS)) users[key] = await store.whereOne('users', { email });
  await checkTaxReminders();
  await new Promise((resolve) => { server = api.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  return { users };
}

async function stop() {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (store.close) await store.close();
  // Windows ล็อกไฟล์ฐานข้อมูลไว้จนกว่าโปรเซสจะจบ ลบไม่ได้ก็ปล่อยไว้ในโฟลเดอร์ชั่วคราวของระบบ
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** session token ล่าสุดของบัญชี (อ่าน tokenVersion ใหม่ทุกครั้ง ใช้ได้หลัง logout-all) */
async function tokenOf(key) {
  const u = await store.find('users', users[key].id);
  return auth.createToken({ uid: u.id, role: u.role, tv: u.tokenVersion || 0 });
}

/**
 * ยิงคำขอ: call('POST', '/api/x', { as: 'brand', body: {...} })
 * body เป็น object = JSON · string/Buffer = ส่งตามนั้น · ตอบกลับ { status, body, headers }
 * body ที่ตอบกลับเป็น JSON แปลงให้แล้ว นอกนั้นเป็น Buffer
 */
async function call(method, url, { as, body, headers = {}, token } = {}) {
  const h = { ...headers };
  const t = token || (as ? await tokenOf(as) : null);
  if (t) h.authorization = `Bearer ${t}`;
  let payload;
  if (body !== undefined) {
    if (typeof body === 'string' || Buffer.isBuffer(body)) payload = body;
    else { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
  }
  const res = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: data, headers: res.headers };
}

/** ขอรหัส OTP สำหรับลงนาม/เปลี่ยนบัญชีธนาคาร/ลบบัญชี แล้วคืน { otpId, code } */
async function otpFor(as, purpose, refId) {
  const r = await call('POST', '/api/otp/request', { as, body: { purpose, refId } });
  if (r.status !== 200) throw new Error(`ขอ OTP ไม่สำเร็จ ${r.status} ${JSON.stringify(r.body)}`);
  return { otpId: r.body.otpId, code: r.body.devCode };
}

module.exports = { start, stop, call, otpFor, tokenOf, users, store, PNG_B64, PDF_B64, SIGNATURE };
