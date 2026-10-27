'use strict';
/**
 * http-account.test.js ยิง API จริง: บัญชีผู้ใช้และส่วนประกอบรอบเอกสาร
 * สมัคร/เข้าสู่ระบบด้วย OTP · โปรไฟล์ · KYC · แอดมิน · PDPA · API key/webhook · คู่ค้า · ปฏิทิน · คลังเอกสาร
 * แจ้งเตือน · แดชบอร์ด · เครื่องคำนวณภาษี · ข้อมูลระบบ
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pdpa = require('../lib/pdpa');
const totp = require('../lib/totp');
const { taxIdOf } = require('../scripts/sample-docs');
const { start, stop, call, otpFor, users, store, PNG_B64, PDF_B64 } = require('./helpers/http');

const ALL_CONSENT = pdpa.PURPOSES.map((p) => p.key);

before(start);
after(stop);

test('ข้อมูลระบบ: health, เมนู, ฟอนต์, ตัวเลือกโปรไฟล์ และเส้นทางที่ไม่มีอยู่', async () => {
  assert.equal((await call('GET', '/api/health')).status, 200);
  assert.equal((await call('GET', '/api')).status, 200);
  assert.equal((await call('GET', '/api/meta/doc-fonts')).status, 200);
  assert.equal((await call('GET', '/api/meta/profile-options')).status, 200);
  assert.equal((await call('GET', '/api/auth/providers')).body.google, null);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  const root = await call('GET', '/');
  assert.ok([200, 302].includes(root.status));
  const html = await call('GET', '/login', { headers: { accept: 'text/html' } });
  assert.ok([302, 404].includes(html.status));
});

test('กัน CSRF: คำขอเปลี่ยนข้อมูลจากโดเมนที่ไม่อนุญาตถูกปฏิเสธ · preflight', async () => {
  const bad = await call('POST', '/api/auth/logout', { headers: { origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
  const pre = await call('OPTIONS', '/api/auth/me', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(pre.status, 204);
  assert.equal((await call('OPTIONS', '/api/auth/me', { headers: { origin: 'https://evil.example' } })).status, 403);
  const bodyErr = await call('POST', '/api/auth/login', { body: '{not json', headers: { 'content-type': 'application/json' } });
  assert.equal(bodyErr.status, 400);
});

test('สมัครสมาชิก → ยืนยันอีเมลด้วย OTP → เข้าสู่ระบบด้วย OTP → ออกจากระบบ', async () => {
  const email = 'new-user@taxflow.test';
  assert.equal((await call('POST', '/api/auth/check-available', { body: { email } })).status, 200);
  const weak = await call('POST', '/api/auth/register', { body: { email, password: 'short', consent: ALL_CONSENT } });
  assert.equal(weak.status, 400);
  const noConsent = await call('POST', '/api/auth/register', { body: { email, password: 'Passw0rd123', consent: [] } });
  assert.equal(noConsent.status, 400);
  const reg = await call('POST', '/api/auth/register', {
    body: { email, password: 'Passw0rd123', passwordConfirm: 'Passw0rd123', role: 'creator', displayName: 'ผู้ใช้ใหม่', taxId: taxIdOf('110070955555'), consent: ALL_CONSENT },
  });
  assert.ok([200, 201].includes(reg.status), JSON.stringify(reg.body));
  const resend = await call('POST', '/api/auth/register/resend-otp', { body: { otpId: reg.body.otpId } });
  assert.ok([200, 429].includes(resend.status));
  const code = resend.status === 200 ? resend.body.devCode : reg.body.devCode;
  assert.equal((await call('POST', '/api/auth/register/verify-otp', { body: { otpId: reg.body.otpId, code: '000000' } })).status, 400);
  const verified = await call('POST', '/api/auth/register/verify-otp', { body: { otpId: reg.body.otpId, code } });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));

  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'wrong-pass1' } })).status, 401);
  const login = await call('POST', '/api/auth/login', { body: { email, password: 'Passw0rd123' } });
  assert.equal(login.status, 200);
  assert.ok(login.body.otpRequired);
  const again = await call('POST', '/api/auth/login/resend-otp', { body: { otpId: login.body.otpId } });
  const loginCode = again.status === 200 ? again.body.devCode : login.body.devCode;
  const ok = await call('POST', '/api/auth/login/verify-otp', { body: { otpId: login.body.otpId, code: loginCode } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const token = ok.headers.get('x-session-token');
  assert.ok(token);
  const me = await call('GET', '/api/auth/me', { token });
  assert.equal(me.body.user.email, email);
  assert.equal((await call('POST', '/api/auth/logout', { token })).status, 200);
  assert.equal((await call('POST', '/api/auth/logout-all', { token })).status, 200);
  assert.equal((await call('GET', '/api/notifications', { token })).status, 401, 'ออกจากทุกอุปกรณ์แล้ว token เดิมใช้ไม่ได้');
  assert.equal((await call('POST', '/api/auth/google', { body: { credential: 'x' } })).status >= 400, true);
});

test('แอป Authenticator (TOTP): ตั้งค่า ยืนยัน เข้าสู่ระบบ และปิด', async () => {
  const setup = await call('POST', '/api/totp/setup', { as: 'creator' });
  assert.equal(setup.status, 200);
  const secret = (await store.find('users', users.creator.id)).totpPendingSecret;
  assert.equal((await call('POST', '/api/totp/confirm', { as: 'creator', body: { code: '000000' } })).status, 400);
  assert.equal((await call('POST', '/api/totp/confirm', { as: 'creator', body: { code: totp.totpCode(secret) } })).status, 200);
  const login = await call('POST', '/api/auth/login', { body: { email: 'creator@taxflow.test', password: '123456' } });
  assert.ok(login.body.totpRequired);
  const ok = await call('POST', '/api/auth/login/totp', { body: { otpId: login.body.otpId, code: totp.totpCode(secret) } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await call('POST', '/api/totp/disable', { as: 'creator', body: { code: '000000' } })).status, 400);
  assert.equal((await call('POST', '/api/totp/disable', { as: 'creator', body: { code: totp.totpCode(secret) } })).status, 200);
});

test('โปรไฟล์: แก้ข้อมูล เปลี่ยนบัญชีธนาคารด้วย OTP โลโก้/ตราประทับ', async () => {
  const r = await call('PUT', '/api/auth/profile', { as: 'agency', body: { phone: '02-123-4567', tradeName: 'Media Agency ใหม่' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const bank = { bankName: 'ธนาคารกรุงไทย', accountNo: '999-9-99999-9', accountName: 'บริษัท มีเดีย เอเจนซี่ จำกัด' };
  const noOtp = await call('PUT', '/api/auth/profile', { as: 'agency', body: { bank } });
  assert.equal(noOtp.status, 400);
  const { otpId, code } = await otpFor('agency', 'change-bank');
  assert.equal((await call('PUT', '/api/auth/profile', { as: 'agency', body: { bank, otpId, code } })).status, 200);
  const clash = await call('PUT', '/api/auth/profile', { as: 'agency', body: { taxId: users.brand.taxId } });
  assert.ok([400, 409].includes(clash.status));

  assert.equal((await call('POST', '/api/auth/brand-image', { as: 'agency', body: { kind: 'logo' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/brand-image', { as: 'agency', body: { kind: 'logo', dataBase64: PNG_B64, mime: 'image/gif' } })).status, 415);
  const up = await call('POST', '/api/auth/brand-image', { as: 'agency', body: { kind: 'seal', dataBase64: PNG_B64, mime: 'image/png', filename: 'seal.png' } });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal((await call('GET', '/api/auth/brand-image/seal', { as: 'agency' })).status, 200);
  assert.equal((await call('DELETE', '/api/auth/brand-image/seal', { as: 'agency' })).status, 200);
  assert.equal((await call('GET', '/api/auth/brand-image/seal', { as: 'agency' })).status, 404);
});

test('ยืนยันตัวตน (KYC): อัปโหลด เปิดไฟล์ ลบ ส่งตรวจ และแอดมินอนุมัติ/ไม่อนุมัติ', async () => {
  const list = await call('GET', '/api/kyc', { as: 'brand' });
  assert.equal(list.status, 200);
  assert.ok(!list.body.required.some((r) => r.type === 'id_card'), 'นิติบุคคลใช้หนังสือรับรองบริษัท ไม่ต้องใช้บัตรประชาชน');
  const creatorKyc = await call('GET', '/api/kyc', { as: 'creator' });
  const idCard = creatorKyc.body.required.find((r) => r.type === 'id_card');
  assert.ok(idCard && idCard.required, 'อินฟลูเอนเซอร์ (บุคคลธรรมดา) ต้องแนบบัตรประชาชน');
  assert.equal(idCard.label, 'บัตรประจำตัวประชาชน');
  assert.equal((await call('POST', '/api/kyc', { as: 'brand', body: { docType: 'nope' } })).status, 400);
  const up = await call('POST', '/api/kyc', { as: 'brand', body: { docType: 'company_cert', dataBase64: PDF_B64, mime: 'application/pdf', filename: 'cert.pdf' } });
  assert.equal(up.status, 201);
  const file = await call('GET', `/api/kyc/${up.body.id}/file`, { as: 'brand' });
  assert.equal(file.status, 200);
  assert.ok(file.body.toString().startsWith('%PDF'), 'ไฟล์ที่เข้ารหัสไว้ต้องถอดกลับได้ตรงเดิม');
  assert.equal((await call('GET', `/api/kyc/${up.body.id}/file`, { as: 'admin' })).status, 200);
  assert.equal((await call('GET', `/api/kyc/${up.body.id}/file`, { as: 'creator' })).status, 404);
  // ส่งตรวจ: ถ้าหลักฐานหรือโปรไฟล์ยังไม่ครบ ระบบตอบเหตุผล แล้วตั้งสถานะรอตรวจเองเพื่อทดสอบฝั่งแอดมินต่อ
  const toPending = async () => {
    const submit = await call('POST', '/api/kyc/submit', { as: 'brand' });
    assert.ok([200, 400].includes(submit.status), JSON.stringify(submit.body));
    if (submit.status !== 200) await store.update('users', users.brand.id, { verifyStatus: 'pending' });
  };
  await toPending();

  const admin = await call('GET', '/api/admin/users?status=pending', { as: 'admin' });
  assert.equal(admin.status, 200);
  assert.equal((await call('GET', '/api/admin/users?etax=pending', { as: 'admin' })).status, 200);
  assert.equal((await call('GET', '/api/admin/users', { as: 'brand' })).status, 403);
  assert.equal((await call('GET', `/api/admin/users/${users.brand.id}`, { as: 'admin' })).status, 200);
  const verify = (body) => call('POST', `/api/admin/users/${users.brand.id}/verify`, { as: 'admin', body });
  assert.equal((await verify({ approve: false })).status, 400, 'ไม่อนุมัติต้องมีเหตุผล');
  assert.equal((await verify({ approve: false, note: 'เอกสารไม่ชัด' })).status, 200);
  assert.equal((await verify({ approve: true })).status, 400, 'ตอบไปแล้วต้องรอส่งใหม่');
  await toPending();
  assert.equal((await verify({ approve: true })).status, 200);
  const etax = (body) => call('POST', `/api/admin/users/${users.brand.id}/etax`, { as: 'admin', body });
  assert.equal((await etax({ revoke: true, note: 'ทดสอบ' })).status, 400, 'ยังไม่มีสิทธิ์ให้เพิกถอน');
  await store.update('users', users.brand.id, { etaxStatus: 'approved' });
  assert.equal((await etax({ revoke: true })).status, 400, 'เพิกถอนต้องมีเหตุผล');
  assert.equal((await etax({ revoke: true, note: 'ทดสอบ' })).status, 200);
  assert.equal((await call('GET', '/api/admin/users/999999', { as: 'admin' })).status, 404);
  assert.equal((await call('DELETE', `/api/kyc/${up.body.id}`, { as: 'brand' })).status, 200);
});

test('คู่ค้า: เพิ่ม ตรวจซ้ำ ค้นหา แก้ไข ส่งออก/นำเข้า CSV ลบ และคำขอเชื่อมบัญชี', async () => {
  const contact = { name: 'บริษัท ใหม่ จำกัด', taxId: taxIdOf('010555912345'), kind: 'brand', entityType: 'juristic', branch: 'สำนักงานใหญ่', email: 'new@taxflow.test' };
  assert.equal((await call('POST', '/api/contacts', { as: 'creator', body: { name: '' } })).status, 400);
  const add = await call('POST', '/api/contacts', { as: 'creator', body: contact });
  assert.equal(add.status, 201, JSON.stringify(add.body));
  const dup = await call('GET', `/api/contacts/check-duplicate?taxId=${contact.taxId}`, { as: 'creator' });
  assert.equal(dup.status, 200);
  assert.equal((await call('GET', `/api/contacts/lookup?q=${users.brand.taxId}`, { as: 'creator' })).status, 200);
  assert.equal((await call('GET', '/api/search?q=บริษัท', { as: 'creator' })).status, 200);
  assert.equal((await call('PUT', `/api/contacts/${add.body.id}`, { as: 'creator', body: { ...contact, phone: '02-000-0000' } })).status, 200);
  const csv = await call('GET', '/api/contacts/export.csv', { as: 'creator' });
  assert.equal(csv.status, 200);
  const imp = await call('POST', '/api/contacts/import', { as: 'creator', body: { csv: csv.body.toString('utf8') } });
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  assert.equal((await call('DELETE', `/api/contacts/${add.body.id}`, { as: 'creator' })).status, 200);
  assert.equal((await call('DELETE', `/api/contacts/${add.body.id}`, { as: 'creator' })).status, 404);

  assert.equal((await call('POST', '/api/contacts/link-request', { as: 'creator', body: { q: 'nobody@taxflow.test' } })).status, 404);
  const link = await call('POST', '/api/contacts/link-request', { as: 'creator', body: { q: 'brand@taxflow.test' } });
  assert.equal(link.status, 201, JSON.stringify(link.body));
  const notes = await call('GET', '/api/notifications', { as: 'brand' });
  const linkNote = notes.body.items.find((n) => n.kind === 'contact-link' || n.linkStatus === 'pending');
  if (linkNote) {
    assert.equal((await call('POST', `/api/contacts/link-request/${linkNote.id}/accept`, { as: 'brand' })).status, 200);
    assert.equal((await call('POST', `/api/contacts/link-request/${linkNote.id}/decline`, { as: 'brand' })).status, 409);
  }
  assert.equal((await call('GET', '/api/contacts', { as: 'brand' })).status, 200);
});

test('ปฏิทิน: เพิ่ม แก้ไข ไฟล์แนบ บันทึกบนกิจกรรมระบบ และลบ', async () => {
  assert.equal((await call('GET', '/api/calendar/meta', { as: 'creator' })).status, 200);
  assert.equal((await call('GET', '/api/calendar?from=2026-01-01&to=2026-12-31', { as: 'creator' })).status, 200);
  assert.equal((await call('POST', '/api/calendar', { as: 'creator', body: { title: '' } })).status, 400);
  const ev = await call('POST', '/api/calendar', { as: 'creator', body: { title: 'ประชุมลูกค้า', date: '2026-11-02', time: '10:00', endTime: '11:00', remindDays: 3 } });
  assert.equal(ev.status, 201, JSON.stringify(ev.body));
  assert.equal((await call('PUT', `/api/calendar/${ev.body.id}`, { as: 'creator', body: { title: 'ประชุมลูกค้า (เลื่อน)', date: '2026-11-03' } })).status, 200);
  const file = await call('POST', '/api/calendar/files', { as: 'creator', body: { eventId: ev.body.id, dataBase64: PNG_B64, mime: 'image/png', filename: 'บันทึก.png' } });
  assert.equal(file.status, 201, JSON.stringify(file.body));
  const fileId = file.body.file ? file.body.file.id : file.body.id;
  assert.equal((await call('GET', `/api/calendar/file?eventId=${ev.body.id}&fileId=${fileId}`, { as: 'creator' })).status, 200);
  assert.equal((await call('POST', '/api/calendar/files/delete', { as: 'creator', body: { eventId: ev.body.id, fileId } })).status, 200);
  const sys = await call('POST', '/api/calendar/overrides', { as: 'creator', body: { sysKey: 'sys:pnd3:2026-11', done: true, note: 'ยื่นแล้ว', marker: 'star', create: true } });
  assert.ok([200, 201].includes(sys.status), JSON.stringify(sys.body));
  await call('POST', '/api/calendar/files', { as: 'creator', body: { sysKey: 'sys:pnd3:2026-11', create: true, dataBase64: PDF_B64, mime: 'application/pdf' } });
  assert.equal((await call('DELETE', `/api/calendar/${ev.body.id}`, { as: 'creator' })).status, 200);
  assert.equal((await call('DELETE', `/api/calendar/${ev.body.id}`, { as: 'creator' })).status, 404);
  assert.equal((await call('GET', '/api/tax-calendar', { as: 'creator' })).status, 200);
});

test('คลังเอกสาร: อัปโหลด ค้นหา เปิดไฟล์ และลบ', async () => {
  assert.equal((await call('POST', '/api/library', { as: 'creator', body: {} })).status, 400);
  const up = await call('POST', '/api/library', { as: 'creator', body: { category: 'WHT50', dataBase64: PDF_B64, mime: 'application/pdf', title: '50 ทวิ ก.ย.', filename: 'wht.pdf' } });
  assert.equal(up.status, 201);
  assert.equal((await call('GET', '/api/library?category=WHT50&q=ทวิ', { as: 'creator' })).body.items.length, 1);
  assert.equal((await call('GET', `/api/library/${up.body.id}/file`, { as: 'creator' })).status, 200);
  assert.equal((await call('DELETE', `/api/library/${up.body.id}`, { as: 'creator' })).status, 200);
});

test('API key และ webhook สำหรับเชื่อมระบบภายนอก', async () => {
  assert.equal((await call('GET', '/api/integrations', { as: 'brand' })).status, 200);
  const key = await call('POST', '/api/integrations/api-key', { as: 'brand' });
  assert.equal(key.status, 201);
  const headers = { 'x-api-key': key.body.apiKey || key.body.key };
  assert.equal((await call('GET', '/api/v1/documents', { headers })).status, 200);
  assert.equal((await call('GET', '/api/v1/documents/999999', { headers })).status, 404);
  assert.equal((await call('GET', '/api/v1/contacts', { headers })).status, 200);
  assert.equal((await call('GET', '/api/v1/contacts')).status, 401);
  assert.equal((await call('GET', '/api/v1/contacts', { headers: { 'x-api-key': 'wrong' } })).status, 401);
  assert.equal((await call('DELETE', '/api/integrations/api-key', { as: 'brand' })).status, 200);

  assert.equal((await call('POST', '/api/integrations/webhook/test', { as: 'brand' })).status, 400);
  assert.equal((await call('PUT', '/api/integrations/webhook', { as: 'brand', body: { url: 'ftp://x' } })).status, 400);
  const hook = await call('PUT', '/api/integrations/webhook', { as: 'brand', body: { url: 'http://127.0.0.1:9/hook', enabled: true, events: ['document.approved'] } });
  assert.equal(hook.status, 200, JSON.stringify(hook.body));
  const ping = await call('POST', '/api/integrations/webhook/test', { as: 'brand' });
  assert.equal(ping.status, 200);
  assert.equal(ping.body.ok, false, 'ปลายทางปิดอยู่ ต้องรายงานว่าส่งไม่สำเร็จ');
  assert.equal((await call('DELETE', '/api/integrations/webhook', { as: 'brand' })).status, 200);
});

test('แดชบอร์ด สรุป วิเคราะห์ และภาษีเงินได้จากเอกสาร ทุกบทบาท', async () => {
  for (const as of ['creator', 'brand', 'agency']) {
    for (const url of ['/api/dashboard/trend', '/api/dashboard/analytics', '/api/dashboard/period?period=month', '/api/dashboard/period?period=year&year=2026',
      '/api/creator/summary', '/api/agency/summary', '/api/pit/from-documents', '/api/audit']) {
      const r = await call('GET', url, { as });
      assert.ok([200, 403].includes(r.status), `${as} ${url} ${r.status}`);
    }
  }
});

test('เครื่องคำนวณภาษี: หัก ณ ที่จ่าย VAT และภาษีเงินได้บุคคลธรรมดา', async () => {
  assert.equal((await call('POST', '/api/wht/calc', { body: { amount: 10000, rate: 3 } })).body.wht, 300);
  assert.equal((await call('POST', '/api/vat/calc', { body: { amount: 1000, rate: 7 } })).body.vat, 70);
  assert.equal((await call('POST', '/api/pit/estimate', { body: { grossIncome: 600000 } })).status, 200);
  assert.equal((await call('POST', '/api/pit/calculate', { body: { incomes: [{ type: '40(2)', amount: 600000 }] } })).status, 200);
});

test('แจ้งเตือน: อ่านทีละรายการและอ่านทั้งหมด', async () => {
  const list = await call('GET', '/api/notifications', { as: 'admin' });
  assert.equal(list.status, 200);
  if (list.body.items.length) assert.equal((await call('POST', `/api/notifications/${list.body.items[0].id}/read`, { as: 'admin' })).status, 200);
  assert.equal((await call('POST', '/api/notifications/999999/read', { as: 'admin' })).status, 404);
  assert.equal((await call('POST', '/api/notifications/read-all', { as: 'admin' })).status, 200);
});

test('PDPA: ความยินยอม ดาวน์โหลดข้อมูลของฉัน และลบบัญชี', async () => {
  assert.equal((await call('PUT', '/api/pdpa/consent', { as: 'agency', body: { consent: [] } })).status, 400);
  assert.equal((await call('PUT', '/api/pdpa/consent', { as: 'agency', body: { consent: ALL_CONSENT } })).status, 200);
  const mine = await call('GET', '/api/pdpa/my-data', { as: 'agency' });
  assert.equal(mine.status, 200);
  assert.equal((await call('POST', '/api/pdpa/delete-account', { as: 'agency', body: { password: 'wrong' } })).status, 401);
  assert.equal((await call('POST', '/api/pdpa/delete-account', { as: 'agency', body: { password: '123456', confirm: 'ไม่ใช่' } })).status, 400);
  const del = await call('POST', '/api/pdpa/delete-account', { as: 'agency', body: { password: '123456', confirm: 'ลบบัญชีของฉัน' } });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.ok(!(await call('GET', '/api/auth/me', { as: 'agency' })).body.user, 'ลบบัญชีแล้วต้องไม่มีผู้ใช้');
});
