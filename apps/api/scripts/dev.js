'use strict';
/**
 * scripts/dev.js ตัวรัน API ตอนพัฒนา (npm run dev) ใช้แทน `node --watch server.js`
 * ==========================================================================
 * ปัญหาของ node --watch บน Windows: fs.watch แจ้ง "change" แม้ไฟล์แค่ถูก "อ่าน"
 * (NTFS อัปเดตเวลาเข้าถึงล่าสุด: DisableLastAccess = System Managed) เช่น ตอน vite build
 * หรือเครื่องมืออื่นอ่าน packages/shared → API รีสตาร์ตเองกลางคัน คำขอที่ค้าง (เช่นเปิด PDF)
 * จึงหลุดเป็น "เชื่อมต่อ API ไม่ได้"
 *
 * สคริปต์นี้รีสตาร์ตเฉพาะเมื่อ "เนื้อไฟล์เปลี่ยนจริง" (เทียบเวลาแก้ไข + ขนาดไฟล์ที่จำไว้)
 * และถ้า API ล่มเอง (crash) จะเปิดใหม่ให้อัตโนมัติ (หน่วงเพิ่มขึ้นถ้าล่มซ้ำถี่ ๆ)
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const API_DIR = path.resolve(__dirname, '..');
const WATCH_DIRS = [API_DIR, path.resolve(API_DIR, '..', '..', 'packages', 'shared')];
// โฟลเดอร์ที่ API เขียนเองหรือไม่ใช่โค้ด ไม่ต้องรีสตาร์ต
const IGNORE = /(^|[\\/])(node_modules|data|out|backups|test|\.git)([\\/]|$)/;
const WATCH_EXT = /\.(js|cjs|mjs|json)$|(^|[\\/])\.env$/;

const stamp = new Map(); // path -> "mtimeMs:size"
const keyOf = (file) => {
  try { const s = fs.statSync(file); return `${s.mtimeMs}:${s.size}`; } catch { return 'gone'; }
};
function scan(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (IGNORE.test(path.relative(API_DIR, full)) && full.startsWith(API_DIR)) continue;
    if (ent.isDirectory()) scan(full);
    else if (WATCH_EXT.test(ent.name)) stamp.set(full, keyOf(full));
  }
}

let child = null;
let stopping = false;
let crashes = [];
const log = (msg) => console.log(`\x1b[36m[dev]\x1b[0m ${msg}`);

function start() {
  child = spawn(process.execPath, ['server.js'], { cwd: API_DIR, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) { stopping = false; start(); return; }
    if (signal === 'SIGINT' || signal === 'SIGTERM') return;
    // ล่มเอง: เปิดใหม่ หน่วง 1 วินาที ถ้าล่มเกิน 3 ครั้งใน 30 วินาทีหน่วง 10 วินาที (กันวนเร็วตอนโค้ดเสีย)
    const now = Date.now();
    crashes = crashes.filter((t) => now - t < 30_000).concat(now);
    const wait = crashes.length > 3 ? 10_000 : 1_000;
    log(`API หยุดทำงาน (exit ${code}) จะเปิดใหม่ใน ${wait / 1000} วินาที · ถ้าล่มซ้ำ ดูข้อความ error ด้านบน`);
    setTimeout(() => { if (!child) start(); }, wait);
  });
}

let timer = null;
function onEvent(dir, name) {
  if (!name) return;
  const full = path.join(dir, name);
  if (!WATCH_EXT.test(full) || (full.startsWith(API_DIR) && IGNORE.test(path.relative(API_DIR, full)))) return;
  const now = keyOf(full);
  if (stamp.get(full) === now) return; // แค่ถูกอ่าน / เปลี่ยนเวลาเข้าถึง ไม่ใช่การแก้ไข
  stamp.set(full, now);
  clearTimeout(timer);
  timer = setTimeout(() => {
    log(`ไฟล์เปลี่ยน: ${path.relative(path.resolve(API_DIR, '..', '..'), full)} → รีสตาร์ต API`);
    if (child) { stopping = true; child.kill(); } else start();
  }, 200);
}

for (const dir of WATCH_DIRS) {
  if (!fs.existsSync(dir)) continue;
  scan(dir);
  fs.watch(dir, { recursive: true }, (_ev, name) => onEvent(dir, name));
}
log(`เฝ้าดูไฟล์ ${stamp.size} ไฟล์ใน apps/api และ packages/shared (รีสตาร์ตเมื่อเนื้อไฟล์เปลี่ยนจริงเท่านั้น)`);
start();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { if (child) child.kill(sig); process.exit(0); });
}
