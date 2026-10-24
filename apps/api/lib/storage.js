'use strict';
/**
 * storage.js ชั้นจัดเก็บไฟล์ของระบบ (WP4)
 * ==========================================================================
 * เดิมไฟล์ทุกชนิดถูกเขียนลงดิสก์ที่ data/uploads/ ของเครื่องที่รันเซิร์ฟเวอร์
 * ซึ่งใช้ไม่ได้เมื่อ API ไปอยู่บนคลาวด์ (ดิสก์ของผู้ให้บริการส่วนใหญ่เป็นแบบชั่วคราว
 * ไฟล์หายทุกครั้งที่ deploy ใหม่) ไฟล์นี้จึงรวม "การอ่านเขียนไฟล์ทุกจุดของระบบ"
 * ไว้ที่เดียว แล้วสลับปลายทางได้ด้วยตัวแปรแวดล้อม
 *
 * ปลายทางที่รองรับ (เลือกอัตโนมัติ)
 *   local  ค่าเริ่มต้น เขียนลงดิสก์ที่ data/uploads/ ใช้ตอนพัฒนาในเครื่องและตอนรันชุดทดสอบ
 *   s3     ตั้ง S3_ENDPOINT ครบเมื่อไร จะอัปโหลดขึ้น Supabase Storage ผ่าน S3 API แทน
 *
 * หลักการที่ห้ามเปลี่ยน
 * 1) เข้ารหัสก่อนอัปโหลดเสมอ ด้วย AES-256-GCM (lib/filestore.js) กุญแจอยู่ที่ฝั่งเรา
 *    ผู้ให้บริการพื้นที่เก็บไฟล์จึงเปิดอ่านเนื้อหาไม่ได้ แม้จะถือไฟล์อยู่ในมือ
 *    (เกณฑ์ตรวจรับของ WP4 ข้อ "ไฟล์บนคลาวด์เปิดตรงไม่ได้")
 * 2) ถอดรหัสหลังดาวน์โหลดเสมอ โค้ดที่เรียกใช้จึงได้ Buffer ต้นฉบับเหมือนเดิมทุกจุด
 * 3) ทุกเมธอดเป็น async เพราะการคุยกับคลาวด์เป็น I/O ข้ามเครือข่าย
 *
 * หมายเหตุเรื่องถังเก็บไฟล์ (bucket)
 *   private  ค่าเริ่มต้น เข้าถึงผ่าน API เท่านั้น ไฟล์ทุกไฟล์ในระบบตอนนี้อยู่ถังนี้
 *   public   เตรียมไว้สำหรับ WP5 (ไฟล์ PDF/XML ที่ต้องเปิดผ่านลิงก์ตรวจสอบเอกสาร)
 *            ไฟล์ในถังนี้ "ไม่เข้ารหัส" เพราะต้องให้เบราว์เซอร์เปิดได้ตรง
 */

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const filestore = require('./filestore');

/* ---------------------------------------------------------------- ตั้งค่า */

const DATA_DIR = process.env.TAXFLOW_DATA_DIR
  ? path.resolve(process.env.TAXFLOW_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const LOCAL_DIR = path.join(DATA_DIR, 'uploads');

const S3 = {
  endpoint: process.env.S3_ENDPOINT || '',
  region: process.env.S3_REGION || 'us-east-1',
  accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  buckets: {
    private: process.env.S3_BUCKET_PRIVATE || 'taxflow-private',
    public: process.env.S3_BUCKET_PUBLIC || 'taxflow-public',
  },
};

// ใช้ S3 ก็ต่อเมื่อตั้งค่าครบทั้งสามค่า มิฉะนั้นถอยไปใช้ดิสก์ในเครื่อง
// (ตั้งใจให้ "ลืมตั้งค่า" กลายเป็นการรันในเครื่องตามปกติ ไม่ใช่ระบบล่มตอนเริ่ม)
const DRIVER = S3.endpoint && S3.accessKeyId && S3.secretAccessKey ? 's3' : 'local';

/** ไฟล์ที่ลงท้ายด้วย .enc คือไฟล์ที่ระบบเข้ารหัสไว้ ไฟล์ชื่ออื่นคือของเดิมจาก ver17.2 ที่ยังไม่เข้ารหัส */
const isEncrypted = (storedName) => String(storedName).endsWith('.enc');

/** ตั้งชื่อไฟล์ที่เก็บจริง สุ่มไม่ซ้ำและไม่เปิดเผยชื่อไฟล์ที่ผู้ใช้ตั้งมา */
function newStoredName(ext, { encrypted = true, prefix = '' } = {}) {
  const base = prefix + crypto.randomBytes(12).toString('hex') + '.' + (ext || 'bin');
  return encrypted ? base + '.enc' : base;
}

/* ------------------------------------------------------ ปลายทาง: ดิสก์ในเครื่อง */

const local = {
  async ready() {
    await fsp.mkdir(LOCAL_DIR, { recursive: true });
  },
  async put(key, body) {
    await fsp.mkdir(LOCAL_DIR, { recursive: true });
    await fsp.writeFile(path.join(LOCAL_DIR, key), body);
  },
  async get(key) {
    return fsp.readFile(path.join(LOCAL_DIR, key));
  },
  async remove(key) {
    try { await fsp.unlink(path.join(LOCAL_DIR, key)); return true; } catch { return false; }
  },
  async signedUrl() {
    return null; // ดิสก์ในเครื่องไม่มีลิงก์สาธารณะ ให้เรียกผ่าน endpoint ของ API แทน
  },
};

/* ------------------------------------------------- ปลายทาง: Supabase Storage */

let s3client = null;
let sdk = null;

function loadSdk() {
  if (sdk) return sdk;
  try {
    sdk = require('@aws-sdk/client-s3');
  } catch {
    throw new Error(
      "ตั้งค่า S3_ENDPOINT ไว้แล้วแต่ยังไม่ได้ติดตั้งแพ็กเกจ '@aws-sdk/client-s3' " +
      'ติดตั้งด้วย `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner -w @taxflow/api` ' +
      'หรือถ้ายังไม่ต้องการใช้คลาวด์ ให้ลบ S3_ENDPOINT ออกจาก .env เพื่อกลับไปเก็บไฟล์ในเครื่อง'
    );
  }
  return sdk;
}

function client() {
  if (s3client) return s3client;
  const { S3Client } = loadSdk();
  // forcePathStyle: true จำเป็นสำหรับ Supabase Storage (ไม่รองรับ virtual-hosted style)
  // endpoint ต้องลงท้ายด้วย /storage/v1/s3 และควรใช้โฮสต์ <project_ref>.storage.supabase.co
  // ตามที่เอกสาร Supabase แนะนำสำหรับไฟล์ขนาดใหญ่
  s3client = new S3Client({
    forcePathStyle: true,
    region: S3.region,
    endpoint: S3.endpoint,
    credentials: { accessKeyId: S3.accessKeyId, secretAccessKey: S3.secretAccessKey },
  });
  return s3client;
}

const s3 = {
  async ready() {
    const { HeadBucketCommand } = loadSdk();
    for (const [name, bucket] of Object.entries(S3.buckets)) {
      try {
        await client().send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (err) {
        throw new Error(
          `เปิดถังเก็บไฟล์ "${bucket}" (${name}) ไม่ได้: ${err.message} ` +
          'ตรวจว่าสร้างถังนี้ไว้ใน Supabase แล้ว และคีย์ S3 มีสิทธิ์เข้าถึง'
        );
      }
    }
  },
  async put(key, body, bucket, contentType) {
    const { PutObjectCommand } = loadSdk();
    await client().send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: body,
      ContentType: contentType || 'application/octet-stream',
    }));
  },
  async get(key, bucket) {
    const { GetObjectCommand } = loadSdk();
    const out = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of out.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  },
  async remove(key, bucket) {
    const { DeleteObjectCommand } = loadSdk();
    try {
      await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch { return false; }
  },
  async signedUrl(key, bucket, expiresIn) {
    const { GetObjectCommand } = loadSdk();
    let presigner;
    try {
      presigner = require('@aws-sdk/s3-request-presigner');
    } catch {
      return null; // ยังไม่ได้ติดตั้งตัวสร้างลิงก์ชั่วคราว ให้ผู้เรียกถอยไปใช้ endpoint ของ API
    }
    return presigner.getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
  },
};

const backend = DRIVER === 's3' ? s3 : local;
const bucketOf = (name) => S3.buckets[name === 'public' ? 'public' : 'private'];

/* ------------------------------------------------------------ API ที่ใช้จริง */

/**
 * ตรวจว่าปลายทางพร้อมใช้งาน เรียกครั้งเดียวตอนเริ่มระบบ
 * โหมด local สร้างโฟลเดอร์ให้ · โหมด s3 ตรวจว่าถังทั้งสองเปิดได้จริง (ล้มเร็วดีกว่าพังตอนผู้ใช้อัปโหลด)
 */
async function ensureReady() {
  await backend.ready();
  return true;
}

/**
 * บันทึกไฟล์ คืนชื่อไฟล์ที่เก็บจริง (storedName) ให้เอาไปบันทึกลงฐานข้อมูล
 * @param {Buffer} buf     เนื้อไฟล์ต้นฉบับ
 * @param {string} ext     นามสกุลไฟล์ เช่น 'pdf' 'png'
 * @param {object} [opt]   { bucket: 'private'|'public', prefix: string, mime: string }
 */
async function put(buf, ext, opt = {}) {
  const bucket = opt.bucket === 'public' ? 'public' : 'private';
  const encrypt = bucket === 'private'; // ถังสาธารณะต้องเปิดตรงได้ จึงไม่เข้ารหัส
  const storedName = newStoredName(ext, { encrypted: encrypt, prefix: opt.prefix || '' });
  const body = encrypt ? filestore.encrypt(buf) : buf;
  await backend.put(storedName, body, bucketOf(bucket), encrypt ? 'application/octet-stream' : opt.mime);
  return storedName;
}

/**
 * อ่านไฟล์กลับมาเป็น Buffer ต้นฉบับ
 * ไฟล์ที่ระบบเขียนเองจะลงท้าย .enc และถูกถอดรหัสให้อัตโนมัติ
 * ส่วนไฟล์ชื่อแบบเดิมจาก ver17.2 (ไฟล์แนบและโลโก้ที่ยังไม่เข้ารหัส) จะคืนค่าตรง ๆ
 * เพื่อให้ข้อมูลเดิมยังเปิดได้แม้ยังไม่ได้รันสคริปต์ย้ายไฟล์
 */
async function get(storedName, opt = {}) {
  const bucket = opt.bucket === 'public' ? 'public' : 'private';
  const raw = await backend.get(storedName, bucketOf(bucket));
  if (!isEncrypted(storedName)) return raw;
  return filestore.decrypt(raw);
}

/** ลบไฟล์ ไม่โยน error ถ้าไม่พบ */
async function remove(storedName, opt = {}) {
  if (!storedName) return false;
  const bucket = opt.bucket === 'public' ? 'public' : 'private';
  return backend.remove(storedName, bucketOf(bucket));
}

/**
 * ลิงก์ชั่วคราวสำหรับเปิดไฟล์ตรงจากคลาวด์ (ใช้กับถัง public ใน WP5)
 * คืน null เมื่ออยู่โหมด local หรือยังไม่ได้ติดตั้งตัวสร้างลิงก์ ผู้เรียกต้องถอยไปส่งไฟล์ผ่าน API เอง
 */
async function signedUrl(storedName, opt = {}) {
  const bucket = opt.bucket === 'public' ? 'public' : 'private';
  return backend.signedUrl(storedName, bucketOf(bucket), opt.expiresIn || 300);
}

/** ข้อมูลสำหรับแสดงตอนเริ่มระบบและใช้ในสคริปต์ย้ายไฟล์ */
function info() {
  return {
    driver: DRIVER,
    localDir: LOCAL_DIR,
    endpoint: DRIVER === 's3' ? S3.endpoint : null,
    buckets: DRIVER === 's3' ? S3.buckets : null,
  };
}

module.exports = {
  ensureReady, put, get, remove, signedUrl, info,
  DRIVER, LOCAL_DIR, isEncrypted, newStoredName,
  // เปิดไว้ให้สคริปต์ย้ายไฟล์เรียกปลายทางตรง ๆ โดยไม่ผ่านการเข้ารหัสซ้ำ
  _backend: backend, _bucketOf: bucketOf,
};
