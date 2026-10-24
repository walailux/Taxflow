'use strict';
/**
 * pdfsign.test.js ลายมือชื่อดิจิทัล PAdES (WP6)
 * ------------------------------------------------------------------------
 * เกณฑ์ตรวจรับของแผน ver18:
 *   "เปิดไฟล์ด้วยโปรแกรมอ่าน PDF แล้วเห็นว่ามีลายมือชื่อดิจิทัลอยู่จริง และเมื่อแก้ไขไฟล์
 *    แม้เพียงไบต์เดียว การตรวจสอบต้องรายงานว่าไฟล์ถูกเปลี่ยนแปลง"
 *
 * ตัวตรวจของระบบเอง (pdfsign.verify) ตรวจผลงานของตัวเองได้ไม่น่าเชื่อถือพอ
 * จึงยืนยันซ้ำด้วยเครื่องมือภายนอกที่ไม่ได้เขียนเอง
 *   openssl cms -verify  ตรวจว่าโครงสร้าง CMS และลายมือชื่อถูกต้องตามมาตรฐาน
 *   pdfsig (Poppler/NSS) ตรวจแบบเดียวกับโปรแกรมอ่าน PDF ทั่วไป
 * ข้อที่ต้องใช้เครื่องมือเหล่านี้จะข้ามเองถ้าเครื่องไม่มี
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'taxflow-sign-'));
process.env.TAXFLOW_DATA_DIR = TMP;
delete process.env.S3_ENDPOINT;

const der = require('../lib/der.js');
const pdfsign = require('../lib/pdfsign.js');
const pdfbuild = require('../lib/pdfbuild.js');
const docfile = require('../lib/docfile.js');
const DS = require('../lib/docschema.js');

const has = (cmd, args = ['--version']) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const HAS_OPENSSL = has('openssl', ['version']);
const HAS_PDFSIG = has('pdfsig', ['-v']) || spawnSync('pdfsig', ['-v']).error === undefined;
const PDF_READY = docfile.ready().ok;

after(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (err) { console.warn(`[test] ลบโฟลเดอร์ชั่วคราวไม่ได้ (${err.code}) ไม่กระทบผลทดสอบ: ${TMP}`); }
});

/* ================================================================ DER */

test('DER: OID เข้ารหัสแล้วถอดกลับได้ค่าเดิม รวมตัวเลขที่ต้องใช้หลายไบต์', () => {
  for (const id of ['1.2.840.113549.1.7.2', '2.16.840.1.101.3.4.2.1', '1.2.840.113549.1.9.16.2.47']) {
    assert.equal(der.oidText(der.decode(der.oid(id))), id);
  }
  // ตัวอย่างอ้างอิงจาก RFC: sha256 = 06 09 60 86 48 01 65 03 04 02 01
  assert.equal(der.oid('2.16.840.1.101.3.4.2.1').toString('hex'), '0609608648016503040201');
});

test('DER: ความยาวเกิน 127 ไบต์ต้องใช้รูปแบบยาว', () => {
  assert.deepEqual([...der.encodeLength(127)], [0x7f]);
  assert.deepEqual([...der.encodeLength(128)], [0x81, 0x80]);
  assert.deepEqual([...der.encodeLength(8192)], [0x82, 0x20, 0x00]);
  const big = der.octet(Buffer.alloc(300, 1));
  assert.equal(der.decode(big).content.length, 300);
});

test('DER: SET OF ต้องเรียงสมาชิกตามไบต์ (กฎ DER) ไม่ใช่ตามลำดับที่ส่งมา', () => {
  const a = der.octet(Buffer.from([2]));
  const b = der.octet(Buffer.from([1]));
  assert.deepEqual(der.set(a, b), der.set(b, a));
});

test('DER: INTEGER ที่บิตสูงสุดเป็น 1 ต้องเติม 00 นำหน้า ไม่งั้นกลายเป็นเลขลบ', () => {
  assert.equal(der.int(1).toString('hex'), '020101');
  assert.equal(der.int(128).toString('hex'), '02020080');
});

test('DER: totalLength ตัดศูนย์ที่เติมท้ายช่องลายมือชื่อทิ้งได้ถูกต้อง', () => {
  const x = der.seq(der.int(1), der.octet(Buffer.from('ab')));
  assert.equal(der.totalLength(Buffer.concat([x, Buffer.alloc(50)])), x.length);
});

/* ======================================================== ใบรับรองทดสอบ */

let signer;
let other; // ใบรับรองอีกใบ ใช้ทดสอบว่าระบบแยกออกว่าไม่ใช่ใบของระบบ
const PASS = 'test-passphrase-123';

function makeCert(dir, cn) {
  fs.mkdirSync(dir, { recursive: true });
  const key = path.join(dir, 'k.pem');
  const cert = path.join(dir, 'c.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '30',
    '-keyout', key, '-out', cert, '-passout', `pass:${PASS}`, '-subj', `/CN=${cn}`], { stdio: 'ignore' });
  return { key, cert };
}

before(() => {
  if (!HAS_OPENSSL) return;
  const a = makeCert(path.join(TMP, 'a'), 'TaxFlow Test Signer');
  const b = makeCert(path.join(TMP, 'b'), 'Someone Else');
  signer = pdfsign.loadSigner({ SIGN_KEY_FILE: a.key, SIGN_CERT_FILE: a.cert, SIGN_KEY_PASSPHRASE: PASS });
  other = pdfsign.loadSigner({ SIGN_KEY_FILE: b.key, SIGN_CERT_FILE: b.cert, SIGN_KEY_PASSPHRASE: PASS });
});

const needSigner = !HAS_OPENSSL ? 'เครื่องนี้ไม่มี openssl สร้างใบรับรองทดสอบไม่ได้' : false;
const needAll = needSigner || (!PDF_READY ? 'ยังไม่ได้ติดตั้งไลบรารี PDF หรือฟอนต์' : false);

test('ไม่ได้ตั้งค่าใบรับรอง = ไม่ลงนาม แต่ระบบยังทำงานต่อได้', () => {
  assert.equal(pdfsign.loadSigner({ SIGN_KEY_FILE: '/ไม่มี', SIGN_CERT_FILE: '/ไม่มี' }), null);
});

test('รหัสผ่านกุญแจผิดต้องบอกว่าให้ตรวจ SIGN_KEY_PASSPHRASE', { skip: needSigner }, () => {
  const dir = path.join(TMP, 'a');
  assert.throws(
    () => pdfsign.loadSigner({ SIGN_KEY_FILE: path.join(dir, 'k.pem'), SIGN_CERT_FILE: path.join(dir, 'c.pem'), SIGN_KEY_PASSPHRASE: 'ผิด' }),
    /SIGN_KEY_PASSPHRASE/,
  );
});

test('กุญแจกับใบรับรองคนละคู่ต้องถูกปฏิเสธตั้งแต่ตอนเปิด', { skip: needSigner }, () => {
  assert.throws(
    () => pdfsign.loadSigner({ SIGN_KEY_FILE: path.join(TMP, 'a', 'k.pem'), SIGN_CERT_FILE: path.join(TMP, 'b', 'c.pem'), SIGN_KEY_PASSPHRASE: PASS }),
    /ไม่ใช่คู่เดียวกัน/,
  );
});

test('อ่านกุญแจจากตัวแปรแวดล้อม base64 ได้ (ใช้ตอนขึ้นคลาวด์ ไม่มีดิสก์ถาวร)', { skip: needSigner }, () => {
  const b64 = (f) => fs.readFileSync(f).toString('base64');
  const s = pdfsign.loadSigner({
    SIGN_KEY_PEM_B64: b64(path.join(TMP, 'a', 'k.pem')),
    SIGN_CERT_PEM_B64: b64(path.join(TMP, 'a', 'c.pem')),
    SIGN_KEY_PASSPHRASE: PASS,
  });
  assert.equal(s.fingerprint, signer.fingerprint);
});

/* ==================================================== ลงนามและตรวจสอบ */

function sampleDoc(overrides = {}) {
  const items = [{ name: 'ค่าผลิตคอนเทนต์', qty: 2, unit: 'ชิ้น', price: 25000 }];
  const partyInfo = { name: 'บริษัท ผู้ซื้อ จำกัด', taxId: '0105559876541', branch: 'สำนักงานใหญ่', address: '1 กรุงเทพมหานคร' };
  return {
    type: 'ETAX_INVOICE', docNo: 'TIV-2569-00001', status: 'approved',
    fields: { issueDate: '2026-09-21' }, items, partyInfo,
    calc: DS.compute('ETAX_INVOICE', { fields: {}, items, party: partyInfo }, { vatRegistered: true }),
    issuer: { name: 'บริษัท ผู้ขาย จำกัด', taxId: '0105561234567', branch: 'สำนักงานใหญ่', address: '99 กรุงเทพมหานคร' },
    signature: { signerName: 'นายสมชาย ใจดี', signedAt: '2026-09-21T03:15:00Z', image: null },
    ...overrides,
  };
}

let signedPdf;
// เวลาประทับต้องอยู่หลังเวลาสร้างใบรับรองทดสอบ (ซึ่งสร้างตอนรันชุดทดสอบ)
// รุ่นก่อนตั้งตายตัวเป็นวันที่ในอดีต ซึ่งตัวตรวจอายุใบรับรองที่เพิ่มเข้ามาจับได้ว่าเป็นไปไม่ได้
// ตัดเศษวินาทีทิ้ง เพราะวันที่ในไฟล์ PDF ละเอียดแค่ระดับวินาที
const STAMPED_AT = new Date(Math.floor(Date.now() / 1000) * 1000);
async function signed() {
  if (!signedPdf) {
    signedPdf = (await pdfbuild.buildDocument(sampleDoc(), { signer, generatedAt: STAMPED_AT })).pdf;
  }
  return signedPdf;
}

test('เอกสารที่ลงนามแล้วต้องมีลายมือชื่อที่ตรวจผ่านทุกข้อ', { skip: needAll }, async () => {
  const v = pdfsign.verify(await signed(), { trustedFingerprint: signer.fingerprint });
  assert.deepEqual(v.problems, []);
  assert.equal(v.signed, true);
  assert.equal(v.intact, true);
  assert.equal(v.coversWhole, true);
  assert.equal(v.trusted, true);
  assert.equal(v.subFilter, 'ETSI.CAdES.detached');
});

test('ชื่อผู้ลงนามและเหตุผลต้องมาจากการลงนามผ่าน OTP และเวลาใน /M ต้องเป็นเวลาที่ประทับจริง', { skip: needAll }, async () => {
  const v = pdfsign.verify(await signed(), { trustedFingerprint: signer.fingerprint });
  assert.equal(v.name, 'นายสมชาย ใจดี', 'ชื่อภาษาไทยต้องไม่เพี้ยน');
  // เวลาใน /M ตามมาตรฐาน PAdES คือเวลาที่ประทับลายมือชื่อลงไฟล์ (generatedAt)
  // ไม่ใช่เวลาที่ผู้ใช้ยืนยัน OTP ซึ่งอาจเก่ากว่าใบรับรองที่ใช้ลงนาม (ดูข้อทดสอบถัดไป)
  assert.equal(v.signedAt, STAMPED_AT.toISOString());
  assert.notEqual(v.signedAt, '2026-09-21T03:15:00.000Z', 'ต้องไม่ใช่เวลายืนยัน OTP ของเอกสาร');
  assert.match(v.reason, /OTP/);
  assert.match(v.reason, /เมื่อ .*2569/, 'เวลายืนยัน OTP ต้องอยู่ในเหตุผลแทน');
  assert.match(v.reason, /ไม่มีผลรับรองตามกฎหมาย/, 'ต้องบอกข้อจำกัดไว้ในตัวลายมือชื่อด้วย');
  assert.equal(v.certValidAtSigning, true);
});

test('ลงนามด้วย OTP ก่อนสร้างใบรับรอง ไฟล์ที่ออกภายหลังต้องยังใช้ได้ (เหตุการณ์จริงบนเครื่องผู้ใช้)', { skip: needAll }, async () => {
  // ผู้ใช้ยืนยัน OTP เมื่อหลายชั่วโมงก่อน แล้วจึงรัน sign:setup สร้างใบรับรองใบใหม่
  // รุ่นแรกใส่เวลายืนยัน OTP ลงใน /M Adobe จึงรายงานว่าใบรับรอง "not yet valid" ณ เวลานั้น
  const otpBeforeCert = new Date(new Date(signer.validFrom).getTime() - 3 * 3600 * 1000).toISOString();
  const doc = sampleDoc({ signature: { signerName: 'นายสมชาย ใจดี', signedAt: otpBeforeCert, image: null } });
  const pdf = (await pdfbuild.buildDocument(doc, { signer, generatedAt: new Date() })).pdf;
  const v = pdfsign.verify(pdf, { trustedFingerprint: signer.fingerprint });
  assert.equal(v.certValidAtSigning, true, `ใบรับรองต้องใช้ได้ ณ เวลาที่ลงนาม: ${v.problems.join(', ')}`);
  assert.deepEqual(v.problems, []);
});

test('ตัวตรวจของระบบต้องจับได้เมื่อเวลาลงนามอยู่นอกอายุใบรับรอง (แบบเดียวกับที่ Adobe จับ)', { skip: needAll }, async () => {
  const before = new Date(new Date(signer.validFrom).getTime() - 3600 * 1000);
  const pdf = (await pdfbuild.buildDocument(sampleDoc(), { signer, generatedAt: before })).pdf;
  const v = pdfsign.verify(pdf, { trustedFingerprint: signer.fingerprint });
  assert.equal(v.intact, true, 'ไฟล์ไม่ได้ถูกแก้ ความครบถ้วนยังผ่าน');
  assert.equal(v.certValidAtSigning, false);
  assert.ok(v.problems.some((p) => p.includes('ก่อนวันที่ใบรับรองเริ่มใช้')));
});

test('แก้ไฟล์แม้เพียงไบต์เดียว ที่ตำแหน่งใดก็ตาม ต้องรายงานว่าไฟล์ถูกเปลี่ยนแปลง', { skip: needAll }, async () => {
  const pdf = await signed();
  const text = pdf.toString('latin1');
  const brMatch = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)/.exec(text.slice(text.lastIndexOf('/ByteRange')));
  const [holeStart, holeEnd] = [Number(brMatch[2]), Number(brMatch[3])];
  // ตำแหน่งทดสอบ: ต้นไฟล์ กลางเนื้อหา ในไฟล์ XML ที่แนบ และท้ายไฟล์ (ข้ามช่องลายมือชื่อเอง)
  const xmlAt = text.indexOf('stream', text.indexOf('/EmbeddedFile')) + 20;
  const spots = [20, Math.floor(holeStart / 2), xmlAt, pdf.length - 20].filter((i) => i < holeStart || i >= holeEnd);
  assert.ok(spots.length >= 3);
  for (const i of spots) {
    const t = Buffer.from(pdf);
    t[i] ^= 0x01;
    const v = pdfsign.verify(t, { trustedFingerprint: signer.fingerprint });
    assert.equal(v.intact, false, `แก้ไบต์ที่ ${i} แล้วยังตรวจผ่าน`);
    assert.ok(v.problems.length > 0, 'ต้องบอกเหตุผล');
  }
});

test('แก้ไฟล์ XML ที่แนบอยู่ใน PDF ต้องตรวจไม่ผ่านด้วย เพราะลายมือชื่อครอบคลุมไฟล์แนบ', { skip: needAll }, async () => {
  const pdf = await signed();
  const text = pdf.toString('latin1');
  const at = text.indexOf('stream', text.indexOf('/EmbeddedFile')) + 10;
  const t = Buffer.from(pdf);
  t[at] ^= 0xff;
  assert.equal(pdfsign.verify(t).intact, false);
});

test('ต่อข้อมูลท้ายไฟล์หลังลงนามต้องถูกจับได้', { skip: needAll }, async () => {
  const v = pdfsign.verify(Buffer.concat([await signed(), Buffer.from('\n%แอบเพิ่ม\n')]), { trustedFingerprint: signer.fingerprint });
  assert.equal(v.coversWhole, false);
  assert.ok(v.problems.some((p) => p.includes('ต่อท้าย')));
});

test('ลายมือชื่อจากใบรับรองอื่นตรวจความครบถ้วนผ่าน แต่ต้องบอกว่าไม่ใช่ของระบบนี้', { skip: needAll }, async () => {
  const pdf = (await pdfbuild.buildDocument(sampleDoc(), { signer: other })).pdf;
  const v = pdfsign.verify(pdf, { trustedFingerprint: signer.fingerprint });
  assert.equal(v.intact, true);
  assert.equal(v.trusted, false);
});

test('เอกสารที่ผู้ใช้ยังไม่กดลงนาม ต้องไม่มีลายมือชื่อดิจิทัล', { skip: needAll }, async () => {
  const r = await pdfbuild.buildDocument(sampleDoc({ signature: null }), { signer });
  assert.equal(r.digitallySigned, false);
  assert.equal(pdfsign.verify(r.pdf).signed, false);
});

test('ไฟล์ที่ลงนามแล้วยังคงเป็น PDF/A-3 มี XML แนบ และช่องลายมือชื่อตั้งค่าตามข้อกำหนด PDF/A', { skip: needAll }, async () => {
  const text = (await signed()).toString('latin1');
  assert.match(text, /pdfaid:part[^0-9]*3/);
  assert.ok(text.includes('/EmbeddedFile'));
  assert.match(text, /\/F 132/, 'annotation ต้องตั้ง Print ตาม PDF/A');
  assert.match(text, /\/SigFlags 3/);
});

test('ลายมือชื่อต้องไม่เกินพื้นที่ที่จองไว้ และเหลือที่ว่างพอสำหรับใบรับรองขนาดใหญ่กว่า', { skip: needSigner }, () => {
  const cms = pdfsign.buildCms(crypto.randomBytes(32), signer);
  assert.ok(cms.length < pdfsign.PLACEHOLDER_BYTES / 2, `ใช้ ${cms.length} จาก ${pdfsign.PLACEHOLDER_BYTES} ไบต์`);
});

/* ================================================ เครื่องมือตรวจภายนอก */

function extract(pdf) {
  const text = pdf.toString('latin1');
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/.exec(text.slice(text.lastIndexOf('/ByteRange')));
  const [a, b, c, d] = m.slice(1).map(Number);
  const raw = Buffer.from(text.slice(b + 1, c - 1), 'hex');
  return { content: Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)]), cms: raw.subarray(0, der.totalLength(raw)) };
}

test('openssl cms ตรวจลายมือชื่อผ่าน (ยืนยันว่าโครงสร้าง CMS ถูกตามมาตรฐาน)', { skip: needAll }, async () => {
  const { content, cms } = extract(await signed());
  const dir = fs.mkdtempSync(path.join(TMP, 'ossl-'));
  fs.writeFileSync(path.join(dir, 'content.bin'), content);
  fs.writeFileSync(path.join(dir, 'sig.der'), cms);
  fs.writeFileSync(path.join(dir, 'ca.pem'), signer.x509.toString());
  // เขียนผลลงไฟล์ในโฟลเดอร์ชั่วคราว ไม่ใช้ os.devNull เพราะบน Windows ได้ \\.\nul
  // ซึ่ง openssl ที่มากับ Git for Windows เปิดไม่ได้ ข้อทดสอบจึงล้มทั้งที่ลายมือชื่อถูก
  const outFile = path.join(dir, 'out.bin');
  const r = spawnSync('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', path.join(dir, 'sig.der'),
    '-content', path.join(dir, 'content.bin'), '-CAfile', path.join(dir, 'ca.pem'), '-purpose', 'any', '-out', outFile]);
  assert.equal(r.status, 0, String(r.stderr));
  assert.match(String(r.stderr), /Verification successful/);

  // เนื้อหาเปลี่ยนไบต์เดียว openssl ต้องปฏิเสธเช่นกัน
  content[10] ^= 1;
  fs.writeFileSync(path.join(dir, 'content.bin'), content);
  const bad = spawnSync('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', path.join(dir, 'sig.der'),
    '-content', path.join(dir, 'content.bin'), '-CAfile', path.join(dir, 'ca.pem'), '-purpose', 'any', '-out', outFile]);
  assert.notEqual(bad.status, 0);
  assert.match(String(bad.stderr), /digest failure|verification failure/i, `ต้องไม่ผ่านเพราะเนื้อหาไม่ตรง: ${bad.stderr}`);
});

test('pdfsig (ตัวตรวจแบบโปรแกรมอ่าน PDF) รายงานว่าลายมือชื่อถูกต้องและครอบคลุมทั้งไฟล์', {
  skip: needAll || (spawnSync('pdfsig', ['-v']).error ? 'เครื่องนี้ไม่มี pdfsig' : false),
}, async () => {
  const pdf = await signed();
  const file = path.join(TMP, 'signed.pdf');
  fs.writeFileSync(file, pdf);
  const out = String(spawnSync('pdfsig', [file]).stdout);
  assert.match(out, /Signature is Valid/);
  assert.match(out, /Total document signed/);
  assert.match(out, /ETSI\.CAdES\.detached/);

  const t = Buffer.from(pdf);
  t[30] ^= 1;
  fs.writeFileSync(file, t);
  assert.match(String(spawnSync('pdfsig', [file]).stdout), /Digest Mismatch/);
});

/* ================================================ ผูกกับ cache ของ docfile */

test('เปลี่ยนใบรับรองของระบบ ไฟล์ที่ cache ไว้ต้องถูกลงนามใหม่ด้วยใบปัจจุบัน', { skip: needAll }, async () => {
  const doc = { ...sampleDoc(), id: 1 };
  const save = async (file) => { doc.file = file; };
  const first = await docfile.getOrBuild(doc, { save, signer });
  assert.equal(doc.file.digitallySigned, true);
  assert.equal(doc.file.certFingerprint, signer.fingerprint);
  assert.equal((await docfile.getOrBuild(doc, { save, signer })).cached, true);

  const again = await docfile.getOrBuild(doc, { save, signer: other });
  assert.equal(again.cached, false);
  assert.equal(doc.file.certFingerprint, other.fingerprint);
  assert.ok(!first.pdf.equals(again.pdf));
});
