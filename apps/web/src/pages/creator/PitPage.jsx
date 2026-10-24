/**
 * PitPage.jsx ประมาณการภาษีเงินได้บุคคลธรรมดา (ภาคผนวก ข ข้อ 14)
 * ย้ายจาก #v-pit และ estimatePit()/fillFromDocs() ของ creator.js
 * การคำนวณทำที่ API (/api/pit/estimate) ใช้ตรรกะเดียวกับหน้าสรุปภาษี
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { baht, thb } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import { Alert, Button, SelectField, Spinner, TextField, cx } from '../../components/ui.jsx';

const INCOME_TYPES = [
  { value: '40(2)', label: 'มาตรา 40(2) ค่าจ้าง/ค่านายหน้า (หัก 50% ไม่เกิน 100,000 บาท)' },
  { value: '40(8)', label: 'มาตรา 40(8) รับจ้างทำของ/ธุรกิจอิสระ (หัก 60% ไม่มีเพดาน)' },
];

function Line({ label, value, strong, tone }) {
  return (
    <p className={cx('flex items-baseline justify-between gap-3 py-1.5 text-[0.90625rem]', strong && 'mt-1 border-t border-orange-soft pt-2 text-[1.03125rem] font-bold')}>
      <span className={cx(!strong && 'text-ink-soft')}>{label}</span>
      <b className={cx('tabular-nums', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-orange-deep')}>{value}</b>
    </p>
  );
}

export default function PitPage() {
  const toast = useToast();
  const [form, setForm] = useState({ incomeType: '40(2)', grossIncome: '', withholdingPaid: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const summary = useQuery({ queryKey: ['creator', 'summary'], queryFn: () => api.get('/api/creator/summary'), enabled: false });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function fillFromDocs() {
    try {
      const s = await api.get('/api/creator/summary');
      setForm((f) => ({ ...f, grossIncome: String(s.grossIncome), withholdingPaid: String(s.withholdingPaid) }));
      toast(`ดึงยอดปีภาษีปัจจุบัน ฿${baht(s.grossIncome)} และภาษีที่ถูกหักไว้ ฿${baht(s.withholdingPaid)} แล้ว`);
    } catch (err) { toast(err.message, 'err'); }
  }

  async function estimate() {
    const gross = Number(form.grossIncome);
    if (!Number.isFinite(gross) || gross <= 0) { toast('กรุณากรอกรายได้ให้ถูกต้อง (มากกว่า 0)', 'err'); return; }
    setBusy(true);
    try {
      setResult(await api.post('/api/pit/estimate', {
        grossIncome: gross,
        incomeType: form.incomeType,
        withholdingPaid: Number(form.withholdingPaid) || 0,
      }));
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }

  const paid = Number(form.withholdingPaid) || 0;
  return (
    <div className="flex flex-col gap-4 pb-6 pt-4">
      <header>
        <p className="text-[0.84375rem] font-bold uppercase tracking-wide text-orange-deep">วางแผนภาษี</p>
        <h1 className="text-[1.75rem]">ประมาณการภาษีเงินได้บุคคลธรรมดา</h1>
        <p className="text-[0.96875rem] text-ink-soft">คำนวณเบื้องต้น (หักลดหย่อนส่วนตัว 60,000 บาท เลือกประเภทเงินได้เพื่อใช้อัตราหักค่าใช้จ่ายที่ถูกต้อง)</p>
      </header>

      <section className="max-w-[560px] rounded-[var(--radius-card)] border border-line bg-white p-5">
        <SelectField id="p-income-type" label="ประเภทเงินได้" value={form.incomeType} options={INCOME_TYPES} onChange={set('incomeType')} />
        <TextField
          id="p-gross" label="รายได้รวมทั้งปี (บาท)" type="number" inputMode="decimal" min="0" placeholder="480000"
          hint="หรือดึงยอดจากเอกสารที่บันทึกไว้" value={form.grossIncome} onChange={set('grossIncome')}
        />
        <TextField
          id="p-wht" label="ภาษีที่ถูกหัก ณ ที่จ่ายไว้แล้วทั้งปี (บาท)" type="number" inputMode="decimal" min="0" placeholder="0"
          hint="ใช้หักลบจากภาษีที่คำนวณได้ เพื่อดูว่าต้องชำระเพิ่มหรือได้คืน" value={form.withholdingPaid} onChange={set('withholdingPaid')}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="px-4 py-2 text-[0.90625rem]" onClick={fillFromDocs}>ดึงยอดจากเอกสาร</Button>
          <Button className="px-4 py-2 text-[0.90625rem]" onClick={estimate} loading={busy}>คำนวณภาษี</Button>
        </div>

        <div className="mt-4 rounded-2xl bg-orange-pale p-4" aria-live="polite">
          {!result ? (
            <p className="py-2 text-center text-[0.90625rem] text-ink-soft">ยังไม่มีผลการคำนวณ กรอกรายได้แล้วกด "คำนวณภาษี"</p>
          ) : (
            <>
              <Line label="ประเภทเงินได้" value={`มาตรา ${result.incomeType}`} />
              <Line label="รายได้รวม" value={thb(result.grossIncome)} />
              <Line label={`หักค่าใช้จ่าย (${result.expenseRate}%)`} value={`-${thb(result.expense)}`} />
              <Line label="หักลดหย่อนส่วนตัว" value={`-${thb(result.personalAllowance)}`} />
              <Line label="เงินได้สุทธิ" value={thb(result.netIncome)} />
              {(result.steps || []).length > 0 && (
                <div className="mt-2 border-t border-orange-soft pt-2">
                  {result.steps.map((st) => <Line key={st.range} label={`${st.range} (${st.rate}%)`} value={thb(st.tax)} />)}
                </div>
              )}
              <Line label="ภาษีที่ต้องชำระทั้งปี" value={thb(result.totalTax)} strong />
              {paid > 0 && (
                <Line
                  label={result.balance > 0 ? 'ต้องชำระเพิ่มโดยประมาณ' : 'ได้รับคืนภาษีโดยประมาณ'}
                  value={thb(Math.abs(result.balance))}
                  tone={result.balance > 0 ? 'warn' : 'ok'}
                />
              )}
            </>
          )}
        </div>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
          ประมาณการเบื้องต้นจากรายได้และค่าลดหย่อนพื้นฐานเท่านั้น ยังไม่รวมค่าลดหย่อนอื่น เช่น ประกัน กองทุน บุตร บิดามารดา
          ไม่ใช่คำแนะนำทางภาษี ยอดจริงให้ยึดตามการยื่นแบบกับกรมสรรพากร
        </p>
        {summary.isError && <Alert>{summary.error.message}</Alert>}
        {summary.isFetching && <p className="mt-2 flex items-center gap-2 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังดึงยอด</p>}
      </section>
    </div>
  );
}
