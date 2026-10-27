/**
 * scripts/report-tests.mjs reporter ของ node:test ที่สรุปผลเป็นตาราง Test case
 * ---------------------------------------------------------------------------
 * รัน: npm run test:report --workspace @taxflow/api   (หรือ node --test --test-reporter=./scripts/report-tests.mjs)
 * ได้ไฟล์ใน apps/api/test-report/
 *   test-cases.md   ตารางสรุปรายไฟล์ + ตาราง Test case ทุกข้อ (วางใน Word/README ได้)
 *   test-cases.csv  ตารางเดียวกัน เปิดด้วย Excel ได้ (มี BOM ให้ภาษาไทยแสดงถูกต้อง)
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('test-report');

// ชื่อชุดทดสอบภาษาไทยของแต่ละไฟล์ (ไฟล์ที่ไม่มีในรายการใช้ชื่อไฟล์แทน)
const SUITE = {
  'authmode.test.js': 'โหมดยืนยันตัวตน (คุกกี้ / header)',
  'calendar.test.js': 'ปฏิทินกิจกรรม',
  'contactlink.test.js': 'เชื่อมบัญชีคู่ค้า',
  'docfile.test.js': 'ไฟล์ PDF/XML ของเอกสาร',
  'docplan-alltypes.test.js': 'แผนผังเอกสารทุกประเภท',
  'docplan-coverage.test.js': 'แผนผังเอกสาร (ครอบคลุมช่องข้อมูล)',
  'docplan.test.js': 'แผนผังเอกสารการเงิน',
  'docschema.test.js': 'นิยามแบบฟอร์มและการตรวจข้อมูล',
  'docview.test.js': 'หน้า HTML ของเอกสาร',
  'etax-gate.test.js': 'สิทธิ์ออกเอกสาร e-Tax',
  'etax.test.js': 'ใบกำกับภาษีอิเล็กทรอนิกส์',
  'google.test.js': 'เข้าสู่ระบบด้วย Google',
  'http-account.test.js': 'API บัญชีผู้ใช้และระบบรอบเอกสาร',
  'http-docs.test.js': 'API วงจรชีวิตเอกสาร',
  'mailer-domain.test.js': 'การส่งอีเมล',
  'otp.test.js': 'รหัส OTP',
  'pdfsign.test.js': 'ลายมือชื่อดิจิทัลบน PDF',
  'pit.test.js': 'ภาษีเงินได้บุคคลธรรมดา',
  'qr.test.js': 'QR Code',
  'routes.test.js': 'รายการเส้นทาง API',
  'storage.test.js': 'ที่เก็บไฟล์',
  'tax.test.js': 'คำนวณภาษี (VAT / หัก ณ ที่จ่าย)',
  'taxcalendar.test.js': 'ปฏิทินภาษี',
  'thaiid.test.js': 'เลขประจำตัวผู้เสียภาษี',
  'thaiwrap.test.js': 'ตัดบรรทัดภาษาไทย',
  'totp.test.js': 'แอป Authenticator (TOTP)',
  'validation.test.js': 'ตรวจความถูกต้องของข้อมูล',
  'zip.test.js': 'ไฟล์ ZIP',
};

const RESULT = { pass: 'ผ่าน', fail: 'ไม่ผ่าน', skip: 'ข้าม', todo: 'ยังไม่ทำ' };
const md = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const csv = (s) => `"${String(s).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

export default async function* reporter(source) {
  const rows = [];
  for await (const ev of source) {
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue;
    const d = ev.data;
    // ข้ามรายการระดับไฟล์ (node สร้างให้เองเมื่อไฟล์ทดสอบมีปัญหา) และชุดย่อยที่ห่อ test ข้างใน
    if (d.details && d.details.type === 'suite') continue;
    // รายการระดับไฟล์ (ชื่อเป็น path ของไฟล์ เช่น test/helpers/http.js ที่ node --test หยิบมารันเพราะอยู่ในโฟลเดอร์ test) ไม่ใช่ test case
    if (!d.file || d.name === d.file || /\.[cm]?js$/.test(d.name)) continue;
    const file = path.basename(d.file);
    const status = d.skip !== undefined ? 'skip' : d.todo !== undefined ? 'todo' : ev.type === 'test:pass' ? 'pass' : 'fail';
    const err = d.details && d.details.error;
    rows.push({
      file, name: d.name, status, ms: d.details ? d.details.duration_ms : 0,
      note: status === 'fail' && err ? String((err.cause && err.cause.message) || err.message || '').split('\n')[0].slice(0, 200)
        : status === 'skip' && typeof d.skip === 'string' ? d.skip : '',
    });
  }

  // เรียงตามไฟล์ แล้วตามลำดับที่รัน · รหัส TC-<ลำดับไฟล์>-<ลำดับข้อ>
  const files = [...new Set(rows.map((r) => r.file))].sort((a, b) => a.localeCompare(b));
  let n = 0;
  const cases = [];
  files.forEach((f, fi) => {
    rows.filter((r) => r.file === f).forEach((r, i) => {
      cases.push({ no: ++n, id: `TC-${String(fi + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`, suite: SUITE[f] || f, ...r });
    });
  });

  const count = (list, s) => list.filter((r) => r.status === s).length;
  const total = { all: cases.length, pass: count(cases, 'pass'), fail: count(cases, 'fail'), skip: count(cases, 'skip') + count(cases, 'todo') };
  const stamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' });

  const lines = [
    '# ผลการทดสอบ TaxFlow API (Node.js test runner)',
    '',
    `ทดสอบเมื่อ ${stamp} · Node.js ${process.version} · คำสั่ง \`node --test\` ในโฟลเดอร์ apps/api`,
    '',
    '## สรุปผล',
    '',
    '| รายการ | จำนวน |',
    '|---|---:|',
    `| Test case ทั้งหมด | ${total.all} |`,
    `| ผ่าน | ${total.pass} |`,
    `| ไม่ผ่าน | ${total.fail} |`,
    `| ข้าม | ${total.skip} |`,
    `| อัตราผ่าน (ไม่นับที่ข้าม) | ${total.all - total.skip ? ((total.pass / (total.all - total.skip)) * 100).toFixed(1) : '0.0'}% |`,
    '',
    '## สรุปรายชุดทดสอบ',
    '',
    '| ลำดับ | ชุดทดสอบ | ไฟล์ | จำนวน | ผ่าน | ไม่ผ่าน | ข้าม |',
    '|---:|---|---|---:|---:|---:|---:|',
    ...files.map((f, i) => {
      const list = cases.filter((r) => r.file === f);
      return `| ${i + 1} | ${md(SUITE[f] || f)} | ${f} | ${list.length} | ${count(list, 'pass')} | ${count(list, 'fail')} | ${count(list, 'skip') + count(list, 'todo')} |`;
    }),
    '',
    '## Test case',
    '',
    '| ลำดับ | รหัส | ชุดทดสอบ | กรณีทดสอบ | ผลการทดสอบ | เวลา (ms) | หมายเหตุ |',
    '|---:|---|---|---|---|---:|---|',
    ...cases.map((r) => `| ${r.no} | ${r.id} | ${md(r.suite)} | ${md(r.name)} | ${RESULT[r.status]} | ${r.ms.toFixed(1)} | ${md(r.note)} |`),
    '',
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'test-cases.md'), lines.join('\n'));
  fs.writeFileSync(path.join(OUT_DIR, 'test-cases.csv'), '﻿' + [
    ['ลำดับ', 'รหัส', 'ชุดทดสอบ', 'ไฟล์', 'กรณีทดสอบ', 'ผลการทดสอบ', 'เวลา (ms)', 'หมายเหตุ'].map(csv).join(','),
    ...cases.map((r) => [r.no, r.id, r.suite, r.file, r.name, RESULT[r.status], r.ms.toFixed(1), r.note].map(csv).join(',')),
  ].join('\r\n') + '\r\n');

  yield `Test case ทั้งหมด ${total.all} · ผ่าน ${total.pass} · ไม่ผ่าน ${total.fail} · ข้าม ${total.skip}\n`;
  yield `บันทึกตารางแล้ว: ${path.relative(process.cwd(), OUT_DIR)}${path.sep}test-cases.md และ test-cases.csv\n`;
}
