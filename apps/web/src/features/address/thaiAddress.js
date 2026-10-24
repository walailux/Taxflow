/**
 * thaiAddress.js ข้อมูลที่อยู่ไทย (77 จังหวัด 928 อำเภอ/เขต 7,436 ตำบล/แขวง พร้อมรหัสไปรษณีย์)
 * ไฟล์ข้อมูล public/data/th-address.json ย่อจาก thailand-geography-data/thailand-geography-json (MIT)
 * รูปแบบ: [[จังหวัด, [[อำเภอ, [[ตำบล, รหัสไปรษณีย์], ...]], ...]], ...] เรียงตามตัวอักษรไทย
 * โหลดครั้งเดียวเมื่อเปิดฟอร์มที่มีที่อยู่ แล้วเก็บไว้ใช้ทั้งแอป
 */

const BKK = 'กรุงเทพมหานคร';
let cache = null;

export function loadThaiAddress() {
  if (!cache) {
    cache = fetch('/data/th-address.json')
      .then((r) => { if (!r.ok) throw new Error('load'); return r.json(); })
      .then(indexData)
      .catch((err) => { cache = null; throw err; });
  }
  return cache;
}

/** สร้างดัชนีสำหรับค้นหาเร็ว */
export function indexData(raw) {
  const provinces = raw.map(([name]) => name);
  const districts = new Map(raw.map(([p, ds]) => [p, ds.map(([d]) => d)]));
  const subs = new Map();
  for (const [p, ds] of raw) for (const [d, ss] of ds) subs.set(`${p}|${d}`, ss);
  return { provinces, districts, subs };
}

export const isBangkok = (prov) => prov === BKK;

/** คำนำหน้าตามรูปแบบราชการ: กรุงเทพฯ ใช้ แขวง/เขต จังหวัดอื่นใช้ ตำบล/อำเภอ/จังหวัด */
export const subLabel = (prov) => (isBangkok(prov) ? 'แขวง' : 'ตำบล');
export const distLabel = (prov) => (isBangkok(prov) ? 'เขต' : 'อำเภอ');

export const EMPTY_PARTS = { line: '', prov: '', dist: '', sub: '', zip: '' };

/** รวมส่วนต่าง ๆ เป็นที่อยู่บรรทัดเดียวสำหรับพิมพ์ลงเอกสาร */
export function composeAddress(p) {
  const out = [];
  if (p.line && p.line.trim()) out.push(p.line.trim());
  if (p.sub) out.push(`${subLabel(p.prov)}${p.sub}`);
  if (p.dist) out.push(`${distLabel(p.prov)}${p.dist}`);
  if (p.prov) out.push(isBangkok(p.prov) ? p.prov : `จังหวัด${p.prov}`);
  if (p.zip) out.push(p.zip);
  return out.join(' ');
}

const strip = (s, words) => words.reduce((x, w) => x.replace(new RegExp(`(^|\\s)${w}\\s*$`), '$1'), s).trim();

/**
 * แยกที่อยู่ข้อความเดิม (เช่นดึงจากสมุดคู่ค้าหรือเอกสารเก่า) กลับเป็นส่วน ๆ แบบพยายามเต็มที่
 * ส่วนที่หาไม่เจอจะคงอยู่ในช่อง line ผู้ใช้จึงไม่เสียข้อมูล
 */
export function parseAddress(text, data) {
  const parts = { ...EMPTY_PARTS };
  let rest = String(text || '').replace(/\s+/g, ' ').trim();
  if (!rest || !data) return { ...parts, line: rest };

  const zip = rest.match(/(\d{5})\s*$/);
  if (zip) { parts.zip = zip[1]; rest = rest.slice(0, zip.index).trim(); }

  const prov = [...data.provinces].sort((a, b) => b.length - a.length)
    .find((p) => rest.endsWith(p) || rest.includes(`จังหวัด${p}`) || rest.includes(` จ.${p}`) || rest.includes(` ${p}`));
  if (!prov) return { ...parts, line: [rest, parts.zip].filter(Boolean).join(' '), zip: '' };
  parts.prov = prov;
  let i = rest.lastIndexOf(prov);
  rest = strip(rest.slice(0, i), ['จังหวัด', 'จ\\.']);

  const dists = [...(data.districts.get(prov) || [])].sort((a, b) => b.length - a.length);
  const dist = dists.find((d) => rest.endsWith(d));
  if (dist) {
    parts.dist = dist;
    rest = strip(rest.slice(0, rest.length - dist.length), ['อำเภอ', 'อ\\.', 'เขต']);
    const subs = [...(data.subs.get(`${prov}|${dist}`) || [])].sort((a, b) => b[0].length - a[0].length);
    const sub = subs.find(([s]) => rest.endsWith(s));
    if (sub) {
      parts.sub = sub[0];
      rest = strip(rest.slice(0, rest.length - sub[0].length), ['ตำบล', 'ต\\.', 'แขวง']);
      if (!parts.zip) parts.zip = sub[1];
    }
  }
  parts.line = rest;
  return parts;
}

/** ตัวเลือกของแต่ละชั้น */
export function districtOptions(data, prov) {
  return (data && prov && data.districts.get(prov)) || [];
}
export function subOptions(data, prov, dist) {
  return (data && prov && dist && data.subs.get(`${prov}|${dist}`)) || [];
}
export function zipOf(data, prov, dist, sub) {
  const s = subOptions(data, prov, dist).find(([n]) => n === sub);
  return s ? s[1] : '';
}

/** ค้นหาจากรหัสไปรษณีย์: คืนรายการ { prov, dist, sub, zip } ทุกตำบลที่ใช้รหัสนี้ */
export function findByZip(data, zip) {
  if (!data || !/^\d{5}$/.test(zip)) return [];
  const out = [];
  for (const [key, ss] of data.subs) {
    for (const [sub, z] of ss) {
      if (z === zip) { const [prov, dist] = key.split('|'); out.push({ prov, dist, sub, zip: z }); }
    }
  }
  return out;
}
