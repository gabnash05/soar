import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway } from '../../test/createMockGateway';
import { RegistrationIntentPage } from './RegistrationIntentPage';

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

  it('does not offer a separate officer account type', () => {
    renderPage();

    expect(screen.getByRole('combobox', { name: /account type/i })).toHaveTextContent(/student/i);
    expect(screen.getByRole('combobox', { name: /account type/i })).toHaveTextContent(/sponsor/i);
    expect(screen.queryByText(/officer signup/i)).not.toBeInTheDocument();
  });
});
