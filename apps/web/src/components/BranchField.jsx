/**
 * BranchField.jsx ช่อง "สำนักงานใหญ่ / สาขา" ของคู่ค้า
 * ใช้ Combobox ของเว็บแทนช่องข้อความเปล่า (ซึ่งเบราว์เซอร์จะเด้งกล่องประวัติการพิมพ์หน้าตาไม่เข้ากับเว็บ)
 * แนะนำ "สำนักงานใหญ่" และ "สาขาที่ 00001" (เลขสาขา 5 หลักตามรูปแบบที่ docschema ตรวจ) พิมพ์เลขสาขาเองได้
 */
import Combobox from './Combobox.jsx';
import { Field } from './ui.jsx';

const BRANCH_SUGGESTIONS = [
  { value: 'สำนักงานใหญ่', hint: 'เลขสาขา 00000' },
  { value: 'สาขาที่ 00001', hint: 'แก้เป็นเลขสาขาจริง 5 หลัก' },
];

export default function BranchField({ id, label, hint, error, value, onChange, onBlur, placeholder = 'สำนักงานใหญ่ หรือ สาขาที่ 00001' }) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Combobox
        id={id}
        value={value == null ? '' : value}
        suggestions={BRANCH_SUGGESTIONS}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={[hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </Field>
  );
}
