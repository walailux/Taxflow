'use strict';
/**
 * scripts/seed-test-accounts.js สร้างบัญชีสำหรับทดสอบ/สาธิต พร้อมสิทธิ์ครบและเอกสารตัวอย่าง
 * ==========================================================
 * 1) บัญชีทดสอบ 3 บทบาท (โดเมน @taxflow.test) เข้าสู่ระบบด้วยรหัสผ่านอย่างเดียว ไม่ต้องกรอก OTP (otpExempt)
 *    ผ่าน KYC · จด VAT · ได้สิทธิ์ e-Tax · มีเอกสารตัวอย่างไม่กี่ฉบับ
 *    การข้าม OTP ใช้ได้เฉพาะอีเมลโดเมนทดสอบ (ดู isOtpExempt ใน routes/auth.js) บัญชีอีเมลจริงตั้งธงนี้ก็ไม่มีผล
 * 2) บัญชีบริษัท (แบรนด์) ของเจ้าของระบบ ตาม OWNER_EMAIL ผ่าน KYC · จด VAT · ได้สิทธิ์ e-Tax · มีเอกสารครบทุกประเภท
 *    ไม่ตั้งรหัสผ่าน (เข้าสู่ระบบด้วย Google แล้วยืนยัน OTP ทางอีเมลตามปกติ) เว้นแต่ตั้ง OWNER_PASSWORD
 *
 * รหัสผ่านบัญชีทดสอบ: ตั้งเองด้วย TEST_ACCOUNT_PASSWORD หรือให้สคริปต์สุ่ม แล้วบันทึกไว้ที่ data/test-accounts.local.txt
 * (ไฟล์นี้ไม่ขึ้น git) · รันซ้ำได้: บัญชีที่มีอยู่แล้วจะอัปเดตสิทธิ์ ไม่สร้างซ้ำ และไม่เติมเอกสารซ้ำ
 *
 *   node scripts/seed-test-accounts.js
 *   OWNER_EMAIL=you@example.com node scripts/seed-test-accounts.js
 *   node scripts/seed-test-accounts.js --bulk 55   เติมเอกสารบัญชีทดสอบ 3 บัญชีให้ครบราว 55 ฉบับต่อบัญชี (ไม่แตะบัญชีอื่น)
 *     วันที่กระจายตั้งแต่ ม.ค. ถึงเดือนปัจจุบัน (เลขที่เรียงตามวันที่) ยอดเงินและคู่ค้าหลากหลาย สถานะส่วนใหญ่อนุมัติ
 *     มีรอตรวจสอบ แบบร่าง และยกเลิกปนบ้าง ให้แดชบอร์ดรายเดือน/รายปีและหน้าวิเคราะห์มีข้อมูลจริงให้ดู
 */
require('./_env');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('../core/store');
const auth = require('../lib/auth');
const profile = require('../lib/profile');
const pdpa = require('../lib/pdpa');
const DS = require('../lib/docschema.js');
const { docbuild } = require('../core/context');
const { createDoc, ensureIssued, buildCtx } = require('../core/docs');
const SAMPLE = require('./pdf-all');

const MARK = 'test-accounts-v1';
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'piwpiexq01747@gmail.com').trim().toLowerCase();
const PASSWORD_FILE = path.join(__dirname, '..', 'data', 'test-accounts.local.txt');

/** เลขผู้เสียภาษี 13 หลักที่ check digit ถูกต้อง จาก 12 หลักแรก */
function taxIdOf(first12) {
  const d = String(first12).split('').map(Number);
  const sum = d.reduce((s, n, i) => s + n * (13 - i), 0);
  return `${first12}${(11 - (sum % 11)) % 10}`;
}

const ADDR = {
  creator: { no: '88/8', street: 'ลาดพร้าว', subdistrict: 'จอมพล', district: 'จตุจักร', province: 'กรุงเทพมหานคร', postcode: '10900' },
  brand: { no: '200', street: 'พระรามที่ 9', subdistrict: 'ห้วยขวาง', district: 'ห้วยขวาง', province: 'กรุงเทพมหานคร', postcode: '10310' },
  agency: { no: '77', street: 'สีลม', subdistrict: 'สุริยวงศ์', district: 'บางรัก', province: 'กรุงเทพมหานคร', postcode: '10500' },
  owner: { no: '9', street: 'วิภาวดีรังสิต', subdistrict: 'จตุจักร', district: 'จตุจักร', province: 'กรุงเทพมหานคร', postcode: '10900' },
};

const ACCOUNTS = [
  {
    key: 'creator', role: 'creator', email: 'test-creator@taxflow.test', otpExempt: true,
    displayName: 'ทดสอบ ครีเอเตอร์', entityType: 'individual', taxId: taxIdOf('110070999001'),
    channelName: 'ช่องทดสอบ', socials: 'TikTok @taxflow.test', contactName: 'ทดสอบ ครีเอเตอร์', phone: '081-000-0001',
    bank: { bankName: 'ธนาคารไทยพาณิชย์', accountNo: '111-1-11111-1', accountName: 'ทดสอบ ครีเอเตอร์' },
    docs: ['QUOTATION', 'INVOICE', 'RECEIPT', 'DELIVERY', 'ETAX_INVOICE'],
  },
  {
    key: 'brand', role: 'corporate', email: 'test-brand@taxflow.test', otpExempt: true,
    displayName: 'บริษัท ทดสอบแบรนด์ จำกัด', companyName: 'บริษัท ทดสอบแบรนด์ จำกัด', companyType: 'บริษัทจำกัด',
    entityType: 'juristic', taxId: taxIdOf('010556999002'), branchType: 'head', authName: 'ทดสอบ ผู้จัดการ', authPosition: 'กรรมการผู้จัดการ',
    contactName: 'ฝ่ายการตลาด', phone: '02-000-0002',
    bank: { bankName: 'ธนาคารกสิกรไทย', accountNo: '222-2-22222-2', accountName: 'บริษัท ทดสอบแบรนด์ จำกัด' },
    docs: ['PO', 'PAYMENT', 'CONTRACT_INF', 'EWHT', 'ETAX_RECEIPT'],
  },
  {
    key: 'agency', role: 'agency', email: 'test-agency@taxflow.test', otpExempt: true,
    displayName: 'บริษัท ทดสอบเอเจนซี่ จำกัด', companyName: 'บริษัท ทดสอบเอเจนซี่ จำกัด', companyType: 'บริษัทจำกัด',
    entityType: 'juristic', taxId: taxIdOf('010556999003'), branchType: 'head', authName: 'ทดสอบ กรรมการ', authPosition: 'กรรมการผู้มีอำนาจ',
    contactName: 'ฝ่ายบัญชี', phone: '02-000-0003', tradeName: 'Test Agency',
    bank: { bankName: 'ธนาคารกรุงไทย', accountNo: '333-3-33333-3', accountName: 'บริษัท ทดสอบเอเจนซี่ จำกัด' },
    docs: ['QUOTATION', 'INVOICE', 'CONTRACT_BRAND', 'ETAX_INVOICE', 'PND53'],
  },
  {
    key: 'owner', role: 'corporate', email: OWNER_EMAIL, otpExempt: false,
    displayName: 'บริษัท ตัวอย่างแบรนด์ จำกัด', companyName: 'บริษัท ตัวอย่างแบรนด์ จำกัด', companyType: 'บริษัทจำกัด',
    entityType: 'juristic', taxId: taxIdOf('010556999004'), branchType: 'head', authName: 'ผู้มีอำนาจ ลงนาม', authPosition: 'กรรมการผู้จัดการ',
    contactName: 'ฝ่ายบัญชี', phone: '02-000-0004',
    bank: { bankName: 'ธนาคารกรุงเทพ', accountNo: '444-4-44444-4', accountName: 'บริษัท ตัวอย่างแบรนด์ จำกัด' },
    docs: 'all', // ทุกประเภทที่บทบาทแบรนด์ออกได้
  },
];

function testPassword() {
  if (process.env.TEST_ACCOUNT_PASSWORD) return process.env.TEST_ACCOUNT_PASSWORD;
  try {
    const saved = fs.readFileSync(PASSWORD_FILE, 'utf8').match(/^password:\s*(\S+)/m);
    if (saved) return saved[1];
  } catch { /* ยังไม่มีไฟล์ */ }
  // อ่านง่าย พิมพ์ง่าย: ตัวอักษร+ตัวเลข 12 ตัว (ผ่านกฎรหัสผ่านอย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข)
  return `Test${crypto.randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x')}9`;
}

/** สร้างหรืออัปเดตบัญชีให้มีสิทธิ์ครบ: ยืนยันอีเมล · ผ่าน KYC · จด VAT · ได้สิทธิ์ e-Tax · ยินยอมทุกข้อ */
async function upsertAccount(a, password) {
  const now = new Date().toISOString();
  const { key, docs, ...fields } = a;
  const grant = {
    emailVerified: true,
    verifyStatus: 'verified', verifyNote: '', verifiedAt: now, verifiedBy: 'สคริปต์ตั้งค่าบัญชีทดสอบ',
    vatRegistered: true, vatRegDate: '2020-01-01',
    etaxStatus: 'approved', etaxNote: '',
    etax: {
      method: 'own_cert', approvalRef: `ตัวอย่าง-${a.taxId}`, approvalDate: '2024-01-15',
      submittedAt: now, reviewedAt: now, reviewedBy: 'สคริปต์ตั้งค่าบัญชีทดสอบ', checks: { vat: true, approval: true, provider: false },
    },
    otpExempt: !!a.otpExempt,
    consent: pdpa.makeConsentRecord(pdpa.PURPOSES.map((x) => x.key)),
  };
  let user = await store.whereOne('users', { email: a.email });
  if (user) {
    if (user.role !== a.role) throw new Error(`${a.email} มีอยู่แล้วในบทบาท ${user.role} ไม่ใช่ ${a.role} จึงไม่แก้ไข`);
    user = await store.update('users', user.id, { ...grant, ...(password ? { passwordHash: auth.hashPassword(password) } : {}) });
    return { user, created: false };
  }
  const clash = await store.findOne('users', (u) => u.taxId === a.taxId);
  if (clash) throw new Error(`เลขผู้เสียภาษี ${a.taxId} ถูกใช้โดย ${clash.email} แล้ว`);
  const addr = profile.normalizeAddress(ADDR[key]);
  user = await store.insert('users', {
    ...profile.defaults(a.role), ...fields, addr, address: profile.formatAddress(addr), ...grant,
    passwordHash: password ? auth.hashPassword(password) : null,
  });
  await store.insert('consents', { userId: user.id, version: pdpa.CONSENT_VERSION, purposes: pdpa.PURPOSES.map((x) => x.key), action: 'seed', at: now });
  return { user, created: true };
}

/**
 * คู่ค้าตัวอย่างที่ผ่านการตรวจของระบบ (เลขผู้เสียภาษีหลักตรวจสอบถูกต้อง สาขาตามรูปแบบที่กำหนด)
 * ข้อมูลใน scripts/pdf-all.js ใช้ทำ PDF อย่างเดียว เลขผู้เสียภาษีจึงไม่ผ่านการตรวจตอนสร้างเอกสารจริง
 */
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

async function seedDocs(user, wanted) {
  if (await store.findOne('documents', (d) => d.userId === user.id && d.demoSeed === MARK)) return { skipped: true, made: [], failed: [] };
  const allowed = DS.rolesFor(user.role);
  const types = wanted === 'all' ? allowed : wanted.filter((t) => allowed.includes(t));
  const made = []; const failed = [];
  for (const type of types) {
    const body = bodyFor(type);
    const built = await docbuild.build(user, type, body, buildCtx(user));
    if (built.errors && built.errors.length) { failed.push(`${type}: ${built.errors.slice(0, 2).join(' · ')}`); continue; }
    let doc = await createDoc(user, type, { docPurpose: 'self', issuerRole: user.role, ...built.record, demoSeed: MARK });
    await ensureIssued(doc, user.displayName);
    doc = await store.update('documents', doc.id, { status: 'approved' });
    made.push(`${doc.docNo || '-'} ${type}`);
  }
  return { made, failed };
}

/* ---------- เติมเอกสารจำนวนมาก (--bulk N) ---------- */
const BULK_MARK = 'test-accounts-bulk-v1';
// ประเภทที่เติมต่อบัญชี (กรองตามสิทธิ์ของบทบาทอีกชั้น) วนตามลำดับนี้
const BULK_TYPES = {
  creator: ['QUOTATION', 'INVOICE', 'RECEIPT', 'ETAX_INVOICE', 'ETAX_RECEIPT', 'DELIVERY'],
  brand: ['PO', 'PAYMENT', 'CONTRACT_INF', 'EWHT', 'ETAX_RECEIPT', 'QUOTATION', 'INVOICE', 'RECEIPT'],
  agency: ['QUOTATION', 'INVOICE', 'CONTRACT_BRAND', 'ETAX_INVOICE', 'RECEIPT', 'PAYMENT', 'EWHT', 'PND53'],
};
const PARTNERS = [
  PARTNER,
  { ...PARTNER, name: 'บริษัท สื่อสร้างสรรค์ จำกัด', taxId: taxIdOf('010555900021'), email: 'partner2@taxflow.test', bankAccountName: 'บริษัท สื่อสร้างสรรค์ จำกัด' },
  { ...PARTNER, name: 'บริษัท ไลฟ์สไตล์ มีเดีย จำกัด', taxId: taxIdOf('010555900033'), email: 'partner3@taxflow.test', bankAccountName: 'บริษัท ไลฟ์สไตล์ มีเดีย จำกัด' },
];
const SCALES = [0.6, 0.8, 1, 1.2, 1.5, 2];
const BASE_DATE = '2026-09-20'; // วันที่ในข้อมูลตัวอย่าง (scripts/pdf-all.js) ใช้เป็นจุดอ้างอิงเลื่อนวันที่

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
/** เลื่อนทุกค่าที่เป็นวันที่ (YYYY-MM-DD) เท่ากัน ลำดับวันในเอกสารจึงยังถูกต้อง */
function shiftDates(v, days) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return addDays(v, days);
  if (Array.isArray(v)) return v.map((x) => shiftDates(x, days));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftDates(x, days)]));
  return v;
}
/** คูณยอดเงิน (ราคา/จำนวนเงิน/ค่าจ้าง) ด้วยตัวคูณเดียวกัน ยอดรวมกับงวดจึงยังตรงกัน */
function scaleMoney(obj, f) {
  const out = { ...obj };
  for (const k of ['price', 'amount', 'fee', 'discount']) if (typeof out[k] === 'number') out[k] = Math.round(out[k] * f);
  if (typeof out.wht === 'number' && typeof out.amount === 'number') out.wht = Math.round(out.amount * (Number(out.rate) || 3)) / 100;
  return out;
}

/** เนื้อหาเอกสารฉบับที่ i: ข้อมูลตัวอย่างเดิม + วันที่ คู่ค้า และยอดเงินที่ต่างกัน */
function bulkBody(type, date, i) {
  const base = bodyFor(type);
  const days = daysBetween(BASE_DATE, date);
  const f = SCALES[i % SCALES.length];
  const fields = scaleMoney(shiftDates(base.fields, days), f);
  if (type === 'RECEIPT') fields.invoiceRef = ''; // ไม่ผูกใบแจ้งหนี้ (หลายใบเสร็จอ้างฉบับเดียวกันจะเกินยอด)
  if (type === 'PND3' || type === 'PND53') { // แบบ ภ.ง.ด. เป็นของเดือนที่ออก (ห้ามซ้ำเดือนเดียวกัน)
    fields.taxMonth = String(Number(date.slice(5, 7)));
    fields.taxYearBE = Number(date.slice(0, 4)) + 543;
  }
  const party = type === 'CONTRACT_INF' ? base.party : { ...PARTNERS[i % PARTNERS.length] };
  return { docPurpose: 'self', fields, party, items: shiftDates(base.items, days).map((it) => scaleMoney(it, f)) };
}

/** สถานะตามลำดับ: ส่วนใหญ่อนุมัติ มีรอตรวจสอบ แบบร่าง และยกเลิกปนบ้าง */
const bulkStatus = (i) => (i % 13 === 7 ? 'cancelled' : i % 9 === 4 ? 'draft' : i % 6 === 2 ? 'pending' : 'approved');

async function bulkDocs(user, key, target) {
  const existing = await store.where('documents', { userId: user.id });
  const need = Math.max(0, target - existing.length);
  if (!need) return { made: 0, failed: [], total: existing.length };
  const allowed = DS.rolesFor(user.role);
  const types = BULK_TYPES[key].filter((t) => allowed.includes(t));
  // วันที่กระจายเท่า ๆ กันตั้งแต่ 5 ม.ค. ของปีนี้ถึงวันนี้ เรียงจากเก่าไปใหม่ (เลขที่เอกสารจึงเรียงตามวันที่)
  const today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
  const start = `${today.slice(0, 4)}-01-05`;
  const span = Math.max(1, daysBetween(start, today));
  const dates = Array.from({ length: need }, (_, i) => addDays(start, Math.round((span * i) / Math.max(1, need - 1))));
  let made = 0;
  const failed = [];
  for (let i = 0; i < need; i++) {
    let done = false;
    // ลองประเภทถัดไปถ้าข้อมูลไม่ผ่านการตรวจ (เช่น ภ.ง.ด. ของเดือนนั้นมีแล้ว)
    for (let t = 0; t < types.length && !done; t++) {
      const type = types[(i + t) % types.length];
      const built = await docbuild.build(user, type, bulkBody(type, dates[i], i), buildCtx(user));
      if (built.errors && built.errors.length) { if (t === types.length - 1) failed.push(`${type} ${dates[i]}: ${built.errors[0]}`); continue; }
      let doc = await createDoc(user, type, { docPurpose: 'self', issuerRole: user.role, ...built.record, demoSeed: BULK_MARK });
      const status = bulkStatus(i);
      if (status !== 'draft') doc = await ensureIssued(doc, user.displayName);
      await store.update('documents', doc.id, { status, issueDate: dates[i] });
      made++;
      done = true;
    }
  }
  return { made, failed, total: existing.length + made };
}

async function mainBulk(target) {
  await store.ensureReady();
  for (const a of ACCOUNTS.filter((x) => x.otpExempt)) {
    const user = await store.whereOne('users', { email: a.email });
    if (!user) { console.log(`ข้าม ${a.email}: ยังไม่มีบัญชี (รันสคริปต์แบบไม่ใส่ --bulk ก่อน)`); continue; }
    const r = await bulkDocs(user, a.key, target);
    console.log(`${a.email}: เติม ${r.made} ฉบับ · รวม ${r.total} ฉบับ`);
    for (const f of r.failed.slice(0, 5)) console.log(`  ข้าม ${f}`);
  }
}

async function main() {
  const bulkAt = process.argv.indexOf('--bulk');
  if (bulkAt !== -1) {
    const target = Number(process.argv[bulkAt + 1]);
    if (!(target > 0 && target <= 200)) throw new Error('ใส่จำนวนเอกสารต่อบัญชี 1–200 เช่น --bulk 55');
    await mainBulk(target);
    return;
  }
  await store.ensureReady();
  const password = testPassword();
  const ownerPassword = process.env.OWNER_PASSWORD || '';
  for (const a of ACCOUNTS) {
    const { user, created } = await upsertAccount(a, a.otpExempt ? password : ownerPassword);
    const r = await seedDocs(user, a.docs);
    console.log(`${created ? 'สร้าง' : 'อัปเดต'} ${a.email} (#${user.id}, ${a.role})${a.otpExempt ? ' · ไม่ต้องใช้ OTP' : ''}`);
    if (r.skipped) console.log('  เอกสารตัวอย่างมีอยู่แล้ว ไม่เติมซ้ำ');
    else console.log(`  เอกสารตัวอย่าง ${r.made.length} ฉบับ: ${r.made.join(', ')}`);
    for (const f of r.failed) console.log(`  ข้าม ${f}`);
  }
  fs.mkdirSync(path.dirname(PASSWORD_FILE), { recursive: true });
  fs.writeFileSync(PASSWORD_FILE, [
    'บัญชีทดสอบ TaxFlow (เข้าสู่ระบบด้วยรหัสผ่าน ไม่ต้องกรอก OTP) — ไฟล์นี้ไม่ขึ้น git',
    ...ACCOUNTS.filter((a) => a.otpExempt).map((a) => `${a.role.padEnd(10)} ${a.email}`),
    `password: ${password}`,
    '',
  ].join('\n'));
  console.log(`\nรหัสผ่านบัญชีทดสอบบันทึกไว้ที่ ${PASSWORD_FILE}`);
  console.log(ownerPassword ? `${OWNER_EMAIL} ตั้งรหัสผ่านตาม OWNER_PASSWORD แล้ว` : `${OWNER_EMAIL} ไม่มีรหัสผ่าน เข้าสู่ระบบด้วย Google (ยืนยัน OTP ทางอีเมล)`);
}

main().then(() => process.exit(0), (err) => { console.error(err.message || err); process.exit(1); });
