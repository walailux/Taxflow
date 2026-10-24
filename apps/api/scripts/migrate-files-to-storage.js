'use strict';
/**
 * scripts/migrate-files-to-storage.js ย้ายไฟล์เดิมใน data/uploads ขึ้นที่เก็บไฟล์บนคลาวด์ (WP4)
 * ==========================================================================================
 * ต้องทำอะไรบ้าง
 * 1) ไฟล์ที่ระบบเดิมเข้ารหัสไว้แล้ว (ชื่อลงท้าย .enc — เอกสาร KYC, คลังเอกสาร, ไฟล์แนบปฏิทิน)
 *    อัปโหลดไบต์เดิมขึ้นไปตรง ๆ ชื่อไฟล์ไม่เปลี่ยน ฐานข้อมูลจึงไม่ต้องแก้
 * 2) ไฟล์ที่ระบบเดิม "ไม่ได้" เข้ารหัส (ไฟล์แนบเอกสาร โลโก้ และตราประทับ) ต้องเข้ารหัสก่อนอัปโหลด
 *    ซึ่งทำให้ชื่อไฟล์เปลี่ยนไป (เติม .enc ต่อท้าย) จึงต้องตามไปแก้ storedName ในฐานข้อมูลด้วย
 *    ไม่อย่างนั้นระบบจะหาไฟล์ไม่เจอหลังย้าย
 *
 * จุดที่ฐานข้อมูลเก็บชื่อไฟล์ไว้
 *   users.logoFile.storedName / users.sealFile.storedName
 *   attachments.storedName · kyc_documents.storedName · library.storedName
 *   calendar_events.attachments[].storedName · calendar_overrides.attachments[].storedName
 *
 * วิธีใช้ — โดยค่าเริ่มต้นสคริปต์นี้ "ไม่เขียนอะไรเลย" เพียงรายงานว่าจะทำอะไรบ้าง
 *   npm run files:migrate             ดูรายงานอย่างเดียว ปลอดภัยเสมอ
 *   npm run files:migrate -- --apply  ย้ายจริง
 * (ตั้งค่า S3_* และ DATABASE_URL ใน apps/api/.env ให้ครบก่อน)
 *
 * รันซ้ำได้ ไฟล์ที่ย้ายไปแล้วจะถูกข้าม ไฟล์ต้นทางใน data/uploads ไม่ถูกลบ
 * (ลบเองหลังตรวจแล้วว่าระบบบนคลาวด์เปิดไฟล์ได้ครบ)
 */

require('./_env');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const DRY = !APPLY; // ไม่ใส่ --apply = โหมดรายงานอย่างเดียว

const storage = require('../lib/storage');
const filestore = require('../lib/filestore');
const store = process.env.DATABASE_URL ? require('../lib/store.pg') : require('../lib/store');

const stats = { alreadyEncrypted: 0, encryptedNow: 0, missing: 0, skipped: 0, dbUpdated: 0 };

/** อัปโหลดไฟล์หนึ่งไฟล์ คืนชื่อไฟล์ใหม่ (เปลี่ยนเมื่อไฟล์เดิมยังไม่เข้ารหัส) หรือ null ถ้าหาไฟล์ไม่เจอ */
async function moveOne(storedName, label) {
  if (!storedName) return null;
  const src = path.join(storage.LOCAL_DIR, storedName);
  if (!fs.existsSync(src)) {
    console.warn(`  ข้าม ${label}: ไม่พบไฟล์ ${storedName}`);
    stats.missing++;
    return null;
  }
  const raw = fs.readFileSync(src);

  if (storage.isEncrypted(storedName)) {
    // เข้ารหัสไว้แล้ว อัปโหลดไบต์เดิมขึ้นไปโดยไม่เข้ารหัสซ้ำ ชื่อไฟล์คงเดิม
    if (!DRY) await storage._backend.put(storedName, raw, storage._bucketOf('private'), 'application/octet-stream');
    stats.alreadyEncrypted++;
    console.log(`  คงชื่อเดิม ${label}: ${storedName}`);
    return null;
  }

  // ไฟล์เปล่าจาก ver17.2 เข้ารหัสก่อนอัปโหลด และได้ชื่อใหม่
  const newName = storedName + '.enc';
  if (!DRY) await storage._backend.put(newName, filestore.encrypt(raw), storage._bucketOf('private'), 'application/octet-stream');
  stats.encryptedNow++;
  console.log(`  เข้ารหัสแล้วอัปโหลด ${label}: ${storedName} -> ${newName}`);
  return newName;
}

/** ไฟล์เดี่ยวที่เก็บชื่อไว้ในฟิลด์ storedName ของแถวนั้นตรง ๆ */
async function migrateSimpleTable(table, label) {
  const rows = await store.all(table);
  for (const row of rows) {
    if (!row.storedName) continue;
    const newName = await moveOne(row.storedName, `${label} #${row.id}`);
    if (newName && !DRY) {
      await store.update(table, row.id, { storedName: newName });
      stats.dbUpdated++;
    }
  }
}

/** ไฟล์แนบที่เก็บเป็น array อยู่ในแถวเดียว (ปฏิทิน) */
async function migrateAttachmentArray(table, label) {
  const rows = await store.all(table);
  for (const row of rows) {
    const list = row.attachments || [];
    if (!list.length) continue;
    let changed = false;
    const updated = [];
    for (const f of list) {
      const newName = await moveOne(f.storedName, `${label} #${row.id}`);
      if (newName) { updated.push({ ...f, storedName: newName }); changed = true; }
      else updated.push(f);
    }
    if (changed && !DRY) {
      await store.update(table, row.id, { attachments: updated });
      stats.dbUpdated++;
    }
  }
}

/** โลโก้และตราประทับที่ฝังอยู่ในโปรไฟล์ผู้ใช้ */
async function migrateBrandImages() {
  const users = await store.all('users');
  for (const u of users) {
    const patch = {};
    for (const field of ['logoFile', 'sealFile', 'avatarFile']) {
      const meta = u[field];
      if (!meta || !meta.storedName) continue;
      const newName = await moveOne(meta.storedName, `${field} ของผู้ใช้ #${u.id}`);
      if (newName) patch[field] = { ...meta, storedName: newName };
    }
    if (Object.keys(patch).length && !DRY) {
      await store.update('users', u.id, patch);
      stats.dbUpdated++;
    }
  }
}

async function main() {
  const info = storage.info();
  if (info.driver !== 's3' && !DRY) {
    console.error(
      'ยังไม่ได้ตั้งค่า S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY\n' +
      'ตอนนี้ปลายทางยังเป็นดิสก์ในเครื่อง จึงไม่มีอะไรให้ย้าย ตั้งค่าใน apps/api/.env ก่อน'
    );
    process.exit(1);
  }

  console.log(DRY ? '=== โหมดรายงานอย่างเดียว ไม่เขียนอะไรจริง ===' : '=== ย้ายไฟล์ขึ้นคลาวด์ ===');
  console.log(`ต้นทาง: ${storage.LOCAL_DIR}`);
  console.log(`ปลายทาง: ${info.driver === 's3' ? `${info.endpoint} ถัง ${info.buckets.private}` : '(ยังเป็นดิสก์ในเครื่อง)'}`);
  console.log(`ฐานข้อมูล: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}\n`);

  if (!fs.existsSync(storage.LOCAL_DIR)) {
    console.log('ไม่พบโฟลเดอร์ไฟล์เดิม ไม่มีอะไรให้ย้าย');
    return;
  }
  await store.ensureReady();
  if (info.driver === 's3') await storage.ensureReady();

  console.log('เอกสารยืนยันตัวตน (KYC)');
  await migrateSimpleTable('kyc_documents', 'KYC');
  console.log('คลังเอกสาร');
  await migrateSimpleTable('library', 'คลังเอกสาร');
  console.log('ไฟล์แนบของเอกสาร');
  await migrateSimpleTable('attachments', 'ไฟล์แนบ');
  console.log('ไฟล์แนบในปฏิทิน');
  await migrateAttachmentArray('calendar_events', 'กิจกรรมปฏิทิน');
  await migrateAttachmentArray('calendar_overrides', 'กิจกรรมระบบ');
  console.log('โลโก้และตราประทับ');
  await migrateBrandImages();

  const onDisk = fs.readdirSync(storage.LOCAL_DIR).filter((f) => f !== '.gitkeep');
  const touched = stats.alreadyEncrypted + stats.encryptedNow;
  stats.skipped = Math.max(0, onDisk.length - touched);

  console.log('\nสรุป');
  console.log(`  อัปโหลดโดยคงชื่อเดิม (เข้ารหัสอยู่แล้ว): ${stats.alreadyEncrypted}`);
  console.log(`  เข้ารหัสใหม่แล้วอัปโหลด: ${stats.encryptedNow}`);
  console.log(`  แก้ชื่อไฟล์ในฐานข้อมูล: ${stats.dbUpdated} แถว`);
  console.log(`  หาไฟล์ไม่เจอ: ${stats.missing}`);
  console.log(`  ไฟล์ในโฟลเดอร์ที่ไม่มีใครอ้างถึง (ไม่ย้าย): ${stats.skipped}`);
  if (DRY) console.log('\nยังไม่ได้เขียนอะไรจริง ถ้ารายงานข้างบนถูกต้องแล้ว ให้รัน:  npm run files:migrate -- --apply');
  else console.log('\nอย่าเพิ่งลบ data/uploads จนกว่าจะตรวจแล้วว่าเปิดไฟล์ทุกประเภทจากระบบบนคลาวด์ได้');
}

main().catch((err) => {
  console.error('ย้ายไฟล์ไม่สำเร็จ:', err.message);
  process.exit(1);
});
