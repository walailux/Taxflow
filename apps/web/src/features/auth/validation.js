/**
 * validation.js กติกาตรวจข้อมูลของหน้าเข้าสู่ระบบ สมัครสมาชิก และ OTP
 * ---------------------------------------------------------------------
 * ย้ายมาจาก REG_RULES / pwCheck / collectRegisterBody ใน _public_legacy/login.html แบบคำต่อคำ
 * ตัวตรวจแต่ละช่องคือ docschema.checkField ตัวเดียวกับที่ API ใช้ ข้อความผิดพลาดจึงตรงกันทุกกรณี
 * (เกณฑ์เสร็จงานของ WP2) ไฟล์นี้ไม่แตะ React เพื่อให้ทดสอบด้วย Vitest ได้ตรง ๆ
 */
import { docschema } from '../../lib/shared.js';

const { checkField } = docschema;

export const digitsOnly = (v) => String(v == null ? '' : v).replace(/\D/g, '');
export const bangkokToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export const normalizeEmail = (v) => String(v || '').trim().toLowerCase();

const EMAIL_DEF = { label: 'อีเมล', type: 'text', fmt: 'email', maxLen: 150 };

/* ---------- เข้าสู่ระบบ ---------- */
export function loginErrors({ email, password }) {
  const out = {};
  const e = checkField(EMAIL_DEF, normalizeEmail(email), { need: true });
  if (e) out.email = e;
  if (!password) out.password = 'กรุณากรอกรหัสผ่าน (ห้ามเว้นว่าง)';
  return out;
}

/** ตรวจอีเมลตอนออกจากช่อง ช่องว่างยังไม่ฟ้อง (ฟ้องตอนกดเข้าสู่ระบบ) */
export function liveEmailError(email) {
  const v = normalizeEmail(email);
  return v ? checkField(EMAIL_DEF, v, {}) : null;
}

/** ผลของ /api/auth/login บอกว่าขั้นถัดไปต้องยืนยันแบบไหน */
export function otpModeFromLogin(data) {
  if (data && data.totpRequired) return 'totp';
  if (data && data.pendingVerification) return 'register';
  return 'login';
}

/* ---------- OTP ---------- */
export const normalizeOtp = (v) => digitsOnly(v).slice(0, 6);
export const otpError = (code) => (/^\d{6}$/.test(code) ? null : 'กรุณากรอกรหัส 6 หลักให้ครบ');

/* ---------- รหัสผ่าน ---------- */
/**
 * เงื่อนไขที่แสดงใต้ช่องรหัสผ่าน เขียนเป็นภาษาพูดให้ผู้ใช้ทั่วไปเข้าใจทันที
 * (ความยาวสูงสุด 128 ตัวไม่แสดงเป็นข้อ เพราะช่องกรอกจำกัดไว้แล้ว และเดิมขึ้นเครื่องหมายผ่านทั้งที่ยังไม่ได้พิมพ์ ทำให้สับสน)
 */
export function passwordRules(p) {
  const s = String(p || '');
  return [
    { label: 'ยาวอย่างน้อย 8 ตัว', ok: s.length >= 8 },
    { label: 'มีตัวอักษรภาษาอังกฤษ (a–z)', ok: /[A-Za-z]/.test(s) },
    { label: 'มีตัวเลข (0–9)', ok: /\d/.test(s) },
  ];
}

/** คะแนน 0–6 และระดับสำหรับแถบวัดความแข็งแรง (สูตรเดียวกับหน้าเดิม) */
export function passwordStrength(p) {
  const s = String(p || '');
  const score = passwordRules(s).filter((r) => r.ok).length + (s.length <= 128 ? 1 : 0) + (s.length >= 12 ? 1 : 0) + (/[^A-Za-z0-9]/.test(s) ? 1 : 0);
  const level = score >= 5 ? 'strong' : score >= 4 ? 'fair' : 'weak';
  return { score, level, percent: s ? Math.min(100, score * 17) : 0 };
}

/** ข้อความแจ้งเตือนช่องรหัสผ่าน (ข้อความสำหรับผู้ใช้ ไม่ใช่รหัสผ่าน) */
const PW_MSG = {
  tooLong: 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร',
  needMix: 'รหัสผ่านต้องมีทั้งตัวอักษรภาษาอังกฤษและตัวเลข',
  confirmEmpty: 'กรุณายืนยันรหัสผ่าน',
  mismatch: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
};

export function passwordErrors(p, p2, { showEmpty = false } = {}) {
  const s = String(p || '');
  const s2 = String(p2 || '');
  const allOk = passwordRules(s).every((r) => r.ok);
  const out = {};
  if (!s) { if (showEmpty) out.password = 'กรุณากรอกรหัสผ่าน (ห้ามเว้นว่าง)'; }
  else if (s.length < 8) out.password = `รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร (กรอกมา ${s.length})`;
  else if (!allOk) out.password = s.length > 128 ? PW_MSG.tooLong : PW_MSG.needMix;
  if (!s2) { if (showEmpty) out.password2 = PW_MSG.confirmEmpty; }
  else if (s2 !== s) out.password2 = PW_MSG.mismatch;
  return out;
}

/* ---------- สมัครสมาชิก ---------- */
export const EMPTY_REGISTER_FORM = Object.freeze({
  role: 'creator', entityType: 'juristic',
  name: '', tradeName: '', taxId: '',
  companyType: '', branchType: 'head', branchCode: '', authName: '', authPosition: '',
  vat: 'no', vatRegDate: '',
  addrNo: '', addrStreet: '', addrSub: '', addrDist: '', addrProv: '', addrPost: '', phone: '',
  bankName: '', bankNo: '', bankAcc: '', bankAccAuto: true,
  email: '', password: '', password2: '',
  consent: null, // null = ยังไม่ได้ตั้งค่าเริ่มต้นจากรายการความยินยอมของเซิร์ฟเวอร์
});

/** บริษัทผู้ว่าจ้างเป็นนิติบุคคลเสมอ อินฟลูเอนเซอร์เป็นบุคคลธรรมดาเสมอ เอเจนซี่เลือกได้ */
export function entityOf(role, entityType) {
  if (role === 'corporate') return 'juristic';
  if (role === 'creator') return 'individual';
  return entityType === 'individual' ? 'individual' : 'juristic';
}
export const isJuristic = (f) => entityOf(f.role, f.entityType) === 'juristic';

/** กติกาของแต่ละช่อง: def ส่งให้ checkField, need = บังคับกรอก, show = ช่องนี้แสดงอยู่หรือไม่ */
export function registerRules(f) {
  const j = isJuristic(f);
  const vatYes = f.vat === 'yes';
  const t = (label, extra = {}) => ({ label, type: 'text', ...extra });
  return {
    name: { def: t(j ? 'ชื่อนิติบุคคล' : 'ชื่อ-นามสกุล', { minLen: 2, maxLen: 150 }), need: true, show: true },
    tradeName: { def: t('ชื่อทางการค้า', { maxLen: 150 }), show: true },
    taxId: { def: { label: 'เลขประจำตัวผู้เสียภาษี', type: 'taxid' }, need: true, show: true },
    branchCode: { def: t('เลขที่สาขา', { fmt: 'digits5' }), need: j && f.branchType === 'branch', show: j },
    authName: { def: t('ชื่อกรรมการผู้มีอำนาจลงนาม', { minLen: 4, maxLen: 150 }), need: j, show: j },
    vatRegDate: { def: { label: 'วันที่จดทะเบียน VAT', type: 'date', notFuture: true }, need: vatYes, show: vatYes },
    addrNo: { def: t('บ้านเลขที่', { maxLen: 60 }), need: true, show: true },
    addrSub: { def: t('แขวง/ตำบล', { maxLen: 80 }), need: true, show: true },
    addrDist: { def: t('เขต/อำเภอ', { maxLen: 80 }), need: true, show: true },
    addrProv: { def: t('จังหวัด'), need: true, show: true },
    addrPost: { def: t('รหัสไปรษณีย์', { fmt: 'postcode' }), need: true, show: true },
    phone: { def: t('เบอร์ติดต่อ', { fmt: 'phone' }), show: true },
    bankNo: { def: t('เลขที่บัญชี', { fmt: 'bankacc' }), show: true },
    bankAcc: { def: t('ชื่อบัญชี', { maxLen: 150 }), need: !!String(f.bankNo || '').trim(), show: true },
    email: { def: EMAIL_DEF, need: true, show: true },
  };
}

export function checkRegisterField(key, f, today = bangkokToday()) {
  const r = registerRules(f)[key];
  if (!r || !r.show) return null;
  return checkField(r.def, f[key] == null ? '' : f[key], { need: !!r.need, today });
}

export const STEP2_KEYS = ['name', 'tradeName', 'taxId', 'branchCode', 'authName', 'vatRegDate',
  'addrNo', 'addrSub', 'addrDist', 'addrProv', 'addrPost', 'phone', 'bankNo', 'bankAcc'];

export function step2Errors(f, today = bangkokToday()) {
  const out = {};
  for (const k of STEP2_KEYS) {
    const msg = checkRegisterField(k, f, today);
    if (msg) out[k] = msg;
  }
  return out;
}

export function missingRequiredConsent(purposes, given) {
  const g = new Set(given || []);
  return (purposes || []).filter((p) => p.required && !g.has(p.key)).map((p) => p.key);
}

/** ประกอบ body ของ POST /api/auth/register ให้ตรงกับ collectRegisterBody() ของหน้าเดิมทุกช่อง */
export function buildRegisterBody(f) {
  const j = isJuristic(f);
  const vatYes = f.vat === 'yes';
  const s = (v) => String(v == null ? '' : v).trim();
  return {
    role: f.role,
    entityType: entityOf(f.role, f.entityType),
    displayName: s(f.name),
    tradeName: s(f.tradeName),
    companyName: j ? s(f.name) : '',
    companyType: j ? f.companyType : '',
    authName: j ? s(f.authName) : '',
    authPosition: j ? s(f.authPosition) : '',
    taxId: digitsOnly(f.taxId),
    branchType: j ? f.branchType : 'head',
    branchCode: j ? s(f.branchCode) : '',
    vatRegistered: vatYes,
    vatRegDate: vatYes ? s(f.vatRegDate) : '',
    addr: {
      no: s(f.addrNo), street: s(f.addrStreet),
      subdistrict: s(f.addrSub), district: s(f.addrDist),
      province: s(f.addrProv), postcode: s(f.addrPost),
    },
    phone: s(f.phone),
    bank: { bankName: f.bankName || '', accountNo: s(f.bankNo), accountName: s(f.bankAcc) },
    email: normalizeEmail(f.email),
    password: f.password,
    passwordConfirm: f.password2,
    consent: [...(f.consent || [])],
  };
}

/** ชื่อช่องที่เซิร์ฟเวอร์ส่งกลับมาใน error.field -> ชื่อช่องในฟอร์ม และขั้นที่ช่องนั้นอยู่ */
export const SERVER_FIELD = {
  email: { key: 'email', step: 3 },
  password: { key: 'password', step: 3 },
  password2: { key: 'password2', step: 3 },
  taxId: { key: 'taxId', step: 2 },
};
