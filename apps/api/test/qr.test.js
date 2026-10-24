'use strict';
/**
 * lib/qr.js — ตรวจโครงสร้างตาม ISO/IEC 18004 ที่เครื่องสแกนต้องใช้ก่อนอ่านข้อมูล
 * บั๊กเดิม: format information วางสลับแถว/คอลัมน์ และทับ dark module ทำให้ QR ทุกรูปสแกนไม่ติด
 * (ตอนแก้ ตรวจเพิ่มด้วยตัวอ่าน QR ของ OpenCV ครบทุกความยาว 1–106 ไบต์)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const qr = require('../lib/qr');

// ค่า format bits ของ EC level M mask 0–7 จากตาราง C.1 ของมาตรฐาน
const FORMAT_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];

/** อ่าน format information ทั้งสองชุดจากตำแหน่งตามมาตรฐาน m[แถว][คอลัมน์] */
function readFormat(m) {
  const n = m.length;
  let a = 0;
  let b = 0;
  const setA = (i, v) => { a |= v << i; };
  const setB = (i, v) => { b |= v << i; };
  for (let i = 0; i <= 5; i++) setA(i, m[i][8]);
  setA(6, m[7][8]); setA(7, m[8][8]); setA(8, m[8][7]);
  for (let i = 9; i < 15; i++) setA(i, m[8][14 - i]);
  for (let i = 0; i < 8; i++) setB(i, m[8][n - 1 - i]);
  for (let i = 8; i < 15; i++) setB(i, m[n - 15 + i][8]);
  return [a, b];
}

const SAMPLES = [
  'hi',
  'https://taxflow.example.com/verify-doc?t=0123456789abcdef',
  'otpauth://totp/TaxFlow:creator%40taxflow.test?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=TaxFlow',
  'x'.repeat(106),
];

for (const text of SAMPLES) {
  test(`format information อ่านได้ถูกตำแหน่งและตรงกันทั้งสองชุด (${Buffer.byteLength(text)} ไบต์)`, () => {
    const m = qr.generate(text);
    const [a, b] = readFormat(m);
    assert.equal(a, b, 'format สองชุดต้องเหมือนกัน');
    assert.ok(FORMAT_M.includes(a), `format 0x${a.toString(16)} ต้องเป็นค่าของ EC level M ตามตาราง`);
  });
}

test('dark module ต้องเป็นสีเข้มเสมอ (คอลัมน์ 8 แถว size-8)', () => {
  for (const text of SAMPLES) {
    const m = qr.generate(text);
    assert.equal(m[m.length - 8][8], 1);
  }
});

test('finder pattern ครบสามมุม และขนาดตรงกับ version', () => {
  for (const text of SAMPLES) {
    const m = qr.generate(text);
    const n = m.length;
    assert.equal((n - 17) % 4, 0);
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      assert.equal(m[r][c], 1);
      assert.equal(m[r + 1][c + 1], 0);
      assert.equal(m[r + 3][c + 3], 1);
    }
  }
});

test('timing pattern สลับเข้ม/อ่อนทั้งแนวนอนและแนวตั้ง', () => {
  const m = qr.generate(SAMPLES[2]);
  for (let i = 8; i < m.length - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0 ? 1 : 0);
    assert.equal(m[i][6], i % 2 === 0 ? 1 : 0);
  }
});

test('ข้อมูลยาวเกิน version 6 ต้องโยน error ไม่สร้าง QR ผิด ๆ', () => {
  assert.throws(() => qr.generate('x'.repeat(107)));
});

test('SVG มีพื้นขาวและ quiet zone 4 โมดูล', () => {
  const svg = qr.toSVG('hi', { scale: 4 });
  assert.match(svg, /<rect width="116" height="116" fill="#fff"\/>/); // (21 + 8) × 4
});
