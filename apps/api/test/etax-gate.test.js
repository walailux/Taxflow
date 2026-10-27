'use strict';
/** สิทธิ์ออกใบกำกับภาษีอิเล็กทรอนิกส์ / ใบรับอิเล็กทรอนิกส์: ต้องผ่าน KYC + จด VAT + ได้รับสิทธิ์ e-Tax จากแอดมิน */
const test = require('node:test');
const assert = require('node:assert');
const profile = require('../lib/profile');

// โปรไฟล์ที่กรอกครบ ผ่าน KYC แล้ว ใช้เป็นฐานของทุกกรณี
const base = () => ({
  ...profile.defaults('corporate'),
  role: 'corporate', displayName: 'บริษัท ทดสอบ จำกัด', companyName: 'บริษัท ทดสอบ จำกัด', companyType: 'บริษัทจำกัด',
  authName: 'สมชาย ใจดี', authPosition: 'กรรมการผู้จัดการ', taxId: '0105561234567', branchType: 'head',
  addr: profile.normalizeAddress({ no: '1', subdistrict: 'สีลม', district: 'บางรัก', province: 'กรุงเทพมหานคร', postcode: '10500' }),
  phone: '0812345678', email: 'test@taxflow.test', verifyStatus: 'verified', vatRegistered: true,
});

test('เอกสารทั่วไป: ผ่าน KYC แล้วออกได้โดยไม่ต้องมีสิทธิ์ e-Tax', () => {
  const u = base();
  const gate = profile.canIssue(u, 'INVOICE');
  if (!gate.ok) assert.ok(gate.missing, 'ถ้าออกไม่ได้ต้องเป็นเพราะโปรไฟล์ไม่ครบ ไม่ใช่เรื่อง e-Tax');
  assert.notStrictEqual(gate.etax, 'none');
});

test('เอกสารทั่วไป: ยังไม่ผ่าน KYC ออกไม่ได้', () => {
  const gate = profile.canIssue({ ...base(), verifyStatus: 'pending' }, 'INVOICE');
  assert.strictEqual(gate.ok, false);
  assert.match(gate.error, /ยืนยันตัวตน/);
});

test('ยังไม่ผ่าน KYC: "บันทึกข้อตกลงย้อนหลัง" (purpose=record) ก็สร้างไม่ได้ ทุกบัญชีใหม่ต้องรอแอดมินยืนยันตัวตน', () => {
  for (const st of ['unverified', 'pending', 'rejected', undefined]) {
    for (const type of ['QUOTATION', 'WHT', 'CONTRACT_INF']) {
      const gate = profile.canIssue({ ...base(), verifyStatus: st }, type, { purpose: 'record' });
      assert.strictEqual(gate.ok, false, `${type} สถานะ ${st}`);
      assert.match(gate.error, /ยืนยันตัวตน/);
    }
  }
});

for (const type of ['ETAX_INVOICE', 'ETAX_RECEIPT', 'ETAX']) {
  test(`${type}: จด VAT แต่ยังไม่ได้สิทธิ์ e-Tax ออกไม่ได้`, () => {
    for (const st of ['none', 'pending', 'rejected', undefined]) {
      const gate = profile.canIssue({ ...base(), etaxStatus: st }, type);
      assert.strictEqual(gate.ok, false, `สถานะ ${st}`);
      assert.match(gate.error, /กรมสรรพากร/);
    }
  });
  test(`${type}: ยังไม่จด VAT ออกไม่ได้แม้มีสถานะอนุมัติค้างอยู่`, () => {
    const gate = profile.canIssue({ ...base(), vatRegistered: false, etaxStatus: 'approved' }, type);
    assert.strictEqual(gate.ok, false);
    assert.match(gate.error, /ภาษีมูลค่าเพิ่ม/);
  });
  test(`${type}: ยังไม่ผ่าน KYC ออกไม่ได้แม้ได้สิทธิ์ e-Tax`, () => {
    const gate = profile.canIssue({ ...base(), verifyStatus: 'rejected', etaxStatus: 'approved' }, type);
    assert.strictEqual(gate.ok, false);
  });
  test(`${type}: ผ่าน KYC + จด VAT + ได้สิทธิ์ e-Tax จึงผ่านด่านสิทธิ์`, () => {
    const gate = profile.canIssue({ ...base(), etaxStatus: 'approved' }, type);
    assert.notStrictEqual(gate.etax, 'none');
    if (!gate.ok) assert.ok(gate.missing, 'ถ้าออกไม่ได้ต้องเป็นเพราะโปรไฟล์ไม่ครบเท่านั้น');
  });
}

test('หลักฐานที่ต้องแนบตามวิธี: Service Provider ต้องมีหนังสือรับรองผู้ให้บริการเพิ่ม', () => {
  assert.deepStrictEqual(profile.etaxRequiredDocs('own_cert'), ['vat_pp20', 'etax_approval']);
  assert.deepStrictEqual(profile.etaxRequiredDocs('service_provider'), ['vat_pp20', 'etax_approval', 'etax_sp_cert']);
});
