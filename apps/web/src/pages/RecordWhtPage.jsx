/**
 * RecordWhtPage.jsx บันทึกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ที่ได้รับ (ย้ายจาก v-add ของ creator.html)
 * เอกสารที่ผู้ว่าจ้างออกให้ครีเอเตอร์ บันทึกเพื่อรวมยอดรายได้และเครดิตภาษี (ต่างจาก "สร้างเอกสาร")
 * ผลการคำนวณมาจาก /api/wht/calc สูตรเดียวกับตอนบันทึก
 * อ่านข้อมูลจากไฟล์ 50 ทวิ ได้ (features/wht) ช่องที่กรอกจากไฟล์ต้องติ๊กยืนยันว่าตรวจกับต้นฉบับแล้วจึงบันทึกได้
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { thb } from '../lib/format.js';
import { useSubmit } from '../lib/useSubmit.js';
import { useToast } from '../components/Toast.jsx';
import { Alert, Button, Card, PageHeader, SegGroup, SelectField, TextField } from '../components/ui.jsx';
import WhtImport from '../features/wht/WhtImport.jsx';

const RATES = [1, 2, 3, 5, 10, 15].map((r) => ({ value: String(r), label: `${r}%` }));

export default function RecordWhtPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({ payer: '', description: 'ค่าจ้างผลิตเนื้อหา', incomeType: 'มาตรา 40(2)', amount: '', rate: '3' });
  const [calc, setCalc] = useState(null);
  // กรอกจากไฟล์: ช่องที่มาจากไฟล์ ภาษีที่หักในไฟล์ (ไว้ตรวจไขว้) และการยืนยันว่าผู้ใช้ตรวจกับต้นฉบับแล้ว
  const [imported, setImported] = useState(null);
  const [checked, setChecked] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target ? e.target.value : e }));

  const applyImport = ({ values, fields, fileName, ocr }) => {
    setF((x) => ({ ...x, ...values }));
    setImported({ keys: Object.keys(values), fileName, ocr, wht: fields.wht ? fields.wht.value : null });
    setChecked(false);
    toast(`กรอกข้อมูลจากไฟล์แล้ว ${Object.keys(values).length} ช่อง โปรดตรวจก่อนบันทึก`);
  };
  const fromFile = (k) => (imported && imported.keys.includes(k)
    ? <span className="ml-2 inline-block whitespace-nowrap rounded-full bg-orange-pale px-2 py-0.5 align-middle text-[0.75rem] font-medium text-orange-deep">จากไฟล์</span>
    : null);
  const whtMismatch = imported && imported.wht != null && calc && calc.wht !== imported.wht;

  useEffect(() => {
    const amount = Number(f.amount);
    if (!amount) { setCalc(null); return undefined; }
    const t = setTimeout(() => {
      api.post('/api/wht/calc', { amount, rate: Number(f.rate) }).then(setCalc, () => setCalc(null));
    }, 150);
    return () => clearTimeout(t);
  }, [f.amount, f.rate]);

  const [busy, save] = useSubmit(async () => {
    if (!Number(f.amount)) { toast('กรุณากรอกยอดเงิน', 'err'); return; }
    if (imported && !checked) { toast('กรุณาตรวจข้อมูลที่กรอกจากไฟล์ แล้วติ๊กยืนยันก่อนบันทึก', 'err'); return; }
    try {
      const res = await api.post('/api/wht/store', { ...f, amount: Number(f.amount), rate: Number(f.rate) || 3 });
      toast('บันทึกเอกสารเรียบร้อย');
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['summary'] });
      void navigate(res && res.id ? `/app/documents?doc=${Number(res.id)}` : '/app/documents');
    } catch (err) {
      toast((err.data && err.data.errors ? err.data.errors.join(' · ') : err.message) || 'บันทึกไม่สำเร็จ', 'err');
    }
  });

  return (
    <>
      <PageHeader
        title="บันทึก 50 ทวิ ที่ได้รับ"
        subtitle="หนังสือรับรองหัก ณ ที่จ่ายที่ผู้ว่าจ้างออกให้คุณ บันทึกเพื่อรวมยอดรายได้และเครดิตภาษี (ต่างจาก &quot;สร้างเอกสาร&quot; ซึ่งเป็นเอกสารที่คุณออกให้คู่ค้า)"
      />
      <WhtImport onApply={applyImport} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          {imported && (
            <Alert kind="info">
              กรอกจากไฟล์ <b className="font-medium">{imported.fileName}</b>{imported.ocr ? ' (อ่านจากภาพด้วย OCR)' : ''} แล้ว ช่องที่มีป้าย &quot;จากไฟล์&quot; โปรดตรวจให้ตรงกับต้นฉบับ แก้ไขได้ตามปกติ
            </Alert>
          )}
          <TextField id="w-payer" label={<>ผู้ว่าจ้าง / ผู้จ่ายเงิน{fromFile('payer')}</>} placeholder="เช่น บริษัท มีเดีย เอเจนซี่ จำกัด" value={f.payer} onChange={set('payer')} maxLength={150} />
          <TextField id="w-desc" label={<>รายละเอียดงาน{fromFile('description')}</>} value={f.description} onChange={set('description')} maxLength={150} />
          <SegGroup name="incomeType" legend={<>ประเภทเงินได้{fromFile('incomeType')}</>} value={f.incomeType} onChange={set('incomeType')}
            options={[{ value: 'มาตรา 40(2)', label: 'มาตรา 40(2)' }, { value: 'มาตรา 40(8)', label: 'มาตรา 40(8)' }]} />
          <div className="grid gap-x-4 sm:grid-cols-[1fr_160px]">
            <TextField id="w-amount" label={<>ยอดเงินก่อนหัก (บาท){fromFile('amount')}</>} type="number" min="0" step="0.01" inputMode="decimal" placeholder="12000" inputClassName="font-mono text-[1.125rem]" value={f.amount} onChange={set('amount')} />
            <SelectField id="w-rate" label={<>อัตราภาษี{fromFile('rate')}</>} value={f.rate} onChange={set('rate')} options={RATES} />
          </div>
          {imported && (
            <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-[14px] bg-tile px-4 py-3 text-[0.9375rem] leading-relaxed">
              <input type="checkbox" className="mt-1 size-4 accent-orange" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>ฉันตรวจแล้วว่าข้อมูลที่กรอกจากไฟล์ตรงกับหนังสือรับรอง 50 ทวิ ฉบับจริง</span>
            </label>
          )}
        </Card>
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            {calc ? (
              <div className="tf-reveal" aria-live="polite">
                <p className="flex justify-between py-1.5 text-[1rem]"><span className="text-ink-soft">ฐานภาษี</span><b className="font-mono font-medium">{thb(calc.base)}</b></p>
                <p className="flex justify-between py-1.5 text-[1rem]"><span className="text-ink-soft">ภาษีหัก ณ ที่จ่าย {calc.rate}%</span><b className="font-mono font-medium text-orange-deep">-{thb(calc.wht)}</b></p>
                <p className="mt-1 flex items-baseline justify-between border-t border-line pt-3"><span className="text-[1.0625rem] font-medium">ยอดสุทธิที่ได้รับ</span><b className="font-mono text-[1.375rem] font-medium text-orange-deep">{thb(calc.net)}</b></p>
              </div>
            ) : <p className="py-3 text-center text-[0.96875rem] text-ink-soft">กรอกยอดเงินเพื่อดูผลการคำนวณ</p>}
            {whtMismatch && (
              <p role="alert" className="tf-reveal mt-3 rounded-[12px] bg-danger-soft px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-danger">
                ภาษีที่คำนวณได้ {thb(calc.wht)} ไม่ตรงกับภาษีที่หักในไฟล์ {thb(imported.wht)} ตรวจยอดเงินและอัตราภาษีกับต้นฉบับ
              </p>
            )}
          </Card>
          <Button variant="dark" block loading={busy} disabled={Boolean(imported) && !checked} onClick={save}>บันทึกเอกสาร</Button>
          {imported && !checked && <p className="-mt-2 text-center text-[0.84375rem] text-ink-soft">ติ๊กยืนยันว่าตรวจข้อมูลแล้วจึงบันทึกได้</p>}
        </div>
      </div>
    </>
  );
}
