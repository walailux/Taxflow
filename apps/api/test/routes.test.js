'use strict';
/**
 * routes.test.js เฝ้าระวังว่า "เส้นทาง API ทั้ง 111 เส้นของ ver17.2 ยังอยู่ครบ"
 * ----------------------------------------------------------------------------
 * ที่มา: WP1 แยก server.js เดิม 2,470 บรรทัดออกเป็นไฟล์ย่อยในโฟลเดอร์ routes/
 * ความเสี่ยงหลักของงานแยกไฟล์คือเส้นทางหล่นหายไปเงียบๆ โดยไม่มีอะไรฟ้อง
 * ไฟล์นี้จึงเทียบรายการเส้นทางที่ลงทะเบียนจริงกับ routes.expected.json ทุกครั้งที่รันทดสอบ
 *
 * ใช้ express ปลอมแทนของจริง เพื่อให้ทดสอบได้โดยไม่ต้อง npm install และไม่ต้องเปิดพอร์ต
 * เมื่อเพิ่มเส้นทางใหม่ (เช่น e-Tax Invoice ใน WP5) ให้เพิ่มลงใน routes.expected.json ด้วย
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');

function makeApp() {
  const app = (req, res, next) => (next ? next() : undefined);
  app._routes = [];
  for (const verb of ['get', 'post', 'put', 'patch', 'delete', 'all', 'options']) {
    app[verb] = (p) => { app._routes.push(`${verb.toUpperCase()} ${p}`); return app; };
  }
  app.use = (...args) => {
    for (const a of args) if (a && Array.isArray(a._routes)) app._routes.push(...a._routes);
    return app;
  };
  app.listen = () => ({ close() {} });
  app.set = () => app;
  return app;
}

const expressStub = Object.assign(makeApp, {
  json: () => (req, res, next) => next(),
  static: () => (req, res, next) => next(),
  Router: makeApp,
});

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'express') return 'express';
  return origResolve.call(this, request, ...rest);
};
require.cache.express = { id: 'express', filename: 'express', loaded: true, exports: expressStub };

const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'routes.expected.json'), 'utf8'));
const { api } = require('../server.js');
// เส้นทางของ API คือ /api และทุกเส้นที่ขึ้นต้นด้วย /api/
const actual = api._routes.filter((r) => / \/api(\/|$)/.test(r)).sort();

test('เส้นทาง API ที่ลงทะเบียนจริงตรงกับรายการอ้างอิงทุกเส้น', () => {
  const missing = expected.filter((r) => !actual.includes(r));
  const extra = actual.filter((r) => !expected.includes(r));
  assert.deepEqual(missing, [], `เส้นทางหายไป: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `มีเส้นทางเกินมาโดยไม่ได้บันทึกไว้: ${extra.join(', ')}`);
});

// ver17.2 มี 111 เส้น · WP5 เพิ่ม GET /api/documents/:id/xml · WP6 เพิ่ม POST /api/verify/pdf รวม 113
// เส้นทางที่เพิ่มใหม่ต้องบันทึกใน routes.expected.json เสมอ ตัวเลขนี้จึงตามรายการอ้างอิง
test('จำนวนเส้นทางเท่ากับรายการอ้างอิง (111 เส้นของ ver17.2 + ที่เพิ่มใน ver18)', () => {
  assert.equal(actual.length, expected.length);
  assert.ok(actual.length >= 111, 'เส้นทางเดิมของ ver17.2 ต้องไม่หายไป');
});

test('ไม่มีเส้นทางใดถูกลงทะเบียนซ้ำสองไฟล์', () => {
  const seen = new Set();
  const dup = actual.filter((r) => (seen.has(r) ? true : (seen.add(r), false)));
  assert.deepEqual(dup, [], `ลงทะเบียนซ้ำ: ${dup.join(', ')}`);
});
