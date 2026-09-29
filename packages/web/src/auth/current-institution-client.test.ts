import { afterEach, describe, expect, it, vi } from 'vitest';
import { listInstitutions, setTeacherCurrentInstitution } from './client';

const institution = {
  id: 'institution-1', districtId: 'district-1', name: 'مدرسة النور', externalCode: null,
  municipality: null, address: null, directorPhone: null, archivedAt: null,
  createdAt: '2026-09-29T10:00:00Z', updatedAt: '2026-09-29T10:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'inspector_csrf=; Max-Age=0; path=/';
});

describe('TASK-043 current Institution client contract for TASK-046', () => {
  it('passes district, q and cursor to the existing server-side list endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [institution], page: { limit: 25, nextCursor: 'next', total: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await listInstitutions({ districtId: 'district-1', q: 'النور', cursor: 'opaque-cursor', limit: 25 });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/institutions?q=%D8%A7%D9%84%D9%86%D9%88%D8%B1&cursor=opaque-cursor&districtId=district-1&limit=25');
    expect(options).toMatchObject({ credentials: 'same-origin' });
  });

  it('sends exact existing-link body, same-origin credentials and CSRF header', async () => {
    document.cookie = 'inspector_csrf=csrf-value; path=/';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { teacherId: 'teacher-1', currentInstitution: institution } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await setTeacherCurrentInstitution('teacher-1', { institutionId: 'institution-1', expectedInstitutionId: null });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/teachers/teacher-1/current-institution');
    expect(options).toMatchObject({ method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-value' } });
    expect(JSON.parse(String(options.body))).toEqual({ institutionId: 'institution-1', expectedInstitutionId: null });
  });

  it('sends exact atomic create-and-link body and preserves conflict status', async () => {
    document.cookie = 'inspector_csrf=csrf-value; path=/';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { teacherId: 'teacher-1', currentInstitution: institution } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Conflict' } }), { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    const createInstitution = { name: 'مدرسة جديدة', municipality: 'وهران', address: 'شارع 1', directorPhone: '+21321234567' };
    await setTeacherCurrentInstitution('teacher-1', { createInstitution, expectedInstitutionId: 'institution-old' });
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ createInstitution, expectedInstitutionId: 'institution-old' });
    await expect(setTeacherCurrentInstitution('teacher-1', { institutionId: 'institution-1', expectedInstitutionId: null }))
      .rejects.toMatchObject({ status: 409 });
  });
});
