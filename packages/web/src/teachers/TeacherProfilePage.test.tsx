import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiRequestError, type Institution, type TeacherProfile } from '../auth/client';
import { TeacherProfilePage } from './TeacherProfilePage';

const { getTeacherProfile, patchTeacherProfile, listInstitutions, setTeacherCurrentInstitution, listTeacherQualifications, createTeacherQualification, patchTeacherQualification, deleteTeacherQualification, listSupplementaryWorkplaces } = vi.hoisted(() => ({
  getTeacherProfile: vi.fn(), patchTeacherProfile: vi.fn(), listInstitutions: vi.fn(), setTeacherCurrentInstitution: vi.fn(),
  listTeacherQualifications: vi.fn(), createTeacherQualification: vi.fn(), patchTeacherQualification: vi.fn(), deleteTeacherQualification: vi.fn(),
  listSupplementaryWorkplaces: vi.fn(),
}));
vi.mock('../auth/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/client')>(), getTeacherProfile, patchTeacherProfile, listInstitutions, setTeacherCurrentInstitution,
  listTeacherQualifications, createTeacherQualification, patchTeacherQualification, deleteTeacherQualification, listSupplementaryWorkplaces,
}));

const profile: TeacherProfile = {
  id: 'teacher-1', districtId: 'hidden-district', name: 'أمينة', surname: 'بن صالح',
  birthDate: '1985-03-04', placeOfBirth: 'وهران', phone: '+213555123456', email: 'Amina@example.dz',
  professionalStatus: 'PERMANENT', employedAt: '2005-09-01', confirmedAt: null,
  qualifications: 'شهادة', recordStatus: 'ACTIVE', archivedAt: null,
  professionalFramework: null, firstEducationAppointmentDate: null, firstEducationAppointmentDecisionNumber: null,
  firstInstallationDate: null, traineeshipDate: null, institutionAppointmentDate: null, institutionAppointmentNumber: null,
  financialControllerVisaNumber: null, administrativeCategory: null, administrativeSection: null, administrativeGrade: null,
  administrativeClassificationEffectiveDate: null, birthProvince: null, personalAddress: null, administrativeNote: null,
  createdAt: '2026-09-29T10:00:00Z', updatedAt: '2026-09-29T10:00:00Z',
  declaredInstitutions: { primaryInstitutionName: 'ابتدائية النور', additionalInstitutionNames: ['ابتدائية الفجر'] },
  declaredWorkplace: { institutionName: 'ابتدائية النور', municipality: 'وهران', institutionAddress: 'شارع النخيل', directorPhone: '+21321234567', legacyAdditionalInstitutionNames: ['ابتدائية الفجر'] },
  currentInstitution: null,
};

const institution: Institution = {
  id: 'institution-1', districtId: 'hidden-district', name: 'ابتدائية الأمل', externalCode: null,
  municipality: 'وهران', address: 'شارع الاستقلال', directorPhone: '+21321234567', email: null, archivedAt: null,
  createdAt: '2026-09-29T10:00:00Z', updatedAt: '2026-09-29T10:00:00Z',
};

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; this.dispatchEvent(new Event('close')); } });
});

function renderPage() {
  return render(<MemoryRouter initialEntries={['/app/teachers/teacher-1']}><Routes>
    <Route path="/app/teachers/:id" element={<TeacherProfilePage />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  getTeacherProfile.mockResolvedValue({ data: profile });
  patchTeacherProfile.mockResolvedValue({ data: { ...profile, surname: 'عماري' } });
  listInstitutions.mockResolvedValue({ data: [institution], page: { limit: 25, nextCursor: null, total: 1 } });
  setTeacherCurrentInstitution.mockResolvedValue({ data: { teacherId: profile.id, currentInstitution: institution } });
  listTeacherQualifications.mockResolvedValue({ items: [] });
  listSupplementaryWorkplaces.mockResolvedValue({ items: [] });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('TASK-035 Teacher profile UI', () => {
  it('prioritizes dossier identity/work context and existing supervision links without new fetches', async () => {
    getTeacherProfile.mockResolvedValueOnce({ data: { ...profile, currentInstitution: institution } });
    const { container } = renderPage();
    const title = await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const identity = screen.getByRole('region', { name: 'الوضعية الحالية للأستاذ' });
    expect(identity.textContent).toContain('الصفة المهنية: مرسم');
    expect(identity.textContent).toContain('حالة السجل: نشط');
    expect(identity.textContent).toContain('ابتدائية الأمل');
    expect(identity.textContent).toContain('البلدية: وهران');
    expect(title.compareDocumentPosition(identity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'مساحات الإشراف على الأستاذ' });
    expect(within(nav).getByRole('link', { name: 'زيارات الأستاذ' }).getAttribute('href')).toBe('/app/visits?teacherId=teacher-1&districtId=hidden-district');
    expect(within(nav).getByRole('link', { name: 'التوزيع الأسبوعي' }).getAttribute('href')).toBe('/app/teachers/teacher-1/schedules');
    expect(within(nav).getByRole('link', { name: 'بطاقة معلومات الأستاذ' }).getAttribute('href')).toBe('/app/teachers/teacher-1/information-card');
    const professional = screen.getByRole('heading', { name: 'الوضعية المهنية' });
    const personal = screen.getByRole('heading', { name: 'المعلومات الشخصية' });
    expect(identity.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nav.compareDocumentPosition(professional) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(professional.compareDocumentPosition(personal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.ui-workspace-stack[data-density="document"]')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /زيارة جديدة/ })).toBeNull();
    expect(getTeacherProfile).toHaveBeenCalledOnce();
    await waitFor(() => expect(listSupplementaryWorkplaces).toHaveBeenCalledOnce());
    expect(listTeacherQualifications).toHaveBeenCalledOnce();
    expect(listInstitutions).not.toHaveBeenCalled();
  });

  it.each([['PERMANENT', 'مرسم'], ['TRAINEE', 'متربص'], ['CONTRACT', 'متعاقد'], ['TEMPORARY_CONTRACT', 'متعاقد مؤقت'], ['SUBSTITUTE', 'مستخلف']])('keeps %s professional status distinct from inactive record state', async (professionalStatus, label) => {
    getTeacherProfile.mockResolvedValueOnce({ data: { ...profile, professionalStatus, recordStatus: 'INACTIVE' } });
    renderPage();
    const identity = await screen.findByRole('region', { name: 'الوضعية الحالية للأستاذ' });
    expect(identity.textContent).toContain(`الصفة المهنية: ${label}`);
    expect(identity.textContent).toContain('حالة السجل: غير نشط');
    expect(identity.textContent).toContain('لم تُعتمد مؤسسة حالية');
    expect(identity.textContent).not.toContain(profile.declaredWorkplace!.institutionName);
  });

  it('keeps private notes, appointments and unverified declarations in native closed disclosures', async () => {
    const longNote = 'ملاحظة خاصة لا تُطبع '.repeat(35);
    getTeacherProfile.mockResolvedValueOnce({ data: { ...profile, administrativeNote: longNote, firstEducationAppointmentDecisionNumber: 'قرار 12/2020', administrativeGrade: 'رتبة مدخلة' } });
    const { container } = renderPage();
    await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' });
    const disclosures = container.querySelectorAll('.teacher-profile__sections > details');
    expect(disclosures).toHaveLength(3);
    for (const disclosure of disclosures) {
      expect(disclosure.hasAttribute('open')).toBe(false);
      fireEvent.click(disclosure.querySelector('summary')!);
      expect(disclosure.hasAttribute('open')).toBe(true);
    }
    expect(screen.getByRole('heading', { name: 'بيانات التعيين' })).toBeTruthy();
    expect(screen.getByText('قرار 12/2020')).toBeTruthy();
    expect(screen.getByText('رتبة مدخلة')).toBeTruthy();
    expect(screen.getByText('تصريح تاريخي وارد من الاستمارة، ولا يمثل اعتمادًا لمؤسسة.')).toBeTruthy();
    const privateSection = container.querySelector('.teacher-dossier__private')!;
    expect(privateSection.textContent).toContain('خاصة بالمفتش');
    expect(privateSection.querySelector('dd')!.textContent).toBe(longNote);
    expect(screen.getByRole('navigation', { name: 'مساحات الإشراف على الأستاذ' }).textContent).not.toContain(longNote);
    expect(screen.getByText(profile.email!)).toBeTruthy();
    expect(container.querySelector('.teacher-profile__contact-card bdi')).toBeTruthy();
  });

  it('preserves multiple qualifications and historical workplace relationships as secondary data', async () => {
    listTeacherQualifications.mockResolvedValueOnce({ items: [
      { id: 'q1', name: 'شهادة أولى', issuingBody: 'جامعة', qualificationDate: '2020-01-01' },
      { id: 'q2', name: 'شهادة ثانية', issuingBody: null, qualificationDate: null },
    ] });
    listSupplementaryWorkplaces.mockResolvedValueOnce({ items: [
      { id: 'w1', institution: { id: 'i1', name: 'مؤسسة تكملة حالية', municipality: 'بلدية التكملة', archivedAt: null }, validFrom: '2020-01-01', validTo: null, isCurrent: true },
      { id: 'w2', institution: { id: 'i2', name: 'مؤسسة تاريخية', municipality: null, archivedAt: null }, validFrom: '2020-01-01', validTo: '2021-01-01', isCurrent: false },
    ] });
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { name: 'شهادة ثانية' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'شهادة أولى' })).toBeTruthy();
    expect(screen.getByText('مؤسسة تكملة حالية')).toBeTruthy();
    const historic = screen.getByText('مؤسسة تاريخية').closest('details')!;
    expect(historic.open).toBe(false);
    expect(within(historic).queryByRole('button', { name: 'إنهاء العلاقة' })).toBeNull();
    fireEvent.click(historic.querySelector('summary')!);
    expect(historic.open).toBe(true);
    expect(within(historic).getByRole('button', { name: 'تصحيح التواريخ' })).toBeTruthy();
    expect(container.querySelector('.teacher-profile__identity')!.textContent).not.toContain('مؤسسة تاريخية');
  });

  it('does not fabricate a dossier after scoped load failure and retries explicitly', async () => {
    getTeacherProfile.mockRejectedValueOnce(new ApiRequestError('private detail', undefined, 404));
    renderPage();
    await screen.findByRole('heading', { name: 'تعذر عرض ملف الأستاذ' });
    expect(screen.queryByRole('region', { name: 'الوضعية الحالية للأستاذ' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'مساحات الإشراف على الأستاذ' })).toBeNull();
    expect(listTeacherQualifications).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'أمينة بن صالح' })).toBeTruthy();
    expect(getTeacherProfile).toHaveBeenCalledTimes(2);
  });
  it('loads the authorized profile in RTL with read-only status and declared context', async () => {
    let resolve!: (value: { data: TeacherProfile }) => void;
    getTeacherProfile.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { container } = renderPage();
    expect(screen.getByRole('status').textContent).toContain('جارٍ تحميل');
    resolve({ data: profile });
    await screen.findByRole('heading', { name: 'أمينة بن صالح', level: 1 });
    fireEvent.click(container.querySelector('.teacher-profile__declared-card')!.closest('details')!.querySelector('summary')!);
    expect(screen.getByRole('heading', { name: 'جهة العمل المصرح بها — غير معتمدة' })).toBeTruthy();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getAllByText('نشط').length).toBeGreaterThan(0);
    expect(screen.getByText('تصريح تاريخي وارد من الاستمارة، ولا يمثل اعتمادًا لمؤسسة.')).toBeTruthy();
    expect(screen.getByText('ابتدائية النور')).toBeTruthy();
    expect(screen.getByText('شارع النخيل')).toBeTruthy();
    expect(screen.getByText('ابتدائية الفجر')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'المؤسسة الحالية المعتمدة' })).toBeTruthy();
    expect(screen.getAllByText('لم تُعتمد مؤسسة حالية').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'اعتماد المؤسسة' })).toBeTruthy();
    const informationCardLink = screen.getByRole('link', { name: 'بطاقة معلومات الأستاذ' });
    informationCardLink.focus();
    expect(document.activeElement).toBe(informationCardLink);
    expect(informationCardLink.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.teacher-profile__identity-context svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.teacher-profile__facts dd bdi[dir="auto"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تغيير المؤسسة الحالية' })).toBeNull();
    expect(screen.queryByText(/نقل الأستاذ|تحويل الأستاذ|سجل الانتقالات/)).toBeNull();
    expect(screen.queryByRole('button', { name: /حذف|أرشفة|إسناد/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /قائمة الأساتذة/ })).toBeNull();
  });

  it('keeps identity, SUBSTITUTE status, home institution, and supplementary workplaces visibly distinct', async () => {
    const home = { ...institution, name: 'ابتدائية المؤسسة الأم' };
    getTeacherProfile.mockResolvedValueOnce({ data: { ...profile, professionalStatus: 'SUBSTITUTE', currentInstitution: home } });
    const { container } = renderPage();
    expect(await screen.findByRole('heading', { name: 'أمينة بن صالح' })).toBeTruthy();
    expect(screen.getAllByText('مستخلف').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'المؤسسة الحالية المعتمدة' })).toBeTruthy();
    expect(screen.getAllByText('ابتدائية المؤسسة الأم').length).toBeGreaterThan(0);
    expect(container.querySelector('.teacher-profile__home-card')).toBeTruthy();
    expect(container.querySelector('.teacher-profile__full-section .teacher-supplementary')).toBeTruthy();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
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
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'ملف الأستاذ غير متاح ضمن نطاق الوصول.');
    expect(screen.queryByText('internal-id')).toBeNull();
  });

  it('shows an assigned current institution separately and changes the action label', async () => {
    getTeacherProfile.mockResolvedValueOnce({ data: { ...profile, currentInstitution: institution } });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'المؤسسة الحالية المعتمدة' })).toBeTruthy();
    expect(screen.getAllByText('ابتدائية الأمل').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'تغيير المؤسسة الحالية' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'اعتماد المؤسسة' })).toBeNull();
  });

  it('selects an existing institution explicitly, scopes search, confirms, and refreshes profile', async () => {
    getTeacherProfile.mockResolvedValueOnce({ data: profile }).mockResolvedValueOnce({ data: { ...profile, currentInstitution: institution } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المؤسسة' }));
    fireEvent.click(screen.getByRole('button', { name: 'اختيار مؤسسة موجودة' }));
    expect(await screen.findByRole('button', { name: /ابتدائية الأمل/ })).toBeTruthy();
    expect(listInstitutions).toHaveBeenCalledWith({ districtId: profile.districtId, q: undefined, cursor: undefined, limit: 25 });
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن مؤسسة' }), { target: { value: 'الأمل' } });
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    await waitFor(() => expect(listInstitutions).toHaveBeenLastCalledWith({ districtId: profile.districtId, q: 'الأمل', cursor: undefined, limit: 25 }));
    fireEvent.click(await screen.findByRole('button', { name: /ابتدائية الأمل/ }));
    expect(screen.getByText('سيُربط ملف الأستاذ بالمؤسسة المختارة. بيانات المؤسسة القائمة لن تتغير.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاعتماد' }));
    await waitFor(() => expect(setTeacherCurrentInstitution).toHaveBeenCalledWith(profile.id, { institutionId: institution.id, expectedInstitutionId: null }));
    expect(await screen.findByText('تم تحديث المؤسسة الحالية بنجاح.')).toBeTruthy();
    expect(screen.getAllByText('ابتدائية الأمل').length).toBeGreaterThan(0);
    expect(screen.getByText('ابتدائية النور')).toBeTruthy();
  });

  it('creates and links a reviewed institution using declaration prefill in one mutation', async () => {
    getTeacherProfile.mockResolvedValueOnce({ data: profile }).mockResolvedValueOnce({ data: { ...profile, currentInstitution: institution } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المؤسسة' }));
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء مؤسسة جديدة' }));
    expect(screen.getByRole('textbox', { name: 'اسم المؤسسة' })).toHaveProperty('value', 'ابتدائية النور');
    expect(screen.getByRole('textbox', { name: 'البلدية' })).toHaveProperty('value', 'وهران');
    expect(screen.getByRole('textbox', { name: 'عنوان المؤسسة' })).toHaveProperty('value', 'شارع النخيل');
    expect(screen.getByRole('textbox', { name: 'هاتف المدير' })).toHaveProperty('value', '+21321234567');
    fireEvent.change(screen.getByRole('textbox', { name: 'اسم المؤسسة' }), { target: { value: 'ابتدائية النور المعتمدة' } });
    fireEvent.click(screen.getByRole('button', { name: 'مراجعة القيم والتأكيد' }));
    expect(screen.getByText('سيُنشأ سجل مؤسسة بالقيم التالية ويرتبط بالأستاذ في عملية واحدة.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاعتماد' }));
    await waitFor(() => expect(setTeacherCurrentInstitution).toHaveBeenCalledWith(profile.id, {
      createInstitution: { name: 'ابتدائية النور المعتمدة', municipality: 'وهران', address: 'شارع النخيل', directorPhone: '+21321234567' },
      expectedInstitutionId: null,
    }));
    expect(await screen.findByText('تم تحديث المؤسسة الحالية بنجاح.')).toBeTruthy();
    expect(screen.getByText('ابتدائية النور')).toBeTruthy();
  });

  it('keeps missing legacy snapshot fields empty in the create form', async () => {
    const legacy = { ...profile, declaredWorkplace: { institutionName: 'مدرسة قديمة', municipality: null, institutionAddress: null, directorPhone: null, legacyAdditionalInstitutionNames: ['ملحقة قديمة'] } };
    getTeacherProfile.mockResolvedValueOnce({ data: legacy });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المؤسسة' }));
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء مؤسسة جديدة' }));
    expect(screen.getByRole('textbox', { name: 'اسم المؤسسة' })).toHaveProperty('value', 'مدرسة قديمة');
    for (const label of ['البلدية', 'عنوان المؤسسة', 'هاتف المدير']) {
      expect(screen.getByRole('textbox', { name: label })).toHaveProperty('value', '');
    }
    expect(screen.getByText('ملحقة قديمة')).toBeTruthy();
  });

  it('blocks invalid client input and safely handles server validation', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المؤسسة' }));
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء مؤسسة جديدة' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'اسم المؤسسة' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'مراجعة القيم والتأكيد' }));
    expect(await screen.findByText('أدخل اسم المؤسسة.')).toBeTruthy();
    expect(setTeacherCurrentInstitution).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'اسم المؤسسة' }), { target: { value: 'مؤسسة جديدة' } });
    fireEvent.click(screen.getByRole('button', { name: 'مراجعة القيم والتأكيد' }));
    setTeacherCurrentInstitution.mockRejectedValueOnce(new ApiRequestError('server internal text', { name: ['قيمة غير صالحة.'] }, 400));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاعتماد' }));
    expect(await screen.findByText('تحقق من بيانات المؤسسة المدخلة.')).toBeTruthy();
    expect(screen.queryByText('server internal text')).toBeNull();
  });

  it('prevents double submission and presents stale-state conflict with explicit refresh only', async () => {
    let reject!: (reason: unknown) => void;
    setTeacherCurrentInstitution.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المؤسسة' }));
    fireEvent.click(screen.getByRole('button', { name: 'اختيار مؤسسة موجودة' }));
    fireEvent.click(await screen.findByRole('button', { name: /ابتدائية الأمل/ }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاعتماد' }));
    expect(screen.getByRole('button', { name: 'جارٍ التأكيد…' }).hasAttribute('disabled')).toBe(true);
    expect(setTeacherCurrentInstitution).toHaveBeenCalledOnce();
    reject(new ApiRequestError('internal conflict info', undefined, 409));
    expect(await screen.findByText(/تغيّرت المؤسسة الحالية للأستاذ/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تحديث بيانات الملف' })).toBeTruthy();
    expect(getTeacherProfile).toHaveBeenCalledOnce();
    expect(screen.queryByText('internal conflict info')).toBeNull();
  });

  it('shows loading and error states in institution search and uses cursor pagination', async () => {
    let resolve!: (value: { data: Institution[]; page: { limit: number; nextCursor: string | null; total: number } }) => void;
    listInstitutions.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المؤسسة' }));
    fireEvent.click(screen.getByRole('button', { name: 'اختيار مؤسسة موجودة' }));
    expect(await screen.findByText('جارٍ تحميل المؤسسات…')).toBeTruthy();
    resolve({ data: [institution], page: { limit: 25, nextCursor: 'cursor-next', total: 26 } });
    expect(await screen.findByText('إجمالي النتائج في مقاطعة الأستاذ: 26')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => expect(listInstitutions).toHaveBeenLastCalledWith({ districtId: profile.districtId, q: undefined, cursor: 'cursor-next', limit: 25 }));
    listInstitutions.mockRejectedValueOnce(new Error('private backend detail'));
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    expect(await screen.findByRole('heading', { name: 'تعذر تحميل المؤسسات' })).toBeTruthy();
    expect(screen.queryByText('private backend detail')).toBeNull();
  });

  it('shows a true empty state, accessible dialog labels, and supports Escape without unsupported actions', async () => {
    listInstitutions.mockResolvedValueOnce({ data: [], page: { limit: 25, nextCursor: null, total: 0 } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'اعتماد المؤسسة' }));
    const dialog = screen.getByRole('dialog', { name: 'اعتماد المؤسسة الحالية' });
    fireEvent.click(screen.getByRole('button', { name: 'اختيار مؤسسة موجودة' }));
    expect(await screen.findByRole('heading', { name: 'لا توجد مؤسسات مطابقة' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'البحث عن مؤسسة' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /حذف|إلغاء الربط|بدون مؤسسة|أرشفة/ })).toBeNull();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(dialog.hasAttribute('open')).toBe(false));
  });
});
