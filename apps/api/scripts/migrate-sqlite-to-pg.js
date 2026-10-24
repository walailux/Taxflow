'use strict';
/**
 * scripts/migrate-sqlite-to-pg.js ย้ายข้อมูลจาก taxflow.db เดิมขึ้น PostgreSQL (WP3)
 * ==============================================================================
 * เหตุผล: บัญชีทดลอง เอกสารตัวอย่าง และประวัติที่กรอกไว้ตั้งแต่ ver14 อยู่ในไฟล์ SQLite
 * ถ้าไม่ย้าย ระบบบนคลาวด์จะเริ่มจากศูนย์ และเอกสารที่เคยใช้สาธิตจะหายหมด
 *
 * สิ่งที่สคริปต์นี้รักษาไว้
 *   - id เดิมทุกแถว  เพราะข้อมูลอ้างอิงกันด้วย id (documents.userId, attachments.docId ฯลฯ)
 *     ถ้าปล่อยให้ PostgreSQL ออก id ใหม่ ความสัมพันธ์ทั้งหมดจะพัง
 *   - ค่าในคอลัมน์ data (JSONB) เหมือนเดิมทุกตัวอักษร
 *   - ตัวนับเลขที่เอกสารในตาราง counters  เพื่อไม่ให้เลขที่เอกสารย้อนกลับไปชนของเดิม
 *
 * หลังย้ายเสร็จจะปรับ sequence ของทุกตารางให้ชี้เลยค่า id สูงสุด
 * มิฉะนั้นการ insert ครั้งถัดไปจะชนกับ id ที่มีอยู่แล้วทันที
 *
 * วิธีใช้ — โดยค่าเริ่มต้นสคริปต์นี้ "ไม่เขียนอะไรเลย" เพียงรายงานว่าจะย้ายอะไรบ้าง
 *   npm run db:migrate            ดูรายงานอย่างเดียว ปลอดภัยเสมอ
 *   npm run db:migrate -- --apply ย้ายจริง
 *   เพิ่ม --force เพื่อยอมล้างตารางปลายทางที่มีข้อมูลอยู่แล้วก่อนย้าย
 *
 * ที่ต้องพิมพ์ --apply เพราะการย้ายข้อมูลเป็นงานที่ย้อนกลับไม่ได้
 * ถ้าค่าเริ่มต้นคือ "ย้ายเลย" การพิมพ์คำสั่งผิดครั้งเดียวก็เขียนทับข้อมูลได้ทันที
 *
 * ต้องรัน scripts/db-setup.js สร้างตารางให้เรียบร้อยก่อน
 */

require('./_env');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const TABLES = [
  'users', 'documents', 'contacts', 'attachments', 'doc_versions', 'audit_log',
  'notifications', 'shares', 'library', 'signatures', 'requests', 'otp_codes',
  'kyc_documents', 'consents', 'calendar_events', 'calendar_overrides',
];

// คอลัมน์ที่คัดออกมาเป็นคอลัมน์จริง ต้องตรงกับ INDEXED ใน lib/store.js และ lib/store.pg.js
const INDEXED = {
  users: ['email'],
  documents: ['userId', 'type'],
  contacts: ['userId'],
  attachments: ['userId', 'docId'],
  doc_versions: ['docId'],
  audit_log: ['userId', 'docId'],
  notifications: ['userId'],
  shares: ['token', 'docId'],
  library: ['userId', 'category'],
  signatures: ['userId'],
  requests: ['docId', 'fromUserId', 'toUserId'],
  otp_codes: ['userId', 'purpose'],
  kyc_documents: ['userId', 'docType'],
  consents: ['userId'],
  calendar_events: ['userId'],
  calendar_overrides: ['userId'],
};

const APPLY = process.argv.includes('--apply');
const DRY = !APPLY; // ไม่ใส่ --apply = โหมดรายงานอย่างเดียว
const FORCE = process.argv.includes('--force');

async function main() {
  const dataDir = process.env.TAXFLOW_DATA_DIR
    ? path.resolve(process.env.TAXFLOW_DATA_DIR)
    : path.join(__dirname, '..', 'data');
  const dbFile = path.join(dataDir, 'taxflow.db');

  if (!fs.existsSync(dbFile)) {
    console.error(`ไม่พบไฟล์ ${dbFile} — ถ้าฐานข้อมูลเดิมอยู่ที่อื่น ให้ตั้ง TAXFLOW_DATA_DIR ชี้ไปที่โฟลเดอร์นั้น`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('ไม่พบ DATABASE_URL — ตั้งค่าใน apps/api/.env ก่อน\n' +
      'ตรวจไฟล์ตั้งค่าด้วย:  npm run env:check  (จุดที่พลาดบ่อยคือลืมลบเครื่องหมาย # หน้าบรรทัด)');
    process.exit(1);
  }

  const sqlite = new DatabaseSync(dbFile, { readOnly: true });
  const { Pool } = require('pg');
  const host = new URL(process.env.DATABASE_URL).hostname;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: ['localhost', '127.0.0.1'].includes(host) ? undefined : { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    /* ---------- 1) สำรวจต้นทางและปลายทางก่อน ---------- */
    const plan = [];
    for (const table of TABLES) {
      let src = 0;
      try {
        src = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      } catch { continue; } // ตารางนี้ไม่มีในฐานข้อมูลเดิม (เช่นสร้างก่อน ver17)
      const { rows } = await client.query(`SELECT COUNT(*) AS n FROM ${table}`);
      plan.push({ table, src: Number(src), dest: Number(rows[0].n) });
    }

    console.log('ตาราง'.padEnd(20), 'SQLite'.padStart(8), 'ปลายทางเดิม'.padStart(14));
    for (const p of plan) {
      console.log(p.table.padEnd(20), String(p.src).padStart(8), String(p.dest).padStart(14));
    }

    const occupied = plan.filter((p) => p.dest > 0);
    if (occupied.length && !FORCE && !DRY) {
      console.error(
        `\nปลายทางมีข้อมูลอยู่แล้วใน ${occupied.length} ตาราง หยุดไว้ก่อนเพื่อกันเขียนทับโดยไม่ตั้งใจ\n` +
        'ถ้าตั้งใจจะล้างแล้วย้ายใหม่ ให้รันซ้ำพร้อม --force'
      );
      process.exit(1);
    }
    if (DRY) {
      console.log('\nโหมดรายงานอย่างเดียว ยังไม่เขียนอะไรลงปลายทาง');
      console.log('ถ้าตัวเลขข้างบนถูกต้องแล้ว ให้รัน:  npm run db:migrate -- --apply');
      return;
    }

    /* ---------- 2) ย้ายทีละตารางภายใน transaction เดียว ---------- */
    await client.query('BEGIN');

    if (FORCE) {
      // ลบย้อนลำดับเพื่อไม่ให้ติด foreign key (schema ปัจจุบันยังไม่มี FK แต่กันไว้เผื่ออนาคต)
      for (const table of [...TABLES].reverse()) {
        await client.query(`DELETE FROM ${table}`);
      }
      await client.query('DELETE FROM counters');
    }

    let total = 0;
    for (const { table, src } of plan) {
      if (!src) continue;
      const cols = INDEXED[table] || [];
      const rows = sqlite.prepare(`SELECT id, ${cols.join(', ')}${cols.length ? ',' : ''} data FROM ${table} ORDER BY id ASC`).all();

      const colNames = ['id', ...cols.map((c) => `"${c}"`), 'data'];
      for (const row of rows) {
        const values = [Number(row.id), ...cols.map((c) => row[c] ?? null), row.data];
        const holders = values.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${table} (${colNames.join(', ')}) VALUES (${holders})`,
          values
        );
      }
      total += rows.length;
      console.log(`ย้าย ${table}: ${rows.length} แถว`);
    }

    /* ---------- 3) ตัวนับเลขที่เอกสาร ---------- */
    const counters = sqlite.prepare('SELECT key, value FROM counters').all();
    for (const c of counters) {
      await client.query(
        `INSERT INTO counters (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = GREATEST(counters.value, EXCLUDED.value)`,
        [c.key, Number(c.value)]
      );
    }
    console.log(`ย้าย counters: ${counters.length} รายการ`);

    /* ---------- 4) ดัน sequence ให้เลยค่า id สูงสุด ---------- */
    for (const { table, src } of plan) {
      if (!src) continue;
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
        [table]
      );
    }

    await client.query('COMMIT');
    console.log(`\nย้ายข้อมูลสำเร็จ รวม ${total} แถว`);
    console.log('ตรวจต่อ: เข้าสู่ระบบด้วยบัญชีเดิม แล้วดูว่าเอกสารเก่ายังอยู่ครบและเลขที่เอกสารใหม่เดินต่อจากของเดิม');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error('ย้ายข้อมูลไม่สำเร็จ (ยกเลิกทั้งหมดแล้ว ปลายทางไม่เปลี่ยนแปลง):', err.message);
  process.exit(1);
});
