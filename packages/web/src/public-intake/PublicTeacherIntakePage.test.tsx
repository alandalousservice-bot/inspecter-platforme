import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PublicTeacherIntakePage } from './PublicTeacherIntakePage';

const districtId = 'd42c3ef0-baf5-4b60-8dd2-e8f39b4c9d41';
const validValues = {
  firstName: 'أحمد', lastName: 'بن صالح', dateOfBirth: '1985-03-04', placeOfBirth: 'وهران',
  phone: '+213 555 123 456', email: 'teacher@example.dz', professionalStatus: 'PERMANENT',
  employmentDate: '2010-09-01', institutionName: 'ابتدائية النور', municipality: 'بلدية الجزائر', institutionAddress: 'شارع الاستقلال', directorPhone: '021234567',
};

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function renderPage(id = districtId) {
  return render(
    <MemoryRouter initialEntries={[`/public/d/${id}/register`]}>
      <Routes><Route path="/public/d/:districtId/register" element={<PublicTeacherIntakePage />} /></Routes>
    </MemoryRouter>,
  );
}

function fillRequired() {
  for (const [id, value] of Object.entries(validValues)) fireEvent.change(document.getElementById(id) as HTMLElement, { target: { value } });
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'إرسال البيانات' }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(202, { data: { receiptId: '00000000-0000-4000-8000-000000000000' } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TASK-031 public teacher intake', () => {
  it('renders Arabic RTL form, semantic sections, visible labels, and stable Arabic status labels', () => {
    const { container } = renderPage();
    expect(container.querySelector('main[dir="rtl"]')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'نموذج تقديم بيانات الأستاذ' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'المعلومات الشخصية' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'المعلومات المهنية' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'جهة العمل الحالية' })).toBeTruthy();
    for (const label of [/اسم المؤسسة/, /بلدية العمل/, /عنوان المؤسسة/, /رقم هاتف مدير المؤسسة/]) expect(screen.getByRole('textbox', { name: label })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /الاسم/ })).toBeTruthy();
    const status = screen.getByRole('combobox', { name: /الصفة المهنية/ });
    expect(within(status).getByRole('option', { name: 'مرسم' }).getAttribute('value')).toBe('PERMANENT');
    expect(within(status).getByRole('option', { name: 'متربص' }).getAttribute('value')).toBe('TRAINEE');
    expect(within(status).getByRole('option', { name: 'متعاقد' }).getAttribute('value')).toBe('CONTRACT');
    expect(within(status).getByRole('option', { name: 'متعاقد مؤقت' }).getAttribute('value')).toBe('TEMPORARY_CONTRACT');
    expect(within(status).getByRole('option', { name: 'مستخلف' }).getAttribute('value')).toBe('SUBSTITUTE');
    expect(container.textContent).not.toMatch(/PERMANENT|TRAINEE|CONTRACT/);
  });

  it('submits only the documented payload to the district URL and transitions to a neutral receipt state', async () => {
    renderPage();
    fillRequired();
    await submit();
    expect(await screen.findByRole('heading', { name: 'تم استلام بياناتك' })).toBeTruthy();
    expect(screen.getByText(/لا يعني اعتماد التسجيل تلقائيًا/)).toBeTruthy();
    expect(screen.queryByText('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(fetch).toHaveBeenCalledWith(`/api/v1/public/districts/${districtId}/submissions`, expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
    }));
    const options = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(payload).toEqual({
      firstName: validValues.firstName, lastName: validValues.lastName, dateOfBirth: validValues.dateOfBirth,
      placeOfBirth: validValues.placeOfBirth, phone: validValues.phone, email: validValues.email,
      professionalStatus: validValues.professionalStatus, employmentDate: validValues.employmentDate,
      workplace: { institutionName: validValues.institutionName, municipality: validValues.municipality, institutionAddress: validValues.institutionAddress, directorPhone: validValues.directorPhone },
    });
    expect(payload).not.toHaveProperty('districtId');
    expect(payload).not.toHaveProperty('receiptId');
    expect(payload).not.toHaveProperty('confirmationDate');
    expect(payload).not.toHaveProperty('qualifications');
    expect(payload).not.toHaveProperty('notes');
    expect(payload).not.toHaveProperty('primaryInstitutionName');
    expect(payload.workplace).toEqual({ institutionName: validValues.institutionName, municipality: validValues.municipality, institutionAddress: validValues.institutionAddress, directorPhone: validValues.directorPhone });
  });

  it('maps the selected Arabic professional status to its stable API value', async () => {
    renderPage();
    fillRequired();
    fireEvent.change(screen.getByRole('combobox', { name: /الصفة المهنية/ }), { target: { value: 'TRAINEE' } });
    await submit();
    await screen.findByRole('heading', { name: 'تم استلام بياناتك' });
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(payload.professionalStatus).toBe('TRAINEE');
  });

  it('submits SUBSTITUTE as the existing required status without adding public fields', async () => {
    renderPage();
    fillRequired();
    fireEvent.change(screen.getByRole('combobox', { name: /الصفة المهنية/ }), { target: { value: 'SUBSTITUTE' } });
    await submit();
    await screen.findByRole('heading', { name: 'تم استلام بياناتك' });
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(payload.professionalStatus).toBe('SUBSTITUTE');
    expect(payload).not.toHaveProperty('professionalFramework');
    expect(payload).not.toHaveProperty('birthProvince');
    expect(payload).not.toHaveProperty('personalAddress');
  });

  it('blocks missing or malformed required values with associated accessible field errors', async () => {
    renderPage();
    await submit();
    expect(screen.getAllByRole('alert')[0].textContent).toContain('مراجعة الحقول');
    expect(screen.getByRole('textbox', { name: /الاسم/ }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByText('هذا الحقل مطلوب.').length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enforces Unicode code-point limits without splitting supplementary characters', async () => {
    renderPage();
    fillRequired();
    fireEvent.change(screen.getByRole('textbox', { name: /الاسم/ }), { target: { value: '😀'.repeat(101) } });
    await submit();
    expect(screen.getByText('يجب ألا يتجاوز 100 حرفًا.')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('validates date chronology, phone, email, status, and text limits before POST', async () => {
    renderPage();
    fillRequired();
    fireEvent.change(document.getElementById('employmentDate')!, { target: { value: '1980-01-01' } });
    fireEvent.change(document.getElementById('phone')!, { target: { value: '123' } });
    fireEvent.change(document.getElementById('email')!, { target: { value: 'not-an-email' } });
    fireEvent.change(document.getElementById('qualifications')!, { target: { value: 'x'.repeat(1001) } });
    await submit();
    expect(screen.getByText('يجب أن يكون التوظيف بعد تاريخ الميلاد.')).toBeTruthy();
    expect(screen.getByText(/أدخل رقمًا جزائريًا/)).toBeTruthy();
    expect(screen.getByText('أدخل بريدًا إلكترونيًا صحيحًا.')).toBeTruthy();
    expect(screen.getByText('يجب ألا تتجاوز 1000 حرف.')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires one complete workplace and exposes no additional institution controls', async () => {
    const { container } = renderPage();
    fillRequired();
    fireEvent.change(document.getElementById('municipality')!, { target: { value: ' ' } });
    await submit();
    expect(screen.getByText('هذا الحقل مطلوب.')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/إضافة مؤسسة أخرى|حذف المؤسسة الإضافية/);
  });

  it('counts the director phone input limit before trimming or normalization', async () => {
    renderPage();
    fillRequired();
    fireEvent.change(document.getElementById('directorPhone')!, { target: { value: '021234567             ' } });
    await submit();
    expect(screen.getByText(/رقمًا جزائريًا ثابتًا أو محمولًا صالحًا/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('includes optional values only when present and preserves their documented shape', async () => {
    renderPage();
    fillRequired();
    fireEvent.change(document.getElementById('confirmationDate')!, { target: { value: '2012-09-01' } });
    fireEvent.change(document.getElementById('qualifications')!, { target: { value: 'شهادة جامعية' } });
    fireEvent.change(document.getElementById('notes')!, { target: { value: 'ملاحظة' } });
    await submit();
    await screen.findByRole('heading', { name: 'تم استلام بياناتك' });
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(payload.confirmationDate).toBe('2012-09-01');
    expect(payload.qualifications).toBe('شهادة جامعية');
    expect(payload.notes).toBe('ملاحظة');
    expect(payload.workplace).toEqual({ institutionName: validValues.institutionName, municipality: validValues.municipality, institutionAddress: validValues.institutionAddress, directorPhone: validValues.directorPhone });
  });

  it('prevents submission for an invalid route district without displaying its value', async () => {
    renderPage('not-a-district-id');
    expect(screen.getByRole('alert').textContent).toContain('تعذر فتح نموذج الإرسال');
    expect(screen.queryByText('not-a-district-id')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a generic unavailable message for an unknown/unavailable district', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { error: { message: 'private district detail', requestId: 'request-secret' } }));
    renderPage();
    fillRequired();
    await submit();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('تحقق من الرابط'));
    expect(screen.queryByText(/private district detail|request-secret|district-id/i)).toBeNull();
    expect((screen.getByRole('textbox', { name: /الاسم/ }) as HTMLInputElement).value).toBe('أحمد');
  });

  it('shows safe validation feedback from the error envelope without echoing values or internals', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(400, {
      error: { message: 'private server message', fields: { email: ['invalid'] }, requestId: 'private-id' },
    }));
    renderPage();
    fillRequired();
    await submit();
    expect(await screen.findByText('تحقق من البريد الإلكتروني.')).toBeTruthy();
    expect(screen.queryByText(/private server message|private-id|أحمد/)).toBeNull();
    expect((screen.getByRole('textbox', { name: /الاسم/ }) as HTMLInputElement).value).toBe('أحمد');
  });

  it('explains rate limiting and respects Retry-After without exposing response data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(429, { error: { message: 'internal' } }, { 'retry-after': '60' }));
    renderPage();
    fillRequired();
    await submit();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('60 ثانية'));
    expect(screen.queryByText('internal')).toBeNull();
  });

  it('handles network and server errors safely, preserves form values, and permits retry', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('sensitive network stack'));
    renderPage();
    fillRequired();
    await submit();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('تحقق من اتصالك'));
    expect(screen.queryByText('sensitive network stack')).toBeNull();
    expect((screen.getByRole('textbox', { name: /الاسم/ }) as HTMLInputElement).value).toBe('أحمد');
    await submit();
    expect(await screen.findByRole('heading', { name: 'تم استلام بياناتك' })).toBeTruthy();
  });

  it('locks the form while pending to prevent repeated submission and retains entered data', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    renderPage();
    fillRequired();
    await submit();
    expect(screen.getByRole('button', { name: 'جارٍ الإرسال…' }).hasAttribute('disabled')).toBe(true);
    expect((screen.getByRole('group', { name: 'المعلومات الشخصية' }) as HTMLFieldSetElement).disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(jsonResponse(202, { data: { receiptId: 'not-displayed' } }));
    await screen.findByRole('heading', { name: 'تم استلام بياناتك' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'جارٍ الإرسال…' })).toBeNull());
  });

  it('uses keyboard-operable controls and exposes all errors through associated labels', async () => {
    const { container } = renderPage();
    const first = screen.getByRole('textbox', { name: /الاسم/ });
    first.focus();
    expect(document.activeElement).toBe(first);
    await submit();
    expect(screen.getByRole('textbox', { name: /الاسم/ }).getAttribute('aria-describedby')).toContain('firstName-error');
    expect(container.querySelector('fieldset[disabled]')).toBeNull();
    expect(screen.getByRole('button', { name: 'إرسال البيانات' })).toBeTruthy();
  });
});
