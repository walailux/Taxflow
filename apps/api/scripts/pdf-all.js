'use strict';
/**
 * scripts/pdf-all.js สร้างเอกสารตัวอย่างครบทั้ง 14 ประเภท เพื่อตรวจด้วย veraPDF (WP5)
 * ==========================================================================
 *   npm run pdf:all
 *   verapdf --flavour 3b apps/api/out/all/*.pdf
 *
 * ต่างจาก pdf:sample ที่ทำทีละประเภท สคริปต์นี้ใช้ตรวจหลังแก้โค้ดวาด (docplan / pdfbuild)
 * ว่าไม่มีประเภทไหนพังตาม ข้อมูลตัวอย่างอยู่ในรูปร่างเดียวกับเอกสารที่บันทึกจริง (partyInfo)
 * ภ.ง.ด. ใส่ 11 รายเพื่อให้ใบแนบขึ้นหน้าที่สอง
 */
require('./_env');
const fs = require('fs');
const path = require('path');
const DS = require('../lib/docschema.js');
const docplan = require('../lib/docplan');
const pdfbuild = require('../lib/pdfbuild');
const docview = require('../lib/docview');

const issuer = {
  name: 'บริษัท แท็กซ์โฟลว์ ครีเอทีฟ จำกัด', entityType: 'juristic',
  taxId: '0105561234567', branch: 'สำนักงานใหญ่', branchNo: '00000',
  address: '99/1 อาคารเกื้อกูลทาวเวอร์ ชั้น 12 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
  phone: '02-123-4567', email: 'billing@taxflow.test', authName: 'นายสมชาย ใจดี', authPosition: 'กรรมการผู้จัดการ',
};
const partyInfo = {
  name: 'บริษัท ผู้ซื้อสื่อโฆษณา จำกัด', taxId: '0105559876543', branch: '00001',
  address: '1 ถนนพระรามที่ 4 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',
  contactPerson: 'คุณศุภชัย เกื้อกูล', phone: '02-987-6543', email: 'ap@buyer.test',
  bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '1234567890', bankAccountName: 'บริษัท ผู้ซื้อสื่อโฆษณา จำกัด',
  channelName: 'ช่องสร้างสรรค์', authName: 'นางสาวมาลี รักงาน', authPosition: 'กรรมการ',
};
const items = [
  { name: 'ค่าผลิตคอนเทนต์วิดีโอสั้นลงแพลตฟอร์ม TikTok พร้อมสคริปต์และการถ่ายทำ', qty: 4, unit: 'ชิ้น', price: 25000, discount: 5000 },
  { name: 'ค่ารีวิวสินค้าและเผยแพร่ผ่านช่องทางของผู้สร้างสรรค์เนื้อหา', qty: 2, unit: 'ครั้ง', price: 18000 },
];

const FIELDS = {
  QUOTATION: { issueDate: '2026-09-20', validUntil: '2026-10-20', paymentTerms: 'ชำระภายใน 30 วัน' },
  PO: { issueDate: '2026-09-20', deliveryDate: '2026-10-01', quotationRef: 'QT-2569-00001' },
  INVOICE: {
    issueDate: '2026-09-20', dueDate: '2026-10-20', poRef: 'PO-2569-00001', paymentTerms: 'ชำระภายใน 30 วัน',
    bankName: 'ธนาคารกสิกรไทย', bankAccountName: 'บริษัท แท็กซ์โฟลว์ ครีเอทีฟ จำกัด', bankAccountNo: '123-4-56789-0',
  },
  RECEIPT: { receiveDate: '2026-09-20', payMethod: 'transfer', transferRef: 'TRF-1122', invoiceRef: 'INV-2569-00001' },
  DELIVERY: {
    deliverDate: '2026-09-20', contractRef: 'PO-2569-089', campaignName: 'Summer Glow 2569',
    periodStart: '2026-09-01', periodEnd: '2026-09-30', acceptStatus: 'accepted', acceptDate: '2026-09-21',
    delivererName: 'นายสมชาย ใจดี', receiverName: 'คุณศุภชัย เกื้อกูล', note: 'ส่งมอบงานครบตามขอบเขตที่ตกลง',
  },
  PAYMENT: {
    payDate: '2026-09-20', payMethod: 'cheque', payBank: 'ธนาคารกสิกรไทย', payBankBranch: 'สีลม',
    chequeNo: '0012345', chequeDate: '2026-09-20', hasWht: true, incomeCode: '5', incomeDesc: 'ค่าจ้างทำของ',
    whtRate: '3', whtCondition: '1', campaignName: 'Summer Glow 2569', contractRef: 'CT-2569-004',
    preparedBy: 'นางสาวบัญชี ละเอียด', approvedBy: 'นายสมชาย ใจดี', paidBy: 'นายสมชาย ใจดี',
  },
  ETAX_INVOICE: { issueDate: '2026-09-20', volumeNo: '1', paymentTerms: 'ชำระภายใน 30 วัน', note: 'ราคานี้รวมค่าเดินทางแล้ว' },
  ETAX_RECEIPT: { receiveDate: '2026-09-20', payDate: '2026-09-20', payMethod: 'transfer', transferRef: 'TRF-88213' },
  CONTRACT_BRAND: {
    place: 'กรุงเทพมหานคร', contractDate: '2026-09-20', campaignName: 'Summer Glow 2569',
    objective: 'สร้างการรับรู้แบรนด์ในกลุ่มผู้บริโภคอายุ 18-30 ปี', scope: 'บริหารแคมเปญและจัดหาอินฟลูเอนเซอร์ 12 ราย',
    influencerCount: 12, workPeriod: '3 เดือน', startDate: '2026-10-01', endDate: '2026-12-31',
    fee: 500000, includeVat: true, whtRate: '3',
    revisionTerms: 'แก้ไขได้ไม่เกิน 2 ครั้งต่อชิ้นงาน', cancelTerms: 'แจ้งล่วงหน้า 15 วัน',
    confidentialTerms: 'ห้ามเปิดเผยข้อมูลแก่บุคคลภายนอก', contentRights: 'แบรนด์ใช้ Content ได้ 1 ปี',
    breachTerms: 'ชดใช้ค่าเสียหายตามจริง', sign1Name: 'นายสมชาย ใจดี', sign1Position: 'กรรมการผู้จัดการ',
    sign2Name: 'นางสาวมาลี รักงาน', sign2Position: 'กรรมการ', signDate: '2026-09-20',
    witness1: 'นายพยาน หนึ่ง', witness2: 'นางพยาน สอง',
  },
  CONTRACT_INF: {
    place: 'กรุงเทพมหานคร', contractDate: '2026-09-20', campaignName: 'Summer Glow 2569',
    platforms: ['TikTok', 'Instagram'], contentType: 'วิดีโอสั้น', contentCount: 4,
    brief: 'นำเสนอสินค้าอย่างเป็นธรรมชาติ ไม่กล่าวอ้างสรรพคุณเกินจริง', hashtags: '#SummerGlow',
    mentions: '@brandofficial', submitDate: '2026-10-10', postDate: '2026-10-15',
    startDate: '2026-10-01', endDate: '2026-12-31', fee: 120000, payMethod: 'transfer',
    installmentCount: 2, paymentTerms: 'งวดแรก 50% เมื่อเซ็นสัญญา', whtRate: '3',
    revisionRounds: 2, publishDuration: '6 เดือน', contentRights: 'ผู้ว่าจ้างใช้ Content ได้ 1 ปี',
    removalTerms: 'ลบ Content ได้เมื่อครบกำหนด', cancelTerms: 'แจ้งล่วงหน้า 7 วัน',
    sign1Name: 'นายสมชาย ใจดี', sign1Position: 'กรรมการผู้จัดการ', sign2Name: 'นางสาวมาลี รักงาน',
    signDate: '2026-09-20', witness1: 'นายพยาน หนึ่ง', witness2: 'นางพยาน สอง',
  },
  POA: {
    place: 'กรุงเทพมหานคร', issueDate: '2026-09-20', issuerIs: 'grantor', grantorType: 'juristic',
    grantorName: 'บริษัท แท็กซ์โฟลว์ ครีเอทีฟ จำกัด', grantorIdNo: '0105561234567',
    grantorAddress: '99/1 ถนนสุขุมวิท กรุงเทพมหานคร', grantorAuthName: 'นายสมชาย ใจดี', grantorPosition: 'กรรมการผู้จัดการ',
    granteeName: 'นางสาวมาลี รักงาน', granteeCitizenId: '1100701234567', granteeAddress: '55 ถนนสาทร กรุงเทพมหานคร',
    powers: [], scopeDetail: 'ยื่นแบบและชำระภาษีแทนบริษัท', startDate: '2026-10-01', endDate: '2027-09-30',
    actCount: 'many', witness1: 'นายพยาน หนึ่ง', witness2: 'นางพยาน สอง',
  },
  EWHT: {
    payDate: '2026-09-20', incomeCode: '5', incomeDesc: 'ค่าจ้างทำของ', amount: 120000,
    whtRate: '3', whtCondition: '1', pndForm: 'PND53', seqInForm: '1', taxYear: 2569,
    bookNo: '1', issueDate: '2026-09-20', signerName: 'นายสมชาย ใจดี', signerPosition: 'กรรมการผู้จัดการ',
  },
  PND3: {
    taxMonth: '9', taxYearBE: 2569, filingType: 'normal', branchNo: '00000', remitUnder: ['s3tres'],
    surcharge: 0, signerName: 'นายสมชาย ใจดี', signerPosition: 'กรรมการผู้จัดการ', filingDate: '2026-10-05',
  },
  PND53: {
    taxMonth: '9', taxYearBE: 2569, filingType: 'normal', branchNo: '00000', remitUnder: ['s3tres'],
    surcharge: 0, signerName: 'นายสมชาย ใจดี', signerPosition: 'กรรมการผู้จัดการ', filingDate: '2026-10-05',
  },
};

const PND_ITEMS = Array.from({ length: 11 }).map((_, i) => ({
  payeeName: `บริษัท ผู้รับเงินรายที่ ${i + 1} จำกัด`, payeeTaxId: '010555987654' + (i % 10),
  payeeBranch: '00000', payeeAddress: '1 ถนนพระรามที่ 4 กรุงเทพมหานคร',
  payDate: '2026-09-1' + (i % 10), incomeDesc: 'ค่าจ้างทำของ', rate: 3,
  amount: 10000 + i * 1000, wht: (10000 + i * 1000) * 0.03, condition: '1',
}));

function itemsFor(type) {
  if (type === 'PND3' || type === 'PND53') return PND_ITEMS;
  if (type === 'CONTRACT_BRAND') return [{ name: 'งวดที่ 1 เมื่อเซ็นสัญญา', amount: 250000, dueDate: '2026-10-01' }, { name: 'งวดที่ 2 เมื่อจบแคมเปญ', amount: 250000, dueDate: '2026-12-31' }];
  if (type === 'CONTRACT_INF') return [{ name: 'งวดที่ 1', amount: 60000, dueDate: '2026-10-01' }, { name: 'งวดที่ 2', amount: 60000, dueDate: '2026-12-31' }];
  if (type === 'DELIVERY') {
    return [
      { influencer: '@glow.with.mai', contentType: 'วิดีโอสั้นรีวิวสินค้า', platform: 'TikTok', pieces: 2, link: 'https://www.tiktok.com/@glow.with.mai/video/7412345678901234567', publishDate: '2026-09-12', itemStatus: 'เผยแพร่แล้ว' },
      { influencer: 'คุณเกื้อกูล ผู้สร้างสรรค์', contentType: 'ภาพและแคปชัน', platform: 'Instagram', pieces: 3, link: 'https://instagram.com/p/Cx1234', publishDate: '2026-09-15', itemStatus: 'รอตรวจสอบ' },
    ];
  }
  if (type === 'PAYMENT') {
    return [
      { docDate: '2026-09-10', docNo: 'INV-2569-0031', name: 'ค่าจ้างผลิตคอนเทนต์ตามสัญญา งวดที่ 1', amount: 60000 },
      { docDate: '2026-09-18', docNo: 'INV-2569-0034', name: 'ค่าจ้างผลิตคอนเทนต์ตามสัญญา งวดที่ 2', amount: 40000 },
    ];
  }
  if (type === 'POA') return [];
  if (type === 'EWHT') return [];
  if (type === 'ETAX_RECEIPT' || type === 'RECEIPT') return [{ name: 'รับชำระค่าบริการผลิตสื่อโฆษณาออนไลน์', amount: 131000 }];
  return items;
}

async function main() {
  let failed = 0;
  const outDir = path.join(__dirname, '..', 'out', 'all');
  fs.mkdirSync(outDir, { recursive: true });
  for (const type of Object.keys(DS.FORMS)) {
    const its = itemsFor(type);
    const fields = FIELDS[type] || {};
    let calc;
    try {
      calc = DS.compute(type, { fields, items: its, party: partyInfo }, { vatRegistered: true });
    } catch (e) { calc = {}; }
    const doc = {
      type, docNo: `${DS.FORMS[type].prefix}-2569-00001`, status: 'approved',
      fields, issuer, partyInfo, items: its, calc,
      signature: { signerName: 'นายสมชาย ใจดี', signedAt: '2026-09-20T04:00:00Z', image: null },
      verifyUrl: 'https://taxflow.example.com/verify-doc?token=SAMPLE',
    };
    try {
      const r = await pdfbuild.buildDocument(doc, { bahtText: docview.bahtText, generatedAt: new Date('2026-09-20T03:00:00Z') });
      fs.writeFileSync(path.join(outDir, `${type}.pdf`), r.pdf);
      console.log(`ok   ${type.padEnd(16)} ${(r.pdf.length / 1024).toFixed(1)} KB${r.xml ? ' + XML' : ''}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${type.padEnd(16)} ${err.message}`);
    }
  }
  console.log(`\nไฟล์อยู่ที่ ${outDir}\nตรวจต่อด้วย: verapdf --flavour 3b "${outDir}"/*.pdf`);
  if (failed) process.exit(1);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
