'use strict';
/**
 * storage.test.js ตรวจชั้นจัดเก็บไฟล์ของ WP4
 * ทดสอบบนปลายทาง local (ดิสก์) เพราะรันได้โดยไม่ต้องต่อคลาวด์
 * ตรรกะการเข้ารหัส ตั้งชื่อไฟล์ และการถอดรหัส เป็นชุดเดียวกันกับตอนใช้ Supabase Storage
 * ต่างกันแค่ปลายทางที่เขียนไบต์ลงไปเท่านั้น
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ชี้โฟลเดอร์ข้อมูลไปที่ temp ก่อน require เพื่อไม่แตะข้อมูลจริงใน data/
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'taxflow-storage-'));
process.env.TAXFLOW_DATA_DIR = TMP;
delete process.env.S3_ENDPOINT;

const storage = require('../lib/storage');

/**
 * ลบโฟลเดอร์ชั่วคราวแบบทนต่อความล้มเหลว
 * บน Windows การลบไฟล์ที่เพิ่งถูกปิดไปอาจยังติด EPERM อยู่ชั่วครู่ (โปรแกรมสแกนไวรัส
 * หรือตัวจัดทำดัชนีของระบบอาจถือ handle อยู่) จึงลองซ้ำสองสามครั้งแล้วค่อยยอมแพ้
 * โฟลเดอร์นี้อยู่ใน temp ของระบบอยู่แล้ว ระบบปฏิบัติการจะเก็บกวาดให้เองภายหลัง
 * และการลบไม่สำเร็จไม่ควรทำให้ชุดทดสอบที่ผ่านหมดแล้วกลายเป็นล้มเหลว
 */
function removeTempDir(dir) {
  for (let i = 0; i < 3; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return; }
    catch { /* ลองใหม่ */ }
  }
}

after(() => removeTempDir(TMP));

test('ไม่ได้ตั้งค่า S3 จึงใช้ดิสก์ในเครื่องเป็นปลายทาง', () => {
  assert.equal(storage.DRIVER, 'local');
});

test('บันทึกแล้วอ่านกลับได้เนื้อไฟล์เดิมทุกไบต์', async () => {
  await storage.ensureReady();
  const original = Buffer.from('ใบกำกับภาษี ทดสอบภาษาไทย 12345', 'utf8');
  const storedName = await storage.put(original, 'pdf');
  const back = await storage.get(storedName);
  assert.deepEqual(back, original);
});

test('ไฟล์ที่เขียนลงดิสก์จริงต้องอ่านไม่ออก (เข้ารหัสก่อนเก็บ)', async () => {
  const secret = Buffer.from('เลขบัญชีธนาคาร 987-6-54321-0', 'utf8');
  const storedName = await storage.put(secret, 'png');

  const onDisk = fs.readFileSync(path.join(storage.LOCAL_DIR, storedName));
  assert.notDeepEqual(onDisk, secret, 'ไฟล์บนดิสก์ต้องไม่ใช่เนื้อหาต้นฉบับ');
  assert.ok(!onDisk.includes(secret), 'ต้องไม่พบข้อความต้นฉบับอยู่ในไฟล์ที่เก็บ');
  assert.ok(onDisk.length > secret.length, 'ไฟล์ที่เข้ารหัสต้องยาวกว่าเดิม (IV + AuthTag)');
});

test('ชื่อไฟล์ที่เก็บต้องลงท้ายด้วย .enc และไม่เปิดเผยชื่อไฟล์เดิม', async () => {
  const storedName = await storage.put(Buffer.from('x'), 'jpg', { prefix: 'kyc_' });
  assert.match(storedName, /^kyc_[0-9a-f]{24}\.jpg\.enc$/);
  assert.ok(storage.isEncrypted(storedName));
});

test('แก้ไฟล์ที่เก็บแม้ไบต์เดียว การอ่านต้องล้มเหลว ไม่ใช่คืนข้อมูลผิด ๆ', async () => {
  const storedName = await storage.put(Buffer.from('ข้อมูลสำคัญ'), 'pdf');
  const file = path.join(storage.LOCAL_DIR, storedName);
  const blob = fs.readFileSync(file);
  blob[blob.length - 1] ^= 0xff; // พลิกบิตท้ายไฟล์
  fs.writeFileSync(file, blob);

  await assert.rejects(() => storage.get(storedName));
});

test('ไฟล์เดิมจาก ver17.2 ที่ยังไม่เข้ารหัส (ชื่อไม่ลงท้าย .enc) ต้องยังเปิดได้', async () => {
  const legacyName = 'legacy_abc123.png';
  const plain = Buffer.from('ไฟล์เก่าที่ยังไม่ได้ย้าย');
  fs.writeFileSync(path.join(storage.LOCAL_DIR, legacyName), plain);

  const back = await storage.get(legacyName);
  assert.deepEqual(back, plain);
});

test('ลบไฟล์แล้วอ่านไม่ได้ และลบไฟล์ที่ไม่มีอยู่ต้องไม่โยน error', async () => {
  const storedName = await storage.put(Buffer.from('ลบทิ้ง'), 'pdf');
  assert.equal(await storage.remove(storedName), true);
  await assert.rejects(() => storage.get(storedName));
  assert.equal(await storage.remove('ไม่มีไฟล์นี้.enc'), false);
  assert.equal(await storage.remove(null), false);
});

test('ไฟล์ในถังสาธารณะไม่เข้ารหัส เพราะต้องเปิดตรงจากเบราว์เซอร์ได้', async () => {
  const pdf = Buffer.from('%PDF-1.7 ตัวอย่าง');
  const storedName = await storage.put(pdf, 'pdf', { bucket: 'public', mime: 'application/pdf' });
  assert.ok(!storage.isEncrypted(storedName));
  assert.deepEqual(await storage.get(storedName, { bucket: 'public' }), pdf);
});
