import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfessionalIdentityPage } from './ProfessionalIdentityPage';

const { getProfessionalIdentity, putProfessionalIdentity } = vi.hoisted(() => ({
  getProfessionalIdentity: vi.fn(), putProfessionalIdentity: vi.fn(),
}));
vi.mock('./client', () => ({ getProfessionalIdentity, putProfessionalIdentity, ApiRequestError: class ApiRequestError extends Error {} }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('professional identity page', () => {
  it('renders incomplete RTL identity and saves only on explicit submit', async () => {
    getProfessionalIdentity.mockResolvedValue({ name: null, surname: null });
    putProfessionalIdentity.mockResolvedValue({ name: 'محمد', surname: 'سالم' });
    const { container } = render(<ProfessionalIdentityPage />);
    expect(screen.getByText('جارٍ تحميل الهوية المهنية…')).toBeTruthy();
    expect(await screen.findByText('لم تكتمل الهوية المهنية بعد.')).toBeTruthy();
    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    fireEvent.change(screen.getByRole('textbox', { name: /الاسم/ }), { target: { value: 'محمد' } });
    fireEvent.change(screen.getByRole('textbox', { name: /اللقب/ }), { target: { value: 'سالم' } });
    expect(putProfessionalIdentity).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الهوية المهنية' }));
    await waitFor(() => expect(putProfessionalIdentity).toHaveBeenCalledWith({ name: 'محمد', surname: 'سالم' }));
    expect(await screen.findByText('حُفظت الهوية المهنية.')).toBeTruthy();
    expect(screen.queryByText('inspector@example.invalid')).toBeNull();
  });

  it('prefills complete identity and rejects invalid client input', async () => {
    getProfessionalIdentity.mockResolvedValue({ name: 'ليلى', surname: 'بن عمر' });
    render(<ProfessionalIdentityPage />);
    expect(await screen.findByDisplayValue('ليلى')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /الاسم/ }), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الهوية المهنية' }));
    expect(screen.getByRole('alert').textContent).toContain('أدخل قيمة');
    expect(putProfessionalIdentity).not.toHaveBeenCalled();
  });

  it('shows safe API failure and allows another save', async () => {
    getProfessionalIdentity.mockResolvedValue({ name: 'ليلى', surname: 'بن عمر' });
    putProfessionalIdentity.mockRejectedValueOnce(new Error('private detail'));
    render(<ProfessionalIdentityPage />);
    await screen.findByDisplayValue('ليلى');
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الهوية المهنية' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('تعذر حفظ الهوية المهنية');
    expect(error.textContent).not.toContain('private detail');
    expect(screen.getByRole('button', { name: 'حفظ الهوية المهنية' })).toBeTruthy();
  });
});
