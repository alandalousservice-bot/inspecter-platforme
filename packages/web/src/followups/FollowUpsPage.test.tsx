import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiRequestError } from '../auth/client';
import { FollowUpsPage } from './FollowUpsPage';

const mocks = vi.hoisted(() => ({ getCurrentInspector: vi.fn(), getCurrentDistricts: vi.fn(), listFollowUps: vi.fn(), patchFollowUp: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../auth/client')>()), ...mocks }));
const item = { id: '11111111-1111-4111-8111-111111111111', reportId: '22222222-2222-4222-8222-222222222222', ownerInspectorId: '33333333-3333-4333-8333-333333333333', status: 'OPEN' as const, note: 'متابعة إجراء', dueDate: '2026-09-30', completionNote: null, completedAt: null, revision: 1, createdAt: '', updatedAt: '', alertState: 'OVERDUE' as const,
  context: { visitId: '44444444-4444-4444-8444-444444444444', districtId: '55555555-5555-4555-8555-555555555555', teacher: { id: '66666666-6666-4666-8666-666666666666', name: 'أستاذ', surname: 'تجريبي' }, institution: { id: '77777777-7777-4777-8777-777777777777', name: 'ابتدائية تاريخية' } } };
function renderPage() { return render(<MemoryRouter initialEntries={['/app/follow-ups']}><Routes><Route path="/app/follow-ups" element={<FollowUpsPage />} /></Routes></MemoryRouter>); }
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; this.dispatchEvent(new Event('close')); } });
  mocks.getCurrentInspector.mockResolvedValue({ id: item.ownerInspectorId, email: 'hidden@example.invalid' }); mocks.getCurrentDistricts.mockResolvedValue([{ id: item.context.districtId, name: 'المقاطعة' }]);
  mocks.listFollowUps.mockResolvedValue({ data: [item], page: { limit: 25, nextCursor: null, total: 1 } }); mocks.patchFollowUp.mockResolvedValue({ data: { followUp: { ...item, status: 'COMPLETED', revision: 2, completedAt: '2026-09-30T10:00:00Z', alertState: 'NONE' } } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('TASK-053 operational follow-up UI', () => {
  it('renders RTL operational list, server filters, context and accessible controls', async () => {
    const { container } = renderPage(); await screen.findByText('متابعة إجراء');
    expect(container.querySelector('.followups-page')?.getAttribute('dir')).toBe('rtl'); expect(screen.getAllByText('متأخرة').length).toBeGreaterThan(0);
    expect(screen.getByText('ابتدائية تاريخية')).toBeTruthy(); expect(mocks.listFollowUps).toHaveBeenCalledWith({ status: 'OPEN', limit: 25 });
    fireEvent.change(screen.getByLabelText('الاستحقاق'), { target: { value: 'DUE_TODAY' } });
    await waitFor(() => expect(mocks.listFollowUps).toHaveBeenLastCalledWith({ status: 'OPEN', alert: 'DUE_TODAY', limit: 25 }));
    expect(screen.getByRole('button', { name: 'تعديل الإجراء' })).toBeTruthy(); expect(screen.queryByRole('button', { name: /حذف|أرشفة|نقل الملكية/u })).toBeNull();
  });
  it('shows empty and safe error states', async () => {
    mocks.listFollowUps.mockResolvedValueOnce({ data: [], page: { limit: 25, nextCursor: null, total: 0 } }); renderPage();
    expect(await screen.findByText('لا توجد إجراءات مفتوحة')).toBeTruthy();
    cleanup(); mocks.listFollowUps.mockRejectedValueOnce(new Error('private db detail')); renderPage();
    expect(await screen.findByText('تعذر تحميل إجراءات المتابعة')).toBeTruthy(); expect(screen.queryByText('private db detail')).toBeNull();
  });
  it('edits explicitly and handles stale revision with manual refresh', async () => {
    renderPage(); await screen.findByText('متابعة إجراء'); fireEvent.click(screen.getByRole('button', { name: 'تعديل الإجراء' }));
    fireEvent.change(screen.getByDisplayValue(item.dueDate), { target: { value: '2026-10-01' } });
    expect(mocks.patchFollowUp).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));
    await waitFor(() => expect(mocks.patchFollowUp).toHaveBeenCalledWith(item.id, { operation: 'EDIT', expectedRevision: 1, note: item.note, dueDate: '2026-10-01' }));
    mocks.patchFollowUp.mockRejectedValueOnce(new ApiRequestError('opaque', undefined, 409, 'FOLLOW_UP_REVISION_CONFLICT'));
    cleanup(); renderPage(); await screen.findByText('متابعة إجراء'); fireEvent.click(screen.getByRole('button', { name: 'تعديل الإجراء' })); fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));
    expect(await screen.findByRole('button', { name: 'تحديث البيانات' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); fireEvent.click(screen.getByRole('button', { name: 'تحديث البيانات' }));
    await waitFor(() => expect(screen.queryByText('تعذر تنفيذ العملية. راجع الحالة وحدّث البيانات قبل المحاولة.')).toBeNull());
  });
  it('validates the 1000-character limit by Unicode code point', async () => {
    renderPage(); await screen.findByText('متابعة إجراء'); fireEvent.click(screen.getByRole('button', { name: 'تعديل الإجراء' }));
    const note = screen.getByLabelText('الإجراء المطلوب'); fireEvent.change(note, { target: { value: '😀'.repeat(1001) } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));
    expect(await screen.findByText('يجب ألا يتجاوز النص 1000 حرف.')).toBeTruthy(); expect(mocks.patchFollowUp).not.toHaveBeenCalled();
    fireEvent.change(note, { target: { value: '😀'.repeat(1000) } }); fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));
    await waitFor(() => expect(mocks.patchFollowUp).toHaveBeenCalledWith(item.id, { operation: 'EDIT', expectedRevision: 1, note: '😀'.repeat(1000), dueDate: item.dueDate }));
  });
  it('completes with optional result and makes completed items read only', async () => {
    mocks.listFollowUps.mockResolvedValue({ data: [{ ...item, status: 'COMPLETED', completionNote: 'منجز', alertState: 'NONE', completedAt: '2026-09-30T10:00:00Z' }], page: { limit: 25, nextCursor: null, total: 1 } });
    renderPage(); await screen.findByText('منجز'); expect(screen.queryByRole('button', { name: 'إكمال الإجراء' })).toBeNull(); expect(screen.getByText('هذه المتابعة مكتملة وللقراءة فقط.')).toBeTruthy();
  });
});
