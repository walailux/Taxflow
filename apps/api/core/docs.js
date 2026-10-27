'use strict';
/** core/docs.js ตัวช่วยเกี่ยวกับเอกสาร/โปรไฟล์ ที่ route หลายไฟล์ใช้ร่วมกัน — ย้ายจาก server.js เดิม (WP1) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const profile = require('../lib/profile');
const thaiid = require('../lib/thaiid');
const storage = require('../lib/storage');
const docfile = require('../lib/docfile');
const docview = require('../lib/docview');
const qr = require('../lib/qr');
const { sendJson } = require('../lib/router');
const { PORT, bangkokDateStr, makeDocNo, snapshotVersion, logAudit } = require('./context');
const { pndCandidates, lockPndRows } = require('./pnd');


function profileMeta(user) {
  const c = profile.completeness(user);
  return {
    completeness: c,
    isJuristic: profile.isJuristic(user),
    branchLabel: profile.branchLabel(user),
    requiredKyc: profile.requiredKyc(user),
    // ใบกำกับภาษี/ใบรับอิเล็กทรอนิกส์ต้องจด VAT และได้รับสิทธิ์ e-Tax (แอดมินตรวจหลักฐานจากกรมสรรพากรแล้ว)
    canIssueEtax: !!user.vatRegistered && user.etaxStatus === 'approved',
    etaxStatus: user.etaxStatus || 'none',
  };
}


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


const BIZ_TYPES = ['RECEIPT', 'INVOICE', 'QUOTATION', 'PO', 'DELIVERY', 'PAYMENT'];
const CONTRACT_TYPES = ['CONTRACT_INF', 'CONTRACT_BRAND'];

// หาเอกสารของผู้ใช้จากเลขที่เอกสาร (ใช้ผูกช่อง "อ้างอิง")
function refResolver(user) {
  return async (types, docNo) => {
    const no = String(docNo || '').trim();
    if (!no) return null;
    return (await store.allWhere('documents', { userId: user.id }, (d) => types.includes(d.type) && d.docNo === no
      && !['cancelled'].includes(d.status)))[0] || null;
  };
}
// บริบทสำหรับตรวจข้อมูล: วันที่ปัจจุบันตามเวลาไทย + ค้นเอกสารของผู้ใช้เพื่อตรวจข้อมูลซ้ำ/อ้างอิง
function buildCtx(user, selfId = null) {
  return {
    today: bangkokDateStr(), selfId,
    resolveRef: refResolver(user),
    findDocs: (fn) => store.allWhere('documents', { userId: user.id }, (d) => fn(d)),
  };
}

const purposeOf = (b) => (['self', 'send', 'record'].includes(b.docPurpose) ? b.docPurpose : 'self');

// "วันนี้" ตามเวลาไทย ใช้ตัดสินว่าคำขอเกินกำหนดหรือยัง
// (เดิมใช้ toISOString() ซึ่งเป็น UTC ช่วง 00:00–07:00 น. จึงยังนับเป็นวันก่อนหน้า คำขอที่เพิ่งเกินกำหนดไม่ขึ้น "เกินกำหนด")
const todayStr = () => bangkokDateStr();

/** ข้อมูลสำคัญของเอกสารตามประเภท ให้ผู้รับเห็นได้ทันทีในกล่องรับเอกสารโดยไม่ต้องเปิด PDF */
function docSummary(doc) {
  const F = doc.fields || {};
  const items = Array.isArray(doc.items) ? doc.items : [];
  if (doc.type === 'EWHT') {
    return { kind: 'wht', amount: Number(F.amount ?? doc.base) || 0, wht: Number(doc.wht) || 0, rate: Number(doc.whtRate ?? F.whtRate) || 0,
      incomeType: doc.incomeType || '', incomeDesc: F.incomeDesc || '', payDate: F.payDate || '', pndForm: F.pndForm || '' };
  }
  if (doc.type === 'PAYMENT') {
    return { kind: 'payment', base: Number(doc.base) || 0, wht: Number(doc.wht) || 0, net: Number(doc.net) || 0, rate: F.hasWht ? Number(F.whtRate) || 0 : 0,
      payDate: F.payDate || '', payMethod: F.payMethod || '', transferRef: F.transferRef || '',
      items: items.slice(0, 20).map((x) => ({ name: x.name || '', amount: Number(x.amount) || 0 })) };
  }
  if (doc.type === 'CONTRACT_INF' || doc.type === 'CONTRACT_BRAND') {
    return { kind: 'contract', campaign: F.campaignName || '', startDate: F.startDate || '', endDate: F.endDate || '',
      submitDate: F.submitDate || '', postDate: F.postDate || '', installmentCount: Number(F.installmentCount) || 1,
      contentCount: Number(F.contentCount) || 0, platforms: Array.isArray(F.platforms) ? F.platforms : [],
      fee: Number(doc.base) || 0, whtRate: Number(F.whtRate) || 0, wht: Number(doc.wht) || 0 };
  }
  return { kind: 'items', base: Number(doc.base) || 0, vat: Number(doc.vat) || 0, total: Number(doc.total ?? doc.net) || 0,
    dueDate: F.dueDate || F.deliveryDate || F.validUntil || '',
    items: items.slice(0, 20).map((x) => ({ name: x.name || x.contentType || '', qty: x.qty ?? x.pieces ?? '', unit: x.unit || '', amount: Number(x.amount ?? (Number(x.qty) * Number(x.price))) || 0 })) };
}

function reqView(r, doc, from, to, today, savedReqIds) {
  return {
    id: r.id, docId: r.docId, purpose: r.purpose, message: r.message, dueDate: r.dueDate,
    signAs: r.signAs || '', status: r.status, sentAt: r.createdAt, respondedAt: r.respondedAt || null,
    declineReason: r.declineReason || '',
    overdue: !!(r.status === 'sent' && r.dueDate && r.dueDate < today),
    savedToLibrary: !!(savedReqIds && savedReqIds.has(r.id)),
    doc: doc ? { docNo: doc.docNo, type: doc.type, base: doc.base, total: doc.total ?? doc.net, party: doc.party || doc.buyer || doc.payee || doc.payer || '', status: doc.status, counterpartySigned: !!doc.counterpartySignature, summary: docSummary(doc) } : null,
    fromName: from ? (from.companyName || from.displayName) : '', fromEmail: from ? from.email : '',
    toName: to ? (to.companyName || to.displayName) : '', toEmail: to ? to.email : '',
  };
}

const reqPublic = async (r) => {
  const doc = await store.find('documents', r.docId);
  const from = await store.find('users', r.fromUserId);
  const to = await store.find('users', r.toUserId);
  return reqView(r, doc, from, to, todayStr());
};

/**
 * แปลงคำขอหลายรายการพร้อมกัน ดึงเอกสารและผู้ใช้ที่เกี่ยวข้องรวดเดียว
 * (เดิมเรียก reqPublic ทีละรายการ = อ่านฐานข้อมูล 3 ครั้งต่อคำขอ ช้าลงตามจำนวนเอกสารเมื่อใช้ Supabase)
 */
async function reqPublicMany(rows, viewerId) {
  if (!rows.length) return [];
  const docIds = new Set(rows.map((r) => r.docId));
  const userIds = new Set(rows.flatMap((r) => [r.fromUserId, r.toUserId]));
  const reqIds = new Set(rows.map((r) => r.id));
  const [docs, users, saved] = await Promise.all([
    store.all('documents', (d) => docIds.has(d.id)),
    store.all('users', (u) => userIds.has(u.id)),
    viewerId ? store.all('library', (l) => l.userId === viewerId && reqIds.has(l.sourceReqId)) : [],
  ]);
  const docById = new Map(docs.map((d) => [d.id, d]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const savedReqIds = new Set(saved.map((l) => l.sourceReqId));
  const today = todayStr();
  return rows.map((r) => reqView(r, docById.get(r.docId), userById.get(r.fromUserId), userById.get(r.toUserId), today, savedReqIds));
}


async function ownDoc(req) {
  const doc = await store.find('documents', req.params.id);
  if (!doc || doc.userId !== req.user.id) return null;
  return doc;
}

const ALLOWED_MIME = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_SIZE = 5 * 1024 * 1024;

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
// หน้าตรวจสอบเอกสารเป็นหน้า React (/verify-doc) ถ้าไม่ได้ตั้ง PUBLIC_BASE_URL ใช้โดเมนแรกของ WEB_ORIGINS (โดเมนหน้าเว็บ)
const PUBLIC_BASE_URL = stripTrailingSlashes((process.env.PUBLIC_BASE_URL || (process.env.WEB_ORIGINS || '').split(',')[0] || '').trim());
function verifyUrl(req, token) {
  const base = PUBLIC_BASE_URL || `http://${req.headers.host || `localhost:${PORT}`}`;
  return `${base}/verify-doc?token=${token}`;
}


/* ---------- โลโก้/ตราประทับสำหรับพิมพ์ลงบนเอกสาร ---------- */
// อ่านไฟล์ภาพของผู้ออกเอกสารแล้วแปลงเป็น data URI เพื่อฝังลงใน HTML ที่สั่งพิมพ์เป็น PDF
// (ต้องฝังเป็น data URI เพราะหน้าพิมพ์อาจถูกเปิดโดยผู้รับที่ไม่มีสิทธิ์เรียกไฟล์ของผู้ออกเอกสาร)
// WP4: อ่านไฟล์ผ่าน lib/storage.js จึงเป็น async ผู้เรียกทุกจุดต้อง await
async function brandDataUri(user, kind) {
  const meta = user && user[kind === 'seal' ? 'sealFile' : 'logoFile'];
  if (!meta || !meta.storedName) return null;
  try {
    const buf = await storage.get(meta.storedName);
    return `data:${meta.mime};base64,${buf.toString('base64')}`;
  } catch { return null; }
}
async function brandCtx(user) {
  return {
    logo: await brandDataUri(user, 'logo'),
    seal: await brandDataUri(user, 'seal'),
    branchText: profile.branchLabel(user),
    addressText: profile.formatAddress(user.addr || {}) || user.address || '',
    vatRegistered: !!user.vatRegistered,
    authName: user.authName || '',
    authPosition: user.authPosition || '',
  };
}


/* =========================================================
 * WP5: ออกไฟล์ PDF/A-3 จริงให้ปุ่ม PDF ทุกจุดในระบบ
 * ========================================================= */

/**
 * ออกไฟล์ PDF/A-3 (และ XML) ของเอกสารหนึ่งฉบับ ผ่าน lib/docfile.js ที่ cache ไว้บน Storage
 * @param {object} doc   เอกสาร
 * @param {object} owner ผู้ออกเอกสาร (ใช้โลโก้และตราประทับของเจ้าของเอกสาร ไม่ใช่ของคนที่เปิดดู)
 */
async function docFile(req, doc, owner) {
  const share = await store.findOne('shares', (s) => s.docId === doc.id);
  const brand = await brandCtx(owner);
  return docfile.getOrBuild(doc, {
    brand,
    verifyUrl: share ? verifyUrl(req, share.token) : '',
    bahtText: docview.bahtText,
    save: (file) => store.update('documents', doc.id, { file }),
  });
}

/** ชื่อไฟล์ใน Content-Disposition ต้องมีทั้งแบบ ASCII และแบบ UTF-8 เผื่อเบราว์เซอร์รุ่นเก่า */
function disposition(kind, name) {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * ส่งไฟล์ PDF/A-3 ให้เบราว์เซอร์   ?download=1 บังคับดาวน์โหลด (ค่าเริ่มต้นเปิดดูในแท็บใหม่)
 * API ตอบเฉพาะ JSON/ไฟล์ ไม่มีหน้า HTML: ถ้าสร้าง PDF ไม่ได้ (ยังไม่ได้ติดตั้งไลบรารี/ฟอนต์ หรือข้อมูล e-Tax ไม่ครบ)
 * ตอบ 503 พร้อมสาเหตุเป็น JSON ให้หน้าเว็บ React แสดงข้อความเอง
 * @returns {Promise<boolean>} true เมื่อส่ง PDF สำเร็จ (ให้ผู้เรียกบันทึก audit ได้ตรงกับสิ่งที่เกิดขึ้นจริง)
 */
async function sendDocPdf(req, res, doc, owner) {
  const q = new URL(req.url, 'http://localhost').searchParams;
  let out;
  try {
    out = await docFile(req, doc, owner);
  } catch (err) {
    console.error(`[pdf] สร้าง PDF ของเอกสาร ${doc.id} ไม่สำเร็จ:`, err.message);
    sendJson(res, 503, { error: `สร้างไฟล์ PDF/A-3 ไม่สำเร็จ (สาเหตุ: ${err.message})` });
    return false;
  }
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': out.pdf.length,
    'Content-Disposition': disposition(q.get('download') ? 'attachment' : 'inline', docfile.downloadName(doc, 'pdf')),
    // เอกสารมีข้อมูลส่วนบุคคล ห้ามให้ proxy หรือเบราว์เซอร์เครื่องสาธารณะเก็บสำเนาไว้
    'Cache-Control': 'private, no-store',
    'X-TaxFlow-Pdf': out.cached ? 'cached' : 'rendered',
  });
  res.end(out.pdf);
  return true;
}

/** ส่งไฟล์ XML ของเอกสาร e-Tax (ไฟล์เดียวกับที่แนบอยู่ใน PDF) */
async function sendDocXml(req, res, doc, owner) {
  const out = await docFile(req, doc, owner);
  if (!out.xml) return false;
  const buf = Buffer.from(out.xml, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Content-Length': buf.length,
    'Content-Disposition': disposition('attachment', out.xmlName || docfile.downloadName(doc, 'xml')),
    'Cache-Control': 'private, no-store',
  });
  res.end(buf);
  return true;
}


async function filteredDocs(req) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams;
  const type = p.get('type'), status = p.get('status');
  return (await store.allWhere('documents', { userId: req.user.id }, (d) => (!type || d.type === type) && (!status || d.status === status))).reverse();
}
// หัวรายงานที่ผู้ใช้ตั้งค่าเองได้ (ชื่อผู้ประกอบการ เลขผู้เสียภาษี ที่อยู่ สาขา และโลโก้)
async function exportBrand(user) {
  return {
    name: user.companyName || user.displayName || '',
    taxId: user.taxId ? thaiid.format(user.taxId) : '',
    address: profile.formatAddress(user.addr || {}) || user.address || '',
    branch: profile.branchLabel(user),
    logo: await brandDataUri(user, 'logo'),
  };
}


module.exports = {
  profileMeta, createDoc, ensureIssued, BIZ_TYPES, CONTRACT_TYPES, refResolver, buildCtx, purposeOf,
  todayStr, reqPublic, reqPublicMany, docSummary, ownDoc, ensureShare, PUBLIC_BASE_URL, verifyUrl,
  brandDataUri, brandCtx, filteredDocs, exportBrand, ALLOWED_MIME, MAX_SIZE,
  pndCandidates, lockPndRows,
  docFile, sendDocPdf, sendDocXml, disposition,
};
