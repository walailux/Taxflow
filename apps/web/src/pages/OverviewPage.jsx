/**
 * OverviewPage.jsx แดชบอร์ด (ย้ายจาก v-overview ของ creator.html / agency.html + dashboard.js + ux.js)
 * แถวบน: ยอดรวมปีนี้ + กำหนดยื่นภาษี · ตัวเลขเดือนนี้ 2×2 เทียบเดือนก่อน · กราฟแท่งซ้อนรายเดือน
 * แถวล่าง: ความคืบหน้า (โปรไฟล์ / ขั้นภาษี / เอกสารอนุมัติ) + การ์ดงานค้าง · ตารางเอกสารล่าสุด
 */
import { useOutletContext } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { baht } from '../lib/format.js';
import CountUp from '../components/CountUp.jsx';
import Icon from '../components/Icon.jsx';
import { Skeleton, cx } from '../components/ui.jsx';
import ViewLink from '../features/app/ViewLink.jsx';
import { BRACKETS } from '../features/overview/brackets.js';
import Onboarding from '../features/overview/Onboarding.jsx';
import RecentTable from '../features/overview/RecentTable.jsx';
import StackedBars from '../features/overview/StackedBars.jsx';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Bangkok' }).format(new Date()));
  if (h < 5) return 'สวัสดี';
  if (h < 12) return 'สวัสดีตอนเช้า';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  return 'สวัสดีตอนเย็น';
}

const money = (n) => `฿${baht(n)}`;
const TH_MONTH = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const whenText = (days) => (days === 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`);

/** % เปลี่ยนจากเดือนก่อน (null ถ้าเดือนก่อนเป็น 0 จะหารไม่ได้) */
function delta(series) {
  if (!series || series.length < 2) return null;
  const cur = series.at(-1);
  const prev = series.at(-2);
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

const moneyWhole = (n) => `฿${Math.round(n).toLocaleString('th-TH')}`;

function Delta({ value, onDark }) {
  if (value === null || value === undefined) return <span className={cx('text-[0.875rem]', onDark ? 'text-white/75' : 'text-ink-soft')}>เดือนนี้</span>;
  const up = value >= 0;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[0.875rem]">
      <span className={cx('rounded-full px-2 py-0.5 font-medium', onDark ? 'bg-white/20 text-white' : up ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}>
        {up ? '↑' : '↓'} {Math.abs(value)}%
      </span>
      <span className={cx('hidden @min-[180px]:inline', onDark ? 'text-white/75' : 'text-ink-soft')}>จากเดือนก่อน</span>
    </span>
  );
}

function Tile({ label, icon, value, format, dlt, accent, loading, delay }) {
  return (
    <div
      className={cx(
        'tf-fade-up flex aspect-square min-w-0 flex-col xl:aspect-auto justify-between rounded-[18px] p-4 transition-transform duration-300 [container-type:inline-size] hover:-translate-y-0.5',
        accent ? 'bg-[linear-gradient(160deg,#FF8A4C,#FF6A00_60%,#EF5A12)] text-white shadow-[0_16px_34px_-18px_rgba(239,90,18,0.75)]' : 'bg-tile',
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cx('min-w-0 text-[0.9375rem] leading-snug', accent ? 'text-white/90' : 'text-ink')}>{label}</span>
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full', accent ? 'bg-white/20' : 'bg-white text-ink ring-1 ring-line')}>
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <div>
        {loading ? <Skeleton className={cx('mb-2 h-8 w-28', accent && '!bg-white/30')} /> : (
          <div className="mb-1.5 whitespace-nowrap font-display text-[clamp(17px,15cqw,28px)] font-normal leading-tight tracking-tight"><CountUp value={value} format={format} /></div>
        )}
        <Delta value={dlt} onDark={accent} />
      </div>
    </div>
  );
}

function Panel({ className, children }) {
  return <section className={cx('tf-fade-up rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(24,24,27,0.03)] sm:p-6', className)}>{children}</section>;
}

/** แถบความคืบหน้าลายทแยงแบบในภาพอ้างอิง */
function Progress({ pct, left, right }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <>
      <div className="tf-hatch-muted relative h-3.5 overflow-hidden rounded-full bg-tile">
        <div className="h-full origin-left rounded-full bg-orange" style={{ width: `${p}%`, animation: 'tf-grow-x .9s var(--ease-slide) .15s both' }} />
      </div>
      <div className="mt-2.5 flex justify-between gap-3 text-[0.90625rem]">
        <span>{left}</span>
        <span className="text-ink-soft">{right}</span>
      </div>
    </>
  );
}

function ProgressCard({ role, profile, summary, docs }) {
  const c = profile && profile.completeness;
  if (c && !c.ok) {
    return (
      <Panel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[1.125rem] font-medium">ความครบถ้วนของโปรไฟล์</h2>
          <ViewLink role={role} view="profile" className="text-[0.9375rem] font-medium text-orange-deep hover:underline">ไปกรอก</ViewLink>
        </div>
        <Progress pct={c.percent} left={<><b className="font-medium">{c.percent}%</b> <span className="text-ink-soft">กรอกแล้ว</span></>} right="ครบ 100% จึงออกเอกสารได้" />
        <p className="mt-3 line-clamp-2 text-[0.90625rem] text-ink-soft">ยังขาด: {c.missing.join(', ')}</p>
      </Panel>
    );
  }
  if (role === 'creator') {
    const net = summary ? Number(summary.estimate.netIncome) || 0 : 0;
    const idx = BRACKETS.findIndex(([cap]) => net <= cap);
    const [cap, rate] = BRACKETS[idx];
    const from = idx ? BRACKETS[idx - 1][0] : 0;
    const pct = cap === Infinity ? 100 : ((net - from) / (cap - from)) * 100;
    return (
      <Panel>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[1.125rem] font-medium">ขั้นภาษีปัจจุบัน</h2>
          <span className="rounded-full bg-orange-pale px-2.5 py-0.5 text-[0.90625rem] font-medium text-orange-deep">{rate}%</span>
        </div>
        {summary ? (
          <Progress pct={pct} left={<><b className="font-mono font-medium">{money(net)}</b> <span className="text-ink-soft">เงินได้สุทธิ</span></>} right={cap === Infinity ? 'ขั้นสูงสุด' : `เพดานขั้น ${money(cap)}`} />
        ) : <Skeleton className="h-10 w-full" />}
        <p className="mt-3 text-[0.90625rem] text-ink-soft">ภาษีทั้งปีจากเอกสาร <b className="font-mono font-medium text-ink">{summary ? money(summary.estimate.totalTax) : '-'}</b></p>
      </Panel>
    );
  }
  const total = docs.length;
  const done = docs.filter((d) => ['approved', 'archived'].includes(d.status)).length;
  return (
    <Panel>
      <h2 className="mb-4 text-[1.125rem] font-medium">เอกสารที่ดำเนินการเสร็จ</h2>
      <Progress pct={total ? (done / total) * 100 : 0} left={<><b className="font-medium">{done}</b> <span className="text-ink-soft">ฉบับ อนุมัติ/เก็บถาวรแล้ว</span></>} right={`จากทั้งหมด ${total} ฉบับ`} />
    </Panel>
  );
}

function WorkCards({ role, inboxCount, drafts, rejected }) {
  return (
    <Panel>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-tile"><Icon name="inbox" className="size-5" /></span>
        <h2 className="text-[1.125rem] font-medium">งานที่รอคุณ</h2>
      </div>
      <div className="@container"><div className="grid grid-cols-1 gap-3 @min-[380px]:grid-cols-2">
        <ViewLink role={role} view="inbox" className="group relative flex h-[132px] min-w-0 flex-col justify-between overflow-hidden rounded-[18px] bg-ink p-4 text-white transition-transform hover:-translate-y-1">
          <span aria-hidden="true" className="absolute -right-6 -top-8 size-28 rounded-full bg-white/5" />
          <span className="w-fit rounded-full bg-white/15 px-2.5 py-0.5 text-[0.84375rem]">กล่องรับเอกสาร</span>
          <span>
            <small className="block text-[0.84375rem] text-white/60">รอลงนาม / ตรวจสอบ</small>
            <b className="font-display text-[1.875rem] font-normal leading-none">{inboxCount}</b>
            <span className="ml-1.5 text-[0.90625rem] text-white/70">รายการ</span>
          </span>
        </ViewLink>
        <ViewLink role={role} view="docs" className="relative flex h-[132px] min-w-0 flex-col justify-between overflow-hidden rounded-[18px] bg-[linear-gradient(160deg,#FF8A4C,#FF6A00_60%,#EF5A12)] p-4 text-white transition-transform hover:-translate-y-1">
          <span aria-hidden="true" className="absolute -right-6 -top-8 size-28 rounded-full bg-white/10" />
          <span className="w-fit rounded-full bg-white/20 px-2.5 py-0.5 text-[0.84375rem]">เอกสารค้าง</span>
          <span>
            <small className="block truncate text-[0.84375rem] text-white/75">แบบร่าง {drafts} · ตีกลับ {rejected}</small>
            <b className="font-display text-[1.875rem] font-normal leading-none">{drafts + rejected}</b>
            <span className="ml-1.5 text-[0.90625rem] text-white/80">ฉบับ</span>
          </span>
        </ViewLink>
      </div></div>
    </Panel>
  );
}

export default function OverviewPage() {
  const { user, role, profile } = useOutletContext();
  const creator = role === 'creator';

  const summary = useQuery({ queryKey: ['summary', role], queryFn: () => api.get(creator ? '/api/creator/summary' : '/api/agency/summary') });
  const docs = useQuery({ queryKey: ['documents', 'all'], queryFn: () => api.get('/api/documents') });
  const inbox = useQuery({ queryKey: ['requests', 'inbox'], queryFn: () => api.get('/api/requests/inbox') });
  const trend = useQuery({ queryKey: ['dashboard', 'trend'], queryFn: () => api.get('/api/dashboard/trend') });
  const deadlines = useQuery({ queryKey: ['tax-calendar'], queryFn: () => api.get('/api/tax-calendar') });

  const s = summary.data;
  const t = trend.data;
  const items = docs.data ? docs.data.items : [];
  const dl = deadlines.data ? [...deadlines.data.items].sort((a, b) => a.daysLeft - b.daysLeft) : [];
  const yearTotal = s ? (creator ? s.grossIncome : s.totals.revenue) : 0;
  const thisMonth = (k) => (t ? t[k].at(-1) : 0);

  return (
    <>
      <Onboarding email={user.email} />
      <div className="mb-7">
        <h1 className="text-[1.875rem] font-medium leading-tight sm:text-[2.5rem]">{greeting()}, {user.companyName || user.displayName}</h1>
        <p className="mt-1.5 text-[1.0625rem] text-ink-soft">
          {creator ? 'ติดตามรายได้ เอกสาร และภาษีของคุณในที่เดียว' : 'ติดตามรายรับ ค่าใช้จ่าย และสถานะเอกสารในที่เดียว'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_425px] 2xl:grid-cols-[minmax(0,1fr)_425px_minmax(0,1fr)]">
        {/* ยอดรวมปีนี้ + กำหนดยื่นภาษี */}
        <Panel>
          {/* หัวข้อการ์ด: ไอคอนในกรอบส้มอ่อน + ตัวหนาใหญ่ ให้เด่นกว่าตัวเลขรอง · ป้ายปีภาษีโทนส้ม */}
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-orange-pale text-orange-deep"><Icon name="wallet" className="size-[1.125rem]" /></span>
              <h2 className="text-[1.1875rem] font-semibold leading-tight sm:text-[1.3125rem]">{creator ? 'รายได้รวมปีนี้' : 'รายรับปีนี้'}</h2>
            </span>
            <span className="shrink-0 rounded-full bg-orange-pale px-3 py-1 text-[0.875rem] font-medium text-orange-deep">ปีภาษี {s ? (s.taxYear || new Date().getFullYear()) + 543 : new Date().getFullYear() + 543}</span>
          </div>
          {summary.isLoading ? <Skeleton className="my-2 h-10 w-52" /> : (
            <div className="mt-3 break-all font-display text-[1.875rem] font-normal leading-tight tracking-tight sm:text-[2.125rem]"><CountUp value={yearTotal} format={money} /></div>
          )}
          <p className="mt-1.5 text-[0.90625rem] text-ink-soft">
            {s ? (creator
              ? `จากเอกสาร ${s.documentCount} ฉบับ · ไม่รวมเอกสารยกเลิก`
              : `จากใบเสร็จรับเงิน ${s.counts.receipts} ฉบับ · ค่าใช้จ่าย ${money(s.totals.expense)}`) : ' '}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <ViewLink role={role} view="create" className="tf-btn tf-btn-dark !px-3"><Icon name="plus" className="size-[1.125rem]" />สร้างเอกสาร</ViewLink>
            <ViewLink role={role} view={creator ? 'add' : 'create'} query={creator ? undefined : { type: 'EWHT' }} className="tf-btn tf-btn-soft !px-3">
              <Icon name="receipt" className="size-[1.125rem]" />{creator ? 'บันทึก 50 ทวิ' : 'ออก 50 ทวิ'}
            </ViewLink>
          </div>
          <div className="mt-5 rounded-[18px] bg-tile p-3">
            <div className="mb-2.5 flex items-center justify-between px-1 text-[0.90625rem]">
              <span><b className="font-medium">กำหนดยื่นภาษี</b> <span className="text-ink-soft">| ทั้งหมด {dl.length} รายการ</span></span>
              <ViewLink role={role} view="calendar" className="text-orange-deep hover:underline">ปฏิทิน</ViewLink>
            </div>
            {deadlines.isLoading ? <Skeleton className="h-[92px] w-full" /> : dl.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2">
                {dl.slice(0, 3).map((d) => (
                  <div key={`${d.key}-${d.dueDate}`} className="rounded-xl bg-white p-2.5">
                    <b className="line-clamp-2 min-h-[2.6em] text-[0.875rem] font-medium leading-snug" title={d.label}>{d.label.replace(/^ยื่นแบบ/, '').trim()}</b>
                    <span className="mt-1 block font-display text-[1.0625rem]">{Number(d.dueDate.slice(8, 10))} {TH_MONTH[Number(d.dueDate.slice(5, 7))]}</span>
                    <small className={cx('text-[0.8125rem]', d.daysLeft <= 3 ? 'text-danger' : 'text-ok')}>{whenText(d.daysLeft)}</small>
                  </div>
                ))}
              </div>
            ) : <p className="px-1 pb-1 text-[0.90625rem] text-ink-soft">ไม่มีกำหนดยื่นแบบที่เกี่ยวข้องกับบัญชีนี้</p>}
          </div>
        </Panel>

        {/* ตัวเลขเดือนนี้ 2×2 */}
        <Panel className="!p-3 sm:!p-3 xl:aspect-square">
          {/* จอ 1280px ขึ้นไป: คอลัมน์กลางกว้าง 425px กล่องเป็นจัตุรัส การ์ดย่อย 2×2 เต็มกล่อง (จัตุรัสตาม) การ์ดข้าง ๆ ยืดสูงเท่ากัน
              จอเล็กกว่า: การ์ดเรียงลงมาเต็มความกว้าง การ์ดย่อยเป็นจัตุรัสเอง (แถวละ 4 ใบ · มือถือแถวละ 2 ใบ) */}
          <div className="grid h-full grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2 xl:grid-rows-2">
            <Tile accent label="มูลค่าเอกสารเดือนนี้" icon="wallet" value={thisMonth('income')} format={moneyWhole} dlt={delta(t && t.income)} loading={trend.isLoading} delay={0} />
            <Tile label="VAT เดือนนี้" icon="calc" value={thisMonth('vat')} format={moneyWhole} dlt={delta(t && t.vat)} loading={trend.isLoading} delay={60} />
            <Tile label="หัก ณ ที่จ่ายเดือนนี้" icon="receipt" value={thisMonth('wht')} format={moneyWhole} dlt={delta(t && t.wht)} loading={trend.isLoading} delay={120} />
            <Tile label="เอกสารอนุมัติเดือนนี้" icon="file" value={thisMonth('count')} format={(n) => `${Math.round(n)} ฉบับ`} dlt={delta(t && t.count)} loading={trend.isLoading} delay={180} />
          </div>
        </Panel>

        {/* กราฟแท่งซ้อน */}
        <Panel className="xl:col-span-2 2xl:col-span-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[1.1875rem] font-medium">มูลค่าเอกสาร</h2>
            <ViewLink role={role} view="analytics" className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-tile px-3.5 text-[0.875rem] font-medium text-ink transition-colors hover:bg-ink hover:text-white">
              ดูแบบละเอียด<Icon name="chevron" className="size-3.5" />
            </ViewLink>
          </div>
          <p className="mb-4 text-[0.9375rem] text-ink-soft">เฉพาะเอกสารที่อนุมัติ/เก็บถาวร 8 เดือนล่าสุด</p>
          {trend.isLoading ? <Skeleton className="h-[240px] w-full" /> : t && <StackedBars months={t.months} income={t.income} vat={t.vat} wht={t.wht} />}
        </Panel>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.05fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ProgressCard role={role} profile={profile} summary={s} docs={items} />
          <WorkCards
            role={role}
            inboxCount={inbox.data ? inbox.data.actionCount : 0}
            drafts={items.filter((d) => d.status === 'draft').length}
            rejected={items.filter((d) => d.status === 'rejected').length}
          />
        </div>
        <Panel className="flex min-w-0 flex-col">
          <RecentTable role={role} items={items} loading={docs.isLoading} />
        </Panel>
      </div>
    </>
  );
}
