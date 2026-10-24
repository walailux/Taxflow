'use strict';

/**
 * เชื่อมคู่ค้าที่มีบัญชี TaxFlow: ค้นบัญชี → ส่งคำขอ → คู่ค้ายอมรับ/ปฏิเสธ → ข้อมูลเข้าสมุดคู่ค้าของผู้ขอ
 * รันบน SQLite ในโฟลเดอร์ชั่วคราวเสมอ (ไม่แตะฐานข้อมูลจริง) และยิง HTTP เข้า router จริงพร้อม cookie session
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'taxflow-contactlink-'));
process.env.TAXFLOW_DATA_DIR = TMP;
delete process.env.DATABASE_URL;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-contact-link';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { store, auth } = require('../core/context');
const contacts = require('../routes/contacts');

let server, base, alice, bob;
const cookie = (u) => `tf_session=${auth.createToken({ uid: u.id, tv: 0 })}`;
async function call(u, method, url, body) {
  const r = await fetch(base + url, {
    method, headers: { cookie: cookie(u), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  if (store.ensureReady) await store.ensureReady();
  alice = await store.insert('users', { email: 'alice@agency.test', role: 'agency', displayName: 'อลิซ', companyName: 'บริษัท อลิซ เอเจนซี่ จำกัด', entityType: 'juristic' });
  bob = await store.insert('users', {
    email: 'bob@brand.test', role: 'corporate', displayName: 'บ็อบ', companyName: 'บริษัท บ็อบ แบรนด์ จำกัด', entityType: 'juristic',
    taxId: '0105556000013', branchType: 'head', phone: '021234567', address: '1 ถนนสุขุมวิท กรุงเทพมหานคร 10110',
    bank: { bankName: 'ธนาคารกสิกรไทย', accountNo: '1234567890', accountName: 'บ็อบ' },
  });
  const app = express();
  app.use(express.json()); // เหมือน lib/router.js ของเซิร์ฟเวอร์จริง
  app.use(contacts);
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server && server.close();
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ }
});

test('ค้นบัญชีด้วยอีเมล/เลขผู้เสียภาษี บอกแค่พบหรือไม่พบกับชื่อ', async () => {
  const byEmail = await call(alice, 'GET', '/api/contacts/lookup?q=BOB@brand.test');
  assert.equal(byEmail.body.found, true);
  assert.equal(byEmail.body.name, 'บริษัท บ็อบ แบรนด์ จำกัด');
  assert.equal(byEmail.body.kind, 'brand');
  assert.equal(byEmail.body.taxId, undefined, 'ยังไม่อนุญาต ห้ามเปิดข้อมูลอื่น');
  const byTax = await call(alice, 'GET', '/api/contacts/lookup?q=0-1055-56000-01-3');
  assert.equal(byTax.body.found, true);
  assert.equal((await call(alice, 'GET', '/api/contacts/lookup?q=nobody@x.test')).body.found, false);
});

test('ส่งคำขอ → ไปอยู่ในแจ้งเตือนของคู่ค้า · ส่งซ้ำระหว่างรอไม่สร้างคำขอใหม่', async () => {
  const r = await call(alice, 'POST', '/api/contacts/link-request', { q: 'bob@brand.test' });
  assert.equal(r.status, 201);
  const again = await call(alice, 'POST', '/api/contacts/link-request', { q: '0105556000013' });
  assert.equal(again.body.status, 'pending');
  const rows = await store.all('notifications', (n) => n.userId === bob.id && n.kind === 'contact_link');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].linkStatus, 'pending');
  assert.equal((await call(alice, 'GET', '/api/contacts/lookup?q=bob@brand.test')).body.status, 'pending');
});

test('คนอื่นตอบคำขอแทนคู่ค้าไม่ได้', async () => {
  const n = (await store.all('notifications', (x) => x.userId === bob.id && x.kind === 'contact_link'))[0];
  assert.equal((await call(alice, 'POST', `/api/contacts/link-request/${n.id}/accept`)).status, 404);
});

test('คู่ค้ายอมรับ → ข้อมูลที่ใช้ออกเอกสารเข้าสมุดคู่ค้าของผู้ขอ (ไม่รวมบัญชีธนาคาร) และแจ้งผู้ขอ', async () => {
  const n = (await store.all('notifications', (x) => x.userId === bob.id && x.kind === 'contact_link'))[0];
  const r = await call(bob, 'POST', `/api/contacts/link-request/${n.id}/accept`);
  assert.equal(r.body.status, 'accepted');
  const book = await store.all('contacts', (c) => c.userId === alice.id);
  assert.equal(book.length, 1);
  assert.equal(book[0].name, 'บริษัท บ็อบ แบรนด์ จำกัด');
  assert.equal(book[0].taxId, '0105556000013');
  assert.equal(book[0].branch, 'สำนักงานใหญ่');
  assert.equal(book[0].kind, 'brand');
  assert.equal(book[0].linkedUserId, bob.id);
  assert.equal(book[0].bankAccountNo, '');
  assert.ok((await store.all('notifications', (x) => x.userId === alice.id && x.kind === 'contact_linked')).length === 1);
  assert.equal((await call(bob, 'POST', `/api/contacts/link-request/${n.id}/accept`)).status, 409, 'ตอบซ้ำไม่ได้');
});

test('ขออัปเดตครั้งถัดไปแล้วยอมรับ → อัปเดตรายการเดิม ไม่สร้างซ้ำ และช่องที่ผู้ขอกรอกเองยังอยู่', async () => {
  const mine = (await store.all('contacts', (c) => c.userId === alice.id))[0];
  await store.update('contacts', mine.id, { note: 'ลูกค้าประจำ', bankAccountNo: '999' });
  await store.update('users', bob.id, { phone: '029999999' });
  await call(alice, 'POST', '/api/contacts/link-request', { q: 'bob@brand.test' });
  const n = (await store.all('notifications', (x) => x.userId === bob.id && x.kind === 'contact_link' && x.linkStatus === 'pending'))[0];
  await call(bob, 'POST', `/api/contacts/link-request/${n.id}/accept`);
  const book = await store.all('contacts', (c) => c.userId === alice.id);
  assert.equal(book.length, 1);
  assert.equal(book[0].phone, '029999999');
  assert.equal(book[0].note, 'ลูกค้าประจำ');
  assert.equal(book[0].bankAccountNo, '999');
});

test('คู่ค้าปฏิเสธ → ไม่มีข้อมูลเข้าสมุด และแจ้งผู้ขอ', async () => {
  const carol = await store.insert('users', { email: 'carol@creator.test', role: 'creator', displayName: 'แครอล', entityType: 'individual' });
  await call(alice, 'POST', '/api/contacts/link-request', { q: 'carol@creator.test' });
  const n = (await store.all('notifications', (x) => x.userId === carol.id && x.kind === 'contact_link'))[0];
  assert.equal((await call(carol, 'POST', `/api/contacts/link-request/${n.id}/decline`)).body.status, 'declined');
  assert.equal((await store.all('contacts', (c) => c.userId === alice.id && c.linkedUserId === carol.id)).length, 0);
  assert.ok((await store.all('notifications', (x) => x.userId === alice.id && x.kind === 'contact_declined')).length === 1);
});
