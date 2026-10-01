import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, type TeacherQualification } from '../auth/client';
import { TeacherQualificationsSection } from './TeacherQualificationsSection';

const { listTeacherQualifications, createTeacherQualification, patchTeacherQualification, deleteTeacherQualification } = vi.hoisted(() => ({
  listTeacherQualifications: vi.fn(), createTeacherQualification: vi.fn(), patchTeacherQualification: vi.fn(), deleteTeacherQualification: vi.fn(),
}));
vi.mock('../auth/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/client')>(),
  listTeacherQualifications, createTeacherQualification, patchTeacherQualification, deleteTeacherQualification,
}));

const first: TeacherQualification = {
  id: 'qualification-1', name: 'شهادة أولى', issuingBody: 'معهد التربية', qualificationDate: '2020-04-03',
  createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z',
};

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
  }
});
beforeEach(() => {
  listTeacherQualifications.mockResolvedValue({ items: [] });
  createTeacherQualification.mockResolvedValue({ data: first });
  patchTeacherQualification.mockResolvedValue({ data: first });
  deleteTeacherQualification.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function renderSection(legacy: string | null = null) {
  return render(<div dir="rtl"><TeacherQualificationsSection teacherId="teacher-1" legacyQualifications={legacy} /></div>);
}

describe('TASK-081 structured qualifications profile section', () => {
  it('shows loading and then the server-provided records with accessible actions', async () => {
    let resolve!: (value: { items: TeacherQualification[] }) => void;
    listTeacherQualifications.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { container } = renderSection();
    expect(screen.getByRole('status').textContent).toContain('جارٍ تحميل المؤهلات');
    resolve({ items: [first] });
    expect(await screen.findByRole('heading', { name: 'شهادة أولى' })).toBeTruthy();
    expect(screen.getByText('معهد التربية')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تعديل شهادة أولى' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'حذف شهادة أولى' })).toBeTruthy();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
  });

  it('shows a truthful empty state and keeps legacy information distinct', async () => {
    renderSection('نص مؤهلات قديم');
    expect(await screen.findByRole('heading', { name: 'لم تُسجَّل مؤهلات منظَّمة بعد' })).toBeTruthy();
    expect(screen.getByText('توجد معلومات مؤهلات سابقة في الحقل النصي المنفصل.')).toBeTruthy();
    expect(screen.queryByText('الأستاذ لا يملك مؤهلات')).toBeNull();
  });

  it('shows a safe error and supports retry', async () => {
    listTeacherQualifications.mockRejectedValueOnce(new Error('private database path'));
    renderSection();
    expect(await screen.findByRole('heading', { name: 'تعذر تحميل المؤهلات' })).toBeTruthy();
    expect(screen.queryByText('private database path')).toBeNull();
    listTeacherQualifications.mockResolvedValueOnce({ items: [first] });
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByRole('heading', { name: 'شهادة أولى' })).toBeTruthy();
  });

  it('validates and normalizes before create, then refreshes the collection', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة مؤهل' }));
    expect(screen.getByRole('dialog', { name: 'إضافة مؤهل' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المؤهل' }));
    expect(await screen.findByText('أدخل اسم الشهادة.')).toBeTruthy();
    expect(createTeacherQualification).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: /الشهادة/u }), { target: { value: '  e\u0301cole   primaire ' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'مصدرها' }), { target: { value: ' جهة   مانحة ' } });
    fireEvent.change(screen.getByLabelText('تاريخها'), { target: { value: '2024-02-29' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المؤهل' }));
    await waitFor(() => expect(createTeacherQualification).toHaveBeenCalledWith('teacher-1', { name: 'école primaire', issuingBody: 'جهة مانحة', qualificationDate: '2024-02-29' }));
    expect(await screen.findByText('تمت إضافة المؤهل.')).toBeTruthy();
    expect(listTeacherQualifications).toHaveBeenCalledTimes(2);
  });

  it('maps server validation safely and does not expose technical error content', async () => {
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة مؤهل' }));
    fireEvent.change(screen.getByRole('textbox', { name: /الشهادة/u }), { target: { value: 'شهادة' } });
    createTeacherQualification.mockRejectedValueOnce(new ApiRequestError('internal server text', { name: ['قيمة غير صالحة.'] }, 400));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المؤهل' }));
    expect(await screen.findByText('قيمة غير صالحة.')).toBeTruthy();
    expect(screen.queryByText('internal server text')).toBeNull();
  });

  it('edits and clears optional fields, and confirms physical deletion', async () => {
    listTeacherQualifications.mockResolvedValue({ items: [first] });
    renderSection('legacy unchanged');
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل شهادة أولى' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'مصدرها' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ المؤهل' }));
    await waitFor(() => expect(patchTeacherQualification).toHaveBeenCalledWith('teacher-1', first.id, { name: 'شهادة أولى', issuingBody: null, qualificationDate: first.qualificationDate }));
    await waitFor(() => expect(listTeacherQualifications).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('جارٍ تحميل المؤهلات المنظمة…')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'حذف شهادة أولى' }));
    expect(await screen.findByRole('dialog', { name: 'حذف المؤهل' })).toBeTruthy();
    expect(deleteTeacherQualification).not.toHaveBeenCalled();
    listTeacherQualifications.mockResolvedValueOnce({ items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الحذف' }));
    await waitFor(() => expect(deleteTeacherQualification).toHaveBeenCalledWith('teacher-1', first.id));
    expect(await screen.findByText('تم حذف المؤهل.')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'لم تُسجَّل مؤهلات منظَّمة بعد' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /تعديل|حذف شهادة/u })).toBeNull();
    expect(screen.queryByText('legacy unchanged')).toBeNull();
  });

  it('offers only the contracted structured operations', async () => {
    listTeacherQualifications.mockResolvedValueOnce({ items: [first] });
    renderSection();
    await screen.findByRole('heading', { name: 'شهادة أولى' });
    expect(screen.queryByRole('button', { name: /أرشفة|استعادة|اعتماد|تحقق/u })).toBeNull();
  });
});
