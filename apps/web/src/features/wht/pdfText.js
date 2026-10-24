/**
 * pdfText.js เรียงข้อความจาก pdf.js (getTextContent().items) เป็นบรรทัดตามตำแหน่งบนหน้า
 * pdf.js ให้ข้อความเป็นชิ้น ๆ ไม่เรียงบรรทัด: จัดกลุ่มชิ้นที่ y ใกล้กันเป็นบรรทัดเดียว เรียงซ้ายไปขวา
 * และเว้นวรรคเมื่อมีช่องว่างระหว่างชิ้นกว้างกว่าราว 1/4 ของความสูงตัวอักษร
 */
export function pageLines(items) {
  const parts = items.filter((it) => it.str && it.str.trim()).map((it) => ({
    s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 10,
  })).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const p of parts) {
    const line = lines.find((l) => Math.abs(l.y - p.y) <= Math.max(2, p.h * 0.45));
    if (line) line.parts.push(p); else lines.push({ y: p.y, parts: [p] });
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => {
    let out = '';
    let end = null;
    for (const p of l.parts.sort((a, b) => a.x - b.x)) {
      if (end != null && p.x - end > p.h * 0.25) out += ' ';
      out += p.s;
      end = p.x + p.w;
    }
    return out;
  });
}
