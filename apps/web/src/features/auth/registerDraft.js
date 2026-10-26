/**
 * registerDraft.js จำข้อมูลที่กรอกในหน้าสมัครสมาชิกไว้ในเครื่องนี้
 * ผู้ใช้ที่กรอกครบแล้วแต่ยังไม่พร้อมกรอก OTP (หรือออกจากหน้าไปก่อน) กลับมาแล้วไม่ต้องพิมพ์ใหม่
 * - ไม่เก็บรหัสผ่านทั้งสองช่อง (ความปลอดภัย) ผู้ใช้ตั้งใหม่ตอนกดสมัครอีกครั้ง
 * - เก็บไว้ 7 วัน ลบทิ้งเมื่อยืนยันอีเมลสำเร็จ หรือผู้ใช้กด "เริ่มกรอกใหม่"
 */
const KEY = 'tf_register_draft';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const NOT_SAVED = ['password', 'password2'];

export function loadRegisterDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || !d.form || Date.now() - Number(d.savedAt) > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

/** เก็บเมื่อเริ่มกรอกจริงแล้ว (ผ่านขั้นเลือกบทบาท หรือกรอกอีเมล/ชื่อ/เลขผู้เสียภาษี) ฟอร์มว่างไม่ต้องจำ */
export function saveRegisterDraft(form, step) {
  if (Number(step) <= 1 && !form.email && !form.name && !form.taxId) return;
  const f = { ...form };
  for (const k of NOT_SAVED) delete f[k];
  try { localStorage.setItem(KEY, JSON.stringify({ form: f, step, savedAt: Date.now() })); } catch { /* ที่เก็บเต็ม/ถูกปิด ก็ไม่จำ */ }
}

export function clearRegisterDraft() {
  try { localStorage.removeItem(KEY); } catch { /* ไม่มีที่เก็บ */ }
}
