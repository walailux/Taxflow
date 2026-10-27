'use strict';
/**
 * core/pnd.js จัดทำข้อมูล ภ.ง.ด.3 / ภ.ง.ด.53 — ย้ายจาก server.js เดิม (WP1 ตรรกะไม่เปลี่ยน)
 * ใช้ร่วมกันระหว่าง routes/pnd.js (ดึงรายการให้เลือก) และ routes/documents.js (ล็อกยอดตอนบันทึก)
 */
const store = require('./store');
const { DS, isIssuedEffective } = require('./context');

async function pndCandidates(user, form, month, yearBE) {
  const yCE = Number(yearBE) - 543;
  const inMonth = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && Number(iso.slice(0, 4)) === yCE && Number(iso.slice(5, 7)) === Number(month);
  const mine = await store.allWhere('documents', { userId: user.id }, (d) => ['EWHT', 'PAYMENT'].includes(d.type) && d.schemaVersion === 2);
  const certs = mine.filter((d) => d.type === 'EWHT');
  const linkedPayments = new Set(certs.filter((c) => c.status !== 'cancelled' && c.refDocId).map((c) => c.refDocId));
  const rows = [];
  let draftsSkipped = 0;
  for (const c of certs) {
    const F = c.fields || {};
    if (F.pndForm !== form || !inMonth(F.payDate)) continue;
    if (!isIssuedEffective(c)) { if (c.status === 'draft') draftsSkipped++; continue; }
    rows.push({
      sourceType: 'EWHT', sourceId: c.id, sourceNo: c.docNo,
      payeeName: c.partyInfo.name, payeeTaxId: c.partyInfo.taxId, payeeBranch: '', payeeAddress: c.partyInfo.address,
      payDate: F.payDate, incomeCode: F.incomeCode, incomeDesc: F.incomeDesc || DS.INCOME_TYPES.find((t) => t.code === F.incomeCode).short,
      rate: c.whtRate, amount: c.income, wht: c.wht, condition: F.whtCondition || '1',
    });
  }
  for (const p of mine.filter((d) => d.type === 'PAYMENT')) {
    const F = p.fields || {};
    if (!F.hasWht || !(p.wht > 0) || !inMonth(F.payDate) || linkedPayments.has(p.id)) continue;
    if (DS.autoPndForm(p.partyInfo, F.incomeCode) !== form) continue;
    if (!isIssuedEffective(p)) { if (p.status === 'draft') draftsSkipped++; continue; }
    rows.push({
      sourceType: 'PAYMENT', sourceId: p.id, sourceNo: p.docNo,
      payeeName: p.partyInfo.name, payeeTaxId: p.partyInfo.taxId, payeeBranch: '', payeeAddress: p.partyInfo.address,
      payDate: F.payDate, incomeCode: F.incomeCode, incomeDesc: F.incomeDesc,
      rate: p.whtRate, amount: p.income, wht: p.wht, condition: F.whtCondition || '1',
    });
  }
  rows.sort((a, b) => (a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : 0));
  return { rows, draftsSkipped };
}
// แถวที่ดึงมาจากเอกสารในระบบ ห้ามแก้ตัวเลขจากหน้าเว็บ แทนที่ด้วยข้อมูลจากเอกสารต้นทางจริงเสมอ
async function lockPndRows(user, type, b) {
  if (!DS.FORMS[type] || DS.FORMS[type].mode !== 'pnd' || !Array.isArray(b.items)) return [];
  const F = (b.fields || {});
  const { rows } = await pndCandidates(user, type, Number(F.taxMonth), Number(F.taxYearBE));
  const byKey = new Map(rows.map((r) => [r.sourceType + r.sourceId, r]));
  const errors = [];
  b.items = b.items.map((it) => {
    if (!it || !it.sourceId) return it; // รายการที่กรอกเอง (จ่ายนอกระบบ)
    const real = byKey.get(it.sourceType + it.sourceId);
    if (!real) { errors.push(`รายการอ้างอิง ${it.sourceNo || it.sourceId} ไม่อยู่ในเดือนภาษีนี้ หรือถูกยกเลิก/ยังเป็นแบบร่าง กด "ดึงข้อมูลใหม่"`); return null; }
    return real;
  }).filter(Boolean);
  return errors;
}

module.exports = { pndCandidates, lockPndRows };
