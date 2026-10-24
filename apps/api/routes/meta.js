'use strict';
/** เส้นทางทั่วไป: health check และตัวเลือกสำหรับฟอร์ม — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { profile, pdpa, sendJson,
} = require('../core/context');
const { version } = require('../package.json');

const api = express.Router();
/* =========================================================
 * META / AUTH
 * ========================================================= */
// หน้าแรกของ API: เปิด /api ตรง ๆ แล้วบอกว่าเป็น API อะไร และหน้าเว็บอยู่ที่ไหน (แทน 404)
// เปิดจากเบราว์เซอร์ (ขอ text/html) ส่งไปหน้าสถานะ React ที่หน้าแรกของพอร์ตนี้ (ดู server.js)
// โปรแกรมหรือหน้าเว็บที่เรียกด้วย fetch ยังได้ JSON ตามเดิม
const WEB_URL = (process.env.WEB_ORIGINS || 'http://localhost:5173').split(',')[0].trim();
api.get('/api', (req, res) => {
  if (req.accepts(['json', 'html']) === 'html') return res.redirect(302, '/');
  sendJson(res, 200, {
    name: 'TaxFlow API', status: 'ok', version,
    health: '/api/health',
    web: WEB_URL,
    note: 'พอร์ตนี้ให้บริการเฉพาะข้อมูล (JSON/ไฟล์) หน้าเว็บทั้งหมดเปิดที่ web',
  });
});

api.get('/api/health', (req, res) => {
  sendJson(res, 200, { status: 'ok', time: new Date().toISOString(), version, uptimeSec: Math.round(process.uptime()) });
});


// ข้อมูลประกอบสำหรับสร้างฟอร์ม (รายการจังหวัด ธนาคาร ประเภทนิติบุคคล ฯลฯ)


api.get('/api/meta/profile-options', (req, res) => sendJson(res, 200, {
  companyTypes: profile.COMPANY_TYPES,
  provinces: profile.PROVINCES,
  banks: profile.BANKS,
  kycTypes: profile.KYC_TYPES,
  roleLabels: profile.ROLE_LABEL,
  consentPurposes: pdpa.PURPOSES,
  consentVersion: pdpa.CONSENT_VERSION,
}));

module.exports = api;
