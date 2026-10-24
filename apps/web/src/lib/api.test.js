import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, api, getToken } from './api.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

const realFetch = globalThis.fetch;
let calls;
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init); };
}

describe('ตัวเรียก API', () => {
  beforeEach(() => { globalThis.sessionStorage = memoryStorage(); });
  afterEach(() => { globalThis.fetch = realFetch; });

  it('ส่ง JSON แนบคุกกี้ และคืนข้อมูลที่ได้', async () => {
    mockFetch(() => jsonResponse(200, { ok: 1 }));
    expect(await api.post('/api/x', { a: 1 })).toEqual({ ok: 1 });
    expect(calls[0].url).toBe('/api/x');
    expect(calls[0].init.credentials).toBe('include');
    expect(calls[0].init.headers['Content-Type']).toBe('application/json');
    expect(calls[0].init.body).toBe('{"a":1}');
  });

  it('GET ไม่ส่ง body และไม่ตั้ง Content-Type', async () => {
    mockFetch(() => jsonResponse(200, {}));
    await api.get('/api/y');
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].init.headers['Content-Type']).toBeUndefined();
  });

  it('ข้อผิดพลาดใช้ข้อความภาษาไทยและ field จากเซิร์ฟเวอร์', async () => {
    mockFetch(() => jsonResponse(409, { error: 'อีเมลนี้ถูกใช้สมัครแล้ว', field: 'email' }));
    const err = await api.post('/api/auth/register', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.field).toBe('email');
    expect(err.message).toBe('อีเมลนี้ถูกใช้สมัครแล้ว');
  });

  it('เชื่อมต่อไม่ได้กลายเป็น ApiError status 0', async () => {
    mockFetch(() => { throw new TypeError('Failed to fetch'); });
    const err = await api.get('/api/z').catch((e) => e);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/เชื่อมต่อเซิร์ฟเวอร์ไม่ได้/);
  });

  it('คำตอบที่ไม่ใช่ JSON ยังได้ข้อความตาม status', async () => {
    mockFetch(() => new Response('<h1>502</h1>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
    const err = await api.get('/api/z').catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/เซิร์ฟเวอร์ขัดข้อง/);
  });

  it('AUTH_HEADER_MODE: เก็บ X-Session-Token แล้วแนบ Bearer คำขอถัดไป และล้างเมื่อได้ 401', async () => {
    mockFetch(() => jsonResponse(200, { user: {} }, { 'X-Session-Token': 'tok.sig' }));
    await api.post('/api/auth/login/verify-otp', {});
    expect(getToken()).toBe('tok.sig');

    mockFetch(() => jsonResponse(401, { error: 'กรุณาเข้าสู่ระบบ' }));
    await api.get('/api/auth/me').catch(() => {});
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok.sig');
    expect(getToken()).toBeNull();
  });
});
