'use strict';
/**
 * export.js ส่งออกรายการเอกสารเป็น CSV และ Excel (ไม่มี dependency)
 * - CSV: มี BOM ให้ Excel อ่านภาษาไทยถูกต้อง
 * - Excel: ตาราง HTML แบบ .xls ที่ Microsoft Excel เปิดได้
 *
 * ทั้งสองรูปแบบรองรับ "หัวรายงานของผู้ประกอบการ" (brand)
 * { name, taxId, address, branch, logo } โดย logo เป็น data URI
 * ผู้ใช้อัปโหลดโลโก้เองได้ที่หน้าโปรไฟล์ ระบบจะพิมพ์ลงหัวรายงานให้อัตโนมัติ
 */

const TYPE_LABEL = {
  WHT: 'หัก ณ ที่จ่าย (รับ)', ETAX: 'ใบกำกับภาษี', EWHT: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)',
  RECEIPT: 'ใบเสร็จรับเงิน', INVOICE: 'ใบแจ้งหนี้', QUOTATION: 'ใบเสนอราคา', PO: 'ใบสั่งซื้อ',
  DELIVERY: 'ใบส่งมอบงาน', PAYMENT: 'ใบสำคัญจ่าย', CONTRACT_INF: 'สัญญาจ้าง Influencer', CONTRACT_BRAND: 'สัญญากับแบรนด์',
  CREDIT_NOTE: 'ใบลดหนี้', DEBIT_NOTE: 'ใบเพิ่มหนี้', POA: 'หนังสือมอบอำนาจ',
  PND3: 'ข้อมูล ภ.ง.ด.3', PND53: 'ข้อมูล ภ.ง.ด.53',
};
const STATUS_LABEL = {
  draft: 'แบบร่าง', pending: 'รอตรวจสอบ', approved: 'อนุมัติ',
  rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก', archived: 'เก็บถาวร',
};

function rowsOf(docs) {
  return docs.map((d) => ({
    docNo: d.docNo || '',
    type: TYPE_LABEL[d.type] || d.type,
    status: STATUS_LABEL[d.status] || d.status || '',
    counterparty: d.party || d.buyer || d.payee || d.payer || '',
    date: d.docDate || d.issueDate || (d.createdAt || '').slice(0, 10),
    base: Number(d.base || 0),
    tax: Number(['WHT', 'EWHT', 'PAYMENT', 'PND3', 'PND53'].includes(d.type) ? d.wht || 0 : d.vat || 0),
    total: Number(['WHT', 'EWHT', 'PAYMENT'].includes(d.type) ? d.net || 0 : d.total || 0),
  }));
}
const HEAD = ['เลขที่เอกสาร', 'ประเภท', 'สถานะ', 'คู่ค้า/ลูกค้า', 'วันที่', 'ฐานภาษี', 'ภาษี/VAT', 'ยอดรวม'];

/** หัวรายงานสำหรับไฟล์ CSV (โลโก้เป็นรูปภาพ จึงใส่ได้เฉพาะไฟล์ Excel) */
function csvHeadLines(brand) {
  if (!brand || !brand.name) return [];
  const lines = [`รายงานเอกสารภาษี - ${brand.name}`];
  const meta = [];
  if (brand.taxId) meta.push(`เลขประจำตัวผู้เสียภาษี ${brand.taxId}`);
  if (brand.branch) meta.push(brand.branch);
  if (meta.length) lines.push(meta.join(' '));
  if (brand.address) lines.push(brand.address);
  lines.push(`วันที่ออกรายงาน ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push('');
  return lines;
}

// กัน CSV/Excel formula injection: ถ้าค่าขึ้นต้นด้วย = + - @ (หรือ tab/CR ตามด้วยอักขระเหล่านี้)
// โปรแกรมสเปรดชีตจะตีความเป็นสูตรและรันได้ทันทีที่เปิดไฟล์ จึงต้องเติม ' นำหน้าเพื่อบังคับให้เป็นข้อความ
function sanitizeCsvValue(v) {
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function toCSV(docs, brand) {
  const esc = (v) => {
    const s = sanitizeCsvValue(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [...csvHeadLines(brand).map(esc), HEAD.join(',')];
  for (const r of rowsOf(docs)) {
    lines.push([r.docNo, r.type, r.status, r.counterparty, r.date, r.base.toFixed(2), r.tax.toFixed(2), r.total.toFixed(2)].map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\r\n'); // BOM
}

function toXLS(docs, brand) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const b = brand || {};
  const logoCell = b.logo
    ? `<img src="${b.logo}" style="max-height:56px;max-width:200px" alt="">`
    : '';
  const brandMeta = [
    b.taxId ? `เลขประจำตัวผู้เสียภาษี ${esc(b.taxId)}` : '',
    b.branch ? esc(b.branch) : '',
  ].filter(Boolean).join(' &nbsp; ');
  const brandHead = b.name ? `
    <tr><td colspan="${HEAD.length}" style="border:none;padding:10px 6px 2px">
      ${logoCell}
    </td></tr>
    <tr><td colspan="${HEAD.length}" style="border:none;padding:0 6px;font-size:16px;font-weight:bold">${esc(b.name)}</td></tr>
    <tr><td colspan="${HEAD.length}" style="border:none;padding:0 6px;font-size:12px;color:#666">${brandMeta}</td></tr>
    <tr><td colspan="${HEAD.length}" style="border:none;padding:0 6px 2px;font-size:12px;color:#666">${esc(b.address || '')}</td></tr>
    <tr><td colspan="${HEAD.length}" style="border:none;padding:0 6px 12px;font-size:12px;color:#666">รายงานเอกสารภาษี · ออกเมื่อ ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
  ` : '';
  const th = HEAD.map((h) => `<th style="background:#FF6A00;color:#fff;border:1px solid #ccc;padding:6px">${esc(h)}</th>`).join('');
  const body = rowsOf(docs).map((r) =>
    `<tr>
      <td style="border:1px solid #ccc;padding:6px">${esc(sanitizeCsvValue(r.docNo))}</td>
      <td style="border:1px solid #ccc;padding:6px">${esc(r.type)}</td>
      <td style="border:1px solid #ccc;padding:6px">${esc(r.status)}</td>
      <td style="border:1px solid #ccc;padding:6px">${esc(sanitizeCsvValue(r.counterparty))}</td>
      <td style="border:1px solid #ccc;padding:6px">${esc(r.date)}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${r.base.toFixed(2)}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${r.tax.toFixed(2)}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${r.total.toFixed(2)}</td>
    </tr>`).join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head><meta charset="UTF-8"></head>
  <body><table border="1" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
  <thead>${brandHead}<tr>${th}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

/* ---------- เอกสารฉบับเดียว: หัวเอกสาร + รายการสินค้า/บริการ + ยอดสรุป ---------- */
const ITEM_HEAD = ['ลำดับ', 'รายการ', 'จำนวน', 'หน่วย', 'ราคาต่อหน่วย', 'ส่วนลด', 'จำนวนเงิน'];
const num = (v) => Number(v || 0);

function docSheet(doc) {
  const p = doc.partyInfo || {};
  const isWht = ['WHT', 'EWHT', 'PAYMENT', 'PND3', 'PND53'].includes(doc.type);
  const info = [
    ['ประเภทเอกสาร', TYPE_LABEL[doc.type] || doc.type],
    ['เลขที่เอกสาร', doc.docNo || 'แบบร่าง'],
    ['วันที่', doc.docDate || doc.issueDate || (doc.createdAt || '').slice(0, 10)],
    ['สถานะ', STATUS_LABEL[doc.status] || doc.status || ''],
    ['คู่ค้า/ลูกค้า', p.name || doc.party || ''],
    ['เลขประจำตัวผู้เสียภาษีคู่ค้า', p.taxId || doc.partyTaxId || ''],
    ['ที่อยู่คู่ค้า', p.address || doc.partyAddress || ''],
  ];
  const items = (Array.isArray(doc.items) ? doc.items : []).map((it, i) => {
    const qty = num(it.qty || 1);
    const price = num(it.price ?? it.amount);
    const discount = num(it.discount);
    return [i + 1, it.name || it.desc || '', qty, it.unit || '', price, discount, qty * price - discount];
  });
  const totals = [
    ['รวมเป็นเงิน', num(doc.subtotal || doc.base)],
    ...(num(doc.lineDiscount) + num(doc.billDiscount) ? [['ส่วนลด', num(doc.lineDiscount) + num(doc.billDiscount)]] : []),
    ['ฐานภาษี', num(doc.base)],
    ...(num(doc.vat) ? [[`ภาษีมูลค่าเพิ่ม ${num(doc.vatRate)}%`, num(doc.vat)]] : []),
    ['ยอดรวม', num(doc.total || doc.base)],
    ...(num(doc.wht) ? [[`หักภาษี ณ ที่จ่าย ${num(doc.whtRate)}%`, num(doc.wht)], [isWht ? 'จำนวนเงินสุทธิ' : 'ยอดชำระสุทธิ', num(doc.net)]] : []),
  ];
  return { info, items, totals };
}

function docToCSV(doc, brand) {
  const esc = (v) => {
    const s = sanitizeCsvValue(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const { info, items, totals } = docSheet(doc);
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : v);
  const lines = [
    ...(brand && brand.name ? [brand.name, ''] : []),
    ...info.map((r) => r.map(esc).join(',')),
    '',
    ITEM_HEAD.join(','),
    ...items.map((r) => r.map((v, i) => esc(i === 0 || i === 2 ? v : fmt(v))).join(',')),
    '',
    ...totals.map(([k, v]) => [',,,,', esc(k), esc(v.toFixed(2))].join(',')),
  ];
  return '﻿' + lines.join('\r\n');
}

function docToXLS(doc, brand) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const { info, items, totals } = docSheet(doc);
  const cols = ITEM_HEAD.length;
  const cell = 'border:1px solid #ccc;padding:6px';
  const money = (v) => `<td style="${cell};text-align:right;mso-number-format:'\\#\\,\\#\\#0\\.00'">${num(v).toFixed(2)}</td>`;
  const b = brand || {};
  const head = `
    ${b.logo ? `<tr><td colspan="${cols}" style="border:none;padding:10px 6px 2px"><img src="${b.logo}" style="max-height:56px;max-width:200px" alt=""></td></tr>` : ''}
    ${b.name ? `<tr><td colspan="${cols}" style="border:none;padding:0 6px;font-size:16px;font-weight:bold">${esc(b.name)}</td></tr>` : ''}
    ${b.taxId ? `<tr><td colspan="${cols}" style="border:none;padding:0 6px 10px;font-size:12px;color:#666">เลขประจำตัวผู้เสียภาษี ${esc(b.taxId)} ${esc(b.branch || '')}</td></tr>` : ''}
    <tr><td colspan="${cols}" style="border:none;padding:6px;font-size:18px;font-weight:bold;color:#E85A00">${esc(info[0][1])}</td></tr>
    ${info.slice(1).map(([k, v]) => `<tr><td colspan="2" style="${cell};background:#FFF4EC;font-weight:bold">${esc(k)}</td><td colspan="${cols - 2}" style="${cell}">${esc(sanitizeCsvValue(v))}</td></tr>`).join('')}
    <tr><td colspan="${cols}" style="border:none">&nbsp;</td></tr>
    <tr>${ITEM_HEAD.map((h) => `<th style="background:#FF6A00;color:#fff;${cell}">${esc(h)}</th>`).join('')}</tr>`;
  const body = items.map((r) => `<tr>
      <td style="${cell};text-align:center">${r[0]}</td>
      <td style="${cell}">${esc(sanitizeCsvValue(r[1]))}</td>
      <td style="${cell};text-align:right">${r[2]}</td>
      <td style="${cell}">${esc(r[3])}</td>
      ${money(r[4])}${money(r[5])}${money(r[6])}
    </tr>`).join('');
  const foot = totals.map(([k, v], i) => `<tr><td colspan="${cols - 2}" style="border:none"></td>
      <td style="${cell};font-weight:bold${i === totals.length - 1 ? ';background:#FFF4EC' : ''}">${esc(k)}</td>${money(v)}</tr>`).join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head><meta charset="UTF-8"></head>
  <body><table style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
  <thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></body></html>`;
}

/* ---------- คู่ค้า: ส่งออก/นำเข้า CSV (ver16: เพิ่มข้อมูลกลางของ Brand / Agency / Influencer) ---------- */
const CONTACT_KIND_LABEL = { brand: 'Brand/ลูกค้า', agency: 'Agency', influencer: 'Influencer', other: 'อื่น ๆ', buyer: 'Brand/ลูกค้า', payee: 'Influencer', payer: 'Agency' };
const CONTACT_KIND_REVERSE = {
  'brand/ลูกค้า': 'brand', brand: 'brand', 'ลูกค้า': 'brand', 'ลูกค้า/ผู้ซื้อ': 'brand', 'ผู้ซื้อ': 'brand', buyer: 'brand',
  agency: 'agency', 'เอเจนซี่': 'agency', 'ผู้จ่ายเงิน': 'agency', payer: 'agency',
  influencer: 'influencer', 'อินฟลูเอนเซอร์': 'influencer', 'ผู้รับเงิน': 'influencer', payee: 'influencer',
  'อื่น ๆ': 'other', other: 'other',
};
const CONTACT_COLS = [
  ['name', 'ชื่อ'], ['kind', 'ประเภท'], ['entityType', 'บุคคล/นิติบุคคล'], ['taxId', 'เลขผู้เสียภาษี'], ['branch', 'สาขา'],
  ['tradeName', 'ชื่อทางการค้า'], ['channelName', 'ชื่อช่อง'], ['contactPerson', 'ผู้ติดต่อ'], ['email', 'อีเมล'], ['phone', 'โทรศัพท์'],
  ['address', 'ที่อยู่'], ['authName', 'ผู้มีอำนาจลงนาม'], ['authPosition', 'ตำแหน่ง'],
  ['bankName', 'ธนาคาร'], ['bankAccountNo', 'เลขบัญชี'], ['bankAccountName', 'ชื่อบัญชี'], ['socials', 'Social Media'], ['note', 'หมายเหตุ'],
];
const CONTACT_HEAD = CONTACT_COLS.map((c) => c[1]);

function toContactsCSV(contacts) {
  const esc = (v) => {
    const s = sanitizeCsvValue(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [CONTACT_HEAD.join(',')];
  for (const c of contacts) {
    lines.push(CONTACT_COLS.map(([k]) => {
      if (k === 'kind') return CONTACT_KIND_LABEL[c.kind] || c.kind || '';
      if (k === 'entityType') return c.entityType === 'juristic' ? 'นิติบุคคล' : c.entityType === 'individual' ? 'บุคคลธรรมดา' : '';
      if (k === 'bankAccountNo') return c.bankAccountNo || c.bank || '';
      return c[k] || '';
    }).map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

// ตัวแยก CSV อย่างง่าย รองรับ field ที่ครอบด้วย "..." และมี comma/newline อยู่ข้างในได้
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* ข้าม \n เป็นตัวตัดแถวจริง */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/**
 * แปลงข้อความ CSV เป็นรายการคู่ค้า รองรับหัวตารางภาษาไทยที่ toContactsCSV() ส่งออก (ทั้งแบบใหม่และแบบเดิม 8 คอลัมน์)
 * และไฟล์ที่ไม่มีหัวตาราง (ตีความตามลำดับคอลัมน์ 8 คอลัมน์แบบเดิม)
 * คืนค่าเฉพาะ field ดิบ ไม่ validate เลขผู้เสียภาษี ผู้เรียก (server.js) เป็นคนตรวจอีกชั้น
 */
function parseContactsCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('ชื่อ') || header.includes('name');
  const cols = {};
  if (hasHeader) {
    for (const [k, th] of CONTACT_COLS) cols[k] = header.findIndex((h) => h === th.toLowerCase() || h === k.toLowerCase());
    if (cols.taxId === -1) cols.taxId = header.findIndex((h) => h === 'taxid' || h === 'tax id');
    const legacyBank = header.indexOf('บัญชีธนาคาร');
    cols.bank = legacyBank;
  } else {
    Object.assign(cols, { name: 0, kind: 1, taxId: 2, email: 3, phone: 4, address: 5, bank: 6, note: 7 });
  }
  const get = (r, i) => (i >= 0 && i < r.length ? String(r[i] || '').trim() : '');
  const out = [];
  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
    const r = rows[i];
    const name = get(r, cols.name);
    if (!name) continue;
    const row = { name };
    for (const [k] of CONTACT_COLS) if (k !== 'name' && cols[k] !== undefined) row[k] = get(r, cols[k]);
    const kindRaw = get(r, cols.kind);
    row.kind = CONTACT_KIND_REVERSE[kindRaw.toLowerCase()] || CONTACT_KIND_REVERSE[kindRaw] || 'brand';
    row.entityType = /นิติ/.test(row.entityType || '') ? 'juristic' : /บุคคล/.test(row.entityType || '') ? 'individual' : '';
    row.taxId = (row.taxId || '').replace(/\D/g, '');
    if (cols.bank !== undefined && cols.bank >= 0) row.bank = get(r, cols.bank);
    Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });
    out.push(row);
  }
  return out;
}

module.exports = { toCSV, toXLS, docToCSV, docToXLS, toContactsCSV, parseContactsCSV };
