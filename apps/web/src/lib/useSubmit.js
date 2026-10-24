/**
 * useSubmit.js กันกดปุ่มส่งข้อมูลซ้ำ
 * state busy อย่างเดียวกันไม่ได้ เพราะการกดรัว ๆ ในจังหวะเดียวกัน (หรือดับเบิลคลิก) เกิดขึ้นก่อน React จะ render ใหม่
 * จึงล็อกด้วย ref ที่มีผลทันที แล้วใช้ busy สำหรับแสดงสถานะบนปุ่มเท่านั้น
 */
import { useCallback, useRef, useState } from 'react';

export function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = useCallback(async (...args) => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await fn(...args);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [fn]);
  return [busy, run];
}
