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
          <Route path="/app" element={<SessionPage />} />
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
          <Route path="/app" element={<SessionPage />} />
          <Route path="/login" element={<h1>دخول المفتش</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'دخول المفتش' })).toBeTruthy();
  });
});
