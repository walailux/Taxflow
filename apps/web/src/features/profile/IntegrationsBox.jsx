/**
 * IntegrationsBox.jsx การเชื่อมต่อระบบภายนอก (ย้ายจาก profile.js ของหน้าเดิม)
 * API key อ่านอย่างเดียว (แสดงรหัสเต็มครั้งเดียวตอนสร้าง) + Webhook แจ้งเมื่อเอกสารเปลี่ยนสถานะ
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { thDateTime } from '../../lib/format.js';
import { useToast } from '../../components/Toast.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { Button, Spinner, TextField } from '../../components/ui.jsx';

const EVENT_LABEL = {
  'document.approved': 'เอกสารอนุมัติ',
  'document.rejected': 'เอกสารถูกตีกลับ',
  'document.cancelled': 'เอกสารถูกยกเลิก',
};

export default function IntegrationsBox() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api.get('/api/integrations') });
  const [newKey, setNewKey] = useState('');
  const [wh, setWh] = useState({ url: '', events: [], enabled: false });
  const [testResult, setTestResult] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (q.data) setWh({ url: q.data.webhook.url || '', events: q.data.webhook.events || [], enabled: !!q.data.webhook.enabled });
  }, [q.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['integrations'] });

  async function run(name, fn) {
    setBusy(name);
    try { await fn(); } catch (err) { toast(err.message, 'err'); } finally { setBusy(''); }
  }

  const generate = () => run('key', async () => {
    const data = await api.post('/api/integrations/api-key', {});
    setNewKey(data.key);
    toast('สร้าง API key แล้ว');
    void refresh();
  });

  const revoke = () => setConfirm({
    title: 'เพิกถอน API key?', message: 'ระบบภายนอกที่ใช้อยู่จะเชื่อมต่อไม่ได้ทันที', confirmText: 'เพิกถอน', danger: true,
    onConfirm: () => { setConfirm(null); void run('key', async () => { await api.del('/api/integrations/api-key'); setNewKey(''); toast('เพิกถอน API key แล้ว'); void refresh(); }); },
  });

  const saveWebhook = () => run('save', async () => {
    await api.put('/api/integrations/webhook', wh);
    toast('บันทึกการตั้งค่า webhook แล้ว');
    void refresh();
  });

  const testWebhook = () => run('test', async () => {
    setTestResult('กำลังส่งทดสอบ…');
    try {
      const d = await api.post('/api/integrations/webhook/test', {});
      setTestResult(d.ok ? `ส่งสำเร็จ ปลายทางตอบกลับ HTTP ${d.status} (${d.ms} ms)` : `ส่งไม่สำเร็จ: ${d.error || `HTTP ${d.status}`}`);
    } catch (err) {
      setTestResult(err.message);
    }
  });

  const removeWebhook = () => setConfirm({
    title: 'ปิดใช้งาน webhook?', message: 'ลบการตั้งค่า webhook นี้ทั้งหมด', confirmText: 'ปิดใช้งาน', danger: true,
    onConfirm: () => { setConfirm(null); void run('save', async () => { await api.del('/api/integrations/webhook'); toast('ปิดใช้งาน webhook แล้ว'); setTestResult(''); void refresh(); }); },
  });

  if (q.isLoading) return <p className="flex items-center gap-2 text-[0.96875rem] text-ink-soft"><Spinner /> กำลังโหลด</p>;
  if (q.isError) return <p className="text-[0.96875rem] text-danger">{q.error.message}</p>;
  const d = q.data;

  return (
    <div>
      <h4 className="mb-2 text-[0.90625rem] font-medium uppercase tracking-wide text-ink-soft">API key</h4>
      {newKey ? (
        <div className="tf-reveal mb-2 rounded-2xl border border-orange bg-orange-pale p-4">
          <b className="mb-2 block text-[0.96875rem]">คัดลอกรหัสนี้เก็บไว้ทันที ระบบจะไม่แสดงให้เห็นอีก</b>
          <div className="flex gap-2">
            <input readOnly value={newKey} onFocus={(e) => e.target.select()} className="tf-input flex-1 font-mono text-[0.90625rem]" aria-label="API key" />
            <Button variant="ghost" onClick={() => navigator.clipboard.writeText(newKey).then(() => toast('คัดลอกแล้ว'))}>คัดลอก</Button>
          </div>
        </div>
      ) : (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-field px-4 py-3">
          <div className="min-w-0">
            <b className="block text-[1rem] font-medium">{d.apiKey ? <span className="font-mono">{d.apiKey.prefix}••••••••</span> : 'ยังไม่มี API key'}</b>
            <small className="block text-[0.90625rem] text-ink-soft">
              {d.apiKey ? `สร้างเมื่อ ${thDateTime(d.apiKey.createdAt)}` : 'ให้ระบบภายนอกดึงข้อมูลเอกสาร/คู่ค้าแบบอ่านอย่างเดียว ผ่าน header X-Api-Key'}
            </small>
          </div>
          <div className="flex gap-2">
            <Button variant={d.apiKey ? 'ghost' : 'solid'} loading={busy === 'key'} onClick={generate}>{d.apiKey ? 'สร้างใหม่' : 'สร้าง API key'}</Button>
            {d.apiKey && <Button variant="ghost" className="!text-danger" onClick={revoke}>เพิกถอน</Button>}
          </div>
        </div>
      )}

      <h4 className="mb-2 mt-6 text-[0.90625rem] font-medium uppercase tracking-wide text-ink-soft">Webhook</h4>
      <TextField id="wh-url" label="URL ปลายทาง" placeholder="https://example.com/webhooks/taxflow" value={wh.url} onChange={(e) => setWh({ ...wh, url: e.target.value })} />
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-[0.9375rem] font-medium">Event ที่ต้องการรับ</legend>
        <div className="flex flex-wrap gap-2">
          {d.availableEvents.map((k) => (
            <label key={k} className="tf-seg !flex-none">
              <input
                type="checkbox"
                checked={wh.events.includes(k)}
                onChange={(e) => setWh({ ...wh, events: e.target.checked ? [...wh.events, k] : wh.events.filter((x) => x !== k) })}
              />
              <span>{EVENT_LABEL[k] || k}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mb-4 flex cursor-pointer items-center gap-2.5 text-[1rem]">
        <input type="checkbox" className="size-4 accent-[var(--color-orange)]" checked={wh.enabled} onChange={(e) => setWh({ ...wh, enabled: e.target.checked })} />
        เปิดใช้งาน webhook นี้
      </label>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy === 'save'} onClick={saveWebhook}>บันทึก</Button>
        <Button variant="ghost" loading={busy === 'test'} onClick={testWebhook}>ส่งทดสอบ</Button>
        <Button variant="ghost" onClick={removeWebhook}>ปิดใช้งาน/ลบ</Button>
      </div>
      {testResult && <p className="tf-reveal mt-3 text-[0.9375rem] text-ink-soft" role="status">{testResult}</p>}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
