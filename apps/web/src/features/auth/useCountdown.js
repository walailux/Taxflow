import { useCallback, useEffect, useState } from 'react';

/** นับถอยหลังทีละวินาที start(45) เพื่อเริ่มใหม่ คืน [วินาทีที่เหลือ, start] */
export function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const start = useCallback((sec) => setLeft(sec), []);
  return [left, start];
}
