'use strict';
/** การแจ้งเตือนและบันทึกการใช้งาน — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, sendJson, requireAuth,
} = require('../core/context');

const api = express.Router();

/* =========================================================
 * NOTIFICATIONS
 * ========================================================= */
api.get('/api/notifications', requireAuth(async (req, res) => {
  // เรียงจากใหม่ไปเก่าตามเวลาเกิดเหตุการณ์จริง (ไม่ใช่ลำดับ id) แล้วแนบสถานะคำขอให้การแจ้งเตือนที่ผูกกับคำขอ
  const rows = (await store.all('notifications', (n) => n.userId === req.user.id))
    .sort((a, b) => String(b.at || b.createdAt || '').localeCompare(String(a.at || a.createdAt || '')) || b.id - a.id);
  // ดึงคำขอที่เกี่ยวข้องทั้งหมดในคำสั่งเดียว (เดิมยิง store.find ทีละรายการพร้อมกันทุกแจ้งเตือน
  // กินการเชื่อมต่อในพูลจนเต็ม คำขออื่นของหน้าเดียวกันรอจนหมดเวลา แล้วตอบ 500)
  const reqIds = new Set(rows.filter((n) => n.reqId).map((n) => Number(n.reqId)));
  const reqStatus = new Map();
  if (reqIds.size) {
    for (const r of await store.all('requests', (r) => reqIds.has(Number(r.id)))) reqStatus.set(Number(r.id), r.status);
  }
  const items = rows.map((n) => (n.reqId ? { ...n, reqStatus: reqStatus.get(Number(n.reqId)) || 'cancelled' } : n));
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

module.exports = api;
