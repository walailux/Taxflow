/**
 * TopBar.jsx แถบบนของทุกหน้าหลังเข้าสู่ระบบ (ย้ายจาก search.js / notify.js / ปุ่มคำนวณภาษีของหน้าเดิม)
 * - ค้นหารวม เอกสาร/คู่ค้า/คลังเอกสาร (Ctrl/⌘+K) หน่วง 250ms ไม่ยิง API ทุกตัวอักษร
 * - กระดิ่งแจ้งเตือน แยกตามประเภท (ดู NotificationBell.jsx)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { STATUS_LABEL } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Spinner, cx } from '../../components/ui.jsx';
import TaxCalcDialog from './TaxCalcDialog.jsx';
import AppearanceMenu from './AppearanceMenu.jsx';
import Avatar from '../../components/Avatar.jsx';
import SunMoonKnob from '../../components/SunMoonKnob.jsx';
import { ROLE_TAG } from './nav.js';
import { goView } from './ViewLink.jsx';
import NotificationBell from './NotificationBell.jsx';
import { useTheme } from '../../lib/theme.js';
import CalcAppIcon from '../../components/CalcAppIcon.jsx';

function useClickOutside(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside, active]);
}

function GlobalSearch({ role }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const input = useRef(null);
  const close = () => setOpen(false);
  useClickOutside(box, close, open);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); input.current?.select(); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const res = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });

  function go(view, query) {
    setOpen(false);
    setText('');
    goView(navigate, role, view, query);
  }

  const d = res.data;
  const groups = d ? [
    ['เอกสาร', d.documents.map((x) => ({ key: `d${x.id}`, title: x.docNo, sub: `${x.counterparty || 'ไม่ระบุคู่ค้า'} · ${STATUS_LABEL[x.status] || x.status}`, go: () => go('docs', { doc: x.id }) }))],
    ['คู่ค้า', d.contacts.map((x) => ({ key: `c${x.id}`, title: x.name, sub: x.taxId || 'ไม่มีเลขผู้เสียภาษี', go: () => go('contacts') }))],
    ['คลังเอกสารของฉัน', d.library.map((x) => ({ key: `l${x.id}`, title: x.title || x.filename || 'เอกสาร', sub: x.category || '', go: () => go('library') }))],
  ].filter(([, items]) => items.length) : [];

  return (
    <div ref={box} className="relative min-w-11 flex-1 sm:max-w-[420px]">
      <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ink-soft" />
      <input
        ref={input}
        type="search"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="ค้นหาเอกสาร คู่ค้า คลังเอกสาร…"
        aria-label="ค้นหา"
        className="tf-input !rounded-full !bg-white !py-2.5 !pl-10 !pr-4 shadow-[0_1px_2px_rgba(24,24,27,0.05)]"
      />
      {open && q.length >= 2 && (
        <div className="tf-pop absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-24px_rgba(24,24,27,0.35)]">
          {res.isFetching && !d && <p className="flex items-center gap-2 px-3 py-3 text-[0.96875rem] text-ink-soft"><Spinner /> กำลังค้นหา</p>}
          {d && !groups.length && <p className="px-3 py-3 text-[0.96875rem] text-ink-soft">ไม่พบผลลัพธ์สำหรับ "{q}"</p>}
          {groups.map(([label, items]) => (
            <div key={label} className="mb-1">
              <div className="px-3 pb-1 pt-2 text-[0.84375rem] font-medium text-[#8A847E]">{label}</div>
              {items.map((it) => (
                <button key={it.key} type="button" onClick={it.go} className="flex w-full cursor-pointer flex-col rounded-xl px-3 py-2 text-left transition-colors hover:bg-field">
                  <b className="truncate text-[1rem] font-medium">{it.title}</b>
                  <small className="truncate text-[0.90625rem] text-ink-soft">{it.sub}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * สวิตช์โหมดกลางวัน/กลางคืน: รางมีไอคอนดวงอาทิตย์ (ซ้าย) และดวงจันทร์ (ขวา) ปุ่มกลมท้องฟ้าเลื่อนไปฝั่งโหมดที่เปิดอยู่
 * มือถือ (ต่ำกว่า 640px) แสดงแค่ปุ่มกลม · สีทั้งหน้าค่อย ๆ จางเปลี่ยน (lib/theme.js + .tf-theme-switching) ไม่แสบตา
 * role="switch" อ่านได้ด้วยโปรแกรมอ่านหน้าจอ · ป้ายคำอธิบายแบบกำหนดเอง (แทน title ของเบราว์เซอร์) ขึ้นตอนชี้/โฟกัส
 */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === 'dark';
  // ป้ายอธิบายใช้ title → TooltipLayer เหมือนทุกปุ่มในเว็บ (ซ่อนเองเมื่อกด/เอาเมาส์ออก)
  return (
    <div className="relative">
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label="โหมดกลางคืน"
        title={dark ? 'โหมดกลางคืน · กดเพื่อกลับเป็นกลางวัน' : 'โหมดกลางวัน · กดเพื่อเปลี่ยนเป็นกลางคืน'}
        onClick={toggle}
        className={cx('relative flex size-10 shrink-0 sm:h-11 sm:w-[5.25rem] cursor-pointer items-center rounded-full p-1 shadow-[0_1px_2px_rgba(24,24,27,0.05)] ring-1 transition-colors duration-300',
          dark ? 'bg-[#2A2522] ring-[#3A3431]' : 'bg-white ring-line')}
      >
        {/* ไอคอนบนราง (จาง) */}
        <span aria-hidden="true" className="relative z-0 hidden w-full items-center justify-between px-[0.6875rem] sm:flex">
          <Icon name="sun" className={cx('size-[1.0625rem] transition-colors', dark ? 'text-[#6E6863]' : 'text-transparent')} />
          <Icon name="moon" className={cx('size-[1.0625rem] transition-colors', dark ? 'text-transparent' : 'text-[#A8A29E]')} />
        </span>
        {/* ปุ่มกลม = ท้องฟ้ากลางวัน/กลางคืน ดวงอาทิตย์กับดวงจันทร์สลับกันตามแนวโค้ง (SunMoonKnob)
            จอใหญ่: เลื่อนซ้าย/ขวาบนรางเหมือนเดิม · มือถือ: เหลือแค่วงกลม */}
        <span
          aria-hidden="true"
          className={cx('tf-sky-knob absolute left-1 top-1 z-10 isolate size-8 overflow-hidden rounded-full shadow-[0_4px_10px_-4px_rgba(0,0,0,0.45)] ring-1 ring-black/5 transition-transform duration-500 ease-[var(--ease-pop)] sm:size-9',
            dark ? 'translate-x-0 sm:translate-x-[2.5rem]' : 'translate-x-0')}
        >
          <SunMoonKnob theme={theme} />
        </span>
      </button>
    </div>
  );
}

/**
 * ป้ายชื่อมุมขวาบน: กดแล้วเปิดเมนู "แก้ไขโปรไฟล์" กับ "ออกจากระบบ"
 * (ปุ่มออกจากระบบในแถบเมนูซ้ายยังอยู่เหมือนเดิม) ปิดเมนูด้วย Esc หรือคลิกนอกกล่อง
 */
function ProfileMenu({ user, role, onLogout }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(box, close, open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function logout() {
    setBusy(true);
    try { await onLogout(); } finally { setBusy(false); }
  }

  const name = user.companyName || user.displayName || '-';
  const item = 'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.96875rem] font-medium transition-colors';
  return (
    <div ref={box} className="relative ml-1 hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="โปรไฟล์ของฉัน"
        className="flex cursor-pointer items-center gap-2.5 rounded-full bg-white py-1 pl-1 pr-3 text-left shadow-[0_1px_2px_rgba(24,24,27,0.05)] transition-shadow hover:shadow-[0_8px_18px_-10px_rgba(24,24,27,0.35)]"
      >
        <Avatar user={user} className="size-9 rounded-full" textClass="text-[0.9375rem]" />
        {/* แท็บเล็ต (ต่ำกว่า 1024px) แสดงแค่รูป ชื่อยาว ๆ + ตัวอักษรใหญ่ทำให้แถบบนล้นจอด้านขวา · ชื่อเต็มอยู่ในเมนูที่เปิด */}
        <span className="hidden min-w-0 max-w-[180px] leading-tight lg:block">
          <b className="block truncate text-[0.90625rem] font-semibold">{name}</b>
          <small className="block truncate text-[0.78125rem] text-ink-soft">{ROLE_TAG[role]}</small>
        </span>
        <Icon name="chevron" className={cx('size-4 shrink-0 text-ink-soft transition-transform duration-200', open ? '-rotate-90' : 'rotate-90')} />
      </button>
      {open && (
        <div role="menu" aria-label="เมนูบัญชี" className="tf-pop absolute right-0 top-[calc(100%+8px)] z-40 w-[260px] rounded-2xl border border-line bg-white p-2 shadow-[0_24px_60px_-24px_rgba(24,24,27,0.35)]">
          <div className="border-b border-line px-3 pb-2.5 pt-1.5">
            <b className="block truncate text-[0.96875rem] font-semibold">{name}</b>
            <small className="block truncate text-[0.84375rem] text-ink-soft">{user.email}</small>
          </div>
          <div className="pt-1.5">
            {role !== 'admin' && (
              <Link to="/app/profile" role="menuitem" onClick={close} className={cx(item, 'text-ink hover:bg-field')}>
                <Icon name="user" className="size-[1.125rem] text-orange-deep" />แก้ไขโปรไฟล์
              </Link>
            )}
            <button type="button" role="menuitem" onClick={logout} disabled={busy} className={cx(item, 'text-danger hover:bg-danger-soft disabled:cursor-wait disabled:opacity-60')}>
              {busy ? <Spinner /> : <Icon name="logout" className="size-[1.125rem]" />}ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopBar({ role, user, onMenu, sideHidden, onLogout }) {
  const [calc, setCalc] = useState(false);
  const closeCalc = useCallback(() => setCalc(false), []);
  const isAdmin = role === 'admin';
  return (
    <header className="sticky top-0 z-30 bg-paper/85 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-10 lg:py-5">
      <div className="mx-auto flex max-w-[1200px] items-center gap-1.5 sm:gap-3">
        {/* จอเล็กเท่านั้น: เปิดเมนูเลื่อนออก · จอใหญ่ใช้แฮมเบอร์เกอร์บนแถบไอคอนซ้ายแทน */}
        <button type="button" onClick={onMenu} aria-label="เปิดเมนู" title="เปิดเมนู" className="tf-anim-host flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white ring-1 ring-line transition-colors hover:bg-field sm:size-11 lg:hidden">
          <Icon name="menu" />
        </button>
        <Link to="/app" className={cx('hidden shrink-0 sm:block', !sideHidden && 'lg:hidden')} aria-label="TaxFlow หน้าแรก"><img src="/img/logo.png" alt="TaxFlow" className="h-8 w-auto" /></Link>
        {!isAdmin && <GlobalSearch role={role} />}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {!isAdmin && (
            <button type="button" onClick={() => setCalc(true)} title="เครื่องคิดเลขภาษี" aria-label="เครื่องคิดเลขภาษี" className="tf-anim-host flex size-10 cursor-pointer items-center justify-center rounded-full bg-white sm:size-11 shadow-[0_1px_2px_rgba(24,24,27,0.05)] transition-all hover:-translate-y-px hover:shadow-[0_8px_18px_-10px_rgba(24,24,27,0.35)]">
              <CalcAppIcon className="size-7 sm:size-[1.875rem]" />
            </button>
          )}
          <AppearanceMenu />
          <ThemeToggle />
          <NotificationBell role={role} />
          {user && <ProfileMenu user={user} role={role} onLogout={onLogout} />}
        </div>
      </div>
      {calc && <TaxCalcDialog onClose={closeCalc} />}
    </header>
  );
}
