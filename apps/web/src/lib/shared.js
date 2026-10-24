/**
 * shared.js จุดเดียวที่นำเข้า packages/shared (CommonJS) มาใช้ในหน้าเว็บ
 * import แบบ default ได้ module.exports ทั้งก้อน ทั้งใน Vite (esbuild แปลงให้) และใน Node
 * กติกาภาษีและกติกาตรวจข้อมูลจึงเป็นชุดเดียวกับฝั่ง API ตามหลักของ WP1
 */
import shared from '@taxflow/shared';

export const { docschema, tax, pit, thaiid, taxcalendar, calendar } = shared;
