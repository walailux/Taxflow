'use strict';
/**
 * pitdocs.js ดึงเงินได้และภาษีที่ถูกหัก ณ ที่จ่ายจากเอกสารในระบบ สำหรับคำนวณภาษีเงินได้บุคคลธรรมดา
 * ใช้ร่วมกันระหว่าง /api/creator/summary และ /api/pit/from-documents ตัวเลขจึงตรงกันทุกหน้า
 *
 * แหล่งข้อมูล (เฉพาะเอกสารที่มีผล: ไม่ใช่แบบร่าง ยกเลิก หรือไม่อนุมัติ และอยู่ในปีภาษีที่เลือก)
 * - หนังสือรับรอง 50 ทวิ ที่ได้รับ (WHT): ประเภทเงินได้ตามที่บันทึก ยอดก่อนหักภาษี และภาษีที่ถูกหักไว้
 * - เอกสารรายได้ที่ออกเอง (ใบแจ้งหนี้/ใบเสร็จ/e-Tax): ใช้ยอดก่อน VAT ประเภทเงินได้ตามที่ผู้ใช้เลือก
 *   ใบเสร็จที่อ้างอิงใบแจ้งหนี้ (และ e-Tax ที่อ้างอิงใบกำกับ) เป็นเงินก้อนเดียวกัน นับเฉพาะฉบับปลายทาง
 */
const { bangkokDateStr } = require('./context');

const ISSUED_INCOME_TYPES = ['INVOICE', 'RECEIPT', 'ETAX', 'ETAX_INVOICE', 'ETAX_RECEIPT'];
const NON_EFFECTIVE = ['draft', 'cancelled', 'rejected'];
const PIT_TYPES = ['40(1)', '40(2)', '40(3)', '40(4)', '40(5)', '40(6)', '40(7)', '40(8)'];

/** ปีภาษี (ค.ศ.) ของเอกสาร ตามวันที่ออกเอกสารเวลาไทย */
const docYear = (d) => String(d.issueDate || bangkokDateStr(new Date(d.createdAt || Date.now()))).slice(0, 4);

/** 'มาตรา 40(2)' / '40(8)' -> '40(2)' / '40(8)' (ไม่รู้จักให้เป็น fallback) */
function pitTypeOf(text, fallback) {
  const m = /40\s*\((\d)\)/.exec(String(text || ''));
  const key = m ? `40(${m[1]})` : '';
  return PIT_TYPES.includes(key) ? key : fallback;
}

/**
 * @param {object[]} docs เอกสารทั้งหมดของผู้ใช้
 * @param {string|number} year ปีภาษี ค.ศ.
 * @param {string} issuedType ประเภทเงินได้ของเอกสารที่ออกเอง เช่น '40(2)' หรือ '40(8)'
 */
function pitSourcesFromDocs(docs, year, issuedType = '40(2)') {
  const y = String(year);
  const type = PIT_TYPES.includes(issuedType) ? issuedType : '40(2)';
  const inYear = (d) => !NON_EFFECTIVE.includes(d.status) && docYear(d) === y;

  const wht = docs.filter((d) => d.type === 'WHT' && inYear(d));
  const issued = docs.filter((d) => ISSUED_INCOME_TYPES.includes(d.type) && inYear(d));
  const referenced = new Set(issued.flatMap((d) => Object.values(d.refs || {})).map(String));

  const sources = [
    ...wht.map((d) => ({
      id: d.id, kind: 'wht', docNo: d.docNo || '', type: d.type, date: d.issueDate || (d.createdAt || '').slice(0, 10),
      party: d.payer || d.party || '', incomeType: pitTypeOf(d.incomeType, '40(2)'),
      amount: Number(d.base) || 0, wht: Number(d.wht) || 0,
    })),
    ...issued.filter((d) => !referenced.has(String(d.id))).map((d) => ({
      id: d.id, kind: 'issued', docNo: d.docNo || '', type: d.type, date: d.issueDate || (d.createdAt || '').slice(0, 10),
      party: (d.partyInfo && d.partyInfo.name) || d.party || '', incomeType: type,
      amount: Number(d.base) || 0, wht: 0,
    })),
  ];

  const incomes = {};
  let withholding = 0;
  for (const s of sources) {
    incomes[s.incomeType] = (incomes[s.incomeType] || 0) + s.amount;
    withholding += s.wht;
  }
  return { year: Number(y), issuedType: type, sources, incomes, withholding, skippedReferenced: issued.length - sources.filter((s) => s.kind === 'issued').length };
}

module.exports = { pitSourcesFromDocs, pitTypeOf, docYear, PIT_TYPES, ISSUED_INCOME_TYPES };
