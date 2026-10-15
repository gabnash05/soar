import type { ReactElement } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, vi } from 'vitest';
import type { UserSession } from '../../../lib/contracts';
import type { AnnouncementPage, WorkflowDataClient, WorkflowQueryResult } from '../contracts';
import { createFixtureWorkflowDataClient } from '../adapters';
import { ApplicationsView } from '../ApplicationsPage';
import { DirectoryView } from '../DirectoryPage';
import { FeedView } from '../FeedPage';
import { MeetingsView } from '../MeetingsPage';
import { EntryPage } from '../../access/EntryPage';
import { OrganizationSettingsView } from '../../settings/OrganizationSettingsPage';
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
  officerGrants: [{ organizationId: 'robotics', organizationName: 'Computer Engineering Department', status: 'approved', grantedBy: 'owner-1', grantedAt: '2026-01-10T00:00:00.000Z' }],
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
      'Keep your organization moving',
    ]);
    expect(within(capabilities).getByText('Student workspace')).toBeInTheDocument();
    expect(within(capabilities).getByText('Opening an external form never counts as a submission. Students explicitly confirm in SOAR after returning from the form.')).toBeInTheDocument();
    expect(within(capabilities).getByText('Sponsor workspace')).toBeInTheDocument();
    expect(within(capabilities).getByText('Sponsors can view organization information and meeting status without unrelated application or officer tools.')).toBeInTheDocument();
    expect(within(capabilities).getByText('Officer workspace')).toBeInTheDocument();
    expect(within(capabilities).getByText('Share updates, coordinate meetings and activities, and handle student requests in one place.')).toBeInTheDocument();
    expect(capabilities.querySelector('.entry-card-primary')).not.toBeInTheDocument();
  });

  it('labels the landing page only when the fixture build is simulated', () => {
    try {
      vi.stubEnv('VITE_SOAR_USE_FIXTURES', 'true');
      const { unmount } = renderInRouter(<EntryPage />);
      expect(screen.getByRole('note', { name: 'Simulated preview' })).toHaveTextContent(/Sample accounts and local workflow data only/i);
      unmount();

      vi.stubEnv('VITE_SOAR_USE_FIXTURES', 'false');
      renderInRouter(<EntryPage />);
      expect(screen.queryByRole('note', { name: 'Simulated preview' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('filters the organization directory by name and shows no-results copy', async () => {
    const user = userEvent.setup();
    renderInRouter(<DirectoryView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    const results = screen.getByRole('region', { name: 'Organization directory results' });
    expect(results.className).toBe('grid min-w-0 grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3');
    expect(await screen.findByText('Computer Engineering Department')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Computer Engineering Department' })).toHaveAttribute('href', '/app/organizations/robotics');
    expect(screen.getByRole('link', { name: /Open Computer Engineering Department profile/i })).toHaveAttribute('href', '/app/organizations/robotics');
    await user.type(screen.getByLabelText(/search by organization name/i), 'no match');

    expect(screen.getByText(/No organizations match this search/i)).toBeInTheDocument();
    expect(screen.queryByText('Computer Engineering Department')).not.toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: /Computer Engineering Department/i, level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Apply|Meetings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I submitted the external form/i })).not.toBeInTheDocument();

    renderInRouter(<ApplicationsView session={sponsorSession} client={createFixtureWorkflowDataClient()} />);
    expect(screen.getByText(/No sponsor application tracker/i)).toBeInTheDocument();
  });

  it('defaults organization profiles to the feed with role-appropriate profile tabs', async () => {
    const user = userEvent.setup();
    const { unmount } = renderInRouter(<OrganizationView organizationId="robotics" session={studentSession} client={createFixtureWorkflowDataClient()} />, ['/app/organizations/robotics']);

    expect(await screen.findByRole('heading', { name: /Computer Engineering Department/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dates & availability' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Apply' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /External application confirmation/i })).not.toBeInTheDocument();
    unmount();

    renderInRouter(<OrganizationView organizationId="health" session={sponsorSession} client={createFixtureWorkflowDataClient()} />, ['/app/organizations/health?tab=apply']);
    expect(await screen.findByRole('heading', { name: /Civil Engineering Department/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Feed' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Meetings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Apply' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Dates & availability' }));
    const datesPanel = screen.getByRole('tabpanel', { name: 'Dates & availability' });
    const requestMeetingLink = within(datesPanel).getByRole('link', { name: 'Request meeting' });
    expect(requestMeetingLink).toHaveAttribute('href', '/app/meetings?organizationId=health&tab=availability');
    expect(within(datesPanel).getAllByRole('link', { name: 'Request meeting' })).toHaveLength(1);
    const datedEventsHeading = within(datesPanel).getByRole('heading', { name: 'Dated public events' });
    const availabilityHeading = within(datesPanel).getByRole('heading', { name: 'Meeting/interview availability' });
    expect(datedEventsHeading.closest('section')?.className).toBe(availabilityHeading.closest('section')?.className);
    expect(datesPanel.querySelector('.profile-date-grid')).toHaveClass('gap-x-6', 'gap-y-8', 'md:grid-cols-2');
    const availabilityHeader = availabilityHeading.closest('header');
    expect(availabilityHeader).not.toBeNull();
    expect(requestMeetingLink.closest('header')).toBe(availabilityHeader);
    expect(availabilityHeader).toHaveClass('justify-between', 'max-[820px]:flex-col', 'max-[820px]:items-stretch');
    expect(requestMeetingLink.parentElement).toHaveClass('max-[820px]:w-full');
    expect(within(datesPanel).getByText('Availability')).toHaveAttribute('aria-label', 'Meeting/interview availability');
  });

  it('shows a safe recovery message when the meeting service returns an internal failure', async () => {
    const user = userEvent.setup();
    const fixtureClient = createFixtureWorkflowDataClient();
    const client: WorkflowDataClient = {
      ...fixtureClient,
      requestMeeting: async () => {
        throw Object.assign(new Error('Internal Functions details'), { code: 'internal' });
      },
    };

    renderInRouter(<MeetingsView session={studentSession} client={client} />);
    await screen.findAllByText(/Computer Engineering consultation window/i);
    await user.click(screen.getByRole('button', { name: /^Request meeting$/i }));
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));

    expect(await screen.findByText(/We could not send your meeting request\. It was not confirmed\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Internal Functions details/i)).not.toBeInTheDocument();
  });

  it('keeps one meeting request CTA in the active Availability tab and distinguishes pending requests', async () => {
    const user = userEvent.setup();
    renderInRouter(<MeetingsView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findAllByText(/Computer Engineering consultation window/i);
    const availabilityPanel = screen.getByRole('tabpanel', { name: 'Availability' });
    const requestButton = within(availabilityPanel).getByRole('button', { name: /^Request meeting$/i });
    expect(screen.getAllByRole('button', { name: /^Request meeting$/i })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).closest('section')).not.toContainElement(requestButton);
    await user.click(requestButton);
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));
    expect(await screen.findByText(/repeated identical request/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Requested time/i));
    await user.type(screen.getByLabelText(/Requested time/i), '14:30');
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));

    expect(await screen.findByText(/Meeting request created as Pending/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Request a meeting\/interview/i })).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
    await user.click(screen.getByRole('tab', { name: /My requests/i }));
    const panel = screen.getByRole('tabpanel', { name: 'My requests' });
    expect(panel).toHaveClass('min-w-0', 'max-w-full');
    const table = await screen.findByRole('region', { name: /My meeting request statuses/i });
    expect(table).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-x-auto');
    expect(table).toHaveAttribute('tabindex', '0');
    expect(table.querySelector('table')).toHaveClass('min-w-[640px]');
    expect(within(table).getAllByText(/Not a confirmed booking/i).length).toBeGreaterThan(0);
  });

  it('contains the requests table on direct mobile-tab entry without modal state', async () => {
    renderInRouter(<MeetingsView session={studentSession} client={createFixtureWorkflowDataClient()} />, ['/app/meetings?tab=mine']);

    const panel = await screen.findByRole('tabpanel', { name: 'My requests' });
    const table = await screen.findByRole('region', { name: 'My meeting request statuses' });
    expect(panel).toHaveClass('min-w-0', 'max-w-full');
    expect(table).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-x-auto');
    expect(table.querySelector('table')).toHaveClass('min-w-[640px]');
    expect(within(table).getByText(/formal-request\.pdf/)).toBeInTheDocument();
  });

  it('contains other table-backed review tabs without removing actions or rows', async () => {
    const { unmount } = renderInRouter(<MeetingsView session={officerSession} client={createFixtureWorkflowDataClient()} />);
    const reviewPanel = await screen.findByRole('tabpanel', { name: 'Review requests' });
    const meetingTable = await screen.findByRole('region', { name: 'Meeting requests for this organization' });
    expect(reviewPanel).toHaveClass('min-w-0', 'max-w-full');
    expect(meetingTable).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-x-auto');
    expect(within(meetingTable).getAllByRole('button', { name: 'Approve' }).length).toBeGreaterThan(0);
    unmount();

    renderInRouter(<ApplicationsView session={officerSession} client={createFixtureWorkflowDataClient()} />);
    const applicantsPanel = await screen.findByRole('tabpanel', { name: 'Review applicants' });
    const applicantsTable = await screen.findByRole('region', { name: 'Applicants for this organization' });
    expect(applicantsPanel).toHaveClass('min-w-0', 'max-w-full');
    expect(applicantsTable).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-x-auto');
    expect(within(applicantsTable).getByLabelText(/Stage for Mara Santos/i)).toBeInTheDocument();
  });

  it('honors an organization context link when opening a meeting request', async () => {
    const user = userEvent.setup();
    renderInRouter(<MeetingsView session={studentSession} client={createFixtureWorkflowDataClient()} />, ['/app/meetings?organizationId=health&tab=availability']);

    await screen.findAllByText(/Civil Engineering partner meeting slot/i);
    await user.click(screen.getByRole('button', { name: /^Request meeting$/i }));
    expect(screen.getByLabelText(/Posted availability/i)).toHaveValue('date-health-partner-meeting');
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
    expect(screen.queryByText(/Architecture Department Portfolio Updates/i)).not.toBeInTheDocument();
  });

  it('links feed post authors to organization profiles without a redundant profile button', async () => {
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    expect(await screen.findByText(/Computer Engineering project night/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Computer Engineering Department' })).toHaveAttribute('href', '/app/organizations/robotics');
    expect(screen.getByRole('link', { name: /Open Computer Engineering Department profile/i })).toHaveAttribute('href', '/app/organizations/robotics');
    expect(screen.queryByText(/Open organization profile/i)).not.toBeInTheDocument();
  });

  it('loads announcement pages on demand with the server cursor and de-duplicates appended posts', async () => {
    const base = createFixtureWorkflowDataClient();
    const post = (id: string, body: string) => ({ id, organizationId: 'robotics', organizationName: 'Computer Engineering Department', createdAt: '2026-10-01T00:00:00.000Z', body, likeCount: 0, viewerHasLiked: false, comments: [] });
    const first = Array.from({ length: 15 }, (_, index) => post(`post-${index}`, `Post body ${index}`));
    const second = [post('post-14', 'Duplicate'), post('post-15', 'Post body 15')];
    const listAnnouncements = vi.fn()
      .mockResolvedValueOnce({ data: { items: first, nextPageToken: 'cursor-15' }, source: 'fixture' })
      .mockResolvedValueOnce({ data: { items: second }, source: 'fixture' });
    const client = { ...base, listAnnouncements };
    renderInRouter(<FeedView session={studentSession} client={client} />);

    expect(await screen.findByText('Post body 14')).toBeInTheDocument();
    expect(listAnnouncements).toHaveBeenCalledTimes(1);
    expect(listAnnouncements).toHaveBeenNthCalledWith(1, studentSession, { limit: 15 });
    expect(screen.getByRole('button', { name: 'Load more announcements' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more announcements' }));
    expect(await screen.findByText('Post body 15')).toBeInTheDocument();
    expect(listAnnouncements).toHaveBeenNthCalledWith(2, studentSession, { limit: 15, pageToken: 'cursor-15' });
    expect(screen.queryAllByText('Duplicate')).toHaveLength(0);
    expect(screen.getByText('You’re all caught up.')).toBeInTheDocument();
    expect(listAnnouncements).toHaveBeenCalledTimes(2);
  });

  it('ignores a late page response after the feed session changes', async () => {
    const base = createFixtureWorkflowDataClient();
    const post = (id: string, body: string) => ({ id, organizationId: 'robotics', organizationName: 'Computer Engineering Department', createdAt: '2026-10-01T00:00:00.000Z', body, likeCount: 0, viewerHasLiked: false, comments: [] });
    let resolveNextPage: (result: WorkflowQueryResult<AnnouncementPage>) => void = () => undefined;
    const pendingNextPage = new Promise<WorkflowQueryResult<AnnouncementPage>>((resolve) => { resolveNextPage = resolve; });
    const oldList = vi.fn()
      .mockResolvedValueOnce({ data: { items: [post('old-context', 'Old context post')], nextPageToken: 'old-cursor' }, source: 'fixture' })
      .mockReturnValueOnce(pendingNextPage);
    const newList = vi.fn().mockResolvedValue({ data: { items: [post('new-context', 'New context post')] }, source: 'fixture' });
    const oldClient = { ...base, listAnnouncements: oldList };
    const newClient = { ...base, listAnnouncements: newList };
    const rendered = renderInRouter(<FeedView session={studentSession} client={oldClient} />);

    expect(await screen.findByText('Old context post')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more announcements' }));
    expect(oldList).toHaveBeenCalledTimes(2);
    rendered.rerender(<MemoryRouter><FeedView session={{ ...studentSession, uid: 'student-next' }} client={newClient} /></MemoryRouter>);
    expect(await screen.findByText('New context post')).toBeInTheDocument();

    await act(async () => {
      resolveNextPage({ data: { items: [post('stale-page', 'Stale page item')] }, source: 'fixture' });
      await pendingNextPage;
    });
    expect(screen.queryByText('Stale page item')).not.toBeInTheDocument();
    expect(screen.getByText('New context post')).toBeInTheDocument();
  });

  it('loads the next page when the announcement sentinel intersects', async () => {
    const previousObserver = globalThis.IntersectionObserver;
    const observers: Array<{ trigger: () => void }> = [];
    class ObserverMock {
      root: Element | Document | null = null;
      rootMargin: string;
      thresholds: number[] = [];
      target?: Element;
      constructor(private readonly callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.rootMargin = options?.rootMargin ?? '0px';
        observers.push(this);
      }
      observe(target: Element) { this.target = target; }
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
      trigger() {
        this.callback([{ isIntersecting: true, target: this.target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
    }
    Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: ObserverMock });
    try {
      const base = createFixtureWorkflowDataClient();
      const post = (id: string, body: string) => ({ id, organizationId: 'robotics', organizationName: 'Computer Engineering Department', createdAt: '2026-10-01T00:00:00.000Z', body, likeCount: 0, viewerHasLiked: false, comments: [] });
      const listAnnouncements = vi.fn()
        .mockResolvedValueOnce({ data: { items: [post('first-page', 'First page post')], nextPageToken: 'cursor-next' }, source: 'fixture' })
        .mockResolvedValueOnce({ data: { items: [post('second-page', 'Observer loaded post')] }, source: 'fixture' });
      renderInRouter(<FeedView session={studentSession} client={{ ...base, listAnnouncements }} />);
      expect(await screen.findByText('First page post')).toBeInTheDocument();
      expect(observers.length).toBeGreaterThan(0);
      await act(async () => { observers[0].trigger(); });
      expect(await screen.findByText('Observer loaded post')).toBeInTheDocument();
      expect(listAnnouncements).toHaveBeenCalledTimes(2);
    } finally {
      if (previousObserver) Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: previousObserver });
      else Reflect.deleteProperty(globalThis, 'IntersectionObserver');
    }
  });

  it('preserves loaded announcements when a next-page request fails and retries that cursor', async () => {
    const base = createFixtureWorkflowDataClient();
    const post = (id: string, body: string) => ({ id, organizationId: 'robotics', organizationName: 'Computer Engineering Department', createdAt: '2026-10-01T00:00:00.000Z', body, likeCount: 0, viewerHasLiked: false, comments: [] });
    const original = { data: { items: [post('kept-post', 'Keep this loaded announcement')], nextPageToken: 'cursor-next' }, source: 'fixture' as const };
    const listAnnouncements = vi.fn()
      .mockResolvedValueOnce(original)
      .mockRejectedValueOnce(new Error('Temporary network issue'))
      .mockResolvedValueOnce({ data: { items: [], nextPageToken: undefined }, source: 'fixture' });
    const client = { ...base, listAnnouncements };
    renderInRouter(<FeedView session={studentSession} client={client} />);
    expect(await screen.findByText('Keep this loaded announcement')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more announcements' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Temporary network issue/i);
    expect(screen.getByText('Keep this loaded announcement')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry loading announcements' }));
    await waitFor(() => expect(screen.getByText('You’re all caught up.')).toBeInTheDocument());
    expect(listAnnouncements).toHaveBeenNthCalledWith(2, studentSession, { limit: 15, pageToken: 'cursor-next' });
    expect(listAnnouncements).toHaveBeenNthCalledWith(3, studentSession, { limit: 15, pageToken: 'cursor-next' });
  });

  it('keeps public organization profiles public-facing even for managers', async () => {
    renderInRouter(<OrganizationView organizationId="robotics" session={officerSession} client={createFixtureWorkflowDataClient()} />);

    expect(await screen.findByRole('heading', { name: /Computer Engineering Department/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/You manage this organization/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Manage organization/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Review applications/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Review meetings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Request meeting/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Dates & availability/i }));
    expect(screen.getByRole('link', { name: /Request meeting/i })).toHaveAttribute('href', '/app/meetings?organizationId=robotics&tab=availability');
  });

  it('uses prominent organization identity areas in the directory and profile', async () => {
    const { container: directoryContainer } = renderInRouter(<DirectoryView session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByText('Computer Engineering Department')).toBeInTheDocument();
    expect(directoryContainer.querySelector('.org-identity-art')).toHaveTextContent('CE');

    const { container: profileContainer } = renderInRouter(<OrganizationView organizationId="robotics" session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByText(/Department organization for Computer Engineering students/i)).toBeInTheDocument();
    expect(profileContainer.querySelector('.profile-identity-art')).toHaveTextContent('CE');
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
        { organizationId: 'literary', organizationName: 'Architecture Department', status: 'approved' as const },
      ],
    };
    renderInRouter(<FeedView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />);

    await user.click(screen.getByRole('button', { name: /Post announcement/i }));
    const organizationSelector = screen.getByLabelText(/Posting organization/i);
    expect(organizationSelector).toHaveValue('robotics');

    await user.selectOptions(organizationSelector, 'literary');
    await user.type(screen.getByLabelText(/Post text/i), 'Architecture portfolio orientation starts Friday.');
    await user.click(screen.getByRole('button', { name: /^Publish announcement$/i }));

    expect(await screen.findByText(/Announcement published in demo mode/i)).toBeInTheDocument();
    expect(await screen.findByText(/Architecture portfolio orientation starts Friday/i)).toBeInTheDocument();
  });

  it('guards organization settings to approved officer grants and supports managed organization context', async () => {
    const user = userEvent.setup();
    const multiOfficerSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Architecture Department', status: 'approved' as const },
      ],
    };
    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=robotics']);

    expect(await screen.findByRole('heading', { name: /Organization settings/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Selected organization: Computer Engineering Department/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Details$/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('link', { name: /View public profile/i })).toHaveLength(1);
    expect(screen.queryByLabelText(/Post text/i)).not.toBeInTheDocument();
    const organizationSelector = screen.getByLabelText(/^Organization$/i);
    expect(organizationSelector).toHaveValue('robotics');
    expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Computer Engineering Department');

    await user.selectOptions(organizationSelector, 'literary');
    await waitFor(() => expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Architecture Department'));
    expect(screen.queryByDisplayValue('Civil Engineering Department')).not.toBeInTheDocument();
  });

  it('scopes manage-organization announcement history and dates to the selected organization tab', async () => {
    const user = userEvent.setup();
    const multiOfficerSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Architecture Department', status: 'approved' as const },
      ],
    };
    const { unmount } = renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=robotics&tab=announcements']);

    expect(await screen.findByRole('tab', { name: /Announcements/i })).toHaveAttribute('aria-selected', 'true');
    expect((await screen.findAllByText(/Computer Engineering project night/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Architecture portfolio clinic signup/i)).not.toBeInTheDocument();
    unmount();

    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=literary&tab=dates']);
    expect(await screen.findByRole('tab', { name: /Dates & availability/i })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getAllByText(/Architecture portfolio clinic/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Computer Engineering project night/i)).not.toBeInTheDocument();

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
    const saveButton = screen.getByRole('button', { name: /^Save profile$/i });
    expect(screen.getAllByRole('button', { name: /^Save profile$/i })).toHaveLength(1);
    const profileForm = nameInput.closest('form');
    expect(profileForm).toContainElement(saveButton);
    expect(profileForm?.lastElementChild).toBe(saveButton.parentElement);
    const logoInput = screen.getByLabelText(/Logo image/i);
    const logoRow = logoInput.parentElement?.parentElement;
    expect(logoRow).toHaveClass('grid', 'gap-4', 'md:grid-cols-2');
    expect(within(logoRow as HTMLElement).getByLabelText(/External form URL/i)).toBeInTheDocument();
    await user.type(nameInput, ' Updated');
    await user.click(saveButton);

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
        { organizationId: 'literary', organizationName: 'Architecture Department', status: 'approved' as const },
      ],
    };
    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=robotics']);

    const nameInput = await screen.findByLabelText(/^Organization name$/i);
    await user.type(nameInput, ' Draft');
    await user.selectOptions(screen.getByLabelText(/^Organization$/i), 'literary');
    expect(screen.getByRole('alertdialog', { name: /Switch organizations/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Organization$/i)).toHaveValue('robotics');
    expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Computer Engineering Department Draft');
    await user.click(screen.getByRole('button', { name: /Keep editing/i }));

    await user.selectOptions(screen.getByLabelText(/^Organization$/i), 'literary');
    await user.click(screen.getByRole('button', { name: /Discard and switch/i }));
    await waitFor(() => expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Architecture Department'));
  });

  it('validates comments and updates accessible icon like state and count on the feed', async () => {
    const user = userEvent.setup();
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findByText(/Computer Engineering project night/i);
    await user.click(screen.getAllByRole('button', { name: /Open comments/i })[0]);
    await user.click(screen.getByRole('button', { name: /Add comment/i }));
    expect(await screen.findByText(/Enter a comment before posting/i)).toBeInTheDocument();

    const like = screen.getByRole('button', { name: /Like announcement from Computer Engineering Department; 12 likes/i });
    expect(like).toHaveAttribute('aria-pressed', 'false');
    expect(like.querySelector('.like-icon')).toBeInTheDocument();
    expect(like.querySelector('.like-count')).toHaveTextContent('12');

    await user.click(like);
    await waitFor(() => expect(screen.getByText(/Liked in demo mode/i)).toBeInTheDocument());
    const unlike = screen.getByRole('button', { name: /Unlike announcement from Computer Engineering Department; 13 likes/i });
    expect(unlike).toHaveAttribute('aria-pressed', 'true');
    expect(unlike.querySelector('.like-count')).toHaveTextContent('13');
  });

  it('loads persisted comments each time the comments panel is opened', async () => {
    const user = userEvent.setup();
    const fixtureClient = createFixtureWorkflowDataClient();
    const client: WorkflowDataClient = {
      ...fixtureClient,
      listAnnouncements: async () => ({
        data: { items: [{
          id: 'persisted-comment-post',
          organizationId: 'robotics',
          organizationName: 'Computer Engineering Department',
          createdAt: '2026-10-10T00:00:00.000Z',
          body: 'A post with a persisted comment.',
          likeCount: 0,
          viewerHasLiked: false,
          commentCount: 1,
          comments: [],
        }] },
        source: 'production',
      }),
      listAnnouncementComments: vi.fn(async () => ({
        data: [{ id: 'persisted-comment', authorName: 'Mara Santos', body: 'Persisted after reopening.', createdAt: '2026-10-10T00:01:00.000Z' }],
        source: 'production' as const,
      })),
    };

    renderInRouter(<FeedView session={studentSession} client={client} />);
    await screen.findByText('A post with a persisted comment.');
    await user.click(screen.getByRole('button', { name: 'Open comments (1)' }));
    expect(await screen.findByText('Persisted after reopening.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Hide comments/i }));
    await user.click(screen.getByRole('button', { name: 'Open comments (1)' }));
    await waitFor(() => expect(client.listAnnouncementComments).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Persisted after reopening.')).toBeInTheDocument();
  });

  it('lets commenters edit and delete only their own comments while keeping counts refreshed', async () => {
    const user = userEvent.setup();
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />);

    await screen.findByText(/Computer Engineering project night/i);
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
    expect(await screen.findByRole('heading', { name: /Architecture Department/i, level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/Phone:/i)).not.toBeInTheDocument();
  });

  it('shows the restrained department count only inside the Details tab', async () => {
    const user = userEvent.setup();
    renderInRouter(<OrganizationSettingsView session={officerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=robotics']);

    expect(await screen.findByRole('heading', { name: /Organization settings/i, level: 1 })).toBeInTheDocument();
    const frame = screen.getByTestId('workflow-page');
    expect(frame).toHaveClass('w-[min(1120px,100%)]', 'min-w-0');
    const detailsPanel = screen.getByRole('tabpanel', { name: 'Details' });
    const countPanel = await within(detailsPanel).findByRole('region', { name: /Registered students from this department/i });
    expect(within(countPanel).getByText('Computer Engineering Department')).toBeInTheDocument();
    expect(within(countPanel).getByText('3')).toBeInTheDocument();
    expect(within(countPanel).getByText(/saved fixture student records/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Student stats/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/mara@example.edu/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mara Santos/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Announcements' }));
    expect(frame).toHaveClass('w-[min(1120px,100%)]', 'min-w-0');
    expect(screen.queryByRole('region', { name: /Registered students from this department/i })).not.toBeInTheDocument();
    const announcementsPanel = screen.getByRole('tabpanel', { name: 'Announcements' });
    const postAction = within(announcementsPanel).getByRole('button', { name: 'Post announcement' });
    expect(postAction.closest('header')).toContainElement(postAction);
    expect(within(screen.getByRole('heading', { name: /Organization settings/i }).closest('section')!).queryByRole('button', { name: 'Post announcement' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Dates & availability' }));
    expect(frame).toHaveClass('w-[min(1120px,100%)]', 'min-w-0');
    expect(screen.queryByRole('region', { name: /Registered students from this department/i })).not.toBeInTheDocument();
    expect(within(screen.getByRole('tabpanel', { name: 'Dates & availability' })).getByRole('button', { name: /Add dated entry/i })).toBeInTheDocument();
  });

  it('copies stable announcement direct links and focuses a deep-linked announcement', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderInRouter(<FeedView session={studentSession} client={createFixtureWorkflowDataClient()} />, ['/app?announcementId=post-health-briefing']);

    const directPost = await screen.findByText(/Civil Engineering field briefing slots are posted/i);
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
    const permissiveUser = userEvent.setup({ applyAccept: false });
    await permissiveUser.upload(screen.getByLabelText(/Optional media/i), new File(['not an image'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText(/Use a PNG, JPEG, GIF, WebP, MP4, or WebM file/i)).toBeInTheDocument();
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

    await screen.findAllByText(/Computer Engineering consultation window/i);
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
