# apps/web

หน้าเว็บของ TaxFlow ver18 — React 19 + Vite 7 + Tailwind CSS 4 + React Router 7 + TanStack Query 5 (WP2)

## รัน

```powershell
npm install          # ที่โฟลเดอร์บนสุดของโปรเจกต์ ครั้งแรกครั้งเดียว
npm start            # หน้าต่างที่ 1: API ที่พอร์ต 4000
npm run dev:web      # หน้าต่างที่ 2: เปิด http://localhost:5173
npm run test:web     # ชุดทดสอบ Vitest
npm run build:web    # สร้างไฟล์สำหรับ Vercel ที่ apps/web/dist
```

ตอนพัฒนา Vite ส่งต่อ `/api` ไปที่ `http://localhost:4000` (ตั้งได้ที่ `VITE_DEV_API_TARGET`) ดูตัวแปรทั้งหมดใน `.env.example`

## หน้าจอทั้งหมด (React ทุกหน้า ไม่มีหน้า HTML เดิมเหลืออยู่)

| กลุ่ม | เส้นทาง |
|---|---|
| เข้าสู่ระบบ / สมัคร / OTP | `/login` `/register` `/verify` |
| แอปหลังเข้าสู่ระบบ | `/app/overview` `/app/create` `/app/documents` `/app/inbox` `/app/calendar` `/app/library` `/app/profile` |
| เฉพาะบทบาท | `/app/record-wht` `/app/tax` (อินฟลูเอนเซอร์) · `/app/contacts` (บริษัท/เอเจนซี่) · `/app/admin` (ผู้ดูแลระบบ) |
| หน้าสาธารณะ | `/overview` `/guide` `/privacy` `/laws` `/verify-doc` `/status` |

ลิงก์ `.html` เดิม (เช่น QR บนเอกสารเก่า `/verify.html?token=...`) ส่งต่อไปหน้า React ให้เองใน `App.jsx` (OLD_PATHS)
ทุกลิงก์ไปหน้าจอภายในแอปผ่าน `viewLink()` ใน `src/features/app/nav.js` จุดเดียว

## โครงสร้าง

```
src/
├─ main.jsx, App.jsx        จุดเริ่มและเส้นทาง
├─ index.css                Tailwind + ชุดสีเดิมจาก style.css (@theme) + คลาส tf-*
├─ lib/                     api.js (ตัวเรียก API + session), shared.js (packages/shared), home.js, env.js
├─ components/ui.jsx        Field, TextField, SelectField, SegGroup, Button, Alert, StepBar
├─ features/auth/           กติกาตรวจข้อมูล, เส้นทาง API, รายการ OTP ที่รอยืนยัน, AuthLayout
└─ pages/                   หน้าจอ
```

`packages/shared` เป็น CommonJS จึงตั้ง `optimizeDeps` และ `build.commonjsOptions` ไว้ใน `vite.config.js`
กติกาตรวจข้อมูลทุกช่องเรียก `docschema.checkField` ตัวเดียวกับ API ข้อความผิดพลาดจึงตรงกันทุกกรณี
