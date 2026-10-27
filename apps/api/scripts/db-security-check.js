'use strict';
/**
 * scripts/db-security-check.js ตรวจความปลอดภัยของตารางบน PostgreSQL/Supabase (อ่านอย่างเดียว ไม่แก้อะไร)
 * - บทบาทที่แอปใช้เชื่อมต่อ และเป็นเจ้าของตารางหรือไม่ (เจ้าของตารางไม่ถูก RLS จำกัด แอปจึงทำงานต่อได้)
 * - ตารางใน schema public ที่ยังไม่เปิด Row Level Security
 * - สิทธิ์ของบทบาท anon / authenticated (API สาธารณะของ Supabase) บนตารางเหล่านั้น
 *
 * วิธีใช้:  node scripts/db-security-check.js   (อ่าน DATABASE_URL จาก apps/api/.env)
 */
require('./_env');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('ไม่พบ DATABASE_URL');
  const host = new URL(process.env.DATABASE_URL).hostname;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: ['localhost', '127.0.0.1'].includes(host) ? undefined : { rejectUnauthorized: false },
  });
  try {
    const me = (await pool.query('SELECT current_user AS u, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass')).rows[0];
    console.log(`เชื่อมต่อด้วยบทบาท: ${me.u} (ข้าม RLS ได้: ${me.bypass ? 'ใช่' : 'ไม่'})`);
    const tables = (await pool.query(`
      SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`)).rows;
    for (const t of tables) {
      console.log(`${t.rls ? '✔' : '✖'} ${t.name.padEnd(20)} เจ้าของ ${t.owner.padEnd(10)} RLS ${t.rls ? 'เปิด' : 'ปิด'} · anon อ่านได้ ${t.anon_select ? 'ใช่' : 'ไม่'} · authenticated อ่านได้ ${t.auth_select ? 'ใช่' : 'ไม่'}`);
    }
    const off = tables.filter((t) => !t.rls).length;
    console.log(off ? `\nยังไม่เปิด RLS ${off} ตาราง` : '\nเปิด RLS ครบทุกตารางแล้ว');
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
