/**
 * Onboarding.jsx แนะนำการใช้งาน 4 ขั้น แสดงครั้งแรกที่เข้าแดชบอร์ด (ย้ายจาก dashboard.js)
 * จำไว้ในเครื่องต่ออีเมล ไม่แสดงซ้ำ
 */
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Button, cx } from '../../components/ui.jsx';

const STEPS = [
  { t: 'ยินดีต้อนรับสู่ TaxFlow', d: 'ระบบจัดการเอกสารภาษีสำหรับอินฟลูเอนเซอร์ บริษัท และเอเจนซี่ ใช้เวลา 30 วินาทีทำความรู้จักเมนูหลัก', img: '/img/mascot-hello.webp' },
  { t: 'สร้างเอกสาร 4 ขั้นตอน', d: 'เลือกจุดประสงค์ เลือกประเภท กรอกข้อมูล และตรวจสอบก่อนยืนยัน มีแถบขั้นตอนบอกตำแหน่งตลอดการสร้าง', img: '/img/mascot-question.webp' },
  { t: 'ส่งให้คู่ค้าลงนาม', d: 'ลงนามฝั่งคุณก่อน แล้วส่งขอลายเซ็นผ่านอีเมลบัญชีคู่ค้า อีกฝ่ายเห็นใน "กล่องรับเอกสาร" พร้อมกำหนดเวลา', img: '/img/mascot-otp.png' },
  { t: 'ติดตามได้ทุกที่', d: 'แดชบอร์ดสรุปยอดภาษีและงานค้าง กระดิ่งแจ้งเตือนแยกเรื่องสำคัญ อ่านเพิ่มที่ "คู่มือการใช้งาน" ในเมนู', img: '/img/mascot-success.webp' },
];

const keyFor = (email) => `tf_onboard_${email || ''}`;

export default function Onboarding({ email }) {
  const [step, setStep] = useState(-1);

  useEffect(() => {
    try {
      if (localStorage.getItem(keyFor(email))) return;
      localStorage.setItem(keyFor(email), '1');
      setStep(0);
    } catch { /* เปิดโหมดส่วนตัว ไม่แสดงก็ได้ */ }
  }, [email]);

  if (step < 0) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const close = () => setStep(-1);

  // วาดที่ document.body: ถ้าอยู่ใต้ element ที่มี backdrop-filter/transform กล่อง fixed จะถูกจำกัดอยู่ในกรอบนั้น
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[65] flex items-center justify-center bg-ink/45 px-4 backdrop-blur-[2px]" onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="ob-title" className="tf-pop w-full max-w-md rounded-[28px] bg-white p-7 text-center shadow-[0_30px_80px_-30px_rgba(24,24,27,0.45)]" onClick={(e) => e.stopPropagation()}>
        <div key={step} className="tf-fade-up">
          <img src={s.img} alt="" className="tf-float mx-auto mb-4 h-40 w-auto" />
          <span className="mb-2 inline-flex size-8 items-center justify-center rounded-full bg-orange font-display text-[0.96875rem] font-semibold text-white">{step + 1}</span>
          <h2 id="ob-title" className="mb-2 text-[1.375rem]">{s.t}</h2>
          <p className="mb-6 text-[1rem] leading-relaxed text-ink-soft">{s.d}</p>
        </div>
        <div className="mb-6 flex justify-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => <span key={i} className={cx('h-1.5 rounded-full transition-all duration-300', i === step ? 'w-6 bg-orange' : 'w-1.5 bg-[#E5E0DB]')} />)}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={close}>ข้าม</Button>
          <Button className="flex-1" onClick={() => (last ? close() : setStep(step + 1))}>{last ? 'เริ่มใช้งาน' : 'ถัดไป'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
