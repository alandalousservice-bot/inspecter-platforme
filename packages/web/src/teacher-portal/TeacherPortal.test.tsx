import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { TeacherLoginPage } from './TeacherLoginPage';
import { TeacherPortalPage } from './TeacherPortalPage';
import { TeacherScheduleEditor, WeekBoard } from './TeacherScheduleEditor';
import { InspectorTeacherRequestsPage } from './InspectorTeacherRequestsPage';
import { TeacherAccountPanel } from './TeacherAccountPanel';
import { OperationalAlerts } from './OperationalAlerts';
import { GeographyNavigator } from './GeographyNavigator';
import { DossierUpdates } from './DossierUpdates';
import { InstitutionalContext } from './InstitutionalContext';
const mocks = vi.hoisted(() => ({ portalFetch: vi.fn() }));
vi.mock('./client', async (original) => ({ ...await original<typeof import('./client')>(), ...mocks }));
const teacher = { id: 'teacher', name: 'محمد', surname: 'علي', phone: null, email: null, professionalStatus: 'TRAINEE', trainingStatus: null, trainingVerifiedAt: null, district: { id: 'district', name: 'المقاطعة' }, institution: { id: 'school', name: 'مدرسة النور', municipality: 'بلدية النور' }, qualificationsStructured: [] };
const place = { id: 'school', name: 'مدرسة النور', role: 'HOME' };
const renderRouter = (element: React.ReactNode, path = '/teacher') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={element} /><Route path="/teacher" element={path === '/teacher' ? element : <p>تم الدخول</p>} /></Routes></MemoryRouter>);
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  mocks.portalFetch.mockImplementation(async (path: string) => {
  if (path === '/teacher/me') return { data: { teacher } };
  if (path === '/teacher/workplaces' || path === '/teacher/districts') return { data: { items: [place] } };
  if (path === '/teacher/actions') return { data: { corrections: [] } };
  if (path === '/teacher/requests') return { data: [], page: { nextCursor: null } };
  if (path.startsWith('/teacher-requests?')) return { data: [], page: { nextCursor: null, total: 0 } };
  return { data: {} };
}); });
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });
it('Teacher login is role-specific, labelled and has no open signup', async () => {
  renderRouter(<TeacherLoginPage />, '/teacher/login');
  await waitFor(() => expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toHaveProperty('disabled', false));
  fireEvent.change(screen.getByLabelText(/البريد الإلكتروني للحساب/u), { target: { value: 'teacher@example.invalid' } });
  fireEvent.change(screen.getByLabelText(/كلمة المرور/u), { target: { value: 'synthetic-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
  await screen.findByText('تم الدخول');
  expect(mocks.portalFetch).toHaveBeenCalledWith('/teacher/auth/login', { email: 'teacher@example.invalid', password: 'synthetic-password' });
});
it('activation token is removed from browser URL and used only for activation', async () => {
  window.history.replaceState(null, '', '/teacher/login#synthetic-invitation-token');
  renderRouter(<TeacherLoginPage />, '/teacher/login');
  expect(window.location.hash).toBe('');
  await waitFor(() => expect(screen.getByRole('button', { name: 'تفعيل الحساب' })).toHaveProperty('disabled', false));
  fireEvent.change(screen.getByLabelText(/كلمة المرور/u), { target: { value: 'synthetic-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'تفعيل الحساب' }));
  await screen.findByText('تم تفعيل الحساب. سجّل الدخول بالبريد المحدد في الدعوة.');
  expect(mocks.portalFetch).toHaveBeenCalledWith('/teacher/auth/activate', { token: 'synthetic-invitation-token', password: 'synthetic-password' });
});
it('login failure has Arabic feedback and never grants Inspector navigation', async () => {
  mocks.portalFetch.mockRejectedValueOnce(new Error('تعذر تجهيز تسجيل الدخول.'));
  renderRouter(<TeacherLoginPage />, '/teacher/login');
  expect(await screen.findByRole('alert')).toSatisfy((element: HTMLElement) => element.textContent?.includes('تعذر تجهيز تسجيل الدخول'));
  expect(screen.queryByRole('link', { name: 'دليل الأساتذة' })).toBeNull();
});
it('portal displays approved identity, workplaces, empty qualifications and RTL without administrative secrets', async () => {
  renderRouter(<TeacherPortalPage />);
  await screen.findByRole('heading', { name: 'محمد علي' });
  expect(screen.getByRole('main')).toSatisfy((element: HTMLElement) => element.getAttribute('dir') === 'rtl');
  expect(screen.getByText(/مؤسسة أصلية/u)).toBeTruthy();
  expect(screen.queryByText('ملاحظة إدارية')).toBeNull();
  expect(screen.getByLabelText(/الصورة الشخصية/u)).toSatisfy((element: HTMLElement) => element.getAttribute('accept') === 'image/png,image/jpeg');
});
it('contact update posts a proposal, does not overwrite approved identity and shows confirmation', async () => {
  renderRouter(<TeacherPortalPage />); await screen.findByRole('heading', { name: 'محمد علي' });
  fireEvent.click(screen.getByRole('button', { name: 'الطلبات والتحديثات' }));
  fireEvent.change(screen.getByLabelText('البريد المقترح'), { target: { value: 'new@example.invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'إرسال للمراجعة' }));
  await screen.findByText(/تم إرسال التصريح للمفتش/u);
  expect(mocks.portalFetch).toHaveBeenCalledWith('/teacher/requests', { kind: 'CONTACT', payload: { email: 'new@example.invalid' } });
});
it('teacher receives correction alert and can navigate to schedule', async () => {
  mocks.portalFetch.mockImplementation(async (path: string) => path === '/teacher/me' ? { data: { teacher } } : path === '/teacher/actions' ? { data: { corrections: [{ id: 'c', academicYear: '2026-2027', status: 'REQUESTED', note: 'راجع حصة الاثنين' }] } } : path === '/teacher/requests' ? { data: [], page: { nextCursor: null } } : { data: { items: [place] } });
  renderRouter(<TeacherPortalPage />); await screen.findByText('راجع حصة الاثنين');
  fireEvent.click(screen.getByRole('button', { name: 'فتح التوزيع الأسبوعي' }));
  expect(screen.getByLabelText(/السنة الدراسية/u)).toBeTruthy();
});
it('portal failure offers retry without technical details', async () => {
  mocks.portalFetch.mockRejectedValue(new Error('تعذر تحميل بياناتك.'));
  renderRouter(<TeacherPortalPage />);
  await screen.findByRole('button', { name: 'إعادة المحاولة' });
  expect(screen.queryByText(/passwordHash|tokenHash/u)).toBeNull();
});
it('effective schedule supports an independent proposal without replacing current facts', async () => {
  mocks.portalFetch.mockResolvedValue({ data: { schedule: { id: 's', revision: 1, slots: [] }, correction: null } });
  render(<TeacherScheduleEditor places={[place]} />);
  fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } });
  fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' }));
  await screen.findByRole('heading', { name: 'الجدول الساري' });
  expect(screen.getByRole('button', { name: 'إضافة إلى المسودة' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'إرسال التحديث للمراجعة' })).toBeTruthy();
});
it('initial schedule requires an approved workplace and explicitly dated slots', async () => {
  mocks.portalFetch.mockResolvedValue({ data: { schedule: null, correction: null } });
  render(<TeacherScheduleEditor places={[]} />);
  fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } });
  fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' }));
  expect(await screen.findByRole('button', { name: 'إضافة إلى المسودة' })).toHaveProperty('disabled', true);
  expect(screen.getByLabelText(/سارية من/u)).toHaveProperty('required', true);
});
it('week board presents recorded times and home/supplementary names without fixed hours or UUIDs', () => {
  render(<WeekBoard places={[place]} slots={[{ institutionId: place.id, validFrom: '2026-10-05', validTo: null, levelLabel: null, groupLabel: null, notes: null, dayOfWeek: 1, startMinute: 480, endMinute: 540 }]} />);
  expect(screen.getByText('08:00 — 09:00')).toBeTruthy(); expect(screen.getByText(place.name)).toBeTruthy();
  expect(screen.getAllByRole('article')).toHaveLength(7);
});
it('Inspector cannot accept a self-declared training completion but may reject it explicitly', async () => {
  mocks.portalFetch.mockResolvedValue({ data: [{ id: 'request', teacher: { id: 'teacher', name: 'محمد', surname: 'علي' }, kind: 'TRAINING', status: 'PENDING', revision: 1, payload: { status: 'COMPLETED' } }], page: { total: 1, nextCursor: null } });
  renderRouter(<InspectorTeacherRequestsPage />, '/app/teacher-requests');
  expect(await screen.findByRole('button', { name: 'اعتماد القرار' })).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByRole('button', { name: 'رفض الطلب' }));
  expect(screen.getByRole('dialog', { name: 'تأكيد قرار المفتش' })).toBeTruthy();
  expect(screen.getByLabelText('ملاحظة للطالب — اختيارية')).toBe(document.activeElement);
});
it('invitation requires explicit identity confirmation and hides the token on operator request', async () => {
  mocks.portalFetch.mockResolvedValue({ data: { activationToken: 'synthetic-token' } });
  render(<TeacherAccountPanel teacherId="teacher" />); fireEvent.click(screen.getByText('حساب الأستاذ — دعوة مقيدة بالملف'));
  expect(screen.getByRole('button', { name: 'إصدار دعوة' })).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('بريد تسجيل دخول الحساب'), { target: { value: 'teacher@example.invalid' } });
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'إصدار دعوة' }));
  await screen.findByLabelText('رابط التفعيل — لا تحفظه في ملفات المشروع');
  fireEvent.click(screen.getByRole('button', { name: 'إخفاء رابط التفعيل' }));
  expect(screen.queryByDisplayValue(/synthetic-token/u)).toBeNull();
});
it('dashboard operational alerts lead to filtered review and the exact correction year', async () => {
  mocks.portalFetch.mockResolvedValue({ data: { requests: [{ kind: 'TRANSFER', count: 2 }], corrections: 1, correctionItems: [{ id: 'c', academicYear: '2026-2027', teacher: { id: 'teacher', name: 'محمد', surname: 'علي' } }] } });
  renderRouter(<OperationalAlerts />, '/app');
  expect(await screen.findByRole('link', { name: 'الانتقال: 2' })).toSatisfy((element: HTMLElement) => element.getAttribute('href') === '/app/teacher-requests?kind=TRANSFER');
  expect(screen.getByRole('link', { name: 'محمد علي — 2026-2027' })).toSatisfy((element: HTMLElement) => element.getAttribute('href') === '/app/teachers/teacher/schedules?academicYear=2026-2027');
});
it('geography uses server-provided district/municipality choices and removes obsolete context', async () => {
  mocks.portalFetch.mockResolvedValue({ data: { districts: [{ id: 'd1', name: 'مقاطعة أولى', municipalities: [{ name: 'بلدية أولى', institutionCount: 2 }] }, { id: 'd2', name: 'مقاطعة ثانية', municipalities: [] }] } });
  renderRouter(<GeographyNavigator />, '/app/institutions?districtId=d1&municipality=بلدية%20أولى&cursor=old');
  fireEvent.click(screen.getByText('المقاطعة والبلدية — تنقل جغرافي'));
  await screen.findByRole('option', { name: 'بلدية أولى' });
  fireEvent.change(screen.getByLabelText('المقاطعة'), { target: { value: 'd2' } });
  expect(screen.getByLabelText('البلدية')).toHaveProperty('value', '');
  expect(screen.queryByRole('option', { name: 'بلدية أولى' })).toBeNull();
  expect(mocks.portalFetch).toHaveBeenCalledWith('/me/geography');
});
it('geography failure is not rendered as invented districts and supports retry', async () => {
  mocks.portalFetch.mockRejectedValueOnce(new Error('failure'));
  renderRouter(<GeographyNavigator />); fireEvent.click(screen.getByText('المقاطعة والبلدية — تنقل جغرافي'));
  await screen.findByRole('button', { name: 'إعادة تحميل السياق' });
  expect(screen.queryByLabelText('المقاطعة')).toBeNull();
});
it('dossier connects bounded history to owned visits/reports and preserves unknown training', async () => {
  mocks.portalFetch.mockResolvedValue({ data: { requests: [], corrections: [{ id: 'c', status: 'REQUESTED', academicYear: '2026-2027' }], events: [], visits: [{ id: 'visit', status: 'COMPLETED', institutionNameSnapshot: 'الاسم التاريخي', report: { id: 'report', status: 'FINAL', _count: { followUps: 2 } } }] } });
  renderRouter(<DossierUpdates teacherId="teacher" />);
  const link = await screen.findByRole('link', { name: 'التقرير النهائي والمتابعات (2)' });
  expect(link.getAttribute('href')).toBe('/app/visits/visit/report');
  expect(screen.getByText(/لا يوجد إثبات إتمام معتمد/u)).toBeTruthy();
  expect(mocks.portalFetch).toHaveBeenCalledWith('/teachers/teacher/evolution-history');
});
it('failed Inspector decision remains explicit and does not imply successful approval', async () => {
  mocks.portalFetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/decision')) throw new Error('تعذر اعتماد العملية حاليًا؛ حدّث البيانات أو راجع متطلبات الطلب.');
    return { data: [{ id: 'r', teacher: { id: 'teacher', name: 'محمد', surname: 'علي' }, kind: 'CONTACT', status: 'PENDING', revision: 2, payload: { email: 'safe@example.invalid' } }], page: { total: 1, nextCursor: null } };
  });
  renderRouter(<InspectorTeacherRequestsPage />, '/app/teacher-requests');
  fireEvent.click(await screen.findByRole('button', { name: 'اعتماد القرار' })); fireEvent.click(screen.getByRole('button', { name: 'تأكيد القرار' }));
  await waitFor(() => expect(screen.getByRole('dialog').querySelector('[role="alert"]')?.textContent).toContain('تعذر اعتماد العملية'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(mocks.portalFetch).toHaveBeenCalledWith('/teacher-requests/r/decision', { decision: 'ACCEPT', expectedRevision: 2 }, { inspector: true });
});
it('profile status proposal uses approved categories without directly changing master data', async () => {
  renderRouter(<TeacherPortalPage />); await screen.findByRole('heading', { name: 'محمد علي' });
  fireEvent.click(screen.getByRole('button', { name: 'الطلبات والتحديثات' })); fireEvent.change(screen.getByLabelText('نوع الطلب'), { target: { value: 'PROFILE' } });
  fireEvent.change(screen.getByLabelText('الصفة المهنية المقترحة'), { target: { value: 'PERMANENT' } }); fireEvent.click(screen.getByRole('button', { name: 'إرسال للمراجعة' }));
  await screen.findByText(/تم إرسال التصريح للمفتش/u);
  expect(mocks.portalFetch).toHaveBeenCalledWith('/teacher/requests', { kind: 'PROFILE', payload: { professionalStatus: 'PERMANENT' } });
});
it('photo client rejects SVG before transport and keeps approved profile available', async () => {
  renderRouter(<TeacherPortalPage />); await screen.findByRole('heading', { name: 'محمد علي' });
  fireEvent.change(screen.getByLabelText(/الصورة الشخصية/u), { target: { files: [new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' })] } });
  await screen.findByText('اختر PNG أو JPEG لا تتجاوز 2 ميغابايت.');
  expect(mocks.portalFetch.mock.calls.some(([path]) => path === '/teacher/photo')).toBe(false);
});
it('institutional labels are configurable context, not official adoption or authorization', () => {
  render(<InstitutionalContext district="مقاطعة العرض" directorate="مديرية العرض" />);
  expect(screen.getByText('مقاطعة العرض')).toBeTruthy(); expect(screen.getByText('مديرية العرض')).toBeTruthy();
  expect(screen.getByText(/لا تعني اعتمادًا حكوميًا رسميًا/u)).toBeTruthy();
});
