import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SessionPage } from './SessionPage';

const { getCurrentInspector, logout } = vi.hoisted(() => ({ getCurrentInspector: vi.fn(), logout: vi.fn() }));
vi.mock('./client', () => ({ getCurrentInspector, logout }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('inspector session page', () => {
  it('checks the session and logs out through the API client', async () => {
    getCurrentInspector.mockResolvedValueOnce({ id: 'inspector-id', email: 'inspector@example.invalid' });
    logout.mockResolvedValueOnce(undefined);
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app/*" element={<SessionPage />}>
            <Route index element={<h1>المؤسسات</h1>} />
          </Route>
          <Route path="/login" element={<h1>دخول المفتش</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'تسجيل الخروج' }));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(await screen.findByRole('heading', { name: 'دخول المفتش' })).toBeTruthy();
  });

  it('redirects when the session is absent', async () => {
    getCurrentInspector.mockResolvedValueOnce(null);
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app/*" element={<SessionPage />}>
            <Route index element={<h1>المؤسسات</h1>} />
          </Route>
          <Route path="/login" element={<h1>دخول المفتش</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'دخول المفتش' })).toBeTruthy();
  });

  it('renders the information-card print route authenticated but without the application shell', async () => {
    getCurrentInspector.mockResolvedValueOnce({ id: 'inspector-id', email: 'inspector@example.invalid' });
    render(
      <MemoryRouter initialEntries={['/app/teachers/teacher-1/information-card/print?academicYear=2026-2027']}>
        <Routes>
          <Route path="/app/*" element={<SessionPage />}>
            <Route path="teachers/:id/information-card/print" element={<h1>وثيقة الطباعة</h1>} />
          </Route>
          <Route path="/login" element={<h1>دخول المفتش</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'وثيقة الطباعة' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'مساحات العمل' })).toBeNull();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('does not render private shell navigation while the session is unresolved', async () => {
    let resolveSession: (identity: { id: string; email: string } | null) => void = () => undefined;
    getCurrentInspector.mockReturnValueOnce(new Promise((resolve) => { resolveSession = resolve; }));
    render(
      <MemoryRouter initialEntries={['/app/institutions']}>
        <Routes>
          <Route path="/app/*" element={<SessionPage />}><Route path="institutions" element={<h1>المؤسسات الخاصة</h1>} /></Route>
          <Route path="/login" element={<h1>دخول المفتش</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('navigation', { name: 'مساحات العمل' })).toBeNull();
    resolveSession({ id: 'inspector-id', email: 'inspector@example.invalid' });
    expect(await screen.findByRole('navigation', { name: 'مساحات العمل' })).toBeTruthy();
  });
});
