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
    ['คลังเอกสาร', d.library.map((x) => ({ key: `l${x.id}`, title: x.title || x.filename || 'เอกสาร', sub: x.category || '', go: () => go('library') }))],
  ].filter(([, items]) => items.length) : [];

  return (
    <div ref={box} className="relative min-w-0 flex-1 sm:max-w-[420px]">
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
 * สวิตช์โหมดกลางวัน/กลางคืน: รางมีไอคอนดวงอาทิตย์ (ซ้าย) และดวงจันทร์ (ขวา) ปุ่มกลมเลื่อนไปฝั่งโหมดที่เปิดอยู่
 * role="switch" อ่านได้ด้วยโปรแกรมอ่านหน้าจอ · ป้ายคำอธิบายแบบกำหนดเอง (แทน title ของเบราว์เซอร์) ขึ้นตอนชี้/โฟกัส
 */
function ThemeToggle() {
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
        className={cx('relative flex h-11 w-[5.25rem] shrink-0 cursor-pointer items-center rounded-full p-1 shadow-[0_1px_2px_rgba(24,24,27,0.05)] ring-1 transition-colors duration-300',
          dark ? 'bg-[#2A2522] ring-[#3A3431]' : 'bg-white ring-line')}
      >
        {/* ไอคอนบนราง (จาง) */}
        <span aria-hidden="true" className="relative z-0 flex w-full items-center justify-between px-[0.6875rem]">
          <Icon name="sun" className={cx('size-[1.0625rem] transition-colors', dark ? 'text-[#6E6863]' : 'text-transparent')} />
          <Icon name="moon" className={cx('size-[1.0625rem] transition-colors', dark ? 'text-transparent' : 'text-[#A8A29E]')} />
        </span>
        {/* ปุ่มกลมเลื่อน: กลางวัน = ส้ม + ดวงอาทิตย์ · กลางคืน = น้ำเงินเข้ม + ดวงจันทร์ */}
        <span
          aria-hidden="true"
          className={cx('absolute left-1 top-1 z-10 flex size-9 items-center justify-center rounded-full text-white shadow-[0_4px_10px_-4px_rgba(0,0,0,0.45)] transition-[transform,background-color] duration-300 ease-[var(--ease-pop)]',
            dark ? 'translate-x-[2.5rem] bg-[#3B4A7A]' : 'translate-x-0 bg-orange')}
        >
          <span key={theme} className="tf-theme-icon flex">
            <Icon name={dark ? 'moon' : 'sun'} className={cx('size-[1.125rem]', dark && 'text-[#F2C46B]')} />
          </span>
        </span>
      </button>
    </div>
  );
}

export default function TopBar({ role, user, onMenu, sideHidden }) {
  const [calc, setCalc] = useState(false);
  const closeCalc = useCallback(() => setCalc(false), []);
  const isAdmin = role === 'admin';
  return (
    <header className="sticky top-0 z-30 bg-paper/85 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-10 lg:py-5">
      <div className="mx-auto flex max-w-[1200px] items-center gap-2.5 sm:gap-3">
        {/* จอเล็กเท่านั้น: เปิดเมนูเลื่อนออก · จอใหญ่ใช้แฮมเบอร์เกอร์บนแถบไอคอนซ้ายแทน */}
        <button type="button" onClick={onMenu} aria-label="เปิดเมนู" title="เปิดเมนู" className="tf-anim-host flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white ring-1 ring-line transition-colors hover:bg-field lg:hidden">
          <Icon name="menu" />
        </button>
        <Link to="/app" className={cx('hidden shrink-0 sm:block', !sideHidden && 'lg:hidden')} aria-label="TaxFlow หน้าแรก"><img src="/img/logo.png" alt="TaxFlow" className="h-8 w-auto" /></Link>
        {!isAdmin && <GlobalSearch role={role} />}
        <div className="ml-auto flex items-center gap-2">
          {!isAdmin && (
            <button type="button" onClick={() => setCalc(true)} title="เครื่องคิดเลขภาษี" aria-label="เครื่องคิดเลขภาษี" className="tf-anim-host flex size-11 cursor-pointer items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(24,24,27,0.05)] transition-all hover:-translate-y-px hover:shadow-[0_8px_18px_-10px_rgba(24,24,27,0.35)]">
              <CalcAppIcon className="size-[1.875rem]" />
            </button>
          )}
          <AppearanceMenu />
          <ThemeToggle />
          <NotificationBell role={role} />
          {user && (
            <Link to={isAdmin ? '/app' : '/app/profile'} className="ml-1 hidden items-center gap-2.5 rounded-full bg-white py-1 pl-1 pr-4 shadow-[0_1px_2px_rgba(24,24,27,0.05)] transition-shadow hover:shadow-[0_8px_18px_-10px_rgba(24,24,27,0.35)] sm:flex" title="โปรไฟล์ของฉัน">
              <Avatar user={user} className="size-9 rounded-full" textClass="text-[0.9375rem]" />
              <span className="min-w-0 max-w-[180px] leading-tight">
                <b className="block truncate text-[0.90625rem] font-semibold">{user.companyName || user.displayName || '-'}</b>
                <small className="block truncate text-[0.78125rem] text-ink-soft">{ROLE_TAG[role]}</small>
              </span>
            </Link>
          )}
        </div>
      </div>
      {calc && <TaxCalcDialog onClose={closeCalc} />}
    </header>
  );
}
