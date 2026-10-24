'use strict';

/**
 * zip.js เขียนไฟล์ .zip แบบ STORE (ไม่บีบอัด) ด้วยมือ ไม่มี dependency ภายนอก
 * รองรับพอให้ Windows Explorer / macOS Archive Utility / 7-Zip เปิดได้ปกติ
 * อ้างอิงโครงสร้างตาม PKWARE APPNOTE.TXT (local file header, central directory, EOCD)
 *
 * ใช้ zlib.crc32() ของ Node core (มีตั้งแต่ Node v21) แทนการเขียนตาราง CRC-32 เอง
 */
const zlib = require('zlib');

function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((Math.max(1980, d.getFullYear()) - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

/**
 * สร้างไฟล์ .zip จากรายการไฟล์ในหน่วยความจำ
 * @param {{name:string, data:Buffer}[]} files
 * @returns {Buffer}
 */
function buildZip(files) {
  const chunks = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const crc = zlib.crc32(data) >>> 0;
    const size = data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed to extract
    localHeader.writeUInt16LE(0x0800, 6); // flag bit 11 = ชื่อไฟล์เข้ารหัส UTF-8
    localHeader.writeUInt16LE(0, 8); // method 0 = store (ไม่บีบอัด)
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // compressed size = uncompressed (store)
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    chunks.push(localHeader, nameBuf, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // offset ของ local header ของไฟล์นี้

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central dir
  end.writeUInt16LE(files.length, 8); // entries on this disk
  end.writeUInt16LE(files.length, 10); // entries total
  end.writeUInt32LE(centralBuf.length, 12); // central directory size
  end.writeUInt32LE(offset, 16); // offset of central directory
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, centralBuf, end]);
}

module.exports = { buildZip };
