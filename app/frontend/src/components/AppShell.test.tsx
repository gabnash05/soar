import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { createMockGateway, makeSession } from '../test/createMockGateway';
import { AppShell } from './AppShell';

const renderShell = (session = makeSession()) => {
  render(
    <MemoryRouter initialEntries={["/app"]}>
      <AuthProvider gateway={createMockGateway(session)}>
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
    expect(screen.getByText(/sponsor account/i)).toBeInTheDocument();
    expect(screen.queryByText('Applications')).not.toBeInTheDocument();
    expect(screen.queryByText('Officer tools')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage Organization')).not.toBeInTheDocument();
  });

  it('shows Manage Organization only for active officer grants without adding a catch-all tools tab', async () => {
    renderShell(
      makeSession({
        officerGrants: [{ organizationId: 'coding', organizationName: 'Coding Society', status: 'active' }],
      }),
    );

    await waitFor(() => expect(screen.getByText('Shell child')).toBeInTheDocument());
    expect(screen.queryByText('Officer tools')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage Organization' })).toBeInTheDocument();
    expect(screen.getByText('Coding Society')).toBeInTheDocument();
  });
});
