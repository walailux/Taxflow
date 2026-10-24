/**
 * api.js ตัวเรียก REST API ของ TaxFlow พร้อมจัดการ session (WP2)
 * ------------------------------------------------------------------
 * - แนบคุกกี้ทุกคำขอ (credentials: 'include') ใช้ได้ทั้งแบบ proxy ตอนพัฒนาและแบบข้ามโดเมนบนคลาวด์
 * - ทางสำรองของแผน WP1: ถ้า API เปิด AUTH_HEADER_MODE จะส่ง token มาทาง header X-Session-Token
 *   ที่นี่เก็บไว้ใน sessionStorage แล้วแนบกลับเป็น Authorization: Bearer ให้อัตโนมัติ
 *   (ถ้า API ไม่เปิดโหมดนี้ header จะไม่มา และไม่มีอะไรถูกเก็บ)
 * - ข้อผิดพลาดทุกแบบกลายเป็น ApiError ที่มี message ภาษาไทยจากเซิร์ฟเวอร์ + status + field
 *   หน้าจอจึงแสดงข้อความใต้ช่องที่เซิร์ฟเวอร์ระบุได้ทันที (เช่น อีเมลซ้ำ field: 'email')
 */
import { API_URL } from './env.js';

const TOKEN_KEY = 'tf_token';

function storage() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}
export function getToken() {
  try { return storage()?.getItem(TOKEN_KEY) || null; } catch { return null; }
}
export function setToken(t) {
  try { if (t) storage()?.setItem(TOKEN_KEY, t); } catch { /* โหมดส่วนตัวบางเบราว์เซอร์ห้ามเขียน */ }
}
export function clearToken() {
  try { storage()?.removeItem(TOKEN_KEY); } catch { /* ไม่มีอะไรต้องทำ */ }
}

function fallbackMessage(status) {
  if (status === 0) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจว่าเปิด API ไว้แล้ว (npm run dev) และอินเทอร์เน็ตใช้งานได้';
  if (status === 401) return 'กรุณาเข้าสู่ระบบ';
  if (status === 403) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  if (status === 404) return 'ไม่พบข้อมูลที่ต้องการ';
  if (status === 429) return 'ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
  if (status >= 500) return 'เซิร์ฟเวอร์ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';
  return `ทำรายการไม่สำเร็จ (รหัส ${status})`;
}

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || fallbackMessage(status));
    this.name = 'ApiError';
    this.status = status;
    this.field = (data && data.field) || null;
    this.data = data || {};
  }
}

/** แจ้งทั้งหน้าว่าเรียก API ไม่ได้ (ApiDownDialog ฟังอยู่) */
export const API_DOWN_EVENT = 'tf:api-down';
function notifyApiDown() {
  try { globalThis.dispatchEvent?.(new Event(API_DOWN_EVENT)); } catch { /* ทดสอบใน Node ไม่มี window */ }
}

export async function request(method, path, body, { signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    notifyApiDown();
    throw new ApiError(0, null);
  }
  if (res.headers.get('X-TaxFlow-Api-Down')) {
    notifyApiDown();
    throw new ApiError(0, null);
  }

  const issued = res.headers.get('X-Session-Token');
  if (issued) setToken(issued);

  let data = null;
  if ((res.headers.get('Content-Type') || '').includes('application/json')) {
    try { data = await res.json(); } catch { data = null; }
  }
  if (!res.ok) {
    if (res.status === 401) clearToken(); // token หมดอายุ/ถูกเพิกถอน ไม่ต้องส่งซ้ำอีก
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body = {}, opts) => request('POST', path, body, opts),
  put: (path, body = {}, opts) => request('PUT', path, body, opts),
  patch: (path, body = {}, opts) => request('PATCH', path, body, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts),
};
