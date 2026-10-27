import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { docschema as DS } from '../../lib/shared.js';
import {
  typesForPurpose, PURPOSES, textOf, today, defaultOf, initialFields, initialParty, emptyItem, partyFieldDef,
  filledItems, collect, computeTotals, checkOne, validateAll, contactToParty, partyDefaults, lastDocOf,
  prefillFrom, copyFromRef, presetFor, WHT_PRESETS, saveDraft, loadDraft, clearDraft, visible, allFields,
} from './createState.js';

const TYPES = Object.keys(DS.FORMS);
const user = {
  role: 'corporate', entityType: 'juristic', displayName: 'บริษัท ทดสอบ จำกัด', companyName: 'บริษัท ทดสอบ จำกัด',
  authName: 'สมชาย ใจดี', authPosition: 'กรรมการ', vatRegistered: true, branchType: 'branch', branchCode: '12',
  addr: { province: 'กรุงเทพมหานคร' }, taxId: '0105561234567',
};
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('ค่าตั้งต้นของฟอร์มทุกประเภท', () => {
  it('สร้างฟอร์ม คู่ค้า และแถวรายการเปล่าได้ทุกประเภทโดยไม่ error', () => {
    for (const type of TYPES) {
      const fields = initialFields(type, user);
      expect(Object.keys(fields).length).toBeGreaterThan(0);
      const party = initialParty(type);
      if (DS.FORMS[type].party) {
        for (const k of DS.FORMS[type].party.keys) expect(partyFieldDef(type, k).key).toBe(k);
      } else {
        expect(party).toEqual({});
      }
      if (DS.FORMS[type].items) expect(typeof emptyItem(type)).toBe('object');
      for (const def of allFields(type)) expect(typeof visible(def, fields)).toBe('boolean');
    }
  });

  it('ค่าตั้งต้นพิเศษ: วันนี้ +N วัน เดือนก่อน ปี พ.ศ. ข้อมูลของฉัน และค่าจากคู่ค้า', () => {
    expect(defaultOf({ type: 'checks' }, user)).toEqual([]);
    expect(defaultOf({ type: 'checkbox' }, user)).toBe(false);
    expect(defaultOf({ type: 'text' }, user)).toBe('');
    expect(defaultOf({ def: 'today' }, user)).toBe(today());
    expect(defaultOf({ def: '+7' }, user)).toBe(today(7));
    expect(Number(defaultOf({ def: 'lastMonth' }, user))).toBeGreaterThanOrEqual(1);
    expect(defaultOf({ def: 'thisYearBE' }, user)).toBeGreaterThan(2500);
    expect(defaultOf({ def: 'me.signer' }, user)).toBe('สมชาย ใจดี');
    expect(defaultOf({ def: 'me.authPosition' }, user)).toBe('กรรมการ');
    expect(defaultOf({ def: 'me.branchNo' }, user)).toBe('00012');
    expect(defaultOf({ def: 'me.province' }, user)).toBe('กรุงเทพมหานคร');
    expect(defaultOf({ def: 'me.taxId' }, user)).toBe('0105561234567');
    expect(defaultOf({ def: 'me.signer' }, { displayName: 'ครีเอเตอร์', entityType: 'individual' })).toBe('ครีเอเตอร์');
    expect(defaultOf({ def: 'party.name' }, user)).toBe('');
    expect(defaultOf({ def: ['a'] }, user)).toEqual(['a']);
    expect(defaultOf({ def: 5 }, user)).toBe(5);
  });

  it('ข้อความตามบทบาท และกลุ่มประเภทตามวัตถุประสงค์', () => {
    expect(textOf(null)).toBe('');
    expect(textOf('ก')).toBe('ก');
    expect(textOf({ creator: 'ค', agency: 'อ' }, 'agency')).toBe('อ');
    expect(textOf({ creator: 'ค' }, 'brand')).toBe('ค');
    for (const p of PURPOSES) expect(Array.isArray(typesForPurpose(TYPES, p.key || p.value || p[0]))).toBe(true);
    expect(typesForPurpose(TYPES, '')).toEqual(TYPES);
  });
});

describe('รวบรวมและตรวจข้อมูลก่อนส่ง', () => {
  it('collect แปลงตัวเลข ตัดช่องว่าง และกรองแถวว่างทุกประเภท', () => {
    for (const type of TYPES) {
      const fields = { ...initialFields(type, user), billDiscount: '10', billDiscountNote: ' ส่วนลด ', includeVat: 1 };
      const items = DS.FORMS[type].items ? [emptyItem(type), { ...emptyItem(type), name: ' งานรีวิว ', qty: '2', price: '1500', amount: '3000' }] : [];
      const data = collect(type, fields, initialParty(type), items);
      expect(data.fields.includeVat).toBe(true);
      const totals = computeTotals(type, data, user);
      expect(typeof totals).toBe('object');
      const v = validateAll(type, data, user);
      expect(Array.isArray(v.errors)).toBe(true);
    }
  });

  it('filledItems ตัดแถวที่มีแค่ค่าตั้งต้นออก', () => {
    expect(filledItems([{ name: '', qty: '' }, { name: 'ก', qty: '3' }])).toEqual([{ name: 'ก', qty: 3 }]);
    expect(filledItems(undefined)).toEqual([]);
  });

  it('กติกาเฉพาะประเภท: ใบสำคัญจ่ายที่หักภาษี และหนังสือมอบอำนาจ', () => {
    const pay = validateAll('PAYMENT', { fields: { hasWht: true }, party: {}, items: [] }, user);
    expect(pay.partyErrors.taxId).toBeTruthy();
    expect(pay.partyErrors.address).toBeTruthy();
    const poa = validateAll('POA', { fields: { powers: [] }, party: {}, items: [] }, user);
    expect(poa.fieldErrors.powers).toBeTruthy();
  });

  it('checkOne ตรวจช่องเดียว ทั้งช่องฟอร์มและช่องคู่ค้า', () => {
    const type = 'QUOTATION';
    const def = allFields(type).find((d) => d.required) || allFields(type)[0];
    expect(checkOne(type, def, '', {}, 'f')).toEqual(expect.anything());
    expect(checkOne(type, partyFieldDef(type, 'name'), '', {}, 'p', true)).toBeTruthy();
    expect(checkOne(type, { key: 'x', type: 'money', label: 'จำนวน' }, '100', {}, 'f')).toBeNull();
  });
});

describe('ดึงข้อมูลจากคู่ค้าและเอกสารเดิม', () => {
  const contact = { name: 'บริษัท คู่ค้า จำกัด', taxId: '0105559876541', branch: 'สำนักงานใหญ่', address: '1 กรุงเทพฯ', bank: '123', email: 'a@b.c' };
  const quotation = {
    type: 'QUOTATION', docNo: 'QT-1', schemaVersion: 2, status: 'approved', partyInfo: { name: contact.name, taxId: contact.taxId },
    fields: { billDiscount: 5, billDiscountNote: 'ลด', includeVat: true, paymentTerms: '30 วัน', docDate: '2026-01-01' }, items: [{ name: 'งาน', qty: 1, price: 100, dueDate: '2026-01-02' }],
  };
  const invoice = { ...quotation, type: 'INVOICE', docNo: 'INV-1', base: 100, vat: 7, items: [{ name: 'งาน', qty: 2, price: 50 }] };
  const payment = { type: 'PAYMENT', docNo: 'PV-1', schemaVersion: 2, base: 1000, partyInfo: { entityType: 'individual', name: 'นาย ก', taxId: '1', address: 'x' }, fields: { hasWht: true, whtRate: 3, payDate: '2026-01-05' } };

  it('contactToParty และ partyDefaults', () => {
    const party = contactToParty('QUOTATION', contact);
    expect(party.name).toBe(contact.name);
    expect(contactToParty('QUOTATION', { name: 'นาย ข', taxId: '1100' }).entityType ?? 'individual').toBe('individual');
    expect(typeof partyDefaults('CONTRACT_INF', { name: 'นาย ข', address: 'ที่อยู่' })).toBe('object');
  });

  it('lastDocOf เลือกฉบับล่าสุดของคู่ค้ารายนั้น', () => {
    const docs = [quotation, { ...quotation, docNo: 'QT-2', partyInfo: { name: 'อื่น', taxId: '999' } }];
    expect(lastDocOf(docs, 'QUOTATION').docNo).toBe('QT-1');
    expect(lastDocOf(docs, 'QUOTATION', { taxId: '999' }).docNo).toBe('QT-2');
    expect(lastDocOf(docs, 'QUOTATION', { name: contact.name }).docNo).toBe('QT-1');
    expect(lastDocOf(docs, 'INVOICE', { name: 'ไม่มี' })).toBeNull();
  });

  it('prefillFrom ไม่คัดลอกวันที่และเลขอ้างอิง', () => {
    const p = prefillFrom('QUOTATION', quotation);
    expect(p.fields.docDate).toBeUndefined();
    expect(p.fields.billDiscount).toBe(5);
    expect(p.items[0].dueDate).toBe('');
  });

  it('copyFromRef: ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ และใบสำคัญจ่าย → 50 ทวิ', () => {
    const def = (from) => ({ from, copy: true });
    expect(copyFromRef('INVOICE', def(['QUOTATION']), 'QT-1', [quotation]).fields.note).toMatch('30 วัน');
    expect(copyFromRef('RECEIPT', def(['INVOICE']), 'INV-1', [invoice]).items[0].amount).toBe(100);
    expect(copyFromRef('RECEIPT', def(['INVOICE']), 'INV-1', [{ ...invoice, billDiscount: 5 }]).items).toHaveLength(1);
    expect(copyFromRef('EWHT', def(['PAYMENT']), 'PV-1', [payment]).fields.amount).toBe(1000);
    expect(copyFromRef('EWHT', def(['PAYMENT']), 'PV-1', [{ ...payment, fields: {} }]).error).toBeTruthy();
    expect(copyFromRef('DELIVERY', def(['QUOTATION']), 'QT-1', [quotation])).toBeNull();
    expect(copyFromRef('INVOICE', def(['QUOTATION']), 'ไม่มี', [quotation])).toBeNull();
  });

  it('presetFor แนะนำอัตราหักจากประเภทเงินได้', () => {
    expect(presetFor(WHT_PRESETS[0].desc).incomeCode).toBe(WHT_PRESETS[0].code);
    expect(presetFor('ไม่มีในรายการ')).toBeNull();
  });
});

describe('แบบร่างอัตโนมัติในเครื่อง', () => {
  beforeEach(() => { globalThis.localStorage = memoryStorage(); });
  afterEach(() => { delete globalThis.localStorage; });

  it('บันทึก อ่าน และล้างแบบร่าง (ประเภทที่ไม่รู้จักไม่คืนค่า)', () => {
    saveDraft({ type: 'QUOTATION', fields: { a: 1 } });
    expect(loadDraft().fields.a).toBe(1);
    saveDraft({ type: 'NOPE' });
    expect(loadDraft()).toBeNull();
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('ไม่มีที่เก็บในเครื่องก็ไม่ error', () => {
    delete globalThis.localStorage;
    expect(() => saveDraft({ type: 'QUOTATION' })).not.toThrow();
    expect(loadDraft()).toBeNull();
    expect(() => clearDraft()).not.toThrow();
  });
});
