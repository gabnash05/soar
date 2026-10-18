import { render, screen } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { createMockGateway, makeSession } from '../test/createMockGateway';
import { router } from './routes';

describe('Admin route boundaries', () => {
  it('keeps Admin sessions in provisioning instead of payment or student pages', async () => {
    await router.navigate('/settings/access');
    const admin = makeSession({
      accountKind: 'admin',
      studentId: undefined,
      department: undefined,
      access: { status: 'missing', annualFeePhp: 10, renewalAvailable: true },
    });

    render(
      <AuthProvider gateway={createMockGateway(admin)}>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Admin setup' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
    expect(screen.queryByText(/six-month access/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Access settings' })).not.toBeInTheDocument();
  });
});
