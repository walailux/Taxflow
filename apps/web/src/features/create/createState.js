/**
 * createState.js ตรรกะของแบบฟอร์มสร้าง/แก้ไขเอกสาร (ย้ายจาก create.js ของหน้าเดิม)
 * นิยามฟอร์ม สูตรคำนวณ และกติกาตรวจข้อมูลมาจาก packages/shared/docschema.js ชุดเดียวกับเซิร์ฟเวอร์
 * ไฟล์นี้เป็นแค่ตัวเชื่อม: ค่าตั้งต้น อ่านค่าจากฟอร์ม ตรวจเพิ่มเฉพาะประเภท ดึงข้อมูลจากเอกสารเดิม และแบบร่าง
 */
import { docschema as DS } from '../../lib/shared.js';

export const GROUPS = [['biz', 'เอกสารธุรกิจ'], ['contract', 'เอกสารสัญญา'], ['tax', 'เอกสารภาษี']];

export const PURPOSES = [
  { id: 'send', title: 'ยื่นต่อลูกค้า / คู่ค้า', detail: 'สร้างแล้วส่งให้อีกฝ่ายตรวจสอบหรือลงนามผ่านระบบ มีสถานะรอการอนุมัติ' },
  { id: 'self', title: 'ใช้ภายในองค์กร', detail: 'เอกสารสำหรับใช้งานภายใน บันทึกเสร็จสิ้นได้ทันทีโดยไม่ต้องรอการอนุมัติจากคู่ค้า' },
  { id: 'record', title: 'บันทึกข้อตกลงย้อนหลัง', detail: 'บันทึกงานที่เคยตกลงหรือจบไปแล้ว เพื่อเก็บประวัติและรวมยอด' },
];
/**
 * ประเภทเอกสารที่เหมาะกับแต่ละจุดประสงค์ (ขั้นที่ 2 แสดงเฉพาะที่อยู่ในรายการ แล้วกรองตามบทบาทอีกชั้น)
 * - send: เราเป็นผู้ออก แล้วส่งให้อีกฝ่ายตรวจ ลงนาม หรือรับไว้ผ่านระบบ (ต้องมีคู่ค้าในเอกสาร)
 *   ไม่รวมหนังสือมอบอำนาจ (ไม่มีช่องคู่ค้าในระบบ ส่งผ่านระบบไม่ได้) และเอกสารภายใน/ข้อมูล ภ.ง.ด.
 * - self: ใช้ภายในองค์กร ไม่ต้องรอคู่ค้าอนุมัติ: ใบสำคัญจ่าย ข้อมูล ภ.ง.ด.3/53 หนังสือมอบอำนาจ
 * - record: งานที่ตกลงหรือจบไปแล้ว เก็บประวัติและรวมยอด
 *   ไม่รวมใบเสนอราคา (เป็นแค่ข้อเสนอ ยังไม่ใช่ข้อตกลง และจะนับยอดซ้ำกับใบแจ้งหนี้)
 *   ไม่รวมใบกำกับภาษี/ใบรับอิเล็กทรอนิกส์ (ต้องออกตามวันที่เกิดรายการจริง ออกย้อนหลังไม่ได้)
 *   ไม่รวมข้อมูล ภ.ง.ด. (เป็นการเตรียมยื่นภาษี ไม่ใช่ข้อตกลง) และหนังสือมอบอำนาจ
 * ประเภทใหม่ที่ยังไม่ได้จัดเข้ากลุ่มใดเลย จะแสดงในทุกจุดประสงค์ ไม่หายไปเงียบ ๆ
 */
export const PURPOSE_TYPES = {
  send: ['QUOTATION', 'PO', 'INVOICE', 'RECEIPT', 'DELIVERY', 'CONTRACT_BRAND', 'CONTRACT_INF', 'EWHT', 'ETAX_INVOICE', 'ETAX_RECEIPT'],
  self: ['PAYMENT', 'PND3', 'PND53', 'POA'],
  record: ['PO', 'INVOICE', 'RECEIPT', 'DELIVERY', 'PAYMENT', 'CONTRACT_BRAND', 'CONTRACT_INF', 'EWHT'],
};
const MAPPED = new Set(Object.values(PURPOSE_TYPES).flat());
export const typesForPurpose = (types, purpose) => (purpose && PURPOSE_TYPES[purpose]
  ? types.filter((t) => PURPOSE_TYPES[purpose].includes(t) || !MAPPED.has(t))
  : types);
export const PURPOSE_LABEL = { send: 'ยื่นต่อคู่ค้า', self: 'ใช้ภายในองค์กร', record: 'บันทึกย้อนหลัง' };

/** คอลัมน์รายการที่มีค่าตั้งต้นเสมอ ไม่นับว่า "กรอกแล้ว" */
const DEFAULT_COLS = ['qty', 'unit', 'pieces', 'condition', 'platform', 'itemStatus'];

export const formOf = (t) => DS.FORMS[t] || null;
export const allFields = (t) => DS.allFields(t);
export const itemColDef = (c) => DS.ITEM_COLS[c];
export const visible = (def, fields) => !def.showIf || DS.matchCond(def.showIf, fields);

/** label/desc ของ schema เป็นข้อความเดียว หรือแยกตามบทบาท { creator: '...', agency: '...' } */
export function textOf(v, role) {
  if (v == null) return '';
  if (typeof v === 'object') return v[role] || Object.values(v)[0] || '';
  return String(v);
}

/** วันที่ตามเวลาไทย (YYYY-MM-DD) เลื่อนได้เป็นวัน */
export function today(offsetDays = 0) {
  return new Date(Date.now() + 7 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);
}

function meValue(user, path) {
  const juristic = user.entityType === 'juristic' || user.role === 'corporate';
  const map = {
    signer: (juristic ? user.authName : user.displayName) || user.displayName || '',
    authPosition: juristic ? (user.authPosition || '') : '',
    province: (user.addr && user.addr.province) || '',
    branchNo: juristic && user.branchType === 'branch' ? String(user.branchCode || '').padStart(5, '0') : '00000',
  };
  if (path in map) return map[path];
  return path.split('.').reduce((o, k) => (o == null ? '' : o[k]), user) ?? '';
}

export function defaultOf(def, user) {
  const v = def.def;
  if (v === undefined) return def.type === 'checks' ? [] : def.type === 'checkbox' ? false : '';
  if (v === 'today') return today();
  if (typeof v === 'string' && /^\+\d+$/.test(v)) return today(Number(v.slice(1)));
  const lastMonth = () => { const d = new Date(Date.now() + 7 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d; };
  if (v === 'lastMonth') return String(lastMonth().getUTCMonth() + 1);
  if (v === 'thisYearBE') return lastMonth().getUTCFullYear() + 543;
  if (typeof v === 'string' && v.startsWith('me.')) return meValue(user, v.slice(3));
  if (typeof v === 'string' && v.startsWith('party.')) return '';
  return Array.isArray(v) ? [...v] : v;
}

export function initialFields(type, user) {
  const f = formOf(type);
  const out = {};
  allFields(type).forEach((def) => { out[def.key] = defaultOf(def, user); });
  if (f.items && f.items.billDiscount) { out.billDiscount = ''; out.billDiscountNote = ''; }
  if (f.items && f.items.vat) out.includeVat = f.items.vat === 'issuer' && !!user.vatRegistered;
  if (allFields(type).some((d) => d.vatGate)) out.includeVat = !!user.vatRegistered; // สัญญาที่เราเป็นผู้รับจ้าง: จด VAT = คิด VAT เสมอ
  return out;
}

export function initialParty(type) {
  const f = formOf(type);
  if (!f.party) return {};
  return Object.fromEntries(f.party.keys.map((k) => [k, DS.PARTY_FIELDS[k].def ?? '']));
}

export function emptyItem(type) {
  const f = formOf(type);
  return Object.fromEntries(f.items.cols.map((c) => [c, DS.ITEM_COLS[c].def ?? '']));
}

export function partyFieldDef(type, k) {
  const p = formOf(type).party;
  const base = DS.PARTY_FIELDS[k];
  return { key: k, ...base, label: (p.labels && p.labels[k]) || base.label, required: p.required.includes(k) };
}

const isNum = (t) => t === 'number' || t === 'money';
const numOrBlank = (v) => (v === '' || v == null ? '' : Number(v));

/** แถวรายการที่มีข้อมูลจริง (ไม่นับคอลัมน์ที่มีค่าตั้งต้น) พร้อมแปลงตัวเลข */
export function filledItems(items) {
  return (items || []).map((row) => {
    const out = { ...row };
    Object.keys(row).forEach((c) => { const d = DS.ITEM_COLS[c]; if (d && isNum(d.type)) out[c] = numOrBlank(row[c]); });
    return out;
  }).filter((row) => Object.keys(row).some((c) => DS.ITEM_COLS[c] && row[c] !== '' && row[c] != null && !DEFAULT_COLS.includes(c)));
}

/** รวมค่าจากฟอร์มเป็น body ของ API (ตัวเลขเป็น Number ข้อความตัดช่องว่าง) */
export function collect(type, fields, party, items) {
  const f = formOf(type);
  const outFields = {};
  allFields(type).forEach((def) => {
    const v = fields[def.key];
    if (v === undefined) return;
    outFields[def.key] = isNum(def.type) ? numOrBlank(v) : typeof v === 'string' ? v.trim() : v;
  });
  if ('billDiscount' in fields) outFields.billDiscount = numOrBlank(fields.billDiscount);
  if ('billDiscountNote' in fields) outFields.billDiscountNote = String(fields.billDiscountNote || '').trim();
  if ('includeVat' in fields) outFields.includeVat = !!fields.includeVat;
  const outParty = {};
  if (f.party) f.party.keys.forEach((k) => { const v = party[k]; outParty[k] = typeof v === 'string' ? v.trim() : (v ?? ''); });
  return { fields: outFields, party: outParty, items: f.items ? filledItems(items) : [] };
}

export const computeTotals = (type, data, user) => DS.compute(type, data, { vatRegistered: !!user.vatRegistered });

const labelOf = (type) => (k) => (allFields(type).find((x) => x.key === k) || {}).label || k;

/** ตรวจช่องเดียวตอนออกจากช่อง */
export function checkOne(type, def, value, fields, scope, need) {
  const required = scope === 'p' ? !!need : !!(def.required || (def.requiredIf && DS.matchCond(def.requiredIf, fields)));
  const v = isNum(def.type) ? numOrBlank(value) : typeof value === 'string' ? value.trim() : value;
  return DS.checkField(def, v, { fields, need: required, labelOf: labelOf(type), today: today() }) || null;
}

/** ตรวจทั้งฉบับก่อนไปขั้นตรวจทาน (กติกาเดียวกับเซิร์ฟเวอร์ + กติกาเฉพาะประเภทแบบหน้าเดิม) */
export function validateAll(type, data, user) {
  const f = formOf(type);
  const r = DS.validateDoc(type, data, { today: today() });
  const out = { fieldErrors: { ...r.fieldErrors }, partyErrors: { ...r.partyErrors }, itemErrors: [...r.itemErrors], errors: [...r.errors] };
  const c = computeTotals(type, data, user);
  const baht = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (f.mode === 'contract' && data.items.length && !(Math.abs(c.installmentSum - c.total) < 0.01 || Math.abs(c.installmentSum - c.base) < 0.01)) {
    out.errors.push(`ยอดรวมงวดการชำระ (฿${baht(c.installmentSum)}) ต้องเท่ากับมูลค่างาน (฿${baht(c.base)}) หรือยอดรวม VAT (฿${baht(c.total)})`);
  }
  if (type === 'PAYMENT' && data.fields.hasWht) {
    if (!data.party.taxId) { out.errors.push('มีการหักภาษี ณ ที่จ่าย ต้องกรอกเลขประจำตัวผู้เสียภาษีของผู้รับเงิน'); out.partyErrors.taxId = 'จำเป็นเมื่อมีการหักภาษี ณ ที่จ่าย'; }
    if (!data.party.address) { out.errors.push('มีการหักภาษี ณ ที่จ่าย ต้องกรอกที่อยู่ของผู้รับเงิน'); out.partyErrors.address = 'จำเป็นเมื่อมีการหักภาษี ณ ที่จ่าย'; }
  }
  if (type === 'POA' && !(data.fields.powers || []).length && !data.fields.scopeDetail) {
    out.errors.push('เลือกเรื่องที่มอบอำนาจอย่างน้อย 1 ข้อ หรือกรอกรายละเอียดขอบเขตอำนาจ');
    out.fieldErrors.powers = 'เลือกอย่างน้อย 1 ข้อ หรือกรอกรายละเอียดด้านล่าง';
  }
  if (['priced', 'amount', 'voucher'].includes(f.mode) && data.items.length && !(c.total > 0)) out.errors.push('ยอดรวมของเอกสารต้องมากกว่า 0');
  return out;
}

/** ข้อมูลคู่ค้าจากสมุดคู่ค้า -> ช่องคู่ค้าของฟอร์ม */
export function contactToParty(type, c) {
  const all = {
    entityType: c.entityType || (/^0/.test(c.taxId || '') ? 'juristic' : 'individual'),
    name: c.name, channelName: c.channelName || '', taxId: c.taxId || '', branch: c.branch || '',
    address: c.address || '', contactPerson: c.contactPerson || '', phone: c.phone || '', email: c.email || '',
    authName: c.authName || '', authPosition: c.authPosition || '',
    bankName: c.bankName || '', bankAccountNo: c.bankAccountNo || c.bank || '', bankAccountName: c.bankAccountName || '', socials: c.socials || '',
  };
  const keys = (formOf(type).party || {}).keys || Object.keys(all);
  return Object.fromEntries(keys.map((k) => [k, all[k] ?? '']));
}

/** ช่องที่ schema ให้ดึงค่าจากคู่ค้า (def: 'party.xxx') */
export function partyDefaults(type, party) {
  const out = {};
  allFields(type).filter((d) => typeof d.def === 'string' && d.def.startsWith('party.')).forEach((d) => {
    const v = party[d.def.slice(6)];
    if (v) out[d.key] = v;
  });
  return out;
}

/** เอกสารประเภทเดียวกันฉบับล่าสุด (ของคู่ค้ารายนี้ ถ้าระบุ) */
export function lastDocOf(docs, type, party) {
  const same = docs.filter((x) => x.type === type && x.schemaVersion === 2 && x.status !== 'cancelled');
  if (party && (party.taxId || party.name)) {
    return same.find((x) => x.partyInfo && ((party.taxId && x.partyInfo.taxId === party.taxId) || (!party.taxId && x.partyInfo.name === party.name))) || null;
  }
  return same[0] || null;
}

/** ดึงข้อมูลที่เคยกรอกจากเอกสารเดิม ไม่คัดลอกวันที่ เลขอ้างอิง และช่องที่ผูกกับเอกสารต้นทาง */
export function prefillFrom(type, src) {
  const f = formOf(type);
  const fields = {};
  allFields(type).forEach((d) => {
    if (d.type === 'date' || d.type === 'docref' || ['refNo', 'poRef', 'bookNo', 'seqInForm', 'transferRef', 'chequeNo', 'amount'].includes(d.key)) return;
    if (src.fields && src.fields[d.key] !== undefined && src.fields[d.key] !== '') fields[d.key] = src.fields[d.key];
  });
  if (src.fields && src.fields.billDiscount !== undefined) fields.billDiscount = src.fields.billDiscount;
  if (src.fields && src.fields.billDiscountNote !== undefined) fields.billDiscountNote = src.fields.billDiscountNote;
  if (src.fields && src.fields.includeVat !== undefined) fields.includeVat = src.fields.includeVat;
  const items = f.items && !f.items.pnd
    ? (src.items || []).map((it) => { const o = { ...it }; ['dueDate', 'docDate', 'publishDate', 'link', 'docNo'].forEach((k) => { if (k in o) o[k] = ''; }); return o; })
    : undefined;
  return { fields, items, party: src.partyInfo };
}

/**
 * เลือกเลขที่เอกสารอ้างอิงแล้วดึงข้อมูลต่อ (ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ, ใบสำคัญจ่าย → 50 ทวิ)
 * คืน { fields, party, items, message } หรือ { error } หรือ null ถ้าไม่มีอะไรให้ดึง
 */
export function copyFromRef(type, def, docNo, docs) {
  const src = docs.find((x) => def.from.includes(x.type) && x.docNo === docNo);
  if (!src || !def.copy || src.schemaVersion !== 2) return null;
  const P = src.partyInfo || {};
  const S = src.fields || {};
  const label = formOf(src.type) ? formOf(src.type).label : src.type;
  const message = `ดึงข้อมูลจาก ${label} ${src.docNo} แล้ว ตรวจทานก่อนสร้าง`;
  if (type === 'INVOICE' && src.type === 'QUOTATION') {
    return { party: P, fields: { billDiscount: S.billDiscount, billDiscountNote: S.billDiscountNote || '', includeVat: S.includeVat, ...(S.paymentTerms ? { note: `เงื่อนไขการชำระเงิน: ${S.paymentTerms}` } : {}) }, items: src.items, message };
  }
  if (type === 'RECEIPT' && src.type === 'INVOICE') {
    const items = (Number(src.billDiscount) > 0 || Number(src.lineDiscount) > 0)
      ? [{ name: `รับชำระตามใบแจ้งหนี้เลขที่ ${src.docNo}`, amount: src.base }]
      : (src.items || []).map((it) => ({ name: it.name, amount: Math.round(Number(it.qty) * Number(it.price) * 100) / 100 }));
    return { party: P, fields: { includeVat: Number(src.vat) > 0 }, items, message };
  }
  if (type === 'EWHT' && src.type === 'PAYMENT') {
    if (!S.hasWht) return { error: `ใบสำคัญจ่าย ${src.docNo} ไม่มีการหักภาษี ณ ที่จ่าย` };
    return {
      party: { entityType: P.entityType, name: P.name, taxId: P.taxId, address: P.address },
      fields: { payDate: S.payDate, incomeCode: S.incomeCode, incomeDesc: S.incomeDesc, amount: src.base, whtRate: String(S.whtRate), whtCondition: S.whtCondition || '1' },
      message,
    };
  }
  return null;
}

/** เลือกประเภทเงินได้ที่ใช้บ่อย -> แนะนำอัตราหักและรหัสเงินได้ */
export function presetFor(desc) {
  const p = DS.WHT_PRESETS.find((x) => x.desc === String(desc || '').trim());
  return p ? { whtRate: String(p.rate), incomeCode: p.code } : null;
}
export const WHT_PRESETS = DS.WHT_PRESETS;

/* ---------- แบบร่างอัตโนมัติ (เก็บในเครื่อง) ---------- */
const DRAFT_KEY = 'tf_create_draft_v18';

export function saveDraft(d) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, at: Date.now() })); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ }
}
export function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && d.type && formOf(d.type) ? d : null;
  } catch { return null; }
}
export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ไม่มีอะไรต้องทำ */ }
}
