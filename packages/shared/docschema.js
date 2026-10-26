/* docschema.js นิยามแบบฟอร์มเอกสารทุกประเภท (ver16)
 * -------------------------------------------------------------
 * ใช้ร่วมกันทั้งฝั่งเบราว์เซอร์ (window.DOC_SCHEMA) และเซิร์ฟเวอร์ (require)
 * เพื่อให้ "ฟิลด์ที่ต้องกรอก / การตรวจสอบ / การคำนวณยอด" เป็นชุดเดียวกันทุกจุด
 *
 * หลักการ: ข้อมูลของผู้ออกเอกสาร (Agency / Brand / Influencer) ดึงจากโปรไฟล์อัตโนมัติ
 * ข้อมูลคู่ค้าดึงจากสมุดคู่ค้า ผู้ใช้กรอกเพิ่มเฉพาะข้อมูลของเอกสารฉบับนั้น
 *
 * ขอบเขต: ตัด e-Tax Invoice ออกแล้ว คงเอกสารธุรกิจ เอกสารสัญญา และเอกสารภาษี
 * ภ.ง.ด.3 / ภ.ง.ด.53 เป็น "การจัดทำข้อมูล" เพื่อนำไปยื่นเอง ไม่ใช่การยื่นแทนกรมสรรพากร
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DOC_SCHEMA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  const VAT_RATE = 7;
  const WHT_RATES = [1, 2, 3, 5, 10, 15];

  /* ---------- ตัวเลือกกลาง ---------- */
  // ประเภทเงินได้ตามแบบหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ของกรมสรรพากร
  const INCOME_TYPES = [
    { code: '1', label: 'เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)', short: '40(1)' },
    { code: '2', label: 'ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)', short: '40(2)' },
    { code: '3', label: 'ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)', short: '40(3)' },
    { code: '4a', label: 'ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)', short: '40(4)(ก)' },
    { code: '4b', label: 'เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)', short: '40(4)(ข)' },
    { code: '5', label: 'การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส (เช่น ค่าจ้างทำของ ค่าบริการ ค่าโฆษณา ค่าเช่า ค่าขนส่ง)', short: '3 เตรส' },
    { code: '6', label: 'อื่น ๆ (ระบุ)', short: 'อื่น ๆ' },
  ];
  const INCOME_LABEL = Object.fromEntries(INCOME_TYPES.map((t) => [t.code, t.label]));

  // อัตราที่ใช้บ่อยตามคำสั่งกรมสรรพากร ท.ป.4/2528 (ช่วยแนะนำเท่านั้น ผู้ใช้เลือกเองได้)
  const WHT_PRESETS = [
    { desc: 'ค่าบริการ', code: '5', rate: 3 },
    { desc: 'ค่าจ้างทำของ', code: '5', rate: 3 },
    { desc: 'ค่าโฆษณา', code: '5', rate: 2 },
    { desc: 'ค่าเช่า', code: '5', rate: 5 },
    { desc: 'ค่าขนส่ง', code: '5', rate: 1 },
    { desc: 'ค่าแห่งลิขสิทธิ์', code: '3', rate: 3 },
    { desc: 'รางวัล/ส่งเสริมการขาย', code: '5', rate: 5 },
  ];

  const WHT_CONDITIONS = [
    { value: '1', label: 'หัก ณ ที่จ่าย' },
    { value: '2', label: 'ออกให้ตลอดไป' },
    { value: '3', label: 'ออกให้ครั้งเดียว' },
  ];

  // ลำดับที่ในแบบ (ช่องในหนังสือรับรอง 50 ทวิ)
  const PND_FORMS = [
    { value: 'PND1A', label: 'ภ.ง.ด.1ก' },
    { value: 'PND1A_SP', label: 'ภ.ง.ด.1ก พิเศษ' },
    { value: 'PND2', label: 'ภ.ง.ด.2' },
    { value: 'PND3', label: 'ภ.ง.ด.3' },
    { value: 'PND2A', label: 'ภ.ง.ด.2ก' },
    { value: 'PND3A', label: 'ภ.ง.ด.3ก' },
    { value: 'PND53', label: 'ภ.ง.ด.53' },
  ];

  const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  // ตัวย่อเดือนตามราชบัณฑิตยสภา ย่อไม่ได้ตามกติกาเดียวกันทุกเดือน (มี.ค. ใช้สองตัวอักษรแรก แต่ ม.ค. ใช้ตัวแรกของแต่ละพยางค์)
  // จึงต้องเก็บเป็นรายการตายตัว ตัดคำเอาเองไม่ได้
  const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  const PAY_METHODS = [
    { value: 'cash', label: 'เงินสด' },
    { value: 'transfer', label: 'โอนเงิน' },
    { value: 'cheque', label: 'เช็ค' },
    { value: 'other', label: 'อื่น ๆ' },
  ];

  const PLATFORMS = ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'X (Twitter)', 'LINE', 'Lemon8', 'อื่น ๆ'];

  /* ---------- ข้อมูลคู่ค้า (snapshot ที่เก็บในเอกสาร) ---------- */
  const PARTY_FIELDS = {
    entityType: { label: 'ประเภท', type: 'select', options: [{ value: 'juristic', label: 'นิติบุคคล' }, { value: 'individual', label: 'บุคคลธรรมดา' }] },
    name: { label: 'ชื่อ / ชื่อบริษัท', type: 'text', minLen: 2, maxLen: 200 },
    channelName: { label: 'ชื่อช่อง / ชื่อที่ใช้ในการทำงาน', type: 'text' },
    taxId: { label: 'เลขประจำตัวผู้เสียภาษี (13 หลัก)', type: 'taxid' },
    branch: { label: 'สำนักงานใหญ่ / สาขา', type: 'text', fmt: 'branch', placeholder: 'สำนักงานใหญ่ หรือ สาขาที่ 00001' },
    address: { label: 'ที่อยู่', type: 'textarea', minLen: 10, maxLen: 500 },
    contactPerson: { label: 'ชื่อผู้ติดต่อ', type: 'text' },
    phone: { label: 'เบอร์โทรศัพท์', type: 'text', fmt: 'phone', placeholder: '0812345678 หรือ 02-111-2233' },
    email: { label: 'อีเมล', type: 'text', fmt: 'email', placeholder: 'example@email.com' },
    authName: { label: 'ผู้มีอำนาจลงนาม', type: 'text' },
    authPosition: { label: 'ตำแหน่งผู้มีอำนาจลงนาม', type: 'text' },
    bankName: { label: 'ธนาคาร', type: 'text' },
    bankAccountNo: { label: 'เลขที่บัญชี', type: 'text', fmt: 'bankacc', placeholder: 'ตัวเลข 10–15 หลัก' },
    bankAccountName: { label: 'ชื่อบัญชี', type: 'text' },
    socials: { label: 'ช่องทาง Social Media', type: 'textarea', placeholder: 'เช่น TikTok @name (120K) · IG @name' },
  };
  const PARTY_KEYS = Object.keys(PARTY_FIELDS);

  const CONTACT_KINDS = [
    { value: 'brand', label: 'Brand / ลูกค้า' },
    { value: 'agency', label: 'Agency' },
    { value: 'influencer', label: 'Influencer / ผู้รับจ้าง' },
    { value: 'other', label: 'อื่น ๆ' },
  ];
  // ประเภทคู่ค้าเดิม (ก่อน ver16) → ประเภทใหม่
  const LEGACY_KIND = { buyer: 'brand', payee: 'influencer', payer: 'agency' };
  const normKind = (k) => LEGACY_KIND[k] || k || 'other';

  /* ---------- helper สร้างฟิลด์ ---------- */
  const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
  const DEFAULT_TERMS = {
    revision: 'ผู้ว่าจ้างมีสิทธิขอแก้ไขชิ้นงานได้ตามจำนวนครั้งที่ตกลง โดยต้องแจ้งเป็นลายลักษณ์อักษรภายใน 3 วันทำการนับจากวันที่ได้รับชิ้นงาน การแก้ไขที่เกินขอบเขตงานเดิมให้คิดค่าใช้จ่ายเพิ่มตามที่ตกลงกัน',
    cancel: 'คู่สัญญาฝ่ายใดประสงค์จะยกเลิกงาน ต้องแจ้งอีกฝ่ายล่วงหน้าเป็นลายลักษณ์อักษรไม่น้อยกว่า 7 วัน และชำระค่าตอบแทนตามสัดส่วนของงานที่ได้ดำเนินการไปแล้ว',
    confidential: 'คู่สัญญาตกลงเก็บรักษาข้อมูลทางธุรกิจ ข้อมูลแคมเปญ และข้อมูลส่วนบุคคลของอีกฝ่ายไว้เป็นความลับ และใช้เท่าที่จำเป็นต่อการปฏิบัติตามสัญญานี้ ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562',
    rights: 'ผู้ว่าจ้างมีสิทธิใช้ Content ที่ผลิตขึ้นตามสัญญานี้ในช่องทางและระยะเวลาที่ระบุ ส่วนลิขสิทธิ์อื่นนอกเหนือจากนี้ยังคงเป็นของผู้สร้างสรรค์ เว้นแต่ตกลงเป็นลายลักษณ์อักษรเป็นอย่างอื่น (พ.ร.บ.ลิขสิทธิ์ พ.ศ. 2537)',
    breach: 'หากคู่สัญญาฝ่ายใดผิดสัญญาข้อหนึ่งข้อใด และไม่แก้ไขภายใน 7 วันนับจากได้รับแจ้ง อีกฝ่ายมีสิทธิบอกเลิกสัญญาและเรียกค่าเสียหายที่เกิดขึ้นจริงได้',
    removal: 'ผู้รับจ้างต้องคงโพสต์ไว้ไม่น้อยกว่าระยะเวลาเผยแพร่ที่ระบุ ห้ามลบหรือซ่อนก่อนครบกำหนดโดยไม่ได้รับความยินยอมจากผู้ว่าจ้าง',
  };

  /* =========================================================
   * นิยามเอกสาร
   * mode: priced | amount | voucher | deliverables | contract | poa | wht | pnd
   * ========================================================= */
  const FORMS = {
    /* ---------------- 2) ใบเสนอราคา ---------------- */
    QUOTATION: {
      label: 'ใบเสนอราคา', en: 'Quotation', group: 'biz', prefix: 'QT', icon: 'quote',
      roles: ['agency', 'corporate', 'creator'], mode: 'priced',
      desc: { agency: 'เสนอราคาให้ Brand', corporate: 'เสนอราคาต่อลูกค้า', creator: 'เสนอราคางานก่อนรับงาน' },
      hint: 'เอกสารเสนอราคาก่อนตกลงงาน ยังไม่ผูกพันจนกว่าลูกค้าตอบรับ ระบุวันหมดอายุให้ชัด',
      issuerTitle: 'ผู้เสนอราคา',
      party: { title: 'ข้อมูลลูกค้า', role: 'ลูกค้า (ผู้รับใบเสนอราคา)', kinds: ['brand', 'agency', 'other'],
        keys: ['name', 'taxId', 'branch', 'address', 'contactPerson', 'phone', 'email'], required: ['name', 'contactPerson'] },
      meta: [
        f('issueDate', 'วันที่ออกเอกสาร', 'date', { required: true, def: 'today', docDate: true }),
        f('validUntil', 'วันที่ใบเสนอราคาหมดอายุ', 'date', { required: true, def: '+30', min: 'issueDate' }),
        f('refNo', 'เลขที่เอกสารอ้างอิง (ถ้ามี)', 'text'),
      ],
      items: { title: 'รายการเสนอราคา', cols: ['name', 'qty', 'unit', 'price', 'discount'], vat: 'issuer', billDiscount: true },
      sections: [
        { title: 'ข้อมูลเพิ่มเติม', fields: [
          f('paymentTerms', 'เงื่อนไขการชำระเงิน', 'text', { placeholder: 'เช่น ชำระภายใน 30 วันนับจากวันที่วางบิล' }),
          f('workPeriod', 'ระยะเวลาดำเนินงาน', 'text', { placeholder: 'เช่น 1 ต.ค. – 30 พ.ย. 2569 (2 เดือน)' }),
          f('note', 'หมายเหตุ', 'textarea'),
        ] },
      ],
    },

    /* ---------------- 3) ใบสั่งซื้อ ---------------- */
    PO: {
      label: 'ใบสั่งซื้อ (PO)', en: 'Purchase Order', group: 'biz', prefix: 'PO', icon: 'cart',
      roles: ['corporate', 'agency'], mode: 'priced',
      desc: { corporate: 'Brand สั่งซื้อ/สั่งจ้างงานจาก Agency', agency: 'สั่งซื้อ/จ้างงานจากอีกฝ่าย (คุณเป็นผู้ซื้อ)' },
      hint: 'ผู้ซื้อเป็นผู้ออก PO เพื่อยืนยันการสั่งซื้อ/สั่งจ้าง ข้อมูล "ผู้ซื้อ" คือโปรไฟล์ของคุณ มีผลผูกพันเมื่อผู้ขายตอบรับ',
      issuerTitle: 'ผู้ซื้อ',
      party: { title: 'ผู้ขาย / ผู้ให้บริการ', role: 'ผู้ขาย / ผู้ให้บริการ', kinds: ['agency', 'influencer', 'brand', 'other'],
        keys: ['name', 'taxId', 'branch', 'address', 'contactPerson', 'phone', 'email'], required: ['name', 'taxId', 'address'] },
      meta: [
        f('issueDate', 'วันที่ออก', 'date', { required: true, def: 'today', docDate: true }),
        f('deliveryDate', 'วันที่ต้องการส่งมอบ', 'date', { required: true, min: 'issueDate' }),
        f('quotationRef', 'เลขที่ใบเสนอราคาอ้างอิง', 'text', { placeholder: 'เลขที่ใบเสนอราคาที่ผู้ขายส่งมา' }),
      ],
      items: { title: 'รายการ', cols: ['name', 'qty', 'unit', 'price'], vat: 'any', vatLabel: 'ผู้ขายจดทะเบียน VAT · คิดภาษีมูลค่าเพิ่ม 7%' },
      sections: [
        { title: 'เงื่อนไข', fields: [
          f('paymentTerms', 'เงื่อนไขการชำระเงิน', 'text', { placeholder: 'เช่น เครดิต 30 วันหลังรับวางบิล' }),
          f('deliveryTerms', 'เงื่อนไขการส่งมอบ', 'textarea', { placeholder: 'เช่น ส่งมอบลิงก์ผลงานพร้อมรายงานสรุปผลแคมเปญ' }),
          f('note', 'หมายเหตุ', 'textarea'),
        ] },
      ],
    },

    /* ---------------- 4) ใบแจ้งหนี้ ---------------- */
    INVOICE: {
      label: 'ใบแจ้งหนี้', en: 'Invoice', group: 'biz', prefix: 'INV', icon: 'invoice',
      roles: ['agency', 'corporate', 'creator'], mode: 'priced',
      desc: { agency: 'แจ้งยอดให้ Brand ชำระเงิน', corporate: 'เรียกเก็บเงินคู่ค้า', creator: 'เรียกเก็บค่าจ้างจากผู้ว่าจ้าง' },
      hint: 'ใบแจ้งหนี้คือการ "ขอเก็บเงิน" ยังไม่ใช่หลักฐานการรับเงิน เมื่อได้รับชำระแล้วให้ออกใบเสร็จรับเงิน',
      issuerTitle: 'ผู้เรียกเก็บเงิน',
      party: { title: 'ผู้ชำระเงิน', role: 'ผู้ชำระเงิน', kinds: ['brand', 'agency', 'other'],
        keys: ['name', 'taxId', 'branch', 'address', 'contactPerson', 'phone', 'email'], required: ['name', 'address'] },
      meta: [
        f('issueDate', 'วันที่ออก', 'date', { required: true, def: 'today', docDate: true }),
        f('dueDate', 'วันครบกำหนดชำระ', 'date', { required: true, def: '+30', min: 'issueDate' }),
        f('poRef', 'อ้างอิง PO', 'text'),
        f('quotationRef', 'อ้างอิงใบเสนอราคา', 'docref', { from: ['QUOTATION'], copy: true }),
        f('contractRef', 'อ้างอิงสัญญา', 'docref', { from: ['CONTRACT_BRAND', 'CONTRACT_INF'] }),
      ],
      items: { title: 'รายการเรียกเก็บเงิน', cols: ['name', 'qty', 'unit', 'price', 'discount'], vat: 'issuer', billDiscount: true },
      sections: [
        { title: 'การชำระเงิน', fields: [
          f('bankName', 'ธนาคาร', 'text', { def: 'me.bank.bankName', required: true }),
          f('bankAccountName', 'ชื่อบัญชี', 'text', { def: 'me.bank.accountName', required: true }),
          f('bankAccountNo', 'เลขบัญชี', 'text', { def: 'me.bank.accountNo', required: true, fmt: 'bankacc' }),
          f('note', 'หมายเหตุ', 'textarea'),
        ] },
      ],
    },

    /* ---------------- 5) ใบเสร็จรับเงิน ---------------- */
    RECEIPT: {
      label: 'ใบเสร็จรับเงิน', en: 'Receipt', group: 'biz', prefix: 'RE', icon: 'receipt',
      roles: ['agency', 'corporate', 'creator'], mode: 'amount',
      desc: { agency: 'ออกหลังได้รับเงินจาก Brand แล้ว', corporate: 'ออกเมื่อได้รับชำระเงิน', creator: 'ออกให้ผู้ว่าจ้างเมื่อได้รับเงิน' },
      hint: 'ออกได้เฉพาะเมื่อ "ได้รับเงินแล้วจริง" ผู้รับเงินมีหน้าที่ออกใบรับตามมาตรา 105 แห่งประมวลรัษฎากร',
      issuerTitle: 'ผู้รับเงิน',
      party: { title: 'ผู้จ่ายเงิน', role: 'ผู้จ่ายเงิน', kinds: ['brand', 'agency', 'other'],
        keys: ['name', 'taxId', 'branch', 'address', 'phone', 'email'], required: ['name'] },
      meta: [
        f('receiveDate', 'วันที่รับเงิน', 'date', { required: true, def: 'today', docDate: true, notFuture: true }),
        f('invoiceRef', 'เลขที่ใบแจ้งหนี้อ้างอิง', 'docref', { from: ['INVOICE'], copy: true }),
      ],
      items: { title: 'รายการรับเงิน', cols: ['name', 'amount'], vat: 'issuer' },
      sections: [
        { title: 'วิธีชำระเงิน', fields: [
          f('payMethod', 'วิธีชำระเงิน', 'radio', { options: PAY_METHODS, required: true, def: 'transfer' }),
          f('payMethodOther', 'ระบุวิธีอื่น', 'text', { showIf: ['payMethod', 'other'], requiredIf: ['payMethod', 'other'] }),
        ] },
        { title: 'ข้อมูลการชำระ', fields: [
          f('payDate', 'วันที่ชำระ', 'date', { required: true, def: 'today', notFuture: true, max: 'receiveDate' }),
          f('transferRef', 'เลขอ้างอิงการโอน / เลขที่เช็ค', 'text', { showIf: ['payMethod', ['transfer', 'cheque']] }),
          f('payBank', 'ธนาคาร', 'text', { showIf: ['payMethod', ['transfer', 'cheque']] }),
          f('note', 'หมายเหตุ', 'textarea'),
        ] },
      ],
    },

    /* ---------------- 6) ใบส่งมอบงาน ---------------- */
    DELIVERY: {
      label: 'ใบส่งมอบงาน', en: 'Delivery / Work Acceptance', group: 'biz', prefix: 'DLV', icon: 'box',
      roles: ['agency', 'creator', 'corporate'], mode: 'deliverables',
      desc: { agency: 'ส่งมอบบริการ/Content ให้ Brand', creator: 'ส่งมอบ Content ให้ผู้ว่าจ้าง', corporate: 'ยืนยันการส่งมอบงาน' },
      hint: 'หลักฐานการส่งมอบบริการหรือ Content ส่งให้ผู้รับมอบตรวจรับและลงนาม ใช้ประกอบการวางบิล/เบิกเงินงวด',
      issuerTitle: 'ผู้ส่งมอบ',
      party: { title: 'ผู้รับมอบ', role: 'ผู้รับมอบงาน', kinds: ['brand', 'agency', 'other'],
        keys: ['name', 'taxId', 'address', 'contactPerson', 'phone', 'email'], required: ['name'] },
      meta: [
        f('deliverDate', 'วันที่ส่งมอบ', 'date', { required: true, def: 'today', docDate: true }),
        f('contractRef', 'เลขที่สัญญา / PO ที่เกี่ยวข้อง', 'docref', { from: ['CONTRACT_BRAND', 'CONTRACT_INF'] }),
      ],
      sections: [
        { title: 'รายละเอียด Campaign', fields: [
          f('campaignName', 'ชื่อแคมเปญ (Campaign)', 'text', { required: true, help: 'เลือกแคมเปญที่เคยใช้ในเอกสารก่อนหน้า หรือพิมพ์ชื่อใหม่' }),
          f('periodStart', 'ระยะเวลาดำเนินงาน: ตั้งแต่', 'date'),
          f('periodEnd', 'ถึงวันที่', 'date', { min: 'periodStart' }),
        ] },
      ],
      items: { title: 'รายการที่ส่งมอบ', cols: ['influencer', 'contentType', 'platform', 'pieces', 'link', 'publishDate', 'itemStatus'] },
      sectionsAfter: [
        { title: 'การรับมอบ', fields: [
          f('delivererName', 'ผู้ส่งมอบ', 'text', { required: true, def: 'me.signer' }),
          f('receiverName', 'ผู้รับมอบ', 'text', { def: 'party.contactPerson' }),
          f('acceptDate', 'วันที่รับมอบ', 'date', { min: 'deliverDate' }),
          f('acceptStatus', 'สถานะการรับมอบ', 'select', { required: true, def: 'pending', options: [
            { value: 'accepted', label: 'รับงาน' }, { value: 'pending', label: 'รอตรวจสอบ' }, { value: 'revise', label: 'ขอแก้ไข' }] }),
          f('note', 'หมายเหตุ', 'textarea'),
        ] },
      ],
    },

    /* ---------------- 7) ใบสำคัญจ่าย ---------------- */
    PAYMENT: {
      label: 'ใบสำคัญจ่าย', en: 'Payment Voucher', group: 'biz', prefix: 'PV', icon: 'banknote',
      roles: ['agency', 'corporate'], mode: 'voucher',
      desc: { agency: 'บันทึก/อนุมัติการจ่ายค่าจ้าง Influencer', corporate: 'บันทึก/อนุมัติการจ่ายเงิน' },
      hint: 'เอกสารภายในของ "ผู้จ่ายเงิน" ถ้ามีหักภาษี ณ ที่จ่าย ให้ออกหนังสือรับรอง (50 ทวิ) ต่อจากใบสำคัญจ่ายนี้ และข้อมูลจะถูกรวมใน ภ.ง.ด.3/53',
      issuerTitle: 'ผู้จ่ายเงิน',
      party: { title: 'ผู้รับเงิน', role: 'ผู้รับเงิน', kinds: ['influencer', 'agency', 'other', 'brand'],
        keys: ['entityType', 'name', 'address', 'taxId', 'bankName', 'bankAccountNo', 'bankAccountName'], required: ['name'] },
      meta: [
        f('payDate', 'วันที่จ่ายเงิน', 'date', { required: true, def: 'today', docDate: true }),
        f('campaignName', 'ชื่อแคมเปญ (Campaign)', 'text', { help: 'เลือกแคมเปญที่เคยใช้ในเอกสารก่อนหน้า หรือพิมพ์ชื่อใหม่' }),
        f('contractRef', 'อ้างอิงสัญญา (ถ้ามี)', 'docref', { from: ['CONTRACT_INF', 'CONTRACT_BRAND'] }),
      ],
      items: { title: 'รายละเอียดการจ่าย (ค่าจ้าง/บริการ)', cols: ['docDate', 'docNo', 'name', 'amount'] },
      sections: [
        { title: 'ภาษีหัก ณ ที่จ่าย', fields: [
          f('hasWht', 'มีการหักภาษี ณ ที่จ่าย', 'checkbox', { def: true }),
          f('incomeCode', 'ประเภทเงินได้', 'select', { options: INCOME_TYPES.map((t) => ({ value: t.code, label: t.label })), def: '5', showIf: ['hasWht', true], requiredIf: ['hasWht', true] }),
          f('incomeDesc', 'ระบุประเภทเงินได้', 'text', { def: 'ค่าบริการ', showIf: ['hasWht', true], requiredIf: ['hasWht', true], presets: true }),
          f('whtRate', 'อัตราหัก ณ ที่จ่าย (%)', 'select', { options: WHT_RATES.map((r) => ({ value: String(r), label: r + '%' })), def: '3', showIf: ['hasWht', true], requiredIf: ['hasWht', true] }),
          f('whtCondition', 'เงื่อนไขการหักภาษี', 'select', { options: WHT_CONDITIONS, def: '1', showIf: ['hasWht', true] }),
        ] },
        { title: 'วิธีจ่ายเงิน', fields: [
          f('payMethod', 'วิธีจ่าย', 'radio', { options: PAY_METHODS, required: true, def: 'transfer' }),
          f('payBank', 'ธนาคาร (ของผู้จ่าย)', 'text', { showIf: ['payMethod', ['transfer', 'cheque']], def: 'me.bank.bankName' }),
          f('payBankBranch', 'สาขา', 'text', { showIf: ['payMethod', 'cheque'] }),
          f('chequeNo', 'เลขที่เช็ค', 'text', { showIf: ['payMethod', 'cheque'], requiredIf: ['payMethod', 'cheque'] }),
          f('chequeDate', 'เช็คลงวันที่', 'date', { showIf: ['payMethod', 'cheque'] }),
          f('transferRef', 'เลขอ้างอิงการโอน', 'text', { showIf: ['payMethod', 'transfer'] }),
          f('payMethodOther', 'ระบุวิธีอื่น', 'text', { showIf: ['payMethod', 'other'], requiredIf: ['payMethod', 'other'] }),
        ] },
        { title: 'การอนุมัติ', fields: [
          f('preparedBy', 'ผู้จัดทำ', 'text', { required: true, def: 'me.signer' }),
          f('approvedBy', 'ผู้อนุมัติ', 'text'),
          f('paidBy', 'ผู้จ่ายเงิน', 'text'),
          f('note', 'หมายเหตุ', 'textarea'),
        ] },
      ],
    },

    /* ---------------- 8) สัญญากับ Brand ---------------- */
    CONTRACT_BRAND: {
      label: 'สัญญากับ Brand', en: 'Service Agreement (Agency – Brand)', group: 'contract', prefix: 'CTB', icon: 'handshake',
      roles: ['agency'], mode: 'contract',
      desc: { agency: 'สัญญารับจ้างบริหาร Campaign กับ Brand' },
      hint: 'สัญญาจ้างทำของตามประมวลกฎหมายแพ่งและพาณิชย์ เงื่อนไขควรสอดคล้องกับสัญญาที่ทำกับ Influencer',
      issuerTitle: 'คู่สัญญาฝ่ายที่ 1 (Agency)',
      party: { title: 'คู่สัญญาฝ่ายที่ 2 (Brand)', role: 'คู่สัญญาฝ่ายที่ 2 (Brand)', kinds: ['brand', 'other'],
        keys: ['name', 'taxId', 'branch', 'address', 'authName', 'authPosition', 'phone', 'email'], required: ['name', 'address', 'authName'] },
      meta: [
        f('contractDate', 'วันที่ทำสัญญา', 'date', { required: true, def: 'today', docDate: true }),
        f('startDate', 'วันที่เริ่มต้น', 'date', { required: true }),
        f('endDate', 'วันที่สิ้นสุด', 'date', { required: true, min: 'startDate' }),
        f('place', 'สถานที่ทำสัญญา (จังหวัด)', 'text', { def: 'me.province', help: 'จังหวัดที่ลงนามสัญญา จะพิมพ์บนหัวสัญญาว่า "ทำที่ ..." เลือกจากรายการหรือพิมพ์เองได้' }),
      ],
      sections: [
        { title: 'รายละเอียดงาน', fields: [
          f('campaignName', 'ชื่อแคมเปญ (Campaign)', 'text', { required: true, help: 'เลือกแคมเปญที่เคยใช้ในเอกสารก่อนหน้า หรือพิมพ์ชื่อใหม่' }),
          f('objective', 'วัตถุประสงค์', 'textarea', { required: true }),
          f('scope', 'ขอบเขตงาน', 'textarea', { required: true, placeholder: 'เช่น วางแผนแคมเปญ คัดเลือกและประสานงาน Influencer ตรวจชิ้นงาน และสรุปรายงานผล' }),
          f('influencerCount', 'จำนวน Influencer', 'number', { int: true, min0: 1, max: 1000 }),
          f('workPeriod', 'ระยะเวลาดำเนินงาน', 'text', { placeholder: 'เช่น 60 วันนับจากวันเริ่มสัญญา' }),
        ] },
        { title: 'ค่าตอบแทน', fields: [
          f('fee', 'มูลค่างาน (ก่อน VAT)', 'money', { required: true, max: 1e10 }),
          f('includeVat', 'คิดภาษีมูลค่าเพิ่ม 7%', 'checkbox', { vatGate: true }),
          f('hasWht', 'Brand หักภาษี ณ ที่จ่าย', 'checkbox', { def: false, whtGate: true }),
          f('whtRate', 'อัตราหัก ณ ที่จ่าย', 'select', { def: '3', showIf: ['hasWht', true], options: WHT_RATES.map((r) => ({ value: String(r), label: r + '%' })) }),
        ] },
      ],
      items: { title: 'งวดการชำระเงิน', cols: ['name', 'amount', 'dueDate'], optional: true, installments: true },
      sectionsAfter: [
        { title: 'เงื่อนไข', fields: [
          f('revisionTerms', 'การแก้ไขงาน', 'textarea', { def: DEFAULT_TERMS.revision }),
          f('cancelTerms', 'การยกเลิกงาน', 'textarea', { def: DEFAULT_TERMS.cancel }),
          f('confidentialTerms', 'การรักษาความลับ', 'textarea', { def: DEFAULT_TERMS.confidential }),
          f('contentRights', 'สิทธิในการใช้ Content', 'textarea', { def: DEFAULT_TERMS.rights }),
          f('breachTerms', 'การผิดสัญญา', 'textarea', { def: DEFAULT_TERMS.breach }),
        ] },
        { title: 'การลงนาม', fields: [
          f('sign1Name', 'ผู้ลงนามฝ่ายที่ 1 (Agency)', 'text', { required: true, def: 'me.signer' }),
          f('sign1Position', 'ตำแหน่ง', 'text', { def: 'me.authPosition' }),
          f('sign2Name', 'ผู้ลงนามฝ่ายที่ 2 (Brand)', 'text', { required: true, def: 'party.authName' }),
          f('sign2Position', 'ตำแหน่ง', 'text', { def: 'party.authPosition' }),
          f('signDate', 'วันที่ลงนาม', 'date', { def: 'today' }),
          f('witness1', 'พยาน คนที่ 1 (ถ้ามี)', 'text'),
          f('witness2', 'พยาน คนที่ 2 (ถ้ามี)', 'text'),
        ] },
      ],
    },

    /* ---------------- 9) สัญญาจ้าง Influencer ---------------- */
    CONTRACT_INF: {
      label: 'สัญญาจ้าง Influencer', en: 'Influencer Agreement', group: 'contract', prefix: 'CTR', icon: 'pen',
      roles: ['agency', 'corporate'], mode: 'contract',
      desc: { agency: 'Agency ว่าจ้าง Influencer', corporate: 'Brand ว่าจ้าง Influencer โดยตรง' },
      hint: 'สัญญาจ้างทำของ ระบุ Brief จำนวน Content วันส่งงาน/วันโพสต์ และสิทธิการใช้ Content ให้ชัด ผู้ว่าจ้างมีหน้าที่หักภาษี ณ ที่จ่ายและออก 50 ทวิ',
      issuerTitle: 'ผู้ว่าจ้าง',
      party: { title: 'ผู้รับจ้าง (Influencer)', role: 'ผู้รับจ้าง (Influencer)', kinds: ['influencer', 'other'],
        keys: ['name', 'channelName', 'taxId', 'address', 'phone', 'email', 'bankName', 'bankAccountNo', 'bankAccountName', 'socials'],
        required: ['name', 'taxId', 'address', 'bankName', 'bankAccountNo'],
        labels: { name: 'ชื่อ-นามสกุล', taxId: 'เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน' } },
      meta: [
        f('contractDate', 'วันที่ทำสัญญา', 'date', { required: true, def: 'today', docDate: true }),
        f('startDate', 'วันเริ่มงาน', 'date', { required: true }),
        f('endDate', 'วันสิ้นสุดงาน', 'date', { required: true, min: 'startDate' }),
        f('place', 'สถานที่ทำสัญญา (จังหวัด)', 'text', { def: 'me.province', help: 'จังหวัดที่ลงนามสัญญา จะพิมพ์บนหัวสัญญาว่า "ทำที่ ..." เลือกจากรายการหรือพิมพ์เองได้' }),
      ],
      sections: [
        { title: 'รายละเอียดงาน', fields: [
          f('campaignName', 'ชื่อแคมเปญ (Campaign)', 'text', { required: true, help: 'เลือกแคมเปญที่เคยใช้ในเอกสารก่อนหน้า หรือพิมพ์ชื่อใหม่' }),
          f('platforms', 'แพลตฟอร์ม', 'checks', { options: PLATFORMS.map((p) => ({ value: p, label: p })), required: true }),
          f('contentType', 'ประเภท Content', 'text', { required: true, placeholder: 'เช่น วิดีโอสั้น 60 วินาที, รูปภาพ Carousel, Live' }),
          f('contentCount', 'จำนวน Content (ชิ้น)', 'number', { required: true, int: true, min0: 1, max: 1000 }),
          f('brief', 'Brief', 'textarea', { required: true }),
          f('hashtags', 'Hashtag', 'text', { placeholder: '#แบรนด์ #แคมเปญ' }),
          f('mentions', 'Tag / Mention', 'text', { placeholder: '@brand_official' }),
          f('submitDate', 'วันที่ต้องส่งงาน (Draft)', 'date', { required: true, min: 'startDate', max: 'endDate' }),
          f('postDate', 'วันที่ต้องโพสต์', 'date', { required: true, min: 'submitDate', max: 'endDate' }),
        ] },
        { title: 'ค่าจ้าง', fields: [
          f('fee', 'ค่าจ้างทั้งหมด (บาท)', 'money', { required: true, max: 1e10 }),
          f('payMethod', 'วิธีชำระเงิน', 'select', { def: 'transfer', options: PAY_METHODS }),
          f('installmentCount', 'จำนวนงวด', 'number', { def: 1, int: true, min0: 1, max: 60 }),
          f('paymentTerms', 'เงื่อนไขการจ่ายเงิน', 'textarea', { required: true, placeholder: 'เช่น ชำระภายใน 15 วันหลังโพสต์ครบและผู้ว่าจ้างตรวจรับงาน' }),
          f('hasWht', 'หักภาษี ณ ที่จ่าย', 'checkbox', { def: false, whtGate: true }),
          f('whtRate', 'อัตราหัก ณ ที่จ่าย', 'select', { def: '3', showIf: ['hasWht', true], options: WHT_RATES.map((r) => ({ value: String(r), label: r + '%' })) }),
        ] },
      ],
      items: { title: 'งวดการชำระเงิน (ถ้าแบ่งจ่าย)', cols: ['name', 'amount', 'dueDate'], optional: true, installments: true },
      sectionsAfter: [
        { title: 'เงื่อนไข Content', fields: [
          f('revisionRounds', 'จำนวนครั้งที่แก้ไขได้', 'number', { def: 2, int: true, min0: 0, max: 20 }),
          f('publishDuration', 'ระยะเวลาเผยแพร่', 'text', { def: 'ไม่น้อยกว่า 90 วันนับจากวันที่โพสต์' }),
          f('contentRights', 'สิทธิในการใช้ Content', 'textarea', { def: DEFAULT_TERMS.rights }),
          f('removalTerms', 'การลบ Content', 'textarea', { def: DEFAULT_TERMS.removal }),
          f('cancelTerms', 'การยกเลิกงาน', 'textarea', { def: DEFAULT_TERMS.cancel }),
        ] },
        { title: 'การลงนาม', fields: [
          f('sign1Name', 'ผู้ลงนามฝ่ายผู้ว่าจ้าง', 'text', { required: true, def: 'me.signer' }),
          f('sign1Position', 'ตำแหน่ง', 'text', { def: 'me.authPosition' }),
          f('sign2Name', 'ผู้ลงนามฝ่ายผู้รับจ้าง', 'text', { required: true, def: 'party.name' }),
          f('signDate', 'วันที่ลงนาม', 'date', { def: 'today' }),
          f('witness1', 'พยาน คนที่ 1 (ถ้ามี)', 'text'),
          f('witness2', 'พยาน คนที่ 2 (ถ้ามี)', 'text'),
        ] },
      ],
    },

    /* ---------------- 10) หนังสือมอบอำนาจ ---------------- */
    POA: {
      label: 'หนังสือมอบอำนาจ', en: 'Power of Attorney', group: 'contract', prefix: 'POA', icon: 'scroll',
      roles: ['corporate', 'agency'], mode: 'poa', noParty: true,
      desc: { corporate: 'มอบอำนาจให้บุคคลดำเนินการแทน', agency: 'เตรียมหนังสือมอบอำนาจให้ลูกค้าลงนาม' },
      hint: 'ผู้มอบและผู้รับมอบต้องลงลายมือชื่อ (นิติบุคคล: กรรมการผู้มีอำนาจ + ตราประทับถ้าข้อบังคับกำหนด) ติดอากรแสตมป์ 10 บาท (ครั้งเดียว) / 30 บาท (มากกว่าครั้งเดียว)',
      meta: [
        f('issueDate', 'วันที่', 'date', { required: true, def: 'today', docDate: true }),
        f('place', 'สถานที่เขียนหนังสือ (จังหวัด)', 'text', { def: 'me.province', help: 'จะพิมพ์บนหัวหนังสือว่า "เขียนที่ ..." เลือกจากรายการหรือพิมพ์เองได้' }),
        f('issuerIs', 'คุณเป็นฝ่ายใดในหนังสือนี้', 'radio', { required: true, def: 'grantor', options: [{ value: 'grantor', label: 'ผู้มอบอำนาจ' }, { value: 'grantee', label: 'ผู้รับมอบอำนาจ / ผู้จัดเตรียม' }] }),
      ],
      sections: [
        { title: 'ผู้มอบอำนาจ', fill: 'grantor', fields: [
          f('grantorType', 'ประเภท', 'radio', { required: true, def: 'juristic', options: [{ value: 'juristic', label: 'นิติบุคคล' }, { value: 'individual', label: 'บุคคลธรรมดา' }] }),
          f('grantorName', 'ชื่อ', 'text', { required: true, minLen: 2, maxLen: 200 }),
          f('grantorIdNo', 'เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน', 'taxid', { required: true }),
          f('grantorAddress', 'ที่อยู่', 'textarea', { required: true, minLen: 10, maxLen: 500 }),
          f('grantorAuthName', 'ชื่อกรรมการผู้มีอำนาจลงนาม', 'text', { showIf: ['grantorType', 'juristic'], requiredIf: ['grantorType', 'juristic'] }),
          f('grantorPosition', 'ตำแหน่ง', 'text', { showIf: ['grantorType', 'juristic'], requiredIf: ['grantorType', 'juristic'] }),
        ] },
        { title: 'ผู้รับมอบอำนาจ', fill: 'grantee', fields: [
          f('granteeName', 'ชื่อ-นามสกุล', 'text', { required: true, minLen: 4, maxLen: 200 }),
          f('granteeCitizenId', 'เลขประจำตัวประชาชน', 'citizenid', { required: true }),
          f('granteeAddress', 'ที่อยู่', 'textarea', { required: true, minLen: 10, maxLen: 500 }),
        ] },
        { title: 'รายละเอียดการมอบอำนาจ', fields: [
          f('powers', 'เรื่องที่มอบอำนาจ', 'checks', { options: [
            { value: 'docs', label: 'ดำเนินการแทนเกี่ยวกับเอกสาร' },
            { value: 'contact', label: 'ติดต่อคู่ค้า' },
            { value: 'sendrecv', label: 'รับ/ส่งเอกสาร' },
            { value: 'contract', label: 'ดำเนินการตามสัญญา' },
          ] }),
          f('scopeDetail', 'รายละเอียดเพิ่มเติม / ขอบเขตอำนาจ', 'textarea', { placeholder: 'เช่น ในแคมเปญ ... ระหว่างวันที่ ... รวมถึงลงนามรับเอกสารแทน' }),
        ] },
        { title: 'ระยะเวลาและการลงนาม', fields: [
          f('startDate', 'วันที่เริ่มต้น', 'date', { required: true, def: 'today' }),
          f('endDate', 'วันที่สิ้นสุด (เว้นว่าง = จนกว่าจะเพิกถอน)', 'date', { min: 'startDate' }),
          f('actCount', 'อากรแสตมป์', 'select', { def: 'many', options: [{ value: 'once', label: 'กระทำการครั้งเดียว (10 บาท)' }, { value: 'many', label: 'กระทำการมากกว่าครั้งเดียว (30 บาท)' }] }),
          f('witness1', 'พยาน คนที่ 1', 'text'),
          f('witness2', 'พยาน คนที่ 2', 'text'),
        ] },
      ],
    },

    /* ---------------- 11) หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ---------------- */
    EWHT: {
      label: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)', short: '50 ทวิ', en: 'Withholding Tax Certificate', group: 'tax', prefix: 'WHT', icon: 'calc',
      roles: ['agency', 'corporate'], mode: 'wht',
      desc: { agency: 'ออกให้ผู้ถูกหักภาษี ดึงจากใบสำคัญจ่ายได้', corporate: 'ออกให้ผู้ถูกหักภาษี ดึงจากใบสำคัญจ่ายได้' },
      hint: 'ผู้มีหน้าที่หักภาษีต้องออกหนังสือรับรองให้ผู้ถูกหักตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร แนะนำให้ "ดึงจากใบสำคัญจ่าย" เพื่อให้ตัวเลขตรงกับการจ่ายจริง',
      issuerTitle: 'ผู้มีหน้าที่หักภาษี ณ ที่จ่าย',
      party: { title: 'ผู้ถูกหักภาษี ณ ที่จ่าย', role: 'ผู้ถูกหักภาษี ณ ที่จ่าย', kinds: ['influencer', 'agency', 'brand', 'other'],
        keys: ['entityType', 'name', 'taxId', 'address'], required: ['name', 'taxId', 'address'],
        labels: { name: 'ชื่อ-นามสกุล หรือชื่อนิติบุคคล' } },
      meta: [
        f('paymentRef', 'ดึงจากใบสำคัญจ่าย', 'docref', { from: ['PAYMENT'], copy: true, placeholder: 'เลือกใบสำคัญจ่ายที่มีการหักภาษี' }),
        f('issueDate', 'วันที่ออกเอกสาร', 'date', { required: true, def: 'today', docDate: true, min: 'payDate' }),
        f('bookNo', 'เล่มที่ (ถ้ามี)', 'text'),
      ],
      sections: [
        { title: 'รายละเอียดเงินได้', fields: [
          f('payDate', 'วันที่จ่ายเงิน', 'date', { required: true, notFuture: true }),
          f('incomeCode', 'ประเภทเงินได้', 'select', { required: true, def: '5', options: INCOME_TYPES.map((t) => ({ value: t.code, label: t.label })) }),
          f('incomeDesc', 'ระบุประเภทเงินได้', 'text', { def: 'ค่าบริการ', requiredIf: ['incomeCode', ['5', '6']], presets: true }),
          f('amount', 'จำนวนเงินที่จ่าย (ก่อนหักภาษี)', 'money', { required: true, max: 1e10 }),
          f('whtRate', 'อัตราภาษี (%)', 'select', { required: true, def: '3', options: WHT_RATES.map((r) => ({ value: String(r), label: r + '%' })) }),
          f('whtCondition', 'เงื่อนไขการหักภาษี', 'select', { required: true, def: '1', options: WHT_CONDITIONS }),
          f('pndForm', 'ลำดับที่ในแบบ (ยื่นใน)', 'select', { required: true, def: 'auto', options: [{ value: 'auto', label: 'เลือกอัตโนมัติตามผู้ถูกหัก' }, ...PND_FORMS] }),
          f('seqInForm', 'ลำดับที่ในใบแนบ (ถ้ามี)', 'text'),
        ] },
        { title: 'ข้อมูลเอกสาร', fields: [
          f('taxYear', 'ปีภาษี (พ.ศ.)', 'number', { auto: 'payDateBE', int: true, min0: 2500, max: 2700 }),
          f('signerName', 'ผู้ลงนาม (ผู้จ่ายเงิน)', 'text', { required: true, def: 'me.signer' }),
          f('signerPosition', 'ตำแหน่ง', 'text', { def: 'me.authPosition' }),
        ] },
      ],
    },

    /* ---------------- 12) ภ.ง.ด.3 ---------------- */
    PND3: {
      label: 'จัดทำข้อมูล ภ.ง.ด.3', short: 'ภ.ง.ด.3', en: 'P.N.D.3 data preparation', group: 'tax', prefix: 'PND3', icon: 'book',
      roles: ['agency', 'corporate'], mode: 'pnd', pndOf: 'PND3', noParty: true, noSend: true,
      desc: { agency: 'รวมรายการหักภาษีที่จ่ายให้บุคคลธรรมดา', corporate: 'รวมรายการหักภาษีที่จ่ายให้บุคคลธรรมดา' },
      hint: 'ภ.ง.ด.3 = แบบยื่นรายการภาษีหัก ณ ที่จ่าย กรณีจ่ายเงินได้ให้ "บุคคลธรรมดา" (มาตรา 59) ระบบรวบรวมและจัดเตรียมข้อมูลจากใบสำคัญจ่าย + 50 ทวิ เท่านั้น การยื่นจริงทำผ่าน e-Filing ของกรมสรรพากร ภายในวันที่ 7 (กระดาษ) / 15 (ออนไลน์) ของเดือนถัดไป',
      issuerTitle: 'ผู้มีหน้าที่หักภาษี ณ ที่จ่าย',
      sections: [
        { title: 'ข้อมูลการยื่น', fields: [
          f('taxMonth', 'เดือนภาษี (เดือนที่จ่ายเงินได้)', 'select', { required: true, def: 'lastMonth', options: THAI_MONTHS.map((m, i) => ({ value: String(i + 1), label: m })) }),
          f('taxYearBE', 'ปีภาษี (พ.ศ.)', 'number', { required: true, def: 'thisYearBE', int: true, min0: 2500, max: 2700 }),
          f('filingType', 'ประเภทการยื่น', 'radio', { required: true, def: 'normal', options: [{ value: 'normal', label: 'ยื่นปกติ' }, { value: 'additional', label: 'ยื่นเพิ่มเติม' }] }),
          f('filingSeq', 'ยื่นเพิ่มเติมครั้งที่', 'number', { showIf: ['filingType', 'additional'], requiredIf: ['filingType', 'additional'], int: true, min0: 1, max: 99 }),
          f('branchNo', 'สาขาที่ (5 หลัก)', 'text', { def: 'me.branchNo', fmt: 'digits5' }),
          f('remitUnder', 'นำส่งภาษีตาม', 'checks', { required: true, def: ['s3tres'], options: [
            { value: 's3tres', label: '(1) มาตรา 3 เตรส' }, { value: 's48bis', label: '(2) มาตรา 48 ทวิ' }, { value: 's50', label: '(3) มาตรา 50 (3) (4) (5)' }] }),
        ] },
      ],
      items: { title: 'รายการผู้ถูกหักภาษี (ดึงจากใบสำคัญจ่าย + 50 ทวิ)', cols: ['payeeName', 'payeeTaxId', 'payeeAddress', 'payDate', 'incomeDesc', 'rate', 'amount', 'wht', 'condition'], pnd: true },
      sectionsAfter: [
        { title: 'สรุปและการรับรอง', fields: [
          f('surcharge', 'เงินเพิ่ม (ถ้ามี)', 'money', { max: 1e9 }),
          f('signerName', 'ลงชื่อผู้จ่ายเงิน', 'text', { required: true, def: 'me.signer' }),
          f('signerPosition', 'ตำแหน่ง', 'text', { def: 'me.authPosition' }),
          f('filingDate', 'ยื่นวันที่', 'date', { def: 'today' }),
        ] },
      ],
    },

    /* ---------------- 13) ภ.ง.ด.53 ---------------- */
    PND53: {
      label: 'จัดทำข้อมูล ภ.ง.ด.53', short: 'ภ.ง.ด.53', en: 'P.N.D.53 data preparation', group: 'tax', prefix: 'PND53', icon: 'book',
      roles: ['agency', 'corporate'], mode: 'pnd', pndOf: 'PND53', noParty: true, noSend: true,
      desc: { agency: 'รวมรายการหักภาษีที่จ่ายให้นิติบุคคล', corporate: 'รวมรายการหักภาษีที่จ่ายให้นิติบุคคล' },
      hint: 'ภ.ง.ด.53 = แบบยื่นรายการภาษีหัก ณ ที่จ่าย กรณีจ่ายเงินได้ให้ "นิติบุคคล" (มาตรา 3 เตรส และมาตรา 69 ทวิ) ระบบจัดเตรียมข้อมูลเท่านั้น ไม่ได้ยื่นแทนกรมสรรพากร',
      issuerTitle: 'ผู้มีหน้าที่หักภาษี ณ ที่จ่าย',
      sections: [
        { title: 'ข้อมูลการยื่น', fields: [
          f('taxMonth', 'เดือนภาษี (เดือนที่จ่ายเงินได้)', 'select', { required: true, def: 'lastMonth', options: THAI_MONTHS.map((m, i) => ({ value: String(i + 1), label: m })) }),
          f('taxYearBE', 'ปีภาษี (พ.ศ.)', 'number', { required: true, def: 'thisYearBE', int: true, min0: 2500, max: 2700 }),
          f('filingType', 'ประเภทการยื่น', 'radio', { required: true, def: 'normal', options: [{ value: 'normal', label: 'ยื่นปกติ' }, { value: 'additional', label: 'ยื่นเพิ่มเติม' }] }),
          f('filingSeq', 'ยื่นเพิ่มเติมครั้งที่', 'number', { showIf: ['filingType', 'additional'], requiredIf: ['filingType', 'additional'], int: true, min0: 1, max: 99 }),
          f('branchNo', 'สาขาที่ (5 หลัก)', 'text', { def: 'me.branchNo', fmt: 'digits5' }),
          f('remitUnder', 'นำส่งภาษีตาม', 'checks', { required: true, def: ['s3tres'], options: [
            { value: 's3tres', label: '(1) มาตรา 3 เตรส' }, { value: 's65bis', label: '(2) มาตรา 65 จัตวา' }, { value: 's69bis', label: '(3) มาตรา 69 ทวิ' }] }),
        ] },
      ],
      items: { title: 'รายการผู้ถูกหักภาษี (นิติบุคคล)', cols: ['payeeName', 'payeeTaxId', 'payeeBranch', 'payeeAddress', 'payDate', 'incomeDesc', 'rate', 'amount', 'wht', 'condition'], pnd: true },
      sectionsAfter: [
        { title: 'สรุปและการรับรอง', fields: [
          f('surcharge', 'เงินเพิ่ม (ถ้ามี)', 'money', { max: 1e9 }),
          f('signerName', 'ลงชื่อผู้จ่ายเงิน', 'text', { required: true, def: 'me.signer' }),
          f('signerPosition', 'ตำแหน่ง', 'text', { def: 'me.authPosition' }),
          f('filingDate', 'ยื่นวันที่', 'date', { def: 'today' }),
        ] },
      ],
    },

    /* ---------------- 13) ใบกำกับภาษีอิเล็กทรอนิกส์ (WP5) ----------------
     * รายการที่ต้องปรากฏบนใบกำกับภาษีแบบเต็มรูป กำหนดไว้ในมาตรา 86/4 แห่งประมวลรัษฎากร
     * ระบบจึงบังคับกรอกให้ครบทุกรายการ ไม่ปล่อยให้ออกเอกสารที่ขาดรายการตามกฎหมาย
     * ออกได้เฉพาะผู้จดทะเบียนภาษีมูลค่าเพิ่มเท่านั้น (requiresVat)
     */
    ETAX_INVOICE: {
      label: 'ใบกำกับภาษีอิเล็กทรอนิกส์', short: 'ใบกำกับภาษี', en: 'e-Tax Invoice',
      group: 'tax', prefix: 'TIV', icon: 'invoice',
      roles: ['agency', 'corporate', 'creator'], mode: 'priced', requiresVat: true, etax: 'TIV',
      desc: {
        agency: 'ใบกำกับภาษีแบบเต็มรูปสำหรับผู้จด VAT',
        corporate: 'ใบกำกับภาษีแบบเต็มรูปสำหรับผู้จด VAT',
        creator: 'ใบกำกับภาษีแบบเต็มรูป ออกได้เมื่อจดทะเบียน VAT แล้ว',
      },
      hint: 'ออกได้เฉพาะผู้ประกอบการที่จดทะเบียนภาษีมูลค่าเพิ่มแล้ว ระบบสร้างไฟล์ PDF/A-3 ที่มีไฟล์ XML แนบอยู่ภายใน '
        + 'ตามโครงสร้างของ ETDA (ขมธอ. 3-2560) เพื่อสาธิตกระบวนการเท่านั้น ยังไม่ได้ยื่นคำขอจัดทำกับกรมสรรพากร',
      issuerTitle: 'ผู้ประกอบการจดทะเบียน (ผู้ขาย)',
      party: {
        title: 'ผู้ซื้อสินค้าหรือผู้รับบริการ', role: 'ผู้ซื้อ',
        kinds: ['brand', 'agency', 'other'],
        keys: ['name', 'taxId', 'branch', 'address', 'contactPerson', 'phone', 'email'],
        // มาตรา 86/4 (3) บังคับให้มีชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีของผู้ซื้อ
        required: ['name', 'taxId', 'address'],
      },
      meta: [
        f('issueDate', 'วันเดือนปีที่ออกใบกำกับภาษี', 'date', { required: true, def: 'today', docDate: true, notFuture: true }),
        f('volumeNo', 'เล่มที่', 'text', { placeholder: 'เว้นว่างได้ถ้าไม่ได้ออกเป็นเล่ม' }),
        f('invoiceRef', 'อ้างอิงใบแจ้งหนี้', 'docref', { from: ['INVOICE'], copy: true }),
        f('poRef', 'อ้างอิงใบสั่งซื้อ (PO)', 'text'),
      ],
      items: { title: 'รายการสินค้าหรือบริการ', cols: ['name', 'qty', 'unit', 'price', 'discount'], vat: 'issuer', vatAlways: true, billDiscount: true },
      sections: [
        { title: 'ข้อมูลเพิ่มเติม', fields: [
          f('paymentTerms', 'เงื่อนไขการชำระเงิน', 'text', { placeholder: 'เช่น ชำระภายใน 30 วันนับจากวันที่ออกใบกำกับภาษี' }),
          f('note', 'หมายเหตุ', 'textarea'),
        ] },
      ],
    },

    /* ---------------- 14) ใบรับอิเล็กทรอนิกส์ (WP5) ----------------
     * ใบรับตามมาตรา 105 ทวิ ในรูปแบบอิเล็กทรอนิกส์ ออกเมื่อได้รับชำระเงินแล้วจริง
     * ต่างจาก RECEIPT เดิมตรงที่ฉบับนี้สร้างเป็น PDF/A-3 พร้อม XML แนบและลงลายมือชื่อดิจิทัล
     */
    ETAX_RECEIPT: {
      label: 'ใบรับอิเล็กทรอนิกส์', short: 'ใบรับ (e-Receipt)', en: 'e-Receipt',
      group: 'tax', prefix: 'ERC', icon: 'receipt',
      roles: ['agency', 'corporate', 'creator'], mode: 'amount', requiresVat: true, etax: 'ERC',
      desc: {
        agency: 'ใบรับอิเล็กทรอนิกส์เมื่อได้รับชำระเงิน',
        corporate: 'ใบรับอิเล็กทรอนิกส์เมื่อได้รับชำระเงิน',
        creator: 'ใบรับอิเล็กทรอนิกส์ ออกได้เมื่อจดทะเบียน VAT แล้ว',
      },
      hint: 'ใบรับตามมาตรา 105 ทวิ ในรูปแบบอิเล็กทรอนิกส์ ออกได้เฉพาะเมื่อได้รับเงินแล้วจริง '
        + 'ระบบสร้างเป็นไฟล์ PDF/A-3 พร้อมไฟล์ XML แนบภายใน เพื่อสาธิตกระบวนการเท่านั้น',
      issuerTitle: 'ผู้รับเงิน (ผู้ประกอบการจดทะเบียน)',
      party: {
        title: 'ผู้จ่ายเงิน', role: 'ผู้จ่ายเงิน',
        kinds: ['brand', 'agency', 'other'],
        keys: ['name', 'taxId', 'branch', 'address', 'phone', 'email'],
        required: ['name', 'taxId', 'address'],
      },
      meta: [
        f('receiveDate', 'วันที่รับเงิน', 'date', { required: true, def: 'today', docDate: true, notFuture: true }),
        f('taxInvoiceRef', 'อ้างอิงใบกำกับภาษี', 'docref', { from: ['ETAX_INVOICE'], copy: true }),
      ],
      items: { title: 'รายการรับเงิน', cols: ['name', 'amount'], vat: 'issuer', vatAlways: true },
      sections: [
        { title: 'วิธีชำระเงิน', fields: [
          f('payMethod', 'วิธีชำระเงิน', 'radio', { options: PAY_METHODS, required: true, def: 'transfer' }),
          f('payMethodOther', 'ระบุวิธีอื่น', 'text', { showIf: ['payMethod', 'other'], requiredIf: ['payMethod', 'other'] }),
          f('payDate', 'วันที่ชำระ', 'date', { required: true, def: 'today', notFuture: true, max: 'receiveDate' }),
          f('transferRef', 'เลขอ้างอิงการโอน / เลขที่เช็ค', 'text', { showIf: ['payMethod', ['transfer', 'cheque']] }),
          f('payBank', 'ธนาคาร', 'text', { showIf: ['payMethod', ['transfer', 'cheque']] }),
          f('note', 'หมายเหตุ', 'textarea'),
        ] },
      ],
    },
  };

  // คอลัมน์ในตารางรายการ
  const ITEM_COLS = {
    name: { label: 'รายละเอียด', type: 'text', required: true, width: 'wide', maxLen: 500 },
    qty: { label: 'จำนวน', type: 'number', def: 1, gt0: true, max: 1e6 },
    unit: { label: 'หน่วย', type: 'text', def: 'งาน', maxLen: 30, noDigits: true },
    price: { label: 'ราคาต่อหน่วย', type: 'money', max: 1e10 },
    discount: { label: 'ส่วนลด', type: 'money', max: 1e10 },
    amount: { label: 'จำนวนเงิน', type: 'money', max: 1e10 },
    dueDate: { label: 'วันครบกำหนด', type: 'date' },
    docDate: { label: 'วันที่เอกสาร', type: 'date', notFuture: true },
    docNo: { label: 'เลขที่เอกสาร', type: 'text', maxLen: 40 },
    influencer: { label: 'ชื่อ Influencer', type: 'text', required: true, maxLen: 200 },
    contentType: { label: 'ประเภท Content', type: 'text', required: true, maxLen: 100 },
    platform: { label: 'แพลตฟอร์ม', type: 'select', options: PLATFORMS },
    pieces: { label: 'จำนวนชิ้นงาน', type: 'number', def: 1, int: true, min0: 1, max: 10000 },
    link: { label: 'ลิงก์ผลงาน', type: 'text', fmt: 'url', maxLen: 500 },
    publishDate: { label: 'วันที่เผยแพร่', type: 'date' },
    itemStatus: { label: 'สถานะ', type: 'select', options: ['เผยแพร่แล้ว', 'รอเผยแพร่', 'รอตรวจสอบ', 'ขอแก้ไข'] },
    payeeName: { label: 'ชื่อผู้มีเงินได้', type: 'text', required: true, width: 'wide', minLen: 2, maxLen: 200 },
    payeeTaxId: { label: 'เลขประจำตัวผู้เสียภาษี', type: 'taxid', required: true },
    payeeBranch: { label: 'สาขาที่', type: 'text', fmt: 'digits5' },
    payeeAddress: { label: 'ที่อยู่', type: 'text', width: 'wide', maxLen: 500 },
    payDate: { label: 'วันที่จ่าย', type: 'date', required: true, notFuture: true },
    incomeDesc: { label: 'ประเภทเงินได้', type: 'text', required: true, maxLen: 100 },
    rate: { label: 'อัตรา %', type: 'number', required: true, oneOf: WHT_RATES },
    wht: { label: 'ภาษีที่หัก', type: 'money', max: 1e10 },
    condition: { label: 'เงื่อนไข', type: 'select', options: ['1', '2', '3'] },
  };


  /* =========================================================
   * Data Validation กติกาชุดเดียวใช้ทั้งหน้าเว็บและเซิร์ฟเวอร์
   * 1) ค่าว่าง 2) ชนิดข้อมูล 3) ช่วงข้อมูล 4) รูปแบบ 5) ความยาว 6) ข้อมูลที่สัมพันธ์กัน
   * (ข้อมูลซ้ำตรวจที่เซิร์ฟเวอร์เพราะต้องค้นฐานข้อมูล)
   * ========================================================= */
  const FORMAT = {
    email: { re: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, msg: 'รูปแบบไม่ถูกต้อง ต้องเป็นแบบ example@email.com' },
    phone: { test: (v) => /^0\d{8,9}$/.test(v.replace(/[\s\-()]/g, '').replace(/^\+66/, '0')), msg: 'ต้องเป็นตัวเลข 9–10 หลักขึ้นต้นด้วย 0 (ตัวอย่าง 081-234-5678)' },
    url: { re: /^https?:\/\/[^\s/$.?#].[^\s]*$/i, msg: 'ต้องขึ้นต้นด้วย http:// หรือ https://' },
    bankacc: { test: (v) => /^\d{10,15}$/.test(v.replace(/[\s-]/g, '')) && /^[\d\s-]+$/.test(v), msg: 'ต้องเป็นตัวเลข 10–15 หลัก' },
    digits5: { re: /^\d{5}$/, msg: 'ต้องเป็นตัวเลข 5 หลัก (เช่น 00000)' },
    postcode: { re: /^[1-9]\d{4}$/, msg: 'ต้องเป็นตัวเลข 5 หลัก' },
    branch: { test: (v) => /^(สำนักงานใหญ่|สาขา(ที่)?\s*\d{5})$/.test(v.trim()), msg: 'ต้องระบุ "สำนักงานใหญ่" หรือ "สาขาที่ 00001" (เลขสาขา 5 หลัก)' },
  };
  function isValidThaiId(id) {
    if (!/^\d{13}$/.test(id) || /^(\d)\1{12}$/.test(id)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
    return (11 - (sum % 11)) % 10 === Number(id[12]);
  }
  const fmtNum = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  const emptyVal = (v) => v === '' || v == null || (Array.isArray(v) && !v.length) || (typeof v === 'string' && !v.trim());

  /**
   * ตรวจค่าของฟิลด์เดียว คืนข้อความผิดพลาด (ภาษาไทย) หรือ null ถ้าผ่าน
   * ctx = { fields: ค่าฟิลด์อื่นในฟอร์ม (ใช้ตรวจความสัมพันธ์), need: บังคับกรอกไหม, today: 'YYYY-MM-DD', labelOf(key) }
   */
  function checkField(def, raw, ctx = {}) {
    const F = ctx.fields || {};
    const labelOf = ctx.labelOf || ((k) => k);
    const today = ctx.today || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const t = def.type;
    // 1) ค่าว่าง
    if (t === 'checkbox') return null;
    if (emptyVal(raw)) return ctx.need ? (t === 'checks' || t === 'select' || t === 'radio' ? `กรุณาเลือก "${def.label}"` : `กรุณากรอก "${def.label}" (ห้ามเว้นว่าง)`) : null;
    const v = typeof raw === 'string' ? raw.trim() : raw;
    // 2) ชนิดข้อมูล + 3) ช่วงข้อมูล
    if (t === 'number' || t === 'money') {
      const n = typeof v === 'number' ? v : (/^-?\d+(\.\d+)?$/.test(String(v).replace(/,/g, '')) ? Number(String(v).replace(/,/g, '')) : NaN);
      if (!Number.isFinite(n)) return `"${def.label}" ต้องกรอกเป็นตัวเลขเท่านั้น`;
      if (n < 0) return `"${def.label}" ต้องไม่ติดลบ`;
      if (def.int && !Number.isInteger(n)) return `"${def.label}" ต้องเป็นจำนวนเต็ม`;
      if (t === 'money' && Math.round(n * 100) !== n * 100 && Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return `"${def.label}" ทศนิยมได้ไม่เกิน 2 ตำแหน่ง`;
      if ((def.gt0 || (ctx.need && t === 'money')) && !(n > 0)) return `"${def.label}" ต้องมากกว่า 0`;
      if (def.min0 != null && def.max != null && (n < def.min0 || n > def.max)) return `"${def.label}" ต้องอยู่ในช่วง ${fmtNum(def.min0)}–${fmtNum(def.max)}`;
      if (def.min0 != null && n < def.min0) return `"${def.label}" ต้องไม่น้อยกว่า ${fmtNum(def.min0)}`;
      if (def.max != null && n > def.max) return `"${def.label}" ต้องไม่เกิน ${fmtNum(def.max)}`;
      if (def.oneOf && !def.oneOf.includes(n)) return `"${def.label}" ต้องเป็นหนึ่งใน ${def.oneOf.join(', ')}`;
      return null;
    }
    if (t === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(v + 'T00:00:00Z').getTime())) return `"${def.label}" รูปแบบวันที่ไม่ถูกต้อง`;
      const y = Number(v.slice(0, 4));
      if (y < 1990 || y > 2200) return `"${def.label}" ปีต้องเป็น ค.ศ. ในช่วงที่สมเหตุสมผล (ปฏิทินเลือกวันที่)`;
      if (def.notFuture && v > today) return `"${def.label}" ต้องไม่เป็นวันในอนาคต`;
      // 6) ข้อมูลที่สัมพันธ์กัน
      if (def.min && F[def.min] && v < F[def.min]) return `"${def.label}" ต้องไม่มาก่อน "${labelOf(def.min)}"`;
      if (def.max && F[def.max] && v > F[def.max]) return `"${def.label}" ต้องไม่หลัง "${labelOf(def.max)}"`;
      return null;
    }
    if (t === 'taxid' || t === 'citizenid') {
      const d = String(v).replace(/[\s-]/g, '');
      if (!/^\d+$/.test(d)) return `"${def.label}" ต้องเป็นตัวเลขเท่านั้น`;
      if (d.length !== 13) return `"${def.label}" ต้องมี 13 หลัก (กรอกมา ${d.length} หลัก)`;
      if (!isValidThaiId(d)) return `"${def.label}" ไม่ถูกต้อง (หลักตรวจสอบไม่ตรง กรุณาตรวจตัวเลขอีกครั้ง)`;
      if (t === 'citizenid' && /^0/.test(d)) return `"${def.label}" ต้องเป็นเลขประจำตัวประชาชนของบุคคล (ไม่ขึ้นต้นด้วย 0)`;
      return null;
    }
    if (t === 'select' || t === 'radio') {
      const ok = (def.options || []).some((o) => String(typeof o === 'object' ? o.value : o) === String(v));
      return ok ? null : `"${def.label}" ต้องเลือกจากตัวเลือกที่กำหนด`;
    }
    if (t === 'checks') return null;
    // 5) ความยาว
    const s2 = String(v);
    const maxLen = def.maxLen || (t === 'textarea' ? 4000 : 300);
    if (s2.length > maxLen) return `"${def.label}" ยาวเกิน ${fmtNum(maxLen)} ตัวอักษร (กรอกมา ${fmtNum(s2.length)})`;
    if (def.minLen && s2.length < def.minLen) return `"${def.label}" ต้องมีอย่างน้อย ${def.minLen} ตัวอักษร`;
    // 4) รูปแบบข้อมูล
    if (def.fmt && FORMAT[def.fmt]) {
      const r = FORMAT[def.fmt];
      if (!(r.re ? r.re.test(s2) : r.test(s2))) return `"${def.label}" ${r.msg}`;
    }
    return null;
  }

  /**
   * หน่วยนับที่ใช้บ่อยในใบเสนอราคา/ใบแจ้งหนี้/ใบกำกับภาษี (ให้เลือกจากรายการ หรือพิมพ์เองได้ แต่ห้ามเป็นตัวเลข)
   * เรียงตามกลุ่ม: งานบริการ/คอนเทนต์ · เวลา · สินค้าทั่วไป · บรรจุภัณฑ์ · อาหารและเครื่องดื่ม · น้ำหนัก/ปริมาตร/ความยาว · อื่น ๆ
   */
  const UNIT_PRESETS = [
    'งาน', 'รายการ', 'ครั้ง', 'แคมเปญ', 'แพ็กเกจ', 'โปรเจกต์', 'คลิป', 'วิดีโอ', 'โพสต์', 'สตอรี่', 'รีล', 'ไลฟ์', 'ภาพ', 'บทความ', 'งวด', 'สิทธิ์', 'บัญชี', 'ไลเซนส์',
    'ชั่วโมง', 'วัน', 'สัปดาห์', 'เดือน', 'ไตรมาส', 'ปี', 'รอบ', 'เที่ยว',
    'ชิ้น', 'อัน', 'ตัว', 'เครื่อง', 'ชุด', 'เซต', 'คู่', 'โหล', 'ใบ', 'แผ่น', 'เล่ม', 'ฉบับ', 'หน้า', 'ม้วน', 'แท่ง', 'ก้อน', 'เส้น', 'คัน', 'หลัง', 'ห้อง', 'ที่', 'คน', 'ท่าน',
    'กล่อง', 'ลัง', 'แพ็ก', 'ห่อ', 'ถุง', 'ซอง', 'กระสอบ', 'ถัง', 'แกลลอน', 'ขวด', 'กระป๋อง', 'หลอด', 'ตลับ',
    'แก้ว', 'ถ้วย', 'จาน', 'ชาม', 'ปอนด์', 'ลูก', 'ผล', 'หวี', 'ถาด', 'ปิ่นโต',
    'กิโลกรัม', 'กรัม', 'ขีด', 'ตัน', 'ลิตร', 'มิลลิลิตร', 'เมตร', 'เซนติเมตร', 'ตารางเมตร', 'ตารางฟุต', 'ฟุต', 'หลา', 'นิ้ว',
  ];
  const HAS_DIGIT = /[0-9๐-๙]/;

  /** ตรวจทั้งฟอร์มของเอกสาร คืน { fieldErrors: {key: msg}, partyErrors: {key: msg}, itemErrors: [{row, col, msg}], errors: [msg] } */
  function validateDoc(type, data, opts = {}) {
    const d = FORMS[type];
    const out = { fieldErrors: {}, partyErrors: {}, itemErrors: [], errors: [] };
    if (!d) { out.errors.push('ประเภทเอกสารไม่ถูกต้อง'); return out; }
    // เอกสารกลุ่ม e-Tax ออกได้เฉพาะผู้จดทะเบียนภาษีมูลค่าเพิ่ม (ภาคผนวก ก.1 ของแผน ver18)
    // ตรวจเฉพาะเมื่อผู้เรียกส่ง vatRegistered มาให้ เพื่อไม่ให้หน้าเว็บที่ยังไม่รู้สถานะขึ้น error ค้างไว้
    if (d.requiresVat && opts.vatRegistered === false) {
      out.errors.push('ออก' + d.label + 'ได้เฉพาะผู้ประกอบการที่จดทะเบียนภาษีมูลค่าเพิ่มแล้ว');
      out.vatRequired = true;
    }
    const F = data.fields || {};
    const defs = allFields(type);
    const labelOf = (k) => { const x = defs.find((z) => z.key === k); return x ? x.label : k; };
    const today = opts.today;
    for (const def of defs) {
      if (def.showIf && !matchCond(def.showIf, F)) continue;
      const need = !!(def.required || (def.requiredIf && matchCond(def.requiredIf, F)));
      const m = checkField(def, F[def.key], { fields: F, need, today, labelOf });
      if (m) { out.fieldErrors[def.key] = m; out.errors.push(m); }
    }
    if (d.items && d.items.billDiscount) {
      const m = checkField({ label: 'ส่วนลดท้ายบิล', type: 'money', max: 1e10 }, F.billDiscount, {});
      if (m) { out.fieldErrors.billDiscount = m; out.errors.push(m); }
    }
    if (d.party) {
      const P = data.party || {};
      for (const k of d.party.keys) {
        const def = { ...PARTY_FIELDS[k], label: (d.party.labels && d.party.labels[k]) || PARTY_FIELDS[k].label };
        const m = checkField(def, P[k], { need: d.party.required.includes(k), today });
        if (m) { const msg = `${d.party.role}: ${m}`; out.partyErrors[k] = m; out.errors.push(msg); }
      }
    }
    if (d.items) {
      const rows = data.items || [];
      if (!d.items.optional && !rows.length) out.errors.push(`กรุณาเพิ่ม${d.items.title} อย่างน้อย 1 รายการ`);
      rows.forEach((it, i) => {
        for (const c of d.items.cols) {
          const def = ITEM_COLS[c];
          const m = checkField(def, it[c], { need: !!def.required, today });
          if (m) { out.itemErrors.push({ row: i, col: c, msg: m }); out.errors.push(`รายการที่ ${i + 1}: ${m}`); }
        }
        if (d.items.cols.includes('unit') && HAS_DIGIT.test(String(it.unit || ''))) {
          const m = '"หน่วย" ต้องเป็นคำ เช่น ชิ้น งาน กล่อง ห้ามใส่ตัวเลข';
          if (!out.itemErrors.some((e) => e.row === i && e.col === 'unit')) { out.itemErrors.push({ row: i, col: 'unit', msg: m }); out.errors.push(`รายการที่ ${i + 1}: ${m}`); }
        }
        if (d.mode === 'priced' && Number(it.discount) > (Number(it.qty) || 0) * (Number(it.price) || 0)) {
          const m = '"ส่วนลด" ต้องไม่มากกว่ามูลค่ารายการ (จำนวน × ราคาต่อหน่วย)';
          out.itemErrors.push({ row: i, col: 'discount', msg: m }); out.errors.push(`รายการที่ ${i + 1}: ${m}`);
        }
        if (['amount', 'voucher', 'contract'].includes(d.mode) && d.items.cols.includes('amount') && !(Number(it.amount) > 0)) {
          const m = '"จำนวนเงิน" ต้องมากกว่า 0';
          if (!out.itemErrors.some((e) => e.row === i && e.col === 'amount')) { out.itemErrors.push({ row: i, col: 'amount', msg: m }); out.errors.push(`รายการที่ ${i + 1}: ${m}`); }
        }
        if (d.items.pnd && Number(it.wht) > Number(it.amount)) {
          const m = '"ภาษีที่หัก" ต้องไม่มากกว่าจำนวนเงินที่จ่าย';
          out.itemErrors.push({ row: i, col: 'wht', msg: m }); out.errors.push(`รายการที่ ${i + 1}: ${m}`);
        }
        if (c2(d, 'dueDate') && it.dueDate && F.startDate && it.dueDate < F.startDate) {
          const m = '"วันครบกำหนด" ของงวดต้องไม่มาก่อนวันเริ่มสัญญา';
          out.itemErrors.push({ row: i, col: 'dueDate', msg: m }); out.errors.push(`รายการที่ ${i + 1}: ${m}`);
        }
        if (c2(d, 'publishDate') && it.publishDate && F.deliverDate && it.publishDate > F.deliverDate) {
          const m = '"วันที่เผยแพร่" ต้องไม่หลังวันที่ส่งมอบ';
          out.itemErrors.push({ row: i, col: 'publishDate', msg: m }); out.errors.push(`รายการที่ ${i + 1}: ${m}`);
        }
      });
      // ส่วนลดท้ายบิลต้องน้อยกว่ายอดรวมหลังหักส่วนลดรายการ (เท่ากันหรือมากกว่า = ยอดเอกสารเป็นศูนย์หรือติดลบ)
      if (d.items.billDiscount && Number(F.billDiscount) > 0 && !out.fieldErrors.billDiscount) {
        const afterLine = rows.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0) - (Number(it.discount) || 0), 0);
        if (round2(Number(F.billDiscount)) >= round2(afterLine)) {
          const m = `"ส่วนลดท้ายบิล" ต้องน้อยกว่ายอดรวมหลังหักส่วนลดรายการ (${round2(afterLine).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท)`;
          out.fieldErrors.billDiscount = m; out.errors.push(m);
        }
      }
      // งวดที่วันครบกำหนดต้องเรียงตามลำดับ
      if (d.items.installments) {
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].dueDate && rows[i - 1].dueDate && rows[i].dueDate < rows[i - 1].dueDate) {
            const m = `วันครบกำหนดงวดที่ ${i + 1} ต้องไม่มาก่อนงวดที่ ${i}`;
            out.itemErrors.push({ row: i, col: 'dueDate', msg: m }); out.errors.push(m);
          }
        }
      }
    }
    return out;
  }
  const c2 = (d, col) => d.items && d.items.cols.includes(col);

  /* ---------- ตัวช่วย ---------- */
  function allFields(type) {
    const d = FORMS[type];
    if (!d) return [];
    const out = [...(d.meta || [])];
    for (const s of [...(d.sections || []), ...(d.sectionsAfter || [])]) out.push(...s.fields);
    return out;
  }
  function matchCond(cond, fields) {
    if (!cond) return true;
    const [k, v] = cond;
    const cur = fields[k];
    if (Array.isArray(v)) return v.includes(cur);
    if (typeof v === 'boolean') return !!cur === v;
    return String(cur ?? '') === String(v);
  }
  function rolesFor(role, opts = {}) {
    return Object.entries(FORMS)
      .filter(([, d]) => d.roles.includes(role))
      // ซ่อนเอกสารที่ต้องจด VAT เมื่อรู้แน่ว่าผู้ใช้ยังไม่จด ดีกว่าปล่อยให้เลือกแล้วค่อยขึ้น error
      .filter(([, d]) => !(d.requiresVat && opts.vatRegistered === false))
      .map(([id]) => id);
  }
  // ผู้ถูกหักเป็นนิติบุคคลหรือไม่: ดูจากประเภทที่ระบุ ไม่งั้นดูเลขผู้เสียภาษี (นิติบุคคลไทยขึ้นต้นด้วย 0)
  function isJuristicParty(p) {
    if (!p) return false;
    if (p.entityType === 'juristic') return true;
    if (p.entityType === 'individual') return false;
    return /^0/.test(String(p.taxId || ''));
  }
  // เลือกแบบ ภ.ง.ด. อัตโนมัติจากประเภทผู้ถูกหักและประเภทเงินได้
  function autoPndForm(party, incomeCode) {
    if (isJuristicParty(party)) return 'PND53';
    if (incomeCode === '1' || incomeCode === '2') return 'PND1A';
    if (incomeCode === '4a' || incomeCode === '4b') return 'PND2';
    return 'PND3';
  }

  // คำนวณภาษีหัก ณ ที่จ่ายตามเงื่อนไข (1 หัก ณ ที่จ่าย / 2 ออกให้ตลอดไป / 3 ออกให้ครั้งเดียว)
  // คืน income = เงินได้ที่ต้องแสดงในหนังสือรับรอง/แบบ ภ.ง.ด. (รวมภาษีที่ผู้จ่ายออกให้แล้ว)
  function calcWht(base, rate, condition) {
    const b = round2(base), r = Number(rate) || 0;
    if (!r) return { base: b, rate: 0, wht: 0, income: b, net: b, condition: '1' };
    if (String(condition) === '2') {
      const wht = round2((b * r) / (100 - r));
      return { base: b, rate: r, wht, income: round2(b + wht), net: b, condition: '2' };
    }
    if (String(condition) === '3') {
      const wht = round2((b * r) / 100);
      return { base: b, rate: r, wht, income: round2(b + wht), net: b, condition: '3' };
    }
    const wht = round2((b * r) / 100);
    return { base: b, rate: r, wht, income: b, net: round2(b - wht), condition: '1' };
  }

  /**
   * คำนวณยอดของเอกสาร ใช้ร่วมกันทั้ง preview หน้าเว็บและการบันทึกฝั่งเซิร์ฟเวอร์
   * data = { fields, items, party } opts = { vatRegistered }
   */
  function compute(type, data, opts = {}) {
    const d = FORMS[type];
    const F = data.fields || {};
    const items = data.items || [];
    const out = { subtotal: 0, lineDiscount: 0, billDiscount: 0, base: 0, vatRate: 0, vat: 0, total: 0, whtRate: 0, wht: 0, net: 0, income: 0 };
    if (!d) return out;
    const vatOk = (d.items && d.items.vat === 'any') || opts.vatRegistered;
    // เอกสารกลุ่ม e-Tax (ใบกำกับภาษี/ใบรับ) ต้องแสดงภาษีมูลค่าเพิ่มแยกจากราคาเสมอตามมาตรา 86/4 (7)
    // จึงไม่ปล่อยให้ขึ้นกับช่องติ๊ก "คิดภาษีมูลค่าเพิ่ม" เหมือนเอกสารธุรกิจทั่วไป
    // ผู้ออกเอกสารเป็นผู้ขาย (vat: 'issuer') และจดทะเบียน VAT แล้ว = ต้องคิด VAT ทุกครั้ง (มาตรา 82/4) · ไม่ได้จด = คิดไม่ได้
    // ใบสั่งซื้อ (vat: 'any') ผู้ขายคือคู่ค้า จึงให้ผู้ใช้ระบุเองว่าผู้ขายจดทะเบียน VAT หรือไม่
    const vatForced = (!!(d.items && d.items.vatAlways) && vatOk) || (!!(d.items && d.items.vat === 'issuer') && !!opts.vatRegistered);

    if (d.mode === 'priced' || d.mode === 'amount') {
      let gross = 0, disc = 0;
      for (const it of items) {
        const line = d.mode === 'amount' ? round2(Number(it.amount) || 0) : round2((Number(it.qty) || 0) * (Number(it.price) || 0));
        const ld = Math.min(round2(Number(it.discount) || 0), line);
        gross += line; disc += ld;
      }
      out.subtotal = round2(gross);
      out.lineDiscount = round2(disc);
      const afterLine = round2(gross - disc);
      out.billDiscount = Math.min(round2(Number(F.billDiscount) || 0), afterLine);
      out.base = round2(afterLine - out.billDiscount);
      if ((F.includeVat && vatOk) || vatForced) { out.vatRate = VAT_RATE; out.vat = round2((out.base * VAT_RATE) / 100); }
      out.total = round2(out.base + out.vat);
      out.net = out.total;
    } else if (d.mode === 'voucher') {
      out.subtotal = round2(items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
      out.base = out.subtotal;
      out.total = out.subtotal;
      if (F.hasWht) {
        const w = calcWht(out.base, F.whtRate, F.whtCondition);
        Object.assign(out, { whtRate: w.rate, wht: w.wht, income: w.income, net: w.net });
      } else { out.net = out.base; out.income = out.base; }
    } else if (d.mode === 'contract') {
      out.base = round2(Number(F.fee) || 0);
      out.subtotal = out.base;
      // สัญญาที่ผู้ออกเป็นผู้รับจ้าง (ช่อง vatGate): จดทะเบียน VAT = คิด VAT เสมอ
      const vatGate = allFields(type).some((x) => x.vatGate);
      if ((vatGate && opts.vatRegistered) || vatForced) { out.vatRate = VAT_RATE; out.vat = round2((out.base * VAT_RATE) / 100); }
      out.total = round2(out.base + out.vat);
      // หัก ณ ที่จ่ายเป็นตัวเลือก (ติ๊ก hasWht) · เอกสารเก่าที่ยังไม่มีช่องนี้ ถือตามอัตราที่บันทึกไว้
      const withhold = F.hasWht === undefined ? Number(F.whtRate) > 0 : !!F.hasWht;
      out.whtRate = withhold ? Number(F.whtRate) || 0 : 0;
      out.wht = round2((out.base * out.whtRate) / 100); // หัก ณ ที่จ่ายคิดจากมูลค่าก่อน VAT
      out.net = round2(out.total - out.wht);
      out.installmentSum = round2(items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
    } else if (d.mode === 'wht') {
      const w = calcWht(F.amount, F.whtRate, F.whtCondition);
      Object.assign(out, { base: w.income, subtotal: w.base, whtRate: w.rate, wht: w.wht, income: w.income, net: w.net, total: w.income });
    } else if (d.mode === 'pnd') {
      out.base = round2(items.reduce((s, it) => s + (Number(it.amount) || 0), 0));
      out.wht = round2(items.reduce((s, it) => s + (Number(it.wht) || 0), 0));
      out.surcharge = round2(Number(F.surcharge) || 0);
      out.income = out.base;
      out.total = round2(out.wht + out.surcharge); // ยอดภาษีที่นำส่งรวมเงินเพิ่ม
      out.net = out.total;
      out.count = items.length;
    }
    return out;
  }

  // แปลงวันที่ YYYY-MM-DD เป็น "16 กันยายน 2569" หรือแบบย่อ "16 ก.ย. 2569"
  // (เดิมแบบย่อตัดสามตัวอักษรแรกมาเติมจุด ได้ "ตุล." "กัน." ซึ่งไม่ใช่ตัวย่อเดือนของไทย)
  function thaiDate(iso, short) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    const i = Number(m[2]) - 1;
    const mon = (short ? THAI_MONTHS_SHORT[i] : THAI_MONTHS[i]) || '';
    return `${Number(m[3])} ${mon} ${Number(m[1]) + 543}`;
  }

  return {
    VAT_RATE, WHT_RATES, INCOME_TYPES, INCOME_LABEL, WHT_PRESETS, WHT_CONDITIONS, PND_FORMS, THAI_MONTHS, THAI_MONTHS_SHORT,
    PAY_METHODS, PLATFORMS, PARTY_FIELDS, PARTY_KEYS, CONTACT_KINDS, normKind, FORMS, ITEM_COLS, UNIT_PRESETS, DEFAULT_TERMS,
    allFields, matchCond, rolesFor, isJuristicParty, autoPndForm, calcWht, compute, thaiDate, round2,
    FORMAT, checkField, validateDoc, isValidThaiId,
  };
});
