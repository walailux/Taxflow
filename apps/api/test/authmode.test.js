'use strict';

// ตั้ง SESSION_SECRET ก่อน require เสมอ ไม่ให้ lib/auth.js สร้างไฟล์ data/session.key ระหว่างทดสอบ
process.env.SESSION_SECRET = 'test-secret-authmode';

const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/auth');

/** response ปลอมที่จำ header ที่ถูกตั้งไว้ ใช้แทน http.ServerResponse */
function fakeRes() {
  const headers = {};
  return { headers, setHeader(k, v) { headers[k.toLowerCase()] = v; } };
}

function withEnv(vars, fn) {
  const before = {};
  for (const k of Object.keys(vars)) { before[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(vars)) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
  }
}

test('ค่าเริ่มต้น: คุกกี้ SameSite=Lax และไม่ส่ง token ทาง header', () => withEnv({ COOKIE_CROSS_SITE: null, AUTH_HEADER_MODE: null }, () => {
  const res = fakeRes();
  auth.setSessionCookie(res, 'abc.def');
  assert.match(res.headers['set-cookie'], /tf_session=abc\.def; HttpOnly; Path=\/; Max-Age=\d+; SameSite=Lax$/);
  assert.equal(res.headers['x-session-token'], undefined);
}));

test('COOKIE_CROSS_SITE=1: คุกกี้ SameSite=None; Secure ทั้งตอนตั้งและตอนลบ', () => withEnv({ COOKIE_CROSS_SITE: '1' }, () => {
  const a = fakeRes();
  auth.setSessionCookie(a, 't');
  assert.match(a.headers['set-cookie'], /SameSite=None; Secure$/);
  const b = fakeRes();
  auth.clearSessionCookie(b);
  // คุกกี้ที่ตั้งด้วย SameSite=None ต้องลบด้วยแฟล็กเดียวกัน ไม่งั้นเบราว์เซอร์บางตัวไม่ยอมลบ
  assert.match(b.headers['set-cookie'], /Max-Age=0; SameSite=None; Secure$/);
}));

test('AUTH_HEADER_MODE=1: ส่ง token กลับทาง X-Session-Token และอ่าน Bearer ได้', () => withEnv({ AUTH_HEADER_MODE: '1' }, () => {
  const res = fakeRes();
  auth.setSessionCookie(res, 'tok.sig');
  assert.equal(res.headers['x-session-token'], 'tok.sig');
  assert.equal(auth.readToken({ headers: { authorization: 'Bearer tok.sig' } }), 'tok.sig');
  assert.equal(auth.readToken({ headers: { authorization: 'Basic xxx' } }), null);
}));

test('ปิด AUTH_HEADER_MODE: ไม่รับ Bearer (พฤติกรรมเดิมทุกประการ)', () => withEnv({ AUTH_HEADER_MODE: null }, () => {
  assert.equal(auth.readToken({ headers: { authorization: 'Bearer tok.sig' } }), null);
}));

test('คุกกี้มาก่อน Bearer เสมอ และ token ที่ได้ตรวจลายเซ็นผ่าน', () => withEnv({ AUTH_HEADER_MODE: '1' }, () => {
  const token = auth.createToken({ uid: 'u1', role: 'creator', tv: 0 });
  const req = { headers: { cookie: `x=1; tf_session=${token}`, authorization: 'Bearer other.one' } };
  assert.equal(auth.readToken(req), token);
  assert.equal(auth.verifyToken(auth.readToken(req)).uid, 'u1');
}));
