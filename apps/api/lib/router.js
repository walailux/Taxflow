'use strict';

/**
 * router.js สร้างแอป Express 5 จริงพร้อม middleware พื้นฐานที่ server.js ต้องการ
 * -------------------------------------------------------------------------------
 * เดิมไฟล์นี้เป็น router แบบเบาที่เขียนเองด้วย Node core (regex match เส้นทาง) ตอนนี้เปลี่ยนมาใช้
 * Express 5 ของจริงทั้งหมด แต่ยังคงชื่อฟังก์ชัน createRouter/readJsonBody/sendJson ไว้เหมือนเดิม
 * เพื่อให้ ~80 endpoint ใน server.js ไม่ต้องแก้โค้ดเลยสักจุดตอนย้ายมาใช้เฟรมเวิร์กจริง:
 * - createRouter() คืนค่าแอป Express ตรงๆ api.get/post/put/delete ที่ server.js เรียกอยู่เดิม
 * จึงเป็นเมธอดของ Express เองแบบเป๊ะๆ ไม่ใช่ของปลอม
 * - Express 5 รองรับ async route handler โดยตรง (ถ้า handler throw/reject จะเด้งเข้า
 * error-handling middleware ให้อัตโนมัติ) จึงไม่ต้องห่อ try/catch รอบ handler เองแบบ router เดิม
 * - readJsonBody(req) เหลือไว้เป็น async function ชื่อเดิม แต่ข้างในแค่คืน req.body ที่
 * express.json() แปลงให้เสร็จแล้วก่อนเข้า handler endpoint เดิมที่เรียก await readJsonBody(req)
 * ทั่วทั้งไฟล์จึงยังทำงานถูกต้องโดยไม่ต้องแก้แม้แต่บรรทัดเดียว
 */
const express = require('express');

function createRouter() {
  const app = express();
  app.use(express.json({ limit: '15mb' })); // จำกัดขนาด body ไว้ 15MB เท่าเดิม (เผื่อไฟล์แนบ/รูปเข้ารหัส base64)
  return app;
}

async function readJsonBody(req) { return req.body || {}; }

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

module.exports = { createRouter, readJsonBody, sendJson };
