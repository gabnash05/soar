import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway } from '../../test/createMockGateway';
import { navigateToHostedCheckout } from '../../lib/redirects';
import { RegistrationIntentPage } from './RegistrationIntentPage';

vi.mock('../../lib/redirects', () => ({
  navigateToHostedCheckout: vi.fn(),
}));

const renderPage = () => {
  const gateway = createMockGateway(null);
  render(
    <MemoryRouter>
      <AuthProvider gateway={gateway}>
        <RegistrationIntentPage />
      </AuthProvider>
    </MemoryRouter>,
  );
  return gateway;
};

describe('RegistrationIntentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('shows a free account form and a clearly disconnected payment pitch panel in preview mode', () => {
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'false');
    const gateway = renderPage();

    expect(screen.getByRole('heading', { name: 'Create a free preview account' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Pitch payment presentation' })).toHaveTextContent(/UI only/i);
    expect(screen.getByText(/no payment is requested or recorded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create free preview account' })).toBeEnabled();
    expect(gateway.startRegistrationPayment).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Already have an account?' })).toHaveAttribute('href', '/login');
  });

  it('creates a real-preview registration through its own path without checkout or paid access', async () => {
    vi.stubEnv('VITE_SOAR_PAYMENTS_ENABLED', 'false');
    const gateway = renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/full name/i), 'Mara Santos');
    await user.type(screen.getByLabelText(/email address/i), 'mara@example.edu');
    await user.type(screen.getByLabelText(/student id/i), '2026-0001');
    await user.type(screen.getByLabelText(/create password/i), 'StrongPass123');
    await user.click(screen.getByRole('combobox', { name: /department/i }));
    await user.click(await screen.findByRole('option', { name: 'Computer Engineering Department' }));
    await user.click(screen.getByRole('button', { name: 'Create free preview account' }));

    expect(gateway.registerPreviewAccount).toHaveBeenCalledWith({
      role: 'student',
      displayName: 'Mara Santos',
      email: 'mara@example.edu',
      password: 'StrongPass123',
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
      companyName: undefined,
    });
    expect(gateway.startRegistrationPayment).not.toHaveBeenCalled();
    expect(navigateToHostedCheckout).not.toHaveBeenCalled();
  });
  it('requires a valid student ID before starting payment for student accounts', async () => {
    const gateway = renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/full name/i), 'Mara Santos');
    await user.type(screen.getByLabelText(/email address/i), 'mara@example.edu');
    await user.click(screen.getByRole('button', { name: /continue to php10 checkout/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/student id between 2 and 64 characters/i);
    expect(gateway.startRegistrationPayment).not.toHaveBeenCalled();
  });

  it('requires students to choose a canonical department before starting payment', async () => {
    const gateway = renderPage();
    const user = userEvent.setup();

    expect(screen.getByText(/PHP10 per account for six months/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/full name/i), 'Mara Santos');
    await user.type(screen.getByLabelText(/email address/i), 'mara@example.edu');
    await user.type(screen.getByLabelText(/student id/i), '2026-0001');
    await user.click(screen.getByRole('button', { name: /continue to php10 checkout/i }));

    expect((await screen.findAllByRole('alert')).some((alert) => /choose your department/i.test(alert.textContent ?? ''))).toBe(true);
    expect(gateway.startRegistrationPayment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox', { name: /department/i }));
    await user.click(await screen.findByRole('option', { name: 'Computer Engineering Department' }));
    await user.click(screen.getByRole('button', { name: /continue to php10 checkout/i }));

    expect(gateway.startRegistrationPayment).toHaveBeenCalledWith(expect.objectContaining({
      role: 'student',
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
    }));
    expect(navigateToHostedCheckout).toHaveBeenCalledWith('/access/checkout?intentId=test-intent');
  });

  it('does not offer a separate officer account type or sponsor department field', async () => {
    renderPage();
    const user = userEvent.setup();

    expect(screen.getByRole('combobox', { name: /account type/i })).toHaveTextContent(/student/i);
    expect(screen.getByRole('combobox', { name: /account type/i })).toHaveTextContent(/sponsor/i);
    expect(screen.getByRole('combobox', { name: /department/i })).toHaveTextContent(/choose your department/i);
    expect(screen.queryByText(/officer signup/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: /account type/i }), 'sponsor');
    expect(screen.queryByLabelText(/department/i)).not.toBeInTheDocument();
  });
});
