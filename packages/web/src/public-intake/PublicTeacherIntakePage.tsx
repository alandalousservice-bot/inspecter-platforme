import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  primaryInstitutionName: string;
  additionalInstitutionNames: string[];
};

const initialValues: FormValues = {
  firstName: '', lastName: '', dateOfBirth: '', placeOfBirth: '', phone: '', email: '',
  professionalStatus: '', employmentDate: '', confirmationDate: '', qualifications: '', notes: '',
  primaryInstitutionName: '', additionalInstitutionNames: [],
};

const statusOptions = [
  ['PERMANENT', 'مرسم'],
  ['TRAINEE', 'متربص'],
  ['CONTRACT', 'متعاقد'],
  ['TEMPORARY_CONTRACT', 'متعاقد مؤقت'],
] as const;

const fieldLabels: Record<string, string> = {
  firstName: 'الاسم', lastName: 'اللقب', dateOfBirth: 'تاريخ الميلاد', placeOfBirth: 'مكان الميلاد',
  phone: 'رقم الهاتف', email: 'البريد الإلكتروني', professionalStatus: 'الصفة المهنية',
  employmentDate: 'تاريخ التوظيف', confirmationDate: 'تاريخ الترسيم أو التثبيت',
  qualifications: 'الشهادات والمؤهلات', notes: 'ملاحظات', primaryInstitutionName: 'اسم المؤسسة الأساسية',
  additionalInstitutionNames: 'المؤسسات الإضافية',
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const codePoints = (value: string) => Array.from(value).length;
const cleanName = (value: string) => value.trim().replace(/\s+/gu, ' ');
const normalizedInstitution = (value: string) => cleanName(value).normalize('NFC').toLowerCase();
const hasControlCharacters = (value: string) => /[\p{Cc}]/u.test(value);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const requiredText: Array<[keyof FormValues, number]> = [
    ['firstName', 100], ['lastName', 100], ['placeOfBirth', 150], ['primaryInstitutionName', 200],
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
  if (codePoints(values.email.trim()) > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email.trim())) {
    errors.email = 'أدخل بريدًا إلكترونيًا صحيحًا.';
  }
  if (!statusOptions.some(([value]) => value === values.professionalStatus)) errors.professionalStatus = 'اختر الصفة المهنية.';
  if (codePoints(values.qualifications.trim()) > 1000) errors.qualifications = 'يجب ألا تتجاوز 1000 حرف.';
  else if (hasControlCharacters(values.qualifications)) errors.qualifications = 'تحقق من النص المدخل.';
  if (codePoints(values.notes.trim()) > 2000) errors.notes = 'تحقق من الملاحظات.';
  if (/[\p{Cc}]/u.test(values.notes.replace(/[\n\r\t]/gu, ''))) errors.notes = 'تحقق من الملاحظات.';

  if (values.additionalInstitutionNames.length > 5) errors.additionalInstitutionNames = 'يمكن إدخال خمس مؤسسات إضافية كحد أقصى.';
  const institutions = [values.primaryInstitutionName, ...values.additionalInstitutionNames];
  const seen = new Set<string>();
  for (const name of institutions) {
    const normalized = normalizedInstitution(name);
    if (!normalized) {
      errors.additionalInstitutionNames = 'أكمل اسم كل مؤسسة أضفتها أو احذف الحقل الفارغ.';
      break;
    }
    if (codePoints(normalized) > 200) {
      errors.additionalInstitutionNames = 'يجب ألا يتجاوز اسم المؤسسة 200 حرف.';
      break;
    }
    if (hasControlCharacters(name)) {
      errors.additionalInstitutionNames = 'تحقق من اسم المؤسسة.';
      break;
    }
    if (seen.has(normalized)) {
      errors.additionalInstitutionNames = 'لا يمكن تكرار اسم المؤسسة.';
      break;
    }
    seen.add(normalized);
  }
  return errors;
}

function makePayload(values: FormValues): TeacherSubmissionPayload {
  return {
    firstName: cleanName(values.firstName),
    lastName: cleanName(values.lastName),
    dateOfBirth: values.dateOfBirth,
    placeOfBirth: cleanName(values.placeOfBirth),
    phone: values.phone.trim(),
    email: values.email.trim(),
    professionalStatus: values.professionalStatus as TeacherSubmissionPayload['professionalStatus'],
    employmentDate: values.employmentDate,
    primaryInstitutionName: cleanName(values.primaryInstitutionName),
    ...(values.confirmationDate ? { confirmationDate: values.confirmationDate } : {}),
    ...(values.qualifications.trim() ? { qualifications: values.qualifications.trim() } : {}),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    ...(values.additionalInstitutionNames.length
      ? { additionalInstitutionNames: values.additionalInstitutionNames.map(cleanName) }
      : {}),
  };
}

function serverFieldErrors(fields?: Record<string, string[]>): Record<string, string> {
  if (!fields) return {};
  const result: Record<string, string> = {};
  for (const key of Object.keys(fields)) {
    const field = key.split('.')[0];
    if (fieldLabels[field]) result[field] = `تحقق من ${fieldLabels[field]}.`;
  }
  return result;
}

export function PublicTeacherIntakePage() {
  const { districtId = '' } = useParams();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const dynamicFocusTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!dynamicFocusTarget.current) return;
    document.getElementById(dynamicFocusTarget.current)?.focus();
    dynamicFocusTarget.current = null;
  }, [values.additionalInstitutionNames.length]);

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
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setErrorMessage('يرجى مراجعة الحقول المشار إليها قبل الإرسال.');
      const firstInvalid = Object.keys(nextErrors)[0];
      (document.getElementById(firstInvalid)
        ?? (firstInvalid === 'additionalInstitutionNames' ? document.getElementById('additionalInstitution-0') : null))?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await submitTeacherIntake(districtId, makePayload(values));
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

  function updateAdditional(index: number, value: string) {
    const rows = [...values.additionalInstitutionNames];
    rows[index] = value;
    change('additionalInstitutionNames', rows);
  }

  function addInstitution() {
    dynamicFocusTarget.current = `additionalInstitution-${values.additionalInstitutionNames.length}`;
    change('additionalInstitutionNames', [...values.additionalInstitutionNames, '']);
  }

  function removeInstitution(index: number) {
    const rows = values.additionalInstitutionNames.filter((_, row) => row !== index);
    dynamicFocusTarget.current = rows.length
      ? `additionalInstitution-${Math.min(index, rows.length - 1)}`
      : 'add-additional-institution';
    change('additionalInstitutionNames', rows);
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
            <legend>المؤسسة أو المؤسسات الابتدائية</legend>
            <p className="public-intake-fieldset-hint">اكتب أسماء المؤسسات كما هي. لا يلزم اختيار مؤسسة من قائمة.</p>
            <Input id="primaryInstitutionName" label="اسم المؤسسة الأساسية" required value={values.primaryInstitutionName} error={errors.primaryInstitutionName || (errors.additionalInstitutionNames && errors.primaryInstitutionName ? errors.additionalInstitutionNames : undefined)} onChange={(event) => change('primaryInstitutionName', event.currentTarget.value)} />
            {values.additionalInstitutionNames.map((name, index) => (
              <div className="public-intake-additional" key={`institution-${index}`}>
                <Input id={`additionalInstitution-${index}`} label={`اسم المؤسسة الإضافية ${index + 1}`} required value={name} error={errors.additionalInstitutionNames} onChange={(event) => updateAdditional(index, event.currentTarget.value)} />
                <Button type="button" variant="secondary" aria-label={`حذف المؤسسة الإضافية ${index + 1}`} onClick={() => removeInstitution(index)}>حذف</Button>
              </div>
            ))}
            {errors.additionalInstitutionNames && !values.additionalInstitutionNames.length ? <p className="ui-field__error" role="alert">{errors.additionalInstitutionNames}</p> : null}
            {values.additionalInstitutionNames.length < 5 ? <Button id="add-additional-institution" type="button" variant="secondary" onClick={addInstitution}>إضافة مؤسسة أخرى</Button> : null}
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
