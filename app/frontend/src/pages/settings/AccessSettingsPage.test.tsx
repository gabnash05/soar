import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway, makeSession } from '../../test/createMockGateway';
import { AccessSettingsPage } from './AccessSettingsPage';

describe('AccessSettingsPage', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('shows access status without offering payment in the unpaid preview', async () => {
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

    expect(await screen.findByRole('status')).toHaveTextContent(/renewal is disabled/i);
    expect(screen.queryByRole('button', { name: /renew/i })).not.toBeInTheDocument();
  });
  it('uses the standard bold supplied-font heading hierarchy', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/access']}>
        <AuthProvider gateway={createMockGateway(makeSession())}>
          <Routes>
            <Route path="/settings/access" element={<AccessSettingsPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    const heading = await screen.findByRole('heading', { level: 1, name: /Six-month access status/i });
    await waitFor(() => expect(heading).toHaveClass('font-bold', 'font-[var(--font-display)]'));
  });
});
