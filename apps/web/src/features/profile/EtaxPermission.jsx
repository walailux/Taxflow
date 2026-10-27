/**
 * EtaxPermission.jsx หัวข้อ "สิทธิ์ออก e-Tax" ในหน้าโปรไฟล์
 * ใบกำกับภาษีอิเล็กทรอนิกส์และใบรับอิเล็กทรอนิกส์ออกได้เฉพาะผู้ที่ (1) ผ่าน KYC (2) จด VAT (3) ได้รับอนุมัติจากกรมสรรพากร
 * ผู้ใช้เลือกรูปแบบที่ได้รับอนุมัติ กรอกเลขที่/วันที่อนุมัติ แนบหลักฐาน แล้วส่งให้แอดมินตรวจ (API: /api/etax/permission)
 * เอกสารประเภทอื่นไม่ต้องใช้ขั้นตอนนี้ ยืนยันตัวตนอย่างเดียวก็ออกได้
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { API_URL } from '../../lib/env.js';
import { docschema } from '../../lib/shared.js';
import { ME_KEY } from '../auth/useMe.js';
import { readDataUrl } from '../docs/docsApi.js';
import { useToast } from '../../components/Toast.jsx';
import DatePicker from '../../components/DatePicker.jsx';
import { Alert, Button, SelectField, Spinner, TextField, cx } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

const MAX = 5 * 1024 * 1024;
const STATUS_STYLE = {
  none: 'bg-tile text-ink-soft',
  pending: 'bg-[#FFF4DB] text-[#8A5A00]',
  approved: 'bg-ok-soft text-ok',
  rejected: 'bg-danger-soft text-danger',
};
const today = () => new Date().toISOString().slice(0, 10);

/** สิ่งที่ผู้ใช้ต้องรู้ก่อนยื่น: ระบบเป็นตัวอย่างตามรูปแบบกรมสรรพากร ไม่ได้นำส่งข้อมูลให้กรมสรรพากรเอง */
export function EtaxLegalNote({ className }) {
  return (
    <div className={cx('rounded-2xl bg-tile px-4 py-3 text-[0.90625rem] leading-relaxed text-ink-soft', className)}>
      <b className="mb-1 block font-medium text-ink">ก่อนออกใบกำกับภาษีอิเล็กทรอนิกส์ / ใบรับอิเล็กทรอนิกส์</b>
      <ul className="list-disc space-y-0.5 pl-5">
        <li>ระบบนี้สร้างเอกสารตามรูปแบบของกรมสรรพากรเพื่อเป็นตัวอย่าง ไม่ได้นำส่งข้อมูลให้กรมสรรพากรแทนคุณ</li>
        <li>ต้องเป็นผู้ประกอบการจดทะเบียน VAT และได้รับอนุมัติจากกรมสรรพากรแล้ว เช่น ยื่นคำขอ ก.อ.01 (แบบ Time Stamp by Email หรือจัดทำเอง)</li>
        <li>ถ้าใช้ผู้ให้บริการนำส่งข้อมูล (Service Provider) ผู้ให้บริการต้องผ่านการตรวจรับรองมาตรฐานความมั่นคงปลอดภัยจาก ETDA และได้รับอนุญาตจากกรมสรรพากร ตรวจรายชื่อได้ที่เว็บไซต์ ETDA และ rd.go.th และขอดูหนังสือรับรองก่อนทำสัญญา</li>
        <li>หลักเกณฑ์ของกรมสรรพากรอาจเปลี่ยนแปลง (อยู่ระหว่างปรับปรุงหลักเกณฑ์สำหรับ Service Provider) ควรตรวจเงื่อนไขล่าสุดที่ rd.go.th อีกครั้ง</li>
      </ul>
    </div>
  );
}

export default function EtaxPermission({ user }) {
  const toast = useToast();
  const qc = useQueryClient();
  const status = user.etaxStatus || 'none';
  const saved = user.etax || {};
  const [form, setForm] = useState(() => ({
    method: saved.method || '', approvalRef: saved.approvalRef || '', approvalDate: saved.approvalDate || '',
    provider: saved.provider || '', providerCertRef: saved.providerCertRef || '', declare: false,
  }));
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);
  const target = useRef(null);
  const q = useQuery({
    queryKey: ['etax-permission', form.method],
    queryFn: () => api.get(`/api/etax/permission${form.method ? `?method=${encodeURIComponent(form.method)}` : ''}`),
  });
  useEffect(() => { void q.refetch(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = q.data || {};
  const method = docschema.ETAX_METHODS.find((m) => m.value === form.method);
  const locked = status === 'pending' || status === 'approved';
  const blockers = p.blockers || [];
  const missingDocs = (p.docs || []).filter((d) => !d.uploaded);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  async function upload(file) {
    if (!file || !target.current) return;
    if (file.size > MAX) { toast('ไฟล์ต้องมีขนาดไม่เกิน 5 MB', 'err'); return; }
    try {
      const dataUrl = await readDataUrl(file);
      await api.post('/api/kyc', { docType: target.current, filename: file.name, mime: file.type, dataBase64: dataUrl.split(',')[1] });
      toast('แนบหลักฐานแล้ว (จัดเก็บแบบเข้ารหัส)');
      await Promise.all([q.refetch(), qc.invalidateQueries({ queryKey: ['kyc'] }), qc.invalidateQueries({ queryKey: ME_KEY })]);
    } catch (err) { toast(err.message, 'err'); } finally {
      target.current = null;
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const data = await api.post('/api/etax/permission', form);
      qc.setQueryData(ME_KEY, (old) => ({ ...old, user: { ...old.user, ...data.user } }));
      await q.refetch();
      toast('ส่งคำขอสิทธิ์ออกเอกสาร e-Tax ให้ผู้ดูแลระบบตรวจสอบแล้ว');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cx('rounded-full px-3 py-1 text-[0.90625rem] font-medium', STATUS_STYLE[status])}>{docschema.ETAX_STATUS_LABEL[status]}</span>
        {status === 'approved' && saved.reviewedAt && <span className="text-[0.875rem] text-ink-soft">อนุมัติโดย {saved.reviewedBy} เมื่อ {new Date(saved.reviewedAt).toLocaleDateString('th-TH')}</span>}
        {status === 'pending' && saved.submittedAt && <span className="text-[0.875rem] text-ink-soft">ยื่นเมื่อ {new Date(saved.submittedAt).toLocaleDateString('th-TH')}</span>}
      </div>
      {user.etaxNote && status !== 'approved' && <Alert kind={status === 'rejected' ? 'error' : 'dev'} className="!mb-0">{user.etaxNote}</Alert>}

      <EtaxLegalNote />

      {q.isLoading && <p className="flex items-center gap-2 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังโหลด</p>}
      {!locked && blockers.length > 0 && (
        <Alert kind="dev" className="!mb-0">
          ยังยื่นขอสิทธิ์ไม่ได้ ต้องทำให้ครบก่อน: {blockers.join(' · ')}
        </Alert>
      )}
      {!locked && p.kycConsent === false && (
        <Alert kind="dev" className="!mb-0">ต้องให้ความยินยอมการจัดเก็บเอกสารยืนยันตัวตนก่อน (หัวข้อความเป็นส่วนตัว) จึงจะแนบหลักฐานได้</Alert>
      )}

      <fieldset disabled={locked} className="flex flex-col gap-0">
        <SelectField id="etax-method" label="รูปแบบที่ได้รับอนุมัติจากกรมสรรพากร" placeholder="เลือกรูปแบบ" value={form.method} onChange={set('method')}
          options={docschema.ETAX_METHODS.map((m) => ({ value: m.value, label: m.label }))} hint={method && method.hint} />
        <div className="grid gap-x-3 sm:grid-cols-2">
          <TextField id="etax-ref" label="เลขที่หนังสืออนุมัติ / เลขที่คำขอ ก.อ.01" placeholder="เช่น กอ.01-0105561234567-001" value={form.approvalRef} onChange={set('approvalRef')} />
          <div className="mb-4">
            <label htmlFor="etax-date" className="mb-1.5 block text-[0.9375rem] font-medium">วันที่ได้รับอนุมัติ</label>
            <DatePicker id="etax-date" value={form.approvalDate} max={today()} onChange={set('approvalDate')} disabled={locked} />
          </div>
        </div>
        {method && method.needsProvider && (
          <div className="grid gap-x-3 sm:grid-cols-2">
            <TextField id="etax-sp" label="ชื่อผู้ให้บริการนำส่งข้อมูล (Service Provider)" placeholder="ชื่อตามรายชื่อที่ได้รับการรับรองจาก ETDA" value={form.provider} onChange={set('provider')} />
            <TextField id="etax-sp-ref" label="เลขที่ใบรับรอง/หนังสือรับรองของผู้ให้บริการ" placeholder="ตามหนังสือรับรองจาก ETDA / กรมสรรพากร" value={form.providerCertRef} onChange={set('providerCertRef')} />
          </div>
        )}
      </fieldset>

      {form.method && (
        <div>
          <b className="mb-2 block text-[0.9375rem] font-medium">หลักฐานที่ต้องแนบ</b>
          <input ref={fileInput} type="file" aria-label="เลือกไฟล์หลักฐาน e-Tax" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => upload(e.target.files[0])} />
          <div className="flex flex-col gap-2.5">
            {(p.docs || []).map((d) => (
              <div key={d.type} className={cx('flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', d.uploaded ? 'border-[#BFE6CD] bg-ok-soft/50' : 'border-line')}>
                <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', d.uploaded ? 'bg-ok text-white' : 'bg-tile text-ink-soft')}>
                  <Icon name={d.uploaded ? 'check' : 'file'} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[0.96875rem] font-medium">{d.label}</b>
                  <small className="block text-[0.84375rem] leading-relaxed text-ink-soft">{d.hint}</small>
                  {d.uploaded && <small className="mt-0.5 block text-[0.84375rem] font-medium text-ok">แนบแล้ว: {d.uploaded.filename || 'ไฟล์'}</small>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {d.uploaded && <a className="tf-btn tf-btn-soft !px-3.5 !py-2 text-[0.875rem]" href={`${API_URL}/api/kyc/${Number(d.uploaded.id)}/file`} target="_blank" rel="noreferrer">เปิดดู</a>}
                  {!locked && (
                    <button type="button" className={cx('tf-btn !px-4 !py-2 text-[0.875rem]', d.uploaded ? 'tf-btn-ghost' : 'tf-btn-dark')} disabled={p.kycConsent === false}
                      onClick={() => { target.current = d.type; fileInput.current.click(); }}>
                      {d.uploaded ? 'เปลี่ยนไฟล์' : 'อัปโหลด'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {status === 'approved' && <p className="mt-2 text-[0.84375rem] text-ink-soft">เปลี่ยนหลักฐาน เลขผู้เสียภาษี ชื่อ หรือสถานะ VAT หลังได้รับสิทธิ์ ระบบจะระงับสิทธิ์และต้องยื่นตรวจใหม่</p>}
        </div>
      )}

      {!locked && (
        <>
          <label className="tf-choice items-start">
            <input type="checkbox" checked={form.declare} onChange={set('declare')} />
            <span className="text-[0.90625rem] leading-relaxed">
              ข้าพเจ้ารับรองว่าได้รับอนุมัติจากกรมสรรพากรให้จัดทำใบกำกับภาษีอิเล็กทรอนิกส์และใบรับอิเล็กทรอนิกส์จริง
              ข้อมูลและหลักฐานที่แนบเป็นความจริงและเป็นปัจจุบัน หากสิทธิ์ถูกเพิกถอนหรือยกเลิกการจด VAT จะแจ้งแก้ไขในระบบทันที
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-tile px-4 py-3">
            <span className="text-[0.90625rem] text-ink-soft">
              {blockers.length ? 'ทำขั้นตอนที่ค้างอยู่ให้ครบก่อน' : !form.method ? 'เลือกรูปแบบที่ได้รับอนุมัติก่อน' : missingDocs.length ? `ยังขาดหลักฐาน ${missingDocs.length} รายการ` : 'พร้อมส่งให้ผู้ดูแลระบบตรวจสอบ'}
            </span>
            <Button className="!px-4 !py-2 text-[0.90625rem]" onClick={submit} loading={busy}
              disabled={!!blockers.length || !form.method || missingDocs.length > 0 || !form.declare}>
              ส่งคำขอสิทธิ์ออก e-Tax
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
