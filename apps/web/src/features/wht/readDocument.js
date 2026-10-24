/**
 * readDocument.js อ่านข้อความจากไฟล์ที่ผู้ใช้เลือก (ทำในเบราว์เซอร์ทั้งหมด ไม่อัปโหลดไฟล์)
 *   PDF ที่มีข้อความ      → pdf.js (เรียงข้อความตามตำแหน่งบนหน้าเป็นบรรทัด)
 *   PDF สแกน / รูปภาพ     → OCR ภาษาไทย+อังกฤษ (tesseract.js โหลดจาก /ocr/ ของเว็บเอง)
 *   Word / Excel / ODF   → แตก zip แล้วอ่าน XML (docx, xlsx, odt, ods)
 *   CSV / TXT            → อ่านตรง (UTF-8 หรือ TIS-620/Windows-874 ที่ Excel ภาษาไทยมักใช้)
 * คืน { text, kind, ocr, preview } โดย preview = { type: 'image', src } | { type: 'text', text } ไว้ให้ผู้ใช้เทียบกับค่าที่อ่านได้
 */
import { loadPdfjs } from '../docs/DocPreview.jsx';
import { openZip } from './unzip.js';
import { pageLines } from './pdfText.js';

export const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPT = '.pdf,.docx,.xlsx,.odt,.ods,.csv,.txt,.jpg,.jpeg,.png,.webp,.bmp,.gif,application/pdf,image/*';
export const FORMATS = 'PDF · Word (.docx) · Excel (.xlsx) · OpenDocument · CSV · รูปถ่ายหรือไฟล์สแกน (JPG, PNG, WEBP)';

export class ReadError extends Error {}

const ext = (name) => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';

export function kindOf(file) {
  const e = ext(file.name);
  const t = file.type || '';
  if (e === 'pdf' || t === 'application/pdf') return 'pdf';
  if (['docx', 'xlsx', 'odt', 'ods'].includes(e)) return e;
  if (['csv', 'txt'].includes(e) || t === 'text/csv' || t === 'text/plain') return 'text';
  if (['heic', 'heif'].includes(e) || /heic|heif/.test(t)) return 'heic';
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(e) || t.startsWith('image/')) return 'image';
  if (['doc', 'xls', 'ppt', 'rtf'].includes(e)) return 'legacy';
  return 'unknown';
}

/* ---------- XML → ข้อความ ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENT[e] ?? m;
});
/** ตัดแท็ก <...> ออก ด้วย indexOf แทน regex /<[^>]+>/g ที่ช้าแบบกำลังสองเมื่อมี "<" ไม่มีคู่ปิด */
function removeTags(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    const gt = lt < 0 ? -1 : s.indexOf('>', lt + 1);
    if (gt < 0) return out + s.slice(i);
    // "<>" ว่างไม่ใช่แท็ก (regex เดิมต้องมีอย่างน้อยหนึ่งตัวอักษรข้างใน) เก็บไว้ตามเดิม
    out += gt === lt + 1 ? s.slice(i, gt + 1) : s.slice(i, lt);
    i = gt + 1;
  }
  return out;
}
const stripTags = (s) => decodeXml(removeTags(s));

/**
 * ข้อความในแต่ละช่องตารางเป็นย่อหน้าของตัวเอง ถ้าแปลงย่อหน้าเป็นขึ้นบรรทัดทุกครั้ง แถวเดียวของตารางจะแตกเป็นหลายบรรทัด
 * และยอดเงินจะไม่อยู่บรรทัดเดียวกับประเภทเงินได้ จึงรวมย่อหน้าในช่องเป็นช่องว่าง คั่นช่องด้วยแท็บ และขึ้นบรรทัดเมื่อจบแถว
 */
function docxText(xml) {
  return stripTags(xml
    .replace(/<w:tc[ >][\s\S]*?<\/w:tc>/g, (tc) => tc.replace(/<\/w:p>/g, ' '))
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n'));
}

function odfText(xml) {
  return stripTags(xml
    .replace(/<table:table-cell[ >][\s\S]*?<\/table:table-cell>/g, (tc) => tc.replace(/<\/text:p>/g, ' '))
    .replace(/<text:tab\/>/g, '\t')
    .replace(/<text:line-break\/>/g, '\n')
    .replace(/<\/table:table-cell>/g, '\t')
    .replace(/<\/table:table-row>/g, '\n')
    .replace(/<\/text:p>/g, '\n'));
}

/** ตัวเลขในเซลล์ Excel เก็บเป็นค่าดิบ (12000) จัดรูปแบบเงินให้เหมือนที่เห็นบนเอกสาร (12,000.00) · เลขยาว 10 หลักขึ้นไป (เลขผู้เสียภาษี เบอร์โทร) คงไว้ตามเดิม */
function cellNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || /^\d{10,}$/.test(v)) return v;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function xlsxText(zip) {
  const sharedXml = (await zip.text('xl/sharedStrings.xml')) || '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join(''));
  const sheets = zip.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])).slice(0, 5);
  const out = [];
  for (const name of sheets) {
    const xml = await zip.text(name);
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [...row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, attrs, inner = '']) => {
        const t = (attrs.match(/\st="(\w+)"/) || [])[1];
        if (t === 'inlineStr') return stripTags(inner);
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v == null) return '';
        if (t === 's') return shared[Number(v)] ?? '';
        if (t === 'str' || t === 'b' || t === 'e') return decodeXml(v);
        return cellNumber(v);
      });
      if (cells.some(Boolean)) out.push(cells.join('\t'));
    }
  }
  return out.join('\n');
}

/** CSV: แยกคอลัมน์ด้วยแท็บ (รองรับค่าที่อยู่ในเครื่องหมายคำพูด เช่น "12,000.00") */
function csvToText(s) {
  return s.split(/\r?\n/).map((line) => {
    const cells = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i += 1; } else q = !q; } else if (c === ',' && !q) { cells.push(cur); cur = ''; } else cur += c;
    }
    cells.push(cur);
    return cells.join('\t');
  }).join('\n');
}

function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-874').decode(buf); }
}

/* ---------- PDF ---------- */
async function renderPage(pdf, n, width) {
  const page = await pdf.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / vp1.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  return canvas;
}

async function readPdf(file, onStage) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdf;
  try {
    pdf = await task.promise;
  } catch {
    throw new ReadError('เปิด PDF ไม่ได้ ไฟล์อาจเสียหายหรือมีการตั้งรหัสผ่าน');
  }
  try {
    const pages = Math.min(pdf.numPages, 2); // 50 ทวิ มีฉบับที่ 1 และ 2 เนื้อหาเหมือนกัน อ่านสองหน้าแรกพอ
    let text = '';
    for (let n = 1; n <= pages; n += 1) {
      const content = await (await pdf.getPage(n)).getTextContent();
      text += `${pageLines(content.items).join('\n')}\n`;
    }
    const preview = { type: 'image', src: (await renderPage(pdf, 1, 900)).toDataURL('image/jpeg', 0.85) };
    if (text.replace(/\s/g, '').length >= 30) return { text, kind: 'pdf', ocr: false, preview };
    // ไม่มีชั้นข้อความ = ไฟล์สแกน อ่านจากภาพหน้าแรกด้วย OCR
    onStage({ stage: 'ocr', progress: 0 });
    const { ocrCanvas } = await import('./ocr.js');
    const ocrText = await ocrCanvas(await renderPage(pdf, 1, 2000), (p) => onStage({ stage: 'ocr', progress: p }));
    return { text: ocrText, kind: 'pdf', ocr: true, preview };
  } finally {
    task.destroy();
  }
}

/* ---------- รูปภาพ ---------- */
async function readImage(file, onStage) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new ReadError('เปิดรูปภาพนี้ไม่ได้ ไฟล์อาจเสียหรือเป็นรูปแบบที่เบราว์เซอร์ไม่รองรับ'); }
  // ขยายภาพเล็กให้ด้านยาวอย่างน้อย 1,800px และย่อภาพใหญ่ไม่เกิน 3,000px OCR ภาษาไทยจะแม่นขึ้น
  const long = Math.max(bmp.width, bmp.height);
  const scale = long < 1800 ? 1800 / long : Math.min(1, 3000 / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  onStage({ stage: 'ocr', progress: 0 });
  const { ocrCanvas } = await import('./ocr.js');
  const text = await ocrCanvas(canvas, (p) => onStage({ stage: 'ocr', progress: p }));
  return { text, kind: 'image', ocr: true, preview: { type: 'image', src: URL.createObjectURL(file), revoke: true } };
}

/** อ่านไฟล์ 1 ไฟล์ onStage({ stage: 'read' | 'ocr', progress }) ใช้แสดงความคืบหน้า */
export async function readDocument(file, onStage = () => {}) {
  if (file.size > MAX_BYTES) throw new ReadError('ไฟล์ใหญ่เกิน 10 MB');
  const kind = kindOf(file);
  onStage({ stage: 'read', progress: 0 });
  if (kind === 'legacy') throw new ReadError('ไฟล์ .doc / .xls รุ่นเก่ายังไม่รองรับ กรุณาบันทึกเป็น .docx / .xlsx หรือ PDF แล้วลองใหม่');
  if (kind === 'heic') throw new ReadError('รูป HEIC จาก iPhone เบราว์เซอร์ส่วนใหญ่ยังเปิดไม่ได้ กรุณาบันทึกเป็น JPG หรือ PNG แล้วลองใหม่');
  if (kind === 'unknown') throw new ReadError('ไม่รองรับไฟล์ชนิดนี้');
  if (kind === 'pdf') return readPdf(file, onStage);
  if (kind === 'image') return readImage(file, onStage);

  const buf = await file.arrayBuffer();
  let text;
  if (kind === 'text') {
    const raw = decodeText(buf);
    text = /\.csv$/i.test(file.name) || file.type === 'text/csv' ? csvToText(raw) : raw;
  } else {
    let zip;
    try { zip = openZip(buf); } catch { throw new ReadError('เปิดไฟล์ไม่ได้ ไฟล์อาจเสียหายหรือมีการตั้งรหัสผ่าน'); }
    if (kind === 'docx') text = docxText((await zip.text('word/document.xml')) || '');
    else if (kind === 'xlsx') text = await xlsxText(zip);
    else text = odfText((await zip.text('content.xml')) || '');
  }
  if (!text.trim()) throw new ReadError('ไม่พบข้อความในไฟล์นี้');
  return { text, kind, ocr: false, preview: { type: 'text', text: text.slice(0, 6000) } };
}
