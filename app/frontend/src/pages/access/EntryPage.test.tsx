import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway } from '../../test/createMockGateway';
import { EntryPage } from './EntryPage';
import { LoginPage } from './LoginPage';

describe('landing and sign-in recovery links', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('keeps password recovery off the landing page while retaining sign-in', () => {
    render(
      <MemoryRouter>
        <EntryPage />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('clearly excludes registration and payment from the unpaid preview', () => {
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'false');
    render(<MemoryRouter><EntryPage /></MemoryRouter>);

    expect(screen.queryByRole('link', { name: /PHP10 access/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/account creation and payment are disabled/i);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps the Soar wordmark in the hero flow above the copy', () => {
    render(
      <MemoryRouter>
        <EntryPage />
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
