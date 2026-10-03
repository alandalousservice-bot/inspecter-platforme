import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PublicTeacherIntakePage } from './PublicTeacherIntakePage';

const teacher = { firstName: 'أمينة', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران', phone: '0555123456', email: 'teacher@example.invalid', professionalStatus: 'SUBSTITUTE', employmentDate: '2005-09-01', institutionName: 'ابتدائية النور', municipality: 'وهران', institutionAddress: 'شارع النور', directorPhone: '021234567' };
const document = (teacherData: unknown) => JSON.stringify({ packageVersion: '1.0', type: 'INSPECTOR_TEACHER_RECORD', exportedAt: '2026-10-03T00:00:00Z', teacherData });
function page() { return render(<MemoryRouter initialEntries={['/public/d/d42c3ef0-baf5-4b60-8dd2-e8f39b4c9d41/register']}><Routes><Route path="/public/d/:districtId/register" element={<PublicTeacherIntakePage />} /></Routes></MemoryRouter>); }
function select(text: string, name = 'declaration.json') { fireEvent.change(screen.getByLabelText(/اختيار ملف تصريح/), { target: { files: [new File([text], name, { type: 'application/json' })] } }); }
const receipt = () => new Response(JSON.stringify({ data: { receiptId: '00000000-0000-4000-8000-000000000000' } }), { status: 202 });
beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockImplementation(receipt)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('TASK-075 public local prefill only', () => {
  it('requires explicit apply and submit, verifies receipt and keeps the canonical payload', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem'); const logs = vi.spyOn(console, 'log');
    const { container } = page(); select(document({ ...teacher, latitude: '', longitude: null }));
    const heading = await screen.findByRole('heading', { name: 'معاينة البيانات المصرح بها' });
    await waitFor(() => expect(heading).toBe(globalThis.document.activeElement));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق البيانات على الاستمارة' }));
    expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByText('معاينة البيانات المصرح بها')).toBeNull();
    expect((screen.getByLabelText(/اختيار ملف تصريح/) as HTMLInputElement).value).toBe('');
    expect(globalThis.document.getElementById('firstName')).toBe(globalThis.document.activeElement);
    expect(container.querySelector('main[dir="rtl"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البيانات' }));
    await screen.findByRole('heading', { name: 'تم استلام بياناتك' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload.workplace.institutionName).toBe(teacher.institutionName);
    for (const key of ['teacherData', 'exportedAt', 'latitude', 'longitude', 'source', 'districtId']) expect(payload).not.toHaveProperty(key);
    expect(local).not.toHaveBeenCalled(); expect(logs).not.toHaveBeenCalled();
    expect(globalThis.location.search).toBe('');
  });
  it('shows missing fields, applies partial values and blocks incomplete submission', async () => {
    page(); select(document({ firstName: 'أمينة' }));
    await screen.findByText(/حقول تحتاج استكمالًا/);
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق البيانات على الاستمارة' }));
    expect(globalThis.document.getElementById('firstName')).toHaveProperty('value', 'أمينة');
    expect(globalThis.document.getElementById('professionalStatus')).toHaveProperty('value', '');
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البيانات' }));
    expect(fetch).not.toHaveBeenCalled(); expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
  it('marks invalid fields and prevents applying invalid values', async () => {
    page(); select(document({ ...teacher, phone: '123' }));
    await screen.findByText(/حقول غير صالحة: رقم الهاتف/);
    expect(screen.getByRole('button', { name: 'تطبيق البيانات على الاستمارة' })).toHaveProperty('disabled', true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('clears old preview on replacement, rejection, cancel and unmount', async () => {
    const view = page(); select(document(teacher)); await screen.findByText('معاينة البيانات المصرح بها');
    select(document({ latitude: '36' })); await screen.findByText(/إحداثيات الموقع غير مدعومة/);
    expect(screen.queryByText('معاينة البيانات المصرح بها')).toBeNull();
    select(document(teacher)); await screen.findByText('معاينة البيانات المصرح بها');
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء المعاينة' }));
    expect(screen.queryByText('معاينة البيانات المصرح بها')).toBeNull();
    expect(globalThis.document.activeElement).toBe(screen.getByLabelText(/اختيار ملف تصريح/));
    view.unmount(); page(); expect(screen.queryByText('معاينة البيانات المصرح بها')).toBeNull();
  });
  it.each(['file.csv', 'file.exe'])('rejects unsupported extension %s before parsing', async (name) => {
    page(); select(document(teacher), name); expect(await screen.findByText(/اختر ملف تصريح بصيغة JSON/)).toBeTruthy(); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects oversized files before reading', async () => {
    page(); select(' '.repeat(32769)); expect(await screen.findByText(/حجم الملف يتجاوز/)).toBeTruthy();
  });
  it.each([413, 429, 400, 500])('handles server %s without retry/success or PII', async (status) => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status }));
    page(); select(document(teacher)); await screen.findByText('معاينة البيانات المصرح بها');
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق البيانات على الاستمارة' }));
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البيانات' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(fetch).toHaveBeenCalledTimes(1); expect(screen.queryByText('تم استلام بياناتك')).toBeNull();
  });
  it.each(['network', 'missing receipt', 'invalid receipt'])('does not fabricate success for %s', async (failure) => {
    if (failure === 'network') vi.mocked(fetch).mockRejectedValue(new Error('private transport detail'));
    else vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(failure === 'missing receipt' ? {} : { data: { receiptId: 'bad' } }), { status: 202 }));
    page(); select(document(teacher)); await screen.findByText('معاينة البيانات المصرح بها');
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق البيانات على الاستمارة' }));
    fireEvent.click(screen.getByRole('button', { name: 'إرسال البيانات' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(fetch).toHaveBeenCalledTimes(1); expect(screen.queryByText('تم استلام بياناتك')).toBeNull(); expect(screen.queryByText('private transport detail')).toBeNull();
  });
});
