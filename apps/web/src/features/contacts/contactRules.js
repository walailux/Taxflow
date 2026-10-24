/**
 * contactRules.js ฟอร์มสมุดคู่ค้า (ย้ายจาก CT_RULES / CT_FIELDS ใน agency.js ของหน้าเดิม)
 * กติกาตรวจข้อมูลมาจาก PARTY_FIELDS ของ docschema ชุดเดียวกับเซิร์ฟเวอร์
 */
import { docschema as DS } from '../../lib/shared.js';

export const KIND_OPTIONS = DS.CONTACT_KINDS;
export const KIND_LABEL = Object.fromEntries(DS.CONTACT_KINDS.map((k) => [k.value, k.label]));

export const CONTACT_KEYS = ['name', 'taxId', 'branch', 'email', 'phone', 'address', 'bankAccountNo', 'bankAccountName', 'socials', 'note'];

const FORM_KEYS = ['kind', 'entityType', 'name', 'channelName', 'tradeName', 'taxId', 'branch', 'address', 'contactPerson', 'phone', 'email',
  'authName', 'authPosition', 'bankName', 'bankAccountNo', 'bankAccountName', 'socials', 'note'];

export const EMPTY_CONTACT = { id: null, ...Object.fromEntries(FORM_KEYS.map((k) => [k, ''])), kind: 'brand', entityType: 'juristic' };

export const isJuristicContact = (f) => f.entityType === 'juristic';

/** ช่องที่แสดงตามประเภท: นิติบุคคลมีผู้มีอำนาจลงนาม · Influencer มีชื่อช่องและโซเชียล · อื่น ๆ มีชื่อทางการค้า */
export function visibleFields(f) {
  const inf = f.kind === 'influencer';
  return { authName: isJuristicContact(f), channelName: inf, socials: inf, tradeName: !inf };
}

export function contactToForm(c) {
  const out = { ...EMPTY_CONTACT, id: c.id };
  FORM_KEYS.forEach((k) => { out[k] = c[k] || ''; });
  out.kind = DS.normKind(c.kind);
  out.bankAccountNo = c.bankAccountNo || c.bank || '';
  out.entityType = c.entityType || (/^0/.test(c.taxId || '') ? 'juristic' : 'individual');
  return out;
}

function ruleOf(key, f) {
  const P = DS.PARTY_FIELDS;
  switch (key) {
    case 'name': return { ...P.name, label: isJuristicContact(f) ? 'ชื่อนิติบุคคล' : 'ชื่อ-นามสกุล', need: true };
    case 'taxId': return P.taxId;
    case 'branch': return P.branch;
    case 'email': return P.email;
    case 'phone': return P.phone;
    case 'address': return { ...P.address, minLen: 0 };
    case 'bankAccountNo': return P.bankAccountNo;
    case 'bankAccountName': return { label: 'ชื่อบัญชี', type: 'text', maxLen: 150, need: !!String(f.bankAccountNo || '').trim() };
    case 'socials': return { label: 'ช่องทาง Social Media', type: 'textarea', maxLen: 500 };
    case 'note': return { label: 'หมายเหตุ', type: 'text', maxLen: 500 };
    default: return null;
  }
}

export function checkContactField(key, f) {
  const def = ruleOf(key, f);
  if (!def) return null;
  return DS.checkField(def, String(f[key] ?? '').trim(), { need: !!def.need }) || null;
}

export function contactErrors(f) {
  const out = {};
  CONTACT_KEYS.forEach((k) => { const m = checkContactField(k, f); if (m) out[k] = m; });
  return out;
}

export function formToBody(f) {
  const show = visibleFields(f);
  const body = {};
  FORM_KEYS.forEach((k) => { body[k] = typeof f[k] === 'string' ? f[k].trim() : f[k]; });
  if (!show.authName) { body.authName = ''; body.authPosition = ''; }
  if (!show.channelName) body.channelName = '';
  if (!show.socials) body.socials = '';
  return body;
}
