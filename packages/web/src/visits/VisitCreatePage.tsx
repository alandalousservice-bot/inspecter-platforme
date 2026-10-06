import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiRequestError, createPedagogicalVisit, getCurrentDistricts, getValidWorkplaces, type DistrictOption, type PedagogicalVisitType, type ScheduleWarningCode, type TeacherDirectoryItem, type ValidWorkplaceOption } from '../auth/client';
import { Button, Card, CardContent, CardHeader, Dialog, ErrorState, FormSection, Input, LoadingState, PageHeader } from '../ui';
import { TeacherPicker } from './VisitPickers';
import { visitTypeLabels } from './visit-type-labels';
import { localDateTimeToOffset } from './time';
import { ShellIcon } from '../ui/ShellIcon';
import './visits.css';

type CreatePayload = { teacherId: string; institutionId: string; academicYear: string; visitType: PedagogicalVisitType; scheduledStartAt: string; scheduledEndAt: string };
type WarningState = { code: ScheduleWarningCode; payload: CreatePayload } | { stale: true; payload: CreatePayload };
const warningText: Record<ScheduleWarningCode, string> = {
  VISIT_WEEKLY_SCHEDULE_MISSING: 'لا يوجد توزيع أسبوعي مسجل لهذا الأستاذ والسنة الدراسية.',
  VISIT_OUTSIDE_WEEKLY_SCHEDULE: 'الموعد لا يقع بالكامل ضمن التوزيع الأسبوعي المسجل.',
};

function validAcademicYear(value: string) { return /^\d{4}-\d{4}$/u.test(value) && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1; }

function readableError(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return 'تعذر الاتصال بالخدمة. أعد المحاولة.';
  const messages: Record<string, string> = {
    TEACHER_INACTIVE: 'الأستاذ غير نشط؛ لم تُنشأ الزيارة.',
    TENURE_ELIGIBILITY_REQUIRED: 'زيارة التثبيت غير متاحة: يلزم وضع مهني مؤهل وإتمام تكوين موثق للمتربص.',
    TEACHER_CURRENT_INSTITUTION_REQUIRED: 'لم تُعتمد مؤسسة حالية للأستاذ. راجع ملفه قبل التخطيط.',
    VISIT_WORKPLACE_UNAVAILABLE: 'المؤسسة الحالية غير متاحة للتخطيط. راجع ملف الأستاذ.',
    VISIT_OVERLAP_CONFLICT: 'يتعارض هذا الموعد مع زيارة أخرى. اختر فترة مختلفة.',
    NOT_FOUND: 'تعذر العثور على الأستاذ ضمن نطاق الوصول الحالي.',
    VALIDATION_ERROR: 'تحقق من السنة وموعد البداية والنهاية.',
  };
  return messages[error.code ?? ''] ?? 'تعذر إنشاء الزيارة. راجع البيانات ثم أعد المحاولة.';
}

export function VisitCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [districtLoading, setDistrictLoading] = useState(true);
  const [districtError, setDistrictError] = useState(false);
  const [districtId, setDistrictId] = useState('');
  const [teacher, setTeacher] = useState<TeacherDirectoryItem | null>(null);
  const [institutionId, setInstitutionId] = useState('');
  const [workplaces, setWorkplaces] = useState<ValidWorkplaceOption[]>([]);
  const [workplaceLoading, setWorkplaceLoading] = useState(false);
  const [workplaceError, setWorkplaceError] = useState(false);
  const [academicYear, setAcademicYear] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [selectedVisitType, setSelectedVisitType] = useState<PedagogicalVisitType | ''>('');
  const [exceptionalMode, setExceptionalMode] = useState<'SCHEDULED' | 'RETROSPECTIVE'>('SCHEDULED');
  const [institutionContextConfirmed, setInstitutionContextConfirmed] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<WarningState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { let active = true; setDistrictLoading(true);
    void getCurrentDistricts().then((items) => {
      if (!active) return; setDistricts(items); setDistrictError(false);
      if (items.length === 1) setDistrictId(items[0].id);
    }).catch(() => { if (active) { setDistricts([]); setDistrictError(true); } })
      .finally(() => { if (active) setDistrictLoading(false); });
    return () => { active = false; };
  }, []);

  const chooseTeacher = useCallback((value: TeacherDirectoryItem | null) => { setTeacher(value); setInstitutionId(''); setSelectedVisitType(''); setWarning(null); setFormError(''); }, []);
  useEffect(() => {
    const date = start.slice(0, 10);
    if (!teacher || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) { setWorkplaces([]); return undefined; }
    let active = true; setWorkplaceLoading(true); setWorkplaceError(false);
    void getValidWorkplaces(teacher.id, { date }).then(({ data }) => { if (active) setWorkplaces(data.items); })
      .catch(() => { if (active) { setWorkplaces([]); setWorkplaceError(true); } })
      .finally(() => { if (active) setWorkplaceLoading(false); });
    return () => { active = false; };
  }, [teacher?.id, start]);

  async function send(payload: CreatePayload, acknowledgement?: ScheduleWarningCode) {
    if (submitting) return;
    setSubmitting(true); setSaving(true); setFormError('');
    try {
      const result = await createPedagogicalVisit({ ...payload, ...(acknowledgement ? { scheduleWarningAcknowledgement: acknowledgement } : {}) });
      setWarning(null); navigate(`/app/visits/${encodeURIComponent(result.data.visit.id)}${location.search}`, { state: { success: 'تم إنشاء الزيارة.' } });
    } catch (error) {
      if (error instanceof ApiRequestError && (error.code === 'VISIT_WEEKLY_SCHEDULE_MISSING' || error.code === 'VISIT_OUTSIDE_WEEKLY_SCHEDULE')) {
        setWarning({ code: error.code, payload });
      } else if (error instanceof ApiRequestError && error.code === 'VISIT_SCHEDULE_CONTEXT_CHANGED') setWarning({ stale: true, payload });
      else { setWarning(null); setFormError(readableError(error)); }
    } finally { setSaving(false); setSubmitting(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setFormError('');
    if (!districtId || !teacher) { setFormError('اختر المقاطعة والأستاذ أولًا.'); return; }
    if (!institutionId) { setFormError('اختر مؤسسة صالحة في تاريخ بداية الزيارة.'); return; }
    if (!validAcademicYear(academicYear)) { setFormError('أدخل سنة دراسية صحيحة مثل 2026-2027.'); return; }
    if (!selectedVisitType) { setFormError('اختر نوع الزيارة.'); return; }
    if (selectedVisitType === 'EXCEPTIONAL' && exceptionalMode === 'RETROSPECTIVE') {
      const actualStart = localDateTimeToOffset(start); const actualEnd = localDateTimeToOffset(end);
      if (!actualStart || !actualEnd || Date.parse(actualStart) >= Date.parse(actualEnd) || Date.parse(actualEnd) > Date.now()) { setFormError('أدخل فترة فعلية صحيحة انتهت بالفعل.'); return; }
      if (!institutionContextConfirmed) { setFormError('أكد المؤسسة المختارة بوصفها مكان الزيارة وقت وقوعها.'); return; }
      void createPedagogicalVisit({ teacherId: teacher.id, institutionId, academicYear, visitType: 'EXCEPTIONAL', actualStartAt: actualStart, actualEndAt: actualEnd, institutionContextConfirmed: true })
        .then((result) => navigate(`/app/visits/${encodeURIComponent(result.data.visit.id)}${location.search}`, { state: { success: 'تم تسجيل الزيارة الاستثنائية السابقة.' } }))
        .catch((error: unknown) => setFormError(readableError(error)))
        .finally(() => setSaving(false));
      setSaving(true); return;
    }
    const startAt = localDateTimeToOffset(start); const endAt = localDateTimeToOffset(end);
    if (!startAt || !endAt) { setFormError('أدخل تاريخًا ووقتًا صالحين بتوقيت الجزائر.'); return; }
    if (Date.parse(startAt) >= Date.parse(endAt)) { setFormError('يجب أن يسبق موعد البداية موعد النهاية.'); return; }
    void send({ teacherId: teacher.id, institutionId, academicYear, visitType: selectedVisitType, scheduledStartAt: startAt, scheduledEndAt: endAt });
  }

  const canCreate = districts.length > 0 && !districtLoading && !districtError;
  const tenureAllowed = Boolean(teacher) && teacher?.professionalStatus !== 'CONTRACT'
    && (teacher?.professionalStatus !== 'TRAINEE' || (teacher?.trainingStatus === 'COMPLETED' && teacher?.trainingVerifiedAt));
  const warningDialog = warning;
  return <section className="visit-page" dir="rtl">
    <PageHeader title="زيارة جديدة" description="أدخل الموعد صراحةً. التوزيع الأسبوعي مرجع استشاري."
      breadcrumbs={[{ label: 'الزيارات التربوية', to: `/app/visits${location.search}` }, { label: 'زيارة جديدة' }]}
      backAction={<Link to={`/app/visits${location.search}`}>العودة إلى الزيارات</Link>} />
    {districtLoading ? <LoadingState label="جارٍ تحميل المقاطعات الحالية…" /> : null}
    {districtError ? <ErrorState title="تعذر تحميل المقاطعات" description="أعد المحاولة قبل التخطيط؛ لا يمكن اختيار مقاطعة يدويًا خارج النطاق." action={<Button variant="secondary" onClick={() => window.location.reload()}>إعادة المحاولة</Button>} /> : null}
    {!districtLoading && !districtError && districts.length === 0 ? <Card><CardContent><h2>لا توجد مقاطعة حالية متاحة</h2><p>لا يمكن إنشاء زيارة قبل توفر عضوية مقاطعة سارية.</p></CardContent></Card> : null}
    {canCreate ? <Card className="visit-card visit-card--create"><CardHeader title="بيانات الزيارة" description="يتحقق الخادم من صلاحية الأستاذ والمؤسسة والموعد عند الحفظ." action={<span className="visit-section-icon"><ShellIcon name="visits" /></span>} /><CardContent>
      <FormSection title="بيانات الزيارة"><form className="visit-form" onSubmit={submit} aria-busy={saving}>
        {districts.length === 1 ? <div className="visit-field"><span className="ui-field__label">المقاطعة</span><p>{districts[0].name}</p></div> : <div className="visit-field"><label className="ui-field__label" htmlFor="visit-create-district">المقاطعة <span aria-hidden="true">*</span></label><select id="visit-create-district" className="ui-input" required value={districtId} disabled={saving} aria-describedby={formError ? 'visit-create-error' : undefined} onChange={(event) => { setDistrictId(event.currentTarget.value); setTeacher(null); setWarning(null); setFormError(''); }}><option value="">اختر المقاطعة</option>{districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></div>}
        {districtId ? <TeacherPicker districtId={districtId} selected={teacher} onSelect={chooseTeacher} disabled={saving} errorDescriptionId={formError ? 'visit-create-error' : undefined} /> : null}
        {teacher?.currentInstitution ? <p className="visit-inline-note">المؤسسة الأم الحالية: {teacher.currentInstitution.name}{teacher.currentInstitution.municipality ? ` — ${teacher.currentInstitution.municipality}` : ''}</p>
          : teacher ? <p className="visit-inline-note">لم تُعتمد مؤسسة حالية لهذا الأستاذ. <Link to={`/app/teachers/${encodeURIComponent(teacher.id)}`}>مراجعة ملف الأستاذ</Link></p> : null}
        {teacher ? <p><Link to={`/app/teachers/${encodeURIComponent(teacher.id)}/schedules`}>عرض التوزيع الأسبوعي للأستاذ</Link></p> : null}
        <Input id="visit-academic-year" label="السنة الدراسية" required value={academicYear} onChange={(event) => { setAcademicYear(event.currentTarget.value); setWarning(null); }} hint="أدخلها صراحةً بصيغة YYYY-YYYY، مثل 2026-2027." aria-describedby={formError ? 'visit-create-error' : undefined} />
        <div className="visit-field"><label className="ui-field__label" htmlFor="visit-create-type">نوع الزيارة <span aria-hidden="true">*</span></label><select id="visit-create-type" className="ui-input" required value={selectedVisitType} disabled={saving} aria-describedby={formError ? 'visit-create-error' : undefined} onChange={(event) => { setSelectedVisitType(event.currentTarget.value as PedagogicalVisitType | ''); setExceptionalMode('SCHEDULED'); setInstitutionContextConfirmed(false); setWarning(null); setFormError(''); }}><option value="">اختر نوع الزيارة</option>{Object.entries(visitTypeLabels).filter(([value]) => value !== 'TENURE_CONFIRMATION' || tenureAllowed).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {selectedVisitType === 'EXCEPTIONAL' ? <div className="visit-field"><label className="ui-field__label" htmlFor="visit-exceptional-mode">طريقة تسجيل الزيارة الاستثنائية</label><select id="visit-exceptional-mode" className="ui-input" value={exceptionalMode} disabled={saving} onChange={(event) => { setExceptionalMode(event.currentTarget.value as 'SCHEDULED' | 'RETROSPECTIVE'); setWarning(null); setInstitutionContextConfirmed(false); }}><option value="SCHEDULED">زيارة مجدولة</option><option value="RETROSPECTIVE">تسجيل زيارة وقعت سابقًا</option></select></div> : null}
        <Input id="visit-start" label={selectedVisitType === 'EXCEPTIONAL' && exceptionalMode === 'RETROSPECTIVE' ? 'بداية الفترة الفعلية — توقيت الجزائر' : 'بداية الزيارة — توقيت الجزائر'} type="datetime-local" required value={start} onChange={(event) => { setStart(event.currentTarget.value); setInstitutionId(''); setWarning(null); }} aria-describedby={formError ? 'visit-create-error' : undefined} />
        <Input id="visit-end" label={selectedVisitType === 'EXCEPTIONAL' && exceptionalMode === 'RETROSPECTIVE' ? 'نهاية الفترة الفعلية — توقيت الجزائر' : 'نهاية الزيارة — توقيت الجزائر'} type="datetime-local" required value={end} onChange={(event) => { setEnd(event.currentTarget.value); setWarning(null); }} aria-describedby={formError ? 'visit-create-error' : undefined} />
        {teacher ? <div className="visit-field"><label className="ui-field__label" htmlFor="visit-workplace">مؤسسة الزيارة</label><select id="visit-workplace" className="ui-input" required value={institutionId} disabled={saving || workplaceLoading || !start} onChange={(event) => { setInstitutionId(event.currentTarget.value); setWarning(null); }}><option value="">اختر مؤسسة صالحة لهذا التاريخ</option>{workplaces.map((place) => <option key={place.id} value={place.id}>{place.name}{place.municipality ? ` — ${place.municipality}` : ''} ({place.role === 'HOME' ? 'أم' : 'تكملة نصاب'})</option>)}</select>
          {workplaceLoading ? <p role="status">جارٍ تحميل المؤسسات الصالحة…</p> : null}{workplaceError ? <p role="alert">تعذر تحميل المؤسسات الصالحة لهذا التاريخ.</p> : null}{!workplaceLoading && !workplaceError && start && !workplaces.length ? <p>لا توجد مؤسسة معتمدة لهذا الأستاذ في التاريخ المحدد.</p> : null}</div> : null}
        {selectedVisitType === 'EXCEPTIONAL' && exceptionalMode === 'RETROSPECTIVE' ? <label className="visit-inline-note"><input type="checkbox" checked={institutionContextConfirmed} disabled={saving || !institutionId} onChange={(event) => setInstitutionContextConfirmed(event.currentTarget.checked)} /> أؤكد المؤسسة المختارة بوصفها مكان الزيارة وقت وقوعها</label> : null}
        {start && end && start.slice(0, 10) !== end.slice(0, 10) ? <p role="status">يمتد الموعد إلى تاريخ آخر؛ سيظهر تاريخ البداية والنهاية كاملين.</p> : null}
        {formError ? <p id="visit-create-error" className="visit-error" role="alert">{formError}</p> : null}
        <Button type="submit" disabled={saving || !districtId || !teacher || !institutionId || !selectedVisitType}>{saving ? 'جارٍ إنشاء الزيارة…' : 'إنشاء الزيارة'}</Button>
      </form></FormSection>
    </CardContent></Card> : null}
    <Dialog open={Boolean(warningDialog)} title={warningDialog && 'stale' in warningDialog ? 'تغيّر التوزيع الأسبوعي' : 'تنبيه الجدول الأسبوعي'}
      description={warningDialog && 'stale' in warningDialog ? 'تغير سياق التوزيع بعد التنبيه السابق. أعد فحص الموعد ثم قرر من جديد.' : warningDialog ? warningText[warningDialog.code] : undefined}
      onClose={() => { if (!saving) setWarning(null); }} onCancel={(event) => { if (saving) event.preventDefault(); else setWarning(null); }}
      actions={<><Button variant="secondary" disabled={saving} onClick={() => setWarning(null)}>العودة للتعديل</Button>
        {warningDialog ? <Button disabled={saving} onClick={() => {
          if ('stale' in warningDialog) void send(warningDialog.payload);
          else void send(warningDialog.payload, warningDialog.code);
        }}>{saving ? 'جارٍ التحقق…' : warningDialog && 'stale' in warningDialog ? 'إعادة فحص الموعد' : 'متابعة مع هذا الموعد'}</Button> : null}</>}>
      <p>هذا تنبيه استشاري ولا يمنع التخطيط. سيعيد الخادم التحقق عند المتابعة.</p>
    </Dialog>
  </section>;
}
