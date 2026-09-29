import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { TeacherProfile } from '../auth/client';
import { TeacherProfilePage } from './TeacherProfilePage';

const { getTeacherProfile, patchTeacherProfile } = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(), patchTeacherProfile: vi.fn(),
}));
vi.mock('../auth/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/client')>(), getTeacherProfile, patchTeacherProfile,
}));

const profile: TeacherProfile = {
  id: 'teacher-1', districtId: 'hidden-district', name: 'أمينة', surname: 'بن صالح',
  birthDate: '1985-03-04', placeOfBirth: 'وهران', phone: '+213555123456', email: 'Amina@example.dz',
  professionalStatus: 'PERMANENT', employedAt: '2005-09-01', confirmedAt: null,
  qualifications: 'شهادة', recordStatus: 'ACTIVE', archivedAt: null,
  createdAt: '2026-09-29T10:00:00Z', updatedAt: '2026-09-29T10:00:00Z',
  declaredInstitutions: { primaryInstitutionName: 'ابتدائية النور', additionalInstitutionNames: ['ابتدائية الفجر'] },
};

function renderPage() {
  return render(<MemoryRouter initialEntries={['/app/teachers/teacher-1']}><Routes>
    <Route path="/app/teachers/:id" element={<TeacherProfilePage />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  getTeacherProfile.mockResolvedValue({ data: profile });
  patchTeacherProfile.mockResolvedValue({ data: { ...profile, surname: 'عماري' } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('TASK-035 Teacher profile UI', () => {
  it('loads the authorized profile in RTL with read-only status and declared context', async () => {
    let resolve!: (value: { data: TeacherProfile }) => void;
    getTeacherProfile.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { container } = renderPage();
    expect(screen.getByRole('status').textContent).toContain('جارٍ تحميل');
    resolve({ data: profile });
    expect(await screen.findByRole('heading', { name: 'المؤسسات المصرح بها' })).toBeTruthy();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getByText('نشط')).toBeTruthy();
    expect(screen.getByText('معلومات صرّح بها المرسل — غير معتمدة، وليست إسنادات للمؤسسات.')).toBeTruthy();
    expect(screen.getByText('ابتدائية النور')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /حذف|أرشفة|إسناد/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /قائمة الأساتذة/ })).toBeNull();
  });

  it('edits only allowed fields, cancels and saves actual PATCH without optimistic display', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الملف' }));
    expect(screen.getByRole('textbox', { name: 'الاسم' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /حالة السجل|المؤسسة الأساسية/ })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'اللقب' }), { target: { value: 'عماري' } });
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(screen.getByText('بن صالح')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تعديل الملف' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'اللقب' }), { target: { value: 'عماري' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    await waitFor(() => expect(patchTeacherProfile).toHaveBeenCalledWith('teacher-1', { surname: 'عماري' }));
    expect(await screen.findByRole('heading', { name: 'تم حفظ الملف بنجاح.' })).toBeTruthy();
    expect(screen.getByText('عماري')).toBeTruthy();
  });

  it('sends intentional nullable clear as null and rejects accidental empty strings', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الملف' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'رقم الهاتف' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await screen.findByText('أدخل قيمة أو استخدم زر المسح.')).toBeTruthy();
    expect(patchTeacherProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'مسح رقم الهاتف' }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    await waitFor(() => expect(patchTeacherProfile).toHaveBeenCalledWith('teacher-1', { phone: null }));
  });

  it('shows safe unavailable and save failure states without internal details', async () => {
    getTeacherProfile.mockRejectedValueOnce(new Error('SQL private path'));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'تعذر عرض ملف الأستاذ' })).toBeTruthy();
    cleanup();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الملف' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'اللقب' }), { target: { value: 'عماري' } });
    patchTeacherProfile.mockRejectedValueOnce(new Error('SQL private path'));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('تعذر حفظ الملف'));
    expect(screen.queryByText(/SQL private path/)).toBeNull();
  });

  it('blocks a second save while pending and shows safe server validation', async () => {
    let reject!: (reason: unknown) => void;
    patchTeacherProfile.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الملف' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'اللقب' }), { target: { value: 'عماري' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' }).hasAttribute('disabled')).toBe(true);
    expect(patchTeacherProfile).toHaveBeenCalledOnce();
    const { ApiRequestError } = await import('../auth/client');
    reject(new ApiRequestError('تحقق من البيانات المدخلة.', { surname: ['قيمة غير صالحة.'] }, 400));
    expect(await screen.findByText('قيمة غير صالحة.')).toBeTruthy();
    expect(screen.getAllByRole('alert').some((item) => item.textContent?.includes('تحقق من الحقول'))).toBe(true);
  });

  it('shows a generic unavailable message for scoped 404 during save', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل الملف' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'اللقب' }), { target: { value: 'عماري' } });
    const { ApiRequestError } = await import('../auth/client');
    patchTeacherProfile.mockRejectedValueOnce(new ApiRequestError('internal-id', undefined, 404));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    expect(await screen.findByText('ملف الأستاذ غير متاح ضمن نطاق الوصول.')).toBeTruthy();
    expect(screen.queryByText('internal-id')).toBeNull();
  });
});
