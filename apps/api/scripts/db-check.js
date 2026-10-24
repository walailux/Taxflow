'use strict';
/**
 * scripts/db-check.js หาสาเหตุที่เชื่อมต่อฐานข้อมูลไม่ได้ (เครื่องมือแก้ปัญหา)
 * ==========================================================================
 * ข้อความ "password authentication failed" บอกแค่ว่าไม่ผ่าน ไม่บอกว่าทำไม
 * สคริปต์นี้แยกสาเหตุที่เป็นไปได้ออกจากกันทีละข้อ แล้วชี้ว่าต้องแก้ตรงไหน
 *
 * สาเหตุที่แยกออกจากกันได้
 *   1) ตัว connection string ถูกแกะค่าผิด (อักขระพิเศษในรหัสผ่านทำให้ URL เพี้ยน)
 *   2) ชื่อผู้ใช้ถูกตัดที่จุด ทำให้ Supabase หาโปรเจกต์ไม่เจอ
 *   3) รหัสผ่านมีช่องว่างหรือขึ้นบรรทัดใหม่ติดมาตอนคัดลอก
 *   4) รหัสผ่านผิดจริง ๆ
 *
 * วิธีทดสอบที่ชี้ขาด: ลองต่อสองแบบเทียบกัน
 *   แบบ A ส่ง connectionString ให้ไลบรารีแกะเอง (แบบที่ระบบใช้อยู่)
 *   แบบ B แยกชื่อผู้ใช้ รหัสผ่าน โฮสต์ ออกเป็นค่าแยก ไม่ผ่านการแกะ URL เลย
 * ถ้าแบบ B ผ่านแต่แบบ A ไม่ผ่าน แปลว่าปัญหาอยู่ที่การแกะ URL ไม่ใช่รหัสผ่าน
 *
 * วิธีใช้:  npm run db:check
 * สคริปต์นี้ไม่แสดงรหัสผ่าน ส่งผลลัพธ์ให้คนอื่นดูได้อย่างปลอดภัย
 */

require('./_env');

/**
 * ถอดรหัส URL แบบไม่ล้ม
 * decodeURIComponent จะโยน error ทันทีถ้าเจอ % ที่ไม่ได้ตามด้วยเลขฐานสิบหกสองตัว
 * ซึ่งเกิดขึ้นจริงเมื่อรหัสผ่านมีเครื่องหมาย % ปนอยู่ และนั่นคือสาเหตุหนึ่งที่เชื่อมต่อไม่ได้
 * จึงต้องดักไว้ แล้วรายงานให้ผู้ใช้รู้ แทนที่จะให้เครื่องมือวินิจฉัยพังเสียเอง
 */
function safeDecode(value) {
  try { return { value: decodeURIComponent(value || ''), malformed: false }; }
  catch { return { value: value || '', malformed: true }; }
}

/** อธิบายรหัสผ่านโดยไม่เปิดเผยตัวรหัส */
function describeSecret(pw) {
  if (!pw) return '(ว่าง)';
  const classes = [];
  if (/[a-z]/.test(pw)) classes.push('พิมพ์เล็ก');
  if (/[A-Z]/.test(pw)) classes.push('พิมพ์ใหญ่');
  if (/[0-9]/.test(pw)) classes.push('ตัวเลข');
  const specials = pw.match(/[^A-Za-z0-9]/g) || [];
  if (specials.length) classes.push(`อักขระพิเศษ ${[...new Set(specials)].map((c) => (c === ' ' ? '(ช่องว่าง)' : c)).join(' ')}`);
  return `ยาว ${pw.length} ตัว · ${classes.join(', ')}`;
}

function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error('ไม่พบ DATABASE_URL ใน apps/api/.env — รัน npm run env:check ดูก่อน');
    process.exit(1);
  }

  console.log('=== 1) ตรวจตัว connection string ===\n');

  /* ---------- แกะด้วย URL มาตรฐานของ Node ---------- */
  let u;
  try {
    u = new URL(raw);
  } catch (err) {
    console.error('แกะ DATABASE_URL ไม่ได้เลย:', err.message);
    console.error('บรรทัดนี้ไม่ใช่ URL ที่ถูกต้อง ตรวจว่าไม่มีช่องว่างหรือเครื่องหมายคำพูดปนอยู่');
    process.exit(1);
  }

  const userDec = safeDecode(u.username);
  const passDec = safeDecode(u.password);
  const user = userDec.value;
  const password = passDec.value;
  const host = u.hostname;
  const port = u.port || '5432';
  const database = (u.pathname || '/postgres').replace(/^\//, '');

  console.log(`ชื่อผู้ใช้   : ${user}`);
  console.log(`โฮสต์      : ${host}`);
  console.log(`พอร์ต      : ${port}`);
  console.log(`ฐานข้อมูล   : ${database}`);
  console.log(`รหัสผ่าน    : ${describeSecret(password)}`);

  /* ---------- ตรวจสิ่งที่มักผิด ---------- */
  console.log('\n=== 2) จุดที่มักผิด ===\n');
  const warn = [];

  const isPooler = /pooler\.supabase\.com$/.test(host);
  const isDirect = /^db\..*\.supabase\.co$/.test(host);

  if (isDirect) {
    warn.push('ใช้ Direct connection ซึ่งเป็น IPv6 อย่างเดียว เน็ตที่เป็น IPv4 จะต่อไม่ได้ — ควรเปลี่ยนไปใช้ Session pooler');
  }
  if (isPooler && !user.includes('.')) {
    warn.push(`ใช้ pooler แต่ชื่อผู้ใช้เป็น "${user}" ซึ่งไม่มีจุด — ต้องเป็น postgres.<project-ref> มิฉะนั้น Supabase หาโปรเจกต์ไม่เจอ`);
  }
  if (isPooler && user.includes('.')) {
    console.log(`ชื่อผู้ใช้มี project ref ต่อท้ายแล้ว: ${user.split('.').slice(1).join('.')}`);
  }
  if (/[\[\]]/.test(password) || /YOUR-PASSWORD/i.test(password)) {
    warn.push('รหัสผ่านยังเป็นข้อความตัวอย่าง [YOUR-PASSWORD] — ต้องแทนด้วยรหัสจริงและลบวงเล็บเหลี่ยม');
  }
  if (/^\s|\s$/.test(password)) {
    warn.push('รหัสผ่านมีช่องว่างอยู่หน้าหรือหลัง — มักติดมาตอนคัดลอกวาง ให้ลบออก');
  }
  if (passDec.malformed) {
    warn.push('รหัสผ่านมีเครื่องหมาย % ที่ไม่ใช่รหัส URL ที่ถูกต้อง ไลบรารีจึงแกะค่าไม่ได้และส่งรหัสผิดไป '
      + '— ต้องตั้งรหัสใหม่เป็นตัวอักษรกับตัวเลขล้วน หรือย้ายรหัสไปไว้ในตัวแปร PGPASSWORD แยกต่างหาก');
  } else if (/%/.test(u.password || '')) {
    warn.push('รหัสผ่านในบรรทัดมีเครื่องหมาย % ซึ่งถูกตีความเป็นรหัส URL ทำให้ค่าที่ส่งจริงเพี้ยนไปจากที่พิมพ์');
  }
  if (/[@:/?#]/.test(password)) {
    warn.push(`รหัสผ่านมีอักขระที่ทำให้ URL เพี้ยน (${[...new Set(password.match(/[@:/?#]/g))].join(' ')}) — ควรตั้งรหัสใหม่เป็นตัวอักษรกับตัวเลขล้วน`);
  }
  if (!warn.length) console.log('ไม่พบความผิดปกติในตัวข้อความ');
  else warn.forEach((w, i) => console.log(`${i + 1}. ${w}`));

  /* ---------- ลองต่อจริงสองแบบ ---------- */
  console.log('\n=== 3) ลองเชื่อมต่อจริง ===\n');

  let Client;
  try { ({ Client } = require('pg')); } catch {
    console.error("ไม่พบแพ็กเกจ 'pg' ติดตั้งด้วย npm install ที่โฟลเดอร์บนสุดก่อน");
    process.exit(1);
  }

  const ssl = { rejectUnauthorized: false };

  async function tryConnect(label, config) {
    const client = new Client(config);
    try {
      await client.connect();
      const { rows } = await client.query('SELECT current_user, version()');
      console.log(`${label}: สำเร็จ (เข้าสู่ระบบเป็น ${rows[0].current_user})`);
      await client.end();
      return true;
    } catch (err) {
      console.log(`${label}: ไม่สำเร็จ — ${err.message}${err.code ? ` [รหัส ${err.code}]` : ''}`);
      try { await client.end(); } catch { /* ปิดไม่ได้ก็ไม่เป็นไร */ }
      return false;
    }
  }

  (async () => {
    const a = await tryConnect('แบบ A ส่ง connection string ทั้งบรรทัด', { connectionString: raw, ssl, connectionTimeoutMillis: 15000 });
    const b = await tryConnect('แบบ B แยกค่าทีละช่อง ไม่ผ่านการแกะ URL', { user, password, host, port: Number(port), database, ssl, connectionTimeoutMillis: 15000 });

    console.log('\n=== 4) สรุปและสิ่งที่ต้องทำต่อ ===\n');
    if (a && b) {
      console.log('เชื่อมต่อได้ทั้งสองแบบ ตั้งค่าถูกต้องแล้ว รันต่อได้เลย:  npm run db:setup');
    } else if (!a && b) {
      console.log('รหัสผ่านถูกต้อง แต่การแกะ connection string ทำให้ค่าเพี้ยน');
      console.log('แก้โดยแยกรหัสผ่านออกมาเป็นบรรทัดของตัวเองใน apps/api/.env แทน:');
      console.log('  DATABASE_URL=postgresql://<user>@<host>:<port>/<database>   (ตัดส่วน :รหัสผ่าน ออก)');
      console.log('  แล้วเพิ่มอีกบรรทัด: ชื่อ PGPASSWORD ตามด้วยเครื่องหมาย = และรหัสผ่านของคุณ');
      console.log('วิธีนี้รหัสผ่านไม่ต้องผ่านการแกะ URL จึงใช้อักขระพิเศษได้ทุกตัว');
    } else if (!a && !b) {
      console.log('เชื่อมต่อไม่ได้ทั้งสองแบบ แปลว่าปัญหาไม่ได้อยู่ที่รูปแบบข้อความ');
      console.log('ตรวจตามลำดับนี้');
      console.log('  1. กดปุ่ม Reset password สีเขียวแล้วจริงหรือยัง (แค่กด Copy ยังไม่มีผล)');
      console.log('  2. รหัสที่ใช้คือ Database password ไม่ใช่รหัสที่ล็อกอินเข้าเว็บ Supabase');
      console.log('  3. เพิ่งรีเซ็ตรหัส รอสัก 1-2 นาทีให้ pooler รับรู้ แล้วลองใหม่');
      console.log('  4. โปรเจกต์ถูกพัก (Paused) หรือเปล่า เข้าหน้าโปรเจกต์ดูว่าสถานะเป็น Active');
    }
    process.exit(a || b ? 0 : 1);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
