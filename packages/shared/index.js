'use strict';
/**
 * packages/shared — ตรรกะที่ใช้ร่วมกันทั้งฝั่ง API และฝั่งหน้าเว็บ React (WP1)
 * -------------------------------------------------------------------------
 * ไฟล์ในโฟลเดอร์นี้ต้องไม่อ้างถึง Express, ฐานข้อมูล หรือระบบไฟล์ใดๆ
 * เพื่อให้ import ไปใช้ในเบราว์เซอร์ได้โดยตรง (ข้อกำหนดของ WP2)
 */
module.exports = {
  docschema: require('./docschema.js'),
  tax: require('./tax.js'),
  pit: require('./pit.js'),
  thaiid: require('./thaiid.js'),
  taxcalendar: require('./taxcalendar.js'),
  calendar: require('./calendar.js'),
};
