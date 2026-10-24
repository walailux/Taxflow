'use strict';
/**
 * docshape.js ปรับรูปร่างเอกสารให้เป็นแบบเดียวก่อนนำไปวาดหรือแปลงเป็น XML (WP5)
 * ==========================================================================
 * เอกสารในระบบเดินทางมาถึงตัวสร้างไฟล์ได้สองรูปร่าง
 *
 *   1) เอกสารที่บันทึกจริงในฐานข้อมูล (lib/docbuild.js เป็นคนสร้าง)
 *      - คู่ค้าอยู่ที่ `partyInfo` ส่วน `party` เป็นแค่ "ชื่อ" ที่ใช้แสดงในตาราง
 *      - ยอดเงินถูกคลี่ออกมาเป็นฟิลด์ระดับบนสุด (base, vat, total, wht, net)
 *        เพื่อให้แดชบอร์ดและการส่งออกอ่านได้โดยไม่ต้องขุดเข้าไปในก้อน calc
 *
 *   2) เอกสารตัวอย่างและชุดทดสอบ ส่ง `party` กับ `calc` มาเป็นก้อนเดียวตรง ๆ
 *
 * ถ้าปล่อยให้โค้ดวาดเอกสารไปเช็คเองทุกจุด จะพลาดได้ง่ายมาก และอาการที่ได้คือ
 * "เอกสารออกมาว่างเปล่าโดยไม่มี error ฟ้อง" ซึ่งหาสาเหตุยาก
 * (พบจริงตอนต่อ PDF เข้ากับ route: ตัวสร้าง XML อ่าน doc.party ที่เป็นสตริง
 *  แล้วแจ้งว่าไม่มีชื่อผู้ซื้อ ทั้งที่ข้อมูลอยู่ครบใน partyInfo)
 * จึงรวมการแปลงไว้ที่เดียวแล้วให้ทั้ง docplan และ xmlbuild เรียกใช้ชุดเดียวกัน
 */

/** ข้อมูลคู่ค้าในรูปแบบก้อนเดียว ไม่ว่าเอกสารจะมาจากทางไหน */
function partyOf(doc) {
  if (!doc) return {};
  if (doc.partyInfo && typeof doc.partyInfo === 'object') return doc.partyInfo;
  if (doc.party && typeof doc.party === 'object') return doc.party;
  return {
    name: doc.party || doc.payee || doc.buyer || '',
    taxId: doc.partyTaxId || doc.payeeTaxId || doc.buyerTaxId || '',
    address: doc.partyAddress || '',
  };
}

/** ยอดเงินในรูปแบบก้อนเดียว */
function calcOf(doc) {
  if (!doc) return {};
  if (doc.calc && typeof doc.calc === 'object') return doc.calc;
  return {
    subtotal: doc.subtotal, lineDiscount: doc.lineDiscount, billDiscount: doc.billDiscount,
    base: doc.base, vatRate: doc.vatRate, vat: doc.vat, total: doc.total,
    whtRate: doc.whtRate ?? doc.rate, wht: doc.wht, net: doc.net, income: doc.income,
    surcharge: doc.surcharge,
  };
}

module.exports = { partyOf, calcOf };
