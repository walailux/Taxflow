/**
 * docFonts.js ฟอนต์ใน PDF ที่เลือกได้จริง: นิยามทั้งหมดอยู่ใน appearance.js (มาจาก packages/shared)
 * แต่แสดงเฉพาะตัวที่เซิร์ฟเวอร์มีไฟล์ .ttf ครบ (/api/meta/doc-fonts) ไม่ให้เลือกฟอนต์ที่ออก PDF ไม่ได้
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { DOC_FONTS } from './appearance.js';

const FALLBACK = ['sarabun', 'googlesans'];

export function useDocFonts() {
  const q = useQuery({ queryKey: ['meta', 'doc-fonts'], queryFn: () => api.get('/api/meta/doc-fonts'), staleTime: Infinity, retry: false });
  const available = (q.data && q.data.available) || FALLBACK;
  return DOC_FONTS.filter((f) => available.includes(f.value));
}
