import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { UserSession } from '../../../lib/contracts';
import { createFixtureWorkflowDataClient } from '../adapters';
import { ApplicationsView } from '../ApplicationsPage';
import { DirectoryView } from '../DirectoryPage';
import { FeedView } from '../FeedPage';
import { MeetingsView } from '../MeetingsPage';
import { OfficerView } from '../OfficerPage';
import { OrganizationView } from '../OrganizationPage';

const activeAccess: UserSession['access'] = {
  status: 'active',
  annualFeePhp: 10,
  startsAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  renewalAvailable: false,
};

const studentSession: UserSession = {
  uid: 'student-1',
  email: 'mara@example.edu',
  displayName: 'Mara Santos',
  accountKind: 'student',
  studentId: '2026-0001',
  emailVerified: true,
  access: activeAccess,
  officerGrants: [],
};

const sponsorSession: UserSession = {
  uid: 'sponsor-1',
  email: 'ari@example.com',
  displayName: 'Ari Reyes',
  accountKind: 'sponsor',
  companyName: 'Community Partner Co.',
  emailVerified: true,
  access: activeAccess,
  officerGrants: [],
};

const officerSession: UserSession = {
  ...studentSession,
  uid: 'officer-1',
  displayName: 'Lia Cruz',
  officerGrants: [{ organizationId: 'robotics', organizationName: 'Robotics Guild', status: 'approved', grantedBy: 'owner-1', grantedAt: '2026-01-10T00:00:00.000Z' }],
};

const renderInRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SOAR workflow pages', () => {
  it('filters the organization directory by name and shows no-results copy', async () => {
    const user = userEvent.setup();
    renderInRouter(<DirectoryView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    expect(await screen.findByText('Robotics Guild')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/search by organization name/i), 'no match');

    expect(screen.getByText(/No organizations match this search/i)).toBeInTheDocument();
    expect(screen.queryByText('Robotics Guild')).not.toBeInTheDocument();
  });

  it('keeps external application confirmation locked until the form link is activated', async () => {
    const user = userEvent.setup();
    const newStudentSession = { ...studentSession, uid: 'student-new', email: 'new.student@example.edu' };
    renderInRouter(<OrganizationView organizationId="literary" session={newStudentSession} client={createFixtureWorkflowDataClient()} />);

    const confirm = await screen.findByRole('button', { name: /I submitted the external form/i });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole('link', { name: /open external form/i }));
    expect(confirm).toBeEnabled();
    expect(screen.getByText(/SOAR cannot prove what happened in that external form/i)).toBeInTheDocument();

    await user.click(confirm);
    expect(await screen.findByText(/External submission confirmation recorded/i)).toBeInTheDocument();
  });

  it('excludes sponsors from application tools and tracker rows', async () => {
    renderInRouter(<OrganizationView organizationId="robotics" session={sponsorSession} client={createFixtureWorkflowDataClient()} />);

    expect(await screen.findByText(/Applications hidden for sponsors/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I submitted the external form/i })).not.toBeInTheDocument();

    renderInRouter(<ApplicationsView session={sponsorSession} client={createFixtureWorkflowDataClient()} />);
    expect(screen.getByText(/No sponsor application tracker/i)).toBeInTheDocument();
  });

  it('shows meeting duplicates clearly and keeps pending requests distinct from confirmed bookings', async () => {
    const user = userEvent.setup();
    renderInRouter(<MeetingsView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findAllByText(/Build Team interview window/i);
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));
    expect(await screen.findByText(/repeated identical request/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Requested time/i));
    await user.type(screen.getByLabelText(/Requested time/i), '14:30');
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));

    expect(await screen.findByText(/Meeting request created as Pending/i)).toBeInTheDocument();
    const table = screen.getByRole('region', { name: /My meeting request statuses/i });
    expect(within(table).getAllByText(/Not a confirmed booking/i).length).toBeGreaterThan(0);
  });

  it('locks officer controls without a grant and lets an approved officer update applicant stage', async () => {
    renderInRouter(<OfficerView session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(screen.getByText(/Officer controls locked/i)).toBeInTheDocument();

    const user = userEvent.setup();
    renderInRouter(<OfficerView session={officerSession} client={createFixtureWorkflowDataClient()} />);
    const stageSelect = await screen.findByLabelText(/Stage for Mara Santos/i);
    await user.selectOptions(stageSelect, 'Declined');

    expect(await screen.findByText(/Application moved to Declined/i)).toBeInTheDocument();
  });

  it('validates comments and updates like affordance on the feed', async () => {
    const user = userEvent.setup();
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findByText(/Tryouts and build night/i);
    await user.click(screen.getAllByRole('button', { name: /Open comments/i })[0]);
    await user.click(screen.getByRole('button', { name: /Add comment/i }));
    expect(await screen.findByText(/Enter a comment before posting/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /Like/i })[0]);
    await waitFor(() => expect(screen.getByText(/Liked in workflow fixture mode/i)).toBeInTheDocument());
  });
});
