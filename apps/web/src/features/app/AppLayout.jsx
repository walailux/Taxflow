/**
 * AppLayout.jsx โครงหน้าหลังเข้าสู่ระบบ (layout route ของ /app/*)
 * จอใหญ่: แถบเมนูซ้าย (กดปุ่มแฮมเบอร์เกอร์ซ่อน/แสดงได้ จำค่าไว้ในเบราว์เซอร์) + แถบบน · มือถือ: แถบบน + แถบเมนูล่าง 5 ช่อง + เมนูเต็มแบบเลื่อนออก
 * ตรวจสิทธิ์: ยังไม่เข้าสู่ระบบ -> /login · บทบาทไม่ตรงกับเส้นทาง -> หน้าแรกของบทบาทนั้น
 */
import { Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import Avatar, { brandImageUrl } from '../../components/Avatar.jsx';
import { authApi } from '../auth/authApi.js';
import { ME_KEY, useMe } from '../auth/useMe.js';
import { MOBILE_TABS, ROLE_TAG, navFor } from './nav.js';
import Icon from '../../components/Icon.jsx';
import { Spinner, cx } from '../../components/ui.jsx';
import TopBar from './TopBar.jsx';
import NavArt, { NAV_ART } from '../../components/NavArt.jsx';
import ViewLink from './ViewLink.jsx';

/** กรอบไอคอนเมนู (แบบ B): สี่เหลี่ยมมุมมนพื้นขาว เส้นขอบบาง ไอคอนสีส้มเข้ม */
const TILE = 'tf-nav-tile flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-white text-orange-deep transition-colors duration-200';

/** rail = แถบไอคอนอย่างเดียว (ตอนย่อเมนูข้าง) ชื่อเมนูขึ้นเป็นป้ายตอนชี้ (title → TooltipLayer) */
function NavItem({ role, item, badge, onNavigate, compact, rail }) {
  const base = cx(
    'tf-anim-host tf-nav group relative flex items-center gap-3 rounded-xl text-[1rem] font-medium transition-all duration-200 active:scale-[0.97]',
    compact ? 'flex-col gap-1 px-1 py-2 text-[0.8125rem]' : rail ? 'size-12 justify-center' : 'h-11 px-2',
  );
  if (rail) {
    const railContent = (
      <>
        <span className={cx(TILE, 'size-10')}>{NAV_ART.has(item.icon) ? <NavArt name={item.icon} className="size-[1.5rem]" alert={badge > 0} /> : <Icon name={item.icon} className="size-[1.1875rem]" />}</span>
        {badge > 0 && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-orange px-1 text-center text-[0.6875rem] font-semibold leading-[18px] text-white ring-2 ring-white">{badge > 99 ? '99+' : badge}</span>}
      </>
    );
    const railIdle = 'hover:bg-tile/70 [&:hover_.tf-nav-tile]:border-orange-soft';
    if (item.external) return <Link to={item.external} target="_blank" aria-label={item.label} title={item.label} className={cx(base, railIdle)}>{railContent}</Link>;
    return (
      <ViewLink role={role} view={item.view} query={item.query} nav end aria-label={item.label} title={item.label}
        className={({ isActive }) => cx(base, isActive && !item.query
          ? 'bg-orange-pale/70 [&_.tf-nav-tile]:border-orange [&_.tf-nav-tile]:bg-orange [&_.tf-nav-tile]:text-white'
          : railIdle)}
      >
        {railContent}
      </ViewLink>
    );
  }
  // แบบ B: ไอคอนอยู่ในกรอบสี่เหลี่ยมมุมมน (เมนูข้าง) · แถบล่างมือถือยังเป็นไอคอนเปล่า
  const content = (
    <>
      {compact
        ? <Icon name={item.icon} className="size-[1.375rem]" />
        : <span className={TILE}>{NAV_ART.has(item.icon) ? <NavArt name={item.icon} className="size-[1.375rem]" alert={badge > 0} /> : <Icon name={item.icon} className="size-[1.0625rem]" />}</span>}
      <span className={compact ? 'max-w-full truncate' : 'min-w-0 flex-1 truncate'}>{item.label}</span>
      {!compact && item.external && <Icon name="external" className="size-3.5 shrink-0 opacity-40 transition-opacity group-hover:opacity-80" />}
      {badge > 0 && (
        <span className={cx('rounded-full bg-orange px-1.5 text-center text-[0.78125rem] font-semibold leading-[18px] text-white', compact ? 'absolute right-[18%] top-1 min-w-[18px]' : 'min-w-[20px]')}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </>
  );
  const idle = compact ? 'text-[#57534E] hover:text-ink' : 'text-[#44403C] hover:translate-x-0.5 hover:bg-tile/70 hover:text-ink [&:hover_.tf-nav-tile]:border-orange-soft';
  if (item.external) {
    return (
      <Link to={item.external} target="_blank" className={cx(base, idle)}>{content}</Link>
    );
  }
  return (
    <ViewLink
      role={role}
      view={item.view}
      query={item.query}
      nav
      end
      onClick={onNavigate}
      className={({ isActive }) => cx(base, isActive && !item.query
        // เมนูที่เลือก: แถบส้มด้านซ้าย + พื้นส้มจาง + กรอบไอคอนส้ม (เด้งและมีวงกระเพื่อมตอนเลือก ดู .tf-nav ใน index.css)
        ? (compact ? 'text-orange-deep' : 'bg-orange-pale/70 font-semibold text-ink [&_.tf-nav-tile]:border-orange [&_.tf-nav-tile]:bg-orange [&_.tf-nav-tile]:text-white')
        : idle)}
    >
      {content}
    </ViewLink>
  );
}

function SideNav({ role, badges, onNavigate }) {
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-col gap-0.5">
      {navFor(role).map((group, gi) => (
        <div key={gi} className={gi ? 'mt-5 border-t border-line pt-4' : ''}>
          {group.label && <div className="mb-1.5 flex h-5 items-center px-3 text-[0.8125rem] font-semibold tracking-wide text-[#78716C]">{group.label}</div>}
          <div className="flex flex-col gap-0.5">
            {group.items.map((it) => <NavItem key={it.key} role={role} item={it} badge={it.badge ? badges[it.badge] : 0} onNavigate={onNavigate} />)}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** การ์ดโปรไฟล์บนสุดของเมนู: รูปโปรไฟล์ + โลโก้บริษัท (มุมรูป) + ชื่อ + อีเมล + บทบาท · กดแล้วไปหน้าโปรไฟล์ */
function ProfileCard({ user, role, onNavigate }) {
  const name = user.companyName || user.displayName || '-';
  const showLogoBadge = user.avatarFile && user.logoFile;
  return (
    <Link
      to={role === 'admin' ? '/app' : '/app/profile'}
      onClick={onNavigate}
      className="group relative mb-5 block overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF8A3D] via-orange to-[#E04E00] p-3.5 text-white shadow-[0_14px_30px_-18px_rgba(232,90,0,0.85)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-18px_rgba(232,90,0,0.95)]"
      title="ดูและแก้ไขโปรไฟล์"
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-white/15" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-12 right-10 size-24 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-3">
        <span className="relative shrink-0">
          <Avatar user={user} className="size-12 rounded-full ring-[3px] ring-white/90 shadow-[0_6px_14px_-6px_rgba(24,24,27,0.45)]" textClass="text-[1.125rem]" />
          {showLogoBadge && (
            <img src={brandImageUrl('logo', user.logoFile)} alt="" className="absolute -bottom-1 -right-1 size-5 rounded-md bg-white object-contain p-px ring-2 ring-white" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[1rem] font-semibold leading-tight text-white">{name}</b>
          {user.companyName && user.displayName && user.companyName !== user.displayName && (
            <small className="block truncate text-[0.8125rem] text-white/85">{user.displayName}</small>
          )}
          <small className="block truncate text-[0.8125rem] text-white/85">{user.email}</small>
        </span>
        <Icon name="chevron" className="size-4 shrink-0 text-white/80 transition-transform group-hover:translate-x-0.5" />
      </div>
      <span className="relative mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[0.8125rem] font-semibold text-orange-deep shadow-[0_4px_10px_-6px_rgba(24,24,27,0.4)]">
        <Icon name="user" className="size-3.5 shrink-0" />
        <span className="truncate">{ROLE_TAG[role]}</span>
      </span>
    </Link>
  );
}

const SIDEBAR_KEY = 'tf.sidebarHidden';
const readHidden = () => { try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; } };
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

function LogoutButton({ onLogout }) {
  return (
    <button
      type="button"
      onClick={onLogout}
      className="tf-anim-host group flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-2 text-[1rem] font-medium text-danger transition-colors hover:bg-danger-soft"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-danger/20 bg-white transition-colors group-hover:border-danger/40"><Icon name="logout" className="size-[1.0625rem]" /></span>ออกจากระบบ
    </button>
  );
}

export default function AppLayout({ roles }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [sideHidden, setSideHidden] = useState(readHidden);
  const user = me.data && me.data.user;
  const role = user && user.role;

  const inbox = useQuery({
    queryKey: ['requests', 'inbox'],
    queryFn: () => api.get('/api/requests/inbox'),
    enabled: !!user && role !== 'admin',
    refetchInterval: 60_000,
  });
  const badges = { inbox: inbox.data ? inbox.data.actionCount : 0 };

  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => { try { localStorage.setItem(SIDEBAR_KEY, sideHidden ? '1' : '0'); } catch { /* ไม่มีที่เก็บก็ใช้ค่าในหน้านี้ไป */ } }, [sideHidden]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  if (me.isLoading) {
    return <p className="flex min-h-screen items-center justify-center gap-2 text-[1.03125rem] text-ink-soft"><Spinner /> กำลังโหลด</p>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(role)) return <Navigate to="/app" replace />;

  async function logout() {
    await authApi.logout();
    qc.setQueryData(ME_KEY, null);
    void navigate('/login', { replace: true });
  }

  const allItems = navFor(role).flatMap((g) => g.items);
  const tabs = role === 'admin' ? [] : MOBILE_TABS.map((k) => allItems.find((i) => i.key === k)).filter(Boolean);

  // ปุ่มแฮมเบอร์เกอร์: จอใหญ่ = ซ่อน/แสดงแถบเมนูซ้าย · จอเล็ก = เปิดเมนูแบบเลื่อนออก
  const toggleMenu = () => (isDesktop() ? setSideHidden((v) => !v) : setDrawer(true));

  const renderSidebar = (desktop) => (
    <>
      <div className="mb-5 flex items-center justify-between gap-2">
        <Link to="/app" className="inline-flex w-fit px-2" aria-label="TaxFlow หน้าแรก">
          <img src="/img/logo.png" alt="TaxFlow" className="h-9 w-auto" />
        </Link>
        {desktop && (
          <button type="button" onClick={() => setSideHidden(true)} aria-label="ซ่อนเมนู" title="ซ่อนเมนู" className="tf-anim-host flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-ink-soft ring-1 ring-line transition-colors hover:bg-orange-pale hover:text-orange hover:ring-orange/30">
            <Icon name="collapse" className="size-[1.125rem]" />
          </button>
        )}
      </div>
      <ProfileCard user={user} role={role} onNavigate={() => setDrawer(false)} />
      <div className="-mx-1 min-h-0 flex-1 tf-scroll overflow-y-auto px-1">
        <SideNav role={role} badges={badges} onNavigate={() => setDrawer(false)} />
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <LogoutButton onLogout={logout} />
      </div>
    </>
  );

  // เมนูแบบย่อ: เหลือแถบไอคอนแคบ ๆ (ชื่อเมนูขึ้นเป็นป้ายตอนชี้) กดแฮมเบอร์เกอร์บนสุดเพื่อขยายกลับ
  const renderRail = () => (
    <div className="flex h-full w-[4.75rem] flex-col items-center py-5" data-tip-side="right">
      <button type="button" onClick={() => setSideHidden(false)} aria-label="แสดงเมนูเต็ม" title="แสดงเมนูเต็ม" className="tf-anim-host mb-3 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white ring-1 ring-line transition-colors hover:bg-field">
        <Icon name="menu" />
      </button>
      <nav aria-label="เมนูหลัก" className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navFor(role).map((group, gi) => (
          <div key={gi} className="flex flex-col items-center gap-1">
            {gi > 0 && <span aria-hidden="true" className="my-2 h-px w-8 bg-line" />}
            {group.items.map((it) => <NavItem key={it.key} role={role} item={it} badge={it.badge ? badges[it.badge] : 0} rail />)}
          </div>
        ))}
      </nav>
      <div className="mt-3 border-t border-line pt-3">
        <button type="button" onClick={logout} aria-label="ออกจากระบบ" title="ออกจากระบบ" className="tf-anim-host group flex size-12 cursor-pointer items-center justify-center rounded-xl text-danger transition-colors hover:bg-danger-soft">
          <span className="flex size-10 items-center justify-center rounded-[10px] border border-danger/20 bg-white group-hover:border-danger/40"><Icon name="logout" className="size-[1.1875rem]" /></span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* แถบเมนูซ้าย (จอใหญ่) · ย่อแล้วเหลือแถบไอคอน 4.75rem (ความกว้างเลื่อนแบบนุ่ม) */}
      <aside
        className={cx('sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r border-line bg-white transition-[width] duration-300 ease-[var(--ease-slide)] lg:block', sideHidden ? 'w-[4.75rem]' : 'w-[272px]')}
      >
        {sideHidden ? (
          <div key="rail" className="tf-reveal h-full">{renderRail()}</div>
        ) : (
          <div key="full" className="tf-reveal flex h-full w-[272px] flex-col px-4 py-6">
            {renderSidebar(true)}
          </div>
        )}
      </aside>

      {/* เมนูเต็มบนมือถือ */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
          <div role="presentation" className="tf-reveal absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <aside className="tf-drawer-in absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col bg-white px-4 py-6 shadow-2xl">
            <button type="button" onClick={() => setDrawer(false)} aria-label="ปิดเมนู" className="absolute right-3 top-5 flex size-10 cursor-pointer items-center justify-center rounded-xl text-ink-soft hover:bg-field">
              <Icon name="close" />
            </button>
            {renderSidebar(false)}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <TopBar role={role} user={user} onMenu={toggleMenu} sideHidden={sideHidden} onLogout={logout} />
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-2 sm:px-6 lg:px-10 lg:pb-12">
          <div key={pathname} className="tf-fade-up">
            <Suspense fallback={<div className="flex justify-center py-20"><Spinner /></div>}>
              <Outlet context={{ user, role, profile: me.data.profile }} />
            </Suspense>
          </div>
        </main>
      </div>

      {/* แถบเมนูล่าง (มือถือ) */}
      {tabs.length > 0 && (
        <nav aria-label="เมนูลัด" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur lg:hidden">
          {tabs.map((it) => <NavItem key={it.key} role={role} item={it} badge={it.badge ? badges[it.badge] : 0} compact />)}
          <button type="button" onClick={() => setDrawer(true)} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.8125rem] font-medium text-ink-soft">
            <Icon name="menu" className="size-[1.375rem]" /><span>เมนู</span>
          </button>
        </nav>
      )}
    </div>
  );
}
