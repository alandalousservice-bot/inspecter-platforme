import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const rowOne = { id: 'institution-1', districtId: districtOne.id, name: 'مدرسة النور', externalCode: 'INS-104', municipality: 'وهران', address: 'حي النخيل، شارع المدرسة', directorPhone: '021234567', location: { latitude: '35.123456', longitude: '-0.123456', source: 'MANUAL_INSPECTOR' as const }, email: 'school@example.dz', archivedAt: null, createdAt: '', updatedAt: '' };
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
  vi.unstubAllGlobals();
});

function renderPage(path = '/app/institutions') {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
  it('uses a compact header and one results surface without redundant headings or detail links', async () => {
    listInstitutions.mockResolvedValueOnce(page([rowOne]));
    renderPage(); await screen.findByRole('row', { name: /مدرسة النور/u });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    for (const title of ['قائمة المؤسسات', 'البحث في المؤسسات', 'النتائج']) expect(screen.queryByRole('heading', { name: title })).toBeNull();
    expect(screen.queryByText(/في الخادم/)).toBeNull();
    expect(document.querySelector('.ui-card')).toBeNull();
    expect(document.querySelector('caption')?.className).toBe('ui-table__caption--accessible-only');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('preserves URL q and distinguishes filtered empty from errors without a zero failure count', async () => {
    renderPage('/app/institutions?q=النور');
    expect(await screen.findByRole('heading', { name: 'لا توجد نتائج مطابقة' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'البحث عن مؤسسة' })).toHaveProperty('value', 'النور');
    expect(listInstitutions).toHaveBeenCalledWith({ q: 'النور', cursor: undefined, limit: 25 });
    cleanup(); listInstitutions.mockRejectedValueOnce(new Error('private'));
    renderPage(); await screen.findByRole('heading', { name: 'تعذر تحميل المؤسسات' });
    expect(screen.getByText('إجمالي المؤسسات: غير متاح')).toBeTruthy();
    expect(screen.queryByText('إجمالي المؤسسات: 0')).toBeNull();
  });

  it('mounts single structured records with long Arabic/bidi metadata and switches without refetching', async () => {
    let change!: () => void;
    const media = { matches: true, addEventListener: vi.fn((_event, callback) => { change = callback; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', () => media);
    const longName = 'ابتدائية ذات اسم عربي طويل جدًا دون قص للهوية';
    listInstitutions.mockResolvedValueOnce(page([{ ...rowOne, name: longName }, { ...rowOne, id: 'institution-2', name: 'ابتدائية ثانية', email: null, directorPhone: null, location: null }]));
    renderPage(); await screen.findByRole('list', { name: 'قائمة المؤسسات' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByText(longName)).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(longName).closest('a')).toBeNull();
    expect(screen.getByText('لا يوجد بريد مسجل')).toBeTruthy();
    expect(screen.getByText(rowOne.email).closest('bdi')).toHaveProperty('dir', 'ltr');
    expect(screen.getByText(rowOne.directorPhone).closest('bdi')).toHaveProperty('dir', 'ltr');
    expect(screen.getAllByText(rowOne.address)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'تعديل البريد' })).toHaveLength(2);
    act(() => { media.matches = false; change(); });
    expect(screen.getByRole('table', { name: 'قائمة المؤسسات' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'قائمة المؤسسات' })).toBeNull();
    expect(listInstitutions).toHaveBeenCalledTimes(1);
  });

  it('preserves email clear and safe save failure behavior in the existing dialog', async () => {
    listInstitutions.mockResolvedValue(page([rowOne]));
    renderPage(); fireEvent.click(await screen.findByRole('button', { name: 'تعديل البريد' }));
    const dialog = screen.getByRole('dialog', { name: 'تعديل بريد المؤسسة' });
    const emailInput = within(dialog).getByRole('textbox', { name: 'البريد الإلكتروني' });
    fireEvent.change(emailInput, { target: { value: 'invalid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ البريد' }));
    expect(updateInstitution).not.toHaveBeenCalled();
    updateInstitution.mockRejectedValueOnce(new Error('private details'));
    fireEvent.change(emailInput, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ البريد' }));
    await waitFor(() => expect(within(dialog).getAllByText('تعذر تحديث البريد. تحقق من البيانات والصلاحيات ثم حاول مجددًا.').length).toBeGreaterThan(0));
    expect(updateInstitution).toHaveBeenCalledWith(rowOne.id, { email: null });
    expect(screen.queryByText('private details')).toBeNull();
  });
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
    expect(await screen.findByRole('row', { name: /مدرسة النور/u })).toBeTruthy();
    expect(screen.getByText('إجمالي المؤسسات: 47')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'قائمة المؤسسات' })).toBeTruthy();
    expect(screen.getByText('INS-104')).toBeTruthy();
    expect(screen.getByText('وهران')).toBeTruthy();
    expect(screen.getByText('حي النخيل، شارع المدرسة')).toBeTruthy();
    expect(screen.getByText('الموقع المعتمد للمؤسسة')).toBeTruthy();
    const coordinates = screen.getByText('35.123456, -0.123456');
    expect(coordinates.closest('bdi')?.getAttribute('dir')).toBe('ltr');
    const email = screen.getByText('school@example.dz');
    expect(email.closest('bdi')?.getAttribute('dir')).toBe('ltr');
    const phone = screen.getByText('021234567');
    expect(phone.closest('bdi')?.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText('مدرسة النور').closest('a')).toBeNull();
    expect(screen.getByText('مدرسة النور').closest('strong')).toBeTruthy();
  });

  it('presents absent canonical coordinates as informational, not an error', async () => {
    listInstitutions.mockResolvedValueOnce(page([{ ...rowOne, location: null }]));
    renderPage();
    await screen.findByRole('row', { name: /مدرسة النور/u });
    expect(screen.getByText('لا يوجد موقع معتمد مسجل')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
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
    expect(screen.getByText('إجمالي المؤسسات: غير متاح')).toBeTruthy();
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
    await screen.findByRole('row', { name: /مدرسة النور/u });
    expect(screen.getByText('إجمالي المؤسسات: 26')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(await screen.findByRole('row', { name: /مدرسة أخرى/u })).toBeTruthy();
    await waitFor(() => expect(listInstitutions).toHaveBeenLastCalledWith({ q: '', cursor: 'cursor-next', limit: 25 }));
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(await screen.findByRole('row', { name: /مدرسة النور/u })).toBeTruthy();
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
    expect(await screen.findByRole('row', { name: /مدرسة النور/u })).toBeTruthy();
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
    expect(await screen.findByText('school@example.dz')).toBeTruthy();
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
