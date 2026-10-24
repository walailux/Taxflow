'use strict';
/**
 * core/context.js ตัวช่วยกลางที่ route ทุกไฟล์ใช้ร่วมกัน
 * ย้ายมาจากส่วนหัวของ server.js เดิมโดยไม่แก้ตรรกะ (WP1)
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const store = require('./store');
const tax = require('../lib/tax');
const auth = require('../lib/auth');
const docview = require('../lib/docview');
const qr = require('../lib/qr');
const exporter = require('../lib/export');
const otp = require('../lib/otp');
const mailer = require('../lib/mailer');
const profile = require('../lib/profile');
const pdpa = require('../lib/pdpa');
const thaiid = require('../lib/thaiid');
const filestore = require('../lib/filestore');
const storage = require('../lib/storage');
const { readJsonBody, sendJson } = require('../lib/router');
const ratelimit = require('../lib/ratelimit');
const magicbytes = require('../lib/magicbytes');
const taxcalendar = require('../lib/taxcalendar');
const calendar = require('../lib/calendar');
const totp = require('../lib/totp');
const zip = require('../lib/zip');
const docbuild = require('../lib/docbuild');
const DS = require('../lib/docschema.js');

const PORT = process.env.PORT || 4000;

// ข้อ: apiKeyHash/webhookSecret ต้องไม่หลุดออกไปกับ response นี้เด็ดขาด เดิม publicUser() ตัดแค่
// passwordHash ทำให้ endpoint ที่ใช้ publicUser() ทุกจุด (รวม /api/admin/users/:id ที่แอดมินเรียกดูผู้ใช้อื่น)
// จะส่ง webhookSecret ตัวจริงออกไปด้วย ซึ่งใช้ปลอมลายเซ็น HMAC ของ webhook เจ้าของบัญชีได้ทันที
const publicUser = (u) => { if (!u) return null; const { passwordHash, apiKeyHash, webhookSecret, totpSecret, totpPendingSecret, ...r } = u; return { ...r, hasPassword: !!passwordHash }; };
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
  const payload = auth.verifyToken(auth.readToken(req));
  // token อื่นที่เซ็นด้วยกุญแจเดียวกัน (เช่น google-signup) ห้ามใช้แทน session
  if (!payload || payload.typ) return null;
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
  // WP5: ข้อมูลไฟล์ PDF/XML ที่ cache ไว้ (lib/docfile.js) ไม่ใช่เนื้อหาเอกสาร
  // ถ้าไม่ตัดออก แค่กดดู PDF หลังลงนามก็ทำให้หน้าตรวจสอบรายงานว่าเอกสารถูกแก้ไข
  'file',
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

// เอกสารที่นับ: ออกเลขที่แล้ว (ไม่ใช่แบบร่าง) และไม่ถูกยกเลิก/ตีกลับ
const isIssuedEffective = (d) => !!d.docNo && !['cancelled', 'rejected'].includes(d.status);

module.exports = {
  isIssuedEffective,
  store, tax, auth, docview, qr, exporter, otp, mailer, profile, pdpa, thaiid, filestore, storage,
  ratelimit, magicbytes, taxcalendar, calendar, totp, zip, docbuild, DS,
  readJsonBody, sendJson, PORT,
  publicUser, maskEmail, MAIL_SEND_ERROR, currentUser, rateLimited, requireAuth, requireAdmin,
  round2, bangkokDateStr, SIGNATURE_IMAGE_RE, isValidSignatureImage, CONTENT_HASH_EXCLUDE, contentHash,
  PREFIX, makeDocNo, VAT_RATE_FIXED, WHT_RATES, validWhtRate, taxIdError,
  validLineItems, lineItemErrors, validateDocument,
  snapshotVersion, logAudit, notify, WEBHOOK_EVENTS, docWebhookPayload, deliverWebhook,
  STATUS_FLOW, STATUS_LABEL, KYC_MIME, KYC_MAX, IMG_MIME, IMG_MAX,
};
