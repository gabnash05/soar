import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway } from '../../test/createMockGateway';
import { EntryPage } from './EntryPage';
import { LoginPage } from './LoginPage';

describe('landing and sign-in recovery links', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('keeps password recovery off the landing page while retaining sign-in', async () => {
    render(
      <MemoryRouter>
        <AuthProvider gateway={createMockGateway(null)}><EntryPage /></AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('offers free account signup when the server policy does not require payment', async () => {
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'false');
    render(<MemoryRouter><AuthProvider gateway={createMockGateway(null)}><EntryPage /></AuthProvider></MemoryRouter>);

    expect(await screen.findByRole('link', { name: /create a free account/i })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('status')).toHaveTextContent(/payment is not required right now/i);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps the Soar wordmark in the hero flow above the copy', () => {
    render(
      <MemoryRouter>
        <AuthProvider gateway={createMockGateway(null)}><EntryPage /></AuthProvider>
      </MemoryRouter>,
    );

    const wordmark = screen.getByText('SOAR', { exact: true });
    const brandRow = wordmark.parentElement;
    const hero = brandRow?.parentElement;

    expect(brandRow).toHaveClass('relative', 'z-[1]');
    expect(brandRow?.className).not.toContain('absolute');
    expect(hero).toHaveClass('flex', 'flex-col');
    expect(hero?.className).toContain('gap-[clamp(24px,4vw,40px)]');
  });

  it('offers free account signup from sign-in when payment is not required', async () => {
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'false');
    render(
      <MemoryRouter>
        <AuthProvider gateway={createMockGateway(null)}>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Create a free account' })).toHaveAttribute('href', '/register');
    expect(screen.getByText(/payment is not required for new accounts right now/i)).toBeInTheDocument();
  });

  it('resumes a same-UID pending registration after sign-in finds no SOAR profile', async () => {
    const gateway = createMockGateway(null);
    vi.mocked(gateway.signIn).mockRejectedValue(Object.assign(new Error('No SOAR profile exists.'), { code: 'account_missing' }));
    vi.mocked(gateway.resumePendingRegistration).mockResolvedValue({
      intentId: 'reg_pending_123', status: 'pending', canCreateAccount: false, completed: false,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider gateway={gateway}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/access/checkout" element={<p>Resumed pending checkout</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email address/i), 'mara@example.edu');
    await user.type(screen.getByLabelText(/password/i), 'StrongPass123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Resumed pending checkout')).toBeInTheDocument();
    expect(gateway.resumePendingRegistration).toHaveBeenCalledOnce();
  });

  it('keeps password recovery available from sign-in', () => {
    render(
      <MemoryRouter>
        <AuthProvider gateway={createMockGateway(null)}>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/recovery');
  });
});
