/**
 * IncomeTypeHelp.jsx คำอธิบายประเภทเงินได้ มาตรา 40(2) กับ 40(8) สำหรับผู้ใช้ที่ไม่มีพื้นฐานภาษี
 * - INCOME_TYPE_OPTIONS: ตัวเลือกพร้อมคำอธิบายสั้นใต้ชื่อ (ใช้กับ SegGroup)
 * - IncomeTypeHelpButton: ลิงก์ "อ่านรายละเอียดเพิ่มเติม" เปิดบทความในศูนย์ความรู้ (แท็บใหม่ ฟอร์มที่กรอกค้างไว้ไม่หาย)
 *   เนื้อหาบทความอยู่ที่ features/info/knowledge.js id 'income-40'
 */
import { Link } from 'react-router';
import Icon from '../../components/Icon.jsx';

export const INCOME_TYPE_OPTIONS = [
  { value: 'มาตรา 40(2)', label: 'มาตรา 40(2)', desc: 'รับจ้างทำงานให้ เช่น ค่ารีวิว ค่าโปรโมต ค่าพิธีกร โดยไม่ได้ลงทุนอุปกรณ์หรือจ้างทีมงานเอง' },
  { value: 'มาตรา 40(8)', label: 'มาตรา 40(8)', desc: 'รับจ้างทำของหรือทำธุรกิจที่ลงทุนเอง เช่น ผลิตคอนเทนต์ครบวงจร จ้างทีม เช่าอุปกรณ์/สตูดิโอ' },
];

export const INCOME_TYPE_ARTICLE = '/guide/tax/income-40';

/** ลิงก์ "อ่านรายละเอียดเพิ่มเติม" วางใต้ตัวเลือกประเภทเงินได้ */
export function IncomeTypeHelpButton() {
  return (
    <Link to={INCOME_TYPE_ARTICLE} target="_blank" rel="noopener"
      className="-mt-2 mb-4 inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-[0.90625rem] font-medium text-orange-deep hover:underline">
      <Icon name="info" className="size-4" />อ่านรายละเอียดเพิ่มเติม
      <Icon name="external" className="size-3.5 opacity-70" />
    </Link>
  );
}
