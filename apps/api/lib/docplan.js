'use strict';
/**
 * docplan.js แปลงเอกสารหนึ่งฉบับให้เป็น "แผนผังการวาด" (WP5)
 * ==========================================================================
 * ทำไมต้องมีไฟล์นี้แยกจาก pdfbuild.js
 * ---------------------------------------------------------
 * การวาด PDF มีสองเรื่องปนกันอยู่ คือ "จะวาดอะไร" กับ "วาดยังไง"
 * ไฟล์นี้รับผิดชอบเรื่องแรกล้วน ๆ คือรับเอกสารเข้ามาแล้วคืนรายการบล็อกที่ต้องวาด
 * เป็นข้อมูลธรรมดา ไม่แตะ PDFKit ไม่แตะระบบไฟล์ จึงเขียนชุดทดสอบครอบได้เต็มที่
 * ว่าเอกสารมีรายการครบตามกฎหมาย ยอดเงินถูกต้อง และข้อความกำกับอยู่ครบ
 *
 * ส่วน pdfbuild.js รับแผนนี้ไปวาดจริง ซึ่งเป็นโค้ดบาง ๆ ที่เรียก PDFKit ตรง ๆ
 * ข้อดีคือถ้าภายหลังเปลี่ยนไลบรารีวาด PDF ก็แก้แค่ไฟล์นั้น แผนผังไม่ต้องแตะ
 *
 * ชนิดของบล็อก
 *   header     หัวกระดาษ: ชื่อเอกสาร เลขที่ วันที่ โลโก้
 *   parties    กล่องข้อมูลผู้ขายและผู้ซื้อวางคู่กัน
 *   fields     รายการ "ป้ายชื่อ: ค่า" เรียงกัน
 *   table      ตารางรายการสินค้าหรือบริการ
 *   totals     กล่องสรุปยอดเงินชิดขวา
 *   text       ย่อหน้าข้อความ
 *   signature  ช่องลงลายมือชื่อ
 *   note       กล่องข้อความกำกับ (ตัวเล็ก ขอบบาง)
 *   heading    หัวเรื่องกลางหน้า สำหรับเอกสารราชการและสัญญาที่ไม่มีหัวกระดาษแบบใบเสร็จ
 *   para       ย่อหน้าเนื้อความ ย่อหน้าบรรทัดแรกได้
 *   clauses    ข้อสัญญาเรียงเลขอัตโนมัติ
 *   checks     ช่องติ๊กเลือกตามแบบฟอร์มราชการ
 *   idboxes    ช่องกรอกเลขประจำตัวผู้เสียภาษี 13 ช่อง ตามแบบของกรมสรรพากร
 *   pagebreak  ขึ้นหน้าใหม่ (50 ทวิ ออก 2 ฉบับ · ภ.ง.ด. มีใบแนบหลายแผ่น)
 *
 * เอกสารที่รองรับ ครบทั้ง 14 ประเภทที่ระบบออกได้
 *   priced / amount                            ใบเสนอราคา · ใบสั่งซื้อ · ใบแจ้งหนี้ · ใบเสร็จรับเงิน ·
 *                                              ใบกำกับภาษีอิเล็กทรอนิกส์ · ใบรับอิเล็กทรอนิกส์
 *   deliverables                               ใบส่งมอบงาน (ตารางผลงาน ไม่มียอดเงิน)
 *   voucher                                    ใบสำคัญจ่าย (อ้างอิงเอกสารต้นทาง ลงนาม 4 ฝ่าย)
 *   contract                                   สัญญากับ Brand · สัญญาจ้าง Influencer
 *   poa                                        หนังสือมอบอำนาจ
 *   wht                                        หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
 *   pnd                                        ภ.ง.ด.3 · ภ.ง.ด.53 (ใบหน้าแบบ + ใบแนบ)
 */

const DS = require('./docschema.js');

/* ------------------------------------------------------------- ตัวช่วยจัดรูปแบบ */

/** จำนวนเงินแบบไทย มีลูกน้ำคั่นหลักพันและทศนิยม 2 ตำแหน่งเสมอ */
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** วันที่แบบไทย เช่น 20 กันยายน 2569 */
const thaiDate = (iso) => DS.thaiDate(iso) || '-';

/** เลขประจำตัวผู้เสียภาษีแบบอ่านง่าย 0-1055-61112-23-5 */
function taxIdText(id) {
  const d = String(id || '').replace(/\D/g, '');
  if (d.length !== 13) return d || '-';
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
}

/**
 * สาขา: ว่างหรือ 00000 ถือเป็นสำนักงานใหญ่
 * รับได้ทั้งเลขสาขาจากฟอร์ม และข้อความที่ระบบแปลงไว้แล้ว เช่น "สำนักงานใหญ่"
 * เพราะ issuer ที่เก็บไว้ในเอกสารเก็บเป็นข้อความ ส่วนคู่ค้าเก็บเป็นเลข
 * ถ้าไม่รับทั้งสองแบบ เอกสารที่บันทึกจริงจะขึ้นว่า "สาขาที่ 00000" ผิดความหมาย
 */
function branchText(branch) {
  const raw = String(branch || '').trim();
  if (raw && !/^\d+$/.test(raw)) return raw;
  const b = raw.replace(/\D/g, '');
  if (!b || b === '00000') return 'สำนักงานใหญ่';
  return `สาขาที่ ${b.padStart(5, '0')}`;
}

/** ช่องที่ยังว่างในเอกสารราชการ ใช้จุดไข่ปลาให้เขียนเติมด้วยมือได้ ไม่ปล่อยเป็นที่ว่างเปล่า */
const orDots = (v, len = 40) => (String(v || '').trim() || '.'.repeat(len));

const optLabel = (opts, v) => {
  const o = (opts || []).find((x) => String(x.value) === String(v));
  return o ? o.label : '';
};

/* ---------------------------------------------- ปรับรูปร่างเอกสารให้เป็นแบบเดียว */

/**
 * เอกสารในระบบมีสองรูปร่างที่ต่างกัน (เอกสารที่บันทึกจริง กับเอกสารตัวอย่าง/ชุดทดสอบ)
 * การแปลงให้เป็นรูปร่างเดียวอยู่ที่ lib/docshape.js เพื่อให้ตัวสร้าง XML ใช้ชุดเดียวกัน
 * ส่งออกต่อจากที่นี่ด้วย เพราะชุดทดสอบเดิมเรียกผ่าน docplan
 */
const { partyOf, calcOf } = require('./docshape.js');

/* ---------------------------------------------------- ข้อความกำกับที่ต้องมีเสมอ */

/**
 * ข้อความกำกับที่ต้องปรากฏบนเอกสารทุกฉบับที่ระบบออก
 * แผน ver18 ระบุไว้ชัดว่าต้องกันไม่ให้ผู้ตรวจเข้าใจว่าเอกสารมีผลทางภาษีจริง
 * จึงบังคับใส่จากตรงนี้ ไม่ปล่อยให้ขึ้นกับว่าใครจำใส่หรือไม่
 */
const DEMO_NOTICE = 'เอกสารนี้สร้างจากระบบ TaxFlow เพื่อการศึกษาและสาธิตกระบวนการ '
  + 'ระบบยังไม่ได้ยื่นคำขอจัดทำและส่งมอบใบกำกับภาษีอิเล็กทรอนิกส์กับกรมสรรพากร '
  + 'และลายมือชื่อดิจิทัลใช้ใบรับรองที่ออกเอง จึงไม่มีผลรับรองตามกฎหมาย';

/** ท้ายเอกสารทุกฉบับ: ข้อความกำกับ และลิงก์ตรวจสอบถ้ามี */
function tailBlocks(doc) {
  const blocks = [{ type: 'note', value: DEMO_NOTICE }];
  if (doc.verifyUrl) {
    blocks.push({ type: 'note', value: `ตรวจสอบความถูกต้องของเอกสารได้ที่ ${doc.verifyUrl}` });
  }
  return blocks;
}

/**
 * สถานะเอกสารที่ห้ามนำไปใช้อ้างอิง (ยกเลิกแล้ว / ฉบับร่าง) บอกด้วย "ลายน้ำเฉียงคาดกลางหน้า"
 * ไม่ใช่แถบที่หัวกระดาษ: ลายน้ำคาดทับเนื้อหาจึงตัดออกจากสำเนาที่ถ่าย/สแกนไม่ได้
 * และไม่เบียดพื้นที่หัวเอกสารเหมือนแถบเดิม
 */
function statusBlocks(doc) {
  if (doc.status === 'cancelled') {
    const at = new Date(doc.cancelledAt || doc.updatedAt || Date.now())
      .toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    return [{
      type: 'watermark',
      value: 'ยกเลิกแล้ว',
      color: '#b91c1c',
      subtitle: `ยกเลิกเมื่อ ${at}${doc.cancelReason ? ' · เหตุผล: ' + doc.cancelReason : ''} · ใช้อ้างอิงทางกฎหมายไม่ได้`,
    }];
  }
  if (!doc.docNo) {
    return [{
      type: 'watermark',
      value: 'ฉบับร่าง',
      color: '#b45309',
      subtitle: 'ยังไม่ออกเลขที่เอกสาร ห้ามนำไปใช้อ้างอิง',
    }];
  }
  return [];
}

/* ------------------------------------------------------------------ ส่วนประกอบ */

/** กล่องข้อมูลคู่สัญญาหนึ่งฝ่าย */
function partyBox(title, p) {
  return {
    title,
    lines: [
      { label: '', value: p.name || '-', bold: true },
      { label: 'เลขประจำตัวผู้เสียภาษี', value: taxIdText(p.taxId) },
      { label: '', value: branchText(p.branch || p.branchNo) },
      { label: 'ที่อยู่', value: p.address || '-' },
      ...(p.contactPerson ? [{ label: 'ผู้ติดต่อ', value: p.contactPerson }] : []),
      ...(p.phone ? [{ label: 'โทรศัพท์', value: p.phone }] : []),
      ...(p.email ? [{ label: 'อีเมล', value: p.email }] : []),
    ],
  };
}

/** ตารางรายการสินค้าหรือบริการ พร้อมแถวลำดับและยอดรวมรายบรรทัด */
function itemsTable(doc) {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const priced = items.some((r) => r.price != null);

  const columns = priced
    ? [
      { key: 'no', label: 'ลำดับ', width: 40, align: 'center' },
      { key: 'name', label: 'รายการ', width: 0, align: 'left' }, // width 0 = ใช้พื้นที่ที่เหลือ
      { key: 'qty', label: 'จำนวน', width: 55, align: 'right' },
      { key: 'unit', label: 'หน่วย', width: 50, align: 'center' },
      { key: 'price', label: 'ราคาต่อหน่วย', width: 80, align: 'right' },
      { key: 'amount', label: 'จำนวนเงิน', width: 85, align: 'right' },
    ]
    : [
      { key: 'no', label: 'ลำดับ', width: 40, align: 'center' },
      { key: 'name', label: 'รายการ', width: 0, align: 'left' },
      { key: 'amount', label: 'จำนวนเงิน', width: 110, align: 'right' },
    ];

  const rows = items.map((r, i) => {
    const qty = Number(r.qty) || 1;
    const price = Number(r.price) || 0;
    const discount = Number(r.discount) || 0;
    const amount = r.price != null
      ? Math.round((qty * price - discount) * 100) / 100
      : Number(r.amount) || 0;
    const name = discount > 0 ? `${r.name}\n(หักส่วนลด ${money(discount)} บาท)` : String(r.name || '');
    return {
      no: String(i + 1),
      name,
      qty: String(qty),
      unit: r.unit || '',
      price: money(price),
      amount: money(amount),
    };
  });

  return { type: 'table', columns, rows };
}

/** กล่องสรุปยอดเงิน แสดงเฉพาะบรรทัดที่มีค่าจริง ไม่รกด้วยศูนย์ */
function totalsBox(doc) {
  const c = calcOf(doc);
  const F = doc.fields || {};
  const lines = [];
  const add = (label, value, opt = {}) => lines.push({ label, value: money(value), ...opt });

  // "รวมเป็นเงิน" ต้องเท่ากับผลบวกของคอลัมน์จำนวนเงินในตารางพอดี
  // ตารางแสดงยอดแต่ละรายการหลังหักส่วนลดรายการแล้ว (และบอกส่วนลดไว้ใต้ชื่อรายการ)
  // จึงต้องเริ่มยอดรวมจากยอดสุทธิรายการ ไม่ใช่ยอดก่อนหักส่วนลด
  // ระบบเดิมเริ่มจากยอดก่อนหัก ทำให้คนที่บวกคอลัมน์เองได้ตัวเลขไม่ตรงกับบรรทัดรวม
  // และยอดรายการชุดนี้ตรงกับ LineTotalAmount ในไฟล์ XML ทุกบรรทัดด้วย
  const lineNet = Math.round(((Number(c.subtotal) || 0) - (Number(c.lineDiscount) || 0)) * 100) / 100;
  add('รวมเป็นเงิน', lineNet);
  if (Number(c.billDiscount) > 0) {
    add(F.billDiscountNote ? `หักส่วนลดท้ายบิล (${F.billDiscountNote})` : 'หักส่วนลดท้ายบิล', c.billDiscount);
    add('ราคาหลังหักส่วนลด', c.base);
  }
  if (Number(c.vatRate) > 0) add(`ภาษีมูลค่าเพิ่ม ${c.vatRate}%`, c.vat);
  add('จำนวนเงินรวมทั้งสิ้น', c.total, { bold: true, rule: true });
  if (Number(c.wht) > 0) {
    add(`หักภาษี ณ ที่จ่าย ${c.whtRate}%`, c.wht);
    add('จำนวนเงินสุทธิ', c.net, { bold: true });
  }
  return { type: 'totals', lines };
}

/** ช่องลงนามหนึ่งช่อง ใช้รูปแบบเดียวกันทุกเอกสาร */
const sigBox = (role, name, opt = {}) => ({
  role,
  name: name || '',
  image: opt.image || null,
  date: opt.date ? thaiDate(opt.date) : '',
  position: opt.position || '',
  signedAt: opt.signedAt || '',
});

/* ============================================================================
 * 1) เอกสารการเงินที่มีรายการและยอดเงิน
 *    ใบเสนอราคา · ใบสั่งซื้อ · ใบแจ้งหนี้ · ใบเสร็จรับเงิน · ใบส่งมอบงาน ·
 *    ใบสำคัญจ่าย · ใบกำกับภาษีอิเล็กทรอนิกส์ · ใบรับอิเล็กทรอนิกส์
 * ========================================================================== */

function planCommercial(doc, opt, form) {
  const F = doc.fields || {};
  const issuer = doc.issuer || {};
  const party = partyOf(doc);
  const calc = calcOf(doc);
  const blocks = [];

  /* ---------- หัวกระดาษ ---------- */
  blocks.push({
    type: 'header',
    title: form.label,
    subtitle: form.en || '',
    logo: doc.brand && doc.brand.logo ? doc.brand.logo : null,
    fields: [
      { label: 'เลขที่', value: doc.docNo || 'ฉบับร่าง' },
      ...(F.volumeNo ? [{ label: 'เล่มที่', value: F.volumeNo }] : []),
      { label: 'วันที่', value: thaiDate(F.issueDate || F.receiveDate || doc.docDate) },
    ],
    // ใบกำกับภาษีต้องมีคำว่า "ใบกำกับภาษี" ปรากฏชัดเจนบนเอกสารตามมาตรา 86/4 (1)
    // ระบบใช้ชื่อฟอร์มเป็นหัวเรื่องอยู่แล้ว แต่ย้ำอีกชั้นด้วยแถบนี้เพื่อไม่ให้พลาด
    banner: form.requiresVat ? 'ใบกำกับภาษี / TAX INVOICE' : '',
  });

  blocks.push(...statusBlocks(doc));

  /* ---------- คู่สัญญา ---------- */
  if (form.party) {
    blocks.push({
      type: 'parties',
      left: partyBox(form.issuerTitle || 'ผู้ออกเอกสาร', issuer),
      right: partyBox(form.party.title || 'คู่ค้า', party),
    });
  }

  /* ---------- ข้อมูลอ้างอิงเพิ่มเติม ---------- */
  const refs = [];
  if (F.refNo) refs.push({ label: 'เลขที่อ้างอิง', value: F.refNo });
  if (F.poRef) refs.push({ label: 'อ้างอิงใบสั่งซื้อ', value: F.poRef });
  if (F.invoiceRef) refs.push({ label: 'อ้างอิงใบแจ้งหนี้', value: F.invoiceRef });
  if (F.taxInvoiceRef) refs.push({ label: 'อ้างอิงใบกำกับภาษี', value: F.taxInvoiceRef });
  if (F.quotationRef) refs.push({ label: 'อ้างอิงใบเสนอราคา', value: F.quotationRef });
  if (F.contractRef) refs.push({ label: 'อ้างอิงสัญญา', value: F.contractRef });
  if (F.validUntil) refs.push({ label: 'ยืนราคาถึงวันที่', value: thaiDate(F.validUntil) });
  if (F.dueDate) refs.push({ label: 'ครบกำหนดชำระ', value: thaiDate(F.dueDate) });
  if (F.deliveryDate) refs.push({ label: 'วันที่ต้องการส่งมอบ', value: thaiDate(F.deliveryDate) });
  if (F.payMethod) {
    const label = optLabel(DS.PAY_METHODS, F.payMethod) || F.payMethod;
    refs.push({ label: 'วิธีชำระเงิน', value: F.payMethod === 'other' ? (F.payMethodOther || label) : label });
  }
  if (F.payDate) refs.push({ label: 'วันที่ชำระ', value: thaiDate(F.payDate) });
  if (F.payBank) refs.push({ label: 'ธนาคาร', value: F.payBank });
  if (F.transferRef) refs.push({ label: 'เลขอ้างอิงการโอน', value: F.transferRef });
  if (F.chequeNo) refs.push({ label: 'เลขที่เช็ค', value: F.chequeNo });
  if (refs.length) blocks.push({ type: 'fields', items: refs });

  /* ---------- รายการและยอดเงิน ---------- */
  blocks.push(itemsTable(doc));
  blocks.push(totalsBox(doc));

  // จำนวนเงินเป็นตัวหนังสือ กันการแก้ตัวเลขภายหลัง เป็นธรรมเนียมของเอกสารการเงินไทย
  if (opt.bahtText) {
    blocks.push({ type: 'text', style: 'baht', value: `(${opt.bahtText(calc.net || calc.total)})` });
  }

  /* ---------- หมายเหตุและเงื่อนไข ---------- */
  const terms = [];
  if (F.paymentTerms) terms.push({ label: 'เงื่อนไขการชำระเงิน', value: F.paymentTerms });
  if (F.workPeriod) terms.push({ label: 'ระยะเวลาดำเนินงาน', value: F.workPeriod });
  if (F.deliveryTerms) terms.push({ label: 'เงื่อนไขการส่งมอบ', value: F.deliveryTerms });
  // ใบแจ้งหนี้ต้องบอกบัญชีที่ให้ลูกค้าโอนเงินเข้า ไม่งั้นลูกค้าจ่ายเงินไม่ได้
  // (ตกหล่นใน PDF รุ่นแรกของ WP5 พบจากการเทียบทุกช่องของฟอร์มกับแผนผังการวาด)
  if (F.bankAccountNo) {
    terms.push({
      label: 'ชำระเงินโดยโอนเข้าบัญชี',
      value: [F.bankName, F.bankAccountName && `ชื่อบัญชี ${F.bankAccountName}`, `เลขที่บัญชี ${F.bankAccountNo}`].filter(Boolean).join(' · '),
    });
  }
  if (terms.length) blocks.push({ type: 'fields', items: terms });
  if (F.note) blocks.push({ type: 'text', style: 'note', value: F.note });

  /* ---------- ลายมือชื่อ ---------- */
  blocks.push({
    type: 'signature',
    boxes: [
      sigBox(form.issuerTitle || 'ผู้ออกเอกสาร', issuer.name, {
        image: doc.signature && doc.signature.image,
        signedAt: doc.signature && doc.signature.signedAt,
        date: F.issueDate || F.receiveDate,
      }),
      sigBox((form.party && form.party.role) || 'ผู้รับเอกสาร', party.name, {
        image: doc.counterpartySignature && doc.counterpartySignature.image,
        signedAt: doc.counterpartySignature && doc.counterpartySignature.signedAt,
      }),
    ],
    seal: doc.brand && doc.brand.seal ? doc.brand.seal : null,
  });

  blocks.push(...tailBlocks(doc));

  return {
    title: `${form.label} ${doc.docNo || ''}`.trim(),
    docNo: doc.docNo || '',
    docType: doc.type,
    pageSize: 'A4',
    margin: 40,
    blocks,
  };
}

/* ============================================================================
 * 1.1) ใบส่งมอบงาน
 *      รายการไม่ใช่สินค้าและราคา แต่เป็นผลงานที่ส่งมอบ (Influencer · Content · ลิงก์ · สถานะ)
 *      จึงไม่มีกล่องยอดเงินและจำนวนเงินตัวหนังสือ ใช้แม่แบบใบเสร็จไม่ได้
 * ========================================================================== */

function planDelivery(doc, opt, form) {
  const F = doc.fields || {};
  const issuer = doc.issuer || {};
  const party = partyOf(doc);
  const items = Array.isArray(doc.items) ? doc.items : [];
  const blocks = [];

  blocks.push({
    type: 'header',
    title: form.label,
    subtitle: 'Delivery Note',
    logo: doc.brand && doc.brand.logo ? doc.brand.logo : null,
    fields: [
      { label: 'เลขที่', value: doc.docNo || 'ฉบับร่าง' },
      { label: 'วันที่ส่งมอบ', value: thaiDate(F.deliverDate || doc.docDate) },
    ],
    banner: '',
  });
  blocks.push(...statusBlocks(doc));
  blocks.push({
    type: 'parties',
    left: partyBox('ผู้ส่งมอบ', issuer),
    right: partyBox('ผู้รับมอบ', party),
  });

  const refs = [];
  if (F.contractRef) refs.push({ label: 'สัญญา / PO', value: F.contractRef });
  if (F.campaignName) refs.push({ label: 'Campaign', value: F.campaignName });
  if (F.periodStart) {
    refs.push({ label: 'ระยะเวลาดำเนินงาน', value: `${thaiDate(F.periodStart)}${F.periodEnd ? ` – ${thaiDate(F.periodEnd)}` : ''}` });
  }
  if (refs.length) blocks.push({ type: 'fields', items: refs });

  const totalPieces = items.reduce((sum, it) => sum + (Number(it.pieces) || 0), 0);
  blocks.push({
    type: 'table',
    columns: [
      { key: 'no', label: 'ลำดับ', width: 30, align: 'center' },
      { key: 'influencer', label: 'Influencer', width: 0, align: 'left' },
      { key: 'contentType', label: 'ประเภท Content', width: 70, align: 'left' },
      { key: 'platform', label: 'แพลตฟอร์ม', width: 58, align: 'left' },
      { key: 'pieces', label: 'ชิ้นงาน', width: 38, align: 'center' },
      { key: 'link', label: 'ลิงก์ผลงาน', width: 100, align: 'left' },
      { key: 'publishDate', label: 'วันที่เผยแพร่', width: 58, align: 'center' },
      { key: 'itemStatus', label: 'สถานะ', width: 52, align: 'center' },
    ],
    rows: [
      ...items.map((it, i) => ({
        no: String(i + 1),
        influencer: String(it.influencer || ''),
        contentType: String(it.contentType || ''),
        platform: String(it.platform || ''),
        pieces: it.pieces != null && it.pieces !== '' ? String(it.pieces) : '',
        link: String(it.link || ''),
        publishDate: it.publishDate ? DS.thaiDate(it.publishDate, true) : '',
        itemStatus: String(it.itemStatus || ''),
      })),
      { no: '', influencer: '', contentType: '', platform: 'รวมชิ้นงาน', pieces: String(totalPieces), link: '', publishDate: '', itemStatus: '' },
    ],
  });

  const acc = F.acceptStatus;
  blocks.push({
    type: 'checks',
    layout: 'inline',
    title: 'การรับมอบ',
    items: [
      { label: 'รับงาน', checked: acc === 'accepted' },
      { label: 'รอตรวจสอบ', checked: acc === 'pending' },
      { label: 'ขอแก้ไข', checked: acc === 'revise' },
    ],
    note: F.acceptDate ? `วันที่รับมอบ ${thaiDate(F.acceptDate)}` : '',
  });
  if (F.note) blocks.push({ type: 'text', style: 'note', value: F.note });

  blocks.push({
    type: 'signature',
    boxes: [
      sigBox('ผู้ส่งมอบ', F.delivererName || issuer.authName || issuer.name, {
        image: doc.signature && doc.signature.image,
        signedAt: doc.signature && doc.signature.signedAt,
        position: issuer.name,
        date: F.deliverDate,
      }),
      sigBox('ผู้รับมอบ', F.receiverName || party.contactPerson || party.name, {
        image: doc.counterpartySignature && doc.counterpartySignature.image,
        signedAt: doc.counterpartySignature && doc.counterpartySignature.signedAt,
        position: party.name,
        date: F.acceptDate,
      }),
    ],
    seal: doc.brand && doc.brand.seal ? doc.brand.seal : null,
  });

  blocks.push(...tailBlocks(doc));
  return {
    title: `${form.label} ${doc.docNo || ''}`.trim(),
    docNo: doc.docNo || '', docType: doc.type, pageSize: 'A4', margin: 40, blocks,
  };
}

/* ============================================================================
 * 1.2) ใบสำคัญจ่าย (เอกสารภายใน)
 *      รายการอ้างอิงเอกสารต้นทาง (วันที่ · เลขที่) และมีช่องลงนาม 4 ฝ่าย
 *      ผู้จัดทำ · ผู้อนุมัติ · ผู้จ่ายเงิน · ผู้รับเงิน ตามรูปแบบใบสำคัญจ่ายทั่วไป
 * ========================================================================== */

function planVoucher(doc, opt, form) {
  const F = doc.fields || {};
  const issuer = doc.issuer || {};
  const party = partyOf(doc);
  const calc = calcOf(doc);
  const items = Array.isArray(doc.items) ? doc.items : [];
  const blocks = [];

  blocks.push({
    type: 'header',
    title: form.label,
    subtitle: 'Payment Voucher',
    logo: doc.brand && doc.brand.logo ? doc.brand.logo : null,
    fields: [
      { label: 'เลขที่', value: doc.docNo || 'ฉบับร่าง' },
      { label: 'วันที่', value: thaiDate(F.payDate || F.issueDate || doc.docDate) },
    ],
    banner: '',
  });
  blocks.push(...statusBlocks(doc));
  blocks.push({
    type: 'parties',
    left: partyBox('ผู้จ่ายเงิน', issuer),
    right: partyBox('จ่ายให้แก่', party),
  });

  const refs = [];
  if (F.campaignName) refs.push({ label: 'Campaign', value: F.campaignName });
  if (F.contractRef) refs.push({ label: 'อ้างอิงสัญญา', value: F.contractRef });
  if (refs.length) blocks.push({ type: 'fields', items: refs });

  // วิธีจ่ายเงิน: ติ๊กช่องแบบใบสำคัญจ่ายกระดาษ แล้วตามด้วยรายละเอียดของวิธีที่เลือก
  const m = F.payMethod;
  blocks.push({
    type: 'checks',
    layout: 'inline',
    title: 'จ่ายโดย',
    items: [
      { label: 'เงินสด', checked: m === 'cash' },
      { label: 'โอน', checked: m === 'transfer' },
      { label: 'เช็คธนาคาร', checked: m === 'cheque' },
      { label: m === 'other' && F.payMethodOther ? `อื่น ๆ (${F.payMethodOther})` : 'อื่น ๆ', checked: m === 'other' },
    ],
  });
  const pay = [];
  if (F.payBank) pay.push({ label: 'ธนาคาร', value: F.payBankBranch ? `${F.payBank} สาขา ${F.payBankBranch}` : F.payBank });
  if (F.chequeNo) pay.push({ label: 'เลขที่เช็ค', value: F.chequeNo });
  if (F.chequeDate) pay.push({ label: 'เช็คลงวันที่', value: thaiDate(F.chequeDate) });
  if (F.transferRef) pay.push({ label: 'เลขอ้างอิงการโอน', value: F.transferRef });
  if (party.bankAccountNo) {
    pay.push({
      label: 'เข้าบัญชีผู้รับ',
      value: [party.bankName, party.bankAccountNo, party.bankAccountName && `(${party.bankAccountName})`].filter(Boolean).join(' '),
    });
  }
  if (pay.length) blocks.push({ type: 'fields', items: pay });

  blocks.push({
    type: 'table',
    columns: [
      { key: 'docDate', label: 'วันที่เอกสาร', width: 72, align: 'center' },
      { key: 'docNo', label: 'เลขที่เอกสาร', width: 88, align: 'center' },
      { key: 'name', label: 'รายการ / Description', width: 0, align: 'left' },
      { key: 'amount', label: 'จำนวนเงิน', width: 95, align: 'right' },
    ],
    rows: items.map((it) => ({
      docDate: it.docDate ? DS.thaiDate(it.docDate, true) : '',
      docNo: String(it.docNo || ''),
      name: String(it.name || ''),
      amount: money(it.amount),
    })),
  });

  const lines = [{ label: 'จำนวนเงินรวม', value: money(calc.base) }];
  if (F.hasWht || Number(calc.wht) > 0) {
    const cond = F.whtCondition && F.whtCondition !== '1' ? ` (${optLabel(DS.WHT_CONDITIONS, F.whtCondition)})` : '';
    const kind = F.incomeDesc ? ` · ${F.incomeDesc}` : '';
    lines.push({ label: `หัก ณ ที่จ่าย ${calc.whtRate || 0}%${cond}${kind}`, value: money(calc.wht) });
  }
  lines.push({ label: 'คงเหลือจ่ายสุทธิ', value: money(calc.net), bold: true, rule: true });
  blocks.push({ type: 'totals', lines });
  if (opt.bahtText) blocks.push({ type: 'text', style: 'baht', value: `(${opt.bahtText(calc.net)})` });
  if (F.hasWht && F.whtCondition && F.whtCondition !== '1') {
    blocks.push({
      type: 'text', style: 'note',
      value: `ผู้จ่ายเงินออกภาษีแทนผู้รับ เงินได้ที่ต้องแสดงในหนังสือรับรอง ${money(calc.income)} บาท ภาษีที่นำส่ง ${money(calc.wht)} บาท`,
    });
  }
  if (F.note) blocks.push({ type: 'text', style: 'note', value: `หมายเหตุ: ${F.note}` });

  // ลงนาม 4 ฝ่าย วาดเป็นสองแถว แถวละ 2 ช่อง ให้มีที่ว่างพอเซ็นบนกระดาษ A4
  blocks.push({
    type: 'signature',
    compact: true,
    boxes: [sigBox('ผู้จัดทำ', F.preparedBy), sigBox('ผู้อนุมัติ', F.approvedBy)],
  });
  blocks.push({
    type: 'signature',
    boxes: [
      sigBox('ผู้จ่ายเงิน', F.paidBy || issuer.authName || issuer.name, {
        image: doc.signature && doc.signature.image,
        signedAt: doc.signature && doc.signature.signedAt,
      }),
      sigBox('ผู้รับเงิน', party.name, {
        image: doc.counterpartySignature && doc.counterpartySignature.image,
        signedAt: doc.counterpartySignature && doc.counterpartySignature.signedAt,
      }),
    ],
    seal: doc.brand && doc.brand.seal ? doc.brand.seal : null,
  });

  blocks.push(...tailBlocks(doc));
  return {
    title: `${form.label} ${doc.docNo || ''}`.trim(),
    docNo: doc.docNo || '', docType: doc.type, pageSize: 'A4', margin: 40, blocks,
  };
}

/* ============================================================================
 * 2) สัญญา (สัญญากับ Brand · สัญญาจ้าง Influencer)
 *    เอกสารกลุ่มนี้ไม่มีหัวกระดาษแบบใบเสร็จ แต่เป็นหนังสือที่ขึ้นต้นด้วยชื่อเรื่อง
 *    กลางหน้า ตามด้วยคู่สัญญา ข้อสัญญาเรียงเลข และช่องลงนามพร้อมพยานสองคน
 * ========================================================================== */

/** อากรแสตมป์สัญญาจ้างทำของ ลักษณะแห่งตราสาร 4: 1 บาทต่อทุก 1,000 บาท */
const stampDuty = (amount) => Math.ceil((Number(amount) || 0) / 1000);

function installmentTable(items) {
  if (!items || !items.length) return null;
  return {
    type: 'table',
    columns: [
      { key: 'no', label: 'งวดที่', width: 45, align: 'center' },
      { key: 'name', label: 'รายละเอียด / เงื่อนไข', width: 0, align: 'left' },
      { key: 'amount', label: 'จำนวนเงิน (บาท)', width: 95, align: 'right' },
      { key: 'dueDate', label: 'วันครบกำหนด', width: 90, align: 'center' },
    ],
    rows: items.map((it, i) => ({
      no: String(i + 1),
      name: String(it.name || ''),
      amount: money(it.amount),
      dueDate: thaiDate(it.dueDate),
    })),
  };
}

function planContract(doc, opt, form) {
  const F = doc.fields || {};
  const issuer = doc.issuer || {};
  const party = partyOf(doc);
  const calc = calcOf(doc);
  const isBrand = doc.type === 'CONTRACT_BRAND';
  const title = isBrand ? 'สัญญาจ้างบริหารแคมเปญการตลาด' : 'สัญญาจ้าง Influencer';
  const blocks = [];

  blocks.push({ type: 'heading', title, subtitle: `เลขที่สัญญา ${doc.docNo || 'ฉบับร่าง'}` });
  blocks.push(...statusBlocks(doc));
  blocks.push({
    type: 'para',
    align: 'right',
    value: `ทำที่ ${orDots(F.place)}\nวันที่ ${thaiDate(F.contractDate || F.signDate || doc.docDate)}`,
  });

  /* ---------- คู่สัญญา ---------- */
  // สัญญากับ Brand: ผู้ออกเอกสารคือเอเจนซี่ ซึ่งเป็น "ผู้รับจ้าง"
  // สัญญาจ้าง Influencer: ผู้ออกเอกสารคือผู้ว่าจ้าง สลับข้างกัน จึงต้องแยกป้ายชื่อให้ถูก
  const meLabel = isBrand ? 'ผู้รับจ้าง' : 'ผู้ว่าจ้าง';
  const themLabel = isBrand ? 'ผู้ว่าจ้าง' : 'ผู้รับจ้าง';
  const meAuth = issuer.entityType === 'juristic'
    ? ` โดย ${F.sign1Name || issuer.authName || '-'} ${F.sign1Position || issuer.authPosition || 'ผู้มีอำนาจลงนาม'} ผู้มีอำนาจลงนามผูกพัน`
    : '';
  const themAuth = (F.sign2Name || party.authName)
    ? ` โดย ${F.sign2Name || party.authName} ${F.sign2Position || party.authPosition || ''} ผู้มีอำนาจลงนามผูกพัน`
    : '';

  blocks.push({
    type: 'para',
    indent: true,
    value: `สัญญาฉบับนี้ทำขึ้นระหว่าง ${issuer.name || '-'} เลขประจำตัวผู้เสียภาษี ${taxIdText(issuer.taxId)} `
      + `${branchText(issuer.branch || issuer.branchNo)} ตั้งอยู่เลขที่ ${issuer.address || '-'}${meAuth} `
      + `ซึ่งต่อไปในสัญญานี้เรียกว่า "${meLabel}" ฝ่ายหนึ่ง กับ`,
  });
  blocks.push({
    type: 'para',
    indent: true,
    value: `${party.name || '-'}${party.channelName ? ` (ชื่อช่อง "${party.channelName}")` : ''} `
      + `เลขประจำตัวผู้เสียภาษี/เลขประจำตัวประชาชน ${taxIdText(party.taxId)} ตั้งอยู่เลขที่ ${party.address || '-'}${themAuth} `
      + `ซึ่งต่อไปในสัญญานี้เรียกว่า "${themLabel}" อีกฝ่ายหนึ่ง`,
  });
  blocks.push({ type: 'para', indent: true, value: 'คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญากันโดยมีข้อความดังต่อไปนี้' });

  /* ---------- ข้อสัญญา ---------- */
  const whtTxt = Number(calc.whtRate) > 0
    ? `ผู้ว่าจ้างมีหน้าที่หักภาษี ณ ที่จ่ายในอัตราร้อยละ ${calc.whtRate} ของค่าตอบแทนก่อนภาษีมูลค่าเพิ่ม `
      + `(คิดเป็นเงิน ${money(calc.wht)} บาท) และออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) `
      + 'ให้แก่ผู้รับจ้างตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร'
    : 'ค่าตอบแทนตามสัญญานี้ไม่มีการหักภาษี ณ ที่จ่าย';

  const feeText = `ผู้ว่าจ้างตกลงชำระค่าตอบแทนเป็นเงิน ${money(calc.base)} บาท`
    + (opt.bahtText ? ` (${opt.bahtText(calc.base)})` : '')
    + (Number(calc.vat) > 0
      ? ` บวกภาษีมูลค่าเพิ่มร้อยละ ${calc.vatRate} เป็นเงิน ${money(calc.vat)} บาท `
        + `รวมเป็นเงินทั้งสิ้น ${money(calc.total)} บาท`
      : '');

  const clauses = [];
  if (isBrand) {
    clauses.push(
      {
        title: 'วัตถุประสงค์และขอบเขตงาน',
        body: `ผู้ว่าจ้างตกลงจ้างและผู้รับจ้างตกลงรับจ้างบริหาร Campaign "${F.campaignName || '-'}"\n`
          + `วัตถุประสงค์: ${F.objective || '-'}\nขอบเขตงาน: ${F.scope || '-'}`
          + (F.influencerCount ? `\nจำนวน Influencer ที่ร่วมแคมเปญ: ${F.influencerCount} ราย` : '')
          + (F.workPeriod ? `\nระยะเวลาดำเนินงาน: ${F.workPeriod}` : ''),
      },
      { title: 'ระยะเวลาของสัญญา', body: `สัญญานี้มีผลตั้งแต่วันที่ ${thaiDate(F.startDate)} ถึงวันที่ ${thaiDate(F.endDate)}` },
      { title: 'ค่าตอบแทนและการชำระเงิน', body: feeText, table: installmentTable(doc.items), after: whtTxt },
      { title: 'การแก้ไขงาน', body: F.revisionTerms || '-' },
      { title: 'การยกเลิกงาน', body: F.cancelTerms || '-' },
      { title: 'การรักษาความลับ', body: F.confidentialTerms || '-' },
      { title: 'สิทธิในการใช้ Content', body: F.contentRights || '-' },
      { title: 'การผิดสัญญา', body: F.breachTerms || '-' },
    );
  } else {
    clauses.push(
      {
        title: 'รายละเอียดงาน',
        body: `ผู้ว่าจ้างตกลงจ้างและผู้รับจ้างตกลงรับจ้างผลิตและเผยแพร่ Content สำหรับ Campaign "${F.campaignName || '-'}"`,
        fields: [
          { label: 'แพลตฟอร์ม', value: (F.platforms || []).join(', ') || '-' },
          { label: 'ประเภท Content', value: F.contentType || '-' },
          { label: 'จำนวน Content', value: `${F.contentCount || '-'} ชิ้น` },
          { label: 'Brief', value: F.brief || '-' },
          ...(F.hashtags ? [{ label: 'Hashtag', value: F.hashtags }] : []),
          ...(F.mentions ? [{ label: 'Tag / Mention', value: F.mentions }] : []),
          { label: 'วันที่ต้องส่งงาน', value: thaiDate(F.submitDate) },
          { label: 'วันที่ต้องโพสต์', value: thaiDate(F.postDate) },
        ],
      },
      { title: 'ระยะเวลาการจ้าง', body: `ตั้งแต่วันที่ ${thaiDate(F.startDate)} ถึงวันที่ ${thaiDate(F.endDate)}` },
      {
        title: 'ค่าจ้างและการชำระเงิน',
        body: feeText,
        fields: [
          { label: 'วิธีชำระเงิน', value: `${optLabel(DS.PAY_METHODS, F.payMethod) || 'โอนเงิน'} จำนวน ${F.installmentCount || 1} งวด` },
          ...(party.bankAccountNo
            ? [{ label: 'บัญชีรับเงิน', value: `${party.bankName || '-'} เลขที่บัญชี ${party.bankAccountNo} ชื่อบัญชี ${party.bankAccountName || party.name}` }]
            : []),
          { label: 'เงื่อนไขการจ่ายเงิน', value: F.paymentTerms || '-' },
        ],
        table: installmentTable(doc.items),
        after: whtTxt,
      },
      {
        title: 'การแก้ไข Content',
        body: `ผู้ว่าจ้างมีสิทธิขอแก้ไข Content ได้ไม่เกิน ${F.revisionRounds || 0} ครั้งต่อชิ้นงาน `
          + 'การแก้ไขที่เกินจากนี้ให้ตกลงค่าใช้จ่ายเพิ่มเติมเป็นลายลักษณ์อักษร',
      },
      {
        title: 'ระยะเวลาเผยแพร่และการลบ Content',
        body: `ระยะเวลาเผยแพร่: ${F.publishDuration || '-'}\n${F.removalTerms || '-'}`,
      },
      { title: 'สิทธิในการใช้ Content', body: F.contentRights || '-' },
      { title: 'การยกเลิกงาน', body: F.cancelTerms || '-' },
      {
        title: 'ข้อมูลส่วนบุคคล',
        body: 'คู่สัญญาตกลงเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของอีกฝ่ายเท่าที่จำเป็นต่อการปฏิบัติตามสัญญา '
          + 'การจ่ายเงิน และการปฏิบัติตามกฎหมายภาษีอากร ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562',
      },
    );
  }
  blocks.push({ type: 'clauses', items: clauses });

  blocks.push({
    type: 'para',
    indent: true,
    value: 'สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความโดยตลอดแล้ว '
      + 'เห็นว่าถูกต้องตามเจตนา จึงได้ลงลายมือชื่อและประทับตรา (ถ้ามี) ไว้เป็นสำคัญต่อหน้าพยาน '
      + 'และต่างยึดถือไว้ฝ่ายละหนึ่งฉบับ',
  });

  /* ---------- ลงนาม ---------- */
  const mySig = doc.signature || null;
  const theirSig = doc.counterpartySignature || null;
  const employerSig = isBrand ? theirSig : mySig;   // ฝั่งผู้ว่าจ้าง
  const contractorSig = isBrand ? mySig : theirSig; // ฝั่งผู้รับจ้าง

  blocks.push({
    type: 'signature',
    boxes: [
      sigBox('ผู้ว่าจ้าง', isBrand ? (F.sign2Name || party.name) : (F.sign1Name || issuer.name), {
        image: employerSig && employerSig.image,
        signedAt: employerSig && employerSig.signedAt,
        position: isBrand ? F.sign2Position : F.sign1Position,
        date: F.signDate,
      }),
      sigBox('ผู้รับจ้าง', isBrand ? (F.sign1Name || issuer.name) : (F.sign2Name || party.name), {
        image: contractorSig && contractorSig.image,
        signedAt: contractorSig && contractorSig.signedAt,
        position: isBrand ? F.sign1Position : '',
        date: F.signDate,
      }),
    ],
    seal: doc.brand && doc.brand.seal ? doc.brand.seal : null,
  });
  blocks.push({
    type: 'signature',
    compact: true,
    boxes: [sigBox('พยาน', F.witness1), sigBox('พยาน', F.witness2)],
  });

  blocks.push({
    type: 'note',
    value: 'อากรแสตมป์ (จ้างทำของ ลักษณะแห่งตราสาร 4): 1 บาท ต่อทุก 1,000 บาท '
      + `สัญญานี้ ${stampDuty(calc.total).toLocaleString('en-US')} บาท`,
  });
  blocks.push(...tailBlocks(doc));

  return {
    title: `${title} ${doc.docNo || ''}`.trim(),
    docNo: doc.docNo || '', docType: doc.type, pageSize: 'A4', margin: 48, blocks,
    // สัญญาควรจบในหน้าเดียวให้ลงนามหน้าเดียวกับเนื้อความ ถ้าล้นให้ pdfbuild ย่อตัวอักษร/ระยะลงทีละขั้น
    fitOnePage: true,
  };
}

/* ============================================================================
 * 3) หนังสือมอบอำนาจ
 * ========================================================================== */

function planPOA(doc, opt, form) {
  const F = doc.fields || {};
  const powersField = ((DS.FORMS.POA.sections[2] || {}).fields || [])[0] || {};
  const powers = powersField.options || [];
  const jur = F.grantorType === 'juristic';
  const issuerIsGrantor = F.issuerIs === 'grantor';
  const grantorSig = issuerIsGrantor ? doc.signature : doc.counterpartySignature;
  const granteeSig = issuerIsGrantor ? doc.counterpartySignature : doc.signature;
  const blocks = [];

  // อากรแสตมป์หนังสือมอบอำนาจ ลักษณะแห่งตราสาร 7: มอบอำนาจครั้งเดียว 10 บาท หลายครั้ง 30 บาท
  blocks.push({
    type: 'heading',
    title: 'หนังสือมอบอำนาจ',
    subtitle: `เลขที่ ${doc.docNo || 'ฉบับร่าง'}`,
    stamp: `ติดอากรแสตมป์\n${F.actCount === 'once' ? '10' : '30'} บาท`,
  });
  blocks.push(...statusBlocks(doc));
  blocks.push({
    type: 'para',
    align: 'right',
    value: `เขียนที่ ${orDots(F.place)}\nวันที่ ${thaiDate(F.issueDate || doc.docDate)}`,
  });

  blocks.push({
    type: 'para',
    indent: true,
    value: `โดยหนังสือฉบับนี้ ข้าพเจ้า ${F.grantorName || '-'} `
      + `${jur ? 'เลขทะเบียนนิติบุคคล/เลขประจำตัวผู้เสียภาษี' : 'เลขประจำตัวประชาชน'} ${taxIdText(F.grantorIdNo)} `
      + `สำนักงาน/ที่อยู่เลขที่ ${F.grantorAddress || '-'}`
      + (jur ? ` โดย ${F.grantorAuthName || '-'} ตำแหน่ง ${F.grantorPosition || '-'} ผู้มีอำนาจกระทำการแทนนิติบุคคล` : '')
      + ' ซึ่งต่อไปในหนังสือนี้เรียกว่า "ผู้มอบอำนาจ"',
  });
  blocks.push({
    type: 'para',
    indent: true,
    value: `ขอมอบอำนาจให้ ${F.granteeName || '-'} เลขประจำตัวประชาชน ${taxIdText(F.granteeCitizenId)} `
      + `อยู่บ้านเลขที่ ${F.granteeAddress || '-'} ซึ่งต่อไปในหนังสือนี้เรียกว่า "ผู้รับมอบอำนาจ" `
      + 'เป็นผู้มีอำนาจกระทำการแทนผู้มอบอำนาจในเรื่องดังต่อไปนี้',
  });

  blocks.push({
    type: 'checks',
    layout: 'list',
    items: powers.map((o) => ({ label: o.label, checked: (F.powers || []).includes(o.value) })),
  });
  if (F.scopeDetail) {
    blocks.push({ type: 'fields', items: [{ label: 'รายละเอียด/ขอบเขตอำนาจ', value: F.scopeDetail }] });
  }

  blocks.push({
    type: 'para',
    indent: true,
    value: `หนังสือมอบอำนาจนี้มีผลตั้งแต่วันที่ ${thaiDate(F.startDate)} `
      + (F.endDate ? `ถึงวันที่ ${thaiDate(F.endDate)}` : 'จนกว่าผู้มอบอำนาจจะเพิกถอนเป็นลายลักษณ์อักษร'),
  });
  blocks.push({
    type: 'para',
    indent: true,
    value: 'การใดที่ผู้รับมอบอำนาจได้กระทำไปภายในขอบเขตแห่งหนังสือมอบอำนาจนี้ '
      + 'ให้ถือเสมือนหนึ่งว่าผู้มอบอำนาจได้กระทำด้วยตนเองทุกประการ เพื่อเป็นหลักฐาน '
      + `ผู้มอบอำนาจจึงได้ลงลายมือชื่อ${jur ? 'และประทับตรา (ถ้ามี)' : ''}ไว้เป็นสำคัญต่อหน้าพยาน`,
  });

  blocks.push({
    type: 'signature',
    boxes: [
      sigBox('ผู้มอบอำนาจ', jur ? F.grantorAuthName : F.grantorName, {
        image: grantorSig && grantorSig.image,
        signedAt: grantorSig && grantorSig.signedAt,
        position: jur ? [F.grantorPosition, F.grantorName].filter(Boolean).join(' · ') : '',
      }),
      sigBox('ผู้รับมอบอำนาจ', F.granteeName, {
        image: granteeSig && granteeSig.image,
        signedAt: granteeSig && granteeSig.signedAt,
      }),
    ],
    seal: issuerIsGrantor && doc.brand ? doc.brand.seal : null,
  });
  blocks.push({
    type: 'signature',
    compact: true,
    boxes: [sigBox('พยาน', F.witness1), sigBox('พยาน', F.witness2)],
  });

  blocks.push({
    type: 'note',
    value: 'แนบสำเนาบัตรประจำตัวประชาชนของผู้มอบและผู้รับมอบ '
      + '(และหนังสือรับรองนิติบุคคลกรณีนิติบุคคล) เมื่อนำไปใช้จริง',
  });
  blocks.push(...tailBlocks(doc));

  return {
    title: `หนังสือมอบอำนาจ ${doc.docNo || ''}`.trim(),
    docNo: doc.docNo || '', docType: doc.type, pageSize: 'A4', margin: 48, blocks,
  };
}

/* ============================================================================
 * 4) หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
 *    ออกสองฉบับตามแบบของกรมสรรพากร ฉบับที่ 1 ใช้แนบแบบแสดงรายการภาษี
 *    ฉบับที่ 2 ผู้ถูกหักเก็บไว้เป็นหลักฐาน จึงขึ้นหน้าใหม่ระหว่างสองฉบับ
 * ========================================================================== */

/** ประเภทเงินได้ 7 บรรทัดตามหน้าแบบ 50 ทวิ ของกรมสรรพากร */
const WHT_INCOME_ROWS = [
  ['1', '1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)'],
  ['2', '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)'],
  ['3', '3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)'],
  ['4a', '4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)'],
  ['4b', '    (ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)'],
  ['5', '5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส '
    + 'เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย ค่าแสดงของนักแสดงสาธารณะ '
    + 'ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ'],
  ['6', '6. อื่น ๆ (ระบุ)'],
];

/** ลำดับแบบยื่นบนหน้า 50 ทวิ ตรงตามหมายเลข (1)–(7) ที่พิมพ์อยู่บนแบบจริง */
const PND_FORM_ORDER = ['PND1A', 'PND1A_SP', 'PND2', 'PND3', 'PND2A', 'PND3A', 'PND53'];

function planWht50(doc, opt, form) {
  const F = doc.fields || {};
  const issuer = doc.issuer || {};
  const party = partyOf(doc);
  const calc = calcOf(doc);
  const payDateTxt = DS.thaiDate(F.payDate, true) || '';

  /** เนื้อหาของหนึ่งฉบับ ใช้ซ้ำสองครั้ง ต่างกันแค่ข้อความกำกับว่าเป็นฉบับที่เท่าไร */
  const sheet = (copyNo) => {
    const blocks = [];
    blocks.push({
      type: 'heading',
      title: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย',
      subtitle: 'ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร',
      tag: `ฉบับที่ ${copyNo} ${copyNo === 1
        ? '(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)'
        : '(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)'}`,
      right: [
        { label: 'เล่มที่', value: F.bookNo || '-' },
        { label: 'เลขที่', value: doc.docNo || 'ฉบับร่าง' },
      ],
    });
    if (copyNo === 1) blocks.push(...statusBlocks(doc));

    /* ---------- คู่กรณี ---------- */
    blocks.push({
      type: 'idboxes',
      title: 'ผู้มีหน้าที่หักภาษี ณ ที่จ่าย',
      taxId: issuer.taxId,
      lines: [
        { label: 'ชื่อ', value: `${issuer.name || '-'} (${branchText(issuer.branch || issuer.branchNo)})` },
        { label: 'ที่อยู่', value: issuer.address || '-' },
      ],
    });
    blocks.push({
      type: 'idboxes',
      title: 'ผู้ถูกหักภาษี ณ ที่จ่าย',
      taxId: party.taxId,
      lines: [
        { label: 'ชื่อ', value: party.name || '-' },
        { label: 'ที่อยู่', value: party.address || '-' },
      ],
    });

    /* ---------- ลำดับที่ในแบบ ---------- */
    blocks.push({
      type: 'checks',
      layout: 'inline',
      title: `ลำดับที่ ${F.seqInForm || '.....'} ในแบบ`,
      items: PND_FORM_ORDER.map((v, i) => ({
        label: `(${i + 1}) ${optLabel(DS.PND_FORMS, v)}`,
        checked: F.pndForm === v,
      })),
      note: 'ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย',
    });

    /* ---------- ตารางประเภทเงินได้ ---------- */
    const rows = WHT_INCOME_ROWS.map(([code, label]) => {
      const on = F.incomeCode === code;
      const desc = on && (code === '5' || code === '6') && F.incomeDesc ? ` (${F.incomeDesc})` : '';
      return {
        kind: label + desc,
        date: on ? payDateTxt : '',
        paid: on ? money(calc.income) : '',
        tax: on ? money(calc.wht) : '',
      };
    });
    rows.push({ kind: 'รวมเงินที่จ่ายและภาษีที่หักนำส่ง', date: '', paid: money(calc.income), tax: money(calc.wht) });

    blocks.push({
      type: 'table',
      columns: [
        { key: 'kind', label: 'ประเภทเงินได้พึงประเมินที่จ่าย', width: 0, align: 'left' },
        { key: 'date', label: 'วัน เดือน หรือปีภาษีที่จ่าย', width: 76, align: 'center' },
        { key: 'paid', label: 'จำนวนเงินที่จ่าย', width: 84, align: 'right' },
        { key: 'tax', label: 'ภาษีที่หักและนำส่งไว้', width: 84, align: 'right' },
      ],
      rows,
    });

    if (opt.bahtText) {
      blocks.push({ type: 'text', style: 'baht', value: `รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) (${opt.bahtText(calc.wht)})` });
    }

    /* ---------- เงื่อนไขการหัก ---------- */
    const cond = F.whtCondition || '1';
    blocks.push({
      type: 'checks',
      layout: 'inline',
      title: 'ผู้จ่ายเงิน',
      items: [
        { label: '(1) หัก ณ ที่จ่าย', checked: cond === '1' },
        { label: '(2) ออกให้ตลอดไป', checked: cond === '2' },
        { label: '(3) ออกให้ครั้งเดียว', checked: cond === '3' },
        { label: '(4) อื่น ๆ (ระบุ)', checked: false },
      ],
    });

    blocks.push({
      type: 'note',
      value: 'คำเตือน ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ '
        + 'แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร',
    });

    blocks.push({
      type: 'signature',
      single: true,
      caption: 'ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ',
      boxes: [
        sigBox('ผู้จ่ายเงิน', (doc.signature && doc.signature.signerName) || F.signerName, {
          image: doc.signature && doc.signature.image,
          signedAt: doc.signature && doc.signature.signedAt,
          position: F.signerPosition,
          date: F.issueDate,
        }),
      ],
      seal: doc.brand && doc.brand.seal ? doc.brand.seal : null,
    });

    blocks.push({
      type: 'note',
      value: 'หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) หมายถึง 1. กรณีบุคคลธรรมดาไทย '
        + 'ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง 2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า',
    });
    return blocks;
  };

  const blocks = [...sheet(1), { type: 'pagebreak' }, ...sheet(2), ...tailBlocks(doc)];

  return {
    title: `หนังสือรับรองการหักภาษี ณ ที่จ่าย ${doc.docNo || ''}`.trim(),
    docNo: doc.docNo || '', docType: doc.type, pageSize: 'A4', margin: 36, blocks,
  };
}

/* ============================================================================
 * 5) ภ.ง.ด.3 และ ภ.ง.ด.53 — ใบหน้าแบบ + ใบแนบ
 *    ย้ำบนเอกสารเสมอว่าระบบ "จัดทำข้อมูล" ให้เท่านั้น ไม่ได้ยื่นแบบแทนผู้ใช้
 * ========================================================================== */

const PND_ROWS_PER_SHEET = 8;

function planPnd(doc, opt, form) {
  const F = doc.fields || {};
  const issuer = doc.issuer || {};
  const calc = calcOf(doc);
  const is53 = doc.type === 'PND53';
  const formName = is53 ? 'ภ.ง.ด.53' : 'ภ.ง.ด.3';
  const items = Array.isArray(doc.items) ? doc.items : [];
  const blocks = [];

  const remitOptions = is53
    ? [['s3tres', '(1) มาตรา 3 เตรส แห่งประมวลรัษฎากร'], ['s65bis', '(2) มาตรา 65 จัตวา แห่งประมวลรัษฎากร'], ['s69bis', '(3) มาตรา 69 ทวิ แห่งประมวลรัษฎากร']]
    : [['s3tres', '(1) มาตรา 3 เตรส'], ['s48bis', '(2) มาตรา 48 ทวิ'], ['s50', '(3) มาตรา 50 (3) (4) (5)']];

  /* ---------- ใบหน้าแบบ ---------- */
  blocks.push({
    type: 'heading',
    title: 'แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย',
    subtitle: is53
      ? 'ตามมาตรา 3 เตรส และมาตรา 69 ทวิ และการเสียภาษีตามมาตรา 65 จัตวา แห่งประมวลรัษฎากร'
      : 'ตามมาตรา 59 แห่งประมวลรัษฎากร สำหรับการหักภาษี ณ ที่จ่ายตามมาตรา 3 เตรส และมาตรา 50 (3) (4) (5)',
    tag: formName,
    right: [{ label: 'เลขที่', value: doc.docNo || 'ฉบับร่าง' }],
  });
  blocks.push(...statusBlocks(doc));

  blocks.push({
    type: 'idboxes',
    title: 'ผู้มีหน้าที่หักภาษี ณ ที่จ่าย',
    taxId: issuer.taxId,
    lines: [
      { label: 'ชื่อ', value: issuer.name || '-' },
      { label: 'ที่อยู่', value: issuer.address || '-' },
      { label: 'สาขาที่', value: String(F.branchNo || '00000').padStart(5, '0') },
    ],
  });

  blocks.push({
    type: 'checks',
    layout: 'inline',
    title: 'เดือนภาษีที่จ่ายเงินได้',
    items: DS.THAI_MONTHS.map((m, i) => ({ label: `(${i + 1}) ${m}`, checked: Number(F.taxMonth) === i + 1 })),
  });
  blocks.push({ type: 'fields', items: [{ label: 'ปีภาษี (พ.ศ.)', value: String(F.taxYearBE || '-') }] });

  blocks.push({
    type: 'checks',
    layout: 'inline',
    title: 'ประเภทการยื่น',
    items: [
      { label: 'ยื่นปกติ', checked: (F.filingType || 'normal') === 'normal' },
      { label: `ยื่นเพิ่มเติมครั้งที่ ${F.filingSeq || '.....'}`, checked: F.filingType === 'additional' },
    ],
  });
  blocks.push({
    type: 'checks',
    layout: 'list',
    title: 'นำส่งภาษีตาม',
    items: remitOptions.map(([v, label]) => ({ label, checked: (F.remitUnder || []).includes(v) })),
  });

  /* ---------- สรุปยอด ---------- */
  const grand = Math.round(((Number(calc.wht) || 0) + (Number(calc.surcharge) || 0)) * 100) / 100;
  blocks.push({
    type: 'totals',
    lines: [
      { label: 'จำนวนราย', value: String(items.length) },
      { label: 'รวมเงินได้ทั้งสิ้น', value: money(calc.income) },
      { label: 'รวมภาษีที่นำส่งทั้งสิ้น', value: money(calc.wht) },
      ...(Number(calc.surcharge) > 0 ? [{ label: 'เงินเพิ่ม', value: money(calc.surcharge) }] : []),
      { label: 'รวมทั้งสิ้น', value: money(grand), bold: true, rule: true },
    ],
  });
  if (opt.bahtText) blocks.push({ type: 'text', style: 'baht', value: `(${opt.bahtText(grand)})` });

  blocks.push({
    type: 'signature',
    single: true,
    caption: 'ขอรับรองว่ารายการที่แจ้งไว้ข้างต้นเป็นรายการที่ถูกต้องและครบถ้วนทุกประการ',
    boxes: [
      sigBox('ผู้จ่ายเงิน', (doc.signature && doc.signature.signerName) || F.signerName, {
        image: doc.signature && doc.signature.image,
        signedAt: doc.signature && doc.signature.signedAt,
        position: F.signerPosition,
        date: F.filingDate,
      }),
    ],
    seal: doc.brand && doc.brand.seal ? doc.brand.seal : null,
  });

  /* ---------- ใบแนบ ---------- */
  const columns = [
    { key: 'no', label: 'ลำดับ', width: 34, align: 'center' },
    { key: 'payee', label: 'ผู้มีเงินได้ / เลขประจำตัวผู้เสียภาษี', width: 0, align: 'left' },
    { key: 'payDate', label: 'วันเดือนปีที่จ่าย', width: 60, align: 'center' },
    { key: 'incomeDesc', label: 'ประเภทเงินได้', width: 72, align: 'left' },
    { key: 'rate', label: 'อัตรา %', width: 36, align: 'right' },
    { key: 'amount', label: 'จำนวนเงินที่จ่าย', width: 72, align: 'right' },
    { key: 'wht', label: 'ภาษีที่หัก', width: 64, align: 'right' },
    // เงื่อนไข 1 หัก ณ ที่จ่าย · 2 ออกให้ตลอดไป · 3 ออกให้ครั้งเดียว มีในใบแนบของกรมสรรพากรจริง
    { key: 'condition', label: 'เงื่อนไข', width: 44, align: 'center' },
  ];
  const pages = Math.max(1, Math.ceil(items.length / PND_ROWS_PER_SHEET));

  for (let pg = 0; pg < pages; pg++) {
    blocks.push({ type: 'pagebreak' });
    blocks.push({
      type: 'heading',
      title: `ใบแนบ ${formName}`,
      subtitle: `เดือนภาษี ${DS.THAI_MONTHS[Number(F.taxMonth) - 1] || '-'} ${F.taxYearBE || ''} `
        + `· ผู้มีหน้าที่หักภาษี ${issuer.name || '-'} (${taxIdText(issuer.taxId)})`,
      tag: `แผ่นที่ ${pg + 1} จาก ${pages}`,
    });
    const chunk = items.slice(pg * PND_ROWS_PER_SHEET, (pg + 1) * PND_ROWS_PER_SHEET);
    blocks.push({
      type: 'table',
      columns,
      rows: chunk.map((it, i) => ({
        no: String(pg * PND_ROWS_PER_SHEET + i + 1),
        payee: `${it.payeeName || '-'}\n${taxIdText(it.payeeTaxId)}`
          + (it.payeeBranch ? ` ${branchText(it.payeeBranch)}` : '')
          + (it.payeeAddress ? `\n${it.payeeAddress}` : ''),
        payDate: it.payDate ? DS.thaiDate(it.payDate, true) : '-', // วันที่แบบย่อ เหมือนหน้าพิมพ์ HTML เดิม
        incomeDesc: it.incomeDesc || '-',
        rate: String(it.rate ?? ''),
        amount: money(it.amount),
        wht: money(it.wht),
        condition: String(it.condition || '1'),
      })),
    });
    if (pg === pages - 1) {
      blocks.push({
        type: 'totals',
        lines: [
          { label: 'รวมเงินได้ทั้งสิ้น', value: money(calc.income) },
          { label: 'รวมภาษีที่หักและนำส่ง', value: money(calc.wht), bold: true, rule: true },
        ],
      });
    }
  }

  blocks.push({
    type: 'note',
    value: 'เงื่อนไขการหักภาษี: 1 = หัก ณ ที่จ่าย · 2 = ออกให้ตลอดไป · 3 = ออกให้ครั้งเดียว',
  });
  blocks.push({
    type: 'note',
    value: `ระบบจัดทำข้อมูล ${formName} ให้เท่านั้น ผู้เสียภาษีต้องนำข้อมูลนี้ไปยื่นแบบเองผ่านระบบ e-Filing `
      + 'ของกรมสรรพากร หรือ ณ สำนักงานสรรพากรพื้นที่สาขา ระบบไม่ได้ยื่นแบบแทนผู้ใช้',
  });
  blocks.push(...tailBlocks(doc));

  return {
    title: `${formName} ${doc.docNo || ''}`.trim(),
    docNo: doc.docNo || '', docType: doc.type, pageSize: 'A4', margin: 36, blocks,
  };
}

/**
 * บันทึก 50 ทวิ ที่ "ได้รับ" มา (type = WHT, docPurpose = record)
 * ต่างจาก planWht50 ตรงที่ฉบับนี้เราเป็นผู้ถูกหักภาษี ไม่ใช่ผู้ออกหนังสือรับรอง
 * จึงวาดเป็นใบบันทึกภายในสำหรับแนบบัญชี/ใช้ประกอบการยื่นภาษีของตัวเอง
 * ไม่วาดเลียนแบบหนังสือรับรองฯ ของกรมสรรพากร เพราะผู้ออกตัวจริงคือผู้จ่ายเงิน ไม่ใช่เรา
 */
function planWhtRecord(doc, opt) {
  const calc = calcOf(doc);
  const base = Number(doc.base ?? calc.base ?? 0);
  const wht = Number(doc.wht ?? calc.wht ?? 0);
  const net = Number(doc.net ?? calc.net ?? (base - wht));
  const rate = Number(doc.rate ?? calc.rate ?? 0);
  const owner = doc.issuer || {};
  const blocks = [];

  blocks.push({
    type: 'heading',
    title: 'บันทึกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ที่ได้รับ',
    subtitle: 'บันทึกภายในของผู้ถูกหักภาษี ใช้ประกอบการยื่นภาษีเงินได้',
    right: [
      { label: 'เลขที่บันทึก', value: doc.docNo || 'ฉบับร่าง' },
      { label: 'วันที่บันทึก', value: DS.thaiDate(doc.issueDate, true) || '-' },
    ],
  });
  blocks.push(...statusBlocks(doc));

  // ย้ำให้ชัดว่าใบนี้ใช้แทนต้นฉบับไม่ได้ ผู้ยื่นภาษีต้องเก็บต้นฉบับที่ผู้จ่ายเงินออกให้ไว้เสมอ
  blocks.push({
    type: 'note',
    style: 'alert',
    value: 'เอกสารนี้เป็น "บันทึกภายใน" ที่ผู้ถูกหักภาษีจัดทำขึ้นเอง ไม่ใช่หนังสือรับรองการหักภาษี ณ ที่จ่าย '
      + 'ตามมาตรา 50 ทวิ ใช้อ้างอิงแทนต้นฉบับไม่ได้ กรุณาเก็บต้นฉบับที่ผู้จ่ายเงินออกให้ไว้เป็นหลักฐานการยื่นภาษี',
  });

  blocks.push({
    type: 'fields',
    items: [
      { label: 'ผู้จ่ายเงิน / ผู้ว่าจ้าง', value: doc.payer || '-' },
      { label: 'ผู้ถูกหักภาษี (ผู้รับเงิน)', value: owner.name || '-' },
      { label: 'ประเภทเงินได้', value: doc.incomeType || '-' },
      { label: 'รายละเอียดงาน', value: doc.description || '-' },
      { label: 'วันที่จ่ายเงิน', value: DS.thaiDate(doc.payDate || doc.issueDate, true) || '-' },
    ].filter((f) => f.value !== '-' || ['ผู้จ่ายเงิน / ผู้ว่าจ้าง', 'ประเภทเงินได้'].includes(f.label)),
  });

  blocks.push({
    type: 'totals',
    lines: [
      { label: 'ยอดเงินก่อนหักภาษี', value: money(base) },
      { label: `ภาษีหัก ณ ที่จ่าย (${rate}%)`, value: `-${money(wht)}` },
      { label: 'ยอดสุทธิที่ได้รับ', value: money(net), bold: true, rule: true },
    ],
  });

  if (opt.bahtText) {
    blocks.push({ type: 'text', style: 'baht', value: `ภาษีที่ถูกหักไว้ (ตัวอักษร) ${opt.bahtText(wht)}` });
  }
  blocks.push(...tailBlocks(doc));

  return {
    title: `บันทึก 50 ทวิ ${doc.docNo || ''}`.trim(),
    docNo: doc.docNo || '', docType: doc.type, pageSize: 'A4', margin: 40, blocks,
  };
}

/* ------------------------------------------------------------- ฟังก์ชันหลัก */

/** เลือกแบบแผนตาม mode ของฟอร์ม mode ที่ไม่ได้ระบุไว้ถือเป็นเอกสารการเงินทั่วไป */
const PLANNERS = {
  deliverables: planDelivery,
  voucher: planVoucher,
  contract: planContract,
  poa: planPOA,
  wht: planWht50,
  pnd: planPnd,
};

/**
 * สร้างแผนผังการวาดจากเอกสารหนึ่งฉบับ
 * @param {object} doc เอกสาร (type, docNo, fields, party/partyInfo, items, calc, issuer, status)
 * @param {object} [opt] { bahtText: fn } ส่งตัวแปลงจำนวนเงินเป็นตัวหนังสือเข้ามาได้
 * @returns {object} { title, docNo, docType, pageSize, margin, blocks }
 */
function build(doc, opt = {}) {
  // WHT = บันทึก 50 ทวิ ที่ได้รับจากผู้จ่ายเงิน (หน้า "บันทึก 50 ทวิ (รับ)")
  // ไม่ได้อยู่ใน DS.FORMS เพราะไม่ใช่แบบฟอร์มที่ระบบ "ออก" ให้ แต่ต้องเปิดดู/ดาวน์โหลดเป็น PDF ได้
  if (doc.type === 'WHT') return planWhtRecord(doc, opt);
  const form = DS.FORMS[doc.type];
  if (!form) throw new Error(`ไม่รู้จักเอกสารประเภท ${doc.type}`);
  const planner = PLANNERS[form.mode] || planCommercial;
  return planner(doc, opt, form);
}

/** ประเภทเอกสารที่วาดเป็น PDF ได้ ตอนนี้ครบทุกประเภทที่ระบบออกได้ บวกบันทึก 50 ทวิ ที่ได้รับ */
const SUPPORTED = [...Object.keys(DS.FORMS), 'WHT'];
const supports = (type) => SUPPORTED.includes(type);

module.exports = {
  build, supports, SUPPORTED,
  money, thaiDate, taxIdText, branchText, partyOf, calcOf, stampDuty, orDots,
  DEMO_NOTICE, PND_ROWS_PER_SHEET, WHT_INCOME_ROWS, PND_FORM_ORDER,
};
