/**
 * SignaturePad.jsx เลือกวิธีลงลายมือชื่อ: คลังลายเซ็น · วาด · อัปโหลดรูป (ย้ายจาก documents.js)
 * วาดบน canvas รองรับทั้งเมาส์และนิ้ว (pointer events) ย้อนกลับทีละเส้นได้
 */
import { useEffect, useRef, useState } from 'react';
import { readDataUrl } from './docsApi.js';
import { useToast } from '../../components/Toast.jsx';
import { Button, Spinner, cx } from '../../components/ui.jsx';

const MODES = [
  { id: 'saved', label: 'คลังลายเซ็น' },
  { id: 'draw', label: 'วาดลายเซ็น' },
  { id: 'upload', label: 'อัปโหลดรูป' },
];
const SIG_MAX = 2 * 1024 * 1024;

export default function SignaturePad({ savedItems, loadingSaved, onUseSaved, onDeleteSaved, onSign }) {
  const toast = useToast();
  const [mode, setMode] = useState('saved');
  const [keep, setKeep] = useState(true);
  const [upload, setUpload] = useState(null);
  const [drawn, setDrawn] = useState(false);
  const canvas = useRef(null);
  const strokes = useRef([]);
  const drawing = useRef(false);
  const file = useRef(null);

  // ไม่มีลายเซ็นในคลัง เริ่มที่โหมดวาดเลย (เหมือนหน้าเดิม)
  useEffect(() => { if (!loadingSaved && savedItems.length === 0) setMode((m) => (m === 'saved' ? 'draw' : m)); }, [loadingSaved, savedItems.length]);

  function ctx() {
    const c = canvas.current;
    const g = c.getContext('2d');
    g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1C1B1F';
    return g;
  }
  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.current.width / r.width), y: (e.clientY - r.top) * (canvas.current.height / r.height) };
  };
  function start(e) {
    e.preventDefault();
    drawing.current = true;
    strokes.current.push(ctx().getImageData(0, 0, canvas.current.width, canvas.current.height));
    const p = pos(e);
    const g = ctx();
    g.beginPath();
    g.moveTo(p.x, p.y);
    canvas.current.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!drawing.current) return;
    const p = pos(e);
    const g = ctx();
    g.lineTo(p.x, p.y);
    g.stroke();
    setDrawn(true);
  }
  const end = () => { drawing.current = false; };
  function undo() {
    const prev = strokes.current.pop();
    if (!prev) return;
    ctx().putImageData(prev, 0, 0);
    if (!strokes.current.length) setDrawn(false);
  }
  function clear() {
    ctx().clearRect(0, 0, canvas.current.width, canvas.current.height);
    strokes.current = [];
    setDrawn(false);
  }

  async function pickImage(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast('รองรับเฉพาะไฟล์รูปภาพ', 'err'); return; }
    if (f.size > SIG_MAX) { toast('รูปเกิน 2 MB', 'err'); return; }
    setUpload(await readDataUrl(f));
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="วิธีลงลายมือชื่อ">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cx('cursor-pointer whitespace-nowrap rounded-full border-[1.5px] px-3.5 py-1.5 text-[0.875rem] font-semibold',
              mode === m.id ? 'border-orange bg-orange-pale text-orange-deep' : 'border-line text-ink-soft hover:border-orange-soft')}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'saved' && (
        <div>
          {loadingSaved && <p className="flex items-center gap-2 text-[0.90625rem] text-ink-soft"><Spinner /> กำลังโหลด</p>}
          {!loadingSaved && !savedItems.length && (
            <p className="text-[0.90625rem] text-ink-soft">ยังไม่มีลายเซ็นในคลัง วาดหรืออัปโหลดครั้งแรก ระบบจะบันทึกให้อัตโนมัติ แล้วครั้งต่อไปเลือกใช้จากรายการนี้ได้</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {savedItems.map((x) => (
              <div key={x.id} className="rounded-xl border border-line p-3 text-center">
                <img src={x.image} alt={x.name} className="mx-auto h-16 w-auto" />
                <p className="my-1.5 truncate text-[0.875rem] font-semibold">{x.name}</p>
                <div className="flex justify-center gap-2">
                  <Button className="px-3 py-1.5 text-[0.875rem]" onClick={() => onUseSaved(x)}>ใช้ลงนาม</Button>
                  <button type="button" className="tf-btn tf-btn-ghost border-danger px-3 py-1.5 text-[0.875rem] text-danger" onClick={() => onDeleteSaved(x.id)}>ลบ</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'draw' && (
        <div>
          <canvas
            ref={canvas}
            width={440}
            height={150}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="w-full touch-none rounded-xl border-[1.5px] border-dashed border-line bg-white"
            aria-label="พื้นที่วาดลายเซ็น"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" className="px-3.5 py-2 text-[0.875rem]" onClick={undo}>ย้อนกลับ 1 เส้น</Button>
            <Button variant="ghost" className="px-3.5 py-2 text-[0.875rem]" onClick={clear}>ล้าง</Button>
            <Button
              className="px-4 py-2 text-[0.90625rem]"
              onClick={() => (drawn ? onSign(canvas.current.toDataURL('image/png'), '', keep) : toast('กรุณาวาดลายเซ็นก่อน', 'err'))}
            >
              ลงลายมือชื่อดิจิทัล
            </Button>
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <div>
          <div className="rounded-2xl border-[1.5px] border-dashed border-line p-5 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void pickImage(e.dataTransfer.files[0]); }}
          >
            <input ref={file} type="file" aria-label="เลือกรูปลายเซ็น" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickImage(e.target.files[0])} />
            <p className="text-[0.9375rem]">
              ลากรูปลายเซ็น/ตราประทับบริษัทมาวาง หรือ{' '}
              <button type="button" className="cursor-pointer font-bold text-orange-deep underline" onClick={() => file.current.click()}>เลือกไฟล์</button>
            </p>
            <p className="mt-1 text-[0.84375rem] text-ink-soft">PNG พื้นหลังโปร่งใสจะสวยที่สุด · ไม่เกิน 2 MB</p>
          </div>
          {upload && (
            <div className="tf-reveal mt-3">
              <img src={upload} alt="ตัวอย่างลายเซ็น" className="max-h-28 w-auto rounded-xl border border-line bg-white p-2" />
              <Button className="mt-3 px-4 py-2 text-[0.90625rem]" onClick={() => onSign(upload, '', keep)}>ลงลายมือชื่อดิจิทัลด้วยรูปนี้</Button>
            </div>
          )}
        </div>
      )}

      {mode !== 'saved' && (
        <label className="tf-choice mt-3">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span className="text-[0.90625rem]">บันทึกลายเซ็นนี้เข้าคลังไว้ใช้ครั้งต่อไป</span>
        </label>
      )}
    </>
  );
}
