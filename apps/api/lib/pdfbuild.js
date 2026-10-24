'use strict';
/**
 * pdfbuild.js วาดเอกสารเป็นไฟล์ PDF/A-3 พร้อมแนบไฟล์ XML ไว้ภายใน (WP5)
 * ==========================================================================
 * แทนที่ lib/docprint.js เดิมที่สร้าง HTML ขนาด A4 ให้เบราว์เซอร์สั่งพิมพ์เอง
 * วิธีเดิมควบคุมผลลัพธ์ไม่ได้ ไฟล์ที่ได้ขึ้นกับเบราว์เซอร์และการตั้งค่าเครื่องพิมพ์
 * ของแต่ละคน จึงผ่านข้อกำหนด PDF/A-3 ไม่ได้แน่นอน
 *
 * แบ่งงานเป็นสองขั้น
 * ------------------
 * ขั้นที่ 1 วาดหน้ากระดาษด้วย PDFKit จากแผนผังที่ lib/docplan.js เตรียมไว้
 * ขั้นที่ 2 แปลงไฟล์ที่ได้ให้เป็น PDF/A-3 แล้วแนบไฟล์ XML เข้าไปข้างใน
 *
 * ทำไมขั้นที่ 2 ไม่ใช้ PDFKit ต่อ
 * ---------------------------------
 * ข้อกำหนด PDF/A-3 ต้องการของที่ PDFKit ไม่มีให้ ได้แก่ XMP metadata ที่ประกาศ
 * pdfaid:part=3, OutputIntent ที่ฝัง ICC profile ของ sRGB, คู่ /ID ของเอกสาร
 * และรายการ /AF ใน catalog ที่ชี้ไปยังไฟล์แนบ ถ้าจะทำด้วย PDFKit ต้องไปแก้
 * โครงสร้างภายในของไลบรารีเอง ซึ่งพังง่ายเมื่ออัปเกรดรุ่น จึงใช้ pdf-lib ที่มี
 * convertToPDFA() มาให้พร้อม ICC profile ในตัว ปลอดภัยกว่าและสั้นกว่ามาก
 *
 * ฟอนต์ไทย
 * ---------
 * PDF/A ห้ามใช้ฟอนต์ที่ไม่ฝังลงในไฟล์ จึงต้องมีไฟล์ฟอนต์จริงวางไว้ที่
 * apps/api/assets/fonts/ ดูวิธีติดตั้งใน infra/README.md หัวข้อฟอนต์
 * ระบบเลือกฟอนต์ที่มีตาราง OpenType ครบ เพื่อให้สระและวรรณยุกต์ไทยลอยถูกตำแหน่ง
 * ซึ่งเป็นความเสี่ยงที่แผน ver18 ระบุไว้
 */

const fs = require('fs');
const path = require('path');
const docplan = require('./docplan');
const xmlbuild = require('./xmlbuild');
const thaiwrap = require('./thaiwrap');
const pdfsign = require('./pdfsign');

/**
 * ปิด ligature ของฟอนต์
 * -----------------------
 * พบจากไฟล์ตัวอย่างจริง: ฟอนต์ Sarabun รวม "f" กับ "l" เป็นอักขระพิเศษตัวเดียว (ligature)
 * ตาเห็นถูกต้อง แต่พอคัดลอกข้อความจาก PDF ตัว "l" หายไป อีเมล billing@taxflow.test
 * กลายเป็น taxfow.test และลิงก์ตรวจสอบเอกสารในเอกสารภาษีคัดลอกไปใช้ไม่ได้
 * จึงปิด liga และ clig ไว้ ส่วนฟีเจอร์ที่ภาษาไทยต้องใช้จัดตำแหน่งสระและวรรณยุกต์
 * (ccmp, mark, mkmk) ยังเปิดอยู่ตามค่าเริ่มต้นของ fontkit
 */
const FONT_FEATURES = { liga: false, clig: false };

/* ------------------------------------------------------------------ ฟอนต์ */

const FONT_DIR = process.env.TAXFLOW_FONT_DIR
  ? path.resolve(process.env.TAXFLOW_FONT_DIR)
  : path.join(__dirname, '..', 'assets', 'fonts');

const FONTS = {
  regular: path.join(FONT_DIR, 'Sarabun-Regular.ttf'),
  bold: path.join(FONT_DIR, 'Sarabun-Bold.ttf'),
};
/**
 * ชุดฟอนต์ที่เลือกใช้ในเอกสารได้ (doc.docFont) · Sarabun เป็นค่าเริ่มต้นและต้องมีเสมอ
 * Google Sans (OFL, รองรับภาษาไทย) ไม่มีไฟล์ = ใช้ Sarabun แทน เอกสารยังออกได้
 */
const FONT_SETS = {
  sarabun: FONTS,
  googlesans: { regular: path.join(FONT_DIR, 'GoogleSans-Regular.ttf'), bold: path.join(FONT_DIR, 'GoogleSans-Bold.ttf') },
};
function fontSetFor(name) {
  const set = FONT_SETS[name];
  return set && fs.existsSync(set.regular) && fs.existsSync(set.bold) ? set : FONTS;
}

/** ตรวจว่าฟอนต์พร้อมใช้งานไหม เรียกได้โดยไม่ต้องติดตั้งไลบรารีอะไรเลย */
function fontStatus() {
  const missing = Object.entries(FONTS).filter(([, p]) => !fs.existsSync(p)).map(([k]) => k);
  return { dir: FONT_DIR, files: FONTS, ready: missing.length === 0, missing };
}

function requireFonts() {
  const st = fontStatus();
  if (st.ready) return st;
  throw new Error(
    `ไม่พบไฟล์ฟอนต์ไทย (${st.missing.join(', ')}) ที่ ${FONT_DIR}\n`
    + 'ดาวน์โหลด Sarabun จาก Google Fonts (สัญญาอนุญาต SIL Open Font License 1.1) '
    + 'แล้ววาง Sarabun-Regular.ttf และ Sarabun-Bold.ttf ไว้ในโฟลเดอร์นั้น\n'
    + 'PDF/A ห้ามใช้ฟอนต์ที่ไม่ฝังลงในไฟล์ จึงข้ามขั้นตอนนี้ไม่ได้'
  );
}

/* ------------------------------------------------- โหลดไลบรารีแบบเลื่อนเวลา */

function loadPdfkit() {
  try { return require('pdfkit'); } catch {
    throw new Error("ยังไม่ได้ติดตั้ง 'pdfkit' ติดตั้งด้วย `npm install pdfkit -w @taxflow/api`");
  }
}

function loadPdfLib() {
  try { return require('@cantoo/pdf-lib'); } catch {
    throw new Error("ยังไม่ได้ติดตั้ง '@cantoo/pdf-lib' ติดตั้งด้วย `npm install @cantoo/pdf-lib -w @taxflow/api`");
  }
}

/* ------------------------------------------------------------- ค่าคงที่การวาด */

const C = {
  ink: '#1f2933',        // สีตัวอักษรหลัก
  muted: '#6b7280',      // ป้ายชื่อและข้อความรอง
  line: '#d1d5db',       // เส้นตารางและกรอบ
  headBg: '#f3f4f6',     // พื้นหลังหัวตาราง
  accent: '#ea6a1e',     // สีส้มประจำระบบ คงไว้ให้ตรงกับหน้าเว็บเดิม
};
const BASE_SIZE = { title: 20, banner: 11, body: 9.5, small: 8, tiny: 7 };
const SIZE = { ...BASE_SIZE };
/**
 * ความหนาแน่นของการวาด (1 = ปกติ) ใช้ตอนย่อเอกสารให้จบในหน้าเดียว (plan.fitOnePage)
 * ปรับขนาดตัวอักษรทุกระดับ ระยะ moveDown จึงหดตามไปด้วย (คิดจากความสูงบรรทัดของฟอนต์ปัจจุบัน)
 * ส่วนความสูงช่องลงนามคูณด้วย DENSITY ตรง ๆ
 */
let DENSITY = 1;
function setDensity(k) {
  DENSITY = k;
  for (const key of Object.keys(BASE_SIZE)) SIZE[key] = BASE_SIZE[key] * k;
}

/* --------------------------------------------------------- ตัวช่วยวาดทีละบล็อก */

/**
 * ตัดบรรทัดตามรอยต่อของคำไทยก่อนส่งให้ PDFKit ด้วยฟอนต์และขนาดที่ตั้งไว้ตอนนั้น
 * ลดความกว้างลง 1 จุดเผื่อค่าวัดคลาดเคลื่อนเล็กน้อย กัน PDFKit ไปตัดซ้ำกลางคำอีกรอบ
 */
function fit(d, text, width) {
  // เผื่อขอบไว้ 6pt: ถ้าตัดบรรทัดชิดขอบพอดี PDFKit อาจตัดซ้ำอีกรอบจากการปัดเศษความกว้าง
  // ทำให้มีคำค้างบรรทัดเดียว (เช่น "ตั้งอยู่เลขที่") กลางย่อหน้าสัญญา
  return thaiwrap.wrap(text, Math.max(1, width - 6), (str) => d.widthOfString(str));
}

/** ขีดเส้นแนวนอนเต็มความกว้างเนื้อหา */
function hr(d, y, color = C.line) {
  d.save().strokeColor(color).lineWidth(0.5)
    .moveTo(d.page.margins.left, y).lineTo(d.page.width - d.page.margins.right, y).stroke().restore();
}

/** ขึ้นหน้าใหม่เมื่อพื้นที่เหลือไม่พอสำหรับความสูงที่ต้องการ */
function ensureSpace(d, need) {
  const bottom = d.page.height - d.page.margins.bottom;
  if (d.y + need > bottom) d.addPage();
}

function drawHeader(d, b, W) {
  const top = d.y;
  if (b.logo) {
    // โลโก้เป็น data URI ต้องแปลงเป็น Buffer ก่อนส่งให้ PDFKit
    try {
      const base64 = String(b.logo).split(',')[1];
      if (base64) d.image(Buffer.from(base64, 'base64'), d.page.margins.left, top, { fit: [110, 45] });
    } catch { /* โลโก้เสียไม่ควรทำให้ออกเอกสารไม่ได้ */ }
  }
  d.font('bold').fontSize(SIZE.title).fillColor(C.ink)
    .text(b.title, d.page.margins.left, top, { width: W, align: 'right' });
  if (b.subtitle) {
    d.font('regular').fontSize(SIZE.small).fillColor(C.muted)
      .text(b.subtitle, { width: W, align: 'right' });
  }
  d.moveDown(0.4);

  for (const f of b.fields) {
    d.font('regular').fontSize(SIZE.body).fillColor(C.ink)
      .text(`${f.label}  ${f.value}`, { width: W, align: 'right' });
  }

  if (b.banner) {
    d.moveDown(0.5);
    const y = d.y;
    d.save().rect(d.page.margins.left, y, W, 20).fill(C.accent).restore();
    d.font('bold').fontSize(SIZE.banner).fillColor('#ffffff')
      .text(b.banner, d.page.margins.left, y + 5, { width: W, align: 'center' });
    d.fillColor(C.ink).y = y + 20;
  }
  d.moveDown(0.8);
}

function drawParties(d, b, W) {
  const gap = 14;
  const colW = (W - gap) / 2;
  const startY = d.y;
  let maxY = startY;

  for (const [i, box] of [b.left, b.right].entries()) {
    const x = d.page.margins.left + i * (colW + gap);
    d.y = startY;
    d.font('bold').fontSize(SIZE.small).fillColor(C.accent).text(box.title, x, d.y, { width: colW });
    d.moveDown(0.2);
    for (const line of box.lines) {
      d.font(line.bold ? 'bold' : 'regular').fontSize(SIZE.body).fillColor(C.ink);
      const text = line.label ? `${line.label}: ${line.value}` : line.value;
      d.text(fit(d, text, colW), x, d.y, { width: colW });
    }
    maxY = Math.max(maxY, d.y);
  }
  d.x = d.page.margins.left;
  d.y = maxY + 8;
}

function drawFields(d, b, W) {
  for (const f of b.items) {
    ensureSpace(d, 16);
    d.font('regular').fontSize(SIZE.body);
    const whole = `${f.label}: ${f.value}`;
    if (d.widthOfString(whole) <= W - 1) {
      // บรรทัดเดียวพอ ป้ายชื่อสีเทา ค่าสีเข้ม เหมือนหน้าเว็บเดิม
      d.fillColor(C.muted).text(`${f.label}: `, d.page.margins.left, d.y, { continued: true })
        .fillColor(C.ink).text(String(f.value));
    } else {
      // ยาวเกินบรรทัด ตัดทั้งข้อความตามรอยต่อคำไทย (เสียสีป้ายชื่อไป แต่ไม่มีคำขาดกลาง)
      d.fillColor(C.ink).text(fit(d, whole, W), d.page.margins.left, d.y, { width: W });
    }
  }
  d.moveDown(0.5);
}

/** คำนวณความกว้างจริงของแต่ละคอลัมน์ คอลัมน์ที่ width = 0 กินพื้นที่ที่เหลือ */
function columnWidths(columns, W) {
  const fixed = columns.reduce((sum, c) => sum + (c.width || 0), 0);
  const flexCount = columns.filter((c) => !c.width).length;
  const flexW = flexCount ? Math.max(60, (W - fixed) / flexCount) : 0;
  return columns.map((c) => c.width || flexW);
}

function drawTable(d, b, W) {
  const widths = columnWidths(b.columns, W);
  const padding = 4;

  // หัวตาราง: ตัดบรรทัดตามความกว้างคอลัมน์และสูงตามข้อความจริง (เดิมสูงตายตัว 18pt หัวคอลัมน์ยาว
  // เช่น "วัน เดือน หรือปีภาษีที่จ่าย" จึงขึ้นบรรทัดที่สองล้นทับแถวข้อมูล)
  const drawHeadRow = () => {
    d.font('bold').fontSize(SIZE.small).fillColor(C.ink);
    const heads = b.columns.map((col, i) => fit(d, String(col.label), widths[i] - padding * 2));
    const textH = heads.map((t, i) => d.heightOfString(t, { width: widths[i] - padding * 2 }));
    const headH = Math.max(18, ...textH.map((h) => h + 10));
    const y = d.y;
    d.save().rect(d.page.margins.left, y, W, headH).fill(C.headBg).restore();
    let x = d.page.margins.left;
    d.font('bold').fontSize(SIZE.small).fillColor(C.ink);
    b.columns.forEach((col, i) => {
      // จัดกึ่งกลางแนวตั้ง หัวคอลัมน์บรรทัดเดียวกับสองบรรทัดจึงอยู่ระดับเดียวกัน
      d.text(heads[i], x + padding, y + (headH - textH[i]) / 2, { width: widths[i] - padding * 2, align: col.align });
      x += widths[i];
    });
    d.y = y + headH;
    hr(d, d.y);
  };

  ensureSpace(d, 60);
  drawHeadRow();

  for (const row of b.rows) {
    // วัดความสูงที่ข้อความในคอลัมน์ชื่อรายการต้องใช้ก่อน เพื่อไม่ให้ตัดคร่อมหน้า
    d.font('regular').fontSize(SIZE.body);
    // ตัดบรรทัดทุกเซลล์ตามรอยต่อคำไทยก่อน แล้วค่อยวัดความสูง ใช้ข้อความชุดเดียวกันทั้งวัดและวาด
    // ช่องข้อมูลที่ว่าง (คอลัมน์ที่ 2 เป็นต้นไป) ใส่ขีด "-" ให้รู้ว่าไม่มีข้อมูล ไม่ใช่ลืมกรอก · ตั้ง blankDash: false ในตารางเพื่อปิด
    const cellText = (col, i) => {
      const v = row[col.key] == null ? '' : String(row[col.key]);
      return v.trim() === '' && i > 0 && b.blankDash !== false ? '-' : v;
    };
    const cells = b.columns.map((col, i) => fit(d, cellText(col, i), widths[i] - padding * 2));
    const rowH = Math.max(16, ...cells.map((text, i) => d.heightOfString(text, { width: widths[i] - padding * 2 }))) + 8;

    if (d.y + rowH > d.page.height - d.page.margins.bottom - 40) {
      d.addPage();
      drawHeadRow();
    }

    const y = d.y;
    let x = d.page.margins.left;
    d.fillColor(C.ink);
    b.columns.forEach((col, i) => {
      d.text(cells[i], x + padding, y + 4, { width: widths[i] - padding * 2, align: col.align });
      x += widths[i];
    });
    d.y = y + rowH;
    hr(d, d.y);
  }
  d.moveDown(0.4);
}

function drawTotals(d, b, W) {
  const boxW = 240;
  const x = d.page.width - d.page.margins.right - boxW;
  ensureSpace(d, b.lines.length * 16 + 24);
  // เว้นระยะจากตารางรายการด้านบน (เดิมยอดรวมเริ่มติดเส้นท้ายตาราง ดูเป็นแถวเดียวกัน)
  d.y += 12 * DENSITY;

  for (const line of b.lines) {
    if (line.rule) { hr(d, d.y + 1); d.y += 4; }
    const y = d.y;
    d.font(line.bold ? 'bold' : 'regular').fontSize(SIZE.body).fillColor(line.bold ? C.ink : C.muted)
      .text(line.label, x, y, { width: boxW - 90, align: 'left' });
    d.fillColor(C.ink)
      .text(line.value, x + boxW - 90, y, { width: 90, align: 'right' });
    d.y = Math.max(d.y, y + 16 * DENSITY);
  }
  d.x = d.page.margins.left;
  d.moveDown(0.5);
}

function drawText(d, b, W) {
  ensureSpace(d, 30);
  const size = b.style === 'baht' ? SIZE.body : SIZE.small;
  d.font(b.style === 'baht' ? 'bold' : 'regular').fontSize(size).fillColor(C.ink);
  d.text(fit(d, b.value, W), d.page.margins.left, d.y, { width: W, align: b.style === 'baht' ? 'right' : 'left' });
  d.moveDown(0.5);
}

/**
 * ช่องลงลายมือชื่อ
 * รองรับสามแบบที่เอกสารในระบบต้องใช้
 *   ปกติ      สองช่องคู่กัน (ผู้ออกเอกสาร / คู่ค้า)
 *   single    ช่องเดียวชิดขวา ใช้กับ 50 ทวิ และ ภ.ง.ด. ที่มีแต่ฝั่งผู้จ่ายเงินลงนาม
 *   compact   ช่องพยานท้ายสัญญา เตี้ยกว่าเพราะไม่มีรูปลายเซ็น
 */
function drawSignature(d, b, W) {
  const sigH = (b.compact ? 26 : 38) * DENSITY;
  const need = (b.caption ? 16 : 0) + sigH + 46;
  ensureSpace(d, need);
  d.moveDown(b.compact ? 0.4 : 1);

  if (b.caption) {
    d.font('regular').fontSize(SIZE.small).fillColor(C.ink)
      .text(fit(d, b.caption, W), d.page.margins.left, d.y, { width: W, align: b.single ? 'right' : 'center' });
    d.moveDown(0.3);
  }

  const cols = b.single ? 1 : b.boxes.length;
  const gap = 40;
  const colW = b.single ? Math.min(260, W) : (W - gap * (cols - 1)) / cols;
  const startX = b.single ? d.page.width - d.page.margins.right - colW : d.page.margins.left;
  const startY = d.y;
  let maxY = startY;

  b.boxes.forEach((box, i) => {
    const x = startX + i * (colW + gap);
    let y = startY;

    if (box.image) {
      try {
        const base64 = String(box.image).split(',')[1];
        if (base64) d.image(Buffer.from(base64, 'base64'), x + colW / 2 - 45, y, { fit: [90, sigH - 4] });
      } catch { /* ลายเซ็นเสียไม่ควรทำให้ออกเอกสารไม่ได้ */ }
    }
    // ตราประทับนิติบุคคลวางข้างช่องลงนามของผู้ออกเอกสารเท่านั้น (ช่องแรก)
    if (b.seal && i === 0) {
      try {
        const base64 = String(b.seal).split(',')[1];
        if (base64) d.image(Buffer.from(base64, 'base64'), x + colW - 52, y, { fit: [50, sigH + 8] });
      } catch { /* ตราประทับเสียไม่ควรทำให้ออกเอกสารไม่ได้ */ }
    }
    y += sigH;
    d.save().strokeColor(C.line).lineWidth(0.5).moveTo(x, y).lineTo(x + colW, y).stroke().restore();
    d.font('regular').fontSize(SIZE.small).fillColor(C.muted);
    d.text(fit(d, `(${box.name || '.'.repeat(30)})`, colW), x, y + 4, { width: colW, align: 'center' });
    d.text(fit(d, box.role, colW), x, d.y, { width: colW, align: 'center' });
    if (box.position) d.text(fit(d, box.position, colW), x, d.y, { width: colW, align: 'center' });
    if (box.signedAt) {
      // ลงนามแล้วให้แสดงเวลาที่ลงนามแทนช่องวันที่เปล่า เพื่อให้ตรงกับข้อมูลที่ใช้ตรวจสอบเอกสาร
      const at = new Date(box.signedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
      d.fillColor(C.accent).fontSize(SIZE.tiny)
        .text(fit(d, `ลงนามอิเล็กทรอนิกส์ ${at}`, colW), x, d.y, { width: colW, align: 'center' })
        .fillColor(C.muted).fontSize(SIZE.small);
    } else if (box.date) {
      d.text(`วันที่ ${box.date}`, x, d.y, { width: colW, align: 'center' });
    } else if (!b.compact) {
      d.text('วันที่ ........./........./.........', x, d.y, { width: colW, align: 'center' });
    }
    maxY = Math.max(maxY, d.y);
  });
  d.x = d.page.margins.left;
  d.y = maxY;
  d.moveDown(b.compact ? 0.5 : 1);
}

function drawNote(d, b, W) {
  const alert = b.style === 'alert';
  // ลายน้ำเอกสารที่ยกเลิกแล้ว วาดทับกลางหน้าให้เห็นชัดตั้งแต่มองผ่าน ๆ
  if (b.watermark) drawWatermark(d, b.watermark);

  // ver18: ไม่วาด QR ในเอกสารแล้ว ลิงก์ตรวจสอบแสดงเป็นข้อความอย่างเดียว
  const textW = W - 12;
  d.font(alert ? 'bold' : 'regular').fontSize(alert ? SIZE.small : SIZE.tiny)
    .fillColor(alert ? '#b91c1c' : C.muted);
  const body = fit(d, b.value, textW);
  const h = d.heightOfString(body, { width: textW }) + 10;
  // ขอพื้นที่เท่าความสูงกล่องจริง (เดิมขอตายตัว 40pt ทำให้หมายเหตุบรรทัดเดียวท้ายหน้าถูกดันไปหน้าใหม่)
  ensureSpace(d, h);
  const y = d.y;
  d.save().rect(d.page.margins.left, y, W, h)
    .fillColor(alert ? '#fef2f2' : '#ffffff').fillOpacity(alert ? 1 : 0).fill()
    .restore();
  d.save().rect(d.page.margins.left, y, W, h)
    .strokeColor(alert ? '#b91c1c' : C.line).lineWidth(0.5).stroke().restore();
  d.fillColor(alert ? '#b91c1c' : C.muted).text(body, d.page.margins.left + 6, y + 5, { width: textW });
  d.y = y + h + 6;
  d.fillColor(C.ink);
}


/**
 * ลายน้ำเฉียงคาดกลางหน้า ใช้บอกสถานะเอกสารที่ห้ามนำไปใช้อ้างอิง (ยกเลิกแล้ว / ฉบับร่าง)
 * วาดคาดทับเนื้อหาแทนการขึ้นแถบที่หัวกระดาษ เอกสารที่พิมพ์ออกไปจึงแยกออกทันทีแม้มองผ่าน ๆ
 * และไม่เบียดพื้นที่ของเนื้อหาจริง
 * @param {string} text ข้อความตัวใหญ่กลางหน้า
 * @param {object} [opts] { color, subtitle } สีลายน้ำ และบรรทัดอธิบายใต้ข้อความใหญ่
 */
function drawWatermark(d, text, opts = {}) {
  // pdfkit เลื่อนตำแหน่งเขียน (d.x/d.y) ตามข้อความที่วาด ถ้าไม่คืนค่า เนื้อหาถัดไปจะเริ่มกลางหน้า
  // (บั๊กเดิม: เอกสารที่ยกเลิกมีช่องว่างว่างครึ่งหน้าแรกและเนื้อหาไหลไปหน้า 2)
  const { x, y } = d;
  const color = opts.color || '#b91c1c';
  const mid = d.page.height / 2;
  d.save();
  d.rotate(-35, { origin: [d.page.width / 2, mid] });
  d.font('bold').fontSize(64).fillColor(color).fillOpacity(0.14)
    .text(text, 0, mid - 46, { width: d.page.width, align: 'center', features: FONT_FEATURES });
  if (opts.subtitle) {
    d.font('regular').fontSize(13).fillColor(color).fillOpacity(0.38)
      .text(opts.subtitle, 0, mid + 30, { width: d.page.width, align: 'center', features: FONT_FEATURES });
  }
  d.restore();
  d.x = x;
  d.y = y;
  d.fillOpacity(1).fillColor(C.ink);
}

/** บล็อกลายน้ำล้วน ไม่กินพื้นที่แนวตั้ง (แถบสถานะที่หัวกระดาษย้ายมาเป็นลายน้ำแทน) */
function drawStatusWatermark(d, b) {
  drawWatermark(d, b.value, { color: b.color, subtitle: b.subtitle });
}

/* ------------------------------------- บล็อกของเอกสารราชการและสัญญา (WP5 ต่อยอด) */

/** หัวเรื่องกลางหน้าแบบหนังสือราชการ ไม่ใช่หัวกระดาษแบบใบเสร็จ */
function drawHeading(d, b, W) {
  ensureSpace(d, 70);
  const top = d.y;

  // ช่องติดอากรแสตมป์มุมซ้ายบน (หนังสือมอบอำนาจ)
  if (b.stamp) {
    d.save().rect(d.page.margins.left, top, 70, 46).strokeColor(C.line).lineWidth(0.5).dash(2, { space: 2 }).stroke().restore();
    d.font('regular').fontSize(SIZE.tiny).fillColor(C.muted)
      .text(b.stamp, d.page.margins.left + 3, top + 12, { width: 64, align: 'center' });
  }
  // ป้ายชื่อแบบฟอร์ม (ภ.ง.ด.3 / ภ.ง.ด.53) หรือข้อความกำกับฉบับที่ (50 ทวิ)
  if (b.tag) {
    d.font('bold').fontSize(SIZE.small).fillColor(C.accent)
      .text(fit(d, b.tag, W), d.page.margins.left, top, { width: W, align: 'right' });
  }
  if (b.right && b.right.length) {
    d.font('regular').fontSize(SIZE.small).fillColor(C.ink);
    for (const f of b.right) d.text(`${f.label} ${f.value}`, d.page.margins.left, d.y, { width: W, align: 'right' });
  }

  d.y = Math.max(d.y, top + (b.stamp ? 20 : 0));
  d.font('bold').fontSize(SIZE.title - 3).fillColor(C.ink)
    .text(fit(d, b.title, W), d.page.margins.left, d.y, { width: W, align: 'center' });
  if (b.subtitle) {
    d.font('regular').fontSize(SIZE.small).fillColor(C.muted)
      .text(fit(d, b.subtitle, W), d.page.margins.left, d.y + 1, { width: W, align: 'center' });
  }
  d.fillColor(C.ink);
  d.moveDown(0.8);
}

/** ย่อหน้าเนื้อความ ย่อหน้าบรรทัดแรกได้ตามธรรมเนียมหนังสือราชการไทย */
function drawPara(d, b, W) {
  ensureSpace(d, 30);
  d.font('regular').fontSize(SIZE.body).fillColor(C.ink);
  const align = b.align || 'left';
  // ย่อหน้าบรรทัดแรกทำด้วยการเว้นวรรคนำหน้า เพราะ PDFKit ไม่มี text-indent ให้ใช้ตรง ๆ
  const value = b.indent ? '        ' + b.value : b.value;
  for (const line of String(value).split('\n')) {
    d.text(fit(d, line, W), d.page.margins.left, d.y, { width: W, align, lineGap: 1.5 });
  }
  d.moveDown(0.4);
}

/** ข้อสัญญาเรียงเลขอัตโนมัติ แต่ละข้อมีหัวข้อ เนื้อความ และตาราง/ข้อความปิดท้ายได้ */
function drawClauses(d, b, W) {
  b.items.forEach((clause, i) => {
    ensureSpace(d, 46);
    d.font('bold').fontSize(SIZE.body).fillColor(C.ink)
      .text(fit(d, `ข้อ ${i + 1}. ${clause.title}`, W), d.page.margins.left, d.y, { width: W });
    d.moveDown(0.15);

    const indentX = d.page.margins.left + 14;
    const indentW = W - 14;
    if (clause.body) {
      d.font('regular').fontSize(SIZE.body).fillColor(C.ink);
      // แต่ละย่อหน้าในข้อสัญญาเยื้องบรรทัดแรกตามแบบหนังสือสัญญา
      for (const line of String(clause.body).split('\n')) {
        d.text(fit(d, '      ' + line, indentW), indentX, d.y, { width: indentW, lineGap: 1.5 });
      }
    }
    if (clause.fields && clause.fields.length) {
      // รายการย่อยจัดเป็นสองคอลัมน์ ป้ายชื่อชิดซ้ายความกว้างเท่ากันทุกแถว ค่ายาวตัดบรรทัดอยู่ในคอลัมน์ของตัวเอง
      d.moveDown(0.25);
      const labelW = 104;
      const valueX = indentX + 14 + labelW;
      const valueW = indentW - 14 - labelW;
      clause.fields.forEach((f, k) => {
        d.font('regular').fontSize(SIZE.body);
        const value = fit(d, String(f.value), valueW);
        const h = d.heightOfString(value, { width: valueW, lineGap: 1.5 });
        ensureSpace(d, h + 2);
        const y = d.y;
        d.fillColor(C.ink).text(`${i + 1}.${k + 1}`, indentX, y, { width: 14, lineBreak: false });
        d.fillColor(C.muted).text(f.label, indentX + 14, y, { width: labelW - 6, lineBreak: false });
        d.fillColor(C.ink).text(value, valueX, y, { width: valueW, lineGap: 1.5 });
        d.y = Math.max(d.y, y + h) + 1;
      });
      d.fillColor(C.ink);
    }
    if (clause.table) {
      d.moveDown(0.3);
      d.x = d.page.margins.left;
      drawTable(d, clause.table, W);
    }
    if (clause.after) {
      d.moveDown(0.2);
      d.font('regular').fontSize(SIZE.body).fillColor(C.ink)
        .text(fit(d, '      ' + clause.after, indentW), indentX, d.y, { width: indentW, lineGap: 1.5 });
    }
    d.x = d.page.margins.left;
    d.moveDown(0.5);
  });
}

/** วาดช่องติ๊กหนึ่งช่อง คืนความกว้างที่ใช้ไป */
function drawCheckbox(d, x, y, checked) {
  const s = 7.5;
  d.save().rect(x, y, s, s).strokeColor(C.ink).lineWidth(0.6).stroke();
  if (checked) {
    // วาดเครื่องหมายถูกด้วยเส้น ไม่ใช้อักขระ ✓ เพราะฟอนต์ที่ฝังอาจไม่มีอักขระนั้น
    // (PDF/A ห้ามใช้ฟอนต์ที่ไม่ฝัง ตัวอักษรที่หายจึงกลายเป็นช่องว่างเงียบ ๆ)
    d.moveTo(x + 1.5, y + s / 2).lineTo(x + s / 2.6, y + s - 1.8).lineTo(x + s - 1.2, y + 1.6)
      .strokeColor(C.accent).lineWidth(1.2).stroke();
  }
  d.restore();
  return s;
}

/**
 * ช่องติ๊กเลือกตามแบบฟอร์มราชการ
 *   inline  เรียงต่อกันในบรรทัดเดียว ขึ้นบรรทัดใหม่เมื่อเต็มความกว้าง (เดือนภาษี, ลำดับแบบ)
 *   list    เรียงลงมาทีละบรรทัด (เรื่องที่มอบอำนาจ, นำส่งภาษีตาม)
 */
function drawChecks(d, b, W) {
  ensureSpace(d, 30);
  if (b.title) {
    d.font('bold').fontSize(SIZE.small).fillColor(C.ink)
      .text(fit(d, b.title, W), d.page.margins.left, d.y, { width: W });
    d.moveDown(0.15);
  }
  d.font('regular').fontSize(SIZE.small).fillColor(C.ink);

  if (b.layout === 'list') {
    for (const item of b.items) {
      ensureSpace(d, 14);
      const y = d.y;
      drawCheckbox(d, d.page.margins.left + 4, y + 1.5, item.checked);
      d.text(fit(d, item.label, W - 20), d.page.margins.left + 18, y, { width: W - 18 });
      d.y = Math.max(d.y, y + 12);
    }
  } else {
    let x = d.page.margins.left + 2;
    let y = d.y;
    const right = d.page.width - d.page.margins.right;
    for (const item of b.items) {
      const textW = d.widthOfString(item.label);
      const cellW = textW + 22;
      if (x + cellW > right) { x = d.page.margins.left + 2; y += 13; ensureSpace(d, 16); }
      drawCheckbox(d, x, y + 1.5, item.checked);
      d.text(item.label, x + 12, y, { width: textW + 4, lineBreak: false });
      x += cellW;
    }
    d.y = y + 13;
  }
  d.x = d.page.margins.left;

  if (b.note) {
    d.font('regular').fontSize(SIZE.tiny).fillColor(C.muted)
      .text(fit(d, b.note, W), d.page.margins.left, d.y, { width: W });
    d.fillColor(C.ink);
  }
  d.moveDown(0.4);
}

/**
 * กล่องข้อมูลคู่กรณีของแบบฟอร์มกรมสรรพากร พร้อมช่องกรอกเลขประจำตัวผู้เสียภาษี 13 ช่อง
 * แบบจริงพิมพ์เป็นช่องสี่เหลี่ยมเรียงกัน ไม่ใช่ข้อความยาวติดกัน จึงวาดให้เหมือนของจริง
 */
function drawIdBoxes(d, b, W) {
  const digits = String(b.taxId || '').replace(/\D/g, '').padEnd(13, ' ').slice(0, 13);
  const boxW = 13;
  const boxH = 14;
  const groups = [1, 4, 5, 2, 1]; // รูปแบบ x-xxxx-xxxxx-xx-x ตามที่พิมพ์บนแบบ

  ensureSpace(d, 60);
  const top = d.y;
  d.font('bold').fontSize(SIZE.small).fillColor(C.ink)
    .text(fit(d, b.title, W - 250), d.page.margins.left + 4, top + 2, { width: W - 250 });

  // แถวช่องตัวเลขชิดขวา
  const totalW = 13 * boxW + (groups.length - 1) * 5;
  let x = d.page.width - d.page.margins.right - totalW - 6;
  const labelW = d.widthOfString('เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)');
  d.font('regular').fontSize(SIZE.tiny).fillColor(C.muted)
    .text('เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)', x - labelW - 6, top + 4, { width: labelW + 2, lineBreak: false });

  let idx = 0;
  for (const g of groups) {
    for (let i = 0; i < g; i++, idx++) {
      d.save().rect(x, top, boxW, boxH).strokeColor(C.line).lineWidth(0.5).stroke().restore();
      d.font('regular').fontSize(SIZE.small).fillColor(C.ink)
        .text(digits[idx].trim(), x, top + 3, { width: boxW, align: 'center', lineBreak: false });
      x += boxW;
    }
    x += 5;
  }

  d.y = top + boxH + 3;
  d.x = d.page.margins.left;
  for (const line of b.lines) {
    ensureSpace(d, 14);
    d.font('regular').fontSize(SIZE.body);
    d.fillColor(C.muted).text(`${line.label}: `, d.page.margins.left + 4, d.y, { continued: true, width: W - 8 })
      .fillColor(C.ink).text(fit(d, String(line.value), W - 60));
  }
  const bottom = d.y + 3;
  d.save().rect(d.page.margins.left, top - 3, W, bottom - top + 3)
    .strokeColor(C.line).lineWidth(0.5).stroke().restore();
  d.y = bottom + 6;
  d.fillColor(C.ink);
}

/** ขึ้นหน้าใหม่ (50 ทวิ ออก 2 ฉบับ · ภ.ง.ด. มีใบแนบแยกแผ่น) */
function drawPagebreak(d) {
  d.addPage();
}

const PAINTERS = {
  header: drawHeader, parties: drawParties, fields: drawFields, table: drawTable,
  totals: drawTotals, text: drawText, signature: drawSignature, note: drawNote,
  heading: drawHeading, para: drawPara, clauses: drawClauses, checks: drawChecks,
  idboxes: drawIdBoxes, pagebreak: drawPagebreak, watermark: drawStatusWatermark,
};

/**
 * แทรก FONT_FEATURES เข้าไปในทุกการเรียก text / widthOfString / heightOfString
 * ทำครั้งเดียวที่ตัวเอกสาร ดีกว่าไปเติมทุกจุดที่วาดแล้วมีโอกาสลืมสักจุด
 * และการวัดกับการวาดต้องใช้ฟีเจอร์ชุดเดียวกัน มิฉะนั้นความกว้างที่วัดได้จะไม่ตรงกับที่วาดจริง
 */
function withFontFeatures(d) {
  const addFeatures = (args) => {
    const list = args.length ? [...args] : [{}];
    const last = list[list.length - 1];
    if (last && typeof last === 'object' && !Array.isArray(last)) {
      list[list.length - 1] = { features: FONT_FEATURES, ...last };
    } else {
      list.push({ features: FONT_FEATURES });
    }
    return list;
  };
  const text = d.text.bind(d);
  const width = d.widthOfString.bind(d);
  const height = d.heightOfString.bind(d);
  d.text = (str, ...rest) => text(str, ...addFeatures(rest));
  d.widthOfString = (str, opts) => width(str, { features: FONT_FEATURES, ...(opts || {}) });
  d.heightOfString = (str, opts) => height(str, { features: FONT_FEATURES, ...(opts || {}) });
  return d;
}

/* --------------------------------------------------- ขั้นที่ 1 วาดด้วย PDFKit */

/**
 * วาดแผนผังหนึ่งชุดเป็นไฟล์ PDF ธรรมดา (ยังไม่ใช่ PDF/A)
 * @returns {Promise<Buffer>}
 */
async function render(plan) {
  if (!plan.fitOnePage) return (await renderOnce(plan, FIT_STEPS[0])).buffer;
  let out = null;
  for (const step of FIT_STEPS) {
    out = await renderOnce(plan, step);
    if (out.pages <= 1) {
      if (process.env.TAXFLOW_FIT_DEBUG) console.log(`[pdf] fitOnePage font ${step.font} space ${step.space}`);
      return out.buffer;
    }
  }
  return out.buffer; // เนื้อหายาวเกินหน้าเดียวจริง ๆ ใช้ขนาดเล็กสุดที่ยังอ่านได้ (ยอมขึ้นหลายหน้า)
}

/**
 * ขั้นการย่อเมื่อ plan.fitOnePage แต่ยังล้นหน้า ลองทีละขั้นจนจบในหน้าเดียว
 * ลดช่องว่างระหว่างย่อหน้า/ข้อ (space) ก่อน แล้วค่อยลดขนาดตัวอักษร (font) ตัวอักษรต่ำสุด 80% (เล็กกว่านี้อ่านยาก)
 */
const FIT_STEPS = [
  { font: 1, space: 1 },
  { font: 1, space: 0.6 },
  { font: 0.95, space: 0.45 },
  { font: 0.9, space: 0.35 },
  { font: 0.85, space: 0.3 },
  { font: 0.8, space: 0.25 },
];

function renderOnce(plan, step) {
  requireFonts();
  const PDFDocument = loadPdfkit();
  const density = step.font;

  return new Promise((resolve, reject) => {
    const margin = plan.margin || 40;
    const d = new PDFDocument({
      size: plan.pageSize || 'A4',
      // ขอบกระดาษหดเมื่อย่อ แต่ไม่ต่ำกว่า 36pt (ขอบพิมพ์ของเครื่องพิมพ์ทั่วไป)
      margin: step.space < 1 ? Math.max(36, Math.round(margin * 0.8)) : margin,
      // PDFKit เขียน Info dictionary ให้จากตรงนี้ pdf-lib จะ sync เข้า XMP ตอนแปลงเป็น PDF/A
      info: { Title: plan.title, Producer: 'TaxFlow ver18', Creator: 'TaxFlow ver18' },
      // autoFirstPage ค่าเริ่มต้นคือ true ซึ่งเป็นสิ่งที่ต้องการ
    });
    // ช่องว่างแนวตั้งระหว่างบล็อกทั้งหมดมาจาก moveDown จึงย่อที่จุดเดียว ไม่ต้องแก้ทุกบล็อก
    if (step.space !== 1) {
      const moveDown = d.moveDown.bind(d);
      d.moveDown = (lines = 1) => moveDown(lines * step.space);
    }

    const chunks = [];
    let pages = 1;
    d.on('pageAdded', () => { pages += 1; });
    d.on('data', (c) => chunks.push(c));
    d.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages }));
    d.on('error', reject);

    setDensity(density);
    try {
      // ฝังฟอนต์แบบ subset (PDFKit ทำ subset ให้อัตโนมัติสำหรับฟอนต์ TTF)
      const fonts = fontSetFor(plan.docFont);
      d.registerFont('regular', fonts.regular);
      d.registerFont('bold', fonts.bold);
      withFontFeatures(d);
      d.font('regular').fillColor(C.ink);

      const W = d.page.width - d.page.margins.left - d.page.margins.right;
      for (const block of plan.blocks) {
        const paint = PAINTERS[block.type];
        if (paint) paint(d, block, W);
      }
      d.end();
    } catch (err) {
      reject(err);
    } finally {
      // การวาดข้างบนเป็น synchronous ทั้งหมด คืนค่าปกติได้ทันที ไม่กระทบเอกสารฉบับอื่นที่วาดต่อ
      setDensity(1);
    }
  });
}

/* ------------------------------------------- ขั้นที่ 2 แปลงเป็น PDF/A-3 + แนบ XML */

/**
 * แปลงไฟล์ PDF ให้เป็น PDF/A-3 และแนบไฟล์ XML เข้าไปเป็น Associated File
 * @param {Buffer} pdfBuffer ไฟล์จากขั้นที่ 1
 * @param {object} attachment { name, content, description }
 * @returns {Promise<Buffer>}
 */
async function toPdfA3(pdfBuffer, attachment, meta = {}) {
  const lib = loadPdfLib();
  const { PDFDocument, AFRelationship } = lib;
  const pdf = await PDFDocument.load(pdfBuffer);

  if (meta.title) pdf.setTitle(meta.title);
  if (meta.author) pdf.setAuthor(meta.author);
  pdf.setProducer('TaxFlow ver18');
  pdf.setCreator('TaxFlow ver18');
  const now = meta.date || new Date();
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);

  if (attachment && attachment.content) {
    // AFRelationship = Data บอกว่าไฟล์แนบคือข้อมูลของเอกสารฉบับเดียวกัน
    // ไม่ใช่ไฟล์ประกอบคนละเรื่อง ซึ่ง PDF/A-3 บังคับให้ประกาศให้ถูกต้อง
    await pdf.attach(
      Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content, 'utf8'),
      attachment.name,
      {
        mimeType: 'text/xml',
        description: attachment.description || 'ข้อมูลเอกสารอิเล็กทรอนิกส์ตามมาตรฐาน ขมธอ. 3-2560',
        creationDate: now,
        modificationDate: now,
        afRelationship: AFRelationship ? AFRelationship.Data : 'Data',
      }
    );
  }

  // 3B = PDF/A-3 ระดับ B (ตรวจสอบการแสดงผลได้ ไม่บังคับโครงสร้างการอ่านออกเสียง)
  // ขั้นตอนนี้ใส่ OutputIntent พร้อม ICC profile ของ sRGB, คู่ /ID และ XMP ที่ประกาศ pdfaid:part=3
  pdf.convertToPDFA({ conformance: '3B' });

  // WP6: ลงลายมือชื่อดิจิทัลเป็นขั้นสุดท้าย ต้องหลังแปลงเป็น PDF/A และหลังแนบ XML แล้ว
  // เพราะลายมือชื่อต้องครอบคลุมทุกไบต์ รวมถึงไฟล์ XML ที่แนบอยู่ภายใน
  // ใครแก้ XML ในไฟล์ PDF แม้ตัวเดียว การตรวจลายมือชื่อก็ไม่ผ่าน
  if (meta.sign && meta.sign.signer) {
    pdfsign.addPlaceholder(pdf, lib, meta.sign);
    // ไม่ใช้ object stream มิฉะนั้นช่อง /Contents ถูกบีบอัดรวมกับวัตถุอื่นจนหาตำแหน่งเติมลายมือชื่อไม่ได้
    const bytes = await pdf.save({ useObjectStreams: false });
    return pdfsign.fillSignature(bytes, meta.sign.signer);
  }

  return Buffer.from(await pdf.save());
}

/* -------------------------------------------------------------- ฟังก์ชันหลัก */

/**
 * สร้างไฟล์เอกสารฉบับสมบูรณ์จากเอกสารหนึ่งฉบับ
 * เอกสารกลุ่ม e-Tax จะได้ PDF/A-3 ที่มี XML แนบอยู่ภายใน
 * เอกสารประเภทอื่นได้ PDF ธรรมดาที่ฝังฟอนต์ครบ
 * @returns {Promise<{ pdf: Buffer, xml: string|null, xmlName: string|null, pdfa: boolean }>}
 */
async function buildDocument(doc, opt = {}) {
  const plan = docplan.build(doc, opt);
  plan.docFont = doc.docFont || 'sarabun';
  const drawn = await render(plan);

  // เอกสารทุกประเภทถูกแปลงเป็น PDF/A-3 เหมือนกันหมด ไม่ใช่เฉพาะกลุ่ม e-Tax
  // เพราะขั้นตอนแปลงเป็นการเติม XMP, OutputIntent และคู่ /ID ซึ่งไม่ขึ้นกับว่ามีไฟล์แนบหรือไม่
  // (PDF/A-3 ไม่ได้บังคับว่าต้องมีไฟล์แนบ บังคับแค่ว่าถ้ามีต้องประกาศความสัมพันธ์ให้ถูก)
  // ทำให้ช่อง Tax & Document ในตารางเทคโนโลยีเป็นจริงกับเอกสารทั้ง 14 ประเภท
  // ไม่ต้องใช้ทางเลือกลดความเสี่ยงข้อ 1 ของแผน ver18
  let xml = null;
  let xmlName = null;
  let attachment = null;

  if (xmlbuild.supports(doc.type)) {
    xml = xmlbuild.build(doc, opt);
    const problems = xmlbuild.validate(xml, doc);
    if (problems.length) {
      // ไม่บันทึกไฟล์ที่ข้อมูลไม่ครบตามกฎหมาย ดีกว่าออกเอกสารที่ใช้อ้างอิงไม่ได้
      throw new Error(`ข้อมูลเอกสารไม่ครบตามมาตรฐาน: ${problems.join(' · ')}`);
    }
    xmlName = xmlbuild.fileName(doc);
    attachment = { name: xmlName, content: xml };
  }

  // WP6: ลงลายมือชื่อดิจิทัลเฉพาะเอกสารที่ผู้ออกกดลงนามและยืนยันด้วย OTP แล้ว (มี doc.signature)
  // เอกสารที่ยังไม่ลงนามได้ PDF/A-3 ธรรมดา ไม่อ้างว่ามีคนลงนามทั้งที่ยังไม่มี
  //
  // เวลาใน /M ต้องเป็น "เวลาที่ประทับลายมือชื่อลงไฟล์นี้" ตามมาตรฐาน PAdES ไม่ใช่เวลาที่ผู้ใช้ยืนยัน OTP
  // รุ่นแรกของ WP6 ใช้เวลายืนยัน OTP ทำให้เอกสารที่ลงนามก่อนสร้างใบรับรองใบปัจจุบัน
  // ถูก Adobe รายงานว่า "Signer's identity is invalid because it has expired or is not yet valid"
  // (อ้างว่าลงนามด้วยใบรับรองก่อนที่ใบรับรองนั้นจะมีอยู่) เวลายืนยัน OTP ย้ายไปบันทึกในเหตุผลแทน
  const otpAt = doc.signature && doc.signature.signedAt
    ? new Date(doc.signature.signedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    : '';
  const sign = opt.signer && doc.signature ? {
    signer: opt.signer,
    name: doc.signature.signerName || '',
    reason: `ลงนามโดย ${doc.signature.signerName || '-'} ยืนยันตัวตนด้วยรหัส OTP ทางอีเมล`
      + `${otpAt ? ` เมื่อ ${otpAt}` : ''} `
      + 'ผ่านระบบ TaxFlow (ใบรับรองที่ออกเองเพื่อการสาธิต ไม่มีผลรับรองตามกฎหมาย)',
    location: 'TaxFlow',
    signedAt: opt.generatedAt || new Date(),
  } : null;

  const pdf = await toPdfA3(drawn, attachment, {
    title: plan.title,
    author: (doc.issuer && doc.issuer.name) || '',
    date: opt.generatedAt,
    sign,
  });

  return { pdf, xml, xmlName, pdfa: true, digitallySigned: !!sign };
}

module.exports = {
  buildDocument, render, toPdfA3,
  fontStatus, requireFonts, FONT_DIR, FONTS,
  columnWidths, // ส่งออกเพื่อให้ชุดทดสอบตรวจการคำนวณความกว้างคอลัมน์ได้
  withFontFeatures, FONT_FEATURES,
};
