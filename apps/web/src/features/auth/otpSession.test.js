import { beforeEach, describe, expect, it } from 'vitest';
import { clearOtpSession, loadOtpSession, saveOtpSession } from './otpSession.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('รายการ OTP ที่รอยืนยัน', () => {
  beforeEach(() => { globalThis.sessionStorage = memoryStorage(); });

  it('บันทึกแล้วอ่านกลับได้ และไม่เก็บช่องอื่นนอกจากที่จำเป็น', () => {
    saveOtpSession({ otpId: 'o1', emailMasked: 'na***@x.com', devCode: '123456', password: 'ห้ามเก็บ' }, 'login', 1000);
    const ctx = loadOtpSession(2000);
    expect(ctx.otpId).toBe('o1');
    expect(ctx.mode).toBe('login');
    expect(ctx.devCode).toBe('123456');
    expect(ctx.password).toBeUndefined();
  });
  it('หมดอายุหลัง 10 นาที', () => {
    saveOtpSession({ otpId: 'o1' }, 'register', 0);
    expect(loadOtpSession(10 * 60 * 1000 + 1)).toBeNull();
  });
  it('โหมดที่ไม่รู้จักหรือข้อมูลเสียถือว่าไม่มี', () => {
    saveOtpSession({ otpId: 'o1' }, 'hack', 0);
    expect(loadOtpSession(1)).toBeNull();
    globalThis.sessionStorage.setItem('tf_otp', '{bad json');
    expect(loadOtpSession(1)).toBeNull();
  });
  it('ล้างได้', () => {
    saveOtpSession({ otpId: 'o1' }, 'totp', 0);
    clearOtpSession();
    expect(loadOtpSession(1)).toBeNull();
  });
});
