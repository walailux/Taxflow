'use strict';
// ตรวจ lib/google.js ด้วยกุญแจ RSA ที่สร้างขึ้นเองและเซิร์ฟเวอร์กุญแจปลอม ไม่ต้องต่ออินเทอร์เน็ต

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const google = require('../lib/google');

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const NOW = Date.UTC(2026, 8, 29, 3, 0, 0);
const nowSec = Math.floor(NOW / 1000);

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function makeToken(claims = {}, { kid = 'k1', key = privateKey, alg = 'RS256' } = {}) {
  const payload = {
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1234567890',
    email: 'Someone@Gmail.com', email_verified: true, name: 'สมชาย ใจดี',
    iat: nowSec - 10, exp: nowSec + 3600, ...claims,
  };
  const head = `${b64({ alg, kid, typ: 'JWT' })}.${b64(payload)}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(head), key).toString('base64url');
  return `${head}.${sig}`;
}

function fakeFetch() {
  const f = async () => {
    f.calls++;
    return { ok: true, headers: { get: () => 'public, max-age=3600' }, json: async () => ({ keys: [jwk] }) };
  };
  f.calls = 0;
  return f;
}

const verify = (token, fetchImpl = fakeFetch()) => google.verifyIdToken(token, { clientId: CLIENT_ID, fetchImpl, now: NOW });

test.beforeEach(() => google.resetKeyCache());

test('token ถูกต้อง: คืน sub อีเมล (ตัวพิมพ์เล็ก) และชื่อ', async () => {
  const r = await verify(makeToken());
  assert.equal(r.ok, true);
  assert.equal(r.sub, '1234567890');
  assert.equal(r.email, 'someone@gmail.com');
  assert.equal(r.name, 'สมชาย ใจดี');
});

test('ลายเซ็นจากกุญแจอื่น ไม่ผ่าน', async () => {
  const r = await verify(makeToken({}, { key: otherKey }));
  assert.equal(r.ok, false);
});

test('แก้ payload หลังเซ็น ไม่ผ่าน', async () => {
  const [h, , s] = makeToken().split('.');
  const forged = `${h}.${b64({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'attacker', email: 'victim@gmail.com', email_verified: true, exp: nowSec + 3600 })}.${s}`;
  assert.equal((await verify(forged)).ok, false);
});

test('aud ไม่ตรงกับ Client ID ของระบบ ไม่ผ่าน', async () => {
  assert.equal((await verify(makeToken({ aud: 'other-app.apps.googleusercontent.com' }))).ok, false);
});

test('ผู้ออก (iss) ไม่ใช่ Google ไม่ผ่าน', async () => {
  assert.equal((await verify(makeToken({ iss: 'https://evil.example.com' }))).ok, false);
});

test('หมดอายุแล้ว ไม่ผ่าน', async () => {
  assert.equal((await verify(makeToken({ exp: nowSec - 3600 }))).ok, false);
});

test('อีเมลยังไม่ยืนยันกับ Google ไม่ผ่าน', async () => {
  const r = await verify(makeToken({ email_verified: false }));
  assert.equal(r.ok, false);
  assert.match(r.error, /ยังไม่ได้ยืนยันอีเมล/);
});

test('alg ไม่ใช่ RS256 (เช่น none) ไม่ผ่าน', async () => {
  const [, p] = makeToken().split('.');
  assert.equal((await verify(`${b64({ alg: 'none', kid: 'k1' })}.${p}.`)).ok, false);
});

test('kid ที่ไม่รู้จัก ไม่ผ่าน และโหลดกุญแจใหม่เพียงครั้งเดียว', async () => {
  const f = fakeFetch();
  assert.equal((await verify(makeToken({}, { kid: 'unknown' }), f)).ok, false);
  assert.equal(f.calls, 1);
});

test('ใช้กุญแจที่แคชไว้ ไม่โหลดซ้ำทุกครั้ง', async () => {
  const f = fakeFetch();
  await verify(makeToken(), f);
  await verify(makeToken(), f);
  assert.equal(f.calls, 1);
});

test('ข้อมูลที่ไม่ใช่ JWT ไม่ผ่าน', async () => {
  for (const bad of ['', 'abc', 'a.b', 'a.b.c', null]) assert.equal((await verify(bad)).ok, false);
});

test('ไม่ได้ตั้ง GOOGLE_CLIENT_ID ปิดใช้งาน', async () => {
  const before = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    const r = await google.verifyIdToken(makeToken(), { fetchImpl: fakeFetch(), now: NOW });
    assert.equal(r.ok, false);
    assert.match(r.error, /ยังไม่ได้ตั้งค่า/);
  } finally {
    if (before !== undefined) process.env.GOOGLE_CLIENT_ID = before;
  }
});

test('เชื่อมต่อ Google ไม่ได้ แจ้งให้ลองใหม่', async () => {
  const r = await verify(makeToken(), async () => { throw new Error('offline'); });
  assert.equal(r.ok, false);
  assert.match(r.error, /ลองใหม่/);
});
