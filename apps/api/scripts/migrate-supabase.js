'use strict';
/**
 * scripts/migrate-supabase.js ย้ายข้อมูลทั้งหมดจากโปรเจกต์ Supabase เดิมไปโปรเจกต์ใหม่
 * ==================================================================================
 * คัดลอก (ไม่ลบอะไรจากต้นทาง):
 *   1) ทุกตารางใน schema public: คง id เดิมทุกแถว แล้วตั้งตัวนับ id ของปลายทางให้ต่อจากค่าสูงสุด
 *   2) ไฟล์ใน Storage ทั้ง bucket ส่วนตัวและสาธารณะ (ข้ามไฟล์ที่ปลายทางมีอยู่แล้ว ขนาดเท่ากัน)
 * ไฟล์ที่เข้ารหัสไว้ (.enc) คัดลอกไบต์เดิม จึงต้องใช้กุญแจเดิม (data/file.key และ SIGN_KEY_PASSPHRASE) ห้ามเปลี่ยน
 *
 * ตั้งค่าใน apps/api/.env (หรือ environment variable)
 *   ปลายทาง (โปรเจกต์ใหม่):  DATABASE_URL · S3_ENDPOINT · S3_REGION · S3_ACCESS_KEY_ID · S3_SECRET_ACCESS_KEY · S3_BUCKET_PRIVATE · S3_BUCKET_PUBLIC
 *   ต้นทาง (โปรเจกต์เดิม):    SOURCE_DATABASE_URL · SOURCE_S3_ENDPOINT · SOURCE_S3_REGION · SOURCE_S3_ACCESS_KEY_ID · SOURCE_S3_SECRET_ACCESS_KEY
 *                             (SOURCE_S3_BUCKET_PRIVATE / SOURCE_S3_BUCKET_PUBLIC ไม่ใส่ = ชื่อเดียวกับปลายทาง)
 *   ไม่ตั้ง SOURCE_S3_* = ย้ายเฉพาะฐานข้อมูล
 *
 * ขั้นตอน
 *   1) npm run db:setup                         สร้างตารางในโปรเจกต์ใหม่ (พร้อมเปิด RLS)
 *   2) node scripts/migrate-supabase.js          ดูรายงานอย่างเดียว ไม่เขียนอะไร
 *   3) node scripts/migrate-supabase.js --apply  คัดลอกจริง (ตารางปลายทางต้องว่าง กันข้อมูลซ้ำ)
 *      ถ้าปลายทางมีข้อมูลที่ระบบสร้างเองตอนเปิด API ครั้งแรก (บัญชีสาธิต @taxflow.test) ใส่ --clear-target
 *      เพื่อล้างตารางของ "ปลายทาง" ก่อนคัดลอก (ไม่แตะต้นทาง) · หยุด API ที่ชี้ปลายทางก่อนย้ายเสมอ
 *   4) node scripts/db-security-check.js         ตรวจ RLS ของโปรเจกต์ใหม่
 */
require('./_env');
const { Pool } = require('pg');

const TABLES = [
  'users', 'documents', 'contacts', 'attachments', 'doc_versions', 'audit_log', 'notifications', 'shares',
  'library', 'signatures', 'requests', 'counters', 'otp_codes', 'kyc_documents', 'consents', 'calendar_events', 'calendar_overrides',
];
const BATCH = 200;
const APPLY = process.argv.includes('--apply');
const CLEAR_TARGET = process.argv.includes('--clear-target');

function poolFor(url) {
  const host = new URL(url).hostname;
  return new Pool({ connectionString: url, ssl: ['localhost', '127.0.0.1'].includes(host) ? undefined : { rejectUnauthorized: false }, max: 2 });
}
const hostOf = (url) => { try { return new URL(url).hostname + ' / ' + decodeURIComponent(new URL(url).username); } catch { return '(อ่านไม่ได้)'; } };
const q = (c) => `"${c}"`;

async function columnsOf(pool, table) {
  const { rows } = await pool.query(
    `SELECT column_name AS c, data_type AS t FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]);
  return rows;
}

async function copyTable(src, dst, table) {
  const cols = await columnsOf(dst, table);
  if (!cols.length) throw new Error(`ปลายทางยังไม่มีตาราง ${table} (รัน npm run db:setup ก่อน)`);
  const srcCols = new Set((await columnsOf(src, table)).map((x) => x.c));
  const use = cols.filter((x) => srcCols.has(x.c));
  const [{ n: srcCount }] = (await src.query(`SELECT count(*)::int AS n FROM ${table}`)).rows;
  const [{ n: dstCount }] = (await dst.query(`SELECT count(*)::int AS n FROM ${table}`)).rows;
  if (!APPLY) return { table, srcCount, dstCount, copied: 0 };
  if (dstCount > 0) throw new Error(`ตาราง ${table} ในปลายทางมีข้อมูลอยู่แล้ว ${dstCount} แถว (ย้ายซ้ำจะได้ข้อมูลซ้ำ) ล้างตารางปลายทางก่อนถ้าต้องการย้ายใหม่`);
  const hasId = use.some((x) => x.c === 'id');
  const order = hasId ? 'ORDER BY id' : '';
  let copied = 0;
  for (let offset = 0; offset < srcCount; offset += BATCH) {
    const { rows } = await src.query(`SELECT ${use.map((x) => q(x.c)).join(', ')} FROM ${table} ${order} LIMIT ${BATCH} OFFSET ${offset}`);
    if (!rows.length) break;
    const values = [];
    const tuples = rows.map((r) => `(${use.map((x) => {
      const v = r[x.c];
      values.push(x.t === 'jsonb' || x.t === 'json' ? (v == null ? null : JSON.stringify(v)) : v);
      return `$${values.length}`;
    }).join(', ')})`);
    await dst.query(`INSERT INTO ${table} (${use.map((x) => q(x.c)).join(', ')}) VALUES ${tuples.join(', ')}`, values);
    copied += rows.length;
  }
  // ตัวนับ id ของปลายทางต่อจากค่าสูงสุด (แถวใหม่จะไม่ชน id เดิม)
  if (hasId) await dst.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), 1), (SELECT COUNT(*) > 0 FROM ${table}))`);
  return { table, srcCount, dstCount, copied };
}

/* ---------- Storage ---------- */
function s3For(prefix) {
  const env = (k) => process.env[`${prefix}${k}`];
  if (!env('S3_ENDPOINT')) return null;
  const { S3Client } = require('@aws-sdk/client-s3');
  return {
    client: new S3Client({
      forcePathStyle: true, endpoint: env('S3_ENDPOINT'), region: env('S3_REGION') || 'us-east-1',
      credentials: { accessKeyId: env('S3_ACCESS_KEY_ID') || '', secretAccessKey: env('S3_SECRET_ACCESS_KEY') || '' },
    }),
    endpoint: env('S3_ENDPOINT'),
    buckets: {
      private: env('S3_BUCKET_PRIVATE') || process.env.S3_BUCKET_PRIVATE || 'taxflow-private',
      public: env('S3_BUCKET_PUBLIC') || process.env.S3_BUCKET_PUBLIC || 'taxflow-public',
    },
  };
}

async function listAll(s3, bucket) {
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const out = [];
  let token;
  do {
    const r = await s3.client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const o of r.Contents || []) out.push({ key: o.Key, size: o.Size });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function copyBucket(src, dst, kind) {
  const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
  const from = src.buckets[kind];
  const to = dst.buckets[kind];
  const objects = await listAll(src, from);
  const existing = new Map((await listAll(dst, to)).map((o) => [o.key, o.size]));
  const todo = objects.filter((o) => existing.get(o.key) !== o.size);
  const bytes = todo.reduce((s, o) => s + o.size, 0);
  console.log(`  ${kind}: ${from} → ${to} · ต้นทาง ${objects.length} ไฟล์ · ต้องคัดลอก ${todo.length} ไฟล์ (${(bytes / 1048576).toFixed(1)} MB)`);
  if (!APPLY) return;
  let done = 0;
  for (const o of todo) {
    const got = await src.client.send(new GetObjectCommand({ Bucket: from, Key: o.key }));
    const body = Buffer.from(await got.Body.transformToByteArray());
    await dst.client.send(new PutObjectCommand({ Bucket: to, Key: o.key, Body: body, ContentType: got.ContentType || 'application/octet-stream' }));
    done++;
    if (done % 20 === 0) console.log(`    คัดลอกแล้ว ${done}/${todo.length}`);
  }
  console.log(`    คัดลอกครบ ${done} ไฟล์`);
}

async function main() {
  const SRC = process.env.SOURCE_DATABASE_URL;
  const DST = process.env.DATABASE_URL;
  if (!SRC || !DST) throw new Error('ต้องตั้ง SOURCE_DATABASE_URL (โปรเจกต์เดิม) และ DATABASE_URL (โปรเจกต์ใหม่)');
  if (SRC === DST) throw new Error('SOURCE_DATABASE_URL กับ DATABASE_URL ชี้ฐานข้อมูลเดียวกัน');
  console.log(`ต้นทาง:  ${hostOf(SRC)}\nปลายทาง: ${hostOf(DST)}\n${APPLY ? 'โหมดคัดลอกจริง' : 'โหมดดูรายงานอย่างเดียว (ใส่ --apply เพื่อคัดลอกจริง)'}\n`);

  const src = poolFor(SRC);
  const dst = poolFor(DST);
  try {
    if (APPLY && CLEAR_TARGET) {
      // ล้างเฉพาะปลายทาง (โปรเจกต์ใหม่) และรีเซ็ตตัวนับ id ให้เริ่มใหม่ ต้นทางไม่ถูกแตะ
      await dst.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY`);
      console.log('ล้างตารางปลายทางแล้ว\n');
    }
    console.log('ฐานข้อมูล:');
    for (const t of TABLES) {
      const r = await copyTable(src, dst, t);
      console.log(`  ${t.padEnd(20)} ต้นทาง ${String(r.srcCount).padStart(6)} แถว · ปลายทางก่อนคัดลอก ${r.dstCount}${APPLY ? ` · คัดลอก ${r.copied}` : ''}`);
    }
  } finally {
    await src.end();
    await dst.end();
  }

  const s3src = s3For('SOURCE_');
  const s3dst = s3For('');
  if (!s3src || !s3dst) { console.log('\nStorage: ข้าม (ตั้ง SOURCE_S3_* และ S3_* ให้ครบถ้าต้องการย้ายไฟล์)'); return; }
  if (s3src.endpoint === s3dst.endpoint) { console.log('\nStorage: ข้าม (SOURCE_S3_ENDPOINT กับ S3_ENDPOINT เป็นที่เดียวกัน)'); return; }
  console.log('\nStorage:');
  await copyBucket(s3src, s3dst, 'private');
  await copyBucket(s3src, s3dst, 'public');
  if (APPLY) console.log('\nย้ายเสร็จ ตรวจ RLS ด้วย node scripts/db-security-check.js');
}

main().catch((err) => { console.error(`\n✖ ${err.message}`); process.exit(1); });
