import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
  it('requires student ID before starting payment for student accounts', async () => {
    const gateway = renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/full name/i), 'Mara Santos');
    await user.type(screen.getByLabelText(/email address/i), 'mara@example.edu');
    await user.click(screen.getByRole('button', { name: /continue to php10 checkout/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/student id is required/i);
    expect(gateway.startRegistrationPayment).not.toHaveBeenCalled();
  });

  it('sends a normalized free-text department for student registration without inventing a catalog', async () => {
    const gateway = renderPage();
    const user = userEvent.setup();

    expect(screen.getByText(/PHP10 per account for six months/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/full name/i), 'Mara Santos');
    await user.type(screen.getByLabelText(/email address/i), 'mara@example.edu');
    await user.type(screen.getByLabelText(/student id/i), '2026-0001');
    await user.type(screen.getByLabelText(/department/i), '  Computer   Science  ');
    await user.click(screen.getByRole('button', { name: /continue to php10 checkout/i }));

    expect(gateway.startRegistrationPayment).toHaveBeenCalledWith(expect.objectContaining({
      role: 'student',
      studentId: '2026-0001',
      department: 'Computer Science',
    }));
    expect(navigateToHostedCheckout).toHaveBeenCalledWith('/access/checkout?intentId=test-intent');
  });

  it('does not offer a separate officer account type or sponsor department field', async () => {
    renderPage();
    const user = userEvent.setup();

    expect(screen.getByRole('combobox', { name: /account type/i })).toHaveTextContent(/student/i);
    expect(screen.getByRole('combobox', { name: /account type/i })).toHaveTextContent(/sponsor/i);
    expect(screen.queryByText(/officer signup/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: /account type/i }), 'sponsor');
    expect(screen.queryByLabelText(/department/i)).not.toBeInTheDocument();
  });
});
