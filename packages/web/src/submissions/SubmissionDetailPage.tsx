import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Card, CardContent, EmptyState, ErrorState, LoadingState, PageHeader, FormSection, WorkspaceStack, StatusBadge } from '../ui';
import { getSubmission, type DuplicateReason, type PotentialDuplicate, type SubmissionDetail, type SubmissionStatus } from '../auth/client';
import { TeacherSubmissionDecisionControls } from './DecisionControls';
import { InstitutionLocationProposalReview } from './InstitutionLocationProposalReview';
import './submissions.css';

const statusLabels: Record<SubmissionStatus, string> = {
  PENDING: 'قيد الانتظار', INTERNAL_REVIEW: 'قيد المراجعة الداخلية', ACCEPTED: 'مقبول', REJECTED: 'مرفوض',
};
const reasonLabels: Record<DuplicateReason, string> = {
  SAME_PHONE: 'تطابق رقم الهاتف',
  SAME_EMAIL: 'تطابق البريد الإلكتروني',
  SAME_NAME_AND_DOB: 'تطابق الاسم واللقب وتاريخ الميلاد',
};
const professionalStatusLabels: Record<string, string> = {
  PERMANENT: 'مرسم', TRAINEE: 'متربص', CONTRACT: 'متعاقد', TEMPORARY_CONTRACT: 'متعاقد مؤقت', SUBSTITUTE: 'مستخلف',
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'medium' }).format(parsed);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="submission-fact"><dt>{label}</dt><dd><bdi dir="auto">{children || '—'}</bdi></dd></div>;
}

function CandidateCard({ candidate }: { candidate: PotentialDuplicate }) {
  return (
    <Card className="submission-candidate">
      <CardContent>
        <h3><Link to={`/app/submissions/${encodeURIComponent(candidate.id)}`}>{candidate.firstName} {candidate.lastName}</Link></h3>
        <dl className="submission-facts">
          <Fact label="تاريخ الميلاد">{formatDate(candidate.dateOfBirth)}</Fact>
          <Fact label="مكان الميلاد">{candidate.placeOfBirth}</Fact>
          <Fact label="الحالة">{statusLabels[candidate.status]}</Fact>
          <Fact label="تاريخ الإرسال">{formatDate(candidate.submittedAt)}</Fact>
        </dl>
        <div className="submission-reasons">
          <h4>أسباب التشابه</h4>
          <ul>{candidate.matchReasons.map((reason) => <li key={reason}>{reasonLabels[reason]}</li>)}</ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function SubmissionDetailPage() {
  const { id = '' } = useParams();
  const [submission, setSubmission] = useState<SubmissionDetail>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const refreshSubmission = useCallback(async () => {
    const { data } = await getSubmission(id);
    setSubmission(data);
    setFailed(false);
    setRefreshFailed(false);
  }, [id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setRefreshFailed(false);
    setSubmission(undefined);
    void getSubmission(id)
      .then(({ data }) => { if (active) setSubmission(data); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const profile = submission?.submittedProfile;

  return (
    <div className="submission-detail-page" dir="rtl">
      <WorkspaceStack density="operational">
      <PageHeader variant="compact" title={profile ? `${profile.firstName} ${profile.lastName}` : 'تفاصيل الطلب'}
        breadcrumbs={[{ label: 'طلبات الأساتذة', to: '/app/submissions' }, { label: 'تفاصيل الطلب' }]}
        backAction={!loading && !failed ? <Button variant="secondary" onClick={() => window.history.back()}>العودة للقائمة</Button> : undefined} />
      {loading ? <LoadingState compact label="جارٍ تحميل تفاصيل الطلب…" /> : null}
      {!loading && failed ? <ErrorState title="تعذر عرض الطلب" description="الطلب غير متاح ضمن نطاق الوصول أو تعذر تحميله." /> : null}
      {!loading && !failed && submission && profile ? (
        <>
          <div className="submission-review-context" aria-label="سياق مراجعة الطلب">
            <StatusBadge tone={submission.status === 'ACCEPTED' ? 'success' : submission.status === 'REJECTED' ? 'danger' : submission.status === 'INTERNAL_REVIEW' ? 'info' : 'warning'}>{statusLabels[submission.status]}</StatusBadge>
            <span>أُرسل في <time dateTime={submission.submittedAt}><bdi>{formatDate(submission.submittedAt)}</bdi></time></span>
            <span>{submission.status === 'ACCEPTED' || submission.status === 'REJECTED' ? 'قرار نهائي — الطلب للقراءة فقط' : 'تصريح وارد — بانتظار قرار المفتش'}</span>
          </div>
          {submission.status === 'ACCEPTED' && submission.acceptedTeacherId ? (
            <p><Link to={`/app/teachers/${encodeURIComponent(submission.acceptedTeacherId)}`}>فتح ملف الأستاذ</Link></p>
          ) : null}

          <FormSection title="البيانات المعلنة" description="البيانات الواردة من الاستمارة ولم تُتحقق هويتها بعد.">
              <dl className="submission-facts submission-facts--profile">
                <Fact label="الاسم واللقب">{profile.firstName} {profile.lastName}</Fact>
                <Fact label="تاريخ الميلاد">{formatDate(profile.dateOfBirth)}</Fact>
                <Fact label="مكان الميلاد">{profile.placeOfBirth}</Fact>
                <Fact label="رقم الهاتف"><bdi dir="ltr">{profile.phone}</bdi></Fact>
                <Fact label="البريد الإلكتروني"><bdi dir="ltr">{profile.email}</bdi></Fact>
                <Fact label="الصفة المهنية">{professionalStatusLabels[profile.professionalStatus] ?? 'غير محددة'}</Fact>
                <Fact label="تاريخ التوظيف">{formatDate(profile.employmentDate)}</Fact>
                {profile.confirmationDate ? <Fact label="تاريخ الترسيم/التثبيت">{formatDate(profile.confirmationDate)}</Fact> : null}
                {profile.qualifications ? <Fact label="المؤهلات">{profile.qualifications}</Fact> : null}
                {profile.notes ? <Fact label="ملاحظات المرسل">{profile.notes}</Fact> : null}
              </dl>
          </FormSection>
          <FormSection title="جهة العمل المصرح بها — غير معتمدة">
              <dl className="submission-facts submission-facts--profile">
                <Fact label="اسم المؤسسة">{submission.declaredWorkplace?.institutionName}</Fact>
                <Fact label="البلدية">{submission.declaredWorkplace?.municipality ?? 'غير متاحة'}</Fact>
                <Fact label="عنوان المؤسسة">{submission.declaredWorkplace?.institutionAddress ?? 'غير متاحة'}</Fact>
                <Fact label="هاتف المدير"><bdi dir="ltr">{submission.declaredWorkplace?.directorPhone ?? 'غير متاحة'}</bdi></Fact>
                <Fact label="البريد الإلكتروني للمؤسسة"><bdi dir="ltr">{submission.declaredWorkplace?.institutionEmail ?? 'غير مصرح به'}</bdi></Fact>
                {submission.declaredWorkplace?.legacyAdditionalInstitutionNames.length ? <Fact label="مؤسسات إضافية — تصريح تاريخي">{submission.declaredWorkplace.legacyAdditionalInstitutionNames.join('، ')}</Fact> : null}
              </dl>
          </FormSection>

          <section className="submission-candidates-section" aria-labelledby="potential-duplicates-title">
            <h2 id="potential-duplicates-title">طلبات مشابهة محتملة</h2>
            <p>هذه مؤشرات تشابه للمراجعة فقط، ولا تؤكد أن الطلبات تخص الشخص نفسه.</p>
            {submission.potentialDuplicates.length === 0 ? <EmptyState compact title="لا توجد طلبات مشابهة محتملة" /> : (
              <ul className="submission-candidate-list" aria-label="طلبات مشابهة محتملة">
                {submission.potentialDuplicates.map((candidate) => <li key={candidate.id}><CandidateCard candidate={candidate} /></li>)}
              </ul>
            )}
          </section>
          {refreshFailed ? <ErrorState title="تعذر تحديث التفاصيل" description="تم حفظ القرار، لكن تعذر تحميل أحدث حالة. استخدم تحديث التفاصيل للمحاولة مجددًا." /> : null}
          <TeacherSubmissionDecisionControls
            key={submission.id}
            submissionId={submission.id}
            status={submission.status}
            potentialDuplicateCount={submission.potentialDuplicates.length}
            onDecisionSuccess={() => { void refreshSubmission().catch(() => setRefreshFailed(true)); }}
            onRefresh={refreshSubmission}
          />
          <FormSection title="بيانات إدارية مصرح بها — غير معتمدة" description="تظهر هذه البيانات كما صرّح بها الأستاذ، وتخضع لمراجعة المفتش.">
              <dl className="submission-facts submission-facts--profile">
                <Fact label="ولاية الميلاد">{submission.declaredAdministrative.birthProvince ?? 'غير مصرح به'}</Fact>
                <Fact label="الإطار">{submission.declaredAdministrative.professionalFramework ?? 'غير مصرح به'}</Fact>
                <Fact label="تاريخ أول تعيين في التعليم">{submission.declaredAdministrative.firstEducationAppointmentDate ? formatDate(submission.declaredAdministrative.firstEducationAppointmentDate) : 'غير مصرح به'}</Fact>
                <Fact label="رقم قرار أول تعيين في التعليم">{submission.declaredAdministrative.firstEducationAppointmentDecisionNumber ?? 'غير مصرح به'}</Fact>
                <Fact label="تاريخ أول تنصيب">{submission.declaredAdministrative.firstInstallationDate ? formatDate(submission.declaredAdministrative.firstInstallationDate) : 'غير مصرح به'}</Fact>
                <Fact label="تاريخ التربص">{submission.declaredAdministrative.traineeshipDate ? formatDate(submission.declaredAdministrative.traineeshipDate) : 'غير مصرح به'}</Fact>
                <Fact label="تاريخ التعيين بالمؤسسة المصرح بها">{submission.declaredAdministrative.institutionAppointmentDate ? formatDate(submission.declaredAdministrative.institutionAppointmentDate) : 'غير مصرح به'}</Fact>
                <Fact label="رقم التعيين بالمؤسسة المصرح بها">{submission.declaredAdministrative.institutionAppointmentNumber ?? 'غير مصرح به'}</Fact>
                <Fact label="الصنف">{submission.declaredAdministrative.administrativeCategory ?? 'غير مصرح به'}</Fact>
                <Fact label="القسم الإداري">{submission.declaredAdministrative.administrativeSection ?? 'غير مصرح به'}</Fact>
                <Fact label="الدرجة">{submission.declaredAdministrative.administrativeGrade ?? 'غير مصرح به'}</Fact>
                <Fact label="تاريخ سريان التصنيف الإداري">{submission.declaredAdministrative.administrativeClassificationEffectiveDate ? formatDate(submission.declaredAdministrative.administrativeClassificationEffectiveDate) : 'غير مصرح به'}</Fact>
                <Fact label="العنوان الشخصي">{submission.declaredAdministrative.personalAddress ?? 'غير مصرح به'}</Fact>
              </dl>
          </FormSection>
          <FormSection title="مؤسسات تكملة النصاب المصرح بها — غير معتمدة" description="أوصاف تاريخية للمراجعة فقط؛ لا تمثل ارتباطات مؤسسات معتمدة.">
              {submission.supplementaryWorkplaces.length ? <ul className="submission-declaration-list">
                {submission.supplementaryWorkplaces.map((workplace, index) => <li key={index}>
                  <h3>{workplace.institutionName}</h3>
                  <dl className="submission-facts"><Fact label="البلدية">{workplace.municipality ?? 'غير مصرح به'}</Fact><Fact label="العنوان">{workplace.institutionAddress ?? 'غير مصرح به'}</Fact><Fact label="هاتف المدير"><bdi dir="ltr">{workplace.directorPhone ?? 'غير مصرح به'}</bdi></Fact></dl>
                </li>)}
              </ul> : <p>غير مصرح به</p>}
          </FormSection>

          <FormSection title="المؤهلات والشهادات المصرح بها — غير معتمدة" description="تبقى تصريحات للمراجعة؛ لا تُعرض كمؤهلات معتمدة في ملف الأستاذ.">
              {submission.structuredQualifications.length ? <ul className="submission-declaration-list">
                {submission.structuredQualifications.map((qualification, index) => <li key={index}>
                  <h3>{qualification.name}</h3>
                  <dl className="submission-facts"><Fact label="الجهة المانحة">{qualification.issuingBody ?? 'غير مصرح به'}</Fact><Fact label="التاريخ">{qualification.qualificationDate ? formatDate(qualification.qualificationDate) : 'غير مصرح به'}</Fact></dl>
                </li>)}
              </ul> : <p>غير مصرح به</p>}
          </FormSection>

          <InstitutionLocationProposalReview
            key={`${submission.id}-location-proposal`}
            submissionId={submission.id}
            proposal={submission.locationProposal}
            onRefresh={refreshSubmission}
          />
        </>
      ) : null}
      </WorkspaceStack>
    </div>
  );
}
