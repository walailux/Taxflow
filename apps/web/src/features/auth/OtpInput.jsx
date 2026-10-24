/**
 * OtpInput.jsx ช่องรหัส 6 หลักแบบแยกช่อง
 * พิมพ์แล้วเลื่อนไปช่องถัดไปเอง · วางรหัสทั้งชุดได้ · ลบแล้วถอยกลับ · ลูกศรซ้ายขวา
 * ช่องแรกรับ autofill one-time-code ที่เบราว์เซอร์เติมทั้ง 6 หลักในช่องเดียว แล้วกระจายให้เอง
 * state: 'idle' | 'error' (สั่น + ขอบแดง) | 'success' (เขียว)
 */
import { useEffect, useRef } from 'react';

const LEN = 6;

/**
 * ค่าที่ผู้ใช้เพิ่งใส่ลงช่องที่มีเลขอยู่แล้ว: พิมพ์เพิ่มหนึ่งตัวได้ค่า 2 ตัว (เลขเดิม + ใหม่ ทางใดทางหนึ่ง)
 * ส่วน autofill / วาง จะแทนค่าทั้งช่อง จึงใช้ค่านั้นทั้งหมด
 */
export function typedInto(old, raw) {
  if (old && raw.length === 2) return raw[0] === old ? raw[1] : raw[0];
  return raw;
}

export default function OtpInput({ value, onChange, onComplete, state = 'idle', disabled, autoFocus, describedBy, shakeKey }) {
  const refs = useRef([]);
  const digits = Array.from({ length: LEN }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus) refs.current[Math.min(value.length, LEN - 1)]?.focus();
    // โฟกัสครั้งแรก และทุกครั้งที่ล้างรหัส (กรอกผิด / ขอรหัสใหม่)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, shakeKey]);

  function commit(next) {
    const clean = next.replace(/\D/g, '').slice(0, LEN);
    onChange(clean);
    if (clean.length === LEN) onComplete?.(clean);
    return clean;
  }

  function onInput(i, raw) {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    // พิมพ์ทับหลักเดียวแก้เฉพาะช่องนั้น · วางหรือ autofill หลายหลักเติมตั้งแต่ช่องนี้เป็นต้นไป
    const next = value.slice(0, i).padEnd(i, ' ') + typed + value.slice(i + typed.length);
    const clean = commit(next);
    refs.current[Math.min(i + typed.length, clean.length, LEN - 1)]?.focus();
  }

  function onKeyDown(i, e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) commit(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) { commit(value.slice(0, i - 1) + value.slice(i)); refs.current[i - 1]?.focus(); }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault(); refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < LEN - 1) {
      e.preventDefault(); refs.current[i + 1]?.focus();
    }
  }

  function onPaste(i, e) {
    e.preventDefault();
    onInput(i, e.clipboardData.getData('text'));
  }

  return (
    <div
      key={shakeKey}
      className="tf-otp flex justify-center gap-2 sm:gap-2.5"
      data-state={state}
      role="group"
      aria-label="รหัสยืนยัน 6 หลัก"
      aria-describedby={describedBy}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="tf-otp-cell"
          inputMode="numeric"
          pattern="\d*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`หลักที่ ${i + 1}`}
          aria-invalid={state === 'error' ? 'true' : 'false'}
          maxLength={i === 0 ? LEN : 1}
          value={d}
          data-filled={d ? 'true' : 'false'}
          disabled={disabled}
          onChange={(e) => onInput(i, typedInto(d, e.target.value))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
