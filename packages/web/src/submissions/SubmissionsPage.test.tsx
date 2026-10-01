import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SubmissionsPage } from './SubmissionsPage';
import type { SubmissionDetail, SubmissionListItem } from '../auth/client';
import { SubmissionDetailPage } from './SubmissionDetailPage';

const { getSubmission, listSubmissions, decideSubmission } = vi.hoisted(() => ({
  getSubmission: vi.fn(), listSubmissions: vi.fn(), decideSubmission: vi.fn(),
}));
vi.mock('../auth/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/client')>(), getSubmission, listSubmissions, decideSubmission,
}));

const row = (id: string, hasPotentialDuplicates = false): SubmissionListItem => ({
  id, firstName: id === 'two' ? 'ليلى' : 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', submittedAt: '2026-09-28T10:00:00Z',
  primaryInstitutionName: 'ابتدائية النور', status: 'PENDING', hasPotentialDuplicates,
});
const detail: SubmissionDetail = {
  id: 'submission-1', districtId: 'district-hidden', status: 'PENDING', submittedAt: '2026-09-28T10:00:00Z', acceptedTeacherId: null,
  submittedProfile: {
    firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران',
    phone: '+213555123456', email: 'amina@example.dz', professionalStatus: 'PERMANENT', employmentDate: '2005-09-01',
    confirmationDate: '2007-09-01', qualifications: 'شهادة جامعية', notes: 'ملاحظة من المرسل',
  },
  declaredWorkplace: { institutionName: 'ابتدائية النور', municipality: 'وهران', institutionAddress: 'شارع النخيل', directorPhone: '+21321234567', institutionEmail: 'school@example.dz', legacyAdditionalInstitutionNames: [] },
  declaredAdministrative: {
    birthProvince: 'ولاية وهران', professionalFramework: 'إطار رياضي', firstEducationAppointmentDate: '2006-09-01',
    firstEducationAppointmentDecisionNumber: 'قرار تصريح', firstInstallationDate: '2007-09-01', traineeshipDate: null,
    institutionAppointmentDate: '2015-09-01', institutionAppointmentNumber: 'رقم تصريح', administrativeCategory: 'صنف 12',
    administrativeSection: 'قسم 1', administrativeGrade: 'درجة 2', administrativeClassificationEffectiveDate: '2020-01-01',
    personalAddress: 'عنوان خاص',
  },
  structuredQualifications: [{ name: 'ليسانس معلنة', issuingBody: 'جامعة', qualificationDate: '2010-01-01' }],
  supplementaryWorkplaces: [{ institutionName: 'ابتدائية إضافية', municipality: 'بلدية', institutionAddress: null, directorPhone: null }],
  potentialDuplicates: [{
    id: 'candidate-2', firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران',
    status: 'INTERNAL_REVIEW', submittedAt: '2026-09-20T09:00:00Z',
    matchReasons: ['SAME_PHONE', 'SAME_EMAIL', 'SAME_NAME_AND_DOB'],
  }, {
    id: 'candidate-3', firstName: 'ليلى', lastName: 'عمر', dateOfBirth: '1982-06-10', placeOfBirth: 'تلمسان',
    status: 'PENDING', submittedAt: '2026-09-18T09:00:00Z', matchReasons: ['SAME_NAME_AND_DOB'],
  }],
};
const page = (data: SubmissionListItem[] = [], nextCursor: string | null = null, total = data.length) => ({ data, page: { limit: 25, nextCursor, total } });

beforeEach(() => listSubmissions.mockResolvedValue(page([row('one')], null, 1)));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value: function (this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value: function (this: HTMLDialogElement) { this.open = false; },
  });
});

function renderList() {
  return render(<MemoryRouter initialEntries={['/app/submissions']}><Routes><Route path="/app/submissions" element={<SubmissionsPage />} /></Routes></MemoryRouter>);
}
function renderDetail(result: SubmissionDetail | undefined = detail) {
  getSubmission.mockResolvedValue(result ? { data: result } : { data: { ...detail, potentialDuplicates: [] } });
  return render(<MemoryRouter initialEntries={['/app/submissions/submission-1']}><Routes>
    <Route path="/app/submissions/:id" element={<SubmissionDetailPage />} />
  </Routes></MemoryRouter>);
}

describe('TASK-032 submissions list UI', () => {
  it('shows loading then an accessible Arabic RTL list with neutral candidate indicator only when true', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    listSubmissions.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { container } = renderList();
    expect(screen.getByRole('status').textContent).toContain('جارٍ تحميل الطلبات');
    resolve(page([row('one', true), row('two', false)], null, 2));
    expect((await screen.findAllByRole('link')).some((link) => link.textContent === 'أمينة بن صالح')).toBe(true);
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getAllByText('قد توجد طلبات مشابهة')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'طلبات الأساتذة' })).toBeTruthy();
    expect(screen.getByText('إجمالي النتائج: 2')).toBeTruthy();
    expect(screen.queryByText('+213555123456')).toBeNull();
    expect(screen.queryByText('amina@example.dz')).toBeNull();
  });

  it('shows the empty state and a safe retryable error', async () => {
    listSubmissions.mockResolvedValueOnce(page());
    renderList();
    expect(await screen.findByRole('heading', { name: 'لا توجد طلبات في هذه الحالة' })).toBeTruthy();
    listSubmissions.mockRejectedValueOnce(new Error('stack / private transport data'));
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث في الطلبات' }), { target: { value: 'new query' } });
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('تعذر تحميل الطلبات'));
    expect(screen.queryByText(/private transport data/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByRole('link', { name: 'أمينة بن صالح' })).toBeTruthy();
  });

  it('sends q and status to the API and uses server cursor/total for pagination', async () => {
    listSubmissions.mockImplementation(({ cursor }) => Promise.resolve(
      cursor ? page([row('two')], null, 26) : page([row('one')], 'cursor-next', 26),
    ));
    renderList();
    await screen.findByRole('link', { name: 'أمينة بن صالح' });
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث في الطلبات' }), { target: { value: 'أمينة' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'حالة الطلب' }), { target: { value: 'INTERNAL_REVIEW' } });
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق' }));
    await waitFor(() => expect(listSubmissions).toHaveBeenLastCalledWith({ q: 'أمينة', status: 'INTERNAL_REVIEW', cursor: undefined, limit: 25 }));
    expect(screen.getByText('إجمالي النتائج: 26')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => expect(listSubmissions).toHaveBeenLastCalledWith({ q: 'أمينة', status: 'INTERNAL_REVIEW', cursor: 'cursor-next', limit: 25 }));
  });

  it('offers keyboard-accessible row navigation and no unsupported decision actions', async () => {
    renderList();
    const link = await screen.findByRole('link', { name: 'أمينة بن صالح' });
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(link.getAttribute('href')).toBe('/app/submissions/one');
    expect(screen.queryByRole('button', { name: /قبول|رفض|دمج|حذف/ })).toBeNull();
  });
});

describe('TASK-032 submission detail UI', () => {
  it('links only an accepted submission with a linked Teacher to the profile', async () => {
    renderDetail({ ...detail, status: 'ACCEPTED', acceptedTeacherId: 'teacher-1' });
    const link = await screen.findByRole('link', { name: 'فتح ملف الأستاذ' });
    expect(link.getAttribute('href')).toBe('/app/teachers/teacher-1');
    cleanup();
    renderDetail({ ...detail, status: 'INTERNAL_REVIEW', acceptedTeacherId: null });
    await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' });
    expect(screen.queryByRole('link', { name: 'فتح ملف الأستاذ' })).toBeNull();
  });
  it('enables documented decision controls on the production detail route', async () => {
    renderDetail(detail);
    await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' });
    expect(screen.getByRole('button', { name: 'قبول الطلب' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'رفض الطلب' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إحالة إلى المراجعة الداخلية' })).toBeTruthy();
    expect(screen.queryByText('تأكيد قبول الطلب')).toBeNull();
    expect(screen.queryByText('تأكيد رفض الطلب')).toBeNull();
    expect(screen.queryByText('تأكيد الإحالة للمراجعة الداخلية')).toBeNull();
  });

  it('renders the authorized declared profile, minimized candidates, and Arabic neutral match reasons', async () => {
    const { container } = renderDetail();
    expect(await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' })).toBeTruthy();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getByText('amina@example.dz')).toBeTruthy();
    expect(screen.getByText('ملاحظة من المرسل')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'جهة العمل المصرح بها — غير معتمدة' })).toBeTruthy();
    expect(screen.getByText('شارع النخيل')).toBeTruthy();
    expect(screen.getByText('school@example.dz')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'بيانات إدارية مصرح بها — غير معتمدة' })).toBeTruthy();
    expect(screen.getByText('عنوان خاص')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /مؤسسات تكملة النصاب المصرح بها — غير معتمدة/ })).toBeTruthy();
    expect(screen.getByText('ابتدائية إضافية')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /المؤهلات والشهادات المصرح بها — غير معتمدة/ })).toBeTruthy();
    expect(screen.getByText('ليسانس معلنة')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'طلبات مشابهة محتملة' })).toBeTruthy();
    expect(screen.getByText('تطابق رقم الهاتف')).toBeTruthy();
    expect(screen.getByText('تطابق البريد الإلكتروني')).toBeTruthy();
    expect(screen.getAllByText('تطابق الاسم واللقب وتاريخ الميلاد')).toHaveLength(2);
    expect(screen.getByText(/لا تؤكد أن الطلبات تخص الشخص نفسه/)).toBeTruthy();
    const candidateList = screen.getByRole('list', { name: 'طلبات مشابهة محتملة' });
    expect(candidateList.querySelectorAll(':scope > li')).toHaveLength(2);
    expect(screen.queryByText(/ثقة|دمج/)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'أمينة بن صالح' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'ليلى عمر' })).toBeTruthy();
  });

  it('shows no-candidate state and safely hides internal API details', async () => {
    const empty = { ...detail, potentialDuplicates: [] };
    renderDetail(empty);
    expect(await screen.findByRole('heading', { name: 'لا توجد طلبات مشابهة محتملة' })).toBeTruthy();
    getSubmission.mockRejectedValueOnce(new Error('internal SQL error and request path'));
    render(<MemoryRouter initialEntries={['/app/submissions/missing']}><Routes><Route path="/app/submissions/:id" element={<SubmissionDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('الطلب غير متاح'));
    expect(screen.queryByText(/SQL error|request path/)).toBeNull();
  });

  it('announces the detail loading state while the API is pending', async () => {
    let resolve!: (value: { data: SubmissionDetail }) => void;
    getSubmission.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<MemoryRouter initialEntries={['/app/submissions/submission-1']}><Routes>
      <Route path="/app/submissions/:id" element={<SubmissionDetailPage />} />
    </Routes></MemoryRouter>);
    expect(screen.getByRole('status').textContent).toContain('جارٍ تحميل تفاصيل الطلب');
    resolve({ data: detail });
    expect(await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' })).toBeTruthy();
  });

  it('offers only accept/reject on INTERNAL_REVIEW and none on terminal statuses', async () => {
    renderDetail({ ...detail, status: 'INTERNAL_REVIEW' });
    expect(await screen.findByRole('button', { name: 'قبول الطلب' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'رفض الطلب' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'إحالة إلى المراجعة الداخلية' })).toBeNull();
    cleanup();
    renderDetail({ ...detail, status: 'ACCEPTED' });
    await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' });
    expect(screen.queryByRole('region', { name: 'إجراءات مراجعة الطلب' })).toBeNull();
    cleanup();
    renderDetail({ ...detail, status: 'REJECTED' });
    await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' });
    expect(screen.queryByRole('region', { name: 'إجراءات مراجعة الطلب' })).toBeNull();
  });

  it('submits a real decision once, announces success, and reloads persisted status', async () => {
    getSubmission.mockResolvedValueOnce({ data: detail }).mockResolvedValueOnce({ data: { ...detail, status: 'ACCEPTED' } });
    decideSubmission.mockResolvedValue({ data: { id: detail.id, status: 'ACCEPTED' } });
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'قبول الطلب' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد القرار' }));
    await waitFor(() => expect(decideSubmission).toHaveBeenCalledOnce());
    expect(decideSubmission).toHaveBeenCalledWith({ id: detail.id, action: 'ACCEPT', expectedStatus: 'PENDING' });
    await waitFor(() => expect(getSubmission).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('تم تحديث حالة الطلب: مقبول')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'قبول الطلب' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'رفض الطلب' })).toBeNull();
  });

  it('offers neutral conflict feedback and refreshes without an automatic retry', async () => {
    const { ApiRequestError } = await import('../auth/client');
    decideSubmission.mockRejectedValueOnce(new ApiRequestError('private detail', undefined, 409));
    getSubmission.mockResolvedValueOnce({ data: detail }).mockResolvedValueOnce({ data: { ...detail, status: 'REJECTED' } });
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'رفض الطلب' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد القرار' }));
    expect(await screen.findByText('تغيّرت حالة الطلب')).toBeTruthy();
    expect(screen.queryByText('private detail')).toBeNull();
    expect(decideSubmission).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة تحميل الطلب' }));
    await waitFor(() => expect(getSubmission).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: 'رفض الطلب' })).toBeNull();
    expect(decideSubmission).toHaveBeenCalledOnce();
  });
});
