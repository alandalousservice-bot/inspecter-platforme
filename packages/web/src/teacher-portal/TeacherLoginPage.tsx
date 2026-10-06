import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Input, Card, CardContent, PageHeader } from '../ui';
import { portalFetch } from './client';
import './portal.css';
export function TeacherLoginPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [ready, setReady] = useState(false);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const [activationToken] = useState(() => window.location.hash.slice(1));
  const [activated, setActivated] = useState(false); const navigate = useNavigate();
  useEffect(() => { if (window.location.hash) window.history.replaceState(null, '', window.location.pathname); void portalFetch('/teacher/auth/csrf').then(() => setReady(true)).catch(() => setError('تعذر تجهيز تسجيل الدخول.')); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (activationToken && !activated) { await portalFetch('/teacher/auth/activate', { token: activationToken, password }); setActivated(true); setPassword(''); }
      else { await portalFetch('/teacher/auth/login', { email, password }); navigate('/teacher', { replace: true }); }
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تسجيل الدخول.'); } finally { setSaving(false); }
  }
  return <main className="teacher-login" dir="rtl"><PageHeader title="مساحة الأستاذ" description="حساب مرتبط بملفك المعتمد لدى المفتش." /><Card><CardContent>
    {activated ? <p role="status">تم تفعيل الحساب. سجّل الدخول بالبريد المحدد في الدعوة.</p> : null}
    <form onSubmit={(e) => { void submit(e); }}>
      {!activationToken || activated ? <Input id="teacher-login-email" label="البريد الإلكتروني للحساب" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /> : <p>الدعوة خاصة بأستاذ محدد، ولا تنشئ سجلًا مهنيًا جديدًا.</p>}
      <Input id="teacher-login-password" label="كلمة المرور" type="password" autoComplete={activationToken && !activated ? 'new-password' : 'current-password'} minLength={activationToken && !activated ? 12 : 1} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} />
      {error ? <p role="alert">{error}</p> : null}<Button type="submit" disabled={!ready} loading={saving}>{activationToken && !activated ? 'تفعيل الحساب' : 'تسجيل الدخول'}</Button>
    </form><p>تفعيل الحساب متاح بدعوة المفتش فقط. لا يوجد تسجيل مفتوح.</p><Link to="/login">دخول المفتش</Link>
  </CardContent></Card></main>;
}
