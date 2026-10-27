/**
 * capture-landing.mjs แคปภาพหน้าจอ 6 ขั้นตอนการใช้งาน สำหรับหน้าแนะนำระบบ (/) ทั้งมือถือและคอมพิวเตอร์
 * ผลลัพธ์: apps/web/public/img/landing/step-1.png ถึง step-6.png (มือถือ 375x812 @2x)
 *         apps/web/public/img/landing/desktop/step-1.png ถึง step-6.png (คอมพิวเตอร์ 1440x900)
 *         apps/web/public/img/landing/features/feature-1.png ถึง feature-5.png (ภาพประกอบ "ระบบทำอะไรได้" มีกรอบส้มล้อมส่วนที่เกี่ยวข้อง)
 *
 * วิธีรัน (ใช้บัญชีทดสอบที่ไม่ต้องยืนยัน OTP เท่านั้น ห้ามใช้บัญชีจริง):
 *   TAXFLOW_BASE_URL=http://localhost:5173 TAXFLOW_TEST_EMAIL=... TAXFLOW_TEST_PASSWORD=... npm run capture:landing
 * ต้องเปิดหน้าเว็บ (npm run dev:web) และ API (npm run dev) ไว้ก่อน และติดตั้งเบราว์เซอร์ครั้งแรกด้วย npx playwright install chromium
 *
 * ข้อมูลในภาพมาจากบัญชีทดสอบเท่านั้น (อีเมล @taxflow.test คู่ค้าและเลขผู้เสียภาษีตัวอย่าง)
 * ช่องอีเมลบัญชีถูกแทนด้วยอีเมลตัวอย่างก่อนแคปอีกชั้น กันอีเมลจริงหลุดเข้าภาพถ้าใช้บัญชีอื่น
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps/web/public/img/landing');
const BASE = (process.env.TAXFLOW_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const EMAIL = process.env.TAXFLOW_TEST_EMAIL;
const PASSWORD = process.env.TAXFLOW_TEST_PASSWORD;
const SAMPLE_EMAIL = 'creator@taxflow.test';

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
if (!EMAIL || !PASSWORD) fail('ต้องตั้ง TAXFLOW_TEST_EMAIL และ TAXFLOW_TEST_PASSWORD (บัญชีทดสอบที่ไม่ต้องใช้ OTP)');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** รอให้หน้าโหลดเสร็จ: ไม่มีตัวโหลด/โครงร่างค้าง และแอนิเมชันเข้าจบ */
async function settle(page, extra = 600) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.animate-pulse, [aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {});
  await wait(extra);
}

/** ซ่อนข้อมูลส่วนตัวในภาพ: อีเมลบัญชีแทนด้วยอีเมลตัวอย่าง · รูปโปรไฟล์/โลโก้ที่อัปโหลดแทนด้วยมาสคอตของระบบ */
async function maskPersonal(page) {
  await page.evaluate(({ email, sample }) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeValue.includes(email)) n.nodeValue = n.nodeValue.split(email).join(sample);
    }
    document.querySelectorAll('input').forEach((i) => { if (i.value === email) i.value = sample; });
    document.querySelectorAll('img').forEach((img) => {
      if (/\/api\//.test(img.getAttribute('src') || '')) { img.src = '/img/mascot-hello.webp'; img.style.objectFit = 'contain'; img.style.background = '#FFF1E6'; }
    });
  }, { email: EMAIL, sample: SAMPLE_EMAIL });
  await wait(300);
}

/** focus = ส่วนที่ต้องเห็นในภาพ (เลื่อนให้อยู่กลางจอ หรือ block='start' ให้อยู่บนสุดใต้แถบเมนู) */
async function shoot(page, file, title, focus, block = 'center') {
  if (focus) {
    const el = page.locator(focus).first();
    await el.waitFor({ state: 'visible', timeout: 15000 });
    await el.evaluate((e, b) => {
      e.scrollIntoView({ block: b });
      if (b === 'start') window.scrollBy(0, -96); // เว้นที่ให้แถบบนที่ติดขอบจอ
    }, block);
    await wait(500);
  }
  await page.mouse.move(1, 1); // เอาเมาส์ออกจากการ์ด ไม่ให้ติดสถานะชี้ (hover) ในภาพ
  await maskPersonal(page);
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
  console.log(`✔ ${path.relative(OUT, file)}  ${title}`);
}

const DEVICES = [
  { name: 'มือถือ', dir: OUT, options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'คอมพิวเตอร์', dir: path.join(OUT, 'desktop'), options: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
];

const browser = await chromium.launch();

/** แคปครบ 6 ขั้นด้วยอุปกรณ์หนึ่งแบบ (บริบทเบราว์เซอร์ใหม่ทุกครั้ง เริ่มจากยังไม่เข้าสู่ระบบ) */
async function captureSet(device) {
await mkdir(device.dir, { recursive: true });
const at = (n) => path.join(device.dir, `step-${n}.png`);
console.log(`\n— ${device.name} —`);
const context = await browser.newContext({
  ...device.options,
  locale: 'th-TH',
  timezoneId: 'Asia/Bangkok',
  colorScheme: 'light',
});
// ปิดหน้าต่างแนะนำการใช้งานครั้งแรก และตั้งธีมสว่างให้ภาพเหมือนกันทุกครั้ง
await context.addInitScript(({ email }) => {
  try {
    localStorage.setItem(`tf_onboard_${email}`, '1');
    localStorage.setItem('tf.theme', 'light');
  } catch { /* ไม่มีที่เก็บก็แคปได้ */ }
}, { email: EMAIL });
const page = await context.newPage();

try {
  // 1) สมัครสมาชิก (ยังไม่เข้าสู่ระบบ): เลือกบทบาท
  await page.goto(`${BASE}/register`);
  await settle(page);
  const role = page.locator('input[type="radio"]').first();
  if (await role.count()) await role.check({ force: true }).catch(() => {});
  await shoot(page, at(1), 'สมัครสมาชิก เลือกบทบาท');

  // เข้าสู่ระบบด้วยบัญชีทดสอบ (บัญชีที่ต้องใช้ OTP สคริปต์ผ่านเองไม่ได้)
  const res = await page.request.post(`${BASE}/api/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) fail(`เข้าสู่ระบบไม่สำเร็จ: ${body.error || res.status()}`);
  if (!body.user) {
    fail('บัญชีนี้ต้องยืนยัน OTP ทางอีเมล สคริปต์ผ่านขั้นนี้เองไม่ได้\n  ใช้บัญชีทดสอบที่ปิด OTP (เช่น test-creator@taxflow.test) หรือเข้าสู่ระบบเองแล้วรันใหม่');
  }

  // 2) ยืนยันตัวตน: แท็บยืนยันตัวตนในโปรไฟล์
  await page.goto(`${BASE}/app/profile?tab=kyc`);
  await settle(page, 900);
  await shoot(page, at(2), 'ยืนยันตัวตน (KYC)', 'text=สถานะยืนยันตัวตน');

  // หาเอกสารของบัญชีทดสอบ: แบบร่างสำหรับขั้นสร้างเอกสาร และฉบับที่ยังไม่ลงนามสำหรับขั้นลงนาม/ส่ง
  const list = await (await page.request.get(`${BASE}/api/documents?scope=mine`)).json();
  const items = list.items || [];
  const draft = items.find((d) => d.status === 'draft');
  const target = items.find((d) => d.status !== 'cancelled' && !d.signed) || items[0];
  if (!draft) fail('บัญชีทดสอบไม่มีเอกสารแบบร่าง (ใช้แคปขั้นสร้างเอกสาร) รัน apps/api/scripts/seed-test-accounts.js หรือสร้างแบบร่างไว้ 1 ฉบับ');
  if (!target) fail('บัญชีทดสอบไม่มีเอกสาร');

  // 3) สร้างเอกสาร: ฟอร์มขั้นกรอกข้อมูล เลื่อนไปที่ยอดรวมที่ระบบคำนวณ
  await page.goto(`${BASE}/app/create?edit=${draft.id}`);
  await settle(page, 900);
  await shoot(page, at(3), 'สร้างเอกสาร ระบบคำนวณยอด', 'text=รวมเป็นเงิน');

  // 4) ลงลายมือชื่อ: แท็บลายเซ็น เลือกแบบพิมพ์ชื่อ
  await page.goto(`${BASE}/app/documents?doc=${target.id}&tab=sign`);
  await settle(page, 900);
  const typed = page.getByRole('tab', { name: /พิมพ์/ }).or(page.getByRole('button', { name: /^พิมพ์$/ })).first();
  if (await typed.count()) { await typed.click().catch(() => {}); await wait(700); }
  // ชื่อตัวอย่างของบัญชีทดสอบ (ไม่ใช่ชื่อบุคคลจริง) ให้เห็นลายเซ็นแบบพิมพ์ในภาพ
  const signer = page.locator('#signer-name');
  if (await signer.count()) await signer.fill('ทดสอบ ครีเอเตอร์');
  const sigText = page.locator('input[aria-label="พิมพ์ลายเซ็น"]').first();
  if (await sigText.count()) { await sigText.fill('ทดสอบ ครีเอเตอร์'); await wait(800); }
  await shoot(page, at(4), 'ลงลายมือชื่อ', 'text=ลายมือชื่อ');

  // 5) ส่งถึงคู่ค้า: แท็บส่งเอกสาร กรอกอีเมลคู่ค้าตัวอย่าง (ไม่กดส่งจริง)
  await page.goto(`${BASE}/app/documents?doc=${target.id}&tab=send`);
  await settle(page, 900);
  const to = page.locator('#rq-email');
  if (await to.count()) await to.fill('partner@taxflow.test');
  await shoot(page, at(5), 'ส่งเอกสารถึงคู่ค้า', '#rq-email');

  // 6) จัดเก็บและตรวจสอบ: รายการเอกสารทั้งหมด (การ์ดบนมือถือ)
  await page.goto(`${BASE}/app/documents`);
  await settle(page, 900);
  await shoot(page, at(6), 'จัดเก็บและค้นหาเอกสาร', '[aria-label="กรองตามสถานะ"]', 'start');

} catch (err) {
  await page.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
  await browser.close();
  fail(`แคปภาพ${device.name}ไม่สำเร็จ: ${err.message}`);
}
await context.close();
}

/**
 * ภาพประกอบหัวข้อ "ระบบทำอะไรได้" 5 ภาพ (คอมพิวเตอร์ 1200x900) มีกรอบสี่เหลี่ยมสีส้มล้อมส่วนที่เกี่ยวข้อง
 * บันทึกที่ apps/web/public/img/landing/features/feature-1.png ถึง feature-5.png
 */
async function highlight(page, targets) {
  await page.evaluate((list) => {
    document.querySelectorAll('[data-capture-box]').forEach((e) => e.remove());
    // หาการ์ดที่ครอบข้อความ: ไล่ขึ้นไปจนเจอกล่องที่มีมุมโค้ง (การ์ดของระบบ)
    const card = (el) => {
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const r = parseFloat(getComputedStyle(a).borderTopLeftRadius);
        if (r >= 16 && a.getBoundingClientRect().width > 160) return a;
      }
      return el;
    };
    const find = (t) => {
      if (t.css) return document.querySelector(t.css);
      const all = [...document.querySelectorAll('main *, [role="dialog"] *, [role="presentation"] *')];
      return all.find((e) => e.children.length === 0 && e.textContent.trim() === t.text) || null;
    };
    const els = list.map((t) => { const el = find(t); if (!el) throw new Error(`ไม่พบ ${t.css || t.text}`); return t.card ? card(el) : el; });
    // เลื่อนหน้าให้ส่วนที่ต้องการอยู่กลางจอก่อน แล้วจึงวัดตำแหน่งบนจอ (กล่องเป็น fixed จึงตรงทั้งหน้าปกติและหน้าต่างที่ลอยอยู่)
    els[0].scrollIntoView({ block: 'center' });
    const rects = els.map((el) => el.getBoundingClientRect());
    const top = Math.min(...rects.map((r) => r.top)) - 10;
    const left = Math.min(...rects.map((r) => r.left)) - 10;
    const right = Math.max(...rects.map((r) => r.right)) + 10;
    const bottom = Math.max(...rects.map((r) => r.bottom)) + 10;
    const box = document.createElement('div');
    box.setAttribute('data-capture-box', '');
    Object.assign(box.style, {
      position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${right - left}px`, height: `${bottom - top}px`,
      border: '4px solid #FF6A00', borderRadius: '18px', boxShadow: '0 0 0 8px rgba(255,106,0,.18)', zIndex: 99999, pointerEvents: 'none',
    });
    document.body.appendChild(box);
  }, targets);
  await wait(400);
}

async function captureFeatures() {
  const dir = path.join(OUT, 'features');
  await mkdir(dir, { recursive: true });
  console.log('\n— ภาพประกอบ "ระบบทำอะไรได้" —');
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light' });
  await context.addInitScript(({ email }) => {
    try { localStorage.setItem(`tf_onboard_${email}`, '1'); localStorage.setItem('tf.theme', 'light'); } catch { /* ไม่มีที่เก็บก็แคปได้ */ }
  }, { email: EMAIL });
  const page = await context.newPage();
  const snap = async (n, title, targets) => {
    await highlight(page, targets);
    await page.mouse.move(1, 1);
    await maskPersonal(page);
    const file = path.join(dir, `feature-${n}.png`);
    await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
    console.log(`✔ features/feature-${n}.png  ${title}`);
  };
  try {
    await page.goto(`${BASE}/login`);
    const res = await page.request.post(`${BASE}/api/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
    if (!(await res.json().catch(() => ({}))).user) fail('เข้าสู่ระบบด้วยบัญชีทดสอบไม่สำเร็จ (ต้องเป็นบัญชีที่ไม่ใช้ OTP)');
    const items = ((await (await page.request.get(`${BASE}/api/documents?scope=mine`)).json()).items) || [];
    const draft = items.find((d) => d.status === 'draft');
    const target = items.find((d) => d.status !== 'cancelled' && !d.signed) || items[0];
    if (!draft || !target) fail('บัญชีทดสอบต้องมีเอกสารแบบร่างและเอกสารที่ยังไม่ลงนามอย่างละ 1 ฉบับ');

    // 1) สร้างเอกสาร: ขั้นเลือกประเภทเอกสาร (กรอบรอบรายการประเภท)
    await page.goto(`${BASE}/app/create`);
    await settle(page, 900);
    await page.locator('button[aria-label$="ไปขั้นถัดไป"]').first().click();
    await settle(page, 700);
    await snap(1, 'สร้างเอกสารธุรกิจ สัญญา และ 50 ทวิ', [{ css: 'main div.flex.flex-col.gap-6' }]);

    // 2) คำนวณ VAT: กล่องยอดรวมในฟอร์ม
    await page.goto(`${BASE}/app/create?edit=${draft.id}`);
    await settle(page, 900);
    await snap(2, 'คำนวณ VAT และภาษีหัก ณ ที่จ่าย', [{ text: 'ยอดรวมทั้งสิ้น', card: true }]);

    // 3) ลงลายมือชื่อ: กล่องลายมือชื่อแบบพิมพ์
    await page.goto(`${BASE}/app/documents?doc=${target.id}&tab=sign`);
    await settle(page, 900);
    const typed = page.getByRole('tab', { name: /พิมพ์/ }).or(page.getByRole('button', { name: /^พิมพ์$/ })).first();
    if (await typed.count()) { await typed.click().catch(() => {}); await wait(600); }
    const signer = page.locator('#signer-name');
    if (await signer.count()) await signer.fill('ทดสอบ ครีเอเตอร์');
    const sigText = page.locator('input[aria-label="พิมพ์ลายเซ็น"]').first();
    if (await sigText.count()) { await sigText.fill('ทดสอบ ครีเอเตอร์'); await wait(800); }
    await snap(3, 'ลงลายมือชื่อ', [{ text: 'ลายมือชื่อ', card: true }]);

    // 4) ส่งถึงคู่ค้า: ช่องอีเมลคู่ค้าถึงข้อความถึงผู้รับ
    await page.goto(`${BASE}/app/documents?doc=${target.id}&tab=send`);
    await settle(page, 900);
    await page.locator('#rq-email').fill('partner@taxflow.test');
    await snap(4, 'ส่งเอกสารถึงคู่ค้า', [{ css: 'label[for="rq-email"]' }, { css: '#rq-msg' }]);

    // 5) ค้นหาและตรวจสอบ: ช่องค้นหา ตัวกรอง และปุ่มส่งออก
    await page.goto(`${BASE}/app/documents`);
    await settle(page, 900);
    await snap(5, 'ค้นหาและตรวจสอบเอกสาร', [{ css: '[aria-label="กรองตามสถานะ"]' }, { css: 'input[placeholder="เลขที่ / คู่ค้า / เลขภาษี"]' }, { css: '[aria-label="ถึงวันที่"]' }, { css: '[aria-label="ขนาดการแสดงผล"]' }]);
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
    await browser.close();
    fail(`แคปภาพประกอบไม่สำเร็จ: ${err.message}`);
  }
  await context.close();
}

// node scripts/capture-landing.mjs [steps|features] แคปเฉพาะชุดที่ระบุได้ (ไม่ระบุ = ทุกชุด)
const ONLY = process.argv[2] || '';
if (ONLY !== 'features') for (const d of DEVICES) await captureSet(d);
if (ONLY !== 'steps') await captureFeatures();
await browser.close();
console.log(`\nบันทึกภาพไว้ที่ ${path.relative(ROOT, OUT)}`);
