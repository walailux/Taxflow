/**
 * banks.js รายชื่อธนาคารสำหรับช่อง "ธนาคาร" ทุกที่ (ใช้ชุดเดียวกับหน้าโปรไฟล์/สมัครสมาชิก จาก /api/meta/profile-options)
 * ใช้ queryKey เดียวกับหน้าโปรไฟล์ โหลดครั้งเดียวแล้วใช้ร่วมกันทั้งแอป
 * ค่าที่เก็บยังเป็นชื่อไทยตามเดิม (ข้อมูลเก่าใช้ต่อได้) ชื่ออังกฤษเติมเฉพาะป้ายที่แสดงในรายการ
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

export const OTHER_BANK = 'อื่น ๆ';

const BANK_EN = {
  'ธนาคารกรุงเทพ': 'Bangkok Bank',
  'ธนาคารกสิกรไทย': 'Kasikornbank',
  'ธนาคารไทยพาณิชย์': 'Siam Commercial Bank',
  'ธนาคารกรุงไทย': 'Krungthai Bank',
  'ธนาคารกรุงศรีอยุธยา': 'Krungsri',
  'ธนาคารทหารไทยธนชาต (ttb)': 'TMBThanachart Bank',
  'ธนาคารออมสิน': 'Government Savings Bank',
  'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)': 'BAAC',
  'ธนาคารซีไอเอ็มบี ไทย': 'CIMB Thai',
  'ธนาคารยูโอบี': 'UOB',
  'ธนาคารเกียรตินาคินภัทร': 'Kiatnakin Phatra Bank',
  'ธนาคารแลนด์ แอนด์ เฮ้าส์': 'LH Bank',
  [OTHER_BANK]: 'Other',
};

/** ป้ายแสดงผล: ชื่อไทย (ชื่ออังกฤษ) · ชื่อที่มีวงเล็บอยู่แล้ว เช่น (ttb) / (ธ.ก.ส.) ต่อท้ายด้วย · คั่น */
export function bankLabel(name) {
  const en = BANK_EN[name];
  if (!en) return name;
  return /\)$/.test(name) ? `${name.replace(/\)$/, '')} · ${en})` : `${name} (${en})`;
}

export function useBanks() {
  const meta = useQuery({ queryKey: ['meta', 'profile-options'], queryFn: () => api.get('/api/meta/profile-options'), staleTime: Infinity });
  return (meta.data && meta.data.banks) || [];
}
