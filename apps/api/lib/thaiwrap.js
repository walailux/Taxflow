'use strict';
/**
 * thaiwrap.js ตัดบรรทัดข้อความภาษาไทยตรงรอยต่อของคำ (WP5)
 * ==========================================================================
 * ปัญหาที่เจอจากไฟล์ตัวอย่างจริง
 * ---------------------------------
 * ภาษาไทยไม่เว้นวรรคระหว่างคำ PDFKit จึงมองทั้งประโยคเป็น "คำเดียว"
 * พอยาวเกินความกว้างคอลัมน์ มันตัดกลางคำตรงไหนก็ได้ที่พื้นที่หมด
 * ผลคือคำว่า "สร้างสรรค์" ถูกหั่นเป็น "สร้างสรร" กับ "ค์" คนละบรรทัด
 *
 * วิธีแก้
 * -------
 * ใช้ Intl.Segmenter ที่มากับ Node.js (อาศัยพจนานุกรมคำไทยของ ICU)
 * แบ่งข้อความเป็นคำก่อน แล้วเรียงคำเข้าบรรทัดทีละคำจนเต็มความกว้าง
 * จากนั้นส่งข้อความที่แทรกการขึ้นบรรทัดไว้แล้วให้ PDFKit วาดตรง ๆ
 *
 * ถ้าคำเดียวยาวเกินทั้งบรรทัด (เช่น URL ยาว ๆ) จะตัดทีละ "กลุ่มอักขระ"
 * (grapheme) ไม่ใช่ทีละตัวอักษร เพื่อไม่ให้สระหรือวรรณยุกต์หลุดจากพยัญชนะ
 *
 * ออกแบบให้ทดสอบได้โดยไม่ต้องมี PDFKit: ฟังก์ชันวัดความกว้างถูกส่งเข้ามา
 */

const WORD = new Intl.Segmenter('th', { granularity: 'word' });
const GRAPHEME = new Intl.Segmenter('th', { granularity: 'grapheme' });

/** แบ่งข้อความเป็นคำ (รวมช่องว่างเป็นชิ้นแยก เพื่อรู้ว่าตรงไหนมีวรรค) */
function words(text) {
  return [...WORD.segment(String(text))].map((s) => s.segment);
}

/** แบ่งคำเดียวเป็นกลุ่มอักขระ ใช้ตอนคำยาวเกินบรรทัด */
function graphemes(text) {
  return [...GRAPHEME.segment(String(text))].map((s) => s.segment);
}

/**
 * หั่นคำที่ยาวเกินบรรทัดออกเป็นหลายท่อน โดยไม่แยกสระ/วรรณยุกต์ออกจากพยัญชนะ
 * @returns {string[]} ท่อนที่แต่ละท่อนกว้างไม่เกิน maxWidth (ยกเว้นกลุ่มอักขระเดียวที่กว้างเกินเอง)
 */
function splitLongWord(word, maxWidth, measure) {
  const parts = [];
  let cur = '';
  for (const g of graphemes(word)) {
    if (cur && measure(cur + g) > maxWidth) {
      parts.push(cur);
      cur = g;
    } else {
      cur += g;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

/**
 * ตัดข้อความหนึ่งย่อหน้าเป็นหลายบรรทัด
 * @param {string} text ข้อความ (ไม่มี \n)
 * @param {number} maxWidth ความกว้างสูงสุดของบรรทัด (หน่วยเดียวกับที่ measure คืนมา)
 * @param {(s: string) => number} measure ฟังก์ชันวัดความกว้างข้อความ
 * @returns {string[]}
 */
function wrapParagraph(text, maxWidth, measure) {
  const lines = [];
  let line = '';

  for (const w of words(text)) {
    const candidate = line + w;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }

    // บรรทัดเต็มแล้ว ปิดบรรทัดเดิม (ตัดช่องว่างท้ายทิ้ง) แล้วเริ่มบรรทัดใหม่ด้วยคำนี้
    if (line.trim()) lines.push(line.trimEnd());
    line = '';

    // ช่องว่างที่ตกมาต้นบรรทัดใหม่ ไม่ต้องวาด
    if (!w.trim()) continue;

    if (measure(w) <= maxWidth) {
      line = w;
    } else {
      // คำเดียวยาวเกินทั้งบรรทัด ต้องหั่นเป็นท่อน ท่อนสุดท้ายเก็บไว้ต่อคำถัดไปได้
      const parts = splitLongWord(w, maxWidth, measure);
      lines.push(...parts.slice(0, -1));
      line = parts[parts.length - 1] || '';
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.length ? lines : [''];
}

/**
 * ตัดข้อความที่อาจมีหลายย่อหน้า (คั่นด้วย \n) คืนเป็นข้อความเดียวที่แทรก \n ไว้แล้ว
 * PDFKit เคารพ \n ที่มีอยู่ในข้อความ จึงวาดตามบรรทัดที่เราตัดไว้ได้ตรง ๆ
 */
function wrap(text, maxWidth, measure) {
  if (text == null || text === '') return '';
  return String(text)
    .split('\n')
    .map((para) => wrapParagraph(para, maxWidth, measure).join('\n'))
    .join('\n');
}

module.exports = { wrap, wrapParagraph, words, graphemes, splitLongWord };
