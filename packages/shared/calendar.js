'use strict';

/**
 * calendar.js ปฏิทินงาน กำหนดยื่นภาษี เอกสาร สัญญา และการลงนาม
 * -------------------------------------------------------------
 * กิจกรรมมี 2 แหล่ง
 *  1) ระบบสร้างอัตโนมัติ (source = 'system') คำนวณใหม่ทุกครั้งจากบทบาทผู้ใช้ เอกสาร และคำขอลงนาม
 *     ไม่เก็บลงฐานข้อมูล จึงลบไม่ได้ ผู้ใช้บันทึกได้เฉพาะ "เสร็จแล้ว / บันทึกเพิ่มเติม / สัญลักษณ์" (เก็บเป็น override)
 *  2) ผู้ใช้สร้างเอง (source = 'user') เพิ่ม แก้ไข ลบได้ ยกเว้นกรณีที่ถูกล็อก
 *
 * กฎการล็อก (ลบไม่ได้)
 *  - กิจกรรมจากระบบทุกรายการ
 *  - กิจกรรมระดับ "สำคัญมาก" (critical)
 *  - กิจกรรมที่ผูกกับเอกสารที่อนุมัติแล้วหรือเก็บถาวรแล้ว
 *
 * ทุกฟังก์ชันรับวันที่ปัจจุบันเป็นสตริง YYYY-MM-DD (เวลาไทย) เพื่อให้ทดสอบได้แน่นอน
 * กำหนดยื่นภาษีเป็นการประมาณตามหลักทั่วไป ไม่ได้เลื่อนตามวันหยุดราชการ
 */

const CATEGORIES = [
  { id: 'tax', label: 'ภาษี', color: '#D94E00', desc: 'ยื่นแบบและนำส่งภาษี' },
  { id: 'document', label: 'เอกสาร', color: '#3457B2', desc: 'ครบกำหนดชำระ ใบเสนอราคาหมดอายุ ส่งมอบงาน' },
  { id: 'contract', label: 'สัญญา', color: '#7A3FC4', desc: 'วันเริ่มต้นและสิ้นสุดสัญญา' },
  { id: 'sign', label: 'ลงนาม/อนุมัติ', color: '#C2185B', desc: 'คำขอลงนามและกำหนดตอบกลับ' },
  { id: 'payment', label: 'การเงิน', color: '#1E8E5A', desc: 'รับเงิน จ่ายเงิน งวดชำระ' },
  { id: 'content', label: 'งานคอนเทนต์', color: '#E09B00', desc: 'ส่ง Draft โพสต์ ถ่ายทำ' },
  { id: 'meeting', label: 'นัดหมาย', color: '#0F8B9C', desc: 'ประชุม นัดคุยงาน' },
  { id: 'note', label: 'บันทึกส่วนตัว', color: '#6F6B72', desc: 'โน้ตทั่วไป' },
];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

const MARKERS = [
  { id: 'none', label: 'ไม่มี' },
  { id: 'star', label: 'สำคัญ' },
  { id: 'flag', label: 'ติดตาม' },
  { id: 'alert', label: 'ด่วน' },
  { id: 'pin', label: 'ปักหมุด' },
  { id: 'money', label: 'เกี่ยวกับเงิน' },
  { id: 'camera', label: 'ถ่ายทำ/โพสต์' },
  { id: 'people', label: 'ประชุม' },
  { id: 'check', label: 'ตรวจแล้ว' },
];
const MARKER_IDS = MARKERS.map((m) => m.id);

const PRIORITIES = [
  { id: 'normal', label: 'ปกติ' },
  { id: 'high', label: 'สำคัญ' },
  { id: 'critical', label: 'สำคัญมาก (ลบไม่ได้)' },
];
const PRIORITY_IDS = PRIORITIES.map((p) => p.id);

const LOCKED_DOC_STATUS = ['approved', 'archived'];
const MAX_ATTACHMENTS = 5;

const DOC_NAME = {
  QUOTATION: 'ใบเสนอราคา', PO: 'ใบสั่งซื้อ', INVOICE: 'ใบแจ้งหนี้', RECEIPT: 'ใบเสร็จรับเงิน',
  DELIVERY: 'ใบส่งมอบงาน', PAYMENT: 'ใบสำคัญจ่าย', CONTRACT_BRAND: 'สัญญากับ Brand',
  CONTRACT_INF: 'สัญญาจ้าง Influencer', POA: 'หนังสือมอบอำนาจ', EWHT: '50 ทวิ', PND3: 'ภ.ง.ด.3', PND53: 'ภ.ง.ด.53',
};

/* ---------------- วันที่ ---------------- */
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
function isYMD(s) {
  if (!YMD_RE.test(String(s || ''))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function ymd(y, m, d) {
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}
function addMonths(y, m, n) { const t = y * 12 + (m - 1) + n; return [Math.floor(t / 12), (t % 12) + 1]; }
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

/* ---------------- กำหนดยื่นภาษีตามบทบาท ---------------- */
function taxEvents(user, from, to) {
  const out = [];
  const [fy, fm] = from.split('-').map(Number);
  const months = Math.max(1, Math.min(24, Math.ceil(daysBetween(from, to) / 28) + 1));
  const isJuristic = user.entityType === 'juristic';
  const isIndividual = !isJuristic;
  const payer = user.role === 'agency' || user.role === 'corporate';
  const push = (key, date, title, purpose, onlineDate) => {
    if (date < from || date > to) return;
    out.push({
      id: 'sys:tax:' + key, source: 'system', category: 'tax', date, title, purpose,
      note: onlineDate ? `ยื่นทางอินเทอร์เน็ตขยายได้ถึง ${onlineDate}` : '',
      priority: 'critical', marker: 'alert', locked: true, lockReason: 'กำหนดยื่นภาษีจากระบบ',
    });
  };
  for (let i = -1; i < months; i++) {
    const [y, m] = addMonths(fy, fm, i);
    const [py, pm] = addMonths(y, m, -1); // เดือนภาษีที่ต้องยื่น = เดือนก่อนหน้า
    const periodTxt = `เดือนภาษี ${String(pm).padStart(2, '0')}/${py + 543}`;
    if (payer) {
      push(`WHT:${y}-${m}`, ymd(y, m, 7), 'นำส่งภาษีหัก ณ ที่จ่าย ภ.ง.ด.3 / ภ.ง.ด.53', `${periodTxt} สำหรับเงินที่จ่ายและหักภาษีไว้`, ymd(y, m, 15));
    }
    if (user.vatRegistered) {
      push(`VAT:${y}-${m}`, ymd(y, m, 15), 'ยื่นแบบภาษีมูลค่าเพิ่ม ภ.พ.30', periodTxt, ymd(y, m, 23));
    }
  }
  const years = new Set([fy - 1, fy, fy + 1, Number(to.slice(0, 4))]);
  for (const y of years) {
    if (isIndividual) {
      push(`PIT:${y}`, ymd(y, 3, 31), 'ยื่นแบบภาษีเงินได้บุคคลธรรมดาประจำปี ภ.ง.ด.90/91', `เงินได้ปีภาษี ${y - 1 + 543}`, ymd(y, 4, 8));
      if (user.role !== 'corporate') push(`PIT94:${y}`, ymd(y, 9, 30), 'ยื่นแบบภาษีเงินได้ครึ่งปี ภ.ง.ด.94', `เงินได้ ม.ค.–มิ.ย. ${y + 543} (กรณีมีเงินได้ 40(5)–(8))`, ymd(y, 10, 8));
    } else {
      push(`CIT51:${y}`, ymd(y, 8, 31), 'ยื่นแบบภาษีเงินได้นิติบุคคลครึ่งปี ภ.ง.ด.51', `รอบบัญชีปี ${y + 543} (กรณีรอบบัญชีตามปีปฏิทิน)`, ymd(y, 9, 8));
      push(`CIT50:${y}`, ymd(y, 5, 30), 'ยื่นแบบภาษีเงินได้นิติบุคคล ภ.ง.ด.50', `รอบบัญชีปี ${y - 1 + 543} (ภายใน 150 วันนับจากวันสิ้นรอบบัญชี)`, ymd(y, 6, 7));
    }
  }
  return out;
}

/* ---------------- กิจกรรมจากเอกสารของผู้ใช้ ---------------- */
function docEvents(docs, from, to) {
  const out = [];
  for (const d of docs) {
    if (!d || d.status === 'cancelled' || d.schemaVersion !== 2) continue;
    const f = d.fields || {};
    const name = `${DOC_NAME[d.type] || d.type} ${d.docNo || '(แบบร่าง)'}`;
    const party = d.party ? ` · ${d.party}` : '';
    const locked = LOCKED_DOC_STATUS.includes(d.status);
    const add = (key, date, category, title, purpose, extra = {}) => {
      if (!isYMD(date) || date < from || date > to) return;
      out.push({
        id: `sys:doc:${d.id}:${key}`, source: 'system', category, date, title, purpose: purpose + party,
        docId: d.id, docStatus: d.status, priority: locked ? 'critical' : 'high', marker: 'none',
        locked: true, lockReason: locked ? 'ผูกกับเอกสารที่ยืนยันแล้ว' : 'สร้างจากเอกสารในระบบ', ...extra,
      });
    };
    switch (d.type) {
      case 'QUOTATION': add('valid', f.validUntil, 'document', `ใบเสนอราคาหมดอายุ`, name); break;
      case 'PO': add('delivery', f.deliveryDate, 'document', `กำหนดส่งมอบตามใบสั่งซื้อ`, name); break;
      case 'INVOICE': add('due', f.dueDate, 'payment', `ครบกำหนดชำระตามใบแจ้งหนี้`, name, { marker: 'money' }); break;
      case 'DELIVERY': add('end', f.periodEnd, 'document', `สิ้นสุดระยะเวลาดำเนินงาน`, name); break;
      case 'POA': add('end', f.endDate, 'contract', `หนังสือมอบอำนาจสิ้นสุด`, name); break;
      case 'CONTRACT_BRAND':
      case 'CONTRACT_INF':
        add('start', f.startDate, 'contract', 'สัญญาเริ่มต้น', name);
        add('end', f.endDate, 'contract', 'สัญญาสิ้นสุด', name, { marker: 'flag' });
        if (d.type === 'CONTRACT_INF') {
          add('submit', f.submitDate, 'content', 'ส่งงาน Draft ให้ตรวจ', `${name}${f.campaignName ? ' · ' + f.campaignName : ''}`, { marker: 'camera' });
          add('post', f.postDate, 'content', 'กำหนดโพสต์คอนเทนต์', `${name}${f.campaignName ? ' · ' + f.campaignName : ''}`, { marker: 'camera' });
        }
        break;
      default: break;
    }
    if (Array.isArray(d.items)) {
      d.items.forEach((it, i) => {
        if (it && it.dueDate) add(`inst${i}`, it.dueDate, 'payment', `งวดชำระ ${it.name || 'งวดที่ ' + (i + 1)}`, `${name} · ${Number(it.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`, { marker: 'money' });
      });
    }
  }
  return out;
}

/* ---------------- คำขอลงนาม/อนุมัติ ---------------- */
function requestEvents(userId, requests, docsById, from, to) {
  const out = [];
  for (const r of requests) {
    if (!r.dueDate || !isYMD(r.dueDate) || r.dueDate < from || r.dueDate > to) continue;
    const doc = docsById[r.docId];
    const docName = doc ? `${DOC_NAME[doc.type] || doc.type} ${doc.docNo || ''}` : 'เอกสาร';
    const act = r.purpose === 'sign' ? 'ลงนาม' : 'ตรวจสอบ/อนุมัติ';
    if (r.toUserId === userId && r.status === 'sent') {
      out.push({ id: `sys:req:${r.id}:in`, source: 'system', category: 'sign', date: r.dueDate, title: `กำหนด${act}เอกสาร`, purpose: `${docName} (คำขอที่ได้รับ)`, requestId: r.id, priority: 'high', marker: 'flag', locked: true, lockReason: 'คำขอจากคู่ค้า' });
    } else if (r.fromUserId === userId && r.status === 'sent') {
      out.push({ id: `sys:req:${r.id}:out`, source: 'system', category: 'sign', date: r.dueDate, title: `ติดตามการ${act}จากคู่ค้า`, purpose: `${docName} (คำขอที่ส่งไป)`, docId: r.docId, priority: 'normal', marker: 'flag', locked: true, lockReason: 'คำขอที่ส่งถึงคู่ค้า' });
    }
  }
  return out;
}

/* ---------------- ล็อก / ตรวจสอบข้อมูล ---------------- */
function lockState(ev, docsById = {}) {
  if (ev.source === 'system') return { locked: true, reason: ev.lockReason || 'สร้างโดยระบบ' };
  if (ev.priority === 'critical') return { locked: true, reason: 'กิจกรรมระดับสำคัญมาก' };
  const doc = ev.linkDocId ? docsById[ev.linkDocId] : null;
  if (doc && LOCKED_DOC_STATUS.includes(doc.status)) return { locked: true, reason: 'ผูกกับเอกสารที่ยืนยันแล้ว' };
  return { locked: false, reason: '' };
}

function validateEvent(b, { existing = null, ownDocIds = [] } = {}) {
  const errors = {};
  const s = (v) => (v == null ? '' : String(v)).trim();
  const title = s(b.title);
  if (!title) errors.title = 'กรุณากรอกชื่อกิจกรรม';
  else if (title.length > 120) errors.title = 'ชื่อกิจกรรมยาวได้ไม่เกิน 120 ตัวอักษร';
  const date = s(b.date);
  if (!date) errors.date = 'กรุณาเลือกวันที่';
  else if (!isYMD(date)) errors.date = 'รูปแบบวันที่ไม่ถูกต้อง';
  const endDate = s(b.endDate);
  if (endDate && !isYMD(endDate)) errors.endDate = 'รูปแบบวันที่ไม่ถูกต้อง';
  else if (endDate && date && endDate < date) errors.endDate = 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น';
  else if (endDate && date && daysBetween(date, endDate) > 366) errors.endDate = 'ช่วงกิจกรรมยาวได้ไม่เกิน 1 ปี';
  const time = s(b.time);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = 'รูปแบบเวลาไม่ถูกต้อง (ชั่วโมง:นาที)';
  const endTime = s(b.endTime);
  if (endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) errors.endTime = 'รูปแบบเวลาไม่ถูกต้อง (ชั่วโมง:นาที)';
  else if (endTime && !time) errors.endTime = 'กรุณาระบุเวลาเริ่มก่อน';
  else if (endTime && time && !endDate && endTime <= time) errors.endTime = 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม';
  const category = s(b.category) || 'note';
  if (!CATEGORY_IDS.includes(category)) errors.category = 'กรุณาเลือกหมวดหมู่จากรายการ';
  const marker = s(b.marker) || 'none';
  if (!MARKER_IDS.includes(marker)) errors.marker = 'สัญลักษณ์ไม่ถูกต้อง';
  let priority = s(b.priority) || 'normal';
  if (!PRIORITY_IDS.includes(priority)) errors.priority = 'ระดับความสำคัญไม่ถูกต้อง';
  if (existing && existing.priority === 'critical' && priority !== 'critical') {
    errors.priority = 'กิจกรรมระดับสำคัญมากไม่สามารถลดระดับได้';
  }
  const purpose = s(b.purpose);
  if (purpose.length > 300) errors.purpose = 'จุดประสงค์ยาวได้ไม่เกิน 300 ตัวอักษร';
  const note = s(b.note);
  if (note.length > 2000) errors.note = 'บันทึกยาวได้ไม่เกิน 2,000 ตัวอักษร';
  let linkDocId = b.linkDocId ? Number(b.linkDocId) : null;
  if (linkDocId && !ownDocIds.includes(linkDocId)) errors.linkDocId = 'ไม่พบเอกสารที่เลือกในบัญชีของคุณ';
  const remindDays = b.remindDays === '' || b.remindDays == null ? null : Number(b.remindDays);
  if (remindDays != null && (!Number.isInteger(remindDays) || remindDays < 0 || remindDays > 30)) errors.remindDays = 'แจ้งเตือนล่วงหน้าได้ 0–30 วัน';
  const clean = { title, date, endDate: endDate || '', time: time || '', endTime: endTime || '', category, marker, priority, purpose, note, linkDocId: linkDocId || null, remindDays, done: !!b.done };
  return { errors, clean };
}

function validateOverride(b) {
  const errors = {};
  const note = (b.note == null ? '' : String(b.note)).trim();
  if (note.length > 2000) errors.note = 'บันทึกยาวได้ไม่เกิน 2,000 ตัวอักษร';
  const marker = b.marker || 'none';
  if (!MARKER_IDS.includes(marker)) errors.marker = 'สัญลักษณ์ไม่ถูกต้อง';
  if (!/^sys:[\w:.-]{3,80}$/.test(String(b.sysKey || ''))) errors.sysKey = 'ไม่พบกิจกรรมจากระบบ';
  return { errors, clean: { sysKey: b.sysKey, note, marker, done: !!b.done } };
}

/** รวมกิจกรรมทั้งหมดของผู้ใช้ในช่วง from..to (รวมกิจกรรมหลายวันที่คาบเกี่ยวช่วง) */
function collect({ user, docs, requests, userEvents, overrides, from, to }) {
  const docsById = Object.fromEntries(docs.map((d) => [d.id, d]));
  const sys = [
    ...taxEvents(user, from, to),
    ...docEvents(docs.filter((d) => d.userId === user.id), from, to),
    ...requestEvents(user.id, requests, docsById, from, to),
  ];
  const ov = Object.fromEntries(overrides.map((o) => [o.sysKey, o]));
  sys.forEach((e) => {
    const o = ov[e.id];
    if (o) { e.done = !!o.done; if (o.note) e.userNote = o.note; if (o.marker && o.marker !== 'none') e.marker = o.marker; e.attachments = o.attachments || []; e.overrideId = o.id; }
  });
  const mine = userEvents
    .filter((e) => (e.endDate || e.date) >= from && e.date <= to)
    .map((e) => {
      const { storedName, ...rest } = e;
      const lk = lockState(e, docsById);
      const link = e.linkDocId ? docsById[e.linkDocId] : null;
      return {
        ...rest, id: e.id, source: 'user', locked: lk.locked, lockReason: lk.reason,
        docId: e.linkDocId || null, docStatus: link ? link.status : undefined,
        linkDocName: link ? `${DOC_NAME[link.type] || link.type} ${link.docNo || '(แบบร่าง)'}` : '',
        attachments: (e.attachments || []).map(({ storedName: sn, ...a }) => a),
      };
    });
  sys.forEach((e) => { e.attachments = (e.attachments || []).map(({ storedName: sn, ...a }) => a); });
  return [...sys, ...mine].sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}

module.exports = {
  CATEGORIES, MARKERS, PRIORITIES, MAX_ATTACHMENTS, LOCKED_DOC_STATUS,
  isYMD, taxEvents, docEvents, requestEvents, lockState, validateEvent, validateOverride, collect,
};
