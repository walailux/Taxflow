'use strict';

/**
 * mailer.js ส่งอีเมลจริงด้วยโปรโตคอล SMTP ล้วน (Node core: tls) ไม่ใช้ไลบรารีภายนอก
 * -------------------------------------------------------------------------------
 * วิธีตั้งค่าให้ส่งอีเมล OTP เข้า Gmail จริง (ทำครั้งเดียว):
 * 1) เปิดการยืนยัน 2 ขั้นตอน (2-Step Verification) ในบัญชี Gmail ที่จะใช้ส่ง
 * https://myaccount.google.com/security
 * 2) สร้าง "รหัสผ่านแอป" (App Password) ที่ https://myaccount.google.com/apppasswords
 * (เลือกแอป "Mail" จะได้รหัส 16 หลัก เช่น abcd efgh ijkl mnop)
 * 3) คัดลอกไฟล์ data/mail.config.example.json → data/mail.config.json
 * แล้วกรอกอีเมลผู้ส่งกับรหัสแอปที่ได้ลงไป (ไฟล์นี้จะไม่ถูกอัปโหลดไปที่ไหน อยู่ในเครื่องเท่านั้น)
 * 4) รัน `node server.js` ใหม่ ระบบจะอ่านค่าไฟล์นี้และเริ่มส่งอีเมลจริงทันที
 *
 * ถ้ายังไม่ได้ตั้งค่า (ไม่มีไฟล์ / ไม่กรอกอีเมล-รหัส) ระบบจะเข้า "โหมดพัฒนา":
 * - จะไม่ส่งอีเมลจริง แต่จะพิมพ์รหัส OTP ออกทาง console ของเซิร์ฟเวอร์แทน
 * - และแนบรหัส (devCode) กลับไปกับ response ให้หน้าเว็บแสดงให้กรอกได้ทันที เพื่อไม่ให้ทดสอบระบบติดขัด
 * - เหมาะสำหรับพัฒนา/สาธิตในเครื่อง ไม่ควรใช้ในสภาพแวดล้อมจริง
 */

const fs = require('fs');
const path = require('path');
const tls = require('tls');
const crypto = require('crypto');

const DATA_DIR = process.env.TAXFLOW_DATA_DIR
  ? path.resolve(process.env.TAXFLOW_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'mail.config.json');

// รหัสผ่านแอปของ Gmail แสดงเป็น 4 กลุ่มคั่นด้วยช่องว่าง (เช่น "abcd efgh ijkl mnop") ตัดช่องว่างออกก่อนใช้
// คัดลอกมาแบบไหนก็ใช้ได้ (ตัวรหัสจริงไม่มีช่องว่าง)
const cleanPass = (p) => String(p || '').replace(/\s+/g, '');

function loadConfig() {
  // 1) ไฟล์ data/mail.config.json (แนะนำ ไม่ต้องตั้ง environment variable)
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (raw.user && raw.pass) {
        return {
          host: raw.host || 'smtp.gmail.com',
          port: Number(raw.port) || 465,
          user: raw.user,
          pass: cleanPass(raw.pass),
          fromName: raw.fromName || 'TaxFlow',
        };
      }
    }
  } catch { /* ไฟล์ผิดรูปแบบ ใช้ค่า env / โหมดพัฒนาแทน */ }

  // 2) environment variables (ทางเลือกสำหรับ deploy บนเซิร์ฟเวอร์จริง)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      user: process.env.SMTP_USER,
      pass: cleanPass(process.env.SMTP_PASS),
      fromName: process.env.SMTP_FROM_NAME || 'TaxFlow',
    };
  }
  return null; // ไม่ได้ตั้งค่า -> โหมดพัฒนา
}

const CONFIG = loadConfig();
const MAIL_CONFIGURED = !!CONFIG;
// ส่งรหัส OTP กลับมาใน response (devCode) ได้เฉพาะเมื่อ "ตั้งใจ" เปิดโหมดพัฒนาอย่างชัดเจน
// เท่านั้น (TAXFLOW_DEV=1) ไม่ใช่แค่ยังไม่ได้ตั้งค่าอีเมล เพราะมิฉะนั้นระบบยืนยันตัวตน
// ด้วย OTP ทั้งหมดจะถูกข้ามได้ทันทีถ้าลืมตั้งค่าอีเมลตอนขึ้น production
const DEV_EXPOSE_CODE = !MAIL_CONFIGURED && process.env.TAXFLOW_DEV === '1';

if (!MAIL_CONFIGURED) {
  console.log('\n[mailer] ยังไม่ได้ตั้งค่าอีเมลผู้ส่ง (data/mail.config.json) รหัส OTP จะแสดงทาง console ของเซิร์ฟเวอร์แทนการส่งอีเมลจริง');
  console.log(DEV_EXPOSE_CODE
    ? '[mailer] TAXFLOW_DEV=1 จะแนบรหัส OTP กลับไปกับ response ด้วย (ใช้เฉพาะพัฒนา/ทดสอบเท่านั้น ห้ามเปิดใน production)\n'
    : '[mailer] TAXFLOW_DEV ไม่ได้ตั้งเป็น 1 จะไม่แนบรหัส OTP กลับไปกับ response (ต้องอ่านจาก console ของเซิร์ฟเวอร์)\n');
} else {
  console.log(`[mailer] ตั้งค่าอีเมลผู้ส่งแล้ว: ${CONFIG.user} (${CONFIG.host}:${CONFIG.port}) จะส่งอีเมลจริง`);
  console.log('[mailer] ยกเว้นบัญชีโดเมนทดสอบ (เช่น @taxflow.test) รหัส OTP ของบัญชีเหล่านี้แสดงที่หน้าต่างนี้');
}

// ข้อผิดพลาดที่เกิดจากการเชื่อมต่อ (timeout/socket error) มีโอกาสเป็นปัญหาชั่วคราว ลองใหม่ได้
// ต่างจากข้อผิดพลาดระดับโปรโตคอล SMTP (auth ผิด, ปฏิเสธผู้รับ ฯลฯ) ที่ลองซ้ำก็ยังผิดเหมือนเดิม
// จึงแยกคลาสไว้ให้ sendMail() ตัดสินใจว่าควร retry หรือไม่
class TransientMailError extends Error {}

// ชื่อเครื่องที่แนะนำตัวกับ SMTP server ใช้ชื่อเครื่องจริง (เฉพาะตัวอักษรที่ใช้ในชื่อโฮสต์ได้) แทนโดเมนสมมติ
const EHLO_NAME = (require('os').hostname() || '').replace(/[^A-Za-z0-9.-]/g, '') || 'localhost';

/* ---------- SMTP client แบบดิบ (raw socket, ไม่ใช้ไลบรารีภายนอก) ---------- */
function smtpSend({ host, port, user, pass, from, fromName, to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, timeout: 15000 }, () => {});
    let buf = '';
    let step = 'greet';
    let finished = false;

    const fail = (err) => { if (finished) return; finished = true; try { socket.destroy(); } catch {} reject(err); };
    const succeed = () => { if (finished) return; finished = true; try { socket.end(); } catch {} resolve(); };

    socket.setTimeout(15000, () => fail(new TransientMailError('การเชื่อมต่อ SMTP หมดเวลา (timeout)')));
    socket.on('error', (e) => fail(new TransientMailError(e.message)));

    function write(line) { socket.write(line + '\r\n'); }

    function encodeSubject(s) {
      return '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
    }
    function encodeName(s) {
      return /^[\x20-\x7E]*$/.test(s) ? `"${s.replace(/"/g, '')}"` : encodeSubject(s);
    }
    function encodeBase64Body(s) {
      const b64 = Buffer.from(s, 'utf8').toString('base64');
      return (b64.match(/.{1,76}/g) || ['']).join('\r\n');
    }

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      // ยังไม่ครบก้อนข้อความ (บรรทัดสุดท้ายของ response ต้องเป็น "รหัส 3 หลัก + เว้นวรรค")
      if (!/^\d{3} /.test(last)) return;
      const code = last.slice(0, 3);
      buf = '';

      try {
        if (step === 'greet') {
          if (code !== '220') return fail(new Error('SMTP server ปฏิเสธการเชื่อมต่อ: ' + last));
          write(`EHLO ${EHLO_NAME}`); step = 'ehlo';
        } else if (step === 'ehlo') {
          if (code !== '250') return fail(new Error('EHLO ไม่สำเร็จ: ' + last));
          write('AUTH LOGIN'); step = 'auth-user';
        } else if (step === 'auth-user') {
          if (code !== '334') return fail(new Error('เซิร์ฟเวอร์ไม่รองรับ AUTH LOGIN: ' + last));
          write(Buffer.from(user, 'utf8').toString('base64')); step = 'auth-pass';
        } else if (step === 'auth-pass') {
          if (code !== '334') return fail(new Error('ส่งชื่อผู้ใช้ไม่สำเร็จ: ' + last));
          write(Buffer.from(pass, 'utf8').toString('base64')); step = 'auth-ok';
        } else if (step === 'auth-ok') {
          if (code !== '235') return fail(new Error('เข้าสู่ระบบ SMTP ไม่สำเร็จ (ตรวจสอบอีเมล/รหัสผ่านแอปอีกครั้ง): ' + last));
          write(`MAIL FROM:<${user}>`); step = 'mail-from';
        } else if (step === 'mail-from') {
          if (code !== '250') return fail(new Error('MAIL FROM ไม่สำเร็จ: ' + last));
          write(`RCPT TO:<${to}>`); step = 'rcpt-to';
        } else if (step === 'rcpt-to') {
          if (code !== '250' && code !== '251') return fail(new Error('ไม่พบผู้รับปลายทาง หรือถูกปฏิเสธ: ' + last));
          write('DATA'); step = 'data';
        } else if (step === 'data') {
          if (code !== '354') return fail(new Error('เริ่มส่งเนื้อหาอีเมลไม่สำเร็จ: ' + last));
          // ไม่ใส่ Message-ID เอง ให้ Gmail สร้างให้ด้วยโดเมนจริงของผู้ส่ง (โดเมนปลอมอย่าง taxflow.local ทำให้ถูกมองเป็นสแปมง่ายขึ้น)
          // ส่งแบบ multipart/alternative มีทั้งข้อความล้วนและ HTML ตามที่โปรแกรมอีเมลทั่วไปคาดหวัง
          const boundary = `tf-${crypto.randomBytes(12).toString('hex')}`;
          const part = (type, body) => [
            `--${boundary}`,
            `Content-Type: ${type}; charset=UTF-8`,
            `Content-Transfer-Encoding: base64`,
            '', encodeBase64Body(body),
          ].join('\r\n');
          const headers = [
            `From: ${encodeName(fromName)} <${from}>`,
            `To: <${to}>`,
            `Subject: ${encodeSubject(subject)}`,
            `Date: ${new Date().toUTCString()}`,
            `MIME-Version: 1.0`,
            html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : `Content-Type: text/plain; charset=UTF-8`,
            ...(html ? [] : [`Content-Transfer-Encoding: base64`]),
            '',
            ...(html ? [part('text/plain', text), part('text/html', html), `--${boundary}--`] : [encodeBase64Body(text)]),
            '',
          ].join('\r\n');
          write(headers + '.'); step = 'sent';
        } else if (step === 'sent') {
          if (code !== '250') return fail(new Error('ส่งอีเมลไม่สำเร็จ: ' + last));
          write('QUIT'); step = 'quit';
        } else if (step === 'quit') {
          succeed();
        }
      } catch (e) { fail(e); }
    });
  });
}

/* ---------- ฟังก์ชันสาธารณะ ---------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// ลองใหม่เฉพาะตอนเชื่อมต่อ/timeout (TransientMailError) เท่านั้น ไม่ retry ตอน auth ผิดหรือ
// เซิร์ฟเวอร์ปฏิเสธผู้รับ เพราะลองซ้ำก็ยังผิดเหมือนเดิม แค่ทำให้ผู้ใช้รอ OTP นานขึ้นเปล่าๆ
const MAIL_RETRY_DELAYS_MS = [1500, 4000]; // ลองซ้ำได้สูงสุด 2 ครั้ง (รวมครั้งแรกเป็น 3 ครั้ง) แบบ backoff

/**
 * โดเมนที่สงวนไว้สำหรับทดสอบตาม RFC 2606 / RFC 6761 ไม่มีกล่องจดหมายจริง ส่งไปก็ไม่ถึงใคร
 * บัญชีทดลองของระบบ (creator@taxflow.test ฯลฯ) ใช้โดเมนเหล่านี้ เมื่อตั้งค่า Gmail แล้ว
 * จึงพิมพ์รหัสทาง console แทน ไม่ส่งออกจริง บัญชีทดลองจึงยังรับ OTP ได้ ส่วนอีเมลจริงส่งตามปกติ
 */
const RESERVED_MAIL_DOMAIN = /(?:\.(?:test|example|invalid|localhost)|(?:^|\.)example\.(?:com|net|org))$/i;
function isReservedDomain(address) {
  const domain = String(address || '').split('@').pop().trim().replace(/\.$/, '');
  return RESERVED_MAIL_DOMAIN.test(domain);
}

/** ส่งอีเมลทั่วไป คืนค่า {ok, dev} เสมอ (ไม่ throw ออกไปนอกฟังก์ชัน) */
async function sendMail({ to, subject, text, html }) {
  if (MAIL_CONFIGURED && isReservedDomain(to)) {
    console.log(`\n[mailer] (โดเมนทดสอบ ไม่มีกล่องจดหมายจริง จึงไม่ส่งออก อ่านรหัสจากที่นี่)\nถึง: ${to}\nเรื่อง: ${subject}\n${text}\n`);
    return { ok: true, dev: process.env.TAXFLOW_DEV === '1' };
  }
  if (!MAIL_CONFIGURED) {
    console.log(`\n[mailer] (โหมดพัฒนา ไม่ได้ส่งอีเมลจริง)\nถึง: ${to}\nเรื่อง: ${subject}\n${text}\n`);
    return { ok: true, dev: DEV_EXPOSE_CODE };
  }
  const opts = { host: CONFIG.host, port: CONFIG.port, user: CONFIG.user, pass: CONFIG.pass, from: CONFIG.user, fromName: CONFIG.fromName, to, subject, text, html };
  let lastErr;
  for (let attempt = 0; attempt <= MAIL_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await smtpSend(opts);
      return { ok: true, dev: false };
    } catch (err) {
      lastErr = err;
      const canRetry = err instanceof TransientMailError && attempt < MAIL_RETRY_DELAYS_MS.length;
      if (!canRetry) break;
      console.error(`[mailer] ส่งอีเมลล้มเหลว (ครั้งที่ ${attempt + 1}/${MAIL_RETRY_DELAYS_MS.length + 1}, ลองใหม่ใน ${MAIL_RETRY_DELAYS_MS[attempt]}ms): ${err.message}`);
      await sleep(MAIL_RETRY_DELAYS_MS[attempt]);
    }
  }
  console.error('[mailer] ส่งอีเมลล้มเหลว:', lastErr.message);
  return { ok: false, dev: false, error: lastErr.message };
}

const PURPOSE_TEXT = {
  'register': 'ยืนยันอีเมลเพื่อเปิดใช้งานบัญชีใหม่',
  'login': 'เข้าสู่ระบบ',
  'sign-doc': 'ลงลายมือชื่อดิจิทัลในเอกสาร',
  'sign-request': 'ลงลายมือชื่อดิจิทัลตอบกลับเอกสารที่ได้รับ',
  'delete-account': 'ลบบัญชีและข้อมูลส่วนบุคคล',
};

/** ส่งอีเมลรหัส OTP โดยเฉพาะ (ใช้ข้อความมาตรฐานเดียวกันทั้งระบบ) */
async function sendOtpEmail(to, { code, purpose, displayName }) {
  const action = PURPOSE_TEXT[purpose] || 'ยืนยันตัวตน';
  // ไม่ใส่รหัสในหัวเรื่อง และเลี่ยงถ้อยคำเร่งเร้า เพราะเป็นรูปแบบที่ตัวกรองสแปมจับบ่อย
  const subject = `TaxFlow: รหัสยืนยันสำหรับ${action}`;
  const name = displayName || 'ผู้ใช้งาน';
  const text =
`สวัสดีคุณ ${name}

รหัสยืนยันสำหรับ${action}ใน TaxFlow ของคุณคือ

    ${code}

รหัสนี้ใช้ได้ภายใน 5 นาที และใช้ได้ครั้งเดียว
หากคุณไม่ได้ทำรายการนี้ ไม่ต้องดำเนินการใด ๆ สามารถละเว้นอีเมลฉบับนี้ได้

ทีมงาน TaxFlow`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html =
`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f5f4f1;font-family:Tahoma,Arial,sans-serif;color:#1f1f1f">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:bold;color:#ff6a00">TaxFlow</td></tr>
<tr><td style="padding:8px 28px;font-size:15px;line-height:1.6">สวัสดีคุณ ${esc(name)}<br>รหัสยืนยันสำหรับ${esc(action)}ใน TaxFlow ของคุณคือ</td></tr>
<tr><td style="padding:12px 28px"><div style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;background:#f5f4f1;border-radius:8px;padding:14px 0">${esc(code)}</div></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:13px;line-height:1.6;color:#666666">รหัสนี้ใช้ได้ภายใน 5 นาที และใช้ได้ครั้งเดียว<br>หากคุณไม่ได้ทำรายการนี้ ไม่ต้องดำเนินการใด ๆ สามารถละเว้นอีเมลฉบับนี้ได้<br><br>ทีมงาน TaxFlow</td></tr>
</table></body></html>`;
  const result = await sendMail({ to, subject, text, html });
  return { ...result, dev: !!result.dev };
}

module.exports = { sendMail, sendOtpEmail, isReservedDomain, MAIL_CONFIGURED, DEV_EXPOSE_CODE };
