'use strict';
/**
 * pdfsign.js ลายมือชื่อดิจิทัลแบบ PAdES บนไฟล์ PDF ด้วยใบรับรองที่ออกเอง (WP6)
 * ==========================================================================
 * สิ่งที่ได้
 *   เปิดไฟล์ใน Adobe Acrobat Reader แล้วเห็นแถบลายมือชื่อ แก้ไฟล์แม้ไบต์เดียว
 *   โปรแกรมอ่าน PDF และหน้าตรวจสอบของระบบจะรายงานว่าไฟล์ถูกเปลี่ยนแปลง
 *
 * รูปแบบลายมือชื่อ
 *   SubFilter ETSI.CAdES.detached (PAdES baseline B-B ตาม ETSI EN 319 142-1)
 *   SHA-256 + RSA · signed attributes: contentType, messageDigest, signingCertificateV2
 *   เวลาที่ลงนามอยู่ใน /M ของ signature dictionary ตามที่ PAdES กำหนด
 *   (มาตรฐานห้ามใส่ signingTime ใน CMS ของ PAdES baseline) เป็นเวลาจากนาฬิกาเซิร์ฟเวอร์
 *   ไม่ใช่ตราประทับเวลาจากหน่วยงานรับรองเวลา (TSA) ซึ่งต้องระบุในรายงานให้ตรง
 *
 * ทำไมไม่ใช้ node-signpdf / node-forge ตามแผน
 *   เครื่องพัฒนาติดตั้งเพิ่มไม่ได้ และ Node.js 22 มี RSA, SHA-256 และตัวอ่าน X.509 ในตัวครบแล้ว
 *   ส่วนที่ต้องเขียนเองคือโครงสร้าง CMS (lib/der.js) กับการเตรียมช่องลายมือชื่อในไฟล์
 *   ซึ่งทำด้วย @cantoo/pdf-lib ที่ใช้ทำ PDF/A-3 อยู่แล้ว ไม่มีไลบรารีเพิ่ม
 *   ความถูกต้องยืนยันด้วยเครื่องมือภายนอก openssl cms และ pdfsig ในชุดทดสอบ
 *
 * ความหมายของลายมือชื่อในระบบนี้
 *   ใบรับรองเป็นของ "ระบบ TaxFlow" ใบเดียว ไม่ใช่ของผู้ใช้แต่ละคน ระบบลงนามให้ก็ต่อเมื่อ
 *   ผู้ออกเอกสารกดลงนามและยืนยันตัวตนด้วย OTP แล้วเท่านั้น (ขั้นตอนเดิมของ ver13)
 *   ชื่อผู้ลงนามและวิธียืนยันตัวตนบันทึกไว้ใน /Name และ /Reason ของลายมือชื่อ
 *   รูปแบบนี้ใกล้เคียง "ตราประทับอิเล็กทรอนิกส์ของผู้ให้บริการ" มากกว่าลายมือชื่อรายบุคคล
 *   และใบรับรองออกเอง จึงไม่มีผลรับรองตามกฎหมาย ต้องระบุทั้งสองข้อนี้ในรายงาน
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const der = require('./der');

/* ------------------------------------------------------------ รหัสอ้างอิง */

const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  sha256: '2.16.840.1.101.3.4.2.1',
  rsaEncryption: '1.2.840.113549.1.1.1',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
};

/** เนื้อที่จองไว้สำหรับลายมือชื่อ (ไบต์) ใบรับรอง RSA-3072 + ลายมือชื่อใช้จริงราว 2 KB */
const PLACEHOLDER_BYTES = 8192;
const BYTE_RANGE_MARK = '**********'; // 10 ตัว พอสำหรับตัวเลขตำแหน่งไฟล์ขนาดถึง 9.9 GB

/* --------------------------------------------------------- ใบรับรองของระบบ */

const DATA_DIR = process.env.TAXFLOW_DATA_DIR
  ? path.resolve(process.env.TAXFLOW_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DEFAULT_DIR = path.join(DATA_DIR, 'sign');
const DEFAULT_KEY = path.join(DEFAULT_DIR, 'taxflow-sign.key.pem');
const DEFAULT_CERT = path.join(DEFAULT_DIR, 'taxflow-sign.cert.pem');

/**
 * แยกเลขลำดับใบรับรองและชื่อผู้ออกจาก DER ตรง ๆ
 * CMS ต้องอ้างถึงใบรับรองด้วยไบต์ของสองค่านี้แบบเดิมทุกไบต์ จะสร้างใหม่จากข้อความไม่ได้
 */
function certParts(certDer) {
  const tbs = der.decode(certDer).children[0];
  let i = 0;
  if (tbs.children[0].tag === 0xa0) i = 1; // [0] version
  return { serialRaw: tbs.children[i].raw, issuerRaw: tbs.children[i + 2].raw };
}

/** ข้อมูลใบรับรองที่หน้าตรวจสอบใช้แสดงผล */
function describeCert(x509) {
  const cn = (dn) => (/CN=([^\n]+)/.exec(dn) || [])[1] || dn;
  return {
    subject: cn(x509.subject),
    issuer: cn(x509.issuer),
    selfSigned: x509.subject === x509.issuer,
    validFrom: new Date(x509.validFrom).toISOString(),
    validTo: new Date(x509.validTo).toISOString(),
    fingerprint: x509.fingerprint256,
  };
}

/**
 * อ่านกุญแจและใบรับรองของระบบ
 * บนเครื่องพัฒนาอ่านจากไฟล์ใน data/sign/ ที่ `npm run sign:setup` สร้างให้
 * บนคลาวด์ (WP7) ไม่มีดิสก์ถาวร จึงอ่านจากตัวแปรแวดล้อมแบบ base64 ได้
 *   SIGN_KEY_PEM_B64 / SIGN_CERT_PEM_B64 หรือ SIGN_KEY_FILE / SIGN_CERT_FILE
 *   SIGN_KEY_PASSPHRASE รหัสผ่านของกุญแจ ห้ามเก็บในไฟล์ใด ๆ ในที่เก็บโค้ด
 * @returns {object|null} null = ยังไม่ได้ตั้งค่า ระบบยังออก PDF ได้แต่ไม่มีลายมือชื่อดิจิทัล
 */
function loadSigner(env = process.env) {
  const fromB64 = (v) => Buffer.from(v, 'base64').toString('utf8');
  let keyPem = env.SIGN_KEY_PEM_B64 ? fromB64(env.SIGN_KEY_PEM_B64) : null;
  let certPem = env.SIGN_CERT_PEM_B64 ? fromB64(env.SIGN_CERT_PEM_B64) : null;
  const keyFile = env.SIGN_KEY_FILE || DEFAULT_KEY;
  const certFile = env.SIGN_CERT_FILE || DEFAULT_CERT;
  if (!keyPem && fs.existsSync(keyFile)) keyPem = fs.readFileSync(keyFile, 'utf8');
  if (!certPem && fs.existsSync(certFile)) certPem = fs.readFileSync(certFile, 'utf8');
  if (!keyPem || !certPem) return null;

  if (/ENCRYPTED PRIVATE KEY/.test(keyPem) && !env.SIGN_KEY_PASSPHRASE) {
    throw new Error(
      'มีไฟล์กุญแจแล้ว แต่ระบบอ่าน SIGN_KEY_PASSPHRASE ใน .env ไม่เจอ '
      + 'รัน npm run env:check เพื่อดูว่าบรรทัดนั้นผิดตรงไหน'
    );
  }
  let key;
  try {
    key = crypto.createPrivateKey({ key: keyPem, passphrase: env.SIGN_KEY_PASSPHRASE || undefined });
  } catch (err) {
    throw new Error(
      'เปิดกุญแจสำหรับลงลายมือชื่อไม่ได้ รหัสผ่านใน SIGN_KEY_PASSPHRASE ไม่ตรงกับกุญแจ '
      + 'ตรวจว่าคัดลอกมาครบทั้งบรรทัด ถ้าหารหัสเดิมไม่เจอให้รัน npm run sign:setup -- --force '
      + `(${err.message})`
    );
  }
  const x509 = new crypto.X509Certificate(certPem);
  if (!x509.checkPrivateKey(key)) {
    throw new Error('กุญแจกับใบรับรองสำหรับลงลายมือชื่อไม่ใช่คู่เดียวกัน ให้รัน npm run sign:setup ใหม่');
  }
  return { key, x509, certDer: x509.raw, ...certParts(x509.raw), ...describeCert(x509) };
}

let cached;
let loadError = null;
/** ผู้ลงนามของระบบ อ่านครั้งเดียวต่อโปรเซส */
function systemSigner() {
  if (cached === undefined) {
    try { cached = loadSigner(); } catch (err) {
      loadError = err.message;
      console.error(`[sign] ${err.message}`);
      cached = null;
    }
  }
  return cached;
}
/** ข้อความผิดพลาดตอนเปิดกุญแจ (null = ไม่มี หรือยังไม่ได้ตั้งค่าเลย) */
const lastError = () => loadError;
/** ใช้ในชุดทดสอบเท่านั้น */
function _setSystemSigner(s) { cached = s; }

/* ------------------------------------------------------------- สร้าง CMS */

const algSha256 = () => der.seq(der.oid(OID.sha256));
const attr = (id, value) => der.seq(der.oid(id), der.set(value));

/**
 * signed attributes ที่ PAdES baseline B-B บังคับ
 * signingCertificateV2 ผูกลายมือชื่อไว้กับใบรับรองใบนี้ กันการสลับใบรับรองอื่นที่กุญแจเดียวกัน
 */
function signedAttributes(digest, signer) {
  const certHash = crypto.createHash('sha256').update(signer.certDer).digest();
  return [
    attr(OID.contentType, der.oid(OID.data)),
    attr(OID.messageDigest, der.octet(digest)),
    // ESSCertIDv2 ที่ใช้ SHA-256 ละ hashAlgorithm ได้เพราะเป็นค่าเริ่มต้นของมาตรฐาน
    attr(OID.signingCertificateV2, der.seq(der.seq(der.seq(der.octet(certHash))))),
  ];
}

/**
 * CMS SignedData แบบ detached (ไม่มีเนื้อหา PDF อยู่ข้างใน มีแค่แฮช)
 * @param {Buffer} digest SHA-256 ของไบต์ PDF ตาม /ByteRange
 */
function buildCms(digest, signer) {
  const attrs = signedAttributes(digest, signer);
  // ลายมือชื่อคำนวณจาก signed attributes ที่เข้ารหัสเป็น SET (แท็ก 0x31)
  // แต่ตอนฝังในโครงสร้างใช้แท็ก [0] IMPLICIT (0xA0) ตาม RFC 5652 หัวข้อ 5.4
  const attrSet = der.set(...attrs);
  const signature = crypto.sign('sha256', attrSet, signer.key);

  const signerInfo = der.seq(
    der.int(1),
    der.seq(signer.issuerRaw, signer.serialRaw), // IssuerAndSerialNumber
    algSha256(),
    der.implicit(0, attrSet),
    der.seq(der.oid(OID.rsaEncryption), der.nul()),
    der.octet(signature),
  );
  const signedData = der.seq(
    der.int(1),
    der.set(algSha256()),
    der.seq(der.oid(OID.data)), // detached: ไม่มีเนื้อหา
    der.tlv(0xa0, signer.certDer), // [0] IMPLICIT certificates
    der.set(signerInfo),
  );
  return der.seq(der.oid(OID.signedData), der.explicit(0, signedData));
}

/* ------------------------------------------- เตรียมช่องลายมือชื่อในไฟล์ PDF */

/**
 * เพิ่ม signature dictionary และช่องลายมือชื่อแบบมองไม่เห็นลงในเอกสาร pdf-lib ที่เปิดอยู่
 * เรียกก่อน save() ข้อความที่มองเห็นบนหน้ากระดาษ (ชื่อผู้ลงนาม เวลา) วาดไว้แล้วโดย pdfbuild
 *
 * ต้อง save แบบไม่ใช้ object stream มิฉะนั้น /Contents จะถูกบีบอัดรวมกับวัตถุอื่น
 * แล้วหาตำแหน่งเพื่อเติมลายมือชื่อทีหลังไม่ได้
 */
function addPlaceholder(pdf, lib, opt = {}) {
  const { PDFName, PDFHexString, PDFString } = lib;
  const ctx = pdf.context;
  const page = pdf.getPages()[0];

  const sig = ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'ETSI.CAdES.detached',
    ByteRange: [0, PDFName.of(BYTE_RANGE_MARK), PDFName.of(BYTE_RANGE_MARK), PDFName.of(BYTE_RANGE_MARK)],
    Contents: PDFHexString.of('0'.repeat(PLACEHOLDER_BYTES * 2)),
    // ข้อความไทยต้องเข้ารหัสเป็น UTF-16 (fromText) มิฉะนั้นโปรแกรมอ่าน PDF แสดงเป็นตัวอักษรเพี้ยน
    Name: PDFHexString.fromText(opt.name || 'TaxFlow'),
    Reason: PDFHexString.fromText(opt.reason || 'ลงนามผ่านระบบ TaxFlow'),
    Location: PDFHexString.fromText(opt.location || 'TaxFlow'),
    ContactInfo: PDFHexString.fromText(opt.contactInfo || ''),
    M: PDFString.fromDate(opt.signedAt || new Date()),
  });
  const sigRef = ctx.register(sig);

  // PDF/A กำหนดให้ annotation มี appearance stream ช่องลายมือชื่อที่มองไม่เห็นจึงใส่ฟอร์มว่างขนาดศูนย์ไว้
  const ap = ctx.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 0, 0] });
  const apRef = ctx.register(ap);

  const widget = ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    Rect: [0, 0, 0, 0],
    V: sigRef,
    T: PDFHexString.fromText('TaxFlowSignature'),
    F: 132, // Print (4) + Locked (128) PDF/A บังคับให้ตั้ง Print
    P: page.ref,
    AP: ctx.obj({ N: apRef }),
  });
  const widgetRef = ctx.register(widget);
  page.node.addAnnot(widgetRef);

  pdf.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [widgetRef], SigFlags: 3 }));
}

/**
 * เติมลายมือชื่อลงในไฟล์ที่เตรียมช่องไว้แล้ว
 * 1) หาช่อง /Contents ที่จองไว้ 2) เขียน /ByteRange ให้ครอบทุกไบต์ยกเว้นช่องนั้น
 * 3) แฮชไบต์ตาม ByteRange 4) สร้าง CMS แล้วเขียนลงช่อง ขนาดไฟล์ไม่เปลี่ยน
 */
function fillSignature(pdfBytes, signer) {
  const buf = Buffer.from(pdfBytes);
  const hole = Buffer.from(`<${'0'.repeat(PLACEHOLDER_BYTES * 2)}>`);
  const start = buf.indexOf(hole);
  if (start < 0) throw new Error('ไม่พบช่องลายมือชื่อในไฟล์ (ไฟล์อาจถูกบีบอัดด้วย object stream)');
  const end = start + hole.length;

  const brStart = buf.lastIndexOf(Buffer.from('/ByteRange'), start + hole.length + 4096);
  const open = buf.indexOf('[', brStart);
  const close = buf.indexOf(']', open);
  if (brStart < 0 || open < 0 || close < 0) throw new Error('ไม่พบ /ByteRange ในไฟล์');
  const room = close - open - 1;
  const range = ` 0 ${start} ${end} ${buf.length - end}`;
  if (range.length > room) throw new Error('ช่อง /ByteRange ไม่พอ');
  buf.write(range.padEnd(room, ' '), open + 1, 'latin1');

  const digest = crypto.createHash('sha256')
    .update(buf.subarray(0, start))
    .update(buf.subarray(end))
    .digest();
  const cms = buildCms(digest, signer);
  if (cms.length > PLACEHOLDER_BYTES) throw new Error(`ลายมือชื่อยาว ${cms.length} ไบต์ เกินพื้นที่ที่จองไว้`);
  buf.write(cms.toString('hex'), start + 1, 'latin1');
  return buf;
}

/* ------------------------------------------------------------- ตรวจสอบ */

/** ถอดข้อความใน PDF ที่เป็นทั้ง <FEFF...> (UTF-16) และ (...) แบบตัวอักษรธรรมดา */
function pdfText(raw) {
  if (!raw) return '';
  if (raw.startsWith('<')) {
    const hex = raw.slice(1, -1).replace(/\s+/g, '');
    const b = Buffer.from(hex, 'hex');
    if (b[0] === 0xfe && b[1] === 0xff) {
      const le = Buffer.alloc(b.length - 2);
      for (let i = 2; i + 1 < b.length; i += 2) { le[i - 2] = b[i + 1]; le[i - 1] = b[i]; }
      return le.toString('utf16le');
    }
    return b.toString('latin1');
  }
  return raw.slice(1, -1);
}

/** แปลงวันที่แบบ PDF D:20260920043000Z เป็น ISO */
function pdfDate(s) {
  const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}'?\d{2})?/.exec(s || '');
  if (!m) return null;
  const tz = !m[7] || m[7] === 'Z' ? 'Z' : `${m[7].slice(0, 3)}:${m[7].replace("'", '').slice(3, 5)}`;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${tz}`).toISOString();
}

/**
 * ตรวจลายมือชื่อดิจิทัลในไฟล์ PDF
 * @param {Buffer} buf ไฟล์ PDF
 * @param {object} [opt] { trustedFingerprint } ลายนิ้วมือใบรับรองของระบบ ใช้บอกว่าออกโดยระบบนี้จริงไหม
 * @returns {object}
 *   signed        มีลายมือชื่อไหม
 *   intact        ไฟล์ไม่ถูกแก้ไขหลังลงนาม และลายมือชื่อถอดรหัสได้ถูกต้อง
 *   coversWhole   ลายมือชื่อครอบคลุมทั้งไฟล์ ไม่มีข้อมูลต่อท้ายหลังลงนาม
 *   trusted       ใบรับรองเป็นใบของระบบนี้
 *   problems      เหตุผลเป็นภาษาไทยเมื่อไม่ผ่าน
 */
function verify(buf, opt = {}) {
  const result = {
    signed: false, intact: false, coversWhole: false, trusted: false, certValidAtSigning: false,
    signer: null, name: '', reason: '', signedAt: null, subFilter: '', problems: [],
  };
  const text = buf.toString('latin1');
  const at = text.lastIndexOf('/ByteRange');
  if (at < 0) { result.problems.push('ไฟล์นี้ไม่มีลายมือชื่อดิจิทัล'); return result; }
  result.signed = true;

  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text.slice(at, at + 200));
  if (!m) { result.problems.push('โครงสร้างลายมือชื่อเสียหาย อ่าน /ByteRange ไม่ได้'); return result; }
  const [a, b, c, d] = m.slice(1).map(Number);
  if (a !== 0 || b <= 0 || c <= b || c + d > buf.length) {
    result.problems.push('ช่วงข้อมูลที่ลายมือชื่อครอบคลุมไม่ถูกต้อง');
    return result;
  }
  result.coversWhole = c + d === buf.length;
  if (!result.coversWhole) result.problems.push('มีข้อมูลถูกต่อท้ายไฟล์หลังจากลงนามแล้ว');

  // ข้อมูลใน signature dictionary (ชื่อ เหตุผล เวลา) อยู่ในวัตถุเดียวกับ /ByteRange
  const objStart = text.lastIndexOf(' obj', at);
  const objEnd = text.indexOf('endobj', at);
  const dict = text.slice(objStart, objEnd);
  const val = (k) => {
    const r = new RegExp(`/${k}\\s*(<[0-9A-Fa-f\\s]*>|\\((?:\\\\.|[^\\\\)])*\\))`).exec(dict);
    return r ? r[1] : '';
  };
  result.name = pdfText(val('Name'));
  result.reason = pdfText(val('Reason'));
  result.signedAt = pdfDate(pdfText(val('M')));
  result.subFilter = (/\/SubFilter\s*\/([\w.]+)/.exec(dict) || [])[1] || '';

  let cms;
  try {
    const hex = text.slice(b + 1, c - 1).replace(/\s+/g, '');
    const raw = Buffer.from(hex, 'hex');
    cms = raw.subarray(0, der.totalLength(raw));
  } catch {
    result.problems.push('อ่านข้อมูลลายมือชื่อไม่ได้');
    return result;
  }

  try {
    const ci = der.decode(cms);
    const sd = ci.children[1].children[0];
    const certsNode = sd.children.find((n) => n.tag === 0xa0);
    const signerInfos = sd.children.find((n, i) => i > 2 && n.tag === 0x31);
    const si = signerInfos.children[0];
    const attrsNode = si.children.find((n) => n.tag === 0xa0);
    const sigValue = si.children[si.children.length - 1].content;
    const certDer = certsNode.children[0].raw;
    const x509 = new crypto.X509Certificate(certDer);
    result.signer = describeCert(x509);
    result.trusted = !!opt.trustedFingerprint && x509.fingerprint256 === opt.trustedFingerprint;

    // แฮชของไฟล์ตอนนี้ ต้องตรงกับแฮชที่ถูกลงนามไว้ใน messageDigest
    const digest = crypto.createHash('sha256')
      .update(buf.subarray(a, a + b))
      .update(buf.subarray(c, c + d))
      .digest();
    let signedDigest = null;
    let certHash = null;
    for (const at2 of attrsNode.children) {
      const id = der.oidText(at2.children[0]);
      const v = at2.children[1].children[0];
      if (id === OID.messageDigest) signedDigest = v.content;
      if (id === OID.signingCertificateV2) certHash = v.children[0].children[0].children[0].content;
    }
    const digestOk = !!signedDigest && crypto.timingSafeEqual(signedDigest, digest);
    if (!digestOk) result.problems.push('เนื้อหาไฟล์ถูกเปลี่ยนแปลงหลังจากลงนาม');

    // ลายมือชื่อต้องถอดได้ด้วยกุญแจสาธารณะของใบรับรองที่แนบมา
    const attrSet = Buffer.concat([Buffer.from([0x31]), attrsNode.raw.subarray(1)]);
    const sigOk = crypto.verify('sha256', attrSet, x509.publicKey, sigValue);
    if (!sigOk) result.problems.push('ลายมือชื่อไม่ถูกต้อง ข้อมูลการลงนามถูกแก้ไข');

    const certOk = !!certHash && certHash.equals(crypto.createHash('sha256').update(certDer).digest());
    if (!certOk) result.problems.push('ใบรับรองที่แนบมาไม่ตรงกับใบรับรองที่ใช้ลงนาม');

    result.intact = digestOk && sigOk && certOk;

    // ใบรับรองต้องอยู่ในช่วงอายุใช้งาน ณ เวลาที่อ้างว่าลงนาม ตรวจแบบเดียวกับที่ Adobe ตรวจ
    // ไม่นับรวมใน intact เพราะไม่ได้แปลว่าไฟล์ถูกแก้ แต่ทำให้ลายมือชื่อไม่สมบูรณ์ (valid = false)
    if (result.signedAt) {
      const at = new Date(result.signedAt).getTime();
      const from = new Date(x509.validFrom).getTime();
      const to = new Date(x509.validTo).getTime();
      result.certValidAtSigning = at >= from && at <= to;
      if (at < from) result.problems.push('เวลาที่ลงนามอยู่ก่อนวันที่ใบรับรองเริ่มใช้ได้');
      if (at > to) result.problems.push('ใบรับรองหมดอายุแล้ว ณ เวลาที่ลงนาม');
    } else {
      result.certValidAtSigning = false;
      result.problems.push('ไม่มีเวลาที่ลงนามในลายมือชื่อ');
    }
  } catch (err) {
    result.problems.push(`โครงสร้างลายมือชื่อเสียหาย (${err.message})`);
  }
  if (result.signer && result.signer.selfSigned) {
    result.notes = ['ใบรับรองเป็นแบบออกเอง (Self-signed) ใช้สาธิตกลไก ไม่มีผลรับรองตามกฎหมาย'];
  }
  return result;
}

module.exports = {
  loadSigner, systemSigner, lastError, _setSystemSigner, certParts,
  buildCms, addPlaceholder, fillSignature, verify,
  PLACEHOLDER_BYTES, DEFAULT_KEY, DEFAULT_CERT, DEFAULT_DIR, OID,
};
