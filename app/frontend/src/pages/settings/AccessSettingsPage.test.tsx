import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway, makeSession } from '../../test/createMockGateway';
import { AccessSettingsPage } from './AccessSettingsPage';

describe('AccessSettingsPage', () => {
  beforeEach(() => vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('shows access status without offering payment when payment is unavailable', async () => {
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'false');
    render(
      <MemoryRouter initialEntries={['/settings/access']}>
        <AuthProvider gateway={createMockGateway(makeSession())}>
          <Routes>
            <Route path="/settings/access" element={<AccessSettingsPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/renewal is unavailable/i);
    expect(screen.queryByRole('button', { name: /renew/i })).not.toBeInTheDocument();
  });

  it('labels account access without a payment fee or provider reference', async () => {
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'false');
    const session = makeSession({
      access: {
        status: 'active',
        provenance: 'unpaid-preview',
        annualFeePhp: 10,
        feePhp: 0,
        periodLabel: 'Unpaid preview',
        startsAt: '2026-10-18T00:00:00.000Z',
        renewalAvailable: false,
      },
    });
    render(
      <MemoryRouter initialEntries={['/settings/access']}>
        <AuthProvider gateway={createMockGateway(session)}>
          <Routes><Route path="/settings/access" element={<AccessSettingsPage />} /></Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Account access' })).toBeInTheDocument();
    expect(screen.getByText('Active access')).toBeInTheDocument();
    expect(screen.queryByText(/preview/i)).not.toBeInTheDocument();
    expect(screen.getByText('No payment')).toBeInTheDocument();
    expect(screen.getByText('No payment recorded')).toBeInTheDocument();
    expect(screen.queryByText('PHP10')).not.toBeInTheDocument();
  });

  it('labels grandfathered existing-account access honestly without inventing payment history', async () => {
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'false');
    const session = makeSession({
      access: {
        status: 'active',
        provenance: 'grandfathered-existing-account',
        annualFeePhp: 10,
        feePhp: 0,
        periodMonths: 6,
        periodLabel: 'Existing account access',
        startsAt: '2026-10-23T01:02:03.000Z',
        expiresAt: '2027-04-23T01:02:03.000Z',
        renewalAvailable: false,
      },
    });
    render(
      <MemoryRouter initialEntries={['/settings/access']}>
        <AuthProvider gateway={createMockGateway(session)}>
          <Routes><Route path="/settings/access" element={<AccessSettingsPage />} /></Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Existing account access' })).toBeInTheDocument();
    expect(screen.getByText(/six UTC calendar months of access from payment activation/i)).toBeInTheDocument();
    expect(screen.getByText('No payment')).toBeInTheDocument();
    expect(screen.getByText('None for this access grant')).toBeInTheDocument();
    expect(screen.getAllByText('Existing account access').length).toBeGreaterThan(0);
    expect(screen.queryByText(/PayMongo paid/i)).not.toBeInTheDocument();
  });

  it('keeps renewal pending until the authenticated backend status confirms it, then reloads access', async () => {
    const gateway = createMockGateway(makeSession());
    vi.mocked(gateway.getRenewalStatus)
      .mockResolvedValueOnce({ renewalId: 'renewal1', status: 'pending', message: 'Waiting for provider-confirmed payment.' })
      .mockResolvedValueOnce({ renewalId: 'renewal1', status: 'confirmed', accessExpiresAt: '2027-04-07T15:00:00.000Z', message: 'Payment confirmed. Your access has been updated.' });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/settings/access?renewalId=renewal1&checkout=success']}>
        <AuthProvider gateway={gateway}>
          <Routes><Route path="/settings/access" element={<AccessSettingsPage />} /></Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Checking renewal payment' })).toBeInTheDocument();
    expect(screen.getByText(/through QR Ph \(scan with GCash or another supported bank\/e-wallet app\)/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/checkout returned successfully; waiting for the signed provider confirmation/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /check renewal status/i }));
    expect(await screen.findByRole('heading', { name: 'Renewal confirmed' })).toBeInTheDocument();
    expect(gateway.reloadSession).toHaveBeenCalledTimes(2);
  });

  it('keeps current access unchanged when renewal status is failed', async () => {
    const gateway = createMockGateway(makeSession());
    vi.mocked(gateway.getRenewalStatus).mockResolvedValue({
      renewalId: 'renewal1',
      status: 'failed',
      message: 'This renewal could not be confirmed. You can start a new checkout.',
    });
    render(
      <MemoryRouter initialEntries={['/settings/access?renewalId=renewal1&checkout=cancelled']}>
        <AuthProvider gateway={gateway}>
          <Routes><Route path="/settings/access" element={<AccessSettingsPage />} /></Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Renewal not confirmed' })).toBeInTheDocument();
    expect(screen.getByText(/access remains unchanged unless SOAR confirms payment/i)).toBeInTheDocument();
    expect(gateway.reloadSession).toHaveBeenCalledTimes(1);
  });

  it('uses the standard bold supplied-font heading hierarchy', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/access']}>
        <AuthProvider gateway={createMockGateway(makeSession())}>
          <Routes><Route path="/settings/access" element={<AccessSettingsPage />} /></Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    const heading = await screen.findByRole('heading', { level: 1, name: /Six-month access status/i });
    await waitFor(() => expect(heading).toHaveClass('font-bold', 'font-[var(--font-display)]'));
  });
});
