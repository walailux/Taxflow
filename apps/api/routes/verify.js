'use strict';
/**
 * ตรวจสอบเอกสารสาธารณะผ่าน QR Code — แยกจาก server.js เดิมใน WP1
 * WP6: เพิ่มผลตรวจลายมือชื่อดิจิทัลของไฟล์ PDF จริง และให้อัปโหลดไฟล์ PDF มาตรวจเองได้
 */
const express = require('express');
const { store, sendJson, contentHash, rateLimited, ratelimit,
} = require('../core/context');
const { docFile } = require('../core/docs');
const pdfsign = require('../lib/pdfsign');

const api = express.Router();

/** ลายนิ้วมือใบรับรองปัจจุบันของระบบ ใช้บอกว่าไฟล์ถูกลงนามโดยระบบนี้จริงไหม */
const trustedFingerprint = () => {
  const s = pdfsign.systemSigner();
  return s ? s.fingerprint : null;
};

/** ตัดข้อมูลที่หน้าเว็บไม่ต้องใช้ออก เหลือเฉพาะผลที่ผู้ตรวจอ่านเข้าใจ */
function publicResult(v) {
  return {
    signed: v.signed,
    intact: v.intact,
    coversWhole: v.coversWhole,
    trusted: v.trusted,
    // ผ่านทุกข้อ = ไฟล์นี้ออกโดยระบบนี้และไม่ถูกแก้ไขตั้งแต่ลงนาม
    certValidAtSigning: v.certValidAtSigning,
    valid: v.signed && v.intact && v.coversWhole && v.trusted && v.certValidAtSigning,
    signerName: v.name,
    signedAt: v.signedAt,
    reason: v.reason,
    format: v.subFilter,
    certificate: v.signer,
    problems: v.problems,
    notes: v.notes || [],
  };
}

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

  // WP6: ตรวจลายมือชื่อดิจิทัลในไฟล์ PDF ที่ระบบออกจริง ไม่ใช่แค่ดูว่าในฐานข้อมูลบันทึกว่าลงนามแล้ว
  // จำกัดจำนวนครั้งเพราะเส้นทางนี้เปิดสาธารณะ และอาจต้องวาด PDF ใหม่ถ้าไฟล์ที่เก็บไว้เก่าแล้ว
  let digitalSignature = null;
  if (doc.signature && issuer && !rateLimited(res, `verify-pdf:${ratelimit.clientIp(req)}`, 30, 10 * 60 * 1000)) {
    try {
      const out = await docFile(req, doc, issuer);
      digitalSignature = publicResult(pdfsign.verify(out.pdf, { trustedFingerprint: trustedFingerprint() }));
    } catch (err) {
      digitalSignature = { signed: false, problems: [`ตรวจไฟล์ PDF ไม่ได้: ${err.message}`] };
    }
  }
  if (res.headersSent) return; // ถูกจำกัดจำนวนครั้ง ส่งคำตอบ 429 ไปแล้ว

  sendJson(res, 200, {
    valid: true, docNo: doc.docNo, type: doc.type, status: doc.status,
    counterparty: doc.buyer || doc.payee || doc.payer || (typeof doc.party === 'string' ? doc.party : '') || '',
    base: doc.base, total: doc.type === 'ETAX' ? doc.total : doc.net,
    signed: doc.signed, signerName: doc.signature ? doc.signature.signerName : null,
    signedAt: doc.signature ? doc.signature.signedAt : null,
    issuer: issuer ? (issuer.companyName || issuer.displayName) : '', createdAt: doc.createdAt,
    contentHash: currentHash, tampered,
    digitalSignature,
  });
});

/* ---------------------------------------------------------------------------
 * WP6: อัปโหลดไฟล์ PDF มาตรวจลายมือชื่อ (ไม่ต้องเข้าสู่ระบบ)
 * ใช้สาธิตเกณฑ์ตรวจรับของแผน: "แก้ไขไฟล์แม้เพียงไบต์เดียว การตรวจสอบต้องรายงานว่าไฟล์ถูกเปลี่ยนแปลง"
 * รับไฟล์เป็นเนื้อคำขอตรง ๆ (Content-Type: application/pdf) ไม่เก็บไฟล์ไว้ที่ใดเลย
 * ------------------------------------------------------------------------- */
const VERIFY_MAX_BYTES = 10 * 1024 * 1024;

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { code: 'TOO_LARGE' })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

api.post('/api/verify/pdf', async (req, res) => {
  if (rateLimited(res, `verify-upload:${ratelimit.clientIp(req)}`, 20, 10 * 60 * 1000)) return;
  let buf;
  try {
    buf = await readRaw(req, VERIFY_MAX_BYTES);
  } catch (err) {
    return sendJson(res, err.code === 'TOO_LARGE' ? 413 : 400, {
      error: err.code === 'TOO_LARGE' ? 'ไฟล์ใหญ่เกิน 10 MB' : 'อ่านไฟล์ไม่สำเร็จ',
    });
  }
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return sendJson(res, 400, { error: 'ไฟล์นี้ไม่ใช่ PDF' });
  }
  sendJson(res, 200, publicResult(pdfsign.verify(buf, { trustedFingerprint: trustedFingerprint() })));
});

module.exports = api;
