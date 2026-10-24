'use strict';
/**
 * core/store.js เลือกชั้นเข้าถึงข้อมูลเพียงจุดเดียวของทั้งระบบ
 * ตั้ง DATABASE_URL -> PostgreSQL (lib/store.pg.js) ไม่ตั้ง -> SQLite เดิม (lib/store.js)
 * ทุกฟังก์ชันถูกเรียกผ่าน await เสมอ จึงทำงานถูกต้องกับทั้งสองแบบ
 * WP3 จะเปลี่ยนค่าเริ่มต้นของโปรเจกต์ให้ชี้ Supabase ผ่านตัวแปรแวดล้อมนี้
 */
module.exports = process.env.DATABASE_URL ? require('../lib/store.pg') : require('../lib/store');
