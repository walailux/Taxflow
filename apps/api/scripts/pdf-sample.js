'use strict';
/**
 * scripts/pdf-sample.js สร้างเอกสารตัวอย่างเพื่อตรวจด้วย veraPDF (WP5 เฟส 2)
 * ==========================================================================
 * แผน ver18 เฟส 2 ระบุให้ "ทำเอกสารต้นแบบหนึ่งประเภทให้ผ่านก่อน แล้วจึงขยาย
 * ไปประเภทที่เหลือ" สคริปต์นี้คือเครื่องมือสำหรับขั้นตอนนั้น
 *
 * วิธีใช้
 *   npm run pdf:sample                  สร้างใบกำกับภาษีตัวอย่าง
 *   npm run pdf:sample -- --out ที่อยู่ไฟล์
 *   npm run pdf:sample -- --type ETAX_RECEIPT
 *
 * จากนั้นตรวจด้วย veraPDF (ดาวน์โหลดจาก verapdf.org ใช้ตอนพัฒนาเท่านั้น)
 *   verapdf --flavour 3b out/sample.pdf
 *
 * ข้อมูลตัวอย่างตั้งใจใส่กรณีที่เคยทำให้พัง ได้แก่
 *   - ชื่อและที่อยู่ภาษาไทยที่มีสระซ้อนและวรรณยุกต์ เช่น "ซื้อ" "ผู้" "เกื้อ"
 *   - จำนวนเงินหลักแสนที่ต้องมีลูกน้ำคั่น
 *   - รายการที่มีส่วนลด และรายการชื่อยาวจนต้องตัดบรรทัด
 * ถ้าสระลอยผิดตำแหน่งจะเห็นได้ทันทีจากไฟล์ตัวอย่างนี้
 */

require('./_env');
const fs = require('fs');
const path = require('path');

const DS = require('../lib/docschema.js');
const pdfbuild = require('../lib/pdfbuild');
const xmlbuild = require('../lib/xmlbuild');
const docview = require('../lib/docview');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** เอกสารตัวอย่างที่ข้อมูลครบตามที่กฎหมายบังคับ */
function sampleDoc(type) {
  const items = type === 'ETAX_RECEIPT'
    ? [{ name: 'รับชำระค่าบริการผลิตสื่อโฆษณาออนไลน์ ประจำเดือนกันยายน 2569', amount: 128000 }]
    : [
      { name: 'ค่าผลิตคอนเทนต์วิดีโอสั้นลงแพลตฟอร์ม TikTok พร้อมสคริปต์และการถ่ายทำ', qty: 4, unit: 'ชิ้น', price: 25000, discount: 5000 },
      { name: 'ค่ารีวิวสินค้าและเผยแพร่ผ่านช่องทางของผู้สร้างสรรค์เนื้อหา', qty: 2, unit: 'ครั้ง', price: 18000 },
      { name: 'ค่าบริหารจัดการแคมเปญ', qty: 1, unit: 'งาน', price: 7000 },
    ];

  const calc = DS.compute(type, { fields: {}, items }, { vatRegistered: true });

  return {
    type,
    docNo: type === 'ETAX_RECEIPT' ? 'ERC-2569-00001' : 'TIV-2569-00001',
    status: 'approved',
    fields: type === 'ETAX_RECEIPT'
      ? { receiveDate: '2026-09-20', payDate: '2026-09-20', payMethod: 'transfer', transferRef: 'TRF-88213', payBank: 'ธนาคารกรุงเทพ' }
      : { issueDate: '2026-09-20', volumeNo: '1', paymentTerms: 'ชำระภายใน 30 วันนับจากวันที่ออกใบกำกับภาษี', note: 'ราคานี้รวมค่าใช้จ่ายในการเดินทางแล้ว' },
    issuer: {
      name: 'บริษัท แท็กซ์โฟลว์ ครีเอทีฟ จำกัด',
      taxId: '0105561234567',
      branch: '00000',
      address: '99/1 อาคารเกื้อกูลทาวเวอร์ ชั้น 12 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110',
      phone: '02-123-4567',
      email: 'billing@taxflow.test',
    },
    party: {
      name: 'บริษัท ผู้ซื้อสื่อโฆษณา จำกัด',
      taxId: '0105559876543',
      branch: '00001',
      address: '1 ถนนพระรามที่ 4 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',
      contactPerson: 'คุณศุภชัย เกื้อกูล',
      phone: '02-987-6543',
      email: 'ap@buyer.test',
    },
    items,
    calc,
    verifyUrl: 'https://taxflow.example.com/verify/SAMPLE-TOKEN',
  };
}

async function main() {
  const type = arg('type', 'ETAX_INVOICE');
  if (!DS.FORMS[type]) {
    console.error(`ไม่รู้จักเอกสารประเภท ${type} — ใช้ได้: ${xmlbuild.SUPPORTED.join(', ')}`);
    process.exit(1);
  }

  const font = pdfbuild.fontStatus();
  console.log(`ฟอนต์: ${font.dir} ${font.ready ? 'พร้อมใช้งาน' : 'ยังไม่ครบ (' + font.missing.join(', ') + ')'}`);
  if (!font.ready) {
    console.error('\nต้องวางไฟล์ฟอนต์ก่อนจึงจะสร้าง PDF ได้ ดูขั้นตอนใน infra/README.md หัวข้อฟอนต์ไทย');
    process.exit(1);
  }

  const outDir = path.join(__dirname, '..', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPdf = arg('out', path.join(outDir, `sample-${type}.pdf`));
  const outXml = outPdf.replace(/\.pdf$/i, '.xml');

  const doc = sampleDoc(type);
  const result = await pdfbuild.buildDocument(doc, {
    bahtText: docview.bahtText,
    generatedAt: new Date('2026-09-20T03:00:00Z'),
  });

  fs.writeFileSync(outPdf, result.pdf);
  if (result.xml) fs.writeFileSync(outXml, result.xml);

  console.log(`\nสร้างไฟล์แล้ว`);
  console.log(`  PDF: ${outPdf} (${(result.pdf.length / 1024).toFixed(1)} KB)${result.pdfa ? ' — PDF/A-3b พร้อม XML แนบภายใน' : ''}`);
  if (result.xml) console.log(`  XML: ${outXml} (${result.xmlName})`);

  console.log(`\nขั้นต่อไป ตรวจด้วย veraPDF`);
  console.log(`  verapdf --flavour 3b "${outPdf}"`);
  console.log(`\nสิ่งที่ต้องดูด้วยตาเพิ่มเติม`);
  console.log('  1. สระและวรรณยุกต์ไทยลอยถูกตำแหน่งไหม ดูคำว่า "ผู้ซื้อ" และ "เกื้อกูล"');
  console.log('  2. ตัวเลขเงินมีลูกน้ำคั่นหลักพันครบ และทศนิยม 2 ตำแหน่ง');
  console.log('  3. เปิดแถบไฟล์แนบในโปรแกรมอ่าน PDF แล้วเห็นไฟล์ XML อยู่ข้างใน');
  console.log('  4. มีข้อความกำกับว่าเป็นการสาธิต ไม่ใช่เอกสารภาษีที่ใช้อ้างอิงได้');
}

main().catch((err) => {
  console.error('\nสร้างเอกสารตัวอย่างไม่สำเร็จ:', err.message);
  process.exit(1);
});
