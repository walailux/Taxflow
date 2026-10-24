/**
 * AdminPage.jsx ผู้ดูแลระบบ: ตรวจสอบและอนุมัติการยืนยันตัวตนของผู้ใช้ (ย้ายจาก admin.js)
 * ทุกครั้งที่เปิดดูเอกสารยืนยันตัวตน API บันทึกผู้เปิด เวลา และเอกสาร ตาม PDPA
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { API_URL } from '../lib/env.js';
import { formatTaxId } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Icon from '../components/Icon.jsx';
import { Button, Card, EmptyState, PageHeader, Skeleton, cx } from '../components/ui.jsx';

const STATUS = {
  pending: ['รอตรวจสอบ', 'bg-[#FFF4DB] text-[#8A5A00]'],
  verified: ['ยืนยันแล้ว', 'bg-ok-soft text-ok'],
  rejected: ['ไม่อนุมัติ', 'bg-danger-soft text-danger'],
  unverified: ['ยังไม่ส่งเอกสาร', 'bg-tile text-ink-soft'],
};
const FILTERS = [['pending', 'รอตรวจสอบ'], ['verified', 'ยืนยันแล้ว'], ['rejected', 'ไม่อนุมัติ'], ['unverified', 'ยังไม่ส่งเอกสาร'], ['', 'ทั้งหมด']];
const ROLE_TEXT = { creator: 'อินฟลูเอนเซอร์', agency: 'เอเจนซี่', corporate: 'บริษัทผู้ว่าจ้าง' };

function Pill({ status }) {
  const [text, cls] = STATUS[status] || STATUS.unverified;
  return <span className={cx('whitespace-nowrap rounded-full px-3 py-1 text-[0.875rem] font-medium', cls)}>{text}</span>;
}

function Detail({ id, onDecided }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(null);
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.get(`/api/admin/users/${Number(id)}`) });
  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.isError) return <EmptyState compact title="เปิดข้อมูลผู้ใช้ไม่สำเร็จ" text={q.error.message} />;
  const { user: u, profile, kycDocs, branchText, addressText } = q.data;
  const jur = profile.isJuristic;
  const bank = u.bank || {};
  const rows = [
    ['บทบาท', `${ROLE_TEXT[u.role] || u.role} · ${jur ? 'นิติบุคคล' : 'บุคคลธรรมดา'}`],
    [jur ? 'ชื่อนิติบุคคล' : 'ชื่อ-นามสกุล', u.companyName || u.displayName],
    jur && ['ประเภทนิติบุคคล', u.companyType || '-'],
    ['เลขประจำตัวผู้เสียภาษี', formatTaxId(u.taxId) || '-'],
    jur && ['สำนักงานใหญ่/สาขา', branchText || '-'],
    jur && ['กรรมการผู้มีอำนาจ', `${u.authName || '-'}${u.authPosition ? ` (${u.authPosition})` : ''}`],
    ['สถานะ VAT', u.vatRegistered ? 'จดทะเบียนแล้ว ออกใบกำกับภาษีได้' : 'ยังไม่จดทะเบียน ออกใบกำกับภาษีไม่ได้'],
    ['ที่อยู่', addressText || '-'],
    ['เบอร์ติดต่อ', u.phone || '-'],
    ['อีเมล', `${u.email}${u.emailVerified ? ' (ยืนยันแล้ว)' : ' (ยังไม่ยืนยัน)'}`],
    ['บัญชีธนาคาร', bank.accountNo ? `${bank.bankName || ''} ${bank.accountNo} ${bank.accountName || ''}` : '-'],
    ['ความครบถ้วนโปรไฟล์', `${profile.completeness.percent}%${profile.completeness.ok ? '' : ` (ขาด: ${profile.completeness.missing.join(', ')})`}`],
  ].filter(Boolean);

  function decide(approve) {
    if (!approve && !note.trim()) { toast('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 'err'); return; }
    setConfirm({
      title: approve ? 'อนุมัติผู้ใช้รายนี้?' : 'ไม่อนุมัติผู้ใช้รายนี้?',
      message: approve ? 'ระบบจะแจ้งผลให้ผู้ใช้ทราบทันที' : 'ผู้ใช้จะเห็นเหตุผลที่ระบุไว้ และส่งเอกสารใหม่ได้',
      confirmText: approve ? 'อนุมัติ' : 'ไม่อนุมัติ', danger: !approve,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.post(`/api/admin/users/${Number(u.id)}/verify`, { approve, note: note.trim() });
          toast(approve ? 'อนุมัติแล้ว ระบบแจ้งเตือนผู้ใช้เรียบร้อย' : 'บันทึกผลไม่อนุมัติแล้ว');
          setNote('');
          void q.refetch();
          onDecided();
        } catch (err) { toast(err.message, 'err'); }
      },
    });
  }

  return (
    <div key={id} className="tf-fade-up">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.25rem] font-medium">{u.companyName || u.displayName}</h2>
        <Pill status={u.verifyStatus} />
      </div>
      {u.verifyNote && <p className="mb-4 rounded-2xl bg-[#FFF8E8] px-4 py-3 text-[0.96875rem]">หมายเหตุล่าสุด: {u.verifyNote}</p>}
      <dl className="mb-5 divide-y divide-line rounded-[18px] bg-tile px-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 py-2.5 text-[0.96875rem] sm:flex-row sm:justify-between sm:gap-4">
            <dt className="shrink-0 text-ink-soft">{k}</dt><dd className="font-medium sm:text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mb-2 text-[1.03125rem] font-medium">เอกสารยืนยันตัวตน</h3>
      <div className="mb-5 flex flex-col gap-2">
        {kycDocs.length ? kycDocs.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-3 rounded-2xl p-3 ring-1 ring-line">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-pale text-orange"><Icon name="file" className="size-5" /></span>
              <span className="min-w-0"><b className="block truncate text-[0.96875rem] font-medium">{k.label}</b><small className="text-[0.875rem] text-ink-soft">{k.filename || 'ไฟล์'} · {Math.round((k.size || 0) / 1024)} KB</small></span>
            </span>
            <a className="tf-btn tf-btn-soft !py-2 text-[0.9375rem]" href={`${API_URL}/api/kyc/${Number(k.id)}/file`} target="_blank" rel="noreferrer">เปิดดู</a>
          </div>
        )) : <p className="text-[0.96875rem] text-ink-soft">ผู้ใช้ยังไม่ได้แนบเอกสาร</p>}
      </div>
      <h3 className="mb-2 text-[1.03125rem] font-medium">ผลการตรวจสอบ</h3>
      {u.verifyStatus === 'pending' ? (
        <>
          <label htmlFor="verify-note" className="mb-1.5 block text-[0.9375rem] text-ink-soft">หมายเหตุ / เหตุผล (บังคับกรอกเมื่อไม่อนุมัติ)</label>
          <textarea id="verify-note" rows={2} className="tf-input mb-3" placeholder="เช่น หนังสือรับรองนิติบุคคลคัดเกิน 6 เดือน กรุณาแนบฉบับใหม่" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" className="flex-1" onClick={() => decide(true)}>อนุมัติการยืนยันตัวตน</Button>
            <Button variant="ghost" className="!text-danger hover:!border-danger" onClick={() => decide(false)}>ไม่อนุมัติ</Button>
          </div>
        </>
      ) : (
        <p className="rounded-2xl bg-tile px-4 py-3 text-[0.96875rem] text-ink-soft">
          {u.verifyStatus === 'unverified'
            ? 'ผู้ใช้ยังไม่ได้ส่งเอกสารขอตรวจสอบตัวตน พิจารณาผลได้หลังผู้ใช้ส่งเอกสารแล้ว'
            : 'พิจารณาผลไปแล้ว ถ้าผู้ใช้ส่งเอกสารใหม่ รายการจะกลับมาอยู่ในหมวด "รอตรวจสอบ" อีกครั้ง'}
        </p>
      )}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'pending';
  const openId = params.get('user');
  const list = useQuery({ queryKey: ['admin', 'users', status], queryFn: () => api.get(`/api/admin/users${status ? `?status=${status}` : ''}`) });
  const pendingCount = useQuery({ queryKey: ['admin', 'users', 'pending'], queryFn: () => api.get('/api/admin/users?status=pending') });
  const items = list.data ? list.data.items : [];
  const setQ = (patch) => setParams((p) => { const n = new URLSearchParams(p); Object.entries(patch).forEach(([k, v]) => (v == null ? n.delete(k) : n.set(k, v))); return n; });

  return (
    <>
      <PageHeader title="ตรวจสอบการยืนยันตัวตน" subtitle="ตรวจเอกสารที่ผู้ใช้ส่งมา แล้วอนุมัติหรือแจ้งเหตุผลที่ไม่อนุมัติ ทุกครั้งที่เปิดดูเอกสารจะถูกบันทึกไว้ตาม PDPA" />
      <p className="mb-4 rounded-[20px] bg-[#FFF8E8] px-4 py-3 text-[0.96875rem] text-[#7A5B00]">
        เอกสารยืนยันตัวตนเป็นข้อมูลส่วนบุคคล เปิดดูเท่าที่จำเป็นต่อการตรวจสอบเท่านั้น ระบบบันทึกผู้เปิดดู เวลา และเอกสารที่เปิดไว้ทุกครั้ง
      </p>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map(([k, label]) => (
          <button key={k || 'all'} type="button" onClick={() => setQ({ status: k, user: null })}
            className={cx('flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[0.96875rem] font-medium transition-colors', status === k ? 'bg-ink text-white' : 'bg-white text-ink-soft hover:text-ink')}>
            {label}
            {k === 'pending' && pendingCount.data && pendingCount.data.items.length > 0 && (
              <span className="rounded-full bg-orange px-1.5 text-[0.84375rem] text-white">{pendingCount.data.items.length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title="รายชื่อผู้ใช้" subtitle={list.data ? `${items.length} รายการ` : ''} bodyClassName="!px-3 sm:!px-3">
          {list.isLoading ? <div className="space-y-2 px-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
            : items.length ? items.map((u) => (
              <button key={u.id} type="button" onClick={() => setQ({ user: String(u.id) })}
                className={cx('flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors', String(u.id) === openId ? 'bg-orange-pale' : 'hover:bg-tile')}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tile font-display text-[1.0625rem]">{(u.companyName || u.displayName || '?').trim().charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[1rem] font-medium">{u.companyName || u.displayName}</b>
                  <small className="block truncate text-[0.875rem] text-ink-soft">{ROLE_TEXT[u.role] || u.role} · {u.email}</small>
                  <small className="block text-[0.875rem] text-ink-soft">เลขผู้เสียภาษี {formatTaxId(u.taxId) || '-'} · เอกสาร {u.docCount} ฉบับ</small>
                </span>
                <Pill status={u.verifyStatus} />
              </button>
            )) : <EmptyState compact img="/img/mascot-success.webp" text="ไม่มีรายการในหมวดนี้" />}
        </Card>
        <Card className="xl:sticky xl:top-24">
          {openId ? <Detail id={openId} onDecided={() => qc.invalidateQueries({ queryKey: ['admin', 'users'] })} />
            : <EmptyState compact img="/img/mascot-question.webp" text="เลือกผู้ใช้จากรายการเพื่อดูรายละเอียด" />}
        </Card>
      </div>
    </>
  );
}
