import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, type SupplementaryWorkplace } from '../auth/client';
import { TeacherSupplementaryWorkplacesSection } from './TeacherSupplementaryWorkplacesSection';

const { listSupplementaryWorkplaces, listInstitutions, createSupplementaryWorkplace, patchSupplementaryWorkplace } = vi.hoisted(() => ({
  listSupplementaryWorkplaces: vi.fn(), listInstitutions: vi.fn(), createSupplementaryWorkplace: vi.fn(), patchSupplementaryWorkplace: vi.fn(),
}));
vi.mock('../auth/client', async (original) => ({
  ...await original<typeof import('../auth/client')>(), listSupplementaryWorkplaces, listInstitutions, createSupplementaryWorkplace, patchSupplementaryWorkplace,
}));

const row = (id: string, isCurrent: boolean, validFrom: string, validTo: string | null): SupplementaryWorkplace => ({
  id, institution: { id: `inst-${id}`, name: `مؤسسة ${id}`, municipality: 'بلدية', archivedAt: null }, validFrom, validTo, isCurrent,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
beforeEach(() => {
  listSupplementaryWorkplaces.mockResolvedValue({ items: [row('now', true, '2020-01-01', null), row('future', false, '2030-01-01', null), row('past', false, '2020-01-01', '2021-01-01')] });
  listInstitutions.mockResolvedValue({ data: [{ id: 'home', name: 'Home', districtId: 'd', municipality: null, address: null, externalCode: null, directorPhone: null, email: null, archivedAt: null, createdAt: '', updatedAt: '' }, { id: 'other', name: 'Other', districtId: 'd', municipality: null, address: null, externalCode: null, directorPhone: null, email: null, archivedAt: null, createdAt: '', updatedAt: '' }, { id: 'archived', name: 'Archived', districtId: 'd', municipality: null, address: null, externalCode: null, directorPhone: null, email: null, archivedAt: '2026-01-01T00:00:00.000Z', createdAt: '', updatedAt: '' }], page: { limit: 25, nextCursor: 'cursor-next', total: 3 } });
  createSupplementaryWorkplace.mockResolvedValue({ data: row('new', true, '2025-01-01', null) });
  patchSupplementaryWorkplace.mockResolvedValue({ data: row('now', true, '2020-01-01', '2026-01-01') });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('TASK-082 supplementary workplaces profile section', () => {
  it('groups current, future and historical relationships and offers no delete control', async () => {
    render(<TeacherSupplementaryWorkplacesSection teacherId="t" districtId="d" homeInstitutionId="home" />);
    expect(await screen.findByText('مؤسسة now')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'الحالية (1)' })).toBeTruthy();
    fireEvent.click(screen.getByText('علاقات تكملة النصاب المستقبلية (1)'));
    fireEvent.click(screen.getByText('علاقات تكملة النصاب السابقة (1)'));
    expect(screen.getByRole('heading', { name: 'المستقبلية (1)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'السابقة (1)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /حذف/ })).toBeNull();
  });

  it('searches active Institutions, excludes current home, creates and refreshes list', async () => {
    render(<TeacherSupplementaryWorkplacesSection teacherId="t" districtId="d" homeInstitutionId="home" />);
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة مؤسسة تكملة النصاب' }));
    expect(await screen.findByRole('button', { name: 'Other' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archived' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(createSupplementaryWorkplace).toHaveBeenCalledWith('t', expect.objectContaining({ institutionId: 'other' })));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(listSupplementaryWorkplaces).toHaveBeenCalledTimes(2);
  });

  it('shows safe conflict feedback when the server rejects a mutation', async () => {
    patchSupplementaryWorkplace.mockRejectedValueOnce(new ApiRequestError('conflict', undefined, 409));
    render(<TeacherSupplementaryWorkplacesSection teacherId="t" districtId="d" homeInstitutionId="home" />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'تصحيح التواريخ' }))[0]);
    fireEvent.change(screen.getByLabelText('تاريخ نهاية العلاقة (اختياري)'), { target: { value: '2025-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(await screen.findByText(/يتعارض هذا الإجراء/)).toBeTruthy();
  });

  it('renders loading and safe API error states with retry', async () => {
    let resolveList: ((value: { items: SupplementaryWorkplace[] }) => void) | undefined;
    listSupplementaryWorkplaces.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    render(<TeacherSupplementaryWorkplacesSection teacherId="t" districtId="d" homeInstitutionId="home" />);
    expect(screen.getByText(/جارٍ تحميل مؤسسات/)).toBeTruthy();
    resolveList?.({ items: [] });
    expect(await screen.findByText('لا توجد مؤسسات تكملة نصاب مسجلة')).toBeTruthy();
    cleanup();
    listSupplementaryWorkplaces.mockRejectedValueOnce(new Error('private internal detail'));
    render(<TeacherSupplementaryWorkplacesSection teacherId="t2" districtId="d" homeInstitutionId="home" />);
    expect(await screen.findByText('تعذر تحميل العلاقات')).toBeTruthy();
    expect(screen.queryByText('private internal detail')).toBeNull();
  });

  it('rejects invalid date ranges locally and uses the server cursor/search contract', async () => {
    render(<TeacherSupplementaryWorkplacesSection teacherId="t" districtId="d" homeInstitutionId="home" />);
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة مؤسسة تكملة النصاب' }));
    expect(await screen.findByRole('button', { name: 'Other' })).toBeTruthy();
    expect(listInstitutions).toHaveBeenCalledWith(expect.objectContaining({ districtId: 'd', limit: 25 }));
    fireEvent.change(screen.getByLabelText('البحث عن مؤسسة نشطة'), { target: { value: 'مؤسسة' } });
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    await waitFor(() => expect(listInstitutions).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'مؤسسة', cursor: undefined })));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => expect(listInstitutions).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-next' })));
    fireEvent.change(screen.getByLabelText(/تاريخ بداية العلاقة/u), { target: { value: '2026-05-10' } });
    fireEvent.change(screen.getByLabelText(/تاريخ نهاية العلاقة/u), { target: { value: '2026-05-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(await screen.findByText('يجب أن يكون تاريخ النهاية بعد تاريخ البداية.')).toBeTruthy();
    expect(createSupplementaryWorkplace).not.toHaveBeenCalled();
  });

  it('offers explicit close only for a current open relation', async () => {
    render(<TeacherSupplementaryWorkplacesSection teacherId="t" districtId="d" homeInstitutionId="home" />);
    expect(await screen.findByText('مؤسسة now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إنهاء العلاقة' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'تصحيح التواريخ' })[0]);
    expect(screen.queryAllByRole('button', { name: 'إنهاء العلاقة' })).toHaveLength(1);
  });
});
