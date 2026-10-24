'use strict';
/**
 * lib/opensslbin.js หาไฟล์โปรแกรม openssl ด้วย path เต็ม ไม่พึ่ง PATH
 * ถ้าเรียก 'openssl' เฉย ๆ ระบบจะค้นตามโฟลเดอร์ใน PATH ซึ่งอาจมีโฟลเดอร์ที่คนอื่นเขียนไฟล์ได้
 * จึงเลือกจาก OPENSSL_BIN (ต้องเป็น path เต็ม) หรือโฟลเดอร์ติดตั้งมาตรฐานที่ผู้ใช้ทั่วไปเขียนไม่ได้
 */
const fs = require('fs');
const path = require('path');

const CANDIDATES = process.platform === 'win32'
  ? [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\ucrt64\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL\\bin\\openssl.exe',
  ]
  : ['/usr/bin/openssl', '/usr/local/bin/openssl', '/opt/homebrew/bin/openssl', '/bin/openssl'];

/** path เต็มของ openssl หรือ null ถ้าไม่พบ */
function findOpenssl() {
  const fromEnv = process.env.OPENSSL_BIN;
  if (fromEnv && path.isAbsolute(fromEnv) && fs.existsSync(fromEnv)) return fromEnv;
  return CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

module.exports = { findOpenssl };
