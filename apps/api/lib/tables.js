'use strict';
/**
 * lib/tables.js ตารางทั้งหมดและคอลัมน์ที่คัดออกมาเป็นคอลัมน์จริง (มีดัชนี) ชุดเดียวที่ใช้ร่วมกัน
 * lib/store.js (SQLite) · lib/store.pg.js (PostgreSQL) · scripts/migrate-sqlite-to-pg.js
 * เพิ่มตารางหรือคอลัมน์ที่นี่ที่เดียว แล้วเพิ่มคำสั่งสร้างตารางใน lib/store.js และ sql/postgres-schema.sql
 */
const INDEXED = {
  users: ['email'],
  documents: ['userId', 'type'],
  contacts: ['userId'],
  attachments: ['userId', 'docId'],
  doc_versions: ['docId'],
  audit_log: ['userId', 'docId'],
  notifications: ['userId'],
  shares: ['token', 'docId'],
  library: ['userId', 'category'],
  signatures: ['userId'],
  requests: ['docId', 'fromUserId', 'toUserId'],
  otp_codes: ['userId', 'purpose'],
  kyc_documents: ['userId', 'docType'],
  consents: ['userId'],
  calendar_events: ['userId'],
  calendar_overrides: ['userId'],
};

/** ตารางข้อมูล (ไม่รวม counters ที่เป็นตัวนับเลขที่เอกสาร) */
const TABLES = Object.keys(INDEXED);

module.exports = { INDEXED, TABLES };
