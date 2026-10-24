import { describe, expect, it } from 'vitest';
import { homeUrl } from './home.js';

describe('ปลายทางหลังเข้าสู่ระบบ', () => {
  it('ทุกบทบาทยกเว้นผู้ดูแลระบบเข้าแดชบอร์ด React', () => {
    expect(homeUrl('creator')).toBe('/app/overview');
    expect(homeUrl('agency')).toBe('/app/overview');
    expect(homeUrl('corporate')).toBe('/app/overview');
    expect(homeUrl('admin')).toBe('/app/admin');
  });
  it('บัญชีที่เพิ่งสมัครไปหน้าโปรไฟล์เพื่ออัปโหลดเอกสารยืนยันตัวตน', () => {
    expect(homeUrl('creator', { isNew: true })).toBe('/app/profile');
    expect(homeUrl('agency', { isNew: true })).toBe('/app/profile');
  });
});
