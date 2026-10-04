import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { DashboardSummary } from './auth/client';
import { AppRoutes } from './AppRoutes';

const mocks = vi.hoisted(() => ({
  login: vi.fn(), getCurrentInspector: vi.fn(), getDashboardSummary: vi.fn(), getTeacherInformationCard: vi.fn(),
}));
vi.mock('./auth/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('./auth/client')>()), ...mocks }));

const summary: DashboardSummary = {
  asOf: '2026-10-02T09:00:00.000Z', today: '2026-10-02',
  attention: {
    pendingSubmissions: { total: 0, items: [] },
    ownedFollowUps: { overdueTotal: 0, dueTodayTotal: 0, items: [] },
    reports: { draftTotal: 0, completedVisitWithoutReportTotal: 0, items: [] },
  },
  upcomingVisits: [],
};

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentInspector.mockResolvedValue({ id: 'inspector-1', email: 'inspector@example.invalid' });
  mocks.getDashboardSummary.mockResolvedValue({ data: summary });
  mocks.getTeacherInformationCard.mockRejectedValue(new Error('unavailable'));
});
afterEach(cleanup);

describe('application route integration', () => {
  it('renders a public Inspector landing page at / and links to login without session access', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'منصة مفتش التربية البدنية والرياضية', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'دخول فضاء المفتش' }).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('heading', { name: 'كل ما تحتاجه لمتابعة مهامك', level: 2 })).toBeTruthy();
    expect(mocks.getCurrentInspector).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(document.querySelector('.app-sidebar')).toBeNull();
    expect(document.querySelector('.app-topbar')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'دخول فضاء المفتش' }));
    expect(screen.getByRole('heading', { name: 'دخول فضاء المفتش', level: 1 })).toBeTruthy();
    expect(mocks.getCurrentInspector).not.toHaveBeenCalled();
  });

  it('lands successful login at the authenticated Dashboard in AppShell', async () => {
    mocks.login.mockResolvedValue({ id: 'inspector-1', email: 'inspector@example.invalid' });
    renderAt('/login');
    fireEvent.change(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }), { target: { value: 'inspector@example.invalid' } });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/u), { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    expect(await screen.findByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeTruthy();
    expect(await screen.findByRole('navigation', { name: 'مساحات العمل' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'لوحة المتابعة' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(mocks.getDashboardSummary).toHaveBeenCalledTimes(1);
  });

  it('renders /app as Dashboard after resolving the existing inspector session', async () => {
    renderAt('/app');
    expect(await screen.findByRole('heading', { name: 'لوحة المتابعة', level: 1 })).toBeTruthy();
    expect(mocks.getCurrentInspector).toHaveBeenCalledTimes(1);
  });

  it('keeps public intake outside the authenticated shell', () => {
    renderAt('/public/d/11111111-1111-4111-8111-111111111111/register');
    expect(screen.getByRole('main')).toBeTruthy();
    expect(document.querySelector('.app-sidebar')).toBeNull();
    expect(document.querySelector('.app-topbar')).toBeNull();
  });

  it('keeps the TASK-086 print route outside AppShell and application page container', async () => {
    renderAt('/app/teachers/teacher-1/information-card/print');
    await waitFor(() => expect(mocks.getCurrentInspector).toHaveBeenCalled());
    expect(document.querySelector('.app-sidebar')).toBeNull();
    expect(document.querySelector('.app-topbar')).toBeNull();
    expect(document.querySelector('.ui-page')).toBeNull();
    expect(document.querySelector('.dashboard-page')).toBeNull();
  });
});
