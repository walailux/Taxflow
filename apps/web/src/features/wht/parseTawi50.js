/**
 * parseTawi50.js แยกข้อมูลจากข้อความของหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
 * รองรับทั้งแบบของกรมสรรพากรและแบบที่ TaxFlow ออก (docplan.js planWht50) และข้อความที่ได้จาก OCR
 *
 * หลักการ: อ่านเฉพาะสิ่งที่พบในไฟล์จริง ไม่เดาค่าแทนผู้ใช้
 *   - ทุกช่องแนบ "หลักฐาน" (บรรทัดที่พบในไฟล์) ให้ผู้ใช้ตรวจกับต้นฉบับ
 *   - ประเภทเงินได้กรอกให้เฉพาะเมื่อไฟล์ระบุมาตรา 40 (2) หรือ 40 (8) ชัดเจน (สองประเภทที่หน้าบันทึกรองรับ)
 *     แถวอื่น เช่น แถวที่ 5 "ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส" ไม่ได้ระบุมาตรา 40 ไว้ ระบบจึงไม่เดา ให้ผู้ใช้เลือกเอง
 *   - อัตราภาษีหาจากยอดเงินกับภาษีที่หักในไฟล์ ด้วยสูตรเดียวกับตอนบันทึก (tax.calcWithholding) ต้องตรงกันพอดีจึงกรอกให้
 */
import { tax, thaiid } from '../../lib/shared.js';

export const RATES = [1, 2, 3, 5, 10, 15];

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MONTH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// วันที่: "1 ตุลาคม 2569" · "1 ต.ค. 2569" · "1 ตุล. 2569" (ตัวย่อ 3 ตัวอักษรแบบที่ TaxFlow พิมพ์) · "01/10/2569"
const THAI_DATE_RE = /(\d{1,2})\s*([ก-๙][ก-๙.]{1,11})\s*(\d{4})/g;
const NUM_DATE_RE = /\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}/;
const isMonth = (w) => {
  const bare = w.replace(/\./g, '');
  return MONTH_ABBR.includes(w) || MONTH_ABBR.some((a) => a.replace(/\./g, '') === bare)
    || MONTHS.some((m) => m === bare || (bare.length >= 3 && w.endsWith('.') && m.startsWith(bare)));
};
function dateIn(line) {
  for (const m of line.matchAll(THAI_DATE_RE)) if (isMonth(m[2])) return `${m[1]} ${m[2]} ${m[3]}`;
  const n = line.match(NUM_DATE_RE);
  return n ? n[0].replace(/\s+/g, '') : null;
}
// จำนวนเงินต้องมีคอมมาหลักพันหรือทศนิยม 2 ตำแหน่ง จึงไม่สับสนกับเลขประจำตัวผู้เสียภาษี วันที่ หรือเลขแถว
const MONEY_RE = /(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})(?!\d|\.\d)/g;
const TAX_ID_RE = /(?:\d[\s-]*){13}/;

/** ข้อความที่ไม่มีช่องว่าง ใช้หาคำสำคัญ (OCR ภาษาไทยมักแทรกช่องว่างกลางคำ) */
const squash = (s) => s.replace(/\s+/g, '');
/**
 * สระและวรรณยุกต์ที่ลอยอยู่บน/ล่าง/หลังพยัญชนะ (ะ-ฺ และ ็-๎)
 * PDF ที่ฝังฟอนต์ไทยแบบ subset มักคืนตัวเหล่านี้ไม่ครบ กลายเป็นช่องว่างหรือ U+FFFD
 * เช่น "ผู้มีหน้ ที่หักภ ษี" (สระอาหาย) หรือ "ค่าตอบแทน" → "ค��ตอบแทน"
 */
const THAI_MARKS = /[ะ-ฺ็-๎�]/g;
/**
 * เทียบคำสำคัญแบบหลวม: เทียบเฉพาะโครงพยัญชนะ ตัดช่องว่างและสระ/วรรณยุกต์ทิ้งทั้งสองฝั่ง
 * วลีที่ใช้ค้นเป็นวลียาวเฉพาะทาง (เช่น "ผู้มีหน้าที่หักภาษี") โครงพยัญชนะจึงยังชี้เฉพาะพอ
 * ไม่ชนกับข้อความอื่นในเอกสาร แต่ทนต่อไฟล์ที่อ่านสระมาไม่ครบ
 */
const loose = (s) => squash(s).replace(THAI_MARKS, '');
const has = (line, keyword) => loose(line).includes(loose(keyword));
/** บรรทัดนี้ตรงกับคำสำคัญสักคำในชุดหรือไม่ */
const hasAny = (line, keywords) => keywords.some((k) => has(line, k));
const toNumber = (s) => Number(String(s).replace(/,/g, ''));
const clip = (s) => (s.length > 140 ? `${s.slice(0, 137)}...` : s);

export function normalizeText(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)))
    // ตัวอักษรที่ pdf.js แปลงกลับเป็น Unicode ไม่ได้ (U+FFFD) ตัดทิ้ง ไม่งั้นหลักฐานที่โชว์ผู้ใช้
    // จะเต็มไปด้วยสี่เหลี่ยมดำ เช่น "ค��ตอบแทนการประชาสัมพันธ��"
    .replace(/�/g, '')
    // สระอำที่ถูกแยกเป็น "ำา" หรือ "ํา" ตอนดึงข้อความจาก PDF (เช่น "จำากัด") รวมกลับเป็นสระอำตัวเดียว
    .replace(/(?:ำ|ํ)า/g, 'ำ')
    .replace(/[ ​\t]/g, ' ')
    .replace(/\r/g, '');
}

export function moneysIn(line) {
  return [...line.matchAll(MONEY_RE)].map((m) => toNumber(m[1]));
}

/** อัตราที่ทำให้ภาษีตรงกับไฟล์พอดี (สูตรเดียวกับตอนบันทึก) หรือ null ถ้าไม่ตรงอัตราใดที่ระบบรองรับ */
export function detectRate(amount, wht) {
  if (!(amount > 0) || !(wht >= 0)) return null;
  return RATES.find((r) => tax.calcWithholding(amount, r).wht === wht) ?? null;
}

/** รหัสแถวประเภทเงินได้จากบรรทัดเดียว: '40(1)'…'40(8)' | 'r5' (มาตรา 3 เตรส) | 'r6' (อื่น ๆ) | null */
function rowCodeOf(line) {
  const sec = line.match(/40\s*\(\s*([1-8])\s*\)/);
  if (sec) return `40(${sec[1]})`;
  const sq = squash(line);
  if (sq.includes('3เตรส')) return 'r5';
  if (/^อื่นๆ/.test(sq) || /^6[.)]อื่น/.test(sq)) return 'r6';
  const num = line.match(/^\s*([1-6])\s*[.)]\s*\S/);
  if (num) return { 1: '40(1)', 2: '40(2)', 3: '40(3)', 4: '40(4)', 5: 'r5', 6: 'r6' }[num[1]];
  return null;
}

const ROW_LABEL = {
  r5: 'แถวที่ 5 การจ่ายเงินได้ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส',
  r6: 'แถวที่ 6 อื่น ๆ',
};
const codeLabel = (c) => ROW_LABEL[c] || `มาตรา ${c.replace('(', ' (')}`;

/**
 * ป้ายชื่อที่ไม่ใช่ชื่อตามกฎหมายของคู่กรณี ข้ามไปหาบรรทัดอื่นแทน
 * (50 ทวิ ของผู้จ้างอินฟลูเอนเซอร์มักมีบรรทัด "ชื่อช่อง / ชื่อที่ใช้ในการทำงาน:" คั่นอยู่)
 */
const NOT_LEGAL_NAME = /ช่อง|ทางการค้า|ธนาคาร|บัญชี|ผู้ติดต่อ|โครงการ|เรื่อง|ไฟล์|ผู้ใช้|เล่น/;
/** ป้ายชื่อแบบมีคำขยายแล้วตามด้วยโคลอน เช่น "ชื่อ-นามสกุล:" "ชื่อนิติบุคคล / ผู้ประกอบการ:" */
// ไม่มี \s* หน้า (.*) เพราะสองส่วนนี้จับช่องว่างซ้อนกันจน backtrack ช้า ช่องว่างหน้าค่าถูก clean() ตัดทิ้งอยู่แล้ว
const NAME_LABEL_RE = /(?:^|\s)ชื่อ([^:：]{0,40})[:：](.*)/;

/** อักขระที่ตัดทิ้งจากหัวและท้ายชื่อ: ช่องว่าง โคลอน จุด ขีด */
const EDGE_MARK = /[\s:：.\-]/;
/** ตัดอักขระ EDGE_MARK หัวท้าย ด้วยลูปแทน regex /^[...]+|[...]+$/g ที่ backtrack ได้ช้าเมื่อข้อความยาว */
function trimEdgeMarks(v) {
  let start = 0;
  let end = v.length;
  while (start < end && EDGE_MARK.test(v[start])) start += 1;
  while (end > start && EDGE_MARK.test(v[end - 1])) end -= 1;
  return v.slice(start, end);
}

/** ชื่อในบล็อกคู่กรณี: ค่าหลังป้าย "ชื่อ…" (ถ้าว่างดูบรรทัดถัดไป) แล้วตัดคำกำกับของแบบฟอร์มออก */
function nameIn(block) {
  const clean = (v) => trimEdgeMarks(v
    .replace(/\(ให้ระบุ[^)]*\)/g, '')
    .replace(/เลขประจำตัว.*$/, '')
    .replace(/ที่อยู่.*$/, '')
    .replace(/\((สำนักงานใหญ่|สาขา[^)]*)\)\s*$/, ''))
    .trim();
  const ok = (v) => v.length >= 3 && /[ก-๙A-Za-z]{2}/.test(v) && !/^(ชื่อ|ที่อยู่|หน่วยงาน)/.test(v);
  // รอบแรก: ป้ายที่มีโคลอน ตัดคำขยายของป้ายทิ้งทั้งก้อน ("ชื่อนิติบุคคล / ผู้ประกอบการ: บริษัท ก" → "บริษัท ก")
  for (let i = 0; i < block.length; i += 1) {
    const m = block[i].match(NAME_LABEL_RE);
    if (!m || NOT_LEGAL_NAME.test(m[1])) continue;
    const same = clean(m[2]);
    if (ok(same)) return { value: same, evidence: block[i] };
    const next = block[i + 1] ? clean(block[i + 1]) : '';
    if (ok(next)) return { value: next, evidence: block[i + 1] };
  }
  // รอบสอง: ป้าย "ชื่อ" ที่ไม่มีโคลอน (แบบของกรมสรรพากรพิมพ์เป็น "ชื่อ บริษัท ก")
  for (let i = 0; i < block.length; i += 1) {
    const m = block[i].match(/ชื่อ(?:ผู้มีหน้าที่หักภาษี\s*ณ\s*ที่จ่าย)?(?:\s*\(หน่วยงาน\))?(.*)/);
    if (!m) continue;
    const same = clean(m[1]);
    if (ok(same)) return { value: same, evidence: block[i] };
    const next = block[i + 1] ? clean(block[i + 1]) : '';
    if (ok(next)) return { value: next, evidence: block[i + 1] };
  }
  // ไม่มีคำว่า "ชื่อ" (เช่น OCR อ่านหัวช่องไม่ออก) หาชื่อนิติบุคคลในบล็อกแทน
  for (const l of block) {
    const m = l.match(/((?:บริษัท|ห้างหุ้นส่วน|หจก\.?|บจก\.?|มูลนิธิ|สมาคม)\s*\S.{0,80}?(?:จำกัด(?:\s*\(มหาชน\))?|$))/);
    if (m && ok(clean(m[1]))) return { value: clean(m[1]), evidence: l };
  }
  return null;
}

function taxIdIn(block) {
  for (const l of block) {
    const m = l.match(TAX_ID_RE);
    if (m) {
      const id = m[0].replace(/\D/g, '').slice(0, 13);
      return { value: id, evidence: l, valid: thaiid.isValidTaxId(id) };
    }
  }
  return null;
}

/**
 * ข้อความหลัง "(ระบุ)" ของเงินได้ประเภทอื่น ๆ เช่น "(ระบุ) (ค่าโฆษณา) 10,000.00" → "ค่าโฆษณา"
 * อ่านทีละตัวอักษรแทน regex /\(ระบุ\)\s*\(?([^()\d]{2,80}?)\)?\s*(?=\d|$)/ ที่ backtrack ได้ช้า
 * กติกาเดิม: ข้อความ 2-80 ตัวที่ไม่มีวงเล็บหรือตัวเลข ปิดด้วย ")" ได้ แล้วต้องตามด้วยตัวเลขหรือจบบรรทัด
 */
const SPECIFY_MARK = '(ระบุ)';
function specifiedText(line) {
  for (let at = line.indexOf(SPECIFY_MARK); at >= 0; at = line.indexOf(SPECIFY_MARK, at + 1)) {
    const raw = line.slice(at + SPECIFY_MARK.length);
    let rest = raw.trimStart();
    // ช่องว่างหน้าข้อความนับรวมในความยาวขั้นต่ำได้ ยกเว้นเมื่อมี "(" คั่นอยู่
    let lead = raw.length - rest.length;
    if (rest.startsWith('(')) { rest = rest.slice(1); lead = 0; }
    let end = 0;
    while (end < rest.length && !'()0123456789'.includes(rest[end])) end += 1;
    const text = rest.slice(0, end);
    let after = rest.slice(end);
    if (after.startsWith(')')) after = after.slice(1);
    after = after.trimStart();
    const fits = lead + text.length >= 2 && text.trimEnd().length <= 80;
    if (fits && (after === '' || /^\d/.test(after))) return text.trim();
  }
  return '';
}

function descriptionIn(line, code) {
  if (code === 'r6') {
    const text = specifiedText(line);
    if (text) return text;
  }
  if (code === 'r5') {
    const m = line.match(/ฯลฯ\s*\(([^()]{2,80})\)/);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * แยกข้อมูล 50 ทวิ จากข้อความ
 * คืน { recognized, fields: { payer, payerTaxId, payee, incomeType, amount, wht, rate, datePaid, description }, warnings }
 * แต่ละช่องเป็น { value, evidence, note? } หรือ null เมื่อไม่พบในไฟล์
 */
export function parseTawi50(rawText) {
  const text = normalizeText(rawText);
  const lines = text.split('\n').map((l) => l.replace(/ {2,}/g, ' ').trim()).filter(Boolean);
  const warnings = [];
  const fields = {};

  const recognized = has(text, '50 ทวิ') || has(text, 'หนังสือรับรองการหักภาษี');
  if (!recognized) warnings.push('ไม่พบหัวเรื่อง "หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)" ในไฟล์ ตรวจว่าเลือกไฟล์ถูกฉบับ');

  /* ---------- คู่กรณี ---------- */
  // หัวข้อของสองช่องนี้เขียนได้หลายแบบแล้วแต่ผู้ออกเอกสาร แบบของกรมสรรพากรใช้ "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย"
  // แต่แบบที่เอเจนซี/ผู้จ้างทำเองมักใช้ "ผู้มีเงินได้หัก ณ ที่จ่าย" หรือ "ผู้จ่ายเงิน" จึงรับทุกแบบ
  const iTable = lines.findIndex((l) => has(l, 'ประเภทเงินได้'));
  const headerEnd = iTable >= 0 ? iTable : lines.length;
  // ค้นเฉพาะส่วนหัวก่อนตารางเงินได้ คำว่า "ผู้จ่ายเงิน" ใต้ช่องลายเซ็นท้ายเอกสารจึงไม่ถูกจับผิดตัว
  const findHead = (keys, from = 0) => lines.findIndex((l, i) => i >= from && i < headerEnd && hasAny(l, keys));
  const iPayer = findHead(['ผู้มีหน้าที่หักภาษี', 'ผู้มีเงินได้หักภาษี', 'ผู้มีเงินได้หัก', 'ผู้หักภาษี', 'ผู้จ่ายเงินได้', 'ผู้จ่ายเงิน']);
  const iPayee = findHead(['ผู้ถูกหักภาษี', 'ผู้รับเงินได้', 'ผู้มีเงินได้', 'ผู้รับเงิน'], iPayer + 1);

  // บล็อกของผู้จ่าย: ตั้งแต่หัวข้อจนถึงหัวข้อของผู้ถูกหัก (หรือ 6 บรรทัดถัดไปถ้าไม่เจอ)
  // ถ้าไม่เจอหัวข้อเลย ใช้ส่วนหัวทั้งก้อนแทนแล้วติดหมายเหตุให้ผู้ใช้ตรวจ เพราะไม่มีป้ายยืนยันว่าเป็นฝ่ายไหน
  const unlabelled = iPayer < 0;
  const payerBlock = unlabelled ? lines.slice(0, headerEnd)
    : lines.slice(iPayer, iPayee > iPayer ? iPayee : iPayer + 6);
  const guessNote = unlabelled ? 'ไฟล์ไม่มีหัวข้อ "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย" ระบบเดาจากส่วนหัวของเอกสาร กรุณาตรวจกับต้นฉบับ' : null;
  const name = nameIn(payerBlock);
  if (name) fields.payer = { value: name.value, evidence: clip(name.evidence), note: guessNote };
  const id = taxIdIn(payerBlock);
  if (id) {
    fields.payerTaxId = {
      value: id.value,
      evidence: clip(id.evidence),
      note: id.valid ? guessNote : 'เลขผู้เสียภาษีที่อ่านได้ไม่ผ่านการตรวจหลักสุดท้าย อาจอ่านตัวเลขผิด',
    };
  }
  if (iPayee >= 0) {
    const payee = nameIn(lines.slice(iPayee, iPayee + 8));
    if (payee) fields.payee = { value: payee.value, evidence: clip(payee.evidence) };
  }
  if (!fields.payer) warnings.push('อ่านชื่อผู้จ่ายเงินไม่ได้ กรุณากรอกเอง');
  if (!fields.payee) warnings.push('อ่านชื่อผู้ถูกหักภาษี (ผู้รับเงิน) ไม่ได้ กรุณาตรวจว่าเป็นชื่อของคุณจริง');

  /* ---------- ตารางเงินได้ ---------- */
  const iTotal = lines.findIndex((l) => has(l, 'รวมเงินที่จ่าย'));
  let totals = null;
  if (iTotal >= 0) {
    let m = moneysIn(lines[iTotal]);
    if (m.length < 2 && lines[iTotal + 1]) m = m.concat(moneysIn(lines[iTotal + 1]));
    if (m.length >= 2) totals = { paid: m[m.length - 2], tax: m[m.length - 1], evidence: lines[iTotal] };
  }

  const from = Math.max(iPayee, 0);
  const to = iTotal >= 0 ? iTotal : lines.length;
  const rows = [];
  for (let i = from; i < to; i += 1) {
    const m = moneysIn(lines[i]);
    if (m.length < 2) continue;
    // ป้ายแถวอาจขึ้นหลายบรรทัด ตัวเลขจึงอาจอยู่คนละบรรทัดกับเลขแถว ย้อนดูไม่เกิน 4 บรรทัด
    let code = null;
    for (let k = i; k >= Math.max(from, i - 4) && !code; k -= 1) code = rowCodeOf(lines[k]);
    rows.push({ paid: m[m.length - 2], tax: m[m.length - 1], code, line: lines[i] });
  }

  const row = rows[0];
  if (rows.length > 1) {
    warnings.push(`ไฟล์มีเงินได้ ${rows.length} รายการ ระบบกรอกรายการแรกให้ รายการอื่นให้บันทึกแยกทีละรายการ`);
  }
  const paid = row ? row.paid : totals && totals.paid;
  const whtVal = row ? row.tax : totals && totals.tax;
  if (paid != null) {
    fields.amount = { value: paid, evidence: clip(row ? row.line : totals.evidence) };
    fields.wht = { value: whtVal, evidence: clip(row ? row.line : totals.evidence) };
    if (row && totals && rows.length === 1 && (totals.paid !== row.paid || totals.tax !== row.tax)) {
      warnings.push('ยอดในแถวเงินได้ไม่ตรงกับบรรทัด "รวมเงินที่จ่ายและภาษีที่หักนำส่ง" ตรวจตัวเลขกับต้นฉบับ');
    }
    if (whtVal > paid) warnings.push('ภาษีที่หักมากกว่ายอดเงินที่จ่าย ตัวเลขที่อ่านได้น่าจะสลับกันหรืออ่านผิด');
  } else {
    warnings.push('อ่านยอดเงินที่จ่ายและภาษีที่หักไม่ได้ กรุณากรอกเอง');
  }

  if (fields.amount) {
    const rate = detectRate(fields.amount.value, fields.wht.value);
    if (rate != null) {
      fields.rate = { value: rate, evidence: fields.wht.evidence };
    } else {
      const pct = fields.amount.value > 0 ? ((fields.wht.value / fields.amount.value) * 100).toFixed(2) : '-';
      warnings.push(`ภาษีที่หักในไฟล์คิดเป็น ${pct}% ของยอดเงิน ไม่ตรงกับอัตราที่ระบบรองรับ (${RATES.join(', ')}%) กรุณาเลือกอัตราเองและตรวจตัวเลข`);
    }
  }

  if (row && row.code) {
    const supported = { '40(2)': 'มาตรา 40(2)', '40(8)': 'มาตรา 40(8)' }[row.code];
    if (supported) {
      fields.incomeType = { value: supported, evidence: clip(row.line) };
    } else {
      fields.incomeType = { value: null, evidence: clip(row.line), note: `ไฟล์ระบุ${codeLabel(row.code)} ซึ่งหน้านี้บันทึกได้เฉพาะมาตรา 40(2) และ 40(8) กรุณาเลือกประเภทให้ตรงกับเงินได้จริง` };
    }
    const desc = descriptionIn(row.line, row.code);
    if (desc) fields.description = { value: desc, evidence: clip(row.line) };
  } else if (paid != null) {
    warnings.push('ไม่พบว่ายอดเงินอยู่ในแถวประเภทเงินได้ใด กรุณาเลือกประเภทเงินได้เอง');
  }

  if (row) {
    const d = dateIn(row.line);
    if (d) fields.datePaid = { value: d, evidence: clip(row.line) };
  }

  return { recognized, fields, warnings };
}
