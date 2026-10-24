/**
 * InfoOverviewPage.jsx ภาพรวมระบบ (หน้าสาธารณะ ไม่ต้องเข้าสู่ระบบ) ย้ายเนื้อหาจาก overview.html เดิม
 */
import { Link } from 'react-router';
import { InfoLayout, Tabs, Tab, Panel, Count } from '../../features/info/InfoLayout.jsx';
import Pager from '../../features/info/Pager.jsx';

export default function InfoOverviewPage() {
  return (
    <InfoLayout title="ภาพรวมระบบ" tabs={{"role":"r-creator"}}>
      <><section className="ip-hero">
  <div className="ip-wrap">
    <div className="ip-hero-grid">
      <div className="reveal">
        <div className="ip-eyebrow"><i></i>ภาพรวมระบบ</div>
        <h1>จัดการเอกสารภาษีของ<br /><em>Influencer เอเจนซี่ และแบรนด์</em><br />ได้ในระบบเดียว</h1>
        <p className="ip-lede">TaxFlow คือระบบต้นแบบสำหรับสร้างเอกสารธุรกิจและเอกสารภาษี คำนวณภาษี ลงลายมือชื่อ ส่งเอกสารถึงคู่ค้า และจัดเก็บอย่างเป็นระบบ หน้านี้สรุปว่าระบบทำอะไรได้ ผู้ใช้แต่ละบทบาทใช้งานอะไรได้บ้าง และขอบเขตที่ควรทราบก่อนใช้งาน</p>
        <div className="ip-hero-actions">
          <a className="ip-btn solid" href="#pager">ดูขั้นตอนการทำงาน</a>
          <Link to="/guide" className="ip-btn ghost">เปิดศูนย์ความรู้</Link>
        </div>
      </div>
      <div className="ip-hero-art reveal" style={{ "--d": ".15s" }} aria-hidden="true">
        <div className="ring"></div><div className="disc"></div>
        <img src="/img/mascot-wave.png" alt="" />
        <div className="ip-bubble b1"><b>12</b> ประเภทเอกสาร<small>สร้างและพิมพ์ A4 ได้ทันที</small></div>
        <div className="ip-bubble b2">ยืนยันตัวตนด้วย <b>OTP</b><small>สมัคร เข้าสู่ระบบ และลงนาม</small></div>
      </div>
    </div>
    <div className="ip-stats" data-stagger="">
      <div className="ip-stat reveal"><b><Count to="3" /><small>บทบาท</small></b><span>อินฟลูเอนเซอร์ บริษัท และเอเจนซี่ พร้อมผู้ดูแลระบบ</span></div>
      <div className="ip-stat reveal"><b><Count to="12" /><small>ประเภท</small></b><span>เอกสารธุรกิจ สัญญา และเอกสารภาษี</span></div>
      <div className="ip-stat reveal"><b><Count to="3" /><small>จุด</small></b><span>ยืนยันตัวตนด้วยรหัส OTP ทางอีเมล</span></div>
      <div className="ip-stat reveal"><b><Count to="256" /><small>บิต</small></b><span>เข้ารหัสไฟล์ยืนยันตัวตนด้วย AES-256-GCM</span></div>
    </div>
  </div>
</section>

<div className="ip-wrap ip-pager-wrap" id="pager">
  <Pager label="ภาพรวมระบบ ปัดซ้าย-ขวาเพื่อเปลี่ยนหัวข้อ" slides={[
    { id: 'flow', label: 'ขั้นตอนการทำงาน', content: (
    <section className="ip-section">
      <div className="ip-section-head reveal"><div><div className="ip-kicker">การทำงานโดยรวม</div><h2>จากสมัครสมาชิกถึงจัดเก็บเอกสาร</h2><p>ทุกเอกสารผ่านขั้นตอนเดียวกัน ระบบตรวจข้อมูลและบันทึกประวัติให้ทุกขั้น</p></div></div>
      <div className="ip-flow">
        <div className="ip-step"><div className="dot">1</div><b>สมัครสมาชิก</b><span>เลือกบทบาท กรอกข้อมูลผู้เสียภาษี ยืนยันอีเมล</span></div>
        <div className="ip-step"><div className="dot">2</div><b>ยืนยันตัวตน</b><span>ส่งเอกสาร KYC ให้ผู้ดูแลระบบตรวจสอบ</span></div>
        <div className="ip-step"><div className="dot">3</div><b>สร้างเอกสาร</b><span>ระบบคำนวณ VAT และภาษีหัก ณ ที่จ่ายให้</span></div>
        <div className="ip-step"><div className="dot">4</div><b>ลงลายมือชื่อ</b><span>ยืนยันด้วย OTP ก่อนลงนามทุกครั้ง</span></div>
        <div className="ip-step"><div className="dot">5</div><b>ส่งถึงคู่ค้า</b><span>คู่ค้าตรวจสอบ ลงนาม หรือส่งกลับแก้ไข</span></div>
        <div className="ip-step"><div className="dot">6</div><b>จัดเก็บและตรวจสอบ</b><span>ค้นหาย้อนหลัง ดูประวัติ ตรวจด้วย QR Code</span></div>
      </div>
    </section>) },

    { id: 'roles', label: 'บทบาทผู้ใช้งาน', content: (
    <section className="ip-section">
      <div className="ip-section-head reveal"><div><div className="ip-kicker">ผู้ใช้งาน</div><h2>แต่ละบทบาทใช้งานอะไรได้บ้าง</h2><p>ทั้งสามบทบาทเป็นผู้ใช้อิสระ ออกเอกสารในนามของตนเองได้ และส่งเอกสารหากันผ่านระบบ</p></div></div>
      <div className="reveal">
        <Tabs group="role"><Tab id="r-creator">อินฟลูเอนเซอร์</Tab><Tab id="r-brand">บริษัท (Brand)</Tab><Tab id="r-agency">เอเจนซี่</Tab><Tab id="r-admin">ผู้ดูแลระบบ</Tab></Tabs>
        <Panel id="r-creator" group="role">
          <div className="ip-role">
            <div className="ip-role-art"><img src="/img/mascot-signature.png" alt="" /></div>
            <div>
              <span className="ip-tag">ผู้รับจ้างผลิตเนื้อหา</span>
              <h3>อินฟลูเอนเซอร์ / ครีเอเตอร์</h3>
              <p className="desc">ออกเอกสารเรียกเก็บเงินจากผู้ว่าจ้าง เก็บหนังสือรับรองหัก ณ ที่จ่าย และคำนวณภาษีทั้งปี</p>
              <ul className="ip-list">
                <li><b>สร้างเอกสาร</b> ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จรับเงิน และใบส่งมอบงาน</li>
                <li><b>บันทึก 50 ทวิ</b> ที่ได้รับจากผู้ว่าจ้างแต่ละราย</li>
                <li><b>คำนวณภาษีเงินได้</b> จากเอกสารในระบบหรือกรอกเอง ครบทุกขั้นตอน</li>
                <li><b>ปฏิทินงาน</b> วันส่งงาน วันโพสต์ และกำหนดยื่นแบบ ภ.ง.ด.90/91/94</li>
                <li><b>ลงนามและตอบกลับ</b> สัญญาจ้างที่แบรนด์หรือเอเจนซี่ส่งมา</li>
                <li><b>คลังเอกสาร</b> 50 ทวิ แบบ ภ.ง.ด. ใบเสร็จ และใบแจ้งหนี้</li>
              </ul>
            </div>
          </div>
        </Panel>
        <Panel id="r-brand" group="role">
          <div className="ip-role">
            <div className="ip-role-art"><img src="/img/mascot-success.png" alt="" /></div>
            <div>
              <span className="ip-tag blue">ผู้ว่าจ้าง</span>
              <h3>บริษัท (Brand)</h3>
              <p className="desc">จ้างอินฟลูเอนเซอร์หรือเอเจนซี่ จ่ายเงินพร้อมหักภาษี ณ ที่จ่าย และเตรียมข้อมูลนำส่งภาษีรายเดือน</p>
              <ul className="ip-list">
                <li><b>เอกสารจัดซื้อจัดจ้าง</b> ใบเสนอราคา ใบสั่งซื้อ ใบแจ้งหนี้ ใบเสร็จ และใบส่งมอบงาน</li>
                <li><b>การจ่ายเงิน</b> ใบสำคัญจ่ายและหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)</li>
                <li><b>สัญญาและอำนาจ</b> สัญญาจ้าง Influencer และหนังสือมอบอำนาจ</li>
                <li><b>จัดทำข้อมูล ภ.ง.ด.3 / ภ.ง.ด.53</b> รวมรายการจากเอกสารในเดือนภาษี</li>
                <li><b>แดชบอร์ด</b> มูลค่าเอกสาร ยอด VAT ยอดหัก ณ ที่จ่าย และงานค้าง</li>
                <li><b>ปฏิทินงาน</b> ครบกำหนดชำระ สัญญาสิ้นสุด และกำหนดนำส่งภาษี</li>
              </ul>
            </div>
          </div>
        </Panel>
        <Panel id="r-agency" group="role">
          <div className="ip-role">
            <div className="ip-role-art"><img src="/img/mascot-thinking.png" alt="" /></div>
            <div>
              <span className="ip-tag purple">ตัวกลางบริหารการจ้าง</span>
              <h3>เอเจนซี่โฆษณา</h3>
              <p className="desc">ทำงานสองฝั่งพร้อมกัน รับงานจากแบรนด์ และจ้างอินฟลูเอนเซอร์ต่อ เป็นได้ทั้งนิติบุคคลหรือบุคคลธรรมดา</p>
              <ul className="ip-list">
                <li><b>ฝั่งแบรนด์</b> สัญญากับ Brand ใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงิน</li>
                <li><b>ฝั่งอินฟลูเอนเซอร์</b> สัญญาจ้าง ใบสำคัญจ่าย และ 50 ทวิ</li>
                <li><b>รับมอบอำนาจ</b> จากบริษัทผ่านการส่งเอกสารข้ามบัญชี</li>
                <li><b>สมุดคู่ค้า</b> เก็บข้อมูลแบรนด์และอินฟลูเอนเซอร์เพื่อดึงไปใช้ซ้ำ</li>
                <li><b>กล่องรับเอกสารเดียว</b> รวมคำขอจากทั้งสองฝั่ง</li>
                <li><b>คลังเอกสาร 3 หมวด</b> เอกสารบริษัท เอกสารภาษี และเอกสารดำเนินงาน</li>
              </ul>
            </div>
          </div>
        </Panel>
        <Panel id="r-admin" group="role">
          <div className="ip-role">
            <div className="ip-role-art"><img src="/img/mascot-admin.png" alt="" /></div>
            <div>
              <span className="ip-tag grey">ผู้ตรวจสอบ</span>
              <h3>ผู้ดูแลระบบ</h3>
              <p className="desc">ตรวจสอบบัญชีและเอกสารยืนยันตัวตน โดยไม่ออกเอกสารแทนผู้ใช้งาน</p>
              <ul className="ip-list">
                <li><b>ตรวจสอบ KYC</b> เปิดดูเอกสารยืนยันตัวตนตามบทบาทของผู้สมัคร</li>
                <li><b>อนุมัติหรือไม่อนุมัติ</b> โดยต้องระบุเหตุผลทุกครั้งที่ไม่อนุมัติ</li>
                <li><b>ติดตามสถานะ</b> ยังไม่ส่งเอกสาร รอตรวจสอบ ยืนยันแล้ว และไม่อนุมัติ</li>
                <li><b>บันทึกการเปิดดู</b> ระบบบันทึกผู้เปิด เวลา และเอกสารทุกครั้ง</li>
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </section>) },

    { id: 'documents', label: 'เอกสารในระบบ', content: (
    <section className="ip-section">
      <div className="ip-section-head reveal"><div><div className="ip-kicker">เอกสาร</div><h2>เอกสารที่ระบบสร้างได้ และสร้างไม่ได้</h2><p>ระบบแยกเอกสารที่เอกชนออกเองได้ ออกจากเอกสารที่หน่วยงานรัฐเป็นผู้ออก เพื่อความชัดเจนทางกฎหมาย</p></div></div>
      <div className="ip-grid-2 ip-compare" data-stagger="">
        <div className="ip-card reveal">
          <span className="ip-tag green">สร้างได้ในระบบ</span>
          <h3>เอกสารที่ผู้ใช้ออกเองได้โดยชอบด้วยกฎหมาย</h3>
          <ul className="ip-list">
            <li><b>เอกสารธุรกิจ</b> ใบเสนอราคา ใบสั่งซื้อ ใบแจ้งหนี้ ใบเสร็จรับเงิน ใบส่งมอบงาน ใบสำคัญจ่าย</li>
            <li><b>สัญญา</b> สัญญากับ Brand สัญญาจ้าง Influencer และหนังสือมอบอำนาจ</li>
            <li><b>เอกสารภาษี</b> หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)</li>
            <li><b>ข้อมูลประกอบการยื่นแบบ</b> ภ.ง.ด.3 และ ภ.ง.ด.53 สำหรับนำไปยื่นเอง</li>
          </ul>
        </div>
        <div className="ip-card no reveal">
          <span className="ip-tag red">ไม่สร้างในทุกกรณี</span>
          <h3>เอกสารที่หน่วยงานรัฐเป็นผู้ออกเท่านั้น</h3>
          <ul className="ip-list">
            <li>ภ.พ.20 ใบทะเบียนภาษีมูลค่าเพิ่ม</li>
            <li>หนังสือรับรองการจดทะเบียนนิติบุคคล</li>
            <li>เลขประจำตัวผู้เสียภาษี</li>
            <li>ใบตอบรับการยื่นแบบจากระบบ e-Filing ของกรมสรรพากร</li>
          </ul>
          <p style={{ marginTop: "12px", fontSize: "14.5px" }}>ผู้ใช้อัปโหลดเอกสารกลุ่มนี้เข้าคลังเอกสารหรือใช้ยืนยันตัวตนได้ แต่ระบบจะไม่สร้างขึ้นแทน</p>
        </div>
      </div>
    </section>) },

    { id: 'vat', label: 'สิทธิ์ตามสถานะ VAT', content: (
    <section className="ip-section">
      <div className="ip-section-head reveal"><div><div className="ip-kicker">สถานะผู้ประกอบการ</div><h2>สิทธิ์ในการออกเอกสารขึ้นกับสถานะ VAT</h2><p>ระบบตรวจสถานะก่อนบันทึกเอกสาร เพื่อไม่ให้คิดภาษีมูลค่าเพิ่มโดยไม่มีสิทธิ์</p></div></div>
      <div className="ip-grid-3" data-stagger="">
        <div className="ip-card hover reveal"><span className="ip-tag green">จดทะเบียน VAT แล้ว</span><h3>คิด VAT 7% ในเอกสารได้</h3><p>ต้องแนบ ภ.พ.20 ในขั้นตอนยืนยันตัวตน และระบุวันที่จดทะเบียนในโปรไฟล์</p></div>
        <div className="ip-card hover reveal"><span className="ip-tag">ยังไม่จดทะเบียน VAT</span><h3>ออกเอกสารธุรกิจได้ตามปกติ</h3><p>คิดภาษีมูลค่าเพิ่มไม่ได้ตามประมวลรัษฎากร มาตรา 86 ระบบจะแจ้งเตือนหากเลือกคิด VAT</p></div>
        <div className="ip-card hover reveal"><span className="ip-tag blue">ทุกบทบาท</span><h3>ข้อมูลโปรไฟล์ต้องครบก่อน</h3><p>ชื่อ เลขประจำตัวผู้เสียภาษี ที่อยู่ และสำนักงานใหญ่หรือสาขา ต้องครบเพราะต้องปรากฏบนเอกสาร</p></div>
      </div>
    </section>) },

    { id: 'pdpa', label: 'ข้อมูลส่วนบุคคล', content: (
    <section className="ip-section">
      <div className="ip-section-head reveal"><div><div className="ip-kicker">PDPA</div><h2>เก็บข้อมูลส่วนบุคคลเท่าที่จำเป็น</h2><p>ยึดหลักการเก็บเท่าที่จำเป็นตามมาตรา 22 และแยกความยินยอมรายวัตถุประสงค์ตามมาตรา 19</p></div></div>
      <div className="ip-grid-2" data-stagger="">
        <div className="ip-card hover reveal"><h3>ไม่ขอสำเนาบัตรประชาชนของผู้ใช้</h3><p>ใช้เลขประจำตัวผู้เสียภาษี 13 หลักซึ่งเพียงพอต่อการออกเอกสาร เพื่อไม่ให้ได้รับข้อมูลอ่อนไหวตามมาตรา 26 โดยไม่จำเป็น</p></div>
        <div className="ip-card hover reveal"><h3>ไฟล์สำคัญถูกเข้ารหัสก่อนจัดเก็บ</h3><p>เอกสารยืนยันตัวตน คลังเอกสาร และไฟล์แนบในปฏิทิน เข้ารหัสด้วย AES-256-GCM และบันทึกการเปิดดู</p></div>
        <div className="ip-card hover reveal"><h3>ผู้ใช้ใช้สิทธิได้ด้วยตนเอง</h3><p>ขอสำเนาข้อมูลเป็นไฟล์ JSON ถอนความยินยอมข้อที่ไม่บังคับ และลบบัญชี โดยเอกสารภาษีเก็บต่อแบบไม่ระบุตัวบุคคล</p></div>
        <div className="ip-card hover reveal"><h3>ลบข้อมูลที่หมดความจำเป็นอัตโนมัติ</h3><p>รหัส OTP ที่ใช้แล้วลบภายใน 24 ชั่วโมง การแจ้งเตือนที่อ่านแล้วลบเมื่อครบ 90 วัน</p></div>
      </div>
      <div className="ip-note reveal" style={{ marginTop: "16px" }}><img src="/img/mascot-locked.png" alt="" /><div><b>อ่านรายละเอียดเพิ่มเติม</b><br />ข้อมูลที่เก็บ เหตุผล ระยะเวลาเก็บรักษา และสิทธิของเจ้าของข้อมูล อยู่ในหน้า <Link to="/guide/privacy" style={{ color: "var(--orange-deep)", fontWeight: "700" }}>ความเป็นส่วนตัวและข้อมูล</Link></div></div>
    </section>) },

    { id: 'scope', label: 'ขอบเขตของระบบ', content: (
    <section className="ip-section">
      <div className="ip-section-head reveal"><div><div className="ip-kicker">ข้อควรทราบ</div><h2>ขอบเขตของระบบต้นแบบ</h2><p>TaxFlow พัฒนาเพื่อการศึกษา รายการต่อไปนี้เป็นข้อจำกัดที่อยู่นอกขอบเขตโครงงาน</p></div></div>
      <div className="reveal">
        <details className="ip-acc" open><summary>ไม่เชื่อมต่อกรมสรรพากรหรือ ETDA<span className="meta">การยื่นแบบ</span><span className="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></summary><div className="body"><p>ระบบไม่ส่งเอกสารเข้าระบบราชการและไม่ยื่นแบบภาษีแทนผู้ใช้ ผู้ใช้นำข้อมูลที่ระบบจัดทำไปยื่นเองผ่านช่องทางของกรมสรรพากร เช่น ระบบ e-Filing</p></div></details>
        <details className="ip-acc"><summary>ลายมือชื่อเป็นการจำลองกระบวนการ<span className="meta">การลงนาม</span><span className="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></summary><div className="body"><p>ลายมือชื่อในระบบเป็นภาพลายมือชื่อพร้อมข้อมูลผู้ลงนามและเวลา ยืนยันตัวตนด้วย OTP แต่ยังไม่ใช่ลายมือชื่อดิจิทัลที่ใช้ใบรับรองจากผู้ให้บริการออกใบรับรองอิเล็กทรอนิกส์</p></div></details>
        <details className="ip-acc"><summary>ยืนยันตัวตนด้วย OTP ทางอีเมล<span className="meta">ความปลอดภัย</span><span className="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></summary><div className="body"><p>ใช้ OTP 3 จุด คือ สมัครสมาชิก เข้าสู่ระบบ และลงลายมือชื่อ ระบบยังไม่ส่ง OTP ทาง SMS เพราะต้องใช้บริการภายนอกที่มีค่าใช้จ่ายและต้องเก็บเบอร์โทรศัพท์เพิ่ม ชั้น OTP ออกแบบให้เพิ่มช่องทาง SMS ได้ในอนาคต เหมาะกับการเปลี่ยนอีเมล การเปลี่ยนบัญชีธนาคาร และการลงนามเอกสารมูลค่าสูง</p></div></details>
        <details className="ip-acc"><summary>ผู้ดูแลระบบตรวจเอกสารยืนยันตัวตนด้วยตนเอง<span className="meta">KYC</span><span className="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></summary><div className="body"><p>ระบบยังไม่เชื่อมต่อฐานข้อมูลกรมพัฒนาธุรกิจการค้าเพื่อตรวจหนังสือรับรองนิติบุคคลอัตโนมัติ</p></div></details>
        <details className="ip-acc"><summary>การแจ้งเตือนแสดงในระบบเป็นหลัก<span className="meta">การแจ้งเตือน</span><span className="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></summary><div className="body"><p>การแจ้งเตือนเอกสารแสดงผ่านไอคอนกระดิ่ง ส่วนรหัส OTP ส่งทางอีเมลจริงเมื่อตั้งค่าอีเมลผู้ส่งแล้ว หากยังไม่ตั้งค่า ระบบจะแสดงรหัสทดสอบบนหน้าจอเพื่อให้ทดลองใช้งานได้</p></div></details>
        <details className="ip-acc"><summary>กำหนดยื่นภาษีในปฏิทินเป็นการประมาณ<span className="meta">ปฏิทินงาน</span><span className="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></summary><div className="body"><p>คำนวณตามหลักทั่วไป ยังไม่เลื่อนตามวันหยุดราชการ ควรตรวจสอบกำหนดการจริงกับกรมสรรพากรก่อนยื่นแบบ</p></div></details>
        <details className="ip-acc"><summary>ยังไม่ได้ทดสอบในระดับใช้งานจริง<span className="meta">การทดสอบ</span><span className="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"></path></svg></span></summary><div className="body"><p>สาธิตและทดสอบกับผู้ใช้จำนวนไม่มากภายในขอบเขตโครงงาน</p></div></details>
      </div>
    </section>) },
  ]} />

    <section className="ip-cta reveal">
      <div>
        <h2>พร้อมเริ่มใช้งานแล้วหรือยัง</h2>
        <p>อ่านคู่มือเพื่อดูขั้นตอนการใช้งานทีละหน้า หรือเข้าสู่ระบบด้วยบัญชีทดลองได้ทันที</p>
        <div className="ip-hero-actions"><Link to="/guide" className="ip-btn solid">เปิดศูนย์ความรู้</Link><Link to="/login" className="ip-btn ghost">เข้าสู่ระบบ</Link></div>
      </div>
      <img src="/img/mascot-idle.png" alt="" />
    </section>
</div></>
    </InfoLayout>
  );
}
