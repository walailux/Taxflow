import { beforeEach, describe, expect, it } from 'vitest';
import { clearGoogleSignup, loadGoogleSignup, saveGoogleSignup } from './googleSignup.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('ส่งต่อผลจาก Google ไปหน้าสมัคร', () => {
  beforeEach(() => { globalThis.sessionStorage = memoryStorage(); });

  it('บันทึกแล้วอ่านกลับได้ เก็บเฉพาะ token อีเมล และชื่อ', () => {
    saveGoogleSignup({ needsRegistration: true, signupToken: 't1', email: 'a@gmail.com', name: 'ก ข', extra: 'ห้ามเก็บ' }, 1000);
    const g = loadGoogleSignup(2000);
    expect(g).toMatchObject({ token: 't1', email: 'a@gmail.com', name: 'ก ข' });
    expect(g.extra).toBeUndefined();
  });
  it('ทิ้งก่อน token ฝั่ง API หมดอายุ (30 นาที)', () => {
    saveGoogleSignup({ signupToken: 't1', email: 'a@gmail.com' }, 0);
    expect(loadGoogleSignup(28 * 60 * 1000 - 1)).not.toBeNull();
    expect(loadGoogleSignup(28 * 60 * 1000 + 1)).toBeNull();
    expect(loadGoogleSignup(28 * 60 * 1000 - 1)).toBeNull(); // หมดแล้วถูกลบทิ้ง
  });
  it('ข้อมูลไม่ครบหรือเสียถือว่าไม่มี', () => {
    saveGoogleSignup({ signupToken: '', email: 'a@gmail.com' }, 0);
    expect(loadGoogleSignup(1)).toBeNull();
    globalThis.sessionStorage.setItem('tf_google_signup', '{bad json');
    expect(loadGoogleSignup(1)).toBeNull();
  });
  it('ล้างได้', () => {
    saveGoogleSignup({ signupToken: 't1', email: 'a@gmail.com' }, 0);
    clearGoogleSignup();
    expect(loadGoogleSignup(1)).toBeNull();
  });
});
