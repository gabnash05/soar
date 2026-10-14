import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { createMockGateway, makeSession } from '../test/createMockGateway';
import { AppShell } from './AppShell';

const renderShell = (session = makeSession(), gateway = createMockGateway(session)) => {
  render(
    <MemoryRouter initialEntries={["/app"]}>
      <AuthProvider gateway={gateway}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/app" element={<div>Shell child</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
};

describe('AppShell navigation', () => {
  it('hides student application tools from sponsors', async () => {
    renderShell(makeSession({ accountKind: 'sponsor', studentId: undefined, companyName: 'Partner Co.' }));

    await waitFor(() => expect(screen.getByText('Shell child')).toBeInTheDocument());
    expect(screen.getByText('Sponsor')).toBeInTheDocument();
    expect(screen.queryByText('Applications')).not.toBeInTheDocument();
    expect(screen.queryByText('Officer tools')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage Organization')).not.toBeInTheDocument();
  });

  it('shows Manage Organization only for active officer grants without adding a catch-all tools tab', async () => {
    renderShell(
      makeSession({
        officerGrants: [{ organizationId: 'robotics', organizationName: 'Computer Engineering Department', status: 'active' }],
      }),
    );

    await waitFor(() => expect(screen.getByText('Shell child')).toBeInTheDocument());
    expect(screen.queryByText('Officer tools')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage Organization' })).toHaveAttribute('href', '/settings/organization?organizationId=robotics');
    expect(screen.queryByRole('navigation', { name: /Mobile SOAR navigation/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage this organization/i })).toHaveAttribute('href', '/settings/organization?organizationId=robotics');
    expect(screen.getByText('Computer Engineering Department')).toBeInTheDocument();
  });

  it('does not expose removed admin statistics navigation for ordinary sessions', async () => {
    const gateway = { ...createMockGateway(makeSession()), mode: 'production' as const, label: 'Production gateway' };
    renderShell(makeSession(), gateway);

    await waitFor(() => expect(screen.getByText('Shell child')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /Admin statistics/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Demo persona')).not.toBeInTheDocument();
    expect(screen.getByText('Applications')).toBeInTheDocument();
  });
});
