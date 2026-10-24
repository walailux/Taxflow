/**
 * NameField.jsx ช่องชื่อบุคคลแบบแยก "ชื่อ" กับ "นามสกุล" (ผู้ลงนาม พยาน ผู้ส่งมอบ ฯลฯ)
 * ค่าที่ส่งออกยังเป็นข้อความเดียว "ชื่อ นามสกุล" ตามที่เก็บและพิมพ์บนเอกสารเดิม API และ PDF จึงไม่ต้องแก้
 * - แยกค่าที่มีอยู่: คำแรก = ชื่อ ที่เหลือ = นามสกุล
 * - เก็บสองช่องไว้ในสถานะของตัวเองระหว่างพิมพ์ (ช่องว่างท้ายคำไม่หาย) และรับค่าใหม่เมื่อถูกเปลี่ยนจากภายนอก
 *   เช่น เติมจากโปรไฟล์ / ดึงจากเอกสารเดิม
 */
import { useEffect, useRef, useState } from 'react';
import { Field, cx } from './ui.jsx';

const split = (v) => {
  const s = String(v || '').trim().replace(/\s+/g, ' ');
  const i = s.indexOf(' ');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
};
const join = (first, last) => [first.trim(), last.trim()].filter(Boolean).join(' ');

export default function NameField({ id, label, hint, error, value, onChange, onBlur, className }) {
  const [parts, setParts] = useState(() => split(value));
  const sent = useRef(join(...split(value)));

  // ค่าเปลี่ยนจากภายนอก (ไม่ใช่จากการพิมพ์ในช่องนี้) → แยกใหม่
  useEffect(() => {
    const v = String(value || '').trim().replace(/\s+/g, ' ');
    if (v !== sent.current) { sent.current = v; setParts(split(v)); }
  }, [value]);

  function set(i, text) {
    const next = i === 0 ? [text, parts[1]] : [parts[0], text];
    setParts(next);
    sent.current = join(...next);
    onChange(sent.current);
  }

  const invalid = error ? 'true' : 'false';
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <div className="grid grid-cols-2 gap-2">
        <input
          id={id}
          className="tf-input min-w-0"
          placeholder="ชื่อ"
          aria-label={`${label || ''} ชื่อ`.trim()}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          autoComplete="off"
          maxLength={100}
          value={parts[0]}
          onChange={(e) => set(0, e.target.value.replace(/\s/g, ''))}
          onBlur={onBlur}
        />
        <input
          id={`${id}-last`}
          className={cx('tf-input min-w-0')}
          placeholder="นามสกุล"
          aria-label={`${label || ''} นามสกุล`.trim()}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          autoComplete="off"
          maxLength={100}
          value={parts[1]}
          onChange={(e) => set(1, e.target.value)}
          onBlur={onBlur}
        />
      </div>
    </Field>
  );
}
