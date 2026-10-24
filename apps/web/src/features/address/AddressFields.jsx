/**
 * AddressFields.jsx ช่องที่อยู่แบบเลือกทีละชั้น: จังหวัด → เขต/อำเภอ → แขวง/ตำบล → รหัสไปรษณีย์ (เติมให้อัตโนมัติ)
 * - AddressCascade: เฉพาะ 4 ช่องนี้ ใช้กับฟอร์มที่เก็บที่อยู่แยกช่องอยู่แล้ว (โปรไฟล์ สมัครสมาชิก)
 * - AddressFields: ช่องบ้านเลขที่/ถนน + AddressCascade แล้วรวมเป็นข้อความเดียว ใช้กับฟอร์มที่เก็บที่อยู่เป็นข้อความ
 *   (สมุดคู่ค้า คู่ค้าในเอกสาร หนังสือมอบอำนาจ) ค่าเดิมที่เป็นข้อความถูกแยกกลับเป็นช่องให้เองเมื่อเปิดแก้ไข
 * พิมพ์รหัสไปรษณีย์ก่อนก็ได้ ระบบเติมจังหวัด/อำเภอให้ และถ้ามีตำบลเดียวก็เติมตำบลให้ด้วย
 * ถ้าโหลดข้อมูลไม่สำเร็จ ช่องเลือกจะเปลี่ยนเป็นช่องพิมพ์ธรรมดา ผู้ใช้ยังกรอกต่อได้
 */
import { useEffect, useId, useRef, useState } from 'react';
import Select from '../../components/Select.jsx';
import {
  EMPTY_PARTS, composeAddress, distLabel, districtOptions, findByZip, loadThaiAddress, parseAddress, subLabel, subOptions, zipOf,
} from './thaiAddress.js';

const cx = (...xs) => xs.filter(Boolean).join(' ');

export function useThaiAddress() {
  const [state, setState] = useState({ data: null, failed: false });
  useEffect(() => {
    let alive = true;
    loadThaiAddress().then((data) => alive && setState({ data, failed: false })).catch(() => alive && setState({ data: null, failed: true }));
    return () => { alive = false; };
  }, []);
  return state;
}

function Label({ htmlFor, children }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-[0.9375rem] font-medium">{children}</label>;
}
function Err({ children }) {
  return children ? <p className="tf-reveal mt-1.5 text-[0.875rem] font-medium text-danger">{children}</p> : null;
}

/**
 * value = { prov, dist, sub, zip } · onChange(patch) ส่งเฉพาะช่องที่เปลี่ยน
 * errors = { prov, dist, sub, zip } · onBlur(key) ใช้ตรวจทีละช่อง
 */
export function AddressCascade({ idPrefix, value, onChange, errors = {}, onBlur, required, data: dataProp }) {
  const auto = useId();
  const pre = idPrefix || auto;
  const own = useThaiAddress();
  const data = dataProp || own.data;
  const failed = !dataProp && own.failed;
  const star = required ? ' *' : '';
  const { prov = '', dist = '', sub = '', zip = '' } = value || {};

  const pickProv = (p) => onChange({ prov: p, dist: '', sub: '', zip: '' });
  const pickDist = (d) => onChange({ dist: d, sub: '', zip: '' });
  const pickSub = (s) => onChange({ sub: s, zip: zipOf(data, prov, dist, s) || zip });
  const typeZip = (raw) => {
    const z = raw.replace(/\D/g, '').slice(0, 5);
    const patch = { zip: z };
    // พิมพ์รหัสไปรษณีย์ครบ 5 หลักตอนที่ยังไม่ได้เลือกพื้นที่ เติมให้เท่าที่ระบุได้แน่นอน
    if (z.length === 5 && data && !sub) {
      const hits = findByZip(data, z);
      if (hits.length) {
        const same = (k) => hits.every((h) => h[k] === hits[0][k]);
        if (!prov && same('prov')) patch.prov = hits[0].prov;
        if (!dist && same('prov') && same('dist')) patch.dist = hits[0].dist;
        if (hits.length === 1) patch.sub = hits[0].sub;
      }
    }
    onChange(patch);
  };

  const grid = 'grid gap-x-3 sm:grid-cols-2';
  const zipInput = (
    <div className="mb-4">
      <Label htmlFor={`${pre}-zip`}>รหัสไปรษณีย์{star}</Label>
      <input id={`${pre}-zip`} className="tf-input tabular-nums" inputMode="numeric" maxLength={5} placeholder="เช่น 10240"
        value={zip} onChange={(e) => typeZip(e.target.value)} onBlur={() => onBlur?.('zip')} aria-invalid={errors.zip ? 'true' : 'false'} />
      <Err>{errors.zip}</Err>
    </div>
  );

  if (failed) {
    const plain = (k, label, v) => (
      <div className="mb-4">
        <Label htmlFor={`${pre}-${k}`}>{label}{star}</Label>
        <input id={`${pre}-${k}`} className="tf-input" value={v} onChange={(e) => onChange({ [k]: e.target.value })} onBlur={() => onBlur?.(k)} aria-invalid={errors[k] ? 'true' : 'false'} />
        <Err>{errors[k]}</Err>
      </div>
    );
    return (
      <div className={grid}>
        {plain('prov', 'จังหวัด', prov)}{plain('dist', 'เขต / อำเภอ', dist)}{plain('sub', 'แขวง / ตำบล', sub)}{zipInput}
      </div>
    );
  }

  const loading = !data;
  const dists = districtOptions(data, prov);
  const subs = subOptions(data, prov, dist).map(([n]) => n);
  // ค่าเดิมที่ไม่อยู่ในรายการ (เช่นพิมพ์เองจากระบบเก่า) ยังแสดงให้เห็นในช่องเลือก
  const withCurrent = (list, v) => (v && !list.includes(v) ? [v, ...list] : list);

  return (
    <div className={grid}>
      <div className="mb-4">
        <Label htmlFor={`${pre}-prov`}>จังหวัด{star}</Label>
        <Select id={`${pre}-prov`} value={prov} placeholder={loading ? 'กำลังโหลดรายชื่อ…' : 'เลือกจังหวัด'} disabled={loading}
          options={withCurrent(data ? data.provinces : [], prov)} onChange={(e) => pickProv(e.target.value)} onBlur={() => onBlur?.('prov')}
          aria-invalid={errors.prov ? 'true' : 'false'} />
        <Err>{errors.prov}</Err>
      </div>
      <div className="mb-4">
        <Label htmlFor={`${pre}-dist`}>{prov ? distLabel(prov) : 'เขต / อำเภอ'}{star}</Label>
        <Select id={`${pre}-dist`} value={dist} placeholder={prov ? `เลือก${distLabel(prov)}` : 'เลือกจังหวัดก่อน'} disabled={loading || !prov}
          options={withCurrent(dists, dist)} onChange={(e) => pickDist(e.target.value)} onBlur={() => onBlur?.('dist')}
          aria-invalid={errors.dist ? 'true' : 'false'} />
        <Err>{errors.dist}</Err>
      </div>
      <div className="mb-4">
        <Label htmlFor={`${pre}-sub`}>{prov ? subLabel(prov) : 'แขวง / ตำบล'}{star}</Label>
        <Select id={`${pre}-sub`} value={sub} placeholder={dist ? `เลือก${subLabel(prov)}` : `เลือก${prov ? distLabel(prov) : 'อำเภอ'}ก่อน`} disabled={loading || !dist}
          options={withCurrent(subs, sub)} onChange={(e) => pickSub(e.target.value)} onBlur={() => onBlur?.('sub')}
          aria-invalid={errors.sub ? 'true' : 'false'} />
        <Err>{errors.sub}</Err>
      </div>
      {zipInput}
    </div>
  );
}

/**
 * ที่อยู่แบบข้อความเดียว value/onChange เป็น string เหมือน textarea เดิม
 * แสดงตัวอย่างที่อยู่ที่จะพิมพ์ลงเอกสารใต้ช่อง
 */
export function AddressFields({ id, label = 'ที่อยู่', value, onChange, onBlur, error, required, hint }) {
  const auto = useId();
  const pre = id || auto;
  const { data, failed } = useThaiAddress();
  const [parts, setParts] = useState(EMPTY_PARTS);
  const last = useRef(null); // ข้อความล่าสุดที่ช่องนี้ส่งออกไปเอง

  // ค่าจากภายนอก (เปิดแก้ไข ดึงจากสมุดคู่ค้า คัดลอกจากเอกสารเดิม) แยกกลับเป็นช่อง
  useEffect(() => {
    const v = value || '';
    if (v === last.current) return;
    if (!data && !failed && v) return; // รอข้อมูลก่อนแยก จะได้แยกจังหวัด/อำเภอได้ถูก
    last.current = v;
    setParts(parseAddress(v, data));
  }, [value, data, failed]);

  function update(patch) {
    const next = { ...parts, ...patch };
    setParts(next);
    const text = composeAddress(next);
    last.current = text;
    onChange(text);
  }

  const preview = composeAddress(parts);
  return (
    <fieldset className="mb-4 sm:col-span-2">
      <legend className="mb-2 block text-[0.9375rem] font-medium">{label}{required ? ' *' : ''}</legend>
      <div className={cx('rounded-[18px] p-3.5 pb-0 ring-1', error ? 'bg-danger-soft/40 ring-danger/40' : 'bg-white ring-line')}>
        <div className="mb-4">
          <Label htmlFor={`${pre}-line`}>บ้านเลขที่ / อาคาร / หมู่ / ซอย / ถนน</Label>
          <input id={`${pre}-line`} className="tf-input" maxLength={300} placeholder="เช่น 55/1 อาคารเอ ชั้น 3 ซอยสุขุมวิท 21 ถนนสุขุมวิท"
            value={parts.line} onChange={(e) => update({ line: e.target.value })} onBlur={onBlur} />
        </div>
        <AddressCascade idPrefix={pre} value={parts} data={data || undefined} onChange={update} onBlur={onBlur} />
      </div>
      {preview && (
        <p className="mt-2 flex gap-2 text-[0.90625rem] leading-relaxed text-ink-soft">
          <span className="shrink-0 font-medium text-ink">พิมพ์บนเอกสาร:</span><span>{preview}</span>
        </p>
      )}
      {hint && !error && <p className="mt-1 text-[0.875rem] text-ink-soft">{hint}</p>}
      <Err>{error}</Err>
    </fieldset>
  );
}
