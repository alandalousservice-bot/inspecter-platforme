export type InspectorIdentity = { id: string; email: string };

type ApiFailure = { error?: { message?: string } };

function csrfCookie(): string | undefined {
  const prefix = 'inspector_csrf=';
  const entry = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return undefined;
  }
}

async function ensureCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
  if (!response.ok && response.status !== 401) throw new Error('تعذر الاتصال بخدمة الدخول.');
  const token = csrfCookie();
  if (!token) throw new Error('تعذر تهيئة حماية الطلب. أعد المحاولة.');
  return token;
}

async function readFailure(response: Response): Promise<never> {
  let body: ApiFailure | undefined;
  try {
    body = await response.json() as ApiFailure;
  } catch {
    // Keep transport/parser details out of the UI.
  }
  throw new Error(body?.error?.message ?? 'تعذر إكمال الطلب.');
}

export async function login(email: string, password: string): Promise<InspectorIdentity> {
  const csrfToken = await ensureCsrfToken();
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return readFailure(response);
  const body = await response.json() as { data: InspectorIdentity };
  return body.data;
}

export async function logout(): Promise<void> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new Error('تعذر التحقق من الطلب.');
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': csrfToken },
  });
  if (!response.ok) return readFailure(response);
}

export async function getCurrentInspector(): Promise<InspectorIdentity | null> {
  const response = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
  if (response.status === 401) return null;
  if (!response.ok) return readFailure(response);
  const body = await response.json() as { data: InspectorIdentity };
  return body.data;
}
