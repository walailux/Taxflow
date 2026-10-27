/**
 * ContactsPage.jsx สมุดคู่ค้า (ภาคผนวก ข ข้อ 13) ย้ายจากส่วน Contacts ใน agency.js
 * เพิ่ม แก้ไข ลบ · ตรวจข้อมูลด้วยกติกาเดียวกับเซิร์ฟเวอร์ · ตรวจเลขผู้เสียภาษีซ้ำในสมุด · นำเข้า/ส่งออก CSV
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { API_URL } from '../lib/env.js';
import { docschema } from '../lib/shared.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useSubmit } from '../lib/useSubmit.js';
import { useToast } from '../components/Toast.jsx';
import { Alert, Button, EmptyState, PageHeader, SelectField, Skeleton, TextField, cx } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { AddressFields } from '../features/address/AddressFields.jsx';
import BankField from '../components/BankField.jsx';
import BranchField from '../components/BranchField.jsx';
import ContactLookup from '../features/contacts/ContactLookup.jsx';
import {
  CONTACT_KEYS, EMPTY_CONTACT, KIND_LABEL, KIND_OPTIONS,
  checkContactField, contactErrors, contactToForm, formToBody, isJuristicContact, visibleFields,
} from '../features/contacts/contactRules.js';

export default function ContactsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_CONTACT });
  const [errs, setErrs] = useState({});
  const [dupe, setDupe] = useState(null);     // { taxId, message } จาก check-duplicate
  const [confirm, setConfirm] = useState(null);
  const [q, setQ] = useState('');
  const formTop = useRef(null);
  const fileInput = useRef(null);

  const list = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/api/contacts') });
  const items = (list.data && list.data.items) || [];
  const shown = q.trim()
    ? items.filter((c) => JSON.stringify(c).toLowerCase().includes(q.trim().toLowerCase()))
    : items;
  const editing = !!form.id;
  const show = visibleFields(form);

  // ช่องที่เคยฟ้องแล้ว ตรวจซ้ำเมื่อข้อมูลเปลี่ยน ข้อความจึงหายทันทีที่แก้ถูก
  useEffect(() => {
    setErrs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(prev)) {
        if (!prev[k]) continue;
        const msg = checkContactField(k, form);
        if (msg !== prev[k]) { next[k] = msg; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [form]);

  function set(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Influencer ตั้งต้นเป็นบุคคลธรรมดา (ตอนเพิ่มใหม่เท่านั้น)
      if (key === 'kind' && value === 'influencer' && !prev.id && !prev.entityTypeTouched) next.entityType = 'individual';
      if (key === 'entityType') next.entityTypeTouched = true;
      // ชื่อบัญชีตั้งต้นเป็นชื่อคู่ค้า
      if (key === 'bankAccountNo' && value && !prev.bankAccountName) next.bankAccountName = prev.name;
      if (key === 'taxId') setDupe(null);
      return next;
    });
  }
  const check = (key) => setErrs((e) => ({ ...e, [key]: checkContactField(key, form) }));

  /** ตรวจเลขผู้เสียภาษีซ้ำในสมุด (เซิร์ฟเวอร์ตัดสิน) คืน true ถ้าใช้ได้ */
  async function checkDuplicate() {
    const msg = checkContactField('taxId', form);
    setErrs((e) => ({ ...e, taxId: msg }));
    if (msg || !String(form.taxId).trim()) { setDupe(null); return !msg; }
    try {
      const r = await api.get(`/api/contacts/check-duplicate?${new URLSearchParams({
        taxId: form.taxId, branch: form.branch, name: form.name, kind: form.kind, selfId: form.id || '',
      })}`);
      setDupe({ duplicate: !!r.duplicate, message: r.message || '' });
      return !r.duplicate;
    } catch {
      return true; // ตรวจไม่ได้ไม่ขวางผู้ใช้ เซิร์ฟเวอร์ตรวจซ้ำตอนบันทึกอยู่แล้ว
    }
  }

  const fieldError = (key) => errs[key] || (key === 'taxId' && dupe && dupe.duplicate ? dupe.message : null);

  function reset() {
    setForm({ ...EMPTY_CONTACT });
    setErrs({});
    setDupe(null);
  }

  function edit(c) {
    setForm(contactToForm(c));
    setErrs({});
    setDupe(null);
    formTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const [busy, save] = useSubmit(async () => {
    const e = contactErrors(form);
    setErrs(e);
    const count = Object.keys(e).length;
    if (count) {
      toast(`พบข้อมูลที่ต้องแก้ไข ${count} จุด กรุณาดูข้อความสีแดงใต้ช่อง`, 'err');
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!(await checkDuplicate())) { toast('เลขประจำตัวผู้เสียภาษีนี้มีในสมุดคู่ค้าแล้ว', 'err'); return; }
    try {
      const body = formToBody(form);
      if (editing) await api.put(`/api/contacts/${Number(form.id)}`, body);
      else await api.post('/api/contacts', body);
      toast(editing ? 'บันทึกการแก้ไขคู่ค้าแล้ว' : 'เพิ่มคู่ค้าแล้ว');
      reset();
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err) {
      if (err.field === 'taxId') setErrs((x) => ({ ...x, taxId: err.message }));
      toast(err.message, 'err');
    }
  });

  function remove(c) {
    setConfirm({
      title: 'ลบคู่ค้ารายนี้?', message: 'ลบออกจากสมุดคู่ค้า เอกสารที่ออกไปแล้วไม่เปลี่ยนแปลง', confirmText: 'ลบ', danger: true,
      onConfirm: async () => {
        setConfirm(null);
        try { await api.del(`/api/contacts/${Number(c.id)}`); toast('ลบคู่ค้าแล้ว'); void qc.invalidateQueries({ queryKey: ['contacts'] }); }
        catch (err) { toast(err.message, 'err'); }
      },
    });
  }

  async function importCsv(file) {
    if (!file) return;
    try {
      const csv = await file.text();
      const data = await api.post('/api/contacts/import', { csv });
      toast(`นำเข้าสำเร็จ: เพิ่ม ${data.created} รายการ อัปเดต ${data.updated} รายการ${data.skipped ? ` (ข้าม ${data.skipped} รายการเพราะเลขผู้เสียภาษีไม่ถูกต้อง)` : ''}`);
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err) {
      toast(err.message || 'อ่านไฟล์ไม่สำเร็จ กรุณาตรวจสอบว่าเป็นไฟล์ CSV', 'err');
    } finally { if (fileInput.current) fileInput.current.value = ''; }
  }

  const text = (key, props) => (
    <TextField
      id={`ct-${key}`}
      value={form[key]}
      error={fieldError(key)}
      ok={key === 'taxId' && dupe && !dupe.duplicate && !errs.taxId ? 'เลขถูกต้องและยังไม่มีในสมุดคู่ค้า' : null}
      onChange={(e) => set(key, key === 'taxId' ? e.target.value.replace(/[^\d-]/g, '') : e.target.value)}
      onBlur={() => (key === 'taxId' ? checkDuplicate() : (CONTACT_KEYS.includes(key) ? check(key) : null))}
      {...props}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="สมุดคู่ค้า" subtitle="เก็บข้อมูลคู่ค้าและผู้รับจ้างไว้ครั้งเดียว แล้วดึงไปใช้ตอนออกเอกสารได้ทันที" />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section ref={formTop} className="tf-fade-up rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6 lg:sticky lg:top-24" style={{ scrollMarginTop: '96px' }}>
          <h2 className="mb-4 text-[1.125rem] font-medium">{editing ? 'แก้ไขคู่ค้า' : 'เพิ่มคู่ค้า'}</h2>
          {/* เพิ่มคู่ค้าใหม่: ค้นก่อนว่ามีบัญชี TaxFlow ไหม มี = ขออนุญาตดึงข้อมูล · ไม่มี = กรอกเองด้านล่าง */}
          {!editing && <ContactLookup className="mb-4" />}
          <SelectField id="ct-kind" label="ประเภทคู่ค้า" value={form.kind} options={KIND_OPTIONS} onChange={(e) => set('kind', e.target.value)} />
          <SelectField
            id="ct-entity"
            label="ประเภทผู้เสียภาษี"
            value={form.entityType}
            options={[{ value: 'juristic', label: 'นิติบุคคล' }, { value: 'individual', label: 'บุคคลธรรมดา' }]}
            onChange={(e) => set('entityType', e.target.value)}
          />
          {text('name', { label: isJuristicContact(form) ? 'ชื่อนิติบุคคล *' : 'ชื่อ-นามสกุล *', maxLength: 200 })}
          {show.channelName && text('channelName', { label: 'ชื่อช่อง / ชื่อที่ใช้ในการทำงาน' })}
          {show.tradeName && text('tradeName', { label: 'ชื่อทางการค้า' })}
          {text('taxId', { label: 'เลขประจำตัวผู้เสียภาษี (13 หลัก)', inputMode: 'numeric', maxLength: 17 })}
          <BranchField id="ct-branch" label="สำนักงานใหญ่ / สาขา" value={form.branch} error={fieldError('branch')}
            onChange={(v) => set('branch', v)} onBlur={() => (CONTACT_KEYS.includes('branch') ? check('branch') : null)} />
          <AddressFields id="ct-address" label="ที่อยู่ (ตามหนังสือรับรอง / บัตรประชาชน)" value={form.address} error={fieldError('address')}
            onChange={(v) => set('address', v)} onBlur={() => check('address')} />
          <div className="grid gap-x-3 sm:grid-cols-2">
            {text('contactPerson', { label: 'ชื่อผู้ติดต่อ' })}
            {text('phone', { label: 'เบอร์โทรศัพท์', type: 'tel', placeholder: '0812345678' })}
          </div>
          {text('email', { label: 'อีเมล', type: 'email', placeholder: 'example@email.com' })}
          {show.authName && (
            <div className="grid gap-x-3 sm:grid-cols-2">
              {text('authName', { label: 'ผู้มีอำนาจลงนาม' })}
              {text('authPosition', { label: 'ตำแหน่ง' })}
            </div>
          )}
          <div className="grid gap-x-3 sm:grid-cols-2">
            <BankField id="ct-bankName" value={form.bankName} error={fieldError('bankName')} onChange={(v) => set('bankName', v)} />
            {text('bankAccountNo', { label: 'เลขที่บัญชี', inputMode: 'numeric' })}
          </div>
          {text('bankAccountName', { label: 'ชื่อบัญชี' })}
          {show.socials && text('socials', { label: 'ช่องทาง Social Media', placeholder: 'เช่น TikTok @name (120K) · IG @name' })}
          {text('note', { label: 'หมายเหตุ' })}
          <div className="flex gap-2">
            <Button variant="dark" className="flex-1" onClick={save} loading={busy}>{editing ? 'บันทึกการแก้ไข' : 'เพิ่มลงสมุด'}</Button>
            {editing && <Button variant="soft" onClick={reset}>ยกเลิก</Button>}
          </div>
        </section>

        {/* รายชื่อคู่ค้า (จอใหญ่): ตรึงอยู่กับที่ใต้แถบบน ไม่เลื่อนตามฟอร์มด้านซ้าย รายการยาวเลื่อนในกรอบตัวเอง */}
        <section className="tf-fade-up rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6 lg:sticky lg:top-[5.75rem] lg:flex lg:max-h-[calc(100vh-7.25rem)] lg:flex-col">
          <div className="mb-4 flex shrink-0 flex-wrap items-end gap-2">
            <TextField id="ct-search" label="ค้นหาในสมุด" placeholder="ชื่อ / เลขภาษี / อีเมล" className="mb-0 min-w-[220px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} />
            <a className="tf-btn tf-btn-soft !py-2.5 text-[0.9375rem]" href={`${API_URL}/api/contacts/export.csv`} download>ส่งออก CSV</a>
            <label className="tf-btn tf-btn-soft cursor-pointer !py-2.5 text-[0.9375rem]">
              นำเข้า CSV
              <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => importCsv(e.target.files[0])} />
            </label>
            <span className="pb-3 text-[0.9375rem] text-ink-soft">{shown.length} รายการ</span>
          </div>

          {list.isError && <Alert>{list.error.message}</Alert>}
          {list.isLoading && <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
          {!list.isLoading && !shown.length && (
            <EmptyState compact title={items.length ? 'ไม่พบคู่ค้าที่ค้นหา' : 'ยังไม่มีคู่ค้า'} text={items.length ? 'ลองเปลี่ยนคำค้นหา' : 'เพิ่มคู่ค้ารายแรกจากฟอร์มด้านซ้าย'} />
          )}
          <div className="tf-scroll flex flex-col gap-2 lg:-mr-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
            {shown.map((c) => {
              const kind = docschema.normKind(c.kind);
              return (
                <article key={c.id} className={cx('tf-fade-up flex items-start justify-between gap-3 rounded-[18px] p-4 ring-1 transition-all hover:shadow-[0_12px_28px_-20px_rgba(24,24,27,0.35)]', Number(form.id) === Number(c.id) ? 'bg-orange-pale ring-orange' : 'bg-white ring-line')}>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-tile font-display text-[1.125rem]">{(c.name || '?').trim().charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <b className="text-[1.0625rem] font-medium">{c.name}</b>
                    {c.channelName && <small className="ml-1 text-[0.875rem] text-ink-soft">({c.channelName})</small>}
                    {c.linkedUserId && <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-[#E3F5EC] px-2 py-0.5 align-middle text-[0.75rem] font-medium text-[#1F7A4D]" title="ข้อมูลดึงจากบัญชี TaxFlow ของคู่ค้า (คู่ค้าอนุญาตแล้ว)">เชื่อมบัญชี TaxFlow</span>}
                    <small className="block text-[0.90625rem] text-ink-soft">
                      {KIND_LABEL[kind] || kind} · {c.taxId || 'ไม่มีเลขภาษี'}{c.branch ? ` · ${c.branch}` : ''}
                    </small>
                    {(c.contactPerson || c.phone || c.email) && (
                      <small className="block text-[0.90625rem] text-ink-soft">{[c.contactPerson, c.phone, c.email].filter(Boolean).join(' · ')}</small>
                    )}
                    {(c.bankAccountNo || c.bank) && (
                      <small className="block text-[0.90625rem] text-ink-soft">บัญชี: {[c.bankName, c.bankAccountNo || c.bank].filter(Boolean).join(' ')}</small>
                    )}
                    {c.note && <small className="block text-[0.875rem] text-orange-deep">{c.note}</small>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="tf-btn tf-btn-soft !px-3.5 !py-2 text-[0.9375rem]" onClick={() => edit(c)}>แก้ไข</button>
                    <button type="button" aria-label={`ลบ ${c.name}`} className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-danger-soft hover:text-danger" onClick={() => remove(c)}><Icon name="close" className="size-4" /></button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
