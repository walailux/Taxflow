'use strict';
/** ส่งออกรายงานเป็น CSV และ XLS — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { exporter, requireAuth, logAudit, sendJson,
} = require('../core/context');
const { filteredDocs, exportBrand, ownDoc,
} = require('../core/docs');

const docfile = require('../lib/docfile');

const api = express.Router();
api.get('/api/export/csv', requireAuth(async (req, res) => {
  const csv = exporter.toCSV(await filteredDocs(req), await exportBrand(req.user));
  await logAudit(req.user.id, null, 'export', 'ส่งออก CSV', req.user.displayName);
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="taxflow-documents.csv"' });
  res.end(csv);
}));
api.get('/api/export/xls', requireAuth(async (req, res) => {
  const xls = exporter.toXLS(await filteredDocs(req), await exportBrand(req.user));
  await logAudit(req.user.id, null, 'export', 'ส่งออก Excel', req.user.displayName);
  res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 'Content-Disposition': 'attachment; filename="taxflow-documents.xls"' });
  res.end('\uFEFF' + xls);
}));

// เอกสารฉบับเดียวเป็น Excel/CSV (หัวเอกสาร + รายการสินค้า/บริการ + ยอดสรุป) ปุ่มดาวน์โหลดในหน้าเอกสารทั้งหมด
api.get('/api/documents/:id/export.:fmt', requireAuth(async (req, res) => {
  const fmt = req.params.fmt;
  if (fmt !== 'xls' && fmt !== 'csv') return sendJson(res, 404, { error: 'ไม่รองรับรูปแบบไฟล์นี้' });
  const doc = await ownDoc(req);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const brand = await exportBrand(req.user);
  const name = docfile.downloadName(doc, fmt);
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  const disposition = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  await logAudit(req.user.id, doc.id, 'download', `ดาวน์โหลด ${fmt === 'xls' ? 'Excel' : 'CSV'} ${doc.docNo || '(ฉบับร่าง)'}`, req.user.displayName);
  if (fmt === 'csv') {
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': disposition, 'Cache-Control': 'private, no-store' });
    return res.end(exporter.docToCSV(doc, brand));
  }
  res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 'Content-Disposition': disposition, 'Cache-Control': 'private, no-store' });
  res.end('﻿' + exporter.docToXLS(doc, brand));
}));

module.exports = api;
