import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway, makeSession } from '../../test/createMockGateway';
import { AccountSettingsPage } from './AccountSettingsPage';

const renderAccountSettings = () => {
  const session = makeSession({
    officerGrants: [{ organizationId: 'robotics', organizationName: 'Robotics Guild', status: 'approved' }],
  });
  return render(
    <MemoryRouter initialEntries={["/settings/account"]}>
      <AuthProvider gateway={createMockGateway(session)}>
        <Routes>
          <Route path="/settings/account" element={<AccountSettingsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
};

describe('AccountSettingsPage', () => {
  it('separates profile, sign-in email, and organization grants into addressable tabs', async () => {
    const user = userEvent.setup();
    const { container } = renderAccountSettings();

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true'));
    expect(container.querySelector('#account-settings-panel-profile')).not.toHaveAttribute('hidden');
    expect(container.querySelector('#account-settings-panel-email')).toHaveAttribute('hidden');
    expect(container.querySelector('#account-settings-panel-access')).toHaveAttribute('hidden');

    await user.click(screen.getByRole('tab', { name: /Organization access/i }));
    expect(container.querySelector('#account-settings-panel-access')).not.toHaveAttribute('hidden');
    expect(screen.getByRole('link', { name: /Manage organization/i })).toHaveAttribute('href', '/settings/organization?organizationId=robotics');

    await user.click(screen.getByRole('tab', { name: /Sign-in email/i }));
    expect(container.querySelector('#account-settings-panel-email')).not.toHaveAttribute('hidden');
    expect(container.querySelector('#account-settings-panel-profile')).toHaveAttribute('hidden');
  });
});
