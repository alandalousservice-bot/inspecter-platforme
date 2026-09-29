import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, type SubmissionDecisionResult, type SubmissionStatus } from '../auth/client';
import { TeacherSubmissionDecisionControls } from './DecisionControls';

const { decideSubmission } = vi.hoisted(() => ({ decideSubmission: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/client')>(),
  decideSubmission,
}));

let showModalDescriptor: PropertyDescriptor | undefined;
let closeDescriptor: PropertyDescriptor | undefined;
let focusedBeforeDialog: HTMLElement | null = null;

beforeEach(() => {
  showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      focusedBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.open = true;
      this.querySelector('button')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
      focusedBeforeDialog?.focus();
    },
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'close', closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

function renderControls(status: SubmissionStatus = 'PENDING', options: {
  potentialDuplicateCount?: number;
  onDecisionSuccess?: (result: SubmissionDecisionResult) => void;
  onRefresh?: () => void;
} = {}) {
  return render(<TeacherSubmissionDecisionControls submissionId="submission-1" status={status} {...options} />);
}

function openAction(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

describe('TASK-033 reusable decision controls', () => {
  it('keeps the confirmation dialog open under React Strict Mode effect replay', () => {
    render(
      <StrictMode>
        <TeacherSubmissionDecisionControls submissionId="submission-1" status="PENDING" />
      </StrictMode>,
    );

    openAction('قبول الطلب');
    expect(screen.getByRole('dialog', { name: 'تأكيد قبول الطلب' })).toBeTruthy();
  });

  it('presents only the documented actions for each status', () => {
    const { rerender } = renderControls('PENDING');
    expect(screen.getByRole('button', { name: 'قبول الطلب' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'رفض الطلب' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إحالة إلى المراجعة الداخلية' })).toBeTruthy();

    rerender(<TeacherSubmissionDecisionControls submissionId="submission-1" status="INTERNAL_REVIEW" />);
    expect(screen.getByRole('button', { name: 'قبول الطلب' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'رفض الطلب' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'إحالة إلى المراجعة الداخلية' })).toBeNull();

    rerender(<TeacherSubmissionDecisionControls submissionId="submission-1" status="ACCEPTED" />);
    expect(screen.queryByRole('region', { name: 'إجراءات مراجعة الطلب' })).toBeNull();
    rerender(<TeacherSubmissionDecisionControls submissionId="submission-1" status="REJECTED" />);
    expect(screen.queryByRole('region', { name: 'إجراءات مراجعة الطلب' })).toBeNull();
  });

  it('confirms acceptance with its Teacher and institution/assignment consequences', async () => {
    decideSubmission.mockResolvedValue({ data: { id: 'submission-1', status: 'ACCEPTED' } });
    const onDecisionSuccess = vi.fn();
    renderControls('PENDING', { onDecisionSuccess });
    openAction('قبول الطلب');

    const dialog = screen.getByRole('dialog', { name: 'تأكيد قبول الطلب' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(dialog.textContent).toContain('سيُنشأ سجل الأستاذ');
    expect(dialog.textContent).toContain('لا تُعتمد تلقائيًا');
    expect(dialog.textContent).toContain('لا تُنشأ مؤسسة أو إسنادات');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'إلغاء' }));

    fireEvent.click(screen.getByRole('button', { name: 'تأكيد القرار' }));
    await waitFor(() => expect(decideSubmission).toHaveBeenCalledWith({ id: 'submission-1', action: 'ACCEPT', expectedStatus: 'PENDING' }));
    expect(onDecisionSuccess).toHaveBeenCalledWith({ id: 'submission-1', status: 'ACCEPTED' });
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('مقبول'));
    expect(screen.queryByRole('button', { name: 'قبول الطلب' })).toBeNull();
  });

  it('rejects without a reason field and cancellation sends no request', () => {
    renderControls();
    const trigger = screen.getByRole('button', { name: 'رفض الطلب' });
    trigger.focus();
    openAction('رفض الطلب');
    expect(screen.getByRole('dialog', { name: 'تأكيد رفض الطلب' }).textContent).toContain('ستصبح حالة الطلب مرفوضًا');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/سبب للرفض/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(decideSubmission).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('allows Escape cancellation when idle and returns focus without submitting', () => {
    renderControls();
    const trigger = screen.getByRole('button', { name: 'إحالة إلى المراجعة الداخلية' });
    trigger.focus();
    openAction('إحالة إلى المراجعة الداخلية');
    const dialog = screen.getByRole('dialog', { name: 'تأكيد الإحالة للمراجعة الداخلية' });
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(decideSubmission).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('confirms internal review as a non-final follow-up with no note', async () => {
    decideSubmission.mockResolvedValue({ data: { id: 'submission-1', status: 'INTERNAL_REVIEW' } });
    renderControls();
    openAction('إحالة إلى المراجعة الداخلية');
    expect(screen.getByRole('dialog', { name: 'تأكيد الإحالة للمراجعة الداخلية' }).textContent).toContain('ليست حالة نهائية');
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد القرار' }));
    await waitFor(() => expect(decideSubmission).toHaveBeenCalledWith({ id: 'submission-1', action: 'INTERNAL_REVIEW', expectedStatus: 'PENDING' }));
    expect(screen.getByRole('button', { name: 'قبول الطلب' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'رفض الطلب' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'إحالة إلى المراجعة الداخلية' })).toBeNull();
  });

  it('shows a neutral advisory without disabling actions or adding merge/confidence controls', () => {
    renderControls('PENDING', { potentialDuplicateCount: 2 });
    expect(screen.getByRole('status').textContent).toContain('توجد طلبات مشابهة محتملة');
    expect(screen.getByRole('button', { name: 'قبول الطلب' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'رفض الطلب' })).toBeTruthy();
    expect(screen.queryByText(/%|نسبة ثقة|دمج/)).toBeNull();
    expect(screen.queryByRole('button', { name: /دمج|توصية/ })).toBeNull();
  });

  it('announces pending state and prevents repeated confirmation requests', async () => {
    let resolveRequest!: (value: { data: SubmissionDecisionResult }) => void;
    decideSubmission.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    renderControls();
    openAction('قبول الطلب');
    const confirm = screen.getByRole('button', { name: 'تأكيد القرار' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(decideSubmission).toHaveBeenCalledTimes(1);
    const pendingDialog = screen.getByRole('dialog', { name: 'تأكيد قبول الطلب' });
    const escapeEvent = new Event('cancel', { bubbles: true, cancelable: true });
    fireEvent(pendingDialog, escapeEvent);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog', { name: 'تأكيد قبول الطلب' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('جارٍ إرسال القرار');
    expect((screen.getByRole('button', { name: 'جارٍ تنفيذ القرار…' }) as HTMLButtonElement).disabled).toBe(true);
    resolveRequest({ data: { id: 'submission-1', status: 'ACCEPTED' } });
    await screen.findByText(/تم تحديث حالة الطلب/);
    expect(decideSubmission).toHaveBeenCalledTimes(1);
  });

  it('handles 409 neutrally, offers refresh, and does not retry automatically', async () => {
    decideSubmission.mockRejectedValue(new ApiRequestError('private transaction details', undefined, 409));
    const onRefresh = vi.fn();
    renderControls('PENDING', { onRefresh });
    openAction('رفض الطلب');
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد القرار' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('تغيّرت حالة الطلب منذ تحميله'));
    expect(screen.queryByText(/private transaction details/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'قبول الطلب' })).toBeNull();
    expect(decideSubmission).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة تحميل الطلب' }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(decideSubmission).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['validation', new ApiRequestError('raw validation detail', undefined, 400)],
    ['unavailable', new ApiRequestError('raw scoped detail', undefined, 404)],
    ['server', new ApiRequestError('raw server detail', undefined, 500)],
    ['network', new Error('socket path and private detail')],
  ])('maps %s errors to safe feedback', async (_kind, error) => {
    decideSubmission.mockRejectedValue(error);
    renderControls();
    openAction('رفض الطلب');
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد القرار' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/raw validation detail|raw scoped detail|raw server detail|socket path/)).toBeNull();
  });
});
