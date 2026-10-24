/**
 * ocr.js อ่านข้อความภาษาไทย+อังกฤษจากภาพด้วย tesseract.js (โหลดเฉพาะตอนต้องใช้)
 * ไฟล์ worker / core / ข้อมูลภาษา เสิร์ฟจาก /ocr/ ของเว็บเอง (ดู ocrAssets ใน vite.config.js) ไม่เรียก CDN ภายนอก
 */
export async function ocrCanvas(canvas, onProgress = () => {}) {
  const { createWorker, OEM } = await import('tesseract.js');
  const base = `${import.meta.env.BASE_URL || '/'}ocr`;
  const worker = await createWorker(['tha', 'eng'], OEM.LSTM_ONLY, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    gzip: true,
    workerBlobURL: false,
    logger: (m) => { if (m.status === 'recognizing text') onProgress(m.progress); },
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}
