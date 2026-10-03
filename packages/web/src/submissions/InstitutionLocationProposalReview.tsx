import { useRef, useState } from 'react';
import {
  ApiRequestError,
  decideInstitutionLocationProposal,
  type CanonicalInstitutionLocation,
  type SubmissionLocationProposal,
} from '../auth/client';
import { googleMapsDirectionsUrl } from '../institutions/google-maps-directions';
import { Button, Card, CardContent, CardHeader, Dialog, ErrorState } from '../ui';
import './institution-location-proposal-review.css';

type Action = 'ACCEPT_PROPOSED' | 'REJECT' | 'KEEP_CURRENT';
type Props = {
  submissionId: string;
  proposal: SubmissionLocationProposal | null;
  onRefresh: () => Promise<void>;
};

const statusLabels = {
  PENDING: 'قيد مراجعة المفتش',
  ACCEPTED: 'تم اعتماد الموقع المقترح',
  REJECTED: 'تم رفض مقترح الموقع',
} as const;
const sourceLabels: Record<CanonicalInstitutionLocation['source'], string> = {
  MANUAL_INSPECTOR: 'مدخل يدويًا من طرف المفتش',
  TEACHER_PROPOSED_APPROVED: 'مقترح سابق تم اعتماده من طرف المفتش',
};

function Coordinate({ label, value }: { label: string; value: string }) {
  return <div className="location-proposal-coordinate"><dt>{label}</dt><dd><bdi dir="ltr">{value}</bdi></dd></div>;
}

function CoordinatePair({ latitude, longitude }: { latitude: string; longitude: string }) {
  return (
    <dl className="location-proposal-coordinates">
      <Coordinate label="خط العرض" value={latitude} />
      <Coordinate label="خط الطول" value={longitude} />
    </dl>
  );
}

export function InstitutionLocationProposalReview({ submissionId, proposal, onRefresh }: Props) {
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [staleNeedsRefresh, setStaleNeedsRefresh] = useState(false);
  const [decisionCommitted, setDecisionCommitted] = useState(false);
  const inFlight = useRef(false);
  const canonical = proposal?.institution?.location ?? null;
  const directionsUrl = googleMapsDirectionsUrl(canonical);

  if (!proposal) {
    return (
      <Card>
        <CardHeader title="موقع المؤسسة" />
        <CardContent><p>لم يقدّم الأستاذ إحداثيات لموقع المؤسسة.</p></CardContent>
      </Card>
    );
  }

  function openAction(action: Action) {
    if (pending || inFlight.current || staleNeedsRefresh || decisionCommitted) return;
    setFailure(null);
    if (action === 'ACCEPT_PROPOSED' && canonical === null) {
      void submitAction(action);
      return;
    }
    setSelectedAction(action);
  }

  async function submitAction(action: Action) {
    if (!proposal || proposal.status !== 'PENDING' || pending || inFlight.current || staleNeedsRefresh || decisionCommitted) return;
    const expectedCanonicalLocation: CanonicalInstitutionLocation | null = canonical;
    inFlight.current = true;
    setPending(true);
    setFailure(null);
    try {
      const decision = action === 'REJECT'
        ? { action: 'REJECT' as const }
        : action === 'KEEP_CURRENT'
          ? { action: 'KEEP_CURRENT' as const, expectedCanonicalLocation: expectedCanonicalLocation! }
          : { action: 'ACCEPT_PROPOSED' as const, expectedCanonicalLocation };
      await decideInstitutionLocationProposal({ id: submissionId, decision });
      setSelectedAction(null);
      setDecisionCommitted(true);
      try {
        await onRefresh();
      } catch {
        setFailure('أُرسل القرار، لكن تعذر تحميل أحدث الحالة. حدّث التفاصيل قبل اتخاذ أي إجراء آخر.');
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setSelectedAction(null);
        setStaleNotice(true);
        setStaleNeedsRefresh(true);
        try {
          await onRefresh();
          setStaleNeedsRefresh(false);
        } catch {
          setFailure('تعذر تحديث البيانات الحالية. أعد المحاولة قبل اتخاذ القرار.');
        }
      } else if (error instanceof ApiRequestError && error.status === 404) {
        setSelectedAction(null);
        setFailure('المؤسسة أو الطلب غير متاح ضمن نطاق الوصول. حدّث التفاصيل.');
      } else {
        setFailure('تعذر إكمال القرار. تحقق من الاتصال ثم راجع البيانات الحالية.');
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function refreshAfterFailure() {
    try {
      await onRefresh();
      setFailure(null);
      setStaleNeedsRefresh(false);
    } catch {
      setFailure('تعذر تحديث البيانات الحالية. أعد المحاولة قبل اتخاذ القرار.');
    }
  }

  const dialog = selectedAction ? {
    ACCEPT_PROPOSED: {
      title: 'تأكيد استبدال موقع المؤسسة',
      description: 'سيتم استبدال الإحداثيات المعتمدة حاليًا للمؤسسة بالإحداثيات المقترحة.',
      confirm: 'تأكيد اعتماد الموقع المقترح',
    },
    REJECT: {
      title: 'تأكيد رفض مقترح الموقع',
      description: 'سيتم رفض المقترح دون تغيير الموقع المعتمد للمؤسسة.',
      confirm: 'تأكيد الرفض',
    },
    KEEP_CURRENT: {
      title: 'تأكيد الاحتفاظ بالموقع الحالي',
      description: 'سيتم رفض المقترح والاحتفاظ بالموقع المعتمد حاليًا للمؤسسة.',
      confirm: 'تأكيد الاحتفاظ بالموقع الحالي',
    },
  }[selectedAction] : null;

  return (
    <Card className="location-proposal-review">
      <CardHeader title="مراجعة موقع المؤسسة المقترح" description="هذه الإحداثيات تخص موقع المؤسسة، ولا تدل على موقع الأستاذ أو المفتش أو الحضور." />
      <CardContent>
        <div className="location-proposal-review__status" role="status" aria-live="polite">
          <strong>{statusLabels[proposal.status]}</strong>
        </div>
        {proposal.institution ? (
          <p className="location-proposal-review__institution">
            المؤسسة المرتبطة: <strong>{proposal.institution.name}</strong>
            {proposal.institution.municipality ? ` — ${proposal.institution.municipality}` : ''}
          </p>
        ) : <p className="location-proposal-review__institution">لم تُربط مؤسسة معتمدة بهذا الطلب بعد.</p>}

        <section aria-labelledby="proposal-coordinates-title" className="location-proposal-review__location">
          <h3 id="proposal-coordinates-title">الموقع المقترح للمؤسسة</h3>
          <CoordinatePair latitude={proposal.latitude} longitude={proposal.longitude} />
        </section>

        <section aria-labelledby="canonical-coordinates-title" className="location-proposal-review__location">
          <h3 id="canonical-coordinates-title">الموقع المعتمد حاليًا للمؤسسة</h3>
          {canonical ? (
            <>
              <CoordinatePair latitude={canonical.latitude} longitude={canonical.longitude} />
              <p className="location-proposal-review__source">مصدر الموقع: {sourceLabels[canonical.source]}</p>
              {directionsUrl ? (
                <div className="location-proposal-review__directions">
                  <a className="ui-button ui-button--secondary" href={directionsUrl} rel="noopener noreferrer" target="_blank">
                    الاتجاه إلى المؤسسة
                  </a>
                  <p>سيُفتح Google Maps خارجيًا مع مشاركة موقع المؤسسة المعتمد كوجهة فقط.</p>
                </div>
              ) : null}
            </>
          ) : <p>لا يوجد موقع معتمد للمؤسسة حاليًا.</p>}
        </section>

        {proposal.status === 'REJECTED' && proposal.decisionReason === 'KEEP_CURRENT' ? (
          <p className="location-proposal-review__kept" role="status">تم الاحتفاظ بالموقع المعتمد للمؤسسة.</p>
        ) : null}

        {staleNotice ? <p className="location-proposal-review__notice" role="status">تم تحديث بيانات الموقع منذ فتح هذه الصفحة. راجع البيانات الحالية قبل اتخاذ القرار.</p> : null}
        {decisionCommitted && proposal.status === 'PENDING' ? <p role="status" aria-live="polite">جارٍ تحديث الحالة المعتمدة من الخادم…</p> : null}
        {failure ? <ErrorState action={<Button variant="secondary" onClick={() => void refreshAfterFailure()}>تحديث التفاصيل</Button>} description={failure} title="تعذر إكمال مراجعة الموقع" /> : null}

        {proposal.status === 'PENDING' ? (
          <div className="location-proposal-review__actions" aria-label="قرارات مقترح موقع المؤسسة">
            <Button disabled={pending || staleNeedsRefresh || decisionCommitted} onClick={() => openAction('ACCEPT_PROPOSED')} variant="primary">اعتماد الموقع المقترح</Button>
            <Button disabled={pending || staleNeedsRefresh || decisionCommitted} onClick={() => openAction('REJECT')} variant="danger">رفض المقترح</Button>
            {canonical ? <Button disabled={pending || staleNeedsRefresh || decisionCommitted} onClick={() => openAction('KEEP_CURRENT')} variant="secondary">الاحتفاظ بالموقع الحالي</Button> : null}
          </div>
        ) : null}

        {dialog ? (
          <Dialog
            actions={(
              <>
                <Button disabled={pending} onClick={() => setSelectedAction(null)} variant="secondary">إلغاء</Button>
                <Button aria-busy={pending} disabled={pending} onClick={() => void submitAction(selectedAction!)} variant={selectedAction === 'REJECT' ? 'danger' : 'primary'}>
                  {pending ? 'جارٍ تنفيذ القرار…' : dialog.confirm}
                </Button>
              </>
            )}
            description={dialog.description}
            onCancel={(event) => { if (pending) event.preventDefault(); else setSelectedAction(null); }}
            onClose={() => { if (!pending) setSelectedAction(null); }}
            open
            title={dialog.title}
          >
            <p>سيظل قرار المفتش مستقلًا عن تطابق الإحداثيات بين المقترح والموقع الحالي.</p>
          </Dialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
