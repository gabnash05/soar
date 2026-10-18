import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assignAdminOfficer: vi.fn(),
  createAdminOrganization: vi.fn(),
  listAdminOfficerGrants: vi.fn(),
  listAdminOrganizations: vi.fn(),
  revokeAdminOfficer: vi.fn(),
  searchAdminStudents: vi.fn()
}));

vi.mock('../../lib/adminApi', () => ({
  assignAdminOfficer: mocks.assignAdminOfficer,
  createAdminOrganization: mocks.createAdminOrganization,
  listAdminOfficerGrants: mocks.listAdminOfficerGrants,
  listAdminOrganizations: mocks.listAdminOrganizations,
  revokeAdminOfficer: mocks.revokeAdminOfficer,
  searchAdminStudents: mocks.searchAdminStudents
}));

import { AdminProvisioningPage } from './AdminProvisioningPage';

const student = { uid: 'student-1', displayName: 'Mara Santos', studentId: '2026-0001' };
const organizations = [{ id: 'robotics', name: 'Robotics Club' }];

function renderPage(entry = '/admin') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AdminProvisioningPage />
    </MemoryRouter>,
  );
}

describe('Admin provisioning page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAdminOrganizations.mockResolvedValue({ items: organizations });
    mocks.listAdminOfficerGrants.mockResolvedValue({ items: [{ uid: 'student-1', displayName: 'Mara Santos', status: 'active', isOrganizationOwner: false }] });
    mocks.revokeAdminOfficer.mockResolvedValue({ orgId: 'robotics', uid: 'student-1', status: 'revoked', alreadyRevoked: false });
    mocks.searchAdminStudents.mockResolvedValue({ items: [student] });
    mocks.createAdminOrganization.mockResolvedValue({ orgId: 'robotics-club' });
    mocks.assignAdminOfficer.mockResolvedValue({ orgId: 'robotics', uid: student.uid, status: 'approved', alreadyAssigned: true });
  });

  it('creates an organization with a selected existing student as its initial scoped officer', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('tab', { name: 'Create organization' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Assign officers' })).toBeInTheDocument();
    const panel = screen.getByRole('tabpanel');
    await user.type(within(panel).getByLabelText('Organization name'), 'Robotics Club');
    expect(within(panel).getByLabelText('Organization ID / URL slug')).toHaveValue('robotics-club');
    await user.type(within(panel).getByLabelText(/Short description/), 'Student robotics projects.');

    const ownerSearch = within(panel).getByLabelText('Find a registered student');
    await user.type(ownerSearch, 'Mara');
    await user.click(screen.getByRole('button', { name: 'Search students' }));
    const ownerChoice = await within(panel).findByRole('radio', { name: /Mara Santos.*2026-0001/ });
    await user.click(ownerChoice);
    await user.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(mocks.createAdminOrganization).toHaveBeenCalledWith({
      orgId: 'robotics-club',
      slug: 'robotics-club',
      name: 'Robotics Club',
      ownerUid: 'student-1',
      shortDescription: 'Student robotics projects.'
    }));
    expect(await screen.findByText('Robotics Club was created with Mara Santos as its initial officer.')).toHaveAttribute('role', 'status');
    expect(mocks.listAdminOrganizations).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('tab', { name: 'Assign officers' }));
    expect(await within(screen.getByRole('tabpanel')).findByLabelText('Organization')).toHaveValue('robotics-club');
  });

  it('assigns only a chosen registered student to the selected organization and reports an existing grant', async () => {
    const user = userEvent.setup();
    renderPage('/admin?tab=assign');

    const panel = screen.getByRole('tabpanel');
    const organization = await within(panel).findByLabelText('Organization');
    expect(organization).toHaveValue('');
    await user.selectOptions(organization, 'robotics');
    await user.type(within(panel).getByLabelText('Find a registered student'), '2026-0001');
    await user.click(screen.getByRole('button', { name: 'Search students' }));
    const officerChoice = await within(panel).findByRole('radio', { name: /Mara Santos.*2026-0001/ });
    await user.click(officerChoice);

    await user.click(screen.getByRole('button', { name: 'Assign officer' }));
    expect(await screen.findByText('Mara Santos already has officer access for this organization.')).toHaveAttribute('role', 'status');
    expect(mocks.assignAdminOfficer).toHaveBeenCalledWith('robotics', 'student-1');

    await user.click(screen.getByRole('button', { name: 'Assign officer' }));
    await waitFor(() => expect(mocks.assignAdminOfficer).toHaveBeenCalledTimes(2));
  });

  it('revokes the selected organization grant only after a clear confirmation and refreshes the list', async () => {
    const user = userEvent.setup();
    renderPage('/admin?tab=manage');

    const panel = screen.getByRole('tabpanel');
    const organization = await within(panel).findByLabelText('Organization');
    await user.selectOptions(organization, 'robotics');
    expect(await within(panel).findByText('Active officer grant')).toBeInTheDocument();
    expect(mocks.listAdminOfficerGrants).toHaveBeenCalledWith('robotics', undefined);

    await user.click(within(panel).getByRole('button', { name: 'Revoke access' }));
    const confirmation = screen.getByRole('alertdialog');
    expect(within(confirmation).getByText(/Mara Santos will immediately lose officer access to Robotics Club/)).toBeInTheDocument();
    expect(within(confirmation).getByText(/account and access to other organizations will remain unchanged/i)).toBeInTheDocument();
    expect(mocks.revokeAdminOfficer).not.toHaveBeenCalled();

    await user.click(within(confirmation).getByRole('button', { name: 'Revoke access' }));
    await waitFor(() => expect(mocks.revokeAdminOfficer).toHaveBeenCalledWith('robotics', 'student-1'));
    expect(await screen.findByText('Officer access for Mara Santos was revoked.')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(mocks.listAdminOfficerGrants).toHaveBeenCalledTimes(2));
  });

  it('does not allow revoking the organization owner or already-revoked grants', async () => {
    const user = userEvent.setup();
    mocks.listAdminOfficerGrants.mockResolvedValue({ items: [
      { uid: 'owner-1', displayName: 'Owner One', status: 'active', isOrganizationOwner: true },
      { uid: 'student-2', displayName: 'Ari Reyes', status: 'revoked', isOrganizationOwner: false },
    ] });
    renderPage('/admin?tab=manage');

    const panel = screen.getByRole('tabpanel');
    await user.selectOptions(await within(panel).findByLabelText('Organization'), 'robotics');
    expect(await within(panel).findByText('Organization owner; this grant cannot be revoked here.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Organization owner' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Access revoked' })).toBeDisabled();
    expect(mocks.revokeAdminOfficer).not.toHaveBeenCalled();
  });

  it('ignores superseded student-search responses after the query changes', async () => {
    const user = userEvent.setup();
    const pending: Array<(value: { items: typeof student[] }) => void> = [];
    mocks.searchAdminStudents.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));
    renderPage('/admin?tab=assign');

    const panel = screen.getByRole('tabpanel');
    const input = await within(panel).findByLabelText('Find a registered student');
    await user.type(input, 'al');
    expect(input).toHaveValue('al');
    const searchButton = within(panel).getByRole('button', { name: 'Search students' });
    expect(searchButton).toBeEnabled();
    await user.click(searchButton);
    expect(mocks.searchAdminStudents).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: 'bo' } });
    expect(input).toHaveValue('bo');
    await waitFor(() => expect(searchButton).toBeEnabled());
    fireEvent.click(searchButton);
    expect(mocks.searchAdminStudents).toHaveBeenCalledTimes(2);

    pending[1]({ items: [{ uid: 'student-bo', displayName: 'Bob Santos', studentId: 'B-1002' }] });
    expect(await screen.findByRole('radio', { name: /Bob Santos.*B-1002/ })).toBeInTheDocument();
    pending[0]({ items: [{ uid: 'student-al', displayName: 'Alex Santos', studentId: 'A-1001' }] });
    await waitFor(() => expect(screen.queryByRole('radio', { name: /Alex Santos/ })).not.toBeInTheDocument());
    expect(screen.getByRole('radio', { name: /Bob Santos.*B-1002/ })).toBeInTheDocument();
  });

  it('clears the selected student and search results when the organization context changes', async () => {
    const user = userEvent.setup();
    mocks.listAdminOrganizations.mockResolvedValue({ items: [...organizations, { id: 'engineering', name: 'Engineering Club' }] });
    renderPage('/admin?tab=assign');

    const panel = screen.getByRole('tabpanel');
    const organization = await within(panel).findByLabelText('Organization');
    await user.selectOptions(organization, 'robotics');
    await user.type(within(panel).getByLabelText('Find a registered student'), 'Mara');
    await user.click(screen.getByRole('button', { name: 'Search students' }));
    await user.click(await within(panel).findByRole('radio', { name: /Mara Santos.*2026-0001/ }));
    await user.selectOptions(organization, 'engineering');

    expect(within(panel).getByLabelText('Find a registered student')).toHaveValue('');
    expect(within(panel).queryByRole('radio', { name: /Mara Santos/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign officer' }));
    expect(await screen.findByText(/Choose an organization and a registered student/i)).toBeInTheDocument();
    expect(mocks.assignAdminOfficer).not.toHaveBeenCalled();
  });

  it('keeps empty and loading search states understandable without showing unneeded student fields', async () => {
    const user = userEvent.setup();
    let finishSearch: ((value: { items: typeof student[] }) => void) | undefined;
    mocks.searchAdminStudents.mockImplementationOnce(() => new Promise((resolve) => { finishSearch = resolve; }));
    renderPage();

    await user.type(within(screen.getByRole('tabpanel')).getByLabelText('Find a registered student'), 'Nope');
    await user.click(screen.getByRole('button', { name: 'Search students' }));
    expect(screen.getByText('Searching saved student accounts…')).toBeInTheDocument();
    finishSearch?.({ items: [] });
    expect(await screen.findByText('No saved student accounts match that name or ID.')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});
