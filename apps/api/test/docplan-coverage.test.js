'use strict';
/**
 * docplan-coverage.test.js ข้อมูลที่ผู้ใช้กรอกต้องไปถึงเอกสาร PDF ทุกช่อง (WP5)
 * ------------------------------------------------------------------------------
 * ที่มา: ใบส่งมอบงานที่ออกจากระบบจริงมีตาราง "รายการ" ที่มีแต่เลขลำดับ ชื่อรายการว่างหมด
 * และมียอด "ศูนย์บาทถ้วน" ทั้งที่ใบส่งมอบงานไม่มีเงิน เพราะตัววาดใช้แม่แบบใบเสร็จกับเอกสาร
 * ที่เก็บรายการคนละแบบ (Influencer · ลิงก์ · สถานะ) ชุดทดสอบเดิมไม่จับ เพราะข้อมูลตัวอย่าง
 * ใส่รายการแบบใบเสร็จให้ทุกประเภท ไม่ได้ใช้รูปร่างข้อมูลจริงของแต่ละประเภท
 *
 * ไฟล์นี้จึงสร้างข้อมูลตัวอย่างจาก "นิยามฟอร์มจริง" (docschema) ไม่ได้เขียนมือ
 * ใส่ค่าที่ไม่ซ้ำกันทุกช่อง แล้วตรวจว่าค่าทุกช่องไปปรากฏในแผนผังการวาด
 * เพิ่มช่องใหม่ในฟอร์มเมื่อไร ถ้าลืมเพิ่มในตัววาด PDF ข้อทดสอบนี้จะไม่ผ่านทันที
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../lib/docschema.js');
const docplan = require('../lib/docplan.js');

/**
 * ช่องที่ไม่ได้มีไว้พิมพ์เป็นข้อความตรง ๆ แต่ใช้ควบคุมฟอร์มหรือคำนวณยอด
 * ผลของช่องเหล่านี้ไปโผล่ในรูปอื่นแทน (ยอดเงิน ช่องติ๊ก อากรแสตมป์) ซึ่งมีข้อทดสอบแยกไว้แล้ว
 * เพิ่มช่องเข้ารายการนี้ต้องมีเหตุผลกำกับทุกครั้ง
 */
const NOT_PRINTED_AS_TEXT = new Set([
  'docPurpose',       // จุดประสงค์ตอนสร้าง (ใช้เองหรือส่งคู่ค้า) ไม่ใช่เนื้อหาเอกสาร
  'includeVat',       // ช่องติ๊ก ผลคือบรรทัด VAT ในกล่องยอดเงิน
  'hasWht',           // ช่องติ๊ก ผลคือบรรทัดหัก ณ ที่จ่าย
  'whtRate', 'fee', 'amount', 'surcharge', // ใช้คำนวณ ผลคือยอดเงิน
  'taxYear',          // ปีภาษีสำหรับจัดกลุ่มในระบบ
  'issuerIs',         // ผู้ออกเอกสารเป็นผู้มอบหรือผู้รับมอบ ผลคือตำแหน่งลายเซ็น
  'grantorType',      // บุคคล/นิติบุคคล ผลคือถ้อยคำในหนังสือมอบอำนาจ
  'actCount',         // ครั้งเดียว/หลายครั้ง ผลคืออากรแสตมป์ 10/30 บาท
  'powers',           // ผลคือช่องติ๊ก ตรวจแยกใน docplan-alltypes.test.js
  'installmentCount', // ผลคือจำนวนแถวงวดเงิน
  'incomeCode',       // ผลคือบรรทัดที่มียอดในตาราง 50 ทวิ
  'whtCondition',     // ผลคือช่องติ๊กเงื่อนไขการหัก
  'pndForm',          // ผลคือช่องติ๊กลำดับแบบ
  'taxMonth',         // ผลคือช่องติ๊กเดือนภาษี
  'filingType',       // ผลคือช่องติ๊กยื่นปกติ/เพิ่มเติม
  'remitUnder',       // ผลคือช่องติ๊กมาตราที่นำส่ง
  'payMethod',        // ผลคือช่องติ๊กหรือชื่อวิธีชำระ
  'acceptStatus',     // ผลคือช่องติ๊กการรับมอบ
  'platforms',        // รายการหลายค่า ตรวจแยกในข้อสัญญา Influencer
]);

/**
 * ช่องที่แสดงเมื่อมีช่องอื่นคู่กันเท่านั้น (ถูกต้องตามตรรกะ) ข้อทดสอบจึงใส่ช่องคู่ให้ด้วย
 * เช่น ชื่อธนาคารไม่มีความหมายถ้าไม่มีเลขบัญชี
 */
const DEPENDS = {
  INVOICE: { bankName: { bankAccountNo: '000-0-00000-0' }, bankAccountName: { bankAccountNo: '000-0-00000-0' } },
  RECEIPT: { payMethodOther: { payMethod: 'other' } },
  ETAX_RECEIPT: { payMethodOther: { payMethod: 'other' } },
  DELIVERY: { periodEnd: { periodStart: '2026-01-01' } },
  PAYMENT: { payBankBranch: { payBank: 'ธนาคาร' }, payMethodOther: { payMethod: 'other' }, incomeDesc: { hasWht: true } },
  POA: { grantorAuthName: { grantorType: 'juristic' }, grantorPosition: { grantorType: 'juristic' } },
  EWHT: { payDate: { incomeCode: '1' }, incomeDesc: { incomeCode: '5' } },
};

const FORMS = Object.entries(DS.FORMS);
const fieldsOf = (form) => [...(form.sections || []), ...(form.sectionsAfter || [])].flatMap((s) => s.fields || []);

/** ค่าตัวอย่างที่ไม่ซ้ำกัน จะได้รู้ว่าค่าที่เห็นในเอกสารมาจากช่องไหน */
function sampleValue(def, tag) {
  switch (def.type) {
    case 'date': return '2026-03-17';                                  // จะกลายเป็น "17 มี.ค." / "17 มีนาคม"
    case 'number': case 'money': return 4321;
    case 'select': return (def.options[0] && (def.options[0].value ?? def.options[0]));
    case 'taxid': return '0105559876541';
    case 'citizenid': return '1100701234561';
    default: return `ค่าทดสอบ-${tag}`;
  }
}
const appears = (json, def, value, tag) => {
  if (def.type === 'date') return /17 มี\.ค\. 2569|17 มีนาคม 2569/.test(json); // แบบย่อ (ตาราง) หรือแบบเต็ม
  if (def.type === 'number' || def.type === 'money') return json.includes('4321') || json.includes('4,321');
  if (def.type === 'taxid') return json.includes('0-1055-59876-54-1') || json.includes('0105559876541');
  if (def.type === 'citizenid') return json.includes('1-1007-01234-56-1') || json.includes('1100701234561');
  if (def.type === 'select') {
    const opt = def.options.find((o) => (o.value ?? o) === value);
    return json.includes(String(value)) || (opt && opt.label && json.includes(opt.label));
  }
  return json.includes(`ค่าทดสอบ-${tag}`);
};

/* ------------------------------------------------ คอลัมน์รายการทุกประเภท */

for (const [type, form] of FORMS) {
  const cols = (form.items && form.items.cols) || [];
  if (!cols.length) continue;
  test(`${type}: ค่าในรายการทุกคอลัมน์ต้องปรากฏในเอกสาร (${cols.join(', ')})`, () => {
    const item = {};
    for (const k of cols) item[k] = sampleValue(DS.ITEM_COLS[k], `item-${k}`);
    const plan = docplan.build({ type, docNo: 'X-1', fields: {}, items: [item], issuer: {}, partyInfo: {} });
    const json = JSON.stringify(plan.blocks);
    const missing = cols.filter((k) => !appears(json, DS.ITEM_COLS[k], item[k], `item-${k}`));
    assert.deepEqual(missing, [], `คอลัมน์ที่ผู้ใช้กรอกแต่ไม่อยู่ใน PDF: ${missing.join(', ')}`);
  });
}

/* ------------------------------------------------ ช่องในฟอร์มทุกประเภท */

for (const [type, form] of FORMS) {
  const defs = fieldsOf(form).filter((d) => !NOT_PRINTED_AS_TEXT.has(d.key));
  test(`${type}: ช่องที่กรอกในฟอร์มต้องปรากฏในเอกสาร`, () => {
    const missing = [];
    // ใส่ทีละช่อง เพราะหลายช่องแสดงเฉพาะเมื่อมีค่า และค่าตัวอย่างประเภทเดียวกันแยกกันไม่ออกถ้าใส่พร้อมกัน
    for (const def of defs) {
      const value = sampleValue(def, def.key);
      const extra = (DEPENDS[type] && DEPENDS[type][def.key]) || {};
      const plan = docplan.build({ type, docNo: 'X-1', fields: { ...extra, [def.key]: value }, items: [], issuer: {}, partyInfo: {} });
      if (!appears(JSON.stringify(plan.blocks), def, value, def.key)) missing.push(def.key);
    }
    assert.deepEqual(missing, [], `ช่องที่ผู้ใช้กรอกแต่ไม่อยู่ใน PDF: ${missing.join(', ')}`);
  });
}

/* ------------------------------------------------ รูปแบบเฉพาะของเอกสาร */

test('ใบส่งมอบงานต้องไม่มีกล่องยอดเงินและจำนวนเงินตัวหนังสือ (ไม่ใช่เอกสารการเงิน)', () => {
  const plan = docplan.build({ type: 'DELIVERY', fields: {}, items: [{ influencer: 'ก', pieces: 2 }, { influencer: 'ข', pieces: 3 }] },
    { bahtText: () => 'ศูนย์บาทถ้วน' });
  assert.equal(plan.blocks.filter((b) => b.type === 'totals').length, 0);
  assert.ok(!JSON.stringify(plan.blocks).includes('บาทถ้วน'));
  const table = plan.blocks.find((b) => b.type === 'table');
  assert.equal(table.rows[table.rows.length - 1].pieces, '5', 'ต้องมีแถวรวมจำนวนชิ้นงาน');
});

test('ใบสำคัญจ่ายต้องมีช่องลงนามครบ 4 ฝ่าย', () => {
  const plan = docplan.build({ type: 'PAYMENT', fields: {}, items: [] });
  const roles = plan.blocks.filter((b) => b.type === 'signature').flatMap((b) => b.boxes.map((x) => x.role));
  assert.deepEqual(roles, ['ผู้จัดทำ', 'ผู้อนุมัติ', 'ผู้จ่ายเงิน', 'ผู้รับเงิน']);
});

test('ใบแจ้งหนี้ต้องบอกบัญชีธนาคารที่ให้ลูกค้าโอนเงินเข้า', () => {
  const plan = docplan.build({ type: 'INVOICE', fields: { bankName: 'ธนาคารกสิกรไทย', bankAccountName: 'บริษัท ก จำกัด', bankAccountNo: '123-4-56789-0' }, items: [] });
  const json = JSON.stringify(plan.blocks);
  for (const v of ['ธนาคารกสิกรไทย', 'บริษัท ก จำกัด', '123-4-56789-0']) assert.ok(json.includes(v), `ไม่มี ${v}`);
});

test('ใบแนบ ภ.ง.ด. ต้องมีคอลัมน์เงื่อนไขการหักภาษี และอธิบายรหัสไว้ท้ายเอกสาร', () => {
  const plan = docplan.build({ type: 'PND53', fields: {}, items: [{ payeeName: 'ก', condition: '2' }] });
  const table = plan.blocks.filter((b) => b.type === 'table').pop();
  assert.ok(table.columns.some((c) => c.key === 'condition'));
  assert.equal(table.rows[0].condition, '2');
  assert.ok(JSON.stringify(plan.blocks).includes('2 = ออกให้ตลอดไป'));
});
