import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway } from '../../test/createMockGateway';
import type { CheckoutStatus } from '../../lib/contracts';
import { CheckoutStatusPage } from './CheckoutStatusPage';

const paidProfile = {
  role: 'student' as const,
  email: 'mara@example.edu',
  displayName: 'Mara Santos',
  studentId: '2026-0001',
  department: 'Computer Engineering Department',
};

const renderCheckout = (gateway = createMockGateway(), entry = '/access/checkout?intentId=test-intent') => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider gateway={gateway}>
        <Routes>
          <Route path="/access/checkout" element={<CheckoutStatusPage />} />
          <Route path="/access/verify-email" element={<p>Verification step</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return gateway;
};

const status = (overrides: Partial<CheckoutStatus> = {}): CheckoutStatus => ({
  intentId: 'test-intent',
  status: 'pending',
  amountPhp: 10,
  message: 'Waiting for provider-confirmed payment.',
  canCreateAccount: false,
  ...overrides,
});

describe('CheckoutStatusPage', () => {
  beforeEach(() => vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('keeps account creation locked while server status is pending and lets the browser check again', async () => {
    const gateway = createMockGateway();
    vi.mocked(gateway.getCheckoutStatus)
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ canCreateAccount: true, registrationProfile: paidProfile, message: 'Payment confirmed.' }));
    const user = userEvent.setup();
    renderCheckout(gateway);

    expect(await screen.findByRole('heading', { name: 'Payment still pending' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account and send verification/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /check payment status/i }));
    expect(await screen.findByRole('heading', { name: 'Payment confirmed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account and send verification/i })).toBeEnabled();
  });

  it('uses the server-locked registration profile and permits completion when the verified status flag is true', async () => {
    const gateway = createMockGateway(null);
    vi.mocked(gateway.getCheckoutStatus).mockResolvedValue(status({
      canCreateAccount: true,
      registrationProfile: paidProfile,
      message: 'Payment confirmed. You can create your SOAR account.',
    }));
    const user = userEvent.setup();
    renderCheckout(gateway);

    expect(await screen.findByText('Mara Santos')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Password'), 'StrongPass123');
    await user.type(screen.getByLabelText('Confirm password'), 'StrongPass123');
    await user.click(screen.getByRole('button', { name: /create account and send verification/i }));

    await screen.findByText('Verification step');
    expect(gateway.registerAccount).toHaveBeenCalledWith(expect.objectContaining({
      intentId: 'test-intent',
      email: paidProfile.email,
      displayName: paidProfile.displayName,
      department: paidProfile.department,
      password: 'StrongPass123',
    }));
  });

  it('finishes an Auth-first registration only after the authenticated status confirms payment', async () => {
    const gateway = createMockGateway(null);
    vi.mocked(gateway.getCheckoutStatus).mockResolvedValue(status({
      authFirst: true,
      canCreateAccount: true,
      registrationProfile: paidProfile,
      message: 'Payment confirmed. You can finish your SOAR account.',
    }));
    const user = userEvent.setup();
    renderCheckout(gateway);

    expect(await screen.findByText('Mara Santos')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish account setup' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Finish account setup' }));

    expect(await screen.findByText('Verification step')).toBeInTheDocument();
    expect(gateway.registerAccount).toHaveBeenCalledWith(expect.objectContaining({
      intentId: 'test-intent',
      email: paidProfile.email,
      displayName: paidProfile.displayName,
      department: paidProfile.department,
    }));
    expect(vi.mocked(gateway.registerAccount).mock.calls[0][0]).not.toHaveProperty('password');
  });

  it('renders a failed checkout as recoverable rather than unlocking account creation', async () => {
    const gateway = createMockGateway();
    vi.mocked(gateway.getCheckoutStatus).mockResolvedValue(status({
      status: 'failed',
      message: 'Checkout could not be completed. Start a new checkout to try again.',
    }));
    renderCheckout(gateway);

    expect(await screen.findByRole('heading', { name: 'Checkout not confirmed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account and send verification/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /email recovery instructions/i })).toBeDisabled();
  });

  it('can retry a temporary status read failure without replacing the preserved registration details', async () => {
    const gateway = createMockGateway();
    vi.mocked(gateway.getCheckoutStatus)
      .mockRejectedValueOnce(new Error('Payment status is temporarily unavailable.'))
      .mockResolvedValue(status());
    const user = userEvent.setup();
    renderCheckout(gateway);

    expect(await screen.findByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
    await user.click(screen.getByRole('button', { name: /try checking again/i }));
    expect(await screen.findByRole('heading', { name: 'Payment still pending' })).toBeInTheDocument();
    expect(gateway.getCheckoutStatus).toHaveBeenCalledTimes(2);
  });

  it('accepts a one-time recovery code, then reloads only server-confirmed status and profile', async () => {
    const gateway = createMockGateway(null);
    vi.mocked(gateway.getCheckoutStatus)
      .mockRejectedValueOnce(new Error('Registration binding cookie is missing.'))
      .mockResolvedValue(status({ canCreateAccount: true, registrationProfile: paidProfile, message: 'Payment confirmed.' }));
    vi.mocked(gateway.requestPaidRegistrationRecovery).mockResolvedValue({ accepted: true, delivery: 'sent' });
    const user = userEvent.setup();
    renderCheckout(gateway);

    expect(await screen.findByRole('alert')).toHaveTextContent(/binding cookie is missing/i);
    await user.type(screen.getByLabelText('Registration email'), paidProfile.email);
    await user.click(screen.getByRole('button', { name: /email recovery instructions/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/instructions sent to you/i);

    await user.type(screen.getByLabelText('Recovery code'), 'one-time-code');
    await user.click(screen.getByRole('button', { name: /restore secure session/i }));
    expect(await screen.findByText('Mara Santos')).toBeInTheDocument();
    expect(gateway.acceptPaidRegistrationRecovery).toHaveBeenCalledWith('test-intent', 'one-time-code');
    expect(gateway.getCheckoutStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /create account and send verification/i })).toBeEnabled();
  });

  it('does not treat a hosted checkout success redirect as payment evidence', async () => {
    const gateway = createMockGateway();
    vi.mocked(gateway.getCheckoutStatus).mockResolvedValue(status({
      message: 'Waiting for provider-confirmed payment.',
    }));
    renderCheckout(gateway, '/access/checkout?intentId=test-intent&checkout=success');

    expect(await screen.findByRole('heading', { name: 'Payment still pending' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/redirect alone does not confirm payment/i);
    expect(screen.getByRole('button', { name: /create account and send verification/i })).toBeDisabled();
  });
});
