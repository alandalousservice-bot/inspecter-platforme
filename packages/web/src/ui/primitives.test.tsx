import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Card, CardContent, CardHeader } from './Card';
import { DataTable } from './DataTable';
import { Dialog } from './Dialog';
import { Input, Select, Textarea } from './Input';
import { EmptyState, ErrorState, LoadingState, SuccessState } from './States';
import { StatusBadge } from './StatusBadge';

afterEach(() => cleanup());

function mockNativeDialog() {
  const showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  const close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });
  return { showModal, close };
}

describe('shared UI primitives', () => {
  it('supports semantic button variants, sizes, and stable native behavior', () => {
    render(
      <>
        <Button>حفظ</Button>
        <Button variant="secondary" disabled>إلغاء</Button>
        <Button variant="danger">حذف</Button>
        <Button variant="ghost" size="compact">رجوع</Button>
        <Button variant="subtle">توافق قديم</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'حفظ' }).getAttribute('type')).toBe('button');
    expect(screen.getByRole('button', { name: 'حفظ' }).className).toContain('ui-button--primary');
    expect((screen.getByRole('button', { name: 'إلغاء' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'حذف' }).className).toContain('ui-button--danger');
    expect(screen.getByRole('button', { name: 'رجوع' }).className).toContain('ui-button--compact');
    expect(screen.getByRole('button', { name: 'توافق قديم' }).className).toContain('ui-button--ghost');
  });

  it('prevents duplicate activation while a button is loading and keeps its accessible label', () => {
    render(<Button loading>جارٍ الحفظ</Button>);
    const button = screen.getByRole('button', { name: 'جارٍ الحفظ' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('connects input labels, helper and invalid messages while preserving disabled/read-only states', () => {
    render(
      <>
        <Input id="teacher-name" label="الاسم" hint="اكتب الاسم كما في الوثيقة" error="الاسم مطلوب" required />
        <Input id="readonly" label="قيمة للقراءة" readOnly value="ABC-12" />
        <Input id="disabled" label="معطل" disabled />
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'الاسم' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('dir')).toBe('auto');
    expect(input.getAttribute('aria-describedby')).toContain('teacher-name-hint');
    expect(input.getAttribute('aria-describedby')).toContain('teacher-name-error');
    expect(screen.getByRole('alert').textContent).toBe('الاسم مطلوب');
    expect((screen.getByRole('textbox', { name: 'قيمة للقراءة' }) as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByRole('textbox', { name: 'معطل' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('provides native RTL select and textarea with the shared field feedback contract', () => {
    render(
      <>
        <Select id="district" label="المقاطعة" error="اختر مقاطعة" required><option value="">اختر</option></Select>
        <Textarea id="note" label="ملاحظة" hint="نص عربي" defaultValue="أحمد@example.invalid" />
      </>,
    );
    const select = screen.getByRole('combobox', { name: 'المقاطعة' });
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('dir')).toBe('auto');
    expect(select.className).toContain('ui-select');
    const textarea = screen.getByRole('textbox', { name: 'ملاحظة' });
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.getAttribute('aria-describedby')).toContain('note-hint');
    expect(textarea.getAttribute('dir')).toBe('auto');
  });

  it('renders a calm surface card with heading, description, action and content', () => {
    render(
      <Card>
        <CardHeader title="ملخص" description="بيانات الفترة" action={<Button>عرض</Button>} />
        <CardContent>المحتوى</CardContent>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'ملخص' })).toBeTruthy();
    expect(screen.getByText('بيانات الفترة')).toBeTruthy();
    expect(screen.getByText('المحتوى')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'عرض' })).toBeTruthy();
  });

  it('renders status text and explicit presentation tone without exposing a domain enum', () => {
    render(<StatusBadge tone="warning">قيد الانتظار</StatusBadge>);
    const badge = screen.getByText('قيد الانتظار');
    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain('ui-status-badge--warning');
  });

  it('initially focuses dialog content, handles Escape through the controlled callback, and returns focus', () => {
    const { showModal } = mockNativeDialog();
    const onClose = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">افتح الحوار</button>
        <Dialog open={false} title="تأكيد" description="راجع البيانات" onClose={onClose} onCancel={onCancel}>
          <input aria-label="حقل الحوار" />
        </Dialog>
      </>,
    );
    const opener = screen.getByRole('button', { name: 'افتح الحوار' });
    opener.focus();
    rerender(
      <>
        <button type="button">افتح الحوار</button>
        <Dialog open title="تأكيد" description="راجع البيانات" onClose={onClose} onCancel={onCancel}>
          <input aria-label="حقل الحوار" />
        </Dialog>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'تأكيد' });
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'حقل الحوار' }));

    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(dialog.hasAttribute('open')).toBe(true);

    dialog.dispatchEvent(new Event('close'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it('supports distinct no-data and no-filter-results states plus safe retry/success feedback', () => {
    const retry = vi.fn();
    const { rerender } = render(<LoadingState label="تحميل السجلات" />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');

    rerender(<EmptyState kind="no-data" title="لا توجد سجلات بعد" description="ابدأ بإضافة سجل." />);
    expect(screen.getByRole('region', { name: 'لا توجد سجلات بعد' }).getAttribute('data-kind')).toBe('no-data');

    rerender(<EmptyState kind="no-results" title="لا توجد نتائج مطابقة" description="غيّر عوامل البحث." />);
    expect(screen.getByRole('region', { name: 'لا توجد نتائج مطابقة' }).getAttribute('data-kind')).toBe('no-results');

    rerender(<ErrorState description="تحقق من الاتصال ثم أعد المحاولة." action={<Button onClick={retry}>إعادة المحاولة</Button>} />);
    expect(screen.getByRole('alert').textContent).toContain('تحقق من الاتصال');
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<SuccessState title="تم الحفظ" />);
    expect(screen.getByRole('status').textContent).toContain('تم الحفظ');
  });

  it('preserves the existing accessible table contract and useful empty content', () => {
    const columns = [{ id: 'name', header: 'الاسم', render: (row: { id: string; name: string }) => row.name }];
    const { rerender } = render(
      <DataTable caption="قائمة الأساتذة" columns={columns} rows={[{ id: 't-1', name: 'أحمد' }]} rowKey={(row) => row.id} />,
    );
    expect(screen.getByRole('table', { name: 'قائمة الأساتذة' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'الاسم' }).getAttribute('scope')).toBe('col');
    expect(screen.getByRole('cell').textContent).toBe('أحمد');
    rerender(<DataTable caption="قائمة الأساتذة" columns={columns} rows={[]} rowKey={(row) => row.id} />);
    expect(screen.getByRole('heading', { name: 'لا توجد بيانات لعرضها' })).toBeTruthy();
  });
});
