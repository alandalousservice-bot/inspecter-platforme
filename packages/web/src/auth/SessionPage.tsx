import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card } from '../ui/index';
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

  if (checking) return <main className="login-page" aria-busy="true">جارٍ التحقق من الجلسة…</main>;

  return (
    <main className="login-page" id="main-content">
      <Card className="login-card" aria-labelledby="session-title">
        <h1 id="session-title">تم التحقق من جلسة المفتش</h1>
        {error ? <p role="alert">{error}</p> : null}
        <Button type="button" disabled={submitting} onClick={() => void handleLogout()}>
          {submitting ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
        </Button>
      </Card>
    </main>
  );
}
