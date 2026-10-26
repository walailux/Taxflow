'use strict';
/** สรุปยอดบนแดชบอร์ดของแต่ละบทบาท — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { store, tax, sendJson, requireAuth, round2, bangkokDateStr,
} = require('../core/context');

const { pitSourcesFromDocs } = require('../core/pitdocs');
const pit = require('../../../packages/shared/pit.js');

const api = express.Router();
// แนวโน้มรายเดือนย้อนหลัง 12 เดือน (สำหรับกราฟบนแดชบอร์ด) แบ่งกลุ่มตาม issueDate (เขตเวลาไทย)
// เฉพาะเอกสารสถานะ approved/archived เท่านั้น (นับเป็น "ยอดที่เกิดขึ้นจริง" ไม่ใช่แบบร่าง/รอตรวจ)
api.get('/api/dashboard/trend', requireAuth(async (req, res) => {
  const todayYM = bangkokDateStr().slice(0, 7);
  const months = [];
  { // สร้างลิสต์ 12 เดือนย้อนหลังจากเดือนปัจจุบัน (รวมเดือนนี้) แบบไม่พึ่ง Date object เขตเวลาอื่น
    let [y, m] = todayYM.split('-').map(Number);
    for (let i = 0; i < 12; i++) {
      months.unshift(`${y}-${String(m).padStart(2, '0')}`);
      m--; if (m === 0) { m = 12; y--; }
    }
  }
  const byMonth = Object.fromEntries(months.map((ym) => [ym, { income: 0, vat: 0, wht: 0, count: 0 }]));
  const docs = await store.all('documents', (d) => d.userId === req.user.id && ['approved', 'archived'].includes(d.status));
  const isWht = (d) => ['WHT', 'EWHT'].includes(d.type);
  for (const d of docs) {
    const ym = (d.issueDate || (d.createdAt || '').slice(0, 10)).slice(0, 7);
    const bucket = byMonth[ym];
    if (!bucket) continue; // นอกช่วง 12 เดือนที่แสดง
    bucket.income += Number(isWht(d) ? d.net || 0 : d.total || d.base || 0);
    bucket.vat += Number(!isWht(d) ? d.vat || 0 : 0);
    bucket.wht += Number(isWht(d) ? d.wht || 0 : 0);
    bucket.count += 1;
  }
  sendJson(res, 200, {
    months,
    income: months.map((ym) => round2(byMonth[ym].income)),
    vat: months.map((ym) => round2(byMonth[ym].vat)),
    wht: months.map((ym) => round2(byMonth[ym].wht)),
    count: months.map((ym) => byMonth[ym].count),
  });
}));


/* ---------- หน้าวิเคราะห์ข้อมูล: สรุปเอกสารสำหรับกราฟหลายแบบ ----------
 * ?range=6m | 12m (ค่าเริ่มต้น) | ytd (ต้นปีถึงเดือนนี้) · ?basis=approved (อนุมัติ/เก็บถาวร ค่าเริ่มต้น) | effective (ทุกฉบับที่มีผล)
 * คืนข้อมูลรายเดือน + สัดส่วนตามประเภท/สถานะ + คู่ค้าที่มียอดสูงสุด (ยอดคิดแบบเดียวกับกราฟบนแดชบอร์ด)
 */
const DOC_TYPE_LABEL = {
  WHT: '50 ทวิ ที่ได้รับ', EWHT: 'หนังสือรับรอง 50 ทวิ', RECEIPT: 'ใบเสร็จรับเงิน', INVOICE: 'ใบแจ้งหนี้', QUOTATION: 'ใบเสนอราคา',
  PO: 'ใบสั่งซื้อ', DELIVERY: 'ใบส่งมอบงาน', PAYMENT: 'ใบสำคัญจ่าย', ETAX: 'ใบกำกับภาษี', ETAX_INVOICE: 'ใบกำกับภาษีอิเล็กทรอนิกส์',
  ETAX_RECEIPT: 'ใบรับอิเล็กทรอนิกส์', CREDIT_NOTE: 'ใบลดหนี้', DEBIT_NOTE: 'ใบเพิ่มหนี้', CONTRACT_INF: 'สัญญาจ้าง', CONTRACT_BRAND: 'สัญญากับแบรนด์',
  POA: 'หนังสือมอบอำนาจ', PND3: 'ภ.ง.ด.3', PND53: 'ภ.ง.ด.53',
};
// ช่วงเวลาที่ผู้ใช้กำหนดเอง ยาวได้ไม่เกิน 5 ปี (60 เดือน) กันกราฟแน่นจนอ่านไม่ออกและคำนวณหนักเกิน
const CUSTOM_MAX_MONTHS = 60;
const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
api.get('/api/dashboard/analytics', requireAuth(async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams;
  let range = ['6m', '12m', 'ytd', 'custom'].includes(p.get('range')) ? p.get('range') : '12m';
  const basis = p.get('basis') === 'effective' ? 'effective' : 'approved';
  const todayYM = bangkokDateStr().slice(0, 7);
  const [cy, cm] = todayYM.split('-').map(Number);
  const months = [];
  if (range === 'custom' && YM_RE.test(p.get('from') || '') && YM_RE.test(p.get('to') || '')) {
    // ?range=custom&from=YYYY-MM&to=YYYY-MM (ค.ศ.) สลับให้เองถ้าใส่กลับด้าน
    const [from, to] = [p.get('from'), p.get('to')].sort();
    let [y, m] = from.split('-').map(Number);
    while (`${y}-${String(m).padStart(2, '0')}` <= to && months.length < CUSTOM_MAX_MONTHS) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++; if (m === 13) { m = 1; y++; }
    }
  } else {
    if (range === 'custom') range = '12m';
    const count = range === '6m' ? 6 : range === 'ytd' ? cm : 12;
    let y = cy, m = cm;
    for (let i = 0; i < count; i++) { months.unshift(`${y}-${String(m).padStart(2, '0')}`); m--; if (m === 0) { m = 12; y--; } }
  }
  const inRange = new Set(months);

  const all = await store.all('documents', (d) => d.userId === req.user.id);
  const ymOf = (d) => (d.issueDate || (d.createdAt || '').slice(0, 10)).slice(0, 7);
  const ranged = all.filter((d) => inRange.has(ymOf(d)));
  const counted = ranged.filter((d) => (basis === 'approved' ? ['approved', 'archived'].includes(d.status) : !['draft', 'cancelled', 'rejected'].includes(d.status)));
  const isWht = (d) => ['WHT', 'EWHT'].includes(d.type);
  const valueOf = (d) => Number(isWht(d) ? d.net || 0 : d.total || d.base || 0);

  const byMonth = Object.fromEntries(months.map((ym) => [ym, { income: 0, vat: 0, wht: 0, count: 0 }]));
  const byType = {};
  const byParty = {};
  for (const d of counted) {
    const b = byMonth[ymOf(d)];
    const v = valueOf(d);
    b.income += v;
    b.vat += Number(!isWht(d) ? d.vat || 0 : 0);
    b.wht += Number(isWht(d) ? d.wht || 0 : 0);
    b.count += 1;
    const t = byType[d.type] || (byType[d.type] = { type: d.type, label: DOC_TYPE_LABEL[d.type] || d.type, count: 0, total: 0,
      monthlyTotal: months.map(() => 0), monthlyCount: months.map(() => 0) });
    t.count += 1; t.total += v;
    // แยกรายเดือนต่อประเภท (ใช้วาดกราฟแท่งซ้อนตามเดือนในหน้าวิเคราะห์)
    const mi = months.indexOf(ymOf(d));
    t.monthlyTotal[mi] += v; t.monthlyCount[mi] += 1;
    const name = (d.partyInfo && d.partyInfo.name) || d.party || d.payer || d.buyer || d.payee || 'ไม่ระบุคู่ค้า';
    const pt = byParty[name] || (byParty[name] = { name, count: 0, total: 0 });
    pt.count += 1; pt.total += v;
  }
  // สถานะนับจากทุกฉบับในช่วงเวลา (รวมแบบร่าง/ยกเลิก) เพื่อให้เห็นภาพรวมงานทั้งหมด
  const byStatus = {};
  for (const d of ranged) byStatus[d.status] = (byStatus[d.status] || 0) + 1;

  const sum = (k) => round2(months.reduce((s, ym) => s + byMonth[ym][k], 0));
  sendJson(res, 200, {
    range, basis, months,
    income: months.map((ym) => round2(byMonth[ym].income)),
    vat: months.map((ym) => round2(byMonth[ym].vat)),
    wht: months.map((ym) => round2(byMonth[ym].wht)),
    count: months.map((ym) => byMonth[ym].count),
    totals: { income: sum('income'), vat: sum('vat'), wht: sum('wht'), count: counted.length },
    byType: Object.values(byType).map((t) => ({ ...t, total: round2(t.total), monthlyTotal: t.monthlyTotal.map(round2) })).sort((a, b) => b.total - a.total || b.count - a.count),
    byStatus: Object.entries(byStatus).map(([status, n]) => ({ status, count: n })).sort((a, b) => b.count - a.count),
    topParties: Object.values(byParty).map((x) => ({ ...x, total: round2(x.total) })).sort((a, b) => b.total - a.total).slice(0, 5),
  });
}));

/* =========================================================
 * SUMMARIES
 * ========================================================= */
function statusCounts(docs) {
  const c = { draft: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0, archived: 0 };
  docs.forEach((d) => { if (c[d.status] !== undefined) c[d.status]++; });
  return c;
}
// เอกสารที่ถูกยกเลิก/ไม่อนุมัติไม่มีผลทางภาษี จึงไม่นับรวมยอด (เดิมนับทุกสถานะ ทำให้ยอดรายได้/ภาษีเกินจริง)
const NON_EFFECTIVE_STATUS = ['cancelled', 'rejected'];
const isEffectiveDoc = (d) => !NON_EFFECTIVE_STATUS.includes(d.status);
// รายได้ทั้งปีและภาษีของครีเอเตอร์ ดึงจากเอกสารด้วย core/pitdocs.js และคำนวณด้วย packages/shared/pit.js
// (สูตรเดียวกับหน้าคำนวณภาษี) ?issuedType=40(8) กำหนดประเภทเงินได้ของเอกสารที่ออกเอง ค่าเริ่มต้น 40(2)
api.get('/api/creator/summary', requireAuth(async (req, res) => {
  const mine = await store.all('documents', (d) => d.userId === req.user.id);
  const allWht = mine.filter((d) => d.type === 'WHT');
  const p = new URL(req.url, 'http://localhost').searchParams;
  const qYear = p.get('year') || '';
  const year = /^\d{4}$/.test(qYear) ? qYear : bangkokDateStr().slice(0, 4);
  const src = pitSourcesFromDocs(mine, year, p.get('issuedType') || '40(2)');
  const gross = src.sources.reduce((sum, x) => sum + x.amount, 0);
  const result = pit.calculate({ year: Number(year), incomes: src.incomes, withholdingPaid: src.withholding });
  sendJson(res, 200, {
    taxYear: Number(year), documentCount: src.sources.length, grossIncome: round2(gross), withholdingPaid: round2(src.withholding),
    // totalTax คงชื่อเดิมไว้ให้หน้าเว็บที่อ่านค่านี้อยู่
    estimate: { ...result, totalTax: result.tax },
    status: statusCounts(allWht),
  });
}));
// เอกสารรับเงิน (นับเป็นรายรับ) และเอกสารเรียกเก็บเงิน ทั้งแบบกระดาษและ e-Tax
// (เดิมนับเฉพาะ RECEIPT/ETAX จึงไม่นับใบรับอิเล็กทรอนิกส์ ETAX_RECEIPT บริษัทและเอเจนซี่ที่ออก e-Tax เห็นรายรับปีนี้เป็นศูนย์)
const RECEIPT_TYPES = ['RECEIPT', 'ETAX', 'ETAX_RECEIPT'];
const BILL_TYPES = ['INVOICE', 'ETAX_INVOICE'];
const VAT_INVOICE_TYPES = ['ETAX', 'ETAX_INVOICE'];
api.get('/api/agency/summary', requireAuth(async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams;
  const qYear = p.get('year') || '';
  const year = /^\d{4}$/.test(qYear) ? qYear : bangkokDateStr().slice(0, 4);
  const docs = await store.all('documents', (d) => d.userId === req.user.id);
  // ยอดเงินบนแดชบอร์ดเป็น "ปีนี้" (ตามวันที่ออกเอกสาร เวลาไทย) ส่วนจำนวนตามสถานะยังนับทุกฉบับ
  const inYear = (d) => String(d.issueDate || bangkokDateStr(new Date(d.createdAt || Date.now()))).slice(0, 4) === year;
  const eff = docs.filter((d) => isEffectiveDoc(d) && d.status !== 'draft' && inYear(d));
  // รายได้ = เอกสารรับเงินที่ออกแล้ว · ค่าใช้จ่าย = ใบสำคัญจ่าย · ภาษีหัก ณ ที่จ่าย = 50 ทวิ ที่ออก (หรือใบสำคัญจ่ายที่ยังไม่ได้ออก 50 ทวิ)
  const receipts = eff.filter((d) => RECEIPT_TYPES.includes(d.type));
  const invoices = eff.filter((d) => BILL_TYPES.includes(d.type));
  const payments = eff.filter((d) => d.type === 'PAYMENT');
  const certs = eff.filter((d) => d.type === 'EWHT');
  const linked = new Set(certs.map((c) => c.refDocId).filter(Boolean));
  const whtTotal = certs.reduce((s2, d) => s2 + (+d.wht || 0), 0) + payments.filter((p) => !linked.has(p.id)).reduce((s2, d) => s2 + (+d.wht || 0), 0);
  const taxInvoices = eff.filter((d) => VAT_INVOICE_TYPES.includes(d.type));
  sendJson(res, 200, {
    year: Number(year),
    counts: { total: docs.length, invoices: invoices.length, receipts: receipts.length, payments: payments.length, whtCertificates: certs.length,
      eTaxInvoice: taxInvoices.length, eWithholding: certs.length },
    totals: {
      revenue: round2(receipts.reduce((s2, d) => s2 + (+d.total || 0), 0)),
      billed: round2(invoices.reduce((s2, d) => s2 + (+d.total || 0), 0)),
      // ภาษีขายตามใบกำกับภาษีที่ออกในปี (ใบรับ/ใบเสร็จไม่มี VAT แยก จึงนับจากใบกำกับ)
      vat: round2(taxInvoices.reduce((s2, d) => s2 + (+d.vat || 0), 0)),
      expense: round2(payments.reduce((s2, d) => s2 + (+d.base || 0), 0) + certs.filter((c) => !c.refDocId).reduce((s2, d) => s2 + (+d.subtotal || +d.base || 0), 0)),
      withholding: round2(whtTotal),
    },
    status: statusCounts(docs),
  });
}));

module.exports = api;
