/**
 * DownloadMenu.jsx ปุ่มดาวน์โหลดเอกสารหนึ่งฉบับ: ปุ่มหลักเปิด PDF + เมนูเลือกรูปแบบอื่น (PDF/Excel/CSV/XML)
 * เมนูวางแบบ fixed ตามตำแหน่งปุ่ม และวาดผ่าน portal ที่ body เพราะตารางอยู่ในกล่อง overflow-x-auto (ตัดเมนู absolute ทิ้ง)
 * และการ์ดมี transform จากอนิเมชัน (ทำให้ fixed อ้างอิงการ์ดแทนหน้าจอ)
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_URL } from '../../lib/env.js';
import Icon from '../../components/Icon.jsx';
import { cx } from '../../components/ui.jsx';

// ประเภทที่มีไฟล์ XML ตามมาตรฐาน ขมธอ. 3-2560 (ตรงกับ SUPPORTED ใน apps/api/lib/xmlbuild.js)
const XML_TYPES = ['ETAX_INVOICE', 'ETAX_RECEIPT'];
const MENU_W = 272;

function formatsFor(doc) {
  const base = `${API_URL}/api/documents/${Number(doc.id)}`;
  return [
    { key: 'pdf', label: 'PDF', hint: 'ไฟล์ PDF/A-3 พร้อมลายมือชื่อ', href: `${base}/pdf?download=1`, tone: 'bg-[#FDECEC] text-[#D93025]' },
    { key: 'xls', label: 'Excel', hint: 'รายการสินค้าและยอดสรุป (.xls)', href: `${base}/export.xls`, tone: 'bg-[#E6F4EA] text-[#188038]' },
    { key: 'csv', label: 'CSV', hint: 'ข้อมูลดิบสำหรับโปรแกรมอื่น', href: `${base}/export.csv`, tone: 'bg-[#E8F0FE] text-[#1967D2]' },
    ...(XML_TYPES.includes(doc.type) ? [{ key: 'xml', label: 'XML', hint: 'ไฟล์ e-Tax ตาม ขมธอ. 3-2560', href: `${base}/xml`, tone: 'bg-[#FEF7E0] text-[#B06000]' }] : []),
  ];
}

/** size: 'md' (ในตาราง) | 'lg' (ในการ์ดพรีวิว ปุ่มเต็มความกว้าง) */
export default function DownloadMenu({ doc, size = 'md' }) {
  // เอกสารที่คู่ค้าส่งมา: เปิด/ดาวน์โหลดได้เฉพาะ PDF ผ่านคำขอในกล่องรับเอกสาร (ข้อมูลดิบเป็นของผู้ส่ง)
  if (doc.received) {
    const href = `${API_URL}/api/requests/${Number(doc.received.reqId)}/pdf`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="เปิดไฟล์ PDF ที่คู่ค้าส่งมาในแท็บใหม่"
        className={cx('inline-flex items-center justify-center gap-2 rounded-xl bg-orange font-display font-medium text-white shadow-[0_8px_18px_-10px_rgba(232,90,0,0.75)] transition-colors hover:bg-orange-deep',
          size === 'lg' ? 'h-11 w-full text-[0.96875rem]' : 'h-9 px-3.5 text-[0.90625rem]')}
      >
        <Icon name="file" className="size-[1.0625rem]" />{size === 'lg' ? 'เปิด PDF' : 'PDF'}
      </a>
    );
  }
  return <OwnDownloadMenu doc={doc} size={size} />;
}

function OwnDownloadMenu({ doc, size }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  const formats = formatsFor(doc);
  const lg = size === 'lg';

  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btn.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 60 * formats.length + 24;
    setPos({
      left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
      ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }),
    });
  };

  useEffect(() => {
    if (!pos) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (menu.current?.contains(e.target) || btn.current?.contains(e.target))) return;
      setPos(null);
    };
    const hide = () => setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [pos]);

  return (
    <div
      role="presentation"
      className={cx('inline-flex overflow-hidden rounded-xl shadow-[0_8px_18px_-10px_rgba(232,90,0,0.75)] transition-shadow hover:shadow-[0_12px_24px_-10px_rgba(232,90,0,0.8)]', lg && 'w-full')}
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={`${API_URL}/api/documents/${Number(doc.id)}/pdf`}
        target="_blank"
        rel="noreferrer"
        className={cx(
          'inline-flex items-center justify-center gap-2 bg-orange font-display font-medium text-white transition-colors hover:bg-orange-deep active:bg-[#D45200]',
          lg ? 'h-11 flex-1 text-[0.96875rem]' : 'h-9 pl-3 pr-3.5 text-[0.90625rem]',
        )}
        title="เปิดไฟล์ PDF ในแท็บใหม่"
      >
        <Icon name="file" className="size-[1.0625rem]" />
        {lg ? 'เปิด PDF' : 'PDF'}
      </a>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        aria-label="ดาวน์โหลดในรูปแบบอื่น"
        title="ดาวน์โหลด PDF / Excel / CSV"
        className={cx(
          'inline-flex items-center justify-center gap-1 border-l border-white/30 text-white transition-colors hover:bg-orange-deep',
          lg ? 'h-11 px-3.5' : 'h-9 w-9',
          pos ? 'bg-orange-deep' : 'bg-orange',
        )}
      >
        <Icon name="download" className="size-[1.0625rem]" />
        {lg && <Icon name="chevron" className={cx('size-3.5 transition-transform duration-200', pos ? '-rotate-90' : 'rotate-90')} />}
      </button>

      {pos && createPortal(
        <div
          ref={menu}
          role="menu"
          style={{ position: 'fixed', width: MENU_W, ...pos }}
          className="tf-pop z-50 rounded-2xl border border-line bg-white p-1.5 text-left shadow-[0_24px_60px_-24px_rgba(24,24,27,0.4)]"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[0.8125rem] text-ink-soft">ดาวน์โหลดเป็น</p>
          {formats.map((f) => (
            <a
              key={f.key}
              role="menuitem"
              href={f.href}
              download
              onClick={() => setPos(null)}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-tile"
            >
              <span className={cx('flex h-8 w-11 shrink-0 items-center justify-center rounded-lg font-mono text-[0.75rem] font-semibold', f.tone)}>{f.label}</span>
              <span className="min-w-0">
                <b className="block text-[0.9375rem] font-medium leading-tight">{f.label}</b>
                <small className="block truncate text-[0.8125rem] text-ink-soft">{f.hint}</small>
              </span>
            </a>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
