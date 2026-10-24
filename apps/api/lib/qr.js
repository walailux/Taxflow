'use strict';
/**
 * qr.js ตัวสร้าง QR Code แบบ pure JS (ไม่มี dependency)
 * byte mode, EC level M, เลือก version อัตโนมัติ (1–6, พอสำหรับลิงก์ตรวจสอบ) และเลือก mask ที่อ่านง่ายที่สุด
 * อ้างอิงอัลกอริทึมมาตรฐาน QR (ISO/IEC 18004)
 */
const EXP = new Array(256), LOG = new Array(256);
(function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 256; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255]);

// generator polynomial (index 0 = leading coefficient = 1)
function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const p = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) { p[j] ^= gmul(poly[j], EXP[i]); p[j + 1] ^= poly[j]; }
    poly = p;
  }
  return poly.reverse();
}
function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const res = data.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], coef);
  }
  return res.slice(data.length);
}

// version 1–6, EC level M: { ec cw per block, blocks: [[numBlocks, dataCw], ...] }
const VER = {
  1: { ec: 10, g: [[1, 16]] }, 2: { ec: 16, g: [[1, 28]] }, 3: { ec: 26, g: [[1, 44]] },
  4: { ec: 18, g: [[2, 32]] }, 5: { ec: 24, g: [[2, 43]] }, 6: { ec: 16, g: [[4, 27]] },
};
const dataCapacity = (v) => VER[v].g.reduce((s, [n, d]) => s + n * d, 0);

function chooseVersion(len) {
  for (let v = 1; v <= 6; v++) {
    const need = 4 + 8 + len * 8; // mode + 8-bit char count + data
    if (need <= dataCapacity(v) * 8) return v;
  }
  throw new Error('ข้อมูลยาวเกินไปสำหรับ QR');
}

function buildData(text) {
  const bytes = Array.from(Buffer.from(text, 'utf8'));
  const v = chooseVersion(bytes.length);
  const bits = [];
  const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4); push(bytes.length, 8); bytes.forEach((b) => push(b, 8));
  push(0, Math.min(4, dataCapacity(v) * 8 - bits.length)); // terminator ไม่เกินความจุ
  while (bits.length % 8 !== 0) bits.push(0);
  const dataCw = [];
  for (let i = 0; i < bits.length; i += 8) dataCw.push(Number.parseInt(bits.slice(i, i + 8).join(''), 2));
  const total = dataCapacity(v), pad = [0xec, 0x11];
  let pi = 0; while (dataCw.length < total) dataCw.push(pad[pi++ % 2]);

  const cfg = VER[v], blocks = [];
  let idx = 0;
  cfg.g.forEach(([n, d]) => { for (let i = 0; i < n; i++) { const dcw = dataCw.slice(idx, idx + d); idx += d; blocks.push({ data: dcw, ec: rsEncode(dcw, cfg.ec) }); } });
  const maxData = Math.max(...blocks.map((b) => b.data.length)), out = [];
  for (let i = 0; i < maxData; i++) blocks.forEach((b) => { if (i < b.data.length) out.push(b.data[i]); });
  for (let i = 0; i < cfg.ec; i++) blocks.forEach((b) => out.push(b.ec[i]));
  return { version: v, codewords: out };
}

function makeMatrix(version) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  function finder(r, c) {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const rr = r + i, cc = c + j; if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const on = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
      m[rr][cc] = on ? 1 : 0;
    }
  }
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { m[6][i] = i % 2 === 0 ? 1 : 0; m[i][6] = i % 2 === 0 ? 1 : 0; }
  m[size - 8][8] = 1; // dark module

  const centers = { 2: [18], 3: [22], 4: [26], 5: [30], 6: [34] };
  if (centers[version]) { const c = centers[version][0]; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const b = Math.max(Math.abs(i), Math.abs(j)) === 2 || (i === 0 && j === 0); m[c + i][c + j] = b ? 1 : 0; } }

  // จองตำแหน่ง format information ไว้ก่อน (ใส่ค่าจริงใน placeFormat) เพื่อให้ placeData ข้าม
  // m[แถว][คอลัมน์] ตำแหน่งตาม ISO/IEC 18004 ข้อ 7.9 ชุดเดียวกับ placeFormat
  const reserve = (r, c) => { if (m[r][c] === null) m[r][c] = 2; };
  for (let i = 0; i <= 8; i++) { reserve(i, 8); reserve(8, i); }
  for (let i = 0; i < 8; i++) { reserve(8, size - 1 - i); reserve(size - 1 - i, 8); }
  return m;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function placeData(m, codewords, mask) {
  const size = m.length, bits = [];
  const flip = MASKS[mask];
  codewords.forEach((cw) => { for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1); });
  let bi = 0, upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const row = upward ? size - 1 - k : k;
      for (let c2 = 0; c2 < 2; c2++) {
        const cc = col - c2;
        if (m[row][cc] !== null) continue;
        let bit = bi < bits.length ? bits[bi++] : 0;
        if (flip(row, cc)) bit ^= 1;
        m[row][cc] = bit;
      }
    }
    upward = !upward;
  }
}

/** คะแนนความยากในการอ่านตาม ISO/IEC 18004 ข้อ 7.8.3 (ยิ่งน้อยยิ่งสแกนง่าย) ใช้เลือก mask */
function penalty(m) {
  const n = m.length;
  let score = 0;
  const lines = [];
  for (let i = 0; i < n; i++) { lines.push(m[i]); lines.push(m.map((row) => row[i])); }
  for (const line of lines) {
    // กฎ 1: สีเดียวกันติดกัน 5 โมดูลขึ้นไป
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    // กฎ 3: ลวดลายคล้าย finder 1:1:3:1:1 ที่มีช่องว่าง 4 โมดูลด้านใดด้านหนึ่ง
    const str = line.join('');
    for (const pat of ['10111010000', '00001011101']) {
      let from = str.indexOf(pat);
      while (from !== -1) { score += 40; from = str.indexOf(pat, from + 1); }
    }
  }
  // กฎ 2: บล็อก 2×2 สีเดียวกัน
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  // กฎ 4: สัดส่วนโมดูลสีเข้มห่างจาก 50%
  let dark = 0;
  for (const row of m) for (const v of row) dark += v;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

/*
 * format information 15 บิต (EC level M + mask 0 พร้อม BCH และ XOR 0x5412 แล้ว) วางสองชุด
 * ตำแหน่งตาม ISO/IEC 18004 ข้อ 7.9 (m[แถว][คอลัมน์] บิต 0 = LSB)
 *   ชุดที่ 1 รอบ finder มุมซ้ายบน: บิต 0–5 คอลัมน์ 8 แถว 0–5, บิต 6 แถว 7, บิต 7 แถว 8, บิต 8 แถว 8 คอลัมน์ 7,
 *            บิต 9–14 แถว 8 คอลัมน์ 5–0
 *   ชุดที่ 2: บิต 0–7 แถว 8 คอลัมน์ size-1 ถึง size-8, บิต 8–14 คอลัมน์ 8 แถว size-7 ถึง size-1
 *   dark module อยู่ที่คอลัมน์ 8 แถว size-8 เสมอ ห้ามทับ
 * บั๊กเดิม (ถึง RENDER_VERSION 4): วางสลับแถวกับคอลัมน์ทั้งสองชุด และชุดที่ 2 ทับ dark module
 * เครื่องสแกนจึงอ่านระดับแก้ผิดและ mask ไม่ได้ QR ทุกรูปที่ระบบสร้างสแกนไม่ติด (TOTP, ลิงก์ตรวจสอบ, QR ใน PDF)
 * และเดิมใช้ mask 0 ตายตัว ตอนนี้ลองทั้ง 8 แบบแล้วเลือกแบบที่คะแนน penalty ต่ำสุดตามมาตรฐาน
 */
/** format bits ของ EC level M (รหัส 00) กับ mask ที่เลือก: BCH(15,5) แล้ว XOR 0x5412 */
function formatBits(mask) {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function placeFormat(m, mask) {
  const size = m.length;
  const fmt = formatBits(mask);
  const bit = (i) => (fmt >> i) & 1;
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
  m[size - 8][8] = 1; // dark module
}

function generate(text) {
  const { version, codewords } = buildData(text);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = makeMatrix(version);
    placeData(m, codewords, mask);
    placeFormat(m, mask);
    const bin = m.map((row) => row.map((v) => (v === 1 ? 1 : 0)));
    const score = penalty(bin);
    if (!best || score < best.score) best = { score, bin };
  }
  return best.bin;
}

function toSVG(text, opts = {}) {
  const m = generate(text), size = m.length;
  const scale = opts.scale || 4, quiet = opts.quiet ?? 4;
  const dim = (size + quiet * 2) * scale, fg = opts.fg || '#1a1a1a';
  let rects = '';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) rects += `<rect x="${(c + quiet) * scale}" y="${(r + quiet) * scale}" width="${scale}" height="${scale}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}"><rect width="${dim}" height="${dim}" fill="#fff"/><g fill="${fg}">${rects}</g></svg>`;
}

module.exports = { generate, toSVG };
