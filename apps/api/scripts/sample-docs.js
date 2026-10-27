'use strict';
/**
 * scripts/sample-docs.js เนื้อหาเอกสารตัวอย่างที่ผ่านการตรวจของระบบ ใช้ร่วมกันระหว่าง
 * scripts/seed-test-accounts.js (เติมเอกสารบัญชีทดสอบ) และ test/http-*.test.js (ยิง API จริง)
 * ข้อมูลใน scripts/pdf-all.js ใช้ทำ PDF อย่างเดียว เลขผู้เสียภาษีจึงไม่ผ่านการตรวจตอนสร้างเอกสารจริง ที่นี่แก้ให้ถูกต้อง
 */
const SAMPLE = require('./pdf-all');

/** เลขผู้เสียภาษี 13 หลักที่ check digit ถูกต้อง จาก 12 หลักแรก */
function taxIdOf(first12) {
  const d = String(first12).split('').map(Number);
  const sum = d.reduce((s, n, i) => s + n * (13 - i), 0);
  return `${first12}${(11 - (sum % 11)) % 10}`;
}

/** คู่ค้าตัวอย่าง (เลขผู้เสียภาษีหลักตรวจสอบถูกต้อง สาขาตามรูปแบบที่กำหนด) */
const PARTNER = {
  ...SAMPLE.partyInfo,
  entityType: 'juristic', name: 'บริษัท คู่ค้าตัวอย่าง จำกัด', taxId: taxIdOf('010555900001'), branch: 'สำนักงานใหญ่',
  email: 'partner@taxflow.test', bankAccountName: 'บริษัท คู่ค้าตัวอย่าง จำกัด',
};
const PERSON_ID = taxIdOf('110070900002'); // เลขประจำตัวประชาชนตัวอย่าง (หลักตรวจสอบถูกต้อง)
const FIELD_FIX = {
  RECEIPT: { payDate: '2026-09-20' },
  POA: { grantorIdNo: PARTNER.taxId, granteeCitizenId: PERSON_ID },
};

/** เนื้อหาเอกสารตัวอย่างของประเภทหนึ่ง (ข้อมูลชุดเดียวกับ scripts/pdf-all.js แก้เลขผู้เสียภาษีให้ถูกต้อง) */
function bodyFor(type) {
  let items = SAMPLE.itemsFor(type);
  // ภ.ง.ด.53 = ผู้รับเงินนิติบุคคล · ภ.ง.ด.3 = ผู้รับเงินบุคคลธรรมดา
  if (type === 'PND53') items = items.slice(0, 3).map((it, i) => ({ ...it, payeeTaxId: taxIdOf(`01055590010${i}`) }));
  if (type === 'PND3') {
    items = items.slice(0, 3).map((it, i) => ({ ...it, payeeName: `นายผู้รับเงิน ตัวอย่างที่ ${i + 1}`, payeeTaxId: taxIdOf(`11007090010${i}`), payeeBranch: '' }));
  }
  const party = type === 'CONTRACT_INF' ? { ...PARTNER, entityType: 'individual', name: 'นางสาวตัวอย่าง ผู้สร้างสรรค์', taxId: PERSON_ID, branch: '' } : PARTNER;
  return { docPurpose: 'self', fields: { ...(SAMPLE.FIELDS[type] || {}), ...(FIELD_FIX[type] || {}) }, party: { ...party }, items };
}

module.exports = { taxIdOf, PARTNER, PERSON_ID, bodyFor };
