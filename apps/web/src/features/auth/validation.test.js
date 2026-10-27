import { describe, expect, it } from 'vitest';
import {
  EMPTY_REGISTER_FORM, buildRegisterBody, checkRegisterField, entityOf, loginErrors, missingRequiredConsent,
  normalizeOtp, otpError, otpModeFromLogin, passwordErrors, passwordRules, passwordStrength, step2Errors,
} from './validation.js';

// เลขผู้เสียภาษีที่หลักตรวจสอบถูกต้อง (สูตรเดียวกับ packages/shared/thaiid.js)
const VALID_TAXID = '1234567890121';
const TODAY = '2026-09-22';

const filled = (over = {}) => ({
  ...EMPTY_REGISTER_FORM,
  name: 'นุสนีย์ มะแอเคียน', taxId: VALID_TAXID,
  addrNo: '55/1', addrSub: 'ทุ่งมหาเมฆ', addrDist: 'สาทร', addrProv: 'กรุงเทพมหานคร', addrPost: '10120',
  email: 'nus@example.com', password: 'abc12345', password2: 'abc12345', consent: ['service', 'identity'],
  ...over,
});

describe('เข้าสู่ระบบ', () => {
  it('ช่องว่างทั้งสองช่องฟ้องทั้งคู่', () => {
    const e = loginErrors({ email: '', password: '' });
    expect(e.email).toMatch(/อีเมล/);
    expect(e.password).toMatch(/รหัสผ่าน/);
  });
  it('อีเมลผิดรูปแบบใช้ข้อความเดียวกับ docschema.FORMAT.email', () => {
    expect(loginErrors({ email: 'abc', password: 'x' }).email).toMatch(/example@email\.com/);
  });
  it('ตัดช่องว่างและตัวพิมพ์ใหญ่ก่อนตรวจ', () => {
    expect(loginErrors({ email: '  User@Example.COM ', password: 'x' })).toEqual({});
  });
  it('เลือกขั้นยืนยันถัดไปตามผลของ API', () => {
    expect(otpModeFromLogin({ otpRequired: true })).toBe('login');
    expect(otpModeFromLogin({ totpRequired: true })).toBe('totp');
    expect(otpModeFromLogin({ pendingVerification: true })).toBe('register');
  });
});

describe('OTP', () => {
  it('รับเฉพาะตัวเลข 6 หลัก', () => {
    expect(normalizeOtp('12a 34-5678')).toBe('123456');
    expect(otpError('12345')).toBeTruthy();
    expect(otpError('123456')).toBeNull();
  });
});

describe('รหัสผ่าน', () => {
  it('ข้อความตรงกับเงื่อนไขฝั่ง API', () => {
    expect(passwordErrors('abc', '', {}).password).toMatch(/อย่างน้อย 8/);
    expect(passwordErrors('abcdefgh', '', {}).password).toMatch(/ตัวอักษรภาษาอังกฤษและตัวเลข/);
    expect(passwordErrors('abc12345', 'abc1234', {}).password2).toMatch(/ไม่ตรงกัน/);
    expect(passwordErrors('abc12345', 'abc12345', {})).toEqual({});
  });
  it('ช่องว่างฟ้องเฉพาะตอนกดสร้างบัญชี', () => {
    expect(passwordErrors('', '', {})).toEqual({});
    expect(Object.keys(passwordErrors('', '', { showEmpty: true }))).toEqual(['password', 'password2']);
  });
  it('ระดับความแข็งแรง', () => {
    expect(passwordStrength('').percent).toBe(0);
    expect(passwordStrength('abc12345').level).toBe('fair');
    expect(passwordStrength('abc12345!xyz').level).toBe('strong');
    expect(passwordStrength('abcd').level).toBe('weak');
  });
  it('เงื่อนไขรหัสผ่าน: ยังไม่พิมพ์ต้องไม่มีข้อไหนขึ้นว่าผ่าน และครบ 3 ข้อเมื่อรหัสถูกต้อง', () => {
    expect(passwordRules('').map((r) => r.ok)).toEqual([false, false, false]);
    expect(passwordRules('abcdefgh').map((r) => r.ok)).toEqual([true, true, false]);
    expect(passwordRules('abc12345').every((r) => r.ok)).toBe(true);
  });
});

describe('สมัครสมาชิก ขั้นที่ 2', () => {
  it('ประเภทผู้เสียภาษีตามบทบาท', () => {
    expect(entityOf('creator', 'juristic')).toBe('individual');
    expect(entityOf('corporate', 'individual')).toBe('juristic');
    expect(entityOf('agency', 'individual')).toBe('individual');
  });
  it('ฟอร์มครบของอินฟลูเอนเซอร์ผ่าน', () => {
    expect(step2Errors(filled(), TODAY)).toEqual({});
  });
  it('เลขผู้เสียภาษีหลักตรวจสอบผิดถูกฟ้อง', () => {
    expect(step2Errors(filled({ taxId: '1234567890123' }), TODAY).taxId).toMatch(/หลักตรวจสอบ/);
  });
  it('นิติบุคคลต้องมีผู้มีอำนาจลงนาม และเลขสาขาเมื่อเลือกสาขา', () => {
    const f = filled({ role: 'corporate', branchType: 'branch' });
    const e = step2Errors(f, TODAY);
    expect(e.authName).toBeTruthy();
    expect(e.branchCode).toBeTruthy();
    expect(step2Errors({ ...f, authName: 'สมชาย ใจดี', branchCode: '00001' }, TODAY)).toEqual({});
  });
  it('ช่องของนิติบุคคลไม่ถูกตรวจเมื่อเป็นบุคคลธรรมดา', () => {
    expect(checkRegisterField('authName', filled({ role: 'creator' }), TODAY)).toBeNull();
  });
  it('วันที่จดทะเบียน VAT ต้องไม่เป็นวันในอนาคต', () => {
    expect(step2Errors(filled({ vat: 'yes' }), TODAY).vatRegDate).toBeTruthy();
    expect(step2Errors(filled({ vat: 'yes', vatRegDate: '2026-12-01' }), TODAY).vatRegDate).toMatch(/อนาคต/);
    expect(step2Errors(filled({ vat: 'yes', vatRegDate: '2025-01-15' }), TODAY)).toEqual({});
  });
  it('กรอกเลขบัญชีแล้วต้องมีชื่อบัญชี', () => {
    expect(step2Errors(filled({ bankNo: '1234567890' }), TODAY).bankAcc).toBeTruthy();
  });
});

describe('ความยินยอมและ body ที่ส่งให้ API', () => {
  const purposes = [{ key: 'service', required: true }, { key: 'identity', required: true }, { key: 'kyc', required: false }];
  it('หาข้อที่จำเป็นแต่ยังไม่ยินยอม', () => {
    expect(missingRequiredConsent(purposes, ['service'])).toEqual(['identity']);
    expect(missingRequiredConsent(purposes, ['service', 'identity'])).toEqual([]);
  });
  it('บุคคลธรรมดาไม่ส่งข้อมูลนิติบุคคล', () => {
    const b = buildRegisterBody(filled({ companyType: 'บริษัทจำกัด', authName: 'x' }));
    expect(b.entityType).toBe('individual');
    expect(b.companyName).toBe('');
    expect(b.companyType).toBe('');
    expect(b.authName).toBe('');
    expect(b.branchType).toBe('head');
    expect(b.displayName).toBe('นุสนีย์ มะแอเคียน');
    expect(b.passwordConfirm).toBe('abc12345');
    expect(b.addr).toEqual({ no: '55/1', street: '', subdistrict: 'ทุ่งมหาเมฆ', district: 'สาทร', province: 'กรุงเทพมหานคร', postcode: '10120' });
  });
  it('นิติบุคคลใช้ชื่อเป็น companyName และส่ง VAT ครบ', () => {
    const b = buildRegisterBody(filled({ role: 'agency', entityType: 'juristic', name: 'บริษัท ก จำกัด', vat: 'yes', vatRegDate: '2025-01-15', email: ' A@B.co ' }));
    expect(b.companyName).toBe('บริษัท ก จำกัด');
    expect(b.vatRegistered).toBe(true);
    expect(b.vatRegDate).toBe('2025-01-15');
    expect(b.email).toBe('a@b.co');
  });
});
