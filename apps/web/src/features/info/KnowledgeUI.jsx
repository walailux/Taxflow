/**
 * KnowledgeUI.jsx ชิ้นส่วนของศูนย์ความรู้: ไอคอน · การ์ดโฟลเดอร์ (ชี้แล้วกระดาษเลื่อนออก กดแล้วเปิดโฟลเดอร์)
 * breadcrumb · accordion (ขยายแบบนุ่มด้วย grid-rows) · ตัวแสดงเนื้อหาบทความแต่ละชนิด (Blocks)
 */
import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { folderOf, readMinutes } from './knowledge.js';

const P = {
  rocket: <><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M9 15l-3-3c1-4 4-8 9-9 1 0 2 0 3 1 1 1 1 2 1 3-1 5-5 8-9 9z" /><circle cx="15" cy="9" r="1.6" /></>,
  doc: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  calc: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8.5 7h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h3.5" /></>,
  scale: <><path d="M12 3v18M7 21h10M5 7h14" /><path d="M5 7l-2.5 6a3 3 0 005 0zM19 7l-2.5 6a3 3 0 005 0z" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17h.01" /></>,
  book: <><path d="M4 19V5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z" /><path d="M4 19a2 2 0 002 2h12v-4" /><path d="M9 7h6M9 11h4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6.5 6.5 0 013.5 6" /></>,
  building: <><path d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 9h2a2 2 0 012 2v10M2 21h20" /><path d="M8 7h4M8 11h4M8 15h4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16.5a3.6 3.6 0 017 0M14 10h4M14 14h3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  flag: <><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  percent: <><path d="M19 5L5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  cut: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 7.5L20 18M8.5 16.5L20 6" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  file: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></>,
  stamp: <><path d="M9 3h6l-1 7h3a2 2 0 012 2v3H5v-3a2 2 0 012-2h3z" /><path d="M5 19h14" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  eyeoff: <><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A9.6 9.6 0 0112 5c5 0 9 5 9 7a10 10 0 01-2.3 3.2M6.3 6.3C4.1 7.7 3 10 3 12c0 2 4 7 9 7 1.6 0 3-.4 4.3-1" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 018 0v3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  hand: <><path d="M8 11V5a1.5 1.5 0 013 0v5M11 10V4a1.5 1.5 0 013 0v6M14 10V5.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-.5A6.5 6.5 0 014 15.5V12a1.5 1.5 0 013 0v1" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 7l9 6 9-6" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></>,
  bell: <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 003.4 0" />,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2.5v3M16 2.5v3" /></>,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3M21 14v.01M17 21h4v-4M14 21v-3" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M3 10h18M9 10v10" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chev: <path d="M6 9l6 6 6-6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" /></>,
  alert: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 4.2L3.3 16.5A2 2 0 005 19.5h14a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z" /></>,
  pin: <><path d="M12 21s-6-5.5-6-11a6 6 0 0112 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></>,
  example: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  link: <><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>,};

export function KIcon({ name, className = 'kc-ic' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name] || P.file}
    </svg>
  );
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ท่าทางตัวการ์ตูนบน hero เปลี่ยนตามสิ่งที่ผู้ใช้กำลังทำ */
export const MOOD = {
  idle: '/img/mascot-question.webp',
  typing: '/img/mascot-thinking.webp',
  found: '/img/mascot-success.webp',
  none: '/img/mascot-404.webp',
};

/** ขยับตัวการ์ตูนตามเมาส์เล็กน้อย (ตั้งค่าตัวแปร CSS --px/--py บน hero) */
export const tilt = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
  e.currentTarget.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
};

/** การ์ดหัวข้อแบบแถว: ไอคอน + ชื่อ + คำอธิบาย + หมวด/เวลาอ่าน */
export function DocCard({ a, i = 0, showCat = true }) {
  const f = folderOf(a.folder);
  return (
    <Link to={`/guide/${a.folder}/${a.id}`} className={`kc-doc tone-${f.tone}`} style={{ '--i': i }}>
      <span className="kc-doc-ic"><KIcon name={a.icon} /></span>
      <span className="kc-doc-body">
        <b>{a.title}</b>
        <span>{a.desc}</span>
        <small>{showCat && <><span className="kc-doc-cat">{f.title}</span> · </>}อ่าน {readMinutes(a)} นาที</small>
      </span>
      <KIcon name="arrow" className="kc-doc-arrow" />
    </Link>
  );
}

/** การ์ดโฟลเดอร์: แถบแท็บด้านบน กระดาษ 2 แผ่นด้านหลัง ฝาหน้า · ชี้แล้วลอยขึ้น/กระดาษเลื่อนออก · กดแล้วฝาเปิดก่อนเปลี่ยนหน้า */
export function FolderCard({ folder, count, style }) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const to = `/guide/${folder.id}`;
  const open = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1 || reduceMotion()) return;
    e.preventDefault();
    setOpening(true);
    setTimeout(() => navigate(to), 260);
  };
  return (
    <Link to={to} onClick={open} className={`kc-folder tone-${folder.tone}${opening ? ' is-opening' : ''}`} style={style} aria-label={`${folder.title} ${count} หัวข้อ`}>
      <span className="kc-folder-tab" aria-hidden="true" />
      <span className="kc-folder-back" aria-hidden="true" />
      <span className="kc-paper p1" aria-hidden="true"><i /><i /><i /></span>
      <span className="kc-paper p2" aria-hidden="true"><i /><i /></span>
      <span className="kc-folder-front">
        <span className="kc-folder-top">
          <span className="kc-folder-icon"><KIcon name={folder.icon} /></span>
          <span className="kc-count">{count} หัวข้อ</span>
        </span>
        <b className="kc-folder-title">{folder.title}</b>
        <span className="kc-folder-desc">{folder.desc}</span>
        <span className="kc-folder-more">ดูรายละเอียด <KIcon name="arrow" className="kc-ic-sm" /></span>
      </span>
    </Link>
  );
}

export function Breadcrumb({ items }) {
  return (
    <nav className="kc-crumb" aria-label="ตำแหน่งปัจจุบัน">
      {items.map((it, i) => (
        <span key={it.label} className="kc-crumb-item">
          {i > 0 && <KIcon name="chev" className="kc-crumb-sep" />}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** accordion ที่ขยายแบบนุ่ม (grid-template-rows 0fr -> 1fr) */
export function Accordion({ items, defaultOpen = -1, idPrefix }) {
  const [open, setOpen] = useState(() => new Set(defaultOpen >= 0 ? [defaultOpen] : []));
  const uid = useId();
  return (
    <div className="kc-acc-group">
      {items.map(([q, a], i) => {
        const on = open.has(i);
        const id = `${uid}-${i}`;
        return (
          <div key={q} id={idPrefix ? `${idPrefix}${i}` : undefined} className={`kc-acc${on ? ' open' : ''}`}>
            <button type="button" className="kc-acc-head" aria-expanded={on} aria-controls={id}
              onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
              <span>{q}</span><KIcon name="chev" className="kc-acc-chev" />
            </button>
            <div id={id} role="region" className="kc-acc-body">
              <div><div className="kc-acc-inner">{String(a).split('\n').map((line) => <p key={line}>{line}</p>)}</div></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Title({ children }) {
  return children ? <h3 className="kc-block-title">{children}</h3> : null;
}

/** id ของ block ที่มีหัวข้อ (ใช้ทำสารบัญ "ในบทความนี้") */
export const blockId = (i) => `s${i + 1}`;

/** แสดงเนื้อหาบทความตามชนิดของ block */
export function Blocks({ blocks }) {
  return blocks.map((b, i) => {
    const key = `${b.type}-${i}`;
    const sid = b.title && !['tip', 'warn', 'example'].includes(b.type) ? blockId(i) : undefined;
    switch (b.type) {
      case 'text':
        return <p key={key} className="kc-text">{b.text}</p>;
      case 'bullets':
        return (
          <section key={key} id={sid} className="kc-block">
            <Title>{b.title}</Title>
            <ul className="kc-bullets">{b.items.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
        );
      case 'checklist':
        return (
          <section key={key} id={sid} className="kc-block">
            <Title>{b.title}</Title>
            <ul className="kc-check">{b.items.map((t) => <li key={t}><span><KIcon name="check" className="kc-ic-sm" /></span>{t}</li>)}</ul>
          </section>
        );
      case 'steps':
        return (
          <section key={key} id={sid} className="kc-block">
            <Title>{b.title}</Title>
            <ol className="kc-steps">{b.items.map(([t, d], n) => <li key={t}><em>{n + 1}</em><div><b>{t}</b><span>{d}</span></div></li>)}</ol>
          </section>
        );
      case 'tip':
      case 'warn':
      case 'example':
        return (
          <aside key={key} className={`kc-callout ${b.type}`}>
            <b>{b.title}</b><p>{b.text}</p>
          </aside>
        );
      case 'cards':
        return (
          <section key={key} id={sid} className="kc-block">
            <Title>{b.title}</Title>
            <div className="kc-cards">
              {b.items.map((c) => (
                <div key={c.title} className="kc-card">
                  {c.icon && <span className="kc-card-ic"><KIcon name={c.icon} /></span>}
                  {c.tag && <span className={`kc-tag ${c.tone || ''}`}>{c.tag}</span>}
                  <b>{c.title}</b>
                  <p>{c.text}</p>
                </div>
              ))}
            </div>
          </section>
        );
      case 'table':
        return (
          <section key={key} id={sid} className="kc-block">
            <Title>{b.title}</Title>
            <div className="kc-table" style={{ '--n': b.head.length }}>
              <div className="kc-row kc-row-head" aria-hidden="true">{b.head.map((h) => <div key={h}>{h}</div>)}</div>
              {b.rows.map((r) => (
                <div key={r[0]} className="kc-row">
                  {r.map((cell, ci) => <div key={ci}><small>{b.head[ci]}</small><span>{cell}</span></div>)}
                </div>
              ))}
            </div>
          </section>
        );
      case 'faq':
        return <section key={key} id={sid} className="kc-block"><Title>{b.title}</Title><Accordion items={b.items} /></section>;
      case 'more':
        return <section key={key} id={sid} className="kc-block"><Title>{b.title}</Title><Accordion items={b.items} defaultOpen={b.open ?? -1} /></section>;
      case 'metrics':
        return (
          <div key={key} id={sid} className="kc-metrics">
            {b.items.map((m) => <div key={m.label} className="kc-metric"><b>{m.value}<small>{m.unit}</small></b><span>{m.label}</span></div>)}
          </div>
        );
      case 'flow':
        return (
          <section key={key} id={sid} className="kc-block">
            <Title>{b.title}</Title>
            <ol className="kc-flow">{b.items.map((t, n) => <li key={t} className={n === b.items.length - 1 ? 'last' : ''}>{t}</li>)}</ol>
          </section>
        );
      case 'compare':
        return (
          <div key={key} className={`kc-compare${b.ok && b.no ? ' two' : ''}`}>
            {[['ok', b.ok], ['no', b.no]].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className={`kc-compare-col ${k}`}>
                <b><span><KIcon name={k === 'ok' ? 'check' : 'x'} className="kc-ic-sm" /></span>{v.title}</b>
                <ul>{v.items.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            ))}
          </div>
        );
      case 'bars':
        return (
          <section key={key} id={sid} className="kc-block">
            {b.note && <p className="kc-note">{b.note}</p>}
            <div className="kc-bars">
              {b.items.map(([name, sub, w, label]) => (
                <div key={name} className="kc-bar-row">
                  <div><b>{name}</b><small>{sub}</small></div>
                  <div><div className="kc-bar"><i style={{ '--w': `${w}%` }} /></div><span>{label}</span></div>
                </div>
              ))}
            </div>
          </section>
        );
      case 'link':
        return <Link key={key} to={b.to} className="kc-linkbtn">{b.label}<KIcon name="arrow" className="kc-ic-sm" /></Link>;
      default:
        return null;
    }
  });
}
