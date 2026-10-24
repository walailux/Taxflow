/**
 * unzip.js อ่านไฟล์ zip (docx / xlsx / odt / ods เป็น zip ที่มี XML อยู่ข้างใน) โดยไม่ต้องใช้ไลบรารีเพิ่ม
 * อ่าน central directory จากท้ายไฟล์ แล้วคลายเฉพาะไฟล์ที่ต้องการด้วย DecompressionStream('deflate-raw') ของเบราว์เซอร์
 */

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

/** คืน Map ชื่อไฟล์ → { method, size, offset } หรือโยน Error ถ้าไม่ใช่ zip */
function entries(view) {
  let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 66000); i -= 1) {
    if (view.getUint32(i, true) === EOCD) { end = i; break; }
  }
  if (end < 0) throw new Error('NOT_ZIP');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const out = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(p, true) !== CEN) throw new Error('NOT_ZIP');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(view.buffer, view.byteOffset + p + 46, nameLen));
    out.set(name, { method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * เปิด zip จาก ArrayBuffer คืน { names, text(name) } โดย text() คืนเนื้อหาไฟล์เป็นสตริง UTF-8 (หรือ null ถ้าไม่มีไฟล์นั้น)
 */
export function openZip(buffer) {
  const view = new DataView(buffer);
  const list = entries(view);
  return {
    names: [...list.keys()],
    async text(name) {
      const e = list.get(name);
      if (!e) return null;
      if (view.getUint32(e.offset, true) !== LOC) throw new Error('NOT_ZIP');
      const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
      const raw = new Uint8Array(buffer, start, e.size);
      if (e.method === 0) return new TextDecoder().decode(raw);
      if (e.method !== 8) throw new Error('ZIP_METHOD');
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    },
  };
}
