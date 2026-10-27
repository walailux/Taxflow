'use strict';
/** เครื่องคิดเลขภาษีและปฏิทินกำหนดยื่น — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, tax, taxcalendar, calendar, readJsonBody, sendJson, requireAuth, bangkokDateStr,
} = require('../core/context');

const pit = require('../../../packages/shared/pit.js');
const { pitSourcesFromDocs } = require('../core/pitdocs');

const api = express.Router();

// ปฏิทินกำหนดยื่นภาษีที่เกี่ยวข้องกับบทบาท/สถานะ VAT ของผู้ใช้รายนี้ (ดูรายละเอียดข้อจำกัดใน lib/taxcalendar.js)
api.get('/api/tax-calendar', requireAuth(async (req, res) => {
  sendJson(res, 200, { items: taxcalendar.upcomingDeadlines(req.user, bangkokDateStr()) });
}));

/* =========================================================
 * TAX CALC
 * ========================================================= */
api.post('/api/wht/calc', async (req, res) => { const { amount, rate } = await readJsonBody(req); sendJson(res, 200, tax.calcWithholding(amount, rate)); });
api.post('/api/vat/calc', async (req, res) => { const { amount, rate } = await readJsonBody(req); sendJson(res, 200, tax.calcVat(amount, rate)); });
api.post('/api/pit/estimate', async (req, res) => { const b = await readJsonBody(req); sendJson(res, 200, tax.estimatePersonalIncomeTax(b.grossIncome, b)); });

/* ---------- ภาษีเงินได้บุคคลธรรมดาแบบเต็ม (packages/shared/pit.js) ---------- */
// คำนวณจากข้อมูลที่ส่งมา: { year, incomes: { '40(2)': ... }, deductions: {...}, withholdingPaid }
api.post('/api/pit/calculate', async (req, res) => {
  const b = await readJsonBody(req);
  sendJson(res, 200, pit.calculate(b || {}));
});
// เงินได้และภาษีที่ถูกหักไว้จากเอกสารของผู้ใช้ในปีภาษีที่เลือก พร้อมรายการเอกสารต้นทางให้เลือกนับ/ไม่นับ
api.get('/api/pit/from-documents', requireAuth(async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams;
  const qYear = p.get('year') || '';
  const year = /^\d{4}$/.test(qYear) ? qYear : bangkokDateStr().slice(0, 4);
  const docs = await store.where('documents', { userId: req.user.id });
  sendJson(res, 200, { ...pitSourcesFromDocs(docs, year, p.get('issuedType') || '40(2)'), supportedYears: pit.SUPPORTED_YEARS });
}));

module.exports = api;
