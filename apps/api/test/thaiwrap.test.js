'use strict';
/**
 * thaiwrap.test.js ตรวจการตัดบรรทัดภาษาไทย และการปิด ligature (WP5)
 * ทั้งสองเรื่องมาจากการตรวจไฟล์ตัวอย่าง PDF ที่สร้างจริงบนเครื่องผู้ใช้
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tw = require('../lib/thaiwrap.js');
const pdfbuild = require('../lib/pdfbuild.js');

/** วัดความกว้างแบบจำลอง: กลุ่มอักขระละ 1 หน่วย ไม่ต้องพึ่ง PDFKit */
const measure = (s) => tw.graphemes(s).length;
const LONG = 'ค่ารีวิวสินค้าและเผยแพร่ผ่านช่องทางของผู้สร้างสรรค์เนื้อหา';

/* ------------------------------------------------------------ ตัดคำไทย */

test('Node.js ตัดคำภาษาไทยได้จริง (ต้องมี ICU แบบเต็ม)', () => {
  // ถ้าข้อนี้ไม่ผ่าน แปลว่า Node ที่ติดตั้งไม่มีพจนานุกรมภาษาไทย ข้ออื่นจะผิดตามทั้งหมด
  const w = tw.words('ผู้สร้างสรรค์เนื้อหา');
  assert.ok(w.length > 1, 'ต้องแบ่งได้มากกว่าหนึ่งคำ');
  assert.ok(w.includes('สร้างสรรค์'));
});

test('ต้องไม่หั่นคำกลางคำ — กรณี "สร้างสรรค์" ที่เจอจากไฟล์ตัวอย่างจริง', () => {
  for (let width = 10; width <= 40; width++) {
    const lines = tw.wrap(LONG, width, measure).split('\n');
    for (const line of lines) {
      assert.ok(!/สร้างสรร$/.test(line), `ความกว้าง ${width}: "สร้างสรรค์" ถูกหั่นท้ายบรรทัด`);
      assert.ok(!/^ค์/.test(line), `ความกว้าง ${width}: บรรทัดขึ้นต้นด้วยเศษคำ "ค์"`);
    }
  }
});

test('ต่อบรรทัดกลับแล้วต้องได้ข้อความเดิมครบทุกตัวอักษร', () => {
  for (const width of [8, 15, 25, 60]) {
    const joined = tw.wrap(LONG, width, measure).replace(/\n/g, '');
    assert.equal(joined, LONG, `ความกว้าง ${width}: ข้อความหายหรือเกิน`);
  }
});

test('ทุกบรรทัดต้องไม่กว้างเกินที่กำหนด', () => {
  const width = 20;
  for (const line of tw.wrap(LONG, width, measure).split('\n')) {
    assert.ok(measure(line) <= width, `"${line}" กว้าง ${measure(line)} เกิน ${width}`);
  }
});

test('ข้อความสั้นกว่าบรรทัดต้องไม่ถูกตัดเลย', () => {
  assert.equal(tw.wrap('ค่าบริหารจัดการแคมเปญ', 100, measure), 'ค่าบริหารจัดการแคมเปญ');
});

test('ขึ้นบรรทัดใหม่ตรงช่องว่าง ต้องไม่มีช่องว่างค้างหน้าหรือท้ายบรรทัด', () => {
  const lines = tw.wrap('บริษัท แท็กซ์โฟลว์ ครีเอทีฟ จำกัด', 12, measure).split('\n');
  for (const line of lines) {
    assert.equal(line, line.trim(), `"${line}" มีช่องว่างค้าง`);
  }
});

test('คำเดียวยาวเกินบรรทัดต้องหั่นได้ โดยสระและวรรณยุกต์ไม่หลุดจากพยัญชนะ', () => {
  const lines = tw.wrap('https://taxflow.example.com/verify/SAMPLE-TOKEN', 10, measure).split('\n');
  assert.ok(lines.length > 1);
  assert.equal(lines.join(''), 'https://taxflow.example.com/verify/SAMPLE-TOKEN');

  // ภาษาไทยคำยาวมากที่ไม่มีทางอยู่บรรทัดเดียว
  const parts = tw.splitLongWord('ผู้ซื้อสื่อโฆษณา', 3, measure);
  for (const p of parts) {
    assert.ok(!/^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(p), `ท่อน "${p}" ขึ้นต้นด้วยสระหรือวรรณยุกต์ที่หลุดจากพยัญชนะ`);
  }
});

test('ต้องเคารพการขึ้นบรรทัดเดิมที่มีอยู่ในข้อความ', () => {
  const out = tw.wrap('ค่าผลิตคอนเทนต์\n(หักส่วนลด 5,000.00 บาท)', 100, measure);
  assert.equal(out, 'ค่าผลิตคอนเทนต์\n(หักส่วนลด 5,000.00 บาท)');
});

test('ค่าว่างหรือ null ต้องไม่ทำให้พัง', () => {
  assert.equal(tw.wrap('', 10, measure), '');
  assert.equal(tw.wrap(null, 10, measure), '');
  assert.equal(tw.wrap(undefined, 10, measure), '');
});

/* ----------------------------------------------------------- ปิด ligature */

/** เอกสารจำลอง บันทึกว่าแต่ละคำสั่งได้อาร์กิวเมนต์อะไรไปบ้าง */
function fakeDoc() {
  const calls = [];
  const d = {
    calls,
    text(...args) { calls.push(['text', args]); return d; },
    widthOfString(str, opts) { calls.push(['width', [str, opts]]); return 10; },
    heightOfString(str, opts) { calls.push(['height', [str, opts]]); return 12; },
    fillColor() { return d; },
  };
  return d;
}
const lastOpts = (call) => call[1][call[1].length - 1];

test('ปิด ligature ไว้ ตัว "l" ใน taxflow จะได้ไม่หายตอนคัดลอกข้อความจาก PDF', () => {
  assert.equal(pdfbuild.FONT_FEATURES.liga, false);
  assert.equal(pdfbuild.FONT_FEATURES.clig, false);
  // ฟีเจอร์ที่ภาษาไทยต้องใช้จัดวางสระและวรรณยุกต์ต้องไม่ถูกปิด
  for (const needed of ['ccmp', 'mark', 'mkmk']) {
    assert.notEqual(pdfbuild.FONT_FEATURES[needed], false, `ห้ามปิด ${needed}`);
  }
});

test('ทุกรูปแบบการเรียก text ต้องได้ features ติดไปด้วย', () => {
  const d = pdfbuild.withFontFeatures(fakeDoc());
  d.text('ก');                               // ไม่มีอะไรตาม
  d.text('ข', { width: 100 });               // มีแต่ options
  d.text('ค', 10, 20);                       // มีแต่ตำแหน่ง
  d.text('ง', 10, 20, { align: 'right' });   // มีครบ
  for (const call of d.calls.filter((c) => c[0] === 'text')) {
    assert.deepEqual(lastOpts(call).features, pdfbuild.FONT_FEATURES, `"${call[1][0]}" ไม่ได้ features`);
  }
});

test('options เดิมต้องยังอยู่ครบหลังเติม features และตำแหน่งต้องไม่เพี้ยน', () => {
  const d = pdfbuild.withFontFeatures(fakeDoc());
  d.text('ง', 10, 20, { align: 'right', width: 99 });
  const [str, x, y, opts] = d.calls[0][1];
  assert.equal(str, 'ง');
  assert.equal(x, 10);
  assert.equal(y, 20);
  assert.equal(opts.align, 'right');
  assert.equal(opts.width, 99);
});

test('การวัดความกว้างและความสูงต้องใช้ features ชุดเดียวกับตอนวาด', () => {
  // ถ้าวัดแบบมี ligature แต่วาดแบบไม่มี ความกว้างจะไม่ตรง และ PDFKit จะตัดกลางคำอีก
  const d = pdfbuild.withFontFeatures(fakeDoc());
  d.widthOfString('taxflow');
  d.heightOfString('taxflow', { width: 50 });
  for (const call of d.calls) {
    assert.deepEqual(call[1][1].features, pdfbuild.FONT_FEATURES);
  }
  assert.equal(d.calls[1][1][1].width, 50, 'options เดิมของ heightOfString ต้องยังอยู่');
});

test('เรียกต่อกันเป็นลูกโซ่ได้เหมือนเดิม', () => {
  const d = pdfbuild.withFontFeatures(fakeDoc());
  const ret = d.fillColor('#000').text('ก').text('ข');
  assert.equal(ret, d);
  assert.equal(d.calls.filter((c) => c[0] === 'text').length, 2);
});
