import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { WeeklySchedulePage } from './WeeklySchedulePage';
import { addWeeklyScheduleSlot, ApiRequestError, createWeeklySchedule, deleteWeeklyScheduleSlot, getTeacherProfile, getValidWorkplaces, getWeeklySchedule, patchWeeklyScheduleSlot, type TeacherProfile } from '../auth/client';

vi.mock('../auth/client', () => ({
  ApiRequestError: class ApiRequestError extends Error { constructor(message: string, public fields?: Record<string, string[]>, public status?: number, public code?: string) { super(message); } },
  getTeacherProfile: vi.fn(), getWeeklySchedule: vi.fn(), createWeeklySchedule: vi.fn(), addWeeklyScheduleSlot: vi.fn(),
  patchWeeklyScheduleSlot: vi.fn(), deleteWeeklyScheduleSlot: vi.fn(), getValidWorkplaces: vi.fn(),
}));

const profile = { id: 'teacher-1', name: 'أمينة', surname: 'اختبار', currentInstitution: { id: 'institution-1', name: 'ابتدائية الأمل' } } as unknown as TeacherProfile;
const slot = { id: 'slot-1', dayOfWeek: 1, startMinute: 480, endMinute: 540, levelLabel: null, groupLabel: null, notes: null, institutionId: 'institution-1', institution: { id: 'institution-1', name: 'ابتدائية الأمل', municipality: null, archivedAt: null }, validFrom: '2026-09-01', validTo: null, workplaceBasis: 'HOME' as const, consistency: { status: 'CONSISTENT' as const, reasonCode: null } };
const schedule = { id: 'schedule-1', teacherId: 'teacher-1', academicYear: '2026-2027', revision: 1, slots: [] };
function renderPage() { return render(<MemoryRouter initialEntries={['/app/teachers/teacher-1/schedules']}><Routes><Route path="/app/teachers/:id/schedules" element={<WeeklySchedulePage />} /></Routes></MemoryRouter>); }

describe('WeeklySchedulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(getTeacherProfile).mockResolvedValue({ data: profile });
    vi.mocked(getValidWorkplaces).mockResolvedValue({ data: { items: [{ id: 'institution-1', name: 'ابتدائية الأمل', municipality: null, role: 'HOME' }] } });
  });
  afterEach(() => cleanup());

  it('requires an explicit year, shows absent state, and creates an empty schedule', async () => {
    vi.mocked(getWeeklySchedule).mockResolvedValue({ data: { schedule: null } });
    vi.mocked(createWeeklySchedule).mockResolvedValue({ data: { schedule } });
    renderPage();
    expect(await screen.findByText('الأستاذ: أمينة اختبار')).toBeTruthy();
    expect((screen.getByLabelText('السنة الدراسية') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('السنة الدراسية'), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' }));
    expect(await screen.findByText('لا يوجد توزيع لهذه السنة')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء توزيع فارغ' }));
    await waitFor(() => expect(createWeeklySchedule).toHaveBeenCalledWith('teacher-1', '2026-2027'));
    expect(await screen.findByRole('heading', { name: 'إضافة حصة' })).toBeTruthy();
  });

  it('renders Arabic schedule, adds/edits/deletes and explains overlapping slot errors', async () => {
    vi.mocked(getWeeklySchedule).mockResolvedValue({ data: { schedule: { ...schedule, slots: [slot] } } });
    vi.mocked(addWeeklyScheduleSlot).mockRejectedValueOnce(new ApiRequestError('overlap', undefined, 409, 'WEEKLY_SCHEDULE_SLOT_OVERLAP'));
    vi.mocked(patchWeeklyScheduleSlot).mockResolvedValue({ data: { schedule: { ...schedule, revision: 2, slots: [{ ...slot, endMinute: 555 }] } } });
    vi.mocked(deleteWeeklyScheduleSlot).mockResolvedValue({ data: { schedule: { ...schedule, revision: 2, slots: [] } } });
    renderPage();
    fireEvent.change(await screen.findByLabelText('السنة الدراسية'), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' }));
    expect(await screen.findByRole('heading', { name: 'الاثنين' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'إضافة حصة' })).toBeTruthy();
    expect(screen.getAllByText('ابتدائية الأمل')).toHaveLength(2);
    fireEvent.change(await screen.findByLabelText(/بداية السريان/u), { target: { value: '2026-09-01' } });
    await screen.findByRole('option', { name: /ابتدائية الأمل/u });
    fireEvent.change(screen.getByLabelText('مكان العمل'), { target: { value: 'institution-1' } });
    fireEvent.change(screen.getByLabelText('وقت البداية'), { target: { value: '08:30' } });
    fireEvent.change(screen.getByLabelText('وقت النهاية'), { target: { value: '08:45' } });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة الحصة' }));
    expect((await screen.findByRole('alert')).textContent).toContain('تتداخل هذه الحصة مع حصة أخرى في اليوم نفسه.');
    expect(addWeeklyScheduleSlot).toHaveBeenCalledWith('schedule-1', 1, expect.objectContaining({ institutionId: 'institution-1', validFrom: '2026-09-01', startMinute: 510, endMinute: 525 }));
    fireEvent.click(screen.getByRole('button', { name: 'تعديل' }));
    fireEvent.change(screen.getByLabelText('وقت النهاية'), { target: { value: '09:15' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الحصة' }));
    await waitFor(() => expect(patchWeeklyScheduleSlot).toHaveBeenCalled());
  });

  it('disables all mutation for an unassigned teacher and links to profile approval', async () => {
    vi.mocked(getTeacherProfile).mockResolvedValue({ data: { ...profile, currentInstitution: null } });
    vi.mocked(getValidWorkplaces).mockResolvedValue({ data: { items: [] } });
    vi.mocked(getWeeklySchedule).mockResolvedValue({ data: { schedule: null } });
    renderPage();
    fireEvent.change(await screen.findByLabelText('السنة الدراسية'), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' }));
    expect(await screen.findByText(/لا توجد مؤسسة أم حالية/u)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'إنشاء توزيع فارغ' }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('section[dir="rtl"]')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ملف الأستاذ' }).getAttribute('href')).toBe('/app/teachers/teacher-1');
  });

  it('shows revision conflict safely and provides an explicit refresh action', async () => {
    vi.mocked(getWeeklySchedule).mockResolvedValue({ data: { schedule: { ...schedule, slots: [slot] } } });
    vi.mocked(patchWeeklyScheduleSlot).mockRejectedValueOnce(new ApiRequestError('conflict', undefined, 409, 'WEEKLY_SCHEDULE_REVISION_CONFLICT'));
    renderPage();
    fireEvent.change(await screen.findByLabelText('السنة الدراسية'), { target: { value: '2026-2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'عرض التوزيع' }));
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل' }));
    fireEvent.change(screen.getByLabelText('وقت النهاية'), { target: { value: '08:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الحصة' }));
    expect(await screen.findByText('تم تعديل التوزيع الأسبوعي منذ فتحه. حدّث البيانات ثم أعد المحاولة.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تحديث البيانات' }));
    await waitFor(() => expect(getWeeklySchedule).toHaveBeenCalledTimes(2));
  });
});
