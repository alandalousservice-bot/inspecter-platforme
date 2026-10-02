import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { InspectorIdentity } from '../auth/client';
import { ShellIcon, type ShellIconName } from './ShellIcon';
import { PageContainer } from './PageSystem';
import './app-shell.css';

type AppShellProps = {
  children: ReactNode;
  inspector?: InspectorIdentity | null;
  headerAction?: ReactNode;
};

const navigation: Array<{ to: string; label: string; icon: ShellIconName }> = [
  { to: '/app/institutions', label: 'المؤسسات', icon: 'institutions' },
  { to: '/app/teachers', label: 'دليل الأساتذة', icon: 'teachers' },
  { to: '/app/submissions', label: 'طلبات الأساتذة', icon: 'submissions' },
  { to: '/app/visits', label: 'الزيارات', icon: 'visits' },
  { to: '/app/follow-ups', label: 'المتابعات', icon: 'follow-ups' },
];

export function AppShell({ children, inspector, headerAction }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isInformationCardPrint = /\/app\/teachers\/[^/]+\/information-card\/print\/?$/u.test(location.pathname);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => closeRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        window.requestAnimationFrame(() => openerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileOpen(false);
        return;
      }
      const sidebar = drawerRef.current?.querySelector('.app-sidebar');
      if (sidebar?.contains(document.activeElement)) openerRef.current?.focus();
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  function closeMobileDrawer() {
    setMobileOpen(false);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }

  function handleNavigation() {
    if (mobileOpen) closeMobileDrawer();
  }

  if (isInformationCardPrint) {
    return <main id="main-content" className="app-main app-main--print" tabIndex={-1}>{children}</main>;
  }

  return (
    <div className={`app-shell${collapsed ? ' app-shell--collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">انتقل إلى المحتوى الرئيسي</a>
      <div className="app-shell__layout">
        <div
          ref={drawerRef}
          className="app-shell__drawer-layer"
          data-open={mobileOpen || undefined}
          role={mobileOpen ? 'dialog' : undefined}
          aria-modal={mobileOpen ? 'true' : undefined}
          aria-label={mobileOpen ? 'قائمة التنقل الرئيسية' : undefined}
        >
          {mobileOpen ? <button className="app-shell__backdrop" type="button" aria-label="إغلاق قائمة التنقل" onClick={closeMobileDrawer} /> : null}
          <aside
            className="app-sidebar"
            data-collapsed={collapsed || undefined}
            aria-label="مساحة العمل والتنقل"
          >
            <div className="app-sidebar__brand">
              <ShellIcon name="institutions" className="app-sidebar__brand-icon" />
              <div className="app-sidebar__brand-copy">
                <strong>منصة مفتش التربية البدنية والرياضية</strong>
                <span>مساحة العمل المهنية</span>
              </div>
              <button ref={closeRef} className="app-sidebar__close" type="button" aria-label="إغلاق القائمة" onClick={closeMobileDrawer}>
                <ShellIcon name="close" />
              </button>
            </div>

            <nav id="app-primary-navigation" className="app-sidebar__primary" aria-label="مساحات العمل">
              <p className="app-sidebar__section-label">إدارة العمل</p>
              {navigation.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `app-sidebar__link${isActive ? ' is-active' : ''}`}
                  data-label={label}
                  aria-label={label}
                  onClick={handleNavigation}
                >
                  <ShellIcon name={icon} />
                  <span className="app-sidebar__link-label">{label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="app-sidebar__account">
              <p className="app-sidebar__section-label">الحساب</p>
              <NavLink
                to="/app/me/professional-identity"
                className={({ isActive }) => `app-sidebar__link${isActive ? ' is-active' : ''}`}
                data-label="هويتي المهنية"
                aria-label="هويتي المهنية"
                onClick={handleNavigation}
              >
                <ShellIcon name="account" />
                <span className="app-sidebar__link-label">هويتي المهنية</span>
              </NavLink>
            </div>
          </aside>
        </div>

        <div className="app-shell__content" inert={mobileOpen}>
          <header className="app-topbar">
            <div className="app-topbar__context">
              <button
                ref={openerRef}
                className="app-topbar__menu-button app-topbar__menu-button--mobile"
                type="button"
                aria-label="فتح قائمة التنقل"
                aria-expanded={mobileOpen}
                aria-controls="app-primary-navigation"
                onClick={() => setMobileOpen(true)}
              >
                <ShellIcon name="menu" />
              </button>
              <button
                className="app-topbar__menu-button app-topbar__menu-button--desktop"
                type="button"
                aria-label={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
                aria-expanded={!collapsed}
                aria-controls="app-primary-navigation"
                onClick={() => setCollapsed((value) => !value)}
              >
                <ShellIcon name={collapsed ? 'expand' : 'collapse'} />
              </button>
              <span className="app-topbar__context-label">مساحة المفتش</span>
            </div>
            <div className="app-topbar__account">
              {inspector?.email ? <bdi className="app-topbar__email" dir="ltr">{inspector.email}</bdi> : null}
              {headerAction}
            </div>
          </header>
          <main id="main-content" className="app-main" tabIndex={-1}>
            <PageContainer>{children}</PageContainer>
          </main>
        </div>
      </div>
    </div>
  );
}
