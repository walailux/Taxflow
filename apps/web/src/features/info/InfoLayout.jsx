/**
 * InfoLayout.jsx โครงหน้าข้อมูลสาธารณะ (ภาพรวมระบบ / คู่มือ / นโยบายความเป็นส่วนตัว / กฎหมาย) ย้ายจาก info.js
 * - เมนูด้านบน (มือถือพับเป็นปุ่ม) แถบความคืบหน้าการอ่าน ปุ่มกลับด้านบน สารบัญที่ไฮไลต์หัวข้อที่กำลังอ่าน
 * - ส่วนที่มีคลาส .reveal / .ip-flow / .ip-retention / .ip-stats ค่อยๆ ปรากฏเมื่อเลื่อนถึง
 * - Tabs/Tab/Panel, Chips/Chip/Filtered, Count เป็นคอมโพเนนต์ที่หน้าเนื้อหาเรียกใช้
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import './info.css';

const MENU = [
  ['/overview', 'ภาพรวมระบบ'],
  ['/guide', 'ศูนย์ความรู้', true],
  ['/guide/laws', 'กฎหมาย'],
  ['/guide/privacy', 'ความเป็นส่วนตัว'],
];
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const Ctx = createContext(null);

export function InfoLayout({ title, tabs = {}, children }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(tabs);
  const [filters, setFilters] = useState({});
  const nav = useRef(null);
  const main = useRef(null);
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.title = `TaxFlow ${title}`;
    return () => { document.title = 'TaxFlow'; };
  }, [title]);
  useEffect(() => {
    setOpen(false);
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  // แถบความคืบหน้า + เงาเมนู + ปุ่มกลับด้านบน
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? (window.scrollY / h) * 100 : 0);
      setScrolled(window.scrollY > 8);
      setShowTop(window.scrollY > 700);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ปิดเมนูมือถือเมื่อคลิกนอกเมนูหรือกด Esc
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (nav.current && !nav.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // ค่อยๆ แสดงเมื่อเลื่อนถึง และหน่วงเวลาทีละใบในกลุ่มการ์ด
  useEffect(() => {
    const root = main.current;
    root.querySelectorAll('[data-stagger]').forEach((g) => {
      [...g.children].filter((c) => c.classList.contains('reveal')).forEach((c, i) => c.style.setProperty('--d', `${i * 0.08}s`));
    });
    const targets = root.querySelectorAll('.reveal, .ip-flow, .ip-retention, .ip-stats');
    if (!('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('in')); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  // สารบัญ: ไฮไลต์หัวข้อที่กำลังอ่าน
  useEffect(() => {
    const links = [...main.current.querySelectorAll('.ip-toc a[href^="#"]')];
    if (!links.length || !('IntersectionObserver' in window)) return undefined;
    const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.remove('active'));
        byId.get(en.target.id)?.classList.add('active');
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
    return () => spy.disconnect();
  }, [pathname]);

  const toTop = () => window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });

  return (
    <Ctx.Provider value={{ active, setActive, filters, setFilters }}>
      <div className="ip-body">
        <div className="ip-progress" aria-hidden="true" style={{ width: `${progress}%` }} />
        <header ref={nav} className={['ip-nav', scrolled && 'scrolled', open && 'open'].filter(Boolean).join(' ')}>
          <div className="ip-nav-inner">
            <Link className="ip-brand" to="/overview" aria-label="TaxFlow หน้าภาพรวมระบบ"><img src="/img/logo.png" alt="TaxFlow" /></Link>
            <nav className="ip-menu" aria-label="เมนูข้อมูลระบบ">
              {MENU.map(([to, label, end]) => <NavLink key={to} to={to} end={!!end} className={({ isActive }) => (isActive ? 'active' : undefined)}>{label}</NavLink>)}
            </nav>
            <Link className="ip-back" to="/login">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              <span>กลับเข้าสู่ระบบ</span>
            </Link>
            <button className="ip-burger" type="button" aria-label="เปิดเมนู" aria-expanded={open} onClick={() => setOpen((o) => !o)}><span /></button>
          </div>
        </header>
        <main ref={main}>{children}</main>
        <footer className="ip-footer">
          <div className="ip-wrap">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><img src="/img/logo.png" alt="TaxFlow" /><span>ระบบต้นแบบเพื่อการศึกษา</span></div>
            <div>{MENU.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}<Link to="/verify-doc">ตรวจสอบเอกสาร</Link></div>
          </div>
        </footer>
        <button className={`ip-totop${showTop ? ' show' : ''}`} type="button" aria-label="กลับไปด้านบน" onClick={toTop}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
        </button>
      </div>
    </Ctx.Provider>
  );
}

/* ---------- แท็บ ---------- */
const TabsCtx = createContext(null);

export function Tabs({ group, children }) {
  const { active, setActive } = useContext(Ctx);
  const box = useRef(null);
  const [ink, setInk] = useState(null);
  const current = active[group];

  useLayoutEffect(() => {
    const move = () => {
      const b = box.current && box.current.querySelector('.ip-tab.active');
      if (b) setInk({ width: b.offsetWidth, transform: `translateX(${b.offsetLeft - 5}px)` });
    };
    move();
    window.addEventListener('resize', move);
    if (document.fonts) document.fonts.ready.then(move, () => {});
    return () => window.removeEventListener('resize', move);
  }, [current]);

  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const btns = [...box.current.querySelectorAll('.ip-tab')];
    const i = btns.findIndex((b) => b.classList.contains('active'));
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    setActive((a) => ({ ...a, [group]: next.dataset.panel }));
    next.focus();
  };

  return (
    <TabsCtx.Provider value={{ current, pick: (id) => setActive((a) => ({ ...a, [group]: id })) }}>
      <div ref={box} className="ip-tabs" role="tablist" tabIndex={-1} onKeyDown={onKey}>
        <span className="ip-tab-ink" aria-hidden="true" style={ink || undefined} />
        {children}
      </div>
    </TabsCtx.Provider>
  );
}

export function Tab({ id, children }) {
  const { current, pick } = useContext(TabsCtx);
  const on = current === id;
  return (
    <button type="button" role="tab" data-panel={id} aria-selected={on} aria-controls={id} tabIndex={on ? 0 : -1}
      className={`ip-tab${on ? ' active' : ''}`} onClick={() => pick(id)}>
      {children}
    </button>
  );
}

export function Panel({ id, group, className, children }) {
  const { active } = useContext(Ctx);
  const on = active[group] === id;
  return <div id={id} role="tabpanel" className={['ip-panel', on && 'active', className].filter(Boolean).join(' ')}>{children}</div>;
}

/* ---------- ตัวกรองการ์ด ---------- */
const ChipsCtx = createContext(null);

export function Chips({ target, label, children }) {
  const { filters, setFilters } = useContext(Ctx);
  const current = filters[target] || 'all';
  return (
    <ChipsCtx.Provider value={{ current, pick: (v) => setFilters((f) => ({ ...f, [target]: v })) }}>
      <div className="ip-chips reveal" role="group" aria-label={label}>{children}</div>
    </ChipsCtx.Provider>
  );
}

export function Chip({ value, children }) {
  const { current, pick } = useContext(ChipsCtx);
  const on = current === value;
  return <button type="button" className={`ip-chip${on ? ' active' : ''}`} aria-pressed={on} onClick={() => pick(value)}>{children}</button>;
}

/** กล่องการ์ดที่ถูกกรอง: ซ่อนการ์ดที่ data-basis ไม่ตรงด้วย CSS (ดู .ip-filtered ใน info.css) */
export function Filtered({ id, className, children, ...rest }) {
  const { filters } = useContext(Ctx);
  const f = filters[id] || 'all';
  return <div id={id} {...rest} className={`${className || ''} ip-filtered`} data-filter={f}>{children}</div>;
}

/* ---------- ตัวเลขนับเมื่อเลื่อนถึง ---------- */
export function Count({ to, text }) {
  const target = Number(to);
  const dec = (String(to).split('.')[1] || '').length;
  const fmt = (n) => n.toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const [shown, setShown] = useState(() => (reduceMotion() ? text || fmt(target) : fmt(0)));
  const el = useRef(null);
  useEffect(() => {
    if (reduceMotion() || !('IntersectionObserver' in window)) { setShown(text || fmt(target)); return undefined; }
    let raf;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.max(0, Math.min(1, (t - t0) / 1300));
        setShown(p < 1 ? fmt(target * (1 - Math.pow(1 - p, 3))) : text || fmt(target));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.15 });
    io.observe(el.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, text]);
  return <span ref={el}>{shown}</span>;
}
