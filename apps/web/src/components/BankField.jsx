/**
 * BankField.jsx ช่อง "ธนาคาร" แบบเลือกจากรายการ (ชื่อไทย + อังกฤษ) ใช้เหมือนกันทุกหน้า
 * เลือก "อื่น ๆ" แล้วมีช่องให้พิมพ์ชื่อธนาคารเอง · ค่าที่ส่งออกเป็นชื่อธนาคารเป็นข้อความเดียว (เก็บแบบเดิม)
 *   - เลือกจากรายการ → ชื่อไทยของธนาคารนั้น
 *   - อื่น ๆ + พิมพ์ชื่อ → ชื่อที่พิมพ์
 *   - อื่น ๆ แต่ยังไม่พิมพ์ → "อื่น ๆ" (คงสถานะให้ช่องพิมพ์ยังแสดงอยู่)
 * ข้อมูลเก่าที่เคยพิมพ์เอง (ไม่ตรงรายการ) แสดงเป็น "อื่น ๆ" พร้อมชื่อเดิมในช่องพิมพ์
 */
import { SelectField, TextField } from './ui.jsx';
import { OTHER_BANK, bankLabel, useBanks } from '../lib/banks.js';

export default function BankField({ id, label = 'ธนาคาร', value, onChange, onBlur, error, className }) {
  const banks = useBanks();
  const v = value || '';
  const known = banks.includes(v);
  const isOther = v === OTHER_BANK || (!!v && banks.length > 0 && !known);
  const selectValue = !v ? '' : isOther ? OTHER_BANK : v;

  return (
    <div className={className}>
      <SelectField
        id={id}
        label={label}
        placeholder="เลือกธนาคาร"
        value={selectValue}
        options={banks.map((b) => ({ value: b, label: bankLabel(b) }))}
        error={isOther ? undefined : error}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={isOther ? '!mb-2' : undefined}
      />
      {isOther && (
        <TextField
          id={`${id}-other`}
          label="ชื่อธนาคาร (ระบุ)"
          placeholder="เช่น ธนาคารไอซีบีซี (ไทย) / ICBC (Thai)"
          maxLength={100}
          autoFocus={v === OTHER_BANK}
          value={v === OTHER_BANK ? '' : v}
          error={error}
          onChange={(e) => onChange(e.target.value === '' ? OTHER_BANK : e.target.value)}
          onBlur={onBlur}
          className="tf-reveal"
        />
      )}
    </div>
  );
}
