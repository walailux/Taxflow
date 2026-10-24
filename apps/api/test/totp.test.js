'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const totp = require('../lib/totp');

test('base32Encode/base32Decode — round-trip กลับมาได้ค่าเดิม', () => {
  const buf = Buffer.from('ทดสอบ TaxFlow 12345', 'utf8');
  const decoded = totp.base32Decode(totp.base32Encode(buf));
  assert.deepEqual(decoded, buf);
});

// เวกเตอร์ทดสอบทางการจาก RFC 6238 ภาคผนวก B (SHA1, secret ASCII "12345678901234567890", รหัส 8 หลัก)
// ใช้ยืนยันว่า hotp()/totp ที่เขียนเองคำนวณตรงตามมาตรฐานจริง ไม่ใช่แค่ทดสอบกับตัวเอง
const RFC_SECRET_B32 = totp.base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTORS = [
  { time: 59, code: '94287082' },
  { time: 1111111109, code: '07081804' },
  { time: 1111111111, code: '14050471' },
  { time: 1234567890, code: '89005924' },
  { time: 2000000000, code: '69279037' },
];

for (const v of RFC_VECTORS) {
  test(`hotp — ตรงตามเวกเตอร์ทดสอบ RFC 6238 ที่เวลา ${v.time}`, () => {
    const counter = Math.floor(v.time / 30);
    assert.equal(totp.hotp(RFC_SECRET_B32, counter, 8), v.code);
  });
}

test('verifyTotp — รหัสถูกต้อง ณ เวลาปัจจุบันต้องผ่าน', () => {
  const secret = totp.generateSecret();
  const code = totp.totpCode(secret);
  assert.equal(totp.verifyTotp(secret, code), true);
});

test('verifyTotp — รหัสผิดต้องไม่ผ่าน', () => {
  const secret = totp.generateSecret();
  const code = totp.totpCode(secret);
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  assert.equal(totp.verifyTotp(secret, wrong), false);
});

test('verifyTotp — รหัสจาก step ก่อนหน้า (นาฬิกาเหลื่อม) ยังผ่านได้ในหน้าต่าง window', () => {
  const secret = totp.generateSecret();
  const now = Date.now();
  const prevStepCode = totp.totpCode(secret, { timestamp: now - 30 * 1000 });
  assert.equal(totp.verifyTotp(secret, prevStepCode, { timestamp: now }), true);
});

test('verifyTotp — รหัสเก่าเกินไป (นอก window) ต้องไม่ผ่าน', () => {
  const secret = totp.generateSecret();
  const now = Date.now();
  const oldCode = totp.totpCode(secret, { timestamp: now - 5 * 30 * 1000 });
  assert.equal(totp.verifyTotp(secret, oldCode, { timestamp: now, window: 1 }), false);
});

test('verifyTotp — ค่าว่าง/รูปแบบผิดต้องไม่ผ่าน ไม่ throw', () => {
  const secret = totp.generateSecret();
  assert.equal(totp.verifyTotp(secret, ''), false);
  assert.equal(totp.verifyTotp(secret, 'abcdef'), false);
  assert.equal(totp.verifyTotp(secret, null), false);
});

test('keyUri — สร้าง otpauth:// URI ที่มีพารามิเตอร์ครบและสั้นพอสำหรับ QR pure-JS (lib/qr.js รองรับ ≤ ~106 ไบต์)', () => {
  const uri = totp.keyUri('JBSWY3DPEHPK3PXP', { label: 'user@taxflow.test', issuer: 'TaxFlow' });
  assert.match(uri, /^otpauth:\/\/totp\/TaxFlow:user%40taxflow\.test\?/);
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /issuer=TaxFlow/);
  assert.ok(Buffer.byteLength(uri, 'utf8') <= 106, `URI ยาว ${Buffer.byteLength(uri, 'utf8')} ไบต์ เกินขีดจำกัดของตัวสร้าง QR`);
});
