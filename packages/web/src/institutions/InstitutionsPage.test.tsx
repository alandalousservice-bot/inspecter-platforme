import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { InstitutionsPage } from './InstitutionsPage';
import type { Institution } from '../auth/client';
import { ApiRequestError } from '../auth/client';

const { createInstitution, getCurrentDistricts, listInstitutions, updateInstitution } = vi.hoisted(() => ({
  createInstitution: vi.fn(),
  getCurrentDistricts: vi.fn(),
  listInstitutions: vi.fn(),
  updateInstitution: vi.fn(),
}));
vi.mock('../auth/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/client')>(), createInstitution, getCurrentDistricts, listInstitutions, updateInstitution,
}));

const districtOne = { id: 'district-1', name: 'مقاطعة الشمال' };
const districtTwo = { id: 'district-2', name: 'مقاطعة الجنوب' };
const rowOne = { id: 'institution-1', districtId: districtOne.id, name: 'مدرسة النور', externalCode: null, municipality: null, address: null, directorPhone: null, email: null, archivedAt: null, createdAt: '', updatedAt: '' };
const page = (data: Institution[] = [], nextCursor: string | null = null, total = data.length) => ({ data, page: { limit: 25, nextCursor, total } });

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; this.dispatchEvent(new Event('close')); } });
});

beforeEach(() => {
  getCurrentDistricts.mockResolvedValue([districtOne]);
  listInstitutions.mockResolvedValue(page());
  createInstitution.mockResolvedValue({ data: rowOne });
  updateInstitution.mockResolvedValue({ data: rowOne });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/institutions']}>
      <Routes>
        <Route path="/app/institutions" element={<InstitutionsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openCreate() {
  const trigger = await screen.findByRole('button', { name: 'إضافة مؤسسة' });
  await waitFor(() => expect(trigger).toHaveProperty('disabled', false));
  fireEvent.click(trigger);
  return screen.findByRole('dialog', { name: 'إضافة مؤسسة' });
}

describe('TASK-024 Institution list and create UI', () => {
  it('shows a loading state while the server list is pending', async () => {
    let resolveList!: (value: ReturnType<typeof page>) => void;
    listInstitutions.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    renderPage();
    expect(screen.getByText('جارٍ تحميل المؤسسات…')).toBeTruthy();
    resolveList(page());
    await waitFor(() => expect(screen.queryByText('جارٍ تحميل المؤسسات…')).toBeNull());
  });

  it('renders populated rows and server-reported total accessibly', async () => {
    listInstitutions.mockResolvedValueOnce(page([rowOne], null, 47));
    renderPage();
    expect(await screen.findByRole('cell', { name: 'مدرسة النور' })).toBeTruthy();
    expect(screen.getByText('إجمالي النتائج: 47')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'قائمة المؤسسات' })).toBeTruthy();
  });

  it('shows an empty state for an empty server result', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'لا توجد مؤسسات بعد' })).toBeTruthy();
  });

  it('shows a safe list error and retries the API request', async () => {
    listInstitutions.mockRejectedValueOnce(new Error('private transport details'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('تعذر تحميل المؤسسات'));
    expect(screen.queryByText(/private transport details/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await screen.findByRole('heading', { name: 'لا توجد مؤسسات بعد' });
    expect(listInstitutions).toHaveBeenCalledTimes(2);
  });

  it('sends q to the API and never filters rows in the browser', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'لا توجد مؤسسات بعد' });
    fireEvent.change(screen.getByRole('textbox', { name: 'البحث عن مؤسسة' }), { target: { value: 'مدرسة النور' } });
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }));
    await waitFor(() => expect(listInstitutions).toHaveBeenLastCalledWith({ q: 'مدرسة النور', cursor: undefined, limit: 25 }));
  });

  it('uses API cursors for next and previous page navigation and exposes total', async () => {
    listInstitutions.mockReset();
    listInstitutions.mockResolvedValueOnce(page([rowOne], 'cursor-next', 26));
    listInstitutions.mockResolvedValueOnce(page([{ ...rowOne, id: 'institution-2', name: 'مدرسة أخرى' }], null, 26));
    listInstitutions.mockResolvedValue(page([rowOne], 'cursor-next', 26));
    renderPage();
    await screen.findByRole('cell', { name: 'مدرسة النور' });
    expect(screen.getByText('إجمالي النتائج: 26')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(await screen.findByRole('cell', { name: 'مدرسة أخرى' })).toBeTruthy();
    await waitFor(() => expect(listInstitutions).toHaveBeenLastCalledWith({ q: '', cursor: 'cursor-next', limit: 25 }));
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(await screen.findByRole('cell', { name: 'مدرسة النور' })).toBeTruthy();
  });

  it('loads current District context and disables creation while it is pending', async () => {
    let resolveDistricts!: (value: typeof districtOne[]) => void;
    getCurrentDistricts.mockReturnValueOnce(new Promise((resolve) => { resolveDistricts = resolve; }));
    renderPage();
    expect(screen.getByRole('button', { name: 'إضافة مؤسسة' })).toHaveProperty('disabled', true);
    expect(await screen.findByText('جارٍ تحميل المقاطعات…')).toBeTruthy();
    resolveDistricts([districtOne]);
    expect(await screen.findByRole('button', { name: 'إضافة مؤسسة' })).toHaveProperty('disabled', false);
  });

  it('with zero current Districts explains why and prevents create without a UUID input', async () => {
    getCurrentDistricts.mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'لا توجد مقاطعة حالية متاحة' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إضافة مؤسسة' })).toHaveProperty('disabled', true);
    expect(screen.queryByLabelText(/معرّف المقاطعة|district/i)).toBeNull();
    expect(createInstitution).not.toHaveBeenCalled();
  });

  it('auto-selects and displays the sole current District, then creates successfully and refreshes the list', async () => {
    listInstitutions.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([rowOne], null, 1));
    renderPage();
    const dialog = await openCreate();
    expect(within(dialog).getByText('مقاطعة الشمال')).toBeTruthy();
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'اسم المؤسسة' }), { target: { value: 'مدرسة جديدة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المؤسسة' }));
    await screen.findByRole('heading', { name: 'تم إنشاء المؤسسة بنجاح.' });
    expect(createInstitution).toHaveBeenCalledWith({ districtId: districtOne.id, name: 'مدرسة جديدة' });
    expect(await screen.findByRole('cell', { name: 'مدرسة النور' })).toBeTruthy();
    await waitFor(() => expect(listInstitutions).toHaveBeenCalledTimes(2));
  });

  it('creates with optional email and exposes a minimal authorized email edit action', async () => {
    listInstitutions.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([{ ...rowOne, email: 'school@example.dz' }], null, 1));
    renderPage();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'اسم المؤسسة' }), { target: { value: 'مدرسة جديدة' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'البريد الإلكتروني' }), { target: { value: 'school@example.dz' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المؤسسة' }));
    await screen.findByRole('heading', { name: 'تم إنشاء المؤسسة بنجاح.' });
    expect(createInstitution).toHaveBeenCalledWith({ districtId: districtOne.id, name: 'مدرسة جديدة', email: 'school@example.dz' });
    await screen.findByRole('cell', { name: 'school@example.dz' });
    fireEvent.click(screen.getByRole('button', { name: 'تعديل البريد' }));
    const editDialog = screen.getByRole('dialog', { name: 'تعديل بريد المؤسسة' });
    fireEvent.change(within(editDialog).getByRole('textbox', { name: 'البريد الإلكتروني' }), { target: { value: 'new@example.dz' } });
    fireEvent.click(within(editDialog).getByRole('button', { name: 'حفظ البريد' }));
    await screen.findByRole('heading', { name: 'تم تحديث بريد المؤسسة بنجاح.' });
    expect(updateInstitution).toHaveBeenCalledWith('institution-1', { email: 'new@example.dz' });
  });

  it('allows selecting among multiple authorized Districts and requires a choice', async () => {
    getCurrentDistricts.mockResolvedValueOnce([districtOne, districtTwo]);
    renderPage();
    const dialog = await openCreate();
    const select = within(dialog).getByRole('combobox', { name: /المقاطعة/ }) as HTMLSelectElement;
    expect(select.value).toBe('');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'اسم المؤسسة' }), { target: { value: 'مدرسة جديدة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المؤسسة' }));
    expect(await within(dialog).findByText('اختر المقاطعة.')).toBeTruthy();
    expect(createInstitution).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: districtTwo.id } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المؤسسة' }));
    await screen.findByRole('heading', { name: 'تم إنشاء المؤسسة بنجاح.' });
    expect(createInstitution).toHaveBeenCalledWith({ districtId: districtTwo.id, name: 'مدرسة جديدة' });
  });

  it('handles District context errors safely and keeps create disabled', async () => {
    getCurrentDistricts.mockRejectedValueOnce(new Error('private details'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('تعذر تحميل المقاطعات المتاحة'));
    expect(screen.getByRole('button', { name: 'إضافة مؤسسة' })).toHaveProperty('disabled', true);
    expect(screen.queryByText(/private details/)).toBeNull();
  });

  it('provides client validation feedback before sending POST', async () => {
    renderPage();
    const dialog = await openCreate();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المؤسسة' }));
    expect(await within(dialog).findByText('أدخل اسم المؤسسة.')).toBeTruthy();
    expect(createInstitution).not.toHaveBeenCalled();
  });

  it('shows server validation and scope errors without technical details or identifiers', async () => {
    createInstitution.mockRejectedValueOnce(new ApiRequestError('تحقق من البيانات المدخلة.', { name: ['قيمة غير صالحة.'] }, 400));
    renderPage();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'اسم المؤسسة' }), { target: { value: 'اسم صالح' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المؤسسة' }));
    expect(await within(dialog).findByText('تحقق من البيانات المدخلة.')).toBeTruthy();
    expect(within(dialog).getByText('قيمة غير صالحة.')).toBeTruthy();

    createInstitution.mockRejectedValueOnce(new ApiRequestError('المورد غير موجود ضمن نطاق الوصول.', undefined, 404));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'اسم المؤسسة' }), { target: { value: 'مؤسسة خارج النطاق' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'إنشاء المؤسسة' }));
    expect(await within(dialog).findByText('المورد غير موجود ضمن نطاق الوصول.')).toBeTruthy();
    expect(within(dialog).queryByText(/district-1|stack|request-id/i)).toBeNull();
  });

  it('keeps Arabic RTL labels and exposes only API-supported create/email-edit actions', async () => {
    const { container } = renderPage();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    const search = screen.getByRole('textbox', { name: 'البحث عن مؤسسة' });
    search.focus();
    expect(document.activeElement).toBe(search);
    await openCreate();
    expect(screen.getByRole('textbox', { name: 'اسم المؤسسة' })).toBeTruthy();
    const buttonNames = screen.getAllByRole('button').map((button) => button.textContent ?? '').join(' ');
    expect(buttonNames).not.toMatch(/حذف|أرشفة|إلغاء الأرشفة/);
  });
});
