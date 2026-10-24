'use strict';
/** คลังเอกสารของผู้ใช้ — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { storage, store, filestore, magicbytes, readJsonBody, sendJson, requireAuth, logAudit,
} = require('../core/context');

const api = express.Router();

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
  const storedName = await storage.put(buf, LIB_ALLOWED_MIME[b.mime], { prefix: 'lib_' });
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
    const buf = await storage.get(l.storedName);
    res.writeHead(200, { 'Content-Type': l.mime, 'Content-Disposition': 'inline; filename="file"', 'Content-Length': buf.length });
    res.end(buf);
  } catch { sendJson(res, 404, { error: 'ไฟล์หาย' }); }
}));

api.delete('/api/library/:id', requireAuth(async (req, res) => {
  const l = await store.find('library', req.params.id);
  if (!l || l.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบไฟล์' });
  await storage.remove(l.storedName);
  await store.remove('library', l.id);
  await logAudit(req.user.id, null, 'library-del', `ลบเอกสาร "${l.title}" จากคลัง`, req.user.displayName);
  sendJson(res, 200, { deleted: true });
}));

module.exports = api;
