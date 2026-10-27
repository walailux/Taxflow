/**
 * LandingPage.jsx หน้าแนะนำระบบ (/) สำหรับผู้ที่ยังไม่เข้าสู่ระบบ
 * เนื้อหาสรุปจากหน้าภาพรวมระบบ (InfoOverviewPage) และศูนย์ความรู้ ไม่เพิ่มข้อมูลใหม่
 * ภาพขั้นตอนเป็นภาพหน้าจอจริงจากบัญชีทดสอบ แคปด้วย npm run capture:landing (scripts/capture-landing.mjs)
 * ทั้งมือถือ (img/landing/step-N.png) และคอมพิวเตอร์ (img/landing/desktop/step-N.png)
 * ภาพหลัก: คอมพิวเตอร์ + โทรศัพท์ เปลี่ยนภาพหน้าจอทุก 2 วินาที · ขั้นตอน: สลับดูแบบคอมพิวเตอร์ (ค่าเริ่มต้น) หรือมือถือ
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { InfoLayout } from '../../features/info/InfoLayout.jsx';
import Icon from '../../components/Icon.jsx';
import CircularShowcase from '../../components/CircularShowcase.jsx';
import '../../features/info/landing.css';

const FEATURES = [
  { src: '/img/landing/features/feature-1.png', tag: 'เอกสาร', alt: 'หน้าจอเลือกประเภทเอกสาร มีกรอบสีส้มล้อมรายการเอกสารธุรกิจและเอกสารภาษีที่สร้างได้', icon: 'file', title: 'สร้างเอกสารธุรกิจ สัญญา และ 50 ทวิ', text: 'ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จรับเงิน ใบส่งมอบงาน สัญญาจ้าง และหนังสือรับรองหัก ณ ที่จ่าย พิมพ์เป็น A4 ได้ทันที' },
  { src: '/img/landing/features/feature-2.png', tag: 'ภาษี', alt: 'หน้าจอสร้างใบเสร็จรับเงิน มีกรอบสีส้มล้อมกล่องยอดรวม ภาษีมูลค่าเพิ่ม 7% และยอดรวมทั้งสิ้นที่ระบบคำนวณ', icon: 'calc', title: 'คำนวณ VAT และภาษีหัก ณ ที่จ่าย', text: 'ระบบคำนวณยอดภาษีให้จากรายการในเอกสาร และตรวจสถานะ VAT ก่อนบันทึก' },
  { src: '/img/landing/features/feature-3.png', tag: 'ลายมือชื่อ', alt: 'หน้าต่างเอกสาร แท็บลายเซ็น มีกรอบสีส้มล้อมช่องลายมือชื่อแบบพิมพ์', icon: 'shield', title: 'ลงลายมือชื่อด้วย OTP', text: 'ยืนยันตัวตนด้วยรหัส OTP ทางอีเมลก่อนลงนามทุกครั้ง วาด พิมพ์ หรืออัปโหลดลายเซ็นได้' },
  { src: '/img/landing/features/feature-4.png', tag: 'คู่ค้า', alt: 'หน้าต่างเอกสาร แท็บส่งเอกสาร มีกรอบสีส้มล้อมช่องอีเมลคู่ค้า วัตถุประสงค์ กำหนดตอบกลับ และข้อความ', icon: 'inbox', title: 'ส่งเอกสารถึงคู่ค้า', text: 'คู่ค้าเห็นในกล่องรับเอกสาร ตรวจสอบ ลงนาม หรือส่งกลับแก้ไขได้ในระบบ' },
  { src: '/img/landing/features/feature-5.png', tag: 'จัดเก็บ', alt: 'หน้าเอกสารทั้งหมด มีกรอบสีส้มล้อมตัวกรองสถานะ ช่องค้นหา ช่วงวันที่ และปุ่มส่งออก', icon: 'search', title: 'ค้นหาและตรวจสอบด้วย QR Code', text: 'ค้นหาเอกสารย้อนหลัง ดูประวัติทุกการแก้ไข และให้ผู้รับสแกน QR ตรวจว่าเอกสารออกจากระบบจริง' },
];

const ROLES = [
  { tag: 'ผู้รับจ้างผลิตเนื้อหา', title: 'อินฟลูเอนเซอร์ / ครีเอเตอร์', text: 'ออกเอกสารเรียกเก็บเงินจากผู้ว่าจ้าง เก็บหนังสือรับรองหัก ณ ที่จ่าย และคำนวณภาษีทั้งปี', img: '/img/mascot-signature.webp' },
  { tag: 'ผู้ว่าจ้าง', tone: 'blue', title: 'บริษัท (Brand)', text: 'จ้างอินฟลูเอนเซอร์หรือเอเจนซี่ จ่ายเงินพร้อมหักภาษี ณ ที่จ่าย และเตรียมข้อมูลนำส่งภาษีรายเดือน', img: '/img/mascot-success.webp' },
  { tag: 'ตัวกลางบริหารการจ้าง', tone: 'purple', title: 'เอเจนซี่โฆษณา', text: 'ทำงานสองฝั่งพร้อมกัน รับงานจากแบรนด์ และจ้างอินฟลูเอนเซอร์ต่อ เป็นได้ทั้งนิติบุคคลหรือบุคคลธรรมดา', img: '/img/mascot-thinking.webp' },
];

const STEPS = [
  { title: 'สมัครสมาชิก', text: 'เลือกบทบาท กรอกข้อมูลผู้เสียภาษี และยืนยันอีเมล', alt: 'หน้าจอมือถือ ขั้นตอนสมัครสมาชิก เลือกบทบาทอินฟลูเอนเซอร์ บริษัท หรือเอเจนซี่', altDesktop: 'หน้าจอคอมพิวเตอร์ หน้าสมัครสมาชิก เลือกบทบาท พร้อมแผงต้อนรับสีส้ม' },
  { title: 'ยืนยันตัวตน', text: 'ส่งเอกสาร KYC ให้ผู้ดูแลระบบตรวจสอบ ผ่านแล้วจึงเริ่มออกเอกสารได้', alt: 'หน้าจอมือถือ หน้าโปรไฟล์แสดงความครบถ้วนของข้อมูลและสถานะยืนยันตัวตนแล้ว', altDesktop: 'หน้าจอคอมพิวเตอร์ หน้าโปรไฟล์ แท็บยืนยันตัวตน แสดงสถานะและเอกสารที่ต้องแนบ' },
  { title: 'สร้างเอกสาร', text: 'กรอกรายการ ระบบคำนวณ VAT และภาษีหัก ณ ที่จ่ายให้', alt: 'หน้าจอมือถือ ฟอร์มสร้างใบเสร็จรับเงิน แสดงยอดรวม ภาษีมูลค่าเพิ่ม 7% และยอดรวมทั้งสิ้นที่ระบบคำนวณ', altDesktop: 'หน้าจอคอมพิวเตอร์ ฟอร์มสร้างใบเสร็จรับเงิน ข้อมูลผู้จ่ายเงิน และกล่องยอดรวมพร้อมภาษีมูลค่าเพิ่ม 7%' },
  { title: 'ลงลายมือชื่อ', text: 'วาด พิมพ์ หรืออัปโหลดลายเซ็น แล้วยืนยันด้วย OTP', alt: 'หน้าจอมือถือ แท็บลายเซ็นของเอกสาร พิมพ์ชื่อเป็นลายมือชื่อแบบตัวเขียน', altDesktop: 'หน้าจอคอมพิวเตอร์ หน้าต่างเอกสาร แท็บลายเซ็น พิมพ์ชื่อเป็นลายมือชื่อแบบตัวเขียน' },
  { title: 'ส่งถึงคู่ค้า', text: 'คู่ค้าตรวจสอบ ลงนาม หรือส่งกลับแก้ไข พร้อมกำหนดวันตอบกลับ', alt: 'หน้าจอมือถือ แท็บส่งเอกสาร กรอกอีเมลคู่ค้า วัตถุประสงค์ และกำหนดตอบกลับ', altDesktop: 'หน้าจอคอมพิวเตอร์ หน้าต่างเอกสาร แท็บส่งเอกสาร กรอกอีเมลคู่ค้าและกำหนดตอบกลับ' },
  { title: 'จัดเก็บและตรวจสอบ', text: 'ค้นหาย้อนหลัง กรองตามสถานะ ดูประวัติ และตรวจด้วย QR Code', alt: 'หน้าจอมือถือ รายการเอกสารทั้งหมดแบบการ์ด พร้อมตัวกรองสถานะ ค้นหา และปุ่มส่งออก', altDesktop: 'หน้าจอคอมพิวเตอร์ ตารางเอกสารทั้งหมด พร้อมตัวกรองสถานะ ค้นหา ช่วงวันที่ และปุ่มส่งออก' },
];

const SCOPE = [
  ['ระบบต้นแบบเพื่อการศึกษา', 'พัฒนาและทดสอบกับผู้ใช้จำนวนไม่มากภายในขอบเขตโครงงาน'],
  ['ไม่เชื่อมต่อกรมสรรพากรหรือ ETDA', 'ไม่ส่งเอกสารเข้าระบบราชการ ผู้ใช้นำข้อมูลไปยื่นเองผ่านช่องทางของกรมสรรพากร'],
  ['ลายมือชื่อเป็นการจำลองกระบวนการ', 'เป็นภาพลายมือชื่อพร้อมข้อมูลผู้ลงนามและเวลา ยังไม่ใช่ลายมือชื่อดิจิทัลที่ใช้ใบรับรอง'],
  ['ไม่ยื่นแบบภาษีแทนผู้ใช้', 'ระบบจัดทำข้อมูลประกอบการยื่นแบบ ผู้ใช้เป็นผู้ยื่นเอง'],
];

const LINKS = [
  { to: '/overview', title: 'ภาพรวมระบบ', text: 'บทบาทผู้ใช้ เอกสารที่สร้างได้ สิทธิ์ตามสถานะ VAT และขอบเขตของระบบ' },
  { to: '/guide', title: 'ศูนย์ความรู้', text: 'คู่มือการใช้งาน ความรู้ภาษี กฎหมาย และคำถามที่พบบ่อย' },
  { to: '/verify-doc', title: 'ตรวจสอบเอกสาร', text: 'ตรวจว่าเอกสารออกจากระบบจริง ด้วยลิงก์หรือ QR Code บนเอกสาร' },
];

const STEP_NOS = [1, 2, 3, 4, 5, 6];
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** เลขลำดับภาพที่แสดง เปลี่ยนทุก ms (หยุดเมื่อผู้ใช้ตั้งลดการเคลื่อนไหว) */
function useCycle(count, ms) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduceMotion()) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms]);
  return i;
}

/** ภาพหน้าจอซ้อนกัน แสดงทีละภาพแบบค่อย ๆ จาง (ภาพแรกโหลดทันที ที่เหลือโหลดตามหลัง) */
function Slides({ srcs, alts, active, w, h }) {
  return (
    <div className="lp-slides" style={{ aspectRatio: `${w} / ${h}` }}>
      {srcs.map((src, k) => (
        <img key={src} src={src} alt={k === active ? alts[k] : ''} aria-hidden={k === active ? undefined : 'true'} width={w} height={h}
          loading={k === 0 ? 'eager' : 'lazy'} decoding="async" className={k === active ? 'on' : undefined} />
      ))}
    </div>
  );
}

/** กรอบโทรศัพท์ (ภาพจริง 375x812 @2x) */
function Phone({ children }) {
  return <div className="lp-phone">{children}</div>;
}

/** กรอบคอมพิวเตอร์โน้ตบุ๊ก (ภาพจริง 1440x900) */
function Laptop({ children }) {
  return (
    <div className="lp-laptop">
      <div className="lp-laptop-screen">{children}</div>
      <div className="lp-laptop-base" aria-hidden="true" />
    </div>
  );
}

const mobileSrc = (n) => `/img/landing/step-${n}.png`;
const desktopSrc = (n) => `/img/landing/desktop/step-${n}.png`;

export default function LandingPage() {
  const slide = useCycle(STEP_NOS.length, 2000);
  const [device, setDevice] = useState('desktop');
  return (
    <InfoLayout title="ระบบจัดการเอกสารภาษีสำหรับอินฟลูเอนเซอร์ เอเจนซี่ และแบรนด์">
      <section className="ip-hero lp-hero">
        <div className="ip-wrap lp-hero-grid">
          <div className="reveal">
            <img className="lp-logo" src="/img/logo.png" alt="TaxFlow" width="200" height="56" />
            <div className="ip-eyebrow"><i />ระบบต้นแบบเพื่อการศึกษา</div>
            <h1>จัดการเอกสารภาษีของ <em><span>อินฟลูเอนเซอร์</span> <span>เอเจนซี่</span> <span>และแบรนด์</span></em> ได้ในที่เดียว</h1>
            <p className="ip-lede"><b>TaxFlow</b> คือระบบต้นแบบจัดการเอกสารภาษีของอินฟลูเอนเซอร์ เอเจนซี่ และแบรนด์ในที่เดียว สร้างเอกสารธุรกิจและเอกสารภาษี คำนวณภาษี ลงลายมือชื่อ ส่งเอกสารถึงคู่ค้า และจัดเก็บอย่างเป็นระบบ</p>
            <div className="ip-hero-actions">
              <Link to="/register" className="ip-btn solid">สมัครสมาชิก</Link>
              <Link to="/login" className="ip-btn ghost">เข้าสู่ระบบ</Link>
            </div>
          </div>
          {/* คอมพิวเตอร์ (เด่นกว่า) + โทรศัพท์ซ้อนมุมขวาล่าง เปลี่ยนภาพหน้าจอทุก 2 วินาทีพร้อมกัน
              มาสคอต: สองตัวอยู่ด้านหลัง (ซ้าย/ขวาบน) อีกตัวยืนหน้าโทรศัพท์ (ขวาล่าง) */}
          <div className="lp-hero-art reveal" style={{ '--d': '.15s' }}>
            <img className="lp-mascot m-back-left" src="/img/mascot-hello.webp" alt="" width="260" height="260" />
            <img className="lp-mascot m-back-right" src="/img/mascot-locked.webp" alt="" width="150" height="150" />
            <div className="lp-devices">
              <Laptop><Slides srcs={STEP_NOS.map(desktopSrc)} alts={STEPS.map((s) => s.altDesktop)} active={slide} w={1440} h={900} /></Laptop>
              <Phone><Slides srcs={STEP_NOS.map(mobileSrc)} alts={STEPS.map((s) => s.alt)} active={slide} w={375} h={812} /></Phone>
            </div>
            <img className="lp-mascot m-front" src="/img/mascot-otp.webp" alt="" width="170" height="170" />
            <span className="lp-ground" aria-hidden="true" />
            <p className="lp-caption" aria-live="polite">ขั้นที่ {slide + 1} · {STEPS[slide].title}</p>
          </div>
        </div>
      </section>

      <div className="ip-wrap">
        <section className="ip-section" aria-labelledby="lp-features">
          <div className="ip-section-head reveal"><div><div className="ip-kicker">ระบบทำอะไรได้</div><h2 id="lp-features">ครบตั้งแต่สร้างเอกสารถึงตรวจสอบ</h2></div></div>
          {/* ภาพหน้าจอจริงของแต่ละความสามารถ (กรอบสีส้มล้อมส่วนที่เกี่ยวข้อง) หมุนเป็นวงกลม ข้อความอยู่ด้านข้าง */}
          <div className="reveal">
            <CircularShowcase label="ความสามารถของระบบ" items={FEATURES} />
          </div>
        </section>

        <section className="ip-section" aria-labelledby="lp-roles">
          <div className="ip-section-head reveal"><div><div className="ip-kicker">ใครใช้ได้</div><h2 id="lp-roles">สามบทบาท ออกเอกสารในนามของตนเองและส่งหากันได้</h2></div></div>
          <div className="ip-grid-3" data-stagger="">
            {ROLES.map((r) => (
              <div key={r.title} className="ip-card hover reveal lp-role">
                <img src={r.img} alt="" width="96" height="96" loading="lazy" />
                <span className={`ip-tag ${r.tone || ''}`}>{r.tag}</span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ip-section" aria-labelledby="lp-steps">
          <div className="ip-section-head lp-steps-head reveal"><div><div className="ip-kicker">ขั้นตอนการใช้งาน</div><h2 id="lp-steps">จากสมัครสมาชิกถึงจัดเก็บเอกสาร 6 ขั้น</h2><p>ภาพจากหน้าจอจริงของระบบ ใช้ข้อมูลของบัญชีทดสอบ</p></div>
            <div className="lp-device-switch" role="radiogroup" aria-label="ดูภาพหน้าจอแบบ">
              {[['desktop', 'คอมพิวเตอร์'], ['mobile', 'มือถือ']].map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={device === v} onClick={() => setDevice(v)} className={device === v ? 'on' : undefined}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {v === 'desktop' ? <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20" /></> : <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>}
                  </svg>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ol className={`lp-steps ${device}`}>
            {STEPS.map((s, i) => (
              <li key={s.title} className="lp-step reveal">
                <div className="lp-step-text">
                  <span className="lp-step-no" aria-hidden="true"><span>{i + 1}</span></span>
                  <h3><span className="sr-only">ขั้นที่ {i + 1}: </span>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
                {device === 'desktop'
                  ? <Laptop><img src={desktopSrc(i + 1)} alt={s.altDesktop} width="1440" height="900" loading="lazy" decoding="async" /></Laptop>
                  : <Phone><img src={mobileSrc(i + 1)} alt={s.alt} width="375" height="812" loading="lazy" decoding="async" /></Phone>}
              </li>
            ))}
          </ol>
        </section>

        <section className="ip-section" aria-labelledby="lp-scope">
          <div className="ip-section-head reveal"><div><div className="ip-kicker">ข้อควรทราบ</div><h2 id="lp-scope">ขอบเขตของระบบต้นแบบ</h2></div></div>
          <div className="ip-grid-2" data-stagger="">
            {SCOPE.map(([t, d]) => (
              <div key={t} className="ip-card reveal"><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </section>

        <section className="ip-section" aria-labelledby="lp-more">
          <div className="ip-section-head reveal"><div><div className="ip-kicker">อ่านเพิ่มเติม</div><h2 id="lp-more">ข้อมูลระบบและเครื่องมือสาธารณะ</h2></div></div>
          <div className="ip-grid-3" data-stagger="">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="ip-card hover reveal lp-link">
                <h3>{l.title}<Icon name="arrow" className="size-4" /></h3>
                <p>{l.text}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="ip-cta reveal lp-cta">
          <div>
            <h2>เริ่มใช้งาน TaxFlow</h2>
            <p>สมัครสมาชิก เลือกบทบาท และส่งเอกสารยืนยันตัวตน แล้วเริ่มออกเอกสารฉบับแรกได้เลย</p>
            <div className="ip-hero-actions"><Link to="/register" className="ip-btn solid">สมัครสมาชิก</Link><Link to="/login" className="ip-btn ghost">เข้าสู่ระบบ</Link></div>
          </div>
          <img src="/img/mascot-wave.png" alt="" width="190" height="190" loading="lazy" />
        </section>
      </div>
    </InfoLayout>
  );
}
