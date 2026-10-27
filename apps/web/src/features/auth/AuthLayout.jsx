/**
 * AuthLayout.jsx โครงหน้าของเข้าสู่ระบบ สมัครสมาชิก และ OTP (layout route ครอบทั้งสามหน้า)
 * การ์ดสองฝั่ง: ฟอร์มสีขาว + แผงสีส้มพร้อมมาสคอต สลับหน้าแล้วแผงเลื่อนข้ามไปอีกฝั่งแบบนุ่ม ๆ
 * (เข้าสู่ระบบ/OTP แผงอยู่ขวา · สมัคร แผงอยู่ซ้าย) ต้องเป็น layout route การ์ดจึงไม่ถูกสร้างใหม่ตอนเปลี่ยนหน้า
 * จอเล็กกว่า lg ซ่อนแผงและแสดงแค่ฟอร์ม
 */
import { Link, Outlet, useLocation } from 'react-router';
import { cx } from '../../components/ui.jsx';

const FOOT_LINKS = [
  ['/overview', 'ภาพรวมระบบ'],
  ['/guide', 'ศูนย์ความรู้'],
  ['/guide/privacy', 'ความเป็นส่วนตัว'],
  ['/verify-doc', 'ตรวจสอบเอกสาร'],
];

const PANEL = {
  login: {
    img: '/img/mascot-hello.webp',
    title: 'ยินดีต้อนรับสู่ TaxFlow',
    text: 'ยังไม่มีบัญชี? สมัครใช้งานเพื่อออกเอกสารภาษี คำนวณหัก ณ ที่จ่าย และเก็บเอกสารครบในที่เดียว',
    to: '/register',
    cta: 'สมัครสมาชิก',
  },
  register: {
    img: '/img/mascot-question.webp',
    title: 'มีบัญชีอยู่แล้ว?',
    text: 'เข้าสู่ระบบเพื่อจัดการเอกสารภาษีของคุณต่อได้ทันที',
    to: '/login',
    cta: 'เข้าสู่ระบบ',
  },
  verify: {
    img: '/img/mascot-otp.png',
    title: 'อีกขั้นเดียวเท่านั้น',
    text: 'ยืนยันรหัส 6 หลักเพื่อความปลอดภัยของบัญชีและเอกสารของคุณ',
  },
};

function modeOf(pathname) {
  if (pathname.startsWith('/register')) return 'register';
  if (pathname.startsWith('/verify')) return 'verify';
  return 'login';
}

export default function AuthLayout() {
  const { pathname } = useLocation();
  const mode = modeOf(pathname);
  const panelLeft = mode === 'register';
  const p = PANEL[mode];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-6">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 -top-40 size-[32.5rem] rounded-full bg-orange-soft/60 blur-[120px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -right-32 size-[35rem] rounded-full bg-[#FFE9D6]/70 blur-[130px]" />

      <div className="relative w-full max-w-[1060px] overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] lg:h-[min(740px,calc(100vh-48px))]">
        {/* ฝั่งฟอร์ม */}
        <section
          className={cx(
            'tf-auth-slide flex flex-col transition-transform duration-700 ease-[var(--ease-slide)] lg:absolute lg:inset-y-0 lg:left-0 lg:w-1/2',
            panelLeft && 'lg:translate-x-full',
          )}
        >
          <div className="flex h-full flex-col overflow-y-auto px-6 py-7 sm:px-12 sm:py-9">
            <Link to="/" className="mb-8 inline-flex w-fit items-center" aria-label="TaxFlow หน้าแนะนำระบบ">
              <img src="/img/logo.png" alt="TaxFlow" className="h-9 w-auto" />
            </Link>
            <div key={mode} className="tf-fade-up mx-auto my-auto w-full max-w-[400px]">
              <Outlet />
            </div>
            <nav aria-label="ข้อมูลระบบ" className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[0.875rem] text-ink-soft">
              {FOOT_LINKS.map(([href, text]) => (
                <Link key={href} to={href} className="transition-colors hover:text-orange-deep">{text}</Link>
              ))}
            </nav>
          </div>
        </section>

        {/* แผงสีส้ม เลื่อนข้ามฝั่งเมื่อสลับระหว่างเข้าสู่ระบบกับสมัคร */}
        <aside
          className={cx(
            'tf-auth-slide absolute inset-y-0 left-1/2 z-10 hidden w-1/2 overflow-hidden rounded-[var(--radius-card)] text-white transition-transform duration-700 ease-[var(--ease-slide)] lg:block',
            panelLeft && '-translate-x-full',
          )}
        >
          <div className="absolute inset-0 bg-[linear-gradient(155deg,#FF8A2B_0%,#FF6A00_45%,#E85A00_100%)]" />
          <div aria-hidden="true" className="absolute -right-24 -top-24 size-[20rem] rounded-full bg-white/10" />
          <div aria-hidden="true" className="absolute -bottom-32 -left-20 size-[18.75rem] rounded-full bg-white/10" />
          <div aria-hidden="true" className="absolute left-10 top-1/3 size-3 rounded-full bg-white/40" />
          <div aria-hidden="true" className="absolute right-16 top-[18%] size-2 rounded-full bg-white/50" />

          <div key={mode} className="relative flex h-full flex-col items-center justify-center px-12 text-center">
            <img src={p.img} alt="" className="tf-float mb-4 h-[min(280px,34vh)] w-auto drop-shadow-[0_24px_30px_rgba(120,40,0,0.25)]" />
            <h2 className="tf-fade-up mb-3 text-[1.875rem] font-semibold">{p.title}</h2>
            <p className="tf-fade-up-late mb-7 max-w-[340px] text-[1.03125rem] leading-relaxed text-white/90">{p.text}</p>
            {p.to && (
              <Link to={p.to} className="tf-btn tf-btn-outline-light tf-fade-up-late">{p.cta}</Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
