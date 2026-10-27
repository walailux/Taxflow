/**
 * DocumentsPage.jsx เอกสารทั้งหมด (ย้ายจาก v-docs ของ creator.html / agency.html)
 * ชิปสถานะพร้อมจำนวน · ค้นหาแบบหน่วงเวลา · กรองประเภท/ช่วงวันที่ · ส่งออก CSV / Excel / ZIP
 * มุมมองเล็ก/กลาง (ตาราง) และใหญ่ (การ์ดพร้อมพรีวิวหน้าแรก) · เลือกคอลัมน์ · ดาวน์โหลดรายฉบับเป็น PDF/Excel/CSV/XML
 * เปิดหน้าต่างเอกสารด้วย ?doc=id (ลิงก์จากหน้าอื่นเปิดเอกสารได้ตรง ๆ) และ &tab=send เปิดแท็บส่งเอกสาร
 */
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon.jsx';
import { PageHeader, cx } from '../components/ui.jsx';
import DocumentModal from '../features/docs/DocumentModal.jsx';
import DocBrowser from '../features/docs/DocBrowser.jsx';

/** ที่มาของเอกสาร: ทั้งหมด / ที่ฉันสร้าง / คู่ค้าส่งมา (ผ่านกล่องรับเอกสาร) */
const SOURCES = [
  { value: 'all', label: 'ทั้งหมด', tip: 'เอกสารที่ฉันสร้าง และเอกสารที่คู่ค้าส่งมาให้' },
  { value: 'mine', label: 'ที่ฉันสร้าง', tip: 'เอกสารที่ออกจากบัญชีนี้' },
  { value: 'received', label: 'คู่ค้าส่งมา', tip: 'เอกสารที่คู่ค้าส่งมาให้ลงนามหรือตรวจสอบ (กดแล้วเปิดในกล่องรับเอกสาร)' },
];

export default function DocumentsPage() {
  const { role, user } = useOutletContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const openId = params.get('doc');
  const source = SOURCES.some((s) => s.value === params.get('source')) ? params.get('source') : 'all';
  const setSource = (v) => setParams((p) => { const n = new URLSearchParams(p); if (v === 'all') n.delete('source'); else n.set('source', v); return n; }, { replace: true });

  const refresh = () => qc.invalidateQueries({ queryKey: ['documents'] });
  // เอกสารที่คู่ค้าส่งมา เปิดในกล่องรับเอกสาร (ลงนาม/ตรวจสอบ/เก็บเข้าคลังได้ที่นั่น)
  const openDoc = (d) => (d.received ? void navigate(`/app/inbox?req=${Number(d.received.reqId)}`) : open(d.id));
  const open = (id, extra = {}) => setParams((p) => { const n = new URLSearchParams(p); n.set('doc', String(id)); Object.entries(extra).forEach(([k, v]) => n.set(k, v)); return n; });
  const close = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('doc'); n.delete('tab'); return n; });

  return (
    <>
      <PageHeader
        title="เอกสารทั้งหมด"
        subtitle="รวมเอกสารที่คุณสร้างและเอกสารที่คู่ค้าส่งมา ค้นหา ดูรายละเอียด ลงนาม ส่ง และดาวน์โหลดเป็น PDF"
        actions={<Link to="/app/create" className="tf-btn tf-btn-dark"><Icon name="plus" className="size-[1.125rem]" />สร้างเอกสาร</Link>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.875rem] text-ink-soft">ที่มา</span>
        <div role="radiogroup" aria-label="ที่มาของเอกสาร" className="flex rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(24,24,27,0.05)]">
          {SOURCES.map((s) => (
            <button key={s.value} type="button" role="radio" aria-checked={source === s.value} title={s.tip} onClick={() => setSource(s.value)}
              className={cx('h-9 rounded-full px-4 text-[0.90625rem] font-medium transition-all', source === s.value ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <DocBrowser scope={source} role={role} user={user} onOpenDoc={openDoc} />

      {openId && (
        <DocumentModal
          key={openId}
          id={Number(openId)}
          role={role}
          initialTab={params.get('tab') || 'info'}
          onClose={close}
          onChanged={refresh}
          onOpenDoc={(id) => open(id)}
        />
      )}
    </>
  );
}
