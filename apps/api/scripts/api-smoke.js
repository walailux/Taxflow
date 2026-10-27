'use strict';
/**
 * scripts/api-smoke.js ยิงคำขอจริงเข้า API ครบทุกเส้นทาง (ต่อยอด WP1 · ส่วนหนึ่งของ WP8)
 * ==========================================================================
 *   npm run test:api
 *
 * ต่างจาก test/routes.test.js ที่ตรวจแค่ว่า "เส้นทางลงทะเบียนครบ"
 * สคริปต์นี้เปิดเซิร์ฟเวอร์จริงแล้วยิงคำขอ HTTP เข้าทุกเส้น ตามลำดับการใช้งานจริง
 * (สมัคร → เข้าสู่ระบบด้วย OTP → สร้างเอกสาร → ลงนาม → ส่งคู่ค้า → คู่ค้าลงนามตอบ ...)
 * แล้วเทียบรหัสสถานะกับที่ควรเป็น
 *
 * ความปลอดภัยของข้อมูลจริง
 *   ใช้ฐานข้อมูล SQLite และที่เก็บไฟล์ในโฟลเดอร์ชั่วคราว ลบทิ้งเมื่อจบ
 *   บังคับล้าง DATABASE_URL, S3_* และ SMTP_* ทุกครั้ง จึงไม่แตะ Supabase และไม่ส่งอีเมลจริงแม้ .env ตั้งไว้
 *
 * สิ่งที่รายงาน
 *   - ทุกเส้นใน test/routes.expected.json ต้องถูกยิงอย่างน้อยหนึ่งครั้ง (ขาดเส้นไหน = ไม่ผ่าน)
 *   - รหัสสถานะไม่ตรงที่คาด = ไม่ผ่าน
 *   - 500 ขึ้นไป = ไม่ผ่านเสมอ ไม่ว่าคาดไว้อย่างไร
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { findOpenssl } = require('../lib/opensslbin');
const totp = require('../lib/totp');

const API_DIR = path.join(__dirname, '..');
const ROUTES = require('../test/routes.expected.json');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'taxflow-smoke-'));
const ORIGIN = 'http://localhost:4000'; // อยู่ในรายชื่อ WEB_ORIGINS ค่าเริ่มต้น ผ่านการกัน CSRF

/* ------------------------------------------------------------ ไฟล์ทดสอบ */

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const PNG_URI = `data:image/png;base64,${PNG.toString('base64')}`;
const file = (buf, mime, filename) => ({ dataBase64: buf.toString('base64'), mime, filename });

/* -------------------------------------------------------------- ตัวช่วย */

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

let BASE;
const results = [];
const hitRoutes = new Set();

class Client {
  constructor(name) { this.name = name; this.cookie = ''; this.headers = {}; }

  async call(route, expect, method, url, body, opt = {}) {
    const headers = { Origin: ORIGIN, ...this.headers, ...(opt.headers || {}) };
    if (this.cookie) headers.Cookie = this.cookie;
    let payload;
    if (Buffer.isBuffer(body)) { payload = body; } else if (body !== undefined) {
      payload = JSON.stringify(body); headers['Content-Type'] = 'application/json';
    }
    let status = 0; let json = null; let buf = null; let ctype = '';
    try {
      const r = await fetch(BASE + url, { method, headers, body: payload });
      status = r.status;
      ctype = r.headers.get('content-type') || '';
      const sc = r.headers.get('set-cookie');
      if (sc && sc.includes('tf_session=')) this.cookie = /tf_session=[^;]*/.exec(sc)[0];
      buf = Buffer.from(await r.arrayBuffer());
      if (ctype.includes('json')) { try { json = JSON.parse(buf.toString('utf8')); } catch { /* ไม่ใช่ JSON */ } }
    } catch (err) {
      json = { error: err.message };
    }
    const exp = Array.isArray(expect) ? expect : [expect];
    const ok = exp.includes(status) && status < 500 && (!opt.check || opt.check({ status, json, buf, ctype }) === true);
    const why = !ok && opt.check && exp.includes(status) ? opt.check({ status, json, buf, ctype }) : '';
    results.push({ route, as: this.name, status, expect: exp.join('/'), ok, note: opt.note || '',
      detail: ok ? '' : (typeof why === 'string' && why) || (json && ([json.error, ...(json.errors || [])].filter(Boolean).join(' | ') || JSON.stringify(json).slice(0, 140))) || ctype });
    hitRoutes.add(route);
    return { status, json: json || {}, buf, ctype };
  }
}

/* ---------- จำลอง Google: เซ็น ID token ด้วยกุญแจที่สร้างเอง และเปิดเซิร์ฟเวอร์กุญแจปลอมให้ API ดึง ---------- */
const GOOGLE_CLIENT = 'smoke-client.apps.googleusercontent.com';
const GKEY = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function googleToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64url({ alg: 'RS256', kid: 'smoke', typ: 'JWT' })}.${b64url({
    iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT, email_verified: true, iat: now, exp: now + 600, ...claims,
  })}`;
  return `${head}.${crypto.sign('RSA-SHA256', Buffer.from(head), GKEY.privateKey).toString('base64url')}`;
}
function startGoogleCerts() {
  const jwks = JSON.stringify({ keys: [{ ...GKEY.publicKey.export({ format: 'jwk' }), kid: 'smoke', alg: 'RS256', use: 'sig' }] });
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' }); res.end(jwks); })
      .listen(0, () => resolve(s));
  });
}

/** เลขประจำตัวผู้เสียภาษีที่ผ่าน check digit จากเลข 12 หลักแรก */
function thaiId(first12) {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (13 - i), 0);
  return first12 + ((11 - (sum % 11)) % 10);
}

/** เข้าสู่ระบบด้วย OTP (โหมดพัฒนาแนบรหัสมาใน devCode) */
async function login(client, email, password = '123456') {
  const r = await client.call('POST /api/auth/login', 200, 'POST', '/api/auth/login', { email, password });
  const v = await client.call('POST /api/auth/login/verify-otp', 200, 'POST', '/api/auth/login/verify-otp',
    { otpId: r.json.otpId, code: r.json.devCode });
  return v.json.user;
}

/** ขอรหัส OTP สำหรับลงนาม คืน { otpId, code } */
async function otpFor(client, purpose, refId) {
  const r = await client.call('POST /api/otp/request', 200, 'POST', '/api/otp/request', { purpose, refId });
  return { otpId: r.json.otpId, code: r.json.devCode };
}

const BUYER = {
  entityType: 'juristic', name: 'บริษัท ผู้ซื้อทดสอบ จำกัด', taxId: '0105559876541', branch: 'สำนักงานใหญ่',
  address: '1 ถนนพระรามที่ 4 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500', contactPerson: 'คุณทดสอบ', email: 'buyer@test.local',
};

async function createQuotation(client, note) {
  const r = await client.call('POST /api/docs/create', 201, 'POST', '/api/docs/create', {
    type: 'QUOTATION', docPurpose: 'send', fields: { issueDate: '2026-09-21', validUntil: '2026-10-21' },
    party: BUYER, items: [{ name: 'ค่าบริการ', qty: 1, unit: 'งาน', price: 10000 }],
  }, { note });
  return r.json.id;
}

/* ============================================================== ลำดับทดสอบ */

async function run() {
  const pub = new Client('สาธารณะ');
  const agency = new Client('agency');
  const brand = new Client('brand');
  const creator = new Client('creator');
  const admin = new Client('admin');
  const fresh = new Client('สมัครใหม่');

  /* ---------- 1) เส้นทางสาธารณะ ---------- */
  await pub.call('GET /api', 200, 'GET', '/api');
  await pub.call('GET /api/health', 200, 'GET', '/api/health');
  await pub.call('POST /api/auth/google', 401, 'POST', '/api/auth/google', { credential: 'not-a-google-token' }, { note: 'token ปลอมต้องไม่ผ่าน' });
  await pub.call('GET /api/meta/profile-options', 200, 'GET', '/api/meta/profile-options');
  await pub.call('GET /api/etax/adjustment-reasons', 200, 'GET', '/api/etax/adjustment-reasons');
  await pub.call('POST /api/auth/check-available', 200, 'POST', '/api/auth/check-available', { email: 'agency@taxflow.test' },
    { check: ({ json }) => (json.email && json.email.taken === true ? true : 'อีเมลที่มีอยู่แล้วต้องตอบว่าถูกใช้แล้ว') });
  await pub.call('GET /api/auth/me', 401, 'GET', '/api/auth/me', undefined, { note: 'ยังไม่เข้าสู่ระบบ' });
  await pub.call('GET /api/documents', 401, 'GET', '/api/documents', undefined, { note: 'ยังไม่เข้าสู่ระบบต้องถูกปฏิเสธ' });
  await pub.call('POST /api/wht/calc', 200, 'POST', '/api/wht/calc', { amount: 10000, rate: 3 });
  await pub.call('POST /api/vat/calc', 200, 'POST', '/api/vat/calc', { amount: 10000 });
  await pub.call('POST /api/verify/pdf', 400, 'POST', '/api/verify/pdf', Buffer.from('not a pdf'), { headers: { 'Content-Type': 'application/pdf' }, note: 'ไม่ใช่ PDF' });
  await pub.call('POST /api/verify/pdf', 200, 'POST', '/api/verify/pdf', PDF, {
    headers: { 'Content-Type': 'application/pdf' }, note: 'PDF ไม่มีลายมือชื่อ',
    check: ({ json }) => (json.signed === false ? true : 'ต้องตอบว่าไม่มีลายมือชื่อ'),
  });
  await pub.call('GET /api/verify/:token', 404, 'GET', '/api/verify/ไม่มีจริง', undefined, { note: 'รหัสผิด' });
  await pub.call('POST /api/etax/invoice', 410, 'POST', '/api/etax/invoice', {}, { note: 'เส้นทางเดิมที่ปิดใน ver16' });
  await pub.call('POST /api/ewht/certificate', 410, 'POST', '/api/ewht/certificate', {}, { note: 'เส้นทางเดิมที่ปิดใน ver16' });

  /* ---------- 2) สมัครสมาชิก ---------- */
  const reg = await fresh.call('POST /api/auth/register', 201, 'POST', '/api/auth/register', {
    role: 'creator', email: 'newuser@test.local', password: 'abc12345', passwordConfirm: 'abc12345',
    displayName: 'นายทดสอบ สมัครใหม่', taxId: '1100701234561', consent: ['service', 'identity', 'kyc'],
  });
  await fresh.call('POST /api/auth/register/resend-otp', 429, 'POST', '/api/auth/register/resend-otp', { otpId: reg.json.otpId },
    { note: 'ขอใหม่ทันทีต้องติดช่วงรอ 45 วินาที' });
  await fresh.call('POST /api/auth/register/verify-otp', 400, 'POST', '/api/auth/register/verify-otp', { otpId: reg.json.otpId, code: '000000' }, { note: 'รหัสผิด' });
  // ขอรหัสใหม่แล้ว รหัสเดิมอาจใช้ไม่ได้ จึงใช้ otpId ล่าสุดที่ระบบให้มา
  await fresh.call('POST /api/auth/register/verify-otp', 200, 'POST', '/api/auth/register/verify-otp', { otpId: reg.json.otpId, code: reg.json.devCode });
  await pub.call('POST /api/auth/register', 409, 'POST', '/api/auth/register', {
    role: 'creator', email: 'newuser@test.local', password: 'abc12345', consent: ['service', 'identity'],
  }, { note: 'อีเมลซ้ำ' });

  /* ---------- 2.1) สมัคร / เข้าสู่ระบบด้วย Google ---------- */
  const G_EMAIL = 'google.user@test.local';
  const gNew = new Client('Google ใหม่');
  await pub.call('GET /api/auth/providers', 200, 'GET', '/api/auth/providers', undefined, {
    note: 'เปิดปุ่ม Google', check: ({ json }) => (json.google && json.google.clientId === GOOGLE_CLIENT ? true : 'ต้องส่ง Client ID ให้หน้าเว็บ'),
  });
  const g1 = await gNew.call('POST /api/auth/google', 200, 'POST', '/api/auth/google', { credential: googleToken({ sub: 'g-new', email: G_EMAIL, name: 'นายกูเกิล ทดสอบ' }) }, {
    note: 'ยังไม่มีบัญชี ต้องไปกรอกข้อมูลสมัคร',
    check: ({ json }) => (json.needsRegistration && json.signupToken && json.email === G_EMAIL ? true : 'ต้องตอบ needsRegistration พร้อม signupToken'),
  });
  await gNew.call('GET /api/auth/me', 401, 'GET', '/api/auth/me', undefined, { note: 'ยังไม่สมัคร ต้องไม่ได้ session' });
  await pub.call('GET /api/auth/me', 401, 'GET', '/api/auth/me', undefined, {
    headers: { Cookie: `tf_session=${g1.json.signupToken}` }, note: 'signupToken ใช้แทน session ไม่ได้',
  });
  const gReg = await gNew.call('POST /api/auth/register', 201, 'POST', '/api/auth/register', {
    googleSignupToken: g1.json.signupToken, email: 'someone.else@test.local',
    role: 'creator', displayName: 'นายกูเกิล ทดสอบ', taxId: thaiId('110070123459'), consent: ['service', 'identity'],
  }, { note: 'สมัครด้วย Google ไม่ต้องมีรหัสผ่าน · อีเมลในฟอร์มต้องถูกเมิน' });
  await gNew.call('POST /api/auth/register/verify-otp', 200, 'POST', '/api/auth/register/verify-otp', { otpId: gReg.json.otpId, code: gReg.json.devCode }, { note: 'ยืนยันอีเมล Google ด้วย OTP' });
  await gNew.call('GET /api/auth/me', 200, 'GET', '/api/auth/me', undefined, {
    note: 'บัญชี Google', check: ({ json }) => (json.user.email === G_EMAIL && json.user.hasPassword === false && json.user.googleSub === 'g-new' ? true : `ได้ ${JSON.stringify({ email: json.user.email, hasPassword: json.user.hasPassword })}`),
  });
  await pub.call('POST /api/auth/register', 409, 'POST', '/api/auth/register', {
    googleSignupToken: g1.json.signupToken, role: 'creator', displayName: 'ซ้ำ', taxId: thaiId('110070123460'), consent: ['service', 'identity'],
  }, { note: 'บัญชี Google เดิมสมัครซ้ำไม่ได้' });
  await pub.call('POST /api/auth/login', 401, 'POST', '/api/auth/login', { email: G_EMAIL, password: '' }, { note: 'บัญชี Google ไม่มีรหัสผ่านให้เข้า' });

  const gBack = new Client('Google กลับมา');
  const g2 = await gBack.call('POST /api/auth/google', 200, 'POST', '/api/auth/google', { credential: googleToken({ sub: 'g-new', email: G_EMAIL }) }, {
    note: 'เข้าสู่ระบบด้วย Google ต้องยืนยัน OTP ต่อ', check: ({ json }) => (json.otpRequired && json.otpId ? true : 'ต้องขอ OTP ก่อนออก session'),
  });
  await gBack.call('GET /api/auth/me', 401, 'GET', '/api/auth/me', undefined, { note: 'ยังไม่กรอก OTP ต้องไม่ได้ session' });
  await gBack.call('POST /api/auth/login/verify-otp', 200, 'POST', '/api/auth/login/verify-otp', { otpId: g2.json.otpId, code: g2.json.devCode }, { note: 'Google + OTP' });
  await gBack.call('GET /api/auth/me', 200, 'GET', '/api/auth/me', undefined, { note: 'หลัง Google + OTP' });

  const gLink = new Client('Google ผูกบัญชีเดิม');
  const g3 = await gLink.call('POST /api/auth/google', 200, 'POST', '/api/auth/google', { credential: googleToken({ sub: 'g-brand', email: 'brand@taxflow.test' }) }, {
    note: 'อีเมลตรงกับบัญชีรหัสผ่านเดิม ผูกให้อัตโนมัติ', check: ({ json }) => (json.otpRequired ? true : 'ต้องเข้าบัญชีเดิมแล้วขอ OTP'),
  });
  await gLink.call('POST /api/auth/login/verify-otp', 200, 'POST', '/api/auth/login/verify-otp', { otpId: g3.json.otpId, code: g3.json.devCode }, {
    note: 'เข้าบัญชี brand เดิม', check: ({ json }) => (json.user.email === 'brand@taxflow.test' && json.user.hasPassword === true ? true : 'ต้องเป็นบัญชี brand เดิม'),
  });
  await pub.call('POST /api/auth/google', 409, 'POST', '/api/auth/google', { credential: googleToken({ sub: 'g-intruder', email: 'brand@taxflow.test' }) }, { note: 'Google อีกบัญชีที่อีเมลเดียวกัน ผูกซ้ำไม่ได้' });
  await pub.call('POST /api/auth/google', 401, 'POST', '/api/auth/google', { credential: googleToken({ sub: 'g-unverified', email: 'x@test.local', email_verified: false }) }, { note: 'อีเมลยังไม่ยืนยันกับ Google' });
  await pub.call('POST /api/auth/google', 401, 'POST', '/api/auth/google', { credential: googleToken({ sub: 'g-new', email: G_EMAIL, aud: 'other-app' }) }, { note: 'token ของแอปอื่น' });

  /* ---------- 3) เข้าสู่ระบบทุกบทบาท ---------- */
  const r1 = await agency.call('POST /api/auth/login', 200, 'POST', '/api/auth/login', { email: 'agency@taxflow.test', password: '123456' });
  await agency.call('POST /api/auth/login/resend-otp', 429, 'POST', '/api/auth/login/resend-otp', { otpId: r1.json.otpId },
    { note: 'ขอใหม่ทันทีต้องติดช่วงรอ 45 วินาที' });
  // เก็บคำขอ OTP ค้างไว้ไปทดสอบ "ขอใหม่สำเร็จ" ตอนท้าย หลังพ้นช่วงรอแล้ว
  const late = { reg: new Client('สมัครรอบสอง'), login: new Client('agency รอบสอง') };
  late.regRes = await late.reg.call('POST /api/auth/register', 201, 'POST', '/api/auth/register', {
    role: 'creator', email: 'late@test.local', password: 'abc12345', displayName: 'นางทดสอบ รอรหัส',
    taxId: '1100701234579', consent: ['service', 'identity'],
  }, { note: 'บัญชีที่สองไว้ทดสอบขอรหัสใหม่' });
  late.loginRes = await late.login.call('POST /api/auth/login', 200, 'POST', '/api/auth/login', { email: 'agency@taxflow.test', password: '123456' });
  late.at = Date.now();
  await agency.call('POST /api/auth/login', 401, 'POST', '/api/auth/login', { email: 'agency@taxflow.test', password: 'ผิด' }, { note: 'รหัสผ่านผิด' });
  const agencyUser = await login(agency, 'agency@taxflow.test');
  await login(brand, 'brand@taxflow.test');
  const creatorUser = await login(creator, 'creator@taxflow.test');
  await login(admin, 'admin@taxflow.test');
  await agency.call('GET /api/auth/me', 200, 'GET', '/api/auth/me');

  /* ---------- 4) โปรไฟล์ โลโก้ ความยินยอม ---------- */
  await agency.call('PUT /api/auth/profile', 200, 'PUT', '/api/auth/profile', { phone: '0812345678' });
  await agency.call('POST /api/auth/brand-image', [200, 201], 'POST', '/api/auth/brand-image', { kind: 'logo', ...file(PNG, 'image/png', 'logo.png') });
  await agency.call('POST /api/auth/brand-image', 415, 'POST', '/api/auth/brand-image', { kind: 'logo', ...file(PDF, 'image/png', 'fake.png') }, { note: 'ไฟล์ปลอมนามสกุล' });
  await agency.call('GET /api/auth/brand-image/:kind', 200, 'GET', '/api/auth/brand-image/logo');
  await agency.call('PUT /api/pdpa/consent', 200, 'PUT', '/api/pdpa/consent', { consent: ['service', 'identity', 'kyc', 'notify'] });
  await agency.call('GET /api/pdpa/my-data', 200, 'GET', '/api/pdpa/my-data');

  /* ---------- 5) สมุดคู่ค้า ค้นหา ---------- */
  const c = await agency.call('POST /api/contacts', 201, 'POST', '/api/contacts', { ...BUYER, kind: 'brand' });
  await agency.call('POST /api/contacts', 400, 'POST', '/api/contacts', { name: 'x', taxId: '1234567890123' }, { note: 'เลขผู้เสียภาษีผิด check digit' });
  await agency.call('GET /api/contacts', 200, 'GET', '/api/contacts');
  await agency.call('GET /api/contacts/check-duplicate', 200, 'GET', `/api/contacts/check-duplicate?taxId=${BUYER.taxId}`);
  await agency.call('PUT /api/contacts/:id', 200, 'PUT', `/api/contacts/${c.json.id}`, { ...BUYER, kind: 'brand', note: 'แก้ไข' });
  await agency.call('POST /api/contacts/import', 200, 'POST', '/api/contacts/import', { csv: 'ชื่อ,เลขประจำตัวผู้เสียภาษี\nบริษัท นำเข้า จำกัด,0105561234567\n' });
  await agency.call('GET /api/contacts/export.csv', 200, 'GET', '/api/contacts/export.csv');
  await agency.call('GET /api/search', 200, 'GET', '/api/search?q=ผู้ซื้อ');

  /* ---------- 5.5) สิทธิ์ออกเอกสาร e-Tax: ยังไม่มีสิทธิ์ออกไม่ได้ → แนบหลักฐาน → ยื่นขอ → แอดมินตรวจครบทุกข้อแล้วอนุมัติ ---------- */
  const ETAX_BODY = {
    type: 'ETAX_INVOICE', docPurpose: 'self', fields: { issueDate: '2026-09-21' }, party: BUYER,
    items: [{ name: 'ค่าผลิตคอนเทนต์', qty: 2, unit: 'ชิ้น', price: 25000 }],
  };
  await agency.call('POST /api/docs/create', 403, 'POST', '/api/docs/create', ETAX_BODY, { note: 'ยังไม่ได้รับสิทธิ์ e-Tax ออกใบกำกับภาษีอิเล็กทรอนิกส์ไม่ได้' });
  const ETAX_REQ = { method: 'own_cert', approvalRef: 'กอ.01-0105561234567-001', approvalDate: '2026-01-05', declare: true };
  await agency.call('GET /api/etax/permission', 200, 'GET', '/api/etax/permission?method=own_cert');
  await agency.call('POST /api/etax/permission', 400, 'POST', '/api/etax/permission', ETAX_REQ, { note: 'ยังไม่แนบหลักฐานจากกรมสรรพากร' });
  await agency.call('POST /api/kyc', 201, 'POST', '/api/kyc', { docType: 'vat_pp20', ...file(PDF, 'application/pdf', 'pp20.pdf') }, { note: 'ภ.พ.20' });
  await agency.call('POST /api/kyc', 201, 'POST', '/api/kyc', { docType: 'etax_approval', ...file(PDF, 'application/pdf', 'ka01.pdf') }, { note: 'หลักฐานอนุมัติ ก.อ.01' });
  await agency.call('POST /api/etax/permission', 400, 'POST', '/api/etax/permission', { ...ETAX_REQ, declare: false }, { note: 'ไม่ได้รับรองความถูกต้อง' });
  await agency.call('POST /api/etax/permission', 200, 'POST', '/api/etax/permission', ETAX_REQ, { note: 'ยื่นขอสิทธิ์ e-Tax' });
  await agency.call('POST /api/admin/users/:id/etax', 403, 'POST', `/api/admin/users/${agencyUser.id}/etax`, { approve: true }, { note: 'ไม่ใช่ผู้ดูแลระบบ' });
  await admin.call('POST /api/admin/users/:id/etax', 400, 'POST', `/api/admin/users/${agencyUser.id}/etax`, { approve: true, checks: { vat: true } }, { note: 'ยังตรวจไม่ครบทุกข้อ' });
  await admin.call('POST /api/admin/users/:id/etax', 200, 'POST', `/api/admin/users/${agencyUser.id}/etax`, { approve: true, checks: { vat: true, approval: true } }, { note: 'อนุมัติสิทธิ์ e-Tax' });

  /* ---------- 6) เอกสาร ---------- */
  const et = await agency.call('POST /api/docs/create', 201, 'POST', '/api/docs/create', ETAX_BODY, { note: 'ใบกำกับภาษีอิเล็กทรอนิกส์ (หลังได้สิทธิ์)' });
  const etId = et.json.id;
  await agency.call('POST /api/docs/create', 400, 'POST', '/api/docs/create', { type: 'QUOTATION', party: {}, items: [] }, { note: 'ข้อมูลไม่ครบ' });
  await creator.call('POST /api/docs/create', [400, 403], 'POST', '/api/docs/create', {
    type: 'ETAX_INVOICE', fields: { issueDate: '2026-09-21' }, party: BUYER, items: [{ name: 'x', qty: 1, price: 1 }],
  }, {
    note: 'ครีเอเตอร์ไม่ได้จด VAT ต้องออกใบกำกับภาษีไม่ได้',
    check: ({ json }) => ((json.errors || [json.error]).join(' ').includes('มาตรา 86') ? true : 'ต้องบอกเหตุผลเรื่องการจด VAT'),
  });

  await agency.call('GET /api/documents', 200, 'GET', '/api/documents');
  await agency.call('GET /api/documents/:id', 200, 'GET', `/api/documents/${etId}`);
  await brand.call('GET /api/documents/:id', 404, 'GET', `/api/documents/${etId}`, undefined, { note: 'บัญชีอื่นต้องมองไม่เห็นเอกสาร' });
  await agency.call('PUT /api/documents/:id', 200, 'PUT', `/api/documents/${etId}`, {
    type: 'ETAX_INVOICE', fields: { issueDate: '2026-09-21', note: 'แก้ไขครั้งที่ 1' }, party: BUYER,
    items: [{ name: 'ค่าผลิตคอนเทนต์', qty: 2, unit: 'ชิ้น', price: 25000 }],
  });
  await agency.call('GET /api/documents/:id/versions', 200, 'GET', `/api/documents/${etId}/versions`);
  await agency.call('POST /api/documents/:id/status', 200, 'POST', `/api/documents/${etId}/status`, { status: 'approved' });
  await agency.call('POST /api/documents/:id/status', 400, 'POST', `/api/documents/${etId}/status`, { status: 'draft' }, { note: 'ย้อนสถานะไม่ได้' });
  await agency.call('PUT /api/documents/:id', 400, 'PUT', `/api/documents/${etId}`, { fields: {} }, { note: 'เอกสารอนุมัติแล้วแก้ไม่ได้' });

  // PDF / XML / QR / แชร์
  await agency.call('GET /api/documents/:id/pdf', 200, 'GET', `/api/documents/${etId}/pdf`, undefined, {
    check: ({ ctype, buf }) => (ctype.includes('application/pdf') && buf.subarray(0, 5).toString() === '%PDF-' ? true : `ได้ ${ctype} ไม่ใช่ไฟล์ PDF`),
  });
  await agency.call('GET /api/documents/:id/xml', 200, 'GET', `/api/documents/${etId}/xml`, undefined, {
    check: ({ buf }) => (buf.toString('utf8').includes('0105559876541') ? true : 'XML ไม่มีเลขผู้ซื้อ'),
  });
  await agency.call('GET /api/documents/:id/qr.svg', 200, 'GET', `/api/documents/${etId}/qr.svg`);
  const share = await agency.call('POST /api/documents/:id/share', 200, 'POST', `/api/documents/${etId}/share`);
  late.signDoc = await createQuotation(agency, 'ไว้ลงนามด้วยรหัสที่ขอใหม่');
  late.signOtp = await otpFor(agency, 'sign-doc', late.signDoc);
  late.at = Date.now(); // ช่วงรอนับจากรหัสที่ขอล่าสุด

  // ลงนามด้วย OTP แล้วไฟล์ต้องมีลายมือชื่อดิจิทัล
  const o = await otpFor(agency, 'sign-doc', etId);
  await agency.call('POST /api/otp/resend', 429, 'POST', '/api/otp/resend', { otpId: o.otpId }, { note: 'ขอใหม่ทันทีต้องติดช่วงรอ' });
  await agency.call('POST /api/documents/:id/sign', 400, 'POST', `/api/documents/${etId}/sign`, { otpId: o.otpId, code: '000000' }, { note: 'OTP ผิด' });
  await agency.call('POST /api/documents/:id/sign', 200, 'POST', `/api/documents/${etId}/sign`, { otpId: o.otpId, code: o.code, image: PNG_URI });
  const signedPdf = await agency.call('GET /api/documents/:id/pdf', 200, 'GET', `/api/documents/${etId}/pdf`, undefined, { note: 'หลังลงนาม' });
  await pub.call('POST /api/verify/pdf', 200, 'POST', '/api/verify/pdf', signedPdf.buf, {
    headers: { 'Content-Type': 'application/pdf' }, note: 'ไฟล์ที่ลงนามแล้ว',
    check: ({ json }) => (!SIGNING ? true : json.valid === true ? true : `ต้องผ่าน: ${(json.problems || []).join(', ')}`),
  });
  const tampered = Buffer.from(signedPdf.buf); tampered[1000] ^= 1;
  await pub.call('POST /api/verify/pdf', 200, 'POST', '/api/verify/pdf', tampered, {
    headers: { 'Content-Type': 'application/pdf' }, note: 'ไฟล์ที่แก้ 1 ไบต์',
    check: ({ json }) => (!SIGNING ? true : json.intact === false ? true : 'แก้ไฟล์แล้วยังตรวจผ่าน'),
  });
  await pub.call('GET /api/verify/:token', 200, 'GET', `/api/verify/${share.json.token}`, undefined, {
    check: ({ json }) => (json.tampered === false && (!SIGNING || (json.digitalSignature && json.digitalSignature.valid)) ? true : 'หน้าตรวจสอบรายงานผิด'),
  });

  // ไฟล์แนบเอกสาร
  const att = await agency.call('POST /api/documents/:id/attachments', 201, 'POST', `/api/documents/${etId}/attachments`,
    { kind: 'receipt', ...file(PDF, 'application/pdf', 'slip.pdf') });
  await agency.call('GET /api/attachments/:id', 200, 'GET', `/api/attachments/${att.json.id}`);
  await brand.call('GET /api/attachments/:id', 404, 'GET', `/api/attachments/${att.json.id}`, undefined, { note: 'บัญชีอื่นเปิดไฟล์แนบไม่ได้' });
  await agency.call('DELETE /api/attachments/:id', 200, 'DELETE', `/api/attachments/${att.json.id}`);

  // คัดลอก / ลบแบบร่าง / ส่งออก
  const dup = await agency.call('POST /api/documents/:id/duplicate', 201, 'POST', `/api/documents/${etId}/duplicate`);
  await agency.call('DELETE /api/documents/:id', 200, 'DELETE', `/api/documents/${dup.json.id}`, undefined, { note: 'ลบแบบร่าง' });
  await agency.call('DELETE /api/documents/:id', 400, 'DELETE', `/api/documents/${etId}`, undefined, { note: 'เอกสารที่ออกแล้วลบไม่ได้' });
  await agency.call('GET /api/documents/export-zip', 200, 'GET', `/api/documents/export-zip?ids=${etId}`);
  await agency.call('GET /api/export/csv', 200, 'GET', '/api/export/csv');
  await agency.call('GET /api/export/xls', 200, 'GET', '/api/export/xls');
  await agency.call('GET /api/audit', 200, 'GET', '/api/audit');
  // ใบลดหนี้/เพิ่มหนี้ใช้กับใบกำกับภาษีรุ่นเดิม (ETAX) เท่านั้น เอกสาร ETAX_INVOICE ต้องตอบว่าไม่พบ
  await agency.call('POST /api/etax/credit-note', 404, 'POST', '/api/etax/credit-note', { refDocId: etId, reason: 'ลดราคาสินค้า/บริการ', amount: 100 },
    { note: 'รองรับเฉพาะ ETAX รุ่นเดิม (ดูข้อสังเกตในรายงาน)' });
  await agency.call('POST /api/etax/debit-note', 404, 'POST', '/api/etax/debit-note', { refDocId: etId, reason: 'อื่น ๆ', amount: 100 },
    { note: 'รองรับเฉพาะ ETAX รุ่นเดิม' });

  /* ---------- 7) ส่งเอกสารข้ามบัญชี ---------- */
  await agency.call('GET /api/signatures', 200, 'GET', '/api/signatures');
  const sg = await agency.call('POST /api/signatures', 201, 'POST', '/api/signatures', { name: 'ลายเซ็นหลัก', image: PNG_URI });
  await agency.call('DELETE /api/signatures/:id', 200, 'DELETE', `/api/signatures/${sg.json.id}`);

  // (ก) ขอตรวจสอบ → คู่ค้าอนุมัติ
  const qa = await createQuotation(agency, 'สำหรับอนุมัติ');
  const reqA = await agency.call('POST /api/documents/:id/request', 201, 'POST', `/api/documents/${qa}/request`,
    { toEmail: 'brand@taxflow.test', purpose: 'review', dueDate: '2026-10-01' });
  await agency.call('POST /api/documents/:id/request', 400, 'POST', `/api/documents/${qa}/request`,
    { toEmail: 'brand@taxflow.test', purpose: 'sign' }, { note: 'ผู้ออกต้องลงนามก่อนขอลายเซ็น' });
  await agency.call('GET /api/documents/:id/requests', 200, 'GET', `/api/documents/${qa}/requests`);
  // ขอลายเซ็นไม่ผ่านด้านบน คำขอเดิมจึงยังอยู่ ให้ดึงรายการล่าสุดอีกรอบ
  const listA = await agency.call('GET /api/documents/:id/requests', 200, 'GET', `/api/documents/${qa}/requests`);
  const reqAId = (listA.json.items || []).find((x) => x.status === 'sent')?.id || reqA.json.id;
  await brand.call('GET /api/requests/inbox', 200, 'GET', '/api/requests/inbox');
  await agency.call('GET /api/requests/outbox', 200, 'GET', '/api/requests/outbox', undefined, {
    check: ({ json }) => (Array.isArray(json.items) && json.items.every((x) => x.doc && x.doc.summary) ? true : 'รายการส่งออกต้องมีสรุปข้อมูลเอกสาร'),
  });
  await brand.call('GET /api/requests/:id/pdf', 200, 'GET', `/api/requests/${reqAId}/pdf`, undefined, {
    check: ({ ctype }) => (ctype.includes('pdf') ? true : `ได้ ${ctype}`),
  });
  await creator.call('GET /api/requests/:id/pdf', 404, 'GET', `/api/requests/${reqAId}/pdf`, undefined, { note: 'ไม่ใช่ผู้รับ/ผู้ส่ง' });
  await brand.call('POST /api/requests/:id/approve', 200, 'POST', `/api/requests/${reqAId}/approve`, {});

  // (ข) ขอตรวจสอบ → คู่ค้าตีกลับ
  const qb = await createQuotation(agency, 'สำหรับตีกลับ');
  const reqB = await agency.call('POST /api/documents/:id/request', 201, 'POST', `/api/documents/${qb}/request`, { toEmail: 'brand@taxflow.test', purpose: 'review' });
  await brand.call('POST /api/requests/:id/decline', 200, 'POST', `/api/requests/${reqB.json.id}/decline`, { reason: 'ยอดเงินไม่ตรงกับที่ตกลง' });
  await brand.call('POST /api/requests/:id/decline', 400, 'POST', `/api/requests/${reqB.json.id}/decline`, {}, { note: 'ตอบคำขอเดิมซ้ำไม่ได้' });
  await brand.call('POST /api/requests/:id/library', 201, 'POST', `/api/requests/${reqB.json.id}/library`, {}, { note: 'เก็บเอกสารที่ได้รับเข้าคลัง' });
  await brand.call('POST /api/requests/:id/library', 200, 'POST', `/api/requests/${reqB.json.id}/library`, {}, {
    note: 'กดซ้ำไม่เก็บซ้ำ', check: ({ json }) => (json.already === true ? true : 'ต้องบอกว่าเก็บไว้แล้ว'),
  });
  await agency.call('POST /api/requests/:id/library', 404, 'POST', `/api/requests/${reqB.json.id}/library`, {}, { note: 'ผู้ส่งเก็บคำขอของผู้รับไม่ได้' });
  // ตีกลับต้องระบุเหตุผลเสมอ (ผู้ส่งต้องรู้ว่าต้องแก้อะไร และเป็นร่องรอยตรวจสอบย้อนหลัง)
  const qb2 = await createQuotation(agency, 'ตีกลับโดยไม่ระบุเหตุผล');
  const reqB2 = await agency.call('POST /api/documents/:id/request', 201, 'POST', `/api/documents/${qb2}/request`, { toEmail: 'brand@taxflow.test', purpose: 'review' });
  await brand.call('POST /api/requests/:id/decline', 400, 'POST', `/api/requests/${reqB2.json.id}/decline`, { reason: '   ' }, { note: 'ไม่ระบุเหตุผล ต้องถูกปฏิเสธ' });
  await brand.call('POST /api/requests/:id/decline', 200, 'POST', `/api/requests/${reqB2.json.id}/decline`, { reason: 'ข้อมูลผู้ซื้อไม่ครบ' });

  // (ค) ผู้ส่งยกเลิกคำขอ
  const qc = await createQuotation(agency, 'สำหรับยกเลิก');
  const reqC = await agency.call('POST /api/documents/:id/request', 201, 'POST', `/api/documents/${qc}/request`, { toEmail: 'brand@taxflow.test', purpose: 'review' });
  await brand.call('POST /api/requests/:id/cancel', 404, 'POST', `/api/requests/${reqC.json.id}/cancel`, {}, { note: 'ผู้รับยกเลิกแทนผู้ส่งไม่ได้' });
  await agency.call('POST /api/requests/:id/cancel', 200, 'POST', `/api/requests/${reqC.json.id}/cancel`, {});

  // (ง) ขอลายเซ็น → คู่ค้าลงนามตอบด้วย OTP
  const qd = await createQuotation(agency, 'สำหรับขอลายเซ็น');
  const od = await otpFor(agency, 'sign-doc', qd);
  await agency.call('POST /api/documents/:id/sign', 200, 'POST', `/api/documents/${qd}/sign`, { otpId: od.otpId, code: od.code, image: PNG_URI });
  const reqD = await agency.call('POST /api/documents/:id/request', 201, 'POST', `/api/documents/${qd}/request`, { toEmail: 'brand@taxflow.test', purpose: 'sign' });
  const ob = await otpFor(brand, 'sign-request', reqD.json.id);
  await brand.call('POST /api/requests/:id/sign', 200, 'POST', `/api/requests/${reqD.json.id}/sign`, { otpId: ob.otpId, code: ob.code, image: PNG_URI });
  await brand.call('POST /api/requests/:id/sign', 400, 'POST', `/api/requests/${reqD.json.id}/sign`, { otpId: ob.otpId, code: ob.code }, { note: 'ลงนามซ้ำไม่ได้' });

  /* ---------- 8) ภาษี ภ.ง.ด. ปฏิทินภาษี แดชบอร์ด ---------- */
  await creator.call('POST /api/pit/estimate', 200, 'POST', '/api/pit/estimate', { income: 600000, incomeType: '40(8)' });
  await creator.call('POST /api/wht/store', 201, 'POST', '/api/wht/store', { payer: 'บริษัท ทดสอบ จำกัด', amount: 10000, rate: 3, description: 'ค่าจ้าง' },
    { note: 'ครีเอเตอร์บันทึก 50 ทวิ ที่ได้รับ' });
  await agency.call('GET /api/pnd/candidates', 200, 'GET', '/api/pnd/candidates?form=PND53&month=9&yearBE=2569');
  await agency.call('GET /api/tax-calendar', 200, 'GET', '/api/tax-calendar');
  await agency.call('GET /api/agency/summary', 200, 'GET', '/api/agency/summary');
  await creator.call('GET /api/creator/summary', 200, 'GET', '/api/creator/summary');
  await agency.call('GET /api/dashboard/trend', 200, 'GET', '/api/dashboard/trend');

  /* ---------- 9) ปฏิทินงาน ---------- */
  const meta = await agency.call('GET /api/calendar/meta', 200, 'GET', '/api/calendar/meta');
  const cat = (meta.json.categories || [])[0] || {};
  const mk = (meta.json.markers || [])[0] || {};
  const pr = (meta.json.priorities || []).find((p) => !/critical|urgent|สำคัญมาก/i.test(`${p.id}${p.label}`)) || (meta.json.priorities || [])[0] || {};
  const ev = await agency.call('POST /api/calendar', 201, 'POST', '/api/calendar', {
    title: 'ประชุมลูกค้า', category: cat.id || cat.key, date: '2026-10-01', priority: pr.id || pr.key, marker: mk.id || mk.key,
  });
  await agency.call('GET /api/calendar', 200, 'GET', '/api/calendar?from=2026-09-01&to=2026-12-31');
  await agency.call('PUT /api/calendar/:id', 200, 'PUT', `/api/calendar/${ev.json.id}`, {
    title: 'ประชุมลูกค้า (เลื่อน)', category: cat.id || cat.key, date: '2026-10-02', priority: pr.id || pr.key, marker: mk.id || mk.key,
  });
  const cf = await agency.call('POST /api/calendar/files', 201, 'POST', '/api/calendar/files', { eventId: ev.json.id, ...file(PDF, 'application/pdf', 'agenda.pdf') });
  const fileId = cf.json.id || (cf.json.file && cf.json.file.id) || ((cf.json.attachments || [])[0] || {}).id;
  await agency.call('GET /api/calendar/file', 200, 'GET', `/api/calendar/file?eventId=${ev.json.id}&fileId=${fileId}`);
  await agency.call('POST /api/calendar/files/delete', 200, 'POST', '/api/calendar/files/delete', { eventId: ev.json.id, fileId });
  await agency.call('POST /api/calendar/overrides', 200, 'POST', '/api/calendar/overrides', { sysKey: 'sys:tax:PND53:2026-10', done: true, marker: mk.id || mk.key });
  await agency.call('DELETE /api/calendar/:id', 200, 'DELETE', `/api/calendar/${ev.json.id}`);

  /* ---------- 10) คลังเอกสาร KYC ผู้ดูแลระบบ ---------- */
  const lib = await agency.call('POST /api/library', 201, 'POST', '/api/library', { title: 'ภ.พ.20', category: 'pp20', year: 2569, ...file(PDF, 'application/pdf', 'pp20.pdf') });
  await agency.call('GET /api/library', 200, 'GET', '/api/library');
  await agency.call('GET /api/library/:id/file', 200, 'GET', `/api/library/${lib.json.id}/file`);
  await agency.call('DELETE /api/library/:id', 200, 'DELETE', `/api/library/${lib.json.id}`);

  // ส่งตรวจ KYC ได้เมื่อโปรไฟล์ครบตามมาตรา 86/4 ก่อน จึงกรอกที่อยู่ให้ผู้ใช้ใหม่
  await fresh.call('PUT /api/auth/profile', 200, 'PUT', '/api/auth/profile', {
    addr: { no: '55', street: 'ถนนสาทร', subdistrict: 'ยานนาวา', district: 'สาทร', province: 'กรุงเทพมหานคร', postcode: '10120' },
    phone: '0812345678',
  }, { note: 'กรอกที่อยู่ให้ครบก่อนส่งตรวจ' });
  const k = await fresh.call('POST /api/kyc', 201, 'POST', '/api/kyc', { docType: 'bank_book', ...file(PDF, 'application/pdf', 'bank.pdf') });
  await fresh.call('GET /api/kyc', 200, 'GET', '/api/kyc');
  await fresh.call('GET /api/kyc/:id/file', 200, 'GET', `/api/kyc/${k.json.id}/file`);
  await fresh.call('POST /api/kyc/submit', 200, 'POST', '/api/kyc/submit', {});
  await agency.call('GET /api/admin/users', 403, 'GET', '/api/admin/users', undefined, { note: 'ไม่ใช่ผู้ดูแลระบบ' });
  const users = await admin.call('GET /api/admin/users', 200, 'GET', '/api/admin/users?status=pending');
  const pending = (users.json.items || users.json.users || []).find((u) => u.email === 'newuser@test.local');
  await admin.call('GET /api/admin/users/:id', 200, 'GET', `/api/admin/users/${pending ? pending.id : 0}`);
  await admin.call('POST /api/admin/users/:id/verify', 200, 'POST', `/api/admin/users/${pending ? pending.id : 0}/verify`, { approve: true, note: 'ผ่าน' });
  await fresh.call('DELETE /api/kyc/:id', 200, 'DELETE', `/api/kyc/${k.json.id}`);

  /* ---------- 11) แจ้งเตือน ---------- */
  const nt = await brand.call('GET /api/notifications', 200, 'GET', '/api/notifications');
  const firstN = (nt.json.items || [])[0];
  await brand.call('POST /api/notifications/:id/read', 200, 'POST', `/api/notifications/${firstN ? firstN.id : 0}/read`);
  await brand.call('POST /api/notifications/read-all', 200, 'POST', '/api/notifications/read-all');

  /* ---------- 12) เชื่อมระบบภายนอก ---------- */
  await agency.call('GET /api/integrations', 200, 'GET', '/api/integrations');
  const key = await agency.call('POST /api/integrations/api-key', 201, 'POST', '/api/integrations/api-key');
  const ext = new Client('API key');
  await ext.call('GET /api/v1/documents', 401, 'GET', '/api/v1/documents', undefined, { note: 'ไม่มี API key' });
  ext.headers['X-Api-Key'] = key.json.key;
  await ext.call('GET /api/v1/documents', 200, 'GET', '/api/v1/documents');
  await ext.call('GET /api/v1/documents/:id', 200, 'GET', `/api/v1/documents/${etId}`);
  await ext.call('GET /api/v1/contacts', 200, 'GET', '/api/v1/contacts');
  await agency.call('PUT /api/integrations/webhook', 200, 'PUT', '/api/integrations/webhook', { url: `${BASE}/api/health`, enabled: true });
  await agency.call('POST /api/integrations/webhook/test', 200, 'POST', '/api/integrations/webhook/test', {}, { note: 'ยิงเข้าเซิร์ฟเวอร์ตัวเอง' });
  await agency.call('DELETE /api/integrations/webhook', 200, 'DELETE', '/api/integrations/webhook');
  await agency.call('DELETE /api/integrations/api-key', 200, 'DELETE', '/api/integrations/api-key');
  await ext.call('GET /api/v1/contacts', 401, 'GET', '/api/v1/contacts', undefined, { note: 'หลังเพิกถอน key' });

  /* ---------- 13) ยืนยันตัวตนสองชั้นด้วยแอป (TOTP) ---------- */
  const ts = await creator.call('POST /api/totp/setup', 200, 'POST', '/api/totp/setup', {});
  await creator.call('POST /api/totp/confirm', 400, 'POST', '/api/totp/confirm', { code: '000000' }, { note: 'รหัสผิด' });
  await creator.call('POST /api/totp/confirm', 200, 'POST', '/api/totp/confirm', { code: totp.totpCode(ts.json.secret) });
  const tl = new Client('creator TOTP');
  const lr = await tl.call('POST /api/auth/login', 200, 'POST', '/api/auth/login', { email: 'creator@taxflow.test', password: '123456' });
  await tl.call('POST /api/auth/login/totp', 200, 'POST', '/api/auth/login/totp', {
    otpId: lr.json.otpId, loginToken: lr.json.loginToken, totpToken: lr.json.totpToken, code: totp.totpCode(ts.json.secret),
  }, { note: 'เข้าสู่ระบบด้วยรหัสจากแอป' });
  await creator.call('POST /api/totp/disable', 200, 'POST', '/api/totp/disable', { code: totp.totpCode(ts.json.secret) });

  /* ---------- 14) ออกจากระบบ ลบโลโก้ ลบคู่ค้า ลบบัญชี ---------- */
  await agency.call('DELETE /api/auth/brand-image/:kind', 200, 'DELETE', '/api/auth/brand-image/logo');
  await agency.call('DELETE /api/contacts/:id', 200, 'DELETE', `/api/contacts/${c.json.id}`);
  await brand.call('POST /api/auth/logout', 200, 'POST', '/api/auth/logout');
  await brand.call('GET /api/auth/me', 401, 'GET', '/api/auth/me', undefined, { note: 'หลังออกจากระบบ' });
  await creator.call('POST /api/auth/logout-all', 200, 'POST', '/api/auth/logout-all');
  await creator.call('GET /api/auth/me', 401, 'GET', '/api/auth/me', undefined, { note: 'หลังออกจากทุกอุปกรณ์' });
  await fresh.call('POST /api/pdpa/delete-account', 401, 'POST', '/api/pdpa/delete-account', { password: 'ผิด', confirm: 'ลบบัญชีของฉัน' }, { note: 'รหัสผ่านผิด' });
  await fresh.call('POST /api/pdpa/delete-account', 400, 'POST', '/api/pdpa/delete-account', { password: 'abc12345', confirm: 'ลบ' }, { note: 'พิมพ์ข้อความยืนยันไม่ตรง' });
  await fresh.call('POST /api/pdpa/delete-account', 200, 'POST', '/api/pdpa/delete-account', { password: 'abc12345', confirm: 'ลบบัญชีของฉัน' }, { note: 'สิทธิขอลบตาม PDPA มาตรา 33' });
  await fresh.call('GET /api/auth/me', 401, 'GET', '/api/auth/me', undefined, { note: 'หลังลบบัญชี session เดิมต้องใช้ไม่ได้' });
  await pub.call('POST /api/auth/login', 401, 'POST', '/api/auth/login', { email: 'newuser@test.local', password: 'abc12345' }, { note: 'หลังลบบัญชีเข้าสู่ระบบไม่ได้' });

  // บัญชี Google ไม่มีรหัสผ่าน ลบบัญชีด้วย OTP ทางอีเมลแทน
  await gBack.call('POST /api/pdpa/delete-account', 401, 'POST', '/api/pdpa/delete-account', { confirm: 'ลบบัญชีของฉัน' }, { note: 'บัญชี Google ไม่มี OTP' });
  const gDel = await gBack.call('POST /api/otp/request', 200, 'POST', '/api/otp/request', { purpose: 'delete-account' }, { note: 'ขอ OTP ลบบัญชี' });
  await gBack.call('POST /api/pdpa/delete-account', 400, 'POST', '/api/pdpa/delete-account', { otpId: gDel.json.otpId, code: gDel.json.devCode, confirm: 'ลบ' }, { note: 'บัญชี Google พิมพ์ข้อความยืนยันไม่ตรง' });
  await gBack.call('POST /api/pdpa/delete-account', 200, 'POST', '/api/pdpa/delete-account', { otpId: gDel.json.otpId, code: gDel.json.devCode, confirm: 'ลบบัญชีของฉัน' }, { note: 'บัญชี Google ลบด้วย OTP' });
  await gNew.call('GET /api/auth/me', 401, 'GET', '/api/auth/me', undefined, { note: 'หลังลบบัญชี Google session อื่นต้องใช้ไม่ได้' });
  await pub.call('POST /api/auth/google', 200, 'POST', '/api/auth/google', { credential: googleToken({ sub: 'g-new', email: G_EMAIL }) }, {
    note: 'หลังลบบัญชี สมัครใหม่ด้วย Google เดิมได้', check: ({ json }) => (json.needsRegistration ? true : 'ต้องเริ่มสมัครใหม่ ไม่ใช่เข้าบัญชีที่ลบแล้ว'),
  });

  /* ---------- 15) ขอรหัส OTP ใหม่หลังพ้นช่วงรอ 45 วินาที ---------- */
  const wait = 46000 - (Date.now() - late.at);
  if (wait > 0) {
    console.log(`รอให้พ้นช่วงรอขอรหัสใหม่ ${Math.ceil(wait / 1000)} วินาที ...`);
    await new Promise((r) => setTimeout(r, wait));
  }
  const rr = await late.reg.call('POST /api/auth/register/resend-otp', 200, 'POST', '/api/auth/register/resend-otp', { otpId: late.regRes.json.otpId }, { note: 'หลังพ้นช่วงรอ' });
  await late.reg.call('POST /api/auth/register/verify-otp', 400, 'POST', '/api/auth/register/verify-otp', { otpId: late.regRes.json.otpId, code: late.regRes.json.devCode },
    { note: 'รหัสเดิมต้องใช้ไม่ได้หลังขอใหม่' });
  await late.reg.call('POST /api/auth/register/verify-otp', 200, 'POST', '/api/auth/register/verify-otp', { otpId: late.regRes.json.otpId, code: rr.json.devCode }, { note: 'รหัสใหม่' });
  const lr2 = await late.login.call('POST /api/auth/login/resend-otp', 200, 'POST', '/api/auth/login/resend-otp', { otpId: late.loginRes.json.otpId }, { note: 'หลังพ้นช่วงรอ' });
  await late.login.call('POST /api/auth/login/verify-otp', 200, 'POST', '/api/auth/login/verify-otp', { otpId: late.loginRes.json.otpId, code: lr2.json.devCode }, { note: 'รหัสใหม่' });
  const or2 = await agency.call('POST /api/otp/resend', 200, 'POST', '/api/otp/resend', { otpId: late.signOtp.otpId }, { note: 'หลังพ้นช่วงรอ' });
  await agency.call('POST /api/documents/:id/sign', 200, 'POST', `/api/documents/${late.signDoc}/sign`, { otpId: late.signOtp.otpId, code: or2.json.devCode }, { note: 'ลงนามด้วยรหัสที่ขอใหม่' });

  // กัน CSRF: คำขอเปลี่ยนข้อมูลจากโดเมนอื่นต้องถูกปฏิเสธ
  await agency.call('POST /api/contacts', 403, 'POST', '/api/contacts', { ...BUYER }, { headers: { Origin: 'https://evil.example' }, note: 'กัน CSRF' });
  // แต่หน้าเว็บที่ API เสิร์ฟเอง (โดเมนเดียวกัน) ต้องผ่าน แม้โดเมนนั้นไม่อยู่ใน WEB_ORIGINS
  // (สคริปต์นี้เปิดเซิร์ฟเวอร์ที่พอร์ตสุ่ม ซึ่งไม่อยู่ในรายชื่อค่าเริ่มต้น จึงทดสอบกรณีนี้ได้ตรง)
  await pub.call('POST /api/verify/pdf', 200, 'POST', '/api/verify/pdf', PDF, {
    headers: { 'Content-Type': 'application/pdf', Origin: BASE }, note: 'โดเมนเดียวกับ API ไม่ใช่ CSRF',
  });

  void creatorUser;
}

/* ================================================================ เริ่มทำงาน */

let SIGNING = false;

async function main() {
  const port = await freePort();
  BASE = `http://localhost:${port}`;
  const certs = await startGoogleCerts();
  const env = {
    ...process.env,
    PORT: String(port), TAXFLOW_DATA_DIR: TMP, TAXFLOW_DEV: '1', PUBLIC_BASE_URL: BASE,
    DATABASE_URL: '', S3_ENDPOINT: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '',
    SIGN_KEY_PEM_B64: '', SIGN_CERT_PEM_B64: '',
    SMTP_USER: '', SMTP_PASS: '',
    GOOGLE_CLIENT_ID: GOOGLE_CLIENT, GOOGLE_CERTS_URL: `http://localhost:${certs.address().port}/certs`,
  };

  // ถ้ามี openssl สร้างใบรับรองชั่วคราว เพื่อทดสอบลายมือชื่อดิจิทัลแบบครบวงจรด้วย
  const opensslBin = findOpenssl();
  if (opensslBin && spawnSync(opensslBin, ['version']).status === 0) {
    const dir = path.join(TMP, 'sign');
    fs.mkdirSync(dir, { recursive: true });
    const r = spawnSync(opensslBin, ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '2',
      '-keyout', path.join(dir, 'taxflow-sign.key.pem'), '-out', path.join(dir, 'taxflow-sign.cert.pem'),
      '-passout', 'pass:smoke-test', '-subj', '/CN=TaxFlow Smoke Test']);
    if (r.status === 0) { env.SIGN_KEY_PASSPHRASE = 'smoke-test'; SIGNING = true; }
  }

  const srv = spawn(process.execPath, ['server.js'], { cwd: API_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });

  // Windows ลบไฟล์ที่ยังถูกเปิดอยู่ไม่ได้ ต้องรอให้เซิร์ฟเวอร์ปิดไฟล์ฐานข้อมูลจริงก่อน
  // (srv.kill() แค่ส่งสัญญาณ ไม่ได้รอให้ปิดเสร็จ) และถ้ายังลบไม่ได้ก็แค่เตือน ไม่ทิ้งผลทดสอบ
  const exited = new Promise((r) => srv.once('exit', r));
  const cleanup = async () => {
    certs.close();
    srv.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    try {
      fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (err) {
      console.warn(`\n(ลบโฟลเดอร์ชั่วคราวไม่ได้ ${err.code} ไม่กระทบผลทดสอบ ลบเองได้ที่ ${TMP})`);
    }
  };
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* ยังไม่พร้อม */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    await run();
  } catch (err) {
    results.push({ route: '(สคริปต์)', as: '-', status: 0, expect: '-', ok: false, detail: err.stack });
  }
  await cleanup();

  /* ---------- รายงาน ---------- */
  const missing = ROUTES.filter((r) => !hitRoutes.has(r));
  const failed = results.filter((r) => !r.ok);
  const server5xx = results.filter((r) => r.status >= 500);
  const perRoute = new Map();
  for (const r of results) perRoute.set(r.route, (perRoute.get(r.route) ?? true) && r.ok);
  const routesOk = [...perRoute.values()].filter(Boolean).length;

  if (process.argv.includes('--verbose')) {
    for (const r of results) console.log(`${r.ok ? 'ผ่าน   ' : 'ไม่ผ่าน'} ${String(r.status).padEnd(4)} ${r.route.padEnd(42)} ${r.as.padEnd(10)} ${r.note}`);
    console.log('');
  }
  console.log(`เส้นทางทั้งหมด            ${ROUTES.length}`);
  console.log(`ยิงครบ                    ${hitRoutes.size - (hitRoutes.has('(สคริปต์)') ? 1 : 0)} เส้น${missing.length ? ` (ขาด ${missing.length})` : ''}`);
  console.log(`เส้นที่ทุกกรณีผ่าน         ${routesOk} เส้น`);
  console.log(`คำขอทั้งหมด               ${results.length} คำขอ · ผ่าน ${results.length - failed.length} · ไม่ผ่าน ${failed.length}`);
  console.log(`เซิร์ฟเวอร์ตอบ 5xx          ${server5xx.length}`);
  console.log(`ทดสอบลายมือชื่อดิจิทัลด้วย  ${SIGNING ? 'ใช่ (ใบรับรองชั่วคราว)' : 'ไม่ (เครื่องนี้ไม่มี openssl)'}`);
  if (missing.length) console.log(`\nยังไม่ได้ยิง:\n  ${missing.join('\n  ')}`);
  if (failed.length) {
    console.log('\nไม่ผ่าน:');
    for (const r of failed) console.log(`  ${r.route}  [${r.as}] ได้ ${r.status} คาด ${r.expect}${r.note ? ` (${r.note})` : ''}\n      ${String(r.detail).slice(0, 220)}`);
  }
  if (server5xx.length && log) {
    console.log('\nlog ของเซิร์ฟเวอร์ (ท้ายสุด):');
    console.log(log.split('\n').slice(-25).join('\n'));
  }
  process.exit(missing.length || failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
