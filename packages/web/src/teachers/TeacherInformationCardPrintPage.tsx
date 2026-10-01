import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { getTeacherInformationCard, type TeacherInformationCard } from '../auth/client';
import { ErrorState, LoadingState } from '../ui';
import './teacher-information-card-print.css';

const statusLabels: Record<string, string> = {
  PERMANENT: 'مرسم', TRAINEE: 'متربص', CONTRACT: 'متعاقد', TEMPORARY_CONTRACT: 'متعاقد مؤقت', SUBSTITUTE: 'مستخلف',
};
const unavailable = 'غير متوفر';
const validAcademicYear = (value: string) => /^\d{4}-\d{4}$/u.test(value) && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
const valueOrUnavailable = (value: string | null | undefined) => value?.trim() || unavailable;

function Fact({ label, value, bidi = false }: { label: string; value: string | null | undefined; bidi?: boolean }) {
  return <div className="teacher-print__fact"><dt>{label}</dt><dd>{bidi ? <bdi dir="ltr">{valueOrUnavailable(value)}</bdi> : valueOrUnavailable(value)}</dd></div>;
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="teacher-print__facts">{children}</dl>;
}

function PrintDocument({ card }: { card: TeacherInformationCard }) {
  const teacher = card.teacher;
  const schedule = card.weeklySchedule;
  const correctionCount = schedule?.currentSlots.filter((slot) => slot.consistency.status === 'NEEDS_CORRECTION').length ?? 0;

  return <article className="teacher-print__document" lang="ar" dir="rtl" aria-label="بطاقة معلومات الأستاذ للطباعة">
    <header className="teacher-print__header">
      <div><h1>بطاقة معلومات الأستاذ</h1><p>السنة الدراسية: <bdi dir="ltr">{card.academicYear}</bdi></p><p>الحالة المعروضة بتاريخ: <bdi dir="ltr">{card.asOfDate}</bdi></p>
        <p>المقاطعة: {valueOrUnavailable(card.organizationalContext.district.name)}</p><p>المفتش: {valueOrUnavailable([card.organizationalContext.inspector?.name, card.organizationalContext.inspector?.surname].filter(Boolean).join(' ') || null)}</p>
      </div>
      <div className="teacher-print__photo" aria-label="موضع ورقي فارغ للصورة الشمسية">صورة شمسية</div>
    </header>

    <section className="teacher-print__section"><h2>المعلومات الشخصية</h2><Facts>
      <Fact label="اللقب" value={teacher.surname} /><Fact label="الاسم" value={teacher.name} />
      <Fact label="تاريخ الميلاد" value={teacher.birthDate} bidi /><Fact label="مكان الميلاد" value={teacher.placeOfBirth} />
      <Fact label="الولاية" value={teacher.birthProvince} /><Fact label="رقم الهاتف" value={teacher.phone} bidi />
      <Fact label="البريد الإلكتروني" value={teacher.email} bidi /><Fact label="العنوان الشخصي" value={teacher.personalAddress} />
    </Facts></section>

    <section className="teacher-print__section"><h2>الوضعية المهنية والإدارية</h2><Facts>
      <Fact label="الصفة المهنية" value={teacher.professionalStatus ? statusLabels[teacher.professionalStatus] : null} />
      <Fact label="الإطار" value={teacher.professionalFramework} /><Fact label="تاريخ التوظيف" value={teacher.employedAt} bidi />
      <Fact label="تاريخ الترسيم" value={teacher.confirmedAt} bidi />
      <Fact label="تاريخ أول تعيين في التعليم" value={teacher.firstEducationAppointmentDate} bidi />
      <Fact label="رقم قرار أول تعيين في التعليم" value={teacher.firstEducationAppointmentDecisionNumber} bidi />
      <Fact label="تاريخ أول تنصيب" value={teacher.firstInstallationDate} bidi /><Fact label="تاريخ التربص" value={teacher.traineeshipDate} bidi />
    </Facts></section>

    <section className="teacher-print__section"><h2>المؤسسة الأم</h2>
      {card.homeInstitution ? <><Facts>
        <Fact label="المؤسسة" value={card.homeInstitution.name} /><Fact label="البلدية" value={card.homeInstitution.municipality} />
        <Fact label="البريد الإلكتروني للمؤسسة" value={card.homeInstitution.email} bidi />
        <Fact label="تاريخ التعيين بالمؤسسة" value={card.homeInstitution.appointment.institutionAppointmentDate} bidi />
        <Fact label="رقم التعيين بالمؤسسة" value={card.homeInstitution.appointment.institutionAppointmentNumber} bidi />
        <Fact label="رقم تأشيرة المراقب المالي" value={card.homeInstitution.appointment.financialControllerVisaNumber} bidi />
      </Facts>{card.homeInstitution.archivedAt ? <p className="teacher-print__status">المؤسسة مؤرشفة</p> : null}</>
        : <p>لا توجد مؤسسة أم معتمدة</p>}
    </section>

    <section className="teacher-print__section"><h2>تكملة النصاب</h2>
      {card.currentSupplementaryWorkplaces.length ? <ul className="teacher-print__records">{card.currentSupplementaryWorkplaces.map((item) => <li key={item.id}>
        <strong>{item.institution.name}</strong><span>البلدية: {valueOrUnavailable(item.institution.municipality)}</span>
        <span>الفترة: <bdi dir="ltr">{item.validFrom} — {item.validTo ?? 'مفتوحة'}</bdi></span>
        {item.institution.archivedAt ? <span>المؤسسة مؤرشفة</span> : null}
      </li>)}</ul> : <p>لا توجد تكملة نصاب حالية</p>}
    </section>

    <section className="teacher-print__section"><h2>المؤهلات والشهادات</h2>
      {card.qualifications.items.length ? <ul className="teacher-print__records">{card.qualifications.items.map((item) => <li key={item.id}>
        <strong>{item.name}</strong><span>الجهة المانحة: {valueOrUnavailable(item.issuingBody)}</span><span>التاريخ: <bdi dir="ltr">{valueOrUnavailable(item.qualificationDate)}</bdi></span>
      </li>)}</ul> : <p>لا توجد مؤهلات منظمة مسجلة</p>}
      <div className="teacher-print__legacy"><h3>مؤهلات سابقة غير مفصلة</h3><p dir="auto">{valueOrUnavailable(card.qualifications.legacyText)}</p></div>
    </section>

    <section className="teacher-print__section"><h2>التصنيف الإداري</h2><Facts>
      <Fact label="الصنف" value={teacher.administrativeCategory} /><Fact label="القسم الإداري" value={teacher.administrativeSection} />
      <Fact label="الدرجة" value={teacher.administrativeGrade} /><Fact label="تاريخ سريان التصنيف" value={teacher.administrativeClassificationEffectiveDate} bidi />
    </Facts></section>

    <section className="teacher-print__section"><h2>المتابعة البيداغوجية</h2><Facts>
      <Fact label="تاريخ آخر تفتيش" value={card.inspectionSummary.lastInspectionDate} bidi />
      <Fact label="النقطة البيداغوجية / 20" value={card.inspectionSummary.pedagogicalMark === null ? null : `${card.inspectionSummary.pedagogicalMark} / 20`} bidi />
    </Facts></section>

    <div className="teacher-print__closing">
      <section className="teacher-print__section"><h2>التوزيع الأسبوعي</h2>
        {!schedule ? <p>لم يُسجَّل جدول لهذه السنة.</p> : <div className="teacher-print__schedule">
          <p>السنة الدراسية: <bdi dir="ltr">{schedule.academicYear}</bdi></p>
          <p>عدد الحصص الحالية: <bdi dir="ltr">{schedule.currentSlots.length}</bdi></p>
          {schedule.legacyUnknownSlots.length ? <p>مواقع/فترات غير موثقة: <bdi dir="ltr">{schedule.legacyUnknownSlots.length}</bdi></p> : null}
          {correctionCount ? <p>حصص تحتاج إلى مراجعة: <bdi dir="ltr">{correctionCount}</bdi></p> : null}
        </div>}
        <p className="teacher-print__schedule-note">يرفق التوزيع الأسبوعي منفصلًا عند توفره.</p>
      </section>
      <footer className="teacher-print__signature"><span>التوقيع</span></footer>
    </div>
  </article>;
}

export function TeacherInformationCardPrintPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const years = params.getAll('academicYear');
  const academicYear = years.length === 1 ? years[0] : '';
  const [card, setCard] = useState<TeacherInformationCard>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const yearValid = validAcademicYear(academicYear);

  useEffect(() => {
    let active = true;
    setCard(undefined); setFailed(false);
    if (!yearValid) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    void getTeacherInformationCard(id, academicYear).then(({ data }) => {
      if (active) setCard(data.card);
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, academicYear, yearValid]);

  const cardUrl = `/app/teachers/${encodeURIComponent(id)}/information-card?academicYear=${encodeURIComponent(academicYear)}`;

  return <div className="teacher-print-page" dir="rtl">
    <nav className="teacher-print__controls" aria-label="إجراءات الطباعة">
      <Link to={yearValid ? cardUrl : `/app/teachers/${encodeURIComponent(id)}/information-card`}>رجوع إلى البطاقة</Link>
      <button type="button" onClick={() => window.print()} disabled={!card || loading || failed}>طباعة</button>
    </nav>
    {!yearValid ? <p className="teacher-print__message" role="alert">السنة الدراسية غير صالحة. ارجع إلى البطاقة واختر سنة دراسية صحيحة.</p> : null}
    {loading ? <LoadingState label="جارٍ تحميل بطاقة المعلومات للطباعة…" /> : null}
    {!loading && failed ? <ErrorState title="تعذر عرض بطاقة المعلومات" description="البطاقة غير متاحة ضمن نطاق الوصول أو تعذر تحميلها." /> : null}
    {!loading && card ? <PrintDocument card={card} /> : null}
  </div>;
}
