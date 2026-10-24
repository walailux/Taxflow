'use strict';
/**
 * xmlbuild.js สร้างไฟล์ XML ของเอกสารอิเล็กทรอนิกส์ (WP5)
 * ==========================================================================
 * โครงสร้างอ้างอิงข้อเสนอแนะมาตรฐาน ขมธอ. 3-2560 ของ ETDA ว่าด้วยข้อความ
 * อิเล็กทรอนิกส์สำหรับใบกำกับภาษีและใบรับ ซึ่งวางบนพื้นฐานของ UN/CEFACT
 * Cross Industry Invoice (CII) จึงจัดกลุ่มข้อมูลเป็น 3 ส่วนตามแบบนั้น คือ
 *
 *   ExchangedDocument              ส่วนหัวเอกสาร: ประเภท เลขที่ วันที่ หมายเหตุ
 *   SupplyChainTradeTransaction
 *     ├─ IncludedSupplyChainTradeLineItem   รายการสินค้าหรือบริการ
 *     ├─ ApplicableHeaderTradeAgreement     คู่สัญญา (ผู้ขาย / ผู้ซื้อ)
 *     ├─ ApplicableHeaderTradeDelivery      การส่งมอบ
 *     └─ ApplicableHeaderTradeSettlement    ยอดรวม ภาษี และการชำระเงิน
 *
 * ข้อจำกัดที่ต้องระบุเสมอ: ระบบยังไม่ได้ยื่นคำขอจัดทำและส่งมอบ e-Tax Invoice
 * กับกรมสรรพากร ไฟล์ที่สร้างจึงใช้เพื่อการศึกษาและสาธิตกระบวนการเท่านั้น
 * ก่อนนำไปใช้จริงต้องยืนยันเลขที่มาตรฐานฉบับล่าสุดกับ ETDA อีกครั้ง
 *
 * ทำไมไม่ใช้ xmlbuilder2 ตามที่แผนระบุ
 * ---------------------------------------
 * โครงสร้างที่ต้องสร้างเป็นต้นไม้คงที่ ไม่มีการต่อ XML แบบไดนามิกที่ซับซ้อน
 * การเขียนเองราว 120 บรรทัดทำให้ไม่ต้องพึ่งไลบรารีภายนอกเพิ่ม ทดสอบได้ครบ
 * และควบคุมการ escape อักขระพิเศษได้เอง ถ้าภายหลังต้องรองรับ namespace
 * ที่ซับซ้อนกว่านี้ ค่อยเปลี่ยนไปใช้ xmlbuilder2 ได้โดยไม่กระทบผู้เรียกใช้
 */

const DS = require('./docschema.js');
const docshape = require('./docshape.js');

/* ---------------------------------------------------------------- ตัวช่วย */

/**
 * แทนอักขระที่มีความหมายพิเศษใน XML
 * ถ้าไม่ทำ ชื่อบริษัทที่มี & หรือ " จะทำให้ไฟล์ XML เสียทั้งไฟล์
 */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** ตัดอักขระควบคุมที่ XML 1.0 ไม่ยอมรับออก (เผลอหลุดมาจากการคัดลอกวาง) */
function clean(value) {
  // eslint-disable-next-line no-control-regex
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** สร้าง element เดียว คืนค่าว่างเมื่อไม่มีเนื้อหา เพื่อไม่ให้ไฟล์เต็มไปด้วยแท็กเปล่า */
function el(name, value, attrs) {
  const text = clean(value);
  if (text === '') return '';
  const a = attrs ? ' ' + Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ') : '';
  return `<${name}${a}>${esc(text)}</${name}>`;
}

/** จำนวนเงินต้องมีทศนิยม 2 ตำแหน่งเสมอ ผู้รับไฟล์จะได้ไม่ต้องเดาหน่วยย่อย */
const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

/** วันที่ในรูปแบบ YYYYMMDD ตาม UN/EDIFACT format 102 ที่ ขมธอ. 3-2560 ใช้ */
function ymd(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[1]}${m[2]}${m[3]}` : '';
}

/**
 * จัดย่อหน้าให้อ่านง่าย รับ array ของบรรทัด (ค่าว่างถูกตัดทิ้ง)
 * รายการที่เป็นข้อความหลายบรรทัดอยู่แล้ว (มาจาก block ชั้นใน) จะถูกเยื้องทุกบรรทัด
 * ไม่ใช่เฉพาะบรรทัดแรก มิฉะนั้นโครงสร้างที่ซ้อนกันจะอ่านไม่ออก
 */
function block(lines, indent) {
  const pad = '  '.repeat(indent);
  return lines
    .filter(Boolean)
    .map((chunk) => String(chunk).split('\n').map((l) => pad + l).join('\n'))
    .join('\n');
}

/**
 * รหัสหน่วยนับตาม UN/ECE Recommendation 20 ที่ ขมธอ. 3-2560 อ้างถึง
 * ใส่ข้อความภาษาไทยลงใน unitCode ตรง ๆ ไม่ได้ เพราะผู้รับไฟล์ตีความไม่ออก
 * หน่วยที่ไม่รู้จักให้ใช้ C62 (หน่วยนับทั่วไป) ซึ่งเป็นค่ากลางที่ยอมรับได้
 */
const UNIT_CODE = {
  'ชิ้น': 'C62', 'อัน': 'C62', 'ชุด': 'SET', 'ครั้ง': 'C62', 'งาน': 'C62',
  'ชั่วโมง': 'HUR', 'วัน': 'DAY', 'เดือน': 'MON', 'ปี': 'ANN',
  'คน': 'C62', 'โพสต์': 'C62', 'คลิป': 'C62', 'ภาพ': 'C62',
  'กิโลกรัม': 'KGM', 'เมตร': 'MTR', 'ลิตร': 'LTR', 'กล่อง': 'BX', 'แพ็ค': 'PK',
};
const unitCodeOf = (unit) => UNIT_CODE[String(unit || '').trim()] || 'C62';

/* ------------------------------------------------- รหัสประเภทเอกสารตามมาตรฐาน */

/**
 * รหัสประเภทเอกสารตาม UN/EDIFACT code list 1001 ที่ ขมธอ. 3-2560 อ้างถึง
 *   380 = ใบกำกับภาษี (Commercial invoice)
 *   T01 = ใบรับ (Receipt) — รหัสเฉพาะที่ฝั่งไทยกำหนดเพิ่ม
 */
const DOC_TYPE_CODE = {
  ETAX_INVOICE: { code: '380', name: 'ใบกำกับภาษี', en: 'TAX INVOICE' },
  ETAX_RECEIPT: { code: 'T01', name: 'ใบรับ', en: 'RECEIPT' },
};

/** ประเภทเอกสารที่รองรับการสร้าง XML */
const SUPPORTED = Object.keys(DOC_TYPE_CODE);
const supports = (type) => SUPPORTED.includes(type);

/* ----------------------------------------------------------- ส่วนประกอบย่อย */

/**
 * คู่สัญญาหนึ่งฝ่าย (ผู้ขายหรือผู้ซื้อ)
 * เลขประจำตัวผู้เสียภาษีใช้ schemeID = TXID และเลขสาขาใช้ BRN
 * ตามที่ ขมธอ. 3-2560 กำหนดให้ระบุสำนักงานใหญ่หรือเลขที่สาขาของทั้งสองฝ่าย
 */
function tradeParty(tag, p, indent) {
  const branch = clean(p.branch) || '00000'; // 00000 = สำนักงานใหญ่
  return block([
    `<${tag}>`,
    '  ' + el('ram:ID', p.taxId, { schemeID: 'TXID' }),
    '  ' + el('ram:ID', branch, { schemeID: 'BRN' }),
    '  ' + el('ram:Name', p.name),
    p.contactPerson ? block([
      '<ram:DefinedTradeContact>',
      '  ' + el('ram:PersonName', p.contactPerson),
      p.phone ? '  <ram:TelephoneUniversalCommunication>' + el('ram:CompleteNumber', p.phone) + '</ram:TelephoneUniversalCommunication>' : '',
      p.email ? '  <ram:EmailURIUniversalCommunication>' + el('ram:URIID', p.email) + '</ram:EmailURIUniversalCommunication>' : '',
      '</ram:DefinedTradeContact>',
    ], 1) : '',
    block([
      '<ram:PostalTradeAddress>',
      '  ' + el('ram:CountryID', 'TH'),
      '  ' + el('ram:LineOne', p.address),
      '</ram:PostalTradeAddress>',
    ], 1),
    `</${tag}>`,
  ], indent);
}

/** รายการสินค้าหรือบริการหนึ่งบรรทัด */
function lineItem(row, index, vatRate, indent) {
  const qty = Number(row.qty) || 1;
  const price = Number(row.price != null ? row.price : row.amount) || 0;
  const discount = Number(row.discount) || 0;
  const lineTotal = row.amount != null && row.price == null
    ? Number(row.amount) || 0
    : Math.round((qty * price - discount) * 100) / 100;

  return block([
    '<ram:IncludedSupplyChainTradeLineItem>',
    '  <ram:AssociatedDocumentLineDocument>' + el('ram:LineID', String(index + 1)) + '</ram:AssociatedDocumentLineDocument>',
    '  <ram:SpecifiedTradeProduct>' + el('ram:Name', row.name) + '</ram:SpecifiedTradeProduct>',
    block([
      '<ram:SpecifiedLineTradeAgreement>',
      '  <ram:NetPriceProductTradePrice>' + el('ram:ChargeAmount', money(price), { currencyID: 'THB' }) + '</ram:NetPriceProductTradePrice>',
      '</ram:SpecifiedLineTradeAgreement>',
    ], 1),
    '  <ram:SpecifiedLineTradeDelivery>' + el('ram:BilledQuantity', String(qty), { unitCode: unitCodeOf(row.unit) }) + '</ram:SpecifiedLineTradeDelivery>',
    block([
      '<ram:SpecifiedLineTradeSettlement>',
      '  <ram:ApplicableTradeTax>',
      '    ' + el('ram:TypeCode', 'VAT'),
      '    ' + el('ram:RateApplicablePercent', money(vatRate)),
      '  </ram:ApplicableTradeTax>',
      '  <ram:SpecifiedTradeSettlementLineMonetarySummation>'
        + el('ram:LineTotalAmount', money(lineTotal), { currencyID: 'THB' })
        + '</ram:SpecifiedTradeSettlementLineMonetarySummation>',
      '</ram:SpecifiedLineTradeSettlement>',
    ], 1),
    '</ram:IncludedSupplyChainTradeLineItem>',
  ], indent);
}

/* ------------------------------------------------------------ ฟังก์ชันหลัก */

/**
 * สร้างไฟล์ XML จากเอกสารหนึ่งฉบับ
 * @param {object} doc   เอกสารจากฐานข้อมูล (มี type, docNo, fields, party, items, calc, issuer)
 * @param {object} [opt] { generatedAt: Date } กำหนดเวลาสร้างได้ เพื่อให้ผลลัพธ์คงที่ตอนทดสอบ
 * @returns {string} ไฟล์ XML พร้อมบันทึก (UTF-8)
 */
function build(doc, opt = {}) {
  if (!doc || !supports(doc.type)) {
    throw new Error(`ยังไม่รองรับการสร้าง XML ของเอกสารประเภท ${doc && doc.type}`);
  }
  const meta = DOC_TYPE_CODE[doc.type];
  const F = doc.fields || {};
  // อ่านคู่ค้าและยอดเงินผ่าน docshape เสมอ เอกสารที่บันทึกจริงเก็บคู่ค้าไว้ที่ partyInfo
  // ส่วน doc.party เป็นแค่ชื่อ ถ้าอ่านตรง ๆ ตัวตรวจจะแจ้งว่าไม่มีข้อมูลผู้ซื้อทั้งที่มีครบ
  const calc = docshape.calcOf(doc);
  const issuer = doc.issuer || {};
  const party = docshape.partyOf(doc);
  const items = Array.isArray(doc.items) ? doc.items : [];
  const vatRate = Number(calc.vatRate) || 0;

  const issueDate = ymd(F.issueDate || F.receiveDate || doc.docDate);
  const generatedAt = (opt.generatedAt || new Date()).toISOString();

  const notes = [
    F.note,
    'เอกสารนี้สร้างโดยระบบ TaxFlow เพื่อการศึกษาและสาธิตกระบวนการ '
      + 'ยังไม่ได้ยื่นคำขอจัดทำและส่งมอบใบกำกับภาษีอิเล็กทรอนิกส์กับกรมสรรพากร',
  ].filter(Boolean);

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rsm:CrossIndustryInvoice',
    '  xmlns:rsm="urn:etda:uncefact:data:standard:CrossIndustryInvoice:2"',
    '  xmlns:ram="urn:etda:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:2"',
    '  xmlns:udt="urn:etda:uncefact:data:standard:UnqualifiedDataType:2">',

    /* ---------- ส่วนบริบทของเอกสาร ---------- */
    block([
      '<rsm:ExchangedDocumentContext>',
      '  <ram:GuidelineSpecifiedDocumentContextParameter>'
        + el('ram:ID', 'ETDA.3-2560')
        + '</ram:GuidelineSpecifiedDocumentContextParameter>',
      '</rsm:ExchangedDocumentContext>',
    ], 1),

    /* ---------- ส่วนหัวเอกสาร ---------- */
    block([
      '<rsm:ExchangedDocument>',
      '  ' + el('ram:ID', doc.docNo),
      '  ' + el('ram:Name', meta.name),
      '  ' + el('ram:TypeCode', meta.code),
      '  <ram:IssueDateTime>' + el('udt:DateTimeString', issueDate, { format: '102' }) + '</ram:IssueDateTime>',
      F.volumeNo ? '  ' + el('ram:VolumeID', F.volumeNo) : '',
      '  ' + el('ram:CreationDateTime', generatedAt),
      ...notes.map((n) => '  <ram:IncludedNote>' + el('ram:Content', n) + '</ram:IncludedNote>'),
      '</rsm:ExchangedDocument>',
    ], 1),

    /* ---------- ส่วนธุรกรรม ---------- */
    '  <rsm:SupplyChainTradeTransaction>',
    ...items.map((row, i) => lineItem(row, i, vatRate, 2)),

    block([
      '<ram:ApplicableHeaderTradeAgreement>',
      tradeParty('ram:SellerTradeParty', issuer, 1),
      tradeParty('ram:BuyerTradeParty', party, 1),
      F.poRef ? '  <ram:BuyerOrderReferencedDocument>' + el('ram:IssuerAssignedID', F.poRef) + '</ram:BuyerOrderReferencedDocument>' : '',
      F.invoiceRef || F.taxInvoiceRef
        ? '  <ram:AdditionalReferencedDocument>' + el('ram:IssuerAssignedID', F.invoiceRef || F.taxInvoiceRef) + '</ram:AdditionalReferencedDocument>'
        : '',
      '</ram:ApplicableHeaderTradeAgreement>',
    ], 2),

    block([
      '<ram:ApplicableHeaderTradeDelivery>',
      '  <ram:ActualDeliverySupplyChainEvent>'
        + '<ram:OccurrenceDateTime>' + el('udt:DateTimeString', ymd(F.payDate || F.receiveDate || F.issueDate), { format: '102' }) + '</ram:OccurrenceDateTime>'
        + '</ram:ActualDeliverySupplyChainEvent>',
      '</ram:ApplicableHeaderTradeDelivery>',
    ], 2),

    block([
      '<ram:ApplicableHeaderTradeSettlement>',
      '  ' + el('ram:InvoiceCurrencyCode', 'THB'),
      block([
        '<ram:ApplicableTradeTax>',
        '  ' + el('ram:CalculatedAmount', money(calc.vat), { currencyID: 'THB' }),
        '  ' + el('ram:TypeCode', 'VAT'),
        '  ' + el('ram:BasisAmount', money(calc.base), { currencyID: 'THB' }),
        '  ' + el('ram:RateApplicablePercent', money(vatRate)),
        '</ram:ApplicableTradeTax>',
      ], 1),
      block([
        '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
        '  ' + el('ram:LineTotalAmount', money(calc.subtotal), { currencyID: 'THB' }),
        '  ' + el('ram:AllowanceTotalAmount', money((Number(calc.lineDiscount) || 0) + (Number(calc.billDiscount) || 0)), { currencyID: 'THB' }),
        '  ' + el('ram:TaxBasisTotalAmount', money(calc.base), { currencyID: 'THB' }),
        '  ' + el('ram:TaxTotalAmount', money(calc.vat), { currencyID: 'THB' }),
        '  ' + el('ram:GrandTotalAmount', money(calc.total), { currencyID: 'THB' }),
        '</ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
      ], 1),
      '</ram:ApplicableHeaderTradeSettlement>',
    ], 2),

    '  </rsm:SupplyChainTradeTransaction>',
    '</rsm:CrossIndustryInvoice>',
  ];

  return body.filter((x) => x !== '').join('\n') + '\n';
}

/**
 * ตรวจโครงสร้างไฟล์ที่สร้างก่อนบันทึก (ภาคผนวก ก.2 ของแผน)
 * ไม่ได้ตรวจกับ XSD เต็มรูปแบบ แต่ตรวจสิ่งที่พลาดแล้วเสียหายจริง คือ
 * แท็กเปิดปิดไม่ครบ ขาดข้อมูลที่กฎหมายบังคับ และยอดรวมไม่ลงกัน
 * @returns {string[]} รายการข้อผิดพลาด (ว่าง = ผ่าน)
 */
function validate(xml, doc) {
  const errors = [];
  const need = (tag, label) => {
    if (!new RegExp(`<${tag}[ >]`).test(xml)) errors.push(`ไฟล์ XML ขาด ${label}`);
  };

  if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(xml)) errors.push('ไฟล์ XML ขาดบรรทัดประกาศ XML declaration');
  need('rsm:ExchangedDocument', 'ส่วนหัวเอกสาร');
  need('ram:SellerTradeParty', 'ข้อมูลผู้ขาย');
  need('ram:BuyerTradeParty', 'ข้อมูลผู้ซื้อ');
  need('ram:SpecifiedTradeSettlementHeaderMonetarySummation', 'ส่วนสรุปยอดเงิน');

  // แท็กเปิดกับแท็กปิดต้องเท่ากันทุกชื่อ จับกรณีสร้าง XML ขาดหรือเกิน
  const opens = {};
  for (const m of xml.matchAll(/<(\/?)([a-zA-Z0-9:._-]+)(\s[^>]*?)?(\/?)>/g)) {
    const [, closing, name, , selfClose] = m;
    if (name.startsWith('?') || selfClose) continue;
    opens[name] = (opens[name] || 0) + (closing ? -1 : 1);
  }
  for (const [name, depth] of Object.entries(opens)) {
    if (depth !== 0) errors.push(`แท็ก <${name}> เปิดปิดไม่สมดุล (ต่างกัน ${depth})`);
  }

  if (doc) {
    const F = doc.fields || {};
    const calc = docshape.calcOf(doc);
    const issuer = doc.issuer || {};
    const party = docshape.partyOf(doc);
    // มาตรา 86/4 บังคับให้มีรายการเหล่านี้บนใบกำกับภาษีแบบเต็มรูป
    if (!doc.docNo) errors.push('เอกสารไม่มีเลขที่');
    if (!(F.issueDate || F.receiveDate)) errors.push('เอกสารไม่มีวันเดือนปีที่ออก');
    if (!issuer.taxId) errors.push('ไม่มีเลขประจำตัวผู้เสียภาษีของผู้ขาย');
    if (!issuer.name) errors.push('ไม่มีชื่อผู้ขาย');
    if (!issuer.address) errors.push('ไม่มีที่อยู่ผู้ขาย');
    if (!party.taxId) errors.push('ไม่มีเลขประจำตัวผู้เสียภาษีของผู้ซื้อ');
    if (!party.name) errors.push('ไม่มีชื่อผู้ซื้อ');
    if (!party.address) errors.push('ไม่มีที่อยู่ผู้ซื้อ');
    if (!(Array.isArray(doc.items) && doc.items.length)) errors.push('เอกสารไม่มีรายการสินค้าหรือบริการ');
    if (!(Number(calc.vat) > 0)) errors.push('ไม่มีจำนวนภาษีมูลค่าเพิ่มที่แยกออกจากราคา');

    // ยอดรวมต้องลงกัน ผิดตรงนี้แปลว่าคำนวณเพี้ยน ไม่ใช่แค่ไฟล์ผิดรูปแบบ
    const expect = Math.round(((Number(calc.base) || 0) + (Number(calc.vat) || 0)) * 100) / 100;
    if (Math.abs(expect - (Number(calc.total) || 0)) > 0.01) {
      errors.push(`ยอดรวมไม่ตรงกัน: ฐานภาษี + ภาษี = ${expect} แต่ยอดรวมในเอกสารคือ ${calc.total}`);
    }
  }
  return errors;
}

/** ชื่อไฟล์ XML ที่แนบไปกับ PDF ใช้เลขที่เอกสารเพื่อให้ตามรอยกลับได้ */
function fileName(doc) {
  const safe = String((doc && doc.docNo) || 'document').replace(/[^A-Za-z0-9._-]/g, '-');
  return `${safe}.xml`;
}

module.exports = { build, validate, fileName, supports, SUPPORTED, DOC_TYPE_CODE, UNIT_CODE, unitCodeOf, esc, ymd, money };
