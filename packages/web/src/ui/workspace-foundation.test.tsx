import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, DataTable, EmptyState, ErrorState, FilterBar, Input, LoadingState, PageHeader, RecordList, RecordRow, SecondaryControls, StatusBadge, WorkspaceStack } from './index';

afterEach(cleanup);

describe('G9 workspace presentation foundation', () => {
  it('keeps old header presentation and makes compact semantic header opt-in', () => {
    const { rerender } = render(<PageHeader title="المؤسسات" />);
    expect(screen.getByRole('banner').getAttribute('data-presentation')).toBe('default');
    rerender(<PageHeader variant="compact" title="دليل الأساتذة" description="سياق موجز"
      primaryAction={<Button>إضافة</Button>} secondaryActions={<Button variant="secondary">عودة</Button>} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('banner').getAttribute('data-presentation')).toBe('compact');
    expect(screen.getByRole('button', { name: 'إضافة' }).className).toContain('primary');
    expect(screen.getByRole('button', { name: 'عودة' }).className).toContain('secondary');
  });

  it.each(['compact', 'operational', 'document'] as const)('composes optional layers in %s without a main, card or extra heading', (density) => {
    const { container } = render(<WorkspaceStack density={density}><p>سياق</p><p>محتوى</p></WorkspaceStack>);
    expect(container.firstElementChild?.getAttribute('data-density')).toBe(density);
    expect(container.querySelector('main, h1, .ui-card')).toBeNull();
  });

  it('leaves search, reset, active filters and count entirely consumer owned', () => {
    const change = vi.fn(); const reset = vi.fn();
    render(<FilterBar variant="workspace" summary={<span>180 نتيجة</span>} activeFilters={<span>مرشح نشط</span>}
      actions={<Button onClick={reset}>مسح</Button>}><Input id="search" label="البحث" onChange={change} /></FilterBar>);
    fireEvent.change(screen.getByLabelText('البحث'), { target: { value: 'أحمد' } });
    fireEvent.click(screen.getByRole('button', { name: 'مسح' }));
    expect(change).toHaveBeenCalledOnce(); expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByText('180 نتيجة')).toBeTruthy();
    expect(screen.getByText('مرشح نشط')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('exposes disclosure state and consumer indicator without inventing filters', () => {
    render(<SecondaryControls label="مرشحات إضافية" activeIndicator={<span>مرشحان نشطان</span>}><Input id="secondary" label="السنة" /></SecondaryControls>);
    const trigger = screen.getByRole('button', { name: 'مرشحات إضافية' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.getElementById(trigger.getAttribute('aria-controls') ?? '')?.hidden).toBe(true);
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('السنة')).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('never hides consumer-declared validation errors', () => {
    const { rerender } = render(<SecondaryControls label="خيارات إضافية"><Input id="extra" label="قيمة" /></SecondaryControls>);
    rerender(<SecondaryControls label="خيارات إضافية" hasErrors><Input id="extra" label="قيمة" error="راجع القيمة" /></SecondaryControls>);
    expect(screen.getByRole('alert').textContent).toBe('راجع القيمة');
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('uses named lists and non-interactive rows with independent links and actions', () => {
    const action = vi.fn();
    render(<div dir="rtl"><RecordList label="سجلات الاختبار" density="compact"><RecordRow
      identity={<a href="/existing">اسم أستاذ عربي طويل جدًا للاختبار دون قطع أو تحويل إلى بطاقة</a>}
      context="مؤسسة حالية" metadata={<><bdi dir="auto">test@example.invalid</bdi><bdi dir="auto">+213555123456</bdi></>}
      status={<StatusBadge tone="success">نشط</StatusBadge>} temporal={<bdi dir="auto">2026/10/04</bdi>}
      actions={<Button variant="secondary" onClick={action}>إجراء</Button>} /></RecordList></div>);
    const list = screen.getByRole('list', { name: 'سجلات الاختبار' });
    const row = within(list).getByRole('listitem');
    expect(row.tagName).toBe('LI'); expect(row.hasAttribute('tabindex')).toBe(false);
    expect(within(row).getByRole('link').getAttribute('href')).toBe('/existing');
    expect(row.querySelectorAll('bdi[dir="auto"]')).toHaveLength(3);
    fireEvent.click(within(row).getByRole('button'));
    expect(action).toHaveBeenCalledOnce();
  });

  it('keeps compact loading, no-data, filtered-empty and error/retry distinct', () => {
    const retry = vi.fn();
    const { rerender } = render(<LoadingState compact />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    rerender(<EmptyState compact title="لا توجد بيانات" />);
    expect(screen.getByRole('region').getAttribute('data-kind')).toBe('no-data');
    rerender(<EmptyState compact kind="no-results" title="لا توجد نتائج مطابقة" />);
    expect(screen.getByRole('region').getAttribute('data-kind')).toBe('no-results');
    rerender(<ErrorState compact description="تعذر التحميل" action={<Button onClick={retry}>إعادة المحاولة</Button>} />);
    expect(screen.getByRole('alert').getAttribute('data-presentation')).toBe('compact');
    fireEvent.click(screen.getByRole('button'));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('preserves an accessible table caption when its visible repetition is opted out', () => {
    render(<DataTable caption="سجلات" captionVisibility="accessible-only" rows={['1']} rowKey={(row) => row}
      columns={[{ id: 'name', header: 'الاسم', render: () => 'اسم' }]} />);
    expect(screen.getByRole('table', { name: 'سجلات' })).toBeTruthy();
    expect(screen.getByText('سجلات', { selector: 'caption' }).className).toBe('ui-table__caption--accessible-only');
    expect(screen.getByRole('columnheader').getAttribute('scope')).toBe('col');
  });
});
