'use strict';
/**
 * server.js เว็บเซิร์ฟเวอร์หลักของระบบ TaxFlow
 * Express 5 บน Node.js 22 รันด้วย `node server.js`
 */
const express = require('express');
const http = require('http'); // ยังใช้ตรงๆ สำหรับยิง webhook ขาออก (lib ส่วน webhook) ไม่เกี่ยวกับ HTTP server หลัก
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// เลือกชั้นเข้าถึงข้อมูล: ตั้ง DATABASE_URL ไว้ -> ใช้ PostgreSQL (lib/store.pg.js, async)
// ไม่ตั้ง -> ใช้ SQLite เดิม (lib/store.js) ทุกฟังก์ชันของ store ถูกเรียกผ่าน await เสมอ
// ทั่วทั้งไฟล์นี้ (await บนค่าที่ไม่ใช่ Promise ก็คืนค่าทันที) จึงทำงานถูกต้องกับทั้งสองแบบ
const store = process.env.DATABASE_URL ? require('./lib/store.pg') : require('./lib/store');
const tax = require('./lib/tax');
const auth = require('./lib/auth');
const docview = require('./lib/docview');
const qr = require('./lib/qr');
const exporter = require('./lib/export');
const otp = require('./lib/otp');
const mailer = require('./lib/mailer');
const profile = require('./lib/profile');
const pdpa = require('./lib/pdpa');
const thaiid = require('./lib/thaiid');
const filestore = require('./lib/filestore');
const { createRouter, readJsonBody, sendJson, sendHtml } = require('./lib/router');
const ratelimit = require('./lib/ratelimit');
const magicbytes = require('./lib/magicbytes');
const taxcalendar = require('./lib/taxcalendar');
const calendar = require('./lib/calendar');
const totp = require('./lib/totp');
const zip = require('./lib/zip');
const docbuild = require('./lib/docbuild');
const DS = require('./public/js/docschema.js');

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// เรียก store.ensureReady() แบบ await จริงๆ ใน main() ด้านล่าง (ต่อ PostgreSQL ต้องรอผลก่อนเริ่มรับ request)

/* ---------- seed demo users ---------- */
const SEED_USERS = [
  {
    role: 'creator', email: 'creator@taxflow.test', password: '123456',
    displayName: 'นุสนีย์ มะแอเคียน', entityType: 'individual', taxId: '1100700123455',
    addr: { no: '99/1', street: 'รามคำแหง', subdistrict: 'หัวหมาก', district: 'บางกะปิ', province: 'กรุงเทพมหานคร', postcode: '10240' },
    phone: '081-234-5678', vatRegistered: false,
    channelName: 'นุสนีย์กินเก่ง', socials: 'TikTok @nusnee.eats (250K) · Instagram @nusnee (80K)', contactName: 'นุสนีย์',
    bank: { bankName: 'ธนาคารไทยพาณิชย์', accountNo: '987-6-54321-0', accountName: 'นุสนีย์ มะแอเคียน' },
  },
  {
    role: 'corporate', email: 'brand@taxflow.test', password: '123456',
    displayName: 'บริษัท แบรนด์ดี จำกัด', entityType: 'juristic',
    companyName: 'บริษัท แบรนด์ดี จำกัด', companyType: 'บริษัทจำกัด', taxId: '0105561112235',
    branchType: 'head', authName: 'สมชาย ใจดี', authPosition: 'กรรมการผู้จัดการ',
    addr: { no: '55', street: 'สาทรใต้', subdistrict: 'ทุ่งมหาเมฆ', district: 'สาทร', province: 'กรุงเทพมหานคร', postcode: '10120' },
    phone: '02-111-2233', vatRegistered: true, vatRegDate: '2019-04-01', contactName: 'พิมพ์ชนก (ฝ่ายการตลาด)',
    bank: { bankName: 'ธนาคารกสิกรไทย', accountNo: '012-3-45678-9', accountName: 'บริษัท แบรนด์ดี จำกัด' },
  },
  {
    role: 'agency', email: 'agency@taxflow.test', password: '123456',
    displayName: 'บริษัท มีเดีย เอเจนซี่ จำกัด', entityType: 'juristic',
    companyName: 'บริษัท มีเดีย เอเจนซี่ จำกัด', companyType: 'บริษัทจำกัด', taxId: '0105550001232',
    branchType: 'head', authName: 'วิภาดา ทองแท้', authPosition: 'กรรมการผู้มีอำนาจ',
    addr: { no: '123', street: 'สุขุมวิท', subdistrict: 'คลองเตยเหนือ', district: 'วัฒนา', province: 'กรุงเทพมหานคร', postcode: '10110' },
    phone: '02-999-8877', vatRegistered: true, vatRegDate: '2017-01-15', tradeName: 'Media Agency', contactName: 'วิภาดา ทองแท้',
    bank: { bankName: 'ธนาคารกรุงไทย', accountNo: '222-3-44455-6', accountName: 'บริษัท มีเดีย เอเจนซี่ จำกัด' },
  },
  {
    role: 'admin', email: 'admin@taxflow.test', password: '123456',
    displayName: 'ผู้ดูแลระบบ TaxFlow', entityType: 'individual', taxId: '',
  },
];

// สมุดคู่ค้าตัวอย่าง (จะถูกผูกกับผู้ใช้ตาม email ตอน seed)
const SEED_CONTACTS = {
  'agency@taxflow.test': [
    { name: 'บริษัท แบรนด์ดี จำกัด', taxId: '0105561112235', kind: 'brand', entityType: 'juristic', branch: 'สำนักงานใหญ่', contactPerson: 'คุณพิมพ์ชนก (ฝ่ายการตลาด)', email: 'ap@branddee.co.th', phone: '02-111-2233', address: '55 ถ.สาทรใต้ แขวงทุ่งมหาเมฆ เขตสาทร กรุงเทพมหานคร 10120', authName: 'สมชาย ใจดี', authPosition: 'กรรมการผู้จัดการ', note: 'ลูกค้าหลัก แคมเปญรายไตรมาส' },
    { name: 'นุสนีย์ มะแอเคียน', taxId: '1100700123455', kind: 'influencer', entityType: 'individual', channelName: 'นุสนีย์กินเก่ง', email: 'nusnee@example.com', phone: '081-234-5678', address: '99/1 ถ.รามคำแหง แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร 10240', bankName: 'ธนาคารไทยพาณิชย์', bankAccountNo: '987-6-54321-0', bankAccountName: 'นุสนีย์ มะแอเคียน', socials: 'TikTok @nusnee.eats · Instagram @nusnee', note: 'อินฟลูเอนเซอร์หมวดอาหาร อัตราค่าจ้าง 15,000 บาทต่อคลิป' },
    { name: 'วลัยลักษณ์ ศรีสวัสดิ์', taxId: '1100700654329', kind: 'influencer', entityType: 'individual', channelName: 'เที่ยวกับวลัย', email: 'walailak@example.com', phone: '089-876-5432', address: '12 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200', bankName: 'ธนาคารกรุงเทพ', bankAccountNo: '111-2-33344-5', bankAccountName: 'วลัยลักษณ์ ศรีสวัสดิ์', socials: 'YouTube เที่ยวกับวลัย · Instagram @walai.trip', note: 'อินฟลูเอนเซอร์หมวดท่องเที่ยว' },
  ],
  'brand@taxflow.test': [
    { name: 'บริษัท มีเดีย เอเจนซี่ จำกัด', taxId: '0105550001232', kind: 'agency', entityType: 'juristic', branch: 'สำนักงานใหญ่', contactPerson: 'คุณวิภาดา', email: 'billing@mediaagency.co.th', phone: '02-999-8877', address: '123 ถ.สุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110', authName: 'วิภาดา ทองแท้', authPosition: 'กรรมการผู้มีอำนาจ', bankName: 'ธนาคารกรุงไทย', bankAccountNo: '222-3-44455-6', bankAccountName: 'บริษัท มีเดีย เอเจนซี่ จำกัด', note: 'เอเจนซี่คู่สัญญาหลัก' },
  ],
  'creator@taxflow.test': [
    { name: 'บริษัท มีเดีย เอเจนซี่ จำกัด', taxId: '0105550001232', kind: 'agency', entityType: 'juristic', branch: 'สำนักงานใหญ่', contactPerson: 'ฝ่ายบัญชี', email: 'hr@mediaagency.co.th', phone: '02-999-8877', address: '123 ถ.สุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110', note: 'ผู้ว่าจ้างประจำ จ่ายทุกสิ้นเดือน' },
  ],
};

async function seedUsers() {
  if (await store.count('users') > 0) return [];
  const created = [];
  for (const u of SEED_USERS) {
    const { password, ...rest } = u;
    const base = profile.defaults(u.role);
    const record = {
      ...base, ...rest,
      passwordHash: auth.hashPassword(password),
      emailVerified: true,
      verifyStatus: 'verified',
      verifiedAt: new Date().toISOString(),
      addr: profile.normalizeAddress(u.addr || {}),
      consent: pdpa.makeConsentRecord(pdpa.PURPOSES.map((x) => x.key)),
    };
    record.address = profile.formatAddress(record.addr);
    const user = await store.insert('users', record);
    await store.insert('consents', {
      userId: user.id, version: pdpa.CONSENT_VERSION,
      purposes: pdpa.PURPOSES.map((x) => x.key), action: 'seed', at: new Date().toISOString(),
    });
    for (const c of (SEED_CONTACTS[u.email] || [])) {
      await store.insert('contacts', { userId: user.id, ...c });
    }
    // ตัวอย่างกิจกรรมในปฏิทินงาน (นับจากวันที่สร้างฐานข้อมูล) ให้บัญชีทดลองเห็นการใช้งานทันที
    if (u.role !== 'admin') {
      const t = bangkokDateStr();
      const plus = (n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
      const SAMPLE = {
        creator: [
          { title: 'ถ่ายทำคอนเทนต์รีวิวสกินแคร์', date: plus(2), time: '13:00', endTime: '17:00', category: 'content', marker: 'camera', priority: 'high', purpose: 'ถ่ายทำตามบรีฟแคมเปญ Glow Up', note: 'เตรียมไฟวงแหวนและฉากสีขาว' },
          { title: 'ส่งใบแจ้งหนี้ให้แบรนด์', date: plus(5), category: 'payment', marker: 'money', priority: 'normal', purpose: 'วางบิลงวดที่ 1' },
        ],
        agency: [
          { title: 'ประชุมบรีฟแคมเปญกับแบรนด์', date: plus(1), time: '10:00', endTime: '11:30', category: 'meeting', marker: 'people', priority: 'high', purpose: 'สรุปงบประมาณและรายชื่อ Influencer' },
          { title: 'จ่ายเงิน Influencer และออก 50 ทวิ', date: plus(6), category: 'payment', marker: 'money', priority: 'critical', purpose: 'จ่ายค่าจ้างงวดสุดท้าย' },
        ],
        corporate: [
          { title: 'ตรวจรับงานแคมเปญเดือนนี้', date: plus(3), category: 'document', marker: 'check', priority: 'high', purpose: 'ตรวจรับตามใบส่งมอบงาน' },
          { title: 'พิจารณาต่ออายุสัญญาเอเจนซี่', date: plus(12), endDate: plus(14), category: 'contract', marker: 'flag', priority: 'normal', purpose: 'สรุปผลงานก่อนต่อสัญญา' },
        ],
      };
      for (const ev of (SAMPLE[u.role] || [])) {
        await store.insert('calendar_events', { userId: user.id, endDate: '', time: '', endTime: '', note: '', linkDocId: null, remindDays: 1, done: false, attachments: [], ...ev, createdAt: new Date().toISOString() });
      }
    }
    created.push(u);
  }
  return created;
}

// ข้อ: apiKeyHash/webhookSecret ต้องไม่หลุดออกไปกับ response นี้เด็ดขาด เดิม publicUser() ตัดแค่
// passwordHash ทำให้ endpoint ที่ใช้ publicUser() ทุกจุด (รวม /api/admin/users/:id ที่แอดมินเรียกดูผู้ใช้อื่น)
// จะส่ง webhookSecret ตัวจริงออกไปด้วย ซึ่งใช้ปลอมลายเซ็น HMAC ของ webhook เจ้าของบัญชีได้ทันที
const publicUser = (u) => { if (!u) return null; const { passwordHash, apiKeyHash, webhookSecret, totpSecret, totpPendingSecret, ...r } = u; return r; };
// ปิดบางส่วนของอีเมลก่อนแสดงผลตอนขอ OTP เช่น na****@gmail.com
function maskEmail(email) {
  const s = String(email || '');
  const i = s.indexOf('@');
  if (i < 1) return s;
  const user = s.slice(0, i);
  const domain = s.slice(i);
  const keep = Math.min(2, user.length);
  return user.slice(0, keep) + '*'.repeat(Math.max(1, user.length - keep)) + domain;
}
// ข้อ: ก่อนแก้ไขจุดนี้ ทุก endpoint ที่ส่ง OTP ทางอีเมลเช็คแค่ mailResult.dev (สำหรับแนบ devCode)
// แต่ไม่เคยเช็ค mailResult.ok เลย ถ้า SMTP ล่ม/App Password หมดอายุ ผู้ใช้จะได้ response
// เหมือนส่งสำเร็จทุกครั้งแล้วรอรหัสที่ไม่มีวันมาถึงโดยไม่รู้สาเหตุ ใช้ข้อความนี้ตอบกลับตอนส่งอีเมลจริงล้มเหลว
const MAIL_SEND_ERROR = 'ส่งอีเมลไม่สำเร็จ ระบบอีเมลขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ หรือติดต่อผู้ดูแลระบบหากยังไม่ได้รับ';

async function currentUser(req) {
  const payload = auth.verifyToken(auth.parseCookies(req).tf_session);
  if (!payload) return null;
  const user = await store.find('users', payload.uid);
  if (!user) return null;
  // เพิกถอน session ได้ทันที: ถ้า tokenVersion ใน token ไม่ตรงกับปัจจุบัน (logout-all/ลบบัญชี)
  // หรือบัญชีถูกลบไปแล้ว ให้ถือว่า token นี้ใช้ไม่ได้อีกต่อไป แม้ยังไม่หมดอายุตามเวลาก็ตาม
  if ((payload.tv || 0) !== (user.tokenVersion || 0)) return null;
  if (user.deleted) return null;
  return user;
}
// จำกัดจำนวนครั้งของ endpoint ที่เสี่ยงถูกยิงถล่ม (login/register/otp) คืน true แล้วตอบ 429 ถ้าเกินโควตา
function rateLimited(res, key, limit, windowMs, message) {
  const r = ratelimit.hit(key, limit, windowMs);
  if (!r.allowed) {
    sendJson(res, 429, { error: message || `ทำรายการถี่เกินไป กรุณารออีกประมาณ ${r.retryAfterSec} วินาทีแล้วลองใหม่` });
    return true;
  }
  return false;
}

function requireAuth(handler) {
  return async (req, res) => {
    const user = await currentUser(req);
    if (!user) return sendJson(res, 401, { error: 'กรุณาเข้าสู่ระบบ' });
    req.user = user;
    return handler(req, res);
  };
}

/* ---------- helpers: numbering, validation, audit, versions, notify ---------- */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// ข้อ: createdAt เป็นเวลา UTC เสมอ เอกสารที่สร้างช่วง 00:00–07:00 น. ตามเวลาไทย (Asia/Bangkok, UTC+7)
// จะถูกแสดง/กรองผิดเป็นวันก่อนหน้า จึงต้องคำนวณ "วันที่ออกเอกสาร" ตามเขตเวลาไทยแยกไว้ต่างหาก
const BKK_DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
function bangkokDateStr(d = new Date()) { return BKK_DATE_FMT.format(d); } // คืนค่า YYYY-MM-DD ตามเวลาไทย
// รูปลายเซ็นต้องเป็น data URI รูปภาพที่แน่นอนเท่านั้น (กัน XSS ผ่าน src="...")
const SIGNATURE_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
function isValidSignatureImage(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 700 * 1024 && SIGNATURE_IMAGE_RE.test(v);
}

// ข้อ 6: แฮชเนื้อหาเอกสาร ณ ตอนลงนาม ใช้ตรวจว่าเนื้อหาเอกสารถูกแก้ไขหลังลงนามหรือไม่
// (ตัดฟิลด์ที่ไม่ใช่ "เนื้อหา" ออก เช่น สถานะ ลายเซ็น เวลาบันทึก เพื่อให้แฮชเปลี่ยนเฉพาะเมื่อเนื้อหาจริงเปลี่ยน)
const CONTENT_HASH_EXCLUDE = new Set([
  'id', 'userId', 'createdAt', 'updatedAt', 'status', 'statusNote',
  'signed', 'signature', 'counterpartySignature', 'cancelledAt', 'cancelReason', 'docNo',
]);
// เรียงตามรหัสอักขระ (ลำดับเดียวกับ .sort() แบบไม่ใส่ฟังก์ชัน) ไม่ใช้ localeCompare เพราะค่าแฮชต้องคงที่ทุกเครื่อง
function compareCodeUnits(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
function contentHash(doc) {
  const obj = {};
  for (const k of Object.keys(doc).sort(compareCodeUnits)) {
    if (CONTENT_HASH_EXCLUDE.has(k)) continue;
    obj[k] = doc[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}
// prefix เลขที่เอกสาร: ประเภทใหม่อ่านจาก docschema (QT / PO / INV / RE / DLV / PV / CTB / CTR / POA / WHT / PND3 / PND53)
// ประเภทเดิมที่ยังต้องแสดงผลย้อนหลังได้ (ETAX / ใบลดหนี้ / ใบเพิ่มหนี้) คง prefix เดิมไว้
const PREFIX = { ETAX: 'TAX', WHT: 'WHT', CREDIT_NOTE: 'CN', DEBIT_NOTE: 'DN', ...Object.fromEntries(Object.entries(DS.FORMS).map(([k, v]) => [k, v.prefix])) };

async function makeDocNo(type, userId) {
  const prefix = PREFIX[type] || 'DOC';
  const year = new Date().getFullYear();
  const seq = await store.nextDocNumber(userId, prefix, year);
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}

// ข้อ 8: ล็อกอัตราภาษีไว้ที่ชุดค่าที่กฎหมายกำหนด ไม่รับอัตราจากผู้ใช้โดยตรง
const VAT_RATE_FIXED = 7;
const WHT_RATES = [1, 2, 3, 5, 10, 15];
function validWhtRate(rate, fallback = 3) {
  const r = Number(rate);
  return WHT_RATES.includes(r) ? r : fallback;
}
// ข้อ 8 / สเปกข้อ 9, 24: เลขผู้เสียภาษีของคู่ค้า ถ้ากรอกมาต้องผ่าน check digit (ไม่บังคับกรอก แต่กรอกแล้วต้องถูก)
function taxIdError(value, label) {
  const digits = thaiid.digitsOnly(value);
  if (!digits) return null;
  if (!thaiid.isValidTaxId(digits)) return `เลขประจำตัวผู้เสียภาษี${label ? 'ของ' + label : ''}ไม่ถูกต้อง กรุณาตรวจสอบเลข 13 หลักอีกครั้ง`;
  return null;
}
// ข้อ 8: จำนวน (qty) ต้องมากกว่า 0 และราคาต่อหน่วยห้ามติดลบ กันเอกสารยอดติดลบ/ผิดธรรมชาติ
function validLineItems(items) {
  return Array.isArray(items) ? items.filter((i) => i && (i.name || i.price)) : [];
}
function lineItemErrors(items) {
  const errs = [];
  if (items.some((i) => !i.name)) errs.push('มีรายการที่ไม่ได้ระบุชื่อ');
  if (items.some((i) => !(Number(i.qty) > 0))) errs.push('จำนวนของแต่ละรายการต้องมากกว่า 0');
  if (items.some((i) => !(Number(i.price) >= 0))) errs.push('ราคาต่อหน่วยของแต่ละรายการต้องไม่ติดลบ');
  return errs;
}

// ตรวจสอบความครบถ้วนของข้อมูลเอกสาร
function validateDocument(type, body) {
  const errors = [];
  if (type === 'ETAX') {
    if (!body.buyer) errors.push('กรุณาระบุชื่อผู้ซื้อ/ผู้ว่าจ้าง');
    const buyerTaxIdErr = taxIdError(body.buyerTaxId, 'ผู้ซื้อ');
    if (buyerTaxIdErr) errors.push(buyerTaxIdErr);
    const items = validLineItems(body.items);
    if (!items.length) errors.push('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ');
    errors.push(...lineItemErrors(items));
  } else {
    if (!body.amount || !(Number(body.amount) > 0)) errors.push('กรุณาระบุยอดเงินให้ถูกต้อง');
    if (type === 'EWHT') {
      if (!body.payee) errors.push('กรุณาระบุชื่อผู้รับเงิน');
      const payeeTaxIdErr = taxIdError(body.payeeTaxId, 'ผู้รับเงิน');
      if (payeeTaxIdErr) errors.push(payeeTaxIdErr);
    }
    if (type === 'WHT' && !body.payer) errors.push('กรุณาระบุชื่อผู้จ่ายเงิน');
  }
  return { ok: errors.length === 0, errors };
}

async function snapshotVersion(doc, actorName, note) {
  const existing = (await store.all('doc_versions', (v) => v.docId === doc.id)).length;
  await store.insert('doc_versions', {
    docId: doc.id, version: existing + 1, editor: actorName, note: note || '',
    snapshot: doc, at: new Date().toISOString(),
  });
}
async function logAudit(userId, docId, action, detail, actorName) {
  await store.insert('audit_log', { userId, docId: docId || null, action, detail: detail || '', actor: actorName || '', at: new Date().toISOString() });
}
async function notify(userId, type, message, docId, extra = {}) {
  await store.insert('notifications', { userId, kind: type, message, docId: docId || null, read: false, at: new Date().toISOString(), ...extra });
}

/* ---------- webhook ขาออก: แจ้งระบบภายนอก (เช่น โปรแกรมบัญชี) เมื่อสถานะเอกสารเปลี่ยน ---------- */
const WEBHOOK_EVENTS = ['document.approved', 'document.rejected', 'document.cancelled'];
function docWebhookPayload(doc) {
  return {
    id: doc.id, docNo: doc.docNo, type: doc.type, status: doc.status,
    // ลำดับ field ตรงกับ rowsOf() ใน lib/export.js เอกสารธุรกิจทั่วไป (ใบเสร็จ/ใบแจ้งหนี้ ฯลฯ) ใช้ "party"
    // ส่วน ETAX ใช้ "buyer", EWHT ใช้ "payee", WHT ใช้ "payer"
    counterparty: doc.party || doc.buyer || doc.payee || doc.payer || '',
    total: Number(doc.total ?? doc.net ?? 0), issueDate: doc.issueDate || null,
  };
}
// ยิง HTTP POST พร้อมลายเซ็น HMAC-SHA256 (header X-TaxFlow-Signature) ไปยัง URL ที่ผู้ใช้ตั้งไว้เอง
// ข้อควรรู้: ไม่ได้กัน SSRF ต่อ URL ปลายทาง (เช่น เรียกกลับเข้า localhost/เครือข่ายภายใน) เพราะ
// ผู้ที่ตั้งค่า URL ได้ต้องมี session ที่ login อยู่แล้วเท่านั้น (ระดับความเสี่ยงเดียวกับตั้งค่าอื่นๆ ในโปรไฟล์)
// ถ้านำไปใช้งานจริงที่เปิดให้ผู้ใช้จำนวนมากตั้งค่าเอง ควรเพิ่มการตรวจ/บล็อก IP ภายในให้ปลายทางอีกชั้น
function deliverWebhook(user, event, doc) {
  if (!user.webhookEnabled || !user.webhookUrl || !(user.webhookEvents || []).includes(event)) return;
  let url;
  try { url = new URL(user.webhookUrl); } catch { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  const body = JSON.stringify({ event, at: new Date().toISOString(), data: docWebhookPayload(doc) });
  const sig = crypto.createHmac('sha256', user.webhookSecret || '').update(body).digest('hex');
  const mod = url.protocol === 'http:' ? http : https;
  const req = mod.request(url, {
    method: 'POST', timeout: 8000,
    headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      'X-TaxFlow-Event': event, 'X-TaxFlow-Signature': `sha256=${sig}`,
    },
  }, (res) => { res.resume(); }); // ไม่สนใจเนื้อหา response ปลายทาง แค่ระบายให้ socket ปิดสะอาด
  req.on('error', (e) => console.error(`[webhook] ส่งไม่สำเร็จ (user ${user.id}, event ${event}):`, e.message));
  req.on('timeout', () => req.destroy(new Error('webhook timeout')));
  req.end(body);
  // ตั้งใจไม่ await/block request หลัก webhook เป็นกลไกเสริม ต้องไม่ทำให้การเปลี่ยนสถานะเอกสารช้าลงหรือล้มเหลวไปด้วย
}

const STATUS_FLOW = {
  draft: ['approved', 'pending', 'cancelled'],
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['archived', 'cancelled'],
  rejected: ['draft', 'cancelled'],
  cancelled: [],
  archived: [],
};
const STATUS_LABEL = { draft: 'แบบร่าง', pending: 'รอตรวจสอบ', approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก', archived: 'เก็บถาวร' };

const api = createRouter();

// ป้องกัน XSS/MIME-sniffing เป็นชั้นที่สอง (defense in depth) ใช้กับทุก response
// ต้องลงทะเบียนเป็น middleware แรกสุด (ก่อน route ทั้งหมดด้านล่าง) เพราะ Express รัน middleware/route
// ตามลำดับที่ .use()/.get()/... ถูกเรียก ถ้าใส่หลัง route แรกจะไม่ทำงานกับ route ที่ประกาศไปก่อนหน้า
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
};
api.use((req, res, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  next();
});

/* =========================================================
 * META / AUTH
 * ========================================================= */
api.get('/api/health', (req, res) => sendJson(res, 200, { status: 'ok', time: new Date().toISOString() }));

/* ---------- ค่าคงที่สำหรับไฟล์โปรไฟล์/เอกสารยืนยันตัวตน ---------- */
const KYC_MIME = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const KYC_MAX = 5 * 1024 * 1024;
const IMG_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const IMG_MAX = 1 * 1024 * 1024;

function requireAdmin(handler) {
  return requireAuth(async (req, res) => {
    if (req.user.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
    return handler(req, res);
  });
}

/* =========================================================
 * สมัครสมาชิก เก็บข้อมูลตามบทบาท + ความยินยอม PDPA + ยืนยันอีเมลด้วย OTP
 * บัญชีจะยังใช้งานไม่ได้จนกว่าจะยืนยันรหัส OTP ที่ส่งไปทางอีเมล
 * ========================================================= */
// ตรวจข้อมูลซ้ำระหว่างกรอกฟอร์มสมัคร (อีเมล / เลขประจำตัวผู้เสียภาษี) จำกัดความถี่กันการไล่เดาอีเมลในระบบ
api.post('/api/auth/check-available', async (req, res) => {
  if (rateLimited(res, `avail:${ratelimit.clientIp(req)}`, 40, 10 * 60 * 1000, 'ตรวจสอบถี่เกินไป กรุณารอสักครู่')) return;
  const b = await readJsonBody(req);
  const out = {};
  if (b.email !== undefined) {
    const email = String(b.email || '').trim().toLowerCase();
    out.email = DS.FORMAT.email.re.test(email) ? { taken: !!(await store.whereOne('users', { email })) } : { invalid: true };
  }
  if (b.taxId !== undefined) {
    const taxId = thaiid.digitsOnly(b.taxId);
    out.taxId = thaiid.isValidTaxId(taxId) ? { taken: !!(await store.findOne('users', (u) => u.taxId && u.taxId === taxId && !u.deleted)) } : { invalid: true };
  }
  sendJson(res, 200, out);
});

api.post('/api/auth/register', async (req, res) => {
  // ข้อ: ไม่มี rate limit ที่ register จำกัดจำนวนบัญชีที่สมัครได้ต่อ IP ต่อชั่วโมง
  if (rateLimited(res, `register:${ratelimit.clientIp(req)}`, 8, 60 * 60 * 1000, 'สมัครสมาชิกถี่เกินไปจากเครือข่ายนี้ กรุณาลองใหม่ภายหลัง')) return;
  const b = await readJsonBody(req);
  const email = String(b.email || '').trim().toLowerCase();

  if (!email) return sendJson(res, 400, { error: 'กรุณากรอกอีเมล (ห้ามเว้นว่าง)', field: 'email' });
  if (!DS.FORMAT.email.re.test(email) || email.length > 150) return sendJson(res, 400, { error: 'รูปแบบอีเมลไม่ถูกต้อง (ตัวอย่าง example@email.com)', field: 'email' });
  if (!b.password) return sendJson(res, 400, { error: 'กรุณากรอกรหัสผ่าน', field: 'password' });
  if (String(b.password).length < 8) return sendJson(res, 400, { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', field: 'password' });
  if (String(b.password).length > 128) return sendJson(res, 400, { error: 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร', field: 'password' });
  if (!/[A-Za-z]/.test(b.password) || !/\d/.test(b.password)) return sendJson(res, 400, { error: 'รหัสผ่านต้องมีทั้งตัวอักษรภาษาอังกฤษและตัวเลข', field: 'password' });
  if (b.passwordConfirm !== undefined && b.passwordConfirm !== b.password) return sendJson(res, 400, { error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน', field: 'password2' });
  if (await store.whereOne('users', { email })) return sendJson(res, 409, { error: 'อีเมลนี้ถูกใช้สมัครแล้ว กรุณาเข้าสู่ระบบ หรือใช้อีเมลอื่น', field: 'email' });

  // ห้ามสมัครเป็นผู้ดูแลระบบผ่านหน้าลงทะเบียน
  const role = ['agency', 'corporate', 'creator'].includes(b.role) ? b.role : 'creator';

  // ความยินยอมตาม PDPA ต้องยินยอมข้อที่จำเป็นก่อนจึงจะสร้างบัญชีได้
  const consentCheck = pdpa.validateConsent(b.consent);
  if (!consentCheck.ok) return sendJson(res, 400, { error: consentCheck.error });

  // ประกอบข้อมูลโปรไฟล์ตามบทบาท
  const draft = { ...profile.defaults(role), role, email };
  const { patch, errors } = profile.buildPatch(draft, b);
  if (errors.length) return sendJson(res, 400, { error: errors[0], errors });

  const name = patch.entityType === 'juristic' ? patch.companyName : patch.displayName;
  if (!name) return sendJson(res, 400, { error: patch.entityType === 'juristic' ? 'กรุณากรอกชื่อนิติบุคคล' : 'กรุณากรอกชื่อ-นามสกุล' });
  if (!patch.taxId) return sendJson(res, 400, { error: 'กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลัก' });
  if (await store.findOne('users', (u) => u.taxId && u.taxId === patch.taxId)) {
    return sendJson(res, 409, { error: 'เลขประจำตัวผู้เสียภาษีนี้ถูกใช้ลงทะเบียนแล้ว (1 เลขต่อ 1 บัญชี)', field: 'taxId' });
  }

  const consentRecord = pdpa.makeConsentRecord(consentCheck.purposes);
  const user = await store.insert('users', {
    ...draft, ...patch,
    passwordHash: auth.hashPassword(b.password),
    emailVerified: false,
    consent: consentRecord,
  });
  await store.insert('consents', {
    userId: user.id, version: consentRecord.version, purposes: consentRecord.purposes,
    action: 'register', at: consentRecord.at,
  });

  const { id: otpId, code } = await otp.createOtp(user.id, 'register', null, 'email');
  const mailResult = await mailer.sendOtpEmail(user.email, { code, purpose: 'register', displayName: user.displayName });
  await logAudit(user.id, null, 'register', 'สร้างบัญชีใหม่ รอยืนยันอีเมล', user.displayName);

  // บัญชี/รหัส OTP ถูกสร้างไว้แล้วแม้ส่งอีเมลไม่สำเร็จ (กดส่งรหัสอีกครั้งได้โดยไม่ต้องสมัครใหม่)
  // จึงยังตอบ 201 ตามปกติ แต่แนบ notice เตือนแทนการเงียบเหมือนส่งสำเร็จ
  sendJson(res, 201, {
    pendingVerification: true, otpId, emailMasked: maskEmail(user.email),
    ...(mailResult.dev ? { devCode: code } : {}),
    ...(mailResult.ok === false ? { notice: 'สร้างบัญชีสำเร็จ แต่ส่งอีเมลยืนยันไม่สำเร็จ กรุณากด "ส่งรหัสอีกครั้ง" ด้านล่างเพื่อลองใหม่' } : {}),
  });
});

// ยืนยันอีเมลตอนสมัคร แล้วจึงเปิดใช้งานบัญชีและออก session
api.post('/api/auth/register/verify-otp', async (req, res) => {
  const b = await readJsonBody(req);
  const result = await otp.verify(b.otpId, b.code, { purpose: 'register' });
  if (!result.ok) return sendJson(res, 400, { error: result.error });
  const user = await store.find('users', result.otp.userId);
  if (!user) return sendJson(res, 404, { error: 'ไม่พบบัญชีผู้ใช้' });
  const updated = await store.update('users', user.id, { emailVerified: true, emailVerifiedAt: new Date().toISOString() });
  auth.setSessionCookie(res, auth.createToken({ uid: user.id, role: user.role, tv: user.tokenVersion || 0 }));
  await logAudit(user.id, null, 'verify-email', 'ยืนยันอีเมลสำเร็จ บัญชีพร้อมใช้งาน', user.displayName);
  sendJson(res, 200, { user: publicUser(updated) });
});

api.post('/api/auth/register/resend-otp', async (req, res) => {
  const b = await readJsonBody(req);
  const row = await store.find('otp_codes', b.otpId);
  if (!row || row.purpose !== 'register') return sendJson(res, 404, { error: 'ไม่พบรายการยืนยันอีเมลนี้ กรุณาสมัครใหม่อีกครั้ง' });
  const r = await otp.regenerate(b.otpId);
  if (!r) return sendJson(res, 400, { error: 'ไม่สามารถขอรหัสใหม่ได้ กรุณาสมัครใหม่อีกครั้ง' });
  if (r.exhausted) return sendJson(res, 429, { error: 'ขอรหัสใหม่ครบจำนวนครั้งที่กำหนดแล้ว กรุณาสมัครใหม่อีกครั้ง' });
  if (r.throttled) return sendJson(res, 429, { error: `กรุณารออีก ${r.waitSec} วินาทีก่อนขอรหัสใหม่` });
  const user = await store.find('users', row.userId);
  const mailResult = await mailer.sendOtpEmail(user.email, { code: r.code, purpose: 'register', displayName: user.displayName });
  if (mailResult.ok === false) return sendJson(res, 502, { error: MAIL_SEND_ERROR });
  sendJson(res, 200, { otpId: b.otpId, ...(mailResult.dev ? { devCode: r.code } : {}) });
});

/* ---------- เข้าสู่ระบบ (ขั้นที่ 1: ตรวจอีเมล/รหัสผ่าน แล้วส่ง OTP) ---------- */
api.post('/api/auth/login', async (req, res) => {
  const b = await readJsonBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  // ข้อ: ไม่มี rate limit ที่ login จำกัดทั้งต่อ IP (กัน brute-force กว้างๆ) และต่อ IP+อีเมล (กัน targeted)
  if (rateLimited(res, `login:ip:${ratelimit.clientIp(req)}`, 30, 10 * 60 * 1000)) return;
  if (email && rateLimited(res, `login:acct:${ratelimit.clientIp(req)}:${email}`, 8, 10 * 60 * 1000, 'ลองเข้าสู่ระบบผิดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')) return;
  const user = await store.whereOne('users', { email });
  if (!user || !auth.verifyPassword(b.password, user.passwordHash)) return sendJson(res, 401, { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });

  // บัญชีที่ยังไม่ได้ยืนยันอีเมล ให้กลับไปทำขั้นตอนยืนยันอีเมลให้เสร็จก่อน
  if (!user.emailVerified) {
    const { id: otpId, code } = await otp.createOtp(user.id, 'register', null, 'email');
    const mailResult = await mailer.sendOtpEmail(user.email, { code, purpose: 'register', displayName: user.displayName });
    return sendJson(res, 200, {
      pendingVerification: true, otpId, emailMasked: maskEmail(user.email),
      notice: mailResult.ok === false
        ? 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล และระบบส่งอีเมลยืนยันไม่สำเร็จ กรุณากด "ส่งรหัสอีกครั้ง" ด้านล่างเพื่อลองใหม่'
        : 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล ระบบได้ส่งรหัสยืนยันไปให้ใหม่แล้ว',
      ...(mailResult.dev ? { devCode: code } : {}),
    });
  }

  // ข้อ: ถ้าบัญชีนี้เปิดใช้ TOTP (แอป Authenticator) ไว้แล้ว ให้ข้ามการส่ง OTP ทางอีเมลไปเลย
  // เพราะ TOTP เชื่อถือได้เทียบเท่า/สูงกว่าอีเมลอยู่แล้ว และเร็วกว่ามาก (ไม่ต้องรอกล่องจดหมาย)
  if (user.totpEnabled && user.totpSecret) {
    const { id: otpId } = await otp.createOtp(user.id, 'login-totp', null, 'email'); // ใช้แค่เป็นรายการรออ้างอิง ไม่ส่งอีเมลจริง
    await logAudit(user.id, null, 'login-totp-pending', 'รอยืนยันด้วยแอป Authenticator (TOTP)', user.displayName);
    return sendJson(res, 200, { totpRequired: true, otpId, emailMasked: maskEmail(user.email) });
  }

  const { id: otpId, code } = await otp.createOtp(user.id, 'login', null, 'email');
  const mailResult = await mailer.sendOtpEmail(user.email, { code, purpose: 'login', displayName: user.displayName });
  await logAudit(user.id, null, 'login-otp-sent', `ส่งรหัส OTP เข้าสู่ระบบไปที่ ${user.email}`, user.displayName);
  sendJson(res, 200, {
    otpRequired: true, otpId, emailMasked: maskEmail(user.email),
    ...(mailResult.dev ? { devCode: code } : {}),
    ...(mailResult.ok === false ? { notice: 'ส่งอีเมลรหัสยืนยันไม่สำเร็จ (ระบบอีเมลขัดข้องชั่วคราว) กรุณากด "ส่งรหัสอีกครั้ง" ด้านล่างเพื่อลองใหม่' } : {}),
  });
});

// ขั้นตอนที่ 2 (ทางเลือก TOTP): ยืนยันรหัสจากแอป Authenticator แทนรหัส OTP ทางอีเมล
api.post('/api/auth/login/totp', async (req, res) => {
  const b = await readJsonBody(req);
  if (rateLimited(res, `login-totp:${ratelimit.clientIp(req)}`, 15, 10 * 60 * 1000, 'ลองยืนยันผิดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')) return;
  const row = await store.find('otp_codes', b.otpId);
  if (!row || row.purpose !== 'login-totp') return sendJson(res, 404, { error: 'ไม่พบรายการนี้ กรุณาเข้าสู่ระบบใหม่' });
  const user = await store.find('users', row.userId);
  if (!user || !user.totpEnabled || !user.totpSecret) return sendJson(res, 400, { error: 'บัญชีนี้ไม่ได้เปิดใช้งาน TOTP' });
  const result = await otp.verifyExternal(b.otpId, { userId: user.id, purpose: 'login-totp' }, () => totp.verifyTotp(user.totpSecret, b.code));
  if (!result.ok) return sendJson(res, 400, { error: result.error });
  auth.setSessionCookie(res, auth.createToken({ uid: user.id, role: user.role, tv: user.tokenVersion || 0 }));
  await logAudit(user.id, null, 'login', 'เข้าสู่ระบบสำเร็จ (ยืนยันด้วย TOTP)', user.displayName);
  sendJson(res, 200, { user: publicUser(user) });
});

// ขั้นตอนที่ 2: ยืนยันรหัส OTP แล้วจึงออก session cookie จริง
api.post('/api/auth/login/verify-otp', async (req, res) => {
  const b = await readJsonBody(req);
  const result = await otp.verify(b.otpId, b.code, { purpose: 'login' });
  if (!result.ok) return sendJson(res, 400, { error: result.error });
  const user = await store.find('users', result.otp.userId);
  if (!user) return sendJson(res, 404, { error: 'ไม่พบบัญชีผู้ใช้' });
  auth.setSessionCookie(res, auth.createToken({ uid: user.id, role: user.role, tv: user.tokenVersion || 0 }));
  await logAudit(user.id, null, 'login', 'เข้าสู่ระบบสำเร็จ (ยืนยันด้วย OTP)', user.displayName);
  sendJson(res, 200, { user: publicUser(user) });
});

// ขอรหัส OTP เข้าสู่ระบบใหม่ (กด "ส่งรหัสอีกครั้ง")
api.post('/api/auth/login/resend-otp', async (req, res) => {
  const b = await readJsonBody(req);
  const row = await store.find('otp_codes', b.otpId);
  if (!row || row.purpose !== 'login') return sendJson(res, 404, { error: 'ไม่พบรายการ OTP นี้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  const r = await otp.regenerate(b.otpId);
  if (!r) return sendJson(res, 400, { error: 'ไม่สามารถขอรหัสใหม่ได้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  if (r.exhausted) return sendJson(res, 429, { error: 'ขอรหัสใหม่ครบจำนวนครั้งที่กำหนดแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  if (r.throttled) return sendJson(res, 429, { error: `กรุณารออีก ${r.waitSec} วินาทีก่อนขอรหัสใหม่` });
  const user = await store.find('users', row.userId);
  const mailResult = await mailer.sendOtpEmail(user.email, { code: r.code, purpose: 'login', displayName: user.displayName });
  if (mailResult.ok === false) return sendJson(res, 502, { error: MAIL_SEND_ERROR });
  sendJson(res, 200, { otpId: b.otpId, ...(mailResult.dev ? { devCode: r.code } : {}) });
});

api.post('/api/auth/logout', async (req, res) => { auth.clearSessionCookie(res); sendJson(res, 200, { ok: true }); });
// ออกจากระบบทุกอุปกรณ์ เพิ่ม tokenVersion เพื่อเพิกถอน session เดิมทั้งหมดทันที (ไม่ใช่แค่ลบ cookie ฝั่งนี้)
api.post('/api/auth/logout-all', requireAuth(async (req, res) => {
  await store.update('users', req.user.id, { tokenVersion: (req.user.tokenVersion || 0) + 1 });
  auth.clearSessionCookie(res);
  await logAudit(req.user.id, null, 'logout-all', 'ออกจากระบบทุกอุปกรณ์ (เพิกถอน session เดิมทั้งหมด)', req.user.displayName);
  sendJson(res, 200, { ok: true });
}));
api.get('/api/auth/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'ยังไม่ได้เข้าสู่ระบบ' });
  sendJson(res, 200, { user: publicUser(user), profile: profileMeta(user) });
});

/* =========================================================
 * โปรไฟล์ตามบทบาท
 * ========================================================= */

// ข้อมูลประกอบสำหรับสร้างฟอร์ม (รายการจังหวัด ธนาคาร ประเภทนิติบุคคล ฯลฯ)
// แนวโน้มรายเดือนย้อนหลัง 12 เดือน (สำหรับกราฟบนแดชบอร์ด) แบ่งกลุ่มตาม issueDate (เขตเวลาไทย)
// เฉพาะเอกสารสถานะ approved/archived เท่านั้น (นับเป็น "ยอดที่เกิดขึ้นจริง" ไม่ใช่แบบร่าง/รอตรวจ)
api.get('/api/dashboard/trend', requireAuth(async (req, res) => {
  const todayYM = bangkokDateStr().slice(0, 7);
  const months = [];
  { // สร้างลิสต์ 12 เดือนย้อนหลังจากเดือนปัจจุบัน (รวมเดือนนี้) แบบไม่พึ่ง Date object เขตเวลาอื่น
    let [y, m] = todayYM.split('-').map(Number);
    for (let i = 0; i < 12; i++) {
      months.unshift(`${y}-${String(m).padStart(2, '0')}`);
      m--; if (m === 0) { m = 12; y--; }
    }
  }
  const byMonth = Object.fromEntries(months.map((ym) => [ym, { income: 0, vat: 0, wht: 0, count: 0 }]));
  const docs = await store.all('documents', (d) => d.userId === req.user.id && ['approved', 'archived'].includes(d.status));
  const isWht = (d) => ['WHT', 'EWHT'].includes(d.type);
  for (const d of docs) {
    const ym = (d.issueDate || (d.createdAt || '').slice(0, 10)).slice(0, 7);
    const bucket = byMonth[ym];
    if (!bucket) continue; // นอกช่วง 12 เดือนที่แสดง
    bucket.income += Number(isWht(d) ? d.net || 0 : d.total || d.base || 0);
    bucket.vat += Number(!isWht(d) ? d.vat || 0 : 0);
    bucket.wht += Number(isWht(d) ? d.wht || 0 : 0);
    bucket.count += 1;
  }
  sendJson(res, 200, {
    months,
    income: months.map((ym) => round2(byMonth[ym].income)),
    vat: months.map((ym) => round2(byMonth[ym].vat)),
    wht: months.map((ym) => round2(byMonth[ym].wht)),
    count: months.map((ym) => byMonth[ym].count),
  });
}));

// ปฏิทินกำหนดยื่นภาษีที่เกี่ยวข้องกับบทบาท/สถานะ VAT ของผู้ใช้รายนี้ (ดูรายละเอียดข้อจำกัดใน lib/taxcalendar.js)
api.get('/api/tax-calendar', requireAuth(async (req, res) => {
  sendJson(res, 200, { items: taxcalendar.upcomingDeadlines(req.user, bangkokDateStr()) });
}));

api.get('/api/meta/profile-options', (req, res) => sendJson(res, 200, {
  companyTypes: profile.COMPANY_TYPES,
  provinces: profile.PROVINCES,
  banks: profile.BANKS,
  kycTypes: profile.KYC_TYPES,
  roleLabels: profile.ROLE_LABEL,
  consentPurposes: pdpa.PURPOSES,
  consentVersion: pdpa.CONSENT_VERSION,
}));

function profileMeta(user) {
  const c = profile.completeness(user);
  return {
    completeness: c,
    isJuristic: profile.isJuristic(user),
    branchLabel: profile.branchLabel(user),
    requiredKyc: profile.requiredKyc(user),
    canIssueEtax: !!user.vatRegistered,
  };
}

api.put('/api/auth/profile', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const { patch, errors } = profile.buildPatch(req.user, b);
  if (errors.length) return sendJson(res, 400, { error: errors[0], errors });

  // เลขประจำตัวผู้เสียภาษีต้องไม่ซ้ำกับบัญชีอื่น
  if (patch.taxId && await store.findOne('users', (u) => u.id !== req.user.id && u.taxId === patch.taxId)) {
    return sendJson(res, 409, { error: 'เลขประจำตัวผู้เสียภาษีนี้ถูกใช้โดยบัญชีอื่นแล้ว' });
  }

  // ข้อ: การเปลี่ยนเลขบัญชีธนาคารรับเงินเป็นช่องทางหลักของการโกงเปลี่ยนบัญชีรับเงิน
  // ต้องยืนยันด้วย OTP ก่อนบันทึกทุกครั้ง (เดิมแก้ได้ทันทีเหมือนข้อมูลอื่นๆ ในโปรไฟล์)
  const bankChanged = patch.bank && JSON.stringify(patch.bank) !== JSON.stringify(req.user.bank || {});
  if (bankChanged) {
    const check = await otp.verify(b.otpId, b.code, { userId: req.user.id, purpose: 'change-bank' });
    if (!check.ok) return sendJson(res, 400, { error: 'เปลี่ยนบัญชีธนาคารต้องยืนยันด้วยรหัส OTP ก่อน: ' + check.error, requireOtp: true });
  }

  // ถ้าแก้ข้อมูลสำคัญหลังผ่านการตรวจสอบแล้ว ต้องกลับไปรอตรวจสอบใหม่
  const critical = ['taxId', 'companyName', 'displayName', 'entityType', 'vatRegistered'];
  const changedCritical = critical.some((k) => JSON.stringify(patch[k]) !== undefined && patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(req.user[k]));
  const extra = {};
  if (changedCritical && req.user.verifyStatus === 'verified') {
    extra.verifyStatus = 'pending';
    extra.verifyNote = 'ข้อมูลสำคัญถูกแก้ไข ระบบส่งกลับไปตรวจสอบอีกครั้งโดยอัตโนมัติ';
  }

  const u = await store.update('users', req.user.id, { ...patch, ...extra });
  await logAudit(req.user.id, null, 'profile-update', bankChanged ? 'แก้ไขข้อมูลโปรไฟล์ (รวมถึงเปลี่ยนบัญชีธนาคาร ยืนยันด้วย OTP แล้ว)' : 'แก้ไขข้อมูลโปรไฟล์', req.user.displayName);
  sendJson(res, 200, { user: publicUser(u), profile: profileMeta(u) });
}));

/* ---------- โลโก้และตราประทับสำหรับพิมพ์บนเอกสาร ---------- */
api.post('/api/auth/brand-image', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const kind = b.kind === 'seal' ? 'seal' : 'logo';
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์รูปภาพ' });
  if (!IMG_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PNG, JPG, WEBP เท่านั้น' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (buf.length > IMG_MAX) return sendJson(res, 413, { error: 'ไฟล์รูปภาพต้องมีขนาดไม่เกิน 1 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์รูปภาพจริง' });

  const field = kind === 'seal' ? 'sealFile' : 'logoFile';
  const old = req.user[field];
  if (old && old.storedName) filestore.removeFile(store.UPLOAD_DIR, old.storedName);

  const storedName = 'brand_' + crypto.randomBytes(12).toString('hex') + '.' + IMG_MIME[b.mime];
  fs.writeFileSync(path.join(store.UPLOAD_DIR, storedName), buf);
  const meta = { storedName, mime: b.mime, size: buf.length, filename: String(b.filename || '').slice(0, 120), at: new Date().toISOString() };
  const u = await store.update('users', req.user.id, { [field]: meta });
  await logAudit(req.user.id, null, 'brand-image', kind === 'seal' ? 'อัปโหลดตราประทับบริษัท' : 'อัปโหลดโลโก้บริษัท', req.user.displayName);
  sendJson(res, 201, { user: publicUser(u), kind });
}));

api.delete('/api/auth/brand-image/:kind', requireAuth(async (req, res) => {
  const kind = req.params.kind === 'seal' ? 'seal' : 'logo';
  const field = kind === 'seal' ? 'sealFile' : 'logoFile';
  const cur = req.user[field];
  if (cur && cur.storedName) filestore.removeFile(store.UPLOAD_DIR, cur.storedName);
  const u = await store.update('users', req.user.id, { [field]: null });
  sendJson(res, 200, { user: publicUser(u) });
}));

api.get('/api/auth/brand-image/:kind', requireAuth(async (req, res) => {
  const kind = req.params.kind === 'seal' ? 'seal' : 'logo';
  const meta = req.user[kind === 'seal' ? 'sealFile' : 'logoFile'];
  if (!meta) return sendJson(res, 404, { error: 'ยังไม่ได้อัปโหลดรูปภาพนี้' });
  try {
    const buf = fs.readFileSync(path.join(store.UPLOAD_DIR, meta.storedName));
    res.writeHead(200, { 'Content-Type': meta.mime, 'Cache-Control': 'no-store', 'Content-Length': buf.length });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'ไม่พบไฟล์รูปภาพ' }); }
}));

/* =========================================================
 * การเชื่อมต่อระบบภายนอก API key (ดึงข้อมูลเข้า) + Webhook (ส่งแจ้งเตือนออก)
 * สำหรับต่อกับโปรแกรมบัญชี/ระบบอื่นที่ผู้ใช้ดูแลเอง ไม่ใช่ความสัมพันธ์กับ TaxFlow โดยตรง
 * ========================================================= */
api.get('/api/integrations', requireAuth(async (req, res) => {
  const u = req.user;
  sendJson(res, 200, {
    apiKey: u.apiKeyHash ? { prefix: u.apiKeyPrefix || '', createdAt: u.apiKeyCreatedAt || null } : null,
    webhook: {
      url: u.webhookUrl || '', enabled: !!u.webhookEnabled,
      events: u.webhookEvents || WEBHOOK_EVENTS.slice(),
      hasSecret: !!u.webhookSecret,
    },
    availableEvents: WEBHOOK_EVENTS,
  });
}));

// สร้าง/สร้างใหม่ API key โชว์รหัสจริงให้เห็นครั้งเดียวตอนนี้เท่านั้น เก็บเฉพาะแฮชไว้ในฐานข้อมูล (เหมือนรหัสผ่าน)
api.post('/api/integrations/api-key', requireAuth(async (req, res) => {
  const key = 'tf_live_' + crypto.randomBytes(24).toString('hex');
  const apiKeyHash = crypto.createHash('sha256').update(key).digest('hex');
  await store.update('users', req.user.id, {
    apiKeyHash, apiKeyPrefix: key.slice(0, 14), apiKeyCreatedAt: new Date().toISOString(),
  });
  await logAudit(req.user.id, null, 'api-key-generate', 'สร้าง/สร้างใหม่ API key สำหรับเชื่อมระบบภายนอก', req.user.displayName);
  sendJson(res, 201, { key });
}));

api.delete('/api/integrations/api-key', requireAuth(async (req, res) => {
  await store.update('users', req.user.id, { apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null });
  await logAudit(req.user.id, null, 'api-key-revoke', 'เพิกถอน API key', req.user.displayName);
  sendJson(res, 200, { ok: true });
}));

api.put('/api/integrations/webhook', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const url = String(b.url || '').trim();
  if (url) {
    try { const u = new URL(url); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw 0; }
    catch { return sendJson(res, 400, { error: 'URL ไม่ถูกต้อง ต้องขึ้นต้นด้วย http:// หรือ https://' }); }
  }
  const events = Array.isArray(b.events) ? b.events.filter((e) => WEBHOOK_EVENTS.includes(e)) : WEBHOOK_EVENTS.slice();
  const patch = { webhookUrl: url, webhookEvents: events, webhookEnabled: !!b.enabled && !!url };
  if (!req.user.webhookSecret) patch.webhookSecret = crypto.randomBytes(24).toString('hex'); // สร้างครั้งแรกครั้งเดียว ใช้เซ็น HMAC ทุกครั้งถัดไป
  const u = await store.update('users', req.user.id, patch);
  await logAudit(req.user.id, null, 'webhook-update', `ตั้งค่า webhook: ${url || '(ปิดใช้งาน)'}`, req.user.displayName);
  sendJson(res, 200, { url: u.webhookUrl, enabled: u.webhookEnabled, events: u.webhookEvents, hasSecret: !!u.webhookSecret });
}));

api.delete('/api/integrations/webhook', requireAuth(async (req, res) => {
  await store.update('users', req.user.id, { webhookUrl: '', webhookEnabled: false, webhookSecret: null });
  await logAudit(req.user.id, null, 'webhook-remove', 'ปิดใช้งาน webhook', req.user.displayName);
  sendJson(res, 200, { ok: true });
}));

// ยิง event ทดสอบทันที เพื่อให้ผู้ใช้เห็นผลว่าปลายทางเชื่อมต่อได้จริงก่อนใช้งานจริง
api.post('/api/integrations/webhook/test', requireAuth(async (req, res) => {
  const u = req.user;
  if (!u.webhookUrl) return sendJson(res, 400, { error: 'ยังไม่ได้ตั้งค่า URL ปลายทาง' });
  let target;
  try { target = new URL(u.webhookUrl); } catch { return sendJson(res, 400, { error: 'URL ไม่ถูกต้อง' }); }
  const body = JSON.stringify({ event: 'ping', at: new Date().toISOString(), data: { message: 'TaxFlow webhook test' } });
  const sig = crypto.createHmac('sha256', u.webhookSecret || '').update(body).digest('hex');
  const mod = target.protocol === 'http:' ? http : https;
  const started = Date.now();
  const testReq = mod.request(target, {
    method: 'POST', timeout: 8000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-TaxFlow-Event': 'ping', 'X-TaxFlow-Signature': `sha256=${sig}` },
  }, (r) => {
    r.resume();
    sendJson(res, 200, { ok: r.statusCode < 400, status: r.statusCode, ms: Date.now() - started });
  });
  testReq.on('error', (e) => sendJson(res, 200, { ok: false, error: e.message }));
  testReq.on('timeout', () => { testReq.destroy(); sendJson(res, 200, { ok: false, error: 'ปลายทางไม่ตอบสนองภายใน 8 วินาที' }); });
  testReq.end(body);
}));

/* ---------- API ภายนอก (v1) auth ด้วย API key แทน session cookie สำหรับให้ระบบอื่นดึงข้อมูลอ่านอย่างเดียว ---------- */
function requireApiKey(handler) {
  return async (req, res) => {
    const key = req.headers['x-api-key'];
    if (rateLimited(res, `apikey:${ratelimit.clientIp(req)}`, 120, 10 * 60 * 1000, 'เรียก API ถี่เกินไป กรุณาลองใหม่ภายหลัง')) return;
    if (!key) return sendJson(res, 401, { error: 'ต้องระบุ API key ใน header X-Api-Key' });
    const hash = crypto.createHash('sha256').update(String(key)).digest('hex');
    // ใช้ findOne (สแกนด้วย JS) โดยตั้งใจ ไม่ใช่ store.where()/whereOne() apiKeyHash ไม่ใช่คอลัมน์ที่มีดัชนีจริง
    // (ดู lib/store.js) การใช้ where() กับคอลัมน์ที่ไม่มีดัชนีจะ fallback คืนแถวทั้งหมดแบบไม่กรอง ซึ่งจะเป็นช่องโหว่ยืนยันตัวตนร้ายแรง
    const user = await store.findOne('users', (u) => u.apiKeyHash === hash && !u.deleted);
    if (!user) return sendJson(res, 401, { error: 'API key ไม่ถูกต้องหรือถูกเพิกถอนแล้ว' });
    req.user = user;
    return handler(req, res);
  };
}
api.get('/api/v1/documents', requireApiKey(async (req, res) => {
  const items = (await store.all('documents', (d) => d.userId === req.user.id)).reverse().map(docWebhookPayload);
  sendJson(res, 200, { items });
}));
api.get('/api/v1/documents/:id', requireApiKey(async (req, res) => {
  const doc = await store.find('documents', req.params.id);
  if (!doc || doc.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  sendJson(res, 200, docWebhookPayload(doc));
}));
api.get('/api/v1/contacts', requireApiKey(async (req, res) => {
  const items = (await store.all('contacts', (c) => c.userId === req.user.id)).map(
    ({ id, name, kind, taxId, email, phone }) => ({ id, name, kind, taxId, email, phone })
  );
  sendJson(res, 200, { items });
}));

/* =========================================================
 * TOTP ยืนยันตัวตนด้วยแอป Authenticator แทน/เพิ่มเติมจาก OTP ทางอีเมล
 * ========================================================= */
// ขั้นที่ 1: ขอ secret ใหม่ + QR ให้สแกน ยังไม่เปิดใช้งานจริงจนกว่าจะยืนยันรหัสจากแอปสำเร็จ (/confirm)
// เก็บไว้ใน totpPendingSecret ชั่วคราว กัน secret เดิมที่เปิดใช้งานอยู่แล้วถูกเขียนทับก่อนยืนยันได้จริง
api.post('/api/totp/setup', requireAuth(async (req, res) => {
  const secret = totp.generateSecret();
  await store.update('users', req.user.id, { totpPendingSecret: secret });
  const uri = totp.keyUri(secret, { label: req.user.email, issuer: 'TaxFlow' });
  // lib/qr.js เป็นตัวสร้าง QR แบบ pure JS ที่รองรับความยาวข้อมูลจำกัด (version 1–6) อีเมลที่ยาวผิดปกติ
  // อาจทำให้ URI เกินขีดจำกัดจนสร้าง QR ไม่ได้ ในกรณีนั้นให้ผู้ใช้กรอกรหัสด้วยตนเองแทนแทนที่จะตอบ 500
  let qrSvg = null;
  try { qrSvg = qr.toSVG(uri, { scale: 4 }); } catch (e) { console.error('[totp] สร้าง QR ไม่สำเร็จ (URI อาจยาวเกินไป):', e.message); }
  sendJson(res, 200, { secret, otpauthUrl: uri, qrSvg });
}));

api.post('/api/totp/confirm', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!req.user.totpPendingSecret) return sendJson(res, 400, { error: 'กรุณาเริ่มตั้งค่าใหม่อีกครั้ง (กดสร้าง QR ใหม่)' });
  if (!totp.verifyTotp(req.user.totpPendingSecret, b.code)) {
    return sendJson(res, 400, { error: 'รหัสไม่ถูกต้อง ตรวจสอบว่านาฬิกาบนอุปกรณ์ของคุณตรงกับเวลาจริงหรือไม่' });
  }
  const u = await store.update('users', req.user.id, {
    totpSecret: req.user.totpPendingSecret, totpEnabled: true,
    totpPendingSecret: null, totpEnrolledAt: new Date().toISOString(),
  });
  await logAudit(req.user.id, null, 'totp-enable', 'เปิดใช้งานการยืนยันตัวตนด้วยแอป Authenticator (TOTP)', req.user.displayName);
  sendJson(res, 200, { user: publicUser(u) });
}));

api.post('/api/totp/disable', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!req.user.totpEnabled) return sendJson(res, 400, { error: 'ยังไม่ได้เปิดใช้งาน TOTP' });
  if (!totp.verifyTotp(req.user.totpSecret, b.code)) return sendJson(res, 400, { error: 'รหัสไม่ถูกต้อง' });
  const u = await store.update('users', req.user.id, { totpSecret: null, totpEnabled: false, totpPendingSecret: null });
  await logAudit(req.user.id, null, 'totp-disable', 'ปิดใช้งานการยืนยันตัวตนด้วยแอป Authenticator (TOTP)', req.user.displayName);
  sendJson(res, 200, { user: publicUser(u) });
}));

/* =========================================================
 * เอกสารยืนยันตัวตน (KYC) จัดเก็บแบบเข้ารหัส
 * ระบบไม่ขอสำเนาบัตรประชาชน เก็บเฉพาะเลข 13 หลักเท่านั้น
 * ========================================================= */
api.get('/api/kyc', requireAuth(async (req, res) => {
  const items = (await store.all('kyc_documents', (k) => k.userId === req.user.id))
    .map(({ storedName, ...rest }) => rest).reverse();
  const required = profile.requiredKyc(req.user).map((r) => ({
    ...r, ...profile.KYC_TYPES[r.type],
    uploaded: items.find((i) => i.docType === r.type) || null,
  }));
  sendJson(res, 200, {
    items, required,
    verifyStatus: req.user.verifyStatus || 'unverified',
    verifyNote: req.user.verifyNote || '',
    kycConsent: !!(req.user.consent && (req.user.consent.purposes || []).includes('kyc')),
  });
}));

api.post('/api/kyc', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!profile.KYC_TYPES[b.docType]) return sendJson(res, 400, { error: 'ประเภทเอกสารไม่ถูกต้อง' });
  if (!(req.user.consent && (req.user.consent.purposes || []).includes('kyc'))) {
    return sendJson(res, 403, { error: 'กรุณาให้ความยินยอมการจัดเก็บเอกสารยืนยันตัวตนก่อน (ตั้งค่าได้ที่หน้าโปรไฟล์ หัวข้อความเป็นส่วนตัว)' });
  }
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์' });
  if (!KYC_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PDF, PNG, JPG, WEBP เท่านั้น' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (!buf.length) return sendJson(res, 400, { error: 'ไฟล์เสียหายหรือว่างเปล่า' });
  if (buf.length > KYC_MAX) return sendJson(res, 413, { error: 'ไฟล์มีขนาดเกิน 5 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์จริง' });

  // อัปโหลดซ้ำประเภทเดิม = แทนที่ของเดิม
  const old = await store.findOne('kyc_documents', (k) => k.userId === req.user.id && k.docType === b.docType);
  if (old) { filestore.removeFile(store.UPLOAD_DIR, old.storedName); await store.remove('kyc_documents', old.id); }

  const storedName = filestore.writeEncrypted(store.UPLOAD_DIR, buf, KYC_MIME[b.mime]);
  const row = await store.insert('kyc_documents', {
    userId: req.user.id, docType: b.docType,
    filename: String(b.filename || '').slice(0, 160), mime: b.mime, size: buf.length,
    storedName, status: 'pending', note: '',
  });
  await logAudit(req.user.id, null, 'kyc-upload', `อัปโหลด${profile.KYC_TYPES[b.docType].label} (จัดเก็บแบบเข้ารหัส)`, req.user.displayName);
  const { storedName: _sn, ...meta } = row;
  sendJson(res, 201, meta);
}));

api.get('/api/kyc/:id/file', requireAuth(async (req, res) => {
  const row = await store.find('kyc_documents', req.params.id);
  const isOwner = row && row.userId === req.user.id;
  const isReviewer = req.user.role === 'admin';
  if (!row || (!isOwner && !isReviewer)) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  try {
    const buf = filestore.readEncrypted(store.UPLOAD_DIR, row.storedName);
    // PDPA: บันทึกทุกครั้งที่มีการเปิดดูเอกสารยืนยันตัวตน โดยเฉพาะเมื่อผู้ตรวจสอบเป็นผู้เปิด
    await logAudit(row.userId, null, 'kyc-view',
      `เปิดดู${profile.KYC_TYPES[row.docType] ? profile.KYC_TYPES[row.docType].label : row.docType}` +
      (isReviewer && !isOwner ? ' โดยผู้ตรวจสอบ' : ' โดยเจ้าของบัญชี'), req.user.displayName);
    res.writeHead(200, { 'Content-Type': row.mime, 'Cache-Control': 'no-store', 'Content-Length': buf.length });
    res.end(buf);
  } catch {
    sendJson(res, 500, { error: 'เปิดไฟล์ไม่สำเร็จ ไฟล์อาจเสียหายหรือคีย์เข้ารหัสไม่ตรงกัน' });
  }
}));

api.delete('/api/kyc/:id', requireAuth(async (req, res) => {
  const row = await store.find('kyc_documents', req.params.id);
  if (!row || row.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  filestore.removeFile(store.UPLOAD_DIR, row.storedName);
  await store.remove('kyc_documents', row.id);
  await logAudit(req.user.id, null, 'kyc-delete', 'ลบเอกสารยืนยันตัวตน', req.user.displayName);
  sendJson(res, 200, { ok: true });
}));

// ส่งเอกสารให้ผู้ดูแลระบบตรวจสอบ
api.post('/api/kyc/submit', requireAuth(async (req, res) => {
  const required = profile.requiredKyc(req.user).filter((r) => r.required);
  const owned = await store.all('kyc_documents', (k) => k.userId === req.user.id);
  const missing = required.filter((r) => !owned.some((o) => o.docType === r.type))
    .map((r) => profile.KYC_TYPES[r.type].label);
  if (missing.length) return sendJson(res, 400, { error: 'ยังขาดเอกสาร: ' + missing.join(', ') });
  const c = profile.completeness(req.user);
  if (!c.ok) return sendJson(res, 400, { error: 'ข้อมูลโปรไฟล์ยังไม่ครบ ขาด: ' + c.missing.join(', ') });

  const u = await store.update('users', req.user.id, { verifyStatus: 'pending', verifyNote: '', submittedAt: new Date().toISOString() });
  await logAudit(req.user.id, null, 'kyc-submit', 'ส่งเอกสารยืนยันตัวตนให้ผู้ดูแลระบบตรวจสอบ', req.user.displayName);
  for (const admin of await store.all('users', (x) => x.role === 'admin')) {
    await notify(admin.id, 'kyc', `มีคำขอยืนยันตัวตนใหม่จาก ${u.companyName || u.displayName}`, null);
  }
  sendJson(res, 200, { user: publicUser(u) });
}));

/* =========================================================
 * ผู้ดูแลระบบ ตรวจสอบและอนุมัติการยืนยันตัวตน
 * ========================================================= */
api.get('/api/admin/users', requireAdmin(async (req, res) => {
  const status = new URL(req.url, 'http://localhost').searchParams.get('status');
  let list = await store.all('users', (u) => u.role !== 'admin');
  if (status) list = list.filter((u) => (u.verifyStatus || 'unverified') === status);
  const items = (await Promise.all(list.map(async (u) => ({
    id: u.id, email: u.email, role: u.role, entityType: u.entityType,
    displayName: u.displayName, companyName: u.companyName,
    taxId: u.taxId, vatRegistered: !!u.vatRegistered,
    verifyStatus: u.verifyStatus || 'unverified', verifyNote: u.verifyNote || '',
    submittedAt: u.submittedAt || null, createdAt: u.createdAt,
    docCount: await store.count('kyc_documents', (k) => k.userId === u.id),
  })))).reverse();
  sendJson(res, 200, { items });
}));

api.get('/api/admin/users/:id', requireAdmin(async (req, res) => {
  const u = await store.find('users', req.params.id);
  if (!u || u.role === 'admin') return sendJson(res, 404, { error: 'ไม่พบผู้ใช้' });
  const docs = (await store.all('kyc_documents', (k) => k.userId === u.id)).map(({ storedName, ...r }) => r);
  sendJson(res, 200, {
    user: publicUser(u),
    profile: profileMeta(u),
    kycDocs: docs.map((d) => ({ ...d, label: (profile.KYC_TYPES[d.docType] || {}).label || d.docType })),
    addressText: profile.formatAddress(u.addr || {}),
    branchText: profile.branchLabel(u),
  });
}));

api.post('/api/admin/users/:id/verify', requireAdmin(async (req, res) => {
  const b = await readJsonBody(req);
  const u = await store.find('users', req.params.id);
  if (!u || u.role === 'admin') return sendJson(res, 404, { error: 'ไม่พบผู้ใช้' });
  // ข้อ: อนุมัติ/ไม่อนุมัติได้เฉพาะบัญชีที่ "ส่งเอกสารขอตรวจสอบแล้ว" (verifyStatus=pending) เท่านั้น
  // กันแอดมินกดอนุมัติบัญชีที่ยังไม่ได้ submit เอกสารเลย
  if (u.verifyStatus !== 'pending') {
    return sendJson(res, 400, { error: 'ผู้ใช้รายนี้ยังไม่ได้ส่งเอกสารขอตรวจสอบตัวตน จึงยังพิจารณาผลไม่ได้' });
  }
  const approve = !!b.approve;
  const note = String(b.note || '').slice(0, 500);
  if (!approve && !note) return sendJson(res, 400, { error: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ เพื่อให้ผู้ใช้แก้ไขได้ถูกต้อง' });
  const updated = await store.update('users', u.id, {
    verifyStatus: approve ? 'verified' : 'rejected',
    verifyNote: note,
    verifiedAt: approve ? new Date().toISOString() : null,
    verifiedBy: req.user.displayName,
  });
  // ข้อ: สถานะรายเอกสารใน kyc_documents ค้างเป็น pending ตลอด ไม่เคยอัปเดตตามผลตรวจของแอดมิน
  for (const doc of await store.all('kyc_documents', (k) => k.userId === u.id)) {
    await store.update('kyc_documents', doc.id, { status: approve ? 'approved' : 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: req.user.displayName });
  }
  await logAudit(u.id, null, approve ? 'kyc-approve' : 'kyc-reject',
    approve ? 'ผู้ดูแลระบบอนุมัติการยืนยันตัวตน' : `ผู้ดูแลระบบไม่อนุมัติ: ${note}`, req.user.displayName);
  await notify(u.id, 'kyc', approve
    ? 'การยืนยันตัวตนของคุณได้รับการอนุมัติแล้ว'
    : `การยืนยันตัวตนไม่ผ่าน: ${note}`, null);
  sendJson(res, 200, { user: publicUser(updated) });
}));

/* =========================================================
 * สิทธิของเจ้าของข้อมูลส่วนบุคคล (PDPA)
 * ========================================================= */

// แก้ไข/ถอนความยินยอมในข้อที่ไม่บังคับ
api.put('/api/pdpa/consent', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const check = pdpa.validateConsent(b.consent);
  if (!check.ok) return sendJson(res, 400, { error: check.error });
  const record = pdpa.makeConsentRecord(check.purposes);
  const u = await store.update('users', req.user.id, { consent: record });
  await store.insert('consents', {
    userId: req.user.id, version: record.version, purposes: record.purposes,
    action: 'update', at: record.at,
  });
  await logAudit(req.user.id, null, 'consent-update', 'ปรับปรุงความยินยอมการใช้ข้อมูลส่วนบุคคล', req.user.displayName);
  sendJson(res, 200, { user: publicUser(u) });
}));

// สิทธิขอสำเนาข้อมูล (มาตรา 30) ดาวน์โหลดเป็นไฟล์ JSON
api.get('/api/pdpa/my-data', requireAuth(async (req, res) => {
  const data = await pdpa.buildDataExport(store, req.user);
  const body = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
  await logAudit(req.user.id, null, 'data-export', 'ขอสำเนาข้อมูลส่วนบุคคลของตนเอง', req.user.displayName);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="taxflow-my-data-${req.user.id}.json"`,
    'Content-Length': body.length,
  });
  res.end(body);
}));

// สิทธิขอลบข้อมูล (มาตรา 33) ลบข้อมูลระบุตัวตน แต่คงเอกสารภาษีตามที่กฎหมายภาษีบังคับให้เก็บ
api.post('/api/pdpa/delete-account', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!auth.verifyPassword(b.password || '', req.user.passwordHash)) {
    return sendJson(res, 401, { error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  if (String(b.confirm || '').trim() !== 'ลบบัญชีของฉัน') {
    return sendJson(res, 400, { error: 'กรุณาพิมพ์ข้อความยืนยัน "ลบบัญชีของฉัน" ให้ถูกต้อง' });
  }
  const uid = req.user.id;
  const oldEmail = req.user.email;
  const oldName = req.user.displayName;
  const ANON_LABEL = 'ผู้ใช้ที่ลบบัญชีแล้ว';

  // ข้อ: การลบบัญชีแก้หลายตารางพร้อมกัน ถ้าล้มเหลวกลางทางไม่ควรเหลือข้อมูลค้างครึ่งๆ กลางๆ ครอบด้วย transaction
  await store.transaction(async () => {
  // ลบไฟล์ทั้งหมดที่เป็นข้อมูลส่วนบุคคล
  for (const k of await store.all('kyc_documents', (x) => x.userId === uid)) {
    filestore.removeFile(store.UPLOAD_DIR, k.storedName);
    await store.remove('kyc_documents', k.id);
  }
  // ข้อ PDPA: การลบบัญชีเดิมตกหล่นคลังเอกสาร (library) และไฟล์แนบเอกสาร (attachments) ต้องลบทั้งไฟล์และแถวด้วย
  for (const l of await store.all('library', (x) => x.userId === uid)) {
    filestore.removeFile(store.UPLOAD_DIR, l.storedName);
    await store.remove('library', l.id);
  }
  for (const t of ['calendar_events', 'calendar_overrides']) {
    for (const c of await store.all(t, (x) => x.userId === uid)) {
      (c.attachments || []).forEach((f) => filestore.removeFile(store.UPLOAD_DIR, f.storedName));
      await store.remove(t, c.id);
    }
  }
  for (const a of await store.all('attachments', (x) => x.userId === uid)) {
    try { fs.unlinkSync(path.join(store.UPLOAD_DIR, a.storedName)); } catch {}
    await store.remove('attachments', a.id);
  }
  for (const f of ['logoFile', 'sealFile']) {
    if (req.user[f] && req.user[f].storedName) filestore.removeFile(store.UPLOAD_DIR, req.user[f].storedName);
  }
  for (const t of ['contacts', 'signatures', 'notifications', 'otp_codes']) {
    for (const row of await store.all(t, (x) => x.userId === uid)) await store.remove(t, row.id);
  }

  // ข้อ PDPA: doc_versions เป็น snapshot ของเอกสารภาษีที่ต้องเก็บไว้ตามกฎหมาย (5 ปี) จึงไม่ลบ
  // แต่ชื่อผู้แก้ไข (editor) ที่ฝังไว้ตรงๆ ต้องล้างไม่ให้ระบุตัวตนเจ้าของบัญชีที่ลบไปแล้ว
  const ownDocIds = new Set((await store.all('documents', (x) => x.userId === uid)).map((d) => d.id));
  for (const v of await store.all('doc_versions', (x) => ownDocIds.has(x.docId) && x.editor === oldName)) {
    await store.update('doc_versions', v.id, { editor: ANON_LABEL });
  }
  // audit_log ก็เก็บไว้เป็นร่องรอยตรวจสอบตามกฎหมาย แต่ต้องล้างชื่อ/อีเมลที่ระบุตัวตนออก
  // (เช่น ข้อความ "ส่งรหัส OTP ไปที่ xxx@example.com" ที่ฝังอีเมลไว้ตรงๆ ในข้อความ)
  for (const a of await store.all('audit_log')) {
    const isOwn = a.userId === uid && a.actor === oldName;
    const mentionsEmail = oldEmail && a.detail && a.detail.includes(oldEmail);
    if (!isOwn && !mentionsEmail) continue;
    await store.update('audit_log', a.id, {
      actor: isOwn ? ANON_LABEL : a.actor,
      detail: mentionsEmail ? a.detail.split(oldEmail).join('[อีเมลบัญชีที่ถูกลบ]') : a.detail,
    });
  }

  // ทำให้บัญชีไม่ระบุตัวตน แทนการลบทิ้งทั้งหมด เพราะเอกสารภาษีต้องเก็บ 5 ปี
  const anon = {
    ...profile.defaults(req.user.role),
    email: `deleted-${uid}@removed.local`,
    passwordHash: auth.hashPassword(crypto.randomBytes(24).toString('hex')),
    displayName: ANON_LABEL, companyName: '', taxId: '',
    deleted: true, deletedAt: new Date().toISOString(),
    tokenVersion: (req.user.tokenVersion || 0) + 1, // เพิกถอน session ที่ยังค้างอยู่ทุกอุปกรณ์ทันที
    consent: null, emailVerified: false, verifyStatus: 'unverified',
  };
  await store.update('users', uid, anon);
  await logAudit(uid, null, 'account-delete', 'ผู้ใช้ใช้สิทธิขอลบข้อมูลส่วนบุคคล ลบข้อมูลระบุตัวตนแล้ว คงเหลือเฉพาะเอกสารภาษีที่กฎหมายบังคับให้เก็บ', 'ระบบ');
  }); // จบ store.transaction
  auth.clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}));

/* =========================================================
 * OTP สำหรับขั้นตอนการลงลายมือชื่อดิจิทัล (ข้อกำหนด: ต้องยืนยันด้วย OTP ก่อนลงนามทุกครั้ง)
 * ========================================================= */
const OTP_SIGN_PURPOSES = {
  // ลงนามเอกสารของตัวเอง ต้องเป็นเจ้าของเอกสาร
  'sign-doc': async (req, refId) => {
    const doc = await store.find('documents', refId);
    return (doc && doc.userId === req.user.id) ? doc : null;
  },
  // ลงนามตอบกลับคำขอจากคู่ค้า ต้องเป็นผู้รับคำขอ และคำขอต้องยังรอตอบอยู่
  'sign-request': async (req, refId) => {
    const r = await store.find('requests', refId);
    return (r && r.toUserId === req.user.id && r.status === 'sent') ? r : null;
  },
  // เปลี่ยนเลขบัญชีธนาคารรับเงิน ไม่มี refId เพราะยืนยันตัวผู้ใช้เองเท่านั้น
  'change-bank': (req) => req.user,
};

api.post('/api/otp/request', requireAuth(async (req, res) => {
  // ข้อ: ไม่มี rate limit ที่ /api/otp/request ป้องกันการยิงส่งอีเมล OTP ถล่มผู้ใช้คนเดียวซ้ำๆ
  if (rateLimited(res, `otp-req:${req.user.id}`, 8, 10 * 60 * 1000, 'ขอรหัส OTP ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')) return;
  const b = await readJsonBody(req);
  const checker = OTP_SIGN_PURPOSES[b.purpose];
  if (!checker) return sendJson(res, 400, { error: 'ประเภทการยืนยันไม่ถูกต้อง' });
  const target = await checker(req, b.refId);
  if (!target) return sendJson(res, 404, { error: 'ไม่พบรายการที่ต้องการยืนยัน หรือคุณไม่มีสิทธิ์ทำรายการนี้' });
  const { id: otpId, code } = await otp.createOtp(req.user.id, b.purpose, b.refId);
  const mailResult = await mailer.sendOtpEmail(req.user.email, { code, purpose: b.purpose, displayName: req.user.displayName });
  if (mailResult.ok === false) return sendJson(res, 502, { error: MAIL_SEND_ERROR });
  sendJson(res, 200, { otpId, emailMasked: maskEmail(req.user.email), ...(mailResult.dev ? { devCode: code } : {}) });
}));

api.post('/api/otp/resend', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const row = await store.find('otp_codes', b.otpId);
  if (!row || row.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบรายการ OTP นี้' });
  const r = await otp.regenerate(b.otpId);
  if (!r) return sendJson(res, 400, { error: 'ไม่สามารถขอรหัสใหม่ได้ กรุณาเริ่มรายการใหม่' });
  if (r.exhausted) return sendJson(res, 429, { error: 'ขอรหัสใหม่ครบจำนวนครั้งที่กำหนดแล้ว กรุณาเริ่มรายการใหม่' });
  if (r.throttled) return sendJson(res, 429, { error: `กรุณารออีก ${r.waitSec} วินาทีก่อนขอรหัสใหม่` });
  const mailResult = await mailer.sendOtpEmail(req.user.email, { code: r.code, purpose: row.purpose, displayName: req.user.displayName });
  if (mailResult.ok === false) return sendJson(res, 502, { error: MAIL_SEND_ERROR });
  sendJson(res, 200, { otpId: b.otpId, ...(mailResult.dev ? { devCode: r.code } : {}) });
}));

/* =========================================================
 * TAX CALC
 * ========================================================= */
api.post('/api/wht/calc', async (req, res) => { const { amount, rate } = await readJsonBody(req); sendJson(res, 200, tax.calcWithholding(amount, rate)); });
api.post('/api/vat/calc', async (req, res) => { const { amount, rate } = await readJsonBody(req); sendJson(res, 200, tax.calcVat(amount, rate)); });
api.post('/api/pit/estimate', async (req, res) => { const b = await readJsonBody(req); sendJson(res, 200, tax.estimatePersonalIncomeTax(b.grossIncome, b)); });

/* =========================================================
 * CONTACTS
 * ========================================================= */
// สมุดคู่ค้า (ver16): เก็บข้อมูลกลางของ Brand / Agency / Influencer ครบชุด เพื่อดึงไปใช้ในเอกสารโดยไม่ต้องกรอกซ้ำ
function contactRecord(b) {
  const t = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
  const errors = [];
  // Data Validation ด้วยกติกาชุดเดียวกับหน้าเว็บ (ค่าว่าง/รูปแบบ/ความยาว)
  const CHECK = [
    ['name', { ...DS.PARTY_FIELDS.name, label: 'ชื่อคู่ค้า' }, true], ['taxId', DS.PARTY_FIELDS.taxId], ['email', DS.PARTY_FIELDS.email],
    ['phone', DS.PARTY_FIELDS.phone], ['bankAccountNo', DS.PARTY_FIELDS.bankAccountNo], ['branch', DS.PARTY_FIELDS.branch],
    ['address', { ...DS.PARTY_FIELDS.address, minLen: 0 }], ['socials', { label: 'ช่องทาง Social Media', type: 'textarea', maxLen: 500 }],
    ['note', { label: 'หมายเหตุ', type: 'text', maxLen: 500 }],
  ];
  for (const [k, def, need] of CHECK) { const m = DS.checkField(def, b[k], { need: !!need }); if (m) errors.push(m); }
  const name = t(b.name, 200);
  const taxId = thaiid.digitsOnly(b.taxId);
  const kind = DS.CONTACT_KINDS.some((k) => k.value === b.kind) ? b.kind : DS.normKind(b.kind);
  const record = {
    name, taxId, kind: DS.CONTACT_KINDS.some((k) => k.value === kind) ? kind : 'other',
    entityType: b.entityType === 'individual' ? 'individual' : b.entityType === 'juristic' ? 'juristic' : (/^0/.test(taxId) ? 'juristic' : 'individual'),
    tradeName: t(b.tradeName, 200), channelName: t(b.channelName, 200), branch: t(b.branch, 60),
    contactPerson: t(b.contactPerson, 150), email: t(b.email, 150), phone: t(b.phone, 40),
    address: t(b.address, 500), authName: t(b.authName, 150), authPosition: t(b.authPosition, 100),
    bankName: t(b.bankName, 100), bankAccountNo: t(b.bankAccountNo, 30).replace(/[^\d-]/g, ''), bankAccountName: t(b.bankAccountName, 150),
    bank: t(b.bank, 200), socials: t(b.socials, 500), note: t(b.note, 500),
  };
  return { errors, record };
}
api.get('/api/contacts', requireAuth(async (req, res) => sendJson(res, 200, { items: (await store.all('contacts', (c) => c.userId === req.user.id)).reverse() })));
api.post('/api/contacts', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const { errors, record } = contactRecord(b);
  if (errors.length) return sendJson(res, 400, { error: errors.join(' · '), errors });
  const dup = await duplicateContact(req.user.id, record);
  if (dup) return sendJson(res, 409, { error: dup, errors: [dup], field: 'taxId' });
  sendJson(res, 201, await store.insert('contacts', { userId: req.user.id, ...record }));
}));
// ตรวจข้อมูลซ้ำในสมุดคู่ค้า: เลขประจำตัวผู้เสียภาษีต้องไม่ซ้ำ (ถ้าไม่มีเลข ห้ามชื่อ+ประเภทซ้ำ)
async function duplicateContact(userId, rec, selfId = null) {
  const list = await store.all('contacts', (c) => c.userId === userId && c.id !== Number(selfId));
  if (rec.taxId) {
    const hit = list.find((c) => c.taxId === rec.taxId && (c.branch || '') === (rec.branch || ''));
    if (hit) return `เลขประจำตัวผู้เสียภาษี ${rec.taxId}${rec.branch ? ' (' + rec.branch + ')' : ''} มีอยู่ในสมุดคู่ค้าแล้ว (${hit.name}) แก้ไขรายการเดิมแทนการเพิ่มใหม่`;
  } else {
    const hit = list.find((c) => !c.taxId && c.name.trim().toLowerCase() === rec.name.trim().toLowerCase() && DS.normKind(c.kind) === rec.kind);
    if (hit) return `คู่ค้าชื่อ "${rec.name}" มีอยู่ในสมุดแล้ว`;
  }
  return null;
}
api.get('/api/contacts/check-duplicate', requireAuth(async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams;
  const msg = await duplicateContact(req.user.id, { taxId: thaiid.digitsOnly(p.get('taxId')), branch: p.get('branch') || '', name: p.get('name') || '', kind: p.get('kind') || 'other' }, p.get('selfId'));
  sendJson(res, 200, { duplicate: !!msg, message: msg || '' });
}));
api.put('/api/contacts/:id', requireAuth(async (req, res) => {
  const c = await store.find('contacts', req.params.id);
  if (!c || c.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคู่ค้า' });
  const { errors, record } = contactRecord(await readJsonBody(req));
  if (errors.length) return sendJson(res, 400, { error: errors.join(' · '), errors });
  const dup = await duplicateContact(req.user.id, record, c.id);
  if (dup) return sendJson(res, 409, { error: dup, errors: [dup], field: 'taxId' });
  sendJson(res, 200, await store.update('contacts', c.id, record));
}));
api.delete('/api/contacts/:id', requireAuth(async (req, res) => {
  const c = await store.find('contacts', req.params.id);
  if (!c || c.userId !== req.user.id) return sendJson(res, 404, { error: 'not found' });
  await store.remove('contacts', req.params.id); sendJson(res, 200, { deleted: true });
}));

/* ---------- คู่ค้า: นำเข้า/ส่งออก CSV (ลดงานคีย์ข้อมูลซ้ำสำหรับเอเจนซี่ที่มีคู่ค้าเป็นร้อยราย) ---------- */
api.get('/api/contacts/export.csv', requireAuth(async (req, res) => {
  const contacts = (await store.all('contacts', (c) => c.userId === req.user.id)).reverse();
  const csv = exporter.toContactsCSV(contacts);
  await logAudit(req.user.id, null, 'export', 'ส่งออกคู่ค้าเป็น CSV', req.user.displayName);
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="taxflow-contacts.csv"' });
  res.end(csv);
}));

const CONTACT_IMPORT_MAX = 500; // กันไฟล์ใหญ่ผิดปกติทำให้ช้า/ฐานข้อมูลบวมโดยไม่ตั้งใจ
api.post('/api/contacts/import', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const text = String(b.csv || '');
  if (!text.trim()) return sendJson(res, 400, { error: 'ไม่พบเนื้อหาไฟล์ CSV' });
  const rows = exporter.parseContactsCSV(text);
  if (!rows.length) return sendJson(res, 400, { error: 'ไม่พบรายการคู่ค้าในไฟล์ (ต้องมีอย่างน้อยคอลัมน์ชื่อ)' });
  if (rows.length > CONTACT_IMPORT_MAX) return sendJson(res, 400, { error: `นำเข้าได้ครั้งละไม่เกิน ${CONTACT_IMPORT_MAX} รายการ` });

  const existing = await store.all('contacts', (c) => c.userId === req.user.id);
  let created = 0, updated = 0, skipped = 0;
  for (let row of rows) {
    if (row.taxId && taxIdError(row.taxId, row.name)) { skipped++; continue; } // เลขผู้เสียภาษีผิด check digit ข้ามแถวนี้ ไม่บล็อกทั้งไฟล์
    // จับคู่รายการเดิมด้วยเลขผู้เสียภาษีก่อน แล้วค่อย fallback เป็นชื่อ+ประเภทตรงกันเป๊ะ กันสร้างซ้ำตอนนำเข้าไฟล์เดิมซ้ำ
    row = contactRecord(row).record;
    const match = (row.taxId && existing.find((c) => c.taxId && c.taxId === row.taxId))
      || existing.find((c) => !row.taxId && c.name === row.name && c.kind === row.kind);
    if (match) {
      await store.update('contacts', match.id, { ...row });
      Object.assign(match, row);
      updated++;
    } else {
      existing.push(await store.insert('contacts', { userId: req.user.id, ...row }));
      created++;
    }
  }
  await logAudit(req.user.id, null, 'contacts-import', `นำเข้าคู่ค้าจาก CSV: เพิ่ม ${created}, อัปเดต ${updated}, ข้าม ${skipped} (จากทั้งหมด ${rows.length})`, req.user.displayName);
  sendJson(res, 200, { created, updated, skipped, total: rows.length });
}));

/* =========================================================
 * ค้นหารวมศูนย์ (global search) ข้ามเอกสาร / คู่ค้า / คลังเอกสาร ในบัญชีเดียวกัน
 * ใช้ scan ข้อมูลของผู้ใช้เองด้วย JS เหมือน endpoint อื่นๆ ในระบบ (เหมาะกับขนาดข้อมูลต่อบัญชีปัจจุบัน)
 * ========================================================= */
api.get('/api/search', requireAuth(async (req, res) => {
  const q = (new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return sendJson(res, 200, { query: q, documents: [], contacts: [], library: [] });

  const documents = (await store.all('documents', (d) => d.userId === req.user.id &&
    ((d.docNo || '').toLowerCase().includes(q) || JSON.stringify(d).toLowerCase().includes(q))
  )).reverse().slice(0, 20).map((d) => ({
    id: d.id, docNo: d.docNo || 'แบบร่าง', type: d.type, status: d.status,
    counterparty: d.party || d.buyer || d.payee || d.payer || '',
  }));

  const contacts = (await store.all('contacts', (c) => c.userId === req.user.id &&
    `${c.name || ''}${c.taxId || ''}${c.email || ''}${c.phone || ''}`.toLowerCase().includes(q)
  )).reverse().slice(0, 20).map((c) => ({ id: c.id, name: c.name, kind: c.kind, taxId: c.taxId }));

  const library = (await store.all('library', (l) => l.userId === req.user.id &&
    `${l.title || ''}${l.filename || ''}${l.note || ''}`.toLowerCase().includes(q)
  )).reverse().slice(0, 20).map((l) => ({ id: l.id, title: l.title, category: l.category, year: l.year }));

  sendJson(res, 200, { query: q, documents, contacts, library });
}));

/* =========================================================
 * DOCUMENTS create
 * ========================================================= */
async function createDoc(user, type, fields, extra) {
  // ข้อ: ออกเลขที่เอกสารตั้งแต่ตอน "แบบร่าง" ทำให้การลบ draft ทิ้งช่องว่างในลำดับเลข (ผิดหลักการออกเลขต่อเนื่อง)
  // จึงเลื่อนการออกเลขไปตอนที่เอกสารออกจากสถานะแบบร่างจริงๆ (ดู ensureIssued ด้านล่าง) docNo เป็น null จนกว่าจะถึงตอนนั้น
  const doc = await store.insert('documents', {
    userId: user.id, type, docNo: null,
    status: 'draft', signed: false, signature: null,
    issueDate: bangkokDateStr(),
    ...fields,
  });
  await snapshotVersion(doc, user.displayName, 'สร้างเอกสาร (แบบร่าง ยังไม่ออกเลขที่)');
  await logAudit(user.id, doc.id, 'create', `สร้างแบบร่างเอกสารประเภท ${type}`, user.displayName);
  return doc;
}

// ออกเลขที่เอกสารจริงตอนที่เอกสารออกจากสถานะ "แบบร่าง" เป็นครั้งแรก (ตอนส่ง/อนุมัติ)
// ไม่ออกเลขให้เอกสารที่ยกเลิกตั้งแต่ยังเป็นแบบร่าง เพื่อไม่ให้เสียเลขที่ไปฟรีๆ
async function ensureIssued(doc, actorName) {
  if (doc.docNo) return doc;
  const updated = await store.update('documents', doc.id, { docNo: await makeDocNo(doc.type, doc.userId), issueDate: bangkokDateStr() });
  await logAudit(doc.userId, doc.id, 'issue', `ออกเลขที่เอกสาร ${updated.docNo}`, actorName || '');
  return updated;
}

// ver16: ตัด e-Tax Invoice และหน้าออก e-Withholding แบบเดิมออก หนังสือรับรอง 50 ทวิ ออกผ่าน /api/docs/create (type=EWHT)
api.post('/api/etax/invoice', (req, res) => sendJson(res, 410, { error: 'ระบบไม่รองรับการออก e-Tax Invoice แล้ว ใช้ใบแจ้งหนี้/ใบเสร็จรับเงินในเมนู "สร้างเอกสาร" แทน' }));
api.post('/api/ewht/certificate', (req, res) => sendJson(res, 410, { error: 'ย้ายไปออกหนังสือรับรอง 50 ทวิ ผ่านเมนู "สร้างเอกสาร" แล้ว' }));
api.post('/api/wht/store', requireAuth(async (req, res) => {
  const gate = profile.canIssue(req.user, 'WHT');
  if (!gate.ok) return sendJson(res, 403, { error: gate.error, missing: gate.missing });
  const b = await readJsonBody(req);
  const v = validateDocument('WHT', b);
  if (!v.ok) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบถ้วน', errors: v.errors });
  const calc = tax.calcWithholding(b.amount, validWhtRate(b.rate)); // ข้อ 8: จำกัดอัตราเฉพาะชุดที่กฎหมายกำหนด
  const doc = await createDoc(req.user, 'WHT', { docPurpose: 'record',
    payer: b.payer || '', description: b.description || 'ค่าจ้างผลิตเนื้อหา', incomeType: b.incomeType || 'มาตรา 40(2)', ...calc,
  });
  sendJson(res, 201, doc);
}));

/* =========================================================
 * ใบลดหนี้ / ใบเพิ่มหนี้ (ตามประมวลรัษฎากร มาตรา 86/9 และ 86/10)
 * ใช้แก้ไขใบกำกับภาษี (ETAX) ที่ออกไปแล้วอย่างถูกต้องตามกฎหมาย แทนการยกเลิกเอกสารทั้งฉบับ
 * ========================================================= */
const CREDIT_NOTE_REASONS = ['ลดราคาสินค้า/บริการ', 'สินค้าชำรุด/บกพร่อง', 'รับคืนสินค้า', 'คำนวณราคาผิดพลาดสูงไป', 'ยกเลิกสัญญาบางส่วน', 'อื่น ๆ'];
const DEBIT_NOTE_REASONS = ['คำนวณราคาผิดพลาดต่ำไป', 'เรียกเก็บเพิ่มเติมตามสัญญา', 'อื่น ๆ'];

function createAdjustmentNote(type, legalRef, reasons) {
  return requireAuth(async (req, res) => {
    const gate = profile.canIssue(req.user, 'ETAX');
    if (!gate.ok) return sendJson(res, 403, { error: gate.error, missing: gate.missing });
    const b = await readJsonBody(req);
    const src = await store.find('documents', b.refDocId);
    if (!src || src.userId !== req.user.id || src.type !== 'ETAX') {
      return sendJson(res, 404, { error: 'ไม่พบใบกำกับภาษีต้นฉบับ หรือไม่ใช่เอกสารของคุณ' });
    }
    // มาตรา 86/9, 86/10 ใช้แก้ไข "ใบกำกับภาษีที่ออกไปแล้ว" เท่านั้น ไม่ใช่แบบร่าง/เอกสารที่ยกเลิกไปแล้ว
    if (!src.docNo || src.status === 'cancelled') {
      return sendJson(res, 400, { error: 'ออกใบลดหนี้/เพิ่มหนี้ได้เฉพาะใบกำกับภาษีที่ออกเลขที่แล้วและยังไม่ถูกยกเลิกเท่านั้น' });
    }
    const errors = [];
    if (!reasons.includes(b.reason)) errors.push('กรุณาเลือกเหตุผลที่ถูกต้องตามกฎหมาย');
    const adjustBase = round2(Number(b.amount) || 0);
    if (!(adjustBase > 0)) errors.push('กรุณาระบุยอดเงินส่วนต่างให้ถูกต้อง');
    if (errors.length) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบถ้วน', errors });
    // ใช้อัตรา VAT เดียวกับใบกำกับภาษีต้นฉบับเสมอ ไม่รับอัตราจากผู้ใช้ตรงๆ (ตามหลักข้อ 8)
    const vat = tax.calcVat(adjustBase, src.vatRate);
    const doc = await createDoc(req.user, type, {
      docPurpose: ['self', 'send', 'record'].includes(b.docPurpose) ? b.docPurpose : 'self',
      refDocId: src.id, refDocNo: src.docNo,
      buyer: src.buyer || '', buyerTaxId: src.buyerTaxId || '',
      reason: b.reason, note: b.note || '',
      base: vat.base, vatRate: vat.rate, vat: vat.vat, total: vat.total,
      legalRef, signatureStandard: 'PAdES (จำลอง)',
    });
    await logAudit(req.user.id, doc.id, 'create', `ออก${type === 'CREDIT_NOTE' ? 'ใบลดหนี้' : 'ใบเพิ่มหนี้'}อ้างอิง ${src.docNo} (${b.reason})`, req.user.displayName);
    sendJson(res, 201, doc);
  });
}

api.get('/api/etax/adjustment-reasons', (req, res) => sendJson(res, 200, { creditNote: CREDIT_NOTE_REASONS, debitNote: DEBIT_NOTE_REASONS }));
api.post('/api/etax/credit-note', createAdjustmentNote('CREDIT_NOTE', 'ประมวลรัษฎากร มาตรา 86/9', CREDIT_NOTE_REASONS));
api.post('/api/etax/debit-note', createAdjustmentNote('DEBIT_NOTE', 'ประมวลรัษฎากร มาตรา 86/10', DEBIT_NOTE_REASONS));

/* =========================================================
 * สร้างเอกสาร (ver16) ทุกประเภทใช้นิยามฟิลด์ใน public/js/docschema.js
 * ใบเสนอราคา / PO / ใบแจ้งหนี้ / ใบเสร็จ / ใบส่งมอบงาน / ใบสำคัญจ่าย / สัญญากับ Brand /
 * สัญญาจ้าง Influencer / หนังสือมอบอำนาจ / 50 ทวิ / จัดทำข้อมูล ภ.ง.ด.3 / ภ.ง.ด.53
 * ========================================================= */
const BIZ_TYPES = ['RECEIPT', 'INVOICE', 'QUOTATION', 'PO', 'DELIVERY', 'PAYMENT'];
const CONTRACT_TYPES = ['CONTRACT_INF', 'CONTRACT_BRAND'];

// หาเอกสารของผู้ใช้จากเลขที่เอกสาร (ใช้ผูกช่อง "อ้างอิง")
function refResolver(user) {
  return async (types, docNo) => {
    const no = String(docNo || '').trim();
    if (!no) return null;
    return (await store.all('documents', (d) => d.userId === user.id && types.includes(d.type) && d.docNo === no
      && !['cancelled'].includes(d.status)))[0] || null;
  };
}
// บริบทสำหรับตรวจข้อมูล: วันที่ปัจจุบันตามเวลาไทย + ค้นเอกสารของผู้ใช้เพื่อตรวจข้อมูลซ้ำ/อ้างอิง
function buildCtx(user, selfId = null) {
  return {
    today: bangkokDateStr(), selfId,
    resolveRef: refResolver(user),
    findDocs: (fn) => store.all('documents', (d) => d.userId === user.id && fn(d)),
  };
}
const purposeOf = (b) => (['self', 'send', 'record'].includes(b.docPurpose) ? b.docPurpose : 'self');

api.post('/api/docs/create', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const type = b.type;
  if (!DS.FORMS[type]) return sendJson(res, 400, { error: 'ประเภทเอกสารไม่ถูกต้อง หรือไม่รองรับแล้ว' });
  const gate = profile.canIssue(req.user, type);
  if (!gate.ok) return sendJson(res, 403, { error: gate.error, missing: gate.missing });
  const pndErr = await lockPndRows(req.user, type, b);
  if (pndErr.length) return sendJson(res, 400, { error: 'ข้อมูลไม่ถูกต้อง', errors: pndErr });
  const built = await docbuild.build(req.user, type, b, buildCtx(req.user));
  if (built.errors.length) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง', errors: built.errors });
  const doc = await createDoc(req.user, type, {
    docPurpose: purposeOf(b), issuerRole: req.user.role, ...built.record,
  });
  sendJson(res, 201, doc);
}));

/* ---------- จัดทำข้อมูล ภ.ง.ด.3 / ภ.ง.ด.53: ดึงรายการจากใบสำคัญจ่าย + หนังสือรับรอง 50 ทวิ ---------- */
// เอกสารที่นับ: ออกเลขที่แล้ว (ไม่ใช่แบบร่าง) และไม่ถูกยกเลิก/ตีกลับ
const isIssuedEffective = (d) => !!d.docNo && !['cancelled', 'rejected'].includes(d.status);
async function pndCandidates(user, form, month, yearBE) {
  const yCE = Number(yearBE) - 543;
  const inMonth = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') && Number(iso.slice(0, 4)) === yCE && Number(iso.slice(5, 7)) === Number(month);
  const mine = await store.all('documents', (d) => d.userId === user.id && ['EWHT', 'PAYMENT'].includes(d.type) && d.schemaVersion === 2);
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
api.get('/api/pnd/candidates', requireAuth(async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams;
  const form = p.get('form');
  if (!['PND3', 'PND53'].includes(form)) return sendJson(res, 400, { error: 'แบบไม่ถูกต้อง' });
  const month = Number(p.get('month')), yearBE = Number(p.get('yearBE'));
  if (!(month >= 1 && month <= 12) || !(yearBE > 2500)) return sendJson(res, 400, { error: 'กรุณาเลือกเดือนและปีภาษี (พ.ศ.)' });
  sendJson(res, 200, await pndCandidates(req.user, form, month, yearBE));
}));

/* =========================================================
 * คัดลอกเอกสาร (Duplicate ver10)
 * ========================================================= */
api.post('/api/documents/:id/duplicate', requireAuth(async (req, res) => {
  const src = await ownDoc(req);
  if (!src) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  // ข้อ 7: คัดลอกเอกสารก็ต้องผ่านเงื่อนไขการออกเอกสารเหมือนสร้างใหม่ (เดิมข้ามเงื่อนไขนี้ไปทั้งหมด)
  const gate = profile.canIssue(req.user, src.type);
  if (!gate.ok) return sendJson(res, 403, { error: gate.error, missing: gate.missing });
  const { id, docNo, status, signed, signature, counterpartySignature, pdfKey, xmlKey, createdAt, updatedAt, ...rest } = src;
  const copy = await createDoc(req.user, src.type, { ...rest, signed: false, signature: null, counterpartySignature: null });
  await logAudit(req.user.id, copy.id, 'duplicate', `คัดลอกจาก ${src.docNo}`, req.user.displayName);
  sendJson(res, 201, copy);
}));

/* =========================================================
 * ระบบส่งเอกสารข้ามบัญชี (ver6): ขอลายเซ็น/ขอตรวจสอบ พร้อมกำหนดเวลา
 * บริษัท↔อินฟลู · บริษัท↔เอเจนซี่ · เอเจนซี่เป็นตัวกลางส่งทั้งสองฝ่าย
 * ========================================================= */
const todayStr = () => new Date().toISOString().slice(0, 10);
const reqPublic = async (r) => {
  const doc = await store.find('documents', r.docId);
  const from = await store.find('users', r.fromUserId);
  const to = await store.find('users', r.toUserId);
  return {
    id: r.id, docId: r.docId, purpose: r.purpose, message: r.message, dueDate: r.dueDate,
    signAs: r.signAs || '', status: r.status, sentAt: r.createdAt, respondedAt: r.respondedAt || null,
    declineReason: r.declineReason || '',
    overdue: r.status === 'sent' && r.dueDate && r.dueDate < todayStr(),
    doc: doc ? { docNo: doc.docNo, type: doc.type, base: doc.base, total: doc.total ?? doc.net, party: doc.party || doc.buyer || doc.payee || doc.payer || '', status: doc.status, counterpartySigned: !!doc.counterpartySignature } : null,
    fromName: from ? (from.companyName || from.displayName) : '', fromEmail: from ? from.email : '',
    toName: to ? (to.companyName || to.displayName) : '', toEmail: to ? to.email : '',
  };
};

// ส่งเอกสารให้บัญชีอื่น (ระบุอีเมลผู้ใช้ในระบบ)
api.post('/api/documents/:id/request', requireAuth(async (req, res) => {
  let doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const b = await readJsonBody(req);
  const email = String(b.toEmail || '').trim().toLowerCase();
  if (!email) return sendJson(res, 400, { error: 'กรุณาระบุอีเมลผู้รับ' });
  const target = await store.whereOne('users', { email });
  if (!target) return sendJson(res, 404, { error: 'ไม่พบบัญชีผู้ใช้อีเมลนี้ในระบบ คู่ค้าต้องสมัคร TaxFlow ด้วยอีเมลดังกล่าวก่อน' });
  if (target.id === req.user.id) return sendJson(res, 400, { error: 'ไม่สามารถส่งเอกสารหาตัวเองได้' });
  // ข้อ 4: ผู้ออกเอกสารต้องลงนามฝั่งตนเองก่อน จึงส่งขอลายเซ็นจากคู่ค้าได้
  if ((b.purpose || 'sign') !== 'review' && !doc.signature) {
    return sendJson(res, 400, { error: 'ผู้ออกเอกสารต้องลงนามก่อนส่งขอลายเซ็นจากคู่ค้า ลงนามได้ที่แท็บ "ลายเซ็น" หรือปุ่มลงนามในหน้านี้' });
  }
  // ยกเลิกคำขอเดิมที่ยังค้างของเอกสารนี้
  for (const r of await store.all('requests', (r) => r.docId === doc.id && r.status === 'sent')) await store.update('requests', r.id, { status: 'cancelled' });
  const purpose = b.purpose === 'review' ? 'review' : 'sign';
  const row = await store.insert('requests', {
    docId: doc.id, fromUserId: req.user.id, toUserId: target.id, toEmail: email,
    purpose, message: b.message || '', dueDate: b.dueDate || '', signAs: b.signAs || '', status: 'sent',
  });
  if (doc.status === 'draft') {
    doc = await ensureIssued(doc, req.user.displayName); // ข้อ: ออกเลขที่จริงตอนส่งเอกสารออกจากแบบร่าง
    const updated = await store.update('documents', doc.id, { status: 'pending' });
    await snapshotVersion(updated, req.user.displayName, 'ส่งเอกสารให้คู่ค้า');
    doc = updated;
  }
  await logAudit(req.user.id, doc.id, 'send', `ส่ง ${doc.docNo} ถึง ${email} (${purpose === 'sign' ? 'ขอลายเซ็น' : 'ขอตรวจสอบ'}${b.dueDate ? ' ภายใน ' + b.dueDate : ''})`, req.user.displayName);
  const senderName = req.user.companyName || req.user.displayName;
  await notify(target.id, 'request', `${senderName} ส่งเอกสาร ${doc.docNo} ให้คุณ${purpose === 'sign' ? 'ลงนาม' : 'ตรวจสอบ'}${b.dueDate ? ' ภายในวันที่ ' + b.dueDate : ''}`, null, { reqId: row.id });
  sendJson(res, 201, await reqPublic(row));
}));

// กล่องรับเอกสาร (คำขอที่ส่งมาถึงฉัน)
api.get('/api/requests/inbox', requireAuth(async (req, res) => {
  const items = await Promise.all((await store.all('requests', (r) => r.toUserId === req.user.id)).reverse().map(reqPublic));
  sendJson(res, 200, { items, actionCount: items.filter((x) => x.status === 'sent').length });
}));

// คำขอของเอกสารหนึ่งฉบับ (ฝั่งผู้ส่ง ใช้ในแท็บ "ส่งเอกสาร")
api.get('/api/documents/:id/requests', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  sendJson(res, 200, { items: await Promise.all((await store.all('requests', (r) => r.docId === doc.id)).reverse().map(reqPublic)) });
}));

// ผู้รับเปิดดูเอกสาร (PDF) จากคำขอ
api.get('/api/requests/:id/pdf', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return sendHtml(res, 401, '<h2>กรุณาเข้าสู่ระบบก่อน</h2>');
  const r = await store.find('requests', req.params.id);
  if (!r || (r.toUserId !== user.id && r.fromUserId !== user.id)) return sendHtml(res, 404, '<h2>ไม่พบคำขอ</h2>');
  const doc = await store.find('documents', r.docId);
  const issuer = await store.find('users', r.fromUserId);
  if (!doc || !issuer) return sendHtml(res, 404, '<h2>ไม่พบเอกสาร</h2>');
  const attachments = await store.all('attachments', (a) => a.docId === doc.id);
  await logAudit(r.fromUserId, doc.id, 'view', `${user.displayName} เปิดดูเอกสารจากคำขอ`, user.displayName);
  sendHtml(res, 200, docview.render(doc, issuer, { attachments, brand: brandCtx(issuer) }));
});

// ผู้รับลงนามตอบกลับ (ใช้คลังลายเซ็นของบัญชีตนเอง)
api.post('/api/requests/:id/sign', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.toUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (r.status !== 'sent') return sendJson(res, 400, { error: 'คำขอนี้ถูกตอบไปแล้ว' });
  const b = await readJsonBody(req);
  const doc = await store.find('documents', r.docId);
  if (!doc) return sendJson(res, 404, { error: 'เอกสารถูกลบแล้ว' });
  // ข้อ 5: ต้องตรวจสถานะเอกสารก่อนรับลายเซ็นทุกครั้ง กันกรณีเอกสารถูกยกเลิก/เปลี่ยนสถานะไปแล้ว
  // แต่คำขอยังค้างอยู่ (เช่น เจ้าของยกเลิกเอกสารหลังส่งคำขอ)
  if (doc.status !== 'pending') {
    return sendJson(res, 400, { error: 'เอกสารนี้ไม่อยู่ในสถานะที่รับลายเซ็นได้แล้ว (อาจถูกยกเลิกหรือเปลี่ยนสถานะไปก่อนหน้านี้)' });
  }
  // ต้องยืนยันด้วยรหัส OTP ที่ส่งไปยังอีเมลก่อนลงนามทุกครั้ง
  const check = await otp.verify(b.otpId, b.code, { userId: req.user.id, purpose: 'sign-request', refId: r.id });
  if (!check.ok) return sendJson(res, 400, { error: check.error });
  if (b.image !== undefined && b.image !== null && !isValidSignatureImage(b.image)) {
    return sendJson(res, 400, { error: 'รูปลายเซ็นไม่ถูกต้อง' });
  }
  const signerName = b.signerName || req.user.displayName;
  // ข้อ 5: คู่ค้าลงนามตอบกลับแล้ว = เอกสารผ่านขั้นตอนอนุมัติ (countersign → approved)
  const updated = await store.update('documents', doc.id, {
    status: 'approved',
    counterpartySignature: {
      signerName, image: b.image || null, signedAt: new Date().toISOString(),
      byUserId: req.user.id, byEmail: req.user.email, signAs: r.signAs || '',
      contentHash: contentHash(doc),
    },
  });
  await store.update('requests', r.id, { status: 'signed', respondedAt: new Date().toISOString() });
  await snapshotVersion(updated, signerName, 'คู่ค้าลงนามตอบกลับ เอกสารอนุมัติแล้ว');
  await logAudit(r.fromUserId, doc.id, 'countersign', `${signerName} (${req.user.email}) ลงนามเอกสาร สถานะเปลี่ยนเป็นอนุมัติ`, signerName);
  const senderName = req.user.companyName || req.user.displayName;
  await notify(r.fromUserId, 'signed', `${senderName} ลงนามเอกสาร ${doc.docNo} เรียบร้อยแล้ว เอกสารอนุมัติแล้ว`, doc.id);
  const owner = await store.find('users', r.fromUserId);
  if (owner) deliverWebhook(owner, 'document.approved', updated);
  sendJson(res, 200, { ok: true });
}));

// ผู้รับตอบรับผลตรวจ (กรณี purpose=review) หรือปฏิเสธ
api.post('/api/requests/:id/approve', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.toUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (r.status !== 'sent') return sendJson(res, 400, { error: 'คำขอนี้ถูกตอบไปแล้ว' });
  const doc = await store.find('documents', r.docId);
  if (!doc) return sendJson(res, 404, { error: 'เอกสารถูกลบแล้ว' });
  if (doc.status !== 'pending') {
    return sendJson(res, 400, { error: 'เอกสารนี้ไม่อยู่ในสถานะที่ตรวจสอบได้แล้ว (อาจถูกยกเลิกหรือเปลี่ยนสถานะไปก่อนหน้านี้)' });
  }
  await store.update('requests', r.id, { status: 'approved', respondedAt: new Date().toISOString() });
  // ข้อ 5: ผลตรวจสอบ "ผ่าน" จากคู่ค้า = เอกสารอนุมัติแล้ว
  const updated = await store.update('documents', doc.id, { status: 'approved' });
  await snapshotVersion(updated, req.user.displayName, 'คู่ค้าตรวจสอบผ่าน เอกสารอนุมัติแล้ว');
  await logAudit(r.fromUserId, doc.id, 'review-ok', `${req.user.displayName} ตรวจสอบแล้ว ไม่มีแก้ไข สถานะเปลี่ยนเป็นอนุมัติ`, req.user.displayName);
  await notify(r.fromUserId, 'approved', `${req.user.companyName || req.user.displayName} ตรวจสอบเอกสาร ${doc.docNo} แล้ว ผ่าน`, doc.id);
  const owner = await store.find('users', r.fromUserId);
  if (owner) deliverWebhook(owner, 'document.approved', updated);
  sendJson(res, 200, { ok: true });
}));

api.post('/api/requests/:id/decline', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.toUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (r.status !== 'sent') return sendJson(res, 400, { error: 'คำขอนี้ถูกตอบไปแล้ว' });
  const b = await readJsonBody(req);
  const doc = await store.find('documents', r.docId);
  if (!doc) return sendJson(res, 404, { error: 'เอกสารถูกลบแล้ว' });
  if (doc.status !== 'pending') {
    return sendJson(res, 400, { error: 'เอกสารนี้ไม่อยู่ในสถานะที่ตีกลับได้แล้ว (อาจถูกยกเลิกหรือเปลี่ยนสถานะไปก่อนหน้านี้)' });
  }
  await store.update('requests', r.id, { status: 'declined', respondedAt: new Date().toISOString(), declineReason: b.reason || '' });
  // ข้อ 5: ตีกลับ = เอกสารไม่อนุมัติ
  const updated = await store.update('documents', doc.id, { status: 'rejected' });
  await snapshotVersion(updated, req.user.displayName, `คู่ค้าตีกลับ: ${b.reason || '-'}`);
  await logAudit(r.fromUserId, doc.id, 'declined', `${req.user.displayName} ปฏิเสธ: ${b.reason || '-'} สถานะเปลี่ยนเป็นไม่อนุมัติ`, req.user.displayName);
  await notify(r.fromUserId, 'rejected', `${req.user.companyName || req.user.displayName} ตีกลับเอกสาร ${doc.docNo}${b.reason ? ' ' + b.reason : ''}`, doc.id);
  const owner = await store.find('users', r.fromUserId);
  if (owner) deliverWebhook(owner, 'document.rejected', updated);
  sendJson(res, 200, { ok: true });
}));

// ผู้ส่งยกเลิกคำขอ
api.post('/api/requests/:id/cancel', requireAuth(async (req, res) => {
  const r = await store.find('requests', req.params.id);
  if (!r || r.fromUserId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (r.status !== 'sent') return sendJson(res, 400, { error: 'คำขอนี้ปิดไปแล้ว' });
  await store.update('requests', r.id, { status: 'cancelled' });
  sendJson(res, 200, { ok: true });
}));

/* =========================================================
 * คลังลายเซ็น (ข้อ 5): บันทึกลายเซ็น เรียกใช้ซ้ำได้
 * ========================================================= */
api.get('/api/signatures', requireAuth(async (req, res) => {
  sendJson(res, 200, { items: (await store.all('signatures', (x) => x.userId === req.user.id)).reverse() });
}));
api.post('/api/signatures', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!isValidSignatureImage(b.image)) return sendJson(res, 400, { error: 'รูปลายเซ็นไม่ถูกต้อง' });
  const row = await store.insert('signatures', { userId: req.user.id, name: b.name || req.user.displayName, image: b.image });
  await logAudit(req.user.id, null, 'signature-save', `บันทึกลายเซ็น "${row.name}" เข้าคลัง`, req.user.displayName);
  sendJson(res, 201, row);
}));
api.delete('/api/signatures/:id', requireAuth(async (req, res) => {
  const x = await store.find('signatures', req.params.id);
  if (!x || x.userId !== req.user.id) return sendJson(res, 404, { error: 'not found' });
  await store.remove('signatures', x.id);
  sendJson(res, 200, { deleted: true });
}));

/* =========================================================
 * DOCUMENTS list / detail / edit / status / delete
 * ========================================================= */
async function ownDoc(req) {
  const doc = await store.find('documents', req.params.id);
  if (!doc || doc.userId !== req.user.id) return null;
  return doc;
}

api.get('/api/documents', requireAuth(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams;
  const type = p.get('type'), status = p.get('status'), q = (p.get('q') || '').toLowerCase();
  const contact = (p.get('contact') || '').toLowerCase();
  const from = p.get('from'), to = p.get('to');
  const rows = (await store.all('documents', (d) =>
    d.userId === req.user.id &&
    (!type || d.type === type) &&
    (!status || d.status === status) &&
    (!q || (d.docNo || '').toLowerCase().includes(q) || JSON.stringify(d).toLowerCase().includes(q)) &&
    (!contact || (`${d.party || ''}${d.buyer || ''}${d.payee || ''}${d.payer || ''}`).toLowerCase().includes(contact)) &&
    // ข้อ: กรองตาม "วันที่ออกเอกสาร" ตามเขตเวลาไทย (issueDate) แทน createdAt แบบ UTC ตรงๆ
    // (เอกสารเก่าก่อนมีฟิลด์นี้ fallback ไปใช้ createdAt) กันเอกสารที่สร้างช่วงดึกตกไปอยู่วันก่อนหน้าผิดวัน
    (!from || (d.issueDate || (d.createdAt || '').slice(0, 10)) >= from) &&
    (!to || (d.issueDate || (d.createdAt || '').slice(0, 10)) <= to)
  )).reverse();
  const withReq = await Promise.all(rows.map(async (d) => {
    const reqs = await store.all('requests', (r) => r.docId === d.id);
    const last = reqs.length ? reqs[reqs.length - 1] : null;
    if (!last) return d;
    const toU = await store.find('users', last.toUserId);
    return { ...d, sentTo: { email: last.toEmail, name: toU ? (toU.companyName || toU.displayName) : last.toEmail, status: last.status, dueDate: last.dueDate || '' } };
  }));
  sendJson(res, 200, { count: withReq.length, items: withReq });
}));

// ข้อ: ต้องประกาศเส้นทางนี้ "ก่อน" /api/documents/:id เสมอ router (lib/router.js) จับคู่เส้นทางแบบ
// ไล่ตามลำดับที่ประกาศ ไม่ได้เรียงตามความเจาะจงก่อน ถ้าสลับที่กัน /api/documents/export-zip จะถูก
// /api/documents/:id ตีความ id="export-zip" ไปก่อน (Number("export-zip")=NaN หาเอกสารไม่เจอ ตอบ 404 ผิดจุด)
//
// ส่งออกหลายเอกสารพร้อมกันเป็น ZIP แต่ละไฟล์เป็น HTML พร้อมพิมพ์ (แบบเดียวกับ /pdf ทีละฉบับ) ไม่ใช่ PDF
// สำเร็จรูป เพราะระบบไม่มีตัวเรนเดอร์ PDF ฝั่งเซิร์ฟเวอร์ (ตั้งใจเลี่ยง dependency ภายนอก ดู lib/docview.js)
const ZIP_EXPORT_MAX = 200; // กันคำขอที่มีรายการเยอะผิดปกติทำให้เซิร์ฟเวอร์ช้า/หน่วยความจำพุ่ง
api.get('/api/documents/export-zip', requireAuth(async (req, res) => {
  const idsParam = new URL(req.url, 'http://localhost').searchParams.get('ids') || '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, ZIP_EXPORT_MAX);
  if (!ids.length) return sendJson(res, 400, { error: 'กรุณาระบุเอกสารที่ต้องการอย่างน้อย 1 ฉบับ' });

  const files = [];
  const usedNames = new Set();
  for (const id of ids) {
    const doc = await store.find('documents', id);
    if (!doc || doc.userId !== req.user.id) continue; // ข้ามเอกสารที่ไม่พบ/ไม่ใช่ของผู้ใช้เองแบบเงียบๆ แทนที่จะล้มทั้งคำขอ
    const attachments = await store.all('attachments', (a) => a.docId === doc.id);
    const share = await store.findOne('shares', (s) => s.docId === doc.id);
    const ctx = { attachments, brand: brandCtx(req.user) };
    if (share) ctx.qrSvg = qr.toSVG(verifyUrl(req, share.token), { scale: 2 });
    const html = docview.render(doc, req.user, ctx);
    let name = (doc.docNo || `draft-${doc.id}`).replace(/[\\/:*?"<>|]/g, '-') + '.html';
    let n = 2;
    while (usedNames.has(name)) { name = name.replace(/\.html$/, '') + `-${n++}.html`; } // กันชื่อไฟล์ซ้ำ (เช่นแบบร่างหลายฉบับที่ยังไม่มีเลขที่)
    usedNames.add(name);
    files.push({ name, data: Buffer.from(html, 'utf8') });
  }
  if (!files.length) return sendJson(res, 404, { error: 'ไม่พบเอกสารที่เลือกไว้ หรือไม่มีสิทธิ์เข้าถึง' });

  const zipBuf = zip.buildZip(files);
  await logAudit(req.user.id, null, 'export', `ส่งออกเอกสาร ${files.length} ฉบับเป็น ZIP (HTML พร้อมพิมพ์)`, req.user.displayName);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="taxflow-documents-${bangkokDateStr()}.zip"`,
    'Content-Length': zipBuf.length,
  });
  res.end(zipBuf);
}));

api.get('/api/documents/:id', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const attachments = (await store.all('attachments', (a) => a.docId === doc.id)).map((a) => { const { dataBase64, storedName, ...meta } = a; return meta; });
  const versions = await store.all('doc_versions', (v) => v.docId === doc.id);
  const audit = (await store.all('audit_log', (a) => a.docId === doc.id)).reverse();
  const share = await store.findOne('shares', (s) => s.docId === doc.id);
  const reqsAll = await store.all('requests', (r) => r.docId === doc.id);
  const lastReq = reqsAll.length ? await reqPublic(reqsAll[reqsAll.length - 1]) : null;
  sendJson(res, 200, { ...doc, attachments, versions, audit, share: share ? { token: share.token } : null, activeRequest: lastReq, allowedTransitions: STATUS_FLOW[doc.status] || [] });
}));

api.put('/api/documents/:id', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (['approved', 'archived', 'cancelled'].includes(doc.status)) return sendJson(res, 400, { error: 'เอกสารสถานะนี้แก้ไขไม่ได้' });
  // ใบลดหนี้/ใบเพิ่มหนี้อ้างอิงใบกำกับภาษีต้นฉบับตามกฎหมาย ห้ามแก้ไขเนื้อหาภายหลัง ยกเลิกแล้วออกใหม่แทน
  if (['CREDIT_NOTE', 'DEBIT_NOTE'].includes(doc.type)) return sendJson(res, 400, { error: 'ใบลดหนี้/ใบเพิ่มหนี้แก้ไขไม่ได้ หากข้อมูลผิดพลาดให้ยกเลิกเอกสารนี้แล้วออกฉบับใหม่' });
  const b = await readJsonBody(req);
  let patch = {};
  const errors = [];
  const GEN_TYPES = [...BIZ_TYPES, ...CONTRACT_TYPES];
  if (doc.schemaVersion === 2) {
    // ver16: แก้ไขด้วยแบบฟอร์มเต็มชุดเดียวกับตอนสร้าง และผ่านการตรวจสอบ/คำนวณชุดเดียวกันทั้งหมด
    errors.push(...await lockPndRows(req.user, doc.type, b));
    const built = await docbuild.build(req.user, doc.type, b, buildCtx(req.user, doc.id));
    errors.push(...built.errors);
    if (!errors.length) patch = built.record;
  } else if (GEN_TYPES.includes(doc.type)) {
    const partyTaxIdErr = taxIdError(b.partyTaxId ?? doc.partyTaxId, 'คู่สัญญา/คู่ค้า');
    if (partyTaxIdErr) errors.push(partyTaxIdErr);
    patch = { party: b.party ?? doc.party, partyTaxId: b.partyTaxId ?? doc.partyTaxId, note: b.note ?? doc.note, scope: b.scope ?? doc.scope };
    if (b.amount !== undefined || b.fee !== undefined) {
      const base = round2(Number(b.amount ?? b.fee) || doc.base);
      if (!(base > 0)) errors.push('กรุณาระบุยอดเงินให้ถูกต้อง');
      // ข้อ 8: VAT ของเอกสารทั่วไปยังคงล็อกไว้ที่ 7% ตามเดิม (ไม่รับอัตราใหม่จากผู้ใช้ตอนแก้ไข)
      const vat = doc.vatRate ? round2(base * doc.vatRate / 100) : 0;
      Object.assign(patch, { base, vat, total: round2(base + vat), net: round2(base + vat) });
    }
  } else if (doc.type === 'ETAX') {
    const items = b.items !== undefined ? validLineItems(b.items) : doc.items;
    if (!items.length) errors.push('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ');
    errors.push(...lineItemErrors(items));
    const buyerTaxIdErr = taxIdError(b.buyerTaxId ?? doc.buyerTaxId, 'ผู้ซื้อ');
    if (buyerTaxIdErr) errors.push(buyerTaxIdErr);
    const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
    const vat = tax.calcVat(subtotal, VAT_RATE_FIXED); // ข้อ 8: ล็อก VAT ไว้ที่ 7% เสมอ
    patch = { buyer: b.buyer ?? doc.buyer, buyerTaxId: b.buyerTaxId ?? doc.buyerTaxId, items, base: vat.base, vatRate: vat.rate, vat: vat.vat, total: vat.total };
  } else {
    const amount = Number(b.amount ?? doc.base);
    if (!(amount > 0)) errors.push('กรุณาระบุยอดเงินให้ถูกต้อง');
    if (doc.type === 'EWHT') {
      const payeeTaxIdErr = taxIdError(b.payeeTaxId ?? doc.payeeTaxId, 'ผู้รับเงิน');
      if (payeeTaxIdErr) errors.push(payeeTaxIdErr);
    }
    const calc = tax.calcWithholding(amount, validWhtRate(b.rate ?? doc.rate, doc.rate)); // ข้อ 8: จำกัดอัตราเฉพาะชุดที่กฎหมายกำหนด
    patch = { payee: b.payee ?? doc.payee, payer: b.payer ?? doc.payer, description: b.description ?? doc.description, incomeType: b.incomeType ?? doc.incomeType, ...calc };
  }
  if (errors.length) return sendJson(res, 400, { error: 'ข้อมูลไม่ถูกต้อง', errors });
  // ข้อ 6: เนื้อหาที่ลงนามไปแล้วเปลี่ยน = ลายเซ็นเดิมใช้อ้างอิงไม่ได้อีกต่อไป ต้องล้างทิ้งแล้วให้ลงนามใหม่
  // (กันกรณีแก้ยอดเงินหลังลงนามแล้วลายเซ็นเดิมยังติดอยู่กับเนื้อหาใหม่)
  const hadSignature = !!(doc.signature || doc.counterpartySignature);
  if (hadSignature) {
    Object.assign(patch, { signed: false, signature: null, counterpartySignature: null });
  }
  const updated = await store.update('documents', doc.id, patch);
  await snapshotVersion(updated, req.user.displayName, (typeof b.note === 'string' && b.note) || b.changeNote || 'แก้ไขเอกสาร');
  await logAudit(req.user.id, doc.id, 'edit', `แก้ไข ${doc.docNo}${hadSignature ? ' ลายเซ็นเดิมถูกล้างเพราะเนื้อหาเปลี่ยน ต้องลงนามใหม่' : ''}`, req.user.displayName);
  await notify(req.user.id, 'edit', hadSignature
    ? `แก้ไขเอกสาร ${doc.docNo} ลายเซ็นเดิมถูกล้างแล้ว กรุณาลงนามใหม่`
    : `มีการแก้ไขเอกสาร ${doc.docNo}`, doc.id);
  sendJson(res, 200, updated);
}));

api.post('/api/documents/:id/status', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const b = await readJsonBody(req);
  const next = b.status;
  if (!(STATUS_FLOW[doc.status] || []).includes(next)) return sendJson(res, 400, { error: `เปลี่ยนจาก "${STATUS_LABEL[doc.status]}" เป็น "${STATUS_LABEL[next] || next}" ไม่ได้` });
  // ข้อ 5: เอกสารที่อยู่ระหว่างส่งให้คู่ค้าลงนาม/ตรวจสอบ (status=pending + docPurpose=send)
  // ต้องอนุมัติผ่านการลงนามหรือผลตรวจของคู่ค้าเท่านั้น เจ้าของเอกสารเปลี่ยนเป็น "อนุมัติ" เองไม่ได้
  // (ก่อนส่ง ยังเป็น draft ยังปิดงานเองได้ตามปกติ เพราะยังไม่มีคำขอค้างอยู่ที่ฝั่งคู่ค้า)
  if (next === 'approved' && doc.status === 'pending' && (doc.docPurpose || 'self') === 'send') {
    return sendJson(res, 400, { error: 'เอกสารนี้ถูกส่งให้คู่ค้าลงนาม/ตรวจสอบแล้ว ต้องรอผลจากคู่ค้าเท่านั้น ไม่สามารถอนุมัติเองได้' });
  }
  // ข้อ: ออกเลขที่จริงตอนเอกสารออกจากสถานะแบบร่างเป็นครั้งแรก (ยกเว้นยกเลิกตั้งแต่ยังเป็นแบบร่าง ไม่ต้องออกเลข)
  if (doc.status === 'draft' && next !== 'cancelled') await ensureIssued(doc, req.user.displayName);
  const updated = await store.update('documents', doc.id, { status: next, statusNote: b.note || '' });
  if (next === 'cancelled') {
    const cancelledAt = new Date().toISOString();
    await store.update('documents', doc.id, { cancelledAt, cancelReason: b.note || '' });
    // ยกเลิกคำขอลงนาม/ตรวจสอบที่ยังค้างอยู่ด้วย กันคู่ค้าลงนามเอกสารที่ถูกยกเลิกไปแล้ว
    for (const r of await store.all('requests', (r) => r.docId === doc.id && r.status === 'sent')) {
      await store.update('requests', r.id, { status: 'cancelled' });
    }
  }
  await snapshotVersion(updated, req.user.displayName, `เปลี่ยนสถานะเป็น ${STATUS_LABEL[next]}`);
  await logAudit(req.user.id, doc.id, 'status', `${STATUS_LABEL[doc.status]} → ${STATUS_LABEL[next]}`, req.user.displayName);
  const notifyMap = { approved: `เอกสาร ${updated.docNo} ได้รับการอนุมัติ`, rejected: `เอกสาร ${updated.docNo} ถูกตีกลับ (ไม่อนุมัติ)`, pending: `เอกสาร ${updated.docNo} ถูกส่งเข้ารอตรวจสอบ` };
  if (notifyMap[next]) await notify(req.user.id, next, notifyMap[next], doc.id);
  if (['approved', 'rejected', 'cancelled'].includes(next)) deliverWebhook(req.user, `document.${next}`, updated);
  sendJson(res, 200, updated);
}));

// ลบถาวรได้เฉพาะเอกสารสถานะ "แบบร่าง" เท่านั้น (ข้อ 41 ของสเปก + หลักเก็บเอกสารภาษี 5 ปี)
// สถานะอื่นต้อง "ยกเลิก" ผ่าน /api/documents/:id/status (status=cancelled) พร้อมระบุเหตุผล
// เพื่อไม่ให้เลขที่เอกสารขาดช่วงและยังมีร่องรอยตรวจสอบย้อนหลังได้
api.delete('/api/documents/:id', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (doc.status !== 'draft') {
    return sendJson(res, 400, {
      error: 'ลบเอกสารที่ไม่ใช่แบบร่างไม่ได้ เอกสารที่ออกแล้วต้อง "ยกเลิก" พร้อมระบุเหตุผลแทน เพื่อรักษาลำดับเลขที่เอกสารและร่องรอยตรวจสอบตามกฎหมาย',
    });
  }
  for (const a of await store.all('attachments', (a) => a.docId === doc.id)) { try { fs.unlinkSync(path.join(store.UPLOAD_DIR, a.storedName)); } catch {} await store.remove('attachments', a.id); }
  await store.remove('documents', doc.id);
  await logAudit(req.user.id, null, 'delete', `ลบเอกสาร ${doc.docNo}`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

/* =========================================================
 * VERSIONS
 * ========================================================= */
api.get('/api/documents/:id/versions', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  sendJson(res, 200, { items: await store.all('doc_versions', (v) => v.docId === doc.id) });
}));

/* =========================================================
 * ATTACHMENTS (upload / list / download / delete)
 * ========================================================= */
const ALLOWED_MIME = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_SIZE = 5 * 1024 * 1024;

api.post('/api/documents/:id/attachments', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const b = await readJsonBody(req);
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์' });
  if (!ALLOWED_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PDF, PNG, JPG, WEBP เท่านั้น' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (buf.length > MAX_SIZE) return sendJson(res, 413, { error: 'ไฟล์มีขนาดเกิน 5 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์จริง' });
  const storedName = crypto.randomBytes(12).toString('hex') + '.' + ALLOWED_MIME[b.mime];
  fs.writeFileSync(path.join(store.UPLOAD_DIR, storedName), buf);
  const att = await store.insert('attachments', {
    userId: req.user.id, docId: doc.id, kind: b.kind || 'other',
    filename: b.filename || storedName, mime: b.mime, size: buf.length, storedName,
  });
  await logAudit(req.user.id, doc.id, 'upload', `แนบไฟล์ ${att.filename}`, req.user.displayName);
  const { dataBase64, storedName: sn, ...meta } = att;
  sendJson(res, 201, meta);
}));

api.get('/api/attachments/:id', requireAuth(async (req, res) => {
  const a = await store.find('attachments', req.params.id);
  if (!a || a.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  try {
    const buf = fs.readFileSync(path.join(store.UPLOAD_DIR, a.storedName));
    res.writeHead(200, { 'Content-Type': a.mime, 'Content-Disposition': `inline; filename="file"`, 'Content-Length': buf.length });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'ไฟล์หาย' }); }
}));

api.delete('/api/attachments/:id', requireAuth(async (req, res) => {
  const a = await store.find('attachments', req.params.id);
  if (!a || a.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  try { fs.unlinkSync(path.join(store.UPLOAD_DIR, a.storedName)); } catch {}
  await store.remove('attachments', a.id);
  await logAudit(req.user.id, a.docId, 'delete-attachment', `ลบไฟล์แนบ ${a.filename}`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

/* =========================================================
 * E-SIGNATURE
 * ========================================================= */
api.post('/api/documents/:id/sign', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const b = await readJsonBody(req);
  // ต้องยืนยันด้วยรหัส OTP ที่ส่งไปยังอีเมลก่อนลงนามทุกครั้ง
  const check = await otp.verify(b.otpId, b.code, { userId: req.user.id, purpose: 'sign-doc', refId: doc.id });
  if (!check.ok) return sendJson(res, 400, { error: check.error });
  if (b.image !== undefined && b.image !== null && !isValidSignatureImage(b.image)) {
    return sendJson(res, 400, { error: 'รูปลายเซ็นไม่ถูกต้อง' });
  }
  const signature = { signerName: b.signerName || req.user.displayName, signedAt: new Date().toISOString(), image: b.image || null, contentHash: contentHash(doc) };
  const updated = await store.update('documents', doc.id, { signed: true, signature });
  await snapshotVersion(updated, req.user.displayName, 'ลงลายมือชื่อดิจิทัล (ยืนยันด้วย OTP)');
  await logAudit(req.user.id, doc.id, 'sign', `ลงนามโดย ${signature.signerName} (ยืนยันด้วย OTP)`, req.user.displayName);
  sendJson(res, 200, updated);
}));

/* =========================================================
 * SHARE + VERIFY + QR
 * ========================================================= */
async function ensureShare(doc, userId) {
  let share = await store.findOne('shares', (s) => s.docId === doc.id);
  if (!share) share = await store.insert('shares', { token: crypto.randomBytes(10).toString('hex'), docId: doc.id, userId });
  return share;
}
/** ตัด / ท้ายข้อความออก (เขียนเป็นลูปแทน regex /\/+$/ ที่ backtrack ได้ช้าเมื่อข้อความยาว) */
function stripTrailingSlashes(s) {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

// ข้อ: URL ใน QR ไม่ควรสร้างจาก header Host ที่ผู้ร้องขอกำหนดเองได้ (Host header injection)
// และไม่ควรบังคับเป็น http:// เสมอ ให้ตั้งค่า PUBLIC_BASE_URL ใน production แทน
// (เช่น https://taxflow.example.com) มิฉะนั้น fallback ไปใช้ Host header สำหรับพัฒนา/ทดสอบในเครื่อง
const PUBLIC_BASE_URL = stripTrailingSlashes(process.env.PUBLIC_BASE_URL || '');
function verifyUrl(req, token) {
  const base = PUBLIC_BASE_URL || `http://${req.headers.host || `localhost:${PORT}`}`;
  return `${base}/verify.html?token=${token}`;
}

api.post('/api/documents/:id/share', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const share = await ensureShare(doc, req.user.id);
  await logAudit(req.user.id, doc.id, 'share', `สร้างลิงก์แชร์ ${doc.docNo}`, req.user.displayName);
  sendJson(res, 200, { token: share.token, url: verifyUrl(req, share.token) });
}));

api.get('/api/documents/:id/qr.svg', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const share = await ensureShare(doc, req.user.id);
  const svg = qr.toSVG(verifyUrl(req, share.token), { scale: 4 });
  res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' }); res.end(svg);
}));

api.get('/api/verify/:token', async (req, res) => {
  const share = await store.findOne('shares', (s) => s.token === req.params.token);
  if (!share) return sendJson(res, 404, { valid: false, error: 'ไม่พบเอกสาร' });
  const doc = await store.find('documents', share.docId);
  if (!doc) return sendJson(res, 404, { valid: false, error: 'เอกสารถูกลบแล้ว' });
  const issuer = await store.find('users', doc.userId);
  // ข้อ 6: เทียบแฮชเนื้อหาปัจจุบันกับแฮชตอนลงนาม เพื่อบอกผู้ตรวจว่าเอกสารถูกแก้ไขหลังลงนามหรือไม่
  // (ปกติจะตรงกันเสมอเพราะระบบล้างลายเซ็นทิ้งทันทีที่มีการแก้ไข นี่คือด่านตรวจซ้ำ)
  const currentHash = contentHash(doc);
  const tampered = !!(doc.signature && doc.signature.contentHash && doc.signature.contentHash !== currentHash);
  sendJson(res, 200, {
    valid: true, docNo: doc.docNo, type: doc.type, status: doc.status,
    counterparty: doc.buyer || doc.payee || doc.payer || '',
    base: doc.base, total: doc.type === 'ETAX' ? doc.total : doc.net,
    signed: doc.signed, signerName: doc.signature ? doc.signature.signerName : null,
    signedAt: doc.signature ? doc.signature.signedAt : null,
    issuer: issuer ? (issuer.companyName || issuer.displayName) : '', createdAt: doc.createdAt,
    contentHash: currentHash, tampered,
  });
});

/* =========================================================
 * PDF / EXPORT / PRINT
 * ========================================================= */

/* ---------- โลโก้/ตราประทับสำหรับพิมพ์ลงบนเอกสาร ---------- */
// อ่านไฟล์ภาพของผู้ออกเอกสารแล้วแปลงเป็น data URI เพื่อฝังลงใน HTML ที่สั่งพิมพ์เป็น PDF
// (ต้องฝังเป็น data URI เพราะหน้าพิมพ์อาจถูกเปิดโดยผู้รับที่ไม่มีสิทธิ์เรียกไฟล์ของผู้ออกเอกสาร)
function brandDataUri(user, kind) {
  const meta = user && user[kind === 'seal' ? 'sealFile' : 'logoFile'];
  if (!meta || !meta.storedName) return null;
  try {
    const buf = fs.readFileSync(path.join(store.UPLOAD_DIR, meta.storedName));
    return `data:${meta.mime};base64,${buf.toString('base64')}`;
  } catch { return null; }
}
function brandCtx(user) {
  return {
    logo: brandDataUri(user, 'logo'),
    seal: brandDataUri(user, 'seal'),
    branchText: profile.branchLabel(user),
    addressText: profile.formatAddress(user.addr || {}) || user.address || '',
    vatRegistered: !!user.vatRegistered,
    authName: user.authName || '',
    authPosition: user.authPosition || '',
  };
}

api.get('/api/documents/:id/pdf', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return sendHtml(res, 401, '<h2>กรุณาเข้าสู่ระบบก่อน</h2>');
  const doc = await store.find('documents', req.params.id);
  if (!doc || doc.userId !== user.id) return sendHtml(res, 404, '<h2>ไม่พบเอกสาร</h2>');
  const attachments = await store.all('attachments', (a) => a.docId === doc.id);
  const share = await store.findOne('shares', (s) => s.docId === doc.id);
  const ctx = { attachments, brand: brandCtx(user) };
  if (share) ctx.qrSvg = qr.toSVG(verifyUrl(req, share.token), { scale: 2 });
  await logAudit(user.id, doc.id, 'download', `เปิด/พิมพ์ PDF ${doc.docNo}`, user.displayName);
  sendHtml(res, 200, docview.render(doc, user, ctx));
});

async function filteredDocs(req) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams;
  const type = p.get('type'), status = p.get('status');
  return (await store.all('documents', (d) => d.userId === req.user.id && (!type || d.type === type) && (!status || d.status === status))).reverse();
}
// หัวรายงานที่ผู้ใช้ตั้งค่าเองได้ (ชื่อผู้ประกอบการ เลขผู้เสียภาษี ที่อยู่ สาขา และโลโก้)
function exportBrand(user) {
  return {
    name: user.companyName || user.displayName || '',
    taxId: user.taxId ? thaiid.format(user.taxId) : '',
    address: profile.formatAddress(user.addr || {}) || user.address || '',
    branch: profile.branchLabel(user),
    logo: brandDataUri(user, 'logo'),
  };
}

api.get('/api/export/csv', requireAuth(async (req, res) => {
  const csv = exporter.toCSV(await filteredDocs(req), exportBrand(req.user));
  await logAudit(req.user.id, null, 'export', 'ส่งออก CSV', req.user.displayName);
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="taxflow-documents.csv"' });
  res.end(csv);
}));
api.get('/api/export/xls', requireAuth(async (req, res) => {
  const xls = exporter.toXLS(await filteredDocs(req), exportBrand(req.user));
  await logAudit(req.user.id, null, 'export', 'ส่งออก Excel', req.user.displayName);
  res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 'Content-Disposition': 'attachment; filename="taxflow-documents.xls"' });
  res.end('\uFEFF' + xls);
}));

/* =========================================================
 * DOCUMENT LIBRARY (คลังเอกสารตามหมวด แยกตามบทบาท)
 * เก็บไฟล์เอกสารราชการ/ธุรกิจ เช่น ภ.ง.ด.90, ภ.พ.20, สัญญาจ้าง ฯลฯ
 * ========================================================= */
const LIB_ALLOWED_MIME = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const LIB_MAX_SIZE = 5 * 1024 * 1024; // 5 MB ให้ตรงกับที่ระบุไว้ในสเปก (โค้ดเดิมเขียนไว้ 10 MB ไม่ตรงกับเอกสาร)

api.get('/api/library', requireAuth(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const category = url.searchParams.get('category');
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const rows = (await store.all('library', (l) =>
    l.userId === req.user.id &&
    (!category || l.category === category) &&
    (!q || `${l.title || ''}${l.filename || ''}${l.note || ''}`.toLowerCase().includes(q))
  )).reverse().map((l) => { const { storedName, ...meta } = l; return meta; });
  sendJson(res, 200, { count: rows.length, items: rows });
}));

api.post('/api/library', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!b.category) return sendJson(res, 400, { error: 'กรุณาเลือกหมวดเอกสาร' });
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์' });
  if (!LIB_ALLOWED_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PDF, PNG, JPG, WEBP' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (buf.length > LIB_MAX_SIZE) return sendJson(res, 413, { error: 'ไฟล์มีขนาดเกิน 5 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์จริง' });
  // ข้อ PDPA: ไฟล์ในคลังเอกสาร (เช่น ภ.ง.ด.90) อ่อนไหวพอๆ กับเอกสาร KYC จึงต้องเข้ารหัสแบบเดียวกัน
  const storedName = filestore.writeEncrypted(store.UPLOAD_DIR, buf, LIB_ALLOWED_MIME[b.mime]);
  const row = await store.insert('library', {
    userId: req.user.id, category: b.category,
    title: b.title || b.filename || 'เอกสาร', filename: b.filename || storedName,
    mime: b.mime, size: buf.length, storedName, note: b.note || '',
    year: b.year || String(new Date().getFullYear() + 543),
  });
  await logAudit(req.user.id, null, 'library-add', `เพิ่มเอกสาร "${row.title}" ในคลัง (${b.category})`, req.user.displayName);
  const { storedName: sn, ...meta } = row;
  sendJson(res, 201, meta);
}));

api.get('/api/library/:id/file', requireAuth(async (req, res) => {
  const l = await store.find('library', req.params.id);
  if (!l || l.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  try {
    const buf = filestore.readEncrypted(store.UPLOAD_DIR, l.storedName);
    res.writeHead(200, { 'Content-Type': l.mime, 'Content-Disposition': 'inline; filename="file"', 'Content-Length': buf.length });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'ไฟล์หาย' }); }
}));

api.delete('/api/library/:id', requireAuth(async (req, res) => {
  const l = await store.find('library', req.params.id);
  if (!l || l.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  filestore.removeFile(store.UPLOAD_DIR, l.storedName);
  await store.remove('library', l.id);
  await logAudit(req.user.id, null, 'library-del', `ลบเอกสาร "${l.title}" จากคลัง`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

/* =========================================================
 * CALENDAR ปฏิทินงาน: กำหนดยื่นภาษี เอกสาร สัญญา ลงนาม + กิจกรรมที่ผู้ใช้เพิ่มเอง
 * กิจกรรมจากระบบคำนวณใหม่ทุกครั้ง (ลบไม่ได้) ส่วนผู้ใช้บันทึกสถานะ/โน้ต/ไฟล์แนบของกิจกรรมระบบได้ผ่าน override
 * ========================================================= */
const CAL_FILE_MIME = LIB_ALLOWED_MIME;
const CAL_FILE_MAX = 5 * 1024 * 1024;

async function calOwnDocs(uid) { return store.all('documents', (d) => d.userId === uid); }
function calRangeFromQuery(req) {
  const url = new URL(req.url, 'http://localhost');
  const today = bangkokDateStr();
  let from = url.searchParams.get('from') || today.slice(0, 8) + '01';
  let to = url.searchParams.get('to') || '';
  if (!calendar.isYMD(from)) from = today.slice(0, 8) + '01';
  if (!calendar.isYMD(to) || to < from) {
    const [y, m] = from.split('-').map(Number);
    to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  }
  // จำกัดช่วงไม่เกินประมาณ 1 ปี กันการคำนวณหนักเกินจำเป็น
  const maxTo = new Date(Date.parse(from + 'T00:00:00Z') + 400 * 86400000).toISOString().slice(0, 10);
  if (to > maxTo) to = maxTo;
  return { from, to, today };
}
function calFieldError(res, errors) {
  const field = Object.keys(errors)[0];
  return sendJson(res, 400, { error: errors[field], field, fieldErrors: errors });
}
async function calFindEvent(req, id) {
  const ev = await store.find('calendar_events', id);
  return ev && ev.userId === req.user.id ? ev : null;
}

api.get('/api/calendar/meta', requireAuth(async (req, res) => {
  sendJson(res, 200, { categories: calendar.CATEGORIES, markers: calendar.MARKERS, priorities: calendar.PRIORITIES, maxAttachments: calendar.MAX_ATTACHMENTS, today: bangkokDateStr() });
}));

api.get('/api/calendar', requireAuth(async (req, res) => {
  const { from, to, today } = calRangeFromQuery(req);
  const uid = req.user.id;
  const [docs, requests, userEvents, overrides] = await Promise.all([
    calOwnDocs(uid),
    store.all('requests', (r) => r.toUserId === uid || r.fromUserId === uid),
    store.all('calendar_events', (e) => e.userId === uid),
    store.all('calendar_overrides', (o) => o.userId === uid),
  ]);
  // คำขอที่ได้รับ: ต้องใช้ข้อมูลเอกสารของผู้ส่งเพื่อแสดงชื่อเอกสาร (เฉพาะชื่อ/เลขที่ ไม่ส่งเนื้อหาเอกสาร)
  const foreignIds = [...new Set(requests.filter((r) => r.toUserId === uid).map((r) => r.docId))];
  const foreign = (await Promise.all(foreignIds.map((id) => store.find('documents', id)))).filter(Boolean)
    .map((d) => ({ id: d.id, type: d.type, docNo: d.docNo, status: d.status, userId: d.userId }));
  const items = calendar.collect({ user: req.user, docs: [...docs, ...foreign.filter((f) => !docs.some((d) => d.id === f.id))], requests, userEvents, overrides, from, to });
  sendJson(res, 200, { from, to, today, items });
}));

api.post('/api/calendar', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const count = (await store.all('calendar_events', (e) => e.userId === req.user.id)).length;
  if (count >= 2000) return sendJson(res, 400, { error: 'จำนวนกิจกรรมในปฏิทินเกินขีดจำกัด 2,000 รายการ' });
  const ownDocIds = (await calOwnDocs(req.user.id)).map((d) => d.id);
  const { errors, clean } = calendar.validateEvent(b, { ownDocIds });
  if (Object.keys(errors).length) return calFieldError(res, errors);
  const row = await store.insert('calendar_events', { userId: req.user.id, ...clean, attachments: [], createdAt: new Date().toISOString() });
  await logAudit(req.user.id, clean.linkDocId, 'calendar-add', `เพิ่มกิจกรรมปฏิทิน "${clean.title}" วันที่ ${clean.date}`, req.user.displayName);
  sendJson(res, 201, { id: row.id });
}));

api.put('/api/calendar/:id', requireAuth(async (req, res) => {
  const ev = await calFindEvent(req, req.params.id);
  if (!ev) return sendJson(res, 404, { error: 'ไม่พบกิจกรรม' });
  const b = await readJsonBody(req);
  const ownDocs = await calOwnDocs(req.user.id);
  const merged = { ...ev, ...b };
  const { errors, clean } = calendar.validateEvent(merged, { existing: ev, ownDocIds: ownDocs.map((d) => d.id) });
  // เอกสารที่ยืนยันแล้ว: ห้ามถอดการผูกเอกสารออก (ไม่งั้นจะกลายเป็นช่องทางลบกิจกรรมที่ถูกล็อก)
  const linked = ev.linkDocId ? ownDocs.find((d) => d.id === ev.linkDocId) : null;
  if (linked && calendar.LOCKED_DOC_STATUS.includes(linked.status) && clean.linkDocId !== ev.linkDocId) {
    errors.linkDocId = 'กิจกรรมนี้ผูกกับเอกสารที่ยืนยันแล้ว ไม่สามารถเปลี่ยนเอกสารได้';
  }
  if (Object.keys(errors).length) return calFieldError(res, errors);
  await store.update('calendar_events', ev.id, { ...clean, updatedAt: new Date().toISOString() });
  await logAudit(req.user.id, clean.linkDocId, 'calendar-edit', `แก้ไขกิจกรรมปฏิทิน "${clean.title}"`, req.user.displayName);
  sendJson(res, 200, { ok: true });
}));

api.delete('/api/calendar/:id', requireAuth(async (req, res) => {
  const ev = await calFindEvent(req, req.params.id);
  if (!ev) return sendJson(res, 404, { error: 'ไม่พบกิจกรรม' });
  const docsById = Object.fromEntries((await calOwnDocs(req.user.id)).map((d) => [d.id, d]));
  const lk = calendar.lockState({ ...ev, source: 'user' }, docsById);
  if (lk.locked) return sendJson(res, 423, { error: `ไม่สามารถลบได้: ${lk.reason}` });
  (ev.attachments || []).forEach((f) => filestore.removeFile(store.UPLOAD_DIR, f.storedName));
  await store.remove('calendar_events', ev.id);
  await logAudit(req.user.id, ev.linkDocId, 'calendar-del', `ลบกิจกรรมปฏิทิน "${ev.title}"`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

// กิจกรรมจากระบบ: บันทึกได้เฉพาะ เสร็จแล้ว / บันทึกเพิ่มเติม / สัญลักษณ์
api.post('/api/calendar/overrides', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const { errors, clean } = calendar.validateOverride(b);
  if (Object.keys(errors).length) return calFieldError(res, errors);
  const cur = await store.findOne('calendar_overrides', (o) => o.userId === req.user.id && o.sysKey === clean.sysKey);
  if (cur) await store.update('calendar_overrides', cur.id, { ...clean, updatedAt: new Date().toISOString() });
  else await store.insert('calendar_overrides', { userId: req.user.id, ...clean, attachments: [], createdAt: new Date().toISOString() });
  sendJson(res, 200, { ok: true });
}));

async function calFileOwner(req, b) {
  if (b.sysKey) {
    if (!/^sys:[\w:.-]{3,80}$/.test(String(b.sysKey))) return null;
    let o = await store.findOne('calendar_overrides', (x) => x.userId === req.user.id && x.sysKey === b.sysKey);
    if (!o && b.create) o = await store.insert('calendar_overrides', { userId: req.user.id, sysKey: b.sysKey, note: '', marker: 'none', done: false, attachments: [], createdAt: new Date().toISOString() });
    return o ? { table: 'calendar_overrides', row: o } : null;
  }
  const ev = b.eventId ? await calFindEvent(req, b.eventId) : null;
  return ev ? { table: 'calendar_events', row: ev } : null;
}

api.post('/api/calendar/files', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์' });
  if (!CAL_FILE_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PDF, PNG, JPG, WEBP' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (buf.length > CAL_FILE_MAX) return sendJson(res, 413, { error: 'ไฟล์มีขนาดเกิน 5 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์จริง' });
  const owner = await calFileOwner(req, { ...b, create: true });
  if (!owner) return sendJson(res, 404, { error: 'ไม่พบกิจกรรม' });
  const list = owner.row.attachments || [];
  if (list.length >= calendar.MAX_ATTACHMENTS) return sendJson(res, 400, { error: `แนบไฟล์ได้สูงสุด ${calendar.MAX_ATTACHMENTS} ไฟล์ต่อกิจกรรม` });
  const storedName = filestore.writeEncrypted(store.UPLOAD_DIR, buf, CAL_FILE_MIME[b.mime]);
  const file = { id: crypto.randomBytes(8).toString('hex'), filename: String(b.filename || 'ไฟล์แนบ').slice(0, 150), mime: b.mime, size: buf.length, storedName, at: new Date().toISOString() };
  await store.update(owner.table, owner.row.id, { attachments: [...list, file] });
  await logAudit(req.user.id, null, 'calendar-file', `แนบไฟล์ "${file.filename}" ในกิจกรรมปฏิทิน`, req.user.displayName);
  const { storedName: sn, ...meta } = file;
  sendJson(res, 201, meta);
}));

api.get('/api/calendar/file', requireAuth(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const owner = await calFileOwner(req, { sysKey: url.searchParams.get('sysKey'), eventId: url.searchParams.get('eventId') });
  const f = owner && (owner.row.attachments || []).find((x) => x.id === url.searchParams.get('fileId'));
  if (!f) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  try {
    const buf = filestore.readEncrypted(store.UPLOAD_DIR, f.storedName);
    res.writeHead(200, { 'Content-Type': f.mime, 'Content-Disposition': 'inline; filename="file"', 'Content-Length': buf.length });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'ไฟล์หาย' }); }
}));

api.post('/api/calendar/files/delete', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const owner = await calFileOwner(req, b);
  const f = owner && (owner.row.attachments || []).find((x) => x.id === b.fileId);
  if (!f) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  filestore.removeFile(store.UPLOAD_DIR, f.storedName);
  await store.update(owner.table, owner.row.id, { attachments: owner.row.attachments.filter((x) => x.id !== f.id) });
  await logAudit(req.user.id, null, 'calendar-file-del', `ลบไฟล์แนบ "${f.filename}" จากกิจกรรมปฏิทิน`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

/* =========================================================
 * NOTIFICATIONS
 * ========================================================= */
api.get('/api/notifications', requireAuth(async (req, res) => {
  const items = (await store.all('notifications', (n) => n.userId === req.user.id)).reverse();
  sendJson(res, 200, { items, unread: items.filter((n) => !n.read).length });
}));
api.post('/api/notifications/:id/read', requireAuth(async (req, res) => {
  const n = await store.find('notifications', req.params.id);
  if (!n || n.userId !== req.user.id) return sendJson(res, 404, { error: 'not found' });
  await store.update('notifications', n.id, { read: true }); sendJson(res, 200, { ok: true });
}));
api.post('/api/notifications/read-all', requireAuth(async (req, res) => {
  for (const n of await store.all('notifications', (n) => n.userId === req.user.id && !n.read)) await store.update('notifications', n.id, { read: true });
  sendJson(res, 200, { ok: true });
}));

/* =========================================================
 * AUDIT LOG (account-wide)
 * ========================================================= */
api.get('/api/audit', requireAuth(async (req, res) => {
  sendJson(res, 200, { items: (await store.all('audit_log', (a) => a.userId === req.user.id)).reverse().slice(0, 200) });
}));

/* =========================================================
 * SUMMARIES
 * ========================================================= */
function statusCounts(docs) {
  const c = { draft: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0, archived: 0 };
  docs.forEach((d) => { if (c[d.status] !== undefined) c[d.status]++; });
  return c;
}
// เอกสารที่ถูกยกเลิก/ไม่อนุมัติไม่มีผลทางภาษี จึงไม่นับรวมยอด (เดิมนับทุกสถานะ ทำให้ยอดรายได้/ภาษีเกินจริง)
const NON_EFFECTIVE_STATUS = ['cancelled', 'rejected'];
const isEffectiveDoc = (d) => !NON_EFFECTIVE_STATUS.includes(d.status);
// ปีภาษีของเอกสาร (ค.ศ.) ตามวันที่ออกเอกสารเวลาไทย ภาษีเงินได้บุคคลธรรมดาคิดรายปีปฏิทิน
const docYear = (d) => String(d.issueDate || bangkokDateStr(new Date(d.createdAt || Date.now()))).slice(0, 4);
api.get('/api/creator/summary', requireAuth(async (req, res) => {
  const allWht = await store.all('documents', (d) => d.userId === req.user.id && d.type === 'WHT');
  const qYear = new URL(req.url, 'http://localhost').searchParams.get('year') || '';
  const year = /^\d{4}$/.test(qYear) ? qYear : bangkokDateStr().slice(0, 4);
  // ประมาณการภาษีคิดเฉพาะปีภาษีที่เลือก (ค่าเริ่มต้น = ปีปัจจุบัน) เดิมรวมทุกปี ทำให้ประมาณการสูงผิดปกติตั้งแต่ปีที่ 2
  const docs = allWht.filter((d) => isEffectiveDoc(d) && docYear(d) === year);
  const gross = docs.reduce((s, d) => s + (Number(d.base) || 0), 0);
  const whtPaid = docs.reduce((s, d) => s + (Number(d.wht) || 0), 0);
  sendJson(res, 200, { taxYear: Number(year), documentCount: docs.length, grossIncome: round2(gross), withholdingPaid: round2(whtPaid), estimate: tax.estimatePersonalIncomeTax(gross, { withholdingPaid: whtPaid }), status: statusCounts(allWht) });
}));
api.get('/api/agency/summary', requireAuth(async (req, res) => {
  const docs = await store.all('documents', (d) => d.userId === req.user.id);
  const eff = docs.filter(isEffectiveDoc);
  // รายได้ = ใบเสร็จรับเงินที่ออกแล้ว · ค่าใช้จ่าย = ใบสำคัญจ่าย · ภาษีหัก ณ ที่จ่าย = 50 ทวิ ที่ออก (หรือใบสำคัญจ่ายที่ยังไม่ได้ออก 50 ทวิ)
  const receipts = eff.filter((d) => d.type === 'RECEIPT' || d.type === 'ETAX');
  const invoices = eff.filter((d) => d.type === 'INVOICE');
  const payments = eff.filter((d) => d.type === 'PAYMENT');
  const certs = eff.filter((d) => d.type === 'EWHT');
  const linked = new Set(certs.map((c) => c.refDocId).filter(Boolean));
  const whtTotal = certs.reduce((s2, d) => s2 + (+d.wht || 0), 0) + payments.filter((p) => !linked.has(p.id)).reduce((s2, d) => s2 + (+d.wht || 0), 0);
  sendJson(res, 200, {
    counts: { total: docs.length, invoices: invoices.length, receipts: receipts.length, payments: payments.length, whtCertificates: certs.length,
      eTaxInvoice: receipts.length, eWithholding: certs.length },
    totals: {
      revenue: round2(receipts.reduce((s2, d) => s2 + (+d.total || 0), 0)),
      billed: round2(invoices.reduce((s2, d) => s2 + (+d.total || 0), 0)),
      vat: round2(receipts.reduce((s2, d) => s2 + (+d.vat || 0), 0)),
      expense: round2(payments.reduce((s2, d) => s2 + (+d.base || 0), 0) + certs.filter((c) => !c.refDocId).reduce((s2, d) => s2 + (+d.subtotal || +d.base || 0), 0)),
      withholding: round2(whtTotal),
    },
    status: statusCounts(docs),
  });
}));

/* =========================================================
 * STATIC + 404 + ERROR HANDLING
 * ต้องลงทะเบียนหลังสุดของไฟล์เสมอ Express รัน middleware/route ตามลำดับ .use()/.get()/...
 * ถ้าย้ายขึ้นไปก่อน route ใดๆ ที่ประกาศไว้ด้านบน จะไปดักคำขอนั้นก่อนถึง route จริง
 * ========================================================= */
// เสิร์ฟไฟล์ในโฟลเดอร์ public/ ด้วย express.static ของจริง มีการป้องกัน path traversal และ
// ตีความ MIME type ในตัวอยู่แล้ว (ครอบคลุมกว่าตาราง MIME ที่เขียนเอง) index:'index.html' ทำให้ "/"
// คืนหน้าแรกเหมือนพฤติกรรมเดิม และจัดการ decodeURIComponent ของ URL ที่ผิดรูปแบบอย่างปลอดภัยในตัว
// (ปัญหาเดิมที่เคยทำให้โปรเซสทั้งตัวล่มด้วย URIError ที่ไม่มีใครจับ)
api.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

// ไม่มี route/ไฟล์ใดตรงเลย แยกรูปแบบ 404 ตามว่าเป็นคำขอเรียก API หรือเปิดหน้าเว็บ
api.use((req, res) => {
  if (req.path.startsWith('/api/')) return sendJson(res, 404, { error: 'ไม่พบ endpoint นี้' });
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>404</h1><a href="/">กลับหน้าแรก</a>');
});

// error-handling middleware ของ Express ต้องรับ 4 พารามิเตอร์ (err, req, res, next) เสมอ และต้องเป็น
// middleware ตัวสุดท้ายจริงๆ ดักทั้ง error จาก route handler (async throw/reject Express 5 จัดการ
// เด้งมาที่นี่ให้อัตโนมัติ ไม่ต้องห่อ try/catch เองแบบ router เดิม) และ error จาก express.json()
// เช่น ผู้เรียกส่ง body ที่ไม่ใช่ JSON ที่ถูกต้องมา
api.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return sendJson(res, 400, { error: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง (JSON)' });
  console.error('API error:', err);
  sendJson(res, err && err.statusCode ? err.statusCode : 500, { error: err && err.statusCode ? err.message : 'เกิดข้อผิดพลาดภายในระบบ' });
});

// แจ้งเตือนกำหนดยื่นภาษีล่วงหน้า เช็คตอนเริ่มระบบและทุก 12 ชั่วโมง แจ้งครั้งเดียวต่อรอบกำหนดยื่นหนึ่งๆ
// เท่านั้น (กันแจ้งซ้ำทุกครั้งที่เช็ค ด้วย dedupeKey = ประเภท+วันครบกำหนด ผูกไว้กับแจ้งเตือนที่เคยส่งแล้ว)
const TAX_REMINDER_WINDOW_DAYS = 7;
async function checkTaxReminders() {
  const today = bangkokDateStr();
  const users = await store.all('users', (u) => u.role !== 'admin' && !u.deleted);
  for (const user of users) {
    const deadlines = taxcalendar.upcomingDeadlines(user, today).filter((d) => d.daysLeft >= 0 && d.daysLeft <= TAX_REMINDER_WINDOW_DAYS);
    for (const d of deadlines) {
      const dedupeKey = `${d.key}-${d.dueDate}`;
      if (await store.findOne('notifications', (n) => n.userId === user.id && n.dedupeKey === dedupeKey)) continue;
      const when = d.daysLeft === 0 ? 'วันนี้' : d.daysLeft === 1 ? 'พรุ่งนี้' : `อีก ${d.daysLeft} วัน`;
      await notify(user.id, 'tax-deadline', `ใกล้ถึงกำหนด${d.label} ครบกำหนด ${d.dueDate} (${when})`, null, { dedupeKey });
    }
    // กิจกรรมปฏิทินที่ผู้ใช้ตั้งแจ้งเตือนล่วงหน้าไว้ (remindDays)
    for (const ev of await store.all('calendar_events', (e) => e.userId === user.id && !e.done && e.remindDays != null)) {
      const left = Math.round((Date.parse(ev.date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
      if (left < 0 || left > ev.remindDays) continue;
      const dedupeKey = `cal-${ev.id}-${ev.date}`;
      if (await store.findOne('notifications', (n) => n.userId === user.id && n.dedupeKey === dedupeKey)) continue;
      const when = left === 0 ? 'วันนี้' : left === 1 ? 'พรุ่งนี้' : `อีก ${left} วัน`;
      await notify(user.id, 'calendar', `กิจกรรมในปฏิทิน "${ev.title}" วันที่ ${ev.date} (${when})`, ev.linkDocId || null, { dedupeKey });
    }
  }
}

// เริ่มระบบ: ต้อง await งาน async ทั้งหมด (ต่อฐานข้อมูล/seed/ล้างข้อมูลหมดอายุ) ให้เสร็จก่อนเปิดรับ request จริง
async function main() {
  await store.ensureReady();
  const seeded = await seedUsers();
  // PDPA มาตรา 37(3): ลบข้อมูลที่พ้นระยะเวลาเก็บรักษาแล้ว ทำตอนเริ่มระบบและทุก 6 ชั่วโมง
  const purged = await pdpa.purgeExpired(store);
  setInterval(() => { pdpa.purgeExpired(store).catch((e) => console.error('purgeExpired error:', e)); }, 6 * 60 * 60 * 1000).unref();

  await checkTaxReminders().catch((e) => console.error('checkTaxReminders error:', e));
  setInterval(() => { checkTaxReminders().catch((e) => console.error('checkTaxReminders error:', e)); }, 12 * 60 * 60 * 1000).unref();

  api.listen(PORT, () => {
    console.log(`\n TaxFlow running ➜ http://localhost:${PORT}`);
    console.log(store.DB_FILE
      ? ` ฐานข้อมูล (SQLite): ${path.relative(process.cwd(), store.DB_FILE)}`
      : ` ฐานข้อมูล (PostgreSQL): ${(process.env.DATABASE_URL || '').replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@')}`);
    console.log(` คู่มือการใช้งาน: http://localhost:${PORT}/guide.html`);
    console.log(` ล้างข้อมูลหมดอายุตามนโยบายเก็บรักษา: OTP ${purged.otpRemoved} รายการ, แจ้งเตือน ${purged.notifyRemoved} รายการ, บัญชีที่ไม่ยืนยันอีเมลเกิน 24 ชม. ${purged.unverifiedRemoved || 0} บัญชี`);
    if (seeded.length) {
      console.log(`\n สร้างบัญชีผู้ใช้ตัวอย่างให้แล้ว (เข้าสู่ระบบเพื่อทดลองได้ทันที):`);
      for (const u of seeded) console.log(` • ${u.email} (${u.role}) รหัสผ่าน: ${u.password}`);
    }
    console.log('');
  });
}

main().catch((err) => {
  console.error('เริ่มระบบไม่สำเร็จ:', err);
  process.exit(1);
});
