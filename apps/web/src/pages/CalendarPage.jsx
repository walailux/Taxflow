/**
 * CalendarPage.jsx ปฏิทินงาน (ย้ายจาก calendar.js) กำหนดยื่นภาษี เอกสาร สัญญา ลงนาม และกิจกรรมที่ผู้ใช้เพิ่มเอง
 * มุมมองเดือน/รายการ · กรองหมวดหมู่ · รายละเอียดวันที่เลือก · กำลังจะถึงใน 14 วัน
 * ?date=YYYY-MM-DD เปิดที่วันนั้น (ลิงก์จากการแจ้งเตือน)
 */
import { useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { API_URL } from '../lib/env.js';
import { useToast } from '../components/Toast.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Icon from '../components/Icon.jsx';
import { Button, Card, EmptyState, PageHeader, Skeleton, cx } from '../components/ui.jsx';
import ViewLink from '../features/app/ViewLink.jsx';
import EventEditor from '../features/calendar/EventEditor.jsx';
import MarkerIcon from '../features/calendar/MarkerIcon.jsx';
import {
  TH_DAYS, TH_DAYS_S, TH_MONTHS, addDays, diffDays, fileUrl, gridRange, longDate, onDay, relative, shiftMonth, shortDate, toDate,
} from '../features/calendar/calUtils.js';

const readView = () => { try { return localStorage.getItem('tf_cal_view') === 'list' ? 'list' : 'month'; } catch { return 'month'; } };

// หัวเดือน/ปีที่กดได้: เปิดแผงเลือกปี (‹ ปี ›) + ตาราง 12 เดือน · ปิดเมื่อคลิกข้างนอกหรือกด Esc
function MonthYearPicker({ month, today, onPick }) {
  const [y, m] = month.split('-').map(Number);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(y);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (ev) => { if (box.current && !box.current.contains(ev.target)) setOpen(false); };
    const esc = (ev) => { if (ev.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const thisMonth = today.slice(0, 7);
  const navBtn = 'flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-tile';
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setYear(y); setOpen((o) => !o); }}
        className="flex cursor-pointer items-baseline gap-2.5 rounded-2xl px-3 py-1 font-display text-[1.375rem] font-medium transition-colors hover:bg-tile sm:text-[1.625rem]">
        {TH_MONTHS[m - 1]}<span className="font-normal text-ink-soft">{y + 543}</span>
        <Icon name="chevron" className={cx('size-4 self-center text-ink-soft transition-transform', open ? '-rotate-90' : 'rotate-90')} />
      </button>
      {open && (
        <div role="dialog" aria-label="เลือกเดือนและปี" className="tf-pop absolute left-1/2 top-full z-30 mt-2 w-[18rem] -translate-x-1/2 rounded-2xl bg-white p-3 shadow-[0_18px_40px_-16px_rgba(24,24,27,0.35)] ring-1 ring-line">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setYear((v) => v - 1)} aria-label="ปีก่อนหน้า" className={navBtn}><MarkerIcon name="left" /></button>
            <b className="font-display text-[1.125rem] font-medium">{year + 543}</b>
            <button type="button" onClick={() => setYear((v) => v + 1)} aria-label="ปีถัดไป" className={navBtn}><MarkerIcon name="right" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {TH_MONTHS.map((name, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`;
              const cur = key === month;
              return (
                <button key={key} type="button" aria-current={cur ? 'date' : undefined} onClick={() => { setOpen(false); onPick(key); }}
                  className={cx('cursor-pointer rounded-xl px-1 py-2.5 text-[0.9375rem] transition-colors',
                    cur ? 'bg-orange font-semibold text-white' : key === thisMonth ? 'font-medium text-orange-deep ring-1 ring-orange/40 hover:bg-orange-pale' : 'hover:bg-tile')}>
                  {name}
                </button>
              );
            })}
          </div>
          {thisMonth !== month && (
            <button type="button" onClick={() => { setOpen(false); onPick(thisMonth); }} className="mt-2 w-full cursor-pointer rounded-xl py-2 text-[0.9375rem] font-medium text-orange-deep hover:bg-orange-pale">กลับไปเดือนนี้</button>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ e, role, today, cat, onToggle, onEdit, onDelete }) {
  const c = cat(e.category);
  const range = e.endDate && e.endDate !== e.date ? `${shortDate(e.date)} – ${shortDate(e.endDate)}` : '';
  const time = e.time ? `${e.time}${e.endTime ? `–${e.endTime}` : ''} น.` : '';
  return (
    <article className={cx('tf-fade-up rounded-[18px] bg-white p-4 ring-1 ring-line transition-shadow hover:shadow-[0_12px_28px_-20px_rgba(24,24,27,0.35)]', e.done && 'opacity-60')} style={{ borderLeft: `4px solid ${c.color}` }}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[0.84375rem]">
        <span className="flex items-center gap-1.5 rounded-full bg-tile px-2.5 py-0.5"><i className="size-2 rounded-full" style={{ background: c.color }} />{c.label}</span>
        {e.priority === 'critical' && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 font-medium text-danger">สำคัญมาก</span>}
        {e.priority === 'high' && <span className="rounded-full bg-[#FFF4DB] px-2.5 py-0.5 font-medium text-[#8A5A00]">สำคัญ</span>}
        {e.source === 'system' && <span className="rounded-full bg-info-soft px-2.5 py-0.5 text-info">ระบบ</span>}
        {e.locked && <span className="flex items-center gap-1 text-ink-soft" title={e.lockReason}><MarkerIcon name="lock" className="size-3" /></span>}
      </div>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={!!e.done} onChange={(x) => onToggle(e, x.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--color-ink)]" aria-label="ทำเครื่องหมายว่าเสร็จแล้ว" />
        <span className={cx('flex items-center gap-1.5 text-[1.03125rem] font-medium', e.done && 'line-through')}><MarkerIcon name={e.marker} />{e.title}</span>
      </label>
      <p className="mt-1.5 flex items-center gap-1.5 pl-6 text-[0.90625rem] text-ink-soft"><MarkerIcon name="clock" className="size-3.5" />{[range, time].filter(Boolean).join(' · ') || 'ทั้งวัน'} · {relative(today, e.date)}</p>
      {e.purpose && <p className="mt-2 pl-6 text-[0.9375rem]"><span className="text-ink-soft">จุดประสงค์</span> {e.purpose}</p>}
      {e.linkDocName && <p className="mt-1 pl-6 text-[0.9375rem]"><span className="text-ink-soft">เอกสาร</span> {e.linkDocName}</p>}
      {e.note && <p className="mt-2 rounded-xl bg-tile px-3 py-2 text-[0.9375rem]">{e.note}</p>}
      {e.userNote && <p className="mt-2 rounded-xl bg-orange-pale px-3 py-2 text-[0.9375rem]"><b className="font-medium">บันทึกของฉัน</b> {e.userNote}</p>}
      {(e.attachments || []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
          {e.attachments.map((f) => (
            <a key={f.id} href={fileUrl(API_URL, e, f)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-tile px-2.5 py-1 text-[0.875rem] hover:bg-orange-pale"><MarkerIcon name="clip" className="size-3" />{f.filename}</a>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {e.requestId ? <ViewLink role={role} view="inbox" className="flex items-center gap-1 rounded-lg px-2 py-1 text-[0.90625rem] font-medium text-orange-deep hover:bg-orange-pale"><MarkerIcon name="doc" className="size-3.5" />ไปกล่องรับเอกสาร</ViewLink>
          : e.docId ? <ViewLink role={role} view="docs" query={{ doc: e.docId }} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[0.90625rem] font-medium text-orange-deep hover:bg-orange-pale"><MarkerIcon name="doc" className="size-3.5" />เปิดเอกสาร</ViewLink> : null}
        <span className="flex-1" />
        <button type="button" onClick={() => onEdit(e)} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[0.90625rem] text-ink-soft hover:bg-tile hover:text-ink"><MarkerIcon name="edit" className="size-3.5" />{e.source === 'system' ? 'เพิ่มบันทึก' : 'แก้ไข'}</button>
        {e.source === 'user' && (
          <button type="button" disabled={e.locked} title={e.locked ? e.lockReason : undefined} onClick={() => onDelete(e)} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[0.90625rem] text-ink-soft hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"><MarkerIcon name="trash" className="size-3.5" />ลบ</button>
        )}
      </div>
    </article>
  );
}

/** ระยะเวลาของกิจกรรม: หลายวัน → "3 วัน" · มีเวลาเริ่ม-จบ → "1 ชม. 30 นาที" · อื่น ๆ ว่าง */
function durationOf(e) {
  if (e.endDate && e.endDate !== e.date) return `${diffDays(e.date, e.endDate) + 1} วัน`;
  if (!e.time || !e.endTime) return '';
  const [h1, m1] = e.time.split(':').map(Number);
  const [h2, m2] = e.endTime.split(':').map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (!(mins > 0)) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h && `${h} ชม.`, m && `${m} นาที`].filter(Boolean).join(' ');
}

/** การ์ดในแผง "กำหนดการ" (แบบใหม่): แถบสีหมวดด้านบน · ชื่อ + รายละเอียด · เวลา/ระยะเวลา · หมวด + ปุ่ม */
function ScheduleCard({ e, role, cat, onToggle, onEdit, onDelete }) {
  const c = cat(e.category);
  const time = e.time ? `${e.time}${e.endTime ? ` – ${e.endTime}` : ''} น.` : (e.endDate && e.endDate !== e.date ? `${shortDate(e.date)} – ${shortDate(e.endDate)}` : 'ทั้งวัน');
  const dur = durationOf(e);
  return (
    <article className={cx('tf-fade-up rounded-[18px] bg-tile p-4 ring-1 ring-line transition-shadow hover:shadow-[0_14px_30px_-22px_rgba(24,24,27,0.45)]', e.done && 'opacity-60')}>
      <div className="mb-3 h-1.5 rounded-full" style={{ background: c.color }} />
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={!!e.done} onChange={(x) => onToggle(e, x.target.checked)} className="mt-1 size-4 shrink-0 accent-[var(--color-orange)]" aria-label="ทำเครื่องหมายว่าเสร็จแล้ว" />
        <span className="min-w-0">
          <b className={cx('flex items-center gap-1.5 text-[1.0625rem] font-semibold leading-snug', e.done && 'line-through')}><MarkerIcon name={e.marker} />{e.title}</b>
          <small className="mt-0.5 block text-[0.875rem] text-ink-soft">{e.purpose || e.linkDocName || c.desc || c.label}</small>
        </span>
      </label>
      <div className="my-3 border-t border-dashed border-line" />
      <div className="flex items-center justify-between gap-2 text-[0.9375rem]">
        <span className="flex items-center gap-1.5"><MarkerIcon name="clock" className="size-4 text-ink-soft" />{time}</span>
        {dur && <span className="text-[0.875rem] text-ink-soft">{dur}</span>}
      </div>
      {(e.note || e.userNote) && <p className="mt-2 rounded-xl bg-white px-3 py-2 text-[0.875rem] ring-1 ring-line">{e.userNote || e.note}</p>}
      <div className="my-3 border-t border-dashed border-line" />
      <div className="flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
        <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-line"><i className="size-2 rounded-full" style={{ background: c.color }} />{c.label}</span>
        {e.priority === 'critical' && <span className="rounded-full bg-danger-soft px-2.5 py-1 font-medium text-danger">สำคัญมาก</span>}
        {e.priority === 'high' && <span className="rounded-full bg-[#FFF4DB] px-2.5 py-1 font-medium text-[#8A5A00]">สำคัญ</span>}
        {e.locked && <span className="flex items-center text-ink-soft" title={e.lockReason}><MarkerIcon name="lock" className="size-3.5" /></span>}
        <span className="flex-1" />
        {e.requestId ? <ViewLink role={role} view="inbox" className="rounded-lg px-2 py-1 font-medium text-orange-deep hover:bg-orange-pale" title="ไปกล่องรับเอกสาร"><MarkerIcon name="doc" className="size-3.5" /></ViewLink>
          : e.docId ? <ViewLink role={role} view="docs" query={{ doc: e.docId }} className="rounded-lg px-2 py-1 font-medium text-orange-deep hover:bg-orange-pale" title="เปิดเอกสาร"><MarkerIcon name="doc" className="size-3.5" /></ViewLink> : null}
        <button type="button" onClick={() => onEdit(e)} title={e.source === 'system' ? 'เพิ่มบันทึก' : 'แก้ไข'} className="cursor-pointer rounded-lg px-2 py-1 text-ink-soft hover:bg-white hover:text-ink"><MarkerIcon name="edit" className="size-3.5" /></button>
        {e.source === 'user' && (
          <button type="button" disabled={e.locked} title={e.locked ? e.lockReason : 'ลบ'} onClick={() => onDelete(e)} className="cursor-pointer rounded-lg px-2 py-1 text-ink-soft hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"><MarkerIcon name="trash" className="size-3.5" /></button>
        )}
      </div>
    </article>
  );
}

export default function CalendarPage() {
  const { role } = useOutletContext();
  const toast = useToast();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const meta = useQuery({ queryKey: ['calendar', 'meta'], queryFn: () => api.get('/api/calendar/meta'), staleTime: 60_000 });
  const today = meta.data ? meta.data.today : '';
  const [month, setMonth] = useState('');
  const [selected, setSelected] = useState('');
  const [view, setView] = useState(readView);
  const [hidden, setHidden] = useState(() => new Set());
  const [showDone, setShowDone] = useState(true);
  const [editor, setEditor] = useState(null); // { event, day }
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!today || month) return;
    const focus = params.get('date');
    const start = focus && /^\d{4}-\d{2}-\d{2}$/.test(focus) ? focus : today;
    setMonth(start.slice(0, 7));
    setSelected(start);
  }, [today, month, params]);

  const range = month ? gridRange(month) : null;
  const grid = useQuery({ queryKey: ['calendar', 'grid', month], queryFn: () => api.get(`/api/calendar?from=${range.start}&to=${range.end}`), enabled: !!month, placeholderData: (p) => p });
  const upcoming = useQuery({ queryKey: ['calendar', 'upcoming', today], queryFn: () => api.get(`/api/calendar?from=${addDays(today, -30)}&to=${addDays(today, 30)}`), enabled: !!today });
  const docs = useQuery({ queryKey: ['documents', 'all'], queryFn: () => api.get('/api/documents') });

  const refresh = () => qc.invalidateQueries({ queryKey: ['calendar'] });
  const cat = (id) => (meta.data ? meta.data.categories.find((c) => c.id === id) : null) || { id, label: id, color: '#71717A' };
  const visible = (e) => !hidden.has(e.category) && (showDone || !e.done);

  if (meta.isLoading || !month) return <><PageHeader title="ปฏิทินงาน" /><Skeleton className="h-[520px] w-full rounded-[24px]" /></>;
  if (meta.isError) return <><PageHeader title="ปฏิทินงาน" /><Card><EmptyState title="โหลดปฏิทินไม่สำเร็จ" text={meta.error.message} /></Card></>;

  const items = grid.data ? grid.data.items : [];
  const up = upcoming.data ? upcoming.data.items : [];
  const allKnown = [...items, ...up].filter((e, i, arr) => arr.findIndex((x) => String(x.id) === String(e.id)) === i);
  const [y, m] = month.split('-').map(Number);

  const stats = [
    { label: 'งานที่ต้องทำวันนี้', n: up.filter((e) => onDay(e, today) && !e.done).length, tone: 'bg-[linear-gradient(160deg,#FF8A4C,#FF6A00_60%,#EF5A12)] text-white' },
    { label: 'งานใน 7 วันข้างหน้า', n: up.filter((e) => e.date > today && e.date <= addDays(today, 7) && !e.done).length },
    { label: 'งานภาษีใกล้ถึงกำหนด', n: up.filter((e) => e.category === 'tax' && e.date >= today && e.date <= addDays(today, 30) && !e.done).length, sub: 'ภายใน 30 วัน' },
    { label: 'งานเลยกำหนด', n: up.filter((e) => (e.endDate || e.date) < today && !e.done && (e.source === 'user' || e.docId || e.requestId)).length, sub: 'ยังดำเนินการไม่เสร็จ', late: true },
  ];

  function go(day) {
    setSelected(day);
    if (day.slice(0, 7) !== month) setMonth(day.slice(0, 7));
  }
  function shift(n) {
    const next = shiftMonth(month, n);
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  }
  function setViewSaved(v) { setView(v); try { localStorage.setItem('tf_cal_view', v); } catch { /* ไม่จำก็ได้ */ } }
  function toggleCat(id) { setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function toggleDone(e, done) {
    try {
      if (e.source === 'system') await api.post('/api/calendar/overrides', { sysKey: e.id, done, note: e.userNote || '', marker: e.marker || 'none' });
      else await api.put(`/api/calendar/${encodeURIComponent(e.id)}`, { done });
      toast(done ? 'ทำเครื่องหมายว่าเสร็จแล้ว' : 'ยกเลิกเครื่องหมายเสร็จแล้ว');
    } catch (err) { toast(err.message, 'err'); } finally { void refresh(); }
  }

  function remove(e) {
    if (e.locked) { toast(`ไม่สามารถลบได้: ${e.lockReason}`, 'err'); return; }
    setConfirm({
      title: 'ลบกิจกรรม?', message: `"${e.title}" และไฟล์แนบของกิจกรรมนี้จะถูกลบ`, confirmText: 'ลบกิจกรรม', danger: true,
      onConfirm: async () => {
        setConfirm(null);
        try { await api.del(`/api/calendar/${encodeURIComponent(e.id)}`); toast('ลบกิจกรรมแล้ว'); setEditor(null); void refresh(); } catch (err) { toast(err.message, 'err'); }
      },
    });
  }

  const cardProps = { role, today, cat, onToggle: toggleDone, onEdit: (e) => setEditor({ event: e }), onDelete: remove };
  const counts = {};
  items.forEach((e) => { counts[e.category] = (counts[e.category] || 0) + 1; });
  const dayEvents = allKnown.filter((e) => onDay(e, selected) && visible(e));
  const soon = up.filter((e) => e.date >= today && e.date <= addDays(today, 14) && !e.done && visible(e)).slice(0, 8);

  return (
    <>
      <PageHeader
        title="ปฏิทินงาน"
        subtitle="กำหนดยื่นภาษี เอกสาร สัญญา การลงนาม และกิจกรรมของคุณในที่เดียว"
        actions={<Button variant="dark" onClick={() => setEditor({ day: selected })}><Icon name="plus" className="size-[1.125rem]" />เพิ่มกิจกรรม</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          // การ์ดสรุป: หัวข้อด้านบน · จำนวนตัวใหญ่ตามด้วยคำว่า "รายการ" · ข้อความรอง (ถ้ามี) · การ์ดขาวมีขอบและเงาเบา ๆ
          <div key={s.label} className={cx('tf-fade-up flex min-h-[7.5rem] flex-col justify-between gap-2 rounded-[22px] p-4 sm:px-6 sm:py-5',
            s.tone ? `${s.tone} shadow-[0_18px_36px_-22px_rgba(255,106,0,0.9)]` : s.late && s.n ? 'bg-danger-soft ring-1 ring-danger/20' : 'bg-white shadow-[0_10px_28px_-24px_rgba(24,24,27,0.5)] ring-1 ring-line')} style={{ animationDelay: `${i * 50}ms` }}>
            <b className="block text-[1rem] font-semibold leading-snug sm:text-[1.125rem]">{s.label}</b>
            <span className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <b className={cx('font-display text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums sm:text-[2.75rem]', s.late && s.n ? 'text-danger' : !s.tone && s.n ? 'text-orange-deep' : '')}>{s.n}</b>
                <span className={cx('text-[0.9375rem] font-medium', s.tone ? 'text-white/90' : 'text-ink-soft')}>รายการ</span>
              </span>
              {s.sub && <small className={cx('mt-1 block text-[0.875rem] leading-snug', s.tone ? 'text-white/85' : 'text-ink-soft')}>{s.sub}</small>}
            </span>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex-1" />
        <div className="flex rounded-full bg-white p-1" role="tablist" aria-label="รูปแบบการแสดงผล">
          {[['month', 'grid', 'เดือน'], ['list', 'list', 'รายการ']].map(([v, ic, label]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setViewSaved(v)}
              className={cx('flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-[0.96875rem] font-medium transition-colors', view === v ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}>
              <MarkerIcon name={ic} />{label}
            </button>
          ))}
        </div>
      </div>

      {/*
        ตัวกรองหมวด: เป็นสวิตช์เปิด/ปิดทีละหมวด ไม่ใช่แท็บที่เลือกได้ทีละอัน
        หมวดที่เปิดอยู่ = พื้นสีอ่อนของหมวดนั้น + ขอบสี + จุดทึบ   หมวดที่ปิด = จาง จุดกลวง
        (เดิมใช้ขีดฆ่าบอกว่าปิดอยู่ ซึ่งชนกับความหมาย "ทำเสร็จแล้ว" ที่ใช้ขีดฆ่าเหมือนกันในปฏิทิน)
      */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[0.9375rem] text-ink-soft">แสดงหมวด</span>
        {meta.data.categories.map((c) => {
          const on = !hidden.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              title={`${c.desc || c.label} · กดเพื่อ${on ? 'ซ่อน' : 'แสดง'}หมวดนี้`}
              onClick={() => toggleCat(c.id)}
              style={on ? { background: `color-mix(in srgb, ${c.color} 16%, var(--color-surface))`, boxShadow: `inset 0 0 0 1.5px ${c.color}` } : undefined}
              className={cx('flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.9375rem] transition-all',
                on ? 'font-medium text-ink' : 'bg-white/50 text-ink-soft opacity-70 ring-1 ring-line hover:opacity-100')}
            >
              <i className="size-2.5 rounded-full" style={on ? { background: c.color } : { boxShadow: 'inset 0 0 0 1.5px #A8A29E' }} />
              {c.label}
              {counts[c.id] ? <em className="not-italic text-ink-soft">{counts[c.id]}</em> : null}
            </button>
          );
        })}
        {/* ปุ่มล้างตัวกรอง โผล่เฉพาะตอนมีหมวดถูกซ่อนอยู่ จะได้ไม่ดูเหมือนแท็บที่เลือกค้างไว้ */}
        {hidden.size > 0 && (
          <button type="button" onClick={() => setHidden(new Set())}
            className="cursor-pointer rounded-full px-3 py-1.5 text-[0.9375rem] font-medium text-orange-deep hover:underline">
            แสดงทุกหมวด ({hidden.size} หมวดถูกซ่อน)
          </button>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[0.9375rem] text-ink-soft">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="size-4 accent-[var(--color-ink)]" />แสดงรายการที่เสร็จแล้ว
        </label>
      </div>

      {/* การ์ดปฏิทินแบบใหม่: ตารางเดือนเป็นช่องมุมมน (ซ้าย) + แผงกำหนดการของวันที่เลือก (ขวา) */}
      <section className="tf-fade-up overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(24,24,27,0.03)] xl:grid xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 p-3 sm:p-6">
          {/* ‹ เดือน ปี › : ชื่อเดือนอยู่กลางระหว่างลูกศร กดเพื่อเลือกเดือน/ปีได้ */}
          <div className="mb-4 flex items-center justify-between gap-2 px-1">
            <button type="button" onClick={() => shift(-1)} aria-label="เดือนก่อนหน้า" title="เดือนก่อนหน้า" className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1 ring-line transition-colors hover:bg-tile"><MarkerIcon name="left" /></button>
            <h2 className="sr-only">{TH_MONTHS[m - 1]} {y + 543}</h2>
            {/* ปุ่ม "วันนี้" อยู่ติดชื่อเดือน โผล่เฉพาะตอนกำลังดูวันอื่น/เดือนอื่น กดแล้วกลับมาที่วันนี้ */}
            <div className="flex min-w-0 items-center gap-1.5">
              <MonthYearPicker key={month} month={month} today={today} onPick={(key) => { setMonth(key); setSelected(key === today.slice(0, 7) ? today : `${key}-01`); }} />
              {selected !== today && (
                <button type="button" onClick={() => go(today)} title={`กลับไปวันนี้ (${longDate(today)})`}
                  className="tf-pop flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-orange-pale px-3 py-1.5 text-[0.875rem] font-medium text-orange-deep ring-1 ring-orange/30 transition-colors hover:bg-orange hover:text-white">
                  <MarkerIcon name="grid" className="size-3.5" />วันนี้
                </button>
              )}
            </div>
            <button type="button" onClick={() => shift(1)} aria-label="เดือนถัดไป" title="เดือนถัดไป" className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1 ring-line transition-colors hover:bg-tile"><MarkerIcon name="right" /></button>
          </div>
          {view === 'month' ? (
            <>
              {/* หัววัน: ป้ายพื้นอ่อนตัวหนา (เด่นกว่าเดิมที่เป็นตัวอักษรจาง) · เสาร์-อาทิตย์โทนส้ม · วันในสัปดาห์ของ "วันนี้" เป็นส้มทึบ */}
              <div className="mb-2 grid grid-cols-7 gap-1.5 text-[0.84375rem] font-semibold sm:gap-2.5 sm:text-[0.9375rem]">
                {TH_DAYS.map((d, i) => {
                  const isTodayCol = month === today.slice(0, 7) && toDate(today).getUTCDay() === i;
                  const weekend = i === 0 || i === 6;
                  return (
                    <div key={d} className={cx('truncate rounded-xl px-1.5 py-1.5 text-center sm:px-2.5 sm:py-2 sm:text-left',
                      isTodayCol ? 'bg-orange text-white shadow-[0_8px_18px_-12px_rgba(255,106,0,0.9)]' : weekend ? 'bg-orange-pale text-orange-deep' : 'bg-tile text-ink')}>
                      <span className="sm:hidden">{TH_DAYS_S[i]}</span><span className="hidden sm:inline">{d}</span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
                {Array.from({ length: 42 }, (_, i) => {
                  const day = addDays(range.start, i);
                  const evs = items.filter((e) => onDay(e, day) && visible(e));
                  const out = day.slice(0, 7) !== month;
                  const isToday = day === today;
                  const isSel = day === selected;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => go(day)}
                      onDoubleClick={() => setEditor({ day })}
                      aria-label={`${longDate(day)} ${evs.length} กิจกรรม`}
                      aria-pressed={isSel}
                      className={cx('relative flex min-h-[64px] cursor-pointer flex-col rounded-2xl p-1.5 text-left transition-all duration-200 sm:min-h-[112px] sm:p-2.5',
                        isToday ? 'bg-[linear-gradient(165deg,#FF8A3D_0%,#FF6A00_45%,rgba(255,106,0,0.16)_100%)] text-white shadow-[0_14px_30px_-18px_rgba(255,106,0,0.9)]'
                          : 'bg-tile hover:-translate-y-0.5 hover:bg-[#EFEBE7] hover:shadow-[0_10px_22px_-18px_rgba(24,24,27,0.5)]',
                        out && !isToday && 'opacity-45',
                        isSel && 'outline-2 outline-offset-[-2px] outline-dashed outline-orange')}
                    >
                      <span className="font-display text-[1rem] font-medium leading-none sm:text-[1.25rem]">{toDate(day).getUTCDate()}</span>
                      <span className="mt-auto hidden flex-col gap-1 pt-2 sm:flex">
                        {evs.slice(0, 2).map((e) => (
                          // ป้ายกิจกรรม: พื้นอ่อนตามสีหมวด + ขีดสีซ้าย ตัวอักษรเข้มตัวกลาง ยาวได้ 2 บรรทัด (เดิมบรรทัดเดียวสีจาง อ่านไม่ออก)
                          <span
                            key={e.id}
                            className={cx('line-clamp-2 break-words rounded-md py-0.5 pl-2 pr-1 text-[0.84375rem] font-medium leading-snug', isToday ? 'bg-white/25 text-white' : 'text-ink', e.done && 'line-through opacity-55')}
                            style={isToday ? { boxShadow: 'inset 3px 0 0 #fff' } : { background: `color-mix(in srgb, ${cat(e.category).color} 15%, var(--color-surface))`, boxShadow: `inset 3px 0 0 ${cat(e.category).color}` }}
                            title={`${e.time ? `${e.time} ` : ''}${e.title}`}
                          >
                            {e.title}
                          </span>
                        ))}
                        {evs.length > 2 && <span className={cx('pl-1 text-[0.8125rem] font-medium', isToday ? 'text-white/85' : 'text-ink-soft')}>+{evs.length - 2} รายการ</span>}
                      </span>
                      <span className="mt-auto flex gap-0.5 sm:hidden">
                        {[...new Set(evs.map((e) => cat(e.category).color))].slice(0, 4).map((c) => <i key={c} className="size-1.5 rounded-full" style={{ background: isToday ? '#fff' : c }} />)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 px-1 text-[0.875rem] text-ink-soft">คลิกวันที่เพื่อดูกำหนดการ ดับเบิลคลิกเพื่อเพิ่มกิจกรรมในวันนั้น</p>
            </>
          ) : (() => {
            const inMonth = items.filter((e) => visible(e) && e.date.slice(0, 7) <= month && (e.endDate || e.date).slice(0, 7) >= month);
            const byDay = {};
            inMonth.forEach((e) => { const k = e.date.slice(0, 7) < month ? `${month}-01` : e.date; (byDay[k] = byDay[k] || []).push(e); });
            const days = Object.keys(byDay).sort((a, b) => a.localeCompare(b));
            if (!days.length) return <EmptyState title="ไม่มีกิจกรรมในเดือนนี้" text="เพิ่มกิจกรรม หรือเลือกหมวดหมู่อื่นเพื่อแสดงรายการ" />;
            return (
              <div className="flex flex-col gap-4 p-1">
                {days.map((day) => (
                  <div key={day} className="grid gap-3 sm:grid-cols-[90px_1fr]">
                    <button type="button" onClick={() => go(day)} className={cx('flex h-fit cursor-pointer items-center gap-2 rounded-2xl p-2 text-left sm:flex-col sm:items-start', day === today ? 'bg-orange-pale' : 'bg-tile')}>
                      <b className="font-display text-[1.625rem] font-normal leading-none">{toDate(day).getUTCDate()}</b>
                      <span className="text-[0.875rem] leading-tight">{TH_DAYS[toDate(day).getUTCDay()]}<small className="block text-ink-soft">{relative(today, day)}</small></span>
                    </button>
                    <div className="flex flex-col gap-2">{byDay[day].map((e) => <EventCard key={e.id} e={e} {...cardProps} />)}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* แผงกำหนดการของวันที่เลือก: จัดกลุ่มตามเวลา มีเส้นคั่นแบบไทม์ไลน์ */}
        <aside className="border-t border-line p-4 sm:p-6 xl:max-h-[calc(100vh-120px)] xl:overflow-y-auto xl:border-l xl:border-t-0">
          <div className="mb-5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-[1.375rem] font-medium leading-tight">กำหนดการ</h3>
              <p className="mt-0.5 text-[0.875rem] text-ink-soft">{longDate(selected)} · {relative(today, selected)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => go(addDays(selected, -1))} aria-label="วันก่อนหน้า" title="วันก่อนหน้า" className="flex size-9 cursor-pointer items-center justify-center rounded-full ring-1 ring-line hover:bg-tile"><MarkerIcon name="left" className="size-4" /></button>
              <button type="button" onClick={() => go(addDays(selected, 1))} aria-label="วันถัดไป" title="วันถัดไป" className="flex size-9 cursor-pointer items-center justify-center rounded-full ring-1 ring-line hover:bg-tile"><MarkerIcon name="right" className="size-4" /></button>
              <button type="button" onClick={() => setEditor({ day: selected })} aria-label="เพิ่มกิจกรรมในวันนี้" title="เพิ่มกิจกรรม" className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-orange text-white shadow-[0_8px_18px_-10px_rgba(255,106,0,0.9)] transition-transform hover:scale-105"><Icon name="plus" className="size-[1.125rem]" /></button>
            </div>
          </div>
          <div key={selected} className="flex flex-col gap-4">
            {dayEvents.length ? (() => {
              const groups = [];
              [...dayEvents].sort((a, b) => (a.time || '').localeCompare(b.time || '')).forEach((e) => {
                const k = e.time || 'ทั้งวัน';
                const g = groups.find((x) => x.k === k);
                if (g) g.items.push(e); else groups.push({ k, items: [e] });
              });
              return groups.map((g) => (
                <div key={g.k} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 text-[0.875rem] font-medium"><span className="font-mono">{g.k}</span><span className="h-px flex-1 bg-line" /></div>
                  {g.items.map((e) => <ScheduleCard key={e.id} e={e} {...cardProps} />)}
                </div>
              ));
            })() : (
              <div className="rounded-[18px] bg-tile px-4 py-8 text-center">
                <p className="mb-3 text-[0.96875rem] text-ink-soft">ยังไม่มีกิจกรรมในวันนี้</p>
                <Button variant="soft" className="!bg-white" onClick={() => setEditor({ day: selected })}><Icon name="plus" className="size-4" />เพิ่มกิจกรรม</Button>
              </div>
            )}
          </div>
        </aside>
      </section>

      <div className="mt-5">
        <Card title="กำลังจะถึงใน 14 วัน" bodyClassName="!px-3 sm:!px-3">
            {soon.length ? soon.map((e) => (
              <button key={e.id} type="button" onClick={() => go(e.date)} className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-tile">
                <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none" style={{ background: `${cat(e.category).color}1A`, color: cat(e.category).color }}>
                  <b className="font-display text-[1.0625rem] font-medium">{toDate(e.date).getUTCDate()}</b>
                  <small className="text-[0.75rem]">{TH_MONTHS[toDate(e.date).getUTCMonth()].slice(0, 3)}.</small>
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[0.96875rem] font-medium">{e.title}</b>
                  <small className="text-[0.875rem] text-ink-soft">{cat(e.category).label} · {relative(today, e.date)}</small>
                </span>
                {e.locked && <MarkerIcon name="lock" className="size-3.5 text-ink-soft" />}
              </button>
            )) : <p className="px-3 py-2 text-[0.96875rem] text-ink-soft">ไม่มีกิจกรรมที่ยังไม่เสร็จในช่วงนี้</p>}
        </Card>
      </div>

      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[0.875rem] text-ink-soft">
        <span className="flex items-center gap-1.5"><MarkerIcon name="lock" className="size-3" />ล็อก: กิจกรรมจากระบบ ระดับสำคัญมาก หรือผูกกับเอกสารที่ยืนยันแล้ว จะลบไม่ได้</span>
        <span>กำหนดยื่นภาษีเป็นการประมาณตามหลักทั่วไป ไม่ได้เลื่อนตามวันหยุดราชการ</span>
      </p>

      {editor && (
        <EventEditor
          event={editor.event}
          day={editor.day || selected}
          meta={meta.data}
          role={role}
          docs={docs.data ? docs.data.items : []}
          onClose={() => setEditor(null)}
          onSaved={(day) => { setEditor(null); go(day); void refresh(); }}
          onDelete={remove}
        />
      )}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </>
  );
}
