import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, ErrorState, Input } from '../ui/index';
import { ShellIcon } from '../ui/ShellIcon';
import { login } from './client';
import './login.css';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/app', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدخول. أعد المحاولة.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page" dir="rtl" id="main-content">
      <div className="login-layout">
        <Link className="login-back" to="/">
          <ShellIcon name="arrow-back" />
          <span>العودة إلى الرئيسية</span>
        </Link>
        <Card className="login-card" aria-labelledby="login-title">
          <div className="login-card__identity">
            <span className="login-card__mark"><ShellIcon name="shield" /></span>
            <span className="login-card__identity-copy">
              <span className="login-card__eyebrow">فضاء المفتش</span>
              <span className="login-card__product-name">منصة مفتش التربية البدنية والرياضية</span>
            </span>
          </div>
          <div className="login-card__heading">
            <h1 id="login-title">دخول فضاء المفتش</h1>
            <p className="login-card__description">سجّل الدخول لمتابعة أعمالك البيداغوجية.</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit} aria-busy={submitting}>
            <Input
              id="inspector-email"
              label="البريد الإلكتروني"
              name="email"
              type="email"
              autoComplete="username"
              dir="ltr"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <Input
              id="inspector-password"
              label="كلمة المرور"
              name="password"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            {error ? <ErrorState title="تعذر تسجيل الدخول" description={error} /> : null}
            <Button className="login-form__submit" type="submit" loading={submitting}>
              {!submitting ? <ShellIcon name="login" /> : null}
              {submitting ? 'جارٍ التحقق…' : 'تسجيل الدخول'}
            </Button>
          </form>
        </Card>
        <p className="login-note"><ShellIcon name="lock" /><span>الوصول مخصص للمفتشين المسجلين.</span></p>
      </div>
    </main>
  );
}
