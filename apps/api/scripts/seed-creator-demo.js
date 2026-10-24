'use strict';
/**
 * scripts/seed-creator-demo.js เติมเอกสารตัวอย่างครบทุกประเภทให้บัญชีทดลอง creator@taxflow.test
 * ==========================================================
 * - เอกสารที่ครีเอเตอร์ออกเอง: ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จรับเงิน ใบส่งมอบงาน และบันทึก 50 ทวิ ที่ได้รับ
 *   ครบทุกสถานะ (อนุมัติ / รอคู่ค้าตอบกลับ / ถูกตีกลับ / ยกเลิก)
 * - เอกสารที่คู่ค้าส่งมาถึงกล่องรับเอกสาร: สัญญาจ้าง Influencer, ใบสั่งซื้อ (PO), ใบสำคัญจ่าย, 50 ทวิ
 * - ทุกการส่งมีเวลาส่ง/เวลาตอบกลับจริง (requests.createdAt = เวลาส่ง) พร้อมแจ้งเตือน ประวัติ และบันทึกการทำงาน
 * ทุกฉบับประกอบผ่าน lib/docbuild.js (ตรวจข้อมูลและคำนวณยอดชุดเดียวกับหน้าสร้างเอกสาร)
 * รันซ้ำได้: ถ้าเคยเติมแล้วจะไม่เติมซ้ำ
 *
 *   node scripts/seed-creator-demo.js
 */
require('./_env');
const store = require('../core/store');
const { docbuild, tax, contentHash, makeDocNo, bangkokDateStr } = require('../core/context');

const MARK = 'creator-demo-v1';
// เวลาไทย 'YYYY-MM-DD HH:mm' -> ISO (UTC)
const T = (s) => new Date(s.replace(' ', 'T') + ':00+07:00').toISOString();
const dateOf = (iso) => bangkokDateStr(new Date(iso));

let U = {}; // creator / brand / agency
let SIG = {}; // รูปลายเซ็นจากคลังลายเซ็นของแต่ละบัญชี
const nameOf = (u) => u.companyName || u.displayName;
const signerOf = (u) => u.authName || u.displayName;

function ctxFor(user) {
  return {
    today: bangkokDateStr(),
    resolveRef: async (types, no) => (await store.all('documents', (d) => d.userId === user.id && types.includes(d.type) && d.docNo === no && d.status !== 'cancelled'))[0] || null,
    findDocs: (fn) => store.all('documents', (d) => d.userId === user.id && fn(d)),
  };
}

async function version(doc, n, at, editor, note) {
  await store.insert('doc_versions', { docId: doc.id, version: n, editor, note, snapshot: doc, at, createdAt: at });
}
async function audit(userId, docId, action, detail, actor, at) {
  await store.insert('audit_log', { userId, docId, action, detail, actor, at, createdAt: at });
}
async function notify(userId, kind, message, docId, at, extra = {}) {
  await store.insert('notifications', { userId, kind, message, docId: docId || null, read: false, at, createdAt: at, ...extra });
}

/**
 * สร้างเอกสารหนึ่งฉบับพร้อมประวัติตามลำดับเวลา
 * o: { created, signAt, send: { to, purpose, at, due, message, signAs, reply: { kind: signed|approved|declined|cancelled, at, reason } }, cancel: { at, reason }, finalAt }
 */
async function makeDoc(owner, type, body, o) {
  const built = type === 'WHT' ? null : await docbuild.build(owner, type, body, ctxFor(owner));
  if (built && built.errors.length) throw new Error(`${type}: ${built.errors.join(' · ')}`);
  const record = built ? built.record : body.record;
  const issuedAt = o.send ? o.send.at : o.finalAt;
  let doc = {
    userId: owner.id, type, docNo: await makeDocNo(type, owner.id),
    status: 'draft', signed: false, signature: null,
    issueDate: dateOf(issuedAt), docPurpose: body.docPurpose || (o.send ? 'send' : 'self'), issuerRole: owner.role,
    ...record, demoSeed: MARK, createdAt: o.created,
  };
  const hash = contentHash(doc);
  if (o.signAt) doc.signed = true, doc.signature = { signerName: signerOf(owner), signedAt: o.signAt, image: SIG[owner.role] || null, contentHash: hash };

  const r = o.send && o.send.reply;
  if (o.cancel) Object.assign(doc, { status: 'cancelled', statusNote: o.cancel.reason, cancelledAt: o.cancel.at, cancelReason: o.cancel.reason });
  else if (!o.send) doc.status = 'approved';
  else if (!r) doc.status = 'pending';
  else if (r.kind === 'declined') doc.status = 'rejected';
  else doc.status = 'approved';
  if (r && r.kind === 'signed') {
    const to = U[o.send.to];
    doc.counterpartySignature = { signerName: signerOf(to), image: SIG[o.send.to] || null, signedAt: r.at, byUserId: to.id, byEmail: to.email, signAs: o.send.signAs || '', contentHash: hash };
  }
  doc.updatedAt = (o.cancel && o.cancel.at) || (r && r.at) || issuedAt;
  doc = await store.insert('documents', doc);

  const me = owner.displayName;
  let v = 1;
  await version({ ...doc, status: 'draft', docNo: null }, v++, o.created, me, 'สร้างเอกสาร (แบบร่าง ยังไม่ออกเลขที่)');
  await audit(owner.id, doc.id, 'create', `สร้างแบบร่างเอกสารประเภท ${type}`, me, o.created);
  if (o.signAt) {
    await version({ ...doc, status: 'draft', docNo: null }, v++, o.signAt, me, 'ลงลายมือชื่อดิจิทัล (ยืนยันด้วย OTP)');
    await audit(owner.id, doc.id, 'sign', `ลงนามโดย ${signerOf(owner)} (ยืนยันด้วย OTP)`, me, o.signAt);
  }
  await audit(owner.id, doc.id, 'issue', `ออกเลขที่เอกสาร ${doc.docNo}`, me, issuedAt);
  if (!o.send && !o.cancel) await version(doc, v++, o.finalAt, me, 'บันทึกเสร็จสิ้น');

  if (o.send) {
    const s = o.send, to = U[s.to], purposeTh = s.purpose === 'sign' ? 'ขอลายเซ็น' : 'ขอตรวจสอบ';
    const status = !r ? 'sent' : r.kind === 'declined' ? 'declined' : r.kind;
    const req = await store.insert('requests', {
      docId: doc.id, fromUserId: owner.id, toUserId: to.id, toEmail: to.email, purpose: s.purpose,
      message: s.message || '', dueDate: s.due || '', signAs: s.signAs || '', status,
      ...(r && r.kind !== 'cancelled' ? { respondedAt: r.at } : {}), ...(r && r.reason && r.kind === 'declined' ? { declineReason: r.reason } : {}),
      createdAt: s.at, ...(r ? { updatedAt: r.at } : {}),
    });
    await version({ ...doc, status: 'pending', counterpartySignature: undefined }, v++, s.at, me, 'ส่งเอกสารให้คู่ค้า');
    await audit(owner.id, doc.id, 'send', `ส่ง ${doc.docNo} ถึง ${to.email} (${purposeTh}${s.due ? ' ภายใน ' + s.due : ''})`, me, s.at);
    await notify(to.id, 'request', `${nameOf(owner)} ส่งเอกสาร ${doc.docNo} ให้คุณ${s.purpose === 'sign' ? 'ลงนาม' : 'ตรวจสอบ'}${s.due ? ' ภายในวันที่ ' + s.due : ''}`, null, s.at, { reqId: req.id, read: !!r });
    const them = nameOf(to);
    if (r && r.kind === 'signed') {
      await version(doc, v++, r.at, signerOf(to), 'คู่ค้าลงนามตอบกลับ เอกสารอนุมัติแล้ว');
      await audit(owner.id, doc.id, 'countersign', `${signerOf(to)} (${to.email}) ลงนามเอกสาร สถานะเปลี่ยนเป็นอนุมัติ`, signerOf(to), r.at);
      await notify(owner.id, 'signed', `${them} ลงนามเอกสาร ${doc.docNo} เรียบร้อยแล้ว เอกสารอนุมัติแล้ว`, doc.id, r.at);
    } else if (r && r.kind === 'approved') {
      await version(doc, v++, r.at, to.displayName, 'คู่ค้าตรวจสอบผ่าน เอกสารอนุมัติแล้ว');
      await audit(owner.id, doc.id, 'review-ok', `${to.displayName} ตรวจสอบแล้ว ไม่มีแก้ไข สถานะเปลี่ยนเป็นอนุมัติ`, to.displayName, r.at);
      await notify(owner.id, 'approved', `${them} ตรวจสอบเอกสาร ${doc.docNo} แล้ว ผ่าน`, doc.id, r.at);
    } else if (r && r.kind === 'declined') {
      await version(doc, v++, r.at, to.displayName, `คู่ค้าตีกลับ: ${r.reason}`);
      await audit(owner.id, doc.id, 'declined', `${to.displayName} ปฏิเสธ: ${r.reason} สถานะเปลี่ยนเป็นไม่อนุมัติ`, to.displayName, r.at);
      await notify(owner.id, 'rejected', `${them} ตีกลับเอกสาร ${doc.docNo} ${r.reason}`, doc.id, r.at);
    }
  }
  if (o.cancel) {
    await version(doc, v++, o.cancel.at, me, `ยกเลิกเอกสาร: ${o.cancel.reason}`);
    await audit(owner.id, doc.id, 'status', `เปลี่ยนสถานะเป็น ยกเลิก (${o.cancel.reason}) และยกเลิกคำขอที่ค้างอยู่`, me, o.cancel.at);
  }
  return doc;
}

const partyOf = (u, extra = {}) => ({
  entityType: u.entityType, name: nameOf(u), taxId: u.taxId, branch: u.entityType === 'juristic' ? 'สำนักงานใหญ่' : '',
  address: u.address, contactPerson: u.contactName || '', phone: u.phone, email: u.email, ...extra,
});
const creatorParty = () => ({
  ...partyOf(U.creator), contactPerson: 'นุสนีย์', channelName: U.creator.channelName, socials: U.creator.socials,
  bankName: U.creator.bank.bankName, bankAccountNo: U.creator.bank.accountNo, bankAccountName: U.creator.bank.accountName,
});
const myBank = () => ({ bankName: U.creator.bank.bankName, bankAccountName: U.creator.bank.accountName, bankAccountNo: U.creator.bank.accountNo });

async function main() {
  await store.ensureReady();
  for (const [k, email] of [['creator', 'creator@taxflow.test'], ['brand', 'brand@taxflow.test'], ['agency', 'agency@taxflow.test']]) {
    U[k] = await store.whereOne('users', { email });
    if (!U[k]) throw new Error(`ไม่พบบัญชี ${email} (เปิดเซิร์ฟเวอร์ครั้งแรกเพื่อสร้างบัญชีทดลองก่อน)`);
    const s = (await store.all('signatures', (x) => x.userId === U[k].id)).pop();
    SIG[k] = s ? s.image : null;
  }
  if ((await store.all('documents', (d) => d.demoSeed === MARK)).length) {
    console.log('บัญชี creator@taxflow.test มีเอกสารตัวอย่างชุดนี้อยู่แล้ว ไม่เติมซ้ำ');
    return;
  }
  await store.transaction(() => seedAll(U.creator));
  const mine = await store.all('documents', (d) => d.demoSeed === MARK);
  console.log(`เติมเอกสารตัวอย่างแล้ว ${mine.length} ฉบับ`);
  for (const d of mine) console.log(` • ${d.docNo.padEnd(16)} ${d.type.padEnd(13)} ${d.status.padEnd(10)} เจ้าของ #${d.userId}`);
}

// ทำทั้งชุดในทรานแซกชันเดียว ถ้าฉบับไหนไม่ผ่านการตรวจ จะไม่เหลือข้อมูลค้างครึ่งชุด
async function seedAll(C) {

  // สมุดคู่ค้าของครีเอเตอร์: เพิ่ม Brand (อีเมลบัญชี TaxFlow จริง ส่งเอกสารหากันได้)
  if (!(await store.findOne('contacts', (c) => c.userId === C.id && c.taxId === U.brand.taxId))) {
    await store.insert('contacts', { userId: C.id, ...partyOf(U.brand), contactPerson: 'คุณพิมพ์ชนก (ฝ่ายการตลาด)', kind: 'brand', note: 'ลูกค้าแคมเปญ Glow Up Serum' });
  }

  /* ---------- 1) Brand ↔ ครีเอเตอร์: ใบเสนอราคา → PO → ใบแจ้งหนี้ ---------- */
  const brandParty = partyOf(U.brand, { contactPerson: 'คุณพิมพ์ชนก (ฝ่ายการตลาด)' });
  const serumItems = [{ name: 'คลิปรีวิว Glow Up Serum ลง TikTok ความยาว 60 วินาที (รวมสคริปต์ ถ่ายทำ ตัดต่อ)', qty: 2, unit: 'คลิป', price: 8000 }];
  const qt = await makeDoc(C, 'QUOTATION', {
    fields: { issueDate: '2026-09-25', validUntil: '2026-10-25', paymentTerms: 'มัดจำ 50% เมื่อยืนยันงาน ส่วนที่เหลือชำระภายใน 15 วันหลังโพสต์ครบ', workPeriod: '1 – 31 ต.ค. 2569', note: 'ราคานี้ยังไม่รวมค่าเดินทางนอกกรุงเทพมหานคร' },
    party: brandParty, items: serumItems,
  }, { created: T('2026-09-25 10:40'), signAt: T('2026-09-25 11:20'),
    send: { to: 'brand', purpose: 'review', at: T('2026-09-25 11:30'), due: '2026-09-30', message: 'ส่งใบเสนอราคาแคมเปญ Glow Up Serum ให้พิจารณาค่ะ', reply: { kind: 'approved', at: T('2026-09-26 10:12') } } });

  const po = await makeDoc(U.brand, 'PO', {
    fields: { issueDate: '2026-09-26', deliveryDate: '2026-10-31', quotationRef: qt.docNo, paymentTerms: 'มัดจำ 50% ภายใน 7 วันหลังรับวางบิล ส่วนที่เหลือเครดิต 15 วัน', deliveryTerms: 'ส่งลิงก์คลิปที่โพสต์แล้วพร้อมภาพหน้าจอสถิติการเข้าชม 7 วัน' },
    party: partyOf(C, { contactPerson: 'นุสนีย์' }), items: serumItems,
  }, { created: T('2026-09-26 13:15'), signAt: T('2026-09-26 13:40'),
    send: { to: 'creator', purpose: 'sign', at: T('2026-09-26 14:00'), due: '2026-09-29', signAs: 'ผู้รับจ้าง', message: 'ยืนยันการสั่งจ้างตามใบเสนอราคา รบกวนลงนามตอบรับค่ะ', reply: { kind: 'signed', at: T('2026-09-26 18:45') } } });

  await makeDoc(C, 'INVOICE', {
    fields: { issueDate: '2026-10-02', dueDate: '2026-10-09', poRef: po.docNo, quotationRef: qt.docNo, ...myBank(), note: 'เรียกเก็บค่ามัดจำงวดที่ 1 (50%) ตามใบสั่งซื้อ' },
    party: brandParty, items: [{ name: `ค่ามัดจำงวดที่ 1 (50%) คลิปรีวิว Glow Up Serum ตามใบสั่งซื้อ ${po.docNo}`, qty: 1, unit: 'งวด', price: 8000 }],
  }, { created: T('2026-10-02 09:00'), signAt: T('2026-10-02 09:18'),
    send: { to: 'brand', purpose: 'sign', at: T('2026-10-02 09:25'), due: '2026-10-09', signAs: 'ผู้ชำระเงิน', message: 'วางบิลค่ามัดจำงวดที่ 1 รบกวนลงนามรับวางบิลภายในวันที่ 9 ต.ค. ค่ะ' } });

  await makeDoc(C, 'INVOICE', {
    fields: { issueDate: '2026-09-27', dueDate: '2026-10-27', quotationRef: qt.docNo, ...myBank() },
    party: brandParty, items: [{ name: 'ค่าเดินทางถ่ายทำนอกสถานที่ (เชียงใหม่)', qty: 1, unit: 'เที่ยว', price: 4500 }],
  }, { created: T('2026-09-27 15:00'), signAt: T('2026-09-27 15:12'),
    send: { to: 'brand', purpose: 'sign', at: T('2026-09-27 15:20'), due: '2026-10-04', message: 'เรียกเก็บค่าเดินทางถ่ายทำนอกสถานที่ค่ะ',
      reply: { kind: 'declined', at: T('2026-09-28 10:45'), reason: 'ใบสั่งซื้อไม่ได้ระบุค่าเดินทาง และถ่ายทำในกรุงเทพมหานครตามที่ตกลง กรุณาตรวจสอบ' } } });

  /* ---------- 2) เอเจนซี่ ↔ ครีเอเตอร์: ส่งมอบงาน → ใบสำคัญจ่าย → ใบเสร็จ → 50 ทวิ ---------- */
  const agencyParty = partyOf(U.agency, { contactPerson: 'ฝ่ายบัญชี' });
  await makeDoc(C, 'DELIVERY', {
    fields: { deliverDate: '2026-09-24', campaignName: 'คลิปรีวิวสินค้าลง TikTok (ตามใบแจ้งหนี้ INV-2026-00001)', periodStart: '2026-09-15', periodEnd: '2026-09-24',
      delivererName: C.displayName, receiverName: 'ฝ่ายบัญชี', acceptDate: '2026-09-24', acceptStatus: 'accepted' },
    party: agencyParty,
    items: [{ influencer: 'นุสนีย์กินเก่ง', contentType: 'วิดีโอสั้น 60 วินาที', platform: 'TikTok', pieces: 1, link: 'https://www.tiktok.com/@nusnee.eats/video/7420000000000000001', publishDate: '2026-09-23', itemStatus: 'เผยแพร่แล้ว' }],
  }, { created: T('2026-09-24 09:40'), signAt: T('2026-09-24 09:52'),
    send: { to: 'agency', purpose: 'sign', at: T('2026-09-24 10:05'), due: '2026-09-26', signAs: 'ผู้รับมอบงาน', message: 'ส่งมอบคลิปที่โพสต์แล้ว รบกวนตรวจรับและลงนามค่ะ', reply: { kind: 'signed', at: T('2026-09-24 16:31') } } });

  const pv = await makeDoc(U.agency, 'PAYMENT', {
    fields: { payDate: '2026-09-30', campaignName: 'คลิปรีวิวสินค้าลง TikTok', hasWht: true, incomeCode: '5', incomeDesc: 'ค่าจ้างทำของ', whtRate: '3', whtCondition: '1',
      payMethod: 'transfer', payBank: U.agency.bank.bankName, transferRef: 'KTB2609300001', preparedBy: 'วิภาดา ทองแท้', approvedBy: 'วิภาดา ทองแท้', paidBy: 'ฝ่ายบัญชี' },
    party: creatorParty(), items: [{ docDate: '2026-09-22', docNo: 'INV-2026-00001', name: 'ค่าผลิตคลิปรีวิวสินค้าลง TikTok ความยาว 60 วินาที', amount: 3500 }],
  }, { created: T('2026-09-30 10:30'), signAt: T('2026-09-30 10:50'),
    send: { to: 'creator', purpose: 'review', at: T('2026-09-30 11:10'), due: '2026-10-02', message: 'โอนค่าจ้างแล้ว หักภาษี ณ ที่จ่าย 3% รบกวนตรวจสอบยอดค่ะ', reply: { kind: 'approved', at: T('2026-09-30 13:02') } } });

  await makeDoc(C, 'RECEIPT', {
    fields: { receiveDate: '2026-09-30', invoiceRef: 'INV-2026-00001', payMethod: 'transfer', payDate: '2026-09-30', transferRef: 'KTB2609300001', payBank: U.agency.bank.bankName,
      note: 'ผู้จ่ายเงินหักภาษี ณ ที่จ่าย 3% จำนวน 105.00 บาท รับโอนสุทธิ 3,395.00 บาท' },
    party: agencyParty, items: [{ name: 'รับชำระค่าผลิตคลิปรีวิวสินค้าลง TikTok ตามใบแจ้งหนี้ INV-2026-00001', amount: 3500 }],
  }, { created: T('2026-09-30 14:10'), signAt: T('2026-09-30 14:12'),
    send: { to: 'agency', purpose: 'review', at: T('2026-09-30 14:20'), message: 'ส่งใบเสร็จรับเงินค่ะ', reply: { kind: 'approved', at: T('2026-10-01 09:05') } } });

  await makeDoc(U.agency, 'EWHT', {
    fields: { paymentRef: pv.docNo, issueDate: '2026-09-30', payDate: '2026-09-30', incomeCode: '5', incomeDesc: 'ค่าจ้างทำของ', amount: 3500, whtRate: '3', whtCondition: '1', pndForm: 'auto',
      signerName: 'วิภาดา ทองแท้', signerPosition: 'กรรมการผู้มีอำนาจ' },
    party: { entityType: 'individual', name: C.displayName, taxId: C.taxId, address: C.address },
  }, { created: T('2026-09-30 16:40'), signAt: T('2026-09-30 16:55'),
    send: { to: 'creator', purpose: 'review', at: T('2026-09-30 17:05'), message: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย สำหรับค่าจ้างเดือนกันยายน', reply: { kind: 'approved', at: T('2026-10-01 08:40') } } });

  await makeDoc(U.agency, 'CONTRACT_INF', {
    fields: { contractDate: '2026-10-03', startDate: '2026-10-10', endDate: '2026-12-31', place: 'กรุงเทพมหานคร', campaignName: 'Healthy Bowl ไตรมาส 4/2569',
      platforms: ['TikTok', 'Instagram'], contentType: 'วิดีโอสั้น 60 วินาที', contentCount: 3,
      brief: 'รีวิวเมนู Healthy Bowl 3 เมนูใหม่ เน้นวัตถุดิบและแคลอรี ถ่ายที่ร้านสาขาสยาม แสดงโลโก้ในวินาทีแรก', hashtags: '#HealthyBowl #กินดีไม่อ้วน', mentions: '@healthybowl.th',
      submitDate: '2026-11-01', postDate: '2026-11-10', fee: 45000, payMethod: 'transfer', installmentCount: 1,
      paymentTerms: 'ชำระเต็มจำนวนภายใน 15 วันหลังโพสต์ครบและผู้ว่าจ้างตรวจรับงาน โดยหักภาษี ณ ที่จ่าย 3%', whtRate: '3', revisionRounds: 2,
      publishDuration: 'ไม่น้อยกว่า 90 วันนับจากวันที่โพสต์', sign1Name: 'วิภาดา ทองแท้', sign1Position: 'กรรมการผู้มีอำนาจ', sign2Name: C.displayName, signDate: '2026-10-03' },
    party: creatorParty(),
  }, { created: T('2026-10-03 15:30'), signAt: T('2026-10-03 16:00'),
    send: { to: 'creator', purpose: 'sign', at: T('2026-10-03 16:20'), due: '2026-10-10', signAs: 'ผู้รับจ้าง', message: 'สัญญาจ้างแคมเปญ Healthy Bowl ไตรมาส 4 รบกวนลงนามภายในวันที่ 10 ต.ค. ค่ะ' } });

  /* ---------- 3) เอกสารที่ยกเลิก ---------- */
  await makeDoc(C, 'QUOTATION', {
    fields: { issueDate: '2026-09-18', validUntil: '2026-10-18', workPeriod: 'ต.ค. 2569' },
    party: agencyParty, items: [{ name: 'Live ขายสินค้าบน TikTok 2 ชั่วโมง', qty: 1, unit: 'ครั้ง', price: 12000 }],
  }, { created: T('2026-09-18 12:30'), signAt: T('2026-09-18 12:50'),
    send: { to: 'agency', purpose: 'review', at: T('2026-09-18 13:00'), message: 'เสนอราคางาน Live ขายสินค้าค่ะ', reply: { kind: 'cancelled', at: T('2026-09-19 10:00') } },
    cancel: { at: T('2026-09-19 10:00'), reason: 'ลูกค้าเลื่อนแคมเปญไปปีหน้า' } });

}

main().then(() => process.exit(0), (e) => { console.error('เติมข้อมูลไม่สำเร็จ:', e.message); process.exit(1); });
