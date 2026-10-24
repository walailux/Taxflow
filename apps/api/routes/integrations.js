'use strict';
/** API key, Webhook และ API ภายนอกรุ่น v1 — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const crypto = require('crypto');
// ใช้ยิงคำขอทดสอบ webhook ขาออก (POST /api/integrations/webhook/test)
// ตกหล่นไปตอนแยกไฟล์ใน WP1 ทำให้ปุ่ม "ทดสอบ webhook" ตอบ 500 (ReferenceError: http is not defined)
// พบจาก npm run test:api ที่ยิงคำขอจริงทุกเส้นทาง
const http = require('http');
const https = require('https');
const { store, auth, ratelimit, readJsonBody, sendJson, rateLimited, requireAuth, logAudit, docWebhookPayload,
  WEBHOOK_EVENTS,
} = require('../core/context');

const api = express.Router();

/* =========================================================
 * การเชื่อมต่อระบบภายนอก API key (ดึงข้อมูลเข้า) + Webhook (ส่งแจ้งเตือนออก)
 * สำหรับต่อกับโปรแกรมบัญชี/ระบบอื่นที่ผู้ใช้ดูแลเอง ไม่ใช่ความสัมพันธ์กับ TaxFlow โดยตรง
 * ========================================================= */
api.get('/api/integrations', requireAuth(async (req, res) => {
  const u = req.user;
  sendJson(res, 200, {
    apiKey: u.apiKeyHash ? { prefix: u.apiKeyPrefix || '', createdAt: u.apiKeyCreatedAt || null } : null,
    webhook: {
      url: u.webhookUrl || '', enabled: !!u.webhookEnabled,
      events: u.webhookEvents || WEBHOOK_EVENTS.slice(),
      hasSecret: !!u.webhookSecret,
    },
    availableEvents: WEBHOOK_EVENTS,
  });
}));

// สร้าง/สร้างใหม่ API key โชว์รหัสจริงให้เห็นครั้งเดียวตอนนี้เท่านั้น เก็บเฉพาะแฮชไว้ในฐานข้อมูล (เหมือนรหัสผ่าน)
api.post('/api/integrations/api-key', requireAuth(async (req, res) => {
  const key = 'tf_live_' + crypto.randomBytes(24).toString('hex');
  const apiKeyHash = crypto.createHash('sha256').update(key).digest('hex');
  await store.update('users', req.user.id, {
    apiKeyHash, apiKeyPrefix: key.slice(0, 14), apiKeyCreatedAt: new Date().toISOString(),
  });
  await logAudit(req.user.id, null, 'api-key-generate', 'สร้าง/สร้างใหม่ API key สำหรับเชื่อมระบบภายนอก', req.user.displayName);
  sendJson(res, 201, { key });
}));

api.delete('/api/integrations/api-key', requireAuth(async (req, res) => {
  await store.update('users', req.user.id, { apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null });
  await logAudit(req.user.id, null, 'api-key-revoke', 'เพิกถอน API key', req.user.displayName);
  sendJson(res, 200, { ok: true });
}));

api.put('/api/integrations/webhook', requireAuth(async (req, res) => {
  const b = await readJsonBody(req);
  const url = String(b.url || '').trim();
  if (url) {
    try { const u = new URL(url); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw 0; }
    catch { return sendJson(res, 400, { error: 'URL ไม่ถูกต้อง ต้องขึ้นต้นด้วย http:// หรือ https://' }); }
  }
  const events = Array.isArray(b.events) ? b.events.filter((e) => WEBHOOK_EVENTS.includes(e)) : WEBHOOK_EVENTS.slice();
  const patch = { webhookUrl: url, webhookEvents: events, webhookEnabled: !!b.enabled && !!url };
  if (!req.user.webhookSecret) patch.webhookSecret = crypto.randomBytes(24).toString('hex'); // สร้างครั้งแรกครั้งเดียว ใช้เซ็น HMAC ทุกครั้งถัดไป
  const u = await store.update('users', req.user.id, patch);
  await logAudit(req.user.id, null, 'webhook-update', `ตั้งค่า webhook: ${url || '(ปิดใช้งาน)'}`, req.user.displayName);
  sendJson(res, 200, { url: u.webhookUrl, enabled: u.webhookEnabled, events: u.webhookEvents, hasSecret: !!u.webhookSecret });
}));

api.delete('/api/integrations/webhook', requireAuth(async (req, res) => {
  await store.update('users', req.user.id, { webhookUrl: '', webhookEnabled: false, webhookSecret: null });
  await logAudit(req.user.id, null, 'webhook-remove', 'ปิดใช้งาน webhook', req.user.displayName);
  sendJson(res, 200, { ok: true });
}));

// ยิง event ทดสอบทันที เพื่อให้ผู้ใช้เห็นผลว่าปลายทางเชื่อมต่อได้จริงก่อนใช้งานจริง
api.post('/api/integrations/webhook/test', requireAuth(async (req, res) => {
  const u = req.user;
  if (!u.webhookUrl) return sendJson(res, 400, { error: 'ยังไม่ได้ตั้งค่า URL ปลายทาง' });
  let target;
  try { target = new URL(u.webhookUrl); } catch { return sendJson(res, 400, { error: 'URL ไม่ถูกต้อง' }); }
  const body = JSON.stringify({ event: 'ping', at: new Date().toISOString(), data: { message: 'TaxFlow webhook test' } });
  const sig = crypto.createHmac('sha256', u.webhookSecret || '').update(body).digest('hex');
  const mod = target.protocol === 'http:' ? http : https;
  const started = Date.now();
  const testReq = mod.request(target, {
    method: 'POST', timeout: 8000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-TaxFlow-Event': 'ping', 'X-TaxFlow-Signature': `sha256=${sig}` },
  }, (r) => {
    r.resume();
    sendJson(res, 200, { ok: r.statusCode < 400, status: r.statusCode, ms: Date.now() - started });
  });
  testReq.on('error', (e) => sendJson(res, 200, { ok: false, error: e.message }));
  testReq.on('timeout', () => { testReq.destroy(); sendJson(res, 200, { ok: false, error: 'ปลายทางไม่ตอบสนองภายใน 8 วินาที' }); });
  testReq.end(body);
}));

/* ---------- API ภายนอก (v1) auth ด้วย API key แทน session cookie สำหรับให้ระบบอื่นดึงข้อมูลอ่านอย่างเดียว ---------- */
function requireApiKey(handler) {
  return async (req, res) => {
    const key = req.headers['x-api-key'];
    if (rateLimited(res, `apikey:${ratelimit.clientIp(req)}`, 120, 10 * 60 * 1000, 'เรียก API ถี่เกินไป กรุณาลองใหม่ภายหลัง')) return;
    if (!key) return sendJson(res, 401, { error: 'ต้องระบุ API key ใน header X-Api-Key' });
    const hash = crypto.createHash('sha256').update(String(key)).digest('hex');
    // ใช้ findOne (สแกนด้วย JS) โดยตั้งใจ ไม่ใช่ store.where()/whereOne() apiKeyHash ไม่ใช่คอลัมน์ที่มีดัชนีจริง
    // (ดู lib/store.js) การใช้ where() กับคอลัมน์ที่ไม่มีดัชนีจะ fallback คืนแถวทั้งหมดแบบไม่กรอง ซึ่งจะเป็นช่องโหว่ยืนยันตัวตนร้ายแรง
    const user = await store.findOne('users', (u) => u.apiKeyHash === hash && !u.deleted);
    if (!user) return sendJson(res, 401, { error: 'API key ไม่ถูกต้องหรือถูกเพิกถอนแล้ว' });
    req.user = user;
    return handler(req, res);
  };
}
api.get('/api/v1/documents', requireApiKey(async (req, res) => {
  const items = (await store.all('documents', (d) => d.userId === req.user.id)).reverse().map(docWebhookPayload);
  sendJson(res, 200, { items });
}));
api.get('/api/v1/documents/:id', requireApiKey(async (req, res) => {
  const doc = await store.find('documents', req.params.id);
  if (!doc || doc.userId !== req.user.id) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  sendJson(res, 200, docWebhookPayload(doc));
}));
api.get('/api/v1/contacts', requireApiKey(async (req, res) => {
  const items = (await store.all('contacts', (c) => c.userId === req.user.id)).map(
    ({ id, name, kind, taxId, email, phone }) => ({ id, name, kind, taxId, email, phone })
  );
  sendJson(res, 200, { items });
}));

module.exports = api;
