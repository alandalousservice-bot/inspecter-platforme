import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ApiRequestError, type PedagogicalVisit, type TeacherDirectoryItem } from '../auth/client';
import { VisitCreatePage } from './VisitCreatePage';
import { VisitDetailPage } from './VisitDetailPage';
import { VisitListPage } from './VisitListPage';
import { formatAlgiers } from './time';
import { VisitTypeBadge } from './VisitTypeBadge';

const mocks = vi.hoisted(() => ({
  getCurrentDistricts: vi.fn(), listTeachers: vi.fn(), listInstitutions: vi.fn(), getValidWorkplaces: vi.fn(),
  listPedagogicalVisits: vi.fn(), getPedagogicalVisit: vi.fn(), createPedagogicalVisit: vi.fn(), patchPedagogicalVisit: vi.fn(),
  getInspectionReport: vi.fn(),
}));
vi.mock('../auth/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../auth/client')>()), ...mocks }));

const district = { id: '11111111-1111-4111-8111-111111111111', name: 'مقاطعة الشمال' };
const districtB = { id: '22222222-2222-4222-8222-222222222222', name: 'مقاطعة الجنوب' };
const institution = { id: '33333333-3333-4333-8333-333333333333', districtId: district.id, name: 'ابتدائية النور', externalCode: null, municipality: 'الجزائر', address: null, directorPhone: null, archivedAt: null, createdAt: '', updatedAt: '' };
const teacher: TeacherDirectoryItem = { id: '44444444-4444-4444-8444-444444444444', districtId: district.id, name: 'محمد', surname: 'علي', professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE', currentInstitution: { id: institution.id, name: institution.name, municipality: institution.municipality } };
const visit: PedagogicalVisit = {
  id: '55555555-5555-4555-8555-555555555555', districtId: district.id,
  teacher: { id: teacher.id, name: teacher.name, surname: teacher.surname },
  institution: { id: institution.id, name: 'المؤسسة كما كانت وقت التخطيط' }, academicYear: '2026-2027',
  visitType: null, scheduledStartAt: '2026-10-15T08:30:00.000Z', scheduledEndAt: '2026-10-15T09:30:00.000Z',
  actualStartAt: null, actualEndAt: null, intervalKind: 'SCHEDULED', visitTypeEditable: true, occurredAt: null,
  status: 'PLANNED', revision: 3, createdAt: '', updatedAt: '',
};
const page = (rows = [visit], total = rows.length, nextCursor: string | null = null) => ({ data: rows, page: { limit: 25, total, nextCursor } });
const districts = [district];

beforeEach(() => {
  mocks.getCurrentDistricts.mockResolvedValue(districts);
  mocks.getValidWorkplaces.mockResolvedValue({ data: { items: [
    { id: institution.id, name: institution.name, municipality: institution.municipality, role: 'HOME' },
    { id: '77777777-7777-4777-8777-777777777777', name: 'ابتدائية تكملة', municipality: null, role: 'SUPPLEMENTARY' },
  ] } });
  mocks.listTeachers.mockResolvedValue({ data: [teacher], page: { limit: 10, total: 1, nextCursor: null } });
  mocks.listInstitutions.mockResolvedValue({ data: [institution], page: { limit: 10, total: 1, nextCursor: null } });
  mocks.listPedagogicalVisits.mockResolvedValue(page());
  mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit } });
  mocks.createPedagogicalVisit.mockResolvedValue({ data: { visit } });
  mocks.patchPedagogicalVisit.mockResolvedValue({ data: { visit: { ...visit, revision: 4 } } });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; this.dispatchEvent(new Event('close')); } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function renderRoute(path: string) {
  function LocationProbe() { const location = useLocation(); return <output data-testid="current-location">{location.pathname}{location.search}</output>; }
  return render(<MemoryRouter initialEntries={[path]}><LocationProbe /><Routes>
    <Route path="/app/visits" element={<VisitListPage />} />
    <Route path="/app/visits/new" element={<VisitCreatePage />} />
    <Route path="/app/visits/:id" element={<VisitDetailPage />} />
  </Routes></MemoryRouter>);
}

async function chooseTeacher() {
  await screen.findByRole('button', { name: /محمد علي/ });
  fireEvent.click(screen.getByRole('button', { name: /محمد علي/ }));
}
async function chooseWorkplace(id = institution.id) {
  await screen.findByRole('option', { name: new RegExp(institution.name, 'u') });
  fireEvent.change(screen.getByLabelText('مؤسسة الزيارة'), { target: { value: id } });
}
function chooseVisitType(value: string = 'GUIDANCE') {
  fireEvent.change(screen.getByLabelText(/نوع الزيارة/u), { target: { value } });
}

describe('TASK-051 visit management UI', () => {
  it('groups all types with historical context and separate real navigation without report requests', async () => {
    const types = ['GUIDANCE', 'TENURE_CONFIRMATION', 'PROMOTION_EVALUATION', 'MONITORING_FOLLOW_UP', 'EXCEPTIONAL'] as const;
    mocks.listPedagogicalVisits.mockResolvedValue(page(types.map((visitType, index) => ({ ...visit, id: String(index), visitType, status: index === 4 ? 'COMPLETED' : 'PLANNED', intervalKind: index === 4 ? 'ACTUAL_RETROSPECTIVE' : 'SCHEDULED', scheduledStartAt: index === 4 ? null : visit.scheduledStartAt, scheduledEndAt: index === 4 ? null : visit.scheduledEndAt, actualStartAt: index === 4 ? '2025-01-15T08:30:00Z' : null, actualEndAt: index === 4 ? '2025-01-15T09:30:00Z' : null }))));
    renderRoute('/app/visits');
    await screen.findByRole('table', { name: 'قائمة الزيارات التربوية' });
    expect(screen.getAllByRole('link', { name: 'محمد علي' })).toHaveLength(5);
    expect(screen.getAllByRole('link', { name: 'تفاصيل الزيارة — محمد علي' })).toHaveLength(5);
    expect(screen.getAllByText('المؤسسة كما كانت وقت التخطيط')).toHaveLength(5);
    expect(document.querySelectorAll('.visit-workspace__context .visit-type-badge')).toHaveLength(5);
    expect(screen.getByText('الفترة الفعلية للزيارة')).toBeTruthy();
    expect(screen.getByText(formatAlgiers('2025-01-15T08:30:00Z'))).toBeTruthy();
    expect(screen.getByText(formatAlgiers('2025-01-15T09:30:00Z'))).toBeTruthy();
    expect(screen.queryByRole('link', { name: /تقرير/ })).toBeNull();
    expect(mocks.getPedagogicalVisit).not.toHaveBeenCalled();
    expect(mocks.getInspectionReport).not.toHaveBeenCalled();
  });

  it('keeps teacher, institution and inclusive date controls server-side with visible active indicators', async () => {
    renderRoute('/app/visits'); await screen.findByRole('cell', { name: 'محمد علي' });
    fireEvent.click(screen.getByRole('button', { name: 'الأستاذ والمؤسسة' }));
    await chooseTeacher();
    await waitFor(() => expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ limit: 25, teacherId: teacher.id }));
    fireEvent.click(await screen.findByRole('button', { name: institution.name }));
    await waitFor(() => expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ limit: 25, teacherId: teacher.id, institutionId: institution.id }));
    fireEvent.click(screen.getByRole('button', { name: 'فترة الزيارة' }));
    fireEvent.change(screen.getByLabelText('من تاريخ الموعد'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('إلى تاريخ الموعد (شامل)'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق التاريخ' }));
    await waitFor(() => expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ limit: 25, teacherId: teacher.id, institutionId: institution.id, from: '2026-10-01T00:00:00+01:00', to: '2026-10-16T00:00:00+01:00' }));
    expect(screen.getByTestId('current-location').textContent).toContain('fromDate=2026-10-01');
    expect(screen.getByText('مرشح التاريخ مفعّل')).toBeTruthy();
    expect(screen.getByText('تحديد الأستاذ أو المؤسسة مفعّل')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'مسح المرشحات' }));
    await waitFor(() => expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ limit: 25 }));
  });

  it('mounts one structured operational mobile list, not duplicate table interactions', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    renderRoute('/app/visits');
    expect(await screen.findByRole('list', { name: 'قائمة الزيارات التربوية' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'محمد علي' })).toHaveLength(1);
    expect(document.querySelector('.ui-record-row')?.tagName).toBe('LI');
    expect(document.querySelector('.visit-workspace')?.getAttribute('dir')).toBe('rtl');
  });

  it('distinguishes filtered empty and unavailable count on failure; date errors stay expanded', async () => {
    mocks.listPedagogicalVisits.mockResolvedValueOnce(page([], 0));
    renderRoute('/app/visits?visitType=GUIDANCE');
    expect(await screen.findByText('لا توجد زيارات مطابقة')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'فترة الزيارة' }));
    fireEvent.change(screen.getByLabelText('من تاريخ الموعد'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('إلى تاريخ الموعد (شامل)'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق التاريخ' }));
    expect(screen.getByRole('alert').textContent).toContain('يجب ألا يسبق');
    expect(screen.getByRole('button', { name: 'فترة الزيارة' }).getAttribute('aria-expanded')).toBe('true');
    cleanup(); mocks.listPedagogicalVisits.mockRejectedValueOnce(new Error('transport'));
    renderRoute('/app/visits'); await screen.findByRole('heading', { name: 'تعذر تحميل الزيارات' });
    expect(screen.getByText('إجمالي النتائج: غير متاح')).toBeTruthy();
  });

  it.each(['PLANNED', 'COMPLETED', 'CANCELLED'] as const)('exposes typed report read route for %s without implying automatic creation', async (status) => {
    mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: { ...visit, visitType: 'GUIDANCE', status, visitTypeEditable: false } } });
    renderRoute(`/app/visits/${visit.id}`);
    expect((await screen.findByRole('link', { name: 'صفحة تقرير الزيارة' })).getAttribute('href')).toBe(`/app/visits/${visit.id}/report`);
    expect(screen.queryByText(/سيظهر في مرحلة التقرير/)).toBeNull();
    if (status === 'CANCELLED') expect(screen.getByText('قراءة التقرير الموجود فقط؛ لا يمكن إنشاء تقرير للزيارة الملغاة.')).toBeTruthy();
    else expect(screen.getByText('التقرير مستقل عن الزيارة؛ لا يُنشأ إلا عند حفظ المسودة صراحة.')).toBeTruthy();
    expect(mocks.patchPedagogicalVisit).not.toHaveBeenCalled();
  });

  it('presents all five canonical visit types distinctly with readable Arabic text', () => {
    const labels = [
      ['GUIDANCE', 'زيارة توجيهية / تكوينية'],
      ['TENURE_CONFIRMATION', 'زيارة التثبيت / الترسيم'],
      ['PROMOTION_EVALUATION', 'زيارة الترقية / التقييم'],
      ['MONITORING_FOLLOW_UP', 'زيارة المراقبة والمتابعة'],
      ['EXCEPTIONAL', 'زيارة استثنائية'],
    ] as const;
    const { container } = render(<div dir="rtl">{labels.map(([type]) => <VisitTypeBadge key={type} type={type} />)}</div>);
    for (const [, label] of labels) expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelectorAll('.visit-type-badge')).toHaveLength(5);
    expect(container.querySelectorAll('.visit-type-badge svg[aria-hidden="true"]')).toHaveLength(5);
  });

  it('renders the minimized server list, historical institution, status and total', async () => {
    renderRoute('/app/visits');
    expect(screen.getByText('جارٍ تحميل الزيارات…')).toBeTruthy();
    expect(await screen.findByRole('cell', { name: 'محمد علي' })).toBeTruthy();
    expect(screen.getByText('المؤسسة كما كانت وقت التخطيط')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'مخططة' })).toBeTruthy();
    expect(document.querySelector('.ui-filter-bar__summary')?.textContent).toBe('إجمالي النتائج: 1');
    expect(mocks.listPedagogicalVisits).toHaveBeenCalledWith({ limit: 25 });
    expect(screen.queryByText(/البريد الإلكتروني|رقم الهاتف|تاريخ الميلاد/)).toBeNull();
  });

  it('sends only supported server filters and resets cursor when filters change', async () => {
    mocks.getCurrentDistricts.mockResolvedValue([district, districtB]);
    mocks.listPedagogicalVisits.mockResolvedValue(page([visit, { ...visit, id: '66666666-6666-4666-8666-666666666666' }], 26, visit.id));
    renderRoute('/app/visits');
    await screen.findAllByRole('cell', { name: 'محمد علي' });
    expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ limit: 25 });
    fireEvent.change(screen.getByLabelText('حالة الزيارة'), { target: { value: 'COMPLETED' } });
    await waitFor(() => expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ status: 'COMPLETED', limit: 25 }));
    fireEvent.click(screen.getByRole('button', { name: 'النتائج التالية' }));
    await waitFor(() => expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ status: 'COMPLETED', limit: 25, cursor: visit.id }));
    fireEvent.change(screen.getByLabelText(/المقاطعة/u), { target: { value: districtB.id } });
    await waitFor(() => expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ districtId: districtB.id, status: 'COMPLETED', limit: 25 }));
    fireEvent.change(screen.getByLabelText(/نوع الزيارة/u), { target: { value: 'EXCEPTIONAL' } });
    await waitFor(() => expect(mocks.listPedagogicalVisits).toHaveBeenLastCalledWith({ districtId: districtB.id, status: 'COMPLETED', visitType: 'EXCEPTIONAL', limit: 25 }));
  });

  it('preserves non-sensitive list filters through create, detail and return navigation', async () => {
    renderRoute('/app/visits?status=PLANNED');
    await screen.findByRole('cell', { name: 'محمد علي' });
    expect(screen.getByRole('link', { name: 'محمد علي' }).getAttribute('href')).toBe(`/app/teachers/${teacher.id}`);
    expect(screen.getByRole('link', { name: 'تفاصيل الزيارة — محمد علي' }).getAttribute('href')).toBe(`/app/visits/${visit.id}?status=PLANNED`);
    expect(screen.getByRole('link', { name: 'زيارة جديدة' }).getAttribute('href')).toBe('/app/visits/new?status=PLANNED');

    cleanup(); renderRoute('/app/visits/new?status=PLANNED'); await chooseTeacher(); chooseVisitType();
    fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } });
    fireEvent.change(screen.getByLabelText(/بداية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T09:30' } });
    fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T10:30' } });
    await chooseWorkplace();
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الزيارة' }));
    await waitFor(() => expect(screen.getByTestId('current-location').textContent).toBe(`/app/visits/${visit.id}?status=PLANNED`));
    expect(screen.getByRole('link', { name: 'العودة إلى الزيارات' }).getAttribute('href')).toBe('/app/visits?status=PLANNED');

    cleanup(); renderRoute(`/app/visits/${visit.id}?status=PLANNED`);
    await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    expect(screen.getByRole('link', { name: 'العودة إلى الزيارات' }).getAttribute('href')).toBe('/app/visits?status=PLANNED');
  });

  it('shows empty and retryable error states', async () => {
    mocks.listPedagogicalVisits.mockResolvedValueOnce(page([], 0));
    renderRoute('/app/visits');
    expect(await screen.findByText('لا توجد زيارات بعد')).toBeTruthy();
    cleanup(); mocks.listPedagogicalVisits.mockRejectedValueOnce(new Error('transport'));
    renderRoute('/app/visits');
    expect(await screen.findByRole('heading', { name: 'تعذر تحميل الزيارات' })).toBeTruthy();
    mocks.listPedagogicalVisits.mockResolvedValue(page());
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByRole('cell', { name: 'محمد علي' })).toBeTruthy();
  });

  it('uses current district automatically and searches active teachers within that district', async () => {
    renderRoute('/app/visits/new');
    expect(await screen.findByText('مقاطعة الشمال')).toBeTruthy();
    await chooseTeacher();
    expect(mocks.listTeachers).toHaveBeenCalledWith({ districtId: district.id, q: undefined, recordStatus: 'ACTIVE', limit: 10, cursor: undefined });
    expect(screen.getAllByText(`المؤسسة الحالية المعتمدة: ${institution.name} — الجزائر`).length).toBeGreaterThan(0);
  });

  it('requires explicit district choice when inspector has multiple districts', async () => {
    mocks.getCurrentDistricts.mockResolvedValue([district, districtB]);
    renderRoute('/app/visits/new');
    const choice = await screen.findByLabelText(/المقاطعة/u);
    await waitFor(() => expect((screen.getByRole('button', { name: 'إنشاء الزيارة' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(choice, { target: { value: districtB.id } });
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ districtId: districtB.id, q: undefined, recordStatus: 'ACTIVE', limit: 10, cursor: undefined }));
  });

  it('disables create and explains missing approved institution with a profile link', async () => {
    mocks.listTeachers.mockResolvedValue({ data: [{ ...teacher, currentInstitution: null }], page: { limit: 10, total: 1, nextCursor: null } });
    mocks.getValidWorkplaces.mockResolvedValue({ data: { items: [] } });
    renderRoute('/app/visits/new');
    await chooseTeacher();
    expect((await screen.findAllByText(/لم تُعتمد مؤسسة حالية لهذا الأستاذ/u)).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'مراجعة ملف الأستاذ' }).getAttribute('href')).toBe(`/app/teachers/${teacher.id}`);
    await waitFor(() => expect((screen.getByRole('button', { name: 'إنشاء الزيارة' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('requires explicit year and both times; successful create navigates to server Visit identity', async () => {
    renderRoute('/app/visits/new'); await chooseTeacher();
    expect((screen.getByRole('button', { name: 'إنشاء الزيارة' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/نوع الزيارة/u) as HTMLSelectElement).value).toBe('');
    chooseVisitType();
    fireEvent.change(screen.getByLabelText(/بداية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T09:30' } });
    await chooseWorkplace();
    fireEvent.submit(document.querySelector('form.visit-form')!);
    expect((await screen.findByRole('alert')).textContent).toContain('أدخل سنة دراسية صحيحة مثل 2026-2027.');
    expect(screen.getByLabelText(/السنة الدراسية/u).getAttribute('aria-describedby')).toContain('visit-create-error');
    fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2028' } });
    fireEvent.change(screen.getByLabelText(/بداية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T09:30' } });
    fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T10:30' } });
    fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } });
    await chooseWorkplace();
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الزيارة' }));
    await waitFor(() => expect(mocks.createPedagogicalVisit).toHaveBeenCalledWith({ teacherId: teacher.id, institutionId: institution.id, academicYear: '2026-2027', visitType: 'GUIDANCE', scheduledStartAt: '2026-10-15T09:30:00+01:00', scheduledEndAt: '2026-10-15T10:30:00+01:00' }));
    expect(await screen.findByRole('heading', { name: 'تفاصيل الزيارة' })).toBeTruthy();
  });

  it('offers exactly the five canonical Arabic visit labels without selecting a default', async () => {
    renderRoute('/app/visits/new'); await chooseTeacher();
    const selector = await screen.findByLabelText(/نوع الزيارة/u) as HTMLSelectElement;
    expect(selector.value).toBe('');
    expect(Array.from(selector.options).map((option) => option.textContent)).toEqual([
      'اختر نوع الزيارة', 'زيارة توجيهية / تكوينية', 'زيارة التثبيت / الترسيم', 'زيارة الترقية / التقييم', 'زيارة المراقبة والمتابعة', 'زيارة استثنائية',
    ]);
  });

  it('creates a retrospective exceptional visit only after confirming historical institution context', async () => {
    renderRoute('/app/visits/new'); await chooseTeacher(); chooseVisitType('EXCEPTIONAL');
    fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } });
    fireEvent.change(screen.getByLabelText('طريقة تسجيل الزيارة الاستثنائية'), { target: { value: 'RETROSPECTIVE' } });
    fireEvent.change(screen.getByLabelText(/بداية الفترة الفعلية/u), { target: { value: '2026-02-10T09:00' } });
    fireEvent.change(screen.getByLabelText(/نهاية الفترة الفعلية/u), { target: { value: '2026-02-10T10:00' } });
    await chooseWorkplace();
    expect((screen.getByRole('button', { name: 'إنشاء الزيارة' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText(/أؤكد المؤسسة المختارة بوصفها مكان الزيارة/u));
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الزيارة' }));
    await waitFor(() => expect(mocks.createPedagogicalVisit).toHaveBeenCalledWith({ teacherId: teacher.id, institutionId: institution.id, academicYear: '2026-2027', visitType: 'EXCEPTIONAL', actualStartAt: '2026-02-10T09:00:00+01:00', actualEndAt: '2026-02-10T10:00:00+01:00', institutionContextConfirmed: true }));
  });

  it('requires deliberate weekly schedule acknowledgement and retries the same request', async () => {
    mocks.createPedagogicalVisit.mockRejectedValueOnce(new ApiRequestError('warn', undefined, 409, 'VISIT_OUTSIDE_WEEKLY_SCHEDULE'));
    renderRoute('/app/visits/new'); await chooseTeacher();
    chooseVisitType();
    fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } });
    fireEvent.change(screen.getByLabelText(/بداية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T09:30' } });
    fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T10:30' } });
    await chooseWorkplace();
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الزيارة' }));
    expect(await screen.findByRole('dialog', { name: 'تنبيه الجدول الأسبوعي' })).toBeTruthy();
    expect(screen.getByText(/تنبيه استشاري ولا يمنع التخطيط/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'متابعة مع هذا الموعد' }));
    await waitFor(() => expect(mocks.createPedagogicalVisit).toHaveBeenLastCalledWith({ teacherId: teacher.id, institutionId: institution.id, academicYear: '2026-2027', visitType: 'GUIDANCE', scheduledStartAt: '2026-10-15T09:30:00+01:00', scheduledEndAt: '2026-10-15T10:30:00+01:00', scheduleWarningAcknowledgement: 'VISIT_OUTSIDE_WEEKLY_SCHEDULE' }));
  });

  it('clears the advisory acknowledgement when the intended date changes', async () => {
    mocks.createPedagogicalVisit.mockRejectedValueOnce(new ApiRequestError('warn', undefined, 409, 'VISIT_WEEKLY_SCHEDULE_MISSING'));
    renderRoute('/app/visits/new'); await chooseTeacher();
    chooseVisitType();
    fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } });
    fireEvent.change(screen.getByLabelText(/بداية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T09:30' } });
    fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T10:30' } });
    await chooseWorkplace();
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الزيارة' }));
    await screen.findByRole('dialog', { name: 'تنبيه الجدول الأسبوعي' });
    fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T11:00' } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.createPedagogicalVisit).toHaveBeenCalledTimes(1);
  });

  it.each(['district', 'teacher', 'academicYear', 'start', 'end'] as const)('invalidates create acknowledgement when %s changes', async (field) => {
    if (field === 'district') mocks.getCurrentDistricts.mockResolvedValue([district, districtB]);
    mocks.createPedagogicalVisit.mockRejectedValueOnce(new ApiRequestError('warn', undefined, 409, 'VISIT_OUTSIDE_WEEKLY_SCHEDULE'));
    renderRoute('/app/visits/new');
    if (field === 'district') fireEvent.change(await screen.findByLabelText(/المقاطعة/u), { target: { value: district.id } });
    await chooseTeacher();
    chooseVisitType();
    fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } });
    fireEvent.change(screen.getByLabelText(/بداية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T09:30' } });
    fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T10:30' } });
    await chooseWorkplace();
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الزيارة' }));
    await screen.findByRole('dialog', { name: 'تنبيه الجدول الأسبوعي' });
    if (field === 'district') fireEvent.change(screen.getByLabelText(/المقاطعة/u), { target: { value: districtB.id } });
    if (field === 'teacher') fireEvent.change(screen.getByLabelText('البحث عن أستاذ'), { target: { value: 'أستاذ آخر' } });
    if (field === 'academicYear') fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2027-2028' } });
    if (field === 'start') fireEvent.change(screen.getByLabelText(/بداية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T10:00' } });
    if (field === 'end') fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T11:00' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.createPedagogicalVisit).toHaveBeenCalledTimes(1);
  });

  it('requires fresh explicit acknowledgement after the server invalidates a reschedule warning', async () => {
    mocks.patchPedagogicalVisit
      .mockRejectedValueOnce(new ApiRequestError('stale context', undefined, 409, 'VISIT_SCHEDULE_CONTEXT_CHANGED'))
      .mockRejectedValueOnce(new ApiRequestError('current warning', undefined, 409, 'VISIT_OUTSIDE_WEEKLY_SCHEDULE'))
      .mockResolvedValueOnce({ data: { visit: { ...visit, revision: 4 } } });
    renderRoute(`/app/visits/${visit.id}`);
    await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    fireEvent.click(screen.getByRole('button', { name: 'إعادة جدولة' }));
    fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الموعد' }));
    expect(await screen.findByRole('dialog', { name: 'تغيّر التوزيع الأسبوعي' })).toBeTruthy();
    expect(mocks.patchPedagogicalVisit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة فحص الموعد' }));
    await screen.findByRole('dialog', { name: 'تنبيه الجدول الأسبوعي' });
    expect(mocks.patchPedagogicalVisit).toHaveBeenCalledTimes(2);
    expect(mocks.patchPedagogicalVisit.mock.calls[1][1]).not.toHaveProperty('scheduleWarningAcknowledgement');
    fireEvent.click(screen.getByRole('button', { name: 'متابعة مع هذا الموعد' }));
    await waitFor(() => expect(mocks.patchPedagogicalVisit).toHaveBeenCalledTimes(3));
    expect(mocks.patchPedagogicalVisit.mock.calls[2][1]).toMatchObject({ scheduleWarningAcknowledgement: 'VISIT_OUTSIDE_WEEKLY_SCHEDULE' });
  });

  it('shows historical institution separately and links to the report without exposing its content', async () => {
    renderRoute(`/app/visits/${visit.id}`);
    expect(await screen.findByRole('heading', { name: 'تفاصيل الزيارة' })).toBeTruthy();
    expect(screen.getByText('المؤسسة كما كانت وقت التخطيط')).toBeTruthy();
    expect(screen.getByText(/لا تتغير بتغير المؤسسة الحالية للأستاذ/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'محمد علي' }).getAttribute('href')).toBe(`/app/teachers/${teacher.id}`);
    expect(screen.getByRole('link', { name: 'عرض التوزيع الأسبوعي للأستاذ' }).getAttribute('href')).toBe(`/app/teachers/${teacher.id}/schedules`);
    expect(screen.getByRole('link', { name: 'تقرير المرافقة البيداغوجية' }).getAttribute('href')).toBe(`/app/visits/${visit.id}/report`);
    expect(screen.getByText('نوع الزيارة غير موثق (سجل سابق)')).toBeTruthy();
    expect(screen.queryByText(/ملاحظات التقرير|خلاصة المفتش/)).toBeNull();
  });

  it('uses the visit revision to correct a type and hides correction when server locks it', async () => {
    renderRoute(`/app/visits/${visit.id}`); await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    fireEvent.click(screen.getByRole('button', { name: 'تصحيح نوع الزيارة' }));
    fireEvent.change(screen.getByLabelText(/نوع الزيارة/u), { target: { value: 'TENURE_CONFIRMATION' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ نوع الزيارة' }));
    await waitFor(() => expect(mocks.patchPedagogicalVisit).toHaveBeenCalledWith(visit.id, { operation: 'SET_VISIT_TYPE', expectedRevision: 3, visitType: 'TENURE_CONFIRMATION' }));
    cleanup(); mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: { ...visit, visitType: 'GUIDANCE', visitTypeEditable: false } } });
    renderRoute(`/app/visits/${visit.id}`); await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    expect(screen.getByText('زيارة توجيهية / تكوينية')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تصحيح نوع الزيارة' })).toBeNull();
  });

  it('shows a safe conflict when type correction is rejected by the server', async () => {
    mocks.patchPedagogicalVisit.mockRejectedValueOnce(new ApiRequestError('private server detail', undefined, 409, 'VISIT_TYPE_LOCKED'));
    renderRoute(`/app/visits/${visit.id}`); await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    fireEvent.click(screen.getByRole('button', { name: 'تصحيح نوع الزيارة' }));
    fireEvent.change(screen.getByLabelText(/نوع الزيارة/u), { target: { value: 'GUIDANCE' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ نوع الزيارة' }));
    expect(await screen.findByText(/لا يمكن تغيير نوع الزيارة في حالتها الحالية/u)).toBeTruthy();
    expect(screen.queryByText('private server detail')).toBeNull();
  });

  it('shows both Algiers calendar dates across midnight at minute precision', async () => {
    const crossingVisit = { ...visit, scheduledStartAt: '2026-10-15T22:30:00.000Z', scheduledEndAt: '2026-10-15T23:30:00.000Z' };
    mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: crossingVisit } });
    const { container } = renderRoute(`/app/visits/${visit.id}`);
    await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    const schedule = Array.from(container.querySelectorAll('.visit-facts div')).find((item) => item.querySelector('dt')?.textContent === 'الموعد المخطط')?.querySelector('dd');
    expect(schedule?.textContent).toContain(formatAlgiers(crossingVisit.scheduledStartAt));
    expect(schedule?.textContent).toContain(formatAlgiers(crossingVisit.scheduledEndAt));
    expect(schedule?.textContent).toContain('15');
    expect(schedule?.textContent).toContain('16');
    expect(schedule?.textContent).not.toContain(':30:00');
  });

  it('reschedules with the loaded revision and asks the inspector to refresh after conflict', async () => {
    mocks.patchPedagogicalVisit.mockRejectedValueOnce(new ApiRequestError('stale', undefined, 409, 'VISIT_REVISION_CONFLICT'));
    renderRoute(`/app/visits/${visit.id}`);
    await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    fireEvent.click(screen.getByRole('button', { name: 'إعادة جدولة' }));
    fireEvent.change(screen.getByLabelText(/نهاية الزيارة — توقيت الجزائر/u), { target: { value: '2026-10-15T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الموعد' }));
    await waitFor(() => expect(mocks.patchPedagogicalVisit).toHaveBeenCalledWith(visit.id, { operation: 'RESCHEDULE', expectedRevision: 3, institutionId: institution.id, academicYear: '2026-2027', scheduledStartAt: '2026-10-15T09:30:00+01:00', scheduledEndAt: '2026-10-15T11:00:00+01:00' }));
    expect(await screen.findByRole('button', { name: 'تحديث البيانات' })).toBeTruthy();
    expect(mocks.patchPedagogicalVisit).toHaveBeenCalledTimes(1);
  });

  it('requires a manual authoritative refresh after a lifecycle conflict without retrying the mutation', async () => {
    mocks.patchPedagogicalVisit.mockRejectedValueOnce(new ApiRequestError('state changed', undefined, 409, 'VISIT_STATE_CONFLICT'));
    renderRoute(`/app/visits/${visit.id}`);
    await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء الزيارة' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إلغاء الزيارة' }));
    expect(await screen.findByRole('button', { name: 'تحديث البيانات' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'إلغاء الزيارة' })).toBeNull();
    expect(mocks.patchPedagogicalVisit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'تحديث البيانات' }));
    await waitFor(() => expect(mocks.getPedagogicalVisit).toHaveBeenCalledTimes(2));
    expect(mocks.patchPedagogicalVisit).toHaveBeenCalledTimes(1);
  });

  it('requires actual occurredAt to complete and uses expectedRevision', async () => {
    renderRoute(`/app/visits/${visit.id}`); await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    fireEvent.click(screen.getByRole('button', { name: 'إكمال الزيارة' }));
    fireEvent.change(screen.getByLabelText(/وقت الإنجاز الفعلي — توقيت الجزائر/u), { target: { value: '2026-10-15T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إكمال الزيارة' }));
    await waitFor(() => expect(mocks.patchPedagogicalVisit).toHaveBeenCalledWith(visit.id, { operation: 'COMPLETE', expectedRevision: 3, occurredAt: '2026-10-15T10:00:00+01:00' }));
  });

  it('cancels without collecting a reason and hides lifecycle actions for terminal visits', async () => {
    renderRoute(`/app/visits/${visit.id}`); await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء الزيارة' }));
    expect(screen.queryByLabelText(/سبب الإلغاء/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إلغاء الزيارة' }));
    await waitFor(() => expect(mocks.patchPedagogicalVisit).toHaveBeenCalledWith(visit.id, { operation: 'CANCEL', expectedRevision: 3 }));
    cleanup(); mocks.getPedagogicalVisit.mockResolvedValue({ data: { visit: { ...visit, status: 'COMPLETED', occurredAt: '2026-10-15T08:50:00.000Z' } } });
    renderRoute(`/app/visits/${visit.id}`); await screen.findByRole('heading', { name: 'تفاصيل الزيارة' });
    expect(screen.queryByRole('button', { name: /إعادة جدولة|إكمال الزيارة|إلغاء الزيارة/ })).toBeNull();
  });
});
