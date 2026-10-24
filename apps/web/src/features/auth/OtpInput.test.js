import { describe, expect, it } from 'vitest';
import { typedInto } from './OtpInput.jsx';

describe('ค่าที่ใส่ลงช่อง OTP', () => {
  it('ช่องว่าง ใช้ค่าที่ใส่ทั้งหมด', () => {
    expect(typedInto('', '5')).toBe('5');
    expect(typedInto('', '123456')).toBe('123456');
  });
  it('ช่องมีเลขแล้ว พิมพ์เพิ่มหนึ่งตัว ได้เลขใหม่ไม่ว่าเคอร์เซอร์อยู่ข้างไหน', () => {
    expect(typedInto('2', '28')).toBe('8');
    expect(typedInto('2', '82')).toBe('8');
  });
  it('ช่องมีเลขแล้ว แต่ autofill รหัสทั้งชุด ต้องได้ครบ 6 หลัก ไม่ตัดหลักแรกทิ้ง', () => {
    expect(typedInto('2', '949732')).toBe('949732');
  });
});
