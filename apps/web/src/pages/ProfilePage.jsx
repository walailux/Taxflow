/**
 * ProfilePage.jsx โปรไฟล์และการยืนยันตัวตน (ภาคผนวก ข ข้อ 16) ย้ายจาก profile.js ของหน้าเดิม
 * ข้อมูล 6 กลุ่ม · แถบความครบถ้วน · โลโก้/ตราประทับ · เอกสารยืนยันตัวตน (KYC) พร้อมดูตัวอย่าง
 * ยืนยันตัวตนด้วยแอป Authenticator · ความยินยอมและสิทธิตาม PDPA
 * การเปลี่ยนบัญชีธนาคารรับเงินต้องยืนยัน OTP ก่อนเสมอ
 */
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { API_URL } from '../lib/env.js';
import { useMe, ME_KEY } from '../features/auth/useMe.js';
import { readDataUrl } from '../features/docs/docsApi.js';
import OtpDialog from '../features/docs/OtpDialog.jsx';
import OtpInput from '../features/auth/OtpInput.jsx';
import BankField from '../components/BankField.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useSubmit } from '../lib/useSubmit.js';
import { useToast } from '../components/Toast.jsx';
import { Alert, Button, PageHeader, SegGroup, SelectField, Spinner, TextField, cx } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import Avatar from '../components/Avatar.jsx';
import EtaxPermission from '../features/profile/EtaxPermission.jsx';
import { ROLE_TAG } from '../features/app/nav.js';
import { AddressCascade } from '../features/address/AddressFields.jsx';
import {
  EMPTY_PROFILE_FORM, bankChanged, buildProfileBody, checkProfileField, isJuristic, profileErrors, userToForm,
} from '../features/profile/profileRules.js';

const VERIFY_LABEL = {
  unverified: { text: 'ยังไม่ได้ยืนยันตัวตน', short: 'ยังไม่ยืนยัน', pill: 'ต้องดำเนินการ', tone: 'bad', note: 'แนบเอกสารแล้วส่งให้ผู้ดูแลตรวจสอบ' },
  pending: { text: 'รอผู้ดูแลระบบตรวจสอบ', short: 'รอตรวจสอบ', pill: 'กำลังตรวจ', tone: 'warn', note: 'ผู้ดูแลระบบกำลังตรวจเอกสาร' },
  verified: { text: 'ยืนยันตัวตนแล้ว', short: 'ยืนยันแล้ว', pill: 'ผ่านการตรวจ', tone: 'ok', note: 'คู่ค้าเห็นว่าบัญชีนี้ผ่านการยืนยัน' },
  rejected: { text: 'การยืนยันตัวตนไม่ผ่าน', short: 'ไม่ผ่าน', pill: 'แก้ไขแล้วส่งใหม่', tone: 'bad', note: 'ดูหมายเหตุแล้วแนบเอกสารใหม่' },
};
const PILL_TONE = {
  ok: 'bg-[#DCFCE7] text-[#15803D]', bad: 'bg-[#FEE2E2] text-[#B91C1C]', warn: 'bg-[#FEF3C7] text-[#92400E]', muted: 'bg-tile text-ink-soft',
};

/** การ์ดสถิติ: ไอคอนในกรอบมน ป้ายสถานะมุมขวา ตัวเลข/ค่าใหญ่ และลายจุด · accent = การ์ดเด่นพื้นส้ม */
function StatTile({ icon, label, value, pill, note, foot, accent, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx('tf-fade-up relative flex min-w-0 flex-col overflow-hidden rounded-[18px] p-3.5 text-left transition-all [container-type:inline-size] sm:rounded-[22px] sm:p-4',
        accent ? 'bg-gradient-to-br from-orange to-[#D9480F] text-white shadow-[0_18px_40px_-22px_rgba(232,90,0,0.85)]' : 'bg-white shadow-[0_1px_2px_rgba(24,24,27,0.03)]',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(24,24,27,0.45)]')}
    >
      <span className={accent ? 'tf-dots-light' : 'tf-dots'} aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-1.5">
        <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-xl', accent ? 'bg-white text-orange-deep' : 'bg-tile text-ink')}>
          <Icon name={icon} className="size-[1.125rem]" />
        </span>
        {pill && <span className={cx('min-w-0 truncate rounded-full px-2 py-0.5 text-[0.71875rem] font-semibold', accent ? 'bg-white/20 text-white' : PILL_TONE[pill.tone])}>{pill.text}</span>}
      </div>
      <p className={cx('relative mt-3 truncate text-[0.8125rem]', accent ? 'text-white/85' : 'text-ink-soft')}>{label}</p>
      <b className="relative whitespace-nowrap font-display text-[clamp(1.0625rem,11cqw,1.5rem)] font-semibold leading-tight tracking-tight">{value}</b>
      {note && <small className={cx('relative mt-0.5 hidden text-[0.78125rem] leading-snug sm:line-clamp-2', accent ? 'text-white/75' : 'text-ink-soft')}>{note}</small>}
      {foot && <div className="relative mt-auto pt-3">{foot}</div>}
    </Tag>
  );
}
const KYC_MAX = 5 * 1024 * 1024;
const BRAND_MAX = 1024 * 1024;

/* ---------- หัวข้อของหน้า (แท็บ) ---------- */
const TABS = [
  { key: 'tax', label: 'ข้อมูลผู้เสียภาษี', icon: 'receipt' },
  { key: 'address', label: 'ที่อยู่และการติดต่อ', icon: 'inbox' },
  { key: 'bank', label: 'บัญชีรับเงิน', icon: 'wallet' },
  { key: 'brand', label: 'รูปและโลโก้', icon: 'grid' },
  { key: 'kyc', label: 'ยืนยันตัวตน', icon: 'file' },
  { key: 'etax', label: 'สิทธิ์ออก e-Tax', icon: 'shield' },
  { key: 'security', label: 'ความปลอดภัย', icon: 'shield' },
  { key: 'privacy', label: 'ความเป็นส่วนตัว', icon: 'info' },
];
// แท็บที่มีช่องกรอกในฟอร์มโปรไฟล์ (บันทึกพร้อมกันด้วยแถบบันทึกด้านล่าง)
const FORM_TABS = ['tax', 'address', 'bank'];
const tabOfField = (k) => (/^(addr|phone|contactName|socials)/.test(k) ? 'address' : /^bank/.test(k) ? 'bank' : 'tax');

/** กลุ่มย่อยภายในการ์ด มีหัวข้อเล็กและเส้นคั่น */
function FieldGroup({ title, children }) {
  return (
    <div className="mt-5 border-t border-line pt-5">
      <h3 className="mb-3 text-[0.9375rem] font-semibold text-[#57534E]">{title}</h3>
      {children}
    </div>
  );
}

function Panel({ title, sub, children, id }) {
  return (
    <section id={id} className="tf-fade-up rounded-[24px] bg-white p-5 lg:flex-1 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6" style={{ scrollMarginTop: '96px' }}>
      <h2 className="text-[1.125rem] font-medium">{title}</h2>
      {sub && <p className="mb-4 mt-1 text-[0.96875rem] leading-relaxed text-ink-soft">{sub}</p>}
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const me = useMe();
  const user = me.data && me.data.user;
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [otp, setOtp] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [preview, setPreview] = useState(null);   // เอกสาร KYC ที่กำลังดูตัวอย่าง
  const kycInput = useRef(null);
  const kycTarget = useRef(null);
  const meta = useQuery({ queryKey: ['meta', 'profile-options'], queryFn: () => api.get('/api/meta/profile-options'), staleTime: Infinity });
  const kyc = useQuery({ queryKey: ['kyc'], queryFn: () => api.get('/api/kyc') });
  const [params, setParams] = useSearchParams();
  // ?focus=kyc (ลิงก์เดิมจากหน้าอื่น) เปิดแท็บยืนยันตัวตน · ?tab= จำแท็บที่เปิดอยู่ไว้ในลิงก์
  const tab = params.get('tab') || (params.get('focus') === 'kyc' ? 'kyc' : 'tax');
  const goTab = (key) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', key); n.delete('focus'); return n; }, { replace: true });

  useEffect(() => { if (user && !form) setForm(userToForm(user)); }, [user, form]);

  const [busy, save] = useSubmit(async () => {
    const e = profileErrors(form, user);
    setErrs(e);
    const count = Object.keys(e).length;
    if (count) {
      toast(`พบข้อมูลที่ต้องแก้ไข ${count} จุด กรุณาดูข้อความสีแดงใต้ช่อง`, 'err');
      goTab(tabOfField(Object.keys(e)[0]));
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 80);
      return;
    }
    const body = buildProfileBody(form, user);
    const apply = (data) => {
      qc.setQueryData(ME_KEY, (old) => ({ ...old, user: { ...old.user, ...data.user }, profile: data.profile || old.profile }));
      setForm(userToForm(data.user));
      void qc.invalidateQueries({ queryKey: ['kyc'] });
      toast('บันทึกข้อมูลโปรไฟล์แล้ว');
    };
    if (bankChanged(body, user)) {
      setOtp({
        purpose: 'change-bank',
        title: 'ยืนยันการเปลี่ยนบัญชีธนาคารรับเงิน',
        subtitle: 'เพื่อความปลอดภัยของบัญชีรับเงิน ระบบส่งรหัสยืนยัน 6 หลักไปที่',
        action: (otpId, code) => api.put('/api/auth/profile', { ...body, otpId, code }),
        onDone: (data) => { setOtp(null); apply(data); },
      });
      return;
    }
    try { apply(await api.put('/api/auth/profile', body)); }
    catch (err) { toast(err.message, 'err'); }
  });

  if (!user || !form) return <p className="flex items-center gap-2 py-10 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังโหลดโปรไฟล์</p>;

  const jur = isJuristic(user, form.entityType);
  const completeness = (me.data.profile && me.data.profile.completeness) || { percent: 0, missing: [], ok: false };
  const verify = VERIFY_LABEL[user.verifyStatus || 'unverified'];
  const set = (key, value) => setForm((f) => {
    const next = { ...f, [key]: value };
    if (key === 'branchType' && value !== 'branch') next.branchCode = '';
    return next;
  });
  const check = (key) => setErrs((e) => ({ ...e, [key]: checkProfileField(key, form, user) }));
  const text = (key, props) => (
    <TextField id={`pf-${key}`} value={form[key]} error={errs[key]} onChange={(e) => set(key, e.target.value)} onBlur={() => check(key)} {...props} />
  );


  async function uploadBrand(kind, file) {
    if (!file) return;
    if (file.size > BRAND_MAX) { toast('ไฟล์ต้องมีขนาดไม่เกิน 1 MB', 'err'); return; }
    try {
      const dataUrl = await readDataUrl(file);
      const data = await api.post('/api/auth/brand-image', { kind, filename: file.name, mime: file.type, dataBase64: dataUrl.split(',')[1] });
      qc.setQueryData(ME_KEY, (old) => ({ ...old, user: { ...old.user, ...data.user } }));
      toast({ seal: 'อัปโหลดตราประทับแล้ว', avatar: 'อัปโหลดรูปโปรไฟล์แล้ว' }[kind] || 'อัปโหลดโลโก้แล้ว เอกสารที่พิมพ์หลังจากนี้จะมีโลโก้ของคุณ');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function removeBrand(kind) {
    try {
      const data = await api.del(`/api/auth/brand-image/${kind}`);
      qc.setQueryData(ME_KEY, (old) => ({ ...old, user: { ...old.user, ...data.user } }));
      toast('ลบรูปภาพแล้ว');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function uploadKyc(file) {
    if (!file || !kycTarget.current) return;
    if (file.size > KYC_MAX) { toast('ไฟล์ต้องมีขนาดไม่เกิน 5 MB', 'err'); return; }
    try {
      const dataUrl = await readDataUrl(file);
      const data = await api.post('/api/kyc', { docType: kycTarget.current, filename: file.name, mime: file.type, dataBase64: dataUrl.split(',')[1] });
      toast('อัปโหลดเอกสารแล้ว (จัดเก็บแบบเข้ารหัส)');
      await qc.invalidateQueries({ queryKey: ['kyc'] });
      if (data && data.id) setPreview({ id: data.id, justUploaded: true });
    } catch (err) { toast(err.message, 'err'); } finally {
      kycTarget.current = null;
      if (kycInput.current) kycInput.current.value = '';
    }
  }

  function removeKyc(item, reselectType) {
    setConfirm({
      title: 'ลบเอกสารยืนยันตัวตน?', confirmText: reselectType ? 'ลบแล้วเลือกไฟล์ใหม่' : 'ลบเอกสาร', danger: true,
      message: 'ไฟล์นี้จะถูกลบออกจากที่เก็บทันที ถ้าต้องการใช้ต้องอัปโหลดใหม่',
      onConfirm: async () => {
        setConfirm(null);
        setPreview(null);
        try {
          await api.del(`/api/kyc/${Number(item.id)}`);
          toast('ลบเอกสารแล้ว');
          await qc.invalidateQueries({ queryKey: ['kyc'] });
          if (reselectType) { kycTarget.current = reselectType; kycInput.current?.click(); }
        } catch (err) { toast(err.message, 'err'); }
      },
    });
  }

  async function submitKyc() {
    try {
      const data = await api.post('/api/kyc/submit');
      qc.setQueryData(ME_KEY, (old) => ({ ...old, user: { ...old.user, ...data.user } }));
      void qc.invalidateQueries({ queryKey: ['kyc'] });
      toast('ส่งเอกสารให้ผู้ดูแลระบบตรวจสอบแล้ว');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function saveConsent(given) {
    try {
      const data = await api.put('/api/pdpa/consent', { consent: given });
      qc.setQueryData(ME_KEY, (old) => ({ ...old, user: { ...old.user, ...data.user } }));
      void qc.invalidateQueries({ queryKey: ['kyc'] });
      toast('บันทึกความยินยอมแล้ว');
    } catch (err) { toast(err.message, 'err'); }
  }

  const kycInfo = kyc.data || {};
  const required = kycInfo.required || [];
  const previewItem = preview && (kycInfo.items || []).find((k) => Number(k.id) === Number(preview.id));
  const dirty = JSON.stringify(form) !== JSON.stringify(userToForm(user));
  const errTabs = new Set(Object.keys(errs).filter((k) => errs[k]).map(tabOfField));
  const kycMissing = required.filter((r) => r.required && !r.uploaded).length;
  const tabs = TABS.map((t) => ({
    ...t,
    label: t.key === 'tax' && user.role !== 'creator' ? 'ข้อมูลบริษัท' : t.label,
    alert: errTabs.has(t.key) || (t.key === 'kyc' && kycInfo.kycConsent && kycMissing > 0),
  }));
  const current = tabs.find((t) => t.key === tab) || tabs[0];
  const isFormTab = FORM_TABS.includes(current.key);
  const displayName = user.companyName || user.displayName || '-';

  return (
    <div className={cx('flex flex-col gap-5', dirty && 'pb-24')}>
      <PageHeader title={user.role === 'creator' ? 'โปรไฟล์' : 'ข้อมูลบริษัท'} subtitle="ข้อมูลชุดนี้จะถูกพิมพ์ลงบนเอกสารที่คุณออก และใช้ยืนยันตัวตนกับคู่ค้า" />

      {/* ---------- การ์ดตัวตน: รูป ชื่อ อีเมล บทบาท ---------- */}
      <section className="tf-fade-up relative overflow-hidden rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6">
        <span className="tf-dots" aria-hidden="true" />
        <div className="relative flex flex-col items-center gap-5 sm:flex-row">
          <label className="group relative shrink-0 cursor-pointer" title="เปลี่ยนรูปโปรไฟล์">
            <Avatar user={user} className="size-24 rounded-full shadow-[0_14px_30px_-18px_rgba(24,24,27,0.6)]" textClass="text-[2.375rem]" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-[0.8125rem] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">เปลี่ยนรูป</span>
            <span className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full bg-orange text-white shadow-[var(--shadow-brand)] ring-4 ring-white">
              <Icon name="plus" className="size-4" />
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="อัปโหลดรูปโปรไฟล์" onChange={(e) => { void uploadBrand('avatar', e.target.files[0]); e.target.value = ''; }} />
          </label>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-[0.8125rem] font-medium uppercase tracking-[0.12em] text-[#A8A29E]">{ROLE_TAG[user.role]}</p>
            <h2 className="mt-0.5 truncate text-[1.625rem] font-semibold leading-tight">{displayName}</h2>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[0.875rem] sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-tile px-3 py-1 text-ink-soft"><Icon name="inbox" className="size-4" />{user.email}</span>
              {user.taxId && <span className="inline-flex items-center gap-1.5 rounded-full bg-tile px-3 py-1 font-mono text-[0.84375rem] text-ink-soft"><Icon name="receipt" className="size-4" />{user.taxId}</span>}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- การ์ดสถิติ 4 ใบ (ใบแรกเป็นการ์ดเด่นพื้นสี) · มือถือ 2×2 แบบกะทัดรัด จอตั้งแต่ 768px เรียง 4 ช่อง ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          accent
          icon="check"
          label="ความครบถ้วนของโปรไฟล์"
          value={`${completeness.percent}%`}
          pill={completeness.ok ? { text: 'พร้อมออกเอกสาร', tone: 'ok' } : { text: `ขาด ${completeness.missing.length} รายการ`, tone: 'bad' }}
          foot={(
            <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${completeness.percent}%`, animation: 'tf-grow-x .9s var(--ease-slide) .1s both' }} />
            </div>
          )}
        />
        <StatTile
          icon="shield"
          label="สถานะยืนยันตัวตน"
          value={verify.short}
          pill={{ text: verify.pill, tone: verify.tone }}
          note={user.verifyNote ? `หมายเหตุ: ${user.verifyNote}` : verify.note}
          onClick={() => goTab('kyc')}
        />
        <StatTile
          icon="file"
          label="เอกสารยืนยันตัวตน"
          value={kycInfo.kycConsent ? `${required.filter((r) => r.required && r.uploaded).length} / ${required.filter((r) => r.required).length}` : '-'}
          pill={!kycInfo.kycConsent ? { text: 'ยังไม่ให้ความยินยอม', tone: 'muted' } : kycMissing ? { text: `ขาด ${kycMissing} ฉบับ`, tone: 'bad' } : { text: 'ครบแล้ว', tone: 'ok' }}
          note="ฉบับที่จำเป็นที่แนบแล้ว"
          onClick={() => goTab('kyc')}
        />
        <StatTile
          icon="receipt"
          label="ภาษีมูลค่าเพิ่ม (VAT)"
          value={user.vatRegistered ? 'จดทะเบียนแล้ว' : 'ยังไม่จด'}
          pill={user.vatRegistered ? { text: 'ออกใบกำกับภาษีได้', tone: 'ok' } : { text: 'ออกใบกำกับไม่ได้', tone: 'muted' }}
          note={user.vatRegistered ? 'ออกใบกำกับภาษีเต็มรูปได้' : 'ออกใบเสร็จและใบแจ้งหนี้ได้ตามปกติ'}
          onClick={() => goTab('tax')}
        />
      </div>
      {!completeness.ok && (
        <p className="-mt-1 px-1 text-[0.875rem] text-ink-soft">ข้อมูลที่ยังขาด: <span className="text-ink">{completeness.missing.join(', ')}</span> ต้องกรอกให้ครบก่อนจึงจะออกเอกสารได้</p>
      )}

      {/* จอใหญ่: คอลัมน์เนื้อหายืดเท่าความสูงเมนูซ้ายเป็นอย่างน้อย ขอบล่างของสองกล่องจึงตรงกัน (เมนูยังเกาะด้านบนตอนเลื่อน) */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-stretch">
        {/* ---------- เมนูหัวข้อ: แนวตั้งบนจอใหญ่ แถบเลื่อนแนวนอนบนมือถือ ---------- */}
        <nav aria-label="หัวข้อโปรไฟล์" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:sticky lg:top-24 lg:mx-0 lg:self-start lg:flex-col lg:overflow-visible lg:rounded-[24px] lg:bg-white lg:p-2.5 lg:shadow-[0_1px_2px_rgba(24,24,27,0.03)]">
          {tabs.map((t) => {
            const on = t.key === current.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => goTab(t.key)}
                aria-current={on ? 'page' : undefined}
                className={cx('relative flex h-11 shrink-0 items-center gap-2.5 rounded-xl px-3.5 text-[0.9375rem] font-medium transition-colors lg:w-full',
                  on ? 'bg-ink text-white shadow-[0_8px_20px_-12px_rgba(24,24,27,0.6)]' : 'bg-white text-[#44403C] hover:bg-orange-pale hover:text-orange-deep lg:bg-transparent')}
              >
                <Icon name={t.icon} className="size-[1.125rem] shrink-0" />
                <span className="whitespace-nowrap">{t.label}</span>
                {t.alert && <span className="ml-auto size-2 shrink-0 rounded-full bg-danger" aria-label="มีข้อมูลที่ต้องแก้ไข" />}
              </button>
            );
          })}
        </nav>

        <div key={current.key} className="tf-fade-up min-w-0 lg:flex lg:flex-col">
          {current.key === 'tax' && (
            <Panel title={current.label} sub="ข้อมูลที่กฎหมายบังคับให้แสดงบนเอกสารภาษี">
              {user.role === 'agency' && (
                <SegGroup
                  name="pf-entity"
                  legend="ประเภทผู้เสียภาษี"
                  value={jur ? 'juristic' : 'individual'}
                  onChange={(v) => set('entityType', v)}
                  options={[{ value: 'juristic', label: 'นิติบุคคล' }, { value: 'individual', label: 'บุคคลธรรมดา' }]}
                />
              )}
              <div className="grid gap-x-4 md:grid-cols-2">
                {text('name', { label: jur ? 'ชื่อนิติบุคคล (ตามหนังสือรับรอง) *' : 'ชื่อ-นามสกุล *', maxLength: 150 })}
                {text('taxId', { label: 'เลขประจำตัวผู้เสียภาษี 13 หลัก *', inputMode: 'numeric', maxLength: 17 })}
                {text('tradeName', { label: 'ชื่อทางการค้า / ชื่อแบรนด์', maxLength: 150 })}
                {user.role === 'creator' && text('channelName', { label: 'ชื่อช่อง / ชื่อที่ใช้ในการทำงาน', maxLength: 150 })}
              </div>
              {jur && (
                <FieldGroup title="ข้อมูลนิติบุคคล">
                  <div className="grid gap-x-4 md:grid-cols-2">
                    <SelectField id="pf-companytype" label="ประเภทนิติบุคคล" value={form.companyType} options={(meta.data && meta.data.companyTypes) || []} onChange={(e) => set('companyType', e.target.value)} />
                    <SelectField
                      id="pf-branchtype" label="สำนักงานใหญ่ / สาขา" value={form.branchType}
                      options={[{ value: 'head', label: 'สำนักงานใหญ่' }, { value: 'branch', label: 'สาขา' }]}
                      onChange={(e) => set('branchType', e.target.value)}
                    />
                    {form.branchType === 'branch' && text('branchCode', { label: 'เลขที่สาขา (5 หลัก) *', inputMode: 'numeric', maxLength: 5 })}
                    {text('authName', { label: 'กรรมการผู้มีอำนาจลงนาม *', maxLength: 150 })}
                    {text('authPosition', { label: 'ตำแหน่งผู้มีอำนาจลงนาม', maxLength: 100 })}
                  </div>
                </FieldGroup>
              )}
              <FieldGroup title="ภาษีมูลค่าเพิ่ม (VAT)">
                <SegGroup
                  name="pf-vat"
                  legend="สถานะ"
                  hint={form.vat === 'yes'
                    ? 'เปิดสิทธิ์ออกใบกำกับภาษีเต็มรูป ต้องแนบใบทะเบียนภาษีมูลค่าเพิ่ม (ภ.พ.20) ในหัวข้อยืนยันตัวตนด้วย'
                    : 'ผู้ที่ยังไม่ได้จดทะเบียน VAT ออกใบกำกับภาษีไม่ได้ตามมาตรา 86 แต่ยังออกใบเสร็จรับเงินและใบแจ้งหนี้ได้ตามปกติ'}
                  value={form.vat}
                  onChange={(v) => set('vat', v)}
                  options={[{ value: 'no', label: 'ยังไม่ได้จดทะเบียน' }, { value: 'yes', label: 'จดทะเบียน VAT แล้ว' }]}
                />
                {form.vat === 'yes' && <div className="md:max-w-[50%]">{text('vatRegDate', { label: 'วันที่จดทะเบียนภาษีมูลค่าเพิ่ม *', type: 'date' })}</div>}
              </FieldGroup>
            </Panel>
          )}

          {current.key === 'address' && (
            <Panel title="ที่อยู่และการติดต่อ" sub="ที่อยู่ตามที่จดทะเบียน ใช้แสดงบนเอกสารภาษี">
              <div className="grid gap-x-4 md:grid-cols-2">
                {text('addrNo', { label: 'บ้านเลขที่ / อาคาร *', maxLength: 60 })}
                {text('addrStreet', { label: 'ถนน', maxLength: 80 })}
              </div>
              <AddressCascade idPrefix="pf-addr" required value={{ prov: form.addrProv, dist: form.addrDist, sub: form.addrSub, zip: form.addrPost }}
                errors={{ prov: errs.addrProv, dist: errs.addrDist, sub: errs.addrSub, zip: errs.addrPost }}
                onChange={(p) => { const K = { prov: 'addrProv', dist: 'addrDist', sub: 'addrSub', zip: 'addrPost' }; Object.entries(p).forEach(([k, v]) => set(K[k], v)); }} onBlur={(k) => check({ prov: 'addrProv', dist: 'addrDist', sub: 'addrSub', zip: 'addrPost' }[k])} />
              <FieldGroup title="การติดต่อ">
                <div className="grid gap-x-4 md:grid-cols-2">
                  {text('phone', { label: 'เบอร์ติดต่อ', type: 'tel', maxLength: 20 })}
                  {text('contactName', { label: 'ชื่อผู้ติดต่อ', maxLength: 150 })}
                </div>
                {user.role === 'creator' && text('socials', { label: 'ช่องทาง Social Media', placeholder: 'เช่น TikTok @name (120K) · IG @name', maxLength: 500 })}
              </FieldGroup>
            </Panel>
          )}

          {current.key === 'bank' && (
            <Panel title="บัญชีธนาคารสำหรับรับเงิน" sub="พิมพ์บนใบแจ้งหนี้ให้ผู้ว่าจ้างโอนเงิน การเปลี่ยนบัญชีต้องยืนยันด้วยรหัส OTP ทุกครั้ง">
              <div className="grid gap-x-4 md:grid-cols-2">
                <BankField id="pf-bank-name" value={form.bankName} onChange={(v) => set('bankName', v)} />
                {text('bankNo', { label: 'เลขที่บัญชี', inputMode: 'numeric', maxLength: 20 })}
              </div>
              {text('bankAcc', { label: 'ชื่อบัญชี', maxLength: 150 })}
              <p className="mt-1 flex items-start gap-2 rounded-xl bg-tile px-3.5 py-3 text-[0.875rem] text-ink-soft">
                <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-orange-deep" />
                เมื่อกดบันทึกหลังเปลี่ยนบัญชี ระบบจะส่งรหัส OTP ไปที่ {user.email} เพื่อยืนยันว่าเป็นคุณจริง
              </p>
            </Panel>
          )}

          {current.key === 'brand' && (
            <Panel title="รูปโปรไฟล์ โลโก้ และตราประทับ" sub="ไฟล์ PNG, JPG หรือ WEBP ไฟล์ละไม่เกิน 1 MB">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ['avatar', 'รูปโปรไฟล์', user.avatarFile, 'แสดงในเมนูของแอป ไม่พิมพ์บนเอกสาร'],
                  ['logo', 'โลโก้', user.logoFile, 'พิมพ์ที่หัวเอกสารที่คุณออก'],
                  ['seal', 'ตราประทับ', user.sealFile, 'พิมพ์ข้างลายมือชื่อบนเอกสาร'],
                ].map(([kind, label, file, hint]) => (
                  <div key={kind} className="flex flex-col rounded-2xl border border-line p-3.5">
                    <div className={cx('mb-3 flex h-32 items-center justify-center overflow-hidden bg-[#F7F3F0]', kind === 'avatar' ? 'mx-auto aspect-square rounded-full' : 'rounded-xl')}>
                      {file ? <img src={`${API_URL}/api/auth/brand-image/${kind}?t=${file.at || ''}`} alt={label} className={kind === 'avatar' ? 'size-full object-cover' : 'max-h-full w-auto p-2'} />
                        : <Icon name="plus" className="size-7 text-[#C9C3BD]" />}
                    </div>
                    <b className="text-[0.96875rem] font-medium">{label}</b>
                    <small className="mb-3 text-[0.84375rem] leading-snug text-ink-soft">{hint}</small>
                    <div className="mt-auto flex gap-2">
                      <label className="tf-btn tf-btn-soft flex-1 cursor-pointer !px-3 !py-2 text-[0.875rem]">
                        {file ? 'เปลี่ยน' : 'อัปโหลด'}
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void uploadBrand(kind, e.target.files[0]); e.target.value = ''; }} />
                      </label>
                      {file && <button type="button" className="tf-btn tf-btn-ghost !px-3 !py-2 text-[0.875rem] text-danger" onClick={() => removeBrand(kind)}>ลบ</button>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {current.key === 'kyc' && (
            <Panel id="pf-kyc-panel" title="ยืนยันตัวตน" sub="ไฟล์ทุกไฟล์ถูกเข้ารหัสก่อนจัดเก็บ และเปิดดูได้เฉพาะคุณกับผู้ตรวจสอบเท่านั้น">
              {/* ช่องเลือกไฟล์ที่ซ่อนไว้ ปุ่ม "อัปโหลด" ของแต่ละรายการเป็นตัวสั่งเปิด จึงต้องมีชื่อกำกับให้โปรแกรมอ่านหน้าจอ */}
              <input ref={kycInput} type="file" aria-label="เลือกไฟล์เอกสารยืนยันตัวตน" accept=".pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => uploadKyc(e.target.files[0])} />
              {kyc.isLoading && <p className="flex items-center gap-2 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังโหลด</p>}
              {kyc.data && !kycInfo.kycConsent && (
                <Alert kind="dev">
                  คุณยังไม่ได้ให้ความยินยอมการจัดเก็บเอกสารยืนยันตัวตน จึงยังอัปโหลดไม่ได้{' '}
                  <button type="button" className="font-medium underline" onClick={() => goTab('privacy')}>ไปที่หัวข้อความเป็นส่วนตัว</button>
                </Alert>
              )}
              {kycInfo.kycConsent && (
                <>
                  <div className="flex flex-col gap-2.5">
                    {!required.length && <p className="text-[0.90625rem] text-ink-soft">บทบาทนี้ไม่ต้องใช้เอกสารยืนยันตัวตนเพิ่มเติม</p>}
                    {required.map((r) => {
                      const up = r.uploaded;
                      return (
                        <div key={r.type} className={cx('flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', up ? 'border-[#BFE6CD] bg-ok-soft/50' : 'border-line')}>
                          <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', up ? 'bg-ok text-white' : 'bg-tile text-ink-soft')}>
                            <Icon name={up ? 'check' : 'file'} className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <b className="flex flex-wrap items-center gap-2 text-[0.96875rem] font-medium">
                              {r.label}
                              <span className={cx('whitespace-nowrap rounded-full px-2 py-px text-[0.78125rem]', r.required ? 'bg-orange-soft text-orange-deep' : 'bg-[#F1EBE5] text-ink-soft')}>
                                {r.required ? 'จำเป็น' : 'ถ้ามี'}
                              </span>
                            </b>
                            <small className="block text-[0.84375rem] leading-relaxed text-ink-soft">{r.hint}</small>
                            {up && <small className="mt-0.5 block text-[0.84375rem] font-medium text-ok">แนบแล้ว: {up.filename || 'ไฟล์'} · {Math.round((up.size || 0) / 1024)} KB</small>}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            {up ? (
                              <>
                                <button type="button" className="tf-btn tf-btn-soft !px-3.5 !py-2 text-[0.875rem]" onClick={() => setPreview({ id: up.id })}>เปิดดู</button>
                                <button type="button" className="tf-btn tf-btn-ghost !px-3.5 !py-2 text-[0.875rem] text-danger" onClick={() => removeKyc(up)}>ลบ</button>
                              </>
                            ) : (
                              <button type="button" className="tf-btn tf-btn-dark !px-4 !py-2 text-[0.875rem]" onClick={() => { kycTarget.current = r.type; kycInput.current.click(); }}>อัปโหลด</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {required.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-tile px-4 py-3">
                      <span className="text-[0.90625rem] text-ink-soft">{kycMissing ? `ยังขาดเอกสารที่จำเป็น ${kycMissing} รายการ` : 'แนบเอกสารที่จำเป็นครบแล้ว'}</span>
                      <Button className="!px-4 !py-2 text-[0.90625rem]" onClick={submitKyc} disabled={kycMissing > 0}>ส่งให้ผู้ดูแลระบบตรวจสอบ</Button>
                    </div>
                  )}
                </>
              )}
            </Panel>
          )}

          {current.key === 'etax' && (
            <Panel id="pf-etax-panel" title="สิทธิ์ออกใบกำกับภาษีอิเล็กทรอนิกส์ / ใบรับอิเล็กทรอนิกส์"
              sub="สองประเภทนี้ออกได้เฉพาะผู้จด VAT ที่ได้รับอนุมัติจากกรมสรรพากรแล้ว และผู้ดูแลระบบตรวจหลักฐานผ่าน เอกสารประเภทอื่นแค่ยืนยันตัวตนก็ออกได้">
              <EtaxPermission user={user} />
            </Panel>
          )}

          {current.key === 'security' && (
            <Panel title="ยืนยันตัวตนด้วยแอป Authenticator (TOTP)" sub="ทางเลือกแทน OTP ทางอีเมลตอนเข้าสู่ระบบ เร็วกว่า ใช้ได้แม้อีเมลดีเลย์">
              <TotpBox user={user} />
            </Panel>
          )}

          {current.key === 'privacy' && (
            <Panel title="ความเป็นส่วนตัวและสิทธิของคุณ" sub="เลือกยินยอมเป็นรายข้อได้ ข้อที่จำเป็นต่อการให้บริการถอนไม่ได้">
              <ConsentBox user={user} meta={meta.data} onSave={saveConsent} />
              <DeleteAccount user={user} />
            </Panel>
          )}

          {isFormTab && !dirty && (
            <p className="mt-3 px-1 text-[0.875rem] text-ink-soft">แก้ไขข้อมูลแล้วกดบันทึกที่แถบด้านล่าง</p>
          )}
        </div>
      </div>

      {/* ---------- แถบบันทึก: ขึ้นเมื่อมีการแก้ไขที่ยังไม่บันทึก (portal ที่ body เพราะกล่องหน้ามี transform จากอนิเมชัน) ---------- */}
      {dirty && createPortal(
        <div className="tf-pop fixed inset-x-3 bottom-[84px] z-40 mx-auto flex max-w-[760px] items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-[0_24px_50px_-20px_rgba(24,24,27,0.7)] lg:bottom-5 lg:left-[300px]">
          <span className="size-2 shrink-0 rounded-full bg-orange" />
          <span className="min-w-0 flex-1 text-[0.9375rem]">มีการแก้ไขที่ยังไม่บันทึก</span>
          <button type="button" className="rounded-xl px-3.5 py-2 text-[0.90625rem] text-white/80 transition-colors hover:bg-white/10 hover:text-white" onClick={() => { setForm(userToForm(user)); setErrs({}); }}>ยกเลิก</button>
          <Button className="!px-5 !py-2 text-[0.90625rem]" onClick={save} loading={busy}>บันทึก</Button>
        </div>,
        document.body,
      )}

      {previewItem && (
        <KycPreview
          item={previewItem}
          label={(required.find((r) => r.type === previewItem.docType) || {}).label}
          justUploaded={preview.justUploaded}
          onClose={() => setPreview(null)}
          onDelete={() => removeKyc(previewItem, previewItem.docType)}
        />
      )}
      {otp && (
        <OtpDialog
          purpose={otp.purpose}
          refId={null}
          title={otp.title}
          subtitle={otp.subtitle}
          action={otp.action}
          onDone={otp.onDone}
          onCancel={() => setOtp(null)}
        />
      )}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

/* ---------- ตัวอย่างเอกสารยืนยันตัวตน ---------- */
function KycPreview({ item, label, justUploaded, onClose, onDelete }) {
  const url = `${API_URL}/api/kyc/${Number(item.id)}/file`;
  const isPdf = item.mime === 'application/pdf';
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  // วาดที่ document.body: ถ้าอยู่ใต้ element ที่มี backdrop-filter/transform กล่อง fixed จะถูกจำกัดอยู่ในกรอบนั้น
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[220] flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="kyc-pv" className="tf-reveal flex max-h-[92vh] w-full max-w-[720px] flex-col rounded-[var(--radius-card)] bg-white p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="kyc-pv" className="text-[1.125rem]">{label || 'เอกสารยืนยันตัวตน'}</h2>
            <p className="text-[0.875rem] text-ink-soft">{item.filename} · {Math.round((item.size || 0) / 1024)} KB</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="-mt-1 cursor-pointer px-2 text-[1.375rem] leading-none text-ink-soft hover:text-ink">×</button>
        </div>
        {justUploaded && <Alert kind="info">อัปโหลดแล้ว ตรวจดูว่าเป็นเอกสารที่ถูกต้อง อ่านชัด และไม่ถูกตัดขอบ ถ้าผิดฉบับ กด "ลบแล้วเลือกใหม่"</Alert>}
        <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-line bg-[#F7F3F0]">
          {isPdf ? <iframe src={`${url}#view=FitH`} title="ตัวอย่างเอกสาร" className="h-[60vh] w-full border-0 bg-white" />
            : <img src={url} alt={`ตัวอย่าง ${label || 'เอกสาร'}`} className="max-h-[60vh] w-auto object-contain" />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a className="tf-btn tf-btn-ghost px-3.5 py-2 text-[0.875rem]" href={url} target="_blank" rel="noopener">เปิดในแท็บใหม่</a>
          <span className="flex-1" />
          <button type="button" className="tf-btn tf-btn-ghost border-danger px-3.5 py-2 text-[0.875rem] text-danger" onClick={onDelete}>ลบแล้วเลือกใหม่</button>
          <Button className="px-4 py-2 text-[0.875rem]" onClick={onClose}>{justUploaded ? 'ถูกต้อง' : 'ปิด'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- ความยินยอม PDPA ---------- */
function ConsentBox({ user, meta, onSave }) {
  const given = (user.consent && user.consent.purposes) || [];
  const [picked, setPicked] = useState(given);
  useEffect(() => { setPicked((user.consent && user.consent.purposes) || []); }, [user.consent]);
  if (!meta) return <p className="flex items-center gap-2 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังโหลด</p>;
  return (
    <>
      <div className="mb-3 flex flex-col gap-2">
        {meta.consentPurposes.map((p) => (
          <label key={p.key} className="tf-choice">
            <input
              type="checkbox"
              value={p.key}
              disabled={p.required}
              checked={p.required || picked.includes(p.key)}
              onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.key] : x.filter((k) => k !== p.key)))}
              aria-labelledby={`pf-consent-${p.key}-t`}
              aria-describedby={`pf-consent-${p.key}-d`}
            />
            <span className="min-w-0 flex-1">
              <b id={`pf-consent-${p.key}-t`} className="block text-[0.90625rem]">
                {p.label}{' '}
                <span className={cx('whitespace-nowrap rounded-full px-2 py-px text-[0.75rem]', p.required ? 'bg-orange-soft text-orange-deep' : 'bg-[#F1EBE5] text-ink-soft')}>
                  {p.required ? 'จำเป็น' : 'เลือกได้'}
                </span>
              </b>
              <small id={`pf-consent-${p.key}-d`} className="block text-[0.84375rem] leading-relaxed text-ink-soft">{p.detail}</small>
            </span>
          </label>
        ))}
      </div>
      <p className="mb-3 text-[0.84375rem] text-ink-soft">เวอร์ชันนโยบายที่คุณยินยอมไว้: {(user.consent && user.consent.version) || '-'}</p>
      <div className="flex flex-wrap gap-2">
        <Button className="px-4 py-2 text-[0.90625rem]" onClick={() => onSave([...new Set([...picked, ...meta.consentPurposes.filter((p) => p.required).map((p) => p.key)])])}>บันทึกความยินยอม</Button>
        <a className="tf-btn tf-btn-ghost px-3.5 py-2 text-[0.875rem]" href={`${API_URL}/api/pdpa/my-data`} download>ขอสำเนาข้อมูลของฉัน (JSON)</a>
      </div>
    </>
  );
}

/* ---------- ยืนยันตัวตนด้วยแอป Authenticator ---------- */
function TotpBox({ user }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [pending, setPending] = useState(null);   // { secret, otpauthUrl, qrSvg }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function start() {
    try { setPending(await api.post('/api/totp/setup')); }
    catch (err) { toast(err.message, 'err'); }
  }
  async function confirmCode() {
    setBusy(true);
    try {
      const data = await api.post('/api/totp/confirm', { code });
      qc.setQueryData(ME_KEY, (old) => ({ ...old, user: { ...old.user, ...(data.user || {}), totpEnabled: true } }));
      setPending(null); setCode('');
      toast('เปิดใช้งานแล้ว ครั้งต่อไปเข้าสู่ระบบด้วยรหัสจากแอป');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try {
      const data = await api.post('/api/totp/disable', { code });
      qc.setQueryData(ME_KEY, (old) => ({ ...old, user: { ...old.user, ...(data.user || {}), totpEnabled: false } }));
      setCode('');
      toast('ปิดใช้งานแล้ว ครั้งต่อไปใช้ OTP ทางอีเมลตามเดิม');
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  if (user.totpEnabled) {
    return (
      <>
        <p className="mb-2 text-[0.90625rem] font-semibold text-ok">เปิดใช้งานอยู่{user.totpEnabledAt ? ` · ตั้งแต่ ${new Date(user.totpEnabledAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}` : ''}</p>
        <p className="mb-2 mt-4 text-[0.9375rem] font-medium">กรอกรหัสจากแอปเพื่อปิดใช้งาน</p>
        <div className="mb-4 max-w-[380px] [&_.tf-otp]:justify-start"><OtpInput value={code} onChange={setCode} /></div>
        <button type="button" disabled={busy} className="tf-btn tf-btn-ghost border-danger px-4 py-2 text-[0.90625rem] text-danger" onClick={disable}>ปิดใช้งาน TOTP</button>
      </>
    );
  }
  if (!pending) return <Button className="px-4 py-2 text-[0.90625rem]" onClick={start}>เปิดใช้งาน</Button>;
  return (
    <>
      <p className="mb-2 text-[0.90625rem]">สแกน QR ด้วยแอป Authenticator แล้วกรอกรหัส 6 หลักเพื่อยืนยัน</p>
      {pending.qrSvg && <div className="mb-2 w-40" dangerouslySetInnerHTML={{ __html: pending.qrSvg }} />}
      <p className="mb-3 break-all text-[0.84375rem] text-ink-soft">หรือกรอกรหัสลับเอง: <b className="font-mono">{pending.secret}</b></p>
      <p className="mb-2 mt-4 text-[0.9375rem] font-medium">รหัสจากแอป</p>
      <div className="mb-4 max-w-[380px] [&_.tf-otp]:justify-start"><OtpInput value={code} onChange={setCode} /></div>
      <div className="flex gap-2">
        <Button className="px-4 py-2 text-[0.90625rem]" loading={busy} onClick={confirmCode}>ยืนยันและเปิดใช้งาน</Button>
        <Button variant="ghost" className="px-4 py-2 text-[0.90625rem]" onClick={() => { setPending(null); setCode(''); }}>ยกเลิก</Button>
      </div>
    </>
  );
}

/* ---------- ลบบัญชี (สิทธิขอลบตาม PDPA มาตรา 33) ----------
 * บัญชีที่มีรหัสผ่าน: ยืนยันด้วยรหัสผ่าน · บัญชีที่สมัครด้วย Google: ยืนยันด้วย OTP ทางอีเมล */
function DeleteAccount({ user }) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [otp, setOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const PHRASE = 'ลบบัญชีของฉัน';

  function done() {
    toast('ลบข้อมูลส่วนบุคคลของคุณเรียบร้อยแล้ว');
    qc.clear();
    void navigate('/login', { replace: true });
  }

  async function submit() {
    if (phrase.trim() !== PHRASE) { toast(`กรุณาพิมพ์ "${PHRASE}" ให้ถูกต้อง`, 'err'); return; }
    if (user.hasPassword === false) { setOtp(true); return; }
    setBusy(true);
    try { await api.post('/api/pdpa/delete-account', { password, confirm: phrase.trim() }); done(); }
    catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="cursor-pointer text-[0.96875rem] font-medium text-danger hover:underline">ลบบัญชีและข้อมูลส่วนบุคคล</button>
      ) : (
        <div className="tf-reveal rounded-[20px] bg-danger-soft p-4">
          <b className="mb-1 block text-[1.03125rem] font-medium text-danger">ลบบัญชีและข้อมูลส่วนบุคคล</b>
          <p className="mb-3 text-[0.9375rem] leading-relaxed">ระบบลบข้อมูลระบุตัวตน ไฟล์ และสมุดคู่ค้าทั้งหมด แต่คงเอกสารภาษีไว้แบบไม่ระบุตัวบุคคลตามที่กฎหมายภาษีบังคับ การลบย้อนกลับไม่ได้</p>
          {user.hasPassword !== false && (
            <TextField id="del-pass" label="รหัสผ่าน" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          <TextField id="del-phrase" label={`พิมพ์ "${PHRASE}" เพื่อยืนยัน`} placeholder={PHRASE} value={phrase} onChange={(e) => setPhrase(e.target.value)} />
          <div className="flex gap-2">
            <Button className="!bg-danger !shadow-none hover:!bg-[#B91C1C]" loading={busy} onClick={submit}>{user.hasPassword === false ? 'ยืนยันด้วยรหัส OTP' : 'ลบบัญชี'}</Button>
            <Button variant="soft" className="!bg-white" onClick={() => { setOpen(false); setPassword(''); setPhrase(''); }}>ยกเลิก</Button>
          </div>
        </div>
      )}
      {otp && (
        <OtpDialog
          purpose="delete-account"
          refId={null}
          title="ยืนยันการลบบัญชี"
          action={(otpId, code) => api.post('/api/pdpa/delete-account', { otpId, code, confirm: phrase.trim() })}
          onDone={() => { setOtp(false); done(); }}
          onCancel={() => setOtp(false)}
        />
      )}
    </div>
  );
}
