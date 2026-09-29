import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, decideSubmission } from './client';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  document.cookie = 'inspector_csrf=test-csrf-token; path=/';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  document.cookie = 'inspector_csrf=; Max-Age=0; path=/';
});

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('TASK-033 decision API client contract', () => {
  it('posts only action and expectedStatus with same-origin credentials and CSRF', async () => {
    fetchMock.mockResolvedValue(response(200, { data: { id: 'submission-1', status: 'REJECTED' } }));
    await decideSubmission({ id: 'submission/1', action: 'REJECT', expectedStatus: 'INTERNAL_REVIEW' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/submissions/submission%2F1/decision');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-csrf-token': 'test-csrf-token' });
    expect(JSON.parse(String(init.body))).toEqual({ action: 'REJECT', expectedStatus: 'INTERNAL_REVIEW' });
    expect(String(init.body)).not.toMatch(/reason|note|districtId|teacher|institution/i);
  });

  it('sends acceptance without an idempotency key', async () => {
    fetchMock.mockResolvedValue(response(200, { data: { id: 'submission-1', status: 'ACCEPTED' } }));
    await decideSubmission({ id: 'submission-1', action: 'ACCEPT', expectedStatus: 'PENDING' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    });
    expect(JSON.parse(String(init.body))).toEqual({ action: 'ACCEPT', expectedStatus: 'PENDING' });
  });

  it('blocks unsupported status/action pairs before making a request', async () => {
    await expect(decideSubmission({ id: 'submission-1', action: 'INTERNAL_REVIEW', expectedStatus: 'INTERNAL_REVIEW' }))
      .rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves HTTP status for safe conflict mapping without changing the request contract', async () => {
    fetchMock.mockResolvedValue(response(409, { error: { message: 'private database detail' } }));
    await expect(decideSubmission({ id: 'submission-1', action: 'REJECT', expectedStatus: 'PENDING' }))
      .rejects.toMatchObject({ status: 409, message: 'private database detail' });
  });
});
