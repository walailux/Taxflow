/**
 * nav.js เมนูของแต่ละบทบาท ทุกลิงก์ไปหน้าจอภายในแอปต้องผ่าน viewLink() จุดเดียว
 */
export const ROLE_TAG = {
  creator: 'อินฟลูเอนเซอร์ / ครีเอเตอร์',
  corporate: 'บริษัท (Brand)',
  agency: 'เอเจนซี่โฆษณา',
  admin: 'ผู้ดูแลระบบ',
};

/** หน้าจอ -> เส้นทาง React */
const ROUTE = {
  overview: '/app/overview',
  calendar: '/app/calendar',
  analytics: '/app/analytics',
  create: '/app/create',
  add: '/app/record-wht',
  inbox: '/app/inbox',
  docs: '/app/documents',
  pit: '/app/tax',
  contacts: '/app/contacts',
  library: '/app/library',
  profile: '/app/profile',
  admin: '/app/admin',
};

/**
 * ลิงก์ไปหน้าจอ view คืน { to } สำหรับ React Router  query เช่น { doc: 12 } -> ?doc=12
 * หน้าจอที่ไม่รู้จักกลับไปหน้าแรกของแอป (/app เลือกหน้าตามบทบาทให้เอง)
 */
export function viewLink(role, view, query) {
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  return { to: (ROUTE[view] || '/app') + qs };
}

/** หน้าข้อมูลสาธารณะ (เปิดแท็บใหม่) แสดงเป็นปุ่มแบบเดียวกับเมนูอื่นในกลุ่ม "ช่วยเหลือ" */
const HELP_ITEMS = [
  { key: 'guide', label: 'ศูนย์ความรู้', icon: 'book', external: '/guide' },
  { key: 'laws', label: 'กฎหมายที่เกี่ยวข้อง', icon: 'info', external: '/guide/laws' },
  { key: 'privacy', label: 'นโยบายความเป็นส่วนตัว', icon: 'shield', external: '/guide/privacy' },
];

export function navFor(role) {
  if (role === 'admin') {
    return [
      { label: 'ผู้ดูแลระบบ', items: [{ key: 'admin', label: 'ตรวจสอบผู้ใช้', icon: 'shield', view: 'admin' }] },
      { label: 'ช่วยเหลือ', items: HELP_ITEMS },
    ];
  }
  const creator = role === 'creator';
  // ทุกกลุ่มมีหัวข้อ จัดตามงาน: หน้าหลัก -> เอกสาร -> ภาษี/ข้อมูล -> ช่วยเหลือ
  return [
    { label: 'หน้าหลัก', items: [
      { key: 'overview', label: creator ? 'ภาพรวม' : 'แดชบอร์ด', icon: 'grid', view: 'overview' },
      { key: 'calendar', label: 'ปฏิทินงาน', icon: 'calendar', view: 'calendar' },
      { key: 'analytics', label: 'วิเคราะห์ข้อมูล', icon: 'trend', view: 'analytics' },
    ] },
    { label: 'เอกสาร', items: [
      { key: 'create', label: 'สร้างเอกสาร', icon: 'plus', view: 'create' },
      // 50 ทวิ และข้อมูล ภ.ง.ด.3/53 ที่ผู้จ่ายเงินออกเอง อยู่ในเมนู "สร้างเอกสาร" แล้ว ไม่ซ้ำเมนูแยก
      // ส่วนครีเอเตอร์ "บันทึก 50 ทวิ ที่ได้รับ" เป็นหน้าแยก (ไม่ได้ออกเอกสารเอง) จึงคงไว้
      ...(creator ? [{ key: 'add', label: 'บันทึก 50 ทวิ (รับ)', icon: 'download', view: 'add' }] : []),
      { key: 'inbox', label: 'กล่องรับเอกสาร', icon: 'inbox', view: 'inbox', badge: 'inbox' },
      { key: 'docs', label: 'เอกสารทั้งหมด', icon: 'file', view: 'docs' },
      { key: 'library', label: 'คลังเอกสารของฉัน', icon: 'book', view: 'library' },
      { key: 'verify', label: 'ตรวจสอบเอกสาร', icon: 'shield', external: '/verify-doc' },
    ] },
    { label: creator ? 'ภาษีและบัญชี' : 'ข้อมูลธุรกิจ', items: [
      ...(creator ? [{ key: 'pit', label: 'คำนวณภาษี', icon: 'calc', view: 'pit' }] : []),
      // ทุกบทบาทมีคู่ค้า (ครีเอเตอร์มีแบรนด์/เอเจนซี่/ร้านที่จ้างงาน) และค้นหาคู่ค้าจากแถบบนได้ จึงต้องเข้าสมุดคู่ค้าได้ทุกบทบาท
      { key: 'contacts', label: 'สมุดคู่ค้า', icon: 'users', view: 'contacts' },
      { key: 'profile', label: creator ? 'โปรไฟล์' : 'ข้อมูลบริษัท', icon: 'user', view: 'profile' },
    ] },
    { label: 'ช่วยเหลือ', items: HELP_ITEMS },
  ];
}

/** 4 เมนูหลักบนแถบล่างของมือถือ (ที่เหลืออยู่ในเมนู "เมนู") · สร้างเอกสาร (+) อยู่ช่องกลางของ 5 ช่อง */
export const MOBILE_TABS = ['overview', 'inbox', 'create', 'docs'];
