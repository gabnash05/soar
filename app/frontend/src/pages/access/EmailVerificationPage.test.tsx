import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway, makeSession } from '../../test/createMockGateway';
import { EmailVerificationPage } from './EmailVerificationPage';

const previewAccess = {
  status: 'active' as const,
  provenance: 'unpaid-preview' as const,
  annualFeePhp: 10 as const,
  feePhp: 0,
  periodLabel: 'Unpaid preview',
  renewalAvailable: false,
};

describe('EmailVerificationPage', () => {
  it('offers resend and reload retries, then lets a verified preview session continue without payment', async () => {
    const pendingSession = makeSession({ emailVerified: false, access: previewAccess });
    const verifiedSession = makeSession({ emailVerified: true, access: previewAccess });
    const gateway = createMockGateway(pendingSession);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/access/verify-email']}>
        <AuthProvider gateway={gateway}>
          <Routes>
            <Route path="/access/verify-email" element={<EmailVerificationPage />} />
            <Route path="/app" element={<p>Preview workspace</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    expect(screen.getByText(/no payment is recorded/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resend verification' }));
    expect(gateway.resendEmailVerification).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(/verification email requested/i);

    vi.mocked(gateway.reloadSession)
      .mockResolvedValueOnce(pendingSession)
      .mockResolvedValueOnce(verifiedSession);
    await user.click(screen.getByRole('button', { name: 'I verified, reload status' }));
    expect(screen.getByRole('status')).toHaveTextContent(/email is still unverified/i);

    await user.click(screen.getByRole('button', { name: 'I verified, reload status' }));
    expect(await screen.findByText('Preview workspace')).toBeInTheDocument();
    expect(gateway.reloadSession).toHaveBeenCalledTimes(3);
  });
});
