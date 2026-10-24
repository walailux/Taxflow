/**
 * articleSlide.jsx แปลงบทความใน knowledge.js เป็น 1 หน้าของกรอบเลื่อนแบบแท็บเล็ต (Pager)
 * หัวข้อ + คำโปรย + สรุปให้เข้าใจง่าย + เนื้อหาครบทุกบล็อก
 */
import { Blocks } from './KnowledgeUI.jsx';
import { folderOf, readMinutes } from './knowledge.js';

export function articleSlide(a, n, { label, kicker } = {}) {
  const f = folderOf(a.folder);
  return {
    id: a.id,
    label: label || a.title,
    content: (
      <section className={`ip-section tone-${f.tone}`}>
        <div className="ip-section-head">
          <div>
            <div className="ip-kicker">{kicker || `หัวข้อที่ ${n + 1}`} · อ่าน {readMinutes(a)} นาที</div>
            <h2>{a.title}</h2>
            <p>{a.desc}</p>
          </div>
        </div>
        <aside className="kc-summary">
          <b>สรุปให้เข้าใจง่าย</b>
          <p>{a.summary}</p>
        </aside>
        <Blocks blocks={a.blocks} />
      </section>
    ),
  };
}
