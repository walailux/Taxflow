'use strict';
/**
 * der.js ตัวเข้ารหัสและถอดรหัส ASN.1 DER ขนาดเล็ก (WP6)
 * ==========================================================================
 * ลายมือชื่อ PAdES คือโครงสร้าง CMS (RFC 5652) ที่เข้ารหัสแบบ DER ฝังอยู่ในไฟล์ PDF
 * แผน ver18 ระบุให้ใช้ node-forge / node-signpdf แต่เครื่องพัฒนาไม่มีสองไลบรารีนี้
 * และ Node.js 22 มีการเข้ารหัสลับ (RSA, SHA-256, อ่านใบรับรอง X.509) ในตัวครบแล้ว
 * ส่วนที่ขาดมีเพียงการเขียนโครงสร้าง DER ซึ่งเป็นกติกาง่าย ๆ "ชนิด ความยาว เนื้อหา"
 * จึงเขียนเองในไฟล์นี้ ราว 150 บรรทัด ไม่ต้องพึ่งไลบรารีภายนอก
 *
 * ความถูกต้องของผลลัพธ์ตรวจด้วยเครื่องมือภายนอกสองตัวที่ไม่ได้เขียนเอง
 * คือ `openssl cms -verify` และ `pdfsig` (ดู test/pdfsign.test.js)
 *
 * รองรับเฉพาะสิ่งที่ CMS ต้องใช้ ไม่ใช่ตัวถอด ASN.1 ทั่วไป
 */

/* ---------------------------------------------------------------- เข้ารหัส */

/** ความยาวแบบ DER: สั้นกว่า 128 ใช้ไบต์เดียว ยาวกว่านั้นบอกจำนวนไบต์ของความยาวก่อน */
function encodeLength(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

/** TLV หนึ่งก้อน */
function tlv(tag, content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), encodeLength(body.length), body]);
}

const seq = (...items) => tlv(0x30, items);
const octet = (buf) => tlv(0x04, buf);
const nul = () => Buffer.from([0x05, 0x00]);

/**
 * SET OF ตามกฎ DER ต้องเรียงสมาชิกตามไบต์ที่เข้ารหัสแล้ว
 * ถ้าไม่เรียง ตัวตรวจที่เคร่งครัดจะคำนวณแฮชของ signed attributes ไม่ตรงกับที่เราเซ็น
 */
function set(...items) {
  return tlv(0x31, [...items].sort(Buffer.compare));
}

/** INTEGER จากตัวเลขเล็ก ๆ (เลขรุ่นของโครงสร้าง) */
function int(n) {
  const bytes = [];
  do { bytes.unshift(n & 0xff); n = Math.floor(n / 256); } while (n > 0);
  if (bytes[0] & 0x80) bytes.unshift(0); // บิตสูงสุดเป็น 1 จะถูกตีความเป็นเลขลบ
  return tlv(0x02, Buffer.from(bytes));
}

/** OBJECT IDENTIFIER จากข้อความ เช่น '1.2.840.113549.1.7.2' */
function oid(text) {
  const parts = text.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const p of parts.slice(2)) {
    const chunk = [p & 0x7f];
    let v = Math.floor(p / 128);
    while (v > 0) { chunk.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

/** [n] แบบ EXPLICIT (ห่อ TLV ทั้งก้อน) */
const explicit = (n, inner) => tlv(0xa0 | n, inner);

/** [n] แบบ IMPLICIT แทนแท็กของสิ่งที่ห่อด้วยแท็กตามบริบท (constructed) */
const implicit = (n, encoded) => {
  const node = decode(encoded);
  return tlv(0xa0 | n, node.content);
};

/* ---------------------------------------------------------------- ถอดรหัส */

/**
 * ถอด TLV หนึ่งก้อนที่ตำแหน่ง offset
 * @returns {{ tag, header, length, start, end, raw, content, children? }}
 *   raw      ไบต์ทั้งก้อนรวมหัว (ใช้ดึงชื่อผู้ออกใบรับรองแบบไม่แตะเนื้อหา)
 *   content  เฉพาะเนื้อหา
 *   children ถ้าเป็นชนิดประกอบ (SEQUENCE, SET, [n])
 */
function decode(buf, offset = 0) {
  const tag = buf[offset];
  let len = buf[offset + 1];
  let hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('DER: ความยาวไม่รองรับ');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[offset + 2 + i];
    hdr = 2 + n;
  }
  const start = offset + hdr;
  const end = start + len;
  if (end > buf.length) throw new Error('DER: ข้อมูลขาด ความยาวเกินขนาดไฟล์');
  const node = {
    tag, header: hdr, length: len, start, end,
    raw: buf.subarray(offset, end),
    content: buf.subarray(start, end),
  };
  if (tag & 0x20) { // ชนิดประกอบ
    node.children = [];
    let p = start;
    while (p < end) {
      const child = decode(buf, p);
      node.children.push(child);
      p = child.end;
    }
  }
  return node;
}

/** แปลง OBJECT IDENTIFIER กลับเป็นข้อความ */
function oidText(node) {
  const b = node.content;
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) { parts.push(v); v = 0; }
  }
  return parts.join('.');
}

/** ความยาวรวมของ TLV ก้อนแรกในบัฟเฟอร์ ใช้ตัดศูนย์ที่เติมท้ายช่อง /Contents ของ PDF ทิ้ง */
function totalLength(buf) {
  const node = decode(buf, 0);
  return node.end;
}

module.exports = {
  tlv, seq, set, octet, nul, int, oid, explicit, implicit,
  decode, oidText, totalLength, encodeLength,
};
