import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { Button, Card, Input } from '../ui';
import { PublicSubmissionError, submitTeacherIntake, type TeacherSubmissionPayload } from './client';
import './public-intake.css';

type FormValues = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  phone: string;
  email: string;
  professionalStatus: string;
  employmentDate: string;
  confirmationDate: string;
  qualifications: string;
  notes: string;
  institutionName: string;
  municipality: string;
  institutionAddress: string;
  directorPhone: string;
  birthProvince: string;
  professionalFramework: string;
  firstEducationAppointmentDate: string;
  firstEducationAppointmentDecisionNumber: string;
  firstInstallationDate: string;
  traineeshipDate: string;
  institutionAppointmentDate: string;
  institutionAppointmentNumber: string;
  administrativeCategory: string;
  administrativeSection: string;
  administrativeGrade: string;
  administrativeClassificationEffectiveDate: string;
  personalAddress: string;
  institutionEmail: string;
};

type QualificationValue = { name: string; issuingBody: string; qualificationDate: string };
type SupplementaryWorkplaceValue = { institutionName: string; municipality: string; institutionAddress: string; directorPhone: string };

const initialValues: FormValues = {
  firstName: '', lastName: '', dateOfBirth: '', placeOfBirth: '', phone: '', email: '',
  professionalStatus: '', employmentDate: '', confirmationDate: '', qualifications: '', notes: '',
  institutionName: '', municipality: '', institutionAddress: '', directorPhone: '',
  birthProvince: '', professionalFramework: '', firstEducationAppointmentDate: '',
  firstEducationAppointmentDecisionNumber: '', firstInstallationDate: '', traineeshipDate: '',
  institutionAppointmentDate: '', institutionAppointmentNumber: '', administrativeCategory: '',
  administrativeSection: '', administrativeGrade: '', administrativeClassificationEffectiveDate: '',
  personalAddress: '', institutionEmail: '',
};

const statusOptions = [
  ['PERMANENT', 'مرسم'],
  ['TRAINEE', 'متربص'],
  ['CONTRACT', 'متعاقد'],
  ['TEMPORARY_CONTRACT', 'متعاقد مؤقت'],
  ['SUBSTITUTE', 'مستخلف'],
] as const;

const fieldLabels: Record<string, string> = {
  firstName: 'الاسم', lastName: 'اللقب', dateOfBirth: 'تاريخ الميلاد', placeOfBirth: 'مكان الميلاد',
  phone: 'رقم الهاتف', email: 'البريد الإلكتروني', professionalStatus: 'الصفة المهنية',
  employmentDate: 'تاريخ التوظيف', confirmationDate: 'تاريخ الترسيم أو التثبيت',
  qualifications: 'الشهادات والمؤهلات', notes: 'ملاحظات', institutionName: 'اسم المؤسسة',
  municipality: 'بلدية العمل', institutionAddress: 'عنوان المؤسسة', directorPhone: 'رقم هاتف مدير المؤسسة',
  birthProvince: 'ولاية الميلاد', professionalFramework: 'الإطار',
  firstEducationAppointmentDate: 'تاريخ أول تعيين في التعليم',
  firstEducationAppointmentDecisionNumber: 'رقم قرار أول تعيين في التعليم',
  firstInstallationDate: 'تاريخ أول تنصيب', traineeshipDate: 'تاريخ التربص',
  institutionAppointmentDate: 'تاريخ التعيين بالمؤسسة المصرح بها',
  institutionAppointmentNumber: 'رقم التعيين بالمؤسسة المصرح بها',
  administrativeCategory: 'الصنف', administrativeSection: 'القسم الإداري', administrativeGrade: 'الدرجة',
  administrativeClassificationEffectiveDate: 'تاريخ سريان التصنيف الإداري',
  personalAddress: 'العنوان الشخصي', institutionEmail: 'البريد الإلكتروني للمؤسسة المصرح بها',
  qualificationName: 'اسم الشهادة أو المؤهل', qualificationIssuer: 'الجهة المانحة',
  qualificationDate: 'تاريخ الشهادة أو المؤهل', supplementaryInstitutionName: 'اسم المؤسسة الإضافية',
  supplementaryMunicipality: 'البلدية', supplementaryAddress: 'عنوان المؤسسة الإضافية',
  supplementaryPhone: 'هاتف مدير المؤسسة الإضافية',
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const codePoints = (value: string) => Array.from(value).length;
const cleanName = (value: string) => value.trim().replace(/\s+/gu, ' ');
const hasControlCharacters = (value: string) => /[\p{Cc}]/u.test(value);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validate(values: FormValues, qualificationRows: QualificationValue[], workplaceRows: SupplementaryWorkplaceValue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const requiredText: Array<[keyof FormValues, number]> = [
    ['firstName', 100], ['lastName', 100], ['placeOfBirth', 150],
    ['institutionName', 200], ['municipality', 150], ['institutionAddress', 300],
  ];
  for (const [field, maximum] of requiredText) {
    const value = cleanName(values[field] as string);
    if (!value) errors[field] = 'هذا الحقل مطلوب.';
    else if (hasControlCharacters(values[field] as string)) errors[field] = 'تحقق من النص المدخل.';
    else if (codePoints(value) > maximum) errors[field] = `يجب ألا يتجاوز ${maximum} حرفًا.`;
  }

  if (!validDate(values.dateOfBirth)) errors.dateOfBirth = 'أدخل تاريخًا صحيحًا.';
  else if (values.dateOfBirth > new Date().toISOString().slice(0, 10)) errors.dateOfBirth = 'لا يمكن أن يكون التاريخ في المستقبل.';
  if (!validDate(values.employmentDate)) errors.employmentDate = 'أدخل تاريخًا صحيحًا.';
  else {
    if (values.employmentDate > new Date().toISOString().slice(0, 10)) errors.employmentDate = 'لا يمكن أن يكون التاريخ في المستقبل.';
    if (validDate(values.dateOfBirth) && values.employmentDate <= values.dateOfBirth) errors.employmentDate = 'يجب أن يكون التوظيف بعد تاريخ الميلاد.';
  }
  if (values.confirmationDate) {
    if (!validDate(values.confirmationDate)) errors.confirmationDate = 'أدخل تاريخًا صحيحًا.';
    else if (values.confirmationDate > new Date().toISOString().slice(0, 10)
      || values.confirmationDate < values.employmentDate) errors.confirmationDate = 'تحقق من تاريخ الترسيم أو التثبيت.';
  }

  const phone = values.phone.trim().replace(/ /gu, '');
  const national = phone.startsWith('+213') ? phone.slice(4) : phone.startsWith('0') ? phone.slice(1) : '';
  if (codePoints(values.phone.trim()) > 20 || !(/^[234]\d{7}$/u.test(national) || /^[567]\d{8}$/u.test(national))) {
    errors.phone = 'أدخل رقمًا جزائريًا ثابتًا أو محمولًا صالحًا، محليًا أو بصيغة ‎+213.';
  }
  const directorPhone = values.directorPhone.trim().replace(/ /gu, '');
  const directorNational = directorPhone.startsWith('+213') ? directorPhone.slice(4) : directorPhone.startsWith('0') ? directorPhone.slice(1) : '';
  if (codePoints(values.directorPhone) > 20
    || !(/^[234]\d{7}$/u.test(directorNational) || /^[567]\d{8}$/u.test(directorNational))) {
    errors.directorPhone = 'أدخل رقمًا جزائريًا ثابتًا أو محمولًا صالحًا، محليًا أو بصيغة ‎+213.';
  }
  if (codePoints(values.email.trim()) > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email.trim())) {
    errors.email = 'أدخل بريدًا إلكترونيًا صحيحًا.';
  }
  if (!statusOptions.some(([value]) => value === values.professionalStatus)) errors.professionalStatus = 'اختر الصفة المهنية.';
  if (codePoints(values.qualifications.trim()) > 1000) errors.qualifications = 'يجب ألا تتجاوز 1000 حرف.';
  else if (hasControlCharacters(values.qualifications)) errors.qualifications = 'تحقق من النص المدخل.';
  if (codePoints(values.notes.trim()) > 2000) errors.notes = 'تحقق من الملاحظات.';
  if (/[\p{Cc}]/u.test(values.notes.replace(/[\n\r\t]/gu, ''))) errors.notes = 'تحقق من الملاحظات.';

  const optionalText: Array<[keyof FormValues, number]> = [
    ['birthProvince', 100], ['professionalFramework', 120], ['firstEducationAppointmentDecisionNumber', 120],
    ['institutionAppointmentNumber', 120], ['administrativeCategory', 100], ['administrativeSection', 100],
    ['administrativeGrade', 100], ['personalAddress', 300],
  ];
  for (const [field, maximum] of optionalText) {
    const raw = values[field] as string;
    if (raw && (hasControlCharacters(raw) || codePoints(raw.normalize('NFC').trim()) > maximum)) errors[field] = `تحقق من ${fieldLabels[field]}.`;
  }
  for (const field of ['firstEducationAppointmentDate', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate', 'administrativeClassificationEffectiveDate'] as const) {
    const value = values[field];
    if (value && !validDate(value)) errors[field] = 'أدخل تاريخًا صحيحًا.';
  }
  if (values.institutionEmail && (codePoints(values.institutionEmail.trim()) > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.institutionEmail.trim()))) errors.institutionEmail = 'أدخل بريدًا إلكترونيًا صحيحًا.';
  qualificationRows.forEach((row, index) => {
    if (!cleanName(row.name) || hasControlCharacters(row.name) || codePoints(cleanName(row.name).normalize('NFC')) > 200) errors[`structuredQualifications.${index}.name`] = 'أدخل اسم الشهادة أو المؤهل.';
    if (row.issuingBody && (hasControlCharacters(row.issuingBody) || codePoints(cleanName(row.issuingBody).normalize('NFC')) > 200)) errors[`structuredQualifications.${index}.issuingBody`] = 'تحقق من الجهة المانحة.';
    if (row.qualificationDate && !validDate(row.qualificationDate)) errors[`structuredQualifications.${index}.qualificationDate`] = 'أدخل تاريخًا صحيحًا.';
  });
  workplaceRows.forEach((row, index) => {
    if (!cleanName(row.institutionName) || hasControlCharacters(row.institutionName) || codePoints(cleanName(row.institutionName).normalize('NFC')) > 200) errors[`supplementaryWorkplaces.${index}.institutionName`] = 'أدخل اسم المؤسسة الإضافية.';
    for (const [key, maximum] of [['municipality', 150], ['institutionAddress', 300]] as const) {
      const value = row[key];
      if (value && (hasControlCharacters(value) || codePoints(cleanName(value).normalize('NFC')) > maximum)) errors[`supplementaryWorkplaces.${index}.${key}`] = 'تحقق من البيانات المدخلة.';
    }
    if (row.directorPhone && !validOptionalDirectorPhone(row.directorPhone)) errors[`supplementaryWorkplaces.${index}.directorPhone`] = 'أدخل رقم هاتف جزائريًا صالحًا.';
  });

  return errors;
}

function validOptionalDirectorPhone(value: string): boolean {
  const phone = value.trim().replace(/ /gu, '');
  const national = phone.startsWith('+213') ? phone.slice(4) : phone.startsWith('0') ? phone.slice(1) : '';
  return codePoints(value) <= 20 && (/^[234]\d{7}$/u.test(national) || /^[567]\d{8}$/u.test(national));
}

function makePayload(values: FormValues, qualificationRows: QualificationValue[], workplaceRows: SupplementaryWorkplaceValue[]): TeacherSubmissionPayload {
  return {
    firstName: cleanName(values.firstName),
    lastName: cleanName(values.lastName),
    dateOfBirth: values.dateOfBirth,
    placeOfBirth: cleanName(values.placeOfBirth),
    phone: values.phone.trim(),
    email: values.email.trim(),
    professionalStatus: values.professionalStatus as TeacherSubmissionPayload['professionalStatus'],
    employmentDate: values.employmentDate,
    workplace: {
      institutionName: cleanName(values.institutionName),
      municipality: cleanName(values.municipality),
      institutionAddress: cleanName(values.institutionAddress),
      directorPhone: values.directorPhone.trim(),
      ...(values.institutionEmail.trim() ? { institutionEmail: values.institutionEmail.trim() } : {}),
    },
    ...(values.confirmationDate ? { confirmationDate: values.confirmationDate } : {}),
    ...(values.qualifications.trim() ? { qualifications: values.qualifications.trim() } : {}),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    ...Object.fromEntries([
      'birthProvince', 'professionalFramework', 'firstEducationAppointmentDecisionNumber', 'institutionAppointmentNumber',
      'administrativeCategory', 'administrativeSection', 'administrativeGrade', 'personalAddress',
    ].flatMap((field) => {
      const value = values[field as keyof FormValues].trim().normalize('NFC');
      return value ? [[field, value]] : [];
    })),
    ...Object.fromEntries([
      'firstEducationAppointmentDate', 'firstInstallationDate', 'traineeshipDate', 'institutionAppointmentDate',
      'administrativeClassificationEffectiveDate',
    ].flatMap((field) => {
      const value = values[field as keyof FormValues];
      return value ? [[field, value]] : [];
    })),
    ...(qualificationRows.length ? { structuredQualifications: qualificationRows.map((row) => ({
      name: cleanName(row.name).normalize('NFC'),
      ...(row.issuingBody.trim() ? { issuingBody: cleanName(row.issuingBody).normalize('NFC') } : {}),
      ...(row.qualificationDate ? { qualificationDate: row.qualificationDate } : {}),
    })) } : {}),
    ...(workplaceRows.length ? { supplementaryWorkplaces: workplaceRows.map((row) => ({
      institutionName: cleanName(row.institutionName).normalize('NFC'),
      ...(row.municipality.trim() ? { municipality: cleanName(row.municipality).normalize('NFC') } : {}),
      ...(row.institutionAddress.trim() ? { institutionAddress: cleanName(row.institutionAddress).normalize('NFC') } : {}),
      ...(row.directorPhone.trim() ? { directorPhone: row.directorPhone.trim() } : {}),
    })) } : {}),
  };
}

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
          <section className="public-intake-success" role="status" aria-live="polite">
            <h1>تم استلام بياناتك</h1>
            <p>أُرسلت البيانات إلى مفتش المقاطعة للمراجعة. الإرسال لا يعني اعتماد التسجيل تلقائيًا.</p>
          </section>
        </Card>
      </main>
    );
  }

  if (!uuidPattern.test(districtId)) {
    return (
      <main className="public-intake-page" dir="rtl" id="main-content">
        <Card className="public-intake-card">
          <h1>نموذج تقديم بيانات الأستاذ</h1>
          <p className="public-intake-error" role="alert">تعذر فتح نموذج الإرسال. استخدم الرابط الذي زودك به المفتش.</p>
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

        {errorMessage ? <p className="public-intake-error" role="alert" tabIndex={-1}>{errorMessage}</p> : null}

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
              <div className="ui-field">
                <label className="ui-field__label" htmlFor="professionalStatus">الصفة المهنية <span aria-hidden="true">*</span></label>
                <select id="professionalStatus" className="ui-input" required value={values.professionalStatus} aria-invalid={errors.professionalStatus ? true : undefined} aria-describedby={errors.professionalStatus ? 'professionalStatus-error' : undefined} onChange={(event) => change('professionalStatus', event.currentTarget.value)}>
                  <option value="">اختر الصفة المهنية</option>
                  {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {errors.professionalStatus ? <p className="ui-field__error" id="professionalStatus-error" role="alert">{errors.professionalStatus}</p> : null}
              </div>
              <Input id="employmentDate" label="تاريخ التوظيف" required type="date" max={today} value={values.employmentDate} error={errors.employmentDate} onChange={(event) => change('employmentDate', event.currentTarget.value)} />
              <Input id="confirmationDate" label="تاريخ الترسيم أو التثبيت" type="date" max={today} hint="اختياري" value={values.confirmationDate} error={errors.confirmationDate} onChange={(event) => change('confirmationDate', event.currentTarget.value)} />
              <div className="ui-field public-intake-grid__wide">
                <label className="ui-field__label" htmlFor="qualifications">الشهادات والمؤهلات <span className="ui-field__hint">اختياري</span></label>
                <textarea id="qualifications" className="ui-input public-intake-textarea" value={values.qualifications} aria-invalid={errors.qualifications ? true : undefined} aria-describedby={errors.qualifications ? 'qualifications-error' : undefined} onChange={(event) => change('qualifications', event.currentTarget.value)} />
                {errors.qualifications ? <p className="ui-field__error" id="qualifications-error" role="alert">{errors.qualifications}</p> : null}
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
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="notes">ملاحظات إضافية <span className="ui-field__hint">اختياري</span></label>
              <textarea id="notes" className="ui-input public-intake-textarea" value={values.notes} aria-invalid={errors.notes ? true : undefined} aria-describedby={errors.notes ? 'notes-error' : undefined} onChange={(event) => change('notes', event.currentTarget.value)} />
              {errors.notes ? <p className="ui-field__error" id="notes-error" role="alert">{errors.notes}</p> : null}
            </div>
          </fieldset>

          <Button type="submit" disabled={submitting} aria-live="polite">{submitting ? 'جارٍ الإرسال…' : 'إرسال البيانات'}</Button>
        </form>
      </Card>
    </main>
  );
}
