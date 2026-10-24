/**
 * LawsLibrary.jsx หน้าโฟลเดอร์ "กฎหมายตามบทบาท" (/guide/laws) ใช้ดีไซน์ชุดเดียวกับหน้าแรกของศูนย์ความรู้
 *   hero ตัวการ์ตูน (เปลี่ยนท่าตามการค้นหา) + ค้นหา + เลือกบทบาท → การ์ดความรู้ตามบทบาท → เรื่องที่ควรรู้
 *   ข้อมูลทั้งหมดมาจาก knowledge.js (ไฟล์นี้เพิ่มเฉพาะป้ายบทบาท บรรทัดสรุป และภาพการ์ตูนประจำการ์ด)
 *   รายละเอียดเชิงลึกอยู่ในหน้าบทความ /guide/laws/:id ตามเดิม
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Breadcrumb, DocCard, KIcon, MOOD, tilt } from './KnowledgeUI.jsx';
import Pager from './Pager.jsx';
import { articleSlide } from './articleSlide.jsx';
import { articleOf, articlesIn, folderOf, readMinutes, searchKnowledge } from './knowledge.js';

const HOME = { label: 'ศูนย์ความรู้', to: '/guide' };
const ROLES = [['all', 'ทั้งหมด'], ['creator', 'อินฟลูเอนเซอร์'], ['brand', 'ผู้ว่าจ้าง'], ['agency', 'เอเจนซี่']];

/** ข้อมูลการแสดงผลของแต่ละบทความ: บทบาท ป้าย และชื่อสั้นบนแถบแท็บ (บทความใหม่ที่ยังไม่อยู่ในรายการใช้ค่าเริ่มต้น) */
const META = {
  'law-matrix': { role: 'all', tag: 'ทุกบทบาท', short: 'ภาพรวม 7 กฎหมาย' },
  'duty-creator': { role: 'creator', tag: 'อินฟลูเอนเซอร์', short: 'อินฟลูเอนเซอร์' },
  'duty-brand': { role: 'brand', tag: 'ผู้ว่าจ้าง', short: 'บริษัท (Brand)' },
  'duty-agency': { role: 'agency', tag: 'เอเจนซี่', short: 'เอเจนซี่' },
};
const metaOf = (a) => META[a.id] || { role: 'all', tag: 'ทุกบทบาท' };

/** เรื่องที่ควรรู้ (อ่านคู่กับหมวดกฎหมาย) */
const KNOW = ['vat', 'wht', 'tawi50', 'pit'];
const SUGGEST = ['VAT', 'ภาษีหัก ณ ที่จ่าย', 'สัญญา', 'ลิขสิทธิ์', 'PDPA'];

export default function LawsLibrary({ folder }) {
  const all = useMemo(() => articlesIn(folder.id), [folder.id]);
  const minutes = all.map(readMinutes);
  const lawCount = articleOf('law-matrix')?.blocks?.[0]?.items?.length;
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [focused, setFocused] = useState(false);
  const input = useRef(null);

  const searching = q.trim().length > 0;
  // ผลค้นหาทั้งศูนย์ความรู้ โดยให้หัวข้อในหมวดกฎหมายขึ้นก่อน
  const results = useMemo(() => {
    const hits = searchKnowledge(q);
    return [...hits.filter((h) => h.folder === folder.id), ...hits.filter((h) => h.folder !== folder.id)];
  }, [q, folder.id]);
  const cards = all.filter((a) => { const r = metaOf(a).role; return role === 'all' || r === 'all' || r === role; });
  const know = KNOW.map(articleOf).filter(Boolean);
  const roleLabel = ROLES.find(([k]) => k === role)?.[1];

  const mood = searching ? (results.length ? 'found' : 'none') : focused ? 'typing' : 'idle';
  const say = {
    idle: role === 'all' ? 'บทบาทของคุณคืออะไร' : `เรื่องของ${roleLabel} มี ${cards.length} หัวข้อ`,
    typing: 'พิมพ์ชื่อกฎหมายหรือหัวข้อได้เลย',
    found: `เจอแล้ว ${results.length} เรื่อง`,
    none: 'ยังไม่เจอ ลองคำอื่นดูนะ',
  }[mood];

  useEffect(() => { Object.values(MOOD).forEach((src) => { new Image().src = src; }); }, []);
  const pick = (s) => { setQ(s); input.current?.focus(); };

  return (
    <>
      <section className="kc-hero" onPointerMove={tilt}>
        <div className="ip-wrap">
          <Breadcrumb items={[HOME, { label: folder.title }]} />
          <div className="kc-hero-grid">
            <div className="kc-hero-inner">
              <div className="ip-eyebrow"><i />{folder.title}</div>
              <h1>เข้าใจกฎหมายที่เกี่ยวข้อง<br /><em>แยกตามบทบาทของคุณ</em></h1>
              <p className="kc-lede">เข้าใจกฎหมายที่เกี่ยวข้องกับการใช้งาน TaxFlow เลือกบทบาทของคุณเพื่อดูข้อกำหนด หน้าที่ และเรื่องสำคัญที่เกี่ยวข้อง</p>
              <label className="kc-search">
                <KIcon name="search" />
                <span className="sr-only">ค้นหากฎหมายหรือหัวข้อความรู้</span>
                <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  placeholder="ค้นหากฎหมายหรือหัวข้อความรู้..." />
                {q && <button type="button" onClick={() => pick('')} aria-label="ล้างคำค้น"><KIcon name="x" className="kc-ic-sm" /></button>}
                <kbd className="kc-kbd" aria-hidden="true">{searching ? `${results.length} ผล` : 'ค้นหา'}</kbd>
              </label>
              <div className="kc-suggest">
                <span>ค้นหายอดนิยม</span>
                {SUGGEST.map((s) => <button key={s} type="button" className={q === s ? 'on' : ''} onClick={() => pick(q === s ? '' : s)}>{s}</button>)}
              </div>
              <div className="kc-filters" role="group" aria-label="กรองตามบทบาท">
                {ROLES.map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={role === k} className={role === k ? 'on' : ''} onClick={() => setRole(k)}>{label}</button>
                ))}
              </div>
            </div>

            <div className="kc-hero-art" aria-hidden="true">
              <div className="ring" /><div className="disc" />
              <img key={mood} className="kc-mascot" src={MOOD[mood]} alt="" />
              <div key={say} className="kc-say">{say}</div>
              <div className="kc-bubble b1"><b>{all.length}</b> หัวข้อความรู้<small>อ่านจบใน {Math.min(...minutes)}–{Math.max(...minutes)} นาที</small></div>
              {lawCount > 0 && <div className="kc-bubble b2"><b>{lawCount}</b> กฎหมายหลัก<small>เทียบหน้าที่ครบทั้ง 3 บทบาท</small></div>}
            </div>
          </div>
        </div>
      </section>

      <div className="ip-wrap kc-main">
        {searching ? (
          <section className="kc-section" aria-live="polite">
            <h2 className="kc-h2">ผลการค้นหา "{q.trim()}" <small>{results.length} รายการ</small></h2>
            {!results.length && <p className="kc-empty">ไม่พบหัวข้อที่ตรงกับคำค้น ลองคำอื่น เช่น VAT, สัญญา หรือลิขสิทธิ์</p>}
            <div className="kc-results">
              {results.map((r, i) => (
                <Link key={r.key} to={r.to} className="kc-result" style={{ '--i': i }}>
                  <span className={`kc-result-kind ${r.kind}`}>{r.kind === 'article' ? 'บทความ' : r.kind === 'faq' ? 'คำถาม' : 'คำศัพท์'}</span>
                  <b>{r.title}</b>
                  <span>{r.desc}</span>
                  <small>{folderOf(r.folder).title}</small>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <>
            <section className="kc-section">
              <div className="kc-sec-head">
                <span className="kc-kicker">{role === 'all' ? 'เลือกอ่านตามบทบาท' : `สำหรับ${roleLabel}`}</span>
                <h2 className="kc-h2">หัวข้อความรู้ <small>{cards.length} หัวข้อ</small></h2>
              </div>
              <Pager
                key={role}
                label="หัวข้อกฎหมายตามบทบาท ปัดซ้าย-ขวาเพื่อเปลี่ยนหัวข้อ"
                slides={cards.map((a, n) => articleSlide(a, n, { label: metaOf(a).short, kicker: metaOf(a).tag }))}
              />
            </section>

            {know.length > 0 && (
              <section className="kc-section">
                <div className="kc-sec-head">
                  <span className="kc-kicker">แนะนำให้อ่านคู่กัน</span>
                  <h2 className="kc-h2">เรื่องที่ควรรู้</h2>
                </div>
                <div className="kc-docs two">
                  {know.map((a, i) => <DocCard key={a.id} a={a} i={i} />)}
                </div>
              </section>
            )}
          </>
        )}

        <Link to="/guide" className="kc-backlink"><KIcon name="back" className="kc-ic-sm" />กลับไปศูนย์ความรู้</Link>
      </div>
    </>
  );
}
