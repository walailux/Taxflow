/**
 * format.js รูปแบบตัวเลข วันที่ และชื่อประเภท/สถานะเอกสาร ที่ใช้ร่วมทุกหน้า
 */

/** 1234.5 -> "1,234.50" */
export function baht(n) {
  return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 1234.5 -> "฿1,234.50" */
export const thb = (n) => `฿${baht(n)}`;

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** วันที่แบบไทย เช่น "29 ก.ย. 2569" (ปีพุทธศักราช เวลาไทย) */
export function thDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }) : '-';
}

/** วันเวลาแบบไทย เช่น "29 ก.ย. 2569 14:05" */
export function thDateTime(v) {
  const d = toDate(v);
  return d ? d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
}

export const DOC_LABEL = {
  WHT: 'หัก ณ ที่จ่าย (รับ)', ETAX: 'ใบกำกับภาษี (เดิม)', EWHT: 'หนังสือรับรอง 50 ทวิ',
  PND3: 'ข้อมูล ภ.ง.ด.3', PND53: 'ข้อมูล ภ.ง.ด.53',
  RECEIPT: 'ใบเสร็จรับเงิน', INVOICE: 'ใบแจ้งหนี้', QUOTATION: 'ใบเสนอราคา',
  PO: 'ใบสั่งซื้อ (PO)', DELIVERY: 'ใบส่งมอบงาน', PAYMENT: 'ใบสำคัญจ่าย',
  CONTRACT_INF: 'สัญญาจ้าง Influencer', CONTRACT_BRAND: 'สัญญากับ Brand', POA: 'หนังสือมอบอำนาจ',
  CREDIT_NOTE: 'ใบลดหนี้', DEBIT_NOTE: 'ใบเพิ่มหนี้',
  ETAX_INVOICE: 'ใบกำกับภาษีอิเล็กทรอนิกส์', ETAX_RECEIPT: 'ใบรับอิเล็กทรอนิกส์',
};

/**
 * สีประจำประเภทเอกสาร ใช้ร่วมกันทุกหน้า (กล่องรับเอกสาร เอกสารทั้งหมด ฯลฯ)
 * เลือกเป็นสีสดแยกเฉดกันชัด ๆ จะได้กวาดตาหาเอกสารที่ต้องการเจอเร็ว และไม่ใช้โทนม่วง/คราม
 * จัดเป็นตระกูลตามหมวดงาน: สัญญา = ชมพูแดง · ขาย/รายได้ = ส้มเหลืองเขียว · จ่าย/ภาษี = ฟ้าน้ำเงินเขียวน้ำทะเล
 */
export const TYPE_TONE = {
  CONTRACT_INF: '#E11D48', CONTRACT_BRAND: '#DB2777', POA: '#BE123C',
  QUOTATION: '#0EA5E9', INVOICE: '#F97316', RECEIPT: '#22C55E', ETAX: '#FB923C',
  PO: '#CA8A04', DELIVERY: '#06B6D4', PAYMENT: '#2563EB',
  EWHT: '#0D9488', WHT: '#14B8A6', PND3: '#0369A1', PND53: '#0284C7',
  CREDIT_NOTE: '#DC2626', DEBIT_NOTE: '#EA580C',
  ETAX_INVOICE: '#FB923C', ETAX_RECEIPT: '#16A34A',
};
/** สีของประเภทเอกสาร (ประเภทที่ไม่รู้จักใช้เทาอุ่นกลาง ๆ) */
export const toneOfType = (type) => TYPE_TONE[type] || '#78716C';

/**
 * เฉดเข้มคู่กันของแต่ละประเภท ใช้กับ "ตัวอักษร" เท่านั้น
 * สีสดด้านบนสว่างเกินกว่าจะอ่านเป็นตัวหนังสือบนพื้นขาว (เช่น เขียว #22C55E ได้คอนทราสต์แค่ ~2.2:1)
 * จึงแยกเป็นอีกชุดที่ผ่านเกณฑ์ WCAG AA ส่วนแถบสี จุด ไอคอน และเงา ยังใช้สีสดตามเดิม
 */
export const TYPE_INK = {
  CONTRACT_INF: '#BE123C', CONTRACT_BRAND: '#BE185D', POA: '#9F1239',
  QUOTATION: '#0369A1', INVOICE: '#C2410C', RECEIPT: '#15803D', ETAX: '#C2410C',
  PO: '#A16207', DELIVERY: '#0E7490', PAYMENT: '#1D4ED8',
  EWHT: '#0F766E', WHT: '#0F766E', PND3: '#075985', PND53: '#0369A1',
  CREDIT_NOTE: '#B91C1C', DEBIT_NOTE: '#C2410C',
};
/** สีตัวอักษรของประเภทเอกสาร (อ่านได้บนพื้นขาว) */
export const inkOfType = (type) => TYPE_INK[type] || '#57534E';

export const STATUS_LABEL = {
  draft: 'แบบร่าง', pending: 'รอตรวจสอบ', approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิก', archived: 'เก็บถาวร', issued: 'ออกแล้ว', stored: 'จัดเก็บแล้ว',
};

/** สีป้ายสถานะ (คลาส Tailwind) */
export const STATUS_TONE = {
  draft: 'bg-[#F1EEEB] text-ink-soft',
  pending: 'bg-[#FFF4DB] text-[#8A5A00]',
  approved: 'bg-ok-soft text-ok',
  rejected: 'bg-danger-soft text-danger',
  cancelled: 'bg-[#F1EEEB] text-[#8A847E] line-through',
  archived: 'bg-info-soft text-info',
  issued: 'bg-ok-soft text-ok',
  stored: 'bg-info-soft text-info',
};

/** 1234567890123 -> "1-2345-67890-12-3" */
export function formatTaxId(id) {
  const d = String(id || '').replace(/\D/g, '');
  return d.length === 13 ? `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}` : String(id || '');
}

/** ปิดบังเลขบัญชี เหลือ 4 ตัวท้าย (PDPA แสดงเท่าที่จำเป็น) */
export function maskAccount(no) {
  const d = String(no || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length < 4 ? '****' : '*'.repeat(d.length - 4) + d.slice(-4);
}
