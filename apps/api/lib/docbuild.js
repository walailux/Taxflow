'use strict';

/**
 * docbuild.js ตรวจสอบและประกอบข้อมูลเอกสาร (ver16) ตามนิยามใน public/js/docschema.js
 * -------------------------------------------------------------
 * ฝั่งหน้าเว็บกับฝั่งเซิร์ฟเวอร์ใช้นิยามฟิลด์และสูตรคำนวณชุดเดียวกัน ตัวเลขใน preview จึงตรงกับที่บันทึกจริง
 * เซิร์ฟเวอร์ไม่เชื่อยอดเงินที่ส่งมาจากหน้าเว็บ คำนวณใหม่ทั้งหมดจากรายการ/อัตราที่ผ่านการตรวจแล้วเสมอ
 */

const DS = require('./docschema.js');
const thaiid = require('./thaiid');
const profile = require('./profile');

const round2 = DS.round2;
const str = (v, max = 300) => String(v == null ? '' : v).replaceAll('\u0000', '').trim().slice(0, max);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => DATE_RE.test(v) && !Number.isNaN(new Date(v + 'T00:00:00Z').getTime());

/** ข้อมูลผู้ออกเอกสาร ณ เวลาที่สร้าง/แก้ไข เก็บไว้ในเอกสาร กันโปรไฟล์ที่เปลี่ยนภายหลังไปแก้เอกสารที่ออกแล้ว */
function issuerSnapshot(user) {
  const juristic = profile.isJuristic(user);
  const bank = user.bank || {};
  return {
    role: user.role,
    entityType: juristic ? 'juristic' : 'individual',
    name: (juristic ? user.companyName : user.displayName) || user.displayName || '',
    tradeName: user.tradeName || '',
    channelName: user.channelName || '',
    socials: user.socials || '',
    taxId: user.taxId || '',
    branch: profile.branchLabel(user),
    branchNo: juristic && user.branchType === 'branch' ? String(user.branchCode || '').padStart(5, '0') : '00000',
    address: profile.formatAddress(user.addr || {}) || user.address || '',
    addr: user.addr || {},
    phone: user.phone || '',
    email: user.email || '',
    contactName: user.contactName || '',
    authName: juristic ? (user.authName || '') : (user.displayName || ''),
    authPosition: juristic ? (user.authPosition || '') : '',
    vatRegistered: !!user.vatRegistered,
    bank: { bankName: bank.bankName || '', accountNo: bank.accountNo || '', accountName: bank.accountName || '' },
  };
}

function taxIdMsg(digits, label) {
  if (!digits) return null;
  if (!thaiid.isValidTaxId(digits)) return `${label} ไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักที่ผ่านการตรวจ check digit)`;
  return null;
}

function cleanValue(def, raw, errors) {
  switch (def.type) {
    case 'textarea': return str(raw, 4000);
    case 'date': {
      const v = str(raw, 10);
      if (v && !isDate(v)) { errors.push(`"${def.label}" รูปแบบวันที่ไม่ถูกต้อง`); return ''; }
      return v;
    }
    case 'number': {
      if (raw === '' || raw == null) return '';
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { errors.push(`"${def.label}" ต้องเป็นตัวเลขที่ไม่ติดลบ`); return ''; }
      return n;
    }
    case 'money': {
      if (raw === '' || raw == null) return '';
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { errors.push(`"${def.label}" ต้องเป็นจำนวนเงินที่ไม่ติดลบ`); return ''; }
      return round2(n);
    }
    case 'select': case 'radio': {
      const v = str(raw, 60);
      const ok = (def.options || []).some((o) => String(typeof o === 'object' ? o.value : o) === v);
      return ok ? v : '';
    }
    case 'checks': {
      const allowed = new Set((def.options || []).map((o) => String(o.value)));
      return (Array.isArray(raw) ? raw : []).map(String).filter((x) => allowed.has(x));
    }
    case 'checkbox': return !!raw;
    case 'taxid': case 'citizenid': {
      const v = thaiid.digitsOnly(raw);
      const m = taxIdMsg(v, def.label);
      if (m) errors.push(m);
      return v;
    }
    default: return str(raw, 300);
  }
}
const isEmpty = (v) => v === '' || v == null || (Array.isArray(v) && !v.length) || v === false;

function cleanItems(d, rawItems, errors) {
  if (!d.items) return [];
  const cols = d.items.cols;
  const rows = [];
  (Array.isArray(rawItems) ? rawItems : []).slice(0, 300).forEach((raw, idx) => {
    if (!raw || typeof raw !== 'object') return;
    const row = {};
    const rowErr = [];
    for (const c of cols) {
      const def = { ...DS.ITEM_COLS[c], label: DS.ITEM_COLS[c].label };
      if (def.type === 'select' && Array.isArray(def.options) && typeof def.options[0] !== 'object') {
        const v = str(raw[c], 60);
        row[c] = def.options.includes(v) ? v : (c === 'condition' ? '1' : '');
      } else row[c] = cleanValue(def, raw[c], rowErr);
    }
    // meta ของแถวที่ดึงจากเอกสารต้นทาง (ภ.ง.ด.)
    if (d.items.pnd) {
      row.sourceId = Number(raw.sourceId) || null;
      row.sourceNo = str(raw.sourceNo, 40);
      row.sourceType = ['EWHT', 'PAYMENT'].includes(raw.sourceType) ? raw.sourceType : '';
      row.incomeCode = DS.INCOME_LABEL[raw.incomeCode] ? raw.incomeCode : '5';
    }
    const blank = cols.every((c) => isEmpty(row[c]) || (c === 'qty' || c === 'pieces' || c === 'unit' || c === 'condition'));
    if (blank) return;
    rowErr.forEach((e) => errors.push(`รายการที่ ${idx + 1}: ${e}`));
    for (const c of cols) {
      if (DS.ITEM_COLS[c].required && isEmpty(row[c])) errors.push(`รายการที่ ${idx + 1}: กรุณากรอก "${DS.ITEM_COLS[c].label}"`);
    }
    if (d.mode === 'priced') {
      if (!(Number(row.qty) > 0)) errors.push(`รายการที่ ${idx + 1}: จำนวนต้องมากกว่า 0`);
      if (isEmpty(row.price)) row.price = 0;
      if (isEmpty(row.discount)) row.discount = 0;
      if (Number(row.discount) > round2(Number(row.qty) * Number(row.price))) errors.push(`รายการที่ ${idx + 1}: ส่วนลดมากกว่ามูลค่ารายการ`);
    }
    if (cols.includes('amount') && !d.items.pnd && !(Number(row.amount) > 0)) errors.push(`รายการที่ ${idx + 1}: จำนวนเงินต้องมากกว่า 0`);
    if (d.items.pnd) {
      if (!(Number(row.amount) > 0)) errors.push(`รายการที่ ${idx + 1}: จำนวนเงินที่จ่ายต้องมากกว่า 0`);
      if (row.wht === '') row.wht = round2(Number(row.amount) * (Number(row.rate) || 0) / 100);
      if (Number(row.wht) > Number(row.amount)) errors.push(`รายการที่ ${idx + 1}: ภาษีที่หักมากกว่าเงินได้`);
    }
    rows.push(row);
  });
  return rows;
}

/**
 * ตรวจและประกอบข้อมูลเอกสาร
 * ctx.resolveRef(type[], docNo) -> doc | null ใช้ผูกเลขที่เอกสารอ้างอิงกับเอกสารจริงของผู้ใช้
 */
async function build(user, type, body, ctx = {}) {
  const d = DS.FORMS[type];
  const errors = [];
  if (!d) return { errors: ['ประเภทเอกสารไม่ถูกต้อง หรือไม่รองรับแล้ว'] };
  if (!d.roles.includes(user.role)) return { errors: [`บัญชีประเภทนี้ไม่สามารถออก "${d.label}" ได้`] };
  // WP5: เอกสารกลุ่ม e-Tax ออกได้เฉพาะผู้จดทะเบียนภาษีมูลค่าเพิ่ม
  // ตรวจที่ฝั่งเซิร์ฟเวอร์ด้วย ไม่พึ่งการซ่อนปุ่มที่หน้าเว็บอย่างเดียว เพราะผู้ใช้ยิง API ตรงได้
  if (d.requiresVat && !user.vatRegistered) {
    return { errors: [`ออก "${d.label}" ได้เฉพาะผู้ประกอบการที่จดทะเบียนภาษีมูลค่าเพิ่มแล้ว (ประมวลรัษฎากร มาตรา 86)`] };
  }
  const bf = (body && typeof body.fields === 'object' && body.fields) || {};
  const issuer = issuerSnapshot(user);

  /* ----- Data Validation: ค่าว่าง / ชนิดข้อมูล / ช่วง / รูปแบบ / ความยาว / ความสัมพันธ์ ----- */
  // ตรวจจาก "ค่าดิบ" ที่ส่งมา ด้วยกติกาชุดเดียวกับหน้าเว็บ (DS.validateDoc) ก่อนแปลงค่า
  // จึงจับได้ทั้งกรณีกรอกตัวอักษรในช่องตัวเลข และค่าที่ยาว/สั้นเกินไป แทนที่จะตัดทิ้งเงียบ ๆ
  const bp = (body && typeof body.party === 'object' && body.party) || {};
  const rawItems = (Array.isArray(body && body.items) ? body.items : []).slice(0, 300)
    .filter((r) => r && typeof r === 'object' && d.items && d.items.cols.some((c) => !isEmpty(r[c]) && !['qty', 'pieces', 'unit', 'condition', 'platform', 'itemStatus'].includes(c)));
  const rawFields = { ...bf };
  if (d.mode === 'priced') rawFields.billDiscount = bf.billDiscount;
  const V = DS.validateDoc(type, { fields: rawFields, party: bp, items: rawItems }, { today: ctx.today, vatRegistered: !!user.vatRegistered });
  errors.push(...V.errors);
  if (rawItems.length > 300) errors.push('รายการในเอกสารเดียวต้องไม่เกิน 300 รายการ');

  /* ----- แปลงค่า (ผ่านการตรวจแล้ว) ----- */
  const ignore = [];
  const fields = {};
  const defs = DS.allFields(type);
  for (const def of defs) fields[def.key] = cleanValue(def, bf[def.key], ignore);
  if (d.mode === 'priced') fields.billDiscount = d.items.billDiscount ? cleanValue({ type: 'money', label: 'ส่วนลดท้ายบิล' }, bf.billDiscount, ignore) : '';
  // รายละเอียดส่วนลดท้ายบิล (เช่น "ลูกค้าประจำ 5%") พิมพ์ต่อท้ายบรรทัดส่วนลดในเอกสาร · เก็บเฉพาะตอนมีส่วนลดจริง
  if (d.mode === 'priced') {
    const note = d.items.billDiscount && Number(fields.billDiscount) > 0 ? String(bf.billDiscountNote == null ? '' : bf.billDiscountNote).replace(/\s+/g, ' ').trim() : '';
    if (note.length > 60) errors.push('"รายละเอียดส่วนลด" ต้องไม่เกิน 60 ตัวอักษร');
    fields.billDiscountNote = note.slice(0, 60);
  }
  if (d.items && d.items.vat) fields.includeVat = !!bf.includeVat;
  for (const def of defs) {
    if (def.showIf && !DS.matchCond(def.showIf, fields)) fields[def.key] = def.type === 'checks' ? [] : '';
  }

  const party = {};
  if (d.party) {
    for (const k of d.party.keys) party[k] = cleanValue(DS.PARTY_FIELDS[k], bp[k], ignore);
    if (party.taxId && party.taxId === issuer.taxId) errors.push(`${d.party.role} ต้องไม่ใช่ผู้ออกเอกสารเอง (เลขประจำตัวผู้เสียภาษีซ้ำกับของคุณ)`);
  }

  const items = cleanItems(d, rawItems, ignore);

  /* ----- กติกาเฉพาะประเภท ----- */
  if (d.items && d.items.vat === 'issuer' && fields.includeVat && !user.vatRegistered) {
    errors.push('บัญชีนี้ยังไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม จึงคิด VAT ในเอกสารนี้ไม่ได้ (ประมวลรัษฎากร มาตรา 86)');
  }
  const contractVat = defs.find((x) => x.key === 'includeVat' && x.vatGate);
  if (contractVat && fields.includeVat && !user.vatRegistered) {
    errors.push('บัญชีนี้ยังไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม จึงคิด VAT ในสัญญาไม่ได้');
  }
  // ผู้ออกเอกสารเป็นผู้ขาย/ผู้รับจ้างที่จดทะเบียน VAT แล้ว ต้องคิด VAT เสมอ (ไม่ให้ปิดเองแม้ยิง API ตรง)
  if (user.vatRegistered && ((d.items && d.items.vat === 'issuer') || contractVat)) fields.includeVat = true;
  if (type === 'PAYMENT' && fields.hasWht) {
    if (!party.taxId) errors.push('มีการหักภาษี ณ ที่จ่าย ต้องระบุเลขประจำตัวผู้เสียภาษีของผู้รับเงิน (ใช้ออก 50 ทวิ และ ภ.ง.ด.3/53)');
    if (!party.address) errors.push('มีการหักภาษี ณ ที่จ่าย ต้องระบุที่อยู่ของผู้รับเงิน');
  }
  if (type === 'POA') {
    if (!fields.powers.length && !fields.scopeDetail) errors.push('กรุณาเลือกเรื่องที่มอบอำนาจอย่างน้อย 1 ข้อ หรือระบุรายละเอียดขอบเขตอำนาจ');
  }
  let refDocId = null;
  if (type === 'EWHT') {
    if (fields.pndForm === 'auto' || !fields.pndForm) fields.pndForm = DS.autoPndForm(party, fields.incomeCode);
    const jur = DS.isJuristicParty(party);
    if (fields.pndForm === 'PND53' && !jur) errors.push('ผู้ถูกหักภาษีเป็นบุคคลธรรมดา ต้องยื่นใน ภ.ง.ด.3 ไม่ใช่ ภ.ง.ด.53');
    if (['PND3', 'PND3A', 'PND1A', 'PND1A_SP', 'PND2', 'PND2A'].includes(fields.pndForm) && jur) errors.push('ผู้ถูกหักภาษีเป็นนิติบุคคล ต้องยื่นใน ภ.ง.ด.53');
    if (!jur && fields.pndForm === 'PND3' && ['1', '2'].includes(fields.incomeCode)) {
      errors.push('เงินได้ตามมาตรา 40(1)/40(2) ของบุคคลธรรมดาต้องยื่นใน ภ.ง.ด.1/ภ.ง.ด.1ก ไม่ใช่ ภ.ง.ด.3');
    }
    if (fields.payDate) fields.taxYear = Number(fields.payDate.slice(0, 4)) + 543;
    if (fields.paymentRef && ctx.resolveRef) {
      const src = await ctx.resolveRef(['PAYMENT'], fields.paymentRef);
      if (!src) errors.push(`ไม่พบใบสำคัญจ่ายเลขที่ ${fields.paymentRef} ในบัญชีของคุณ`);
      else {
        refDocId = src.id;
        // 50 ทวิ ที่อ้างอิงใบสำคัญจ่าย ต้องมีตัวเลขตรงกับการจ่ายจริง (กันยอดใน ภ.ง.ด. ไม่ตรงกับเงินที่จ่าย)
        const S = src.fields || {};
        if (!S.hasWht) errors.push(`ใบสำคัญจ่าย ${src.docNo} ไม่ได้ระบุว่ามีการหักภาษี ณ ที่จ่าย`);
        else {
          if (round2(fields.amount) !== round2(src.base)) errors.push(`จำนวนเงินที่จ่ายไม่ตรงกับใบสำคัญจ่าย ${src.docNo} (${src.base.toLocaleString('th-TH')} บาท)`);
          if (String(fields.whtRate) !== String(S.whtRate)) errors.push(`อัตราภาษีไม่ตรงกับใบสำคัญจ่าย ${src.docNo} (${S.whtRate}%)`);
          if (String(fields.whtCondition) !== String(S.whtCondition || '1')) errors.push(`เงื่อนไขการหักภาษีไม่ตรงกับใบสำคัญจ่าย ${src.docNo}`);
          if (fields.payDate !== S.payDate) errors.push(`วันที่จ่ายเงินไม่ตรงกับใบสำคัญจ่าย ${src.docNo}`);
          if (party.taxId && src.partyInfo && party.taxId !== src.partyInfo.taxId) errors.push(`ผู้ถูกหักภาษีไม่ตรงกับผู้รับเงินในใบสำคัญจ่าย ${src.docNo}`);
        }
      }
    }
  }
  if (d.mode === 'pnd') {
    const m = Number(fields.taxMonth), yCE = Number(fields.taxYearBE) - 543;
    const seen = new Set();
    items.forEach((row, i) => {
      if (row.sourceId) {
        const key = row.sourceType + row.sourceId;
        if (seen.has(key)) errors.push(`รายการที่ ${i + 1} ซ้ำกับรายการก่อนหน้า (${row.sourceNo})`);
        seen.add(key);
      }
      if (row.payDate && (Number(row.payDate.slice(5, 7)) !== m || Number(row.payDate.slice(0, 4)) !== yCE)) {
        errors.push(`รายการที่ ${i + 1} (${row.payeeName}) วันที่จ่ายไม่อยู่ในเดือนภาษีที่เลือก`);
      }
      const jur = /^0/.test(row.payeeTaxId || '');
      if (type === 'PND3' && jur) errors.push(`รายการที่ ${i + 1} (${row.payeeName}) เป็นนิติบุคคล ต้องยื่นใน ภ.ง.ด.53`);
      if (type === 'PND53' && row.payeeTaxId && !jur) errors.push(`รายการที่ ${i + 1} (${row.payeeName}) เป็นบุคคลธรรมดา ต้องยื่นใน ภ.ง.ด.3`);
    });
  }
  // เลขที่เอกสารอ้างอิงแบบเลือกได้: ถ้าตรงกับเอกสารในระบบ ผูก id ไว้ด้วย (ไม่บังคับ อาจเป็นเอกสารจากภายนอก)
  const refs = {};
  const refDocs = {};
  if (ctx.resolveRef) {
    for (const def of defs.filter((x) => x.type === 'docref' && fields[x.key] && x.key !== 'paymentRef')) {
      const src = await ctx.resolveRef(def.from, fields[def.key]);
      if (src) { refs[def.key] = src.id; refDocs[def.key] = src; }
    }
  }

  /* ----- คำนวณยอด ----- */
  const calc = DS.compute(type, { fields, items, party }, { vatRegistered: !!user.vatRegistered });
  if (d.mode === 'contract' && items.length) {
    const ok = Math.abs(calc.installmentSum - calc.total) < 0.01 || Math.abs(calc.installmentSum - calc.base) < 0.01;
    if (!ok) errors.push(`ยอดรวมงวดการชำระเงิน (${calc.installmentSum.toLocaleString('th-TH')} บาท) ไม่ตรงกับมูลค่างาน`);
  }
  if (['priced', 'amount', 'voucher'].includes(d.mode) && items.length && !(calc.total > 0)) errors.push('ยอดรวมของเอกสารต้องมากกว่า 0');

  /* ----- ตรวจข้อมูลซ้ำกับเอกสารที่มีอยู่แล้ว ----- */
  if (ctx.findDocs) {
    const others = (fn) => ctx.findDocs((x) => x.id !== ctx.selfId && x.status !== 'cancelled' && x.schemaVersion === 2 && fn(x));
    if (type === 'EWHT' && refDocId) {
      const dup = await others((x) => x.type === 'EWHT' && x.refDocId === refDocId);
      if (dup.length) errors.push(`ใบสำคัญจ่าย ${fields.paymentRef} ออกหนังสือรับรอง 50 ทวิ ไปแล้ว (${dup[0].docNo || 'แบบร่าง #' + dup[0].id}) ห้ามออกซ้ำ ถ้าข้อมูลผิดให้ยกเลิกฉบับเดิมก่อน`);
    }
    if (type === 'RECEIPT' && refDocs.invoiceRef) {
      const inv = refDocs.invoiceRef;
      const prev = await others((x) => x.type === 'RECEIPT' && x.refs && x.refs.invoiceRef === inv.id);
      const received = prev.reduce((s2, x) => s2 + (Number(x.total) || 0), 0);
      if (round2(received + calc.total) > round2(inv.total) + 0.009) {
        errors.push(`ยอดรับเงินรวมเกินยอดใบแจ้งหนี้ ${inv.docNo} (ยอด ${inv.total.toLocaleString('th-TH')} บาท · ออกใบเสร็จไปแล้ว ${received.toLocaleString('th-TH')} บาท · คงเหลือ ${round2(inv.total - received).toLocaleString('th-TH')} บาท)`);
      }
    }
    if (d.mode === 'pnd') {
      const dup = await others((x) => x.type === type && String(x.fields.taxMonth) === String(fields.taxMonth) && String(x.fields.taxYearBE) === String(fields.taxYearBE)
        && x.fields.filingType === fields.filingType && (fields.filingType === 'normal' || String(x.fields.filingSeq) === String(fields.filingSeq)));
      if (dup.length) {
        errors.push(fields.filingType === 'normal'
          ? `มีข้อมูล ${d.short} เดือน${DS.THAI_MONTHS[Number(fields.taxMonth) - 1]} ${fields.taxYearBE} แบบ "ยื่นปกติ" อยู่แล้ว แก้ไขฉบับเดิม หรือเลือก "ยื่นเพิ่มเติม"`
          : `มีข้อมูล ${d.short} ยื่นเพิ่มเติมครั้งที่ ${fields.filingSeq} ของเดือนนี้อยู่แล้ว`);
      }
    }
  }

  if (errors.length) return { errors: [...new Set(errors)] };

  const docDateDef = defs.find((x) => x.docDate);
  let partyName = party.name || '';
  let partyTaxId = party.taxId || '';
  let partyAddress = party.address || '';
  if (type === 'POA') {
    const other = fields.issuerIs === 'grantor' ? 'grantee' : 'grantor';
    partyName = fields[other + 'Name'];
    partyTaxId = other === 'grantor' ? fields.grantorIdNo : '';
    partyAddress = fields[other + 'Address'];
  }
  if (d.mode === 'pnd') partyName = `${d.short} เดือน${DS.THAI_MONTHS[Number(fields.taxMonth) - 1] || ''} ${fields.taxYearBE}`;

  const record = {
    schemaVersion: 2,
    fields, items, partyInfo: party, issuer, refs,
    party: partyName, partyTaxId, partyAddress,
    docDate: (docDateDef && fields[docDateDef.key]) || '',
    subtotal: calc.subtotal, lineDiscount: calc.lineDiscount, billDiscount: calc.billDiscount,
    base: calc.base, vatRate: calc.vatRate, vat: calc.vat, total: calc.total,
    whtRate: calc.whtRate, wht: calc.wht, net: calc.net, income: calc.income,
    surcharge: calc.surcharge || 0,
    // ฟอนต์ของเอกสาร PDF เลือกได้สองแบบ (ค่าอื่น = Sarabun) · เก็บไว้กับเอกสาร ออกแล้วหน้าตาไม่เปลี่ยนตามการตั้งค่าภายหลัง
    docFont: ['sarabun', 'googlesans'].includes(body && body.docFont) ? body.docFont : 'sarabun',
  };
  if (type === 'EWHT') {
    // ฟิลด์ระดับบนสำหรับส่วนที่อ่านแบบเดิม (แดชบอร์ด/ส่งออก)
    Object.assign(record, {
      payee: party.name, payeeTaxId: party.taxId, rate: calc.whtRate,
      incomeType: DS.INCOME_TYPES.find((t) => t.code === fields.incomeCode).short,
      description: fields.incomeDesc, refDocId,
    });
  }
  if (d.noSend) record.docPurpose = 'self';
  return { errors: [], record };
}

module.exports = { build, issuerSnapshot };
