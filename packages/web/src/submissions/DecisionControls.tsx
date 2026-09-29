import { useRef, useState } from 'react';
import { ApiRequestError, decideSubmission, type SubmissionDecisionAction, type SubmissionDecisionResult, type SubmissionDecisionStatus, type SubmissionStatus } from '../auth/client';
import { Button, Dialog, ErrorState, SuccessState } from '../ui';
import { getAvailableDecisionActions } from './decision-policy';
import './decision-controls.css';

type Props = {
  submissionId: string;
  status: SubmissionStatus;
  potentialDuplicateCount?: number;
  onDecisionSuccess?: (result: SubmissionDecisionResult) => void;
  onRefresh?: () => void | Promise<void>;
};

const actionLabels: Record<SubmissionDecisionAction, string> = {
  ACCEPT: 'قبول الطلب',
  REJECT: 'رفض الطلب',
  INTERNAL_REVIEW: 'إحالة إلى المراجعة الداخلية',
};

const statusLabels: Record<SubmissionDecisionResult['status'], string> = {
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  INTERNAL_REVIEW: 'قيد المراجعة الداخلية',
};

const confirmationCopy: Record<SubmissionDecisionAction, { title: string; description: string; consequence: string }> = {
  ACCEPT: {
    title: 'تأكيد قبول الطلب',
    description: 'سيُنشأ سجل الأستاذ عند نجاح القرار.',
    consequence: 'أسماء المؤسسات المعلنة لا تُعتمد تلقائيًا، ولا تُنشأ مؤسسة أو إسنادات.',
  },
  REJECT: {
    title: 'تأكيد رفض الطلب',
    description: 'ستصبح حالة الطلب مرفوضًا بعد نجاح التأكيد.',
    consequence: '',
  },
  INTERNAL_REVIEW: {
    title: 'تأكيد الإحالة للمراجعة الداخلية',
    description: 'سيبقى الطلب للمتابعة الإضافية من المفتش، وهذه ليست حالة نهائية.',
    consequence: 'لا تُضاف ملاحظة للمراجعة الداخلية.',
  },
};

function errorPresentation(error: unknown): { title: string; description: string; conflict: boolean } {
  if (error instanceof ApiRequestError && error.status === 409) {
    return {
      title: 'تغيّرت حالة الطلب',
      description: 'تغيّرت حالة الطلب منذ تحميله. أعد تحميله قبل اتخاذ قرار جديد.',
      conflict: true,
    };
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return { title: 'الطلب غير متاح', description: 'تعذر الوصول إلى الطلب ضمن النطاق المصرح به.', conflict: false };
  }
  if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
    return { title: 'تعذر إكمال القرار', description: 'تحقق من جلسة الدخول وصلاحية الوصول ثم أعد المحاولة.', conflict: false };
  }
  if (error instanceof ApiRequestError && error.status === 400) {
    return { title: 'تعذر التحقق من القرار', description: 'أعد تحميل الطلب وحاول مرة أخرى.', conflict: false };
  }
  return { title: 'تعذر إكمال القرار', description: 'تحقق من الاتصال وحاول مرة أخرى.', conflict: false };
}

export function TeacherSubmissionDecisionControls({
  submissionId,
  status,
  potentialDuplicateCount = 0,
  onDecisionSuccess,
  onRefresh,
}: Props) {
  const [result, setResult] = useState<SubmissionDecisionResult>();
  const [selectedAction, setSelectedAction] = useState<SubmissionDecisionAction>();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof errorPresentation>>();
  const requestInFlight = useRef(false);
  const effectiveStatus = result?.status ?? status;
  const actions = failure?.conflict ? [] : getAvailableDecisionActions(effectiveStatus);
  const expectedStatus: SubmissionDecisionStatus | undefined =
    effectiveStatus === 'PENDING' || effectiveStatus === 'INTERNAL_REVIEW' ? effectiveStatus : undefined;
  const copy = selectedAction ? confirmationCopy[selectedAction] : undefined;

  async function confirmDecision() {
    if (!selectedAction || !expectedStatus || requestInFlight.current || !actions.includes(selectedAction)) return;
    requestInFlight.current = true;
    setPending(true);
    setFailure(undefined);
    try {
      const response = await decideSubmission({ id: submissionId, action: selectedAction, expectedStatus });
      setResult(response.data);
      setSelectedAction(undefined);
      onDecisionSuccess?.(response.data);
    } catch (error) {
      const presentation = errorPresentation(error);
      setFailure(presentation);
      if (presentation.conflict) setSelectedAction(undefined);
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  function closeDialog() {
    if (!pending) setSelectedAction(undefined);
  }

  async function refreshAfterConflict() {
    if (!onRefresh) return;
    try {
      await onRefresh();
      setFailure(undefined);
    } catch {
      setFailure({
        title: 'تعذر تحديث الطلب',
        description: 'تعذر تحميل أحدث حالة. أعد المحاولة قبل اتخاذ قرار.',
        conflict: true,
      });
    }
  }

  if (actions.length === 0 && !failure && !result) return null;

  return (
    <section aria-label="إجراءات مراجعة الطلب" className="submission-decision">
      {potentialDuplicateCount > 0 ? (
        <p className="submission-decision__advisory" role="status">
          <strong>تنبيه للمراجعة:</strong> توجد طلبات مشابهة محتملة. راجعها قبل تأكيد القرار.
        </p>
      ) : null}

      {failure ? (
        <ErrorState
          action={failure.conflict && onRefresh ? <Button variant="secondary" onClick={() => void refreshAfterConflict()}>إعادة تحميل الطلب</Button> : undefined}
          description={failure.description}
          title={failure.title}
        />
      ) : null}

      {result ? (
        <SuccessState title={`تم تحديث حالة الطلب: ${statusLabels[result.status]}`}>
          <p>يمكن تحديث تفاصيل الطلب لعرض أحدث البيانات.</p>
          {onRefresh ? <Button variant="secondary" onClick={onRefresh}>تحديث التفاصيل</Button> : null}
        </SuccessState>
      ) : null}

      {actions.length > 0 ? (
        <div aria-label="القرار المتاح" className="submission-decision__actions">
          {actions.map((action) => (
            <Button
              key={action}
              onClick={() => { setFailure(undefined); setSelectedAction(action); }}
              variant={action === 'REJECT' ? 'danger' : action === 'ACCEPT' ? 'primary' : 'secondary'}
            >
              {actionLabels[action]}
            </Button>
          ))}
        </div>
      ) : null}

      {selectedAction && copy ? (
        <Dialog
          actions={(
            <>
              <Button disabled={pending} onClick={closeDialog} variant="secondary">إلغاء</Button>
              <Button aria-busy={pending} disabled={pending} onClick={() => void confirmDecision()} variant={selectedAction === 'REJECT' ? 'danger' : 'primary'}>
                {pending ? 'جارٍ تنفيذ القرار…' : 'تأكيد القرار'}
              </Button>
            </>
          )}
          description={copy.description}
          onCancel={(event) => {
            if (pending) event.preventDefault();
            else setSelectedAction(undefined);
          }}
          onClose={closeDialog}
          open
          title={copy.title}
        >
          <div aria-busy={pending}>
            {copy.consequence ? <p>{copy.consequence}</p> : null}
            {potentialDuplicateCount > 0 ? (
              <p className="submission-decision__dialog-advisory" role="status">
                توجد طلبات مشابهة محتملة. راجعها قبل تأكيد القرار.
              </p>
            ) : null}
            {pending ? <p aria-live="polite" role="status">جارٍ إرسال القرار…</p> : null}
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
