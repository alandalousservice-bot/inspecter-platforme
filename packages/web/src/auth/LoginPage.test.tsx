import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LoginPage } from './LoginPage';

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('./client', () => ({ login }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<h1>مساحة العمل</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('inspector login page', () => {
  it('uses the public RTL surface with one heading and accessible login controls', () => {
    const { container } = renderLogin();
    expect(container.querySelector('main[dir="rtl"]')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }).getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText(/كلمة المرور/).getAttribute('autocomplete')).toBe('current-password');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'تسجيل الخروج' })).toBeNull();
  });

  it('submits credentials and navigates after success', async () => {
    login.mockResolvedValueOnce({ id: 'inspector-id', email: 'inspector@example.invalid' });
    renderLogin();
    fireEvent.change(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }), { target: { value: 'inspector@example.invalid' } });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/), { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('inspector@example.invalid', 'synthetic-password'));
    expect(await screen.findByRole('heading', { name: 'مساحة العمل' })).toBeTruthy();
  });

  it('prevents duplicate submission while pending', async () => {
    let finishLogin: ((value: unknown) => void) | undefined;
    login.mockImplementationOnce(() => new Promise((resolve) => { finishLogin = resolve; }));
    renderLogin();
    fireEvent.change(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }), { target: { value: 'inspector@example.invalid' } });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/), { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    const pendingButton = screen.getByRole('button', { name: 'جارٍ التحقق…' }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);
    expect(pendingButton.getAttribute('aria-busy')).toBe('true');
    finishLogin?.(undefined);
    expect(await screen.findByRole('heading', { name: 'مساحة العمل' })).toBeTruthy();
  });

  it('shows a generic authentication failure', async () => {
    login.mockRejectedValueOnce(new Error('تعذر تسجيل الدخول بهذه البيانات.'));
    renderLogin();
    fireEvent.change(screen.getByRole('textbox', { name: 'البريد الإلكتروني' }), { target: { value: 'inspector@example.invalid' } });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/), { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));
    expect((await screen.findByRole('alert')).textContent).toContain('تعذر تسجيل الدخول بهذه البيانات.');
  });
});
