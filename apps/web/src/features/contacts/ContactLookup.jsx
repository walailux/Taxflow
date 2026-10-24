/**
 * ContactLookup.jsx ขั้นแรกของการเพิ่มคู่ค้า: ค้นว่าคู่ค้ามีบัญชี TaxFlow หรือไม่ (อีเมล หรือ เลขประจำตัวผู้เสียภาษี)
 * - มีบัญชี → ส่งคำขออนุญาตดึงข้อมูล (ไปที่กล่องแจ้งเตือนของคู่ค้า) เมื่อคู่ค้ายอมรับ ข้อมูลจะเข้าสมุดคู่ค้าให้เอง
 * - ไม่มีบัญชี → บอกให้กรอกข้อมูลเองด้านล่างแล้วบันทึกลงสมุดคู่ค้าได้เลย
 * ระหว่างรอคู่ค้าตอบ ผู้ใช้กรอกข้อมูลเองและสร้างเอกสารต่อได้ตามปกติ
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { Button, cx } from '../../components/ui.jsx';

const KIND_LABEL = { brand: 'Brand', agency: 'Agency', influencer: 'Influencer', other: 'ผู้ใช้ TaxFlow' };

export default function ContactLookup({ className }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null); // { found, name, kind, status, self } | { error }
  const [asked, setAsked] = useState(''); // ค่าที่ค้นล่าสุด (ใช้ส่งคำขอ)

  async function search(e) {
    e?.preventDefault();
    const v = q.trim();
    if (!v) return;
    setBusy(true);
    try { setRes(await api.get(`/api/contacts/lookup?q=${encodeURIComponent(v)}`)); setAsked(v); } catch (err) { setRes({ error: err.message }); } finally { setBusy(false); }
  }
  async function request() {
    setBusy(true);
    try {
      const r = await api.post('/api/contacts/link-request', { q: asked });
      setRes((x) => ({ ...x, status: r.status }));
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    } catch (err) { setRes((x) => ({ ...x, error: err.message })); } finally { setBusy(false); }
  }

  const status = res && res.status;
  return (
    <div className={cx('rounded-2xl bg-tile/70 p-4 ring-1 ring-line', className)}>
      <p className="mb-2 flex items-center gap-2 text-[0.9375rem] font-medium">
        <Icon name="search" className="size-4 text-orange-deep" />คู่ค้ามีบัญชี TaxFlow ไหม?
        <span className="font-normal text-ink-soft">ค้นด้วยอีเมลหรือเลขประจำตัวผู้เสียภาษี</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setRes(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void search(e); }}
          placeholder="เช่น name@company.com หรือ 0105556000000"
          autoComplete="off"
          aria-label="อีเมลหรือเลขประจำตัวผู้เสียภาษีของคู่ค้า"
          className="tf-input min-w-[14rem] flex-1 !bg-surface"
        />
        <Button type="button" variant="dark" loading={busy && !res} onClick={search} disabled={!q.trim()}>ค้นหา</Button>
      </div>

      {res && (
        <div className="tf-reveal mt-3 text-[0.9375rem]" aria-live="polite">
          {res.error ? (
            <p className="font-medium text-danger">{res.error}</p>
          ) : !res.found ? (
            <p className="text-ink-soft"><b className="font-medium text-ink">ไม่พบบัญชี TaxFlow</b> · กรอกข้อมูลคู่ค้าเองด้านล่าง แล้วบันทึกลงสมุดคู่ค้าได้เลย</p>
          ) : res.self ? (
            <p className="text-ink-soft">นี่คือบัญชีของคุณเอง</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-3.5 py-3 ring-1 ring-line">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-pale text-orange-deep"><Icon name="user" className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <b className="block truncate font-medium">{res.name}</b>
                <small className="text-[0.84375rem] text-ink-soft">มีบัญชี TaxFlow · {KIND_LABEL[res.kind] || KIND_LABEL.other}</small>
              </span>
              {status === 'pending' ? (
                <span className="rounded-full bg-[#FFF4DB] px-3 py-1.5 text-[0.875rem] font-medium text-[#8A5A00]">ส่งคำขอแล้ว · รอคู่ค้ายอมรับ</span>
              ) : status === 'accepted' ? (
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-[#E3F5EC] px-3 py-1.5 text-[0.875rem] font-medium text-[#1F7A4D]">เชื่อมข้อมูลแล้ว</span>
                  <Button type="button" variant="soft" className="!py-1.5 text-[0.875rem]" loading={busy} onClick={request}>ขออัปเดตข้อมูล</Button>
                </span>
              ) : (
                <Button type="button" variant="dark" className="!py-2 text-[0.9375rem]" loading={busy} onClick={request}>ส่งคำขอดึงข้อมูล</Button>
              )}
            </div>
          )}
          {res.found && !res.self && (
            <p className="mt-2 text-[0.84375rem] text-ink-soft">
              {status === 'pending'
                ? 'คำขออยู่ในกล่องแจ้งเตือนของคู่ค้า เมื่อยอมรับ ข้อมูลจะเข้าสมุดคู่ค้าของคุณเอง ระหว่างนี้กรอกข้อมูลเองและสร้างเอกสารต่อได้เลย'
                : 'ข้อมูลจะถูกดึงมาหลังจากคู่ค้ากดยอมรับในกล่องแจ้งเตือนเท่านั้น (ไม่รวมบัญชีธนาคาร)'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
