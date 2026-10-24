'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { buildZip } = require('../lib/zip');

// อ่านกลับเฉพาะ local file header (STORE, ไม่บีบอัด) — พอสำหรับตรวจว่าไฟล์ที่เขียนถูกต้องตามสเปก
// โดยไม่ต้องพึ่งไลบรารี unzip ภายนอกใดๆ (สอดคล้องกับ zip.js เองที่ตั้งใจไม่มี dependency)
function readBackEntries(buf) {
  const entries = [];
  let offset = 0;
  while (offset < buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // หมดโซน local file header แล้ว (เจอ central directory ต่อ)
    const method = buf.readUInt16LE(offset + 8);
    const crc = buf.readUInt32LE(offset + 14);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buf.toString('utf8', nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    entries.push({ name, method, crc, data });
    offset = dataStart + compSize;
  }
  return entries;
}

test('buildZip — อ่านกลับได้ชื่อไฟล์และเนื้อหาตรงกับที่ใส่เข้าไป', () => {
  const files = [
    { name: 'a.txt', data: Buffer.from('hello world', 'utf8') },
    { name: 'โฟลเดอร์/ภาษาไทย.txt', data: Buffer.from('เอกสารภาษีทดสอบ', 'utf8') },
  ];
  const zipBuf = buildZip(files);
  assert.equal(zipBuf.readUInt32LE(0), 0x04034b50, 'ต้องขึ้นต้นด้วย local file header signature');

  const entries = readBackEntries(zipBuf);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'a.txt');
  assert.equal(entries[0].data.toString('utf8'), 'hello world');
  assert.equal(entries[1].name, 'โฟลเดอร์/ภาษาไทย.txt');
  assert.equal(entries[1].data.toString('utf8'), 'เอกสารภาษีทดสอบ');
  for (const e of entries) {
    assert.equal(e.method, 0, 'ต้องเป็น STORE (ไม่บีบอัด)');
    assert.equal(e.crc >>> 0, zlib.crc32(e.data) >>> 0, 'CRC-32 ที่เก็บไว้ต้องตรงกับข้อมูลจริง');
  }
});

test('buildZip — มี End Of Central Directory record ปิดท้ายไฟล์ถูกต้อง', () => {
  const zipBuf = buildZip([{ name: 'x.txt', data: Buffer.from('x') }]);
  const eocdSig = zipBuf.readUInt32LE(zipBuf.length - 22);
  assert.equal(eocdSig, 0x06054b50);
  const totalEntries = zipBuf.readUInt16LE(zipBuf.length - 22 + 10);
  assert.equal(totalEntries, 1);
});

test('buildZip — ไฟล์ว่าง (0 รายการ) ไม่พังและยังมี EOCD', () => {
  const zipBuf = buildZip([]);
  assert.equal(zipBuf.readUInt32LE(zipBuf.length - 22), 0x06054b50);
  assert.equal(zipBuf.readUInt16LE(zipBuf.length - 22 + 10), 0);
});
