import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

type AppShellProps = { children: ReactNode; headerAction?: ReactNode };

export function AppShell({ children, headerAction }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        انتقل إلى المحتوى الرئيسي
      </a>
      <header className="app-header">
        <p className="app-header__title">منصة مفتش التربية البدنية والرياضية</p>
        {headerAction}
      </header>
      <div className="app-shell__body">
        <aside className="app-sidebar">
          <nav aria-label="التنقل الرئيسي">
            <NavLink to="/app/submissions">طلبات الأساتذة</NavLink>
            <NavLink to="/app/institutions">المؤسسات</NavLink>
            <NavLink to="/app/teachers">دليل الأساتذة</NavLink>
          </nav>
        </aside>
        <main id="main-content" className="app-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
