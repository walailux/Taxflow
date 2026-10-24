/**
 * TooltipLayer.jsx ป้ายคำอธิบายแบบกำหนดหน้าตาเองให้ทุก element ที่มี title (แทนกล่องสี่เหลี่ยมของเบราว์เซอร์)
 * วางครั้งเดียวที่ App: จับ mouseover / focus ทั้งเอกสาร หา element ที่มี title ใกล้ที่สุด
 * ย้าย title ไปเก็บใน data-tip (กันเบราว์เซอร์แสดงซ้อน) แล้วแสดงป้ายลอยเหนือ element (พลิกลงล่างถ้าด้านบนไม่พอ)
 * - หน่วง 350ms ก่อนแสดง ชี้ผ่านเร็ว ๆ ไม่กระพริบ · ซ่อนเมื่อเมาส์ออก เลื่อนหน้า คลิก หรือกด Esc
 * - คลิกแล้วไม่โผล่ซ้ำจนกว่าจะเอาเมาส์ออกแล้วชี้ใหม่ · ซ่อนเมื่อ element นั้นหายไปจากหน้า (กันป้ายค้าง)
 * - ไม่พึ่ง :hover ของเบราว์เซอร์ และมองเห็นได้ตั้งแต่เฟรมแรกแม้อนิเมชันถูกปิด (สไตล์หลักใส่ inline ไว้ด้วย)
 * - data-tip-side="right" = แสดงทางขวาของ element (เช่น ไอคอนเมนูตอนย่อ) และขึ้นเร็วกว่าปกติ
 * - โปรแกรมอ่านหน้าจอ: ยังมี aria-label/ข้อความเดิมของ element (ไม่พึ่งป้ายนี้)
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DELAY = 350;
const GAP = 8;

function tipTarget(node) {
  const el = node instanceof Element ? node.closest('[title], [data-tip]') : null;
  if (!el) return null;
  // svg <title> และ element ภายใน iframe/ไฟล์ที่ไม่ใช่ HTML ปล่อยให้เบราว์เซอร์จัดการ
  if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') return null;
  if (el.hasAttribute('title')) {
    const t = el.getAttribute('title');
    el.removeAttribute('title');
    if (t) el.setAttribute('data-tip', t);
  }
  return el.getAttribute('data-tip') ? el : null;
}

/** โฟกัสจากคีย์บอร์ด (Tab) · เบราว์เซอร์ที่ไม่รู้จัก :focus-visible ถือว่าไม่ใช่ */
function focusedByKeyboard(el) {
  try { return document.activeElement === el && el.matches(':focus-visible'); } catch { return false; }
}

export default function TooltipLayer() {
  const [tip, setTip] = useState(null); // { text, x, y, below, right }
  const box = useRef(null);
  const timer = useRef(0);
  const current = useRef(null);

  const muted = useRef(null); // element ที่เพิ่งคลิก: ไม่แสดงป้ายซ้ำจนกว่าเมาส์จะออกจากมันก่อน
  const watch = useRef(0);

  useEffect(() => {
    const hide = () => { clearTimeout(timer.current); clearInterval(watch.current); current.current = null; setTip(null); };
    const show = (el) => {
      // เรียกซ้ำกับ element เดิม (pointerover แล้ว mouseover) ต้องไม่ยกเลิกตัวจับเวลาที่กำลังรอแสดงอยู่
      if (current.current === el || muted.current === el) return;
      clearTimeout(timer.current);
      current.current = el;
      setTip(null);
      const right = el.closest('[data-tip-side="right"]') != null;
      timer.current = setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        if (right) { setTip({ text: el.getAttribute('data-tip'), x: r.right + GAP + 2, y: r.top + r.height / 2, right: true }); }
        else {
          const below = r.top < 56;
          setTip({ text: el.getAttribute('data-tip'), x: r.left + r.width / 2, y: below ? r.bottom + GAP : r.top - GAP, below });
        }
        // กันป้ายค้างเมื่อ element ถูกลบออกจากหน้าโดยไม่มี mouseout (เช่น เปลี่ยนหน้า) · การออกจาก element ปกติจับด้วย mouseout/pointerout
        clearInterval(watch.current);
        watch.current = setInterval(() => { if (!el.isConnected) hide(); }, 500);
      }, right ? 120 : DELAY);
    };
    const onLeaveWindow = (e) => { if (!e.relatedTarget) hide(); };
    const onOver = (e) => { const el = tipTarget(e.target); if (el) show(el); else if (current.current && !current.current.contains(e.target)) hide(); };
    const onOut = (e) => {
      const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
      if (muted.current && !(to && muted.current.contains(to))) muted.current = null;
      if (current.current && !(to && current.current.contains(to))) hide();
    };
    const onFocus = (e) => { const el = tipTarget(e.target); if (el && focusedByKeyboard(e.target)) show(el); };
    const onKey = (e) => { if (e.key === 'Escape') hide(); };
    const onDown = (e) => { muted.current = tipTarget(e.target); hide(); };
    // ซ่อนเฉพาะเมื่อสิ่งที่เกี่ยวกับป้ายเปลี่ยนจริง: กล่องที่ element นั้นอยู่ถูกเลื่อน หรือ element นั้นเสียโฟกัส
    // (เดิมซ่อนทุกครั้งที่มีอะไรก็ได้ในหน้าเลื่อน/เสียโฟกัส เช่น กล่องเนื้อหาที่เลื่อนเองหรือช่องค้นหา ทำให้ป้ายไม่ขึ้นเลย)
    const onScroll = (e) => {
      const el = current.current;
      if (!el) return;
      const t = e.target;
      if (t === document || t === document.documentElement || t === window || (t instanceof Node && t.contains(el))) hide();
    };
    const onBlur = (e) => { const el = current.current; if (el && e.target instanceof Node && (e.target === el || el.contains(e.target))) hide(); };
    // ฟังทั้ง mouse และ pointer (บางเครื่อง/บางโหมดส่งมาแค่อย่างเดียว) · show() เรียกซ้ำได้ไม่เป็นไร
    document.addEventListener('mouseover', onOver);
    document.addEventListener('pointerover', onOver);
    document.documentElement.addEventListener('mouseleave', onLeaveWindow);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(timer.current);
      clearInterval(watch.current);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('pointerover', onOver);
      document.documentElement.removeEventListener('mouseleave', onLeaveWindow);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  // จัดไม่ให้ป้ายล้นขอบจอซ้าย/ขวา (วัดหลังวาดครั้งแรก)
  const [shift, setShift] = useState(0);
  useEffect(() => {
    if (!tip || !box.current || tip.right) { setShift(0); return; }
    const r = box.current.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 8);
    const under = 8 - r.left;
    setShift(over > 0 ? -over : under > 0 ? under : 0);
  }, [tip]);

  if (!tip) return null;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className={`tf-tip ${tip.right ? 'tf-tip-right' : tip.below ? 'tf-tip-below' : ''}`}
      // สไตล์หลักใส่ inline ด้วย: ป้ายยังอยู่ถูกที่และมองเห็นได้ แม้ CSS ของหน้าโหลดไม่ครบ
      style={{
        position: 'fixed', zIndex: 2147483000, pointerEvents: 'none', opacity: 1, visibility: 'visible',
        background: dark ? '#F3F1EF' : '#1F1C1A', color: dark ? '#1C1A19' : '#fff',
        transform: tip.right ? 'translate(0, -50%)' : tip.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        left: tip.x + shift, top: tip.y, '--arrow-x': `${-shift}px`,
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
