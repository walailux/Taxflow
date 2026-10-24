'use strict';
/**
 * scripts/db-setup.js สร้างโครงสร้างตารางบน PostgreSQL (WP3)
 * ============================================================
 * รันสคริปต์ SQL ใน sql/postgres-schema.sql ผ่าน driver `pg` โดยตรง
 * จึงไม่ต้องติดตั้ง psql ในเครื่อง
 *
 * วิธีใช้
 *   DATABASE_URL="postgresql://..." node scripts/db-setup.js
 *   หรือ  npm run db:setup -w @taxflow/api   (อ่าน .env ให้เอง)
 *
 * ปลอดภัยที่จะรันซ้ำ เพราะทุกคำสั่งในไฟล์ schema เป็น CREATE ... IF NOT EXISTS
 */

require('./_env');
const fs = require('fs');
const path = require('path');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ไม่พบ DATABASE_URL — ตั้งค่าใน apps/api/.env หรือส่งผ่าน environment variable ก่อน\n' +
      'ตรวจไฟล์ตั้งค่าด้วย:  npm run env:check  (จุดที่พลาดบ่อยคือลืมลบเครื่องหมาย # หน้าบรรทัด)');
    process.exit(1);
  }

  let Pool;
  try { ({ Pool } = require('pg')); } catch {
    console.error("ไม่พบแพ็กเกจ 'pg' ติดตั้งด้วย `npm install pg -w @taxflow/api` ก่อน");
    process.exit(1);
  }

  const schemaFile = path.join(__dirname, '..', 'sql', 'postgres-schema.sql');
  const sql = fs.readFileSync(schemaFile, 'utf8');

  const host = new URL(process.env.DATABASE_URL).hostname;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: ['localhost', '127.0.0.1'].includes(host) ? undefined : { rejectUnauthorized: false },
  });

  console.log(`เชื่อมต่อ ${host} ...`);
  const client = await pool.connect();
  try {
    await client.query(sql);
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log(`สร้างโครงสร้างเรียบร้อย พบ ${rows.length} ตาราง:`);
    console.log('  ' + rows.map((r) => r.table_name).join(', '));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('สร้างโครงสร้างไม่สำเร็จ:', err.message);
  process.exit(1);
});
