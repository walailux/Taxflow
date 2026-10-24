/**
 * WhtImport.jsx อ่านข้อมูลจากไฟล์ 50 ทวิ แล้วให้ผู้ใช้ตรวจก่อนกรอกลงฟอร์ม
 *   1) เลือก/ลากไฟล์ → 2) อ่านข้อความ (OCR ถ้าเป็นภาพ) → 3) กล่องตรวจสอบ: ภาพต้นฉบับคู่กับค่าที่อ่านได้ทีละช่อง
 *      พร้อมบรรทัดที่พบในไฟล์เป็นหลักฐาน และตรวจไขว้ว่าภาษีในไฟล์ตรงกับสูตรของระบบ → 4) กดกรอกลงฟอร์ม
 * ไฟล์ไม่ถูกอัปโหลด อ่านในเบราว์เซอร์ทั้งหมด
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tax } from '../../lib/shared.js';
import { thb } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Alert, Button, cx } from '../../components/ui.jsx';
import { ACCEPT, FORMATS, ReadError, readDocument } from './readDocument.js';
import { parseTawi50 } from './parseTawi50.js';

const KIND_LABEL = { pdf: 'PDF', image: 'รูปภาพ', docx: 'Word', xlsx: 'Excel', odt: 'OpenDocument', ods: 'OpenDocument', text: 'ข้อความ' };

/** แถวของกล่องตรวจสอบ: key ใน fields, ชื่อช่อง, วิธีแสดงค่า, ใช้กรอกฟอร์มหรือไม่ */
const ROWS = [
  { key: 'payer', label: 'ผู้ว่าจ้าง / ผู้จ่ายเงิน', fills: true },
  { key: 'payerTaxId', label: 'เลขผู้เสียภาษีของผู้จ่าย', info: 'ใช้ตรวจว่าเป็นผู้จ่ายรายที่ถูกต้อง' },
  { key: 'payee', label: 'ผู้ถูกหักภาษี (ผู้รับเงิน)', info: 'ควรเป็นชื่อของคุณ' },
  { key: 'incomeType', label: 'ประเภทเงินได้', fills: true },
  { key: 'amount', label: 'ยอดเงินก่อนหัก', fills: true, money: true },
  { key: 'wht', label: 'ภาษีที่หักไว้', money: true, info: 'ใช้ตรวจกับผลคำนวณของระบบ' },
  { key: 'rate', label: 'อัตราภาษี', fills: true, fmt: (v) => `${v}%` },
  { key: 'datePaid', label: 'วันที่จ่าย', info: 'ใช้ตรวจว่าเป็นฉบับที่ถูกต้อง' },
  { key: 'description', label: 'รายละเอียดงาน', fills: true },
];

function StatusChip({ field }) {
  if (!field) return <span className="rounded-full bg-tile px-2.5 py-0.5 text-[0.78125rem] font-medium text-ink-soft">ไม่พบ</span>;
  if (field.value == null || field.note) return <span className="rounded-full bg-[#FFF4DB] px-2.5 py-0.5 text-[0.78125rem] font-medium text-[#9A6400]">ต้องตรวจ</span>;
  return <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-[0.78125rem] font-medium text-ok">พบในไฟล์</span>;
}

function ReviewDialog({ file, doc, result, onApply, onCancel, onRetry }) {
  const { fields, warnings, recognized } = result;
  const apply = useRef(null);
  const fillCount = ROWS.filter((r) => r.fills && fields[r.key] && fields[r.key].value != null).length;
  const check = fields.amount && fields.rate ? tax.calcWithholding(fields.amount.value, fields.rate.value) : null;
  const matches = check && fields.wht && check.wht === fields.wht.value;

  useEffect(() => {
    apply.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[210] flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wi-title"
        className="tf-pop flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_30px_80px_-30px_rgba(24,24,27,0.45)] sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="wi-title" className="text-[1.1875rem] font-semibold">ตรวจสอบข้อมูลที่อ่านจากไฟล์</h2>
            <p className="mt-0.5 truncate text-[0.875rem] text-ink-soft">
              {file.name} · {KIND_LABEL[doc.kind] || 'ไฟล์'}{doc.ocr ? ' · อ่านจากภาพด้วย OCR' : ''}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="ปิด" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tile text-ink hover:bg-line">
            <Icon name="close" className="size-[1.125rem]" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:overflow-hidden">
          {/* ต้นฉบับ */}
          <section aria-label="ไฟล์ต้นฉบับ" className="border-b border-line bg-[#F6F4F1] p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r sm:p-5">
            <p className="mb-2 text-[0.8125rem] font-medium text-ink-soft">ต้นฉบับ (เทียบกับค่าด้านขวา)</p>
            {doc.preview.type === 'image' ? (
              <img src={doc.preview.src} alt={`ภาพตัวอย่างของ ${file.name}`} className="w-full rounded-[12px] border border-line bg-white" />
            ) : (
              <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-[12px] border border-line bg-white p-4 font-mono text-[0.78125rem] leading-relaxed text-ink">{doc.preview.text}</pre>
            )}
          </section>

          {/* ค่าที่อ่านได้ */}
          <section aria-label="ข้อมูลที่อ่านได้" className="p-4 lg:overflow-y-auto sm:p-5">
            {doc.ocr && (
              <Alert kind="info">อ่านจากภาพด้วย OCR ความแม่นยำขึ้นกับความคมชัดของภาพ โปรดเทียบตัวเลขทุกช่องกับต้นฉบับ</Alert>
            )}
            {!recognized && <Alert kind="error">{warnings[0]}</Alert>}

            <ul className="divide-y divide-line rounded-[16px] border border-line">
              {ROWS.map((r) => {
                const f = fields[r.key];
                const shown = f && f.value != null ? (r.money ? thb(f.value) : r.fmt ? r.fmt(f.value) : f.value) : '—';
                return (
                  <li key={r.key} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[0.84375rem] text-ink-soft">
                        {r.label}
                        {!r.fills && <span className="ml-1.5 text-[0.75rem]">(ไม่บันทึก)</span>}
                      </span>
                      <StatusChip field={f} />
                    </div>
                    <p className={cx('mt-0.5 break-words text-[1rem] font-medium', r.money && 'font-mono', !(f && f.value != null) && 'text-ink-soft')}>{shown}</p>
                    {f && f.note && <p className="mt-1 text-[0.84375rem] leading-relaxed text-[#9A6400]">{f.note}</p>}
                    {!f && r.info && <p className="mt-1 text-[0.8125rem] text-ink-soft">{r.info}</p>}
                    {f && f.evidence && (
                      <p className="mt-1.5 rounded-[8px] bg-tile px-2.5 py-1.5 text-[0.78125rem] leading-relaxed text-ink-soft">
                        <span className="font-medium">จากไฟล์:</span> {f.evidence}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {check && fields.wht && (
              <div className={cx('mt-4 rounded-[14px] px-4 py-3 text-[0.90625rem] leading-relaxed', matches ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}>
                {matches
                  ? `ตรวจไขว้ผ่าน: ${thb(fields.amount.value)} × ${fields.rate.value}% = ${thb(check.wht)} ตรงกับภาษีที่หักในไฟล์`
                  : `ภาษีที่คำนวณได้ ${thb(check.wht)} ไม่ตรงกับในไฟล์ ${thb(fields.wht.value)} ตรวจตัวเลขกับต้นฉบับ`}
              </div>
            )}

            {recognized && warnings.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {warnings.map((w) => (
                  <li key={w} className="flex gap-2 rounded-[12px] bg-[#FFF8E8] px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-[#7A5200]">
                    <Icon name="info" className="mt-0.5 size-4 shrink-0" />{w}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[0.84375rem] text-ink-soft">
            {fillCount ? `จะกรอกให้ ${fillCount} ช่อง คุณแก้ไขต่อในฟอร์มได้ก่อนบันทึก` : 'ไม่มีข้อมูลที่กรอกลงฟอร์มได้'}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={onRetry}>เลือกไฟล์อื่น</Button>
            <Button ref={apply} variant="dark" disabled={!fillCount} onClick={onApply}>กรอกข้อมูลลงฟอร์ม</Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/**
 * props: onApply({ values, fields, fileName, ocr }) — values เฉพาะช่องที่กรอกฟอร์มได้ (สตริงตามรูปแบบของฟอร์ม)
 */
export default function WhtImport({ onApply }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [state, setState] = useState({ phase: 'idle' }); // idle | reading | review | error

  // ภาพตัวอย่างจาก URL.createObjectURL ต้องคืนหน่วยความจำเมื่อไม่ใช้แล้ว
  useEffect(() => () => {
    if (state.doc && state.doc.preview.revoke) URL.revokeObjectURL(state.doc.preview.src);
  }, [state.doc]);

  const pick = () => input.current?.click();

  const read = async (file) => {
    if (!file) return;
    setState({ phase: 'reading', file, stage: 'read', progress: 0 });
    try {
      const doc = await readDocument(file, ({ stage, progress }) => setState((s) => (s.phase === 'reading' ? { ...s, stage, progress } : s)));
      setState({ phase: 'review', file, doc, result: parseTawi50(doc.text) });
    } catch (err) {
      const msg = err instanceof ReadError ? err.message : 'อ่านไฟล์ไม่สำเร็จ ลองไฟล์อื่น หรือกรอกข้อมูลเอง';
      if (!(err instanceof ReadError)) console.error(err);
      setState({ phase: 'error', file, error: msg });
    }
  };

  const apply = () => {
    const { fields } = state.result;
    const values = {};
    if (fields.payer) values.payer = fields.payer.value.slice(0, 150);
    if (fields.description) values.description = fields.description.value.slice(0, 150);
    if (fields.incomeType && fields.incomeType.value) values.incomeType = fields.incomeType.value;
    if (fields.amount) values.amount = String(fields.amount.value);
    if (fields.rate) values.rate = String(fields.rate.value);
    onApply({ values, fields, fileName: state.file.name, ocr: state.doc.ocr });
    setState({ phase: 'idle' });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    void read(e.dataTransfer.files && e.dataTransfer.files[0]);
  };

  const reading = state.phase === 'reading';
  const pct = Math.round((state.progress || 0) * 100);

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cx(
          'mb-5 flex flex-col gap-4 rounded-[22px] border-[1.5px] border-dashed p-5 transition-colors sm:flex-row sm:items-center sm:p-6',
          drag ? 'border-orange bg-orange-pale' : 'border-[#E3D9CF] bg-white',
        )}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-orange-pale text-orange-deep">
          {reading ? <span className="inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : <Icon name="download" className="size-6" />}
        </span>
        <div className="min-w-0 flex-1" aria-live="polite">
          {reading ? (
            <>
              <p className="truncate text-[1rem] font-medium">กำลังอ่าน {state.file.name}</p>
              <p className="mt-0.5 text-[0.875rem] text-ink-soft">
                {state.stage === 'ocr' ? `กำลังอ่านตัวอักษรจากภาพ (OCR) ${pct}% ครั้งแรกใช้เวลาโหลดข้อมูลภาษาสักครู่` : 'กำลังอ่านข้อความในไฟล์...'}
              </p>
              {state.stage === 'ocr' && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tile" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-orange transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-[1rem] font-medium">อ่านข้อมูลจากไฟล์ 50 ทวิ อัตโนมัติ</p>
              <p className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-soft">ลากไฟล์มาวาง หรือเลือกไฟล์ · {FORMATS} · ไม่เกิน 10 MB</p>
              <p className="mt-0.5 text-[0.8125rem] text-ink-soft">ไฟล์ถูกอ่านในเบราว์เซอร์ของคุณ ไม่ถูกอัปโหลดขึ้นเซิร์ฟเวอร์ และคุณจะได้ตรวจทุกช่องก่อนกรอก</p>
              {state.phase === 'error' && <p role="alert" className="tf-reveal mt-2 text-[0.875rem] font-medium text-danger">{state.file.name}: {state.error}</p>}
            </>
          )}
        </div>
        <Button variant="soft" onClick={pick} disabled={reading} className="shrink-0">เลือกไฟล์</Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { void read(e.target.files && e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      {state.phase === 'review' && (
        <ReviewDialog
          file={state.file}
          doc={state.doc}
          result={state.result}
          onApply={apply}
          onCancel={() => setState({ phase: 'idle' })}
          onRetry={() => { setState({ phase: 'idle' }); setTimeout(pick, 0); }}
        />
      )}
    </>
  );
}
