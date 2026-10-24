/**
 * RegisterPage.jsx สมัครสมาชิก 3 ขั้นตอน (ภาคผนวก ข ข้อ 2)
 * 1 บทบาท · 2 ข้อมูลผู้เสียภาษี · 3 บัญชีและความยินยอม แล้วไปยืนยันอีเมลที่ /verify
 * ความสามารถที่ย้ายมาจากหน้าเดิมครบ: ฟอร์มปรับตามบทบาท/นิติบุคคล, ตรวจเลขผู้เสียภาษี 13 หลัก,
 * ตรวจอีเมลและเลขผู้เสียภาษีซ้ำกับเซิร์ฟเวอร์, วัดความแข็งแรงรหัสผ่าน, ความยินยอม 4 ข้อ,
 * ชื่อบัญชีธนาคารตั้งต้นเป็นชื่อผู้ลงทะเบียน และแสดงข้อผิดพลาดใต้ช่องที่เซิร์ฟเวอร์ระบุ
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import GoogleButton from '../features/auth/GoogleButton.jsx';
import { authApi } from '../features/auth/authApi.js';
import { clearGoogleSignup, loadGoogleSignup } from '../features/auth/googleSignup.js';
import { saveOtpSession } from '../features/auth/otpSession.js';
import { useMe } from '../features/auth/useMe.js';
import {
  EMPTY_REGISTER_FORM, SERVER_FIELD, buildRegisterBody, checkRegisterField, digitsOnly, isJuristic,
  STEP2_KEYS, missingRequiredConsent, normalizeEmail, passwordErrors, passwordRules, passwordStrength, step2Errors,
} from '../features/auth/validation.js';
import { ROLE_LABEL } from '../lib/home.js';
import { Alert, Button, SegGroup, SelectField, Spinner, StepBar, TextField, cx } from '../components/ui.jsx';
import { AddressCascade } from '../features/address/AddressFields.jsx';
import BankField from '../components/BankField.jsx';

const STEPS = ['บทบาท', 'ข้อมูลผู้เสียภาษี', 'บัญชีและความยินยอม'];
const STEP_SUB = {
  1: 'เลือกบทบาทของคุณเพื่อเริ่มต้น',
  2: 'กรอกข้อมูลที่กฎหมายบังคับให้แสดงบนเอกสารภาษี',
  3: 'ตั้งค่าบัญชีและให้ความยินยอมการใช้ข้อมูล',
};
const ROLES = [
  { value: 'creator', title: 'อินฟลูเอนเซอร์ / ผู้ผลิตเนื้อหา', detail: 'ผู้รับจ้างผลิตเนื้อหา รับค่าจ้างและถูกหักภาษี ณ ที่จ่าย' },
  { value: 'corporate', title: 'บริษัทผู้ว่าจ้าง (แบรนด์)', detail: 'นิติบุคคลที่ว่าจ้างโดยตรง ออกใบกำกับภาษีและหนังสือรับรองหัก ณ ที่จ่าย' },
  { value: 'agency', title: 'เอเจนซี่', detail: 'ตัวกลางบริหารการจ้าง เป็นได้ทั้งนิติบุคคลและบุคคลธรรมดา' },
];
const DIGIT_FIELDS = new Set(['taxId', 'addrPost', 'branchCode']);
const TAKEN_MSG = {
  email: 'อีเมลนี้ถูกใช้สมัครแล้ว เข้าสู่ระบบ หรือใช้อีเมลอื่น',
  taxId: 'เลขประจำตัวผู้เสียภาษีนี้ลงทะเบียนแล้ว (1 เลขต่อ 1 บัญชี)',
};
const FREE_MSG = { email: 'ใช้อีเมลนี้ได้', taxId: 'เลขถูกต้องและยังไม่ถูกใช้ลงทะเบียน' };
const METER = { strong: 'bg-ok', fair: 'bg-[#E2A400]', weak: 'bg-danger' };

const availKey = (kind, f) => (kind === 'email' ? normalizeEmail(f.email) : digitsOnly(f.taxId));

function GoogleBanner({ email, onCancel }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-line bg-white px-3.5 py-2.5">
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      <span className="min-w-0 flex-1 text-[0.90625rem]">
        <span className="block text-ink-soft">สมัครด้วยบัญชี Google</span>
        <b className="block truncate">{email}</b>
      </span>
      <button type="button" onClick={onCancel} className="shrink-0 cursor-pointer text-[0.875rem] font-bold text-orange-deep underline">
        ใช้อีเมลอื่น
      </button>
    </div>
  );
}

function focusFirstInvalid() {
  requestAnimationFrame(() => {
    const el = document.querySelector('[aria-invalid="true"]');
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const me = useMe();
  const meta = useQuery({ queryKey: ['meta', 'profile-options'], queryFn: authApi.profileOptions, staleTime: Infinity });
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => ({ ...EMPTY_REGISTER_FORM }));
  const [errs, setErrs] = useState({});
  const [avail, setAvail] = useState({}); // { email: { v, taken }, taxId: { v, taken } }
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  // สมัครด้วย Google: อีเมลมาจาก Google ไม่ต้องตั้งรหัสผ่าน แต่ยังกรอกข้อมูลผู้เสียภาษีครบทุกช่อง
  const [google, setGoogle] = useState(loadGoogleSignup);

  function dropGoogle() {
    clearGoogleSignup();
    setGoogle(null);
  }

  // ชื่อจาก Google ใช้เป็นชื่อตั้งต้นของบุคคลธรรมดา (นิติบุคคลต้องกรอกชื่อบริษัทเอง)
  useEffect(() => {
    if (!google || !google.name) return;
    setForm((f) => (f.name || isJuristic(f) ? f : { ...f, name: google.name, bankAcc: f.bankAcc || google.name, bankAccAuto: true }));
  }, [google, form.role, form.entityType]);

  // ค่าเริ่มต้นที่ต้องรอรายการจากเซิร์ฟเวอร์: ข้อยินยอมที่จำเป็นติ๊กไว้ก่อน และประเภทนิติบุคคลตัวแรก
  useEffect(() => {
    if (!meta.data) return;
    setForm((f) => ({
      ...f,
      consent: f.consent || meta.data.consentPurposes.filter((p) => p.required).map((p) => p.key),
      companyType: f.companyType || meta.data.companyTypes[0] || '',
    }));
  }, [meta.data]);

  // ช่องที่เคยฟ้องแล้ว ตรวจซ้ำทุกครั้งที่ข้อมูลเปลี่ยน ข้อความจึงหายทันทีที่แก้ถูก (หน้าเดิมทำตอนพิมพ์)
  useEffect(() => {
    setErrs((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(prev)) {
        if (!prev[k] || k === 'password' || k === 'password2') continue;
        const msg = checkRegisterField(k, form);
        if (msg !== prev[k]) { next[k] = msg; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [form]);

  if (me.data && me.data.user) return <Navigate to="/app" replace />;

  const juristic = isJuristic(form);
  const strength = passwordStrength(form.password);

  function set(key, value) {
    const v = DIGIT_FIELDS.has(key) ? digitsOnly(value) : value;
    setForm((prev) => {
      const next = { ...prev, [key]: v };
      // ชื่อบัญชีธนาคารตั้งต้นเป็นชื่อผู้ลงทะเบียน จนกว่าผู้ใช้จะพิมพ์ชื่อบัญชีเอง
      if (key === 'name' && (prev.bankAccAuto || !prev.bankAcc)) { next.bankAcc = v; next.bankAccAuto = true; }
      if (key === 'bankAcc') next.bankAccAuto = false;
      if (key === 'branchType' && v !== 'branch') next.branchCode = '';
      return next;
    });
  }
  const setErr = (key, msg) => setErrs((e) => ({ ...e, [key]: msg }));
  const check = (key) => setErr(key, checkRegisterField(key, form));

  /** ข้อความใต้ช่อง รวมผลตรวจรูปแบบกับผลตรวจซ้ำจากเซิร์ฟเวอร์ */
  function fieldError(key) {
    if (errs[key]) return errs[key];
    const a = avail[key];
    return a && a.taken && a.v === availKey(key, form) ? TAKEN_MSG[key] : null;
  }
  function fieldOk(key) {
    const a = avail[key];
    return a && !a.taken && a.v === availKey(key, form) && !errs[key] ? FREE_MSG[key] : null;
  }

  /** ตรวจอีเมล/เลขผู้เสียภาษีซ้ำกับบัญชีในระบบ คืน false ถ้ารู้แน่ว่าใช้ไม่ได้ */
  async function checkAvailable(kind) {
    const msg = checkRegisterField(kind, form);
    setErr(kind, msg);
    if (msg) return false;
    const raw = availKey(kind, form);
    if (avail[kind] && avail[kind].v === raw) return !avail[kind].taken;
    try {
      const data = await authApi.checkAvailable({ [kind]: raw });
      const r = data && data[kind];
      if (!r || r.invalid) return true; // ให้เซิร์ฟเวอร์ตัดสินอีกครั้งตอนสมัคร
      setAvail((a) => ({ ...a, [kind]: { v: raw, taken: !!r.taken } }));
      return !r.taken;
    } catch {
      return true; // ตรวจไม่ได้ (เช่น ถูกจำกัดความถี่) ไม่ขวางผู้ใช้ เซิร์ฟเวอร์ตรวจซ้ำตอนสมัครอยู่แล้ว
    }
  }

  /** ตรวจทั้งขั้นที่ 2 ก่อนไปขั้นที่ 3 (หรือก่อนส่งสมัคร) คืน true ถ้าผ่าน */
  function validateStep2() {
    const e2 = step2Errors(form);
    const taxTaken = !!(avail.taxId && avail.taxId.taken && avail.taxId.v === availKey('taxId', form));
    setErrs((prev) => {
      const next = { ...prev };
      for (const k of STEP2_KEYS) next[k] = e2[k] || null;
      return next;
    });
    const count = Object.keys(e2).length + (taxTaken ? 1 : 0);
    if (!count) return true;
    setFormError(`พบข้อมูลที่ต้องแก้ไข ${count} จุด กรุณาดูข้อความสีแดงใต้ช่อง`);
    focusFirstInvalid();
    return false;
  }

  function goto(n) {
    setFormError('');
    if (n === 3) {
      if (!validateStep2()) return;
      void checkAvailable('taxId');
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function register() {
    if (pending) return;
    setFormError('');
    if (!google) {
      const emailMsg = checkRegisterField('email', form);
      const pw = passwordErrors(form.password, form.password2, { showEmpty: true });
      setErrs((e) => ({ ...e, email: emailMsg, password: pw.password || null, password2: pw.password2 || null }));
      if (emailMsg || pw.password || pw.password2) {
        setFormError('พบข้อมูลที่ต้องแก้ไข กรุณาดูข้อความสีแดงใต้ช่อง');
        focusFirstInvalid();
        return;
      }
    }
    if (missingRequiredConsent(meta.data?.consentPurposes, form.consent).length) {
      setFormError('กรุณายินยอมในข้อที่จำเป็นต่อการให้บริการก่อน');
      return;
    }
    if (!validateStep2()) { setStep(2); return; }

    setPending(true);
    if (!google && !(await checkAvailable('email'))) {
      setPending(false);
      setFormError('อีเมลนี้ถูกใช้สมัครแล้ว');
      focusFirstInvalid();
      return;
    }
    try {
      const body = buildRegisterBody(form);
      const data = await authApi.register(google
        ? { ...body, email: undefined, password: undefined, passwordConfirm: undefined, googleSignupToken: google.token }
        : body);
      clearGoogleSignup();
      saveOtpSession(data, 'register');
      void navigate('/verify');
    } catch (err) {
      if (err.field === 'google') {
        dropGoogle();
        setStep(1);
        setFormError(err.message);
        setPending(false);
        return;
      }
      const target = SERVER_FIELD[err.field];
      if (target) {
        setErr(target.key, err.message);
        if (target.step !== step) setStep(target.step);
        focusFirstInvalid();
      }
      setFormError(err.message);
      setPending(false);
    }
  }

  const text = (key, props) => (
    <TextField
      id={`r-${key}`}
      value={form[key]}
      error={fieldError(key)}
      ok={fieldOk(key)}
      onChange={(e) => {
        set(key, e.target.value);
        if (key === 'email' || key === 'taxId') setAvail((a) => ({ ...a, [key]: null }));
      }}
      onBlur={() => (key === 'email' || key === 'taxId' ? checkAvailable(key) : check(key))}
      {...props}
    />
  );

  return (
    <>
      <h1 className="mb-1.5 text-[1.875rem]">สมัครสมาชิก</h1>
      <p className="mb-6 text-[1rem] text-ink-soft">{STEP_SUB[step]}</p>
      <StepBar label="ขั้นตอนการสมัคร" steps={STEPS} current={step} />
      <Alert>{formError}</Alert>
      {meta.isError && (
        <Alert>
          โหลดตัวเลือกของฟอร์มไม่สำเร็จ: {meta.error.message}{' '}
          <button type="button" className="cursor-pointer font-bold underline" onClick={() => meta.refetch()}>ลองอีกครั้ง</button>
        </Alert>
      )}

      {step === 1 && (
        <form key="s1" noValidate className="tf-step-in" onSubmit={(e) => { e.preventDefault(); goto(2); }}>
          {google ? (
            <GoogleBanner email={google.email} onCancel={dropGoogle} />
          ) : (
            <GoogleButton mode="signup" divider="หรือสมัครด้วยอีเมลและรหัสผ่าน" onError={setFormError} onNeedsRegistration={setGoogle} />
          )}
          <fieldset className="mb-4">
            <legend className="mb-1.5 block text-[0.90625rem] font-semibold">คุณใช้งานระบบในฐานะใด</legend>
            <div className="flex flex-col gap-2.5">
              {ROLES.map((r) => (
                <label key={r.value} className="tf-choice">
                  <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => set('role', r.value)} aria-labelledby={`rg-role-${r.value}-t`} aria-describedby={`rg-role-${r.value}-d`} />
                  <span>
                    <b id={`rg-role-${r.value}-t`} className="block text-sm">{r.title}</b>
                    <small id={`rg-role-${r.value}-d`} className="mt-0.5 block text-[0.84375rem] leading-snug text-ink-soft">{r.detail}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {form.role === 'agency' && (
            <div className="tf-reveal">
              <SegGroup
                name="entityType"
                legend="ประเภทผู้เสียภาษีของเอเจนซี่"
                hint="มีผลต่อเอกสารยืนยันตัวตนที่ต้องใช้ในขั้นถัดไป"
                value={form.entityType}
                onChange={(v) => set('entityType', v)}
                options={[{ value: 'juristic', label: 'นิติบุคคล' }, { value: 'individual', label: 'บุคคลธรรมดา / ฟรีแลนซ์' }]}
              />
            </div>
          )}
          <Button type="submit" block>ถัดไป</Button>
          <p className="mt-6 text-center text-[0.96875rem] text-ink-soft lg:hidden">
            มีบัญชีอยู่แล้ว? <Link to="/login" className="font-semibold text-orange-deep">เข้าสู่ระบบ</Link>
          </p>
        </form>
      )}

      {step === 2 && (
        <form key="s2" noValidate className="tf-step-in" onSubmit={(e) => { e.preventDefault(); goto(3); }}>
          <p className="mb-4 rounded-[11px] border border-orange-soft bg-orange-pale px-3.5 py-2 text-[0.875rem] font-semibold text-orange-deep">
            กำลังกรอกข้อมูลสำหรับ: {ROLE_LABEL[form.role]} ({juristic ? 'นิติบุคคล' : 'บุคคลธรรมดา'})
          </p>

          {text('name', {
            label: juristic ? 'ชื่อนิติบุคคล (ตามหนังสือรับรอง) *' : 'ชื่อ-นามสกุล *',
            placeholder: juristic ? 'เช่น บริษัท แบรนด์ดี จำกัด' : 'เช่น นุสนีย์ มะแอเคียน',
            hint: juristic ? 'สะกดให้ตรงกับหนังสือรับรองนิติบุคคล' : 'ต้องตรงกับชื่อบัญชีธนาคารที่รับเงิน',
            maxLength: 150,
          })}
          {text('tradeName', {
            label: 'ชื่อทางการค้า / ชื่อแบรนด์ (ถ้ามี)',
            placeholder: 'เช่น ABC Media, ครัวคุณต๋อย',
            hint: 'แสดงเป็นบรรทัดเสริมบนเอกสาร คู่กับชื่อจริงด้านบนเสมอ ไม่ใช้แทน (กฎหมายบังคับให้เอกสารภาษีระบุชื่อจริง)',
            maxLength: 150,
          })}
          {text('taxId', {
            label: juristic ? 'เลขทะเบียนนิติบุคคล / เลขประจำตัวผู้เสียภาษี 13 หลัก *' : 'เลขประจำตัวผู้เสียภาษี 13 หลัก *',
            placeholder: 'กรอกตัวเลข 13 หลัก',
            inputMode: 'numeric',
            maxLength: 17, // เผื่อวางเลขที่มีขีดคั่น เช่น 1-2345-67890-12-1 ขีดถูกกรองออกทีหลัง
            hint: juristic ? 'ดูได้จากหนังสือรับรองนิติบุคคล' : 'ใช้เลขบัตรประชาชน 13 หลัก ไม่ขอสำเนาบัตร',
          })}

          {juristic && (
            <div className="tf-reveal mb-4 rounded-[14px] border-[1.5px] border-dashed border-orange-soft bg-[#FFFCFA] px-4 pt-4">
              <p className="mb-3 text-[0.84375rem] font-bold text-orange-deep">ข้อมูลเฉพาะนิติบุคคล</p>
              <SelectField
                id="r-companyType"
                label="ประเภทนิติบุคคล *"
                value={form.companyType}
                options={meta.data?.companyTypes}
                onChange={(e) => set('companyType', e.target.value)}
              />
              <div className="grid gap-x-3 sm:grid-cols-2">
                <SelectField
                  id="r-branchType"
                  label="สำนักงานใหญ่ / สาขา *"
                  value={form.branchType}
                  options={[{ value: 'head', label: 'สำนักงานใหญ่' }, { value: 'branch', label: 'สาขา' }]}
                  onChange={(e) => set('branchType', e.target.value)}
                />
                {text('branchCode', {
                  label: 'เลขที่สาขา (5 หลัก)',
                  placeholder: 'เช่น 00001',
                  inputMode: 'numeric',
                  maxLength: 5,
                  disabled: form.branchType !== 'branch',
                })}
              </div>
              {text('authName', { label: 'กรรมการผู้มีอำนาจลงนาม *', placeholder: 'ชื่อตามหนังสือรับรองนิติบุคคล', maxLength: 150 })}
              <TextField
                id="r-authPosition"
                label="ตำแหน่งผู้มีอำนาจลงนาม"
                placeholder="เช่น กรรมการผู้จัดการ"
                value={form.authPosition}
                maxLength={100}
                onChange={(e) => set('authPosition', e.target.value)}
              />
            </div>
          )}

          <SegGroup
            name="vat"
            legend="สถานะภาษีมูลค่าเพิ่ม (VAT)"
            hint={form.vat === 'yes'
              ? 'ต้องแนบ ภ.พ.20 ตอนยืนยันตัวตน เพื่อออกใบกำกับภาษีเต็มรูปและ e-Tax Invoice ได้'
              : 'ออกใบกำกับภาษีไม่ได้ แต่ออกใบเสร็จ/ใบแจ้งหนี้ได้ตามปกติ'}
            value={form.vat}
            onChange={(v) => set('vat', v)}
            options={[{ value: 'no', label: 'ยังไม่ได้จดทะเบียน' }, { value: 'yes', label: 'จดทะเบียน VAT แล้ว' }]}
          />
          {form.vat === 'yes' && (
            <div className="tf-reveal mb-4 rounded-[14px] border-[1.5px] border-dashed border-orange-soft bg-[#FFFCFA] px-4 pt-4">
              {text('vatRegDate', {
                label: 'วันที่จดทะเบียนภาษีมูลค่าเพิ่ม *',
                type: 'date',
                hint: 'เลขที่ผู้ประกอบการจดทะเบียน VAT คือเลขประจำตัวผู้เสียภาษี 13 หลักด้านบน ไม่มีเลขแยกต่างหาก',
              })}
            </div>
          )}

          <h3 className="mb-3 mt-6 text-[0.9375rem] text-ink-soft">ที่อยู่ตามที่จดทะเบียน (ต้องแสดงบนเอกสารภาษี)</h3>
          <div className="grid gap-x-3 sm:grid-cols-2">
            {text('addrNo', { label: 'บ้านเลขที่ / อาคาร *', placeholder: 'เช่น 55/1', maxLength: 60 })}
            <TextField id="r-addrStreet" label="ถนน" placeholder="เช่น สาทรใต้" value={form.addrStreet} maxLength={80} onChange={(e) => set('addrStreet', e.target.value)} />
          </div>
          <AddressCascade idPrefix="r-addr" required value={{ prov: form.addrProv, dist: form.addrDist, sub: form.addrSub, zip: form.addrPost }}
            errors={{ prov: fieldError('addrProv'), dist: fieldError('addrDist'), sub: fieldError('addrSub'), zip: fieldError('addrPost') }}
            onChange={(p) => { const K = { prov: 'addrProv', dist: 'addrDist', sub: 'addrSub', zip: 'addrPost' }; Object.entries(p).forEach(([k, v]) => set(K[k], v)); }} onBlur={(k) => check({ prov: 'addrProv', dist: 'addrDist', sub: 'addrSub', zip: 'addrPost' }[k])} />
          {text('phone', { label: 'เบอร์ติดต่อ', placeholder: 'เช่น 02-111-2233', hint: 'ใช้ติดต่อเรื่องเอกสารเท่านั้น (OTP ส่งทางอีเมล)', type: 'tel', maxLength: 20 })}

          <h3 className="mb-3 mt-6 text-[0.9375rem] text-ink-soft">บัญชีธนาคารสำหรับรับเงิน / คืนเงิน</h3>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <BankField id="r-bankName" value={form.bankName} onChange={(v) => set('bankName', v)} />
            {text('bankNo', { label: 'เลขที่บัญชี', placeholder: 'เช่น 123-4-56789-0', inputMode: 'numeric', maxLength: 20 })}
          </div>
          {text('bankAcc', { label: 'ชื่อบัญชี', placeholder: 'ต้องตรงกับชื่อผู้ลงทะเบียน', hint: 'แสดงแบบปิดบางส่วนในหน้าจอทั่วไป', maxLength: 150 })}

          <div className="mt-1 flex gap-2">
            <Button variant="ghost" onClick={() => goto(1)}>ย้อนกลับ</Button>
            <Button type="submit" className="flex-1">ถัดไป</Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form key="s3" noValidate className="tf-step-in" onSubmit={(e) => { e.preventDefault(); void register(); }}>
          {google ? (
            <>
              <GoogleBanner email={google.email} onCancel={dropGoogle} />
              <p className="-mt-2 mb-4 text-[0.875rem] leading-relaxed text-ink-soft">
                ไม่ต้องตั้งรหัสผ่าน ครั้งต่อไปกด "เข้าสู่ระบบด้วย Google" แล้วยืนยันรหัส OTP ที่ส่งไปทางอีเมลนี้
              </p>
            </>
          ) : (<>
          {text('email', {
            label: 'อีเมล *',
            type: 'email',
            placeholder: 'you@example.com',
            autoComplete: 'username',
            hint: 'ระบบส่งรหัส OTP มายืนยันก่อนเปิดใช้งานบัญชี',
            maxLength: 150,
          })}
          <TextField
            id="r-password"
            label="รหัสผ่าน *"
            type="password"
            placeholder="อย่างน้อย 8 ตัวอักษร มีตัวอักษรและตัวเลข"
            autoComplete="new-password"
            maxLength={128}
            value={form.password}
            error={errs.password}
            onChange={(e) => {
              set('password', e.target.value);
              if (errs.password || form.password2) {
                const pw = passwordErrors(e.target.value, form.password2);
                setErrs((x) => ({ ...x, password: pw.password || null, password2: pw.password2 || null }));
              }
            }}
            onBlur={() => {
              const pw = passwordErrors(form.password, form.password2);
              setErrs((x) => ({ ...x, password: pw.password || null }));
            }}
            className="mb-2"
          />
          <div className="mb-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#F1EBE5]" aria-hidden="true">
              <div className={cx('h-full transition-all', METER[strength.level])} style={{ width: `${strength.percent}%` }} />
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.84375rem]" aria-label="เงื่อนไขรหัสผ่าน">
              {passwordRules(form.password).map((r) => (
                <li key={r.label} className={r.ok ? 'font-semibold text-ok' : 'text-ink-soft'}>
                  <span aria-hidden="true">{r.ok ? '✓' : '○'}</span> {r.label}
                  <span className="sr-only">{r.ok ? ' ผ่าน' : ' ยังไม่ผ่าน'}</span>
                </li>
              ))}
            </ul>
          </div>
          <TextField
            id="r-password2"
            label="ยืนยันรหัสผ่าน *"
            type="password"
            placeholder="กรอกรหัสผ่านอีกครั้ง"
            autoComplete="new-password"
            maxLength={128}
            value={form.password2}
            error={errs.password2}
            onChange={(e) => {
              set('password2', e.target.value);
              const pw = passwordErrors(form.password, e.target.value);
              setErrs((x) => ({ ...x, password2: pw.password2 || null }));
            }}
          />
          </>)}

          <h3 className="mb-2 mt-6 text-[0.9375rem] text-ink-soft">ความยินยอมการใช้ข้อมูลส่วนบุคคล</h3>
          <p className="mb-3 text-[0.875rem] leading-relaxed text-ink-soft">
            เลือกยินยอมเป็นรายข้อได้ ถอนข้อที่ไม่บังคับได้ภายหลังที่หน้าโปรไฟล์{' '}
            <Link to="/guide/privacy" target="_blank" className="font-bold text-orange-deep underline">อ่านนโยบายฉบับเต็ม</Link>
          </p>
          {!meta.data ? (
            <p className="mb-4 flex items-center gap-2 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังโหลดรายการความยินยอม</p>
          ) : (
            <div className="mb-2 flex flex-col gap-2.5">
              {meta.data.consentPurposes.map((p) => (
                <label key={p.key} className="tf-choice">
                  <input
                    type="checkbox"
                    value={p.key}
                    checked={(form.consent || []).includes(p.key)}
                    onChange={(e) => set('consent', e.target.checked
                      ? [...(form.consent || []), p.key]
                      : (form.consent || []).filter((k) => k !== p.key))}
                    aria-labelledby={`rg-consent-${p.key}-t`}
                    aria-describedby={`rg-consent-${p.key}-d`}
                  />
                  <span className="min-w-0 flex-1">
                    <b id={`rg-consent-${p.key}-t`} className="mb-0.5 block text-[0.90625rem]">
                      {p.label}{' '}
                      <span className={cx('ml-1 whitespace-nowrap rounded-full px-2 py-px text-[0.75rem]', p.required ? 'bg-orange-soft text-orange-deep' : 'bg-[#F1EBE5] text-ink-soft')}>
                        {p.required ? 'จำเป็น' : 'เลือกได้'}
                      </span>
                    </b>
                    <small id={`rg-consent-${p.key}-d`} className="block text-[0.84375rem] leading-relaxed text-ink-soft">{p.detail}</small>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="ghost" onClick={() => goto(2)} disabled={pending}>ย้อนกลับ</Button>
            <Button type="submit" className="flex-1" loading={pending} disabled={!meta.data}>
              {pending ? 'กำลังสร้างบัญชี' : 'สร้างบัญชี'}
            </Button>
          </div>
          <p className="mt-2.5 text-[0.875rem] leading-relaxed text-ink-soft">
            หลังยืนยันอีเมลแล้ว ระบบจะนำไปยังหน้าอัปโหลดเอกสารยืนยันตัวตนที่หน้าโปรไฟล์ (ทำภายหลังได้)
          </p>
        </form>
      )}
    </>
  );
}
