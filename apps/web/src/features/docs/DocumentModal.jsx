/**
 * DocumentModal.jsx หน้าต่างรายละเอียดเอกสาร (ภาคผนวก ข ข้อ 10) และการลงลายมือชื่อ (ข้อ 11)
 * แท็บ: ข้อมูล · แก้ไข · ไฟล์แนบ · ลายเซ็น · ส่งเอกสาร · ประวัติ  (ย้ายจาก documents.js ของหน้าเดิม)
 * แท็บ "แก้ไข" เปิดแบบฟอร์มสร้างเอกสาร (CreatePage) ในโหมดแก้ไข
 */
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_URL } from '../../lib/env.js';
import { DOC_LABEL, STATUS_LABEL, thDate, thDateTime, thb } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { Alert, Button, SelectField, Spinner, TextField, cx } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import OtpDialog from './OtpDialog.jsx';
import SignaturePad from './SignaturePad.jsx';
import { docsApi, readDataUrl } from './docsApi.js';
import {
  ATTACH_KIND, EDITABLE, REQUEST_STATUS, STATUS_HELP, STATUS_INFO, STATUS_TITLE,
  allowedTransitions, counterparty, declineInfo, docAmounts, needsSignBeforeApprove, nextActionText, nextDocs, stepperState, transitionLabel,
} from './docStatus.js';

const TABS = [
  { key: 'info', label: 'ข้อมูล', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></> },
  { key: 'edit', label: 'แก้ไข', editableOnly: true, icon: <path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" /> },
  { key: 'files', label: 'ไฟล์แนบ', icon: <path d="M20 12l-7.5 7.5a5 5 0 01-7-7L13 5a3.3 3.3 0 014.7 4.7L10 17.4a1.7 1.7 0 01-2.4-2.4L14.5 8" /> },
  { key: 'sign', label: 'ลายเซ็น', icon: <path d="M3 17c3-6 4.5-9 6-9s-1 8 1 8 3-5 4.5-5S16 15 21 13M3 21h18" /> },
  { key: 'send', label: 'ส่งเอกสาร', icon: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" /> },
  { key: 'history', label: 'ประวัติ', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
];
const ATTACH_MAX = 5 * 1024 * 1024;
const ATTACH_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-[0.96875rem] text-ink-soft">{label}</span>
      <div className="text-[1rem] font-medium sm:text-right">{children}</div>
    </div>
  );
}

/**
 * ช่องข้อมูลแบบการ์ด (หน้าข้อมูลเอกสาร)
 * ป้ายกำกับกับค่าตัวใหญ่ขึ้นและไอคอนเป็นเส้นบางสีกลาง อ่านง่ายและไม่ฉูดฉาด
 * การ์ดทุกใบสูงเท่ากันในแถวเดียวกัน (h-full + flex) แผงจึงดูเป็นสัดส่วน
 */
function Field({ label, icon, children, className }) {
  return (
    <div className={cx('flex h-full flex-col rounded-2xl border border-line bg-white px-4 py-3.5 transition-shadow hover:shadow-[0_10px_24px_-18px_rgba(24,24,27,0.35)]', className)}>
      <p className="mb-1.5 flex items-center gap-2 text-[0.875rem] text-ink-soft">
        {icon && <svg viewBox="0 0 24 24" className="size-[1.125rem] shrink-0 text-[#A8A29E]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>}
        {label}
      </p>
      <div className="text-[1.0625rem] font-medium leading-snug text-ink">{children}</div>
    </div>
  );
}
/** ไอคอนชุดเดียวของแผงข้อมูล: เส้นเดียว ไม่มีพื้นทึบ ให้โทนเดียวกันทั้งหน้า */
const ICON = {
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5" /></>,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" />,
  pen: <path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" />,
  goal: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /></>,
  cal: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  edit: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};

/** หัวข้อย่อยในแผงข้อมูล ให้แต่ละกลุ่มแยกกันชัดเจน */
function SectionTitle({ children, className }) {
  return <h3 className={cx('mb-2.5 text-[0.9375rem] font-semibold text-ink-soft', className)}>{children}</h3>;
}
function StatusChip({ status }) {
  const i = STATUS_INFO[status] || { label: status, cls: 'bg-[#F1EBE5] text-ink-soft' };
  return <span className={cx('whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.90625rem] font-medium', i.cls)}>{i.label}</span>;
}

function Stepper({ status }) {
  const { steps } = stepperState(status);
  return (
    <>
      <ol className="isolate mb-4 flex rounded-2xl bg-tile/70 px-2 pb-3.5 pt-4">
        {steps.map((s, i) => (
          <li key={s.key} aria-current={s.now ? 'step' : undefined} className={cx('relative flex flex-1 flex-col items-center gap-1.5 whitespace-nowrap text-center text-[0.875rem] font-semibold', s.on ? 'text-orange-deep' : 'text-[#B0A79F]')}>
            {i > 0 && <span aria-hidden="true" className={cx('absolute right-1/2 top-[14px] -z-10 h-[3px] w-full rounded-full', s.lineOn ? 'bg-[linear-gradient(90deg,var(--color-orange),var(--color-orange-deep))]' : 'bg-[#E7E1DB]')} />}
            <span className={cx('flex size-[1.875rem] items-center justify-center rounded-full text-[0.8125rem] font-bold transition-all',
              s.on ? 'bg-[linear-gradient(135deg,var(--color-orange),var(--color-orange-deep))] text-white shadow-[0_6px_14px_-6px_rgba(232,90,0,0.7)]' : 'bg-white text-[#B0A79F] ring-1 ring-[#E7E1DB]',
              s.now && 'ring-4 ring-orange-soft')}>
              {s.done ? <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : i + 1}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
    </>
  );
}

/** เซสชันหมดอายุ: แจ้งเป็นมิตร พร้อมปุ่มกลับไปเข้าสู่ระบบ แทนข้อความ error ดิบ */
function SessionExpired({ onLogin }) {
  return (
    <div role="alert" className="tf-reveal flex flex-col items-center px-4 py-8 text-center">
      <span aria-hidden="true" className="mb-4 flex size-16 items-center justify-center rounded-full bg-orange-pale text-orange-deep ring-8 ring-orange-pale/60">
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3M12 15v2" /></svg>
      </span>
      <h3 className="text-[1.1875rem] font-medium">เซสชันหมดอายุแล้ว</h3>
      <p className="mt-1.5 max-w-[360px] text-[0.9375rem] leading-relaxed text-ink-soft">เพื่อความปลอดภัยของข้อมูลภาษี ระบบออกจากระบบให้อัตโนมัติ กรุณาเข้าสู่ระบบอีกครั้งเพื่อดูเอกสารฉบับนี้</p>
      <Button className="mt-5 px-6" onClick={onLogin}>เข้าสู่ระบบอีกครั้ง</Button>
    </div>
  );
}

export default function DocumentModal({ id, onClose, onChanged, onOpenDoc, initialTab = 'info' }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  // ลิงก์เก่าที่ชี้แท็บที่ไม่มีแล้ว (เช่น ?tab=share) เปิดแท็บข้อมูลแทน ไม่ค้างหน้าว่าง
  const [tab, setTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab : 'info');
  const [otp, setOtp] = useState(null); // { title, action, onDone } เปิดจากแท็บลายเซ็น
  const [confirm, setConfirm] = useState(null);
  const doc = useQuery({ queryKey: ['document', id], queryFn: () => docsApi.get(id), retry: false });
  const d = doc.data;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !otp && !confirm) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, otp, confirm]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['document', id] });
    onChanged && onChanged();
  }

  /** เปลี่ยนสถานะ: ตีกลับต้องระบุเหตุผล ยกเลิกต้องยืนยัน อนุมัติต้องลงนามกำกับก่อนถ้ายังไม่ได้ลงนาม */
  async function changeStatus(status, opts = {}) {
    if (needsSignBeforeApprove(d, status) && !opts.skipSign) {
      setConfirm({
        title: 'เอกสารยังไม่ได้ลงนาม',
        message: 'ผู้ออกเอกสารลงลายมือชื่อเพื่อรับรองเอกสารก่อนดำเนินการเสร็จสิ้น',
        confirmText: 'ไปลงนามก่อน',
        altText: 'ข้ามการลงนาม',
        onAlt: () => { setConfirm(null); void changeStatus(status, { skipSign: true }); },
        onConfirm: () => { setConfirm(null); setTab('sign'); },
      });
      return;
    }
    if (status === 'rejected' && opts.note == null) {
      setConfirm({
        kind: 'prompt', title: 'ตีกลับเอกสาร', placeholder: 'เช่น ยอดเงินไม่ตรงกับที่ตกลง',
        message: 'ระบุเหตุผลที่ไม่อนุมัติ เพื่อแจ้งให้ผู้เกี่ยวข้องทราบ (เว้นว่างได้)',
        confirmText: 'ตีกลับเอกสาร', danger: true,
        onConfirm: (note) => { setConfirm(null); void changeStatus(status, { note: note || '' }); },
      });
      return;
    }
    if (status === 'cancelled' && !opts.confirmed) {
      setConfirm({
        title: 'ยกเลิกเอกสารนี้?', confirmText: 'ยกเลิกเอกสาร', danger: true,
        message: 'เอกสารที่ยกเลิกจะถูกประทับลายน้ำ "ยกเลิกแล้ว" บน PDF และไม่สามารถนำไปใช้อ้างอิงได้อีก การยกเลิกไม่สามารถย้อนกลับได้',
        onConfirm: () => { setConfirm(null); void changeStatus(status, { confirmed: true }); },
      });
      return;
    }
    try {
      await docsApi.setStatus(id, status, opts.note || '');
      toast(`เปลี่ยนสถานะเป็น ${STATUS_INFO[status].label}`);
      void refresh();
    } catch (err) { toast(err.message, 'err'); }
  }

  function askDelete() {
    setConfirm({
      title: 'ลบเอกสารนี้?', confirmText: 'ลบถาวร', danger: true,
      message: 'เอกสารและไฟล์แนบทั้งหมดจะถูกลบถาวร ไม่สามารถกู้คืนได้',
      onConfirm: async () => {
        setConfirm(null);
        try { await docsApi.remove(id); toast('ลบเอกสารแล้ว'); onChanged && onChanged(); onClose(); }
        catch (err) { toast(err.message, 'err'); }
      },
    });
  }

  async function duplicate() {
    try {
      const copy = await docsApi.duplicate(id);
      toast('คัดลอกเป็นฉบับใหม่แล้ว (สถานะแบบร่าง)');
      onChanged && onChanged();
      if (copy && copy.id && onOpenDoc) onOpenDoc(copy.id);
    } catch (err) { toast(err.message, 'err'); }
  }

  function nextDoc(n) {
    onClose();
    void navigate(`/app/create?${new URLSearchParams({ type: n.type, purpose: 'send', ...n.ref })}`);
  }

  const tabs = TABS.filter((t) => !t.editableOnly || (d && EDITABLE.includes(d.status)));

  // วาดที่ document.body: ถ้าอยู่ใต้ element ที่มี backdrop-filter/transform กล่อง fixed จะถูกจำกัดอยู่ในกรอบนั้น
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="doc-title" className="tf-pop flex max-h-[92vh] w-full max-w-[760px] flex-col rounded-t-[28px] bg-white shadow-[0_30px_80px_-30px_rgba(24,24,27,0.45)] sm:rounded-[28px]">
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div className="flex min-w-0 items-center gap-3.5">
            {/* ไอคอนแบบเส้นบาง พื้นอ่อน แทนกล่องไล่สีส้มทึบของเดิม ให้หัวหน้าต่างเบาและเป็นมินิมอลขึ้น */}
            <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-tile text-ink-soft ring-1 ring-line">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
            </span>
            <div className="min-w-0">
              {d && <p className="font-mono text-[0.875rem] font-medium text-ink-soft">{d.docNo || 'แบบร่าง ยังไม่ออกเลขที่'}</p>}
              <h2 id="doc-title" className="mt-0.5 flex flex-wrap items-center gap-2.5 text-[1.4375rem] font-medium">
                {d ? (DOC_LABEL[d.type] || d.type) : doc.isError ? 'ไม่สามารถเปิดเอกสารได้' : 'กำลังโหลด'}
                {d && <StatusChip status={d.status} />}
              </h2>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-tile text-ink-soft transition-colors hover:bg-[#EBEAE8] hover:text-ink"><svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        {/* จอใหญ่: แท็บกว้างเท่ากันเต็มแถบ (grid คอลัมน์ละเท่า ๆ กัน) จำนวนแท็บเปลี่ยนตามสถานะเอกสารก็ยังเต็มพอดี
            มือถือ: ตัดบรรทัดเองเมื่อที่ไม่พอ แทนการเลื่อนแนวนอนที่ทำให้แท็บท้าย ๆ ถูกบังจนกดไม่ได้ */}
        {d && (
          <div className="mx-6 flex shrink-0 flex-wrap gap-1 rounded-[20px] bg-tile p-1.5 sm:grid sm:auto-cols-fr sm:grid-flow-col" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cx('inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[0.9375rem] font-medium leading-normal transition-all duration-200 sm:px-2',
                  tab === t.key ? 'bg-ink text-white shadow-[0_6px_14px_-8px_rgba(24,24,27,0.6)]' : 'text-ink-soft hover:bg-white/70 hover:text-ink')}
              >
                <svg viewBox="0 0 24 24" className="size-[1.0625rem] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
                {t.label}{t.key === 'files' ? ` (${(d.attachments || []).length})` : ''}
              </button>
            ))}
          </div>
        )}

        <div key={tab} className="tf-fade-up min-h-[220px] flex-1 overflow-y-auto px-6 pb-6 pt-5">
          {doc.isLoading && <p className="flex items-center gap-2 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังโหลดเอกสาร</p>}
          {doc.isError && (doc.error && doc.error.status === 401
            ? <SessionExpired onLogin={() => { onClose(); void navigate('/login'); }} />
            : <Alert>{doc.error.message}</Alert>)}
          {d && tab === 'info' && <InfoTab d={d} onStatus={changeStatus} onDelete={askDelete} onDuplicate={duplicate} onGoSend={() => setTab('send')} onNextDoc={nextDoc} />}
          {d && tab === 'edit' && <EditTab d={d} />}
          {d && tab === 'files' && <FilesTab d={d} onChanged={refresh} />}
          {d && tab === 'sign' && <SignTab d={d} onChanged={refresh} setOtp={setOtp} setConfirm={setConfirm} />}
          {d && tab === 'send' && <SendTab d={d} onGoSign={() => setTab('sign')} onChanged={refresh} />}
          {d && tab === 'history' && <HistoryTab d={d} />}
        </div>
      </div>

      {otp && (
        <OtpDialog
          purpose="sign-doc"
          refId={id}
          title={otp.title}
          action={otp.action}
          onDone={otp.onDone}
          onCancel={() => setOtp(null)}
        />
      )}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>,
    document.body,
  );
}

/** ไอคอนประจำสถานะ เส้นเดียวบาง ๆ ชุดเดียวกับไอคอนอื่นในหน้านี้ */
const STATUS_GLYPH = {
  draft: <path d="M4 20l4-1 11-11a2.1 2.1 0 00-3-3L5 16l-1 4z" />,
  pending: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  approved: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  rejected: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5M12 16h.01" /></>,
  cancelled: <><circle cx="12" cy="12" r="8.5" /><path d="M8 12h8" /></>,
  archived: <><rect x="3.5" y="4" width="17" height="5" rx="1.5" /><path d="M5.5 9v10h13V9M10 13h4" /></>,
};
/** พื้น/ขอบ/วงไอคอน/สีพาดหัว ของการ์ดสถานะ */
const STATUS_SKIN = {
  draft: { box: 'border-line bg-tile', chip: 'bg-white text-ink-soft ring-1 ring-line', title: 'text-ink' },
  pending: { box: 'border-[#CFE2F3] bg-info-soft', chip: 'bg-info text-white', title: 'text-info' },
  approved: { box: 'border-[#BFE6CF] bg-ok-soft', chip: 'bg-ok text-white', title: 'text-ok' },
  rejected: { box: 'border-[#F0BFBF] bg-danger-soft', chip: 'bg-danger text-white', title: 'text-danger' },
  cancelled: { box: 'border-line bg-tile', chip: 'bg-[#A8A29E] text-white', title: 'text-ink-soft' },
  archived: { box: 'border-line bg-tile', chip: 'bg-ink-soft text-white', title: 'text-ink' },
};

/**
 * การ์ดสถานะเอกสาร: พาดหัวตัวใหญ่ + คำอธิบาย + แถบ "ขั้นตอนถัดไป" ที่แยกพื้นออกมาให้เห็นชัด
 * (เดิมเป็นข้อความสองย่อหน้าติดกันในกล่องเดียว ผู้ใช้บอกว่าอ่านยาก แยกไม่ออกว่าต้องทำอะไรต่อ)
 */
function StatusCard({ d, next, action, help }) {
  const sk = STATUS_SKIN[d.status] || STATUS_SKIN.draft;
  return (
    <section className={cx('mb-4 overflow-hidden rounded-2xl border', sk.box)}>
      <div className="flex items-start gap-3.5 p-4">
        <span aria-hidden="true" className={cx('flex size-11 shrink-0 items-center justify-center rounded-full', sk.chip)}>
          <svg viewBox="0 0 24 24" className="size-[1.375rem]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{STATUS_GLYPH[d.status] || STATUS_GLYPH.draft}</svg>
        </span>
        <div className="min-w-0">
          <h3 className={cx('font-display text-[1.25rem] font-semibold leading-snug', sk.title)}>{STATUS_TITLE[d.status] || STATUS_LABEL[d.status]}</h3>
          <p className="mt-1 text-[1rem] leading-relaxed text-ink">{help || STATUS_HELP[d.status]}</p>
          {d.status === 'cancelled' && d.cancelReason && (
            <p className="mt-2 text-[0.96875rem] leading-relaxed text-ink-soft"><b className="font-medium text-ink">เหตุผลที่ยกเลิก:</b> {d.cancelReason}</p>
          )}
        </div>
      </div>
      {next && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-black/[0.07] bg-white/70 px-4 py-3">
          <span className="shrink-0 rounded-full bg-ink px-3 py-0.5 text-[0.84375rem] font-semibold text-white">ขั้นตอนถัดไป</span>
          <p className="min-w-0 flex-1 text-[1rem] leading-snug">{next}</p>
          {action && <Button variant="dark" className="shrink-0 !px-4 !py-1.5 text-[0.9375rem]" onClick={action.run}>{action.label}</Button>}
        </div>
      )}
    </section>
  );
}

/**
 * การ์ด "ถูกตีกลับ" แสดงบทสนทนาทั้งรอบให้ครบในที่เดียว
 * คำขอที่เราส่งไป → เหตุผลที่อีกฝ่ายส่งกลับมา → สิ่งที่ต้องทำต่อ
 * ผู้ใช้จะได้ไม่ต้องไปไล่หาในแท็บประวัติหรือในอีเมลว่าอีกฝ่ายติดตรงไหน
 */
function DeclineCard({ info, onFix, canFix }) {
  const Line = ({ k, children }) => (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="shrink-0 text-[0.90625rem] text-ink-soft sm:w-[120px]">{k}</dt>
      <dd className="min-w-0 flex-1 text-[1rem] leading-snug">{children}</dd>
    </div>
  );
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border-[1.5px] border-[#F0BFBF] bg-white">
      <header className="flex items-center gap-2.5 bg-danger-soft px-4 py-3">
        <svg viewBox="0 0 24 24" className="size-[1.375rem] shrink-0 text-danger" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 4.3L2.6 18a1.7 1.7 0 001.5 2.5h15.8A1.7 1.7 0 0021.4 18L13.7 4.3a1.7 1.7 0 00-3 0z" /><path d="M12 9.5v4M12 17h.01" />
        </svg>
        <h3 className="font-display text-[1.125rem] font-semibold text-danger">รายละเอียดการตีกลับ{info.byPartner ? 'จากคู่ค้า' : 'จากผู้ตรวจภายใน'}</h3>
      </header>

      <div className="p-4">
        {/* เหตุผลคือสิ่งที่ต้องอ่านก่อนเพื่อน จึงวางไว้บนสุดและตัวใหญ่ที่สุดในการ์ด */}
        <div className="rounded-xl border-l-[5px] border-danger bg-danger-soft/70 px-4 py-3.5">
          <p className="mb-1.5 text-[0.90625rem] font-semibold text-danger">เหตุผลที่ตีกลับ / สิ่งที่ให้แก้ไข</p>
          <p className="text-[1.09375rem] font-medium leading-relaxed text-ink">
            {info.reason ? `“${info.reason}”` : 'อีกฝ่ายไม่ได้ระบุเหตุผลไว้ ติดต่อสอบถามก่อนแก้ไข'}
          </p>
          <p className="mt-2.5 border-t border-danger/15 pt-2 text-[0.90625rem] text-ink-soft">
            โดย <b className="font-medium text-ink">{info.who}</b>
            {info.email ? <span className="font-mono"> ({info.email})</span> : null}
            {info.at ? ` · ${thDateTime(info.at)}` : ''}
          </p>
        </div>

        {/* คำขอที่เราส่งออกไปรอบที่แล้ว ไว้เทียบกับเหตุผลด้านบน */}
        {info.sent && (
          <div className="mt-3.5 rounded-xl bg-tile/70 px-4 py-2.5">
            <p className="mb-0.5 text-[0.90625rem] font-semibold text-ink-soft">คำขอที่คุณส่งไปรอบที่แล้ว</p>
            <dl className="divide-y divide-line">
              <Line k="ส่งเมื่อ">{thDateTime(info.sent.at)}</Line>
              <Line k="ประเภทคำขอ">{info.sent.purpose}{info.sent.signAs ? ` ในฐานะ${info.sent.signAs}` : ''}</Line>
              {info.sent.dueDate && <Line k="กำหนดตอบกลับ">{thDate(info.sent.dueDate)}</Line>}
              <Line k="ข้อความที่แนบไป">{info.sent.message ? `“${info.sent.message}”` : <span className="text-ink-soft">ไม่ได้แนบข้อความ</span>}</Line>
            </dl>
          </div>
        )}

        {/* ขั้นตอนแก้ไข เขียนเป็นลำดับ 1-2-3 ให้ทำตามได้เลย */}
        <div className="mt-3.5">
          <p className="mb-2 text-[0.90625rem] font-semibold text-ink-soft">ทำตามนี้เพื่อส่งใหม่</p>
          <ol className="space-y-2">
            {[
              'กด "กลับไปแก้ไข" เพื่อปลดล็อกเอกสารกลับเป็นแบบร่าง',
              `แก้ข้อมูลตามเหตุผลที่${info.byPartner ? 'คู่ค้า' : 'ผู้ตรวจ'}แจ้งไว้ด้านบน แล้วลงนามใหม่ที่แท็บ "ลายเซ็น"`,
              info.byPartner ? 'ส่งให้คู่ค้าอีกครั้งที่แท็บ "ส่งเอกสาร"' : 'กด "ส่งตรวจสอบ" เพื่อส่งให้ผู้ตรวจอีกครั้ง',
            ].map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[1rem] leading-snug">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-danger-soft text-[0.84375rem] font-bold text-danger">{i + 1}</span>
                <span className="min-w-0 flex-1">{t}</span>
              </li>
            ))}
          </ol>
        </div>

        {canFix && <Button variant="dark" block className="mt-4 !py-2.5 text-[1rem]" onClick={onFix}>กลับไปแก้ไขเอกสาร</Button>}
      </div>
    </section>
  );
}

/* ---------- แท็บข้อมูล ---------- */
function InfoTab({ d, onStatus, onDelete, onDuplicate, onGoSend, onNextDoc }) {
  const { taxLabel, taxValue, total } = docAmounts(d);
  const ar = d.activeRequest;
  const pdf = `${API_URL}/api/documents/${Number(d.id)}`;
  const next = nextActionText(d);
  const declined = declineInfo(d);
  const canFix = allowedTransitions(d).includes('draft');
  // ปุ่มลัดของ "ขั้นตอนถัดไป" ชี้ไปที่สิ่งที่ต้องทำจริง ๆ ของสถานะนั้น ไม่ต้องไล่หาปุ่มเอง
  const nextAction = d.status === 'draft' && (d.docPurpose || 'self') === 'send' ? { label: 'ไปที่ส่งเอกสาร', run: onGoSend }
    : d.status === 'rejected' && canFix ? { label: 'กลับไปแก้ไข', run: () => onStatus('draft') }
      : d.status === 'pending' && ar && ar.status === 'sent' ? { label: 'ดูสถานะคำขอ', run: onGoSend }
        : null;
  const isEtax = ['ETAX_INVOICE', 'ETAX_RECEIPT'].includes(d.type);
  const secondary = 'tf-btn tf-btn-ghost px-3.5 py-2 text-[0.9375rem]';
  return (
    <>
      <Stepper status={d.status} />
      <StatusCard d={d} next={next} action={nextAction}
        help={declined && !declined.byPartner ? 'ผู้ตรวจสอบภายในส่งเอกสารกลับมาพร้อมเหตุผล แก้ไขตามที่แจ้งไว้ด้านล่าง แล้วส่งตรวจใหม่ได้' : null} />
      {declined && <DeclineCard info={declined} canFix={canFix} onFix={() => onStatus('draft')} />}
      {d.status === 'pending' && ar && ar.status === 'sent' && !d.counterpartySignature && (
        <div className="mb-4 rounded-2xl bg-info-soft px-4 py-3.5 text-[0.96875rem] leading-relaxed text-info">
          <b>รอการอนุมัติ / ลงนามจากคู่ค้า</b><br />
          ส่งถึง <b>{ar.toName || ar.toEmail}</b> ({ar.toEmail}) · {ar.purpose === 'sign' ? 'ขอลายเซ็น' : 'ขอตรวจสอบ'}
          {ar.dueDate ? ` · ภายในวันที่ ${ar.dueDate}` : ''}{ar.overdue ? ' · เกินกำหนด' : ''}
        </div>
      )}
      {d.status === 'pending' && d.counterpartySignature && (
        <p className="mb-4 rounded-2xl bg-ok-soft px-4 py-3.5 text-[0.96875rem] leading-relaxed text-ok">
          คู่ค้าลงนามตอบกลับแล้ว ({d.counterpartySignature.signerName}) กด "อนุมัติ" เพื่อดำเนินการเอกสารฉบับนี้ให้เสร็จสิ้น
        </p>
      )}

      {/* สรุปยอดเงิน */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-orange-soft bg-[linear-gradient(135deg,var(--color-orange-pale),#fff_70%)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.9375rem] font-medium text-ink-soft">ยอดรวมสุทธิ</p>
            <p className="font-display text-[2.25rem] font-semibold leading-tight tracking-tight text-orange-deep">{thb(total)}</p>
          </div>
          <dl className="flex gap-3">
            <div className="rounded-2xl bg-white/80 px-4 py-2.5 text-right ring-1 ring-line">
              <dt className="text-[0.875rem] text-ink-soft">ฐานภาษี</dt>
              <dd className="font-mono text-[1.0625rem] font-medium">{thb(d.base)}</dd>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-2.5 text-right ring-1 ring-line">
              <dt className="text-[0.875rem] text-ink-soft">{taxLabel}</dt>
              <dd className="font-mono text-[1.0625rem] font-medium">{thb(taxValue)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ข้อมูลคู่ค้า: แยกเป็นกลุ่มของตัวเอง ชื่อคู่ค้าเป็นตัวที่ใหญ่ที่สุดของกลุ่ม จะได้เห็นทันทีว่าเอกสารนี้ทำกับใคร */}
      <section className="mb-4">
        <SectionTitle>ข้อมูลคู่ค้า</SectionTitle>
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center gap-4 px-4 py-4">
            <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-orange-pale font-display text-[1.25rem] font-semibold text-orange-deep">
              {(counterparty(d) || '-').trim().charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="text-[0.875rem] text-ink-soft">คู่ค้า / ลูกค้า</p>
              <p className="truncate text-[1.25rem] font-medium leading-snug">{counterparty(d)}</p>
            </div>
          </div>
          <dl className="grid border-t border-line sm:grid-cols-2">
            <div className="border-b border-line px-4 py-3 sm:border-b-0 sm:border-r">
              <dt className="flex items-center gap-2 text-[0.875rem] text-ink-soft">
                <svg viewBox="0 0 24 24" className="size-[1.125rem] shrink-0 text-[#A8A29E]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON.goal}</svg>
                จุดประสงค์
              </dt>
              <dd className="mt-1 text-[1.0625rem] font-medium">{{ send: 'ส่งให้คู่ค้า', self: 'ใช้ภายใน' }[d.docPurpose || 'self'] || 'ใช้ภายใน'}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="flex items-center gap-2 text-[0.875rem] text-ink-soft">
                <svg viewBox="0 0 24 24" className="size-[1.125rem] shrink-0 text-[#A8A29E]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON.send}</svg>
                ส่งถึง
              </dt>
              <dd className="mt-1 text-[1.0625rem] font-medium leading-snug">
                {ar ? <>
                  {ar.toName || ar.toEmail}
                  <span className="mt-0.5 block break-all text-[0.875rem] font-normal text-ink-soft">{ar.toEmail}</span>
                  <span className="mt-0.5 block text-[0.875rem] font-normal text-ink-soft">ส่งเมื่อ {thDateTime(ar.sentAt)}{ar.respondedAt ? ` · ตอบกลับ ${thDateTime(ar.respondedAt)}` : ''}</span>
                </> : <span className="text-ink-soft">ยังไม่ได้ส่งให้คู่ค้า</span>}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ลายเซ็นและเวลา */}
      <section>
        <SectionTitle>ลายเซ็นและเวลา</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {d.signature && (
            <Field label="ลายเซ็นผู้ออกเอกสาร" icon={ICON.pen} className="sm:col-span-2">
              <span className="flex items-center gap-3">
                {d.signature.image && <img src={d.signature.image} alt="" className="h-12 w-auto rounded-lg bg-tile px-3 py-1" />}
                <span>{d.signature.signerName}<span className="mt-0.5 block text-[0.875rem] font-normal text-ink-soft">ลงนามเมื่อ {thDateTime(d.signature.signedAt)}</span></span>
              </span>
            </Field>
          )}
          <Field label="วันที่สร้าง" icon={ICON.cal}>{thDateTime(d.createdAt)}</Field>
          <Field label="แก้ไขล่าสุด" icon={ICON.edit}>{thDateTime(d.updatedAt || d.createdAt)}</Field>
        </div>
      </section>

      {allowedTransitions(d).length > 0 && (
        <div className="mt-5 rounded-2xl bg-tile/70 p-4">
          <p className="mb-2.5 text-[0.9375rem] font-semibold text-ink-soft">ดำเนินการต่อ</p>
          <div className="flex flex-wrap gap-2">
            {allowedTransitions(d).map((s) => {
              const a = transitionLabel(d, s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatus(s)}
                  className={cx('tf-btn px-4 py-2 text-[0.96875rem]',
                    a.variant === 'danger' ? 'tf-btn-ghost border-danger text-danger'
                      : a.variant === 'ghost' ? 'tf-btn-ghost'
                        : a.variant === 'success' ? 'tf-btn-solid bg-[linear-gradient(135deg,#2FA86A,#1E8E5A)] shadow-none'
                          : 'tf-btn-solid')}
                >
                  {a.text}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <a className="tf-btn tf-btn-solid px-4 py-2 text-[0.9375rem]" href={`${pdf}/pdf`} target="_blank" rel="noopener">เปิด PDF</a>
        <a className={secondary} href={`${pdf}/pdf?download=1`}>ดาวน์โหลด PDF</a>
        {isEtax && <a className={secondary} href={`${pdf}/xml`} title="ไฟล์ XML ตามมาตรฐาน ขมธอ. 3-2560 (ไฟล์เดียวกับที่แนบอยู่ใน PDF)">ดาวน์โหลด XML</a>}
        <button type="button" className={secondary} onClick={onDuplicate}>คัดลอกเป็นฉบับใหม่</button>
        {nextDocs(d).map((n) => (
          <button key={n.type} type="button" className={secondary} onClick={() => onNextDoc(n)}>{n.label}</button>
        ))}
        {d.status === 'draft' && (
          <button type="button" className="tf-btn tf-btn-ghost ml-auto border-danger px-3.5 py-2 text-[0.9375rem] text-danger" onClick={onDelete}>ลบเอกสาร</button>
        )}
      </div>
    </>
  );
}

/* ---------- แท็บแก้ไข ---------- */
function EditTab({ d }) {
  const navigate = useNavigate();
  if (d.schemaVersion !== 2) {
    return <p className="text-[0.96875rem] text-ink-soft">เอกสารรุ่นเดิม (ก่อน ver16) แก้ไขผ่านแบบฟอร์มไม่ได้ ใช้ "คัดลอกเป็นฉบับใหม่" แล้วแก้ไขฉบับใหม่แทน</p>;
  }
  return (
    <>
      <p className="mb-4 text-[1rem] leading-relaxed text-ink-soft">
        แก้ไขเอกสารด้วยแบบฟอร์มเต็มชุดเดียวกับตอนสร้าง ระบบตรวจสอบและคำนวณยอดใหม่ทั้งหมด
        {(d.signature || d.counterpartySignature) && <b className="font-medium text-danger"> เอกสารนี้ลงนามแล้ว การแก้ไขจะล้างลายเซ็นเดิมและต้องลงนามใหม่</b>}
      </p>
      <Button variant="dark" onClick={() => navigate(`/app/create?edit=${Number(d.id)}`)}>เปิดแบบฟอร์มแก้ไข</Button>
      <p className="mt-3 text-[0.90625rem] text-ink-soft">ทุกการแก้ไขถูกบันทึกเป็นเวอร์ชันใหม่ในแท็บ "ประวัติ"</p>
    </>
  );
}

/* ---------- แท็บไฟล์แนบ ---------- */
function FilesTab({ d, onChanged }) {
  const toast = useToast();
  const [kind, setKind] = useState('other');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  async function pick(f) {
    if (!f) return;
    if (!ATTACH_TYPES.includes(f.type)) { toast('รองรับเฉพาะ PDF, PNG, JPG, WEBP', 'err'); return; }
    if (f.size > ATTACH_MAX) { toast('ไฟล์เกิน 5 MB', 'err'); return; }
    setFile(f);
    setPreview(f.type.startsWith('image/') ? await readDataUrl(f) : '');
  }

  async function upload() {
    setBusy(true);
    try {
      const dataUrl = await readDataUrl(file);
      await docsApi.addAttachment(d.id, { kind, filename: file.name, mime: file.type, dataBase64: dataUrl.split(',')[1] });
      toast('แนบไฟล์เรียบร้อย');
      setFile(null); setPreview('');
      onChanged();
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function remove(attId) {
    try { await docsApi.delAttachment(attId); toast('ลบไฟล์แล้ว'); onChanged(); }
    catch (err) { toast(err.message, 'err'); }
  }

  return (
    <>
      <SelectField
        id="att-kind"
        label="ประเภทเอกสารแนบ"
        value={kind}
        options={Object.entries(ATTACH_KIND).map(([value, label]) => ({ value, label }))}
        onChange={(e) => setKind(e.target.value)}
      />
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files[0]); }}
        className={cx('rounded-2xl border-[1.5px] border-dashed p-6 text-center', drag ? 'border-orange bg-orange-pale' : 'border-line')}
      >
        <input ref={input} type="file" aria-label="เลือกไฟล์แนบของเอกสาร" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pick(e.target.files[0])} />
        <p className="text-[0.9375rem]">
          ลากไฟล์มาวาง หรือ <button type="button" className="cursor-pointer font-bold text-orange-deep underline" onClick={() => input.current.click()}>เลือกไฟล์</button>
        </p>
        <p className="mt-1 text-[0.84375rem] text-ink-soft">รองรับ PDF, PNG, JPG, WEBP · ไม่เกิน 5 MB</p>
      </div>

      {file && (
        <div className="tf-reveal mt-3 rounded-2xl border border-line p-3">
          <p className="mb-2 text-[0.875rem] font-semibold text-ink-soft">ตัวอย่างก่อนบันทึก</p>
          {preview ? <img src={preview} alt="" className="max-h-48 w-auto rounded-lg" /> : <p className="text-[0.90625rem]">PDF · {file.name}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={upload} loading={busy} className="px-4 py-2 text-[0.90625rem]">บันทึกไฟล์แนบ</Button>
            <Button variant="ghost" className="px-4 py-2 text-[0.90625rem]" onClick={() => { setFile(null); setPreview(''); }}>ยกเลิก</Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {(d.attachments || []).length === 0 && <p className="text-[0.90625rem] text-ink-soft">ยังไม่มีไฟล์แนบ</p>}
        {(d.attachments || []).map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <div className="min-w-0">
              <b className="block text-[0.90625rem]">{ATTACH_KIND[a.kind] || a.kind}</b>
              <small className="block truncate text-[0.84375rem] text-ink-soft">{a.filename} · {Math.round((a.size || 0) / 1024)} KB</small>
            </div>
            <div className="flex shrink-0 gap-2">
              <a className="tf-btn tf-btn-ghost px-3 py-1.5 text-[0.875rem]" href={`${API_URL}/api/attachments/${Number(a.id)}`} target="_blank" rel="noopener">เปิด</a>
              <button type="button" className="tf-btn tf-btn-ghost border-danger px-3 py-1.5 text-[0.875rem] text-danger" onClick={() => remove(a.id)}>ลบ</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- แท็บลายเซ็น (ข้อ 11) ---------- */
function SignTab({ d, onChanged, setOtp, setConfirm }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const saved = useQuery({ queryKey: ['signatures'], queryFn: docsApi.savedSignatures, enabled: !d.signed });

  if (d.signed && d.signature) {
    return (
      <>
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-ok-soft p-4">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-ok text-[1.125rem] text-white">✓</span>
          <div>
            <b className="text-[0.96875rem]">ลงลายมือชื่อดิจิทัลแล้ว</b>
            <small className="block text-[0.875rem] text-ink-soft">มาตรฐาน {d.signatureStandard || 'จำลอง'}</small>
          </div>
        </div>
        {d.signature.image && <img src={d.signature.image} alt="ลายเซ็น" className="mb-3 max-h-28 w-auto rounded-xl border border-line bg-white p-2" />}
        <Row label="ผู้ลงนาม">{d.signature.signerName}</Row>
        <Row label="วันและเวลาที่ลงนาม">{thDateTime(d.signature.signedAt)}</Row>
      </>
    );
  }

  /** ลงนามด้วยรูป (จากคลัง/วาด/อัปโหลด) ต้องยืนยัน OTP ก่อนเสมอ */
  function sign(image, signerName, keep) {
    const finalName = (name || '').trim() || signerName;
    if (!finalName) { toast('กรุณากรอกชื่อผู้ลงนาม', 'err'); return; }
    setOtp({
      title: 'ยืนยันการลงลายมือชื่อดิจิทัล',
      action: (otpId, code) => docsApi.sign(d.id, { signerName: finalName, image, otpId, code }),
      onDone: async () => {
        setOtp(null);
        if (keep) await docsApi.saveSignature({ name: finalName, image }).catch(() => {});
        void qc.invalidateQueries({ queryKey: ['signatures'] });
        toast(`ลงลายมือชื่อเรียบร้อย${keep ? ' และบันทึกเข้าคลังลายเซ็นแล้ว' : ''}`);
        onChanged();
      },
    });
  }

  function removeSaved(sigId) {
    setConfirm({
      title: 'ลบลายเซ็น?', message: 'ลายเซ็นนี้จะถูกลบออกจากคลังของคุณ', confirmText: 'ลบ', danger: true,
      onConfirm: async () => {
        setConfirm(null);
        await docsApi.delSignature(sigId).catch((err) => toast(err.message, 'err'));
        void qc.invalidateQueries({ queryKey: ['signatures'] });
      },
    });
  }

  const items = (saved.data && saved.data.items) || [];
  return (
    <>
      <TextField id="signer-name" label="ชื่อผู้ลงนาม" placeholder="ชื่อ-นามสกุล ผู้มีอำนาจลงนาม" value={name} onChange={(e) => setName(e.target.value)} />
      <SignaturePad
        savedItems={items}
        loadingSaved={saved.isLoading}
        onUseSaved={(sig) => sign(sig.image, sig.name, false)}
        onDeleteSaved={removeSaved}
        onSign={sign}
      />
    </>
  );
}

/* ---------- แท็บส่งเอกสาร ---------- */
function SendTab({ d, onChanged, onGoSign }) {
  const toast = useToast();
  const qc = useQueryClient();
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [form, setForm] = useState({ toEmail: '', purpose: 'sign', dueDate: week, signAs: '', message: '' });
  const [busy, setBusy] = useState(false);
  const reqs = useQuery({ queryKey: ['document', d.id, 'requests'], queryFn: () => docsApi.requests(d.id) });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function send() {
    if (!form.toEmail.trim()) { toast('กรุณาระบุอีเมลผู้รับ', 'err'); return; }
    setBusy(true);
    try {
      await docsApi.sendRequest(d.id, { ...form, toEmail: form.toEmail.trim() });
      toast(`ส่งเอกสารถึง ${form.toEmail.trim()} แล้ว อีกฝ่ายจะเห็นในกล่องรับเอกสาร + กระดิ่งแจ้งเตือน`);
      void qc.invalidateQueries({ queryKey: ['document', d.id, 'requests'] });
      onChanged();
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  async function cancel(reqId) {
    await docsApi.cancelRequest(reqId).catch((err) => toast(err.message, 'err'));
    toast('ยกเลิกคำขอแล้ว');
    void qc.invalidateQueries({ queryKey: ['document', d.id, 'requests'] });
    onChanged();
  }

  const items = (reqs.data && reqs.data.items) || [];
  const cs = d.counterpartySignature;
  return (
    <>
      {!d.signed && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-orange-pale p-4">
          <div className="min-w-0 flex-1">
            <b className="text-[0.9375rem]">ผู้ออกเอกสารยังไม่ได้ลงนาม</b>
            <small className="block text-[0.875rem] text-ink-soft">ตามขั้นตอน ผู้ออกต้องลงลายมือชื่อฝั่งตนเองก่อน แล้วจึงส่งขอลายเซ็นจากคู่ค้า</small>
          </div>
          <Button className="px-4 py-2 text-[0.90625rem]" onClick={onGoSign}>ลงนามตอนนี้</Button>
        </div>
      )}
      {cs && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-ok-soft p-4">
          <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-ok text-[1.125rem] text-white">✓</span>
          <div>
            <b className="text-[0.9375rem]">คู่ค้าลงนามตอบกลับแล้ว</b>
            <small className="block text-[0.875rem] text-ink-soft">{cs.signerName} ({cs.byEmail || ''}) · {thDateTime(cs.signedAt)}</small>
          </div>
        </div>
      )}

      <TextField id="rq-email" label="ส่งถึง (อีเมลบัญชี TaxFlow ของคู่ค้า) *" type="email" placeholder="เช่น creator@taxflow.test" value={form.toEmail} onChange={set('toEmail')} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <SelectField id="rq-purpose" label="วัตถุประสงค์" value={form.purpose} options={[{ value: 'sign', label: 'ขอลายเซ็น' }, { value: 'review', label: 'ขอตรวจสอบ' }]} onChange={set('purpose')} />
        <TextField id="rq-due" label="กำหนดตอบกลับภายใน" type="date" value={form.dueDate} onChange={set('dueDate')} />
      </div>
      <TextField id="rq-as" label="ลงนามในฐานะ" placeholder="เช่น ผู้รับจ้าง / ผู้มอบอำนาจ / ผู้รับเงิน (แสดงใต้ช่องลายเซ็น)" value={form.signAs} onChange={set('signAs')} />
      <TextField id="rq-msg" label="ข้อความถึงผู้รับ" placeholder="เช่น กรุณาตรวจสอบและลงนามภายในวันที่กำหนด" value={form.message} onChange={set('message')} />
      <Button onClick={send} loading={busy} className="px-4 py-2 text-[0.90625rem]">ส่งเอกสาร</Button>

      <p className="mb-2 mt-6 text-[0.875rem] font-semibold text-ink-soft">ประวัติการส่ง</p>
      {reqs.isLoading && <p className="text-[0.90625rem] text-ink-soft">กำลังโหลด…</p>}
      {!reqs.isLoading && !items.length && <p className="text-[0.90625rem] text-ink-soft">ยังไม่เคยส่งเอกสารนี้ให้ใคร</p>}
      <div className="flex flex-col gap-2">
        {items.map((r) => (
          <div key={r.id} className={cx('flex items-start justify-between gap-3 rounded-xl border p-3', r.overdue ? 'border-danger-soft bg-danger-soft' : 'border-line')}>
            <div className="min-w-0">
              <b className="text-[0.90625rem]">{r.toName || r.toEmail}</b> <small className="text-[0.84375rem] text-ink-soft">({r.toEmail})</small>
              <small className="block text-[0.84375rem] text-ink-soft">
                {r.purpose === 'sign' ? 'ขอลายเซ็น' : 'ขอตรวจสอบ'} · ส่ง {thDateTime(r.sentAt)}{r.dueDate ? ` · ภายใน ${r.dueDate}` : ''}{r.overdue ? ' · เกินกำหนด' : ''}
              </small>
              {r.declineReason && <small className="block text-[0.84375rem] text-danger">เหตุผล: {r.declineReason}</small>}
            </div>
            <div className="shrink-0 text-right">
              <span className="whitespace-nowrap rounded-full bg-[#F1EBE5] px-2.5 py-0.5 text-[0.8125rem] font-semibold">{REQUEST_STATUS[r.status] || r.status}</span>
              {r.status === 'sent' && (
                <button type="button" onClick={() => cancel(r.id)} className="tf-btn tf-btn-ghost mt-1.5 block px-3 py-1 text-[0.84375rem]">ยกเลิกคำขอ</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- แท็บประวัติ ---------- */
const TIMELINE_ACTIONS = ['create', 'status', 'send', 'countersign', 'sign', 'review-ok', 'declined', 'duplicate'];

/** ชื่อไทยของเหตุการณ์ใน Audit Log (ค่าดิบเป็นคีย์ภาษาอังกฤษ ผู้ใช้อ่านไม่รู้เรื่อง) */
const AUDIT_LABEL = {
  create: 'สร้างเอกสาร', edit: 'แก้ไขเอกสาร', status: 'เปลี่ยนสถานะ', send: 'ส่งเอกสาร',
  sign: 'ลงนาม', countersign: 'คู่ค้าลงนาม', 'review-ok': 'ตรวจผ่าน', declined: 'ตีกลับ',
  duplicate: 'คัดลอกเอกสาร', upload: 'แนบไฟล์', 'delete-attachment': 'ลบไฟล์แนบ',
  download: 'ดาวน์โหลด', share: 'สร้างลิงก์แชร์', issue: 'ออกเลขที่เอกสาร', view: 'เปิดดูเอกสาร',
  export: 'ส่งออกข้อมูล', delete: 'ลบเอกสาร', 'library-add': 'เก็บเข้าคลัง', 'library-del': 'นำออกจากคลัง',
  'signature-save': 'บันทึกลายเซ็น', 'calendar-add': 'เพิ่มในปฏิทิน', 'calendar-edit': 'แก้ไขปฏิทิน', 'calendar-del': 'ลบจากปฏิทิน',
};
const auditLabel = (a) => AUDIT_LABEL[a] || a;

/** สีและสัญลักษณ์ของจุดบนไทม์ไลน์ ใช้โทนเดียวกับทั้งเว็บ (ส้ม/เขียว/แดง/เทา) */
const TL_TONE = {
  create: ['#78716C', 'M12 5v14M5 12h14'],
  status: ['#E85A00', 'M4 12h11m0 0-4-4m4 4-4 4'],
  send: ['#E85A00', 'M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z'],
  sign: ['#0F766E', 'M3 17c3-6 4.5-9 6-9s-1 8 1 8 3-5 4.5-5S16 15 21 13M3 21h18'],
  countersign: ['#0F766E', 'M3 17c3-6 4.5-9 6-9s-1 8 1 8 3-5 4.5-5S16 15 21 13M3 21h18'],
  'review-ok': ['#16A34A', 'M5 12.5l4.5 4.5L19 7.5'],
  declined: ['#DC2626', 'M7 7l10 10M17 7L7 17'],
  duplicate: ['#78716C', 'M9 9h10v10H9zM5 15V5h10'],
};
const tlTone = (a) => TL_TONE[a] || ['#78716C', 'M12 8v5l3 2'];

/** ช่องค้นหาของแท็บประวัติ ค้นได้ทั้งสามส่วนพร้อมกัน */
function HistorySearch({ value, onChange, count }) {
  return (
    <div className="mb-4">
      <label className="relative block">
        <span className="sr-only">ค้นหาในประวัติเอกสาร</span>
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-soft" />
        <input
          type="search" value={value} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onChange(''); } }}
          placeholder="ค้นหาเหตุการณ์ ผู้ทำรายการ หรือเลขเวอร์ชัน"
          className="h-12 w-full rounded-full border-[1.5px] border-transparent bg-field pl-12 pr-4 text-[1rem] outline-none transition-colors placeholder:text-ink-soft/70 focus:border-orange focus:bg-white"
        />
      </label>
      {value && <p className="mt-2 px-1 text-[0.90625rem] text-ink-soft">พบ {count} รายการที่ตรงกับคำค้นหานี้</p>}
    </div>
  );
}

/** หัวข้อของแต่ละส่วนในแท็บประวัติ พร้อมจำนวนรายการ */
function HistoryHeading({ children, count }) {
  return (
    <h3 className="mb-2.5 flex items-center gap-2 text-[1.0625rem] font-semibold text-ink">
      {children}
      {count != null && <span className="rounded-full bg-tile px-2.5 text-[0.875rem] font-semibold leading-6 text-ink-soft">{count}</span>}
    </h3>
  );
}

function HistoryTab({ d }) {
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const hit = (...parts) => !term || parts.filter(Boolean).join(' ').toLowerCase().includes(term);

  const versions = [...(d.versions || [])].reverse()
    .filter((v) => hit(`เวอร์ชัน ${v.version}`, v.note, v.editor, thDateTime(v.at)));
  const audit = (d.audit || []).filter((a) => hit(auditLabel(a.action), a.action, a.detail, a.actor, thDateTime(a.at)));
  const timeline = audit.filter((a) => TIMELINE_ACTIONS.includes(a.action)).slice().reverse();
  const found = timeline.length + versions.length + audit.length;
  const empty = (text) => <p className="rounded-2xl bg-tile/70 px-4 py-3 text-[0.96875rem] text-ink-soft">{text}</p>;

  return (
    <>
      <HistorySearch value={q} onChange={setQ} count={found} />

      {/* ไทม์ไลน์: เหตุการณ์สำคัญของเอกสาร เรียงจากใหม่ไปเก่า */}
      <section className="mb-7">
        <HistoryHeading count={timeline.length}>ไทม์ไลน์เอกสาร</HistoryHeading>
        {!timeline.length ? empty(term ? 'ไม่พบเหตุการณ์ที่ตรงกับคำค้นหา' : 'ยังไม่มีเหตุการณ์')
          : (
            <ol className="flex flex-col">
              {timeline.map((a, i) => {
                const [color, glyph] = tlTone(a.action);
                const last = i === timeline.length - 1;
                return (
                  <li key={`${a.at}-${i}`} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
                        <svg viewBox="0 0 24 24" className="size-[1.125rem]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={glyph} /></svg>
                      </span>
                      {!last && <span aria-hidden="true" className="my-1 w-0.5 flex-1 rounded-full bg-line" />}
                    </div>
                    <div className={cx('min-w-0 flex-1', !last && 'pb-5')}>
                      <p className="text-[1.03125rem] font-medium leading-snug">{a.detail || auditLabel(a.action)}</p>
                      <p className="mt-0.5 text-[0.90625rem] text-ink-soft">{a.actor || 'ระบบ'} · {thDateTime(a.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
      </section>

      {/* ประวัติเวอร์ชัน: ปุ่มกางข้อมูลเป็นปุ่มแคปซูลเต็มใบ กดง่ายกว่าลิงก์ขีดเส้นใต้เดิม */}
      <section className="mb-7">
        <HistoryHeading count={versions.length}>ประวัติเวอร์ชัน</HistoryHeading>
        {!versions.length ? empty(term ? 'ไม่พบเวอร์ชันที่ตรงกับคำค้นหา' : 'ยังไม่มีประวัติเวอร์ชัน')
          : (
            <div className="flex flex-col gap-2.5">
              {versions.map((v) => {
                const on = open === v.version;
                return (
                  <div key={v.version} className="overflow-hidden rounded-2xl border border-line bg-white">
                    <div className="flex items-start gap-3.5 px-4 py-3.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-pale font-mono text-[0.9375rem] font-bold text-orange-deep">{v.version}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[1.03125rem] leading-snug"><b className="font-medium">เวอร์ชัน {v.version}</b>{v.note ? <>: {v.note}</> : null}</p>
                        <p className="mt-0.5 text-[0.90625rem] text-ink-soft">{v.editor || '-'} · {thDateTime(v.at)}</p>
                      </div>
                      <button
                        type="button" aria-expanded={on}
                        onClick={() => setOpen(on ? null : v.version)}
                        className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-tile px-3.5 py-1.5 text-[0.90625rem] font-medium text-ink-soft transition-colors hover:bg-[#EBEAE8] hover:text-ink"
                      >
                        {on ? 'ซ่อน' : 'ดูข้อมูล'}
                        <svg viewBox="0 0 24 24" className={cx('size-4 transition-transform', on && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                    </div>
                    {on && (
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-line bg-[#F7F3F0] px-4 py-3 font-mono text-[0.84375rem] leading-relaxed">{JSON.stringify(v.snapshot || {}, null, 2)}</pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </section>

      {/* Audit Log: ทุกการกระทำกับเอกสารฉบับนี้ ป้ายซ้ายบอกชนิดของเหตุการณ์เป็นภาษาไทย */}
      <section>
        <HistoryHeading count={audit.length}>บันทึกการทำงาน (Audit Log)</HistoryHeading>
        {!audit.length ? empty(term ? 'ไม่พบบันทึกที่ตรงกับคำค้นหา' : 'ยังไม่มีบันทึก')
          : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {audit.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3.5">
                  <span className="w-fit shrink-0 rounded-full bg-tile px-3 py-0.5 text-[0.875rem] font-medium text-ink-soft sm:w-[140px] sm:text-center">{auditLabel(a.action)}</span>
                  <span className="min-w-0 flex-1 text-[1rem] leading-snug">
                    {a.detail || '-'}
                    <span className="mt-0.5 block text-[0.90625rem] text-ink-soft">{a.actor || 'ระบบ'} · {thDateTime(a.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
