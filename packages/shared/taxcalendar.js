'use strict';

/**
 * taxcalendar.js ปฏิทินกำหนดยื่นภาษีโดยประมาณ + ข้อมูลสำหรับแจ้งเตือนล่วงหน้า
 * คำนวณจาก "วันที่ปัจจุบันตามเวลาไทย" ที่ส่งเข้ามาเป็นสตริง YYYY-MM-DD (ไม่เรียก new Date()
 * ตรงๆ ภายในไฟล์นี้) เพื่อให้ผลลัพธ์คงที่ ทดสอบได้แน่นอนไม่ขึ้นกับเวลาที่รันจริง
 *
 * ข้อควรระวัง: เป็นการประมาณกำหนดยื่นตามหลักทั่วไปของกรมสรรพากร ไม่ใช่คำแนะนำทางกฎหมาย/ภาษี
 * ที่แม่นยำ 100% (เช่น ไม่ได้เลื่อนวันหยุดราชการ/เสาร์-อาทิตย์ให้อัตโนมัติ) ใช้เป็นตัวเตือนเบื้องต้นเท่านั้น
 */

function parseYMD(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return { y, m, d };
}
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function toDate(y, m, d) { return new Date(Date.UTC(y, m - 1, Math.min(d, daysInMonth(y, m)))); }
function fmtYMD(dt) {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function daysBetween(fromYMD, toDt) {
  const { y, m, d } = parseYMD(fromYMD);
  return Math.round((toDt.getTime() - toDate(y, m, d).getTime()) / 86400000);
}

/** กำหนดยื่นแบบรายเดือนที่ตกวันเดิมทุกเดือน (เช่น ภ.พ.30 ทุกวันที่ 15, ภ.ง.ด.3/53 ทุกวันที่ 7) */
function nextMonthlyDeadline(day, fromYMD) {
  const { y, m, d } = parseYMD(fromYMD);
  if (d <= day) return toDate(y, m, day);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return toDate(ny, nm, day);
}

/** กำหนดยื่นรายปีที่ตกวัน/เดือนเดิมทุกปี (เช่น ภ.ง.ด.90/91 ภายใน 31 มี.ค.) */
function nextAnnualDeadline(month, day, fromYMD) {
  const { y, m, d } = parseYMD(fromYMD);
  if (m < month || (m === month && d <= day)) return toDate(y, month, day);
  return toDate(y + 1, month, day);
}

const FORMS = {
  VAT: { key: 'VAT', label: 'ยื่นแบบภาษีมูลค่าเพิ่ม (ภ.พ.30)', kind: 'monthly', day: 15 },
  WHT: { key: 'WHT', label: 'นำส่งภาษีหัก ณ ที่จ่าย (ภ.ง.ด.3 / ภ.ง.ด.53)', kind: 'monthly', day: 7 },
  PIT: { key: 'PIT', label: 'ยื่นแบบภาษีเงินได้บุคคลธรรมดาประจำปี (ภ.ง.ด.90/91)', kind: 'annual', month: 3, day: 31 },
};

/**
 * รายการกำหนดยื่นภาษีที่เกี่ยวข้องกับผู้ใช้รายนี้ เรียงจากใกล้ถึงไกล
 * @param {{vatRegistered?:boolean, entityType?:string, role?:string}} user
 * @param {string} fromYMD วันที่ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD
 */
function upcomingDeadlines(user, fromYMD) {
  const forms = [];
  // VAT: เฉพาะผู้จดทะเบียนภาษีมูลค่าเพิ่ม
  if (user.vatRegistered) forms.push(FORMS.VAT);
  // WHT นำส่ง: เฉพาะผู้มีหน้าที่ "หัก ณ ที่จ่ายแล้วนำส่ง" ปกติคือนิติบุคคล/เอเจนซี่ที่จ่ายเงินให้คู่ค้า
  // ไม่ใช่ครีเอเตอร์ซึ่งเป็นฝ่ายถูกหักภาษี (ผู้รับเงิน ไม่ใช่ผู้จ่าย)
  if (user.role === 'agency' || user.role === 'corporate') forms.push(FORMS.WHT);
  // PIT: บุคคลธรรมดาทุกคนมีหน้าที่ยื่นภาษีเงินได้ประจำปี
  if (user.entityType === 'individual') forms.push(FORMS.PIT);

  return forms
    .map((f) => {
      const due = f.kind === 'monthly' ? nextMonthlyDeadline(f.day, fromYMD) : nextAnnualDeadline(f.month, f.day, fromYMD);
      return { key: f.key, label: f.label, dueDate: fmtYMD(due), daysLeft: daysBetween(fromYMD, due) };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

module.exports = { upcomingDeadlines, nextMonthlyDeadline, nextAnnualDeadline };
