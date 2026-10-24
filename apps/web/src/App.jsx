/**
 * App.jsx เส้นทางของหน้าเว็บ React
 * /login /register /verify อยู่ใต้ AuthLayout · /app/* อยู่ใต้ AppLayout (ตรวจการเข้าสู่ระบบและบทบาท)
 */
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useOutletContext } from 'react-router';
import AuthLayout from './features/auth/AuthLayout.jsx';
import AppLayout from './features/app/AppLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import OtpPage from './pages/OtpPage.jsx';
import HomeRedirect from './pages/HomeRedirect.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import StatusPage from './pages/StatusPage.jsx';
import GoogleCallbackPage from './pages/GoogleCallbackPage.jsx';
import { Spinner } from './components/ui.jsx';
import ApiDownDialog from './components/ApiDownDialog.jsx';
import TooltipLayer from './components/TooltipLayer.jsx';
// หน้าในแอปโหลดแยกไฟล์ตามหน้าที่เปิด (Suspense อยู่ใน AppLayout รอบ Outlet แถบเมนูจึงไม่กระพริบ)
const OverviewPage = lazy(() => import('./pages/OverviewPage.jsx'));
const CreatePage = lazy(() => import('./pages/CreatePage.jsx'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'));
const InboxPage = lazy(() => import('./pages/InboxPage.jsx'));
const RecordWhtPage = lazy(() => import('./pages/RecordWhtPage.jsx'));
const CalendarPage = lazy(() => import('./pages/CalendarPage.jsx'));
const TaxPage = lazy(() => import('./pages/TaxPage.jsx'));
const ContactsPage = lazy(() => import('./pages/ContactsPage.jsx'));
const LibraryPage = lazy(() => import('./pages/LibraryPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.jsx'));

// หน้าสาธารณะโหลดแยกไฟล์ ผู้ใช้ที่เข้าแอปอย่างเดียวไม่ต้องโหลดเนื้อหาหน้าข้อมูลทั้งหมด
const VerifyPage = lazy(() => import('./pages/VerifyPage.jsx'));
const InfoOverviewPage = lazy(() => import('./pages/info/InfoOverviewPage.jsx'));
const KnowledgePage = lazy(() => import('./pages/info/KnowledgePage.jsx'));

/** ลิงก์ .html เดิม (เช่น QR บนเอกสารที่ออกไปแล้ว /verify.html?token=) ส่งต่อไปหน้า React โดยคง query/hash ไว้ */
const OLD_PATHS = { '/verify.html': '/verify-doc', '/overview.html': '/overview', '/guide.html': '/guide', '/laws.html': '/guide/laws', '/privacy.html': '/guide/privacy', '/login.html': '/login', '/index.html': '/login' };
function OldPath({ to }) {
  const { search, hash } = useLocation();
  return <Navigate to={to + search + hash} replace />;
}

const USERS = ['creator', 'agency', 'corporate'];

/** หน้าที่เปิดได้เฉพาะบางบทบาท บทบาทอื่นกลับไปหน้าแรกของตัวเอง */
function Only({ roles, children }) {
  const { role } = useOutletContext();
  return roles.includes(role) ? children : <Navigate to="/app" replace />;
}

export default function App() {
  return (
    <>
      <ApiDownDialog />
      <TooltipLayer />
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner /></div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify" element={<OtpPage />} />
        </Route>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="overview" element={<Only roles={USERS}><OverviewPage /></Only>} />
          <Route path="create" element={<Only roles={USERS}><CreatePage /></Only>} />
          <Route path="documents" element={<Only roles={USERS}><DocumentsPage /></Only>} />
          <Route path="inbox" element={<Only roles={USERS}><InboxPage /></Only>} />
          <Route path="calendar" element={<Only roles={USERS}><CalendarPage /></Only>} />
          <Route path="analytics" element={<Only roles={USERS}><AnalyticsPage /></Only>} />
          <Route path="tax" element={<Only roles={['creator']}><TaxPage /></Only>} />
          <Route path="contacts" element={<Only roles={['agency', 'corporate']}><ContactsPage /></Only>} />
          <Route path="library" element={<Only roles={USERS}><LibraryPage /></Only>} />
          <Route path="profile" element={<Only roles={USERS}><ProfilePage /></Only>} />
          <Route path="admin" element={<Only roles={['admin']}><AdminPage /></Only>} />
          <Route path="record-wht" element={<Only roles={['creator']}><RecordWhtPage /></Only>} />
        </Route>
        <Route path="/status" element={<StatusPage />} />
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
        <Route path="/verify-doc" element={<VerifyPage />} />
        <Route path="/overview" element={<InfoOverviewPage />} />
        {/* ศูนย์ความรู้: คู่มือ กฎหมาย และนโยบายความเป็นส่วนตัวรวมเป็นโฟลเดอร์ · ลิงก์เดิม /laws /privacy ส่งต่อไปโฟลเดอร์ที่ตรงกัน */}
        <Route path="/guide" element={<KnowledgePage />} />
        <Route path="/guide/:folder" element={<KnowledgePage />} />
        <Route path="/guide/:folder/:article" element={<KnowledgePage />} />
        <Route path="/laws" element={<Navigate to="/guide/laws" replace />} />
        <Route path="/privacy" element={<Navigate to="/guide/privacy" replace />} />
        {Object.entries(OLD_PATHS).map(([from, to]) => <Route key={from} path={from} element={<OldPath to={to} />} />)}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </>
  );
}
