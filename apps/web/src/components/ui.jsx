/**
 * ui.jsx ชิ้นส่วนกลางที่ใช้ซ้ำ (ภาคผนวก ข ข้อ 20 ของแผน)
 * Field: ช่องกรอกพร้อมคำอธิบายและข้อความผิดพลาดใต้ช่อง แทน setFieldError/setFieldOk ของหน้าเดิม
 * ข้อความผิดพลาดผูกกับช่องด้วย aria-describedby และ aria-invalid ให้โปรแกรมอ่านหน้าจออ่านได้
 */
import Select from './Select.jsx';
import DatePicker from './DatePicker.jsx';
import Icon from './Icon.jsx';
import { useId, useState } from 'react';

export const cx = (...xs) => xs.filter(Boolean).join(' ');

export function Field({ id, label, hint, error, ok, children, className }) {
  return (
    <div className={cx('mb-4', className)}>
      {label && <label htmlFor={id} className="mb-1.5 block text-[0.9375rem] font-medium text-ink">{label}</label>}
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-err`} className="tf-reveal mt-1.5 text-[0.875rem] font-medium leading-relaxed text-danger">{error}</p>}
      {!error && ok && <p className="tf-reveal mt-1.5 text-[0.875rem] font-medium text-ok">✓ {ok}</p>}
    </div>
  );
}

function describedBy(id, hint, error) {
  return [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
}

/**
 * ช่องกรอกข้อความ ถ้า type="password" จะมีปุ่มรูปตาให้กดดูรหัสที่พิมพ์ไปแล้วได้
 * (พิมพ์รหัสยาว ๆ แล้วไม่เห็นว่าพิมพ์อะไรไปเป็นสาเหตุหลักที่กรอกรหัสผิดซ้ำ ๆ)
 * ส่ง reveal={false} ปิดปุ่มนี้ได้ถ้าช่องไหนไม่ต้องการ
 */
export function TextField({ id: idProp, label, hint, error, ok, className, inputClassName, reveal = true, ...input }) {
  const auto = useId();
  const id = idProp || auto;
  const [shown, setShown] = useState(false);
  const isPassword = input.type === 'password';
  // ช่องที่ปิดใช้งานไม่ควรมีปุ่มกดได้อยู่ข้างใน
  const withToggle = isPassword && reveal && !input.disabled;
  // ช่องวันที่ใช้ปฏิทินของระบบเอง (DatePicker) แทนปฏิทินของเบราว์เซอร์ที่หน้าตาต่างกันทุกเครื่อง
  if (input.type === 'date') {
    const { type: _t, ...rest } = input;
    return (
      <Field id={id} label={label} hint={hint} error={error} ok={ok} className={className}>
        <DatePicker
          id={id}
          {...rest}
          className={inputClassName}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy(id, hint, error)}
        />
      </Field>
    );
  }
  const field = (
    <input
      id={id}
      {...input}
      // กดดูรหัสแล้วสลับเป็น text ชั่วคราว ค่าที่เก็บในฟอร์มไม่เปลี่ยน
      type={withToggle && shown ? 'text' : input.type}
      className={cx('tf-input', withToggle && 'pr-12', inputClassName)}
      aria-invalid={error ? 'true' : 'false'}
      aria-describedby={describedBy(id, hint, error)}
    />
  );
  return (
    <Field id={id} label={label} hint={hint} error={error} ok={ok} className={className}>
      {withToggle ? (
        <div className="relative">
          {field}
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            aria-pressed={shown}
            // tabIndex -1: กด Tab จากช่องรหัสผ่านควรไปปุ่มถัดไปของฟอร์มเลย ไม่ใช่มาติดที่ปุ่มรูปตาก่อน
            tabIndex={-1}
            className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-[#EFECE9] hover:text-ink"
          >
            <Icon name={shown ? 'eye-off' : 'eye'} className="size-[1.1875rem]" strokeWidth={1.7} />
          </button>
        </div>
      ) : field}
    </Field>
  );
}

export function SelectField({ id: idProp, label, hint, error, options, placeholder, className, ...select }) {
  const auto = useId();
  const id = idProp || auto;
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <Select
        id={id}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy(id, hint, error)}
        options={options || []}
        placeholder={placeholder}
        {...select}
      />
    </Field>
  );
}

/** กลุ่ม radio แบบปุ่มเรียงกัน options = [{ value, label }] */
export function SegGroup({ name, legend, hint, value, onChange, options }) {
  const id = useId();
  return (
    <fieldset className="mb-4" aria-describedby={hint ? `${id}-hint` : undefined}>
      {legend && <legend className="mb-1.5 block text-[0.9375rem] font-medium text-ink">{legend}</legend>}
      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => (
          <label key={o.value} className="tf-seg">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-soft">{hint}</p>}
    </fieldset>
  );
}

const ALERT_STYLE = {
  error: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  ok: 'bg-ok-soft text-ok',
  dev: 'border-[1.5px] border-[#F0D98A] bg-dev-soft text-dev',
};

export function Alert({ kind = 'error', children, className }) {
  if (!children) return null;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cx('tf-reveal mb-4 rounded-[12px] px-4 py-3 text-[0.9375rem] leading-relaxed', ALERT_STYLE[kind], className)}
    >
      {children}
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}

const BTN = { solid: 'tf-btn-solid', ghost: 'tf-btn-ghost', dark: 'tf-btn-dark', soft: 'tf-btn-soft' };

export function Button({ variant = 'solid', block, loading, children, className, type = 'button', disabled, ...rest }) {
  return (
    <button
      type={type}
      className={cx('tf-btn', BTN[variant] || BTN.solid, block && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading ? 'true' : undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/**
 * แถบขั้นตอนพร้อมเส้นเชื่อม steps = ['บทบาท', ...] current เริ่มที่ 1 · size 'md' | 'lg'
 * วงกลมกับเส้นเชื่อมอยู่ในแถว flex เดียวกัน (items-center) เส้นจึงตรงกึ่งกลางวงกลมเสมอไม่ว่าขนาดตัวอักษรเท่าไร
 * เส้นเชื่อมเป็นเส้นเดียวต่อช่วง ลากจากกึ่งกลางวงกลมก่อนหน้าถึงกึ่งกลางวงกลมนี้ (อยู่หลังวงกลม) เติมสีส้มไล่จากซ้ายไปขวา
 * ขั้นปัจจุบันมีวงแสงกระพริบ ขั้นที่ผ่านแล้ววาดเครื่องหมายถูก
 */
export function StepBar({ steps, current, size = 'md', label = 'ขั้นตอน' }) {
  const lg = size === 'lg';
  return (
    <ol className={cx('isolate flex', lg ? 'my-1' : 'mb-5 mt-1')} aria-label={label}>
      {steps.map((text, i) => {
        const n = i + 1;
        const on = n <= current;
        const done = n < current;
        const now = n === current;
        return (
          <li
            key={text}
            aria-current={now ? 'step' : undefined}
            className={cx(
              'flex min-w-0 flex-1 flex-col items-center text-center font-medium transition-colors duration-500',
              lg ? 'gap-3 text-[0.875rem] sm:text-[1.03125rem]' : 'gap-1.5 text-[0.8125rem] sm:text-[0.84375rem]',
              on ? 'text-ink' : 'text-[#A8A29E]',
            )}
          >
            <div className="relative flex w-full items-center justify-center">
              {i > 0 && (
                <span aria-hidden="true" className={cx('absolute right-1/2 top-1/2 -z-10 w-full -translate-y-1/2 overflow-hidden bg-[#EFEBE7]', lg ? 'h-1' : 'h-0.5')}>
                  <span className={cx('block h-full origin-left bg-orange transition-transform duration-500 ease-[var(--ease-slide)]', on ? 'scale-x-100' : 'scale-x-0')} />
                </span>
              )}
              <span
                className={cx(
                  'relative flex shrink-0 items-center justify-center rounded-full font-display transition-all duration-500 ease-[var(--ease-pop)]',
                  lg ? 'size-12 text-[1.1875rem]' : 'size-[1.875rem] text-[0.90625rem]',
                  on ? 'bg-orange text-white shadow-[var(--shadow-brand)]' : 'bg-[#EFEBE7] text-[#A8A29E]',
                  now && 'tf-step-now',
                  now && lg && 'scale-110',
                )}
              >
                {done ? (
                  <svg aria-hidden="true" viewBox="0 0 16 16" className={lg ? 'size-5' : 'size-3.5'}>
                    <path className="tf-check-draw" d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : n}
              </span>
            </div>
            <span className={cx('px-1 leading-snug text-balance sm:whitespace-nowrap', now && lg && 'text-orange-deep')}>{text}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- ส่วนประกอบของหน้าหลังเข้าสู่ระบบ ---------- */

/** หัวหน้า: ชื่อหน้า + คำอธิบาย + ปุ่มด้านขวา (ถ้ามี) */
/**
 * ปุ่มย้อนกลับไว้บนสุดของหน้าหรือขั้นตอน กดถึงได้ทันทีโดยไม่ต้องเลื่อนลงท้ายฟอร์มยาว ๆ บนมือถือ
 * สูงอย่างน้อย 44px ตามขนาดเป้านิ้วที่แนะนำ
 */
export function BackButton({ onClick, children = 'ย้อนกลับ', disabled, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx('tf-anim-host group inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-white py-2 pl-3 pr-4 text-[0.96875rem] font-medium text-ink shadow-[0_1px_2px_rgba(24,24,27,0.05)] ring-1 ring-line transition-colors hover:bg-orange-pale hover:text-orange-deep hover:ring-orange/30 disabled:cursor-not-allowed disabled:opacity-50', className)}
    >
      <Icon name="arrow" className="size-[1.125rem] rotate-180 transition-transform group-hover:-translate-x-0.5" />
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, actions, back, children }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-3">{back}</div>}
        <h1 className="text-[1.875rem] font-medium leading-[1.15] sm:text-[2.375rem]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[70ch] text-[1.03125rem] leading-snug text-ink-soft">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** การ์ดพื้นขาว เงานุ่ม title/subtitle/action เป็นหัวการ์ด */
export function Card({ title, subtitle, action, className, bodyClassName, children }) {
  return (
    <section className={cx('rounded-[24px] bg-white shadow-[0_1px_2px_rgba(24,24,27,0.03)]', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-[1.1875rem] font-medium">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[0.9375rem] text-ink-soft">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cx('p-5 sm:p-6', title && 'pt-4 sm:pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** กล่องเทากะพริบระหว่างโหลดข้อมูล */
export function Skeleton({ className }) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-lg bg-[#EFEBE7]', className)} />;
}

/** ไม่มีข้อมูล: มาสคอต + ข้อความ + ปุ่ม (ถ้ามี) */
export function EmptyState({ img = '/img/mascot-question.webp', title, text, action, compact }) {
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'py-4' : 'py-8')}>
      <img src={img} alt="" className={cx('tf-float mb-3 w-auto', compact ? 'h-20' : 'h-28')} />
      {title && <b className="mb-1 font-display text-[1.0625rem] font-semibold">{title}</b>}
      {text && <p className="max-w-[40ch] text-[0.96875rem] text-ink-soft">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
