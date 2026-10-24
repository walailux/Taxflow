'use strict';
/**
 * scripts/backup-db.js ส่งออกข้อมูลทั้งฐานเป็นไฟล์ JSON (WP3)
 * ==========================================================
 * ทำไมต้องมี: แผนฟรีของ Supabase ไม่มีไฟล์สำรองอัตโนมัติให้ดาวน์โหลด
 * ถ้าโปรเจกต์ถูกลบ ถูกพัก หรือกดผิดจนข้อมูลหาย จะกู้กลับไม่ได้เลย
 * สคริปต์นี้จึงดึงทุกตารางออกมาเก็บเป็นไฟล์เดียว เอาไว้รันเป็นระยะก่อนวันนำเสนอ
 *
 * วิธีใช้
 *   node scripts/backup-db.js                  เก็บไว้ที่ backups/taxflow-YYYY-MM-DD-HHmm.json
 *   node scripts/backup-db.js path/to/file.json
 *
 * ใช้ได้ทั้งตอนที่ระบบชี้ SQLite และชี้ PostgreSQL (อ่านผ่านชั้น store เดียวกัน)
 *
 * ข้อจำกัดที่ต้องรู้: ไฟล์นี้สำรองเฉพาะ "ข้อมูลในฐานข้อมูล" ไม่รวมไฟล์ที่อัปโหลด
 * ไฟล์ที่อัปโหลดอยู่บน Supabase Storage ต้องสำรองแยกต่างหาก
 */

require('./_env');
const fs = require('fs');
const path = require('path');

const TABLES = [
  'users', 'documents', 'contacts', 'attachments', 'doc_versions', 'audit_log',
  'notifications', 'shares', 'library', 'signatures', 'requests', 'otp_codes',
  'kyc_documents', 'consents', 'calendar_events', 'calendar_overrides',
];

const store = process.env.DATABASE_URL ? require('../lib/store.pg') : require('../lib/store');

function defaultTarget() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const name = `taxflow-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  return path.join(__dirname, '..', 'backups', name);
}

async function main() {
  const target = process.argv.find((a) => a.endsWith('.json')) || defaultTarget();
  await store.ensureReady();

  const dump = {
    exportedAt: new Date().toISOString(),
    source: process.env.DATABASE_URL ? 'postgresql' : 'sqlite',
    tables: {},
  };

  let total = 0;
  for (const table of TABLES) {
    try {
      const rows = await store.all(table);
      dump.tables[table] = rows;
      total += rows.length;
      console.log(`${table.padEnd(20)} ${String(rows.length).padStart(6)} แถว`);
    } catch (err) {
      console.warn(`${table.padEnd(20)} อ่านไม่ได้: ${err.message}`);
    }
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(dump, null, 2));
  const mb = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
  console.log(`\nสำรองข้อมูลแล้ว ${total} แถว -> ${target} (${mb} MB)`);
  console.log('เก็บไฟล์นี้ไว้นอกที่เก็บโค้ด เพราะมีข้อมูลส่วนบุคคลของผู้ใช้อยู่ด้วย');

  if (store.close) await store.close();
}

main().catch((err) => {
  console.error('สำรองข้อมูลไม่สำเร็จ:', err.message);
  process.exit(1);
});
