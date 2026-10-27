/**
 * LibraryPage.jsx คลังเอกสาร (ภาคผนวก ข ข้อ 15) ย้ายจาก library.js ของหน้าเดิม
 * อัปโหลดแบบลากวาง แสดงตัวอย่างก่อนบันทึก จัดหมวดตามบทบาท และค้นหา
 */
import Select from '../components/Select.jsx';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { API_URL } from '../lib/env.js';
import { libCategoryLabel, libraryGroups } from '../features/app/library.js';
import { readDataUrl } from '../features/docs/docsApi.js';
import { pdfFirstPage } from '../features/docs/DocPreview.jsx';
import DocBrowser from '../features/docs/DocBrowser.jsx';
import DocumentModal from '../features/docs/DocumentModal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useSubmit } from '../lib/useSubmit.js';
import { useToast } from '../components/Toast.jsx';
import { Alert, Button, EmptyState, PageHeader, Skeleton, TextField, cx } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import FileUploadCard, { useUploadProgress } from '../components/FileUploadCard.jsx';

const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX = 5 * 1024 * 1024; // ตรงกับ LIB_MAX_SIZE ฝั่งเซิร์ฟเวอร์ (เดิมหน้าเว็บบอก 10 MB แต่เซิร์ฟเวอร์รับแค่ 5 MB)
// ปีของเอกสาร (พ.ศ.) ให้เลือกจากรายการ: ปีหน้า ปีนี้ ย้อนหลังไป 20 ปี
const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear() + 543;
  return [{ value: '', label: 'ไม่ระบุปี' }, ...Array.from({ length: 22 }, (_, i) => String(now + 1 - i)).map((y) => ({ value: y, label: `พ.ศ. ${y}` }))];
})();

export default function LibraryPage() {
  const { role, user } = useOutletContext();
  const toast = useToast();
  const qc = useQueryClient();
  const groups = libraryGroups(role);
  const [form, setForm] = useState({ category: groups[0].items[0].id, title: '', year: '', note: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [previewState, setPreviewState] = useState('idle'); // idle | loading | done | error
  const [fileUrl, setFileUrl] = useState(''); // blob URL ของไฟล์ที่เลือก ใช้เปิดดูไฟล์เต็มก่อนบันทึก
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  // ไฟล์ที่บันทึกเข้าคลังแล้วในรอบนี้ แสดงในการ์ดอัปโหลดเป็นสถานะ "อัปโหลดแล้ว"
  const [done, setDone] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [confirm, setConfirm] = useState(null);
  // แท็บของคลัง: ไฟล์ที่อัปโหลดเอง / เอกสารที่ฉันสร้างในระบบ (เอกสารที่คู่ค้าส่งมาดูได้ที่ "เอกสารทั้งหมด")
  const [tab, setTab] = useState('files');
  const [openId, setOpenId] = useState(null); // เอกสารที่เปิดดูรายละเอียดจากแท็บ "เอกสารที่ฉันสร้าง"

  const list = useQuery({
    queryKey: ['library', { q, category: filter }],
    queryFn: () => api.get(`/api/library?q=${encodeURIComponent(q)}&category=${encodeURIComponent(filter)}`),
  });
  const items = (list.data && list.data.items) || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function pick(f) {
    if (!f) return;
    if (!OK_TYPES.includes(f.type)) { toast('รองรับเฉพาะ PDF, PNG, JPG, WEBP', 'err'); return; }
    if (f.size > MAX) { toast('ไฟล์เกิน 5 MB', 'err'); return; }
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setForm((x) => ({ ...x, title: x.title || f.name.replace(/\.[^.]+$/, '') }));
    setPreview('');
    setPreviewState('loading');
    try {
      // รูปแสดงตรง ๆ · PDF วาดหน้าแรกด้วย pdf.js ให้เห็นเนื้อหาก่อนกดบันทึก
      setPreview(f.type.startsWith('image/') ? await readDataUrl(f) : await pdfFirstPage(new Uint8Array(await f.arrayBuffer()), 320));
      setPreviewState('done');
    } catch {
      setPreviewState('error');
    }
  }

  const [busy, save] = useSubmit(async () => {
    if (!file) { toast('กรุณาเลือกไฟล์ก่อน', 'err'); return; }
    try {
      const dataUrl = await readDataUrl(file);
      const row = await api.post('/api/library', { ...form, title: form.title.trim(), note: form.note.trim(), filename: file.name, mime: file.type, dataBase64: dataUrl.split(',')[1] });
      toast('บันทึกเข้าคลังเอกสารแล้ว');
      setDone((list) => [{ id: `lib-${row.id}`, libId: row.id, file, status: 'completed', previewUrl: preview, href: `${API_URL}/api/library/${Number(row.id)}/file` }, ...list].slice(0, 5));
      setFile(null); setPreview(''); setFileUrl(''); setPreviewState('idle');
      setForm({ category: form.category, title: '', year: '', note: '' });
      void qc.invalidateQueries({ queryKey: ['library'] });
    } catch (err) { toast(err.message, 'err'); }
  });

  function remove(id) {
    setConfirm({
      title: 'ลบจากคลังเอกสาร?', message: 'เอกสารนี้จะถูกลบออกจากคลังถาวร', confirmText: 'ลบ', danger: true,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.del(`/api/library/${Number(id)}`); toast('ลบแล้ว');
          setDone((list) => list.filter((x) => x.libId !== id));
          void qc.invalidateQueries({ queryKey: ['library'] });
        }
        catch (err) { toast(err.message, 'err'); }
      },
    });
  }

  const progress = useUploadProgress(busy);
  const clearFile = () => { setFile(null); setPreview(''); setFileUrl(''); setPreviewState('idle'); };
  const cardFiles = [
    ...(file ? [{ id: 'pending', file, status: busy ? 'uploading' : 'ready', progress, previewUrl: preview, href: fileUrl }] : []),
    ...done,
  ];

  const catSelect = (value, onChange, id, label, withAll) => (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[0.9375rem] font-medium">{label}</label>
      <Select id={id} value={value} onChange={onChange} placeholder={withAll ? 'ทุกหมวด' : undefined}
        options={groups.flatMap((g) => g.items.map((it) => ({ value: it.id, label: it.label, group: g.group })))} />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="คลังเอกสารของฉัน" subtitle="เอกสารที่คุณสร้างในระบบและไฟล์ที่อัปโหลดเอง ไฟล์ทุกไฟล์ถูกเข้ารหัสก่อนจัดเก็บ เปิดดูได้เฉพาะบัญชีของคุณ (เอกสารที่คู่ค้าส่งมาอยู่ใน “เอกสารทั้งหมด”)" />

      <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* การ์ดอัปโหลด: เลือก/ลากไฟล์ → เห็นไฟล์พร้อมรูปย่อ → กรอกรายละเอียด → บันทึก (ไฟล์ที่บันทึกแล้วในรอบนี้ขึ้นเป็น "อัปโหลดแล้ว") */}
        <FileUploadCard
          className="lg:sticky lg:top-24"
          title="อัปโหลดเอกสาร"
          subtitle="ไฟล์ถูกเข้ารหัสก่อนจัดเก็บ เปิดดูได้เฉพาะบัญชีของคุณ"
          hint="PDF, PNG, JPG, WEBP · ไม่เกิน 5 MB"
          accept=".pdf,image/png,image/jpeg,image/webp"
          inputLabel="เลือกไฟล์เอกสารเข้าคลัง"
          files={cardFiles}
          onFilesChange={(fs) => pick(fs[0])}
          onFileRemove={(id) => { if (id === 'pending') clearFile(); else remove(done.find((x) => x.id === id).libId); }}
        >
          {file && previewState === 'loading' && <p className="mb-3 text-[0.875rem] text-ink-soft">กำลังสร้างรูปย่อ…</p>}
          {catSelect(form.category, set('category'), 'lib-cat', 'หมวดเอกสาร')}
          <TextField id="lib-title" label="ชื่อเอกสาร" placeholder="เช่น ภ.พ.20 ปี 2569" value={form.title} onChange={set('title')} />
          <div className="mb-4">
            <label htmlFor="lib-year" className="mb-1.5 block text-[0.9375rem] font-medium">ปีของเอกสาร (ถ้ามี)</label>
            <Select id="lib-year" value={form.year} onChange={set('year')} options={YEAR_OPTIONS} />
            <p className="mt-1 text-[0.84375rem] text-ink-soft">เช่น ภ.ง.ด.90 ปีภาษี 2568 เลือก พ.ศ. 2568</p>
          </div>
          <TextField id="lib-note" label="หมายเหตุ" placeholder="เช่น ฉบับจริงเก็บที่สำนักงาน" value={form.note} onChange={set('note')} />
          <Button variant="dark" block onClick={save} loading={busy} disabled={!file}>บันทึกเข้าคลัง</Button>
        </FileUploadCard>

        <section className="tf-fade-up min-w-0 rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6">
          <div role="tablist" aria-label="ประเภทในคลัง" className="mb-4 flex w-fit rounded-full bg-tile p-1">
            {[['files', 'ไฟล์ที่อัปโหลด'], ['docs', 'เอกสารที่ฉันสร้าง']].map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cx('h-9 rounded-full px-4 text-[0.90625rem] font-medium transition-all', tab === k ? 'bg-white text-ink shadow-[0_2px_8px_-3px_rgba(24,24,27,0.3)]' : 'text-ink-soft hover:text-ink')}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'files' && (
            <div className="grid gap-x-3 sm:grid-cols-2">
              <TextField id="lib-search" label="ค้นหา" placeholder="ชื่อเอกสาร / ชื่อไฟล์" value={q} onChange={(e) => setQ(e.target.value)} />
              {catSelect(filter, (e) => setFilter(e.target.value), 'lib-filter', 'กรองตามหมวด', true)}
            </div>
          )}
          {/* ตัวกรอง ส่งออก และมุมมองเล็ก/กลาง/ใหญ่ ชุดเดียวกับหน้า "เอกสารทั้งหมด" (จำมุมมองแยกจากหน้านั้น) */}
          {tab === 'docs' && <DocBrowser panel scope="mine" role={role} user={user} viewKey="tf_library_docs_view" onOpenDoc={(d) => setOpenId(d.id)} />}
          {tab === 'files' && (<>
          {list.isError && <Alert>{list.error.message}</Alert>}
          {list.isLoading && <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>}
          {!list.isLoading && !items.length && (
            <EmptyState compact title="ยังไม่มีเอกสารในคลัง" text="อัปโหลดไฟล์แรกจากแผงด้านซ้าย" />
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((l) => (
              <article key={l.id} className="tf-fade-up flex flex-col rounded-[20px] bg-tile p-4 transition-transform hover:-translate-y-0.5">
                <span className="mb-3 flex items-start justify-between gap-2">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white text-orange"><Icon name="file" className="size-5" /></span>
                  <span className="max-w-[70%] truncate rounded-full bg-white px-2.5 py-1 text-[0.84375rem] font-medium text-orange-deep">{libCategoryLabel(l.category)}</span>
                </span>
                <b className="text-[1.03125rem] font-medium">{l.title}</b>
                <small className="mt-1 flex-1 text-[0.90625rem] leading-relaxed text-ink-soft">
                  {l.filename} · {Math.round((l.size || 0) / 1024)} KB{l.year ? ` · ปี ${l.year}` : ''}
                  {l.note ? <><br />หมายเหตุ: {l.note}</> : null}
                </small>
                <div className="mt-3 flex gap-2">
                  <a className="tf-btn tf-btn-dark flex-1 !py-2 text-[0.9375rem]" href={`${API_URL}/api/library/${Number(l.id)}/file`} target="_blank" rel="noopener">เปิด</a>
                  <button type="button" className="tf-btn tf-btn-ghost !py-2 text-[0.9375rem] !text-danger" onClick={() => remove(l.id)}>ลบ</button>
                </div>
              </article>
            ))}
          </div>
          </>)}
        </section>
      </div>
      {openId && (
        <DocumentModal
          key={openId}
          id={Number(openId)}
          role={role}
          onClose={() => setOpenId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['documents'] })}
          onOpenDoc={(id) => setOpenId(id)}
        />
      )}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
