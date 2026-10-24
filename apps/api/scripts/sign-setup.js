'use strict';
/**
 * scripts/sign-setup.js สร้างใบรับรองและกุญแจสำหรับลงลายมือชื่อดิจิทัล (WP6)
 * ==========================================================================
 *   npm run sign:setup              สร้างใหม่ (ไม่เขียนทับของเดิม)
 *   npm run sign:setup -- --force   สร้างทับของเดิม
 *
 * ใช้ OpenSSL ตามที่แผน ver18 ระบุ ต้องมีคำสั่ง openssl ในเครื่อง
 *   Windows: มากับ Git for Windows (C:\Program Files\Git\usr\bin\openssl.exe)
 *
 * ไฟล์ที่ได้ใน apps/api/data/sign/ (อยู่ใน .gitignore ห้ามขึ้นที่เก็บโค้ด)
 *   taxflow-sign.key.pem   กุญแจส่วนตัว เข้ารหัสด้วยรหัสผ่าน (PKCS#8)
 *   taxflow-sign.cert.pem  ใบรับรอง
 *   taxflow-sign.cer       ใบรับรองแบบ DER สำหรับนำเข้า Adobe Reader ให้ขึ้นว่าเชื่อถือได้ตอนสาธิต
 *   taxflow-sign.p12       กุญแจ + ใบรับรองรวมไฟล์เดียว (รหัสผ่านเดียวกัน) เผื่อใช้กับเครื่องมืออื่น
 *
 * รหัสผ่านของกุญแจแสดงบนจอครั้งเดียว ให้นำไปใส่ SIGN_KEY_PASSPHRASE ใน apps/api/.env
 * สคริปต์ไม่เขียนรหัสผ่านลงไฟล์ใด ๆ ตามข้อกำหนดของแผน
 *
 * ทำไมระบบอ่านไฟล์ .pem ไม่ใช่ .p12 ตามที่แผนเขียน
 *   Node.js อ่านกุญแจ PKCS#8 ที่เข้ารหัสด้วยรหัสผ่านได้ในตัว แต่อ่าน PKCS#12 ไม่ได้
 *   ถ้าจะใช้ .p12 ต้องติดตั้ง node-forge เพิ่ม ความปลอดภัยเท่ากัน (กุญแจถูกเข้ารหัสทั้งคู่)
 */

require('./_env');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const pdfsign = require('../lib/pdfsign');
const { findOpenssl } = require('../lib/opensslbin');

const force = process.argv.includes('--force');
const dir = pdfsign.DEFAULT_DIR;
const keyFile = pdfsign.DEFAULT_KEY;
const certFile = pdfsign.DEFAULT_CERT;
const cerFile = path.join(dir, 'taxflow-sign.cer');
const p12File = path.join(dir, 'taxflow-sign.p12');

function notFound() {
  console.error('ไม่พบโปรแกรม openssl ในโฟลเดอร์ติดตั้งมาตรฐาน');
  console.error('Windows: ติดตั้ง Git for Windows (มี C:\\Program Files\\Git\\usr\\bin\\openssl.exe)');
  console.error('หรือตั้ง OPENSSL_BIN เป็น path เต็มของ openssl ใน apps/api/.env');
  process.exit(1);
}

// เรียก openssl ด้วย path เต็มจาก findOpenssl() ไม่ค้นผ่าน PATH
function openssl(args) {
  const bin = findOpenssl();
  if (!bin) notFound();
  try {
    return execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err.code === 'ENOENT') notFound();
    throw new Error(String(err.stderr || err.message));
  }
}

if (fs.existsSync(keyFile) && !force) {
  console.log(`มีใบรับรองอยู่แล้วที่ ${dir}`);
  console.log('ถ้าต้องการสร้างใหม่ให้รัน  npm run sign:setup -- --force');
  console.log('(ไฟล์ PDF ที่ลงนามด้วยใบเดิมยังตรวจความครบถ้วนได้ แต่หน้าตรวจสอบจะบอกว่าไม่ใช่ใบรับรองปัจจุบันของระบบ)');
  process.exit(0);
}

fs.mkdirSync(dir, { recursive: true });
// รหัสผ่านสุ่ม ตัวอักษรและตัวเลขล้วน จะได้ไม่มีปัญหาอักขระพิเศษใน .env และ shell
const passphrase = crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 28);
const passArg = `pass:${passphrase}`;

console.log('กำลังสร้างกุญแจ RSA 3072 บิต และใบรับรองอายุ 3 ปี ...');
openssl([
  'req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-days', '1095',
  '-keyout', keyFile, '-out', certFile, '-passout', passArg,
  '-subj', '/C=TH/O=TaxFlow (Educational Prototype)/OU=Demo only - not legally valid/CN=TaxFlow Demo Signing (Self-signed)',
  // ใบรับรองนี้ใช้ลงนามเอกสารอย่างเดียว ไม่ใช่ใบรับรอง CA หรือใบรับรองเว็บไซต์
  '-addext', 'basicConstraints=critical,CA:FALSE',
  '-addext', 'keyUsage=critical,digitalSignature,nonRepudiation',
]);
openssl(['x509', '-in', certFile, '-outform', 'DER', '-out', cerFile]);
openssl([
  'pkcs12', '-export', '-inkey', keyFile, '-in', certFile, '-out', p12File,
  '-passin', passArg, '-passout', passArg, '-name', 'TaxFlow Demo Signing',
]);
try { fs.chmodSync(keyFile, 0o600); fs.chmodSync(p12File, 0o600); } catch { /* Windows ไม่มีสิทธิ์แบบนี้ */ }

// ตรวจทันทีว่าระบบเปิดกุญแจด้วยรหัสผ่านนี้ได้จริง ก่อนผู้ใช้จะไปพบปัญหาตอนออกเอกสาร
const signer = pdfsign.loadSigner({ SIGN_KEY_PASSPHRASE: passphrase });
const b64 = (f) => fs.readFileSync(f).toString('base64');

console.log('\nสร้างเสร็จแล้ว');
console.log(`  ใบรับรอง: ${signer.subject}`);
console.log(`  ใช้ได้ถึง: ${signer.validTo.slice(0, 10)}`);
console.log(`  ลายนิ้วมือ SHA-256: ${signer.fingerprint}`);
console.log(`  ไฟล์อยู่ที่: ${dir}`);
console.log('\n==================== ทำขั้นตอนนี้ทันที ====================');
console.log('เพิ่มบรรทัดนี้ใน apps/api/.env (รหัสผ่านแสดงครั้งเดียว ไม่ได้บันทึกไว้ที่ใด)\n');
console.log(`SIGN_KEY_PASSPHRASE=${passphrase}`);
console.log('\n===========================================================');
console.log('\nตอนขึ้นคลาวด์ (WP7) ไม่มีดิสก์ถาวร ให้ตั้งตัวแปรแวดล้อมสองตัวนี้แทนไฟล์');
console.log('ค่าเป็น base64 ของไฟล์ pem ทั้งไฟล์ (กุญแจยังเข้ารหัสอยู่ จึงต้องตั้ง SIGN_KEY_PASSPHRASE ด้วย)');
console.log(`  SIGN_KEY_PEM_B64   (${b64(keyFile).length} ตัวอักษร)`);
console.log(`  SIGN_CERT_PEM_B64  (${b64(certFile).length} ตัวอักษร)`);
console.log('  คำสั่งดูค่า: node -e "console.log(require(\'fs\').readFileSync(\'apps/api/data/sign/taxflow-sign.key.pem\').toString(\'base64\'))"');
console.log('\nให้ Adobe Reader เชื่อถือใบรับรองนี้ตอนสาธิต (ไม่บังคับ):');
console.log(`  Edit > Preferences > Signatures > Identities & Trusted Certificates > More > Trusted Certificates > Import > ${path.basename(cerFile)}`);
