/**
 * AddWhtPage.jsx บันทึกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ที่ได้รับ (ภาคผนวก ข ข้อ 8)
 * ย้ายจาก #v-add และ previewWht()/storeWht() ของ creator.js
 * เอกสารนี้ "ผู้ว่าจ้างออกให้เรา" จึงเป็นการบันทึกเข้าระบบเพื่อรวมยอดรายได้และเครดิตภาษี
 * การคำนวณเรียก /api/wht/calc เพื่อให้ผลตรงกับฝั่งเซิร์ฟเวอร์เสมอ
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { thb } from '../../lib/format.js';
import { useSubmit } from '../../lib/useSubmit.js';
import { useToast } from '../../components/Toast.jsx';
import { Button, SelectField, TextField } from '../../components/ui.jsx';

const RATES = [1, 2, 3, 5, 10, 15].map((r) => ({ value: String(r), label: `${r}%` }));
const INCOME_TYPES = [{ value: 'มาตรา 40(2)', label: 'มาตรา 40(2)' }, { value: 'มาตรา 40(8)', label: 'มาตรา 40(8)' }];

export default function AddWhtPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ payer: '', description: 'ค่าจ้างผลิตเนื้อหา', incomeType: 'มาตรา 40(2)', amount: '', rate: '3' });
  const [calc, setCalc] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/api/contacts') });

  // คำนวณสดขณะพิมพ์ (หน่วง 200 มิลลิวินาที เหมือนหน้าเดิม)
  useEffect(() => {
    const amount = Number(form.amount);
    // ยอดติดลบหรือไม่ใช่ตัวเลข ถือว่ายังไม่ได้กรอก ไม่ต้องคำนวณ (กันผลลัพธ์ติดลบ)
    if (!Number.isFinite(amount) || amount <= 0) { setCalc(null); return undefined; }
    const t = setTimeout(() => {
      api.post('/api/wht/calc', { amount, rate: Number(form.rate) || 3 }).then(setCalc).catch(() => setCalc(null));
    }, 200);
    return () => clearTimeout(t);
  }, [form.amount, form.rate]);

  const [busy, save] = useSubmit(async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast('กรุณากรอกยอดเงินให้ถูกต้อง (มากกว่า 0)', 'err'); return; }
    try {
      const doc = await api.post('/api/wht/store', { ...form, amount, rate: Number(form.rate) || 3 });
      toast('บันทึกเอกสารเรียบร้อย');
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void navigate(doc && doc.id ? `/app/documents?doc=${Number(doc.id)}` : '/app/documents');
    } catch (err) {
      toast((err.data && err.data.errors ? err.data.errors.join(' · ') : err.message), 'err');
    }
  });

  return (
    <div className="flex flex-col gap-4 pb-6 pt-4">
      <header>
        <p className="text-[0.84375rem] font-bold uppercase tracking-wide text-orange-deep">บันทึกเอกสารที่ได้รับ</p>
        <h1 className="text-[1.75rem]">บันทึกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)</h1>
        <p className="text-[0.96875rem] leading-relaxed text-ink-soft">
          เอกสารที่ <b>ผู้ว่าจ้างออกให้คุณ</b>: บันทึกเข้าระบบเพื่อรวมยอดรายได้และเครดิตภาษี
          (ต่างจาก "สร้างเอกสาร" ซึ่งเป็นเอกสารที่<b>คุณออกให้คู่ค้า</b>)
        </p>
      </header>

      <section className="max-w-[560px] rounded-[var(--radius-card)] border border-line bg-white p-5">
        <TextField
          id="c-payer"
          label="ผู้ว่าจ้าง / ผู้จ่ายเงิน"
          placeholder="เช่น บริษัท มีเดีย เอเจนซี่ จำกัด"
          list="c-payer-list"
          value={form.payer}
          onChange={set('payer')}
        />
        <datalist id="c-payer-list">
          {((contacts.data && contacts.data.items) || []).map((c) => <option key={c.id} value={c.name}>{c.taxId || ''}</option>)}
        </datalist>
        <TextField id="c-desc" label="รายละเอียดงาน" value={form.description} onChange={set('description')} />
        <SelectField id="c-income" label="ประเภทเงินได้" value={form.incomeType} options={INCOME_TYPES} onChange={set('incomeType')} />
        <div className="grid gap-x-3 sm:grid-cols-2">
          <TextField id="c-amount" label="ยอดเงินก่อนหัก (บาท)" type="number" inputMode="decimal" min="0" placeholder="12000" value={form.amount} onChange={set('amount')} />
          <SelectField id="c-rate" label="อัตราภาษี (%)" value={form.rate} options={RATES} onChange={set('rate')} />
        </div>

        <div className="rounded-2xl bg-orange-pale p-4" aria-live="polite">
          {!calc ? <p className="py-2 text-center text-[0.90625rem] text-ink-soft">กรอกยอดเงินเพื่อดูผลการคำนวณ</p> : (
            <>
              <p className="flex justify-between py-1 text-[0.90625rem]"><span className="text-ink-soft">ฐานภาษี</span><b>{thb(calc.base)}</b></p>
              <p className="flex justify-between py-1 text-[0.90625rem]"><span className="text-ink-soft">ภาษีหัก ณ ที่จ่าย {calc.rate}%</span><b className="text-orange-deep">-{thb(calc.wht)}</b></p>
              <p className="mt-1 flex justify-between border-t border-orange-soft pt-2 text-[1.03125rem] font-bold"><span>ยอดสุทธิที่ได้รับ</span><b>{thb(calc.net)}</b></p>
            </>
          )}
        </div>

        <Button block className="mt-4" loading={busy} onClick={save}>บันทึกเอกสาร</Button>
      </section>
    </div>
  );
}
