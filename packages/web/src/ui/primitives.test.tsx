import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Card, CardContent, CardHeader } from './Card';
import { DataTable } from './DataTable';
import { Dialog } from './Dialog';
import { Input } from './Input';
import { EmptyState, ErrorState, LoadingState, SuccessState } from './States';

afterEach(() => {
  cleanup();
});

describe('shared UI primitives', () => {
  it('exposes button variants, native disabled behavior, and a stable default type', () => {
    render(
      <>
        <Button>حفظ</Button>
        <Button variant="secondary" disabled>
          إلغاء
        </Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'حفظ' }).getAttribute('type')).toBe('button');
    expect(screen.getByRole('button', { name: 'حفظ' }).className).toContain('ui-button--primary');
    expect((screen.getByRole('button', { name: 'إلغاء' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('connects input label, hint, and validation error accessibly', () => {
    render(<Input id="teacher-name" label="الاسم" hint="اكتب الاسم كما في الوثيقة" error="الاسم مطلوب" />);

    const input = screen.getByRole('textbox', { name: 'الاسم' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('dir')).toBe('auto');
    expect(input.getAttribute('aria-describedby')).toContain('teacher-name-hint');
    expect(input.getAttribute('aria-describedby')).toContain('teacher-name-error');
    expect(screen.getByRole('alert').textContent).toBe('الاسم مطلوب');
  });

  it('renders card heading, description, action, and content regions', () => {
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

  it('opens a semantic dialog and reports its close event', () => {
    const onClose = vi.fn();
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    });

    render(
      <Dialog open title="تأكيد" onClose={onClose}>
        محتوى الحوار
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'تأكيد' });
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.textContent).toContain('محتوى الحوار');
    dialog.dispatchEvent(new Event('close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('provides accessible loading, empty, error, and success feedback', () => {
    const { rerender } = render(<LoadingState label="تحميل السجلات" />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');

    rerender(<EmptyState title="لا توجد نتائج" description="غيّر عوامل البحث" />);
    expect(screen.getByRole('heading', { name: 'لا توجد نتائج' })).toBeTruthy();

    rerender(<ErrorState description="حاول مجددًا" />);
    expect(screen.getByRole('alert').textContent).toContain('حاول مجددًا');

    rerender(<SuccessState title="تم الحفظ" />);
    expect(screen.getByRole('status').textContent).toContain('تم الحفظ');
  });

  it('renders an accessible table and a useful empty state', () => {
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
