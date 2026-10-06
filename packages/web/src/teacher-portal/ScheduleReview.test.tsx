import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { InspectorSchedulePage } from './InspectorSchedulePage';
import { TeacherScheduleEditor } from './TeacherScheduleEditor';
const mocks = vi.hoisted(() => ({ portalFetch: vi.fn(), getWeeklySchedule: vi.fn(), getValidWorkplaces: vi.fn(), getTeacherProfile: vi.fn() }));
vi.mock('./client', async (original) => ({ ...await original<typeof import('./client')>(), portalFetch: mocks.portalFetch }));
vi.mock('../auth/client', async (original) => ({ ...await original<typeof import('../auth/client')>(), getWeeklySchedule: mocks.getWeeklySchedule, getValidWorkplaces: mocks.getValidWorkplaces, getTeacherProfile: mocks.getTeacherProfile }));
const slot = { id: 'slot', institutionId: 'school', institution: { id: 'school', name: 'مدرسة عربية طويلة' }, validFrom: '2026-10-05', validTo: null, dayOfWeek: 1, startMinute: 480, endMinute: 540, levelLabel: null, groupLabel: null, notes: null };
const schedule = { id: 'schedule', revision: 3, academicYear: '2026-2027', slots: [slot] };
const review = { id: 'review', origin: 'TEACHER_UPDATE', status: 'SUBMITTED', academicYear: '2026-2027', revision: 1, note: null, decisionNote: null, proposedSlots: [{ ...slot, startMinute: 600, endMinute: 660 }] };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  mocks.getWeeklySchedule.mockResolvedValue({ data: { schedule } });
  mocks.getTeacherProfile.mockResolvedValue({ data: { name: 'محمد', surname: 'المفتاح' } });
  mocks.getValidWorkplaces.mockResolvedValue({ data: { items: [{ id: 'school', name: 'مدرسة عربية طويلة' }] } });
  mocks.portalFetch.mockResolvedValue({ data: [review] });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function inspector() { render(<MemoryRouter initialEntries={['/app/teachers/teacher/schedules?academicYear=2026-2027']}><Routes><Route path="/app/teachers/:id/schedules" element={<InspectorSchedulePage />} /></Routes></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' })); }
it('Inspector sees Teacher/year/origin/current/proposed, not direct edit/create controls; reasoned rejection is explicit', async () => {
  inspector(); await screen.findByRole('button', { name: 'رفض المقترح' });
  expect(screen.getByText('محمد المفتاح')).toBeTruthy(); expect(screen.getByRole('heading', { name: 'الجدول الساري' })).toBeTruthy(); expect(screen.getByRole('heading', { name: 'النسخة المقترحة' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'إضافة حصة' })).toBeNull(); expect(screen.queryByRole('button', { name: 'تسجيل التوزيع الأولي' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'رفض المقترح' }));
  const dialog = screen.getByRole('dialog'); const reason = within(dialog).getByLabelText(/سبب رفض المقترح/u); expect(reason).toBe(document.activeElement);
  expect(within(dialog).getByRole('button', { name: 'تأكيد رفض المقترح' })).toHaveProperty('disabled', true);
  fireEvent.change(reason, { target: { value: 'يرجى تصحيح المؤسسة' } }); fireEvent.click(within(dialog).getByRole('button', { name: 'تأكيد رفض المقترح' }));
  await waitFor(() => expect(mocks.portalFetch).toHaveBeenCalledWith('/schedule-corrections/review/reject', { expectedRevision: 1, reason: 'يرجى تصحيح المؤسسة' }, { inspector: true }));
});
it('invalid acceptance stays visibly unaccepted and can be explicitly rejected; no silent retry', async () => {
  mocks.portalFetch.mockImplementation(async (path: string) => { if (path.endsWith('/accept')) throw new Error('تغير الجدول أو طلب التصحيح؛ حدّث البيانات.'); return { data: [review] }; });
  inspector(); fireEvent.click(await screen.findByRole('button', { name: 'اعتماد التحديث' })); fireEvent.click(screen.getByRole('button', { name: 'تأكيد اعتماد التحديث' }));
  await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('تغير الجدول'));
  expect(mocks.portalFetch.mock.calls.filter(([path]) => path.endsWith('/accept'))).toHaveLength(1);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'إلغاء' })); fireEvent.click(screen.getByRole('button', { name: 'رفض المقترح' })); expect(screen.getByLabelText(/سبب رفض المقترح/u)).toBeTruthy();
});
it('Teacher pending update retains canonical and proposed boards and blocks a duplicate editor', async () => {
  mocks.portalFetch.mockResolvedValue({ data: { schedule, correction: review, reviews: [review] } }); render(<TeacherScheduleEditor places={[{ id: 'school', name: 'مدرسة عربية طويلة' }]} />);
  fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } }); fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' }));
  await screen.findByRole('heading', { name: 'المقترح المرسل — غير ساري بعد' }); expect(screen.getByText('08:00 — 09:00')).toBeTruthy(); expect(screen.getByText('10:00 — 11:00')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'إرسال التحديث للمراجعة' })).toBeNull();
});
it('Teacher rejected history shows reason and a fresh independent proposal pins canonical revision', async () => {
  const rejected = { ...review, status: 'REJECTED', decisionNote: 'المؤسسة غير سارية' };
  mocks.portalFetch.mockResolvedValue({ data: { schedule, correction: null, reviews: [rejected] } }); render(<TeacherScheduleEditor places={[{ id: 'school', name: 'مدرسة عربية طويلة' }]} />);
  fireEvent.change(screen.getByLabelText(/السنة الدراسية/u), { target: { value: '2026-2027' } }); fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' }));
  await screen.findByText('المؤسسة غير سارية'); fireEvent.click(screen.getByRole('button', { name: 'إرسال التحديث للمراجعة' }));
  await waitFor(() => expect(mocks.portalFetch).toHaveBeenCalledWith('/teacher/schedules', expect.objectContaining({ academicYear: '2026-2027', expectedRevision: 3 })));
  await screen.findByText('تم إرسال التحديث للمراجعة. يبقى الجدول الساري دون تغيير حتى الاعتماد.');
});
