/**
 * PrivacyOverview.jsx หน้าโฟลเดอร์ "ความเป็นส่วนตัวและข้อมูล" (/guide/privacy) ใช้ดีไซน์ชุดเดียวกับหน้าภาพรวมระบบ
 *   hero ตัวการ์ตูน + ตัวเลขสำคัญ → หน้าเลื่อนซ้าย-ขวาแบบแท็บเล็ต (1 หัวข้อต่อ 1 หน้า) → แถบปิดท้าย
 *   เนื้อหาแต่ละหน้ามาจากบทความในโฟลเดอร์ privacy ของ knowledge.js ครบทุกบล็อก (หน้าบทความเดี่ยว /guide/privacy/:id ยังใช้ได้ตามเดิม)
 */
import { Link } from 'react-router';
import { Count } from './InfoLayout.jsx';
import Pager from './Pager.jsx';
import { articleSlide } from './articleSlide.jsx';
import { articlesIn } from './knowledge.js';

/** ชื่อสั้นบนแถบแท็บ (บทความที่ไม่อยู่ในรายการใช้ชื่อเต็ม) */
const SHORT = {
  collect: 'ข้อมูลที่เก็บ',
  notcollect: 'ข้อมูลที่ไม่เก็บ',
  security: 'ความปลอดภัย',
  retention: 'ระยะเวลาเก็บ',
  rights: 'สิทธิของคุณ',
  disclosure: 'การเปิดเผยข้อมูล',
};

export default function PrivacyOverview({ folder }) {
  const list = articlesIn(folder.id);

  const slides = list.map((a, n) => articleSlide(a, n, { label: SHORT[a.id] }));

  return (
    <>
      <section className="ip-hero">
        <div className="ip-wrap">
          <div className="ip-hero-grid">
            <div className="reveal">
              <div className="ip-eyebrow"><i></i>ความเป็นส่วนตัว</div>
              <h1>ข้อมูลของคุณ<br /><em>ดูแลตาม PDPA</em><br />อย่างโปร่งใส</h1>
              <p className="ip-lede">หน้านี้สรุปนโยบายความเป็นส่วนตัวของ TaxFlow ว่าระบบเก็บข้อมูลอะไร ตั้งใจไม่เก็บอะไร ดูแลความปลอดภัยอย่างไร เก็บไว้นานเท่าไร และคุณใช้สิทธิในฐานะเจ้าของข้อมูลได้อย่างไร</p>
              <div className="ip-hero-actions">
                <a className="ip-btn solid" href="#pager">อ่านนโยบาย</a>
                <Link to="/guide" className="ip-btn ghost">เปิดศูนย์ความรู้</Link>
              </div>
            </div>
            <div className="ip-hero-art reveal" style={{ '--d': '.15s' }} aria-hidden="true">
              <div className="ring"></div><div className="disc"></div>
              <img src="/img/mascot-locked.png" alt="" />
              <div className="ip-bubble b1"><b>AES-256-GCM</b><small>เข้ารหัสไฟล์สำคัญก่อนจัดเก็บ</small></div>
              <div className="ip-bubble b2">เอกสารภาษีเก็บ <b>5 ปี</b><small>ตามประมวลรัษฎากร มาตรา 87/3</small></div>
            </div>
          </div>
          <div className="ip-stats" data-stagger="">
            <div className="ip-stat reveal"><b><Count to={String(list.length)} /><small>หัวข้อ</small></b><span>นโยบายความเป็นส่วนตัว อ่านทีละหัวข้อได้</span></div>
            <div className="ip-stat reveal"><b><Count to="4" /><small>ข้อ</small></b><span>ความยินยอมแยกรายวัตถุประสงค์ บังคับ 2 เลือกได้ 2</span></div>
            <div className="ip-stat reveal"><b><Count to="256" /><small>บิต</small></b><span>เข้ารหัสไฟล์ยืนยันตัวตนด้วย AES-256-GCM</span></div>
            <div className="ip-stat reveal"><b><Count to="5" /><small>ปี</small></b><span>เก็บเอกสารภาษีไม่น้อยกว่า 5 ปีตามกฎหมาย</span></div>
          </div>
        </div>
      </section>

      <div className="ip-wrap ip-pager-wrap" id="pager">
        <Pager label="นโยบายความเป็นส่วนตัว ปัดซ้าย-ขวาเพื่อเปลี่ยนหัวข้อ" slides={slides} />

        <section className="ip-cta reveal">
          <div>
            <h2>ใช้สิทธิของคุณได้ด้วยตนเอง</h2>
            <p>ขอสำเนาข้อมูล แก้ไข ถอนความยินยอม และลบบัญชีได้ที่หน้าโปรไฟล์ หัวข้อความเป็นส่วนตัว หรืออ่านคำถามที่พบบ่อยในศูนย์ความรู้</p>
            <div className="ip-hero-actions"><Link to="/guide/faq" className="ip-btn solid">คำถามที่พบบ่อย</Link><Link to="/login" className="ip-btn ghost">เข้าสู่ระบบ</Link></div>
          </div>
          <img src="/img/mascot-idle.png" alt="" />
        </section>
      </div>
    </>
  );
}
