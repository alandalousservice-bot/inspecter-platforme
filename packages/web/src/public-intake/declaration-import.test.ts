import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, parseDeclarationBytes } from './declaration-import';
import { initialValues, makePayload } from './form-model';

export const completeDeclaration = {
  firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران',
  phone: '0555123456', email: 'teacher@example.invalid', professionalStatus: 'SUBSTITUTE',
  employmentDate: '2005-09-01', institutionName: 'ابتدائية النور', municipality: 'وهران',
  institutionAddress: 'شارع النور', directorPhone: '021234567',
};
const envelope = (teacherData: unknown = completeDeclaration) => ({ packageVersion: '1.0', type: 'INSPECTOR_TEACHER_RECORD', exportedAt: '2026-10-03T00:00:00Z', teacherData });
const bytes = (text: string) => new TextEncoder().encode(text);
const parse = (data: unknown) => parseDeclarationBytes(bytes(JSON.stringify(data)));

describe('ADR-038 bounded declaration parser', () => {
  it('maps a complete Arabic/Latin declaration without envelope or coordinates', () => {
    const result = parse(envelope());
    expect(result.values).toEqual(completeDeclaration);
    expect(result.invalid).toEqual([]); expect(result.missing).toEqual([]);
    const payload = makePayload({ ...initialValues, ...result.values }, [], []);
    expect(payload.workplace.institutionName).toBe(completeDeclaration.institutionName);
    expect(payload).not.toHaveProperty('exportedAt'); expect(payload).not.toHaveProperty('latitude');
  });
  it('permits partial prefill without fabricated professional facts', () => {
    const result = parse(envelope({ firstName: 'أمينة Latin', lastName: 'عربي' }));
    expect(result.values).toEqual({ firstName: 'أمينة Latin', lastName: 'عربي' });
    expect(result.missing).toContain('الصفة المهنية'); expect(result.invalid).toEqual([]);
  });
  it('accepts exactly 32768 encoded bytes and rejects the next byte', () => {
    const text = JSON.stringify(envelope({}));
    const boundary = text + ' '.repeat(MAX_IMPORT_BYTES - bytes(text).length);
    expect(bytes(boundary).length).toBe(MAX_IMPORT_BYTES);
    expect(parseDeclarationBytes(bytes(boundary)).invalid).toEqual([]);
    expect(() => parseDeclarationBytes(bytes(boundary + ' '))).toThrow('حجم');
  });
  it.each(['{', '{"x":}', '{} garbage', '{"teacherData": {,}}', '[1,]', '{"a":01}', '{"a":"\\uXXXX"}'])('rejects malformed JSON safely: %s', (text) => {
    expect(() => parseDeclarationBytes(bytes(text))).toThrow('ملف التصريح غير صالح');
  });
  it('rejects invalid UTF-8 and permits a UTF-8 BOM', () => {
    expect(() => parseDeclarationBytes(new Uint8Array([0xc3, 0x28]))).toThrow('UTF-8');
    expect(parseDeclarationBytes(bytes('\ufeff' + JSON.stringify(envelope()))).invalid).toEqual([]);
  });
  it.each(['packageVersion', 'type'])('rejects unsupported %s', (key) => {
    expect(() => parse({ ...envelope(), [key]: 'wrong' })).toThrow('غير مدعوم');
  });
  it.each([
    '{"packageVersion":"1.0","packageVersion":"1.0"}',
    '{"teacherData":{"firstName":"a","firstName":"b"}}',
    '{"teacherData":{"firstName":"a","first\\u004eame":"b"}}',
  ])('rejects duplicate and escaped duplicate keys', (text) => { expect(() => parseDeclarationBytes(bytes(text))).toThrow('مكررة'); });
  it('rejects unknown envelope/teacher/workplace keys', () => {
    expect(() => parse({ ...envelope(), extra: true })).toThrow('غير معروفة');
    expect(() => parse(envelope({ districtId: 'x' }))).toThrow('غير معروفة');
    expect(() => parse(envelope({ workplace: { institutionName: 'x', unexpected: 'x' } }))).toThrow('غير معروفة');
  });
  it('checks depth before whole-document JSON parsing and rejects prototype keys', () => {
    expect(() => parseDeclarationBytes(bytes('['.repeat(17) + '0' + ']'.repeat(17)))).toThrow('عمق');
    for (const key of ['__proto__', 'constructor', 'prototype', '__pro\\u0074o__']) {
      expect(() => parseDeclarationBytes(bytes(`{"teacherData":{"${key}":{}}}`))).toThrow('غير مسموح');
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each([
    ['dateOfBirth', '2025-02-30'], ['phone', '123'], ['professionalStatus', 'UNKNOWN'],
    ['firstName', 'x'.repeat(101)], ['email', 'not-email'],
    ['employmentDate', '1970-01-01'], ['administrativeGrade', 'x'.repeat(101)],
  ])('identifies invalid %s without truncation/defaulting', (key, value) => {
    const result = parse(envelope({ ...completeDeclaration, [key]: value }));
    expect(result.invalid.length).toBeGreaterThan(0);
  });
  it('omits optional blanks, permits canonical notes whitespace and mixed text', () => {
    const result = parse(envelope({ ...completeDeclaration, notes: 'سطر\nLatin', confirmationDate: ' ', personalAddress: ' ', latitude: '', longitude: null }));
    expect(result.invalid).toEqual([]); expect(result.values).not.toHaveProperty('confirmationDate');
    expect(result.values).not.toHaveProperty('personalAddress'); expect(result.values).not.toHaveProperty('longitude');
  });
  it('rejects control characters even in optional blank-only values', () => {
    expect(() => parse(envelope({ firstName: 'a\u0000' }))).toThrow('محارف تحكم');
    expect(() => parse(envelope({ administrativeGrade: '\n' }))).toThrow('محارف تحكم');
  });
  it.each([{ latitude: '0' }, { longitude: '0' }, { latitude: '36', longitude: '3' }, { latitude: 0 }, { longitude: false }])('rejects meaningful coordinates without echo', (coordinate) => {
    expect(() => parse(envelope({ ...completeDeclaration, ...coordinate }))).toThrow('إحداثيات الموقع غير مدعومة');
  });
  it.each([[], null, [{ firstName: 'x' }], { firstName: null }, { firstName: 42 }])('rejects wrong structures/non-string fields', (teacherData) => {
    expect(() => parse(envelope(teacherData))).toThrow();
  });
});
