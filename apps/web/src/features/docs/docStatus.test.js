import { describe, expect, it } from 'vitest';
import {
  STATUS_INFO, declineInfo, counterparty, docAmounts, allowedTransitions, transitionLabel, needsSignBeforeApprove,
  nextActionText, stepperState, nextDocs,
} from './docStatus.js';

describe('สถานะเอกสาร', () => {
  it('ทุกสถานะมีป้ายและสี', () => {
    for (const info of Object.values(STATUS_INFO)) expect(info.label).toBeTruthy();
  });

  it('declineInfo แยกคู่ค้าตีกลับกับผู้ตรวจภายใน', () => {
    expect(declineInfo(null)).toBeNull();
    expect(declineInfo({ status: 'approved' })).toBeNull();
    const partner = declineInfo({
      status: 'rejected',
      activeRequest: { status: 'declined', toEmail: 'a@b.c', declineReason: ' ยอดผิด ', purpose: 'sign', message: ' ฝาก ', sentAt: 't', respondedAt: 'r' },
    });
    expect(partner).toMatchObject({ byPartner: true, who: 'a@b.c', reason: 'ยอดผิด', sent: { purpose: 'ขอให้ลงนาม', message: 'ฝาก' } });
    const internal = declineInfo({ status: 'rejected', statusNote: 'แก้ชื่อ', updatedAt: 'u' });
    expect(internal).toMatchObject({ byPartner: false, reason: 'แก้ชื่อ', at: 'u', sent: null });
    expect(declineInfo({ status: 'rejected', activeRequest: { status: 'declined', purpose: 'review' } }).sent.purpose).toBe('ขอให้ตรวจสอบ');
  });

  it('คู่ค้าและยอดเงินตามประเภทเอกสาร', () => {
    expect(counterparty({ buyer: 'ผู้ซื้อ' })).toBe('ผู้ซื้อ');
    expect(counterparty({})).toBe('-');
    expect(docAmounts({ type: 'EWHT', wht: 30, net: 970 })).toEqual({ taxLabel: 'ภาษีหัก ณ ที่จ่าย', taxValue: 30, total: 970 });
    expect(docAmounts({ type: 'INVOICE', vat: 70, total: 1070 })).toEqual({ taxLabel: 'VAT', taxValue: 70, total: 1070 });
    expect(docAmounts({ type: 'QUOTATION', vat: 0, wht: 3, base: 100 }).taxLabel).toBe('ภาษีหัก ณ ที่จ่าย');
  });

  it('ระหว่างรอคู่ค้าตอบ เปลี่ยนได้แค่ยกเลิก', () => {
    const waiting = { status: 'pending', docPurpose: 'send', activeRequest: { status: 'sent' }, allowedTransitions: ['approved', 'cancelled'] };
    expect(allowedTransitions(waiting)).toEqual(['cancelled']);
    expect(allowedTransitions({ ...waiting, docPurpose: 'self' })).toEqual(['approved', 'cancelled']);
    expect(allowedTransitions({ status: 'draft' })).toEqual([]);
  });

  it('ป้ายปุ่มเปลี่ยนสถานะ และการลงนามก่อนอนุมัติ', () => {
    expect(transitionLabel({ status: 'draft' }, 'approved').text).toBe('บันทึกเสร็จสิ้น');
    expect(transitionLabel({ status: 'pending' }, 'rejected').variant).toBe('danger');
    expect(transitionLabel({ status: 'pending' }, 'unknown').text).toBe('unknown');
    expect(needsSignBeforeApprove({ signed: false, type: 'INVOICE' }, 'approved')).toBe(true);
    expect(needsSignBeforeApprove({ signed: false, type: 'WHT' }, 'approved')).toBe(false);
  });

  it('ข้อความขั้นตอนถัดไปครบทุกกรณี', () => {
    const cases = [
      { status: 'draft', docPurpose: 'send', signed: true }, { status: 'draft', docPurpose: 'send' }, { status: 'draft' },
      { status: 'pending', counterpartySignature: {} }, { status: 'pending', activeRequest: { status: 'sent' } }, { status: 'pending' },
      { status: 'approved' }, { status: 'rejected' },
    ];
    for (const d of cases) expect(nextActionText(d)).toBeTruthy();
    expect(nextActionText({ status: 'cancelled' })).toBeNull();
  });

  it('แถบขั้นตอน และเอกสารต่อเนื่อง', () => {
    expect(stepperState('pending').steps.filter((s) => s.done)).toHaveLength(1);
    expect(stepperState('rejected').special).toMatch('ตีกลับ');
    expect(stepperState('cancelled').special).toMatch('ยกเลิก');
    const base = { schemaVersion: 2, docNo: 'X-1', status: 'approved' };
    expect(nextDocs({ ...base, type: 'QUOTATION' })[0].type).toBe('INVOICE');
    expect(nextDocs({ ...base, type: 'INVOICE' })[0].type).toBe('RECEIPT');
    expect(nextDocs({ ...base, type: 'PAYMENT', fields: { hasWht: true } })[0].type).toBe('EWHT');
    expect(nextDocs({ ...base, type: 'PAYMENT', fields: {} })).toEqual([]);
    expect(nextDocs({ ...base, type: 'QUOTATION', status: 'cancelled' })).toEqual([]);
  });
});
