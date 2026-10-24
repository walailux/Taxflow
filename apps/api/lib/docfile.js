'use strict';
/**
 * docfile.js ออกไฟล์เอกสาร PDF/A-3 (+ XML) แล้วเก็บบนที่เก็บไฟล์ของระบบ (WP5)
 * ==========================================================================
 * เป็นจุดเดียวที่ route ต่าง ๆ เรียกเมื่อผู้ใช้กดปุ่ม PDF
 *
 * ขั้นตอน
 *   1) คำนวณ "กุญแจการวาด" จากทุกอย่างที่ปรากฏบนหน้ากระดาษ
 *   2) ถ้ากุญแจตรงกับไฟล์ที่เก็บไว้ครั้งก่อน อ่านไฟล์เดิมจาก Storage คืนไปเลย
 *   3) ถ้าไม่ตรง วาดใหม่ด้วย pdfbuild อัปโหลดขึ้น Storage แล้วลบไฟล์เก่าทิ้ง
 *
 * ทำไมต้อง cache
 *   การวาด PDF/A-3 พร้อมฝังฟอนต์ไทยใช้เวลาหลายร้อยมิลลิวินาที และหน่วยความจำไม่น้อย
 *   บนเซิร์ฟเวอร์แผนราคาถูกที่ใช้ใน WP7 การวาดใหม่ทุกครั้งที่มีคนกดดูจะช้าและเปลือง
 *   ส่วนเอกสารที่ออกแล้วแทบไม่เปลี่ยน จึงวาดครั้งเดียวแล้วใช้ซ้ำได้
 *
 * กุญแจการวาดต้องครอบคลุมอะไรบ้าง
 *   ไม่ใช่แค่ "เนื้อหา" แบบ contentHash ที่ใช้ตรวจลายเซ็น แต่ต้องรวมทุกอย่างที่เห็นบนกระดาษ
 *   เลขที่เอกสาร · สถานะ (ลายน้ำยกเลิก/แถบฉบับร่าง) · ลายเซ็นทั้งสองฝ่าย · โลโก้และตราประทับ
 *   · ลิงก์ตรวจสอบ · รุ่นของโค้ดวาด (RENDER_VERSION) ลืมข้อใดข้อหนึ่ง = ผู้ใช้ได้ไฟล์เก่าค้าง
 *
 * ที่เก็บไฟล์
 *   เก็บใน "ถังส่วนตัว" เข้ารหัส AES-256-GCM เหมือนไฟล์อื่นทุกชนิด ไม่ใช้ถังสาธารณะ
 *   เพราะเอกสารภาษีมีชื่อ ที่อยู่ เลขประจำตัวผู้เสียภาษี และยอดเงิน ซึ่งเป็นข้อมูลส่วนบุคคล
 *   ถังสาธารณะไม่เข้ารหัสและเปิดตรงได้ ขัดทั้งเกณฑ์ WP4 และหลัก PDPA ของระบบ
 *   ไฟล์จึงเปิดได้ทางเดียวคือผ่าน API ที่ตรวจสิทธิ์แล้ว
 *
 * ข้อมูลไฟล์ถูกบันทึกไว้ที่ doc.file = { key, pdf, xml, xmlName, bytes, at }
 * ฟิลด์ file ถูกตัดออกจาก contentHash (core/context.js) แล้ว
 * มิฉะนั้นการกดดู PDF หลังลงนามจะทำให้หน้าตรวจสอบรายงานว่าเอกสารถูกแก้ไข
 */

const crypto = require('crypto');
const storage = require('./storage');
const pdfbuild = require('./pdfbuild');
const xmlbuild = require('./xmlbuild');
const pdfsign = require('./pdfsign');

/**
 * เพิ่มเลขนี้ทุกครั้งที่แก้โค้ดวาด (docplan / pdfbuild) จนหน้าตาเปลี่ยน
 * ไฟล์ที่ cache ไว้ด้วยรุ่นเก่าจะถูกวาดใหม่เองในครั้งถัดไปที่มีคนเปิด
 */
const RENDER_VERSION = 13; // 13: รายละเอียดส่วนลดท้ายบิลต่อท้ายบรรทัดส่วนลด // 12: เว้นระยะระหว่างตารางรายการกับยอดรวม // 11: หัวตารางสูงตามข้อความ (ไม่ล้นทับแถว) + ช่องว่างในตารางใส่ "-" // 10: สัญญาย่อให้จบหน้าเดียว // 9: ฉบับร่าง/ยกเลิก บอกด้วยลายน้ำคาดกลางหน้า ไม่ใช่แถบที่หัวกระดาษ // 8: เอา QR ลิงก์ตรวจสอบออกจากเอกสาร เหลือเป็นลิงก์ข้อความ // 7: จัดรูปแบบข้อสัญญาเป็นทางการ (รายการย่อยสองคอลัมน์ เยื้องย่อหน้า) // 6: แก้ลายน้ำ "ยกเลิกแล้ว" ทำให้เนื้อหาเริ่มกลางหน้า
// 2 = WP6 เพิ่มลายมือชื่อดิจิทัล PAdES
// 3 = แก้ใบส่งมอบงาน/ใบสำคัญจ่ายที่วาดด้วยแม่แบบใบเสร็จผิด ๆ และช่องที่ตกหล่น (บัญชีรับโอนในใบแจ้งหนี้ ฯลฯ)
// 4 = เวลาในลายมือชื่อเป็นเวลาที่ประทับจริง ไม่ใช่เวลายืนยัน OTP (Adobe ฟ้องว่าใบรับรองยังไม่เริ่มใช้)
// 5 = แก้ lib/qr.js ให้ QR ลิงก์ตรวจสอบสแกนติด (format information วางผิดตำแหน่ง) และเลือก mask ตามมาตรฐาน

/** ฟิลด์ที่ไม่มีผลกับหน้ากระดาษ ตัดทิ้งก่อนคำนวณกุญแจ */
const KEY_EXCLUDE = new Set(['id', 'userId', 'createdAt', 'updatedAt', 'statusNote', 'file']);

const sha = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

/** ลำดับคีย์คงที่ เพื่อให้เอกสารเดิมได้กุญแจเดิมเสมอ ไม่ขึ้นกับลำดับที่ฐานข้อมูลคืนมา */
// เรียงตามรหัสอักขระ (ลำดับเดียวกับ .sort() แบบไม่ใส่ฟังก์ชัน) ไม่ใช้ localeCompare เพราะ render key ต้องคงที่ทุกเครื่อง
function compareCodeUnits(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort(compareCodeUnits)) out[k] = stable(value[k]);
    return out;
  }
  return value;
}

/**
 * กุญแจการวาด: ถ้ากุญแจเท่าเดิม ไฟล์ที่วาดออกมาจะเหมือนเดิมทุกจุด
 * รูปภาพ (ลายเซ็น โลโก้ ตราประทับ) แทนด้วยแฮช ไม่เอาทั้งก้อน base64 มาต่อกัน
 */
function renderKey(doc, ctx = {}) {
  const body = {};
  for (const k of Object.keys(doc).sort(compareCodeUnits)) if (!KEY_EXCLUDE.has(k)) body[k] = doc[k];
  const brand = ctx.brand || {};
  return sha(stable({
    v: RENDER_VERSION,
    doc: body,
    logo: brand.logo ? sha(brand.logo) : '',
    seal: brand.seal ? sha(brand.seal) : '',
    verifyUrl: ctx.verifyUrl || '',
    // เปลี่ยนใบรับรองของระบบ (รัน sign:setup ใหม่) ต้องลงนามใหม่ด้วยใบปัจจุบัน
    signer: ctx.signerFingerprint || '',
  }));
}

/** ผู้ลงนามที่ใช้กับคำขอนี้ ส่ง null มาเพื่อปิดการลงนามได้ (ชุดทดสอบ) */
const signerFor = (ctx) => (ctx.signer !== undefined ? ctx.signer : pdfsign.systemSigner());

/** ชื่อไฟล์ที่ผู้ใช้เห็นตอนดาวน์โหลด */
function downloadName(doc, ext) {
  const base = String(doc.docNo || `draft-${doc.id || 'document'}`).replace(/[\\/:*?"<>|\s]/g, '-');
  return `${base}.${ext}`;
}

/**
 * คืนไฟล์ PDF (และ XML ถ้าเป็นเอกสาร e-Tax) ของเอกสารหนึ่งฉบับ
 * @param {object} doc เอกสารจากฐานข้อมูล
 * @param {object} ctx
 *   brand      { logo, seal } data URI ของผู้ออกเอกสาร
 *   verifyUrl  ลิงก์ตรวจสอบ (มีเมื่อเอกสารถูกแชร์แล้ว)
 *   bahtText   ตัวแปลงจำนวนเงินเป็นตัวหนังสือ
 *   save       async (fileMeta) => void บันทึกข้อมูลไฟล์กลับลงเอกสาร (ไม่ส่งมา = ไม่ cache)
 *   now        Date สำหรับชุดทดสอบ
 * @returns {Promise<{ pdf: Buffer, xml: string|null, xmlName: string|null, cached: boolean, file: object }>}
 */
async function getOrBuild(doc, ctx = {}) {
  const signer = signerFor(ctx);
  const key = renderKey(doc, { ...ctx, signerFingerprint: signer ? signer.fingerprint : '' });
  const prev = doc.file || null;

  /* ---------- ใช้ไฟล์เดิม ---------- */
  if (prev && prev.key === key && prev.pdf) {
    try {
      const pdf = await storage.get(prev.pdf);
      const xml = prev.xml ? (await storage.get(prev.xml)).toString('utf8') : null;
      return { pdf, xml, xmlName: prev.xmlName || null, cached: true, file: prev };
    } catch {
      // ไฟล์หายจากที่เก็บ (เช่น ลบถังทิ้งตอนทดลอง) ไม่ใช่เหตุให้ผู้ใช้เปิดเอกสารไม่ได้ วาดใหม่แทน
    }
  }

  /* ---------- วาดใหม่ ---------- */
  const built = await pdfbuild.buildDocument(
    { ...doc, brand: ctx.brand || null, verifyUrl: ctx.verifyUrl || '' },
    { bahtText: ctx.bahtText, generatedAt: ctx.now || new Date(), signer },
  );

  const file = {
    key,
    pdf: null,
    xml: null,
    xmlName: built.xmlName || null,
    bytes: built.pdf.length,
    at: (ctx.now || new Date()).toISOString(),
    renderVersion: RENDER_VERSION,
    // WP6: ไฟล์นี้มีลายมือชื่อดิจิทัลไหม และลงด้วยใบรับรองใบไหน (หน้าตรวจสอบใช้แสดงผล)
    digitallySigned: !!built.digitallySigned,
    certFingerprint: built.digitallySigned ? signer.fingerprint : null,
  };

  if (typeof ctx.save === 'function') {
    file.pdf = await storage.put(built.pdf, 'pdf', { prefix: 'doc-' });
    if (built.xml) file.xml = await storage.put(Buffer.from(built.xml, 'utf8'), 'xml', { prefix: 'doc-' });
    await ctx.save(file);
    // ลบไฟล์เก่าหลังบันทึกของใหม่สำเร็จแล้วเท่านั้น ถ้าลบก่อนแล้วบันทึกพลาด เอกสารจะชี้ไปยังไฟล์ที่ไม่มีอยู่
    if (prev) {
      if (prev.pdf && prev.pdf !== file.pdf) await storage.remove(prev.pdf);
      if (prev.xml && prev.xml !== file.xml) await storage.remove(prev.xml);
    }
  }

  return { pdf: built.pdf, xml: built.xml, xmlName: built.xmlName, cached: false, file };
}

/** ลบไฟล์ที่ cache ไว้ของเอกสาร (ใช้ตอนลบแบบร่างและตอนลบบัญชีตาม PDPA) */
async function purge(doc) {
  const f = doc && doc.file;
  if (!f) return false;
  if (f.pdf) await storage.remove(f.pdf);
  if (f.xml) await storage.remove(f.xml);
  return true;
}

/** ระบบพร้อมสร้าง PDF จริงไหม (ติดตั้งไลบรารีและวางฟอนต์ครบ) */
function ready() {
  const font = pdfbuild.fontStatus();
  let libs = true;
  try { require.resolve('pdfkit'); require.resolve('@cantoo/pdf-lib'); } catch { libs = false; }
  return { ok: font.ready && libs, fonts: font.ready, libs, missingFonts: font.missing };
}

module.exports = {
  getOrBuild, purge, renderKey, downloadName, ready,
  supportsXml: xmlbuild.supports, RENDER_VERSION,
};
