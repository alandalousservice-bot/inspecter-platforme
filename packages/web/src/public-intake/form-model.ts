import type { TeacherSubmissionPayload } from './client';

export type FormValues = {
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

export type QualificationValue = { name: string; issuingBody: string; qualificationDate: string };
export type SupplementaryWorkplaceValue = { institutionName: string; municipality: string; institutionAddress: string; directorPhone: string };

export const initialValues: FormValues = {
  firstName: '', lastName: '', dateOfBirth: '', placeOfBirth: '', phone: '', email: '',
  professionalStatus: '', employmentDate: '', confirmationDate: '', qualifications: '', notes: '',
  institutionName: '', municipality: '', institutionAddress: '', directorPhone: '',
  birthProvince: '', professionalFramework: '', firstEducationAppointmentDate: '',
  firstEducationAppointmentDecisionNumber: '', firstInstallationDate: '', traineeshipDate: '',
  institutionAppointmentDate: '', institutionAppointmentNumber: '', administrativeCategory: '',
  administrativeSection: '', administrativeGrade: '', administrativeClassificationEffectiveDate: '',
  personalAddress: '', institutionEmail: '',
};

export const statusOptions = [
  ['PERMANENT', 'مرسم'],
  ['TRAINEE', 'متربص'],
  ['CONTRACT', 'متعاقد'],
  ['TEMPORARY_CONTRACT', 'متعاقد مؤقت'],
  ['SUBSTITUTE', 'مستخلف'],
] as const;

export const fieldLabels: Record<string, string> = {
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

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const codePoints = (value: string) => Array.from(value).length;
const cleanName = (value: string) => value.trim().replace(/\s+/gu, ' ');
const hasControlCharacters = (value: string) => /[\p{Cc}]/u.test(value);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validate(values: FormValues, qualificationRows: QualificationValue[], workplaceRows: SupplementaryWorkplaceValue[]): Record<string, string> {
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

export function makePayload(values: FormValues, qualificationRows: QualificationValue[], workplaceRows: SupplementaryWorkplaceValue[]): TeacherSubmissionPayload {
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
