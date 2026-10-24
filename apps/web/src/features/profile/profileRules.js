/**
 * profileRules.js ฟอร์มโปรไฟล์: แปลงผู้ใช้ ⇄ ฟอร์ม กติกาตรวจข้อมูล และ body ที่ส่งให้ PUT /api/auth/profile
 * (ย้ายจาก PF_RULES / savePfProfile ใน profile.js ของหน้าเดิม ใช้ checkField ของ docschema ชุดเดียวกับเซิร์ฟเวอร์)
 */
import { docschema } from '../../lib/shared.js';

const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');

/** นิติบุคคลหรือไม่: บริษัทเป็นนิติบุคคลเสมอ เอเจนซี่เลือกได้ */
export function isJuristic(user, entityType) {
  if (user.role === 'corporate') return true;
  if (user.role === 'agency') return (entityType || user.entityType) === 'juristic';
  return user.entityType === 'juristic';
}

export const EMPTY_PROFILE_FORM = {
  entityType: 'individual', name: '', tradeName: '', channelName: '', contactName: '', socials: '',
  companyType: '', taxId: '', branchType: 'head', branchCode: '', authName: '', authPosition: '',
  vat: 'no', vatRegDate: '',
  addrNo: '', addrStreet: '', addrSub: '', addrDist: '', addrProv: '', addrPost: '', phone: '',
  bankName: '', bankNo: '', bankAcc: '',
};

export function userToForm(u) {
  const jur = isJuristic(u, u.entityType);
  const a = u.addr || {};
  const b = u.bank || {};
  // วันที่จด VAT ที่เคยเก็บเป็นปี พ.ศ. แปลงกลับเป็น ค.ศ. ให้ช่องวันที่ของเบราว์เซอร์
  const vd = u.vatRegDate && Number(u.vatRegDate.slice(0, 4)) > 2400 ? `${Number(u.vatRegDate.slice(0, 4)) - 543}${u.vatRegDate.slice(4)}` : (u.vatRegDate || '');
  return {
    ...EMPTY_PROFILE_FORM,
    entityType: jur ? 'juristic' : 'individual',
    name: (jur ? u.companyName : u.displayName) || '',
    tradeName: u.tradeName || '', channelName: u.channelName || '', contactName: u.contactName || '', socials: u.socials || '',
    companyType: u.companyType || '', taxId: u.taxId || '', branchType: u.branchType || 'head', branchCode: u.branchCode || '',
    authName: u.authName || '', authPosition: u.authPosition || '',
    vat: u.vatRegistered ? 'yes' : 'no', vatRegDate: vd,
    addrNo: a.no || '', addrStreet: a.street || '', addrSub: a.subdistrict || '', addrDist: a.district || '', addrProv: a.province || '', addrPost: a.postcode || '',
    phone: u.phone || '',
    bankName: b.bankName || '', bankNo: b.accountNo || '', bankAcc: b.accountName || '',
  };
}

function rule(key, f, user) {
  const jur = isJuristic(user, f.entityType);
  const R = {
    name: { label: jur ? 'ชื่อนิติบุคคล' : 'ชื่อ-นามสกุล', type: 'text', minLen: 2, maxLen: 150, need: true },
    tradeName: { label: 'ชื่อทางการค้า', type: 'text', maxLen: 150 },
    channelName: { label: 'ชื่อช่อง', type: 'text', maxLen: 150 },
    contactName: { label: 'ชื่อผู้ติดต่อ', type: 'text', maxLen: 150 },
    socials: { label: 'ช่องทาง Social Media', type: 'textarea', maxLen: 500 },
    taxId: { label: 'เลขประจำตัวผู้เสียภาษี', type: 'taxid', need: true },
    branchCode: jur && f.branchType === 'branch' ? { label: 'เลขที่สาขา', type: 'text', fmt: 'digits5', need: true } : null,
    authName: jur ? { label: 'กรรมการผู้มีอำนาจลงนาม', type: 'text', minLen: 4, maxLen: 150, need: true } : null,
    vatRegDate: f.vat === 'yes' ? { label: 'วันที่จดทะเบียน VAT', type: 'date', notFuture: true, need: true } : null,
    addrNo: { label: 'บ้านเลขที่', type: 'text', maxLen: 60, need: true },
    addrSub: { label: 'แขวง/ตำบล', type: 'text', maxLen: 80, need: true },
    addrDist: { label: 'เขต/อำเภอ', type: 'text', maxLen: 80, need: true },
    addrProv: { label: 'จังหวัด', type: 'text', need: true },
    addrPost: { label: 'รหัสไปรษณีย์', type: 'text', fmt: 'postcode', need: true },
    phone: { label: 'เบอร์ติดต่อ', type: 'text', fmt: 'phone' },
    bankNo: { label: 'เลขที่บัญชี', type: 'text', fmt: 'bankacc' },
    bankAcc: { label: 'ชื่อบัญชี', type: 'text', maxLen: 150, need: !!String(f.bankNo || '').trim() },
  };
  return R[key] || null;
}

const RULE_KEYS = ['name', 'tradeName', 'channelName', 'contactName', 'socials', 'taxId', 'branchCode', 'authName', 'vatRegDate',
  'addrNo', 'addrSub', 'addrDist', 'addrProv', 'addrPost', 'phone', 'bankNo', 'bankAcc'];

export function checkProfileField(key, f, user) {
  const def = rule(key, f, user);
  if (!def) return null;
  const v = ['taxId', 'addrPost', 'branchCode'].includes(key) ? digits(f[key]) : String(f[key] ?? '').trim();
  return docschema.checkField(def, v, { need: !!def.need }) || null;
}

export function profileErrors(f, user) {
  const out = {};
  RULE_KEYS.forEach((k) => { const m = checkProfileField(k, f, user); if (m) out[k] = m; });
  return out;
}

export function buildProfileBody(f, user) {
  const jur = isJuristic(user, f.entityType);
  const t = (v) => String(v == null ? '' : v).trim();
  return {
    entityType: jur ? 'juristic' : 'individual',
    displayName: t(f.name),
    tradeName: t(f.tradeName),
    channelName: t(f.channelName),
    contactName: t(f.contactName),
    socials: t(f.socials),
    companyName: jur ? t(f.name) : '',
    companyType: jur ? f.companyType : '',
    authName: jur ? t(f.authName) : '',
    authPosition: jur ? t(f.authPosition) : '',
    taxId: digits(f.taxId),
    branchType: jur ? f.branchType : 'head',
    branchCode: jur ? digits(f.branchCode) : '',
    vatRegistered: f.vat === 'yes',
    vatRegDate: f.vat === 'yes' ? t(f.vatRegDate) : '',
    addr: { no: t(f.addrNo), street: t(f.addrStreet), subdistrict: t(f.addrSub), district: t(f.addrDist), province: t(f.addrProv), postcode: digits(f.addrPost) },
    phone: t(f.phone),
    bank: { bankName: f.bankName || '', accountNo: t(f.bankNo), accountName: t(f.bankAcc) },
  };
}

/** เปลี่ยนบัญชีรับเงินต้องยืนยัน OTP ก่อนเสมอ (ช่องทางหลักของการโกงเปลี่ยนบัญชีรับเงิน) */
export function bankChanged(body, user) {
  const cur = user.bank || {};
  const norm = (b) => [b.bankName || '', b.accountNo || '', b.accountName || ''].join('|');
  return norm(body.bank) !== norm(cur);
}
