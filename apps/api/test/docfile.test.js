'use strict';
/**
 * docfile.test.js ตรวจการออกไฟล์ PDF/A-3 และ cache บนที่เก็บไฟล์ (WP5)
 * ------------------------------------------------------------------------
 * ใช้ที่เก็บไฟล์โหมด local ในโฟลเดอร์ชั่วคราว จึงไม่แตะ Supabase จริง
 * ข้อที่ต้องวาด PDF จริงจะข้ามเองถ้าเครื่องยังไม่ได้ติดตั้ง pdfkit หรือยังไม่ได้วางฟอนต์
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ต้องตั้งก่อน require storage เพราะ storage อ่านค่าตอนโหลดโมดูล
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'taxflow-docfile-'));
process.env.TAXFLOW_DATA_DIR = TMP;
delete process.env.S3_ENDPOINT;

const DS = require('../lib/docschema.js');
const docfile = require('../lib/docfile.js');
const storage = require('../lib/storage.js');

// Windows ลบไฟล์ที่ยังถูกเปิดอยู่ไม่ได้ (ต่างจาก Linux/Mac) ข้อทดสอบที่เรียก core/context
// ทำให้ไฟล์ SQLite ในโฟลเดอร์ชั่วคราวถูกเปิดค้าง จึงต้องปิดฐานข้อมูลก่อนลบ
// และถ้ายังลบไม่ได้ก็แค่เตือน ไม่ให้การเก็บกวาดกลายเป็น "การทดสอบไม่ผ่าน"
after(() => {
  try { require('../core/store').close(); } catch { /* ยังไม่ได้เปิดฐานข้อมูล */ }
  try {
    fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    console.warn(`[test] ลบโฟลเดอร์ชั่วคราวไม่ได้ (${err.code}) ไม่กระทบผลทดสอบ: ${TMP}`);
  }
});

const READY = docfile.ready().ok;
const skip = READY ? false : 'ยังไม่ได้ติดตั้ง pdfkit/@cantoo/pdf-lib หรือยังไม่ได้วางฟอนต์ไทย';

function sampleDoc(type = 'ETAX_INVOICE') {
  const items = [{ name: 'ค่าบริการ', qty: 1, unit: 'งาน', price: 1000 }];
  const partyInfo = { name: 'บริษัท ผู้ซื้อ จำกัด', taxId: '0105559876541', branch: 'สำนักงานใหญ่', address: '1 กรุงเทพมหานคร' };
  const calc = DS.compute(type, { fields: {}, items, party: partyInfo }, { vatRegistered: true });
  return {
    id: 1, type, docNo: 'TIV-2569-00001', status: 'approved',
    fields: { issueDate: '2026-09-20' }, items, partyInfo, party: partyInfo.name,
    issuer: { name: 'บริษัท ผู้ขาย จำกัด', taxId: '0105561234567', branch: 'สำนักงานใหญ่', address: '99 กรุงเทพมหานคร' },
    base: calc.base, vatRate: calc.vatRate, vat: calc.vat, total: calc.total, subtotal: calc.subtotal,
  };
}

/** จำลองการบันทึกลงฐานข้อมูล: เก็บ file กลับเข้าไปในเอกสาร */
const saver = (doc) => async (file) => { doc.file = file; };

/* ---------------------------------------------------- กุญแจการวาด */

test('กุญแจการวาดคงที่เมื่อเอกสารเหมือนเดิม แม้ลำดับฟิลด์ต่างกัน', () => {
  const a = sampleDoc();
  const b = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(docfile.renderKey(a), docfile.renderKey(b));
});

test('กุญแจการวาดเปลี่ยนเมื่อสิ่งที่เห็นบนกระดาษเปลี่ยน', () => {
  const base = sampleDoc();
  const k = docfile.renderKey(base);
  assert.notEqual(docfile.renderKey({ ...base, status: 'cancelled' }), k, 'สถานะ (ลายน้ำยกเลิก)');
  assert.notEqual(docfile.renderKey({ ...base, docNo: 'TIV-2569-00002' }), k, 'เลขที่เอกสาร');
  assert.notEqual(docfile.renderKey({ ...base, signature: { signerName: 'ก', signedAt: 'x' } }), k, 'ลายเซ็น');
  assert.notEqual(docfile.renderKey(base, { verifyUrl: 'https://x/verify' }), k, 'ลิงก์ตรวจสอบ/QR');
  assert.notEqual(docfile.renderKey(base, { brand: { logo: 'data:image/png;base64,AA==' } }), k, 'โลโก้');
});

test('กุญแจการวาดไม่เปลี่ยนจากฟิลด์ที่ไม่ได้พิมพ์ลงกระดาษ', () => {
  const base = sampleDoc();
  const k = docfile.renderKey(base);
  assert.equal(docfile.renderKey({ ...base, updatedAt: 'อะไรก็ได้', file: { pdf: 'x' } }), k,
    'ถ้า file อยู่ในกุญแจ การบันทึกไฟล์จะทำให้กุญแจเปลี่ยนเอง และวาดใหม่ทุกครั้งไม่รู้จบ');
});

test('ข้อมูลไฟล์ต้องไม่ถูกนับเป็นเนื้อหาเอกสาร (กันหน้าตรวจสอบฟ้องว่าถูกแก้หลังลงนาม)', () => {
  const { CONTENT_HASH_EXCLUDE } = require('../core/context');
  assert.ok(CONTENT_HASH_EXCLUDE.has('file'));
});

test('ชื่อไฟล์ดาวน์โหลดใช้เลขที่เอกสาร และตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้', () => {
  assert.equal(docfile.downloadName({ docNo: 'TIV-2569-00001' }, 'pdf'), 'TIV-2569-00001.pdf');
  assert.equal(docfile.downloadName({ docNo: 'A/B:C' }, 'pdf'), 'A-B-C.pdf');
  assert.equal(docfile.downloadName({ id: 9 }, 'pdf'), 'draft-9.pdf');
});

/* ------------------------------------------- วาดจริง + cache บนที่เก็บไฟล์ */

test('ครั้งแรกวาดใหม่ ครั้งที่สองอ่านจากที่เก็บไฟล์ ได้ไฟล์เดียวกัน', { skip }, async () => {
  const doc = sampleDoc();
  const first = await docfile.getOrBuild(doc, { save: saver(doc) });
  assert.equal(first.cached, false);
  assert.equal(first.pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(doc.file && doc.file.pdf && doc.file.xml, 'ต้องบันทึกชื่อไฟล์ทั้ง PDF และ XML');

  const second = await docfile.getOrBuild(doc, { save: saver(doc) });
  assert.equal(second.cached, true);
  assert.ok(second.pdf.equals(first.pdf));
  assert.equal(second.xml, first.xml);
});

test('ไฟล์ที่เก็บต้องถูกเข้ารหัส เปิดตรงจากที่เก็บไฟล์ไม่ได้', { skip }, async () => {
  const doc = sampleDoc();
  await docfile.getOrBuild(doc, { save: saver(doc) });
  assert.ok(storage.isEncrypted(doc.file.pdf));
  const raw = fs.readFileSync(path.join(storage.LOCAL_DIR, doc.file.pdf));
  assert.notEqual(raw.subarray(0, 5).toString(), '%PDF-', 'ไบต์บนดิสก์ต้องไม่ใช่ PDF ที่อ่านได้');
});

test('เอกสารเปลี่ยน ต้องวาดใหม่และลบไฟล์เก่าทิ้ง ไม่ให้เหลือไฟล์กำพร้า', { skip }, async () => {
  const doc = sampleDoc();
  await docfile.getOrBuild(doc, { save: saver(doc) });
  const old = { ...doc.file };
  doc.status = 'cancelled';
  const again = await docfile.getOrBuild(doc, { save: saver(doc) });
  assert.equal(again.cached, false);
  assert.notEqual(doc.file.pdf, old.pdf);
  assert.ok(!fs.existsSync(path.join(storage.LOCAL_DIR, old.pdf)), 'ไฟล์ PDF เก่าต้องถูกลบ');
  assert.ok(!fs.existsSync(path.join(storage.LOCAL_DIR, old.xml)), 'ไฟล์ XML เก่าต้องถูกลบ');
});

test('ไฟล์หายจากที่เก็บ ต้องวาดใหม่ให้เอง ไม่ทำให้ผู้ใช้เปิดเอกสารไม่ได้', { skip }, async () => {
  const doc = sampleDoc();
  await docfile.getOrBuild(doc, { save: saver(doc) });
  fs.unlinkSync(path.join(storage.LOCAL_DIR, doc.file.pdf));
  const out = await docfile.getOrBuild(doc, { save: saver(doc) });
  assert.equal(out.cached, false);
  assert.equal(out.pdf.subarray(0, 5).toString(), '%PDF-');
});

test('เอกสารที่ไม่ใช่ e-Tax ได้ PDF/A-3 แต่ไม่มีไฟล์ XML', { skip }, async () => {
  const doc = { ...sampleDoc('QUOTATION'), docNo: 'QT-2569-00001' };
  const out = await docfile.getOrBuild(doc, { save: saver(doc) });
  assert.equal(out.xml, null);
  assert.equal(doc.file.xml, null);
  assert.ok(out.pdf.toString('latin1').includes('pdfaid:part'), 'ต้องประกาศเป็น PDF/A');
});

test('purge ลบไฟล์ที่ cache ไว้ทั้งหมด', { skip }, async () => {
  const doc = sampleDoc();
  await docfile.getOrBuild(doc, { save: saver(doc) });
  const { pdf, xml } = doc.file;
  assert.equal(await docfile.purge(doc), true);
  assert.ok(!fs.existsSync(path.join(storage.LOCAL_DIR, pdf)));
  assert.ok(!fs.existsSync(path.join(storage.LOCAL_DIR, xml)));
  assert.equal(await docfile.purge({}), false, 'เอกสารที่ไม่มีไฟล์ต้องไม่ error');
});

test('ไม่ส่ง save มา = วาดอย่างเดียว ไม่เขียนอะไรลงที่เก็บไฟล์', { skip }, async () => {
  const before = fs.existsSync(storage.LOCAL_DIR) ? fs.readdirSync(storage.LOCAL_DIR).length : 0;
  const out = await docfile.getOrBuild(sampleDoc());
  const after = fs.existsSync(storage.LOCAL_DIR) ? fs.readdirSync(storage.LOCAL_DIR).length : 0;
  assert.equal(out.file.pdf, null);
  assert.equal(after, before);
});
