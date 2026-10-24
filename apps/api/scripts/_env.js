'use strict';
/**
 * scripts/_env.js อ่านไฟล์ .env ของ apps/api เข้ามาเป็น environment variable
 * เขียนเองสั้น ๆ แทนการติดตั้ง dotenv เพราะต้องการแค่ความสามารถพื้นฐาน
 * ค่าที่ตั้งมาจากภายนอกอยู่แล้วจะไม่ถูกเขียนทับ
 *
 * Node 22 มี --env-file ในตัวก็จริง แต่สคริปต์เหล่านี้ถูกเรียกได้หลายทาง
 * (npm script, node ตรง ๆ, หรือจากโฟลเดอร์อื่น) จึงอ่านเองให้แน่นอนกว่า
 */
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq < 1) continue;
    const key = text.slice(0, eq).trim();
    let value = text.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = { ENV_FILE };
