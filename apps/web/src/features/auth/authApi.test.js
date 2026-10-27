import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authApi } from './authApi.js';
import { loadRegisterDraft, saveRegisterDraft, clearRegisterDraft } from './registerDraft.js';
import { docsApi } from '../docs/docsApi.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const realFetch = globalThis.fetch;
let calls;
function mockFetch(status = 200, body = { ok: true }) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method || 'GET', body: init.body });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

beforeEach(() => {
  globalThis.sessionStorage = memoryStorage();
  globalThis.localStorage = memoryStorage();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.localStorage;
});

describe('authApi', () => {
  it('me คืน null เมื่อยังไม่เข้าสู่ระบบ และโยน error อื่นต่อ', async () => {
    mockFetch(401, { error: 'กรุณาเข้าสู่ระบบ' });
    expect(await authApi.me()).toBeNull();
    mockFetch(500, { error: 'พัง' });
    await expect(authApi.me()).rejects.toThrow();
    mockFetch(200, { user: { id: 1 } });
    expect(await authApi.me()).toEqual({ user: { id: 1 } });
  });

  it('เรียกเส้นทางยืนยันรหัสตามโหมด', async () => {
    mockFetch();
    await authApi.login('a@b.c', 'x');
    await authApi.verify('register', 1, '123456');
    await authApi.verify('totp', 1, '123456');
    await authApi.verify('unknown', 1, '123456');
    await authApi.resend('login', 1);
    await authApi.providers();
    await authApi.google('cred');
    await authApi.register({ email: 'a@b.c' });
    await authApi.checkAvailable({ email: 'a@b.c' });
    await authApi.profileOptions();
    await authApi.logout();
    expect(calls.map((c) => c.url)).toEqual([
      '/api/auth/login', '/api/auth/register/verify-otp', '/api/auth/login/totp', '/api/auth/login/verify-otp', '/api/auth/login/resend-otp',
      '/api/auth/providers', '/api/auth/google', '/api/auth/register', '/api/auth/check-available', '/api/meta/profile-options', '/api/auth/logout',
    ]);
    expect(authApi.canResend('totp')).toBe(false);
    expect(authApi.canResend('register')).toBe(true);
  });
});

describe('docsApi', () => {
  it('ทุกคำสั่งชี้เส้นทางและเมธอดที่ถูกต้อง', async () => {
    mockFetch();
    await docsApi.list();
    await docsApi.list('type=INVOICE');
    await docsApi.get('7');
    await docsApi.update(7, {});
    await docsApi.setStatus(7, 'approved');
    await docsApi.remove(7);
    await docsApi.duplicate(7);
    await docsApi.share(7);
    await docsApi.addAttachment(7, {});
    await docsApi.delAttachment(9);
    await docsApi.sign(7, {});
    await docsApi.savedSignatures();
    await docsApi.saveSignature({});
    await docsApi.delSignature(2);
    await docsApi.requests(7);
    await docsApi.sendRequest(7, {});
    await docsApi.cancelRequest(3);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/documents', 'GET /api/documents?type=INVOICE', 'GET /api/documents/7', 'PUT /api/documents/7', 'POST /api/documents/7/status',
      'DELETE /api/documents/7', 'POST /api/documents/7/duplicate', 'POST /api/documents/7/share', 'POST /api/documents/7/attachments',
      'DELETE /api/attachments/9', 'POST /api/documents/7/sign', 'GET /api/signatures', 'POST /api/signatures', 'DELETE /api/signatures/2',
      'GET /api/documents/7/requests', 'POST /api/documents/7/request', 'POST /api/requests/3/cancel',
    ]);
  });
});

describe('แบบร่างการสมัคร', () => {
  it('ไม่เก็บรหัสผ่าน ไม่เก็บฟอร์มว่าง และหมดอายุใน 7 วัน', () => {
    saveRegisterDraft({}, 1);
    expect(loadRegisterDraft()).toBeNull();
    saveRegisterDraft({ email: 'a@b.c', password: 'secret', password2: 'secret' }, 2);
    const d = loadRegisterDraft();
    expect(d.form).toEqual({ email: 'a@b.c' });
    expect(d.step).toBe(2);
    localStorage.setItem('tf_register_draft', JSON.stringify({ form: {}, savedAt: Date.now() - 8 * 864e5 }));
    expect(loadRegisterDraft()).toBeNull();
    localStorage.setItem('tf_register_draft', '{bad json');
    expect(loadRegisterDraft()).toBeNull();
    clearRegisterDraft();
    expect(localStorage.getItem('tf_register_draft')).toBeNull();
  });
});
