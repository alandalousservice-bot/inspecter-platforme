import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { Button } from './Button';
import { DataTable } from './DataTable';
import { DetailList, FilterBar, FormGrid, FormGridFull, FormSection, PageContainer, PageHeader, Pagination } from './PageSystem';

afterEach(() => cleanup());

describe('G6-04 page system', () => {
  it('composes a single page heading, contextual description and action hierarchy', () => {
    render(<PageContainer><PageHeader eyebrow="إدارة" title="دليل الأساتذة" description="وصف الصفحة" primaryAction={<Button>إضافة</Button>} secondaryActions={<Button variant="secondary">تصدير</Button>} /></PageContainer>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('وصف الصفحة')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إضافة' }).className).toContain('ui-button--primary');
    expect(screen.getByRole('button', { name: 'تصدير' }).className).toContain('ui-button--secondary');
    expect(document.querySelector('.ui-page')).toBeTruthy();
  });

  it('renders semantic breadcrumbs with a current item and safe long labels', () => {
    render(<MemoryRouter><PageHeader title="ملف الأستاذ" breadcrumbs={[{ label: 'دليل الأساتذة', to: '/app/teachers' }, { label: 'اسم عربي طويل للعرض الحالي', to: '/ignored' }]} /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'مسار التنقل' });
    expect(nav.querySelector('a[href="/app/teachers"]')).toBeTruthy();
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('اسم عربي طويل للعرض الحالي');
    expect(nav.querySelector('[aria-current="page"] a')).toBeNull();
  });

  it('groups existing filters and preserves explicit reset/apply semantics', () => {
    const reset = vi.fn(); const apply = vi.fn();
    render(<FilterBar title="البحث والمرشحات" description="مرشحات خادمية" actions={<><Button variant="secondary" onClick={reset}>مسح</Button><Button onClick={apply}>تطبيق</Button></>}><label>البحث<input aria-label="البحث" /></label></FilterBar>);
    fireEvent.click(screen.getByRole('button', { name: 'مسح' })); fireEvent.click(screen.getByRole('button', { name: 'تطبيق' }));
    expect(screen.getByRole('region', { name: 'البحث والمرشحات' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'البحث' })).toBeTruthy();
    expect(reset).toHaveBeenCalledOnce(); expect(apply).toHaveBeenCalledOnce();
  });

  it('provides semantic form sections and reusable responsive grid hooks', () => {
    render(<FormSection title="البيانات الشخصية" description="تفاصيل أساسية"><FormGrid><label>الاسم<input /></label><FormGridFull><label>ملاحظة<textarea /></label></FormGridFull></FormGrid></FormSection>);
    expect(screen.getByRole('region', { name: 'البيانات الشخصية' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'البيانات الشخصية' })).toBeTruthy();
    expect(document.querySelector('.ui-form-grid__full')).toBeTruthy();
  });

  it('renders read-only description facts with neutral empties and bidi isolation', () => {
    render(<DetailList items={[{ label: 'البريد', value: 'teacher@example.invalid' }, { label: 'الهاتف', value: null }]} />);
    expect(screen.getByText('البريد').tagName).toBe('DT');
    const email = screen.getByText('teacher@example.invalid');
    expect(email.tagName).toBe('BDI'); expect(email.getAttribute('dir')).toBe('auto');
    expect(screen.getByText('غير متوفر')).toBeTruthy();
  });

  it('keeps table headers, status/actions, distinct empty states, loading, error and overflow access', () => {
    const columns = [
      { id: 'name', header: 'الأستاذ', render: (row: { id: string; name: string }) => row.name },
      { id: 'actions', header: 'الإجراءات', render: () => <Button variant="secondary">عرض</Button> },
    ];
    const row = { id: '1', name: 'أحمد' };
    const { rerender } = render(<DataTable caption="دليل الأساتذة" columns={columns} rows={[row]} rowKey={(item) => item.id} />);
    expect(screen.getByRole('columnheader', { name: 'الأستاذ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'عرض' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'دليل الأساتذة' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByText(/يمكن تمرير الجدول أفقيًا/u)).toBeTruthy();
    rerender(<DataTable caption="دليل الأساتذة" columns={columns} rows={[]} rowKey={(item) => item.id} state={{ kind: 'empty', resultKind: 'no-results', title: 'لا توجد نتائج' }} />);
    expect(screen.getByRole('region', { name: 'لا توجد نتائج' }).getAttribute('data-kind')).toBe('no-results');
    rerender(<DataTable caption="دليل الأساتذة" columns={columns} rows={[]} rowKey={(item) => item.id} state={{ kind: 'empty', resultKind: 'no-data', title: 'لا توجد سجلات' }} />);
    expect(screen.getByRole('region', { name: 'لا توجد سجلات' }).getAttribute('data-kind')).toBe('no-data');
    rerender(<DataTable caption="دليل الأساتذة" columns={columns} rows={[]} rowKey={(item) => item.id} state={{ kind: 'loading', label: 'جارٍ التحميل' }} />);
    expect(screen.getByRole('status').textContent).toContain('جارٍ التحميل');
    rerender(<DataTable caption="دليل الأساتذة" columns={columns} rows={[]} rowKey={(item) => item.id} state={{ kind: 'error', title: 'تعذر التحميل', action: <Button>إعادة المحاولة</Button> }} />);
    expect(screen.getByRole('alert').textContent).toContain('تعذر التحميل');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy();
  });

  it('standardizes cursor pagination with accessible labels and disabled boundaries', () => {
    const previous = vi.fn(); const next = vi.fn();
    render(<Pagination label="صفحات الأساتذة" currentPage={2} rangeStart={26} rangeEnd={50} total={61} hasPrevious hasNext onPrevious={previous} onNext={next} />);
    const nav = screen.getByRole('navigation', { name: 'صفحات الأساتذة' });
    expect(nav.textContent).toContain('26–50 من 61');
    fireEvent.click(screen.getByRole('button', { name: 'السابق' })); fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(previous).toHaveBeenCalledOnce(); expect(next).toHaveBeenCalledOnce();
    cleanup();
    render(<Pagination label="صفحات الأساتذة" currentPage={1} hasPrevious={false} hasNext={false} onPrevious={previous} onNext={next} />);
    expect((screen.getByRole('button', { name: 'السابق' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'التالي' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
