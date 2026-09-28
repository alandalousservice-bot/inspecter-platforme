import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Input } from '../ui/index';
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
    <main className="login-page" id="main-content">
      <Card className="login-card" aria-labelledby="login-title">
        <div className="login-card__heading">
          <p className="login-card__eyebrow">منصة مفتش التربية البدنية والرياضية</p>
          <h1 id="login-title">دخول المفتش</h1>
          <p className="login-card__description">أدخل بيانات حساب المفتش للمتابعة.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
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
          {error ? <p className="login-form__error" role="alert">{error}</p> : null}
          <Button className="login-form__submit" type="submit" disabled={submitting}>
            {submitting ? 'جارٍ التحقق…' : 'تسجيل الدخول'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
