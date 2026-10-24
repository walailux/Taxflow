/**
 * EventEditor.jsx หน้าต่างเพิ่ม/แก้ไขกิจกรรมในปฏิทิน (ย้ายจาก calOpenEditor ใน calendar.js)
 * กิจกรรมของผู้ใช้: แก้ได้ทุกช่อง · กิจกรรมจากระบบ: บันทึกได้เฉพาะสถานะเสร็จ สัญลักษณ์ บันทึกของฉัน และไฟล์แนบ
 * ไฟล์ที่เลือกไว้จะอัปโหลดหลังบันทึกกิจกรรมสำเร็จ (ต้องมี id ก่อน)
 */
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { API_URL } from '../../lib/env.js';
import { DOC_LABEL } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Icon from '../../components/Icon.jsx';
import { Button, SelectField, TextField, cx } from '../../components/ui.jsx';
import { readDataUrl } from '../docs/docsApi.js';
import MarkerIcon from './MarkerIcon.jsx';
import { PURPOSE_HINTS, REMIND_OPTIONS, TEMPLATES, fileUrl, longDate } from './calUtils.js';

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export default function EventEditor({ event, day, meta, role, docs, onClose, onSaved, onDelete }) {
  const toast = useToast();
  const sys = event && event.source === 'system';
  const [f, setF] = useState(() => ({
    title: '', date: day, endDate: '', time: '', endTime: '', category: 'note', marker: 'none', priority: 'normal',
    purpose: '', note: '', linkDocId: '', remindDays: '1', done: false, userNote: '',
    ...(event ? {
      ...event, endDate: event.endDate || '', time: event.time || '', endTime: event.endTime || '',
      linkDocId: event.linkDocId ? String(event.linkDocId) : '', remindDays: event.remindDays == null ? '' : String(event.remindDays),
      userNote: event.userNote || '', purpose: event.purpose || '', note: event.note || '',
    } : {}),
  }));
  const [attachments, setAttachments] = useState((event && event.attachments) || []);
  const [pending, setPending] = useState([]);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [drag, setDrag] = useState(false);
  const titleRef = useRef(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const cat = (id) => meta.categories.find((c) => c.id === id) || { label: id, color: '#71717A' };

  useEffect(() => {
    if (!sys) titleRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !confirm) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sys, onClose, confirm]);

  function addFiles(list) {
    const next = [...pending];
    for (const file of [...list]) {
      if (attachments.length + next.length >= meta.maxAttachments) { toast(`แนบไฟล์ได้สูงสุด ${meta.maxAttachments} ไฟล์`, 'err'); break; }
      if (!ALLOWED.includes(file.type)) { toast(`"${file.name}" ไม่ใช่ไฟล์ PDF, PNG, JPG หรือ WEBP`, 'err'); continue; }
      if (file.size > 5 * 1024 * 1024) { toast(`"${file.name}" มีขนาดเกิน 5 MB`, 'err'); continue; }
      next.push(file);
    }
    setPending(next);
  }

  async function uploadPending(target) {
    for (const file of pending) {
      try {
        const dataUrl = await readDataUrl(file);
        await api.post('/api/calendar/files', { ...target, filename: file.name, mime: file.type, dataBase64: dataUrl.split(',')[1] });
      } catch (err) { toast(`แนบ "${file.name}" ไม่สำเร็จ: ${err.message}`, 'err'); }
    }
  }

  function removeFile(file) {
    setConfirm({
      title: 'ลบไฟล์แนบ?', message: file.filename, confirmText: 'ลบไฟล์', danger: true,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.post('/api/calendar/files/delete', sys ? { sysKey: event.id, fileId: file.id } : { eventId: event.id, fileId: file.id });
          setAttachments((xs) => xs.filter((x) => x.id !== file.id));
          toast('ลบไฟล์แนบแล้ว');
        } catch (err) { toast(err.message, 'err'); }
      },
    });
  }

  function validate() {
    const e = {};
    if (!f.title.trim()) e.title = 'กรุณากรอกชื่อกิจกรรม';
    if (!f.date) e.date = 'กรุณาเลือกวันที่';
    if (f.endDate && f.date && f.endDate < f.date) e.endDate = 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น';
    if (f.endTime && !f.time) e.endTime = 'กรุณาระบุเวลาเริ่มก่อน';
    else if (f.endTime && f.time && !f.endDate && f.endTime <= f.time) e.endTime = 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม';
    setErrs(e);
    return !Object.keys(e).length;
  }

  async function saveUser(skipCritical) {
    if (!validate()) { toast('พบข้อมูลที่ต้องแก้ไข กรุณาดูข้อความสีแดงใต้ช่อง', 'err'); return; }
    if (f.priority === 'critical' && !(event && event.priority === 'critical') && !skipCritical) {
      setConfirm({
        title: 'ยืนยันระดับสำคัญมาก', confirmText: 'ยืนยัน',
        message: 'กิจกรรมระดับ "สำคัญมาก" จะถูกล็อก ลบไม่ได้และลดระดับไม่ได้ภายหลัง ต้องการดำเนินการต่อหรือไม่',
        onConfirm: () => { setConfirm(null); void saveUser(true); },
      });
      return;
    }
    const body = {
      title: f.title.trim(), category: f.category, date: f.date, endDate: f.endDate, time: f.time, endTime: f.endTime,
      priority: f.priority, marker: f.marker, purpose: f.purpose, note: f.note, linkDocId: f.linkDocId || null, remindDays: f.remindDays,
    };
    setBusy(true);
    try {
      const r = event ? await api.put(`/api/calendar/${encodeURIComponent(event.id)}`, body) : await api.post('/api/calendar', body);
      await uploadPending({ eventId: event ? event.id : r.id });
      toast(event ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มกิจกรรมในปฏิทินแล้ว');
      onSaved(body.date);
    } catch (err) {
      if (err.data && err.data.fieldErrors) setErrs(err.data.fieldErrors);
      toast(err.message, 'err');
    } finally { setBusy(false); }
  }

  async function saveSystem() {
    setBusy(true);
    try {
      await api.post('/api/calendar/overrides', { sysKey: event.id, note: f.userNote, marker: f.marker, done: !!f.done });
      await uploadPending({ sysKey: event.id });
      toast('บันทึกแล้ว');
      onSaved(event.date);
    } catch (err) {
      if (err.data && err.data.fieldErrors) setErrs({ userNote: err.data.fieldErrors.note });
      toast(err.message, 'err');
    } finally { setBusy(false); }
  }

  const markerPicker = (
    <fieldset className="mb-4">
      <legend className="mb-1.5 text-[0.9375rem] font-medium">สัญลักษณ์</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {meta.markers.map((mk) => (
          <label key={mk.id} title={mk.label} className={cx('flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-xl px-2 text-[0.875rem] ring-1 transition-colors', f.marker === mk.id ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-line hover:ring-ink/30')}>
            <input type="radio" name="cal-marker" value={mk.id} checked={f.marker === mk.id} onChange={() => set('marker')(mk.id)} className="sr-only" />
            {mk.id === 'none' ? 'ไม่มี' : <MarkerIcon name={mk.id} className="size-[1.125rem]" />}
            <span className="sr-only">{mk.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const fileBox = (
    <div className="mb-2">
      <p className="mb-1.5 text-[0.9375rem] font-medium">ไฟล์แนบ <span className="font-normal text-ink-soft">(PDF, PNG, JPG, WEBP ไม่เกิน 5 MB สูงสุด {meta.maxAttachments} ไฟล์)</span></p>
      <div className="mb-2 flex flex-wrap gap-2">
        {attachments.map((file) => (
          <span key={file.id} className="flex items-center gap-1.5 rounded-full bg-tile py-1 pl-3 pr-1 text-[0.90625rem]">
            <MarkerIcon name="clip" className="size-3.5" />
            <a href={fileUrl(API_URL, event, file)} target="_blank" rel="noreferrer" className="max-w-[180px] truncate hover:underline">{file.filename}</a>
            <button type="button" aria-label={`ลบ ${file.filename}`} onClick={() => removeFile(file)} className="flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-danger-soft hover:text-danger"><Icon name="close" className="size-3.5" /></button>
          </span>
        ))}
        {pending.map((file, i) => (
          <span key={`p${i}`} className="flex items-center gap-1.5 rounded-full bg-orange-pale py-1 pl-3 pr-1 text-[0.90625rem]">
            <MarkerIcon name="clip" className="size-3.5" /><span className="max-w-[160px] truncate">{file.name}</span><small className="text-orange-deep">รอบันทึก</small>
            <button type="button" aria-label="นำไฟล์ออก" onClick={() => setPending((xs) => xs.filter((_, j) => j !== i))} className="flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-white"><Icon name="close" className="size-3.5" /></button>
          </span>
        ))}
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={cx('flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-4 text-[0.96875rem] transition-colors', drag ? 'border-orange bg-orange-pale' : 'border-line bg-tile text-ink-soft hover:text-ink')}
      >
        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <MarkerIcon name="clip" />ลากไฟล์มาวาง หรือ <u>เลือกไฟล์</u>
      </label>
    </div>
  );

  // วาดที่ document.body: ถ้าอยู่ใต้ element ที่มี backdrop-filter/transform กล่อง fixed จะถูกจำกัดอยู่ในกรอบนั้น
  return createPortal(
    <div role="presentation" className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ev-title" className="tf-pop flex max-h-[94vh] w-full max-w-[680px] flex-col rounded-t-[28px] bg-white sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-6">
          <div className="min-w-0">
            <p className="text-[0.90625rem] font-medium text-orange-deep">{sys ? 'กิจกรรมจากระบบ' : event ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรม'}</p>
            <h2 id="ev-title" className="truncate text-[1.375rem] font-medium">{event ? event.title : 'กิจกรรมใหม่ในปฏิทิน'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-tile text-ink-soft hover:text-ink"><Icon name="close" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {sys ? (
            <>
              <div className="mb-5 rounded-[20px] bg-tile p-4 text-[0.96875rem]" style={{ borderLeft: `4px solid ${cat(event.category).color}` }}>
                <p className="flex justify-between gap-3 py-1"><span className="text-ink-soft">วันที่</span><b className="text-right font-medium">{longDate(event.date)}</b></p>
                <p className="flex justify-between gap-3 py-1"><span className="text-ink-soft">หมวดหมู่</span><b className="font-medium">{cat(event.category).label}</b></p>
                {event.purpose && <p className="flex justify-between gap-3 py-1"><span className="text-ink-soft">จุดประสงค์</span><b className="text-right font-medium">{event.purpose}</b></p>}
                {event.note && <p className="flex justify-between gap-3 py-1"><span className="text-ink-soft">หมายเหตุ</span><b className="text-right font-medium">{event.note}</b></p>}
                <p className="mt-2 flex gap-2 text-[0.90625rem] text-ink-soft"><MarkerIcon name="lock" className="mt-0.5 size-3.5" />{event.lockReason} ระบบอัปเดตให้อัตโนมัติและลบไม่ได้ บันทึกสถานะ สัญลักษณ์ บันทึกเพิ่มเติม และแนบไฟล์ได้</p>
              </div>
              {markerPicker}
              <div className="mb-4">
                <label htmlFor="ev-unote" className="mb-1.5 block text-[0.9375rem] font-medium">บันทึกของฉัน</label>
                <textarea id="ev-unote" rows={3} maxLength={2000} className="tf-input" placeholder="เช่น เตรียมเอกสารครบแล้ว รอผู้มีอำนาจลงนาม" value={f.userNote} onChange={set('userNote')} aria-invalid={errs.userNote ? 'true' : 'false'} />
                {errs.userNote && <p className="mt-1.5 text-[0.875rem] text-danger">{errs.userNote}</p>}
              </div>
              <label className="tf-choice mb-4"><input type="checkbox" checked={!!f.done} onChange={set('done')} /><span className="text-[1rem]">ดำเนินการเสร็จแล้ว</span></label>
              {fileBox}
            </>
          ) : (
            <>
              {!event && (
                <div className="mb-4">
                  <p className="mb-2 text-[0.90625rem] text-ink-soft">เทมเพลตด่วน</p>
                  <div className="flex flex-wrap gap-2">
                    {(TEMPLATES[role] || TEMPLATES.creator).map((t) => (
                      <button key={t.title} type="button" onClick={() => { setF((x) => ({ ...x, title: t.title, purpose: t.purpose, category: t.category, marker: t.marker })); setErrs((e) => ({ ...e, title: null })); }}
                        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-tile px-3 py-1.5 text-[0.90625rem] transition-colors hover:bg-orange-pale">
                        <i className="size-2 rounded-full" style={{ background: cat(t.category).color }} />{t.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div ref={titleRef} tabIndex={-1} className="outline-none">
                <TextField id="ev-title-in" label="ชื่อกิจกรรม *" maxLength={120} placeholder="เช่น ส่ง Draft คอนเทนต์ให้แบรนด์ตรวจ" value={f.title} error={errs.title} onChange={set('title')} />
              </div>
              <fieldset className="mb-4">
                <legend className="mb-1.5 text-[0.9375rem] font-medium">หมวดหมู่ *</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {meta.categories.map((c) => (
                    <label key={c.id} className={cx('flex cursor-pointer items-start gap-2.5 rounded-2xl p-3 ring-1 transition-colors', f.category === c.id ? 'bg-orange-pale ring-orange' : 'bg-white ring-line hover:ring-ink/20')}>
                      <input type="radio" name="ev-cat" className="sr-only" checked={f.category === c.id} onChange={() => set('category')(c.id)} aria-labelledby={`ev-cat-${c.id}-t`} aria-describedby={`ev-cat-${c.id}-d`} />
                      <i className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="min-w-0"><b id={`ev-cat-${c.id}-t`} className="block text-[0.96875rem] font-medium">{c.label}</b><small id={`ev-cat-${c.id}-d`} className="block text-[0.875rem] leading-snug text-ink-soft">{c.desc}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-x-3 sm:grid-cols-2">
                <TextField id="ev-date" label="วันที่ *" type="date" value={f.date} error={errs.date} onChange={set('date')} />
                <TextField id="ev-end" label="ถึงวันที่ (ถ้ามีหลายวัน)" type="date" value={f.endDate} error={errs.endDate} onChange={set('endDate')} />
                <TextField id="ev-time" label="เวลาเริ่ม (เว้นว่าง = ทั้งวัน)" type="time" value={f.time} error={errs.time} onChange={set('time')} />
                <TextField id="ev-etime" label="เวลาสิ้นสุด" type="time" value={f.endTime} error={errs.endTime} onChange={set('endTime')} />
              </div>
              <fieldset className="mb-4">
                <legend className="mb-1.5 text-[0.9375rem] font-medium">ระดับความสำคัญ</legend>
                <div className="flex flex-wrap gap-2">
                  {meta.priorities.map((p) => {
                    const locked = event && event.priority === 'critical' && p.id !== 'critical';
                    return (
                      <label key={p.id} className={cx('tf-seg !flex-none', locked && 'cursor-not-allowed opacity-50')}>
                        <input type="radio" name="ev-pri" checked={f.priority === p.id} disabled={locked} onChange={() => set('priority')(p.id)} />
                        <span>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[0.875rem] text-ink-soft">{event && event.priority === 'critical' ? 'กิจกรรมระดับสำคัญมากไม่สามารถลดระดับหรือลบได้' : 'ระดับ "สำคัญมาก" จะถูกล็อก ลบไม่ได้และลดระดับไม่ได้ภายหลัง'}</p>
              </fieldset>
              {markerPicker}
              <TextField id="ev-purpose" label="จุดประสงค์" maxLength={300} placeholder="กิจกรรมนี้ทำเพื่ออะไร" value={f.purpose} error={errs.purpose} onChange={set('purpose')} className="!mb-2" />
              <div className="mb-4 flex flex-wrap gap-1.5">
                {(PURPOSE_HINTS[f.category] || []).map((h) => (
                  <button key={h} type="button" onClick={() => set('purpose')(h)} className="cursor-pointer rounded-full bg-tile px-3 py-1 text-[0.875rem] text-ink-soft hover:text-ink">{h}</button>
                ))}
              </div>
              <div className="grid gap-x-3 sm:grid-cols-2">
                <SelectField id="ev-doc" label="ผูกกับเอกสาร" value={f.linkDocId} onChange={set('linkDocId')} placeholder="ไม่ผูกกับเอกสาร"
                  options={docs.map((d) => ({ value: String(d.id), label: `${DOC_LABEL[d.type] || d.type} ${d.docNo || '(แบบร่าง)'}${d.party ? ` · ${d.party}` : ''}` }))} />
                <SelectField id="ev-remind" label="แจ้งเตือนล่วงหน้า" value={f.remindDays} onChange={set('remindDays')} options={REMIND_OPTIONS.map(([value, label]) => ({ value, label }))} />
              </div>
              <div className="mb-4">
                <label htmlFor="ev-note" className="mb-1.5 block text-[0.9375rem] font-medium">บันทึก</label>
                <textarea id="ev-note" rows={3} maxLength={2000} className="tf-input" placeholder="รายละเอียดเพิ่มเติม ผู้ติดต่อ ลิงก์ หรือสิ่งที่ต้องเตรียม" value={f.note} onChange={set('note')} />
              </div>
              {fileBox}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
          {event && !sys && (
            <Button variant="ghost" className="!text-danger" disabled={event.locked} title={event.locked ? event.lockReason : undefined} onClick={() => onDelete(event)}>
              <MarkerIcon name={event.locked ? 'lock' : 'trash'} />{event.locked ? 'ลบไม่ได้' : 'ลบ'}
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="soft" onClick={onClose}>ยกเลิก</Button>
          <Button variant="dark" loading={busy} onClick={() => (sys ? saveSystem() : saveUser())}>{sys ? 'บันทึก' : event ? 'บันทึกการแก้ไข' : 'เพิ่มกิจกรรม'}</Button>
        </div>
      </div>
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>,
    document.body,
  );
}
