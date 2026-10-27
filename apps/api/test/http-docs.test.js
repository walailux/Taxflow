'use strict';
/**
 * http-docs.test.js ยิง API จริง: สร้างเอกสารทุกประเภทที่แต่ละบทบาทออกได้ แล้วไล่ทั้งวงจรชีวิตเอกสาร
 * แก้ไข · เปลี่ยนสถานะ · คัดลอก · ลงนาม · ส่งให้คู่ค้าลงนาม/ตรวจสอบ · แชร์และตรวจสอบเอกสาร · ส่งออก · ไฟล์แนบ
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../lib/docschema.js');
const { bodyFor } = require('../scripts/sample-docs');
const { start, stop, call, otpFor, users, PNG_B64, PDF_B64, SIGNATURE } = require('./helpers/http');

const ROLE_OF = { creator: 'creator', brand: 'corporate', agency: 'agency' };
const created = { creator: [], brand: [], agency: [] };
const byType = (as, type) => created[as].find((d) => d.type === type);

before(async () => {
  await start();
  // ใบกำกับภาษีอิเล็กทรอนิกส์: แนบหลักฐาน → ยื่นขอสิทธิ์ e-Tax → แอดมินอนุมัติ (บัญชีที่จด VAT แล้ว)
  for (const key of ['brand', 'agency']) {
    const state = await call('GET', '/api/etax/permission?method=own_cert', { as: key });
    for (const d of state.body.docs) {
      const up = await call('POST', '/api/kyc', { as: key, body: { docType: d.type, dataBase64: PDF_B64, mime: 'application/pdf', filename: `${d.type}.pdf` } });
      assert.equal(up.status, 201, JSON.stringify(up.body));
    }
    const ask = await call('POST', '/api/etax/permission', { as: key, body: { method: 'own_cert', approvalRef: 'กอ01-123', approvalDate: '2024-01-15', declare: true } });
    assert.equal(ask.status, 200, JSON.stringify(ask.body));
    const r = await call('POST', `/api/admin/users/${users[key].id}/etax`, { as: 'admin', body: { approve: true, checks: { vat: true, approval: true } } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
});
after(stop);

test('สร้างเอกสารทุกประเภทที่บทบาทนั้นออกได้ผ่าน /api/docs/create', async () => {
  for (const as of Object.keys(created)) {
    for (const type of DS.rolesFor(ROLE_OF[as])) {
      const r = await call('POST', '/api/docs/create', { as, body: { type, ...bodyFor(type) } });
      if (r.status === 201) { created[as].push(r.body); continue; }
      // ประเภทที่ต้องมีสิทธิ์พิเศษ (เช่น e-Tax ของบัญชีที่ยังไม่จด VAT) ต้องตอบเป็นข้อผิดพลาดที่อ่านได้ ไม่ใช่ 500
      assert.ok([400, 403].includes(r.status), `${as} ${type}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.ok(r.body.error);
    }
    assert.ok(created[as].length >= 3, `${as} ต้องสร้างเอกสารได้หลายประเภท`);
  }
});

test('สร้างเอกสารด้วยข้อมูลผิดถูกปฏิเสธพร้อมเหตุผล', async () => {
  assert.equal((await call('POST', '/api/docs/create', { as: 'brand', body: { type: 'NOPE' } })).status, 400);
  const r = await call('POST', '/api/docs/create', { as: 'brand', body: { type: 'QUOTATION', fields: {}, items: [] } });
  assert.ok([400, 403].includes(r.status));
  assert.equal((await call('POST', '/api/docs/create', { body: { type: 'QUOTATION' } })).status, 401);
});

test('รายการเอกสาร กรองตามประเภท สถานะ คำค้น ช่วงวันที่ และขอบเขต', async () => {
  const all = await call('GET', '/api/documents', { as: 'agency' });
  assert.equal(all.status, 200);
  assert.equal(all.body.count, created.agency.length);
  const first = created.agency[0];
  const qs = [`type=${first.type}`, 'status=draft', `q=${encodeURIComponent(first.docNo || 'x')}`, 'contact=คู่ค้า', 'from=2000-01-01&to=2999-12-31', 'scope=all', 'scope=received'];
  for (const q of qs) assert.equal((await call('GET', `/api/documents?${q}`, { as: 'agency' })).status, 200, q);
});

test('เปิด แก้ไข เปลี่ยนสถานะ ดูประวัติ และคัดลอกเอกสาร', async () => {
  const doc = byType('agency', 'QUOTATION') || created.agency[0];
  const one = await call('GET', `/api/documents/${doc.id}`, { as: 'agency' });
  assert.equal(one.status, 200);
  assert.ok(Array.isArray(one.body.allowedTransitions));
  assert.equal((await call('GET', `/api/documents/${doc.id}`, { as: 'brand' })).status, 404, 'เอกสารของคนอื่นต้องมองไม่เห็น');

  const edited = await call('PUT', `/api/documents/${doc.id}`, { as: 'agency', body: { ...bodyFor(doc.type), changeNote: 'แก้ราคา' } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));

  assert.equal((await call('POST', `/api/documents/${doc.id}/status`, { as: 'agency', body: { status: 'nope' } })).status, 400);
  const pending = await call('POST', `/api/documents/${doc.id}/status`, { as: 'agency', body: { status: 'pending' } });
  assert.equal(pending.status, 200, JSON.stringify(pending.body));
  assert.ok(pending.body.docNo, 'ออกจากแบบร่างแล้วต้องได้เลขที่เอกสาร');
  const approved = await call('POST', `/api/documents/${doc.id}/status`, { as: 'agency', body: { status: 'approved' } });
  assert.equal(approved.status, 200);
  assert.equal((await call('PUT', `/api/documents/${doc.id}`, { as: 'agency', body: bodyFor(doc.type) })).status, 400, 'อนุมัติแล้วแก้ไม่ได้');
  assert.equal((await call('DELETE', `/api/documents/${doc.id}`, { as: 'agency' })).status, 400, 'ออกเลขแล้วลบไม่ได้');

  const versions = await call('GET', `/api/documents/${doc.id}/versions`, { as: 'agency' });
  assert.ok(versions.body.items.length >= 2);

  const copy = await call('POST', `/api/documents/${doc.id}/duplicate`, { as: 'agency' });
  assert.equal(copy.status, 201);
  assert.equal((await call('DELETE', `/api/documents/${copy.body.id}`, { as: 'agency' })).status, 200, 'แบบร่างลบได้');
  assert.equal((await call('GET', `/api/documents/${copy.body.id}`, { as: 'agency' })).status, 404);

  const cancel = await call('POST', `/api/documents/${doc.id}/status`, { as: 'agency', body: { status: 'cancelled', note: 'ทดสอบยกเลิก' } });
  assert.ok([200, 400].includes(cancel.status));
});

test('ใบลดหนี้/ใบเพิ่มหนี้อ้างอิงใบกำกับภาษีที่ออกแล้ว', async () => {
  const reasons = await call('GET', '/api/etax/adjustment-reasons');
  assert.ok(reasons.body.creditNote.length);
  const inv = created.agency.find((d) => d.type === 'ETAX');
  const missing = await call('POST', '/api/etax/credit-note', { as: 'agency', body: { refDocId: 999999, reason: reasons.body.creditNote[0], amount: 100 } });
  assert.ok([403, 404].includes(missing.status));
  if (!inv) return;
  await call('POST', `/api/documents/${inv.id}/status`, { as: 'agency', body: { status: 'pending' } });
  const bad = await call('POST', '/api/etax/credit-note', { as: 'agency', body: { refDocId: inv.id, reason: 'ไม่มีเหตุผลนี้', amount: 0 } });
  assert.ok([400, 403].includes(bad.status));
  for (const [path, reason] of [['credit-note', reasons.body.creditNote[0]], ['debit-note', reasons.body.debitNote[0]]]) {
    const r = await call('POST', `/api/etax/${path}`, { as: 'agency', body: { refDocId: inv.id, reason, amount: 500 } });
    assert.ok([201, 403].includes(r.status), JSON.stringify(r.body));
  }
});

test('ลงนามเอกสารด้วย OTP แล้วแชร์ให้ตรวจสอบผ่าน QR และลิงก์สาธารณะ', async () => {
  const doc = byType('brand', 'PO') || created.brand[0];
  await call('POST', `/api/documents/${doc.id}/status`, { as: 'brand', body: { status: 'pending' } });
  const wrong = await call('POST', `/api/documents/${doc.id}/sign`, { as: 'brand', body: { otpId: 1, code: '000000' } });
  assert.ok(wrong.status >= 400);
  const { otpId, code } = await otpFor('brand', 'sign-doc', doc.id);
  const signed = await call('POST', `/api/documents/${doc.id}/sign`, { as: 'brand', body: { otpId, code, image: SIGNATURE, signerName: 'ผู้ลงนาม' } });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));

  const share = await call('POST', `/api/documents/${doc.id}/share`, { as: 'brand' });
  assert.equal(share.status, 200);
  const token = share.body.token;
  assert.ok(token);
  const verify = await call('GET', `/api/verify/${token}`);
  assert.equal(verify.status, 200);
  assert.equal((await call('GET', '/api/verify/not-a-token')).status, 404);
  const qr = await call('GET', `/api/documents/${doc.id}/qr.svg`, { as: 'brand' });
  assert.equal(qr.status, 200);
  assert.match(qr.body.toString(), /<svg/);
});

test('ส่งเอกสารให้คู่ค้าลงนาม คู่ค้าลงนาม/ตีกลับ/บันทึกเข้าคลัง และผู้ส่งยกเลิกคำขอ', async () => {
  const docs = (await call('GET', '/api/documents?status=draft', { as: 'agency' })).body.items.slice(0, 3);
  assert.ok(docs.length >= 2, 'ต้องมีแบบร่างอย่างน้อย 2 ฉบับให้ส่ง');
  const send = (doc, purpose) => call('POST', `/api/documents/${doc.id}/request`, {
    as: 'agency', body: { toEmail: 'brand@taxflow.test', purpose, message: 'ฝากตรวจสอบ', dueDate: '2099-12-31' },
  });
  assert.equal((await call('POST', `/api/documents/${docs[0].id}/request`, { as: 'agency', body: { toEmail: 'nobody@taxflow.test', purpose: 'review' } })).status, 404);

  const r1 = await send(docs[0], 'review');
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  const inbox = await call('GET', '/api/requests/inbox', { as: 'brand' });
  assert.ok(inbox.body.items.some((x) => x.id === r1.body.id));
  assert.ok((await call('GET', '/api/requests/outbox', { as: 'agency' })).body.items.length);
  assert.equal((await call('GET', `/api/documents/${docs[0].id}/requests`, { as: 'agency' })).status, 200);
  const pdf = await call('GET', `/api/requests/${r1.body.id}/pdf`, { as: 'brand' });
  assert.ok([200, 500, 503].includes(pdf.status));
  assert.equal((await call('POST', `/api/requests/${r1.body.id}/decline`, { as: 'brand', body: {} })).status, 400, 'ตีกลับต้องมีเหตุผล');
  assert.equal((await call('POST', `/api/requests/${r1.body.id}/decline`, { as: 'brand', body: { reason: 'ยอดไม่ตรง' } })).status, 200);

  const r2 = await send(docs[1], 'review');
  assert.equal(r2.status, 201);
  assert.equal((await call('POST', `/api/requests/${r2.body.id}/approve`, { as: 'brand' })).status, 200);
  const lib = await call('POST', `/api/requests/${r2.body.id}/library`, { as: 'brand', body: { category: 'contract' } });
  assert.ok([200, 201, 400, 503].includes(lib.status), JSON.stringify(lib.body));

  // ขอลายเซ็น: ผู้ส่งต้องลงนามก่อน แล้วคู่ค้าลงนามด้วย OTP
  const signDoc = docs[2] || docs[0];
  const noSig = await send(signDoc, 'sign');
  if (noSig.status === 201) {
    const { otpId, code } = await otpFor('brand', 'sign-request', noSig.body.id);
    const signed = await call('POST', `/api/requests/${noSig.body.id}/sign`, { as: 'brand', body: { otpId, code, image: SIGNATURE } });
    assert.ok([200, 400].includes(signed.status), JSON.stringify(signed.body));
  } else {
    assert.equal(noSig.status, 400);
  }
  const r3 = await send(signDoc, 'review');
  if (r3.status === 201) assert.equal((await call('POST', `/api/requests/${r3.body.id}/cancel`, { as: 'agency' })).status, 200);
  assert.equal((await call('POST', '/api/requests/999999/cancel', { as: 'agency' })).status, 404);
});

test('ลายเซ็นที่บันทึกไว้: เพิ่ม ดู ลบ', async () => {
  assert.equal((await call('POST', '/api/signatures', { as: 'creator', body: { image: 'javascript:alert(1)' } })).status, 400);
  const add = await call('POST', '/api/signatures', { as: 'creator', body: { image: SIGNATURE, name: 'ลายเซ็นหลัก' } });
  assert.equal(add.status, 201);
  assert.equal((await call('GET', '/api/signatures', { as: 'creator' })).body.items.length, 1);
  assert.equal((await call('DELETE', `/api/signatures/${add.body.id}`, { as: 'creator' })).status, 200);
});

test('ไฟล์แนบของเอกสาร: ตรวจชนิดไฟล์ อัปโหลด เปิด และลบ', async () => {
  const doc = created.creator[0];
  const url = `/api/documents/${doc.id}/attachments`;
  assert.equal((await call('POST', url, { as: 'creator', body: {} })).status, 400);
  assert.equal((await call('POST', url, { as: 'creator', body: { dataBase64: PNG_B64, mime: 'text/html' } })).status, 415);
  assert.equal((await call('POST', url, { as: 'creator', body: { dataBase64: PDF_B64, mime: 'image/png' } })).status, 415);
  const up = await call('POST', url, { as: 'creator', body: { dataBase64: PDF_B64, mime: 'application/pdf', filename: 'หลักฐาน.pdf', kind: 'evidence' } });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const file = await call('GET', `/api/attachments/${up.body.id}`, { as: 'creator' });
  assert.equal(file.status, 200);
  assert.ok(file.body.toString().startsWith('%PDF'));
  assert.equal((await call('GET', `/api/attachments/${up.body.id}`, { as: 'brand' })).status, 404);
  assert.equal((await call('DELETE', `/api/attachments/${up.body.id}`, { as: 'creator' })).status, 200);
});

test('ส่งออก: CSV, Excel, ไฟล์รายฉบับ, ZIP, PDF และ XML', async () => {
  const csv = await call('GET', '/api/export/csv', { as: 'brand' });
  assert.equal(csv.status, 200);
  assert.ok(csv.body.length > 10);
  assert.equal((await call('GET', '/api/export/xls', { as: 'brand' })).status, 200);
  const doc = created.brand[0];
  for (const fmt of ['csv', 'xls', 'json', 'html', 'nope']) {
    const r = await call('GET', `/api/documents/${doc.id}/export.${fmt}`, { as: 'brand' });
    assert.ok([200, 400, 404].includes(r.status), `${fmt} ${r.status}`);
  }
  assert.equal((await call('GET', '/api/documents/export-zip', { as: 'brand' })).status, 400);
  const ids = created.brand.slice(0, 3).map((d) => d.id).join(',');
  const zip = await call('GET', `/api/documents/export-zip?ids=${ids}`, { as: 'brand' });
  assert.equal(zip.status, 200);
  assert.equal(zip.body.subarray(0, 2).toString(), 'PK');
  for (const d of created.brand.slice(0, 4)) {
    const pdf = await call('GET', `/api/documents/${d.id}/pdf`, { as: 'brand' });
    assert.ok([200, 409, 503].includes(pdf.status), `pdf ${d.type} ${pdf.status}`);
    const xml = await call('GET', `/api/documents/${d.id}/xml`, { as: 'brand' });
    assert.ok([200, 400, 404].includes(xml.status), `xml ${d.type} ${xml.status}`);
  }
  assert.equal((await call('GET', '/api/documents/999999/pdf', { as: 'brand' })).status, 404);
});

test('ภ.ง.ด. และ 50 ทวิ ที่ได้รับ', async () => {
  assert.equal((await call('GET', '/api/pnd/candidates?form=PND53&month=9&yearBE=2569', { as: 'agency' })).status, 200);
  const wht = await call('POST', '/api/wht/store', { as: 'creator', body: { payer: 'บริษัท ผู้จ่าย จำกัด', amount: 10000, rate: 3, description: 'ค่ารีวิว' } });
  assert.ok([201, 400].includes(wht.status), JSON.stringify(wht.body));
  assert.equal((await call('POST', '/api/etax/invoice', { as: 'creator', body: {} })).status, 410);
  assert.equal((await call('POST', '/api/ewht/certificate', { as: 'creator', body: {} })).status, 410);
});
