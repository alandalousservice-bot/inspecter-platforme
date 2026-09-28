import type { ReactNode } from 'react';

type AppShellProps = { children: ReactNode };

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        انتقل إلى المحتوى الرئيسي
      </a>
      <header className="app-header">
        <p className="app-header__title">منصة مفتش التربية البدنية والرياضية</p>
      </header>
      <div className="app-shell__body">
        <aside className="app-sidebar">
          <nav aria-label="التنقل الرئيسي">
            <a href="/" aria-current="page">
              مساحة العمل
            </a>
          </nav>
        </aside>
        <main id="main-content" className="app-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
