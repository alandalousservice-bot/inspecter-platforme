import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { Button, LoadingState } from '../ui/index';
import { AppShell } from '../ui/AppShell';
import { getCurrentInspector, logout } from './client';

export function SessionPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getCurrentInspector()
      .then((inspector) => {
        if (active && !inspector) navigate('/login', { replace: true });
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

  return (
    <AppShell headerAction={<div className="app-header__actions">{error ? <span role="alert">{error}</span> : null}<Button variant="secondary" type="button" disabled={submitting} onClick={() => void handleLogout()}>{submitting ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}</Button></div>}>
      <Outlet />
    </AppShell>
  );
}
