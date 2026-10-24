import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <img src="/img/logo.png" alt="TaxFlow" className="tf-fade-up mb-10 h-9 w-auto" />
      <img src="/img/mascot-404.png" alt="" className="tf-float mb-5 w-[210px]" onError={(e) => e.currentTarget.remove()} />
      <h1 className="tf-fade-up mb-2 text-[1.75rem]">ไม่พบหน้าที่ต้องการ</h1>
      <p className="tf-fade-up-late mb-7 text-[1rem] text-ink-soft">ลิงก์อาจพิมพ์ผิด หรือหน้านี้ยังไม่ได้ย้ายมาที่หน้าเว็บใหม่</p>
      <Link to="/login" className="tf-btn tf-btn-solid tf-fade-up-late">ไปหน้าเข้าสู่ระบบ</Link>
    </main>
  );
}
