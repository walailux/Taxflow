/**
 * authApi.js เส้นทาง API ของการสมัคร / เข้าสู่ระบบ / OTP (routes/auth.js และ routes/meta.js)
 */
import { api, clearToken } from '../../lib/api.js';

const VERIFY_URL = {
  login: '/api/auth/login/verify-otp',
  register: '/api/auth/register/verify-otp',
  totp: '/api/auth/login/totp',
};
const RESEND_URL = {
  login: '/api/auth/login/resend-otp',
  register: '/api/auth/register/resend-otp',
};

export const authApi = {
  /** คืน null เมื่อยังไม่ได้เข้าสู่ระบบ (401) แทนการโยน error เพราะเป็นสถานะปกติ */
  async me() {
    try { return await api.get('/api/auth/me'); } catch (err) {
      if (err && err.status === 401) return null;
      throw err;
    }
  },
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  providers: () => api.get('/api/auth/providers'),
  google: (credential) => api.post('/api/auth/google', { credential }),
  register: (body) => api.post('/api/auth/register', body),
  checkAvailable: (payload) => api.post('/api/auth/check-available', payload),
  verify: (mode, otpId, code) => api.post(VERIFY_URL[mode] || VERIFY_URL.login, { otpId, code }),
  canResend: (mode) => !!RESEND_URL[mode],
  resend: (mode, otpId) => api.post(RESEND_URL[mode], { otpId }),
  profileOptions: () => api.get('/api/meta/profile-options'),
  async logout() {
    try { await api.post('/api/auth/logout'); } finally { clearToken(); }
  },
};
