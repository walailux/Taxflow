/**
 * StatusPill.jsx ป้ายสถานะเอกสาร: พื้นสีอ่อน + ตัวอักษร/จุดสีเข้มของสถานะนั้น
 * แยกกันได้ด้วยรูปทรงจุดด้วย (แบบร่าง/ยกเลิกเป็นจุดกลวง ยกเลิกมีขีดฆ่า) ไม่พึ่งสีอย่างเดียว
 */
import { STATUS_LABEL } from '../lib/format.js';
import { cx } from './ui.jsx';

const PILL = {
  draft: 'bg-[#F1EFED] text-[#57534E] ring-[#E2DED9]',
  pending: 'bg-[#FEF6E4] text-[#9A6700] ring-[#F5DFA8]',
  approved: 'bg-ok-soft text-[#15803D] ring-[#BFE6CD]',
  rejected: 'bg-danger-soft text-danger ring-[#F6C9C9]',
  cancelled: 'bg-[#F1EFED] text-[#78716C] ring-[#E2DED9] line-through decoration-[#A8A29E]',
  archived: 'bg-info-soft text-info ring-[#C9DDF0]',
};
const HOLLOW = { draft: true, cancelled: true };

export default function StatusPill({ status, size = 'md' }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset',
      size === 'sm' ? 'px-2.5 py-0.5 text-[0.8125rem]' : 'px-3 py-1 text-[0.875rem]', PILL[status] || PILL.draft)}>
      <i className={cx('size-2 shrink-0 rounded-full', HOLLOW[status] ? 'border-2 border-current bg-transparent' : 'bg-current')} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}
