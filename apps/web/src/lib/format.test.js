import { describe, expect, it } from 'vitest';
import { baht, thb, thDate, thDateTime, toneOfType, inkOfType, formatTaxId, maskAccount } from './format.js';
import { bankLabel, OTHER_BANK } from './banks.js';
import {
  ymd, addDays, diffDays, longDate, shortDate, relative, gridRange, shiftMonth, onDay, fileUrl,
} from '../features/calendar/calUtils.js';

describe('รูปแบบตัวเลขและวันที่', () => {
  it('จำนวนเงิน', () => {
    expect(baht(1234.5)).toBe('1,234.50');
    expect(baht('x')).toBe('0.00');
    expect(thb(10)).toBe('฿10.00');
  });

  it('วันที่ไทย (ค่าว่าง/ผิดรูปแบบเป็นขีด)', () => {
    expect(thDate('2026-09-29T00:00:00Z')).toMatch('2569');
    expect(thDate(new Date('2026-09-29T00:00:00Z'))).toMatch('2569');
    expect(thDate('')).toBe('-');
    expect(thDate('not a date')).toBe('-');
    expect(thDateTime('2026-09-29T07:05:00Z')).toMatch('14:05');
    expect(thDateTime(null)).toBe('-');
  });

  it('สีตามประเภท เลขผู้เสียภาษี และเลขบัญชี', () => {
    expect(toneOfType('NOPE')).toBe('#78716C');
    expect(inkOfType('NOPE')).toBe('#57534E');
    expect(typeof toneOfType('INVOICE')).toBe('string');
    expect(formatTaxId('1234567890123')).toBe('1-2345-67890-12-3');
    expect(formatTaxId('123')).toBe('123');
    expect(formatTaxId(null)).toBe('');
    expect(maskAccount('012-3-45678-9')).toBe('******6789');
    expect(maskAccount('12')).toBe('****');
    expect(maskAccount('')).toBe('');
  });

  it('ชื่อธนาคารสองภาษา', () => {
    expect(bankLabel('ธนาคารยูโอบี')).toBe('ธนาคารยูโอบี (UOB)');
    expect(bankLabel(OTHER_BANK)).toBe(`${OTHER_BANK} (Other)`);
    expect(bankLabel('ธนาคารที่ไม่รู้จัก')).toBe('ธนาคารที่ไม่รู้จัก');
  });
});

describe('ตัวช่วยปฏิทิน', () => {
  it('คำนวณวัน', () => {
    expect(ymd(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(diffDays('2026-01-01', '2026-01-11')).toBe(10);
    expect(longDate('2026-10-28')).toBe('วันพุธที่ 28 ตุลาคม 2569');
    expect(shortDate('2026-10-28')).toBe('28 ตุล. 69');
  });

  it('ข้อความระยะห่างจากวันนี้', () => {
    const t = '2026-10-28';
    expect(relative(t, t)).toBe('วันนี้');
    expect(relative(t, '2026-10-29')).toBe('พรุ่งนี้');
    expect(relative(t, '2026-10-27')).toBe('เมื่อวาน');
    expect(relative(t, '2026-11-02')).toBe('อีก 5 วัน');
    expect(relative(t, '2026-10-20')).toBe('เลยมา 8 วัน');
  });

  it('ตารางเดือน เลื่อนเดือน กิจกรรมหลายวัน และลิงก์ไฟล์แนบ', () => {
    expect(gridRange('2026-10')).toEqual({ start: '2026-09-27', end: '2026-11-07' });
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(onDay({ date: '2026-10-01', endDate: '2026-10-03' }, '2026-10-02')).toBe(true);
    expect(onDay({ date: '2026-10-01' }, '2026-10-02')).toBe(false);
    expect(fileUrl('', { source: 'system', id: 'sys:a' }, { id: 'f' })).toBe('/api/calendar/file?sysKey=sys%3Aa&fileId=f');
    expect(fileUrl('', { id: 5 }, { id: 'f' })).toBe('/api/calendar/file?eventId=5&fileId=f');
  });
});
