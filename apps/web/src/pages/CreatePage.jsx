/**
 * CreatePage.jsx สร้าง/แก้ไขเอกสาร 4 ขั้นตอน (ย้ายจาก create.js ของหน้าเดิม)
 * 1 เลือกจุดประสงค์ · 2 เลือกประเภทเอกสาร · 3 กรอกข้อมูล (ฟอร์มสร้างจาก docschema) · 4 ตรวจทานก่อนยืนยัน
 * คำนวณยอดทันทีขณะพิมพ์ · บันทึกร่างอัตโนมัติ · ดึงข้อมูลจากสมุดคู่ค้า/เอกสารเดิม/เอกสารอ้างอิง
 * ?type=X[&purpose=][&quotationRef=…] เริ่มที่ขั้นกรอกข้อมูล · ?edit=id แก้ไขเอกสารเดิม
 */
import Select from '../components/Select.jsx';
import DatePicker from '../components/DatePicker.jsx';
import Combobox from '../components/Combobox.jsx';
import BankField from '../components/BankField.jsx';
import { DOC_FONTS, readAppearance } from '../lib/appearance.js';
import { useDocFonts } from '../lib/docFonts.js';
import BranchField from '../components/BranchField.jsx';
import ContactLookup from '../features/contacts/ContactLookup.jsx';
import DocArt from '../components/DocArt.jsx';
import NameField from '../components/NameField.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { loadThaiAddress } from '../features/address/thaiAddress.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { docschema } from '../lib/shared.js';
import { baht, thb } from '../lib/format.js';
import { useSubmit } from '../lib/useSubmit.js';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { Alert, BackButton, Button, Card, Field, PageHeader, SelectField, Skeleton, StepBar, TextField, cx } from '../components/ui.jsx';
import { docsApi } from '../features/docs/docsApi.js';
import { AddressFields } from '../features/address/AddressFields.jsx';
import {
  GROUPS, PURPOSES, PURPOSE_LABEL, WHT_PRESETS, allFields, checkOne, clearDraft, collect, computeTotals, contactToParty,
  copyFromRef, emptyItem, filledItems, formOf, initialFields, initialParty, itemColDef, lastDocOf, loadDraft, partyDefaults,
  defaultOf, partyFieldDef, prefillFrom, presetFor, saveDraft, textOf, typesForPurpose, validateAll, visible,
} from '../features/create/createState.js';

const STEPS = ['จุดประสงค์', 'ประเภทเอกสาร', 'กรอกข้อมูล', 'ตรวจสอบและยืนยัน'];

/** ช่องกรอกหนึ่งช่องตามชนิดที่ schema กำหนด */
/**
 * ภาพประกอบของจุดประสงค์แต่ละแบบ (ขั้นที่ 1) วาดเฉพาะให้สื่อความหมาย ไม่ใช้ไอคอนทั่วไปในกล่องเทา
 * เส้นสีตัวอักษร + พื้นส้มอ่อนเป็นตัวเอกสาร + จุดเน้นสีส้ม · ชี้การ์ดแล้วจุดเน้นขยับเล็กน้อย
 */
function PurposeArt({ id }) {
  const paper = <path d="M10 6h17l7 7v27a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="var(--color-orange-pale)" />;
  const fold = <path d="M27 6v7h7" />;
  const lines = <path d="M14 20h12M14 25h9" />;
  return (
    <svg viewBox="0 0 56 48" aria-hidden="true" className="h-12 w-14 overflow-visible" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {id === 'send' && (
        <>
          {paper}{fold}{lines}
          <path d="M14 30h6" />
          {/* ส่งออกไปหาอีกฝ่าย */}
          <g className="transition-transform duration-300 group-hover:translate-x-1" stroke="var(--color-orange)" strokeWidth="2.2">
            <path d="M33 31h16" />
            <path d="m44 26 5 5-5 5" />
          </g>
        </>
      )}
      {id === 'self' && (
        <>
          {paper}{fold}{lines}
          {/* ตราประทับภายในองค์กร */}
          <g className="origin-[42px_34px] transition-transform duration-300 group-hover:-rotate-6">
            <circle cx="42" cy="34" r="9" fill="#fff" stroke="var(--color-orange)" strokeWidth="2.2" />
            <path d="m38.2 34 2.6 2.6 5-5.2" stroke="var(--color-orange)" strokeWidth="2.2" />
          </g>
        </>
      )}
      {id === 'record' && (
        <>
          {paper}{fold}{lines}
          {/* ย้อนเวลา: นาฬิกาพร้อมลูกศรหมุนกลับ */}
          <g className="origin-[42px_34px] transition-transform duration-500 group-hover:-rotate-[30deg]">
            <circle cx="42" cy="34" r="9" fill="#fff" stroke="none" />
            <path d="M34.6 29.2A9 9 0 1 1 33 34" stroke="var(--color-orange)" strokeWidth="2.2" />
            <path d="m33.2 26.6 1.4 2.8 2.9-1.1" stroke="var(--color-orange)" strokeWidth="2.2" />
            <path d="M42 30v4.4l2.8 1.8" />
          </g>
        </>
      )}
    </svg>
  );
}

/** ตัวเลือกสำเร็จรูปของ "เงื่อนไขการชำระเงิน" (เลือกแล้วแก้ต่อเองได้) */
const PAYMENT_TERM_PRESETS = [
  'ชำระเต็มจำนวนเมื่อส่งมอบงาน',
  'ชำระภายใน 7 วันนับจากวันที่วางบิล',
  'ชำระภายใน 15 วันนับจากวันที่วางบิล',
  'ชำระภายใน 30 วันนับจากวันที่วางบิล',
  'เครดิต 30 วันหลังรับวางบิล',
  'เครดิต 60 วันหลังรับวางบิล',
  'มัดจำ 50% ก่อนเริ่มงาน ส่วนที่เหลือชำระเมื่อส่งมอบงาน',
  'แบ่งชำระ 2 งวด งวดละ 50% ตามที่ระบุในใบเสนอราคา',
  'โอนเงินเข้าบัญชีตามที่ระบุในเอกสารนี้',
];
/** ตัวเลือกสำเร็จรูปของ "ระยะเวลาดำเนินงาน" */
const WORK_PERIOD_PRESETS = [
  '7 วันนับจากวันที่ตกลง', '15 วันนับจากวันที่ตกลง', '30 วันนับจากวันที่ตกลง',
  '60 วันนับจากวันเริ่มสัญญา', '1 เดือน', '2 เดือน', '3 เดือน', '6 เดือน', '1 ปี',
];
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** ช่วงวันที่เริ่มวันนี้ 1 / 2 / 3 เดือน เช่น "17 ต.ค. – 16 พ.ย. 2569 (1 เดือน)" */
function periodFromToday() {
  const t = new Date();
  const fmt = (d, withYear) => `${d.getDate()} ${TH_MON[d.getMonth()]}${withYear ? ` ${d.getFullYear() + 543}` : ''}`;
  return [1, 2, 3].map((m) => {
    const end = new Date(t.getFullYear(), t.getMonth() + m, t.getDate() - 1);
    const sameYear = end.getFullYear() === t.getFullYear();
    return `${fmt(t, !sameYear)} – ${fmt(end, true)} (${m} เดือน)`;
  });
}

/** วัดความกว้าง element ด้วย callback ref (กล่องโผล่ทีหลังได้ เช่น เพิ่งเข้าขั้นกรอกข้อมูล) */
function useBoxWidth() {
  const [el, setEl] = useState(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return undefined;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

/** ช่องที่เป็นชื่อบุคคลเสมอ (ไม่ใช่ชื่อบริษัท) จึงแยกชื่อ-นามสกุลได้ */
const PERSON_NAME_KEYS = new Set(['sign1Name', 'sign2Name', 'witness1', 'witness2', 'signerName', 'delivererName', 'receiverName', 'granteeName', 'grantorAuthName']);

function SchemaField({ def, value, error, docs, suggest, onChange, onBlur, onRefPicked }) {
  const id = `cr-${def.key}`;
  const label = `${def.label}${def.required ? ' *' : ''}`;
  const common = { id, error, onBlur };
  const err = error && <p className="tf-reveal mt-1.5 text-[0.875rem] font-medium text-danger">{error}</p>;
  // ช่องที่อยู่ทุกช่อง (คู่ค้า ผู้มอบ/ผู้รับมอบอำนาจ ผู้รับเงิน) เลือกจังหวัด → อำเภอ → ตำบล แล้วเติมรหัสไปรษณีย์ให้
  if (/address$/i.test(def.key) && (def.type === 'textarea' || def.type === 'text')) {
    return <AddressFields id={id} label={def.label} required={def.required} value={value || ''} onChange={onChange} onBlur={onBlur} error={error} />;
  }
  // ช่องธนาคาร (บัญชีรับเงิน / ธนาคารที่โอน / ธนาคารของคู่ค้า) เลือกจากรายชื่อธนาคาร
  // ช่องชื่อบุคคล (ผู้ลงนาม พยาน ผู้ส่ง/รับมอบ ผู้รับมอบอำนาจ) แยกกรอกชื่อกับนามสกุล แต่เก็บรวมเป็นข้อความเดียวเหมือนเดิม
  if (PERSON_NAME_KEYS.has(def.key) && def.type === 'text') {
    return <NameField {...common} label={label} hint={def.help} value={value} onChange={onChange} />;
  }
  if (/(^|-)branch$/.test(def.key) && def.type === 'text') {
    return <BranchField {...common} label={label} hint={def.help} placeholder={def.placeholder} value={value} onChange={onChange} />;
  }
  if (/(^|-)(bankName|payBank)$/.test(def.key)) {
    return <BankField {...common} label={label} value={value} onChange={onChange} />;
  }
  // ช่องข้อความที่มีรายการแนะนำ (สถานที่ทำสัญญา / ชื่อแคมเปญ) เลือกจากรายการหรือพิมพ์เองได้
  if (suggest && suggest.length && def.type === 'text') {
    return (
      <Field id={id} label={label} hint={def.help} error={error}>
        <Combobox
          id={id}
          value={value == null ? '' : value}
          suggestions={suggest}
          placeholder={def.placeholder || 'เลือกหรือพิมพ์'}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={[def.help && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      </Field>
    );
  }
  if (def.type === 'textarea') {
    return (
      <div className="mb-4 sm:col-span-2">
        <label htmlFor={id} className="mb-1.5 block text-[0.9375rem] font-medium">{label}</label>
        <textarea id={id} rows={3} className="tf-input" placeholder={def.placeholder} value={value || ''} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-invalid={error ? 'true' : 'false'} />
        {err}
      </div>
    );
  }
  if (def.type === 'checkbox') {
    return (
      <label className="tf-choice mb-4 sm:col-span-2">
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-[0.96875rem]">{def.label}</span>
      </label>
    );
  }
  if (def.type === 'checks' || def.type === 'radio') {
    const multi = def.type === 'checks';
    return (
      <fieldset className="mb-4 sm:col-span-2">
        <legend className="mb-1.5 block text-[0.9375rem] font-medium">{label}</legend>
        <div className={multi ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}>
          {def.options.map((o) => (
            <label key={o.value} className={multi ? 'tf-choice' : 'tf-seg'}>
              {multi ? (
                <input type="checkbox" checked={(value || []).includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...(value || []), o.value] : (value || []).filter((x) => x !== o.value))} />
              ) : (
                <input type="radio" name={id} value={o.value} checked={String(value) === String(o.value)} onChange={() => onChange(o.value)} />
              )}
              <span className="text-[0.96875rem]">{o.label}</span>
            </label>
          ))}
        </div>
        {err}
      </fieldset>
    );
  }
  if (def.type === 'select') {
    return <SelectField {...common} label={label} value={value == null ? '' : String(value)} options={def.options} onChange={(e) => onChange(e.target.value)} />;
  }
  if (def.type === 'docref') {
    const opts = docs.filter((x) => def.from.includes(x.type) && x.docNo && x.status !== 'cancelled');
    return (
      <>
        <TextField
          {...common}
          label={label}
          list={`${id}-dl`}
          autoComplete="off"
          placeholder={def.placeholder || (opts.length ? 'เลือกจากเอกสารในระบบ หรือพิมพ์เลขที่' : 'พิมพ์เลขที่เอกสาร')}
          value={value || ''}
          onChange={(e) => { onChange(e.target.value); if (opts.some((x) => x.docNo === e.target.value)) onRefPicked(def, e.target.value); }}
        />
        <datalist id={`${id}-dl`}>
          {opts.map((x) => <option key={x.id} value={x.docNo}>{`${formOf(x.type) ? formOf(x.type).label : x.type} · ${x.party || ''} · ฿${baht(x.total || x.base)}`}</option>)}
        </datalist>
      </>
    );
  }
  const type = def.type === 'date' ? 'date' : (def.type === 'number' || def.type === 'money') ? 'number' : 'text';
  // เงินบาทเพิ่ม/ลดทีละ 0.25 (25 สตางค์ หน่วยเงินที่เล็กที่สุดที่ใช้จริง) · พิมพ์ทศนิยม 2 ตำแหน่งเองได้
  const extra = def.type === 'money' ? { step: '0.25', min: '0', inputMode: 'decimal', placeholder: def.placeholder || '0.00' }
    : def.type === 'number' ? { step: '1', min: '0' }
      : (def.type === 'taxid' || def.type === 'citizenid') ? { inputMode: 'numeric', maxLength: 17 } : {};
  return (
    <>
      <TextField {...common} label={label} hint={def.help} type={type} placeholder={def.placeholder} value={value == null ? '' : value} onChange={(e) => onChange(e.target.value)} list={def.presets ? `${id}-presets` : undefined} {...extra} />
      {def.presets && (
        <datalist id={`${id}-presets`}>
          {WHT_PRESETS.map((p) => <option key={p.desc} value={p.desc}>{`อัตราที่ใช้บ่อย ${p.rate}%`}</option>)}
        </datalist>
      )}
    </>
  );
}

/**
 * แถวปุ่มท้ายขั้นตอน (ย้อนกลับ + ไปต่อ) ปรับตามความกว้างของ "คอลัมน์" ไม่ใช่ของจอ
 * คอลัมน์ข้างแคบ (< 340px เช่นจอ laptop ที่แบ่งสองคอลัมน์) เรียงบน-ล่าง ปุ่มหลักอยู่บน กว้างเต็มแถว
 * คอลัมน์กว้างพอ วางคู่กันในแถวเดียว ปุ่มหลักยืดเต็มที่เหลือ
 */
function StepActions({ back, next }) {
  if (!back) return <div className="[&>*]:w-full">{next}</div>;
  return (
    <div className="@container">
      <div className="flex flex-col-reverse gap-2 @[340px]:flex-row [&>*]:w-full [&>*]:whitespace-nowrap @[340px]:[&>*:first-child]:w-auto @[340px]:[&>*:last-child]:flex-1">
        {back}
        {next}
      </div>
    </div>
  );
}

/**
 * ความกว้างคอลัมน์ในตารางรายการ (rem) ตามชนิดข้อมูล · คอลัมน์ข้อความ (รายละเอียด ชื่อ ที่อยู่) ไม่กำหนด แบ่งพื้นที่ที่เหลือกันเอง
 * ใช้ร่วมกับ table-fixed ตารางจึงพอดีการ์ด ไม่ล้นขอบเพราะช่องกรอกขยายตามความยาวเริ่มต้นของเบราว์เซอร์
 */
const ITEM_COL_REM = { date: 9.5, money: 8, number: 5.5, select: 8.5, taxid: 10.5 };
/** หน่วยนับให้เลือกในรายการ แบ่งหัวข้อตามกลุ่ม (พิมพ์หน่วยอื่นเองได้ แต่ห้ามเป็นตัวเลข) */
const UNIT_SUGGESTIONS = docschema.UNIT_GROUPS.flatMap(([group, units]) => units.map((value) => ({ value, group })));
const itemColRem = (cdef) => (cdef.width === 'wide' ? null : ITEM_COL_REM[cdef.type] || null);
/** ความกว้างต่ำสุดของตาราง: คอลัมน์คงที่ + คอลัมน์ข้อความละ 9rem + เลขลำดับ/ปุ่มลบ · แคบกว่านี้ค่อยเลื่อนแนวนอน */
function itemTableMinRem(cols, priced) {
  return cols.reduce((sum, c) => sum + (itemColRem(itemColDef(c)) || 9), 0) + (priced ? 7 : 0) + 4.5;
}

function Section({ title, tools, children }) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-medium">{title}</h2>
        {tools}
      </div>
      {children}
    </Card>
  );
}

function Line({ k, v, strong, minus }) {
  return (
    <p className={cx('flex items-baseline justify-between gap-4 py-1', strong ? 'mt-1 border-t border-line pt-3 text-[1.0625rem] font-medium' : 'text-[0.96875rem]')}>
      <span className={strong ? '' : 'text-ink-soft'}>{k}</span>
      <b className={cx('font-mono font-medium tabular-nums', (strong || minus) && 'text-orange-deep', strong && 'text-[1.25rem]')}>{minus ? '-' : ''}{v}</b>
    </p>
  );
}

export default function CreatePage() {
  const { user, role, profile } = useOutletContext();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const [step, setStep] = useState(1);
  const [purpose, setPurpose] = useState(null);
  const [type, setType] = useState(null);
  const [editing, setEditing] = useState(null);
  const [fields, setFields] = useState({});
  const [party, setParty] = useState({});
  const [items, setItems] = useState([]);
  const [docFont, setDocFont] = useState(() => readAppearance().docFont); // ฟอนต์ PDF ของเอกสารฉบับนี้
  const docFonts = useDocFonts();
  const [errs, setErrs] = useState({ fields: {}, party: {}, items: [] });
  const [summary, setSummary] = useState([]);
  const [saveContact, setSaveContact] = useState(false);
  const [prefillOffer, setPrefillOffer] = useState(null);
  const [draftOffer, setDraftOffer] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [itemsBox, itemsBoxPx] = useBoxWidth();
  const [pndBusy, setPndBusy] = useState(false);
  const [pndHint, setPndHint] = useState('');
  const started = useRef(false);
  const completeness = (profile && profile.completeness) || {};

  const docs = useQuery({ queryKey: ['documents', 'all'], queryFn: () => api.get('/api/documents') });
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/api/contacts') });
  const docList = (docs.data && docs.data.items) || [];
  const contactList = (contacts.data && contacts.data.items) || [];
  const [provinces, setProvinces] = useState([]);
  useEffect(() => { loadThaiAddress().then((d) => setProvinces(d.provinces)).catch(() => {}); }, []);

  // รายการแนะนำของช่องข้อความ: ค่าที่เคยใช้ในเอกสารก่อนหน้า (ใหม่สุดก่อน) ตามด้วยตัวเลือกมาตรฐาน
  const suggestFor = useMemo(() => {
    const used = (key) => {
      const counts = new Map();
      for (const d of docList) {
        const v = d.fields && typeof d.fields[key] === 'string' ? d.fields[key].trim() : '';
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      return [...counts.entries()];
    };
    const myProvince = defaultOf({ def: 'me.province' }, user);
    return {
      place: [
        ...(myProvince ? [{ value: myProvince, hint: 'จังหวัดในโปรไฟล์', group: 'แนะนำ' }] : []),
        ...used('place').map(([v, n]) => ({ value: v, hint: `ใช้แล้ว ${n} ฉบับ`, group: 'เคยใช้' })),
        ...provinces.map((p) => ({ value: p, group: 'จังหวัดทั้งหมด' })),
      ],
      campaignName: used('campaignName').map(([v, n]) => ({ value: v, hint: `${n} เอกสาร`, group: 'แคมเปญที่เคยใช้' })),
      paymentTerms: [
        ...used('paymentTerms').map(([v, n]) => ({ value: v, hint: `ใช้แล้ว ${n} ฉบับ`, group: 'เคยใช้' })),
        ...PAYMENT_TERM_PRESETS.map((v) => ({ value: v, group: 'เงื่อนไขที่ใช้บ่อย' })),
      ],
      workPeriod: [
        ...used('workPeriod').map(([v, n]) => ({ value: v, hint: `ใช้แล้ว ${n} ฉบับ`, group: 'เคยใช้' })),
        ...periodFromToday().map((v) => ({ value: v, group: 'เริ่มวันนี้' })),
        ...WORK_PERIOD_PRESETS.map((v) => ({ value: v, group: 'ระยะเวลาที่ใช้บ่อย' })),
      ],
    };
  }, [docList, provinces, user]);

  // ใบกำกับภาษี/ใบรับอิเล็กทรอนิกส์แสดงให้เห็นเสมอ แต่ล็อกไว้จนกว่าจะจด VAT และได้รับสิทธิ์ e-Tax (อนุมัติจากกรมสรรพากร + แอดมินตรวจแล้ว)
  // บอกเหตุผลและทางไปขอสิทธิ์ ดีกว่าซ่อนไปเฉยๆ จนผู้ใช้ไม่รู้ว่ามีเอกสารนี้
  const types = useMemo(() => docschema.rolesFor(role), [role]);
  const etaxOk = !!user.vatRegistered && user.etaxStatus === 'approved';
  const etaxLocked = (t) => docschema.isEtaxType(t) && !etaxOk;
  const kycOk = user.verifyStatus === 'verified' || role === 'admin';
  const [etaxNotice, setEtaxNotice] = useState(null); // ประเภท e-Tax ที่กดแต่ยังไม่มีสิทธิ์ (เปิดกล่องอธิบาย)
  const [etaxAck, setEtaxAck] = useState(false); // ผู้ใช้ยืนยันก่อนออกเอกสาร e-Tax ในขั้นตรวจทาน
  // ขั้นที่ 2 แสดงเฉพาะประเภทที่เหมาะกับจุดประสงค์ที่เลือก
  const purposeTypes = useMemo(() => typesForPurpose(types, purpose), [types, purpose]);
  // ซ่อนจุดประสงค์ที่บทบาทนี้ไม่มีเอกสารให้สร้างเลย (เช่น ครีเอเตอร์ไม่มีเอกสารภายในองค์กร)
  const availablePurposes = useMemo(() => PURPOSES.filter((p) => typesForPurpose(types, p.id).length > 0), [types]);

  /* ---------- เริ่มต้น: แก้ไขเอกสาร / เริ่มจากลิงก์ / เสนอกู้คืนแบบร่าง ---------- */
  useEffect(() => {
    if (started.current || !docs.data) return;
    started.current = true;
    if (editId) {
      docsApi.get(editId).then((d) => {
        if (!formOf(d.type) || d.schemaVersion !== 2) { toast('เอกสารนี้แก้ไขผ่านแบบฟอร์มไม่ได้', 'err'); void navigate(`/app/documents?doc=${Number(editId)}`); return; }
        setEditing(d);
        setDocFont(DOC_FONTS.some((f) => f.value === d.docFont) ? d.docFont : 'sarabun');
        setPurpose(d.docPurpose || 'self');
        setType(d.type);
        setFields({ ...initialFields(d.type, user), ...(d.fields || {}) });
        setParty({ ...initialParty(d.type), ...(d.partyInfo || {}) });
        setItems(d.items && d.items.length ? d.items : (formOf(d.type).items && !formOf(d.type).items.optional ? [emptyItem(d.type)] : []));
        setStep(3);
      }, (err) => { toast(err.message, 'err'); void navigate('/app/documents'); });
      return;
    }
    const wanted = params.get('type');
    if (wanted && formOf(wanted) && types.includes(wanted)) {
      const f = formOf(wanted);
      start(wanted, f.noSend ? 'self' : (params.get('purpose') || 'send'));
      const refFields = {};
      for (const [k, v] of params.entries()) if (!['type', 'purpose'].includes(k) && allFields(wanted).some((d) => d.key === k)) refFields[k] = v;
      if (Object.keys(refFields).length) {
        setFields((fs) => ({ ...fs, ...refFields }));
        Object.entries(refFields).forEach(([k, v]) => {
          const def = allFields(wanted).find((d) => d.key === k);
          if (def && def.type === 'docref') applyRef(def, v, wanted);
        });
      }
      return;
    }
    const d = loadDraft();
    if (d) setDraftOffer(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.data]);

  // บันทึกร่างอัตโนมัติ (ไม่เก็บระหว่างแก้ไขเอกสารเดิม)
  useEffect(() => {
    if (!type || step < 3 || editing) return undefined;
    const t = setTimeout(() => saveDraft({ purpose, type, fields, party, items }), 500);
    return () => clearTimeout(t);
  }, [purpose, type, fields, party, items, step, editing]);

  function start(t, p = purpose) {
    if (etaxLocked(t)) { setEtaxNotice(t); return; }
    setEtaxAck(false);
    const f = formOf(t);
    const pur = f.noSend && p === 'send' ? 'self' : (p || 'send');
    setPurpose(pur);
    setType(t);
    setFields(initialFields(t, user));
    setParty(initialParty(t));
    setItems(f.items && !f.items.optional && !f.items.pnd ? [emptyItem(t)] : []);
    setErrs({ fields: {}, party: {}, items: [] });
    setSummary([]);
    setPndHint('');
    setStep(3);
    const last = lastDocOf(docList, t, null);
    setPrefillOffer(last && f.mode !== 'pnd' ? last : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function restoreDraft() {
    const d = draftOffer;
    setDraftOffer(null);
    setPurpose(d.purpose); setType(d.type);
    setFields(d.fields); setParty(d.party); setItems(d.items);
    setStep(3);
    toast('กู้คืนข้อมูลที่กรอกค้างไว้แล้ว');
  }

  const def = type ? formOf(type) : null;
  const data = type ? collect(type, fields, party, items) : null;
  const totals = data ? computeTotals(type, data, user) : null;

  // สัญญาที่มีช่อง "จำนวนงวด": ตารางงวดการชำระเงินผูกกับจำนวนงวด (มากกว่า 1 งวด = มีแถวให้กรอกครบทุกงวด)
  const linkedInstallments = !!(def && def.items && def.items.installments
    && (def.sections || []).some((sec) => sec.fields.some((x) => x.key === 'installmentCount')));
  const autoSplit = useRef(true); // ยอดแต่ละงวดยังเป็นค่าที่แบ่งให้อัตโนมัติ (ผู้ใช้ยังไม่แก้เอง)
  function installmentRows(n, fee, prev) {
    const total = Number(fee) || 0;
    const each = Math.floor((total / n) * 100) / 100;
    return Array.from({ length: n }, (_, i) => {
      const old = prev[i] || {};
      const amount = total > 0 && autoSplit.current
        ? (i === n - 1 ? Math.round((total - each * (n - 1)) * 100) / 100 : each).toFixed(2)
        : (old.amount ?? '');
      return { ...emptyItem(type), ...old, name: old.name || `งวดที่ ${i + 1}`, amount };
    });
  }

  const setField = (key, value) => {
    setFields((f) => {
      const next = { ...f, [key]: value };
      if (key === 'incomeDesc') { const p = presetFor(value); if (p) Object.assign(next, p); }
      return next;
    });
    if (!linkedInstallments) return;
    if (key === 'installmentCount') {
      const n = Math.min(60, Math.max(0, Math.floor(Number(value) || 0)));
      autoSplit.current = true; // เปลี่ยนจำนวนงวด = แบ่งยอดใหม่ให้เท่า ๆ กัน
      if (n <= 1) setItems([]); else setItems((xs) => installmentRows(n, fields.fee, xs));
    } else if (key === 'fee' && items.length > 1 && autoSplit.current) {
      setItems((xs) => installmentRows(xs.length, value, xs));
    }
  };
  // เพิ่ม/ลบงวดในตาราง → อัปเดตช่องจำนวนงวดให้ตรงกัน
  function changeInstallmentRows(nextLen, build) {
    setItems(build);
    if (linkedInstallments) setFields((f) => ({ ...f, installmentCount: String(Math.max(1, nextLen)) }));
  }
  const setPartyField = (key, value) => setParty((p) => ({ ...p, [key]: value }));

  function blurField(fdef) {
    const msg = checkOne(type, fdef, fields[fdef.key], fields, 'f');
    setErrs((e) => ({ ...e, fields: { ...e.fields, [fdef.key]: msg } }));
  }
  function blurParty(pdef) {
    const msg = checkOne(type, pdef, party[pdef.key], fields, 'p', pdef.required);
    setErrs((e) => ({ ...e, party: { ...e.party, [pdef.key]: msg } }));
  }

  function pickContact(id) {
    const c = contactList.find((x) => String(x.id) === String(id));
    if (!c) return;
    const p = contactToParty(type, c);
    setParty((cur) => ({ ...cur, ...p }));
    setFields((f) => ({ ...f, ...partyDefaults(type, p) }));
    setErrs((e) => ({ ...e, party: {} }));
    setSaveContact(false);
    const last = lastDocOf(docList, type, p);
    if (last) setPrefillOffer(last);
    const missing = def.party.required.filter((k) => !p[k]).map((k) => partyFieldDef(type, k).label);
    toast(missing.length ? `ดึงข้อมูล ${c.name} แล้ว ยังขาด: ${missing.join(', ')}` : `ดึงข้อมูล ${c.name} จากสมุดคู่ค้าแล้ว`, missing.length ? 'err' : 'ok');
  }

  function applyPrefill(src) {
    const out = prefillFrom(type, src);
    setFields((f) => ({ ...f, ...out.fields }));
    if (out.items && out.items.length) setItems(out.items);
    if (out.party && !party.name) setParty((p) => ({ ...p, ...out.party }));
    setPrefillOffer(null);
    toast(`ดึงข้อมูลจาก ${src.docNo || 'แบบร่าง'} แล้ว วันที่และเลขอ้างอิงยังต้องกรอกใหม่`);
  }

  function applyRef(refDef, docNo, t = type) {
    const r = copyFromRef(t, refDef, docNo, docList);
    if (!r) return;
    if (r.error) { toast(r.error, 'err'); return; }
    if (r.party) setParty((p) => ({ ...p, ...Object.fromEntries(Object.entries(r.party).filter(([, v]) => v !== undefined)) }));
    if (r.fields) setFields((f) => ({ ...f, ...Object.fromEntries(Object.entries(r.fields).filter(([k, v]) => v !== undefined && !(k === 'note' && f.note))) }));
    if (r.items && r.items.length) setItems(r.items);
    toast(r.message);
  }

  /** หนังสือมอบอำนาจ: เติมข้อมูลผู้มอบ/ผู้รับมอบจากโปรไฟล์หรือสมุดคู่ค้า */
  function fillPoa(side, src) {
    const juristic = src ? (src.entityType === 'juristic' || /^0/.test(src.taxId || '')) : (user.entityType === 'juristic' || role === 'corporate');
    if (side === 'grantor') {
      setFields((f) => ({
        ...f,
        grantorType: juristic ? 'juristic' : 'individual',
        grantorName: src ? src.name : (juristic ? user.companyName : user.displayName),
        grantorIdNo: (src ? src.taxId : user.taxId) || '',
        grantorAddress: (src ? src.address : user.address) || '',
        grantorAuthName: (src ? src.authName : user.authName) || '',
        grantorPosition: (src ? src.authPosition : user.authPosition) || '',
      }));
    } else {
      setFields((f) => ({
        ...f,
        granteeName: src ? (src.contactPerson || src.name) : (juristic ? (user.authName || '') : user.displayName),
        granteeCitizenId: src ? (/^0/.test(src.taxId || '') ? '' : (src.taxId || '')) : (juristic ? '' : (user.taxId || '')),
        granteeAddress: (src ? src.address : user.address) || '',
      }));
    }
  }

  async function fetchPnd() {
    if (!fields.taxMonth || !fields.taxYearBE) { toast('กรุณาเลือกเดือนและปีภาษีก่อน', 'err'); return; }
    setPndBusy(true);
    try {
      const r = await api.get(`/api/pnd/candidates?form=${type}&month=${fields.taxMonth}&yearBE=${fields.taxYearBE}`);
      const manual = items.filter((it) => !it.sourceId && filledItems([it]).length);
      setItems([...r.rows, ...manual]);
      setPndHint(`พบ ${r.rows.length} รายการจากเอกสารในระบบ${r.draftsSkipped ? ` · ข้าม ${r.draftsSkipped} รายการที่ยังเป็นแบบร่าง (ต้องบันทึกเสร็จสิ้น/ออกเลขที่ก่อน)` : ''}${manual.length ? ` · คงรายการที่กรอกเอง ${manual.length} รายการ` : ''}`);
      toast(r.rows.length ? `ดึงข้อมูล ${r.rows.length} รายการแล้ว` : 'ไม่พบรายการหักภาษีในเดือนนี้', r.rows.length ? 'ok' : 'err');
    } catch (err) { toast(err.message, 'err'); } finally { setPndBusy(false); }
  }

  function setItem(i, col, value) {
    setItems((xs) => xs.map((r, j) => {
      if (j !== i) return r;
      const next = { ...r, [col]: value };
      if (col === 'amount' && linkedInstallments) autoSplit.current = false;
      // ภ.ง.ด.: คำนวณภาษีจากจำนวนเงิน × อัตรา ให้อัตโนมัติ
      if (def.items.pnd && (col === 'amount' || col === 'rate') && next.amount && next.rate) next.wht = (Math.round(Number(next.amount) * Number(next.rate)) / 100).toFixed(2);
      return next;
    }));
  }

  function toReview() {
    const r = validateAll(type, data, user);
    setErrs({ fields: r.fieldErrors, party: r.partyErrors, items: r.itemErrors });
    setSummary(r.errors);
    if (r.errors.length) {
      toast(`พบข้อมูลที่ต้องแก้ไข ${r.errors.length} จุด กรุณาดูข้อความสีแดงใต้ช่อง`, 'err');
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    setStep(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const [busy, submit] = useSubmit(async () => {
    if (docschema.isEtaxType(type)) {
      if (etaxLocked(type)) { setEtaxNotice(type); return; }
      if (!etaxAck) { toast('กรุณาติ๊กยืนยันว่าได้รับอนุญาตและข้อมูลครบถ้วนตามหลักเกณฑ์กรมสรรพากรก่อน', 'err'); return; }
    }
    try {
      const body = { type, docPurpose: purpose, docFont, ...data };
      const res = editing
        ? await docsApi.update(editing.id, { ...body, changeNote: 'แก้ไขข้อมูลเอกสาร' })
        : await api.post('/api/docs/create', body);
      if (saveContact && party.name) {
        const match = contactList.find((c) => (party.taxId && c.taxId === party.taxId) || c.name === party.name);
        const kinds = { brand: 'brand', agency: 'agency', influencer: 'influencer' };
        const payload = { ...data.party, kind: kinds[def.party.kinds[0]] || 'other' };
        await (match ? api.put(`/api/contacts/${Number(match.id)}`, { ...match, ...Object.fromEntries(Object.entries(data.party).filter(([, v]) => v)) }) : api.post('/api/contacts', payload)).catch(() => {});
        void qc.invalidateQueries({ queryKey: ['contacts'] });
      }
      clearDraft();
      void qc.invalidateQueries({ queryKey: ['documents'] });
      const id = editing ? editing.id : res.id;
      void qc.invalidateQueries({ queryKey: ['document', id] });
      toast(editing ? `บันทึกการแก้ไข${def.label}แล้ว` : `สร้าง${textOf(def.label, role)}เรียบร้อย (สถานะ: แบบร่าง)`);
      void navigate(`/app/documents?doc=${Number(id)}${!editing && purpose === 'send' ? '&tab=send' : ''}`);
    } catch (err) {
      const list = (err.data && err.data.errors) || [err.message];
      setSummary(list);
      toast(list[0], 'err');
    }
  });

  const profileWarn = completeness.ok === false && (
    <Alert kind="dev">
      ข้อมูลโปรไฟล์ยังไม่ครบ ({completeness.percent}%) ต้องกรอกให้ครบก่อนจึงจะออกเอกสารได้ ขาด: {(completeness.missing || []).join(', ')}{' '}
      <Link to="/app/profile" className="font-medium underline">ไปกรอกข้อมูล</Link>
    </Alert>
  );

  // เอกสารทุกประเภทต้องยืนยันตัวตนก่อน (ยกเว้นบันทึกข้อตกลงย้อนหลัง) · e-Tax ต้องได้สิทธิ์เพิ่มอีกขั้น (กล่อง etaxNotice)
  const kycText = {
    pending: 'เอกสารยืนยันตัวตนของคุณอยู่ระหว่างรอผู้ดูแลระบบตรวจสอบ เมื่ออนุมัติแล้วจะสร้างเอกสารได้ทันที',
    rejected: `การยืนยันตัวตนไม่ผ่าน${user.verifyNote ? `: ${user.verifyNote}` : ''} กรุณาแก้ไขเอกสารแล้วส่งตรวจอีกครั้ง`,
  }[user.verifyStatus] || 'บัญชีนี้ยังไม่ได้ส่งเอกสารยืนยันตัวตน ส่งเอกสารที่หน้าโปรไฟล์แล้วรอผู้ดูแลระบบอนุมัติก่อน';
  // แก้ไขเอกสารเดิม: แจ้งเตือนอย่างเดียว (เซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำตอนบันทึก/ออกเลขที่)
  const kycWarn = !kycOk && (
    <Alert kind="dev">
      {kycText}{' '}
      <Link to="/app/profile?tab=kyc" className="font-medium underline">ไปที่หน้ายืนยันตัวตน</Link>
    </Alert>
  );
  const etaxStatusText = !user.vatRegistered ? 'บัญชีนี้ยังไม่ได้ระบุว่าจดทะเบียนภาษีมูลค่าเพิ่ม (VAT)'
    : { pending: 'คำขอสิทธิ์ของคุณอยู่ระหว่างรอผู้ดูแลระบบตรวจสอบ', rejected: `คำขอสิทธิ์ไม่ผ่านการตรวจสอบ${user.etaxNote ? `: ${user.etaxNote}` : ''}` }[user.etaxStatus]
      || 'บัญชีนี้ยังไม่ได้ยื่นขอสิทธิ์ออกเอกสาร e-Tax';
  const etaxDialog = etaxNotice && (
    <ConfirmDialog
      title={`ยังออก${formOf(etaxNotice).label}ไม่ได้`}
      message={(
        <span className="block text-left">
          {etaxStatusText}
          <span className="mt-2 block">
            ใบกำกับภาษีอิเล็กทรอนิกส์และใบรับอิเล็กทรอนิกส์ออกได้เฉพาะผู้ประกอบการที่จดทะเบียน VAT
            และได้รับอนุมัติจากกรมสรรพากรแล้ว (เช่น ยื่นคำขอ ก.อ.01 หรือใช้ผู้ให้บริการนำส่งข้อมูลที่ผ่านการรับรองจาก ETDA)
            โดยต้องส่งหลักฐานให้ผู้ดูแลระบบตรวจก่อน
          </span>
          <span className="mt-2 block text-ink-soft">ระหว่างนี้ออก &quot;ใบเสร็จรับเงิน&quot; หรือ &quot;ใบแจ้งหนี้&quot; แทนได้</span>
        </span>
      )}
      confirmText="ไปยื่นขอสิทธิ์"
      cancelText="ปิด"
      onConfirm={() => { setEtaxNotice(null); void navigate('/app/profile?tab=etax'); }}
      onCancel={() => setEtaxNotice(null)}
    />
  );

  // บัญชีที่ยังไม่ผ่านการยืนยันตัวตนจากแอดมิน สร้างเอกสารไม่ได้ทุกประเภท (รวมบันทึกข้อตกลงย้อนหลัง) แสดงทางไปยืนยันตัวตนแทน
  if (!kycOk && !editId) {
    return (
      <>
        <PageHeader title="สร้างเอกสาร" subtitle="ต้องยืนยันตัวตนก่อนจึงจะสร้างเอกสารได้" />
        <Card bodyClassName="!py-10 sm:!py-12">
          <div className="mx-auto flex max-w-[34rem] flex-col items-center text-center">
            <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-orange-pale text-orange"><Icon name="shield" className="size-8" /></span>
            <h2 className="text-[1.25rem] font-medium">รอยืนยันตัวตนก่อนสร้างเอกสาร</h2>
            <p className="mt-2 text-[1rem] leading-relaxed text-ink-soft">{kycText}</p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
              ใบกำกับภาษีอิเล็กทรอนิกส์และใบรับอิเล็กทรอนิกส์ ต้องขอสิทธิ์ e-Tax แยกอีกขั้นหลังยืนยันตัวตนผ่านแล้ว
            </p>
            <Link to="/app/profile?tab=kyc" className="tf-btn tf-btn-dark mt-6">ไปที่หน้ายืนยันตัวตน</Link>
          </div>
        </Card>
      </>
    );
  }

  if (!docs.data || (editId && !editing)) {
    return <><PageHeader title={editId ? 'แก้ไขเอกสาร' : 'สร้างเอกสาร'} /><Skeleton className="h-64 w-full rounded-[24px]" /></>;
  }

  /* ---------- ขั้นตอนที่ 1–2 ---------- */
  if (step <= 2) {
    return (
      <>
        <PageHeader
          title={step === 1 ? 'สร้างเอกสาร' : 'เลือกประเภทเอกสาร'}
          back={step === 2 ? <BackButton onClick={() => setStep(1)}>ย้อนกลับ: เลือกจุดประสงค์</BackButton> : null}
          subtitle={step === 1 ? 'เอกสารที่คุณเป็นผู้ออกให้คู่ค้า ระบบออกเลขที่อัตโนมัติ เลือกจุดประสงค์ก่อนเพื่อให้ระบบแนะนำขั้นตอนได้ถูกต้อง' : `จุดประสงค์: ${PURPOSE_LABEL[purpose]}`}
        />
        <Card className="mb-5" bodyClassName="!py-6 sm:!py-7"><StepBar size="lg" label="ขั้นตอนการสร้างเอกสาร" steps={STEPS} current={step} /></Card>
        {profileWarn}
        {kycWarn}
        {etaxDialog}
        {draftOffer && step === 1 && (
          <div className="tf-reveal mb-5 flex flex-wrap items-center gap-3 rounded-[20px] bg-white p-4 ring-1 ring-orange-soft">
            <span className="min-w-[220px] flex-1 text-[0.96875rem]">
              พบข้อมูลที่ยังกรอกไม่เสร็จ <b className="font-medium">{formOf(draftOffer.type).label}</b> <span className="text-ink-soft">· {new Date(draftOffer.at).toLocaleString('th-TH')}</span>
            </span>
            <Button variant="dark" onClick={restoreDraft}>กู้คืน</Button>
            {/* ทิ้งแบบร่างลบข้อมูลที่กรอกค้างไว้ถาวร: ชี้แล้วเป็นสีแดงเตือน และถามยืนยันก่อนลบทุกครั้ง */}
            <Button variant="soft" className="hover:!bg-danger hover:!text-white" onClick={() => setConfirmDiscard(true)}>
              ทิ้ง
            </Button>
          </div>
        )}

        {confirmDiscard && draftOffer && (
          <ConfirmDialog
            danger
            title="ทิ้งข้อมูลที่กรอกค้างไว้?"
            message={`ข้อมูล${formOf(draftOffer.type).label}ที่ยังกรอกไม่เสร็จจะถูกลบถาวร กู้คืนไม่ได้อีก`}
            confirmText="ทิ้งข้อมูล"
            cancelText="เก็บไว้"
            onConfirm={() => { clearDraft(); setDraftOffer(null); setConfirmDiscard(false); }}
            onCancel={() => setConfirmDiscard(false)}
          />
        )}

        {step === 1 && (
          <div className={cx('grid gap-4', availablePurposes.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
            {availablePurposes.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPurpose(p.id); setStep(2); }}
                className="tf-fade-up group flex cursor-pointer flex-col items-start rounded-[24px] bg-white p-6 text-left shadow-[0_1px_2px_rgba(24,24,27,0.03)] ring-1 ring-transparent transition-all duration-300 hover:-translate-y-1 hover:ring-orange hover:shadow-[0_18px_40px_-22px_rgba(232,90,0,0.45)]"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="mb-5 block text-ink"><PurposeArt id={p.id} /></span>
                <b className="block text-[1.125rem] font-medium">{p.title}</b>
                <small className="mt-1.5 block text-[0.96875rem] leading-relaxed text-ink-soft">{p.detail}</small>
                {/* ตัวอย่างประเภทเอกสารที่จะเห็นในขั้นถัดไป บอกล่วงหน้าว่าควรเลือกข้อนี้หรือไม่ */}
                <span className="mt-auto flex flex-wrap gap-1.5 pt-4">
                  {typesForPurpose(types, p.id).slice(0, 4).map((t) => (
                    <span key={t} className="rounded-full bg-tile px-2.5 py-0.5 text-[0.8125rem] text-ink-soft">{formOf(t).short || textOf(formOf(t).label, role)}</span>
                  ))}
                  {typesForPurpose(types, p.id).length > 4 && <span className="px-1 py-0.5 text-[0.8125rem] text-ink-soft">+{typesForPurpose(types, p.id).length - 4}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            {!purposeTypes.length && (
              <p className="rounded-[20px] bg-white p-6 text-center text-[0.96875rem] text-ink-soft">ยังไม่มีประเภทเอกสารที่บัญชีนี้สร้างได้สำหรับจุดประสงค์นี้ ลองย้อนกลับไปเลือกจุดประสงค์อื่น</p>
            )}
            {GROUPS.map(([group, title]) => {
              const list = purposeTypes.filter((t) => formOf(t).group === group);
              if (!list.length) return null;
              return (
                <section key={group}>
                  {/* หัวกลุ่ม: ชื่อ + จำนวนประเภท + เส้นคั่น */}
                  <div className="mb-3 flex items-center gap-3">
                    <h2 className="text-[1.125rem] font-medium">{title}</h2>
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[0.8125rem] font-medium text-ink-soft ring-1 ring-line">{list.length} ประเภท</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((t, i) => {
                      const f = formOf(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => start(t)}
                          className="tf-anim-host tf-fade-up group flex min-h-[6.5rem] cursor-pointer items-center gap-4 rounded-[20px] bg-white p-4 text-left ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-22px_rgba(255,106,0,0.55)] hover:ring-orange"
                          style={{ animationDelay: `${i * 40}ms` }}
                        >
                          {/* ไอคอนปึกเอกสาร (เคลื่อนไหวตอนชี้) บนพื้นกรอบอ่อน */}
                          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-orange-pale/60 transition-colors group-hover:bg-orange-pale">
                            <DocArt group={group} className="size-12" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <b className="text-[1.0625rem] font-semibold leading-snug">{textOf(f.label, role)}</b>
                              {f.prefix && <span className="rounded-md bg-tile px-1.5 py-0.5 font-mono text-[0.71875rem] font-semibold tracking-wide text-ink-soft">{f.prefix}</span>}
                            </span>
                            <small className="mt-1 block text-[0.90625rem] leading-relaxed text-ink-soft">{textOf(f.desc, role)}</small>
                            {f.noSend && <span className="mt-1.5 inline-block rounded-full bg-tile px-2.5 py-0.5 text-[0.8125rem] text-ink-soft">จัดเตรียมข้อมูลภายใน</span>}
                            {docschema.isEtaxType(t) && (etaxLocked(t)
                              ? <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-0.5 text-[0.8125rem] font-medium text-danger"><Icon name="shield" className="size-3.5" />ต้องได้รับอนุญาตจากกรมสรรพากร</span>
                              : <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-[0.8125rem] font-medium text-ok"><Icon name="check" className="size-3.5" />ได้รับสิทธิ์ e-Tax แล้ว</span>)}
                          </span>
                          {/* ลูกศรไปต่อ: โผล่และเลื่อนเข้าเมื่อชี้ */}
                          <span aria-hidden="true" className="flex size-8 shrink-0 -translate-x-1 items-center justify-center rounded-full bg-orange text-white opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                            <Icon name="arrow" className="size-4" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </>
    );
  }

  const title = `${editing ? 'แก้ไข' : ''}${textOf(def.label, role)}`;
  // เอกสารที่มีหัก ณ ที่จ่าย (สัญญา): รวมเป็นเงิน → VAT → ยอดรวมทั้งสิ้น → หัก ณ ที่จ่าย → ยอดชำระสุทธิ (ตัวเด่น)
  // (เดิมแสดงบรรทัดหักภาษีแล้วแต่ยอดตัวเด่นยังเป็นยอดก่อนหัก ทำให้ดูเหมือนคำนวณผิด)
  const netAfterWht = totals && totals.wht > 0 && !['wht', 'pnd', 'voucher'].includes(def.mode);
  const moneyLines = totals && (netAfterWht ? (
    <>
      <Line k="รวมเป็นเงิน" v={thb(totals.subtotal || totals.base)} />
      {totals.vat ? <Line k="ภาษีมูลค่าเพิ่ม 7%" v={thb(totals.vat)} /> : null}
      {totals.vat ? <Line k="ยอดรวมทั้งสิ้น" v={thb(totals.total)} /> : null}
      <Line k={`หักภาษี ณ ที่จ่าย${totals.whtRate ? ` ${totals.whtRate}%` : ''}${totals.vat ? ' (จากยอดก่อน VAT)' : ''}`} v={thb(totals.wht)} minus />
      <Line strong k="ยอดชำระสุทธิ" v={thb(totals.net)} />
    </>
  ) : (
    <>
      {totals.subtotal && def.mode !== 'wht' ? <Line k="รวมเป็นเงิน" v={thb(totals.subtotal)} /> : null}
      {(totals.lineDiscount || 0) + (totals.billDiscount || 0) > 0 && <Line k={fields.billDiscountNote && totals.billDiscount > 0 ? `ส่วนลด (${fields.billDiscountNote})` : 'ส่วนลด'} v={thb(totals.lineDiscount + totals.billDiscount)} minus />}
      {totals.vat ? <Line k="ภาษีมูลค่าเพิ่ม 7%" v={thb(totals.vat)} /> : null}
      {totals.wht ? <Line k={`ภาษีหัก ณ ที่จ่าย${totals.whtRate ? ` ${totals.whtRate}%` : ''}`} v={thb(totals.wht)} minus={def.mode !== 'wht'} /> : null}
      {def.mode === 'pnd' && totals.surcharge ? <Line k="เงินเพิ่ม" v={thb(totals.surcharge)} /> : null}
      <Line strong k={def.mode === 'wht' ? 'จำนวนเงินที่จ่าย' : def.mode === 'pnd' ? 'ภาษีที่นำส่งรวมเงินเพิ่ม' : def.mode === 'voucher' ? 'คงเหลือสุทธิ (จ่ายจริง)' : 'ยอดรวมทั้งสิ้น'}
        v={thb(def.mode === 'wht' ? totals.income : def.mode === 'voucher' ? totals.net : totals.total)} />
    </>
  ));
  const hasMoney = totals && (totals.total || totals.wht || totals.income || totals.base);

  /* ---------- ขั้นตอนที่ 4: ตรวจทาน ---------- */
  if (step === 4) {
    const shown = allFields(type).filter((d) => visible(d, fields));
    const fmt = (d, v) => {
      if (v === '' || v == null || (Array.isArray(v) && !v.length) || v === false) return null;
      if (d.type === 'date') return docschema.thaiDate(v);
      if (d.type === 'money') return thb(v);
      if (d.type === 'checkbox') return '✓';
      if (d.type === 'select' || d.type === 'radio') return ((d.options || []).find((o) => String(o.value) === String(v)) || {}).label || String(v);
      if (d.type === 'checks') return v.map((x) => ((d.options || []).find((o) => o.value === x) || {}).label || x).join(', ');
      return String(v).length > 140 ? `${String(v).slice(0, 140)}…` : String(v);
    };
    const Row = ({ k, v }) => (v == null || v === '' ? null : (
      <p className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[1rem] last:border-0">
        <span className="text-ink-soft">{k}</span><b className="max-w-[62%] text-right font-medium">{v}</b>
      </p>
    ));
    return (
      <>
        <PageHeader title={title} subtitle="ตรวจสอบข้อมูลก่อนยืนยัน" back={<BackButton onClick={() => setStep(3)}>กลับไปแก้ไข</BackButton>} />
        <Card className="mb-5" bodyClassName="!py-6 sm:!py-7"><StepBar size="lg" label="ขั้นตอนการสร้างเอกสาร" steps={STEPS} current={4} /></Card>
        {kycWarn}
        {etaxDialog}
        {summary.length > 0 && <Alert><b className="font-medium">ยังบันทึกไม่ได้</b><ul className="mt-1 list-disc pl-5">{summary.map((m) => <li key={m}>{m}</li>)}</ul></Alert>}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card>
            <Row k="ประเภทเอกสาร" v={def.label} />
            <Row k="จุดประสงค์" v={PURPOSE_LABEL[purpose]} />
            {def.party && (
              <>
                <h3 className="mb-1 mt-5 text-[0.96875rem] font-medium text-ink-soft">{textOf(def.party.title, role)}</h3>
                {def.party.keys.map((k) => <Row key={k} k={partyFieldDef(type, k).label} v={party[k]} />)}
              </>
            )}
            <h3 className="mb-1 mt-5 text-[0.96875rem] font-medium text-ink-soft">ข้อมูลเอกสาร</h3>
            {shown.map((d) => <Row key={d.key} k={d.label} v={fmt(d, fields[d.key])} />)}
            {def.items && <p className="mt-5 text-[0.96875rem] font-medium text-ink-soft">{textOf(def.items.title, role)} ({filledItems(items).length} รายการ)</p>}
          </Card>
          <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            {hasMoney ? <Card>{moneyLines}</Card> : null}
            {/* ฟอนต์ของเอกสารฉบับนี้ (ค่าเริ่มต้นจากเมนู Aa) แสดงเฉพาะฟอนต์ที่เซิร์ฟเวอร์มีไฟล์ */}
            <Card>
              <b className="mb-2 block text-[0.96875rem] font-semibold">ฟอนต์ในเอกสาร</b>
              <div role="radiogroup" aria-label="ฟอนต์ในเอกสาร" className="grid grid-cols-2 gap-2">
                {docFonts.map((f) => (
                  <button key={f.value} type="button" role="radio" aria-checked={docFont === f.value} onClick={() => setDocFont(f.value)}
                    className={cx('cursor-pointer rounded-2xl px-3 py-2.5 text-left ring-1 transition-colors', docFont === f.value ? 'bg-orange-pale ring-orange' : 'ring-line hover:bg-tile')}>
                    <b className="block text-[0.9375rem] font-semibold" style={{ fontFamily: f.stack }}>{f.label}</b>
                    <small className="block truncate text-[0.8125rem] text-ink-soft" style={{ fontFamily: f.stack }}>ใบแจ้งหนี้ ฿1,234.50</small>
                  </button>
                ))}
              </div>
            </Card>
            <p className="rounded-[20px] bg-orange-pale px-4 py-3 text-[0.96875rem] leading-relaxed">
              {editing ? 'บันทึกแล้วระบบเก็บเป็นเวอร์ชันใหม่ในประวัติเอกสาร'
                : purpose === 'send' ? 'เมื่อสร้างแล้ว ระบบเปิดแท็บ "ส่งเอกสาร" ลงนามฝั่งคุณก่อน แล้วส่งขอลายเซ็นคู่ค้า'
                  : 'สร้างเป็นแบบร่าง ตรวจทาน/เปิด PDF แล้วกด "บันทึกเสร็จสิ้น" เพื่อออกเลขที่เอกสาร'}
            </p>
            {/* e-Tax: ตรวจสิทธิ์อีกครั้ง และให้ผู้ใช้ยืนยันความถูกต้องก่อนออกทุกครั้ง (เซิร์ฟเวอร์ตรวจสิทธิ์ซ้ำตอนสร้างและตอนออกเลขที่) */}
            {docschema.isEtaxType(type) && (
              <div className={cx('rounded-[20px] px-4 py-3 text-[0.9375rem] leading-relaxed ring-1', etaxOk ? 'bg-white ring-line' : 'bg-danger-soft text-danger ring-danger')}>
                {etaxOk ? (
                  <label className="tf-choice items-start">
                    <input type="checkbox" checked={etaxAck} onChange={(e) => setEtaxAck(e.target.checked)} />
                    <span>
                      ข้าพเจ้ายืนยันว่ากิจการได้รับอนุมัติจากกรมสรรพากรให้จัดทำ{def.label}
                      และตรวจแล้วว่าข้อมูลผู้ขาย ผู้ซื้อ รายการสินค้า/บริการ และจำนวนภาษีถูกต้องครบถ้วนตามหลักเกณฑ์ของกรมสรรพากร
                    </span>
                  </label>
                ) : (
                  <>
                    <b className="block font-medium">ยังออกเอกสารนี้ไม่ได้</b>
                    {etaxStatusText} ต้องได้รับอนุมัติจากกรมสรรพากรและผู้ดูแลระบบตรวจหลักฐานแล้วก่อน{' '}
                    <Link to="/app/profile?tab=etax" className="font-medium underline">ไปยื่นขอสิทธิ์</Link>
                  </>
                )}
              </div>
            )}
            <StepActions
              back={<Button variant="soft" onClick={() => setStep(3)}>← กลับไปแก้ไข</Button>}
              next={<Button variant="dark" loading={busy} onClick={submit} disabled={docschema.isEtaxType(type) && (!etaxOk || !etaxAck)}>{editing ? 'ยืนยันบันทึกการแก้ไข' : 'ยืนยันสร้างเอกสาร'}</Button>}
            />
          </div>
        </div>
      </>
    );
  }

  /* ---------- ตารางรายการ: ช่องกรอกหนึ่งช่อง / ปุ่มลบ / ยอดต่อรายการ (ใช้ร่วมกันทั้งแบบตารางและแบบการ์ด) ---------- */
  const lineAmount = (row) => (Number(row.qty) || 0) * (Number(row.price) || 0) - (Number(row.discount) || 0);
  function itemCell(row, i, c) {
    const locked = !!row.sourceId;
    // ข้อผิดพลาดจากการตรวจผูกกับลำดับ "แถวที่กรอกแล้ว" · แถวใหม่ที่ยังว่างไม่ใช่แถวนั้น จึงต้องไม่รับข้อผิดพลาดของแถวก่อนหน้ามาแสดง
    const rowIndex = filledItems([row]).length ? filledItems(items.slice(0, i + 1)).length - 1 : -1;
    const cdef = itemColDef(c);
    const err = (errs.items || []).find((x) => x.row === rowIndex && x.col === c);
    const common = {
      'aria-label': cdef.label,
      'aria-invalid': err ? 'true' : 'false',
      readOnly: locked,
      placeholder: locked ? undefined : cdef.placeholder,
      className: cx('tf-input min-w-0 !px-2.5 !py-2 text-[0.9375rem]', locked && 'opacity-70'),
      value: row[c] == null ? '' : row[c],
      onChange: (e) => setItem(i, c, e.target.value),
    };
    // หน่วยนับ: เลือกจากรายการที่ใช้บ่อย หรือพิมพ์เองได้ แต่ตัดตัวเลขทิ้งทันที (หน่วยต้องเป็นคำ)
    if (c === 'unit') {
      return (
        <>
          <Combobox
            aria-label={common['aria-label']}
            aria-invalid={common['aria-invalid']}
            readOnly={locked}
            className="!px-2.5 !py-2 text-[0.9375rem]"
            value={common.value}
            suggestions={UNIT_SUGGESTIONS}
            placeholder="เลือกหรือพิมพ์ เช่น ชิ้น งาน"
            emptyText="ไม่มีในรายการ พิมพ์หน่วยเองได้ (ห้ามเป็นตัวเลข)"
            onChange={(e) => setItem(i, c, String(e.target.value).replace(/[0-9๐-๙]/g, '').slice(0, 30))}
          />
          {err && <span className="mt-1 block text-[0.84375rem] font-medium text-danger">{err.msg.replace(/^"[^"]+" /, '')}</span>}
        </>
      );
    }
    return (
      <>
        {cdef.type === 'select' && !locked
          ? <Select aria-label={common['aria-label']} aria-invalid={common['aria-invalid']} size="sm" className="!px-2.5" value={common.value} options={cdef.options} onChange={common.onChange} />
          : cdef.type === 'date'
            ? <DatePicker aria-label={common['aria-label']} aria-invalid={common['aria-invalid']} size="sm" readOnly={locked} className={cx(locked && 'opacity-70')} value={common.value} onChange={common.onChange} />
            : <input {...common} type={(cdef.type === 'number' || cdef.type === 'money') ? 'number' : 'text'} step={cdef.type === 'money' ? '0.25' : cdef.type === 'number' ? 'any' : undefined} inputMode={cdef.type === 'money' ? 'decimal' : undefined} min={cdef.type === 'money' || cdef.type === 'number' ? '0' : undefined} />}
        {err && <span className="mt-1 block text-[0.84375rem] font-medium text-danger">{err.msg.replace(/^"[^"]+" /, '')}</span>}
      </>
    );
  }
  function itemRemove(row, i) {
    return (
      <>
        {row.sourceId && <small className="block text-[0.78125rem] text-ink-soft" title={`ดึงจาก ${row.sourceNo}`}>{row.sourceNo}</small>}
        <button type="button" aria-label={`ลบรายการที่ ${i + 1}`} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-danger-soft hover:text-danger" onClick={() => changeInstallmentRows(items.length - 1, (xs) => { const rest = xs.filter((_, j) => j !== i); return linkedInstallments && rest.length ? installmentRows(rest.length, fields.fee, rest.map((r, j) => (/^งวดที่ \d+$/.test(r.name || '') ? { ...r, name: `งวดที่ ${j + 1}` } : r))) : rest; })}>
          <Icon name="close" className="size-4" />
        </button>
      </>
    );
  }
  // แสดงเป็นตารางเมื่อความกว้างการ์ดพอสำหรับทุกคอลัมน์ ไม่งั้นเป็นการ์ดทีละรายการ
  const itemsAsTable = !!(def && def.items) && itemsBoxPx > 0
    && itemsBoxPx / (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) >= itemTableMinRem(def.items.cols, def.mode === 'priced');

  /* ---------- ขั้นตอนที่ 3: กรอกข้อมูล ---------- */
  const juristic = user.entityType === 'juristic' || role === 'corporate';
  const issuerName = (juristic ? user.companyName : user.displayName) || user.displayName;
  // VAT ขึ้นกับว่าผู้ขาย (บัญชีนี้) จดทะเบียนหรือไม่ ไม่ใช่ตัวเลือก: จด = คิด 7% เสมอ · ไม่ได้จด = ไม่คิด
  const vatStatus = (key) => (user.vatRegistered ? (
    <div key={key} className="tf-choice mb-4 !cursor-default sm:col-span-2" aria-live="polite">
      <input type="checkbox" checked readOnly disabled aria-label="คิดภาษีมูลค่าเพิ่ม 7%" />
      <span className="text-[0.96875rem]">คิดภาษีมูลค่าเพิ่ม 7% <span className="text-ink-soft">· บังคับ เพราะบัญชีนี้จดทะเบียน VAT</span></span>
    </div>
  ) : (
    <p key={key} className="mb-4 rounded-2xl bg-tile px-4 py-3 text-[0.9375rem] text-ink-soft sm:col-span-2">บัญชีนี้ยังไม่ได้จดทะเบียน VAT เอกสารจึงไม่คิดภาษีมูลค่าเพิ่ม</p>
  ));
  const field = (d) => (d.vatGate ? vatStatus(d.key) : (
    <SchemaField key={d.key} def={d} value={fields[d.key]} error={errs.fields[d.key]} docs={docList} suggest={suggestFor[d.key]}
      onChange={(v) => setField(d.key, v)} onBlur={() => blurField(d)} onRefPicked={(rd, no) => applyRef(rd, no)} />
  ));
  const section = (sec) => (
    <Section
      key={sec.title}
      title={textOf(sec.title, role)}
      tools={sec.fill && (
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" className="!py-2 text-[0.9375rem]" onClick={() => fillPoa(sec.fill)}>ใช้ข้อมูลของฉัน</Button>
          <Select aria-label="เลือกจากสมุดคู่ค้า" size="sm" className="!w-auto min-w-[200px]" value="" placeholder="เลือกจากสมุดคู่ค้า…"
            options={contactList.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(e) => fillPoa(sec.fill, contactList.find((c) => String(c.id) === e.target.value))} />
        </div>
      )}
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        {sec.fields.filter((d) => visible(d, fields)).flatMap((d) => {
          const el = field(d);
          // ตารางงวดการชำระเงินโผล่ต่อท้ายช่อง "จำนวนงวด" ทันทีเมื่อเลือกมากกว่า 1 งวด
          if (d.key !== 'installmentCount' || !linkedInstallments || !items.length) return [el];
          return [el, (
            <div key="installments" className="tf-reveal mb-5 rounded-2xl p-4 ring-1 ring-line sm:col-span-2 sm:p-5">
              <b className="mb-1 block text-[1rem] font-semibold">งวดการชำระเงิน ({items.length} งวด)</b>
              {itemsBody()}
            </div>
          )];
        })}
      </div>
    </Section>
  );

  // เนื้อหาตารางรายการ/งวด ใช้ทั้งในการ์ดรายการปกติ และในช่องงวดการชำระเงินใต้ "จำนวนงวด"
  const itemsBody = () => (
    <>
      {def.items.pnd && (
        <p className="mb-3 text-[0.9375rem] text-ink-soft">
          {pndHint || 'เลือกเดือน/ปีภาษีด้านบน แล้วกดดึงข้อมูล รายการที่ดึงจากระบบใช้ตัวเลขจากเอกสารต้นทางเสมอ เพิ่มรายการที่จ่ายนอกระบบได้เอง'}
        </p>
      )}
      {linkedInstallments && (() => {
        const sum = items.reduce((t, r) => t + (Number(r.amount) || 0), 0);
        const fee = Number(fields.fee) || 0;
        const ok = fee > 0 && Math.abs(sum - fee) < 0.01;
        return (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[0.9375rem]">
            <span className="text-ink-soft">แบ่งยอดตามจำนวนงวดให้แล้ว แก้ยอด วันครบกำหนด หรือรายละเอียดของแต่ละงวดได้</span>
            <span className={cx('rounded-full px-3 py-1 font-medium tabular-nums', ok ? 'bg-[#E3F5EC] text-[#1F7A4D]' : 'bg-[#FFF4DB] text-[#8A5A00]')}>
              รวม ฿{baht(sum)}{fee > 0 ? ` / ค่าจ้าง ฿${baht(fee)}` : ''}{ok ? ' ✓' : ''}
            </span>
          </div>
        );
      })()}
      {/* ตารางเมื่อการ์ดกว้างพอ · การ์ดแคบ (เช่นจอ laptop ที่แบ่งสองคอลัมน์) แสดงทีละรายการเป็นการ์ดซ้อนกัน ไม่ล้นขอบ */}
      <div ref={itemsBox}>
        {itemsAsTable ? (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[0.96875rem]" style={{ minWidth: `${itemTableMinRem(def.items.cols, def.mode === 'priced')}rem` }}>
              <colgroup>
                <col style={{ width: '2rem' }} />
                {def.items.cols.map((c) => { const w = itemColRem(itemColDef(c)); return <col key={c} style={w ? { width: `${w}rem` } : undefined} />; })}
                {def.mode === 'priced' && <col style={{ width: '7rem' }} />}
                <col style={{ width: '2.5rem' }} />
              </colgroup>
              <thead>
                <tr className="text-left text-[0.90625rem] text-ink-soft">
                  <th className="pb-2 font-normal">#</th>
                  {def.items.cols.map((c) => <th key={c} className="truncate pb-2 pr-2 font-normal" title={itemColDef(c).label}>{itemColDef(c).label}</th>)}
                  {def.mode === 'priced' && <th className="pb-2 text-right font-normal">จำนวนเงิน</th>}
                  <th><span className="sr-only">ลบ</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={i} className="tf-reveal border-t border-line">
                    <td className="py-2 text-ink-soft">{i + 1}</td>
                    {def.items.cols.map((c) => <td key={c} className="py-2 pr-2 align-top">{itemCell(row, i, c)}</td>)}
                    {def.mode === 'priced' && <td className="py-2 text-right align-middle font-mono tabular-nums">{baht(lineAmount(row))}</td>}
                    <td className="py-2 text-right align-middle">{itemRemove(row, i)}</td>
                  </tr>
                ))}
                {!items.length && (
                  <tr><td colSpan={def.items.cols.length + 3} className="py-6 text-center text-[0.96875rem] text-ink-soft">ยังไม่มีรายการ</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((row, i) => (
              <div key={i} className="tf-reveal rounded-2xl bg-tile/60 p-3 ring-1 ring-line">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <b className="text-[0.9375rem] font-medium">รายการที่ {i + 1}</b>
                  <span className="flex items-center gap-2">
                    {def.mode === 'priced' && <span className="font-mono text-[0.9375rem] tabular-nums">฿{baht(lineAmount(row))}</span>}
                    {itemRemove(row, i)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
                  {def.items.cols.map((c) => (
                    <label key={c} className={cx('block min-w-0', itemColDef(c).width === 'wide' && 'col-span-2')}>
                      <span className="mb-1 block text-[0.84375rem] text-ink-soft">{itemColDef(c).label}</span>
                      {itemCell(row, i, c)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!items.length && <p className="py-6 text-center text-[0.96875rem] text-ink-soft">ยังไม่มีรายการ</p>}
          </div>
        )}
      </div>
      {/* แถวท้ายตาราง: ปุ่มเพิ่มรายการ · ส่วนลดท้ายบิล · ตัวเลือก VAT สูงเท่ากัน (h-12) และเรียงแนวเดียวกัน */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="soft" className="!h-12 !rounded-full !py-0 text-[0.9375rem]" onClick={() => (linkedInstallments
          ? changeInstallmentRows(Math.max(2, items.length + 1), (xs) => installmentRows(Math.max(2, xs.length + 1), fields.fee, xs))
          : setItems((xs) => [...xs, emptyItem(type)]))}><Icon name="plus" className="size-4" />{linkedInstallments ? 'เพิ่มงวด' : 'เพิ่มรายการ'}</Button>
        {def.items.billDiscount && (
          <label htmlFor="cr-billDiscount" className="flex h-12 cursor-text items-center gap-2 rounded-full bg-field pl-4 pr-4 ring-[1.5px] ring-transparent transition-shadow focus-within:bg-surface focus-within:ring-orange focus-within:shadow-[0_0_0_4px_var(--color-orange-pale)]">
            <span className="whitespace-nowrap text-[0.90625rem] text-ink-soft">ส่วนลดท้ายบิล</span>
            <input
              id="cr-billDiscount"
              type="number"
              min="0"
              step="0.25"
              inputMode="decimal"
              placeholder="0.00"
              value={fields.billDiscount == null ? '' : fields.billDiscount}
              onChange={(e) => setField('billDiscount', e.target.value)}
              className="w-24 min-w-0 bg-transparent text-right text-[0.96875rem] tabular-nums outline-none [appearance:textfield] placeholder:text-[#A1A1AA] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[0.90625rem] text-ink-soft">บาท</span>
          </label>
        )}
        {/* รายละเอียดส่วนลด: โผล่เมื่อใส่ยอดส่วนลดแล้ว พิมพ์ต่อท้ายบรรทัดส่วนลดในเอกสาร เช่น "หักส่วนลดท้ายบิล (ลูกค้าประจำ 5%)" */}
        {def.items.billDiscount && Number(fields.billDiscount) > 0 && (
          <label htmlFor="cr-billDiscountNote" className="tf-reveal flex h-12 min-w-[16rem] flex-1 cursor-text items-center gap-2 rounded-full bg-field pl-4 pr-4 ring-[1.5px] ring-transparent transition-shadow focus-within:bg-surface focus-within:ring-orange focus-within:shadow-[0_0_0_4px_var(--color-orange-pale)]">
            <span className="whitespace-nowrap text-[0.90625rem] text-ink-soft">รายละเอียดส่วนลด</span>
            <input
              id="cr-billDiscountNote"
              type="text"
              maxLength={60}
              autoComplete="off"
              placeholder="เช่น ลูกค้าประจำ 5%, โปรโมชันเปิดร้าน"
              value={fields.billDiscountNote || ''}
              onChange={(e) => setField('billDiscountNote', e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[0.96875rem] outline-none placeholder:text-[#A1A1AA]"
            />
          </label>
        )}
        {def.items.vat === 'issuer' && user.vatRegistered && (
          <span className="tf-choice !h-12 !cursor-default !items-center !rounded-full !py-0 !pl-3.5 !pr-5">
            <input type="checkbox" checked readOnly disabled aria-label="คิดภาษีมูลค่าเพิ่ม 7%" />
            <span className="whitespace-nowrap text-[0.9375rem]">คิดภาษีมูลค่าเพิ่ม 7% <span className="text-ink-soft">· บังคับ (จดทะเบียน VAT)</span></span>
          </span>
        )}
        {def.items.vat === 'any' && (
          <label className="tf-choice !h-12 !items-center !rounded-full !py-0 !pl-3.5 !pr-5">
            <input type="checkbox" id="cr-includeVat" checked={!!fields.includeVat} onChange={(e) => setField('includeVat', e.target.checked)} />
            <span className="whitespace-nowrap text-[0.9375rem]">{def.items.vatLabel || 'คิดภาษีมูลค่าเพิ่ม 7%'}</span>
          </label>
        )}
        {def.items.vat === 'issuer' && !user.vatRegistered && <span className="text-[0.90625rem] text-ink-soft">บัญชีนี้ยังไม่ได้จดทะเบียน VAT จึงไม่คิดภาษีมูลค่าเพิ่ม</span>}
      </div>
      {def.items.billDiscount && (() => {
        // เตือนทันทีที่พิมพ์ ไม่ต้องรอกดตรวจสอบ: ส่วนลดท้ายบิลต้องน้อยกว่ายอดหลังหักส่วนลดรายการ (กติกาเดียวกับ docschema.validateDoc)
        const afterLine = Math.round(items.reduce((s, r) => s + lineAmount(r), 0) * 100) / 100;
        const bd = Number(fields.billDiscount) || 0;
        const msg = bd > 0 && bd >= afterLine
          ? `"ส่วนลดท้ายบิล" ต้องน้อยกว่ายอดรวมหลังหักส่วนลดรายการ (${afterLine.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท)`
          : errs.fields.billDiscount;
        return msg ? <p role="alert" className="mt-2 text-[0.90625rem] font-medium text-danger">{msg}</p> : null;
      })()}
    </>
  );

  return (
    <>
      <PageHeader
        title={title}
        subtitle={editing ? `เลขที่ ${editing.docNo || 'ฉบับร่าง'} · การแก้ไขเอกสารที่ลงนามแล้วจะล้างลายเซ็นเดิม` : 'เลขที่เอกสารออกอัตโนมัติเมื่อส่งหรือบันทึกเสร็จสิ้น'}
        back={editing
          ? <BackButton onClick={() => navigate(`/app/documents?doc=${Number(editing.id)}`)}>ยกเลิกการแก้ไข</BackButton>
          : <BackButton onClick={() => { clearDraft(); setStep(2); }}>ย้อนกลับ: เลือกประเภทเอกสาร</BackButton>}
      />
      <Card className="mb-5" bodyClassName="!py-6 sm:!py-7"><StepBar size="lg" label="ขั้นตอนการสร้างเอกสาร" steps={STEPS} current={3} /></Card>
      {kycWarn}
      {etaxDialog}
      {docschema.isEtaxType(type) && (
        <Alert kind="info">
          <b className="font-medium">{def.label}เป็นเอกสารตามรูปแบบของกรมสรรพากร</b> ระบบสร้างเป็นตัวอย่างการออกเอกสารเท่านั้น ไม่ได้นำส่งข้อมูลให้กรมสรรพากร
          ต้องกรอกรายการให้ครบถ้วนตามมาตรา 86/4 แห่งประมวลรัษฎากร และออกได้เฉพาะเมื่อได้รับอนุมัติจากกรมสรรพากรแล้ว
        </Alert>
      )}
      {def.hint && <Alert kind="info">{textOf(def.hint, role)}</Alert>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {prefillOffer && (
            <div className="tf-reveal flex flex-wrap items-center gap-3 rounded-[20px] bg-orange-pale p-4">
              <span className="min-w-[200px] flex-1 text-[0.96875rem]">
                พบ{textOf(def.label, role)}ล่าสุด ({prefillOffer.docNo || 'แบบร่าง'}) ดึงข้อมูลที่เคยกรอกมาใช้ต่อได้ เพื่อลดการกรอกข้อมูลซ้ำ
              </span>
              <Button variant="dark" className="!py-2 text-[0.9375rem]" onClick={() => applyPrefill(prefillOffer)}>ดึงข้อมูลที่เคยกรอก</Button>
              <Button variant="soft" className="!bg-white !py-2 text-[0.9375rem]" onClick={() => setPrefillOffer(null)}>ไม่ใช้</Button>
            </div>
          )}

          {def.meta && <Section title="ข้อมูลเอกสาร"><div className="grid gap-x-4 sm:grid-cols-2">{def.meta.filter((d) => visible(d, fields)).map(field)}</div></Section>}

          {def.party && (
            <Section
              title={textOf(def.party.title, role)}
              tools={(
                <Select aria-label="เลือกคู่ค้าจากสมุดคู่ค้า" size="sm" className="!w-auto min-w-[220px] max-w-[280px]" value="" placeholder="เลือกจากสมุดคู่ค้า"
                  options={contactList.map((c) => ({ value: c.id, label: `${c.name}${c.taxId ? ` · ${c.taxId}` : ''}` }))}
                  onChange={(e) => pickContact(e.target.value)} />
              )}
            >
              <ContactLookup className="mb-4" />
              <div className="grid gap-x-4 sm:grid-cols-2">
                {def.party.keys.map((k) => {
                  const pdef = partyFieldDef(type, k);
                  return (
                    <SchemaField key={k} def={{ ...pdef, key: `p-${k}` }} value={party[k]} error={errs.party[k]} docs={docList}
                      onChange={(v) => { setPartyField(k, v); if (k === 'name' && v && !contactList.some((c) => c.name.trim() === v.trim())) setSaveContact(true); }}
                      onBlur={() => blurParty(pdef)} />
                  );
                })}
              </div>
              <label className="tf-choice mt-1">
                <input type="checkbox" checked={saveContact} onChange={(e) => setSaveContact(e.target.checked)} />
                <span className="text-[0.96875rem]">บันทึก/อัปเดตข้อมูลนี้ลงสมุดคู่ค้า</span>
              </label>
            </Section>
          )}

          {(def.sections || []).map(section)}

          {def.items && !linkedInstallments && (
            <Section
              title={`${textOf(def.items.title, role)}${def.items.optional ? ' (ไม่บังคับ)' : ''}`}
              tools={def.items.pnd && <Button variant="dark" className="!py-2 text-[0.9375rem]" loading={pndBusy} onClick={fetchPnd}>ดึงข้อมูลจากใบสำคัญจ่าย + 50 ทวิ</Button>}
            >
              {itemsBody()}
            </Section>
          )}

          {(def.sectionsAfter || []).map(section)}
        </div>

        {/* แถบขวา: ผู้ออกเอกสาร + ยอดรวม + ปุ่ม (ติดจอเมื่อเลื่อน) */}
        <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[1.0625rem] font-medium">{textOf(def.issuerTitle, role) || 'ผู้ออกเอกสาร'}</h2>
              <Link to="/app/profile" className="text-[0.9375rem] font-medium text-orange-deep hover:underline">แก้ไขโปรไฟล์</Link>
            </div>
            <p className="text-[1.03125rem] font-medium">{issuerName}{user.tradeName ? ` (${user.tradeName})` : ''}</p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
              เลขประจำตัวผู้เสียภาษี {user.taxId || '-'}
              {juristic ? ` · ${user.branchType === 'branch' ? `สาขาที่ ${String(user.branchCode || '').padStart(5, '0')}` : 'สำนักงานใหญ่'}` : ''}
              {user.vatRegistered ? ' · จดทะเบียน VAT' : ' · ไม่ได้จด VAT'}
            </p>
            <p className="mt-2 text-[0.875rem] text-ink-soft">ดึงจากโปรไฟล์อัตโนมัติ</p>
            {completeness.ok === false && (
              <p className="mt-2 text-[0.90625rem] text-danger">โปรไฟล์ยังไม่ครบ ({completeness.percent}%) · <Link to="/app/profile" className="font-medium underline">ไปกรอก</Link></p>
            )}
          </Card>

          <Card aria-live="polite">
            {hasMoney ? moneyLines : (
              <p className="py-2 text-center text-[0.96875rem] text-ink-soft">
                {def.mode === 'poa' ? 'หนังสือมอบอำนาจไม่มียอดเงิน' : 'กรอกข้อมูลเพื่อดูยอดรวม'}
              </p>
            )}
          </Card>

          {summary.length > 0 && (
            <Alert>
              <b className="font-medium">พบข้อมูลที่ต้องแก้ไข {summary.length} จุด</b>
              <ul className="mt-1 list-disc pl-5">{summary.slice(0, 12).map((m) => <li key={m}>{m}</li>)}</ul>
            </Alert>
          )}

          <StepActions
            back={editing
              ? <Button variant="soft" onClick={() => navigate(`/app/documents?doc=${Number(editing.id)}`)}>ยกเลิกการแก้ไข</Button>
              : null}
            next={<Button variant="dark" onClick={toReview}>ถัดไป: ตรวจสอบ →</Button>}
          />
        </div>
      </div>
    </>
  );
}
