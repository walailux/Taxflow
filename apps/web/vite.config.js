import fs from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * vite.config.js — WP2
 * - ตอนพัฒนา หน้าเว็บ (5173) เรียก /api ผ่าน proxy ไปที่ API (4000) จึงเป็นโดเมนเดียวกันในมุมเบราว์เซอร์
 *   คุกกี้ SameSite=Lax ใช้ได้ทันทีโดยไม่ต้องตั้ง COOKIE_CROSS_SITE หรือ AUTH_HEADER_MODE
 * - packages/shared เป็น CommonJS (require/module.exports) ต้องบอก Vite ให้แปลงเป็น ESM ทั้งตอน dev
 *   (optimizeDeps) และตอน build (commonjsOptions) ไม่งั้นเบราว์เซอร์ฟ้อง "require is not defined"
 *   regex ใช้ [\\/] เพื่อให้ตรงทั้ง path แบบ Windows และ POSIX
 * - โหมด status (`vite build --mode status`): build เฉพาะหน้าสถานะ (src/status-main.jsx) ไปที่ dist-status
 *   ให้ API พอร์ต 4000 แสดงเมื่อเปิดพอร์ตนั้นตรง ๆ ใช้ index.html ไฟล์เดียวกัน แค่สลับไฟล์เริ่มต้น
 *   และไม่คัดลอกโฟลเดอร์ public ทั้งหมด (รูปมาสคอตหลาย MB) นอกจากโลโก้ที่หน้าสถานะใช้
 */

/**
 * ไฟล์ของ OCR (tesseract.js) สำหรับอ่าน 50 ทวิ จากรูปถ่าย/ไฟล์สแกน เสิร์ฟจากโดเมนเดียวกับหน้าเว็บ
 * ไม่ดึงจาก CDN: ภาพเอกสารภาษีของผู้ใช้จึงอ่านในเบราว์เซอร์ล้วน ไม่มีการเรียกออกไปภายนอก
 * ตอน dev ส่งไฟล์จาก node_modules ตรง ๆ · ตอน build คัดลอกไปที่ dist/ocr/
 * core ใช้เฉพาะรุ่น LSTM 3 แบบ (เบราว์เซอร์เลือกตามที่รองรับ SIMD) · ภาษาไทย+อังกฤษรุ่น best_int
 */
const OCR_FILES = {
  'ocr/worker.min.js': 'tesseract.js/dist/worker.min.js',
  'ocr/core/tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'ocr/core/tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'ocr/lang/tha.traineddata.gz': '@tesseract.js-data/tha/4.0.0_best_int/tha.traineddata.gz',
  'ocr/lang/eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
};

/** หาไฟล์ใน node_modules ของ apps/web หรือของ monorepo (npm workspaces ยกแพ็กเกจขึ้นไปไว้ที่ราก) */
function nodeModuleFile(rel) {
  for (const dir of ['./node_modules/', '../../node_modules/']) {
    const url = new URL(dir + rel, import.meta.url);
    if (fs.existsSync(url)) return url;
  }
  throw new Error(`ไม่พบ ${rel} ใน node_modules ให้รัน npm install ก่อน`);
}

function ocrAssets() {
  return {
    name: 'taxflow-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '');
        if (!OCR_FILES[key]) return next();
        res.setHeader('Content-Type', key.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(nodeModuleFile(OCR_FILES[key])).pipe(res);
      });
    },
    generateBundle() {
      for (const [fileName, rel] of Object.entries(OCR_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(nodeModuleFile(rel)) });
      }
    },
  };
}

function statusEntry() {
  return {
    name: 'taxflow-status-entry',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replace('/src/main.jsx', '/src/status-main.jsx') },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'img/logo.png', source: fs.readFileSync(new URL('./public/img/logo.png', import.meta.url)) });
    },
  };
}

/**
 * รหัสข้อผิดพลาดที่แปลว่า "ต่อ API ไม่ติด/หลุดกลางคัน" ซึ่งเป็นเรื่องปกติระหว่างพัฒนา
 * (API รีสตาร์ตเองเมื่อแก้โค้ด คำขอที่ค้างอยู่จะหลุดทั้งหมด) ไม่ใช่บั๊กที่ต้องดู stack
 */
const EXPECTED_DOWN = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT', 'ESOCKETTIMEDOUT']);

/** สรุปเป็นบรรทัดเดียว และไม่พิมพ์ซ้ำถี่กว่า 3 วินาที (คำขอหลายเส้นหลุดพร้อมกันเสมอ) */
let lastDownLog = 0;
function logApiDown(err) {
  const code = (err && err.code) || 'UNKNOWN';
  if (!EXPECTED_DOWN.has(code)) return; // ข้อผิดพลาดแปลก ๆ ปล่อยให้ Vite พิมพ์ stack ตามเดิม
  const now = Date.now();
  if (now - lastDownLog < 3000) return;
  lastDownLog = now;
  console.log(`[33m[proxy][0m ต่อ API (${apiTargetForLog}) ไม่ได้ชั่วคราว (${code}) — ปกติคือ API กำลังรีสตาร์ต หน้าเว็บจะลองใหม่เอง`);
}
let apiTargetForLog = '';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://localhost:4000';
  apiTargetForLog = apiTarget;
  const status = mode === 'status';
  return {
    plugins: [react(), tailwindcss(), status ? statusEntry() : ocrAssets()],
    publicDir: status ? false : 'public',
    server: {
      port: 5173,
      strictPort: true, // WEB_ORIGINS ของ API อนุญาตพอร์ต 5173 ไว้ ถ้าย้ายพอร์ตเองคำขอ POST จะโดนกัน CSRF
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // เปิด API ไม่ติด: ตอบ 502 พร้อม header ให้หน้าเว็บรู้ว่า "ยังไม่ได้เปิด API" แทน 500 เปล่า ๆ ของ Vite
          configure(proxy) {
            proxy.on('error', (err, req, res) => {
              logApiDown(err);
              if (!res || res.headersSent || typeof res.writeHead !== 'function') return;
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'X-TaxFlow-Api-Down': '1' });
              res.end(JSON.stringify({ error: 'เชื่อมต่อ API ไม่ได้ ตรวจว่าเปิด API ไว้แล้ว (npm run dev หรือ npm run dev:all)', apiDown: true }));
            });
            // Vite ผูก listener 'error' ของตัวเองต่อจาก configure() แล้วพิมพ์ stack เต็มทุกคำขอ
            // ตอน API รีสตาร์ต (node --watch) คำขอที่ค้างอยู่จะหลุดพร้อมกันหมด คอนโซลเลยท่วมด้วย
            // ECONNRESET/ECONNREFUSED ซ้ำ ๆ จนกลบข้อผิดพลาดจริง ห่อไว้ให้ข้ามเฉพาะกรณีปลายทางหลุดแบบนี้
            const on = proxy.on.bind(proxy);
            proxy.on = (event, handler) => on(event, event !== 'error' ? handler
              : (err, ...rest) => { if (!EXPECTED_DOWN.has(err && err.code)) handler(err, ...rest); });
          },
        },
      },
    },
    // force: pre-bundle packages/shared ใหม่ทุกครั้งที่เริ่ม dev server เพราะ Vite ไม่รู้ว่าโค้ดใน workspace package
    // เปลี่ยน (เช่น เพิ่มโมดูล pit.js) แล้วจะใช้ฉบับเก่าในแคชต่อ ทำให้ค่าที่ export ใหม่เป็น undefined
    optimizeDeps: { include: ['@taxflow/shared'], force: true },
    build: {
      commonjsOptions: { include: [/packages[\\/]shared/, /node_modules/] },
      ...(status ? { outDir: 'dist-status', emptyOutDir: true } : {}),
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.js'],
      // ให้ Node โหลด packages/shared แบบ CommonJS ตรง ๆ ไม่ผ่านตัวแปลงของ Vite
      server: { deps: { external: [/packages[\\/]shared/] } },
    },
  };
});
