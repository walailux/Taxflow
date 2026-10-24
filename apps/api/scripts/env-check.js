'use strict';
/**
 * scripts/env-check.js ตรวจไฟล์ตั้งค่า apps/api/.env
 * ==================================================
 * บอกว่าระบบอ่านค่าอะไรได้บ้าง โดยปิดบังค่าจริงไว้ จึงเอาผลลัพธ์ไปถามใครก็ได้
 * ไม่ต้องกลัวรหัสผ่านหลุด
 *
 * จุดที่คนพลาดบ่อยที่สุดคือลืมลบเครื่องหมาย # หน้าบรรทัด
 * สคริปต์นี้จึงตรวจให้เป็นพิเศษว่าตัวแปรที่จำเป็นถูกปิดไว้ด้วย # หรือเปล่า
 *
 * วิธีใช้:  npm run env:check
 */

const fs = require('fs');
const { ENV_FILE } = require('./_env');

/** ปิดบังค่า เหลือให้เห็นพอยืนยันว่าใส่ถูกตัว */
function mask(key, value) {
  if (!value) return '(ว่าง)';
  if (/PASSWORD|SECRET|KEY/i.test(key)) {
    return value.length <= 8 ? '****' : `${value.slice(0, 4)}****${value.slice(-2)} (ยาว ${value.length})`;
  }
  if (key === 'DATABASE_URL') {
    // ซ่อนเฉพาะรหัสผ่าน ส่วนที่เหลือมีประโยชน์ตอนหาสาเหตุ
    return value.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
  }
  return value;
}

const GROUPS = [
  ['ฐานข้อมูล (WP3)', ['DATABASE_URL', 'PGPOOL_MAX', 'PGSSLMODE']],
  ['ที่เก็บไฟล์ (WP4)', ['S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET_PRIVATE', 'S3_BUCKET_PUBLIC']],
  ['หน้าเว็บและความปลอดภัย', ['PORT', 'WEB_ORIGINS', 'COOKIE_CROSS_SITE', 'PUBLIC_BASE_URL', 'GOOGLE_CLIENT_ID']],
  ['ลายมือชื่อดิจิทัล (WP6)', ['SIGN_KEY_PASSPHRASE', 'SIGN_KEY_PEM_B64', 'SIGN_CERT_PEM_B64']],
];

if (!fs.existsSync(ENV_FILE)) {
  console.log(`ไม่พบไฟล์ ${ENV_FILE}`);
  console.log('สร้างจากไฟล์ตัวอย่างก่อน:  copy infra\\.env.example apps\\api\\.env');
  process.exit(1);
}

const text = fs.readFileSync(ENV_FILE, 'utf8');
console.log(`ไฟล์: ${ENV_FILE} (${Buffer.byteLength(text)} ไบต์)\n`);

// หาบรรทัดที่ถูกปิดด้วย # ไว้ เพื่อเตือนเฉพาะตัวที่น่าจะตั้งใจเปิด
const commented = new Set();
for (const line of text.split('\n')) {
  const m = line.trim().match(/^#\s*([A-Z0-9_]+)\s*=/);
  if (m) commented.add(m[1]);
}

let problems = 0;
for (const [title, keys] of GROUPS) {
  console.log(title);
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== '') {
      console.log(`  [อ่านได้]  ${key} = ${mask(key, value)}`);
    } else if (commented.has(key)) {
      // ไม่นับเป็นปัญหา เพราะหลายตัวตั้งใจปิดไว้ (เป็นค่าทางเลือก)
      // ส่วนตัวที่จำเป็นจริง ๆ จะถูกสรุปให้อีกทีในหัวข้อ "ผลที่ระบบจะใช้จริง" ด้านล่าง
      console.log(`  [ปิดอยู่]  ${key} — บรรทัดนี้มี # นำหน้า ระบบจึงข้ามไป`);
    } else {
      console.log(`  [ไม่ได้ตั้ง] ${key}`);
    }
  }
  console.log('');
}

/* ---------- สรุปว่าตอนนี้ระบบจะทำงานแบบไหน ---------- */
console.log('ผลที่ระบบจะใช้จริง');
console.log(`  ฐานข้อมูล:  ${process.env.DATABASE_URL ? 'PostgreSQL (Supabase)' : 'SQLite ในเครื่อง'}`);
if (!process.env.DATABASE_URL && commented.has('DATABASE_URL')) {
  console.log('    ^ ตั้งใจจะใช้ Supabase ใช่ไหม ถ้าใช่ ให้ลบ # หน้าบรรทัด DATABASE_URL ออก');
}
const s3ready = process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;
console.log(`  ที่เก็บไฟล์: ${s3ready ? 'Supabase Storage' : 'ดิสก์ในเครื่อง (data/uploads)'}`);

if (process.env.S3_ENDPOINT && !s3ready) {
  console.log('\nตั้ง S3_ENDPOINT ไว้แล้วแต่ยังขาดคีย์ ระบบจะถอยไปใช้ดิสก์ในเครื่อง ต้องใส่ให้ครบทั้งสามค่า');
  problems++;
}
if (process.env.DATABASE_URL && /\[|\]|YOUR-PASSWORD/.test(process.env.DATABASE_URL)) {
  console.log('\nDATABASE_URL ยังมี [YOUR-PASSWORD] หรือวงเล็บเหลี่ยมค้างอยู่ ต้องแทนด้วยรหัสจริงและลบวงเล็บออก');
  problems++;
}
if (process.env.S3_ENDPOINT && !/\/storage\/v1\/s3$/.test(process.env.S3_ENDPOINT)) {
  console.log('\nS3_ENDPOINT ควรลงท้ายด้วย /storage/v1/s3 ตามที่หน้า Supabase แสดง');
  problems++;
}

/* ---------- ลายมือชื่อดิจิทัล (WP6) ---------- */
{
  const path = require('path');
  const keyFile = path.join(__dirname, '..', 'data', 'sign', 'taxflow-sign.key.pem');
  const hasKey = fs.existsSync(keyFile) || !!process.env.SIGN_KEY_PEM_B64;
  const lines = text.split(/\r?\n/);
  // จุดที่พลาดบ่อย: วางต่อท้ายบรรทัดสุดท้ายที่ไม่มีการขึ้นบรรทัดใหม่ บรรทัดนั้นมักเป็นคอมเมนต์
  // ผลคือ SIGN_KEY_PASSPHRASE กลายเป็นส่วนหนึ่งของคอมเมนต์ ระบบมองไม่เห็นโดยไม่มีอะไรเตือน
  // หาด้วย indexOf แทน regex /\S.*SIGN_KEY_PASSPHRASE\s*=/ ที่ backtrack ได้ช้า
  const KEY = 'SIGN_KEY_PASSPHRASE';
  const isGlued = (l) => {
    const t = l.trim();
    if (/^#?\s*SIGN_KEY_PASSPHRASE\s*=/.test(t)) return false;
    for (let at = t.indexOf(KEY, 1); at > 0; at = t.indexOf(KEY, at + 1)) {
      if (t.slice(at + KEY.length).trimStart().startsWith('=')) return true;
    }
    return false;
  };
  const glued = lines.find(isGlued);
  const spaced = lines.find((l) => /^\s+SIGN_KEY_PASSPHRASE\s*=/.test(l));
  let signState;
  if (!hasKey) signState = 'ปิด (ยังไม่ได้รัน npm run sign:setup)';
  else if (process.env.SIGN_KEY_PASSPHRASE) signState = 'พร้อม (มีกุญแจและรหัสผ่าน) เปิดเซิร์ฟเวอร์ใหม่ถ้ายังรันค้างอยู่';
  else signState = 'มีกุญแจแล้ว แต่ระบบอ่าน SIGN_KEY_PASSPHRASE ไม่เจอ';
  console.log(`  ลายมือชื่อ: ${signState}`);
  if (hasKey && !process.env.SIGN_KEY_PASSPHRASE) {
    problems++;
    if (glued) {
      console.log('\nพบ SIGN_KEY_PASSPHRASE ต่ออยู่ท้ายบรรทัดอื่น (มักเกิดจากวางต่อท้ายบรรทัดคอมเมนต์ที่ไม่มีการขึ้นบรรทัดใหม่)');
      console.log(`  บรรทัดนั้นขึ้นต้นว่า: ${glued.trim().slice(0, 30)}...`);
      console.log('  แก้: ตัดข้อความตั้งแต่ SIGN_KEY_PASSPHRASE= ไปไว้บรรทัดใหม่ของตัวเอง ชิดซ้ายสุด');
    } else if (spaced) {
      console.log('\nบรรทัด SIGN_KEY_PASSPHRASE มีช่องว่างนำหน้า ให้ลบช่องว่างออกให้ชิดซ้ายสุด');
    } else if (commented.has('SIGN_KEY_PASSPHRASE')) {
      console.log('\nบรรทัด SIGN_KEY_PASSPHRASE มี # นำหน้า ให้ลบ # ออก');
    } else {
      console.log('\nไม่พบบรรทัด SIGN_KEY_PASSPHRASE ในไฟล์นี้ ตรวจว่าแก้ไฟล์ถูกตัว');
      console.log(`  ไฟล์ที่ระบบอ่านคือ ${ENV_FILE}`);
      console.log('  (Notepad อาจบันทึกเป็น .env.txt ให้เลือก Save as type: All files ตอนบันทึก)');
    }
  }
}

console.log(problems ? `\nพบจุดที่ต้องแก้ ${problems} จุด` : '\nไม่พบปัญหาในไฟล์ตั้งค่า');
