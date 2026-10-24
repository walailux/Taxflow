/**
 * library.js หมวดของคลังเอกสาร แยกตามบทบาท (ย้ายจาก DOC_LIBRARY ใน common.js ของหน้าเดิม)
 */
const DOC_LIBRARY = {
  creator: [
    { group: 'เอกสารภาษี', items: [
      { id: 'WHT50', label: 'หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)' },
      { id: 'PND90', label: 'แบบ ภ.ง.ด.90 / ภ.ง.ด.94' },
      { id: 'RECEIPT', label: 'ใบเสร็จรับเงิน / ใบรับเงิน' },
      { id: 'INV', label: 'ใบแจ้งหนี้ (Invoice)' },
      { id: 'FULLTAX', label: 'ใบกำกับภาษีเต็มรูป (กรณีจด VAT)' },
    ] },
    { group: 'เอกสารการจ้างงาน', items: [
      { id: 'CONTRACT_INF', label: 'สัญญาจ้าง Influencer' },
      { id: 'PO', label: 'ใบสั่งซื้อ (PO)' },
      { id: 'PAYMENT', label: 'ใบสำคัญจ่าย / หลักฐานการรับเงิน' },
    ] },
  ],
  corporate: [
    { group: 'เอกสารภาษี', items: [
      { id: 'PP20', label: 'ภ.พ.20 (ทะเบียน VAT)' },
      { id: 'TAXINV', label: 'ใบกำกับภาษี' },
      { id: 'WHT50', label: 'หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)' },
      { id: 'PND53', label: 'แบบ ภ.ง.ด.53' },
      { id: 'PND50', label: 'แบบ ภ.ง.ด.50' },
      { id: 'PND51', label: 'แบบ ภ.ง.ด.51' },
    ] },
    { group: 'เอกสารการจ้างงาน', items: [
      { id: 'CONTRACT_INF', label: 'สัญญาจ้าง Influencer' },
      { id: 'PO', label: 'Purchase Order (PO)' },
      { id: 'QUOTATION', label: 'ใบเสนอราคา (Quotation)' },
      { id: 'INV', label: 'Invoice' },
      { id: 'DELIVERY', label: 'ใบส่งมอบงาน' },
      { id: 'PAYMENT', label: 'หลักฐานการชำระเงิน' },
    ] },
  ],
  agency: [
    { group: 'เอกสารบริษัท', items: [
      { id: 'CERT', label: 'หนังสือรับรองนิติบุคคล' },
      { id: 'PP20', label: 'ภ.พ.20 (ทะเบียน VAT)' },
      { id: 'POA', label: 'หนังสือมอบอำนาจ' },
      { id: 'IDCARD', label: 'บัตรประชาชนผู้มีอำนาจ' },
      { id: 'BANKBOOK', label: 'สมุดบัญชีบริษัท' },
    ] },
    { group: 'เอกสารภาษี', items: [
      { id: 'PND53', label: 'แบบ ภ.ง.ด.53' },
      { id: 'WHT50', label: 'หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)' },
      { id: 'PP30', label: 'แบบ ภ.พ.30' },
      { id: 'PND50', label: 'แบบ ภ.ง.ด.50' },
      { id: 'PND51', label: 'แบบ ภ.ง.ด.51' },
    ] },
    { group: 'เอกสารการดำเนินงาน', items: [
      { id: 'CONTRACT_BRAND', label: 'สัญญากับแบรนด์' },
      { id: 'CONTRACT_INF', label: 'สัญญากับ Influencer' },
      { id: 'QUOTATION', label: 'ใบเสนอราคา' },
      { id: 'INV', label: 'Invoice' },
      { id: 'TAXINV', label: 'ใบกำกับภาษี' },
      { id: 'DELIVERY', label: 'ใบส่งมอบงาน' },
    ] },
  ],
};

export function libraryGroups(role) {
  return DOC_LIBRARY[role] || DOC_LIBRARY.creator;
}

/** ชื่อหมวดจาก id (ค้นทุกบทบาท) */
export function libCategoryLabel(catId) {
  for (const groups of Object.values(DOC_LIBRARY)) {
    for (const g of groups) {
      const hit = g.items.find((it) => it.id === catId);
      if (hit) return hit.label;
    }
  }
  return catId;
}
