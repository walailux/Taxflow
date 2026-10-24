/**
 * LibraryPage.jsx คลังเอกสาร (ภาคผนวก ข ข้อ 15) ย้ายจาก library.js ของหน้าเดิม
 * อัปโหลดแบบลากวาง แสดงตัวอย่างก่อนบันทึก จัดหมวดตามบทบาท และค้นหา
 */
import Select from '../components/Select.jsx';
import { useRef, useState } from 'react';
import { useOutletContext } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { API_URL } from '../lib/env.js';
import { libCategoryLabel, libraryGroups } from '../features/app/library.js';
import { readDataUrl } from '../features/docs/docsApi.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useSubmit } from '../lib/useSubmit.js';
import { useToast } from '../components/Toast.jsx';
import { Alert, Button, EmptyState, PageHeader, Skeleton, TextField, cx } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX = 10 * 1024 * 1024;

export default function LibraryPage() {
  const { role } = useOutletContext();
  const toast = useToast();
  const qc = useQueryClient();
  const groups = libraryGroups(role);
  const [form, setForm] = useState({ category: groups[0].items[0].id, title: '', year: '', note: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [confirm, setConfirm] = useState(null);
  const input = useRef(null);

  const list = useQuery({
    queryKey: ['library', { q, category: filter }],
    queryFn: () => api.get(`/api/library?q=${encodeURIComponent(q)}&category=${encodeURIComponent(filter)}`),
  });
  const items = (list.data && list.data.items) || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function pick(f) {
    if (!f) return;
    if (!OK_TYPES.includes(f.type)) { toast('รองรับเฉพาะ PDF, PNG, JPG, WEBP', 'err'); return; }
    if (f.size > MAX) { toast('ไฟล์เกิน 10 MB', 'err'); return; }
    setFile(f);
    setPreview(f.type.startsWith('image/') ? await readDataUrl(f) : '');
    setForm((x) => ({ ...x, title: x.title || f.name.replace(/\.[^.]+$/, '') }));
  }

  const [busy, save] = useSubmit(async () => {
    if (!file) { toast('กรุณาเลือกไฟล์ก่อน', 'err'); return; }
    try {
      const dataUrl = await readDataUrl(file);
      await api.post('/api/library', { ...form, title: form.title.trim(), note: form.note.trim(), filename: file.name, mime: file.type, dataBase64: dataUrl.split(',')[1] });
      toast('บันทึกเข้าคลังเอกสารแล้ว');
      setFile(null); setPreview('');
      setForm({ category: form.category, title: '', year: '', note: '' });
      void qc.invalidateQueries({ queryKey: ['library'] });
    } catch (err) { toast(err.message, 'err'); }
  });

  function remove(id) {
    setConfirm({
      title: 'ลบจากคลังเอกสาร?', message: 'เอกสารนี้จะถูกลบออกจากคลังถาวร', confirmText: 'ลบ', danger: true,
      onConfirm: async () => {
        setConfirm(null);
        try { await api.del(`/api/library/${Number(id)}`); toast('ลบแล้ว'); void qc.invalidateQueries({ queryKey: ['library'] }); }
        catch (err) { toast(err.message, 'err'); }
      },
    });
  }

  const catSelect = (value, onChange, id, label, withAll) => (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[0.9375rem] font-medium">{label}</label>
      <Select id={id} value={value} onChange={onChange} placeholder={withAll ? 'ทุกหมวด' : undefined}
        options={groups.flatMap((g) => g.items.map((it) => ({ value: it.id, label: it.label, group: g.group })))} />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="คลังเอกสาร" subtitle="เก็บเอกสารสำคัญไว้ที่เดียว ไฟล์ทุกไฟล์ถูกเข้ารหัสก่อนจัดเก็บ เปิดดูได้เฉพาะบัญชีของคุณ" />

      <div className="grid items-start gap-5 lg:grid-cols-[360px_1fr]">
        <section className="tf-fade-up rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6 lg:sticky lg:top-24">
          <h2 className="mb-4 text-[1.125rem] font-medium">อัปโหลดเอกสาร</h2>
          {catSelect(form.category, set('category'), 'lib-cat', 'หมวดเอกสาร')}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files[0]); }}
            className={cx('rounded-[20px] border-2 border-dashed p-6 text-center transition-colors', drag ? 'border-orange bg-orange-pale' : 'border-line bg-tile')}
          >
            <input ref={input} type="file" aria-label="เลือกไฟล์เอกสารเข้าคลัง" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files[0])} />
            <span className="mx-auto mb-2 flex size-11 items-center justify-center rounded-2xl bg-white text-orange"><Icon name="download" className="size-5 rotate-180" /></span>
            <p className="text-[1rem]">
              ลากไฟล์มาวาง หรือ <button type="button" className="cursor-pointer font-bold text-orange-deep underline" onClick={() => input.current.click()}>เลือกไฟล์</button>
            </p>
            <p className="mt-1 text-[0.84375rem] text-ink-soft">PDF, PNG, JPG, WEBP · ไม่เกิน 10 MB</p>
          </div>
          {file && (
            <div className="tf-reveal mt-3 rounded-2xl border border-line p-3">
              <p className="mb-2 text-[0.875rem] font-semibold text-ink-soft">ตัวอย่างก่อนบันทึก</p>
              {preview ? <img src={preview} alt="" className="max-h-40 w-auto rounded-lg" /> : <p className="text-[0.90625rem]">PDF · {file.name}</p>}
            </div>
          )}
          <div className="mt-4">
            <TextField id="lib-title" label="ชื่อเอกสาร" placeholder="เช่น ภ.พ.20 ปี 2569" value={form.title} onChange={set('title')} />
            <TextField id="lib-year" label="ปี (ถ้ามี)" inputMode="numeric" maxLength={4} placeholder="2569" value={form.year} onChange={set('year')} />
            <TextField id="lib-note" label="หมายเหตุ" placeholder="เช่น ฉบับจริงเก็บที่สำนักงาน" value={form.note} onChange={set('note')} />
          </div>
          <Button variant="dark" block onClick={save} loading={busy} disabled={!file}>บันทึกเข้าคลัง</Button>
        </section>

        <section className="tf-fade-up rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6">
          <div className="grid gap-x-3 sm:grid-cols-2">
            <TextField id="lib-search" label="ค้นหา" placeholder="ชื่อเอกสาร / ชื่อไฟล์" value={q} onChange={(e) => setQ(e.target.value)} />
            {catSelect(filter, (e) => setFilter(e.target.value), 'lib-filter', 'กรองตามหมวด', true)}
          </div>
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
        </section>
      </div>
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
