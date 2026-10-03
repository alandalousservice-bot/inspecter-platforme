import { fieldLabels, initialValues, validate, type FormValues } from './form-model';

export const MAX_IMPORT_BYTES = 32768;
export class DeclarationImportError extends Error {
  constructor(message: string) { super(message); this.name = 'DeclarationImportError'; }
}
const fail = (message = 'ملف التصريح غير صالح. تحقق من بنيته وحاول مجددًا.'): never => { throw new DeclarationImportError(message); };
const fields = [
  'firstName', 'lastName', 'dateOfBirth', 'placeOfBirth', 'phone', 'email',
  'professionalStatus', 'employmentDate', 'confirmationDate', 'notes', 'birthProvince',
  'personalAddress', 'professionalFramework', 'administrativeGrade',
  'institutionName', 'municipality', 'institutionAddress', 'directorPhone',
] as const satisfies ReadonlyArray<keyof FormValues>;
const required = ['firstName', 'lastName', 'dateOfBirth', 'placeOfBirth', 'phone', 'email',
  'professionalStatus', 'employmentDate', 'institutionName', 'municipality', 'institutionAddress', 'directorPhone'] as const;
const dangerous = new Set(['__proto__', 'constructor', 'prototype']);

/** Bounded JSON grammar scan precedes JSON.parse; escaped keys are decoded before comparison. */
function boundedJson(text: string): unknown {
  let cursor = 0;
  const whitespace = () => { while (/[\t\r\n ]/u.test(text[cursor] ?? '') && cursor < text.length) cursor++; };
  const string = (): string => {
    const start = cursor++;
    while (cursor < text.length) {
      const character = text[cursor++];
      if (character === '\\') cursor++;
      else if (character === '"') {
        try { return JSON.parse(text.slice(start, cursor)) as string; } catch { return fail(); }
      }
    }
    return fail();
  };
  const value = (depth: number): void => {
    whitespace();
    const character = text[cursor];
    if (character === '{' || character === '[') {
      if (depth > 16) fail('الملف يتجاوز عمق البيانات المسموح.');
      const object = character === '{'; const closing = object ? '}' : ']';
      const keys = new Set<string>(); cursor++; whitespace();
      if (text[cursor] === closing) { cursor++; return; }
      while (cursor < text.length) {
        if (object) {
          if (text[cursor] !== '"') fail();
          const key = string();
          if (dangerous.has(key)) fail('الملف يحتوي حقولًا غير مسموح بها.');
          if (keys.has(key)) fail('الملف يحتوي مفاتيح مكررة.');
          keys.add(key); whitespace();
          if (text[cursor++] !== ':') fail();
        }
        value(depth + 1); whitespace();
        if (text[cursor] === closing) { cursor++; return; }
        if (text[cursor++] !== ',') fail();
        whitespace();
      }
      fail();
    } else if (character === '"') { string(); }
    else {
      const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(text.slice(cursor));
      if (!token) fail();
      cursor += token![0].length;
    }
  };
  value(1); whitespace();
  if (cursor !== text.length) fail();
  try { return JSON.parse(text) as unknown; } catch { return fail(); }
}
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export type DeclarationPreview = {
  values: Partial<FormValues>;
  missing: string[];
  invalid: string[];
  exportedAt: string;
};

export function parseDeclarationBytes(bytes: Uint8Array): DeclarationPreview {
  if (bytes.byteLength > MAX_IMPORT_BYTES) fail('حجم الملف يتجاوز 32 كيلوبايت.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return fail('ترميز الملف غير صالح. استخدم ملف JSON بترميز UTF-8.'); }
  const envelope = boundedJson(text);
  if (!isObject(envelope)) fail();
  const data = envelope as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['packageVersion', 'type', 'exportedAt', 'teacherData'].includes(key))) fail('الملف يحتوي حقولًا غير معروفة.');
  if (data.packageVersion !== '1.0') fail('إصدار ملف التصريح غير مدعوم.');
  if (data.type !== 'INSPECTOR_TEACHER_RECORD') fail('نوع ملف التصريح غير مدعوم.');
  if (typeof data.exportedAt !== 'string' || data.exportedAt.length > 40 || !Number.isFinite(Date.parse(data.exportedAt))) fail('تاريخ ملف التصريح غير صالح.');
  if (!isObject(data.teacherData)) fail();
  const teacher = data.teacherData as Record<string, unknown>;
  const allowed = new Set<string>([...fields, 'latitude', 'longitude']);
  if (Object.keys(teacher).some((key) => !allowed.has(key))) fail('بيانات التصريح تحتوي حقولًا غير معروفة.');
  for (const coordinate of ['latitude', 'longitude']) {
    if (coordinate in teacher && teacher[coordinate] !== null
      && !(typeof teacher[coordinate] === 'string' && !teacher[coordinate].trim())) {
      fail('إحداثيات الموقع غير مدعومة في استيراد التصريح الحالي.');
    }
  }
  const values: Partial<FormValues> = {};
  for (const field of fields) {
    if (!(field in teacher)) continue;
    if (typeof teacher[field] !== 'string') fail('قيم حقول التصريح يجب أن تكون نصوصًا.');
    const raw = teacher[field] as string;
    if (/[\p{Cc}]/u.test(field === 'notes' ? raw.replace(/[\n\r\t]/gu, '') : raw)) fail('الملف يحتوي محارف تحكم غير مسموح بها.');
    // Retain raw values for existing canonical validation; never truncate or guess facts.
    if (raw.trim()) values[field] = raw;
  }
  const complete = { ...initialValues };
  for (const field of fields) if (values[field] !== undefined) complete[field] = values[field]!;
  const errors = validate(complete, [], []);
  const missing = required.filter((field) => !complete[field].trim());
  const invalid = Object.keys(errors).filter((field) => !missing.includes(field as typeof missing[number]));
  return { values, missing: missing.map((field) => fieldLabels[field]), invalid: invalid.map((field) => fieldLabels[field]), exportedAt: data.exportedAt as string };
}
