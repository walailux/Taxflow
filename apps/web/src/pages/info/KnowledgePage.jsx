/**
 * KnowledgePage.jsx ศูนย์ความรู้ (หน้าสาธารณะ ไม่ต้องเข้าสู่ระบบ) แทนหน้าคู่มือ/กฎหมาย/นโยบายความเป็นส่วนตัวแบบเลื่อนยาวเดิม
 *   /guide                    หน้าแรก: ค้นหา + ตัวกรองหมวด + เรื่องที่ควรรู้ + โฟลเดอร์
 *   /guide/:folder            หน้าโฟลเดอร์: รายการหัวข้อ (FAQ/คำศัพท์ แสดงเนื้อหาในหน้านี้เลย)
 *   /guide/:folder/:article   หน้าบทความ: สรุปสั้น + เนื้อหาแบ่งส่วน + เรื่องที่เกี่ยวข้อง + ก่อนหน้า/ถัดไป
 * เนื้อหาทั้งหมดอยู่ใน features/info/knowledge.js
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { InfoLayout } from '../../features/info/InfoLayout.jsx';
import {
  Accordion, Blocks, Breadcrumb, DocCard, FolderCard, KIcon, MOOD, blockId, tilt,
} from '../../features/info/KnowledgeUI.jsx';
import Pager from '../../features/info/Pager.jsx';
import { articleSlide } from '../../features/info/articleSlide.jsx';
import LawsLibrary from '../../features/info/LawsLibrary.jsx';
import PrivacyOverview from '../../features/info/PrivacyOverview.jsx';
import {
  ARTICLES, FAQ, FEATURED, FILTERS, FOLDERS, GLOSSARY, articleOf, articlesIn, countIn, folderOf, readMinutes, searchKnowledge,
} from '../../features/info/knowledge.js';
import '../../features/info/knowledge.css';

const HOME = { label: 'ศูนย์ความรู้', to: '/guide' };

/* ชื่อสั้นบนแถบแท็บของ "เรื่องที่ควรรู้" (บทความที่ไม่อยู่ในรายการใช้ชื่อเต็ม) */
const FEATURE_LABEL = {
  vat: 'VAT',
  wht: 'หัก ณ ที่จ่าย',
  tawi50: '50 ทวิ',
  'quick-creator': 'เริ่มเร็วสำหรับครีเอเตอร์',
};
const SUGGEST = ['VAT', '50 ทวิ', 'ภ.ง.ด.53', 'OTP', 'ลายเซ็น'];
const CALLOUTS = ['tip', 'warn', 'example'];
const MINUTES = ARTICLES.map(readMinutes);

/* ---------- หน้าแรกของศูนย์ความรู้ ---------- */
function Home() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [focused, setFocused] = useState(false);
  const input = useRef(null);
  const results = useMemo(() => searchKnowledge(q, cat), [q, cat]);
  const folders = FOLDERS.filter((f) => cat === 'all' || f.cat === cat || (cat === 'tax' && f.id === 'glossary'));
  const featured = FEATURED.map(articleOf).filter(Boolean);
  const searching = q.trim().length > 0;
  const catLabel = FILTERS.find(([k]) => k === cat)?.[1];

  const mood = searching ? (results.length ? 'found' : 'none') : focused ? 'typing' : 'idle';
  const say = {
    idle: cat === 'all' ? 'อยากรู้เรื่องไหน ค้นหาได้เลย' : `หมวด${catLabel} มี ${folders.length} โฟลเดอร์`,
    typing: 'พิมพ์คำที่อยากรู้ได้เลย',
    found: `เจอแล้ว ${results.length} เรื่อง`,
    none: 'ยังไม่เจอ ลองคำอื่นดูนะ',
  }[mood];

  // โหลดรูปทุกท่าไว้ก่อน เปลี่ยนท่าแล้วไม่กระพริบ
  useEffect(() => { Object.values(MOOD).forEach((src) => { new Image().src = src; }); }, []);

  const pick = (s) => { setQ(s); input.current?.focus(); };

  return (
    <>
      <section className="kc-hero" onPointerMove={tilt}>
        <div className="ip-wrap">
          <div className="kc-hero-grid">
            <div className="kc-hero-inner">
              <div className="ip-eyebrow"><i />ศูนย์ความรู้</div>
              <h1>รวมเรื่องที่ต้องรู้<br /><em>เปิดอ่านทีละโฟลเดอร์</em></h1>
              <p className="kc-lede">รวมข้อมูลสำคัญที่ช่วยให้คุณเข้าใจการใช้งาน เอกสาร ภาษี และข้อกำหนดต่าง ๆ ได้ง่ายขึ้น เลือกหัวข้อที่ต้องการ ไม่ต้องเลื่อนอ่านยาวทั้งหน้า</p>
              <label className="kc-search">
                <KIcon name="search" />
                <span className="sr-only">ค้นหาความรู้</span>
                <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                  placeholder="ค้นหาความรู้ เช่น VAT, 50 ทวิ, ภ.ง.ด.53..." />
                {q && <button type="button" onClick={() => pick('')} aria-label="ล้างคำค้น"><KIcon name="x" className="kc-ic-sm" /></button>}
                <kbd className="kc-kbd" aria-hidden="true">{searching ? `${results.length} ผล` : 'ค้นหา'}</kbd>
              </label>
              <div className="kc-suggest">
                <span>ค้นหายอดนิยม</span>
                {SUGGEST.map((s) => <button key={s} type="button" className={q === s ? 'on' : ''} onClick={() => pick(q === s ? '' : s)}>{s}</button>)}
              </div>
              <div className="kc-filters" role="group" aria-label="กรองตามหมวด">
                {FILTERS.map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={cat === k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{label}</button>
                ))}
              </div>
            </div>

            <div className="kc-hero-art" aria-hidden="true">
              <div className="ring" /><div className="disc" />
              <img key={mood} className="kc-mascot" src={MOOD[mood]} alt="" />
              <div key={say} className="kc-say">{say}</div>
              <div className="kc-bubble b1"><b>{ARTICLES.length}</b> บทความ<small>อ่านจบใน {Math.min(...MINUTES)}–{Math.max(...MINUTES)} นาที</small></div>
              <div className="kc-bubble b2"><b>{FAQ.length}</b> คำถาม · <b>{GLOSSARY.length}</b> คำศัพท์<small>ค้นหาพร้อมกันได้ทันที</small></div>
            </div>
          </div>
        </div>
      </section>

      <div className="ip-wrap kc-main">
        {searching ? (
          <section className="kc-section" aria-live="polite">
            <h2 className="kc-h2">ผลการค้นหา "{q.trim()}" <small>{results.length} รายการ</small></h2>
            {!results.length && <p className="kc-empty">ไม่พบหัวข้อที่ตรงกับคำค้น ลองคำอื่น เช่น VAT, OTP, ลายเซ็น</p>}
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
            {cat === 'all' && (
              <section className="kc-section">
                <div className="kc-sec-head">
                  <span className="kc-kicker">แนะนำให้อ่านก่อน</span>
                  <h2 className="kc-h2">เรื่องที่ควรรู้</h2>
                </div>
                <Pager
                  label="เรื่องที่ควรรู้ ปัดซ้าย-ขวาเพื่อเปลี่ยนหัวข้อ"
                  slides={featured.map((a, n) => articleSlide(a, n, { label: FEATURE_LABEL[a.id], kicker: folderOf(a.folder).title }))}
                />
              </section>
            )}
            <section className="kc-section">
              <div className="kc-sec-head">
                <span className="kc-kicker">เลือกหมวดที่สนใจ</span>
                <h2 className="kc-h2">หมวดความรู้ <small>{folders.length} โฟลเดอร์</small></h2>
              </div>
              <div className="kc-folders">
                {folders.map((f, i) => <FolderCard key={f.id} folder={f} count={countIn(f)} style={{ '--i': i }} />)}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- หน้าโฟลเดอร์ ---------- */
function FolderView({ folder }) {
  const list = articlesIn(folder.id);
  const [term, setTerm] = useState('');
  const terms = GLOSSARY.map((g, i) => [...g, i]).filter(([t, d]) => !term || `${t} ${d}`.toLowerCase().includes(term.toLowerCase()));
  return (
    <div className="ip-wrap kc-main kc-enter">
      <Breadcrumb items={[HOME, { label: folder.title }]} />
      <header className={`kc-folder-head tone-${folder.tone}`}>
        <div>
          <span className="kc-article-cat">ศูนย์ความรู้</span>
          <h1>{folder.title}</h1>
          <p>{folder.desc}</p>
        </div>
        <span className="kc-folder-count"><b>{countIn(folder)}</b>หัวข้อ</span>
      </header>

      {folder.kind === 'faq' && <Accordion items={FAQ} idPrefix="q" />}

      {folder.kind === 'glossary' && (
        <>
          <label className="kc-search sm">
            <KIcon name="search" />
            <span className="sr-only">ค้นหาคำศัพท์</span>
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ค้นหาคำศัพท์" />
          </label>
          <dl className="kc-terms">
            {terms.map(([t, d, i]) => (
              <div key={t} id={`t${i}`} className="kc-term" style={{ '--i': i }}><dt>{t}</dt><dd>{d}</dd></div>
            ))}
          </dl>
          {!terms.length && <p className="kc-empty">ไม่พบคำศัพท์ที่ค้นหา</p>}
        </>
      )}

      {!folder.kind && (
        <div className="kc-docs">
          {list.map((a, i) => <DocCard key={a.id} a={a} i={i} showCat={false} />)}
        </div>
      )}

      <Link to="/guide" className="kc-backlink"><KIcon name="back" className="kc-ic-sm" />กลับไปศูนย์ความรู้</Link>
    </div>
  );
}

/* ---------- หน้าบทความ ---------- */
function ArticleView({ folder, article }) {
  const list = articlesIn(folder.id);
  const idx = list.findIndex((a) => a.id === article.id);
  const prev = list[idx - 1];
  const next = list[idx + 1];
  const related = (article.related || []).map((id) => (id === 'glossary' ? null : articleOf(id))).filter(Boolean);
  const glossaryLink = (article.related || []).includes('glossary');
  // สารบัญ: เฉพาะหัวข้อเนื้อหา (ไม่รวมกล่องหมายเหตุ/ข้อควรระวัง)
  const toc = article.blocks.map((b, i) => (b.title && !CALLOUTS.includes(b.type) ? { id: blockId(i), title: b.title } : null)).filter(Boolean);
  const [active, setActive] = useState(toc[0]?.id);
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href.split('#')[0]); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // สารบัญด้านข้าง: ไฮไลต์หัวข้อที่กำลังอ่าน
  useEffect(() => {
    if (toc.length < 2 || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: '-20% 0px -70% 0px' });
    toc.forEach((t) => { const el = document.getElementById(t.id); if (el) io.observe(el); });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id]);

  return (
    <div className={`ip-wrap kc-main kc-read kc-enter tone-${folder.tone}`}>
      <Breadcrumb items={[HOME, { label: folder.title, to: `/guide/${folder.id}` }, { label: article.title }]} />
      <div className="kc-read-grid">
        <div className="kc-read-main">
          <article className="kc-article">
            <header className="kc-article-head">
              <Link to={`/guide/${folder.id}`} className="kc-article-cat">{folder.title}</Link>
              <h1>{article.title}</h1>
              <p className="kc-article-desc">{article.desc}</p>
              <div className="kc-article-bar">
                <p className="kc-article-meta"><span>อ่าน {readMinutes(article)} นาที</span>{toc.length > 0 && <span>{toc.length} หัวข้อย่อย</span>}</p>
                <div className="kc-article-actions">
                  <button type="button" className="kc-btn sm ghost" onClick={copyLink}>
                    <KIcon name={copied ? 'check' : 'link'} className="kc-ic-sm" />{copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                  </button>
                </div>
              </div>
            </header>

            <aside className="kc-summary">
              <b>สรุปให้เข้าใจง่าย</b>
              <p>{article.summary}</p>
            </aside>

            {toc.length > 1 && (
              <nav className="kc-toc-chips" aria-label="ในบทความนี้">
                <span className="kc-label">ในบทความนี้</span>
                <div>{toc.map((t, n) => <a key={t.id} href={`#${t.id}`}><em>{n + 1}</em>{t.title}</a>)}</div>
              </nav>
            )}

            <Blocks blocks={article.blocks} />
          </article>

          <section className="kc-endcard">
            <div className="kc-endcard-text">
              <span className="kc-label">อ่านจบแล้ว</span>
              <b>{next ? `ถัดไป: ${next.title}` : `จบหมวด${folder.title}แล้ว`}</b>
              <p>{next ? next.desc : 'กลับไปเลือกหัวข้ออื่นในหมวดนี้ หรือเริ่มใช้งานจริงใน TaxFlow'}</p>
            </div>
            <div className="kc-endcard-actions">
              {next
                ? <Link to={`/guide/${folder.id}/${next.id}`} className="kc-btn primary">อ่านต่อ<KIcon name="arrow" className="kc-ic-sm" /></Link>
                : <Link to={`/guide/${folder.id}`} className="kc-btn primary">กลับไปที่หมวด<KIcon name="arrow" className="kc-ic-sm" /></Link>}
              <Link to="/login" className="kc-btn ghost">เข้าสู่ระบบเพื่อใช้งาน</Link>
            </div>
          </section>

          {(related.length > 0 || glossaryLink) && (
            <section className="kc-related">
              <h2 className="kc-label">เรื่องที่เกี่ยวข้อง</h2>
              <div className="kc-docs">
                {related.map((a, i) => <DocCard key={a.id} a={a} i={i} />)}
                {glossaryLink && (
                  <Link to="/guide/glossary" className="kc-doc tone-rose" style={{ '--i': related.length }}>
                    <span className="kc-doc-ic"><KIcon name="book" /></span>
                    <span className="kc-doc-body"><b>คำศัพท์น่ารู้</b><span>ศัพท์ภาษีและเอกสารที่เจอบ่อย</span><small><span className="kc-doc-cat">คำศัพท์น่ารู้</span></small></span>
                    <KIcon name="arrow" className="kc-doc-arrow" />
                  </Link>
                )}
              </div>
            </section>
          )}

          <nav className="kc-pager" aria-label="บทความก่อนหน้าและหมวด">
            {prev ? <Link to={`/guide/${folder.id}/${prev.id}`} className="kc-pager-link"><small><KIcon name="back" className="kc-ic-sm" />ก่อนหน้า</small><b>{prev.title}</b></Link> : <span />}
            <Link to={`/guide/${folder.id}`} className="kc-pager-link next"><small>ดูทั้งหมด<KIcon name="arrow" className="kc-ic-sm" /></small><b>{folder.title} ({list.length} หัวข้อ)</b></Link>
          </nav>
        </div>

        <aside className="kc-rail" aria-label="ข้อมูลบทความ">
          {toc.length > 1 && (
            <nav className="kc-toc" aria-label="ในบทความนี้">
              <span className="kc-label">ในบทความนี้</span>
              {toc.map((t) => <a key={t.id} href={`#${t.id}`} className={active === t.id ? 'on' : undefined}>{t.title}</a>)}
            </nav>
          )}
          <dl className="kc-facts">
            <div><dt>หมวด</dt><dd><Link to={`/guide/${folder.id}`}>{folder.title}</Link></dd></div>
            <div><dt>เวลาอ่าน</dt><dd>{readMinutes(article)} นาที</dd></div>
            <div><dt>ลำดับในหมวด</dt><dd>{idx + 1} จาก {list.length}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const { folder: folderId, article: articleId } = useParams();
  const folder = folderId ? folderOf(folderId) : null;
  const article = articleId ? articleOf(articleId) : null;
  if (folderId && !folder) return <Navigate to="/guide" replace />;
  if (articleId && (!article || article.folder !== folderId)) return <Navigate to={`/guide/${folderId}`} replace />;

  const title = article ? article.title : folder ? folder.title : 'ศูนย์ความรู้';
  return (
    <InfoLayout title={title}>
      {article ? <ArticleView key={article.id} folder={folder} article={article} />
        : folder ? (folder.id === 'laws' ? <LawsLibrary key={folder.id} folder={folder} />
          : folder.id === 'privacy' ? <PrivacyOverview key={folder.id} folder={folder} />
            : <FolderView key={folder.id} folder={folder} />)
          : <Home />}
    </InfoLayout>
  );
}

