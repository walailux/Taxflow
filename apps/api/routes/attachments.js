'use strict';
/** ไฟล์แนบของเอกสาร — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { storage, store, magicbytes, readJsonBody, sendJson, requireAuth, logAudit,
} = require('../core/context');
const { ownDoc, ALLOWED_MIME, MAX_SIZE,
} = require('../core/docs');

const api = express.Router();

/* =========================================================
 * ATTACHMENTS (upload / list / download / delete)
 * ========================================================= */


api.post('/api/documents/:id/attachments', requireAuth(async (req, res) => {
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const b = await readJsonBody(req);
  if (!b.dataBase64) return sendJson(res, 400, { error: 'ไม่พบไฟล์' });
  if (!ALLOWED_MIME[b.mime]) return sendJson(res, 415, { error: 'รองรับเฉพาะไฟล์ PDF, PNG, JPG, WEBP เท่านั้น' });
  const buf = Buffer.from(b.dataBase64, 'base64');
  if (buf.length > MAX_SIZE) return sendJson(res, 413, { error: 'ไฟล์มีขนาดเกิน 5 MB' });
  if (!magicbytes.matches(buf, b.mime)) return sendJson(res, 415, { error: 'ไฟล์ไม่ตรงกับชนิดที่แจ้ง กรุณาอัปโหลดไฟล์จริง' });
  const storedName = await storage.put(buf, ALLOWED_MIME[b.mime], { prefix: 'att_', mime: b.mime });
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
    const buf = await storage.get(a.storedName);
    res.writeHead(200, { 'Content-Type': a.mime, 'Content-Disposition': `inline; filename="file"`, 'Content-Length': buf.length });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'ไฟล์หาย' }); }
}));

api.delete('/api/attachments/:id', requireAuth(async (req, res) => {
  const a = await store.find('attachments', req.params.id);
  if (!a || a.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  await storage.remove(a.storedName);
  await store.remove('attachments', a.id);
  await logAudit(req.user.id, a.docId, 'delete-attachment', `ลบไฟล์แนบ ${a.filename}`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

module.exports = api;
