import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, vi } from 'vitest';
import type { UserSession } from '../../../lib/contracts';
import { createFixtureWorkflowDataClient } from '../adapters';
import { ApplicationsView } from '../ApplicationsPage';
import { DirectoryView } from '../DirectoryPage';
import { FeedView } from '../FeedPage';
import { MeetingsView } from '../MeetingsPage';
import { EntryPage } from '../../access/EntryPage';
import { OrganizationSettingsView } from '../../settings/OrganizationSettingsPage';
import { AdminDashboardView } from '../../admin/AdminDashboardPage';
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

const adminSession: UserSession = {
  uid: 'admin-1',
  email: 'admin@example.test',
  displayName: 'SOAR Stats Admin',
  accountKind: 'admin',
  emailVerified: true,
  access: { status: 'missing', annualFeePhp: 10, feePhp: 10, periodMonths: 6, periodLabel: '6 months', renewalAvailable: false },
  officerGrants: [],
  admin: { statistics: true },
};

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fixture-preview'), configurable: true });
  Element.prototype.scrollIntoView = vi.fn();
});

const renderInRouter = (ui: ReactElement, initialEntries: string[] = ['/']) => render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);

describe('SOAR workflow pages', () => {
  it('keeps landing capability cards equivalent instead of one broken oversized lower card', () => {
    renderInRouter(<EntryPage />);

    const capabilities = screen.getByRole('region', { name: /SOAR capabilities/i });
    expect(within(capabilities).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Track applications honestly',
      'Browse and request meetings',
      'Organization grants only',
    ]);
    expect(capabilities.querySelector('.entry-card-primary')).not.toBeInTheDocument();
  });

  it('filters the organization directory by name and shows no-results copy', async () => {
    const user = userEvent.setup();
    renderInRouter(<DirectoryView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    expect(await screen.findByText('Robotics Guild')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Robotics Guild' })).toHaveAttribute('href', '/app/organizations/robotics');
    expect(screen.getByRole('link', { name: /Open Robotics Guild profile/i })).toHaveAttribute('href', '/app/organizations/robotics');
    await user.type(screen.getByLabelText(/search by organization name/i), 'no match');

    expect(screen.getByText(/No organizations match this search/i)).toBeInTheDocument();
    expect(screen.queryByText('Robotics Guild')).not.toBeInTheDocument();
  });

  it('keeps external application confirmation locked until the form link is activated', async () => {
    const user = userEvent.setup();
    const newStudentSession = { ...studentSession, uid: 'student-new', email: 'new.student@example.edu' };
    renderInRouter(<OrganizationView organizationId="literary" session={newStudentSession} client={createFixtureWorkflowDataClient()} />, ['/app/organizations/literary?tab=apply']);

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

  it('defaults organization profiles to the feed with role-appropriate profile tabs', async () => {
    const { unmount } = renderInRouter(<OrganizationView organizationId="robotics" session={studentSession} client={createFixtureWorkflowDataClient()} />, ['/app/organizations/robotics']);

    expect(await screen.findByRole('heading', { name: /Robotics Guild/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dates & availability' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Apply' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /External application confirmation/i })).not.toBeInTheDocument();
    unmount();

    renderInRouter(<OrganizationView organizationId="health" session={sponsorSession} client={createFixtureWorkflowDataClient()} />, ['/app/organizations/health?tab=apply']);
    expect(await screen.findByRole('heading', { name: /Campus Health Alliance/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Meetings' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Apply' })).not.toBeInTheDocument();
  });

  it('shows meeting duplicates clearly and keeps pending requests distinct from confirmed bookings', async () => {
    const user = userEvent.setup();
    renderInRouter(<MeetingsView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findAllByText(/Build Team interview window/i);
    await user.click(screen.getByRole('button', { name: /^Request meeting$/i }));
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));
    expect(await screen.findByText(/repeated identical request/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Requested time/i));
    await user.type(screen.getByLabelText(/Requested time/i), '14:30');
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));

    expect(await screen.findByText(/Meeting request created as Pending/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /My requests/i }));
    const table = await screen.findByRole('region', { name: /My meeting request statuses/i });
    expect(within(table).getAllByText(/Not a confirmed booking/i).length).toBeGreaterThan(0);
  });

  it('keeps officer controls on relevant pages and scoped to the managed organization', async () => {
    const user = userEvent.setup();

    renderInRouter(<OfficerView session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(screen.getByText(/No organization access/i)).toBeInTheDocument();

    renderInRouter(<ApplicationsView session={officerSession} client={createFixtureWorkflowDataClient()} />);
    expect(screen.queryByRole('link', { name: /Manage organization/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Find organizations/i })).toHaveAttribute('href', '/app/directory');
    const stageSelect = await screen.findByLabelText(/Stage for Mara Santos/i);
    await user.selectOptions(stageSelect, 'Declined');
    expect(await screen.findByText(/Application moved to Declined in demo mode/i)).toBeInTheDocument();
    expect(screen.queryByText(/Open Mic Crew/i)).not.toBeInTheDocument();
  });

  it('links feed post authors to organization profiles without a redundant profile button', async () => {
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    expect(await screen.findByText(/Tryouts and build night/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Robotics Guild' })).toHaveAttribute('href', '/app/organizations/robotics');
    expect(screen.getByRole('link', { name: /Open Robotics Guild profile/i })).toHaveAttribute('href', '/app/organizations/robotics');
    expect(screen.queryByText(/Open organization profile/i)).not.toBeInTheDocument();
  });

  it('keeps public organization profiles public-facing even for managers', async () => {
    renderInRouter(<OrganizationView organizationId="robotics" session={officerSession} client={createFixtureWorkflowDataClient()} />);

    expect(await screen.findByRole('heading', { name: /Robotics Guild/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/You manage this organization/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Manage organization/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Review applications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Review meetings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Request meeting/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Dates & availability/i }));
    expect(screen.getByRole('link', { name: /Request meeting/i })).toHaveAttribute('href', '/app/meetings?organizationId=robotics');
  });

  it('uses prominent organization identity areas in the directory and profile', async () => {
    const { container: directoryContainer } = renderInRouter(<DirectoryView session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByText('Robotics Guild')).toBeInTheDocument();
    expect(directoryContainer.querySelector('.org-identity-art')).toHaveTextContent('RG');

    const { container: profileContainer } = renderInRouter(<OrganizationView organizationId="robotics" session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByText(/Builds robots, runs workshops/i)).toBeInTheDocument();
    expect(profileContainer.querySelector('.profile-identity-art')).toHaveTextContent('RG');
  });

  it('protects dirty announcement dialogs and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderInRouter(<FeedView session={officerSession} client={createFixtureWorkflowDataClient()} />);

    const trigger = await screen.findByRole('button', { name: /Post announcement/i });
    await user.click(trigger);
    await user.type(screen.getByLabelText(/Post text/i), 'Draft update');

    await user.click(screen.getByRole('button', { name: /Close Post announcement/i }));
    expect(screen.getByRole('alertdialog', { name: /Discard unsaved changes/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Keep editing/i }));
    expect(screen.getByLabelText(/Post text/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Close Post announcement/i }));
    await user.click(screen.getByRole('button', { name: /^Discard$/i }));
    await waitFor(() => expect(screen.queryByLabelText(/Post text/i)).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('surfaces officer announcement posting at the top of the announcements page with grant context', async () => {
    const user = userEvent.setup();
    const multiOfficerSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Literary Circle', status: 'approved' as const },
      ],
    };
    renderInRouter(<FeedView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />);

    await user.click(screen.getByRole('button', { name: /Post announcement/i }));
    const organizationSelector = screen.getByLabelText(/Posting organization/i);
    expect(organizationSelector).toHaveValue('robotics');

    await user.selectOptions(organizationSelector, 'literary');
    await user.type(screen.getByLabelText(/Post text/i), 'Open mic crew orientation starts Friday.');
    await user.click(screen.getByRole('button', { name: /^Publish announcement$/i }));

    expect(await screen.findByText(/Announcement published in demo mode/i)).toBeInTheDocument();
    expect(await screen.findByText(/Open mic crew orientation starts Friday/i)).toBeInTheDocument();
  });

  it('guards organization settings to approved officer grants and supports managed organization context', async () => {
    const user = userEvent.setup();
    const multiOfficerSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Literary Circle', status: 'approved' as const },
      ],
    };
    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=robotics']);

    expect(await screen.findByRole('heading', { name: /Organization settings/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Selected organization: Robotics Guild/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Details$/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('link', { name: /View public profile/i })).toHaveLength(1);
    expect(screen.queryByLabelText(/Post text/i)).not.toBeInTheDocument();
    const organizationSelector = screen.getByLabelText(/^Organization$/i);
    expect(organizationSelector).toHaveValue('robotics');
    expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Robotics Guild');

    await user.selectOptions(organizationSelector, 'literary');
    await waitFor(() => expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Literary Circle'));
    expect(screen.queryByDisplayValue('Campus Health Alliance')).not.toBeInTheDocument();
  });

  it('scopes manage-organization announcement history and dates to the selected organization tab', async () => {
    const user = userEvent.setup();
    const multiOfficerSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Literary Circle', status: 'approved' as const },
      ],
    };
    const { unmount } = renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=robotics&tab=announcements']);

    expect(await screen.findByRole('tab', { name: /Announcements/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/Tryouts and build night/i)).toBeInTheDocument();
    expect(screen.queryByText(/Open mic signup/i)).not.toBeInTheDocument();
    unmount();

    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=literary&tab=dates']);
    expect(await screen.findByRole('tab', { name: /Dates & availability/i })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getAllByText(/Open Mic Night/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Build Night/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add dated entry/i }));
    expect(screen.getByRole('dialog', { name: /Add dated entry/i })).toBeInTheDocument();
  });

  it('keeps one profile save action and confirms before persisting organization profile edits', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const saveProfile = vi.fn(client.saveOrganizationProfile.bind(client));
    client.saveOrganizationProfile = saveProfile;
    renderInRouter(<OrganizationSettingsView session={officerSession} client={client} />, ['/settings/organization?organizationId=robotics']);

    const nameInput = await screen.findByLabelText(/^Organization name$/i);
    expect(screen.getAllByRole('button', { name: /^Save profile$/i })).toHaveLength(1);
    await user.type(nameInput, ' Updated');
    await user.click(screen.getByRole('button', { name: /^Save profile$/i }));

    const dialog = screen.getByRole('alertdialog', { name: /Save profile changes/i });
    expect(dialog).toBeInTheDocument();
    expect(saveProfile).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^Save profile$/i }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
  });

  it('protects dirty profile edits before switching managed organizations', async () => {
    const user = userEvent.setup();
    const multiOfficerSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Literary Circle', status: 'approved' as const },
      ],
    };
    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=robotics']);

    const nameInput = await screen.findByLabelText(/^Organization name$/i);
    await user.type(nameInput, ' Draft');
    await user.selectOptions(screen.getByLabelText(/^Organization$/i), 'literary');
    expect(screen.getByRole('alertdialog', { name: /Switch organizations/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Organization$/i)).toHaveValue('robotics');
    expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Robotics Guild Draft');
    await user.click(screen.getByRole('button', { name: /Keep editing/i }));

    await user.selectOptions(screen.getByLabelText(/^Organization$/i), 'literary');
    await user.click(screen.getByRole('button', { name: /Discard and switch/i }));
    await waitFor(() => expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Literary Circle'));
  });

  it('validates comments and updates accessible icon like state and count on the feed', async () => {
    const user = userEvent.setup();
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findByText(/Tryouts and build night/i);
    await user.click(screen.getAllByRole('button', { name: /Open comments/i })[0]);
    await user.click(screen.getByRole('button', { name: /Add comment/i }));
    expect(await screen.findByText(/Enter a comment before posting/i)).toBeInTheDocument();

    const like = screen.getByRole('button', { name: /Like announcement from Robotics Guild; 12 likes/i });
    expect(like).toHaveAttribute('aria-pressed', 'false');
    expect(like.querySelector('.like-icon')).toBeInTheDocument();
    expect(like.querySelector('.like-count')).toHaveTextContent('12');

    await user.click(like);
    await waitFor(() => expect(screen.getByText(/Liked in demo mode/i)).toBeInTheDocument());
    const unlike = screen.getByRole('button', { name: /Unlike announcement from Robotics Guild; 13 likes/i });
    expect(unlike).toHaveAttribute('aria-pressed', 'true');
    expect(unlike.querySelector('.like-count')).toHaveTextContent('13');
  });

  it('lets commenters edit and delete only their own comments while keeping counts refreshed', async () => {
    const user = userEvent.setup();
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findByText(/Tryouts and build night/i);
    await user.click(screen.getAllByRole('button', { name: /Open comments \(1\)/i })[0]);
    await user.click(screen.getByRole('button', { name: /^Edit$/i }));
    await user.clear(screen.getByLabelText(/Edit comment by Mara Santos/i));
    await user.type(screen.getByLabelText(/Edit comment by Mara Santos/i), 'Updated question for officers.');
    await user.click(screen.getByRole('button', { name: /Save comment/i }));
    expect(await screen.findByText(/Comment updated in demo mode/i)).toBeInTheDocument();
    expect(await screen.findByText(/Updated question for officers/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Delete$/i }));
    expect(screen.getByRole('alertdialog', { name: /Delete your comment/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Delete comment/i }));
    expect(await screen.findByText(/Comment deleted in demo mode/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /comments/i }).some((button) => button.textContent?.includes('0'))).toBe(true));
  });

  it('shows optional organization phone only when present on public profiles', async () => {
    const { unmount } = renderInRouter(<OrganizationView organizationId="robotics" session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByRole('link', { name: '+63 912 345 6789' })).toHaveAttribute('href', 'tel:+639123456789');
    unmount();

    renderInRouter(<OrganizationView organizationId="literary" session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByRole('heading', { name: /Literary Circle/i, level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/Phone:/i)).not.toBeInTheDocument();
  });

  it('removes student statistics from organization management and shows aggregates only in admin', async () => {
    const { unmount } = renderInRouter(<OrganizationSettingsView session={officerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=robotics&tab=students']);

    expect(await screen.findByRole('heading', { name: /Organization settings/i, level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Student stats/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Registered students by department/i)).not.toBeInTheDocument();
    unmount();

    renderInRouter(<AdminDashboardView session={adminSession} client={createFixtureWorkflowDataClient()} />, ['/admin']);
    expect(await screen.findByRole('heading', { name: /SOAR aggregate dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/simulated aggregate data/i)).toBeInTheDocument();
    expect(await screen.findByText('Computer Science')).toBeInTheDocument();
    expect(await screen.findByText('Engineering')).toBeInTheDocument();
    expect(await screen.findByText(/Unspecified legacy accounts/i)).toBeInTheDocument();
    expect(screen.queryByText(/mara@example.edu/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mara Santos/i)).not.toBeInTheDocument();
  });

  it('copies stable announcement direct links and focuses a deep-linked announcement', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />, ['/app?announcementId=post-health-briefing']);

    const directPost = await screen.findByText(/Volunteer briefing slots are posted/i);
    expect(directPost.closest('article')).toHaveAttribute('id', 'announcement-post-health-briefing');
    await user.click(screen.getAllByRole('button', { name: /Share direct link/i })[0]);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/app?announcementId=post-robotics-tryouts'));
    expect(await screen.findByText(/Announcement link copied/i)).toBeInTheDocument();
  });

  it('publishes bounded announcement images and native videos with previews and documented limits', async () => {
    const user = userEvent.setup();
    renderInRouter(<FeedView session={officerSession} client={createFixtureWorkflowDataClient()} />);

    await user.click(await screen.findByRole('button', { name: /Post announcement/i }));
    await user.type(screen.getByLabelText(/Post text/i), 'Two image update for the build team.');
    await user.upload(screen.getByLabelText(/Optional media/i), [
      new File(['a'], 'robot-a.png', { type: 'image/png' }),
      new File(['video'], 'robot-demo.mp4', { type: 'video/mp4' }),
    ]);
    expect(screen.getByText(/30 MB combined maximum/i)).toBeInTheDocument();
    expect(screen.getByText(/MP4\/WebM video/i)).toBeInTheDocument();
    expect(screen.getByText('robot-a.png')).toBeInTheDocument();
    expect(screen.getByText('robot-demo.mp4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Publish announcement$/i }));
    expect(await screen.findByText(/Two image update for the build team/i)).toBeInTheDocument();
    expect(await screen.findByAltText('robot-a.png')).toBeInTheDocument();
    expect(await screen.findByLabelText('robot-demo.mp4')).toBeInTheDocument();
  });

  it('accepts optional private PDF meeting documents and rejects unsupported files', async () => {
    const user = userEvent.setup();
    renderInRouter(<MeetingsView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findAllByText(/Build Team interview window/i);
    await user.click(screen.getByRole('button', { name: /^Request meeting$/i }));
    const permissiveUser = userEvent.setup({ applyAccept: false });
    await permissiveUser.upload(screen.getByLabelText(/Formal request document/i), new File(['not a pdf'], 'request.png', { type: 'image/png' }));
    expect(await screen.findByText(/Attach a PDF document/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Requested time/i));
    await user.type(screen.getByLabelText(/Requested time/i), '14:45');
    await user.upload(screen.getByLabelText(/Formal request document/i), new File(['%PDF-1.4'], 'formal-request.pdf', { type: 'application/pdf' }));
    expect(screen.getAllByText(/formal-request.pdf/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));
    expect(await screen.findByText(/Meeting request created as Pending/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /My requests/i }));
    await waitFor(() => expect(screen.getAllByText(/formal-request.pdf/i).length).toBeGreaterThan(0));
  });
});
