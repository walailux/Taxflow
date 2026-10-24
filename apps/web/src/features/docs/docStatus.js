/**
 * docStatus.js สถานะเอกสาร ปุ่มเปลี่ยนสถานะ และยอดเงินที่แสดง (ย้ายจาก documents.js ของหน้าเดิม)
 */
import { STATUS_LABEL, STATUS_TONE } from '../../lib/format.js';

export const STATUS_INFO = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, { label: STATUS_LABEL[k], cls: STATUS_TONE[k] }]));

/**
 * พาดหัวสั้นของแต่ละสถานะ อ่านแวบเดียวรู้ว่าเอกสารอยู่ตรงไหน
 * ใช้คู่กับ STATUS_HELP ด้านล่าง (พาดหัว = สรุป · HELP = รายละเอียดว่าทำอะไรได้บ้าง)
 */
export const STATUS_TITLE = {
  draft: 'ฉบับร่างของคุณ',
  pending: 'ส่งให้คู่ค้าแล้ว รอการตอบกลับ',
  approved: 'เอกสารเสร็จสมบูรณ์',
  rejected: 'เอกสารถูกตีกลับ ต้องแก้ไขแล้วส่งใหม่',
  cancelled: 'เอกสารถูกยกเลิกแล้ว',
  archived: 'เก็บถาวรแล้ว',
  issued: 'ออกเอกสารแล้ว',
  stored: 'จัดเก็บแล้ว',
};

export const STATUS_HELP = {
  draft: 'แก้ไขได้อิสระ เสร็จแล้วกด "บันทึกเสร็จสิ้น" หรือส่งให้คู่ค้าลงนาม/ตรวจสอบที่แท็บ "ส่งเอกสาร"',
  pending: 'รอการลงนาม/ตรวจสอบจากอีกฝ่าย ติดตามสถานะได้ที่แท็บ "ส่งเอกสาร" เมื่อได้รับตอบกลับจะแจ้งเตือนที่กระดิ่ง',
  approved: 'ใช้อ้างอิงทางบัญชี/ภาษีได้จริง เมื่อจบงวดสามารถ "เก็บถาวร" ได้',
  rejected: 'คู่ค้าส่งเอกสารกลับมาพร้อมเหตุผล แก้ไขตามที่แจ้งไว้ด้านล่าง แล้วส่งให้คู่ค้าใหม่ได้',
  cancelled: 'ไม่นำไปใช้งานต่อ แต่ยังเก็บไว้เป็นหลักฐานและตรวจสอบย้อนหลังได้',
  archived: 'อยู่ในคลังถาวร เรียกดูและดาวน์โหลดได้ แต่แก้ไขไม่ได้แล้ว',
  issued: 'เอกสารออกเลขที่เรียบร้อยแล้ว',
  stored: 'เอกสารจัดเก็บเรียบร้อยแล้ว',
};

/**
 * สรุป "การตีกลับ" ของเอกสารให้ครบในที่เดียว: ใครตีกลับ เมื่อไร ให้แก้อะไร
 * และคำขอที่เราส่งออกไปตอนแรกมีอะไรแนบไปบ้าง จะได้เทียบได้ว่าอีกฝ่ายติดตรงไหน
 * รองรับทั้งคู่ค้าตีกลับ (activeRequest.declineReason) และผู้ตรวจภายในตีกลับ (statusNote)
 */
export function declineInfo(d) {
  if (!d || d.status !== 'rejected') return null;
  const ar = d.activeRequest;
  const byPartner = !!(ar && ar.status === 'declined');
  return {
    byPartner,
    who: byPartner ? (ar.toName || ar.toEmail || 'คู่ค้า') : 'ผู้ตรวจสอบภายในองค์กร',
    email: byPartner ? (ar.toEmail || '') : '',
    at: byPartner ? ar.respondedAt : (d.updatedAt || null),
    reason: String((byPartner ? ar.declineReason : d.statusNote) || '').trim(),
    sent: byPartner ? {
      at: ar.sentAt,
      purpose: ar.purpose === 'sign' ? 'ขอให้ลงนาม' : 'ขอให้ตรวจสอบ',
      signAs: ar.signAs || '',
      message: String(ar.message || '').trim(),
      dueDate: ar.dueDate || '',
    } : null,
  };
}

export const EDITABLE = ['draft', 'pending', 'rejected'];

export const ATTACH_KIND = { receipt: 'ใบเสร็จ', invoice: 'ใบกำกับภาษี', wht: 'หนังสือรับรองหัก ณ ที่จ่าย', payment: 'หลักฐานการโอนเงิน', other: 'อื่นๆ' };

export const REQUEST_STATUS = { sent: 'รอตอบกลับ', signed: 'ลงนามแล้ว', approved: 'ตรวจแล้วผ่าน', declined: 'ถูกตีกลับ', cancelled: 'ยกเลิก' };

const ACTION = {
  pending: { text: 'ส่งตรวจสอบ', variant: 'solid' },
  approved: { text: 'อนุมัติ', variant: 'solid' },
  rejected: { text: 'ตีกลับ (ไม่อนุมัติ)', variant: 'danger' },
  draft: { text: 'กลับไปแก้ไข', variant: 'ghost' },
  cancelled: { text: 'ยกเลิกเอกสาร', variant: 'danger' },
  archived: { text: 'เก็บถาวร', variant: 'ghost' },
};

const isWhtType = (t) => ['WHT', 'EWHT', 'PAYMENT', 'PND3', 'PND53'].includes(t);

export const counterparty = (d) => d.party || d.buyer || d.payee || d.payer || '-';

export function docAmounts(d) {
  const wht = isWhtType(d.type) || (!d.vat && d.wht > 0);
  return {
    taxLabel: wht ? 'ภาษีหัก ณ ที่จ่าย' : 'VAT',
    taxValue: wht ? d.wht : d.vat,
    total: ['WHT', 'EWHT', 'PAYMENT'].includes(d.type) ? d.net : (d.total ?? d.base),
  };
}

/** สถานะที่เปลี่ยนได้ ระหว่างรอคู่ค้าตอบกลับเหลือแค่ "ยกเลิก" */
export function allowedTransitions(d) {
  const waiting = d.status === 'pending' && d.docPurpose === 'send' && d.activeRequest && d.activeRequest.status === 'sent' && !d.counterpartySignature;
  const all = d.allowedTransitions || [];
  return waiting ? all.filter((s) => s === 'cancelled') : all;
}

export function transitionLabel(d, s) {
  if (d.status === 'draft' && s === 'approved') return { text: 'บันทึกเสร็จสิ้น', variant: 'success' };
  return ACTION[s] || { text: STATUS_LABEL[s] || s, variant: 'ghost' };
}

export const needsSignBeforeApprove = (d, status) => status === 'approved' && !d.signed && d.type !== 'WHT';

export function nextActionText(d) {
  const pr = d.docPurpose || 'self';
  if (d.status === 'draft') {
    if (pr === 'send') return d.signed ? 'ส่งเอกสารให้คู่ค้าที่แท็บ "ส่งเอกสาร"' : 'ลงนามฝั่งผู้ออก แล้วส่งให้คู่ค้าที่แท็บ "ส่งเอกสาร"';
    return 'ตรวจทานข้อมูล แล้วกด "บันทึกเสร็จสิ้น" เพื่อดำเนินการให้เสร็จสิ้น';
  }
  if (d.status === 'pending') {
    if (d.counterpartySignature) return 'คู่ค้าลงนามแล้ว กด "อนุมัติ" เพื่อดำเนินการให้เสร็จสิ้น';
    if (d.activeRequest && d.activeRequest.status === 'sent') return 'รอคู่ค้าตอบกลับ ติดตาม/ยกเลิกคำขอได้ที่แท็บ "ส่งเอกสาร"';
    return 'รอการตรวจสอบ ผู้มีอำนาจกด "อนุมัติ" หรือ "ตีกลับ"';
  }
  if (d.status === 'approved') return 'เอกสารพร้อมใช้งาน ดาวน์โหลด PDF หรือเก็บถาวรเมื่อจบงวด';
  if (d.status === 'rejected') return 'กด "กลับไปแก้ไข" ปรับข้อมูลตามเหตุผลที่ตีกลับ แล้วส่งใหม่';
  return null;
}

/** ขั้นตอนหลัก draft → pending → approved → archived (ตีกลับ/ยกเลิก แสดงเป็นข้อความพิเศษ) */
export function stepperState(status) {
  const keys = ['draft', 'pending', 'approved', 'archived'];
  const idx = keys.indexOf(status);
  const special = status === 'rejected' ? 'เอกสารถูกตีกลับ แก้ไขแล้วส่งใหม่ได้' : status === 'cancelled' ? 'เอกสารถูกยกเลิก' : null;
  return {
    special,
    steps: keys.map((k, i) => ({
      key: k,
      label: k === 'approved' ? 'อนุมัติ / ลงนาม' : STATUS_LABEL[k],
      on: !special && idx >= i,
      now: k === status,
      done: !special && idx > i,
      lineOn: !special && idx >= i,
    })),
  };
}

/** ปุ่มสร้างเอกสารต่อเนื่อง (ใบเสนอราคา → ใบแจ้งหนี้ → ใบเสร็จ, ใบสำคัญจ่าย → 50 ทวิ) */
export function nextDocs(d) {
  if (d.schemaVersion !== 2 || !d.docNo || ['cancelled', 'rejected'].includes(d.status)) return [];
  if (d.type === 'QUOTATION') return [{ type: 'INVOICE', ref: { quotationRef: d.docNo }, label: 'สร้างใบแจ้งหนี้จากเอกสารนี้' }];
  if (d.type === 'INVOICE') return [{ type: 'RECEIPT', ref: { invoiceRef: d.docNo }, label: 'ออกใบเสร็จรับเงิน' }];
  if (d.type === 'PAYMENT' && d.fields && d.fields.hasWht) return [{ type: 'EWHT', ref: { paymentRef: d.docNo }, label: 'ออก 50 ทวิ จากใบสำคัญจ่ายนี้' }];
  return [];
}
