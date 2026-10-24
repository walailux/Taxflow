'use strict';
/**
 * scripts/sign-verify.js ตรวจลายมือชื่อดิจิทัลของไฟล์ PDF จากบรรทัดคำสั่ง (WP6)
 *   npm run sign:verify -- ไฟล์.pdf
 *
 * ใช้สาธิตเกณฑ์ตรวจรับ: แก้ไฟล์แม้ไบต์เดียวแล้วรันซ้ำ ต้องรายงานว่าถูกเปลี่ยนแปลง
 * ตรวจแบบเดียวกับหน้าตรวจสอบเอกสารและ POST /api/verify/pdf
 */
require('./_env');
const fs = require('fs');
const pdfsign = require('../lib/pdfsign');

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) { console.error('ใช้: npm run sign:verify -- ไฟล์.pdf'); process.exit(2); }
const signer = pdfsign.systemSigner();
const v = pdfsign.verify(fs.readFileSync(file), { trustedFingerprint: signer ? signer.fingerprint : null });

const mark = (ok) => (ok ? 'ผ่าน ' : 'ไม่ผ่าน');
console.log(`ไฟล์: ${file}`);
if (!v.signed) { console.log('ไม่มีลายมือชื่อดิจิทัล'); process.exit(1); }
console.log(`  ผู้ลงนาม          ${v.name || '-'}`);
console.log(`  เวลาที่ลงนาม      ${v.signedAt || '-'}`);
console.log(`  ใบรับรอง          ${v.signer ? v.signer.subject : '-'}${v.signer && v.signer.selfSigned ? ' (ออกเอง)' : ''}`);
console.log(`  [${mark(v.intact)}] ไฟล์ไม่ถูกแก้ไขหลังลงนาม และลายมือชื่อถูกต้อง`);
console.log(`  [${mark(v.coversWhole)}] ลายมือชื่อครอบคลุมทั้งไฟล์`);
console.log(`  [${mark(v.trusted)}] ใบรับรองเป็นของระบบนี้${signer ? '' : ' (เครื่องนี้ยังไม่ได้ตั้งค่าใบรับรอง จึงเทียบไม่ได้)'}`);
for (const p of v.problems) console.log(`  - ${p}`);
process.exit(v.intact && v.coversWhole ? 0 : 1);
