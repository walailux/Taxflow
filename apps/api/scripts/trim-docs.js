'use strict';
/**
 * scripts/trim-docs.js ลดเอกสารของบัญชีที่ระบุให้เหลือตัวอย่างไม่กี่ฉบับ (ลดพื้นที่และ Egress ของ Supabase)
 * ============================================================================================
 * เลือกเก็บ: ฉบับล่าสุดของแต่ละประเภทเอกสาร (เรียงตามลำดับประเภทที่ใช้บ่อย) สูงสุด KEEP ฉบับต่อบัญชี
 *            ฉบับที่อนุมัติ/เก็บถาวรแล้วมาก่อน แบบร่างและยกเลิกเลือกทีหลัง
 * ลบพร้อมกัน: ประวัติเวอร์ชัน ไฟล์แนบ (แถวข้อมูล) คำขอส่งเอกสาร ลิงก์แชร์ การแจ้งเตือน ประวัติการทำงาน และนัดในปฏิทินที่ผูกกับฉบับที่ลบ
 * ก่อนลบสำรองทุกแถวที่จะลบไว้ที่ apps/api/data/backups/trim-<เวลา>.json (ไม่ขึ้น git)
 *
 * วิธีใช้ (ไม่ใส่ --apply = ดูอย่างเดียว ไม่ลบอะไร):
 *   node scripts/trim-docs.js --keep 5 email1 email2 ...
 *   node scripts/trim-docs.js --keep 5 --apply email1 email2 ...
 */
require('./_env');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const TYPE_ORDER = ['QUOTATION', 'INVOICE', 'RECEIPT', 'ETAX_INVOICE', 'ETAX_RECEIPT', 'DELIVERY', 'PO', 'PAYMENT', 'EWHT', 'WHT',
  'CONTRACT_INF', 'CONTRACT_BRAND', 'POA', 'PND3', 'PND53', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ETAX'];
const STATUS_RANK = { approved: 0, archived: 1, pending: 2, rejected: 3, draft: 4, cancelled: 5 };

function parseArgs(argv) {
  const out = { keep: 5, apply: false, emails: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--keep') out.keep = Number(argv[++i]);
    else out.emails.push(argv[i].trim().toLowerCase());
  }
  if (!out.emails.length || !(out.keep >= 1)) throw new Error('วิธีใช้: node scripts/trim-docs.js --keep 5 [--apply] <อีเมล> ...');
  return out;
}

/** เลือกฉบับที่เก็บ: ฉบับดีที่สุดของแต่ละประเภท (สถานะดีกว่า > ใหม่กว่า) ตามลำดับประเภท แล้วตัดเหลือ keep */
function pickKeep(docs, keep) {
  const best = new Map();
  for (const d of docs) {
    const cur = best.get(d.type);
    const rank = (x) => [STATUS_RANK[x.status] ?? 9, -Date.parse(x.createdAt || 0)];
    if (!cur || rank(d)[0] < rank(cur)[0] || (rank(d)[0] === rank(cur)[0] && rank(d)[1] < rank(cur)[1])) best.set(d.type, d);
  }
  const order = (t) => { const i = TYPE_ORDER.indexOf(t); return i === -1 ? TYPE_ORDER.length : i; };
  return [...best.values()].sort((a, b) => order(a.type) - order(b.type)).slice(0, keep);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const host = new URL(process.env.DATABASE_URL).hostname;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: ['localhost', '127.0.0.1'].includes(host) ? undefined : { rejectUnauthorized: false } });
  const q = async (sql, params) => (await pool.query(sql, params)).rows;
  try {
    const plan = [];
    for (const email of args.emails) {
      const [u] = await q(`SELECT id, data FROM users WHERE lower(email) = $1`, [email]);
      if (!u) { console.log(`ข้าม ${email}: ไม่พบบัญชี`); continue; }
      const docs = (await q(`SELECT data FROM documents WHERE "userId" = $1 ORDER BY id`, [u.id])).map((r) => r.data);
      const keep = pickKeep(docs, args.keep);
      const keepIds = new Set(keep.map((d) => d.id));
      const drop = docs.filter((d) => !keepIds.has(d.id)).map((d) => d.id);
      plan.push({ email, userId: u.id, total: docs.length, keep, drop });
      console.log(`${email} (#${u.id}): มี ${docs.length} ฉบับ → เก็บ ${keep.length} ลบ ${drop.length}`);
      for (const d of keep) console.log(`   เก็บ ${String(d.type).padEnd(14)} ${d.docNo || 'แบบร่าง'} (${d.status})`);
    }
    const dropIds = plan.flatMap((p) => p.drop);
    if (!dropIds.length) { console.log('\nไม่มีเอกสารที่ต้องลบ'); return; }

    // แถวที่ผูกกับเอกสารที่จะลบ (คอลัมน์ docId มีเฉพาะบางตาราง ที่เหลือดูใน JSON)
    const related = {
      doc_versions: `SELECT * FROM doc_versions WHERE "docId" = ANY($1::bigint[])`,
      attachments: `SELECT * FROM attachments WHERE "docId" = ANY($1::bigint[])`,
      requests: `SELECT * FROM requests WHERE "docId" = ANY($1::bigint[])`,
      shares: `SELECT * FROM shares WHERE "docId" = ANY($1::bigint[])`,
      audit_log: `SELECT * FROM audit_log WHERE "docId" = ANY($1::bigint[])`,
      notifications: `SELECT * FROM notifications WHERE (data->>'docId') ~ '^[0-9]+$' AND (data->>'docId')::bigint = ANY($1::bigint[])`,
      calendar_events: `SELECT * FROM calendar_events WHERE (data->>'docId') ~ '^[0-9]+$' AND (data->>'docId')::bigint = ANY($1::bigint[])`,
    };
    const backup = { at: new Date().toISOString(), documents: await q(`SELECT * FROM documents WHERE id = ANY($1::bigint[])`, [dropIds]) };
    for (const [t, sql] of Object.entries(related)) backup[t] = await q(sql, [dropIds]);
    console.log(`\nจะลบ: เอกสาร ${backup.documents.length}` + Object.keys(related).map((t) => ` · ${t} ${backup[t].length}`).join(''));
    const files = backup.attachments.length;
    if (files) console.log(`หมายเหตุ: ไฟล์แนบ ${files} ไฟล์ ลบเฉพาะแถวข้อมูล ไฟล์ในที่เก็บไฟล์ไม่ถูกลบ`);

    if (!args.apply) { console.log('\nยังไม่ได้ลบ (ดูอย่างเดียว) ใส่ --apply เพื่อลบจริง'); return; }

    const dir = path.join(__dirname, '..', 'data', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `trim-${backup.at.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(backup));
    console.log(`สำรองแถวที่จะลบไว้ที่ ${path.relative(process.cwd(), file)}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const t of Object.keys(related)) {
        const ids = backup[t].map((r) => r.id);
        if (ids.length) await client.query(`DELETE FROM ${t} WHERE id = ANY($1::bigint[])`, [ids]);
      }
      await client.query(`DELETE FROM documents WHERE id = ANY($1::bigint[])`, [dropIds]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    console.log('ลบเรียบร้อย');
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
