import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AppShell } from '../ui/AppShell';
import type { DashboardSummary } from '../auth/client';
import { DashboardPage } from './DashboardPage';

const { getDashboardSummary } = vi.hoisted(() => ({ getDashboardSummary: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/client')>(),
  getDashboardSummary,
}));

const populated: DashboardSummary = {
  asOf: '2026-10-02T09:00:00.000Z', today: '2026-10-02',
  attention: {
    pendingSubmissions: { total: 8, items: [{ id: 'submission-1', submittedAt: '2026-10-02T08:00:00.000Z' }] },
    ownedFollowUps: {
      overdueTotal: 4, dueTodayTotal: 2,
      items: [
        { id: 'follow-up-1', dueDate: '2026-10-01', alertState: 'OVERDUE' },
        { id: 'follow-up-2', dueDate: '2026-10-02', alertState: 'DUE_TODAY' },
      ],
    },
    reports: {
      draftTotal: 1, completedVisitWithoutReportTotal: 5,
      items: [
        { visitId: 'visit-draft', reportId: 'report-1', kind: 'DRAFT_REPORT', referenceAt: '2026-10-02T08:30:00.000Z' },
        { visitId: 'visit-no-report', reportId: null, kind: 'NO_REPORT', referenceAt: '2026-10-01T08:30:00.000Z' },
      ],
    },
  },
  upcomingVisits: [
    { id: 'visit-next', scheduledStartAt: '2026-10-03T08:00:00.000Z', scheduledEndAt: '2026-10-03T09:00:00.000Z', visitType: 'GUIDANCE', institutionName: 'ابتدائية النور' },
    { id: 'visit-legacy', scheduledStartAt: '2026-10-04T08:00:00.000Z', scheduledEndAt: '2026-10-04T09:00:00.000Z', visitType: null, institutionName: 'ابتدائية الأمل' },
  ],
};

function renderDashboard() {
  return render(<MemoryRouter><AppShell inspector={{ id: 'inspector-1', email: 'inspector@example.invalid' }}><DashboardPage /></AppShell></MemoryRouter>);
}

function emptySummary(): DashboardSummary {
  return {
    asOf: '2026-10-02T09:00:00.000Z', today: '2026-10-02',
    attention: {
      pendingSubmissions: { total: 0, items: [] },
      ownedFollowUps: { overdueTotal: 0, dueTodayTotal: 0, items: [] },
      reports: { draftTotal: 0, completedVisitWithoutReportTotal: 0, items: [] },
    },
    upcomingVisits: [],
  };
}

beforeEach(() => getDashboardSummary.mockReset());
afterEach(cleanup);

describe('TASK-070B Dashboard presentation', () => {
  it('shows loading before data and does not fabricate zero counts', async () => {
    let resolveRequest: ((value: { data: DashboardSummary }) => void) | undefined;
    getDashboardSummary.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    renderDashboard();
    expect(screen.getByText('جارٍ تحميل لوحة المتابعة…')).toBeTruthy();
    expect(screen.queryByText('المتابعات المتأخرة: 0')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    resolveRequest?.({ data: emptySummary() });
    expect(await screen.findByText('لا توجد عناصر تحتاج انتباهك حاليًا.')).toBeTruthy();
  });

  it('renders exact operational totals, links, visit labels, freshness and priority order', async () => {
    getDashboardSummary.mockResolvedValue({ data: populated });
    renderDashboard();
    const heading = await screen.findByRole('heading', { name: 'لوحة المتابعة', level: 1 });
    expect(heading).toBeTruthy();
    expect(screen.getByText('مساحة عمل المفتش')).toBeTruthy();
    expect(heading.closest('.dashboard-hero')).toBeTruthy();
    expect(heading.closest('.dashboard-page')?.getAttribute('dir')).toBe('rtl');
    expect(screen.getByText('آخر تحديث:')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'طلب وارد' }).getAttribute('href')).toBe('/app/submissions/submission-1');
    expect(screen.getByRole('link', { name: 'فتح مسودة التقرير' }).getAttribute('href')).toBe('/app/visits/visit-draft/report');
    expect(screen.getByRole('link', { name: 'عرض الزيارة' }).getAttribute('href')).toBe('/app/visits/visit-no-report');
    expect(screen.getByText('متأخرة')).toBeTruthy();
    expect(screen.getByText('مستحقة اليوم')).toBeTruthy();
    expect(screen.getByText('زيارة توجيهية / تكوينية')).toBeTruthy();
    expect(screen.getByText('نوع الزيارة غير موثق (سجل سابق)')).toBeTruthy();
    expect(screen.getByText('ابتدائية النور')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'عرض تفاصيل الزيارة' })[0].getAttribute('href')).toBe('/app/visits/visit-next');
    const sectionNames = screen.getAllByRole('heading', { level: 2 }).map((item) => item.textContent);
    expect(sectionNames).toEqual(['يحتاج انتباهك', 'الزيارات القادمة', 'إجراءات سريعة']);
    for (const [name, count] of [
      ['المتابعات المتأخرة', '4'], ['المتابعات المستحقة اليوم', '2'], ['طلبات الأساتذة المعلقة', '8'],
      ['مسودات التقارير', '1'], ['زيارات مكتملة بلا تقرير', '5'],
    ]) {
      const card = screen.getByRole('region', { name: `${name}: ${count}` });
      expect(within(card).getByText(count)).toBeTruthy();
      expect(within(card).getByRole('link', { name: `عرض القسم: ${name}` })).toBeTruthy();
    }
    expect(getDashboardSummary).toHaveBeenCalledTimes(1);
  });

  it('keeps stable zero categories and positively presents an entirely empty response', async () => {
    getDashboardSummary.mockResolvedValue({ data: emptySummary() });
    renderDashboard();
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByText('لا توجد عناصر تحتاج انتباهك حاليًا.')).toBeTruthy();
    expect(screen.getByText('لا توجد عناصر تحتاج انتباهك حاليًا.').closest('[role="status"]')?.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'لا توجد زيارات قادمة' })).toBeTruthy();
    for (const label of ['المتابعات المتأخرة', 'المتابعات المستحقة اليوم', 'طلبات الأساتذة المعلقة', 'مسودات التقارير', 'زيارات مكتملة بلا تقرير']) {
      expect(screen.getByRole('region', { name: `${label}: 0` })).toBeTruthy();
    }
    expect(screen.queryByText(/مباشر|لحظي/u)).toBeNull();
  });

  it('shows a safe error rather than zeros and retries only the aggregate request', async () => {
    getDashboardSummary.mockRejectedValueOnce(new Error('private backend details'))
      .mockResolvedValueOnce({ data: emptySummary() });
    renderDashboard();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('تعذر تحميل لوحة المتابعة')).toBeTruthy();
    expect(screen.getByRole('alert').parentElement?.querySelector('.dashboard-feedback__icon svg[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByText('لا توجد عناصر تحتاج انتباهك حاليًا.')).toBeNull();
    expect(screen.queryByText('private backend details')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByText('لا توجد عناصر تحتاج انتباهك حاليًا.')).toBeTruthy();
    expect(getDashboardSummary).toHaveBeenCalledTimes(2);
  });

  it('manual refresh explicitly refetches the aggregate endpoint', async () => {
    getDashboardSummary.mockResolvedValue({ data: emptySummary() });
    renderDashboard();
    await screen.findByText('لا توجد عناصر تحتاج انتباهك حاليًا.');
    fireEvent.click(screen.getByRole('button', { name: 'تحديث اللوحة' }));
    await screen.findByText('لا توجد عناصر تحتاج انتباهك حاليًا.');
    expect(getDashboardSummary).toHaveBeenCalledTimes(2);
  });

  it('exposes only approved quick navigation and no analytics or decision actions', async () => {
    getDashboardSummary.mockResolvedValue({ data: populated });
    renderDashboard();
    await screen.findByRole('heading', { name: 'لوحة المتابعة', level: 1 });
    const quickNav = screen.getByRole('navigation', { name: 'إجراءات سريعة' });
    expect([...quickNav.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
      '/app/visits/new', '/app/teachers', '/app/submissions', '/app/follow-ups',
    ]);
    expect(screen.queryByText(/النشاط الأخير|تقدم أسبوعي|تقدم شهري|ترتيب الأساتذة|متوسط العلامات|توصيات آلية/u)).toBeNull();
    expect(screen.queryByRole('button', { name: /قبول|رفض/u })).toBeNull();
  });
});
