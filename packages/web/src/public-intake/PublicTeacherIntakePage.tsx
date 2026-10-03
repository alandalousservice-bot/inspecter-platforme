import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { Button, Card, ErrorState, Input, Select, SuccessState, Textarea } from '../ui';
import { PublicSubmissionError, submitTeacherIntake } from './client';
import './public-intake.css';

import { initialValues, fieldLabels, validate, makePayload, uuidPattern, statusOptions, type FormValues, type QualificationValue, type SupplementaryWorkplaceValue } from './form-model';
import { DeclarationImport } from './DeclarationImport';

function serverFieldErrors(fields?: Record<string, string[]>): Record<string, string> {
  if (!fields) return {};
  const result: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
    const fieldParts = key.split('.');
    const field = fieldParts[0] === 'workplace' ? fieldParts[1]
      : fieldParts[0] === 'structuredQualifications' ? fieldParts[2] === 'issuingBody' ? 'qualificationIssuer' : fieldParts[2] === 'qualificationDate' ? 'qualificationDate' : 'qualificationName'
        : fieldParts[0] === 'supplementaryWorkplaces' ? fieldParts[2] === 'municipality' ? 'supplementaryMunicipality' : fieldParts[2] === 'institutionAddress' ? 'supplementaryAddress' : fieldParts[2] === 'directorPhone' ? 'supplementaryPhone' : 'supplementaryInstitutionName'
          : fieldParts[0];
    if (fieldLabels[field]) result[key.includes('.') ? key : field] = `تحقق من ${fieldLabels[field]}.`;
  }
  return result;
}

export function PublicTeacherIntakePage() {
  const { districtId = '' } = useParams();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [qualificationRows, setQualificationRows] = useState<QualificationValue[]>([]);
  const [workplaceRows, setWorkplaceRows] = useState<SupplementaryWorkplaceValue[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  function change<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setErrorMessage('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!uuidPattern.test(districtId)) {
      setErrorMessage('تعذر فتح نموذج الإرسال. استخدم الرابط الذي زودك به المفتش.');
      return;
    }
    const nextErrors = validate(values, qualificationRows, workplaceRows);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setErrorMessage('يرجى مراجعة الحقول المشار إليها قبل الإرسال.');
      const firstInvalid = Object.keys(nextErrors)[0];
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await submitTeacherIntake(districtId, makePayload(values, qualificationRows, workplaceRows));
      setSuccess(true);
    } catch (caught) {
      if (caught instanceof PublicSubmissionError && caught.status === 429) {
        const wait = caught.retryAfterSeconds;
        setErrorMessage(wait
          ? `تعذر الإرسال الآن. يرجى الانتظار ${wait} ثانية ثم المحاولة مجددًا.`
          : 'تم تجاوز عدد المحاولات المسموح. يرجى الانتظار قليلًا ثم المحاولة مجددًا.');
      } else if (caught instanceof PublicSubmissionError && caught.status === 413) {
        setErrorMessage('حجم البيانات يتجاوز الحد المسموح. راجع النصوص قبل الإرسال مجددًا.');
      } else if (caught instanceof PublicSubmissionError && caught.status === 404) {
        setErrorMessage('تعذر فتح نموذج الإرسال. تحقق من الرابط الذي زودك به المفتش.');
      } else if (caught instanceof PublicSubmissionError && caught.status === 400) {
        const fieldErrors = serverFieldErrors(caught.fields);
        setErrors(fieldErrors);
        setErrorMessage(Object.keys(fieldErrors).length
          ? 'يرجى مراجعة البيانات المشار إليها.'
          : 'تعذر قبول البيانات المدخلة. راجع الحقول وحاول مجددًا.');
      } else {
        setErrorMessage('تعذر إرسال البيانات الآن. تحقق من اتصالك وحاول مجددًا.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <main className="public-intake-page" dir="rtl" id="main-content">
        <Card className="public-intake-card">
          <header className="public-intake-heading">
            <p className="public-intake-eyebrow">منصة مفتش التربية البدنية والرياضية</p>
            <h1>تأكيد استلام البيانات</h1>
          </header>
          <SuccessState title="تم استلام بياناتك">
            <p>أُرسلت البيانات إلى مفتش المقاطعة للمراجعة. الإرسال لا يعني اعتماد التسجيل تلقائيًا.</p>
          </SuccessState>
        </Card>
      </main>
    );
  }

  if (!uuidPattern.test(districtId)) {
    return (
      <main className="public-intake-page" dir="rtl" id="main-content">
        <Card className="public-intake-card">
          <h1>نموذج تقديم بيانات الأستاذ</h1>
          <ErrorState title="تعذر فتح نموذج الإرسال" description="استخدم الرابط الذي زودك به المفتش." />
        </Card>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="public-intake-page" dir="rtl" id="main-content">
      <Card className="public-intake-card">
        <header className="public-intake-heading">
          <p className="public-intake-eyebrow">منصة مفتش التربية البدنية والرياضية</p>
          <h1>نموذج تقديم بيانات الأستاذ</h1>
          <p>تُرسل البيانات إلى مفتش المقاطعة للمراجعة. إرسال النموذج لا يعني اعتماد التسجيل تلقائيًا.</p>
        </header>

        {errorMessage ? <ErrorState title="راجع البيانات قبل الإرسال" description={errorMessage} /> : null}

        <DeclarationImport disabled={submitting} onApply={(mapped) => {
          setValues((current) => {
            const next = { ...current };
            for (const field of Object.keys(mapped) as Array<keyof FormValues>) next[field] = mapped[field] ?? current[field];
            return next;
          });
          setErrors({});
          setErrorMessage('');
          document.getElementById('firstName')?.focus();
        }} />

        <p className="public-intake-required-note">الحقول المشار إليها بنجمة مطلوبة. بقية الحقول اختيارية.</p>

        <form className="public-intake-form" onSubmit={(event) => void handleSubmit(event)} noValidate aria-busy={submitting}>
          <fieldset disabled={submitting}>
            <legend>المعلومات الشخصية</legend>
            <div className="public-intake-grid">
              <Input id="firstName" label="الاسم" required autoComplete="given-name" value={values.firstName} error={errors.firstName} onChange={(event) => change('firstName', event.currentTarget.value)} />
              <Input id="lastName" label="اللقب" required autoComplete="family-name" value={values.lastName} error={errors.lastName} onChange={(event) => change('lastName', event.currentTarget.value)} />
              <Input id="dateOfBirth" label="تاريخ الميلاد" required type="date" max={today} value={values.dateOfBirth} error={errors.dateOfBirth} onChange={(event) => change('dateOfBirth', event.currentTarget.value)} />
              <Input id="placeOfBirth" label="مكان الميلاد" required value={values.placeOfBirth} error={errors.placeOfBirth} onChange={(event) => change('placeOfBirth', event.currentTarget.value)} />
            </div>
          </fieldset>

          <fieldset disabled={submitting}>
            <legend>المعلومات المهنية</legend>
            <div className="public-intake-grid">
              <Input id="phone" label="رقم الهاتف" required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" hint="يمكن إدخال الرقم محليًا أو بصيغة ‎+213. لا يعني إدخاله التحقق من ملكيته." value={values.phone} error={errors.phone} onChange={(event) => change('phone', event.currentTarget.value)} />
              <Input id="email" label="البريد الإلكتروني" required type="email" inputMode="email" autoComplete="email" dir="ltr" value={values.email} error={errors.email} onChange={(event) => change('email', event.currentTarget.value)} />
              <Select id="professionalStatus" label="الصفة المهنية" required error={errors.professionalStatus} value={values.professionalStatus} onChange={(event) => change('professionalStatus', event.currentTarget.value)}>
                  <option value="">اختر الصفة المهنية</option>
                  {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Input id="employmentDate" label="تاريخ التوظيف" required type="date" max={today} value={values.employmentDate} error={errors.employmentDate} onChange={(event) => change('employmentDate', event.currentTarget.value)} />
              <Input id="confirmationDate" label="تاريخ الترسيم أو التثبيت" type="date" max={today} hint="اختياري" value={values.confirmationDate} error={errors.confirmationDate} onChange={(event) => change('confirmationDate', event.currentTarget.value)} />
              <div className="public-intake-grid__wide">
                <Textarea id="qualifications" className="public-intake-textarea" label="الشهادات والمؤهلات" hint="اختياري" value={values.qualifications} error={errors.qualifications} onChange={(event) => change('qualifications', event.currentTarget.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset disabled={submitting}>
            <legend>جهة العمل الحالية</legend>
            <p className="public-intake-fieldset-hint">اكتب بيانات المؤسسة التي تعمل بها حاليًا؛ هذه بيانات مُصرّح بها وتخضع لمراجعة المفتش.</p>
            <div className="public-intake-grid">
              <Input id="institutionName" label="اسم المؤسسة" required value={values.institutionName} error={errors.institutionName} onChange={(event) => change('institutionName', event.currentTarget.value)} />
              <Input id="municipality" label="بلدية العمل" required value={values.municipality} error={errors.municipality} onChange={(event) => change('municipality', event.currentTarget.value)} />
              <Input id="institutionAddress" label="عنوان المؤسسة" required value={values.institutionAddress} error={errors.institutionAddress} onChange={(event) => change('institutionAddress', event.currentTarget.value)} />
              <Input id="directorPhone" label="رقم هاتف مدير المؤسسة" required type="tel" inputMode="tel" dir="ltr" hint="رقم ثابت أو محمول جزائري؛ لا يعني إدخاله التحقق من ملكيته." value={values.directorPhone} error={errors.directorPhone} onChange={(event) => change('directorPhone', event.currentTarget.value)} />
              <Input id="institutionEmail" label="البريد الإلكتروني للمؤسسة" type="email" dir="ltr" hint="اختياري؛ تصريح يحتاج إلى مراجعة المفتش." value={values.institutionEmail} error={errors.institutionEmail} onChange={(event) => change('institutionEmail', event.currentTarget.value)} />
            </div>
          </fieldset>

          <fieldset disabled={submitting}>
            <legend>بيانات التعيين والتنصيب — تصريحات اختيارية</legend>
            <p className="public-intake-fieldset-hint">هذه بيانات يصرّح بها الأستاذ وتبقى للمراجعة؛ لا تعني اعتمادها.</p>
            <div className="public-intake-grid">
              <Input id="birthProvince" label="ولاية الميلاد" value={values.birthProvince} error={errors.birthProvince} onChange={(event) => change('birthProvince', event.currentTarget.value)} />
              <Input id="professionalFramework" label="الإطار" value={values.professionalFramework} error={errors.professionalFramework} onChange={(event) => change('professionalFramework', event.currentTarget.value)} />
              <Input id="firstEducationAppointmentDate" label="تاريخ أول تعيين في التعليم" type="date" value={values.firstEducationAppointmentDate} error={errors.firstEducationAppointmentDate} onChange={(event) => change('firstEducationAppointmentDate', event.currentTarget.value)} />
              <Input id="firstEducationAppointmentDecisionNumber" label="رقم قرار أول تعيين في التعليم" value={values.firstEducationAppointmentDecisionNumber} error={errors.firstEducationAppointmentDecisionNumber} onChange={(event) => change('firstEducationAppointmentDecisionNumber', event.currentTarget.value)} />
              <Input id="firstInstallationDate" label="تاريخ أول تنصيب" type="date" value={values.firstInstallationDate} error={errors.firstInstallationDate} onChange={(event) => change('firstInstallationDate', event.currentTarget.value)} />
              <Input id="traineeshipDate" label="تاريخ التربص" type="date" value={values.traineeshipDate} error={errors.traineeshipDate} onChange={(event) => change('traineeshipDate', event.currentTarget.value)} />
              <Input id="institutionAppointmentDate" label="تاريخ التعيين بالمؤسسة المصرح بها" type="date" value={values.institutionAppointmentDate} error={errors.institutionAppointmentDate} onChange={(event) => change('institutionAppointmentDate', event.currentTarget.value)} />
              <Input id="institutionAppointmentNumber" label="رقم التعيين بالمؤسسة المصرح بها" value={values.institutionAppointmentNumber} error={errors.institutionAppointmentNumber} onChange={(event) => change('institutionAppointmentNumber', event.currentTarget.value)} />
              <Input id="personalAddress" label="العنوان الشخصي" hint="اختياري وخاص؛ يراه المفتش ضمن الملف المصرح به." value={values.personalAddress} error={errors.personalAddress} onChange={(event) => change('personalAddress', event.currentTarget.value)} />
            </div>
          </fieldset>

          <fieldset disabled={submitting}>
            <legend>التصنيف الإداري — بيانات مصرح بها</legend>
            <div className="public-intake-grid">
              <Input id="administrativeCategory" label="الصنف" value={values.administrativeCategory} error={errors.administrativeCategory} onChange={(event) => change('administrativeCategory', event.currentTarget.value)} />
              <Input id="administrativeSection" label="القسم الإداري" value={values.administrativeSection} error={errors.administrativeSection} onChange={(event) => change('administrativeSection', event.currentTarget.value)} />
              <Input id="administrativeGrade" label="الدرجة" value={values.administrativeGrade} error={errors.administrativeGrade} onChange={(event) => change('administrativeGrade', event.currentTarget.value)} />
              <Input id="administrativeClassificationEffectiveDate" label="تاريخ سريان التصنيف الإداري" type="date" value={values.administrativeClassificationEffectiveDate} error={errors.administrativeClassificationEffectiveDate} onChange={(event) => change('administrativeClassificationEffectiveDate', event.currentTarget.value)} />
            </div>
          </fieldset>

          <fieldset disabled={submitting}>
            <legend>مؤسسات تكملة النصاب المصرح بها</legend>
            <p className="public-intake-fieldset-hint">هذه أوصاف نصية للمراجعة، ولا تنشئ ارتباطًا معتمدًا بمؤسسة.</p>
            {workplaceRows.map((row, index) => <div className="public-intake-declaration-row" key={`workplace-${index}`}>
              <div className="public-intake-grid">
                <Input id={`supplementary-${index}-institutionName`} label="اسم المؤسسة الإضافية" required value={row.institutionName} error={errors[`supplementaryWorkplaces.${index}.institutionName`]} onChange={(event) => { const value = event.currentTarget.value; setWorkplaceRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, institutionName: value } : item)); }} />
                <Input id={`supplementary-${index}-municipality`} label="البلدية" value={row.municipality} error={errors[`supplementaryWorkplaces.${index}.municipality`]} onChange={(event) => { const value = event.currentTarget.value; setWorkplaceRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, municipality: value } : item)); }} />
                <Input id={`supplementary-${index}-address`} label="عنوان المؤسسة الإضافية" value={row.institutionAddress} error={errors[`supplementaryWorkplaces.${index}.institutionAddress`]} onChange={(event) => { const value = event.currentTarget.value; setWorkplaceRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, institutionAddress: value } : item)); }} />
                <Input id={`supplementary-${index}-phone`} label="هاتف مدير المؤسسة الإضافية" type="tel" inputMode="tel" dir="ltr" value={row.directorPhone} error={errors[`supplementaryWorkplaces.${index}.directorPhone`]} onChange={(event) => { const value = event.currentTarget.value; setWorkplaceRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, directorPhone: value } : item)); }} />
              </div>
              <Button type="button" variant="secondary" aria-label={`حذف المؤسسة الإضافية ${index + 1}`} onClick={() => setWorkplaceRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>حذف</Button>
            </div>)}
            {workplaceRows.length < 3 ? <Button type="button" variant="secondary" onClick={() => setWorkplaceRows((current) => [...current, { institutionName: '', municipality: '', institutionAddress: '', directorPhone: '' }])}>إضافة مؤسسة مصرح بها</Button> : <p role="status">بلغت الحد الأقصى: 3 مؤسسات.</p>}
          </fieldset>

          <fieldset disabled={submitting}>
            <legend>المؤهلات والشهادات المصرح بها</legend>
            <p className="public-intake-fieldset-hint">تصريحات للمراجعة فقط. لن تُعتمد كشهادات في الملف تلقائيًا.</p>
            {qualificationRows.map((row, index) => <div className="public-intake-declaration-row" key={`qualification-${index}`}>
              <div className="public-intake-grid">
                <Input id={`qualification-${index}-name`} label="اسم الشهادة أو المؤهل" required value={row.name} error={errors[`structuredQualifications.${index}.name`]} onChange={(event) => { const value = event.currentTarget.value; setQualificationRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item)); }} />
                <Input id={`qualification-${index}-issuer`} label="الجهة المانحة" value={row.issuingBody} error={errors[`structuredQualifications.${index}.issuingBody`]} onChange={(event) => { const value = event.currentTarget.value; setQualificationRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, issuingBody: value } : item)); }} />
                <Input id={`qualification-${index}-date`} label="تاريخ الشهادة أو المؤهل" type="date" value={row.qualificationDate} error={errors[`structuredQualifications.${index}.qualificationDate`]} onChange={(event) => { const value = event.currentTarget.value; setQualificationRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, qualificationDate: value } : item)); }} />
              </div>
              <Button type="button" variant="secondary" aria-label={`حذف المؤهل ${index + 1}`} onClick={() => setQualificationRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>حذف</Button>
            </div>)}
            {qualificationRows.length < 5 ? <Button type="button" variant="secondary" onClick={() => setQualificationRows((current) => [...current, { name: '', issuingBody: '', qualificationDate: '' }])}>إضافة مؤهل مصرح به</Button> : <p role="status">بلغت الحد الأقصى: 5 مؤهلات.</p>}
          </fieldset>

          <fieldset disabled={submitting}>
            <legend>ملاحظات</legend>
            <Textarea id="notes" className="public-intake-textarea" label="ملاحظات إضافية" hint="اختياري" value={values.notes} error={errors.notes} onChange={(event) => change('notes', event.currentTarget.value)} />
          </fieldset>

          <Button type="submit" loading={submitting}>{submitting ? 'جارٍ الإرسال…' : 'إرسال البيانات'}</Button>
        </form>
      </Card>
    </main>
  );
}
