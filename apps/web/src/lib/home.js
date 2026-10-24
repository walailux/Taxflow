/**
 * home.js ปลายทางหลังเข้าสู่ระบบ
 */
import { viewLink } from '../features/app/nav.js';

export const ROLE_LABEL = {
  creator: 'อินฟลูเอนเซอร์ / ครีเอเตอร์',
  corporate: 'บริษัท (Brand)',
  agency: 'เอเจนซี่โฆษณา',
  admin: 'ผู้ดูแลระบบ',
};

/** หน้าแรกของแต่ละบทบาท บัญชีที่เพิ่งสมัครไปต่อที่หน้าโปรไฟล์เพื่ออัปโหลดเอกสารยืนยันตัวตน */
export function homeUrl(role, { isNew = false } = {}) {
  if (role === 'admin') return viewLink(role, 'admin').to;
  return viewLink(role, isNew ? 'profile' : 'overview').to;
}
