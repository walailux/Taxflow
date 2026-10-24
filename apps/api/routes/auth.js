'use strict';
/** บัญชีผู้ใช้: สมัคร ยืนยัน OTP เข้าสู่ระบบ ออกจากระบบ — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, auth, otp, mailer, profile, pdpa, thaiid, ratelimit, totp, DS, readJsonBody, sendJson,
  publicUser, maskEmail, MAIL_SEND_ERROR, currentUser, rateLimited, requireAuth, logAudit,
} = require('../core/context');
const { profileMeta,
} = require('../core/docs');

const google = require('../lib/google');

const api = express.Router();
/* =========================================================
 * สมัครสมาชิก เก็บข้อมูลตามบทบาท + ความยินยอม PDPA + ยืนยันอีเมลด้วย OTP
 * บัญชีจะยังใช้งานไม่ได้จนกว่าจะยืนยันรหัส OTP ที่ส่งไปทางอีเมล
 * ========================================================= */
// ตรวจข้อมูลซ้ำระหว่างกรอกฟอร์มสมัคร (อีเมล / เลขประจำตัวผู้เสียภาษี) จำกัดความถี่กันการไล่เดาอีเมลในระบบ
api.post('/api/auth/check-available', async (req, res) => {
  if (rateLimited(res, `avail:${ratelimit.clientIp(req)}`, 40, 10 * 60 * 1000, 'ตรวจสอบถี่เกินไป กรุณารอสักครู่')) return;
  const b = await readJsonBody(req);
  const out = {};
  if (b.email !== undefined) {
    const email = String(b.email || '').trim().toLowerCase();
    out.email = DS.FORMAT.email.re.test(email) ? { taken: !!(await store.whereOne('users', { email })) } : { invalid: true };
  }
  if (b.taxId !== undefined) {
    const taxId = thaiid.digitsOnly(b.taxId);
    out.taxId = thaiid.isValidTaxId(taxId) ? { taken: !!(await store.findOne('users', (u) => u.taxId && u.taxId === taxId && !u.deleted)) } : { invalid: true };
  }
  sendJson(res, 200, out);
});

api.post('/api/auth/register', async (req, res) => {
  // ข้อ: ไม่มี rate limit ที่ register จำกัดจำนวนบัญชีที่สมัครได้ต่อ IP ต่อชั่วโมง
  if (rateLimited(res, `register:${ratelimit.clientIp(req)}`, 8, 60 * 60 * 1000, 'สมัครสมาชิกถี่เกินไปจากเครือข่ายนี้ กรุณาลองใหม่ภายหลัง')) return;
  const b = await readJsonBody(req);

  // สมัครด้วย Google: อีเมลมาจาก token ที่ /api/auth/google ออกให้ ไม่รับจากฟอร์ม และไม่ต้องตั้งรหัสผ่าน
  let gs = null;
  if (b.googleSignupToken) {
    gs = auth.verifyToken(b.googleSignupToken);
    if (!gs || gs.typ !== 'google-signup') return sendJson(res, 400, { error: 'การยืนยันกับ Google หมดเวลาแล้ว กรุณากด "สมัครด้วย Google" อีกครั้ง', field: 'google' });
    if (await store.findOne('users', (u) => u.googleSub === gs.sub)) return sendJson(res, 409, { error: 'บัญชี Google นี้สมัครไว้แล้ว กรุณาเข้าสู่ระบบด้วย Google', field: 'google' });
  }
  const email = gs ? gs.email : String(b.email || '').trim().toLowerCase();

  if (!email) return sendJson(res, 400, { error: 'กรุณากรอกอีเมล (ห้ามเว้นว่าง)', field: 'email' });
  if (!DS.FORMAT.email.re.test(email) || email.length > 150) return sendJson(res, 400, { error: 'รูปแบบอีเมลไม่ถูกต้อง (ตัวอย่าง example@email.com)', field: 'email' });
  if (!gs) {
    if (!b.password) return sendJson(res, 400, { error: 'กรุณากรอกรหัสผ่าน', field: 'password' });
    if (String(b.password).length < 8) return sendJson(res, 400, { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', field: 'password' });
    if (String(b.password).length > 128) return sendJson(res, 400, { error: 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร', field: 'password' });
    if (!/[A-Za-z]/.test(b.password) || !/\d/.test(b.password)) return sendJson(res, 400, { error: 'รหัสผ่านต้องมีทั้งตัวอักษรภาษาอังกฤษและตัวเลข', field: 'password' });
    if (b.passwordConfirm !== undefined && b.passwordConfirm !== b.password) return sendJson(res, 400, { error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน', field: 'password2' });
  }
  if (await store.whereOne('users', { email })) return sendJson(res, 409, { error: 'อีเมลนี้ถูกใช้สมัครแล้ว กรุณาเข้าสู่ระบบ หรือใช้อีเมลอื่น', field: 'email' });

  // ห้ามสมัครเป็นผู้ดูแลระบบผ่านหน้าลงทะเบียน
  const role = ['agency', 'corporate', 'creator'].includes(b.role) ? b.role : 'creator';

  // ความยินยอมตาม PDPA ต้องยินยอมข้อที่จำเป็นก่อนจึงจะสร้างบัญชีได้
  const consentCheck = pdpa.validateConsent(b.consent);
  if (!consentCheck.ok) return sendJson(res, 400, { error: consentCheck.error });

  // ประกอบข้อมูลโปรไฟล์ตามบทบาท
  const draft = { ...profile.defaults(role), role, email };
  const { patch, errors } = profile.buildPatch(draft, b);
  if (errors.length) return sendJson(res, 400, { error: errors[0], errors });

  const name = patch.entityType === 'juristic' ? patch.companyName : patch.displayName;
  if (!name) return sendJson(res, 400, { error: patch.entityType === 'juristic' ? 'กรุณากรอกชื่อนิติบุคคล' : 'กรุณากรอกชื่อ-นามสกุล' });
  if (!patch.taxId) return sendJson(res, 400, { error: 'กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลัก' });
  if (await store.findOne('users', (u) => u.taxId && u.taxId === patch.taxId)) {
    return sendJson(res, 409, { error: 'เลขประจำตัวผู้เสียภาษีนี้ถูกใช้ลงทะเบียนแล้ว (1 เลขต่อ 1 บัญชี)', field: 'taxId' });
  }

  const consentRecord = pdpa.makeConsentRecord(consentCheck.purposes);
  const user = await store.insert('users', {
    ...draft, ...patch,
    passwordHash: gs ? null : auth.hashPassword(b.password),
    ...(gs ? { googleSub: gs.sub } : {}),
    emailVerified: false,
    consent: consentRecord,
  });
  await store.insert('consents', {
    userId: user.id, version: consentRecord.version, purposes: consentRecord.purposes,
    action: 'register', at: consentRecord.at,
  });

  const { id: otpId, code } = await otp.createOtp(user.id, 'register', null, 'email');
  const mailResult = await mailer.sendOtpEmail(user.email, { code, purpose: 'register', displayName: user.displayName });
  await logAudit(user.id, null, 'register', gs ? 'สร้างบัญชีใหม่ด้วย Google รอยืนยันอีเมล' : 'สร้างบัญชีใหม่ รอยืนยันอีเมล', user.displayName);

  // บัญชี/รหัส OTP ถูกสร้างไว้แล้วแม้ส่งอีเมลไม่สำเร็จ (กดส่งรหัสอีกครั้งได้โดยไม่ต้องสมัครใหม่)
  // จึงยังตอบ 201 ตามปกติ แต่แนบ notice เตือนแทนการเงียบเหมือนส่งสำเร็จ
  sendJson(res, 201, {
    pendingVerification: true, otpId, emailMasked: maskEmail(user.email),
    ...(mailResult.dev ? { devCode: code } : {}),
    ...(mailResult.ok === false ? { notice: 'สร้างบัญชีสำเร็จ แต่ส่งอีเมลยืนยันไม่สำเร็จ กรุณากด "ส่งรหัสอีกครั้ง" ด้านล่างเพื่อลองใหม่' } : {}),
  });
});

// ยืนยันอีเมลตอนสมัคร แล้วจึงเปิดใช้งานบัญชีและออก session
api.post('/api/auth/register/verify-otp', async (req, res) => {
  const b = await readJsonBody(req);
  const result = await otp.verify(b.otpId, b.code, { purpose: 'register' });
  if (!result.ok) return sendJson(res, 400, { error: result.error });
  const user = await store.find('users', result.otp.userId);
  if (!user) return sendJson(res, 404, { error: 'ไม่พบบัญชีผู้ใช้' });
  const updated = await store.update('users', user.id, { emailVerified: true, emailVerifiedAt: new Date().toISOString() });
  auth.setSessionCookie(res, auth.createToken({ uid: user.id, role: user.role, tv: user.tokenVersion || 0 }));
  await logAudit(user.id, null, 'verify-email', 'ยืนยันอีเมลสำเร็จ บัญชีพร้อมใช้งาน', user.displayName);
  sendJson(res, 200, { user: publicUser(updated) });
});

api.post('/api/auth/register/resend-otp', async (req, res) => {
  const b = await readJsonBody(req);
  const row = await store.find('otp_codes', b.otpId);
  if (!row || row.purpose !== 'register') return sendJson(res, 404, { error: 'ไม่พบรายการยืนยันอีเมลนี้ กรุณาสมัครใหม่อีกครั้ง' });
  const r = await otp.regenerate(b.otpId);
  if (!r) return sendJson(res, 400, { error: 'ไม่สามารถขอรหัสใหม่ได้ กรุณาสมัครใหม่อีกครั้ง' });
  if (r.exhausted) return sendJson(res, 429, { error: 'ขอรหัสใหม่ครบจำนวนครั้งที่กำหนดแล้ว กรุณาสมัครใหม่อีกครั้ง' });
  if (r.throttled) return sendJson(res, 429, { error: `กรุณารออีก ${r.waitSec} วินาทีก่อนขอรหัสใหม่` });
  const user = await store.find('users', row.userId);
  const mailResult = await mailer.sendOtpEmail(user.email, { code: r.code, purpose: 'register', displayName: user.displayName });
  if (mailResult.ok === false) return sendJson(res, 502, { error: MAIL_SEND_ERROR });
  sendJson(res, 200, { otpId: b.otpId, ...(mailResult.dev ? { devCode: r.code } : {}) });
});

/* ---------- เข้าสู่ระบบ (ขั้นที่ 1: ตรวจอีเมล/รหัสผ่าน แล้วส่ง OTP) ---------- */
api.post('/api/auth/login', async (req, res) => {
  const b = await readJsonBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  // ข้อ: ไม่มี rate limit ที่ login จำกัดทั้งต่อ IP (กัน brute-force กว้างๆ) และต่อ IP+อีเมล (กัน targeted)
  if (rateLimited(res, `login:ip:${ratelimit.clientIp(req)}`, 30, 10 * 60 * 1000)) return;
  if (email && rateLimited(res, `login:acct:${ratelimit.clientIp(req)}:${email}`, 8, 10 * 60 * 1000, 'ลองเข้าสู่ระบบผิดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')) return;
  const user = await store.whereOne('users', { email });
  if (!user || !auth.verifyPassword(b.password, user.passwordHash)) return sendJson(res, 401, { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  await startLoginChallenge(res, user);
});

/**
 * ขั้นที่ 2 ของการเข้าสู่ระบบทุกช่องทาง (รหัสผ่าน หรือ Google) ยังไม่ออก session จนกว่าจะยืนยันรหัส
 * ยังไม่ยืนยันอีเมล -> ส่ง OTP ยืนยันอีเมล · เปิด TOTP -> ขอรหัสจากแอป · ปกติ -> ส่ง OTP ทางอีเมล
 */
async function startLoginChallenge(res, user) {
  // บัญชีที่ยังไม่ได้ยืนยันอีเมล ให้กลับไปทำขั้นตอนยืนยันอีเมลให้เสร็จก่อน
  if (!user.emailVerified) {
    const { id: otpId, code } = await otp.createOtp(user.id, 'register', null, 'email');
    const mailResult = await mailer.sendOtpEmail(user.email, { code, purpose: 'register', displayName: user.displayName });
    return sendJson(res, 200, {
      pendingVerification: true, otpId, emailMasked: maskEmail(user.email),
      notice: mailResult.ok === false
        ? 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล และระบบส่งอีเมลยืนยันไม่สำเร็จ กรุณากด "ส่งรหัสอีกครั้ง" ด้านล่างเพื่อลองใหม่'
        : 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล ระบบได้ส่งรหัสยืนยันไปให้ใหม่แล้ว',
      ...(mailResult.dev ? { devCode: code } : {}),
    });
  }

  // ข้อ: ถ้าบัญชีนี้เปิดใช้ TOTP (แอป Authenticator) ไว้แล้ว ให้ข้ามการส่ง OTP ทางอีเมลไปเลย
  // เพราะ TOTP เชื่อถือได้เทียบเท่า/สูงกว่าอีเมลอยู่แล้ว และเร็วกว่ามาก (ไม่ต้องรอกล่องจดหมาย)
  if (user.totpEnabled && user.totpSecret) {
    const { id: otpId } = await otp.createOtp(user.id, 'login-totp', null, 'email'); // ใช้แค่เป็นรายการรออ้างอิง ไม่ส่งอีเมลจริง
    await logAudit(user.id, null, 'login-totp-pending', 'รอยืนยันด้วยแอป Authenticator (TOTP)', user.displayName);
    return sendJson(res, 200, { totpRequired: true, otpId, emailMasked: maskEmail(user.email) });
  }

  const { id: otpId, code } = await otp.createOtp(user.id, 'login', null, 'email');
  const mailResult = await mailer.sendOtpEmail(user.email, { code, purpose: 'login', displayName: user.displayName });
  await logAudit(user.id, null, 'login-otp-sent', `ส่งรหัส OTP เข้าสู่ระบบไปที่ ${user.email}`, user.displayName);
  sendJson(res, 200, {
    otpRequired: true, otpId, emailMasked: maskEmail(user.email),
    ...(mailResult.dev ? { devCode: code } : {}),
    ...(mailResult.ok === false ? { notice: 'ส่งอีเมลรหัสยืนยันไม่สำเร็จ (ระบบอีเมลขัดข้องชั่วคราว) กรุณากด "ส่งรหัสอีกครั้ง" ด้านล่างเพื่อลองใหม่' } : {}),
  });
}

/* ---------- เข้าสู่ระบบ / สมัครด้วย Google ---------- */
// หน้าเว็บถามว่าเปิดปุ่ม Google ได้ไหม และใช้ Client ID อะไร (ตั้งค่าที่ GOOGLE_CLIENT_ID จุดเดียว)
api.get('/api/auth/providers', (req, res) => {
  const id = google.clientId();
  sendJson(res, 200, { google: id ? { clientId: id } : null });
});

const GOOGLE_SIGNUP_TTL = 30 * 60;

// ขั้นที่ 1: ตรวจ ID token จาก Google แล้วส่ง OTP ต่อเหมือนเข้าสู่ระบบด้วยรหัสผ่าน
// ยังไม่มีบัญชี -> ส่ง signupToken กลับไปให้หน้าสมัครกรอกข้อมูลที่เหลือ
api.post('/api/auth/google', async (req, res) => {
  if (rateLimited(res, `google:ip:${ratelimit.clientIp(req)}`, 30, 10 * 60 * 1000)) return;
  const b = await readJsonBody(req);
  const g = await google.verifyIdToken(b.credential);
  if (!g.ok) return sendJson(res, 401, { error: g.error });

  // googleSub ไม่ใช่คอลัมน์ที่มีดัชนี whereOne จะไม่กรองเลยแล้วคืนผู้ใช้คนแรก จึงต้องใช้ findOne
  let user = await store.findOne('users', (u) => u.googleSub === g.sub);
  if (!user) {
    user = await store.whereOne('users', { email: g.email });
    // ผูกกับบัญชีเดิมที่อีเมลตรงกันได้ เพราะ Google ยืนยันแล้วว่าผู้ใช้เป็นเจ้าของอีเมลนี้
    if (user && user.googleSub) return sendJson(res, 409, { error: 'อีเมลนี้ผูกกับบัญชี Google อื่นไว้แล้ว' });
    if (user) {
      user = await store.update('users', user.id, { googleSub: g.sub });
      await logAudit(user.id, null, 'google-link', 'ผูกบัญชี Google กับบัญชีนี้', user.displayName);
    }
  }
  if (user && user.deleted) return sendJson(res, 401, { error: 'บัญชีนี้ถูกลบแล้ว' });
  if (user) return startLoginChallenge(res, user);

  sendJson(res, 200, {
    needsRegistration: true,
    signupToken: auth.createToken({ typ: 'google-signup', sub: g.sub, email: g.email, name: g.name }, GOOGLE_SIGNUP_TTL),
    email: g.email,
    name: g.name,
  });
});

// ขั้นตอนที่ 2 (ทางเลือก TOTP): ยืนยันรหัสจากแอป Authenticator แทนรหัส OTP ทางอีเมล
api.post('/api/auth/login/totp', async (req, res) => {
  const b = await readJsonBody(req);
  if (rateLimited(res, `login-totp:${ratelimit.clientIp(req)}`, 15, 10 * 60 * 1000, 'ลองยืนยันผิดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')) return;
  const row = await store.find('otp_codes', b.otpId);
  if (!row || row.purpose !== 'login-totp') return sendJson(res, 404, { error: 'ไม่พบรายการนี้ กรุณาเข้าสู่ระบบใหม่' });
  const user = await store.find('users', row.userId);
  if (!user || !user.totpEnabled || !user.totpSecret) return sendJson(res, 400, { error: 'บัญชีนี้ไม่ได้เปิดใช้งาน TOTP' });
  const result = await otp.verifyExternal(b.otpId, { userId: user.id, purpose: 'login-totp' }, () => totp.verifyTotp(user.totpSecret, b.code));
  if (!result.ok) return sendJson(res, 400, { error: result.error });
  auth.setSessionCookie(res, auth.createToken({ uid: user.id, role: user.role, tv: user.tokenVersion || 0 }));
  await logAudit(user.id, null, 'login', 'เข้าสู่ระบบสำเร็จ (ยืนยันด้วย TOTP)', user.displayName);
  sendJson(res, 200, { user: publicUser(user) });
});

// ขั้นตอนที่ 2: ยืนยันรหัส OTP แล้วจึงออก session cookie จริง
api.post('/api/auth/login/verify-otp', async (req, res) => {
  const b = await readJsonBody(req);
  const result = await otp.verify(b.otpId, b.code, { purpose: 'login' });
  if (!result.ok) return sendJson(res, 400, { error: result.error });
  const user = await store.find('users', result.otp.userId);
  if (!user) return sendJson(res, 404, { error: 'ไม่พบบัญชีผู้ใช้' });
  auth.setSessionCookie(res, auth.createToken({ uid: user.id, role: user.role, tv: user.tokenVersion || 0 }));
  await logAudit(user.id, null, 'login', 'เข้าสู่ระบบสำเร็จ (ยืนยันด้วย OTP)', user.displayName);
  sendJson(res, 200, { user: publicUser(user) });
});

// ขอรหัส OTP เข้าสู่ระบบใหม่ (กด "ส่งรหัสอีกครั้ง")
api.post('/api/auth/login/resend-otp', async (req, res) => {
  const b = await readJsonBody(req);
  const row = await store.find('otp_codes', b.otpId);
  if (!row || row.purpose !== 'login') return sendJson(res, 404, { error: 'ไม่พบรายการ OTP นี้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  const r = await otp.regenerate(b.otpId);
  if (!r) return sendJson(res, 400, { error: 'ไม่สามารถขอรหัสใหม่ได้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  if (r.exhausted) return sendJson(res, 429, { error: 'ขอรหัสใหม่ครบจำนวนครั้งที่กำหนดแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  if (r.throttled) return sendJson(res, 429, { error: `กรุณารออีก ${r.waitSec} วินาทีก่อนขอรหัสใหม่` });
  const user = await store.find('users', row.userId);
  const mailResult = await mailer.sendOtpEmail(user.email, { code: r.code, purpose: 'login', displayName: user.displayName });
  if (mailResult.ok === false) return sendJson(res, 502, { error: MAIL_SEND_ERROR });
  sendJson(res, 200, { otpId: b.otpId, ...(mailResult.dev ? { devCode: r.code } : {}) });
});

api.post('/api/auth/logout', async (req, res) => { auth.clearSessionCookie(res); sendJson(res, 200, { ok: true }); });
// ออกจากระบบทุกอุปกรณ์ เพิ่ม tokenVersion เพื่อเพิกถอน session เดิมทั้งหมดทันที (ไม่ใช่แค่ลบ cookie ฝั่งนี้)
api.post('/api/auth/logout-all', requireAuth(async (req, res) => {
  await store.update('users', req.user.id, { tokenVersion: (req.user.tokenVersion || 0) + 1 });
  auth.clearSessionCookie(res);
  await logAudit(req.user.id, null, 'logout-all', 'ออกจากระบบทุกอุปกรณ์ (เพิกถอน session เดิมทั้งหมด)', req.user.displayName);
  sendJson(res, 200, { ok: true });
}));
api.get('/api/auth/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'ยังไม่ได้เข้าสู่ระบบ' });
  sendJson(res, 200, { user: publicUser(user), profile: profileMeta(user) });
});

/* =========================================================
 * โปรไฟล์ตามบทบาท
 * ========================================================= */


module.exports = api;
