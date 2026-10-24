/**
 * StatusPage.jsx สถานะระบบ เรียก /api/health มาแสดง ดึงใหม่ทุก 15 วินาที
 * - standalone: แสดงที่พอร์ต API (4000) ผ่าน status-main.jsx ไม่มี Router ปุ่มเข้าเว็บจึงเป็นลิงก์ไปโดเมนหน้าเว็บ
 * - ปกติ: หน้า /status ของหน้าเว็บ (5173)
 * ด้านล่างแสดง JSON ที่ API ตอบจริงจาก /api และ /api/health สลับดูและคัดลอกได้
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { thDateTime } from '../lib/format.js';
import { Skeleton, cx } from '../components/ui.jsx';

function uptimeText(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [d && `${d} วัน`, h && `${h} ชั่วโมง`, `${m} นาที`].filter(Boolean).join(' ');
}

/** ระบายสี JSON แบบง่าย: คีย์ ข้อความ ตัวเลข/ค่าคงที่ (สร้างเป็น element ไม่ใช้ innerHTML) */
function JsonView({ value }) {
  const text = JSON.stringify(value, null, 2);
  const out = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [tok] = m;
    const cls = m[2] ? 'text-[#7DD3FC]' : m[1] ? 'text-[#FDBA74]' : 'text-[#86EFAC]';
    out.push(<span key={m.index} className={cls}>{m[2] ? m[1] : tok}</span>);
    if (m[2]) out.push(m[2]);
    last = m.index + tok.length;
  }
  out.push(text.slice(last));
  return out;
}

function ApiJson({ info, health }) {
  const [tab, setTab] = useState('/api');
  const [copied, setCopied] = useState(false);
  const q = tab === '/api' ? info : health;
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(q.data, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* เบราว์เซอร์ไม่อนุญาต */ }
  };
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[1rem] font-medium">ข้อมูลที่ API ตอบ (JSON)</h2>
        <div className="flex rounded-full bg-tile p-1 text-[0.875rem]">
          {['/api', '/api/health'].map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cx('cursor-pointer rounded-full px-3 py-1 font-mono transition-colors', tab === t ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}>{t}</button>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[18px] bg-[#18181B]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[0.84375rem] text-white/50">
          <span className="font-mono">GET {tab}</span>
          <button type="button" onClick={copy} disabled={!q.data} className="cursor-pointer rounded-md px-2 py-0.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40">
            {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
          </button>
        </div>
        <pre className="max-h-64 overflow-auto px-4 py-3 font-mono text-[0.875rem] leading-relaxed text-white/85">
          {q.isLoading ? 'กำลังโหลด…' : q.data ? <JsonView value={q.data} /> : <span className="text-[#FCA5A5]">{q.error ? q.error.message : 'ไม่มีข้อมูล'}</span>}
        </pre>
      </div>
    </section>
  );
}

export default function StatusPage({ standalone = false }) {
  // ที่อยู่หน้าเว็บจริงมาจาก API (GET /api -> web) ใช้ตอนแสดงที่พอร์ต API
  const info = useQuery({ queryKey: ['api-info'], queryFn: () => api.get('/api'), retry: false, staleTime: Infinity });
  const webUrl = standalone ? ((info.data && info.data.web) || '') : window.location.origin;
  const webHost = webUrl.replace(/^https?:\/\//, '') || 'พอร์ตหน้าเว็บ';
  const q = useQuery({ queryKey: ['health'], queryFn: () => api.get('/api/health'), refetchInterval: 15_000, retry: false });
  const ok = q.data && q.data.status === 'ok';
  const rows = q.data ? [
    ['สถานะ', 'ทำงานปกติ'],
    ['เวลาเซิร์ฟเวอร์', thDateTime(q.data.time)],
    ['ทำงานต่อเนื่องมาแล้ว', uptimeText(q.data.uptimeSec || 0)],
    ['เวอร์ชัน', q.data.version],
  ] : [];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="tf-pop w-full max-w-lg rounded-[28px] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(24,24,27,0.35)]">
        <img src="/img/logo.png" alt="TaxFlow" className="mb-7 h-9 w-auto" />
        <span className={cx('mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.90625rem] font-medium', q.isLoading ? 'bg-tile text-ink-soft' : ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}>
          <span className="relative flex size-2">
            {ok && <span className="absolute inset-0 animate-ping rounded-full bg-ok" />}
            <span className={cx('relative size-2 rounded-full', q.isLoading ? 'bg-ink-soft' : ok ? 'bg-ok' : 'bg-danger')} />
          </span>
          {q.isLoading ? 'กำลังตรวจสอบ' : ok ? 'ออนไลน์' : 'ออฟไลน์'}
        </span>
        <h1 className="mb-2 text-[1.75rem] font-medium">{q.isLoading ? 'กำลังตรวจสอบระบบ' : ok ? 'TaxFlow API ทำงานปกติ' : 'เชื่อมต่อ API ไม่ได้'}</h1>
        <p className="mb-6 text-[1rem] leading-relaxed text-ink-soft">
          พอร์ต API (4000) ให้บริการเฉพาะข้อมูล (<code className="rounded-md bg-orange-pale px-1.5 py-0.5 font-mono text-[0.90625rem] text-orange-deep">/api/*</code>) ส่วนหน้าเว็บทั้งหมดอยู่ที่ <b className="font-medium text-ink">{webHost}</b>
        </p>
        {q.isLoading ? <Skeleton className="h-32 w-full" /> : ok ? (
          <dl className="mb-6 divide-y divide-line rounded-[18px] bg-tile px-4">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3 text-[0.96875rem]">
                <dt className="text-ink-soft">{k}</dt>
                <dd className={cx('text-right font-medium', k === 'สถานะ' && 'text-ok')}>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mb-6 rounded-[18px] bg-danger-soft p-4 text-[0.96875rem] text-danger">{q.error ? q.error.message : 'ไม่ทราบสาเหตุ'}</p>
        )}
        <ApiJson info={info} health={q} />
        {standalone
          ? <a href={`${webUrl}/login`} className={cx('tf-btn tf-btn-dark w-full', !webUrl && 'pointer-events-none opacity-60')}>เข้าสู่หน้าเว็บ TaxFlow</a>
          : <Link to="/login" className="tf-btn tf-btn-dark w-full">เข้าสู่หน้าเว็บ TaxFlow</Link>}
      </div>
    </main>
  );
}
