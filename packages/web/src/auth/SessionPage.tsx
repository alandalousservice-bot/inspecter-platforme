import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Button, LoadingState } from '../ui/index';
import { AppShell } from '../ui/AppShell';
import { getCurrentInspector, logout, type InspectorIdentity } from './client';

export function SessionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [inspector, setInspector] = useState<InspectorIdentity | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getCurrentInspector()
      .then((inspector) => {
        if (active) {
          setInspector(inspector);
          if (!inspector) navigate('/login', { replace: true });
        }
      })
      .catch(() => {
        if (active) navigate('/login', { replace: true });
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, [navigate]);

  async function handleLogout() {
    setError(undefined);
    setSubmitting(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setError('تعذر تسجيل الخروج. أعد المحاولة.');
      setSubmitting(false);
    }
  }

  if (checking) return <main className="login-page"><LoadingState label="جارٍ التحقق من الجلسة…" /></main>;

  if (/^\/app\/teachers\/[^/]+\/information-card\/print\/?$/u.test(location.pathname)) {
    return <main id="main-content" className="app-main app-main--print" tabIndex={-1}><Outlet /></main>;
  }

  return (
    <AppShell inspector={inspector} headerAction={<div className="app-topbar__actions">{error ? <span role="alert">{error}</span> : null}<Button variant="secondary" type="button" disabled={submitting} onClick={() => void handleLogout()}>{submitting ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}</Button></div>}>
      <Outlet />
    </AppShell>
  );
}
