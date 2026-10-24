/**
 * VerifyPage.jsx ตรวจสอบเอกสาร (ภาคผนวก ข ข้อ 18) หน้าสาธารณะ ไม่ต้องเข้าสู่ระบบ
 * - /verify?token=...  ข้อมูลเอกสารจากลิงก์/QR ที่ได้จากการแชร์ + ผลตรวจลายมือชื่อในไฟล์ PDF จริง
 * - อัปโหลดไฟล์ PDF มาตรวจลายมือชื่อดิจิทัล (ไฟล์ไม่ถูกเก็บไว้ที่ใด)
 * ย้ายจาก _public_legacy/verify.html ข้อความและเกณฑ์เหมือนเดิมทุกข้อ
 */
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.js';
import { API_URL } from '../lib/env.js';
import { DOC_LABEL, STATUS_LABEL, thDate, thDateTime, thb } from '../lib/format.js';
import { Spinner, cx } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const MAX_PDF = 10 * 1024 * 1024;

/** แถวข้อมูล: ป้ายกว้างคงที่ไม่ตัดบรรทัด ค่าอยู่ชิดขวา (จอเล็กเรียงบนลงล่าง) */
function Row({ label, children, tone }) {
  return (
    <div className={cx('flex flex-col gap-1 border-b border-line px-1 py-3.5 last:border-0 sm:flex-row sm:gap-4', tone === 'bad' && 'rounded-xl border-0 bg-danger-soft px-3')}>
      <span className="shrink-0 text-[0.96875rem] text-ink-soft sm:w-44 sm:whitespace-nowrap">{label}</span>
      <div className="min-w-0 flex-1 text-[1rem] font-medium sm:text-right">{children}</div>
    </div>
  );
}

/** เครื่องหมายถูก/ผิดแบบเส้นล้วน (ไอคอน check ในชุดหลักมีวงกลมในตัว ซ้อนกับพื้นวงกลมแล้วดูรก) */
function Mark({ ok, className }) {
  return (
    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.6' strokeLinecap='round' strokeLinejoin='round' className={className} aria-hidden='true'>
      <path d={ok ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 7l10 10M17 7L7 17'} />
    </svg>
  );
}

/** รายการผลตรวจหนึ่งข้อ: ไอคอนวงกลมสีตามผล + ข้อความ */
function Check({ ok, children }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span aria-hidden="true" className={cx('mt-px flex size-6 shrink-0 items-center justify-center rounded-full', ok ? 'bg-ok-soft text-ok' : 'bg-danger text-white')}>
        <Mark ok={ok} className="size-3.5" />
      </span>
      <span className={cx('text-[1rem] leading-snug', ok ? 'text-ink' : 'font-medium text-danger')}>
        <span className="sr-only">{ok ? 'ผ่าน: ' : 'ไม่ผ่าน: '}</span>{children}
      </span>
    </li>
  );
}

/** ข้อมูลประกอบ ป้ายซ้าย ค่าขวา */
function Detail({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-[0.90625rem] text-ink-soft sm:w-24">{label}</dt>
      <dd className="min-w-0 break-words text-[0.9375rem]">{children}</dd>
    </div>
  );
}

/** ผลตรวจลายมือชื่อ PAdES ใช้ทั้งเอกสารจาก QR และไฟล์ที่อัปโหลด (pdfSigHtml ของหน้าเดิม) */
function PdfSignature({ v }) {
  if (!v) return null;
  if (!v.signed) {
    return <Row label="ลายมือชื่อในไฟล์ PDF"><span className="text-ink-soft">{(v.problems || [])[0] || 'ไม่มีลายมือชื่อดิจิทัล'}</span></Row>;
  }
  const c = v.certificate || {};
  const checks = [
    [v.intact, v.intact ? 'ไฟล์ไม่ถูกแก้ไขตั้งแต่ลงนาม' : 'ไฟล์ถูกเปลี่ยนแปลงหลังลงนาม ห้ามเชื่อถือ'],
    [v.coversWhole, v.coversWhole ? 'ลายมือชื่อครอบคลุมทั้งไฟล์' : 'มีข้อมูลต่อท้ายไฟล์หลังลงนาม'],
    [v.trusted, v.trusted ? 'ลงนามด้วยใบรับรองของระบบ TaxFlow' : 'ไม่ใช่ใบรับรองของระบบนี้'],
    ...(v.certValidAtSigning === false ? [[false, 'ใบรับรองยังไม่เริ่มใช้หรือหมดอายุ ณ เวลาที่ลงนาม']] : []),
  ];
  const passed = checks.filter(([ok]) => ok).length;
  return (
    <div className="mt-4 overflow-hidden rounded-[20px] ring-1 ring-line">
      <div className={cx('flex items-center justify-between gap-3 px-4 py-3', v.valid ? 'bg-ok-soft' : 'bg-danger-soft')}>
        <span className="flex items-center gap-2 text-[1rem] font-medium">
          <Icon name="shield" className={cx('size-[1.125rem]', v.valid ? 'text-ok' : 'text-danger')} />
          ลายมือชื่อในไฟล์ PDF
        </span>
        <span className={cx('rounded-full bg-white px-2.5 py-0.5 text-[0.875rem] font-medium', v.valid ? 'text-ok' : 'text-danger')}>
          ผ่าน {passed}/{checks.length} ข้อ
        </span>
      </div>
      <div className="bg-white px-4 py-2">
        <ul className="divide-y divide-line/70">
          {checks.map(([ok, text]) => <Check key={text} ok={ok}>{text}</Check>)}
        </ul>
      </div>
      <dl className="border-t border-line bg-tile px-4 py-3">
        <Detail label="ผู้ลงนาม">{v.signerName || '-'}</Detail>
        <Detail label="เวลาลงนาม">{v.signedAt ? thDateTime(v.signedAt) : '-'}</Detail>
        <Detail label="ใบรับรอง">
          {c.subject || '-'}
          {c.selfSigned && <span className="ml-1.5 inline-block rounded-full bg-white px-2 py-px text-[0.8125rem] text-ink-soft ring-1 ring-line">ออกเอง</span>}
        </Detail>
        {v.format && <Detail label="รูปแบบ"><span className="font-mono text-[0.875rem]">{v.format}</span></Detail>}
      </dl>
      {(v.notes || []).length > 0 && (
        <div className="flex gap-2 border-t border-line bg-white px-4 py-3 text-[0.90625rem] leading-relaxed text-ink-soft">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          <div>{v.notes.map((n) => <p key={n}>{n}</p>)}</div>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ ok }) {
  return (
    <div aria-hidden="true" className={cx('tf-pop mx-auto mb-3 flex size-16 items-center justify-center rounded-full ring-8', ok ? 'bg-ok-soft text-ok ring-ok-soft/50' : 'bg-danger-soft text-danger ring-danger-soft/50')}>
      <Mark ok={ok} className="size-7" />
    </div>
  );
}

function TokenResult({ token }) {
  const q = useQuery({
    queryKey: ['verify', token],
    queryFn: () => api.get(`/api/verify/${encodeURIComponent(token)}`),
    retry: false,
  });
  if (q.isLoading) return <p className="flex items-center justify-center gap-2 py-10 text-[0.96875rem] text-ink-soft"><Spinner /> กำลังตรวจสอบเอกสาร</p>;
  if (q.isError) {
    return (
      <div className="py-6 text-center">
        <img src="/img/mascot-404.png" alt="" className="mx-auto mb-3 w-[160px]" onError={(e) => e.currentTarget.remove()} />
        <h2 className="mb-2 text-[1.25rem]">ตรวจสอบไม่สำเร็จ</h2>
        <p className="text-[0.96875rem] text-ink-soft">{q.error.status === 404 ? (q.error.data.error || 'ไม่พบเอกสารนี้ในระบบ') : q.error.message}</p>
      </div>
    );
  }
  const d = q.data;
  return (
    <>
      <StatusIcon ok={!d.tampered} />
      <h2 className="text-center text-[1.375rem] font-medium">{d.tampered ? 'พบความผิดปกติของเอกสาร' : 'เอกสารถูกต้อง มีอยู่ในระบบ'}</h2>
      <p className="mb-5 text-center text-[0.96875rem] text-ink-soft">{DOC_LABEL[d.type] || d.type}</p>
      <Row label="เลขที่เอกสาร"><span className="font-mono text-orange-deep">{d.docNo}</span></Row>
      <Row label="ผู้ออกเอกสาร">{d.issuer || '-'}</Row>
      <Row label="คู่ค้า/ลูกค้า">{d.counterparty || '-'}</Row>
      <Row label="ยอดรวม">{thb(d.total)}</Row>
      <Row label="สถานะ">{STATUS_LABEL[d.status] || d.status}</Row>
      <Row label="วันที่สร้าง">{thDate(d.createdAt)}</Row>
      <Row label="ลายมือชื่อดิจิทัล">
        {d.signed ? (
          <span className="text-ok">✓ ลงนามโดย {d.signerName}<small className="block font-normal text-ink-soft">{thDateTime(d.signedAt)}</small></span>
        ) : <span className="text-ink-soft">ยังไม่ลงนาม</span>}
      </Row>
      {d.tampered ? (
        <Row label="ความถูกต้องของเนื้อหา" tone="bad">
          <span className="text-danger">⚠ เนื้อหาเอกสารถูกแก้ไขหลังลงนาม แฮชไม่ตรงกับตอนลงนาม ห้ามเชื่อถือ</span>
        </Row>
      ) : d.signed ? (
        <Row label="ความถูกต้องของเนื้อหา"><span className="text-ok">✓ ตรงกับตอนลงนาม ไม่ถูกแก้ไข</span></Row>
      ) : null}
      <PdfSignature v={d.digitalSignature} />
      <Row label="แฮชเนื้อหา (SHA-256)"><span className="break-all font-mono text-[0.84375rem] font-normal">{d.contentHash || '-'}</span></Row>
    </>
  );
}

function PdfCheck() {
  const [state, setState] = useState({ status: 'idle' });
  const input = useRef(null);

  async function check(file) {
    if (!file) return;
    if (file.size > MAX_PDF) { setState({ status: 'error', message: 'ไฟล์ใหญ่เกิน 10 MB' }); return; }
    setState({ status: 'loading' });
    try {
      // ส่งไฟล์เป็นเนื้อคำขอตรง ๆ (Content-Type: application/pdf) ตามที่ /api/verify/pdf รับ ไม่ผ่าน api.post ที่แปลงเป็น JSON
      const res = await fetch(`${API_URL}/api/verify/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data);
      setState({ status: 'done', name: file.name, v: data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' });
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  const [over, setOver] = useState(false);
  const onDrop = (e) => { e.preventDefault(); setOver(false); void check(e.dataTransfer.files[0]); };

  return (
    <section className="tf-fade-up rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-7">
      <h2 className="mb-1 text-[1.25rem] font-medium">ตรวจลายมือชื่อดิจิทัลในไฟล์ PDF</h2>
      <p className="mb-5 text-[1rem] leading-relaxed text-ink-soft">
        เลือกไฟล์ PDF ที่ได้รับจากระบบ TaxFlow เพื่อตรวจว่าไฟล์ไม่ถูกแก้ไขหลังลงนาม ไฟล์ถูกตรวจแล้วทิ้งทันที ไม่ถูกเก็บไว้ที่ใด (ไม่เกิน 10 MB)
      </p>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed px-4 py-9 text-center transition-colors',
          over ? 'border-orange bg-orange-pale' : 'border-line bg-tile hover:border-orange-soft hover:bg-orange-pale')}
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-white text-orange shadow-[0_8px_20px_-12px_rgba(232,90,0,0.5)]"><Icon name="file" className="size-6" /></span>
        <b className="text-[1.0625rem] font-medium">ลากไฟล์ PDF มาวางที่นี่</b>
        <span className="text-[0.96875rem] text-ink-soft">หรือ <span className="font-medium text-orange-deep underline">เลือกไฟล์จากเครื่อง</span></span>
        <input ref={input} type="file" aria-label="เลือกไฟล์ PDF ที่ต้องการตรวจ" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => check(e.target.files[0])} />
      </label>
      <div className="mt-5" aria-live="polite">
        {state.status === 'loading' && <p className="flex items-center gap-2 text-[0.96875rem] text-ink-soft"><Spinner /> กำลังตรวจ</p>}
        {state.status === 'error' && <p className="rounded-xl bg-danger-soft px-4 py-3 text-[0.96875rem] font-medium text-danger">{state.message}</p>}
        {state.status === 'done' && (
          <div className="tf-reveal">
            <StatusIcon ok={state.v.valid} />
            <h3 className="text-center text-[1.1875rem] font-medium">
              {state.v.valid ? 'ลายมือชื่อถูกต้อง' : state.v.signed ? 'ไฟล์ไม่ผ่านการตรวจ' : 'ไฟล์นี้ไม่มีลายมือชื่อดิจิทัล'}
            </h3>
            <p className="mt-1 text-center text-[0.9375rem] text-ink-soft">
              {state.v.valid ? 'ไฟล์นี้ออกจากระบบ TaxFlow และไม่ถูกแก้ไขหลังลงนาม' : state.v.signed ? 'มีบางข้อไม่ผ่าน ดูรายละเอียดด้านล่าง' : 'ตรวจความถูกต้องของไฟล์นี้ไม่ได้'}
            </p>
            <div className="mx-auto mt-4 flex w-fit max-w-full items-center gap-2 rounded-full bg-tile px-3.5 py-1.5 text-[0.9375rem]">
              <Icon name="file" className="size-4 shrink-0 text-orange" />
              <span className="truncate" title={state.name}>{state.name}</span>
            </div>
            {state.v.signed ? <PdfSignature v={state.v} /> : <div className="mt-4"><PdfSignature v={state.v} /></div>}
          </div>
        )}
      </div>
    </section>
  );
}

const STEPS = [
  ['สแกน QR บนเอกสาร', 'QR ทุกฉบับพาเข้าหน้านี้พร้อมผลตรวจของเอกสารฉบับนั้นทันที'],
  ['หรืออัปโหลดไฟล์ PDF', 'ระบบตรวจลายมือชื่อดิจิทัลว่าไฟล์ไม่ถูกแก้ไขหลังลงนาม'],
  ['ดูผลตรวจ', 'เลขที่เอกสาร ผู้ออก ยอดรวม และความถูกต้องของเนื้อหา'],
];

export default function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/overview" aria-label="TaxFlow หน้าภาพรวมระบบ"><img src="/img/logo.png" alt="TaxFlow" className="h-9 w-auto" /></Link>
          <nav aria-label="เมนูข้อมูลระบบ" className="ml-auto hidden items-center gap-1 rounded-full bg-white p-1 text-[1rem] ring-1 ring-line sm:flex">
            <Link to="/overview" className="rounded-full px-4 py-2 text-ink-soft transition-colors hover:text-ink">ภาพรวมระบบ</Link>
            <Link to="/guide" className="rounded-full px-4 py-2 text-ink-soft transition-colors hover:text-ink">คู่มือ</Link>
            <span aria-current="page" className="rounded-full bg-ink px-4 py-2 text-white">ตรวจสอบเอกสาร</span>
          </nav>
          <Link to="/login" className="tf-btn tf-btn-solid ml-auto !py-2.5 text-[1rem] sm:ml-2">เข้าสู่ระบบ</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <div className="tf-fade-up mb-8 flex flex-col items-center gap-6 text-center md:flex-row md:text-left">
          <img src="/img/mascot-signature.png" alt="" className="tf-float w-[150px] shrink-0 md:w-[180px]" />
          <div>
            <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-orange-pale px-3 py-1 text-[0.9375rem] font-medium text-orange-deep">
              <Icon name="shield" className="size-4" />ตรวจสอบได้ทุกคน ไม่ต้องเข้าสู่ระบบ
            </span>
            <h1 className="text-[2rem] font-medium leading-tight sm:text-[2.625rem]">ตรวจสอบเอกสาร</h1>
            <p className="mt-2 max-w-[560px] text-[1.0625rem] leading-relaxed text-ink-soft">
              ยืนยันว่าเอกสารออกจากระบบ TaxFlow จริง และไม่ถูกแก้ไขหลังลงนาม จาก QR บนเอกสารหรือไฟล์ PDF ที่ได้รับ
            </p>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            {token && (
              <section className="tf-fade-up rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-7">
                <TokenResult token={token} />
              </section>
            )}
            <PdfCheck />
          </div>
          <aside className="tf-fade-up rounded-[24px] bg-white p-5 sm:p-7" style={{ animationDelay: '80ms' }}>
            <h2 className="mb-4 text-[1.125rem] font-medium">ตรวจสอบอย่างไร</h2>
            <ol className="flex flex-col gap-4">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-pale font-display text-[1.03125rem] text-orange-deep">{i + 1}</span>
                  <span><b className="block text-[1.03125rem] font-medium">{title}</b><span className="text-[0.96875rem] leading-relaxed text-ink-soft">{text}</span></span>
                </li>
              ))}
            </ol>
            <p className="mt-5 rounded-2xl bg-tile px-4 py-3 text-[0.9375rem] leading-relaxed text-ink-soft">
              ถ้าผลตรวจแจ้งว่าเนื้อหาถูกแก้ไข อย่าใช้เอกสารฉบับนั้น ให้ติดต่อผู้ออกเอกสารเพื่อขอฉบับใหม่
            </p>
          </aside>
        </div>
        <p className="mt-10 text-center text-[0.90625rem] text-ink-soft">ระบบต้นแบบ TaxFlow เพื่อการศึกษา</p>
      </main>
    </div>
  );
}
