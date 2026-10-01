import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { getTeacherInformationCard, type TeacherInformationCard } from '../auth/client';
import { Button, Card, CardContent, CardHeader, ErrorState, Input, LoadingState } from '../ui';
import { weekdays } from './weekly-schedule-domain';
import './teacher-information-card.css';

const statusLabels: Record<string, string> = {
  ACTIVE: 'نشط', INACTIVE: 'غير نشط', PERMANENT: 'مرسم', TRAINEE: 'متربص', CONTRACT: 'متعاقد',
  TEMPORARY_CONTRACT: 'متعاقد مؤقت', SUBSTITUTE: 'مستخلف',
};
const consistencyLabels: Record<string, string> = {
  INSTITUTION_ARCHIVED: 'المؤسسة مؤرشفة؛ يلزم مراجعة الحصة.',
  SUPPLEMENTARY_VALIDITY_CHANGED: 'فترة تكملة النصاب لا تغطي كامل فترة الحصة.',
  HOME_CHANGED: 'تغيرت المؤسسة الأم منذ تسجيل الحصة.',
};
const validAcademicYear = (value: string) => /^\d{4}-\d{4}$/u.test(value) && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
const unavailable = (value: string | null | undefined) => value || 'غير متوفر';
const displayDate = (value: string | null | undefined) => value || 'غير متوفر';
const displayTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="teacher-card__fact"><dt>{label}</dt><dd dir="auto">{unavailable(value)}</dd></div>;
}

export function TeacherInformationCardPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [yearDraft, setYearDraft] = useState(params.get('academicYear') ?? '');
  const [card, setCard] = useState<TeacherInformationCard>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedYear = params.get('academicYear') ?? '';
  const yearValid = validAcademicYear(selectedYear);

  useEffect(() => setYearDraft(selectedYear), [selectedYear]);
  useEffect(() => {
    let active = true;
    setCard(undefined);
    setLoadError(false);
    if (!yearValid) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    void getTeacherInformationCard(id, selectedYear).then(({ data }) => {
      if (active) setCard(data.card);
    }).catch(() => {
      if (active) { setCard(undefined); setLoadError(true); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, selectedYear, yearValid, refreshKey]);

  function changeYear(event: ChangeEvent<HTMLInputElement>) {
    setYearDraft(event.currentTarget.value);
  }

  function submitYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validAcademicYear(yearDraft)) return;
    const next = new URLSearchParams(params);
    next.set('academicYear', yearDraft);
    setParams(next, { replace: true });
  }

  const schedulePath = `/app/teachers/${encodeURIComponent(id)}/schedules?academicYear=${encodeURIComponent(selectedYear)}`;

  return <main className="teacher-card" dir="rtl">
    <nav aria-label="مسار التنقل"><Link to="/app/teachers">دليل الأساتذة</Link><span aria-hidden="true"> / </span><Link to={`/app/teachers/${encodeURIComponent(id)}`}>ملف الأستاذ</Link><span aria-hidden="true"> / </span>بطاقة معلومات الأستاذ</nav>
    <header className="teacher-card__heading"><p>عرض خاص بالمفتش</p><h1>بطاقة معلومات الأستاذ</h1>
      {card ? <p className="teacher-card__name">{card.teacher.name} {card.teacher.surname}</p> : null}
    </header>
    <Card><CardHeader title="السنة الدراسية" description="اختر السنة صراحةً لعرض التوزيع الأسبوعي المرتبط بها." /><CardContent>
      <form className="teacher-card__year-form" onSubmit={submitYear}>
        <Input id="teacher-card-academic-year" label="السنة الدراسية" placeholder="2026-2027" value={yearDraft} onChange={changeYear}
          hint="أدخل سنتين متتاليتين بصيغة YYYY-YYYY؛ لا تُختار السنة تلقائيًا."
          error={yearDraft && !validAcademicYear(yearDraft) ? 'تحقق من الصيغة وأن تكون السنتان متتاليتين.' : undefined} />
        <Button type="submit" disabled={!validAcademicYear(yearDraft)}>عرض البطاقة</Button>
      </form>
    </CardContent></Card>
    {!yearValid ? <p className="teacher-card__hint" role="status">أدخل سنة دراسية صحيحة لعرض البطاقة.</p> : null}
    {loading ? <LoadingState label="جارٍ تحميل بطاقة معلومات الأستاذ…" /> : null}
    {!loading && loadError ? <ErrorState title="تعذر عرض بطاقة المعلومات" description="البطاقة غير متاحة ضمن نطاق الوصول أو تعذر تحميلها." action={<Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>إعادة المحاولة</Button>} /> : null}
    {!loading && !loadError && card ? <>
      <p className="teacher-card__as-of">الحالة المعروضة بتاريخ {card.asOfDate} — السنة الدراسية {card.academicYear}</p>
      <Card><CardHeader title="الهوية والمعلومات الشخصية" /><CardContent><dl className="teacher-card__facts">
        <Fact label="الاسم" value={card.teacher.name} /><Fact label="اللقب" value={card.teacher.surname} />
        <Fact label="تاريخ الميلاد" value={displayDate(card.teacher.birthDate)} /><Fact label="مكان الميلاد" value={card.teacher.placeOfBirth} />
        <Fact label="ولاية الميلاد" value={card.teacher.birthProvince} /><Fact label="العنوان الشخصي" value={card.teacher.personalAddress} />
        <Fact label="رقم الهاتف" value={card.teacher.phone} /><Fact label="البريد الإلكتروني الخاص" value={card.teacher.email} />
      </dl></CardContent></Card>
      <Card><CardHeader title="الوضعية المهنية والإدارية" /><CardContent><dl className="teacher-card__facts">
        <Fact label="الصفة المهنية" value={card.teacher.professionalStatus ? statusLabels[card.teacher.professionalStatus] ?? null : null} />
        <Fact label="الإطار" value={card.teacher.professionalFramework} /><Fact label="تاريخ التوظيف" value={card.teacher.employedAt} />
        <Fact label="تاريخ أول تعيين في التعليم" value={card.teacher.firstEducationAppointmentDate} />
        <Fact label="رقم قرار أول تعيين في التعليم" value={card.teacher.firstEducationAppointmentDecisionNumber} />
        <Fact label="تاريخ أول تنصيب" value={card.teacher.firstInstallationDate} /><Fact label="تاريخ التربص" value={card.teacher.traineeshipDate} />
        <Fact label="تاريخ الترسيم" value={card.teacher.confirmedAt} />
      </dl></CardContent></Card>
      <Card><CardHeader title="المؤسسة الأم" /><CardContent>
        {card.homeInstitution ? <><dl className="teacher-card__facts"><Fact label="المؤسسة" value={card.homeInstitution.name} />
          <Fact label="البلدية" value={card.homeInstitution.municipality} /><Fact label="البريد الإلكتروني للمؤسسة" value={card.homeInstitution.email} />
          <Fact label="تاريخ التعيين بالمؤسسة" value={card.homeInstitution.appointment.institutionAppointmentDate} />
          <Fact label="رقم التعيين بالمؤسسة" value={card.homeInstitution.appointment.institutionAppointmentNumber} />
          <Fact label="رقم تأشيرة المراقب المالي" value={card.homeInstitution.appointment.financialControllerVisaNumber} />
        </dl>{card.homeInstitution.archivedAt ? <p className="teacher-card__hint">مؤرشفة — ما زالت مرتبطة حاليًا بملف الأستاذ.</p> : null}</>
          : <p>لا توجد مؤسسة أم معتمدة</p>}
      </CardContent></Card>
      <Card><CardHeader title="مؤسسات تكملة النصاب الحالية" /><CardContent>
        {card.currentSupplementaryWorkplaces.length ? <ul className="teacher-card__list">{card.currentSupplementaryWorkplaces.map((item) => <li key={item.id}>
          <strong>{item.institution.name}</strong><span>{item.institution.municipality || 'البلدية غير متوفرة'}</span>
          <span>من {item.validFrom} إلى {item.validTo ?? 'مفتوحة'}</span>{item.institution.archivedAt ? <span>مؤرشفة</span> : null}
        </li>)}</ul> : <p>لا توجد تكملة نصاب حالية</p>}
      </CardContent></Card>
      <Card><CardHeader title="المؤهلات والشهادات" /><CardContent>
        {card.qualifications.items.length ? <ul className="teacher-card__list">{card.qualifications.items.map((item) => <li key={item.id}>
          <strong>{item.name}</strong><span>المصدر: {unavailable(item.issuingBody)}</span><span>التاريخ: {displayDate(item.qualificationDate)}</span>
        </li>)}</ul> : <p>لا توجد مؤهلات منظمة مسجلة.</p>}
        <section className="teacher-card__legacy"><h3>مؤهلات سابقة غير مفصلة</h3><p dir="auto">{card.qualifications.legacyText || 'غير متوفر'}</p></section>
      </CardContent></Card>
      <Card><CardHeader title="التصنيف الإداري" /><CardContent><dl className="teacher-card__facts">
        <Fact label="الصنف" value={card.teacher.administrativeCategory} /><Fact label="القسم الإداري" value={card.teacher.administrativeSection} />
        <Fact label="الدرجة" value={card.teacher.administrativeGrade} /><Fact label="تاريخ سريان التصنيف" value={card.teacher.administrativeClassificationEffectiveDate} />
      </dl></CardContent></Card>
      <Card><CardHeader title="آخر تفتيش والنقطة /20" /><CardContent><dl className="teacher-card__facts">
        <Fact label="تاريخ آخر تفتيش" value={card.inspectionSummary.lastInspectionDate} />
        <Fact label="النقطة البيداغوجية" value={card.inspectionSummary.pedagogicalMark === null ? null : `${card.inspectionSummary.pedagogicalMark} / 20`} />
      </dl></CardContent></Card>
      <Card><CardHeader title="التوزيع الأسبوعي الحالي" description={`السنة الدراسية ${card.weeklySchedule?.academicYear ?? card.academicYear}`} action={<Link to={schedulePath}>عرض التوزيع الأسبوعي الكامل</Link>} /><CardContent>
        {!card.weeklySchedule ? <p>لم يُسجَّل جدول لهذه السنة</p> : <>
          {weekdays.map((day, index) => {
            const dayNumber = index + 1;
            const current = card.weeklySchedule?.currentSlots.filter((slot) => slot.dayOfWeek === dayNumber) ?? [];
            const legacy = card.weeklySchedule?.legacyUnknownSlots.filter((slot) => slot.dayOfWeek === dayNumber) ?? [];
            if (!current.length && !legacy.length) return null;
            return <section className="teacher-card__day" key={day}><h3>{day}</h3><ul className="teacher-card__list">
              {current.map((slot) => <li key={slot.id}><strong>{displayTime(slot.startMinute)}–{displayTime(slot.endMinute)}</strong>
                <span>{slot.institution.name}{slot.institution.municipality ? ` — ${slot.institution.municipality}` : ''}</span>
                <span>{slot.validFrom} — {slot.validTo ?? 'مفتوحة'}</span>
                {slot.institution.archivedAt ? <span>المؤسسة مؤرشفة</span> : null}
                {slot.consistency.status === 'NEEDS_CORRECTION' ? <span className="teacher-card__warning" role="status">{consistencyLabels[slot.consistency.reasonCode ?? ''] ?? 'تحتاج هذه الحصة إلى مراجعة.'}</span> : null}
              </li>)}
              {legacy.map((slot) => <li key={slot.id}><strong>{displayTime(slot.startMinute)}–{displayTime(slot.endMinute)}</strong><span>موقع/فترة الحصة غير موثقين</span></li>)}
            </ul></section>;
          })}
          {!card.weeklySchedule.currentSlots.length && !card.weeklySchedule.legacyUnknownSlots.length ? <p>لا توجد حصص سارية مسجلة لهذه السنة.</p> : null}
        </>}
      </CardContent></Card>
      <Card><CardHeader title="معلومات إدارية إضافية" /><CardContent><p className="teacher-card__note" dir="auto">{card.teacher.administrativeNote || 'غير متوفر'}</p></CardContent></Card>
      <Card><CardHeader title="السياق الإداري" /><CardContent><dl className="teacher-card__facts">
        <Fact label="المقاطعة" value={card.organizationalContext.district.name} />
        <Fact label="المفتش" value={[card.organizationalContext.inspector?.name, card.organizationalContext.inspector?.surname].filter(Boolean).join(' ') || null} />
        <Fact label="السنة الدراسية" value={card.academicYear} />
      </dl></CardContent></Card>
      <nav className="teacher-card__actions" aria-label="روابط ملف الأستاذ"><Link to={`/app/teachers/${encodeURIComponent(id)}`}>العودة إلى ملف الأستاذ</Link><Link to={schedulePath}>التوزيع الأسبوعي</Link><Link to={`/app/teachers/${encodeURIComponent(id)}/information-card/print?academicYear=${encodeURIComponent(selectedYear)}`}>طباعة بطاقة المعلومات</Link></nav>
    </> : null}
  </main>;
}
