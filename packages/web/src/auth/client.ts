export type InspectorIdentity = { id: string; email: string };
export type DistrictOption = { id: string; name: string };
export type Institution = {
  id: string;
  districtId: string;
  name: string;
  externalCode: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type InstitutionPage = { limit: number; nextCursor: string | null; total: number };

type ApiFailure = { error?: { message?: string; fields?: Record<string, string[]> } };

export class ApiRequestError extends Error {
  constructor(message: string, readonly fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

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
  throw new ApiRequestError(body?.error?.message ?? 'تعذر إكمال الطلب.', body?.error?.fields);
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

export async function getCurrentDistricts(): Promise<DistrictOption[]> {
  const response = await fetch('/api/v1/me/districts', { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  const body = await response.json() as { items: DistrictOption[] };
  return body.items;
}

export async function listInstitutions(options: { q?: string; cursor?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (options.q) query.set('q', options.q);
  if (options.cursor) query.set('cursor', options.cursor);
  query.set('limit', String(options.limit ?? 25));
  const response = await fetch(`/api/v1/institutions?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: Institution[]; page: InstitutionPage }>;
}

export async function createInstitution(input: { districtId: string; name: string; externalCode?: string }) {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new Error('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch('/api/v1/institutions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify(input),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: Institution }>;
}
