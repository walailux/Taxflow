'use strict';

/**
 * docprint.js แม่แบบพิมพ์เอกสาร A4 (ver16) สำหรับเอกสารที่สร้างด้วยแบบฟอร์มใหม่ (schemaVersion 2)
 * -------------------------------------------------------------
 * จัดวางตามรูปแบบเอกสารที่ใช้งานจริง:
 * ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จรับเงิน / ใบสั่งซื้อ หัวเอกสาร + แถบชื่อเอกสาร + ข้อมูลลูกค้า/เลขที่ + ตารางรายการ + สรุปยอด + ตัวอักษร + ลงนาม
 * ใบสำคัญจ่าย จ่ายให้แก่ / วิธีจ่าย / ตารางเอกสาร / หัก ณ ที่จ่าย / คงเหลือสุทธิ / ผู้จ่าย-ผู้ตรวจสอบ-ผู้อนุมัติ-ผู้รับเงิน
 * สัญญา ชื่อสัญญากลางหน้า ทำที่/วันที่ คู่สัญญา และข้อสัญญาเรียงข้อ
 * 50 ทวิ / ภ.ง.ด.3 / ภ.ง.ด.53 จัดตามโครงของแบบกรมสรรพากร (ใช้เป็นข้อมูลประกอบการยื่น ไม่ใช่แบบที่ยื่นแทน)
 */

const DS = require('./docschema.js');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nl = (s) => esc(s).replace(/\n/g, '<br>');
const money = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SAFE_IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const img = (v) => (typeof v === 'string' && SAFE_IMG.test(v) ? v : '');
const td = (iso) => DS.thaiDate(iso) || '-';
const docNo = (doc) => doc.docNo || 'ฉบับร่าง';
let _bahtText = null;
const bahtText = (n) => { if (!_bahtText) _bahtText = require('./docview').bahtText; return _bahtText(n); };
const optLabel = (opts, v) => { const o = (opts || []).find((x) => String(x.value) === String(v)); return o ? o.label : ''; };
const cb = (on, label) => `<span class="cbx"><i class="${on ? 'on' : ''}">${on ? '✓' : ''}</i>${label ? esc(label) : ''}</span>`;
const digitBoxes = (s, n = 13, groups = [1, 4, 5, 2, 1]) => {
  const d = String(s || '').replace(/\D/g, '').padEnd(n, ' ').slice(0, n).split('');
  let i = 0;
  return `<span class="digits">${groups.map((g) => `<span class="dg">${Array.from({ length: g }).map(() => `<b>${esc(d[i++].trim())}</b>`).join('')}</span>`).join('<em>-</em>')}</span>`;
};

const CSS = `
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun',sans-serif;color:#1b1f2a;font-size:12.5px;line-height:1.55;background:#e9ecf1}
.toolbar{max-width:210mm;margin:14px auto;display:flex;gap:10px;justify-content:flex-end}
.toolbar button{font-family:inherit;font-size:14px;font-weight:600;padding:9px 18px;border-radius:8px;border:1px solid #cfd5df;background:#fff;cursor:pointer}
.toolbar .pri{background:#1F3F77;color:#fff;border-color:#1F3F77}
.sheet{background:#fff;width:210mm;min-height:297mm;margin:0 auto 18px;padding:14mm 14mm 12mm;position:relative;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);display:flex;flex-direction:column}
.grow{flex:1}
:root{--navy:#1F3F77;--navy-soft:#E8EEF7;--line:#C9D1DE}
.navy{color:var(--navy)}
.muted{color:#6b7280}
.small{font-size:11px}
.r{text-align:right}.c{text-align:center}
b,strong{font-weight:700}
/* หัวเอกสารธุรกิจ */
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.hd .en{font-size:34px;font-weight:800;color:var(--navy);letter-spacing:.5px;line-height:1.05}
.hd .logo{width:34mm;height:22mm;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:11px;color:#8a93a3;text-align:center;padding:4px}
.hd .logo img{max-width:100%;max-height:100%;object-fit:contain}
.band{background:var(--navy);color:#fff;font-size:16px;font-weight:600;padding:3px 12px;margin:8px -14mm 12px;padding-left:14mm;display:flex;justify-content:space-between;padding-right:14mm}
.band small{font-size:11px;font-weight:400;opacity:.85}
.info{display:grid;grid-template-columns:1.55fr 1fr;gap:18px;margin-bottom:10px}
.kvt{width:100%;border-collapse:collapse}
.kvt td{padding:1.5px 0;vertical-align:top;font-size:12px}
.kvt td.k{width:30%;color:#374151;white-space:nowrap;padding-right:8px}
.meta td.k{width:48%}
.blk-t{font-weight:700;font-size:13px;margin-bottom:3px}
.issuer{font-size:11.5px;color:#374151;margin-bottom:8px;line-height:1.5}
.issuer b{font-size:13px;color:#111}
table.items{width:100%;border-collapse:collapse;margin-top:4px}
table.items th{font-size:12px;font-weight:700;padding:6px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#F6F8FB}
table.items td{font-size:12px;padding:5px 6px;vertical-align:top;border-bottom:1px dotted #E1E6EE}
table.items tr.fill td{border-bottom:none;height:14px}
.sum-wrap{display:grid;grid-template-columns:1.3fr 1fr;gap:18px;border-top:1px solid var(--line);margin-top:6px;padding-top:8px}
.sum td{padding:2px 0;font-size:12.5px}
.sum td.v{text-align:right;font-weight:600}
.grand{border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-top:6px;padding:6px 0;text-align:right}
.grand .t{font-size:17px;font-weight:800}
.grand .t span{margin-left:22px}
.grand .w{font-size:12px}
.terms{font-size:12px;line-height:1.6}
.terms .tt{font-weight:700}
.pay-box{border:1px solid var(--line);border-radius:6px;padding:7px 10px;margin-top:6px;font-size:12px;background:#FAFBFD}
.cbx{display:inline-flex;align-items:center;gap:5px;margin-right:14px;white-space:nowrap}
.cbx i{display:inline-flex;width:13px;height:13px;border:1.3px solid #2b3445;align-items:center;justify-content:center;font-style:normal;font-size:10px;line-height:1;font-weight:700}
.signs{display:grid;gap:18px;margin-top:18px}
.sg{text-align:center;font-size:12px;position:relative}
.sg .area{height:48px;display:flex;align-items:flex-end;justify-content:center}
.sg .area img{max-height:46px;max-width:80%}
.sg .ln{border-top:1px solid #55606f;margin:2px 8% 3px}
.sg .role{font-weight:600}
.sg .dt{font-size:10.5px;color:#6b7280}
.sg .ok{font-size:10px;color:#1E8E5A;font-weight:600}
.sg .seal{position:absolute;right:2%;top:-6px;max-height:64px;max-width:80px;opacity:.9}
.foot{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-top:10px;padding-top:6px;border-top:3px solid var(--navy)}
.foot .fn{font-size:9.5px;color:#8a93a3;line-height:1.4}
.foot .qr{display:flex;align-items:center;gap:6px;font-size:9.5px;color:#6b7280;text-align:right}
.foot .qr svg{width:58px;height:58px}
/* ใบสำคัญจ่าย */
.pv-title{font-size:20px;font-weight:700;text-align:center}
.pv-sub{color:#2c6cb0;font-size:15px;line-height:1.3}
.pv-sub u{font-size:13px}
.uline{border-bottom:1px solid #55606f;display:inline-block;min-width:120px;padding:0 6px}
table.grid{width:100%;border-collapse:collapse;margin-top:8px}
table.grid th,table.grid td{border:1px solid #9aa4b3;padding:5px 6px;font-size:12px;vertical-align:top}
table.grid th{background:#F3F5F9;font-weight:700;text-align:center}
.red{color:#C62828}
/* สัญญา */
.ct-title{text-align:center;font-size:19px;font-weight:700;margin:4px 0 6px}
.ct-sub{text-align:center;font-size:12px;color:#6b7280;margin-bottom:6px}
.ct-place{text-align:right;line-height:1.9;margin-bottom:10px}
.ct p,.ct .cl{font-size:13px;line-height:1.85;text-indent:0;margin-bottom:4px}
.ct .cl h4{font-size:13.5px;font-weight:700;margin-top:8px}
.ct .cl .body{padding-left:18px}
.ct table.grid td,.ct table.grid th{font-size:12px}
.ind{text-indent:36px}
/* แบบกรมสรรพากร */
.rd{border:1.3px solid #33415c;border-radius:4px}
.rd-head{display:flex;gap:10px;align-items:stretch}
.rd-head .t{flex:1;background:#DDE3EE;border-radius:14px;padding:6px 10px;text-align:center;line-height:1.35}
.rd-head .t b{font-size:14.5px}
.rd-head .f{border:2px solid #33415c;border-radius:10px;min-width:40mm;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#1b2742}
.digits{display:inline-flex;align-items:center;gap:1px;vertical-align:middle}
.digits .dg{display:inline-flex}
.digits .dg b{display:inline-block;width:15px;height:18px;border:1px solid #33415c;margin-left:-1px;text-align:center;font-weight:600;font-size:12px;line-height:17px}
.digits em{font-style:normal;padding:0 1px}
.frow{padding:5px 8px;border-bottom:1px solid #9aa4b3;font-size:12px}
.frow:last-child{border-bottom:none}
.dots{border-bottom:1px dotted #33415c;display:inline-block;min-width:60px;padding:0 4px}
.w50 table.grid td{font-size:11.5px}
.copy-tag{position:absolute;right:14mm;top:8mm;font-size:10.5px;text-align:right;color:#374151}
.months{display:grid;grid-template-columns:repeat(4,1fr);gap:4px 6px;font-size:11.5px}
.seal-circle{width:62px;height:62px;border:1px dashed #33415c;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;text-align:center;font-size:9px;line-height:1.2}
.sum-rd td{padding:4px 6px;font-size:12.5px}
.sum-rd td.v{border:1px solid #33415c;width:42mm;text-align:right;font-weight:600}
.wm-cancel,.wm-draft{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:50;transform:rotate(-22deg);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wm-cancel b,.wm-draft b{font-size:86px;font-weight:800;border:6px solid;border-radius:18px;padding:6px 34px;letter-spacing:.08em;white-space:nowrap}
.wm-cancel small,.wm-draft small{margin-top:14px;font-size:15px;font-weight:700;background:rgba(255,255,255,.6);padding:4px 14px;border-radius:8px}
.wm-cancel b{color:rgba(214,40,40,.22);border-color:rgba(214,40,40,.22)}
.wm-cancel small{color:rgba(214,40,40,.45)}
.wm-draft b{color:rgba(180,83,9,.2);border-color:rgba(180,83,9,.2)}
.wm-draft small{color:rgba(180,83,9,.5)}
.draft-strip{background:#FFF6E0;border:1px solid #F1D48A;color:#7A5B00;border-radius:6px;padding:4px 10px;font-size:11px;text-align:center;margin-bottom:8px}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{body{background:#fff}.toolbar{display:none}.sheet{box-shadow:none;margin:0;page-break-after:always}.sheet:last-child{page-break-after:auto}}
`;

function page(sheets, title) {
  return `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="toolbar"><button onclick="window.close()">ปิด</button><button class="pri" onclick="window.print()">บันทึกเป็น PDF / พิมพ์</button></div>
${sheets.join('\n')}
<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),500)});</script>
</body></html>`;
}

/* ---------- ส่วนประกอบร่วม ---------- */
function issuerOf(doc, user) { return doc.issuer || { name: user.companyName || user.displayName, taxId: user.taxId, address: user.address, bank: user.bank || {} }; }

function sigBlock(sObj, role, name, opts = {}) {
  const seal = opts.seal ? `<img class="seal" src="${img(opts.seal)}" alt="">` : '';
  if (sObj) {
    return `<div class="sg">${seal}<div class="area">${sObj.image ? `<img src="${img(sObj.image)}" alt="ลายเซ็น">` : ''}</div>
      <div class="ln"></div><div>(${esc(sObj.signerName || name || '')})</div><div class="role">${esc(role)}</div>
      ${opts.position ? `<div class="dt">${esc(opts.position)}</div>` : ''}
      <div class="ok">✓ ลงนามอิเล็กทรอนิกส์ ${esc(new Date(sObj.signedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }))}</div></div>`;
  }
  return `<div class="sg">${seal}<div class="area"></div><div class="ln"></div>
    <div>(${name ? esc(name) : '&nbsp;'.repeat(40)})</div><div class="role">${esc(role)}</div>
    ${opts.position ? `<div class="dt">${esc(opts.position)}</div>` : ''}
    <div class="dt">วันที่ ${opts.date ? esc(td(opts.date)) : '........./........./.........'}</div></div>`;
}

function footer(doc, ctx, extra = '') {
  const qr = ''; // ver18: ไม่แสดง QR ตรวจสอบเอกสารในเอกสารที่พิมพ์แล้ว
  return `<div class="foot"><div class="fn">${extra}เอกสารจัดทำโดยระบบ TaxFlow (ระบบต้นแบบเพื่อการศึกษา) · ลายมือชื่ออิเล็กทรอนิกส์ในระบบเป็นการจำลองกระบวนการลงนาม
    ${ctx.attachments && ctx.attachments.length ? `<br>เอกสารแนบ: ${ctx.attachments.map((a) => esc(a.filename)).join(', ')}` : ''}</div>${qr}</div>`;
}

/**
 * สถานะที่ห้ามนำไปใช้อ้างอิง บอกด้วยลายน้ำเฉียงคาดกลางหน้าอย่างเดียว ไม่มีแถบที่หัวกระดาษ
 * (แถบเดิมเบียดหัวเอกสารและถูกตัดทิ้งได้ง่ายเวลาถ่ายเอกสาร ลายน้ำคาดทับเนื้อหาจึงตัดไม่ได้)
 */
function statusStrip(doc) {
  if (doc.status === 'cancelled') {
    const at = esc(new Date(doc.cancelledAt || doc.updatedAt || Date.now()).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }));
    return `<div class="wm-cancel"><b>ยกเลิกแล้ว</b><small>ยกเลิกเมื่อ ${at}${doc.cancelReason ? ' · เหตุผล: ' + esc(doc.cancelReason) : ''} · ใช้อ้างอิงทางกฎหมายไม่ได้</small></div>`;
  }
  if (!doc.docNo) {
    return '<div class="wm-draft"><b>ฉบับร่าง</b><small>ยังไม่ออกเลขที่เอกสาร ห้ามนำไปใช้อ้างอิง</small></div>';
  }
  return '';
}

function logoBox(ctx, iss) {
  const l = ctx.brand && img(ctx.brand.logo);
  return `<div class="logo">${l ? `<img src="${l}" alt="โลโก้">` : esc(iss.tradeName || iss.name || 'LOGO')}</div>`;
}
function issuerLines(iss, title) {
  return `<div class="issuer">${title ? `<span class="muted small">${esc(title)}</span><br>` : ''}<b>${esc(iss.name)}</b>${iss.tradeName ? ` <span class="muted">(${esc(iss.tradeName)})</span>` : ''}<br>
    ${esc(iss.address || '')}<br>
    เลขประจำตัวผู้เสียภาษี ${esc(iss.taxId || '-')}${iss.branch ? ' · ' + esc(iss.branch) : ''}
    ${iss.phone || iss.email ? `<br>${esc([iss.phone && 'โทร ' + iss.phone, iss.email].filter(Boolean).join(' · '))}` : ''}</div>`;
}
function partyTable(p, keys, labels = {}) {
  const L = (k) => labels[k] || DS.PARTY_FIELDS[k].label;
  const rows = keys.filter((k) => p[k] && k !== 'entityType').map((k) => `<tr><td class="k">${esc(L(k))}</td><td>${nl(p[k])}</td></tr>`);
  return `<table class="kvt">${rows.join('')}</table>`;
}

/* =========================================================
 * 1) ใบเสนอราคา / ใบสั่งซื้อ / ใบแจ้งหนี้ / ใบเสร็จรับเงิน
 * ========================================================= */
const COMMERCIAL = {
  QUOTATION: { en: 'Quotation', th: 'ใบเสนอราคา', noLabel: 'เลขที่ใบเสนอราคา', partyShort: 'ชื่อลูกค้า',
    meta: (F) => [['วันที่', td(F.issueDate)], ['ยืนราคาถึงวันที่', td(F.validUntil)], ['เลขที่อ้างอิง', F.refNo]],
    signs: [['cp', 'ผู้อนุมัติ / ลูกค้า'], ['me', 'ผู้เสนอราคา']] },
  PO: { en: 'Purchase Order', th: 'ใบสั่งซื้อ', noLabel: 'เลขที่ใบสั่งซื้อ', partyShort: 'ผู้ขาย',
    meta: (F) => [['วันที่', td(F.issueDate)], ['วันที่ต้องการส่งมอบ', td(F.deliveryDate)], ['อ้างอิงใบเสนอราคา', F.quotationRef]],
    signs: [['me', 'ผู้สั่งซื้อ / ผู้อนุมัติ'], ['cp', 'ผู้ขายรับทราบ']] },
  INVOICE: { en: 'Invoice', th: 'ใบแจ้งหนี้ / ใบวางบิล', noLabel: 'เลขที่ใบแจ้งหนี้', partyShort: 'ชื่อลูกค้า',
    meta: (F) => [['วันที่', td(F.issueDate)], ['ครบกำหนดชำระ', td(F.dueDate)], ['อ้างอิง PO', F.poRef], ['อ้างอิงใบเสนอราคา', F.quotationRef], ['อ้างอิงสัญญา', F.contractRef]],
    signs: [['cp', 'ผู้รับวางบิล'], ['me', 'ผู้วางบิล']] },
  RECEIPT: { en: 'Receipt', th: 'ใบเสร็จรับเงิน', noLabel: 'เลขที่ใบเสร็จ', partyShort: 'ได้รับเงินจาก',
    meta: (F) => [['วันที่รับเงิน', td(F.receiveDate)], ['อ้างอิงใบแจ้งหนี้', F.invoiceRef]],
    signs: [['cp', 'ผู้จ่ายเงิน'], ['me', 'ผู้รับเงิน']] },
  // WP5: หน้าพิมพ์ HTML ของเอกสาร e-Tax ใช้เป็นทางถอยเมื่อสร้าง PDF/A-3 ไม่ได้ และเมื่อขอ ?format=html
  ETAX_INVOICE: { en: 'Tax Invoice', th: 'ใบกำกับภาษี', noLabel: 'เลขที่ใบกำกับภาษี', partyShort: 'ชื่อผู้ซื้อ',
    meta: (F) => [['วันที่', td(F.issueDate)], ['เล่มที่', F.volumeNo], ['อ้างอิงใบแจ้งหนี้', F.invoiceRef], ['อ้างอิง PO', F.poRef]],
    signs: [['cp', 'ผู้ซื้อ / ผู้รับสินค้า'], ['me', 'ผู้ขาย / ผู้ออกใบกำกับภาษี']] },
  ETAX_RECEIPT: { en: 'Receipt', th: 'ใบรับ', noLabel: 'เลขที่ใบรับ', partyShort: 'ได้รับเงินจาก',
    meta: (F) => [['วันที่รับเงิน', td(F.receiveDate)], ['อ้างอิงใบกำกับภาษี', F.taxInvoiceRef]],
    signs: [['cp', 'ผู้จ่ายเงิน'], ['me', 'ผู้รับเงิน']] },
};

function renderCommercial(doc, user, ctx) {
  const C = COMMERCIAL[doc.type];
  const def = DS.FORMS[doc.type];
  const F = doc.fields || {};
  const iss = issuerOf(doc, user);
  const p = doc.partyInfo || {};
  const cols = def.items.cols;
  const HEAD = { name: 'รายการ', qty: 'จำนวน', unit: 'หน่วย', price: 'ราคา/หน่วย', discount: 'ส่วนลด', amount: 'จำนวนเงิน' };
  const rowsHtml = (doc.items || []).map((it, i) => {
    const amt = def.mode === 'amount' ? Number(it.amount) : Number(it.qty) * Number(it.price) - (Number(it.discount) || 0);
    return `<tr><td class="c">${i + 1}</td>${cols.filter((c) => c !== 'amount').map((c) => {
      if (c === 'name') return `<td>${nl(it.name)}</td>`;
      if (c === 'unit') return `<td class="c">${esc(it.unit)}</td>`;
      if (c === 'qty') return `<td class="r">${esc((Number(it.qty) || 0).toLocaleString('th-TH'))}</td>`;
      return `<td class="r">${Number(it[c]) ? money(it[c]) : '-'}</td>`;
    }).join('')}<td class="r">${money(amt)}</td></tr>`;
  });
  const minRows = 8;
  for (let i = rowsHtml.length; i < minRows; i++) rowsHtml.push(`<tr class="fill"><td colspan="${cols.length + 1}"></td></tr>`);
  const th = `<th style="width:40px">ลำดับ</th>${cols.filter((c) => c !== 'amount').map((c) => `<th${c === 'name' ? '' : ' style="width:' + (c === 'unit' ? 52 : c === 'qty' ? 56 : 88) + 'px"'}>${HEAD[c]}</th>`).join('')}<th style="width:98px">จำนวนเงิน</th>`;

  const disc = (doc.lineDiscount || 0) + (doc.billDiscount || 0);
  const sumRows = [
    ['รวมเป็นเงิน', money(doc.subtotal)],
    disc ? [F.billDiscountNote && doc.billDiscount ? `ส่วนลด (${esc(F.billDiscountNote)})` : 'ส่วนลด', money(disc)] : null,
    disc ? ['ยอดหลังหักส่วนลด', money(doc.base)] : null,
    doc.vat ? [`ภาษีมูลค่าเพิ่ม ${doc.vatRate}%`, money(doc.vat)] : null,
  ].filter(Boolean);

  const terms = [];
  if (F.paymentTerms) terms.push(['เงื่อนไขการชำระเงิน', F.paymentTerms]);
  if (F.workPeriod) terms.push(['ระยะเวลาดำเนินงาน', F.workPeriod]);
  if (F.deliveryTerms) terms.push(['เงื่อนไขการส่งมอบ', F.deliveryTerms]);
  if (F.note) terms.push(['หมายเหตุ', F.note]);
  let payBlock = '';
  if (doc.type === 'INVOICE') {
    payBlock = `<div class="pay-box"><b>ชำระเงินภายในวันที่ ${esc(td(F.dueDate))}</b><br>
      โอนเข้าบัญชี ${esc(F.bankName)} · ชื่อบัญชี ${esc(F.bankAccountName)} · เลขที่บัญชี <b>${esc(F.bankAccountNo)}</b></div>`;
  }
  if (doc.type === 'RECEIPT' || doc.type === 'ETAX_RECEIPT') {
    const m = F.payMethod;
    payBlock = `<div class="pay-box"><div style="margin-bottom:3px"><b>ชำระโดย</b>&nbsp; ${cb(m === 'cash', 'เงินสด')}${cb(m === 'transfer', 'โอนเงิน')}${cb(m === 'cheque', 'เช็ค')}${cb(m === 'other', 'อื่น ๆ' + (m === 'other' && F.payMethodOther ? ' ' + F.payMethodOther : ''))}</div>
      วันที่ชำระ ${esc(td(F.payDate))}${F.payBank ? ` · ธนาคาร ${esc(F.payBank)}` : ''}${F.transferRef ? ` · เลขอ้างอิง ${esc(F.transferRef)}` : ''}</div>`;
  }
  const party = partyTable(p, def.party.keys, { name: C.partyShort, ...(def.party.labels || {}) });
  const metaRows = [[C.noLabel, `<b>${esc(docNo(doc))}</b>`], ...C.meta(F).filter((x) => x[1] && x[1] !== '-').map(([k, v]) => [k, esc(v)])];
  const signers = C.signs.map(([who, role]) => who === 'me'
    ? sigBlock(doc.signature, role, iss.authName || iss.name, { seal: ctx.brand && ctx.brand.seal, position: iss.authPosition ? `${iss.authPosition} · ${iss.name}` : iss.name })
    : sigBlock(doc.counterpartySignature, role, p.contactPerson || p.name, { position: p.name }));

  const sheet = `<div class="sheet">${statusStrip(doc)}
    <div class="hd"><div><div class="en">${esc(C.en)}</div></div>${logoBox(ctx, iss)}</div>
    <div class="band"><span>${esc(C.th)}</span><small>ต้นฉบับ (Original)</small></div>
    <div class="info">
      <div>${issuerLines(iss, def.issuerTitle)}<div class="blk-t">${esc(def.party.title)}</div>${party}</div>
      <div><table class="kvt meta">${metaRows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${v}</td></tr>`).join('')}</table></div>
    </div>
    <table class="items"><thead><tr>${th}</tr></thead><tbody>${rowsHtml.join('')}</tbody></table>
    <div class="sum-wrap">
      <div class="terms">${terms.map(([k, v]) => `<div><span class="tt">${esc(k)}:</span> ${nl(v)}</div>`).join('')}${payBlock}</div>
      <div><table class="sum" style="width:100%">${sumRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="v">${v}</td></tr>`).join('')}</table></div>
    </div>
    <div class="grand"><div class="t">รวมเป็นเงินทั้งสิ้น<span>${money(doc.total)}</span> บาท</div><div class="w">(${esc(bahtText(doc.total))})</div></div>
    <div class="grow"></div>
    <div class="signs" style="grid-template-columns:1fr 1fr">${signers.join('')}</div>
    ${footer(doc, ctx)}
  </div>`;
  return page([sheet], `${C.th} ${docNo(doc)}`);
}

/* =========================================================
 * 2) ใบส่งมอบงาน
 * ========================================================= */
function renderDelivery(doc, user, ctx) {
  const F = doc.fields || {};
  const iss = issuerOf(doc, user);
  const p = doc.partyInfo || {};
  const st = { accepted: 'รับงาน', pending: 'รอตรวจสอบ', revise: 'ขอแก้ไข' };
  const rows = (doc.items || []).map((it, i) => `<tr><td class="c">${i + 1}</td><td>${esc(it.influencer)}</td><td>${esc(it.contentType)}</td><td>${esc(it.platform)}</td>
    <td class="c">${esc(it.pieces || '')}</td><td style="word-break:break-all;font-size:11px">${esc(it.link)}</td><td class="c">${esc(DS.thaiDate(it.publishDate, true))}</td><td class="c">${esc(it.itemStatus)}</td></tr>`).join('');
  const totalPieces = (doc.items || []).reduce((s, it) => s + (Number(it.pieces) || 0), 0);
  const sheet = `<div class="sheet">${statusStrip(doc)}
    <div class="hd"><div><div class="en">Delivery Note</div></div>${logoBox(ctx, iss)}</div>
    <div class="band"><span>ใบส่งมอบงาน</span><small>ต้นฉบับ (Original)</small></div>
    <div class="info">
      <div>${issuerLines(iss, 'ผู้ส่งมอบ')}<div class="blk-t">ผู้รับมอบ</div>${partyTable(p, DS.FORMS.DELIVERY.party.keys)}</div>
      <div><table class="kvt meta">
        <tr><td class="k">เลขที่เอกสาร</td><td><b>${esc(docNo(doc))}</b></td></tr>
        <tr><td class="k">วันที่ส่งมอบ</td><td>${esc(td(F.deliverDate))}</td></tr>
        ${F.contractRef ? `<tr><td class="k">สัญญา / PO</td><td>${esc(F.contractRef)}</td></tr>` : ''}
        <tr><td class="k">Campaign</td><td><b>${esc(F.campaignName)}</b></td></tr>
        ${F.periodStart ? `<tr><td class="k">ระยะเวลาดำเนินงาน</td><td>${esc(td(F.periodStart))}${F.periodEnd ? ' – ' + esc(td(F.periodEnd)) : ''}</td></tr>` : ''}
      </table></div>
    </div>
    <div class="blk-t">รายการที่ส่งมอบ</div>
    <table class="grid"><thead><tr><th style="width:34px">ลำดับ</th><th>Influencer</th><th>ประเภท Content</th><th>แพลตฟอร์ม</th><th style="width:48px">ชิ้นงาน</th><th>ลิงก์ผลงาน</th><th style="width:70px">วันที่เผยแพร่</th><th style="width:70px">สถานะ</th></tr></thead>
      <tbody>${rows}<tr><td colspan="4" class="r"><b>รวมจำนวนชิ้นงาน</b></td><td class="c"><b>${totalPieces}</b></td><td colspan="3"></td></tr></tbody></table>
    <div class="pay-box" style="margin-top:12px">
      <b>การรับมอบ</b>&nbsp; ${cb(F.acceptStatus === 'accepted', 'รับงาน')}${cb(F.acceptStatus === 'pending', 'รอตรวจสอบ')}${cb(F.acceptStatus === 'revise', 'ขอแก้ไข')}
      ${F.acceptDate ? ` · วันที่รับมอบ ${esc(td(F.acceptDate))}` : ''}
      ${F.note ? `<div style="margin-top:3px">หมายเหตุ: ${nl(F.note)}</div>` : ''}
      <div class="small muted" style="margin-top:3px">ผู้รับมอบได้ตรวจสอบรายการข้างต้นแล้ว สถานะการรับมอบ: ${esc(st[F.acceptStatus] || '-')}</div>
    </div>
    <div class="grow"></div>
    <div class="signs" style="grid-template-columns:1fr 1fr">
      ${sigBlock(doc.signature, 'ผู้ส่งมอบ', F.delivererName || iss.authName, { seal: ctx.brand && ctx.brand.seal, position: iss.name, date: F.deliverDate })}
      ${sigBlock(doc.counterpartySignature, 'ผู้รับมอบ', F.receiverName || p.contactPerson, { position: p.name, date: F.acceptDate })}
    </div>
    ${footer(doc, ctx)}</div>`;
  return page([sheet], `ใบส่งมอบงาน ${docNo(doc)}`);
}

/* =========================================================
 * 3) ใบสำคัญจ่าย
 * ========================================================= */
function renderVoucher(doc, user, ctx) {
  const F = doc.fields || {};
  const iss = issuerOf(doc, user);
  const p = doc.partyInfo || {};
  const m = F.payMethod;
  const items = doc.items || [];
  const body = items.map((it) => `<tr><td class="c">${esc(DS.thaiDate(it.docDate, true))}</td><td class="c">${esc(it.docNo)}</td><td>${nl(it.name)}</td><td class="r">${money(it.amount)}</td></tr>`).join('');
  const pad = Array.from({ length: Math.max(0, 6 - items.length) }).map(() => '<tr><td style="height:22px"></td><td></td><td></td><td></td></tr>').join('');
  const whtLabel = F.hasWht ? `หัก ณ ที่จ่าย ${doc.whtRate}%${F.whtCondition && F.whtCondition !== '1' ? ` (${optLabel(DS.WHT_CONDITIONS, F.whtCondition)})` : ''}` : 'หัก ณ ที่จ่าย';
  const sheet = `<div class="sheet">${statusStrip(doc)}
    <div class="pv-title">${esc(iss.name)}</div>
    <div class="c small muted">${esc(iss.address)} · เลขประจำตัวผู้เสียภาษี ${esc(iss.taxId)}${iss.branch ? ' · ' + esc(iss.branch) : ''}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin:10px 0 12px">
      <div class="pv-sub">ใบสำคัญจ่าย<br><u>PAYMENT VOUCHER</u></div>
      <table class="kvt" style="width:44%"><tr><td class="k">เลขที่</td><td><span class="uline"><b>${esc(docNo(doc))}</b></span></td></tr>
      <tr><td class="k">วันที่</td><td><span class="uline">${esc(td(F.payDate))}</span></td></tr></table>
    </div>
    <div style="margin-bottom:6px">จ่ายให้แก่ <span class="uline" style="min-width:45%"><b>${esc(p.name)}</b></span>
      ${p.taxId ? `&nbsp; เลขผู้เสียภาษี <span class="uline">${esc(p.taxId)}</span>` : ''}</div>
    ${p.address ? `<div style="margin-bottom:6px">ที่อยู่ <span class="uline" style="min-width:80%">${esc(p.address)}</span></div>` : ''}
    ${F.campaignName ? `<div style="margin-bottom:6px">Campaign <span class="uline" style="min-width:40%">${esc(F.campaignName)}</span>${F.contractRef ? ` &nbsp; อ้างอิงสัญญา <span class="uline">${esc(F.contractRef)}</span>` : ''}</div>` : ''}
    <div style="margin:8px 0 2px">${cb(m === 'cash', 'เงินสด')}${cb(m === 'transfer', 'โอน')}${cb(m === 'cheque', 'เช็คธนาคาร')}${cb(m === 'other', 'อื่น ๆ')}
      ${F.payBank ? `ธนาคาร <span class="uline">${esc(F.payBank)}</span>` : ''}
      ${F.payBankBranch ? ` สาขา <span class="uline">${esc(F.payBankBranch)}</span>` : ''}
      ${F.chequeNo ? ` เลขที่เช็ค <span class="uline">${esc(F.chequeNo)}</span>` : ''}</div>
    <div style="margin-bottom:4px">
      ${F.chequeDate ? `เช็คลงวันที่ <span class="uline">${esc(td(F.chequeDate))}</span> &nbsp;` : ''}
      ${F.transferRef ? `เลขอ้างอิงการโอน <span class="uline">${esc(F.transferRef)}</span> &nbsp;` : ''}
      ${F.payMethodOther ? `วิธีจ่าย <span class="uline">${esc(F.payMethodOther)}</span> &nbsp;` : ''}
      จำนวนเงิน <span class="uline"><b>${money(doc.net)}</b></span>
      ${p.bankAccountNo ? ` &nbsp; เข้าบัญชีผู้รับ ${esc(p.bankName || '')} <span class="uline">${esc(p.bankAccountNo)}</span>${p.bankAccountName ? ' (' + esc(p.bankAccountName) + ')' : ''}` : ''}</div>
    <table class="grid">
      <thead><tr><th style="width:92px">วันที่เอกสาร</th><th style="width:100px">เลขที่เอกสาร</th><th>รายการ / Description</th><th style="width:120px">จำนวนเงิน</th></tr></thead>
      <tbody>${body}${pad}
        <tr><td class="c">หมายเหตุ:</td><td colspan="2"><span style="float:right">จำนวนเงินรวม</span><span class="small">${nl(F.note)}</span></td><td class="r">${money(doc.base)}</td></tr>
        <tr><td class="c">WHT</td><td colspan="2"><span style="float:right">${esc(whtLabel)}</span><span class="small">${F.hasWht ? esc(F.incomeDesc || '') + (F.incomeCode ? ' (' + esc(DS.INCOME_TYPES.find((t) => t.code === F.incomeCode).short) + ')' : '') : '-'}</span></td><td class="r">${money(doc.wht)}</td></tr>
        <tr><td class="c">จำนวนเงิน</td><td colspan="2"><span style="float:right"><b>คงเหลือสุทธิ</b></span>${esc(bahtText(doc.net))}</td><td class="r red"><b>${money(doc.net)}</b></td></tr>
      </tbody></table>
    ${F.hasWht && F.whtCondition !== '1' ? `<div class="small muted" style="margin-top:4px">ผู้จ่ายเงินออกภาษีแทนผู้รับ เงินได้ที่ต้องแสดงในหนังสือรับรอง ${money(doc.income)} บาท ภาษีที่นำส่ง ${money(doc.wht)} บาท</div>` : ''}
    <div class="grow"></div>
    <div class="signs" style="grid-template-columns:repeat(4,1fr);gap:12px">
      ${sigBlock(null, 'ผู้จัดทำ', F.preparedBy)}
      ${sigBlock(null, 'ผู้อนุมัติ', F.approvedBy)}
      ${sigBlock(doc.signature, 'ผู้จ่ายเงิน', F.paidBy || iss.authName, { seal: ctx.brand && ctx.brand.seal })}
      ${sigBlock(doc.counterpartySignature, 'ผู้รับเงิน', p.name)}
    </div>
    ${footer(doc, ctx, 'เอกสารภายใน ')}</div>`;
  return page([sheet], `ใบสำคัญจ่าย ${docNo(doc)}`);
}

/* =========================================================
 * 4) สัญญา
 * ========================================================= */
function installmentTable(items) {
  if (!items || !items.length) return '';
  return `<table class="grid" style="margin:4px 0 6px"><thead><tr><th style="width:50px">งวดที่</th><th>รายละเอียด / เงื่อนไข</th><th style="width:110px">จำนวนเงิน (บาท)</th><th style="width:110px">วันครบกำหนด</th></tr></thead>
    <tbody>${items.map((it, i) => `<tr><td class="c">${i + 1}</td><td>${nl(it.name)}</td><td class="r">${money(it.amount)}</td><td class="c">${esc(td(it.dueDate))}</td></tr>`).join('')}</tbody></table>`;
}
const stampDuty = (amount) => Math.ceil((Number(amount) || 0) / 1000);

function renderContract(doc, user, ctx) {
  const F = doc.fields || {};
  const iss = issuerOf(doc, user);
  const p = doc.partyInfo || {};
  const isBrand = doc.type === 'CONTRACT_BRAND';
  let n = 0;
  const clause = (title, body) => `<div class="cl"><h4>ข้อ ${++n}. ${esc(title)}</h4><div class="body">${body}</div></div>`;
  const whtTxt = Number(F.whtRate) > 0
    ? `ผู้ว่าจ้างมีหน้าที่หักภาษี ณ ที่จ่ายในอัตราร้อยละ ${esc(F.whtRate)} ของค่าตอบแทนก่อนภาษีมูลค่าเพิ่ม (คิดเป็นเงิน ${money(doc.wht)} บาท) และออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ให้แก่ผู้รับจ้างตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร`
    : 'ค่าตอบแทนตามสัญญานี้ไม่มีการหักภาษี ณ ที่จ่าย';
  const partyIntro = (who, x, label) => who === 'me'
    ? `<b>${esc(x.name)}</b>${x.tradeName ? ` (${esc(x.tradeName)})` : ''} เลขประจำตัวผู้เสียภาษี ${esc(x.taxId || '-')}${x.branch ? ' ' + esc(x.branch) : ''} ตั้งอยู่เลขที่ ${esc(x.address || '-')}
       ${x.entityType === 'juristic' ? `โดย ${esc(F.sign1Name)} ${esc(F.sign1Position || x.authPosition || 'ผู้มีอำนาจลงนาม')} ผู้มีอำนาจลงนามผูกพัน` : ''} ซึ่งต่อไปในสัญญานี้เรียกว่า <b>"${label}"</b>`
    : x;
  let parties, body;
  if (isBrand) {
    parties = `<p class="ind">สัญญาฉบับนี้ทำขึ้นระหว่าง ${partyIntro('me', iss, 'ผู้รับจ้าง')} ฝ่ายหนึ่ง กับ</p>
      <p class="ind"><b>${esc(p.name)}</b> เลขประจำตัวผู้เสียภาษี ${esc(p.taxId || '-')}${p.branch ? ' ' + esc(p.branch) : ''} ตั้งอยู่เลขที่ ${esc(p.address)} โดย ${esc(F.sign2Name || p.authName)} ${esc(F.sign2Position || p.authPosition || '')} ผู้มีอำนาจลงนามผูกพัน ซึ่งต่อไปในสัญญานี้เรียกว่า <b>"ผู้ว่าจ้าง"</b> อีกฝ่ายหนึ่ง</p>
      <p class="ind">คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญากันโดยมีข้อความดังต่อไปนี้</p>`;
    body = [
      clause('วัตถุประสงค์และขอบเขตงาน', `ผู้ว่าจ้างตกลงจ้างและผู้รับจ้างตกลงรับจ้างบริหาร Campaign <b>"${esc(F.campaignName)}"</b><br>
        วัตถุประสงค์: ${nl(F.objective)}<br>ขอบเขตงาน: ${nl(F.scope)}
        ${F.influencerCount ? `<br>จำนวน Influencer ที่ร่วมแคมเปญ: ${esc(F.influencerCount)} ราย` : ''}
        ${F.workPeriod ? `<br>ระยะเวลาดำเนินงาน: ${esc(F.workPeriod)}` : ''}`),
      clause('ระยะเวลาของสัญญา', `สัญญานี้มีผลตั้งแต่วันที่ ${esc(td(F.startDate))} ถึงวันที่ ${esc(td(F.endDate))}`),
      clause('ค่าตอบแทนและการชำระเงิน', `ผู้ว่าจ้างตกลงชำระค่าตอบแทนเป็นเงิน ${money(doc.base)} บาท (${esc(bahtText(doc.base))})
        ${doc.vat ? `บวกภาษีมูลค่าเพิ่มร้อยละ ${doc.vatRate} เป็นเงิน ${money(doc.vat)} บาท รวมเป็นเงินทั้งสิ้น ${money(doc.total)} บาท (${esc(bahtText(doc.total))})` : ''}
        ${doc.items && doc.items.length ? 'โดยแบ่งชำระเป็นงวดดังนี้' : ''}${installmentTable(doc.items)}${whtTxt}`),
      clause('การแก้ไขงาน', nl(F.revisionTerms)),
      clause('การยกเลิกงาน', nl(F.cancelTerms)),
      clause('การรักษาความลับ', nl(F.confidentialTerms)),
      clause('สิทธิในการใช้ Content', nl(F.contentRights)),
      clause('การผิดสัญญา', nl(F.breachTerms)),
    ];
  } else {
    parties = `<p class="ind">สัญญาฉบับนี้ทำขึ้นระหว่าง ${partyIntro('me', iss, 'ผู้ว่าจ้าง')} ฝ่ายหนึ่ง กับ</p>
      <p class="ind"><b>${esc(p.name)}</b>${p.channelName ? ` (ชื่อช่อง "${esc(p.channelName)}")` : ''} เลขประจำตัวผู้เสียภาษี/เลขประจำตัวประชาชน ${esc(p.taxId)} อยู่บ้านเลขที่ ${esc(p.address)}
      ${p.phone ? `โทรศัพท์ ${esc(p.phone)}` : ''}${p.email ? ` อีเมล ${esc(p.email)}` : ''} ซึ่งต่อไปในสัญญานี้เรียกว่า <b>"ผู้รับจ้าง"</b> อีกฝ่ายหนึ่ง</p>
      ${p.socials ? `<p class="ind small">ช่องทาง Social Media ของผู้รับจ้าง: ${nl(p.socials)}</p>` : ''}
      <p class="ind">คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญาจ้างกันโดยมีข้อความดังต่อไปนี้</p>`;
    const plats = (F.platforms || []).join(', ');
    body = [
      clause('รายละเอียดงาน', `ผู้ว่าจ้างตกลงจ้างและผู้รับจ้างตกลงรับจ้างผลิตและเผยแพร่ Content สำหรับ Campaign <b>"${esc(F.campaignName)}"</b>
        <table class="grid" style="margin:4px 0"><tbody>
        <tr><td style="width:30%">แพลตฟอร์ม</td><td>${esc(plats)}</td></tr>
        <tr><td>ประเภท Content</td><td>${esc(F.contentType)}</td></tr>
        <tr><td>จำนวน Content</td><td>${esc(F.contentCount)} ชิ้น</td></tr>
        <tr><td>Brief</td><td>${nl(F.brief)}</td></tr>
        ${F.hashtags ? `<tr><td>Hashtag</td><td>${esc(F.hashtags)}</td></tr>` : ''}
        ${F.mentions ? `<tr><td>Tag / Mention</td><td>${esc(F.mentions)}</td></tr>` : ''}
        <tr><td>วันที่ต้องส่งงาน</td><td>${esc(td(F.submitDate))}</td></tr>
        <tr><td>วันที่ต้องโพสต์</td><td>${esc(td(F.postDate))}</td></tr></tbody></table>`),
      clause('ระยะเวลาการจ้าง', `ตั้งแต่วันที่ ${esc(td(F.startDate))} ถึงวันที่ ${esc(td(F.endDate))}`),
      clause('ค่าจ้างและการชำระเงิน', `ผู้ว่าจ้างตกลงชำระค่าจ้างทั้งหมดเป็นเงิน ${money(doc.base)} บาท (${esc(bahtText(doc.base))})
        ${doc.vat ? ` บวกภาษีมูลค่าเพิ่ม ${money(doc.vat)} บาท รวม ${money(doc.total)} บาท` : ''}
        ชำระโดย${esc(optLabel(DS.PAY_METHODS, F.payMethod) || 'โอนเงิน')} จำนวน ${esc(F.installmentCount || 1)} งวด
        ${p.bankAccountNo ? `เข้าบัญชี${esc(p.bankName || '')} เลขที่ ${esc(p.bankAccountNo)} ชื่อบัญชี ${esc(p.bankAccountName || p.name)}` : ''}<br>
        เงื่อนไขการจ่ายเงิน: ${nl(F.paymentTerms)}${installmentTable(doc.items)}<br>${whtTxt}`),
      clause('การแก้ไข Content', `ผู้ว่าจ้างมีสิทธิขอแก้ไข Content ได้ไม่เกิน ${esc(F.revisionRounds || 0)} ครั้งต่อชิ้นงาน การแก้ไขที่เกินจากนี้ให้ตกลงค่าใช้จ่ายเพิ่มเติมเป็นลายลักษณ์อักษร`),
      clause('ระยะเวลาเผยแพร่และการลบ Content', `ระยะเวลาเผยแพร่: ${esc(F.publishDuration)}<br>${nl(F.removalTerms)}`),
      clause('สิทธิในการใช้ Content', nl(F.contentRights)),
      clause('การยกเลิกงาน', nl(F.cancelTerms)),
      clause('ข้อมูลส่วนบุคคล', 'คู่สัญญาตกลงเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของอีกฝ่ายเท่าที่จำเป็นต่อการปฏิบัติตามสัญญา การจ่ายเงิน และการปฏิบัติตามกฎหมายภาษีอากร ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562'),
    ];
  }
  const empSig = sigBlock(isBrand ? doc.counterpartySignature : doc.signature, 'ผู้ว่าจ้าง', isBrand ? F.sign2Name : F.sign1Name,
    { position: isBrand ? F.sign2Position : F.sign1Position, seal: !isBrand && ctx.brand && ctx.brand.seal, date: F.signDate });
  const conSig = sigBlock(isBrand ? doc.signature : doc.counterpartySignature, 'ผู้รับจ้าง', isBrand ? F.sign1Name : F.sign2Name,
    { position: isBrand ? F.sign1Position : '', seal: isBrand && ctx.brand && ctx.brand.seal, date: F.signDate });
  const wit = (F.witness1 || F.witness2 || true) ? `<div class="signs" style="grid-template-columns:1fr 1fr;margin-top:10px">${sigBlock(null, 'พยาน', F.witness1)}${sigBlock(null, 'พยาน', F.witness2)}</div>` : '';
  const title = isBrand ? 'สัญญาจ้างบริหารแคมเปญการตลาด' : 'สัญญาจ้าง Influencer';
  const sheet = `<div class="sheet ct">${statusStrip(doc)}
    <div class="ct-title">${title}</div>
    <div class="ct-sub">เลขที่สัญญา ${esc(docNo(doc))}</div>
    <div class="ct-place">ทำที่ ${esc(F.place || '............................................')}<br>วันที่ ${esc(td(F.contractDate))}</div>
    ${parties}${body.join('')}
    <p class="ind" style="margin-top:10px">สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความโดยตลอดแล้ว เห็นว่าถูกต้องตามเจตนา จึงได้ลงลายมือชื่อ${iss.entityType === 'juristic' || p.authName ? 'และประทับตรา (ถ้ามี)' : ''}ไว้เป็นสำคัญต่อหน้าพยาน และต่างยึดถือไว้ฝ่ายละหนึ่งฉบับ</p>
    <div class="signs" style="grid-template-columns:1fr 1fr">${empSig}${conSig}</div>
    ${wit}
    <div class="grow"></div>
    ${footer(doc, ctx, `อากรแสตมป์ (จ้างทำของ ลักษณะแห่งตราสาร 4): 1 บาท ต่อทุก 1,000 บาท สัญญานี้ ${stampDuty(doc.total).toLocaleString('th-TH')} บาท · `)}
  </div>`;
  return page([sheet], `${title} ${docNo(doc)}`);
}

/* =========================================================
 * 5) หนังสือมอบอำนาจ
 * ========================================================= */
function renderPOA(doc, user, ctx) {
  const F = doc.fields || {};
  const powers = DS.FORMS.POA.sections[2].fields[0].options;
  const jur = F.grantorType === 'juristic';
  const grantorSig = F.issuerIs === 'grantor' ? doc.signature : doc.counterpartySignature;
  const granteeSig = F.issuerIs === 'grantor' ? doc.counterpartySignature : doc.signature;
  const sheet = `<div class="sheet ct">${statusStrip(doc)}
    <div style="display:flex;justify-content:space-between"><div class="seal-circle">ติดอากร<br>แสตมป์<br>${F.actCount === 'once' ? '10' : '30'} บาท</div><div class="small muted r">เลขที่ ${esc(docNo(doc))}</div></div>
    <div class="ct-title">หนังสือมอบอำนาจ</div>
    <div class="ct-place">เขียนที่ ${esc(F.place || '............................................')}<br>วันที่ ${esc(td(F.issueDate))}</div>
    <p class="ind">โดยหนังสือฉบับนี้ ข้าพเจ้า <b>${esc(F.grantorName)}</b> ${jur ? 'เลขทะเบียนนิติบุคคล/เลขประจำตัวผู้เสียภาษี' : 'เลขประจำตัวประชาชน'} ${esc(F.grantorIdNo)}
      สำนักงาน/ที่อยู่เลขที่ ${esc(F.grantorAddress)}${jur ? ` โดย ${esc(F.grantorAuthName)} ตำแหน่ง ${esc(F.grantorPosition)} ผู้มีอำนาจกระทำการแทนนิติบุคคล` : ''}
      ซึ่งต่อไปในหนังสือนี้เรียกว่า <b>"ผู้มอบอำนาจ"</b></p>
    <p class="ind">ขอมอบอำนาจให้ <b>${esc(F.granteeName)}</b> เลขประจำตัวประชาชน ${esc(F.granteeCitizenId)} อยู่บ้านเลขที่ ${esc(F.granteeAddress)}
      ซึ่งต่อไปในหนังสือนี้เรียกว่า <b>"ผู้รับมอบอำนาจ"</b> เป็นผู้มีอำนาจกระทำการแทนผู้มอบอำนาจในเรื่องดังต่อไปนี้</p>
    <div class="cl" style="padding-left:36px;margin:6px 0">${powers.map((o) => `<div>${cb((F.powers || []).includes(o.value), o.label)}</div>`).join('')}
      ${F.scopeDetail ? `<div style="margin-top:4px"><b>รายละเอียด/ขอบเขตอำนาจ:</b> ${nl(F.scopeDetail)}</div>` : ''}</div>
    <p class="ind">หนังสือมอบอำนาจนี้มีผลตั้งแต่วันที่ ${esc(td(F.startDate))} ${F.endDate ? `ถึงวันที่ ${esc(td(F.endDate))}` : 'จนกว่าผู้มอบอำนาจจะเพิกถอนเป็นลายลักษณ์อักษร'}</p>
    <p class="ind">การใดที่ผู้รับมอบอำนาจได้กระทำไปภายในขอบเขตแห่งหนังสือมอบอำนาจนี้ ให้ถือเสมือนหนึ่งว่าผู้มอบอำนาจได้กระทำด้วยตนเองทุกประการ เพื่อเป็นหลักฐาน ผู้มอบอำนาจจึงได้ลงลายมือชื่อ${jur ? 'และประทับตรา (ถ้ามี)' : ''}ไว้เป็นสำคัญต่อหน้าพยาน</p>
    <div class="signs" style="grid-template-columns:1fr 1fr;margin-top:26px">
      ${sigBlock(grantorSig, 'ผู้มอบอำนาจ', jur ? F.grantorAuthName : F.grantorName, { position: jur ? `${F.grantorPosition} · ${F.grantorName}` : '', seal: F.issuerIs === 'grantor' && ctx.brand && ctx.brand.seal })}
      ${sigBlock(granteeSig, 'ผู้รับมอบอำนาจ', F.granteeName)}
    </div>
    <div class="signs" style="grid-template-columns:1fr 1fr;margin-top:10px">${sigBlock(null, 'พยาน', F.witness1)}${sigBlock(null, 'พยาน', F.witness2)}</div>
    <div class="grow"></div>
    ${footer(doc, ctx, 'แนบสำเนาบัตรประจำตัวประชาชนของผู้มอบและผู้รับมอบ (และหนังสือรับรองนิติบุคคลกรณีนิติบุคคล) เมื่อนำไปใช้จริง · ')}
  </div>`;
  return page([sheet], `หนังสือมอบอำนาจ ${docNo(doc)}`);
}

/* =========================================================
 * 6) หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) 2 ฉบับ
 * ========================================================= */
function renderWht50(doc, user, ctx) {
  const F = doc.fields || {};
  const iss = issuerOf(doc, user);
  const p = doc.partyInfo || {};
  const rowsDef = [
    ['1', '1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)'],
    ['2', '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)'],
    ['3', '3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)'],
    ['4a', '4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)'],
    ['4b', '&nbsp;&nbsp;&nbsp;&nbsp;(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)'],
    ['5', '5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ'],
    ['6', '6. อื่น ๆ (ระบุ)'],
  ];
  const payDateTxt = DS.thaiDate(F.payDate, true);
  const tr = rowsDef.map(([code, label]) => {
    const on = F.incomeCode === code;
    const desc = on && (code === '5' || code === '6') && F.incomeDesc ? ` <b>(${esc(F.incomeDesc)})</b>` : '';
    return `<tr><td>${label}${desc}</td><td class="c">${on ? esc(payDateTxt) : ''}</td><td class="r">${on ? money(doc.income) : ''}</td><td class="r">${on ? money(doc.wht) : ''}</td></tr>`;
  }).join('');
  const formIdx = ['PND1A', 'PND1A_SP', 'PND2', 'PND3', 'PND2A', 'PND3A', 'PND53'];
  const cond = F.whtCondition || '1';
  const one = (copyNo) => `<div class="sheet w50">${statusStrip(doc)}
    <div class="copy-tag">ฉบับที่ ${copyNo} ${copyNo === 1 ? '(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)' : '(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)'}</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:14px">
      <div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:800">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div><div>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div></div>
      <div style="text-align:right;min-width:48mm">เล่มที่ <span class="dots">${esc(F.bookNo || '')}</span><br>เลขที่ <span class="dots"><b>${esc(docNo(doc))}</b></span></div>
    </div>
    <div class="rd" style="margin-top:8px">
      <div class="frow"><b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</b> <span style="float:right">เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* ${digitBoxes(iss.taxId)}</span><br>
        ชื่อ <span class="dots" style="min-width:70%"><b>${esc(iss.name)}</b>${iss.branch ? ' (' + esc(iss.branch) + ')' : ''}</span><br>
        <span class="small muted">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</span><br>
        ที่อยู่ <span class="dots" style="min-width:90%">${esc(iss.address)}</span></div>
      <div class="frow"><b>ผู้ถูกหักภาษี ณ ที่จ่าย :</b> <span style="float:right">เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* ${digitBoxes(p.taxId)}</span><br>
        ชื่อ <span class="dots" style="min-width:70%"><b>${esc(p.name)}</b></span><br>
        <span class="small muted">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</span><br>
        ที่อยู่ <span class="dots" style="min-width:90%">${esc(p.address)}</span></div>
      <div class="frow">ลำดับที่ <span class="dots" style="min-width:40px">${esc(F.seqInForm || '')}</span> ในแบบ &nbsp;
        ${formIdx.map((v, i) => cb(F.pndForm === v, `(${i + 1}) ${optLabel(DS.PND_FORMS, v)}`)).join('')}
        <div class="small muted">(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย)</div></div>
    </div>
    <table class="grid" style="margin-top:6px">
      <thead><tr><th>ประเภทเงินได้พึงประเมินที่จ่าย</th><th style="width:78px">วัน เดือน<br>หรือปีภาษี ที่จ่าย</th><th style="width:100px">จำนวนเงินที่จ่าย</th><th style="width:100px">ภาษีที่หัก<br>และนำส่งไว้</th></tr></thead>
      <tbody>${tr}
        <tr><td class="r"><b>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</b></td><td></td><td class="r"><b>${money(doc.income)}</b></td><td class="r"><b>${money(doc.wht)}</b></td></tr>
        <tr><td colspan="4"><b>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</b> &nbsp; <span style="background:#EEF1F6;padding:1px 10px">${esc(bahtText(doc.wht))}</span></td></tr>
      </tbody></table>
    <div class="rd" style="margin-top:6px">
      <div class="frow small">เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน <span class="dots"></span> บาท &nbsp; กองทุนประกันสังคม <span class="dots"></span> บาท &nbsp; กองทุนสำรองเลี้ยงชีพ <span class="dots"></span> บาท</div>
      <div class="frow"><b>ผู้จ่ายเงิน</b> &nbsp; ${cb(cond === '1', '(1) หัก ณ ที่จ่าย')}${cb(cond === '2', '(2) ออกให้ตลอดไป')}${cb(cond === '3', '(3) ออกให้ครั้งเดียว')}${cb(false, '(4) อื่น ๆ (ระบุ) ..........')}</div>
      <div class="frow" style="display:grid;grid-template-columns:1.4fr 1fr;gap:10px;align-items:center">
        <div class="small"><b>คำเตือน</b> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
        <div class="c" style="position:relative">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:4px">
            <div>${doc.signature && doc.signature.image ? `<img src="${img(doc.signature.image)}" style="max-height:40px"><br>` : '<br><br>'}
              ลงชื่อ <span class="dots" style="min-width:120px">${esc(doc.signature ? doc.signature.signerName : F.signerName)}</span> ผู้จ่ายเงิน<br>
              ${F.signerPosition ? `<span class="small">${esc(F.signerPosition)}</span><br>` : ''}
              <span class="small">${esc(td(F.issueDate))}<br>(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</span></div>
            ${ctx.brand && img(ctx.brand.seal) ? `<img src="${img(ctx.brand.seal)}" style="max-height:62px">` : '<div class="seal-circle">ประทับตรา<br>นิติบุคคล<br>(ถ้ามี)</div>'}
          </div></div></div>
    </div>
    <div class="small muted" style="margin-top:4px">หมายเหตุ * เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง 2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า</div>
    <div class="grow"></div>
    ${footer(doc, ctx)}</div>`;
  return page([one(1), one(2)], `หนังสือรับรองการหักภาษี ณ ที่จ่าย ${docNo(doc)}`);
}

/* =========================================================
 * 7) ภ.ง.ด.3 / ภ.ง.ด.53 ใบหน้าแบบ + ใบแนบ
 * ========================================================= */
const PND_ROWS_PER_SHEET = 6;
function renderPnd(doc, user, ctx) {
  const F = doc.fields || {};
  const iss = issuerOf(doc, user);
  const is53 = doc.type === 'PND53';
  const form = is53 ? 'ภ.ง.ด.53' : 'ภ.ง.ด.3';
  const a = iss.addr || {};
  const items = doc.items || [];
  const pages = Math.max(1, Math.ceil(items.length / PND_ROWS_PER_SHEET));
  const remit = is53
    ? [['s3tres', '(1) มาตรา 3 เตรส แห่งประมวลรัษฎากร'], ['s65bis', '(2) มาตรา 65 จัตวา แห่งประมวลรัษฎากร'], ['s69bis', '(3) มาตรา 69 ทวิ แห่งประมวลรัษฎากร']]
    : [['s3tres', '(1) มาตรา 3 เตรส'], ['s48bis', '(2) มาตรา 48 ทวิ'], ['s50', '(3) มาตรา 50 (3) (4) (5)']];
  const months = DS.THAI_MONTHS.map((m, i) => cb(Number(F.taxMonth) === i + 1, `(${i + 1}) ${m}`)).map((x) => `<div>${x}</div>`).join('');
  const cover = `<div class="sheet">${statusStrip(doc)}
    <div class="rd-head">
      <div class="t"><b>แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย</b><br>
        ${is53 ? 'ตามมาตรา 3 เตรส และมาตรา 69 ทวิ<br><span class="small">และการเสียภาษีตามมาตรา 65 จัตวา แห่งประมวลรัษฎากร</span>'
    : 'ตามมาตรา 59 แห่งประมวลรัษฎากร<br><span class="small">สำหรับการหักภาษี ณ ที่จ่ายตามมาตรา 3 เตรส และมาตรา 50 (3) (4) (5) กรณีการจ่ายเงินได้พึงประเมินตามมาตรา 40 (5) (6) (7) (8) และการเสียภาษีตามมาตรา 48 ทวิ แห่งประมวลรัษฎากร</span>'}</div>
      <div class="f">${form}</div>
    </div>
    <div class="rd" style="margin-top:8px;display:grid;grid-template-columns:1.25fr 1fr">
      <div style="border-right:1px solid #9aa4b3">
        <div class="frow">เลขประจำตัวผู้เสียภาษีอากร <span class="small muted">(ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</span><br>${digitBoxes(iss.taxId)}</div>
        <div class="frow">ชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย (หน่วยงาน) : <span style="float:right">สาขาที่ ${digitBoxes(F.branchNo || iss.branchNo, 5, [5])}</span><br><b>${esc(iss.name)}</b></div>
        <div class="frow small" style="line-height:1.9">ที่อยู่ : เลขที่ <span class="dots">${esc(a.no || '')}</span> ถนน <span class="dots">${esc(a.street || '')}</span><br>
          ตำบล/แขวง <span class="dots">${esc(a.subdistrict || '')}</span> อำเภอ/เขต <span class="dots">${esc(a.district || '')}</span><br>
          จังหวัด <span class="dots">${esc(a.province || '')}</span> รหัสไปรษณีย์ ${digitBoxes(a.postcode, 5, [5])}
          ${a.no ? '' : `<br>${esc(iss.address)}`}</div>
        <div class="frow c">${cb(F.filingType !== 'additional', '(1) ยื่นปกติ')} ${cb(F.filingType === 'additional', '(2) ยื่นเพิ่มเติมครั้งที่')} <span class="dots" style="min-width:30px">${F.filingType === 'additional' ? esc(F.filingSeq) : ''}</span></div>
      </div>
      <div>
        <div class="frow"><b>เดือนที่จ่ายเงินได้พึงประเมิน</b><br><span class="small">(ให้ทำเครื่องหมาย "✓" ลงใน "☐" หน้าชื่อเดือน) พ.ศ. <span class="dots"><b>${esc(F.taxYearBE)}</b></span></span>
          <div class="months" style="margin-top:4px">${months}</div></div>
        <div class="frow small muted c" style="padding-top:22px">สำหรับบันทึกข้อมูลจากระบบ TCL</div>
      </div>
    </div>
    <div class="rd" style="margin-top:6px"><div class="frow">นำส่งภาษีตาม &nbsp; ${remit.map(([k, l]) => cb((F.remitUnder || []).includes(k), l)).join('')}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1.25fr;gap:14px;margin:10px 0">
      <div class="small">มีรายละเอียดการหักเป็นรายผู้มีเงินได้ ปรากฏตาม<br><i>(ให้แสดงรายละเอียดในใบแนบ ${form} หรือในสื่อบันทึกในระบบคอมพิวเตอร์อย่างใดอย่างหนึ่งเท่านั้น)</i></div>
      <div>${cb(true, `ใบแนบ ${form} ที่แนบมาพร้อมนี้ :`)} จำนวน <span class="dots"><b>${items.length}</b></span> ราย &nbsp; จำนวน <span class="dots"><b>${pages}</b></span> แผ่น<br>
        ${cb(false, 'สื่อบันทึกในระบบคอมพิวเตอร์ ที่แนบมาพร้อมนี้ :')} จำนวน <span class="dots"></span> ราย</div>
    </div>
    <table class="sum-rd" style="margin:0 auto;width:86%">
      <tr><td style="background:#DDE3EE;border-radius:10px 0 0 10px" class="c"><b>สรุปรายการภาษีที่นำส่ง</b></td><td class="v c" style="font-weight:700">จำนวนเงิน</td></tr>
      <tr><td>1. รวมยอดเงินได้ทั้งสิ้น</td><td class="v">${money(doc.income)}</td></tr>
      <tr><td>2. รวมยอดภาษีที่นำส่งทั้งสิ้น</td><td class="v">${money(doc.wht)}</td></tr>
      <tr><td>3. เงินเพิ่ม (ถ้ามี)</td><td class="v">${doc.surcharge ? money(doc.surcharge) : '-'}</td></tr>
      <tr><td><b>4. รวมยอดภาษีที่นำส่งทั้งสิ้น และเงินเพิ่ม (2. + 3.)</b></td><td class="v">${money(doc.total)}</td></tr>
    </table>
    <div class="c" style="margin-top:6px" class="small">(${esc(bahtText(doc.total))})</div>
    <div class="c" style="margin-top:16px;border-top:1px solid #9aa4b3;padding-top:10px">ข้าพเจ้าขอรับรองว่า รายการที่แจ้งไว้ข้างต้นนี้ เป็นรายการที่ถูกต้องและครบถ้วนทุกประการ</div>
    <div style="display:flex;justify-content:center;align-items:center;gap:30px;margin-top:10px">
      <div style="line-height:2">
        ลงชื่อ <span class="dots" style="min-width:180px">${doc.signature && doc.signature.image ? `<img src="${img(doc.signature.image)}" style="max-height:32px;vertical-align:bottom">` : ''}</span> ผู้จ่ายเงิน<br>
        ( <span class="dots" style="min-width:180px">${esc(F.signerName)}</span> )<br>
        ตำแหน่ง <span class="dots" style="min-width:160px">${esc(F.signerPosition)}</span><br>
        ยื่นวันที่ <span class="dots" style="min-width:160px">${esc(td(F.filingDate))}</span></div>
      ${ctx.brand && img(ctx.brand.seal) ? `<img src="${img(ctx.brand.seal)}" style="max-height:70px">` : '<div class="seal-circle">ประทับตรา<br>นิติบุคคล<br>(ถ้ามี)</div>'}
    </div>
    <div class="grow"></div>
    <div class="draft-strip" style="margin-top:10px">ข้อมูลจัดเตรียมโดย TaxFlow เพื่อใช้ประกอบการยื่นแบบ ระบบไม่ได้ยื่นแบบแทนกรมสรรพากร ผู้มีหน้าที่หักภาษีต้องยื่นเองทาง e-Filing (efiling.rd.go.th) หรือที่สำนักงานสรรพากร</div>
    ${footer(doc, ctx)}</div>`;

  const sheets = [cover];
  for (let pg = 0; pg < pages; pg++) {
    const chunk = items.slice(pg * PND_ROWS_PER_SHEET, (pg + 1) * PND_ROWS_PER_SHEET);
    const subIncome = chunk.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const subWht = chunk.reduce((s, r) => s + (Number(r.wht) || 0), 0);
    const rows = chunk.map((r, i) => `<tr>
      <td class="c">${pg * PND_ROWS_PER_SHEET + i + 1}</td>
      <td>${digitBoxes(r.payeeTaxId)}${is53 ? ` <span class="small">สาขาที่ ${esc(r.payeeBranch || '00000')}</span>` : ''}<br>
        <span class="small">ชื่อ</span> <b>${esc(r.payeeName)}</b><br><span class="small">ที่อยู่ ${esc(r.payeeAddress || '')}</span>
        ${r.sourceNo ? `<br><span class="small muted">อ้างอิง ${esc(r.sourceNo)}</span>` : ''}</td>
      <td class="c">${esc(DS.thaiDate(r.payDate, true))}</td>
      <td>${esc(r.incomeDesc)}</td>
      <td class="c">${esc(r.rate)}</td>
      <td class="r">${money(r.amount)}</td>
      <td class="r">${money(r.wht)}</td>
      <td class="c">${esc(r.condition || '1')}</td></tr>`).join('');
    const pad = Array.from({ length: PND_ROWS_PER_SHEET - chunk.length }).map(() => '<tr><td style="height:58px"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');
    sheets.push(`<div class="sheet">
      <div class="rd-head">
        <div class="t" style="text-align:left;display:flex;justify-content:space-between;align-items:center"><b style="font-size:20px">ใบแนบ ${form}</b>
          <span>เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย) ${digitBoxes(iss.taxId)} &nbsp; สาขาที่ ${digitBoxes(F.branchNo || iss.branchNo, 5, [5])}</span></div>
        <div class="f" style="font-size:16px;min-width:30mm;flex-direction:column">แผ่นที่ ${pg + 1}<br><span class="small">ในจำนวน ${pages} แผ่น</span></div>
      </div>
      <div class="small" style="margin:4px 0">${esc(iss.name)} · เดือน${esc(DS.THAI_MONTHS[Number(F.taxMonth) - 1] || '')} พ.ศ. ${esc(F.taxYearBE)}</div>
      <table class="grid">
        <thead><tr><th style="width:34px">ลำดับที่</th><th>เลขประจำตัวผู้เสียภาษีอากร ของผู้มีเงินได้<br>ชื่อผู้มีเงินได้ ${is53 ? '(ให้ระบุว่าเป็น บริษัท / ห้างหุ้นส่วน / อื่น ๆ)' : '(ให้ระบุให้ชัดเจนว่าเป็น นาย นาง นางสาว หรือยศ)'} / ที่อยู่</th>
          <th style="width:62px">วัน เดือน ปี ที่จ่าย</th><th style="width:90px">ประเภทเงินได้</th><th style="width:42px">อัตราภาษี ร้อยละ</th><th style="width:88px">จำนวนเงินที่จ่ายแต่ละประเภท</th><th style="width:82px">จำนวนเงินภาษีที่หักและนำส่งในครั้งนี้</th><th style="width:42px">เงื่อนไข</th></tr></thead>
        <tbody>${rows}${pad}
          <tr><td colspan="5" class="r"><b>รวมยอดเงินได้และภาษีที่นำส่ง</b> <span class="small">(นำไปรวมกับใบแนบ ${form} แผ่นอื่น (ถ้ามี))</span></td><td class="r"><b>${money(subIncome)}</b></td><td class="r"><b>${money(subWht)}</b></td><td></td></tr>
        </tbody></table>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:12px;margin-top:6px" class="small">
        <div>(ให้กรอกลำดับที่ต่อเนื่องกันไปทุกแผ่น)<br><b>เงื่อนไข</b> ให้กรอกดังนี้ • หัก ณ ที่จ่าย กรอก 1 • ออกให้ตลอดไป กรอก 2 • ออกให้ครั้งเดียว กรอก 3</div>
        <div class="c">ลงชื่อ <span class="dots" style="min-width:140px"></span> ผู้จ่ายเงิน<br>( ${esc(F.signerName)} )<br>ตำแหน่ง ${esc(F.signerPosition || '')} &nbsp; ยื่นวันที่ ${esc(td(F.filingDate))}</div>
      </div>
      <div class="grow"></div>
      ${footer(doc, ctx)}</div>`);
  }
  return page(sheets, `ข้อมูล ${form} ${esc(DS.THAI_MONTHS[Number(F.taxMonth) - 1] || '')} ${F.taxYearBE}`);
}

function render(doc, user, ctx = {}) {
  const html = renderByType(doc, user, ctx);
  // ฟอนต์ของเอกสาร (doc.docFont) ให้หน้าพิมพ์ตรงกับ PDF
  if (!html || doc.docFont !== 'googlesans') return html;
  return html
    .replace('family=Sarabun:wght@400;500;600;700;800', 'family=Google+Sans:wght@400;500;600;700')
    .replace("body{font-family:'Sarabun',sans-serif;", "body{font-family:'Google Sans','Sarabun',sans-serif;");
}

function renderByType(doc, user, ctx) {
  switch (doc.type) {
    case 'QUOTATION': case 'PO': case 'INVOICE': case 'RECEIPT':
    case 'ETAX_INVOICE': case 'ETAX_RECEIPT': return renderCommercial(doc, user, ctx);
    case 'DELIVERY': return renderDelivery(doc, user, ctx);
    case 'PAYMENT': return renderVoucher(doc, user, ctx);
    case 'CONTRACT_BRAND': case 'CONTRACT_INF': return renderContract(doc, user, ctx);
    case 'POA': return renderPOA(doc, user, ctx);
    case 'EWHT': return renderWht50(doc, user, ctx);
    case 'PND3': case 'PND53': return renderPnd(doc, user, ctx);
    default: return null;
  }
}

module.exports = { render };
