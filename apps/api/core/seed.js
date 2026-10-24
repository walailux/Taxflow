'use strict';
/** core/seed.js บัญชีทดลองและคู่ค้าตัวอย่าง — ย้ายจาก server.js เดิม (WP1 ตรรกะไม่เปลี่ยน) */
const store = require('./store');
const auth = require('../lib/auth');
const profile = require('../lib/profile');
const pdpa = require('../lib/pdpa');
const { bangkokDateStr } = require('./context');

/* ---------- seed demo users ---------- */
const SEED_USERS = [
  {
    role: 'creator', email: 'creator@taxflow.test', password: '123456',
    displayName: 'นุสนีย์ มะแอเคียน', entityType: 'individual', taxId: '1100700123455',
    addr: { no: '99/1', street: 'รามคำแหง', subdistrict: 'หัวหมาก', district: 'บางกะปิ', province: 'กรุงเทพมหานคร', postcode: '10240' },
    phone: '081-234-5678', vatRegistered: false,
    channelName: 'นุสนีย์กินเก่ง', socials: 'TikTok @nusnee.eats (250K) · Instagram @nusnee (80K)', contactName: 'นุสนีย์',
    bank: { bankName: 'ธนาคารไทยพาณิชย์', accountNo: '987-6-54321-0', accountName: 'นุสนีย์ มะแอเคียน' },
  },
  {
    role: 'corporate', email: 'brand@taxflow.test', password: '123456',
    displayName: 'บริษัท แบรนด์ดี จำกัด', entityType: 'juristic',
    companyName: 'บริษัท แบรนด์ดี จำกัด', companyType: 'บริษัทจำกัด', taxId: '0105561112235',
    branchType: 'head', authName: 'สมชาย ใจดี', authPosition: 'กรรมการผู้จัดการ',
    addr: { no: '55', street: 'สาทรใต้', subdistrict: 'ทุ่งมหาเมฆ', district: 'สาทร', province: 'กรุงเทพมหานคร', postcode: '10120' },
    phone: '02-111-2233', vatRegistered: true, vatRegDate: '2019-04-01', contactName: 'พิมพ์ชนก (ฝ่ายการตลาด)',
    bank: { bankName: 'ธนาคารกสิกรไทย', accountNo: '012-3-45678-9', accountName: 'บริษัท แบรนด์ดี จำกัด' },
  },
  {
    role: 'agency', email: 'agency@taxflow.test', password: '123456',
    displayName: 'บริษัท มีเดีย เอเจนซี่ จำกัด', entityType: 'juristic',
    companyName: 'บริษัท มีเดีย เอเจนซี่ จำกัด', companyType: 'บริษัทจำกัด', taxId: '0105550001232',
    branchType: 'head', authName: 'วิภาดา ทองแท้', authPosition: 'กรรมการผู้มีอำนาจ',
    addr: { no: '123', street: 'สุขุมวิท', subdistrict: 'คลองเตยเหนือ', district: 'วัฒนา', province: 'กรุงเทพมหานคร', postcode: '10110' },
    phone: '02-999-8877', vatRegistered: true, vatRegDate: '2017-01-15', tradeName: 'Media Agency', contactName: 'วิภาดา ทองแท้',
    bank: { bankName: 'ธนาคารกรุงไทย', accountNo: '222-3-44455-6', accountName: 'บริษัท มีเดีย เอเจนซี่ จำกัด' },
  },
  {
    role: 'admin', email: 'admin@taxflow.test', password: '123456',
    displayName: 'ผู้ดูแลระบบ TaxFlow', entityType: 'individual', taxId: '',
  },
];

// สมุดคู่ค้าตัวอย่าง (จะถูกผูกกับผู้ใช้ตาม email ตอน seed)
const SEED_CONTACTS = {
  'agency@taxflow.test': [
    { name: 'บริษัท แบรนด์ดี จำกัด', taxId: '0105561112235', kind: 'brand', entityType: 'juristic', branch: 'สำนักงานใหญ่', contactPerson: 'คุณพิมพ์ชนก (ฝ่ายการตลาด)', email: 'ap@branddee.co.th', phone: '02-111-2233', address: '55 ถ.สาทรใต้ แขวงทุ่งมหาเมฆ เขตสาทร กรุงเทพมหานคร 10120', authName: 'สมชาย ใจดี', authPosition: 'กรรมการผู้จัดการ', note: 'ลูกค้าหลัก แคมเปญรายไตรมาส' },
    { name: 'นุสนีย์ มะแอเคียน', taxId: '1100700123455', kind: 'influencer', entityType: 'individual', channelName: 'นุสนีย์กินเก่ง', email: 'nusnee@example.com', phone: '081-234-5678', address: '99/1 ถ.รามคำแหง แขวงหัวหมาก เขตบางกะปิ กรุงเทพมหานคร 10240', bankName: 'ธนาคารไทยพาณิชย์', bankAccountNo: '987-6-54321-0', bankAccountName: 'นุสนีย์ มะแอเคียน', socials: 'TikTok @nusnee.eats · Instagram @nusnee', note: 'อินฟลูเอนเซอร์หมวดอาหาร อัตราค่าจ้าง 15,000 บาทต่อคลิป' },
    { name: 'วลัยลักษณ์ ศรีสวัสดิ์', taxId: '1100700654329', kind: 'influencer', entityType: 'individual', channelName: 'เที่ยวกับวลัย', email: 'walailak@example.com', phone: '089-876-5432', address: '12 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200', bankName: 'ธนาคารกรุงเทพ', bankAccountNo: '111-2-33344-5', bankAccountName: 'วลัยลักษณ์ ศรีสวัสดิ์', socials: 'YouTube เที่ยวกับวลัย · Instagram @walai.trip', note: 'อินฟลูเอนเซอร์หมวดท่องเที่ยว' },
  ],
  'brand@taxflow.test': [
    { name: 'บริษัท มีเดีย เอเจนซี่ จำกัด', taxId: '0105550001232', kind: 'agency', entityType: 'juristic', branch: 'สำนักงานใหญ่', contactPerson: 'คุณวิภาดา', email: 'billing@mediaagency.co.th', phone: '02-999-8877', address: '123 ถ.สุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110', authName: 'วิภาดา ทองแท้', authPosition: 'กรรมการผู้มีอำนาจ', bankName: 'ธนาคารกรุงไทย', bankAccountNo: '222-3-44455-6', bankAccountName: 'บริษัท มีเดีย เอเจนซี่ จำกัด', note: 'เอเจนซี่คู่สัญญาหลัก' },
  ],
  'creator@taxflow.test': [
    { name: 'บริษัท มีเดีย เอเจนซี่ จำกัด', taxId: '0105550001232', kind: 'agency', entityType: 'juristic', branch: 'สำนักงานใหญ่', contactPerson: 'ฝ่ายบัญชี', email: 'hr@mediaagency.co.th', phone: '02-999-8877', address: '123 ถ.สุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110', note: 'ผู้ว่าจ้างประจำ จ่ายทุกสิ้นเดือน' },
  ],
};

async function seedUsers() {
  if (await store.count('users') > 0) return [];
  const created = [];
  for (const u of SEED_USERS) {
    const { password, ...rest } = u;
    const base = profile.defaults(u.role);
    const record = {
      ...base, ...rest,
      passwordHash: auth.hashPassword(password),
      emailVerified: true,
      verifyStatus: 'verified',
      verifiedAt: new Date().toISOString(),
      addr: profile.normalizeAddress(u.addr || {}),
      consent: pdpa.makeConsentRecord(pdpa.PURPOSES.map((x) => x.key)),
    };
    record.address = profile.formatAddress(record.addr);
    const user = await store.insert('users', record);
    await store.insert('consents', {
      userId: user.id, version: pdpa.CONSENT_VERSION,
      purposes: pdpa.PURPOSES.map((x) => x.key), action: 'seed', at: new Date().toISOString(),
    });
    for (const c of (SEED_CONTACTS[u.email] || [])) {
      await store.insert('contacts', { userId: user.id, ...c });
    }
    // ตัวอย่างกิจกรรมในปฏิทินงาน (นับจากวันที่สร้างฐานข้อมูล) ให้บัญชีทดลองเห็นการใช้งานทันที
    if (u.role !== 'admin') {
      const t = bangkokDateStr();
      const plus = (n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
      const SAMPLE = {
        creator: [
          { title: 'ถ่ายทำคอนเทนต์รีวิวสกินแคร์', date: plus(2), time: '13:00', endTime: '17:00', category: 'content', marker: 'camera', priority: 'high', purpose: 'ถ่ายทำตามบรีฟแคมเปญ Glow Up', note: 'เตรียมไฟวงแหวนและฉากสีขาว' },
          { title: 'ส่งใบแจ้งหนี้ให้แบรนด์', date: plus(5), category: 'payment', marker: 'money', priority: 'normal', purpose: 'วางบิลงวดที่ 1' },
        ],
        agency: [
          { title: 'ประชุมบรีฟแคมเปญกับแบรนด์', date: plus(1), time: '10:00', endTime: '11:30', category: 'meeting', marker: 'people', priority: 'high', purpose: 'สรุปงบประมาณและรายชื่อ Influencer' },
          { title: 'จ่ายเงิน Influencer และออก 50 ทวิ', date: plus(6), category: 'payment', marker: 'money', priority: 'critical', purpose: 'จ่ายค่าจ้างงวดสุดท้าย' },
        ],
        corporate: [
          { title: 'ตรวจรับงานแคมเปญเดือนนี้', date: plus(3), category: 'document', marker: 'check', priority: 'high', purpose: 'ตรวจรับตามใบส่งมอบงาน' },
          { title: 'พิจารณาต่ออายุสัญญาเอเจนซี่', date: plus(12), endDate: plus(14), category: 'contract', marker: 'flag', priority: 'normal', purpose: 'สรุปผลงานก่อนต่อสัญญา' },
        ],
      };
      for (const ev of (SAMPLE[u.role] || [])) {
        await store.insert('calendar_events', { userId: user.id, endDate: '', time: '', endTime: '', note: '', linkDocId: null, remindDays: 1, done: false, attachments: [], ...ev, createdAt: new Date().toISOString() });
      }
    }
    created.push(u);
  }
  return created;
}

module.exports = { SEED_USERS, SEED_CONTACTS, seedUsers };
