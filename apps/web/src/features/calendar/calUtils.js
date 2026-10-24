/**
 * calUtils.js วันที่ เทมเพลต และไอคอนของปฏิทินงาน (ย้ายจาก calendar.js ของหน้าเดิม)
 * วันที่ทั้งหมดเป็นสตริง YYYY-MM-DD คิดแบบ UTC เพื่อไม่ให้เพี้ยนตามเขตเวลาเครื่อง
 */
export const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const TH_DAYS_S = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
export const toDate = (s) => new Date(`${s}T00:00:00Z`);
export const addDays = (s, n) => ymd(new Date(toDate(s).getTime() + n * 86400000));
export const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);

export function longDate(s) {
  const d = toDate(s);
  return `วัน${TH_DAYS[d.getUTCDay()]}ที่ ${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}
export function shortDate(s) {
  const d = toDate(s);
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()].slice(0, 3)}. ${String(d.getUTCFullYear() + 543).slice(2)}`;
}
export function relative(today, s) {
  const n = diffDays(today, s);
  if (n === 0) return 'วันนี้';
  if (n === 1) return 'พรุ่งนี้';
  if (n === -1) return 'เมื่อวาน';
  return n > 0 ? `อีก ${n} วัน` : `เลยมา ${-n} วัน`;
}
/** ช่วงวันของตารางเดือน 6 สัปดาห์ (เริ่มวันอาทิตย์) */
export function gridRange(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = addDays(ymd(first), -first.getUTCDay());
  return { start, end: addDays(start, 41) };
}
export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + m - 1 + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export const onDay = (e, day) => day >= e.date && day <= (e.endDate || e.date);

export const TEMPLATES = {
  creator: [
    { title: 'ถ่ายทำคอนเทนต์', category: 'content', marker: 'camera', purpose: 'ถ่ายทำตามบรีฟของแบรนด์' },
    { title: 'ส่ง Draft ให้แบรนด์ตรวจ', category: 'content', marker: 'flag', purpose: 'รอความเห็นก่อนโพสต์จริง' },
    { title: 'โพสต์คอนเทนต์', category: 'content', marker: 'camera', purpose: 'โพสต์ตามวันเวลาที่ตกลงในสัญญา' },
    { title: 'วางบิล / ส่งใบแจ้งหนี้', category: 'payment', marker: 'money', purpose: 'ส่งใบแจ้งหนี้ให้ผู้ว่าจ้าง' },
    { title: 'ติดตามเงินเข้าบัญชี', category: 'payment', marker: 'money', purpose: 'ตรวจสอบยอดโอนและขอ 50 ทวิ' },
  ],
  agency: [
    { title: 'ประชุมบรีฟแคมเปญ', category: 'meeting', marker: 'people', purpose: 'สรุปบรีฟ งบประมาณ และไทม์ไลน์' },
    { title: 'ตรวจ Draft จาก Influencer', category: 'content', marker: 'flag', purpose: 'ตรวจความถูกต้องก่อนส่งแบรนด์' },
    { title: 'สรุปรายงานผลแคมเปญ', category: 'document', marker: 'check', purpose: 'ส่งรายงานให้แบรนด์' },
    { title: 'วางบิลแบรนด์', category: 'payment', marker: 'money', purpose: 'ออกใบแจ้งหนี้ตามงวดงาน' },
    { title: 'จ่ายเงิน Influencer และออก 50 ทวิ', category: 'payment', marker: 'money', purpose: 'จ่ายค่าจ้างและหักภาษี ณ ที่จ่าย' },
  ],
  corporate: [
    { title: 'อนุมัติงบแคมเปญ', category: 'meeting', marker: 'star', purpose: 'อนุมัติงบประมาณก่อนเริ่มงาน' },
    { title: 'ตรวจรับงาน', category: 'document', marker: 'check', purpose: 'ตรวจรับตามใบส่งมอบงาน' },
    { title: 'จ่ายเงินเอเจนซี่ / Influencer', category: 'payment', marker: 'money', purpose: 'จ่ายตามใบแจ้งหนี้และออก 50 ทวิ' },
    { title: 'ต่ออายุสัญญา', category: 'contract', marker: 'flag', purpose: 'พิจารณาต่อสัญญาก่อนหมดอายุ' },
    { title: 'เตรียมข้อมูลนำส่ง ภ.ง.ด.53', category: 'tax', marker: 'alert', purpose: 'รวบรวม 50 ทวิ ของเดือนก่อนหน้า' },
  ],
};

export const PURPOSE_HINTS = {
  tax: ['เตรียมเอกสารยื่นแบบ', 'รวบรวม 50 ทวิ', 'ชำระภาษี'],
  document: ['ส่งเอกสารให้คู่ค้า', 'ติดตามเอกสารคืน', 'ตรวจความถูกต้อง'],
  contract: ['ต่ออายุสัญญา', 'ทบทวนเงื่อนไข', 'ส่งสัญญาให้ลงนาม'],
  sign: ['ลงนามเอกสาร', 'ติดตามลายมือชื่อ', 'อนุมัติเอกสาร'],
  payment: ['ติดตามการชำระเงิน', 'จ่ายเงินตามงวด', 'ขอหลักฐานการโอน'],
  content: ['ส่ง Draft', 'โพสต์ตามกำหนด', 'แก้ไขตามคอมเมนต์'],
  meeting: ['คุยบรีฟงาน', 'สรุปผลงาน', 'นัดเซ็นสัญญา'],
  note: ['เตือนความจำ', 'ไอเดียคอนเทนต์'],
};

export const REMIND_OPTIONS = [['', 'ไม่แจ้งเตือน'], ['0', 'ในวันนั้น'], ['1', '1 วันก่อน'], ['3', '3 วันก่อน'], ['7', '7 วันก่อน'], ['14', '14 วันก่อน']];

export function fileUrl(base, e, f) {
  return e.source === 'system'
    ? `${base}/api/calendar/file?sysKey=${encodeURIComponent(e.id)}&fileId=${encodeURIComponent(f.id)}`
    : `${base}/api/calendar/file?eventId=${encodeURIComponent(e.id)}&fileId=${encodeURIComponent(f.id)}`;
}
