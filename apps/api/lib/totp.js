'use strict';

/**
 * totp.js รหัสยืนยันตัวตนแบบใช้เวลา (TOTP, RFC 6238) สำหรับแอป Authenticator
 * (Google Authenticator / Authy / 1Password ฯลฯ) ทางเลือกที่เร็วกว่า OTP ทางอีเมล
 * เพราะไม่ต้องรอรับอีเมล และยังใช้ได้แม้อินเทอร์เน็ตของเซิร์ฟเวอร์ช้า/อีเมลดีเลย์
 *
 * ใช้ crypto.createHmac('sha1', ...) ของ Node core ล้วน ไม่มี dependency ภายนอก
 * เข้ารหัส secret เป็น Base32 (RFC 4648) เอง เพราะ Node core ไม่มี encoding นี้ในตัว
 */

const crypto = require('crypto');

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** สุ่ม secret ใหม่ 20 ไบต์ (160 บิต ตามมาตรฐานทั่วไป) เข้ารหัสเป็น Base32 */
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/** HOTP ตาม RFC 4226 คำนวณรหัสจาก secret (Base32) และตัวนับ (counter) */
function hotp(secretBase32, counter, digits = 6) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % (10 ** digits)).padStart(digits, '0');
}

/** TOTP ตาม RFC 6238 HOTP โดยใช้เวลาปัจจุบันหารด้วยช่วงเวลา (step) แทนตัวนับ */
function totpCode(secretBase32, { step = 30, digits = 6, timestamp = Date.now() } = {}) {
  const counter = Math.floor(timestamp / 1000 / step);
  return hotp(secretBase32, counter, digits);
}

/**
 * ตรวจรหัส TOTP ที่ผู้ใช้กรอก ยอมรับช่วงเวลาก่อน/หลังได้ ±window step (ค่าเริ่มต้น ±30 วิ)
 * กันปัญหานาฬิกาของมือถือกับเซิร์ฟเวอร์ไม่ตรงกันเล็กน้อย
 */
function verifyTotp(secretBase32, token, { step = 30, digits = 6, window = 1, timestamp = Date.now() } = {}) {
  if (!secretBase32 || !/^\d{6,8}$/.test(String(token || ''))) return false;
  const counter = Math.floor(timestamp / 1000 / step);
  for (let w = -window; w <= window; w++) {
    if (hotp(secretBase32, counter + w, digits) === String(token)) return true;
  }
  return false;
}

/**
 * URI มาตรฐาน otpauth:// สำหรับสร้าง QR ให้แอป Authenticator สแกนตอนตั้งค่าครั้งแรก
 * ไม่ใส่ algorithm/digits/period เพราะเป็นค่าเริ่มต้นตามสเปกอยู่แล้ว (SHA1/6 หลัก/30 วิ) ยิ่งพารามิเตอร์
 * น้อย URI ยิ่งสั้น สำคัญเพราะ lib/qr.js เป็นตัวสร้าง QR แบบ pure JS ที่รองรับความยาวข้อมูลจำกัด (version 1–6)
 */
function keyUri(secretBase32, { label, issuer = 'TaxFlow' } = {}) {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(label || '')}?secret=${secretBase32}&issuer=${enc(issuer)}`;
}

module.exports = { generateSecret, base32Encode, base32Decode, hotp, totpCode, verifyTotp, keyUri };
