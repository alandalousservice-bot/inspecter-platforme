import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { TeacherDirectoryItem } from '../auth/client';
import { ApiRequestError } from '../auth/client';
import { TeacherDirectoryPage, parseTimeToMinute } from './TeacherDirectoryPage';

const mocks = vi.hoisted(() => ({ listInstitutions: vi.fn(), listTeachers: vi.fn(), getCurrentDistricts: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../auth/client')>();
  return { ...original, ...mocks };
});

const districtA = { id: '11111111-1111-4111-8111-111111111111', name: 'مقاطعة الشمال' };
const districtB = { id: '22222222-2222-4222-8222-222222222222', name: 'مقاطعة الجنوب' };
const institution = { id: '33333333-3333-4333-8333-333333333333', districtId: districtA.id, name: 'مدرسة النور', municipality: 'الجزائر' };
const teacher: TeacherDirectoryItem = {
  id: '44444444-4444-4444-8444-444444444444', districtId: districtA.id, name: 'محمد', surname: 'علي',
  professionalStatus: 'PERMANENT', recordStatus: 'ACTIVE', currentInstitution: institution,
};
const response = (data: TeacherDirectoryItem[] = [teacher], total = data.length, nextCursor: string | null = null) => ({ data, page: { limit: 25, total, nextCursor } });

beforeEach(() => {
  mocks.getCurrentDistricts.mockResolvedValue([districtA]);
  mocks.listInstitutions.mockResolvedValue({ data: [institution], page: { limit: 25, nextCursor: null, total: 1 } });
  mocks.listTeachers.mockResolvedValue(response());
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function renderPage(path = '/app/teachers') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/app/teachers" element={<TeacherDirectoryPage />} /></Routes></MemoryRouter>);
}

describe('TASK-045 Teacher directory', () => {
  it('uses one compact header and an accessible-only caption without cards or result headings', async () => {
    renderPage(); await screen.findByRole('link', { name: 'محمد علي' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'النتائج' })).toBeNull();
    expect(document.querySelector('.ui-card')).toBeNull();
    expect(document.querySelector('caption')?.className).toBe('ui-table__caption--accessible-only');
    expect(screen.getByRole('link', { name: 'بطاقة معلومات الأستاذ — محمد علي' }).getAttribute('href')).toBe(`/app/teachers/${teacher.id}/information-card`);
  });

  it('keeps optional schedule filters collapsed, indicates active filters, and exposes invalid year errors', async () => {
    renderPage(); await screen.findByRole('link', { name: 'محمد علي' });
    const trigger = screen.getByRole('button', { name: 'مرشحات التوزيع الأسبوعي' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox', { name: 'السنة الدراسية' })).toBeNull();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole('textbox', { name: 'السنة الدراسية' }), { target: { value: 'invalid' } });
    expect(screen.getByRole('alert').textContent).toContain('تحقق من صيغة السنة');
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    cleanup(); renderPage('/app/teachers?academicYear=2026-2027&worksNow=true');
    expect(await screen.findByText('مرشحات جدول نشطة: 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'مرشحات التوزيع الأسبوعي' }));
    expect(screen.queryByRole('textbox', { name: 'السنة الدراسية' })).toBeNull();
    expect(screen.getByText('مرشحات جدول نشطة: 1')).toBeTruthy();
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ academicYear: '2026-2027', worksNow: true, limit: 25 }));
  });

  it('mounts one structured list on narrow screens and switches without a duplicate or extra request', async () => {
    let change!: () => void;
    const media = { matches: true, addEventListener: vi.fn((_event, callback) => { change = callback; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => media);
    const longName = 'أستاذ باسم عربي طويل لاختبار القراءة دون قطع';
    mocks.listTeachers.mockResolvedValue(response([{ ...teacher, name: longName, professionalStatus: 'SUBSTITUTE', recordStatus: 'INACTIVE', currentInstitution: { ...institution, name: 'ابتدائية ذات اسم عربي طويل جدًا لاختبار الالتفاف' } }]));
    renderPage();
    expect(await screen.findByRole('list', { name: 'دليل الأساتذة' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('link', { name: `${longName} علي` })).toHaveLength(1);
    expect(screen.getByRole('listitem').hasAttribute('tabindex')).toBe(false);
    expect(screen.getByText('مستخلف', { selector: 'span' })).toBeTruthy(); expect(screen.getByText('غير نشط', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('ابتدائية ذات اسم عربي طويل جدًا لاختبار الالتفاف')).toBeTruthy();
    act(() => { media.matches = false; change(); });
    expect(screen.getByRole('table', { name: 'دليل الأساتذة' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'دليل الأساتذة' })).toBeNull();
    expect(mocks.listTeachers).toHaveBeenCalledTimes(1);
  });

  it('never represents a failed load as a zero count', async () => {
    mocks.listTeachers.mockRejectedValueOnce(new Error('sensitive internals'));
    renderPage(); await screen.findByRole('heading', { name: 'تعذر تحميل دليل الأساتذة' });
    expect(screen.getByText('إجمالي النتائج: غير متاح')).toBeTruthy();
    expect(screen.queryByText('إجمالي النتائج: 0')).toBeNull();
  });
  it('loads the ACTIVE-default server page, total, approved institution and supported navigation only', async () => {
    renderPage();
    expect(screen.getByText('جارٍ تحميل دليل الأساتذة…')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'محمد علي' })).toBeTruthy();
    expect(screen.getByText('إجمالي النتائج: 1')).toBeTruthy();
    expect(screen.getByText('مدرسة النور')).toBeTruthy();
    expect(screen.getByText('الجزائر')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'محمد علي' }).getAttribute('href')).toBe(`/app/teachers/${teacher.id}`);
    expect(screen.getByRole('link', { name: 'التوزيع الأسبوعي — محمد علي' }).getAttribute('href')).toBe(`/app/teachers/${teacher.id}/schedules`);
    expect(mocks.listTeachers).toHaveBeenCalledWith({ limit: 25 });
    expect(screen.queryByRole('button', { name: /حذف|أرشفة|تعديل/ })).toBeNull();
  });

  it('keeps every professional status distinct and presents identity/status with readable text', async () => {
    const statuses = ['PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE'] as const;
    mocks.listTeachers.mockResolvedValueOnce(response(statuses.map((professionalStatus, index) => ({
      ...teacher, id: `teacher-${index}`, professionalStatus, name: `أستاذ ${index}`,
    }))));
    renderPage();
    await screen.findByRole('link', { name: 'أستاذ 0 علي' });
    for (const label of ['مرسم', 'متربص', 'متعاقد', 'متعاقد مؤقت', 'مستخلف']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'أستاذ 4 علي' }).getAttribute('href')).toBe('/app/teachers/teacher-4');
  });

  it('shows an unassigned current-institution state and never displays phone or email columns', async () => {
    mocks.listTeachers.mockResolvedValueOnce(response([{ ...teacher, currentInstitution: null }]));
    renderPage();
    expect(await screen.findByText('لم تُعتمد مؤسسة حالية')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /الهاتف|البريد/ })).toBeNull();
  });

  it('debounces q and sends search to the API without client-side filtering', async () => {
    vi.useFakeTimers();
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن أستاذ' }), { target: { value: 'محمد علي' } });
    act(() => { vi.advanceTimersByTime(349); });
    expect(mocks.listTeachers).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.listTeachers).toHaveBeenLastCalledWith({ q: 'محمد علي', limit: 25 });
    vi.useRealTimers();
  });

  it('ignores a stale response after a newer server search has started', async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    mocks.listTeachers.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(response([{ ...teacher, id: '55555555-5555-4555-8555-555555555555', name: 'أحدث' }]));
    renderPage('/app/teachers?q=قديم');
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن أستاذ' }), { target: { value: 'جديد' } });
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    expect(await screen.findByRole('link', { name: 'أحدث علي' })).toBeTruthy();
    await act(async () => { resolveOld(response([{ ...teacher, name: 'قديم' }])); });
    expect(screen.queryByRole('link', { name: 'قديم علي' })).toBeNull();
  });

  it('offers a District filter only for multiple current Districts and sends selected scope', async () => {
    mocks.getCurrentDistricts.mockResolvedValueOnce([districtA, districtB]);
    renderPage();
    expect(await screen.findByText('مقاطعة الشمال', { selector: 'small' })).toBeTruthy();
    const filter = await screen.findByRole('combobox', { name: 'المقاطعة' });
    fireEvent.change(filter, { target: { value: districtB.id } });
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ districtId: districtB.id, limit: 25 }));
    mocks.getCurrentDistricts.mockResolvedValueOnce([districtA]);
    cleanup(); renderPage();
    await screen.findByRole('link', { name: 'محمد علي' });
    expect(screen.queryByRole('combobox', { name: 'المقاطعة' })).toBeNull();
  });

  it('keeps server scope authoritative if current District labels fail to load', async () => {
    mocks.getCurrentDistricts.mockRejectedValueOnce(new Error('private district error'));
    renderPage();
    expect(await screen.findByText('تعذر تحميل أسماء المقاطعات؛ تبقى صلاحية النطاق لدى الخادم.')).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'محمد علي' })).toBeTruthy();
    expect(mocks.listTeachers).toHaveBeenCalledWith({ limit: 25 });
    expect(screen.queryByText(/private district error/)).toBeNull();
  });

  it('uses bounded server search for Institutions and the selected institutionId filter', async () => {
    renderPage();
    const search = screen.getByRole('textbox', { name: 'البحث عن مؤسسة حالية معتمدة' });
    fireEvent.change(search, { target: { value: 'مدرسة النور' } });
    expect(await screen.findByRole('combobox', { name: 'نتائج المؤسسات' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'نتائج المؤسسات' }), { target: { value: institution.id } });
    await waitFor(() => expect(mocks.listInstitutions).toHaveBeenCalledWith({ q: 'مدرسة النور', districtId: undefined, limit: 25 }));
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ institutionId: institution.id, hasCurrentInstitution: true, limit: 25 }));
  });

  it('composes unassigned, professional and record status filters using canonical values', async () => {
    renderPage();
    fireEvent.change(screen.getByRole('combobox', { name: 'المؤسسة الحالية المعتمدة' }), { target: { value: 'false' } });
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ hasCurrentInstitution: false, limit: 25 }));
    fireEvent.change(screen.getByRole('combobox', { name: 'الصفة المهنية' }), { target: { value: 'TRAINEE' } });
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ hasCurrentInstitution: false, professionalStatus: 'TRAINEE', limit: 25 }));
    fireEvent.change(screen.getByRole('combobox', { name: 'حالة السجل' }), { target: { value: 'INACTIVE' } });
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ hasCurrentInstitution: false, professionalStatus: 'TRAINEE', recordStatus: 'INACTIVE', limit: 25 }));
    expect(screen.getByRole('option', { name: 'متربص' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'مرسم' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'متعاقد' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'متعاقد مؤقت' })).toBeTruthy();
  });

  it('requires an explicit valid academic year before schedule filters and converts HH:mm', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'مرشحات التوزيع الأسبوعي' }));
    const year = screen.getByRole('textbox', { name: 'السنة الدراسية' });
    const day = screen.getByRole('combobox', { name: 'يوم العمل' }) as HTMLSelectElement;
    expect(day.disabled).toBe(true);
    fireEvent.change(year, { target: { value: '2026-2027' } });
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ limit: 25 }));
    expect(day.disabled).toBe(false);
    fireEvent.change(day, { target: { value: '2' } });
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ academicYear: '2026-2027', dayOfWeek: 2, limit: 25 }));
    fireEvent.change(screen.getByLabelText('وقت الحصة'), { target: { value: '08:30' } });
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ academicYear: '2026-2027', dayOfWeek: 2, minuteOfDay: 510, limit: 25 }));
    expect(parseTimeToMinute('23:59')).toBe(1439);
    expect(parseTimeToMinute('24:00')).toBeUndefined();
  });

  it('sends worksToday/worksNow only as true and resets cursor on filter changes', async () => {
    renderPage('/app/teachers?academicYear=2026-2027&dayOfWeek=2&cursor=irrelevant');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'يعمل اليوم' }));
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ academicYear: '2026-2027', dayOfWeek: 2, worksToday: true, limit: 25 }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'يعمل الآن' }));
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ academicYear: '2026-2027', dayOfWeek: 2, worksToday: true, worksNow: true, limit: 25 }));
    expect((screen.getByRole('textbox', { name: 'السنة الدراسية' }) as HTMLInputElement).value).toBe('2026-2027');
  });

  it('uses cursor history for next/previous, displays server total and clears cursor on reset', async () => {
    const nextId = '66666666-6666-4666-8666-666666666666';
    mocks.listTeachers.mockResolvedValueOnce(response([teacher], 30, nextId)).mockResolvedValueOnce(response([{ ...teacher, id: nextId, name: 'التالي' }], 30));
    renderPage();
    await screen.findByRole('link', { name: 'محمد علي' });
    expect(screen.getByText('النتائج 1–1 من 30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'النتائج التالية' }));
    expect(await screen.findByRole('link', { name: 'التالي علي' })).toBeTruthy();
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ limit: 25, cursor: nextId }));
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(await screen.findByRole('link', { name: 'محمد علي' })).toBeTruthy();
  });

  it('resets a stale cursor safely and reloads from the first page', async () => {
    mocks.listTeachers.mockResolvedValueOnce(response([teacher], 30, '66666666-6666-4666-8666-666666666666'))
      .mockRejectedValueOnce(new ApiRequestError('not found', undefined, 404, 'NOT_FOUND'))
      .mockResolvedValue(response([teacher], 30));
    renderPage();
    await screen.findByRole('link', { name: 'محمد علي' });
    fireEvent.click(screen.getByRole('button', { name: 'النتائج التالية' }));
    expect(await screen.findByText('تغيّرت النتائج أو انتهت صلاحية مؤشر الصفحة؛ عُدنا إلى بداية القائمة.')).toBeTruthy();
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ limit: 25 }));
    expect(screen.getByRole('link', { name: 'محمد علي' })).toBeTruthy();
  });

  it('distinguishes default and filtered empty results and resets filters', async () => {
    mocks.listTeachers.mockResolvedValueOnce(response([], 0));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'لا توجد سجلات أساتذة ظاهرة' })).toBeTruthy();
    cleanup(); mocks.listTeachers.mockResolvedValue(response([], 0)); renderPage('/app/teachers?q=none');
    expect(await screen.findByRole('heading', { name: 'لا توجد نتائج مطابقة' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'مسح المرشحات' })[0]);
    await waitFor(() => expect(mocks.listTeachers).toHaveBeenLastCalledWith({ limit: 25 }));
  });

  it('keeps transport details out of the error state and retries', async () => {
    mocks.listTeachers.mockRejectedValueOnce(new Error('raw server internals')).mockResolvedValue(response());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'تعذر تحميل دليل الأساتذة' })).toBeTruthy();
    expect(screen.queryByText(/raw server internals/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByRole('link', { name: 'محمد علي' })).toBeTruthy();
  });

  it('is RTL with associated labels and keyboard-focusable actions', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'محمد علي' })).toBeTruthy();
    expect(document.querySelector('.teacher-directory')?.getAttribute('dir')).toBe('rtl');
    const search = screen.getByRole('textbox', { name: 'البحث عن أستاذ' });
    search.focus(); expect(document.activeElement).toBe(search);
    expect(screen.getByRole('table', { name: 'دليل الأساتذة' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /البلدية/ })).toBeNull();
  });
});
