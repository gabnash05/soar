import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ValidationProblemError } from '../../lib/contracts';
import { UserFacingError } from '../../lib/safeErrors';
import { AuthProvider } from '../../context/AuthContext';
import { createMockGateway, makeSession } from '../../test/createMockGateway';
import { AccessSettingsPage } from './AccessSettingsPage';
import { AccountSettingsPage } from './AccountSettingsPage';

const renderSettingsFlow = (gateway: ReturnType<typeof createMockGateway>, initialPath = '/settings/account') => render(
  <MemoryRouter initialEntries={[initialPath]}>
    <AuthProvider gateway={gateway}>
      <nav>
        <Link to="/settings/account">Account settings</Link>
        <Link to="/settings/access">Payment &amp; access</Link>
      </nav>
      <Routes>
        <Route path="/settings/account" element={<AccountSettingsPage />} />
        <Route path="/settings/access" element={<AccessSettingsPage />} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>,
);

const renderAccountSettings = (gateway = createMockGateway(makeSession({
  officerGrants: [{ organizationId: 'robotics', organizationName: 'Computer Engineering Department', status: 'approved' }],
}))) => {
  const view = render(
    <MemoryRouter initialEntries={["/settings/account"]}>
      <AuthProvider gateway={gateway}>
        <Routes>
          <Route path="/settings/account" element={<AccountSettingsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { ...view, gateway };
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

  it('shows a successful save and adopts the canonical saved name', async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway(makeSession());
    vi.mocked(gateway.updateDisplayName).mockResolvedValue({
      displayName: 'Mara New Santos',
      nextChangeAllowedAt: '2026-02-01T00:00:00.000Z',
    });
    renderAccountSettings(gateway);

    const nameInput = await screen.findByRole('textbox', { name: 'Full name' });
    await user.clear(nameInput);
    await user.type(nameInput, '  Mara New Santos  ');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Name saved.');
    expect(nameInput).toHaveValue('Mara New Santos');
    expect(screen.getByText('2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Computer Engineering Department')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
    expect(gateway.updateDisplayName).toHaveBeenCalledWith({ displayName: '  Mara New Santos  ' });
  });

  it('shows safe actionable name validation and keeps invalid input available to correct', async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway(makeSession());
    vi.mocked(gateway.updateDisplayName).mockRejectedValue(new ValidationProblemError(
      'The request contains invalid fields.',
      { displayName: 'Too small: expected string to have >=2 characters; internal path /accounts/private' },
    ));
    const { container } = renderAccountSettings(gateway);

    const nameInput = await screen.findByRole('textbox', { name: 'Full name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'X');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name between 2 and 120 characters.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/internal path|Too small|<script>/i);
    expect(nameInput).toHaveValue('X');
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
    expect(container.querySelector('script')).toBeNull();
  });

  it('formats the cooldown retry time without exposing its serialized value', async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway(makeSession());
    const nextChangeAllowedAt = '2030-01-02T03:04:05.000Z';
    vi.mocked(gateway.updateDisplayName).mockRejectedValue(Object.assign(
      new Error(`You can change your name after ${nextChangeAllowedAt}; private account path.`),
      { code: 'name_change_cooldown', nextChangeAllowedAt },
    ));
    renderAccountSettings(gateway);

    const nameInput = await screen.findByRole('textbox', { name: 'Full name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Mara New Santos');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(nextChangeAllowedAt));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Name changes are limited to once every 30 days. Try again after ${formatted}.`);
    expect(alert).not.toHaveTextContent(/2030-01-02|private account path/);
    expect(nameInput).toHaveValue('Mara New Santos');
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
  });

  it('keeps a settings validation error on Account Settings and clears it across navigation', async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway(makeSession());
    vi.mocked(gateway.updateDisplayName).mockRejectedValue(new ValidationProblemError(
      'The request contains invalid fields.',
      { displayName: 'Sensitive validation detail' },
    ));
    renderSettingsFlow(gateway);

    const nameInput = await screen.findByRole('textbox', { name: 'Full name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'X');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name between 2 and 120 characters.');

    await user.click(screen.getByRole('link', { name: 'Payment & access' }));
    expect(await screen.findByRole('heading', { name: 'Six-month access status' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Account settings' }));
    expect(await screen.findByRole('textbox', { name: 'Full name' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not apply a late settings failure after navigating away and back', async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway(makeSession());
    let rejectSave!: (reason: unknown) => void;
    const pendingSave = new Promise<never>((_resolve, reject) => {
      rejectSave = reject;
    });
    vi.mocked(gateway.updateDisplayName).mockReturnValue(pendingSave);
    renderSettingsFlow(gateway);

    const nameInput = await screen.findByRole('textbox', { name: 'Full name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'Mara Updated');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await user.click(screen.getByRole('link', { name: 'Payment & access' }));
    expect(await screen.findByRole('heading', { name: 'Six-month access status' })).toBeInTheDocument();

    await act(async () => {
      rejectSave(new ValidationProblemError('Invalid fields.', { displayName: 'Sensitive validation detail' }));
      await pendingSave.catch(() => undefined);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Account settings' }));
    expect(await screen.findByRole('textbox', { name: 'Full name' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows real access-operation failures only on Payment & access', async () => {
    const user = userEvent.setup();
    const session = makeSession();
    const gateway = createMockGateway(makeSession({
      access: { ...session.access, renewalAvailable: true },
    }));
    vi.mocked(gateway.requestManualRenewal).mockRejectedValue(new UserFacingError('Renewal could not be started. Please try again.'));
    renderSettingsFlow(gateway, '/settings/access');

    const renewButton = await screen.findByRole('button', { name: 'Renew when available' });
    await user.click(renewButton);
    expect(await screen.findByRole('alert')).toHaveTextContent('Renewal could not be started. Please try again.');
    expect(renewButton).toBeEnabled();
    expect(gateway.requestManualRenewal).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('link', { name: 'Account settings' }));
    expect(await screen.findByRole('textbox', { name: 'Full name' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Payment & access' }));
    expect(await screen.findByRole('heading', { name: 'Six-month access status' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('redacts provider failures, escapes attempted markup, and recovers the save control', async () => {
    const user = userEvent.setup();
    const gateway = createMockGateway(makeSession());
    vi.mocked(gateway.updateDisplayName).mockRejectedValue(Object.assign(
      new Error('Provider token=secret, endpoint /private/users/123, raw JSON {"error":"<img src=x>"}'),
      { code: 'firebase_auth_rest_error' },
    ));
    const { container } = renderAccountSettings(gateway);

    const attemptedName = '<img src=x onerror=alert(1)>';
    const nameInput = await screen.findByRole('textbox', { name: 'Full name' });
    await user.clear(nameInput);
    await user.type(nameInput, attemptedName);
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not complete this account request. Please try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/secret|private|raw JSON|<img/i);
    expect(nameInput).toHaveValue(attemptedName);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save name' })).toBeEnabled();
    expect(screen.queryByText('Name saved.')).not.toBeInTheDocument();
  });
});
