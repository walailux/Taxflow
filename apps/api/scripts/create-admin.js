'use strict';
/**
 * scripts/create-admin.js สร้างบัญชีผู้ดูแลระบบ (role admin) ในฐานข้อมูลที่ DATABASE_URL ชี้อยู่
 * ==========================================================
 *   node scripts/create-admin.js <อีเมล> <รหัสผ่าน>
 *
 * ระบบจริงไม่สร้างบัญชีแอดมินให้เอง (ดู core/seed.js) จึงต้องสร้างด้วยสคริปต์นี้
 * อีเมลต้องเป็นอีเมลจริงที่รับได้ เพราะการเข้าสู่ระบบทุกครั้งจะส่งรหัส OTP ไปที่อีเมลนี้
 */
require('./_env');
const store = require('../core/store');
const auth = require('../lib/auth');
const profile = require('../lib/profile');
const pdpa = require('../lib/pdpa');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) throw new Error('วิธีใช้: node scripts/create-admin.js <อีเมล> <รหัสผ่าน>');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  if (password.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  await store.ensureReady();
  const key = email.trim().toLowerCase();
  if (await store.whereOne('users', { email: key })) throw new Error(`มีบัญชี ${key} อยู่แล้ว ไม่สร้างซ้ำ`);

  const now = new Date().toISOString();
  const user = await store.insert('users', {
    ...profile.defaults('admin'), role: 'admin', email: key,
    displayName: 'ผู้ดูแลระบบ TaxFlow', entityType: 'individual', taxId: '', address: '',
    passwordHash: auth.hashPassword(password),
    emailVerified: true, verifyStatus: 'verified', verifiedAt: now,
    consent: pdpa.makeConsentRecord(pdpa.PURPOSES.map((x) => x.key)),
  });
  await store.insert('consents', { userId: user.id, version: pdpa.CONSENT_VERSION, purposes: pdpa.PURPOSES.map((x) => x.key), action: 'admin-create', at: now });
  await store.insert('audit_log', { userId: user.id, docId: null, action: 'register', detail: 'สร้างบัญชีผู้ดูแลระบบด้วย scripts/create-admin.js', actor: 'ระบบ', at: now });
  console.log(`สร้างบัญชีผู้ดูแลระบบแล้ว: ${key} (#${user.id})`);
}

main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
