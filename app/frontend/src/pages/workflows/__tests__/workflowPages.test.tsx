import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeAll, vi } from 'vitest';
import type { UserSession } from '../../../lib/contracts';
import type { Announcement, AnnouncementPage, DateEntry, DateEntryInput, MeetingRequest, OfficerDashboard, OrganizationSummary, WorkflowDataClient, WorkflowMutationResult, WorkflowQueryResult } from '../contracts';
import { createFixtureWorkflowDataClient } from '../adapters';
import { ApplicationsView } from '../ApplicationsPage';
import { DirectoryView } from '../DirectoryPage';
import { FeedView } from '../FeedPage';
import { MeetingsView } from '../MeetingsPage';
import { EntryPage } from '../../access/EntryPage';
import { OrganizationSettingsView } from '../../settings/OrganizationSettingsPage';
import { DATE_ENTRY_SAVE_TIMEOUT_MS, DateEntriesSection, MeetingDecisionsSection, OfficerView } from '../OfficerPage';
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

const renderInRouter = (ui: ReactElement, initialEntries: string[] = ['/']) => {
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries });
  return render(<RouterProvider router={router} />);
};

function saveDateEntryResult(input: DateEntryInput, source: WorkflowDataClient['mode']): WorkflowMutationResult<DateEntry> {
  return {
    ok: true,
    persisted: true,
    source,
    message: 'Dated entry saved.',
    data: {
      id: input.id ?? input.idempotencyKey ?? 'saved-date-entry',
      organizationId: input.organizationId,
      organizationName: 'Computer Engineering Department',
      kind: input.kind,
      title: input.title.trim(),
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      details: input.details.trim(),
    },
  };
}

function enterDatedEntry(user: ReturnType<typeof userEvent.setup>, title = 'Portfolio orientation') {
  return (async () => {
    await user.type(screen.getByLabelText(/^Title$/i), title);
    fireEvent.change(screen.getByLabelText(/^Date$/i), { target: { value: '2026-12-20' } });
    await user.type(screen.getByLabelText(/Short details/i), 'Meet at the engineering hall.');
  })();
}

function renderDatedEntrySection(dashboard: OfficerDashboard, client: WorkflowDataClient, onChanged: () => void) {
  renderInRouter(<DateEntriesSection dashboard={dashboard} session={officerSession} client={client} onChanged={onChanged} />);
}

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
      expect(screen.getByRole('note', { name: 'Sample data' })).toHaveTextContent(/Accounts and workflows are local/i);
      unmount();

      vi.stubEnv('VITE_SOAR_USE_FIXTURES', 'false');
      renderInRouter(<EntryPage />);
      expect(screen.queryByRole('note', { name: 'Sample data' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('loads organization directory pages beyond the first set with the opaque cursor', async () => {
    const base = createFixtureWorkflowDataClient();
    const summary = (id: string, name: string) => ({ id, slug: id, name, shortDescription: `${name} description`, contactEmail: `${id}@example.edu`, recruitmentTitle: 'Recruitment' });
    const firstItems = Array.from({ length: 20 }, (_, index) => summary(`saved-${index}`, `Saved organization ${index}`));
    const listOrganizations = vi.fn()
      .mockResolvedValueOnce({ data: { items: firstItems, nextPageToken: 'cursor-after-twenty' }, source: 'fixture' })
      .mockResolvedValueOnce({ data: { items: [summary('admin-created', 'Admin-created organization')] }, source: 'fixture' });
    renderInRouter(<DirectoryView session={studentSession} client={{ ...base, listOrganizations }} />);

    expect(await screen.findByText('Saved organization 19')).toBeInTheDocument();
    expect(listOrganizations).toHaveBeenCalledWith(studentSession, { limit: 20, query: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Load more organizations' }));
    expect(await screen.findByText('Admin-created organization')).toBeInTheDocument();
    expect(listOrganizations).toHaveBeenNthCalledWith(2, studentSession, { limit: 20, pageToken: 'cursor-after-twenty', query: '' });
  });

  it('ignores stale organization search responses when the query changes', async () => {
    const base = createFixtureWorkflowDataClient();
    const summary = (id: string, name: string) => ({ id, slug: id, name, shortDescription: '', contactEmail: '', recruitmentTitle: '' });
    const pending = new Map<string, (result: { data: { items: OrganizationSummary[] }; source: 'fixture' }) => void>();
    const listOrganizations = vi.fn((_session: UserSession, page?: { limit?: number; pageToken?: string; query?: string }) => {
      if (page?.query === 'la' || page?.query === 'late') return new Promise<{ data: { items: OrganizationSummary[] }; source: 'fixture' }>((resolve) => pending.set(page.query!, resolve));
      return Promise.resolve({ data: { items: [], nextPageToken: undefined }, source: 'fixture' as const });
    });
    renderInRouter(<DirectoryView session={studentSession} client={{ ...base, listOrganizations }} />);
    const input = await screen.findByLabelText(/Search by organization name/i);
    await userEvent.type(input, 'late');
    await waitFor(() => expect(pending.has('la') && pending.has('late')).toBe(true));
    pending.get('late')?.({ data: { items: [summary('late-org', 'Late match')] }, source: 'fixture' });
    expect(await screen.findByText('Late match')).toBeInTheDocument();
    pending.get('la')?.({ data: { items: [summary('stale-org', 'Stale match')] }, source: 'fixture' });
    await waitFor(() => expect(screen.queryByText('Stale match')).not.toBeInTheDocument());
    expect(screen.getByText('Late match')).toBeInTheDocument();
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

  it('keeps confirmation locked until the external form opens, then blocks a second application for that organization', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const newStudentSession = { ...studentSession, uid: 'student-new', email: 'new.student@example.edu' };
    const view = <OrganizationView organizationId="literary" session={newStudentSession} client={client} />;
    const { unmount } = renderInRouter(view, ['/app/organizations/literary?tab=apply']);

    const confirm = await screen.findByRole('button', { name: /I submitted the external form/i });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole('link', { name: /open external form/i }));
    expect(confirm).toBeEnabled();
    expect(screen.getByText(/SOAR cannot verify external submissions/i)).toBeInTheDocument();

    await user.click(confirm);
    expect(await screen.findByText(/External submission confirmation recorded/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Application already on file' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I submitted the external form/i })).not.toBeInTheDocument();
    unmount();

    renderInRouter(view, ['/app/organizations/literary?tab=apply']);
    expect(await screen.findByRole('heading', { name: 'Application already on file' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open external form/i })).not.toBeInTheDocument();
  });

  it('shows existing applications instead of opening another application form', async () => {
    renderInRouter(<OrganizationView organizationId="robotics" session={studentSession} client={createFixtureWorkflowDataClient()} />, ['/app/organizations/robotics?tab=apply']);

    expect(await screen.findByRole('heading', { name: 'Application already on file' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View application tracker' })).toHaveAttribute('href', '/app/applications?tab=mine');
    expect(screen.queryByRole('link', { name: /open external form/i })).not.toBeInTheDocument();
  });

  it('shows closed intake and rejects a stale external form confirmation', async () => {
    const user = userEvent.setup();
    const closedClient = createFixtureWorkflowDataClient();
    await closedClient.setApplicationsOpen('robotics', false, officerSession);
    const { unmount } = renderInRouter(<OrganizationView organizationId="robotics" session={{ ...studentSession, uid: 'student-new' }} client={closedClient} />, ['/app/organizations/robotics?tab=apply']);

    expect(await screen.findByRole('heading', { name: 'Applications are closed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I submitted the external form/i })).not.toBeInTheDocument();
    unmount();

    const staleClient = createFixtureWorkflowDataClient();
    staleClient.confirmExternalApplication = vi.fn(async () => {
      throw Object.assign(new Error('Applications are closed.'), { code: 'applications_closed' });
    });
    renderInRouter(<OrganizationView organizationId="literary" session={{ ...studentSession, uid: 'student-stale' }} client={staleClient} />, ['/app/organizations/literary?tab=apply']);
    await user.click(await screen.findByRole('link', { name: /open external form/i }));
    await user.click(screen.getByRole('button', { name: /I submitted the external form/i }));

    expect(await screen.findByRole('heading', { name: 'Applications are closed' })).toBeInTheDocument();
    expect(await screen.findByText(/Applications closed before SOAR recorded your confirmation/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I submitted the external form/i })).not.toBeInTheDocument();
  });

  it('excludes sponsors from application tools and tracker rows', async () => {
    const organizationView = renderInRouter(<OrganizationView organizationId="robotics" session={sponsorSession} client={createFixtureWorkflowDataClient()} />);

    expect(await screen.findByRole('heading', { name: /Computer Engineering Department/i, level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Apply|Meetings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I submitted the external form/i })).not.toBeInTheDocument();
    organizationView.unmount();

    const sponsorApplications = renderInRouter(<ApplicationsView session={sponsorSession} client={createFixtureWorkflowDataClient()} />);
    expect(screen.getByText(/No sponsor application tracker/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Application intake' })).not.toBeInTheDocument();
    sponsorApplications.unmount();

    const sponsorWithGrant: UserSession = { ...sponsorSession, officerGrants: officerSession.officerGrants };
    renderInRouter(<OrganizationSettingsView session={sponsorWithGrant} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByRole('heading', { name: 'No managed organization yet.' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Application intake' })).not.toBeInTheDocument();
  });

  it('does not expose Applications intake to students or revoked officers', async () => {
    const studentView = renderInRouter(<ApplicationsView session={studentSession} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByRole('heading', { name: 'Track each recruitment opportunity once.' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Application intake' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close applications/i })).not.toBeInTheDocument();
    studentView.unmount();

    const revokedSession: UserSession = {
      ...officerSession,
      officerGrants: officerSession.officerGrants.map((grant) => ({ ...grant, status: 'revoked' })),
    };
    const revokedView = renderInRouter(<ApplicationsView session={revokedSession} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByRole('heading', { name: 'Track each recruitment opportunity once.' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Review applicants' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Application intake' })).not.toBeInTheDocument();
    revokedView.unmount();

    const expiredOfficer: UserSession = { ...officerSession, access: { ...activeAccess, status: 'expired' } };
    renderInRouter(<ApplicationsView session={expiredOfficer} client={createFixtureWorkflowDataClient()} />);
    expect(await screen.findByRole('heading', { name: 'Track each recruitment opportunity once.' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Review applicants' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Application intake' })).not.toBeInTheDocument();
  });

  it('scopes the Applications intake tab to approved grants and preserves confirmed organization state across switches', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const saveIntake = client.setApplicationsOpen.bind(client);
    const setApplicationsOpen = vi.fn<WorkflowDataClient['setApplicationsOpen']>();
    setApplicationsOpen.mockRejectedValueOnce(Object.assign(new Error('private server details'), { code: 'internal' }));
    setApplicationsOpen.mockImplementation((organizationId, applicationsOpen, session) => saveIntake(organizationId, applicationsOpen, session));
    client.setApplicationsOpen = setApplicationsOpen;
    const multiOfficerSession: UserSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Architecture Department', status: 'approved' },
        { organizationId: 'health', organizationName: 'Civil Engineering Department', status: 'revoked' },
      ],
    };

    renderInRouter(<ApplicationsView session={multiOfficerSession} client={client} />, ['/app/applications?tab=intake&organizationId=health']);
    expect(await screen.findByRole('tab', { name: 'Review applicants' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My applications' })).toBeInTheDocument();

    const organizationPicker = await screen.findByLabelText(/^Organization$/i, { selector: '#application-intake-organization' });
    expect(organizationPicker).toHaveValue('robotics');
    expect(Array.from((organizationPicker as HTMLSelectElement).options).map((option) => option.value)).toEqual(['robotics', 'literary']);
    let intake = await screen.findByRole('group', { name: 'Application intake' });
    expect(within(intake).getByText('Open')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Application intake for Computer Engineering Department' })).getByRole('heading', { name: 'Computer Engineering Department' })).toBeInTheDocument();

    await user.click(within(intake).getByRole('button', { name: 'Close applications' }));
    expect(await screen.findByText('SOAR could not update application intake. Check your connection and try again.')).toBeInTheDocument();
    expect(within(intake).getByText('Open')).toBeInTheDocument();
    expect(within(intake).getByRole('button', { name: 'Close applications' })).toBeEnabled();
    expect(screen.queryByText('private server details')).not.toBeInTheDocument();

    await user.selectOptions(organizationPicker, 'literary');
    intake = await screen.findByRole('group', { name: 'Application intake' });
    expect(await screen.findByRole('group', { name: 'Application intake for Architecture Department' })).toBeInTheDocument();
    expect(within(intake).getByText('Open')).toBeInTheDocument();
    await user.click(within(intake).getByRole('button', { name: 'Close applications' }));
    expect(await screen.findByRole('button', { name: 'Open applications' })).toBeInTheDocument();
    expect(setApplicationsOpen).toHaveBeenLastCalledWith('literary', false, multiOfficerSession);
    expect((await client.getOrganization('literary', multiOfficerSession)).data?.applicationsOpen).toBe(false);

    await user.click(screen.getByRole('tab', { name: 'Review applicants' }));
    await user.click(screen.getByRole('tab', { name: 'Application intake' }));
    const reenteredPicker = await screen.findByLabelText(/^Organization$/i, { selector: '#application-intake-organization' });
    expect(reenteredPicker).toHaveValue('literary');
    intake = await screen.findByRole('group', { name: 'Application intake' });
    expect(within(intake).getByText('Closed')).toBeInTheDocument();

    await user.selectOptions(reenteredPicker, 'robotics');
    expect(await screen.findByRole('group', { name: 'Application intake for Computer Engineering Department' })).toBeInTheDocument();
    intake = await screen.findByRole('group', { name: 'Application intake' });
    expect(within(intake).getByText('Open')).toBeInTheDocument();
    await user.selectOptions(reenteredPicker, 'literary');
    expect(await screen.findByRole('group', { name: 'Application intake for Architecture Department' })).toBeInTheDocument();
    intake = await screen.findByRole('group', { name: 'Application intake' });
    expect(within(intake).getByText('Closed')).toBeInTheDocument();
    expect(within(intake).getByRole('button', { name: 'Open applications' })).toBeEnabled();
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

  it('shows the accomplishment and financial reports explanation above the viewer-only action or unset state', async () => {
    const fixture = createFixtureWorkflowDataClient();
    const { unmount } = renderInRouter(<OrganizationView organizationId="robotics" session={studentSession} client={fixture} />, ['/app/organizations/robotics?tab=reports']);
    const tab = await screen.findByRole('tabpanel', { name: 'Reports' });
    const explanation = within(tab).getByText('View this organization’s accomplishment and financial reports.');
    expect(explanation).toBeInTheDocument();
    expect(within(tab).getByText('Reports link has not been set up yet.')).toBeInTheDocument();
    expect(within(tab).queryByRole('link', { name: 'View reports' })).not.toBeInTheDocument();
    expect(within(tab).queryByRole('textbox')).not.toBeInTheDocument();
    unmount();

    const configured: WorkflowDataClient = {
      ...fixture,
      getOrganization: async (id, session) => {
        const result = await fixture.getOrganization(id, session);
        return result.data ? { ...result, data: { ...result.data, reportsUrl: 'https://reports.example.org/org' } } : result;
      },
    };
    renderInRouter(<OrganizationView organizationId="robotics" session={studentSession} client={configured} />, ['/app/organizations/robotics?tab=reports']);
    const configuredTab = await screen.findByRole('tabpanel', { name: 'Reports' });
    const action = within(configuredTab).getByRole('link', { name: 'View reports' });
    expect(action).toHaveAttribute('href', 'https://reports.example.org/org');
    expect(action).toHaveAttribute('target', '_blank');
    expect(configuredTab.querySelector('header')?.compareDocumentPosition(action) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(configuredTab).queryByRole('textbox')).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText(/Short note/i), 'Please keep this note with my request.');
    await user.upload(screen.getByLabelText(/Formal request document/i), new File(['private pdf'], 'formal-request.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));

    expect(await screen.findByText(/We could not send your meeting request\. It was not confirmed\./i)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Request a meeting\/interview/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Short note/i)).toHaveValue('Please keep this note with my request.');
    expect(screen.getByText(/Selected formal-request\.pdf/i)).toBeInTheDocument();
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

  it('keeps a confirmed meeting request visible when an older list response arrives late', async () => {
    const user = userEvent.setup();
    const base = createFixtureWorkflowDataClient();
    const createdRequest: MeetingRequest = {
      id: 'meeting-student-1-confirmed-refresh',
      organizationId: 'robotics',
      organizationName: 'Computer Engineering Department',
      dateEntryId: 'date-robotics-interview',
      meetingTitle: 'Computer Engineering consultation window',
      requesterUid: studentSession.uid,
      requesterName: studentSession.displayName,
      requestedDate: '2026-11-12',
      requestedTime: '14:30',
      status: 'Pending',
      updatedAt: '2026-10-16T06:00:00.000Z',
    };
    let resolveInitialList: (result: WorkflowQueryResult<MeetingRequest[]>) => void = () => undefined;
    const initialList = new Promise<WorkflowQueryResult<MeetingRequest[]>>((resolve) => { resolveInitialList = resolve; });
    const listMyMeetingRequests = vi.fn()
      .mockReturnValueOnce(initialList)
      .mockResolvedValueOnce({ data: [createdRequest], source: 'fixture' });
    const requestMeeting = vi.fn().mockResolvedValue({
      ok: true,
      persisted: true,
      source: 'fixture' as const,
      message: 'Meeting request created as Pending.',
      data: createdRequest,
    });
    const client: WorkflowDataClient = { ...base, listMyMeetingRequests, requestMeeting };
    renderInRouter(<MeetingsView session={studentSession} client={client} />);

    await screen.findAllByText(/Computer Engineering consultation window/i);
    await user.click(screen.getByRole('button', { name: /^Request meeting$/i }));
    await user.clear(screen.getByLabelText(/Requested time/i));
    await user.type(screen.getByLabelText(/Requested time/i), '14:30');
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));
    expect(await screen.findByText(/Meeting request created as Pending/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Request a meeting\/interview/i })).not.toBeInTheDocument();

    await act(async () => {
      resolveInitialList({ data: [], source: 'fixture' });
      await initialList;
    });
    await user.click(screen.getByRole('tab', { name: 'My requests' }));

    const table = await screen.findByRole('region', { name: 'My meeting request statuses' });
    expect(within(table).getAllByText('Computer Engineering consultation window')).toHaveLength(1);
    expect(within(table).getByText('2026-11-12, 14:30')).toBeInTheDocument();
    expect(requestMeeting).toHaveBeenCalledTimes(1);
    expect(listMyMeetingRequests).toHaveBeenCalledTimes(2);
  });

  it('lets an officer decide their own submitted request and refreshes both status views', async () => {
    const user = userEvent.setup();
    const base = createFixtureWorkflowDataClient();
    const createdRequest: MeetingRequest = {
      id: 'meeting-officer-1-confirmed-refresh',
      organizationId: 'robotics',
      organizationName: 'Computer Engineering Department',
      dateEntryId: 'date-robotics-interview',
      meetingTitle: 'Computer Engineering consultation window',
      requesterUid: officerSession.uid,
      requesterName: officerSession.displayName,
      requestedDate: '2026-11-12',
      requestedTime: '14:30',
      status: 'Pending',
      updatedAt: '2026-10-16T06:01:00.000Z',
    };
    let savedRequest: MeetingRequest | undefined;
    const requestMeeting = vi.fn(async () => {
      savedRequest = createdRequest;
      return { ok: true, persisted: true, source: 'fixture' as const, message: 'Meeting request created as Pending.', data: createdRequest };
    });
    const listMyMeetingRequests = vi.fn(async () => ({ data: savedRequest ? [savedRequest] : [], source: 'fixture' as const }));
    const getOfficerDashboard = vi.fn(async (organizationId: string, session: UserSession) => {
      const result = await base.getOfficerDashboard(organizationId, session);
      if (!result.data || !savedRequest) return result;
      return { ...result, data: { ...result.data, meetingRequests: [...result.data.meetingRequests.filter((request) => request.id !== savedRequest!.id), savedRequest] } };
    });
    const decideMeetingRequest = vi.fn(async (_id: string, status: 'Approved' | 'Declined') => {
      savedRequest = { ...createdRequest, status, updatedAt: '2026-10-16T06:02:00.000Z' };
      return { ok: true, persisted: true, source: 'fixture' as const, message: `Meeting request ${status.toLowerCase()}.`, data: savedRequest };
    });
    const client: WorkflowDataClient = { ...base, requestMeeting, listMyMeetingRequests, getOfficerDashboard, decideMeetingRequest };
    renderInRouter(<MeetingsView session={officerSession} client={client} />);

    await screen.findByRole('region', { name: 'Meeting requests to review' });
    await user.click(screen.getByRole('tab', { name: 'Availability' }));
    await screen.findAllByText(/Computer Engineering consultation window/i);
    await user.click(screen.getByRole('button', { name: /^Request meeting$/i }));
    await user.clear(screen.getByLabelText(/Requested time/i));
    await user.type(screen.getByLabelText(/Requested time/i), '14:30');
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));
    expect(await screen.findByText(/Meeting request created as Pending/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'My requests' }));
    const myRequests = await screen.findByRole('region', { name: 'My meeting request statuses' });
    expect(within(myRequests).getAllByText('2026-11-12, 14:30')).toHaveLength(1);

    await user.click(screen.getByRole('tab', { name: 'Review requests' }));
    const reviewRequests = await screen.findByRole('region', { name: 'Meeting requests for this organization' });
    const ownRequestRow = within(reviewRequests).getByText('Lia Cruz').closest('tr');
    expect(ownRequestRow).not.toBeNull();
    await user.click(within(ownRequestRow as HTMLElement).getByRole('button', { name: 'Approve' }));
    expect(await within(ownRequestRow as HTMLElement).findByText('Approved')).toBeInTheDocument();
    expect(decideMeetingRequest).toHaveBeenCalledWith(createdRequest.id, 'Approved', 'robotics', officerSession);
    expect(getOfficerDashboard).toHaveBeenCalledTimes(2);
    expect(listMyMeetingRequests).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole('tab', { name: 'My requests' }));
    const refreshedMyRequests = await screen.findByRole('region', { name: 'My meeting request statuses' });
    const savedRow = within(refreshedMyRequests).getByText('Computer Engineering Department').closest('tr');
    expect(savedRow).not.toBeNull();
    expect(within(savedRow as HTMLElement).getByText('Approved')).toBeInTheDocument();
    expect(within(refreshedMyRequests).getAllByText('2026-11-12, 14:30')).toHaveLength(1);
    expect(requestMeeting).toHaveBeenCalledTimes(1);
  });

  it('does not show an unconfirmed own-request decision as accepted and refreshes both lists', async () => {
    const base = createFixtureWorkflowDataClient();
    const ownRequest: MeetingRequest = {
      id: 'meeting-officer-unconfirmed-decision',
      organizationId: 'robotics',
      organizationName: 'Computer Engineering Department',
      dateEntryId: 'date-robotics-interview',
      meetingTitle: 'Computer Engineering consultation window',
      requesterUid: officerSession.uid,
      requesterName: officerSession.displayName,
      requestedDate: '2026-11-12',
      requestedTime: '14:30',
      status: 'Pending',
      updatedAt: '2026-10-16T06:01:00.000Z',
    };
    const dashboard = (await base.getOfficerDashboard('robotics', officerSession)).data!;
    const decideMeetingRequest = vi.fn().mockResolvedValue({ ok: true, persisted: 'unconfirmed', source: 'production', message: 'Internal failure details.' });
    const client: WorkflowDataClient = { ...base, decideMeetingRequest };
    const onDashboardChanged = vi.fn(async () => undefined);
    const onRequestsChanged = vi.fn(async () => undefined);
    renderInRouter(<MeetingDecisionsSection dashboard={{ ...dashboard, meetingRequests: [ownRequest] }} session={officerSession} client={client} onChanged={onDashboardChanged} onRequestsChanged={onRequestsChanged} />);

    const table = screen.getByRole('region', { name: 'Meeting requests for this organization' });
    const ownRequestRow = within(table).getByText('Lia Cruz').closest('tr') as HTMLElement;
    await userEvent.setup().click(within(ownRequestRow).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText(/We could not confirm this meeting decision/i)).toBeInTheDocument();
    expect(screen.queryByText(/Internal failure details/i)).not.toBeInTheDocument();
    expect(within(ownRequestRow).getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    expect(onDashboardChanged).toHaveBeenCalledTimes(1);
    expect(onRequestsChanged).toHaveBeenCalledTimes(1);
    expect(decideMeetingRequest).toHaveBeenCalledTimes(1);
  });

  it('does not expose self-decision actions through an organization-id alias grant', async () => {
    const base = createFixtureWorkflowDataClient();
    const dashboard = (await base.getOfficerDashboard('robotics', officerSession)).data!;
    const aliasedSession: UserSession = {
      ...officerSession,
      officerGrants: [{ organizationId: 'coding-society', organizationName: 'Computer Engineering Department', status: 'approved' }],
    };
    const ownRequest: MeetingRequest = {
      id: 'meeting-officer-foreign-scope',
      organizationId: 'robotics',
      organizationName: 'Computer Engineering Department',
      dateEntryId: 'date-robotics-interview',
      meetingTitle: 'Computer Engineering consultation window',
      requesterUid: officerSession.uid,
      requesterName: officerSession.displayName,
      requestedDate: '2026-11-12',
      requestedTime: '14:30',
      status: 'Pending',
      updatedAt: '2026-10-16T06:01:00.000Z',
    };
    renderInRouter(<MeetingDecisionsSection dashboard={{ ...dashboard, meetingRequests: [ownRequest] }} session={aliasedSession} client={base} onChanged={() => undefined} />);

    const table = screen.getByRole('region', { name: 'Meeting requests for this organization' });
    const ownRequestRow = within(table).getByText('Lia Cruz').closest('tr') as HTMLElement;
    expect(within(ownRequestRow).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(within(ownRequestRow).queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  it('does not present an unconfirmed meeting submission as saved', async () => {
    const user = userEvent.setup();
    const base = createFixtureWorkflowDataClient();
    const requestMeeting = vi.fn().mockResolvedValue({
      ok: true,
      persisted: 'unconfirmed' as const,
      source: 'production' as const,
      message: 'Internal persistence details must not appear.',
    });
    const client: WorkflowDataClient = { ...base, requestMeeting };
    renderInRouter(<MeetingsView session={studentSession} client={client} />);

    await screen.findAllByText(/Computer Engineering consultation window/i);
    await user.click(screen.getByRole('button', { name: /^Request meeting$/i }));
    await user.click(screen.getByRole('button', { name: /Send request as Pending/i }));

    expect(await screen.findByText(/We could not confirm that your meeting request was saved/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Request a meeting\/interview/i })).toBeInTheDocument();
    expect(screen.queryByText(/Internal persistence details/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Meeting request created as Pending/i)).not.toBeInTheDocument();
    expect(requestMeeting).toHaveBeenCalledTimes(1);
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

  it('loads a direct-linked announcement outside page one with one bounded lookup', async () => {
    const base = createFixtureWorkflowDataClient();
    const post = (id: string, body: string) => ({ id, organizationId: 'robotics', organizationName: 'Computer Engineering Department', createdAt: '2026-10-01T00:00:00.000Z', body, likeCount: 0, viewerHasLiked: false, comments: [] });
    const listAnnouncements = vi.fn().mockResolvedValue({ data: { items: Array.from({ length: 15 }, (_, index) => post(`page-${index}`, `Page post ${index}`)), nextPageToken: 'cursor-15' }, source: 'fixture' });
    const getAnnouncement = vi.fn().mockResolvedValue({ data: post('outside-page', 'Linked announcement on page two'), source: 'fixture' });
    renderInRouter(<FeedView session={studentSession} client={{ ...base, listAnnouncements, getAnnouncement }} />, ['/app?announcementId=outside-page']);

    expect(await screen.findByText('Linked announcement on page two')).toBeInTheDocument();
    expect(getAnnouncement).toHaveBeenCalledTimes(1);
    expect(getAnnouncement).toHaveBeenCalledWith('outside-page', studentSession);
    expect(listAnnouncements).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Load more announcements' })).toBeInTheDocument();
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

  it('reconciles a later feed page like and comment thread without losing the loaded cursor', async () => {
    const user = userEvent.setup();
    const base = createFixtureWorkflowDataClient();
    const makePost = (id: string, body: string): Announcement => ({
      id,
      organizationId: 'robotics',
      organizationName: 'Computer Engineering Department',
      createdAt: '2026-10-10T00:00:00.000Z',
      body,
      likeCount: 2,
      viewerHasLiked: false,
      commentCount: 1,
      comments: [],
    });
    const firstPage = Array.from({ length: 15 }, (_, index) => makePost(`feed-${index}`, `Feed post ${index}`));
    const laterPost = makePost('feed-later', 'Later-page announcement');
    const followingPost = makePost('feed-following', 'Third-page announcement');
    const firstComment = { id: 'comment-first', authorUid: studentSession.uid, authorName: studentSession.displayName, body: 'Original later-page comment.', createdAt: '2026-10-10T00:01:00.000Z', viewerCanEdit: true, viewerCanDelete: true };
    const addedComment = { id: 'comment-added', authorUid: studentSession.uid, authorName: studentSession.displayName, body: 'Added on the later page.', createdAt: '2026-10-10T00:02:00.000Z', viewerCanEdit: true, viewerCanDelete: true };
    const editedComment = { ...firstComment, body: 'Edited on the later page.', updatedAt: '2026-10-10T00:03:00.000Z' };
    const listAnnouncements = vi.fn<WorkflowDataClient['listAnnouncements']>()
      .mockResolvedValueOnce({ data: { items: firstPage, nextPageToken: 'cursor-page-two' }, source: 'fixture' })
      .mockResolvedValueOnce({ data: { items: [laterPost], nextPageToken: 'cursor-page-three' }, source: 'fixture' })
      .mockResolvedValueOnce({ data: { items: [followingPost] }, source: 'fixture' });
    const listAnnouncementComments = vi.fn<WorkflowDataClient['listAnnouncementComments']>()
      .mockResolvedValueOnce({ data: [firstComment], source: 'fixture' })
      .mockResolvedValueOnce({ data: [firstComment, addedComment], source: 'fixture' })
      .mockResolvedValueOnce({ data: [editedComment, addedComment], source: 'fixture' })
      .mockResolvedValueOnce({ data: [editedComment], source: 'fixture' });
    const updatedPost = (commentCount: number): Announcement => ({ ...laterPost, likeCount: 7, viewerHasLiked: true, commentCount });
    const client: WorkflowDataClient = {
      ...base,
      listAnnouncements,
      listAnnouncementComments,
      getAnnouncement: vi.fn<WorkflowDataClient['getAnnouncement']>()
        .mockResolvedValueOnce({ data: updatedPost(2), source: 'fixture' })
        .mockResolvedValueOnce({ data: updatedPost(2), source: 'fixture' })
        .mockResolvedValueOnce({ data: updatedPost(1), source: 'fixture' }),
      toggleAnnouncementLike: vi.fn<WorkflowDataClient['toggleAnnouncementLike']>().mockResolvedValue({ ok: true, persisted: true, source: 'fixture', message: 'Liked.', data: updatedPost(1) }),
      addAnnouncementComment: vi.fn<WorkflowDataClient['addAnnouncementComment']>().mockResolvedValue({ ok: true, persisted: true, source: 'fixture', message: 'Comment added.', data: addedComment }),
      updateAnnouncementComment: vi.fn<WorkflowDataClient['updateAnnouncementComment']>().mockResolvedValue({ ok: true, persisted: true, source: 'fixture', message: 'Comment updated.', data: editedComment }),
      deleteAnnouncementComment: vi.fn<WorkflowDataClient['deleteAnnouncementComment']>().mockResolvedValue({ ok: true, persisted: true, source: 'fixture', message: 'Comment deleted.' }),
    };
    renderInRouter(<FeedView session={studentSession} client={client} />);

    expect(await screen.findByText('Feed post 14')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more announcements' }));
    expect(await screen.findByText('Later-page announcement')).toBeInTheDocument();
    const card = screen.getByText('Later-page announcement').closest('article') as HTMLElement;

    await user.click(within(card).getByRole('button', { name: /Like announcement from Computer Engineering Department/ }));
    expect(within(card).getByRole('button', { name: /Unlike announcement from Computer Engineering Department; 7 likes/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(card).getByRole('button', { name: /Open comments/i }));
    expect(await within(card).findByText('Original later-page comment.')).toBeInTheDocument();

    await user.type(within(card).getByLabelText('Add comment'), 'A later-page reply.');
    await user.click(within(card).getByRole('button', { name: 'Add comment' }));
    expect(await within(card).findByText('Added on the later page.')).toBeInTheDocument();
    expect(await within(card).findByRole('button', { name: /Hide comments \(2\)/i })).toBeInTheDocument();

    const originalCommentRow = within(card).getByText('Original later-page comment.').closest('li') as HTMLElement;
    await user.click(within(originalCommentRow).getByRole('button', { name: 'Edit' }));
    await user.clear(within(originalCommentRow).getByLabelText(/Edit comment by Mara Santos/i));
    await user.type(within(originalCommentRow).getByLabelText(/Edit comment by Mara Santos/i), 'Edited on the later page.');
    await user.click(within(card).getByRole('button', { name: 'Save comment' }));
    expect(await within(card).findByText('Edited on the later page.')).toBeInTheDocument();

    const addedCommentRow = within(card).getByText('Added on the later page.').closest('li') as HTMLElement;
    await user.click(within(addedCommentRow).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(await within(card).findByText('Edited on the later page.')).toBeInTheDocument();
    expect(within(card).queryByText('Added on the later page.')).not.toBeInTheDocument();
    expect(await within(card).findByRole('button', { name: /Hide comments \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more announcements' })).toBeInTheDocument();
    expect(listAnnouncements).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Load more announcements' }));
    expect(await screen.findByText('Third-page announcement')).toBeInTheDocument();
    expect(screen.getByText('Later-page announcement')).toBeInTheDocument();
    expect(listAnnouncements).toHaveBeenNthCalledWith(3, studentSession, { limit: 15, pageToken: 'cursor-page-three' });
  });

  it('ignores a late feed interaction response after the session changes', async () => {
    const user = userEvent.setup();
    const oldPost: Announcement = { id: 'same-announcement', organizationId: 'robotics', organizationName: 'Computer Engineering Department', createdAt: '2026-10-10T00:00:00.000Z', body: 'Prior session post.', likeCount: 2, viewerHasLiked: false, commentCount: 0, comments: [] };
    const newPost: Announcement = { ...oldPost, body: 'Current session post.', likeCount: 9 };
    const oldClient = createFixtureWorkflowDataClient();
    oldClient.listAnnouncements = vi.fn<WorkflowDataClient['listAnnouncements']>().mockResolvedValue({ data: { items: [oldPost] }, source: 'fixture' });
    let resolveLike!: (result: WorkflowMutationResult<Announcement>) => void;
    oldClient.toggleAnnouncementLike = vi.fn<WorkflowDataClient['toggleAnnouncementLike']>(() => new Promise((resolve) => { resolveLike = resolve; }));
    const newClient = createFixtureWorkflowDataClient();
    newClient.listAnnouncements = vi.fn<WorkflowDataClient['listAnnouncements']>().mockResolvedValue({ data: { items: [newPost] }, source: 'fixture' });
    const nextSession: UserSession = { ...studentSession, uid: 'student-2', displayName: 'New viewer' };
    const rendered = renderInRouter(<FeedView session={studentSession} client={oldClient} />);

    expect(await screen.findByText('Prior session post.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Like announcement from Computer Engineering Department; 2 likes/i }));
    rendered.rerender(<MemoryRouter><FeedView session={nextSession} client={newClient} /></MemoryRouter>);
    expect(await screen.findByText('Current session post.')).toBeInTheDocument();

    await act(async () => {
      resolveLike({ ok: true, persisted: true, source: 'fixture', message: 'Liked.', data: { ...oldPost, likeCount: 99, viewerHasLiked: true } });
    });
    expect(screen.getByText('Current session post.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Like announcement from Computer Engineering Department; 9 likes/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Prior session post.')).not.toBeInTheDocument();
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

  it('maps announcement upload failures safely and keeps the draft available to retry', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const providerError = Object.assign(new Error('Firebase Storage denied object gs://private-bucket/secret/path'), { code: 'storage/unauthorized' });
    const publishAnnouncement = vi.spyOn(client, 'publishAnnouncement').mockRejectedValueOnce(providerError);
    renderInRouter(<FeedView session={officerSession} client={client} />);

    await user.click(await screen.findByRole('button', { name: /Post announcement/i }));
    await user.type(screen.getByLabelText(/Post text/i), 'Draft that should survive an upload failure.');
    await user.upload(screen.getByLabelText(/Optional media/i), new File(['image'], 'campus.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: /^Publish announcement$/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('You do not have permission to upload this file.');
    expect(screen.queryByText(/private-bucket|secret\/path|Firebase Storage denied/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Post text/i)).toHaveValue('Draft that should survive an upload failure.');
    expect(screen.getByRole('img', { name: 'campus.png' })).toBeInTheDocument();
    expect(publishAnnouncement).toHaveBeenCalledOnce();
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
    expect(screen.getByRole('tab', { name: 'Application intake' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Application intake' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /View public profile/i })).toHaveLength(1);
    expect(screen.queryByLabelText(/Post text/i)).not.toBeInTheDocument();
    const organizationSelector = screen.getByLabelText(/^Organization$/i);
    expect(organizationSelector).toHaveValue('robotics');
    expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Computer Engineering Department');

    await user.selectOptions(organizationSelector, 'literary');
    await waitFor(() => expect(screen.getByLabelText(/^Organization name$/i)).toHaveValue('Architecture Department'));
    expect(screen.queryByDisplayValue('Civil Engineering Department')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Application intake' }));
    expect(await screen.findByRole('group', { name: 'Application intake' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Application intake for Architecture Department' })).getByRole('heading', { name: 'Architecture Department' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^Details$/i }));
    await user.click(screen.getByRole('tab', { name: 'Application intake' }));
    expect(await screen.findByRole('group', { name: 'Application intake for Architecture Department' })).toBeInTheDocument();
  });

  it('lets a scoped officer set, clear, and recover from reports-link save errors in the Reports tab', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const saveReports = vi.fn(client.setOrganizationReportsUrl.bind(client));
    let failNext = true;
    client.setOrganizationReportsUrl = async (...args) => {
      if (failNext) {
        failNext = false;
        return { ok: false, persisted: false, source: client.mode, reason: 'error', message: 'Reports link could not be saved.' };
      }
      return saveReports(...args);
    };
    renderInRouter(<OrganizationSettingsView session={officerSession} client={client} />, ['/settings/organization?organizationId=robotics&tab=reports']);
    const reportsPanel = await screen.findByRole('tabpanel', { name: 'Reports' });
    expect(within(reportsPanel).getByText('View this organization’s accomplishment and financial reports.')).toBeInTheDocument();
    expect(within(reportsPanel).getByText('No reports link is set up yet.')).toBeInTheDocument();
    const editor = within(reportsPanel).getByRole('textbox', { name: 'Reports URL' });
    await user.type(editor, 'https://reports.example.org/robotics');
    const save = within(reportsPanel).getByRole('button', { name: 'Save reports link' });
    await user.click(save);
    expect(await within(reportsPanel).findByText('Reports link could not be saved.')).toBeInTheDocument();
    await user.click(save);
    expect(await screen.findByRole('link', { name: 'View reports' })).toHaveAttribute('href', 'https://reports.example.org/robotics');
    expect(saveReports).toHaveBeenCalledWith('robotics', 'https://reports.example.org/robotics', officerSession);

    const currentEditor = screen.getByRole('textbox', { name: 'Reports URL' });
    await user.clear(currentEditor);
    await user.click(screen.getByRole('button', { name: 'Save reports link' }));
    expect(await screen.findByText('No reports link is set up yet.')).toBeInTheDocument();
    expect(saveReports).toHaveBeenLastCalledWith('robotics', '', officerSession);
  });

  it('lets an approved officer close and reopen only the selected organization intake', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const setApplicationsOpen = vi.fn(client.setApplicationsOpen.bind(client));
    client.setApplicationsOpen = setApplicationsOpen;
    renderInRouter(<OrganizationSettingsView session={officerSession} client={client} />, ['/settings/organization?organizationId=robotics']);

    expect(await screen.findByRole('tab', { name: /^Details$/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('group', { name: 'Application intake' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Application intake' }));
    let intake = await screen.findByRole('group', { name: 'Application intake' });
    expect(within(intake).getByText('Open')).toBeInTheDocument();
    await user.click(within(intake).getByRole('button', { name: 'Close applications' }));

    expect(await screen.findByRole('button', { name: 'Open applications' })).toBeInTheDocument();
    expect(await screen.findByText('Closed')).toBeInTheDocument();
    expect(setApplicationsOpen).toHaveBeenCalledWith('robotics', false, officerSession);
    expect((await client.getOrganization('robotics', officerSession)).data?.applicationsOpen).toBe(false);

    await user.click(screen.getByRole('tab', { name: /^Details$/i }));
    await user.click(screen.getByRole('tab', { name: 'Application intake' }));
    intake = await screen.findByRole('group', { name: 'Application intake' });
    expect(within(intake).getByText('Closed')).toBeInTheDocument();
    await user.click(within(intake).getByRole('button', { name: 'Open applications' }));
    expect(await screen.findByRole('button', { name: 'Close applications' })).toBeInTheDocument();
    expect(setApplicationsOpen).toHaveBeenLastCalledWith('robotics', true, officerSession);
    expect((await client.getOrganization('robotics', officerSession)).data?.applicationsOpen).toBe(true);
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
    const client = createFixtureWorkflowDataClient();
    const listAnnouncements = vi.spyOn(client, 'listAnnouncements');
    const updateAnnouncement = vi.spyOn(client, 'updateAnnouncement').mockRejectedValueOnce(new Error('Temporary save error'));
    const { unmount } = renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={client} />, ['/settings/organization?organizationId=robotics&tab=announcements']);

    expect(await screen.findByRole('tab', { name: /Announcements/i })).toHaveAttribute('aria-selected', 'true');
    expect((await screen.findAllByText(/Computer Engineering project night/i)).length).toBeGreaterThan(0);
    expect(await screen.findByRole('img', { name: 'Electronics workbench with small robotics parts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Like announcement from Computer Engineering Department/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open comments/i }));
    expect(await screen.findByText('Is the consultation window open to first-year students?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete announcement' })).toBeInTheDocument();
    expect(listAnnouncements).toHaveBeenCalledWith(multiOfficerSession, { limit: 15, organizationId: 'robotics' });
    await user.click(screen.getByRole('button', { name: 'Edit announcement' }));
    const editor = screen.getByRole('textbox', { name: 'Announcement text' });
    await user.clear(editor);
    await user.type(editor, 'Updated robotics announcement text.');
    await user.click(screen.getByRole('button', { name: 'Close Edit announcement' }));
    expect(screen.getByRole('alertdialog', { name: /Discard unsaved changes/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await user.click(screen.getByRole('button', { name: 'Save announcement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary save error');
    expect(screen.getByRole('textbox', { name: 'Announcement text' })).toHaveValue('Updated robotics announcement text.');
    await user.click(screen.getByRole('button', { name: 'Save announcement' }));
    expect(await screen.findByText('Updated robotics announcement text.')).toBeInTheDocument();
    expect(updateAnnouncement).toHaveBeenCalledTimes(2);
    const announcementPanel = screen.getByRole('tabpanel', { name: /Announcements/i });
    expect(within(announcementPanel).queryByText(/Computer Engineering project night/i)).not.toBeInTheDocument();
    expect((await client.listAnnouncements(multiOfficerSession, { limit: 15, organizationId: 'robotics' })).data.items[0].body).toBe('Updated robotics announcement text.');
    expect(within(announcementPanel).queryByText(/Architecture portfolio clinic signup/i)).not.toBeInTheDocument();
    unmount();

    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={createFixtureWorkflowDataClient()} />, ['/settings/organization?organizationId=literary&tab=dates']);
    expect(await screen.findByRole('tab', { name: /Dates & availability/i })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getAllByText(/Architecture portfolio clinic/i).length).toBeGreaterThan(0));
    expect(within(screen.getByRole('tabpanel', { name: /Dates & availability/i })).queryByText(/Computer Engineering project night/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add dated entry/i }));
    expect(screen.getByRole('dialog', { name: /Add dated entry/i })).toBeInTheDocument();
  });

  it('keeps managed later-page announcements, comments, and cursor through edit and delete', async () => {
    const user = userEvent.setup();
    const base = createFixtureWorkflowDataClient();
    const multiOfficerSession: UserSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Architecture Department', status: 'approved' },
      ],
    };
    const makePost = (id: string, body: string): Announcement => ({
      id,
      organizationId: 'robotics',
      organizationName: 'Computer Engineering Department',
      createdAt: '2026-10-10T00:00:00.000Z',
      body,
      likeCount: 3,
      viewerHasLiked: false,
      commentCount: 1,
      comments: [],
    });
    const firstPage = Array.from({ length: 15 }, (_, index) => makePost(`managed-${index}`, `Managed post ${index}`));
    const laterPost = makePost('managed-later', 'Later managed announcement');
    const survivorPost = makePost('managed-survivor', 'Surviving later announcement');
    const thirdPage = makePost('managed-third-page', 'Managed third-page announcement');
    const comment = { id: 'managed-comment', authorUid: studentSession.uid, authorName: 'Mara Santos', body: 'Keep this thread open.', createdAt: '2026-10-10T00:01:00.000Z' };
    const listAnnouncements = vi.fn<WorkflowDataClient['listAnnouncements']>()
      .mockResolvedValueOnce({ data: { items: firstPage, nextPageToken: 'managed-cursor-two' }, source: 'fixture' })
      .mockResolvedValueOnce({ data: { items: [laterPost, survivorPost], nextPageToken: 'managed-cursor-three' }, source: 'fixture' })
      .mockResolvedValueOnce({ data: { items: [thirdPage] }, source: 'fixture' });
    const updatedPost = { ...laterPost, body: 'Updated later-page announcement', likeCount: 4, viewerHasLiked: true };
    const client: WorkflowDataClient = {
      ...base,
      listAnnouncements,
      listAnnouncementComments: vi.fn<WorkflowDataClient['listAnnouncementComments']>().mockResolvedValue({ data: [comment], source: 'fixture' }),
      toggleAnnouncementLike: vi.fn<WorkflowDataClient['toggleAnnouncementLike']>().mockResolvedValue({ ok: true, persisted: true, source: 'fixture', message: 'Liked.', data: { ...laterPost, likeCount: 4, viewerHasLiked: true } }),
      updateAnnouncement: vi.fn<WorkflowDataClient['updateAnnouncement']>().mockResolvedValue({ ok: true, persisted: true, source: 'fixture', message: 'Announcement updated.', data: updatedPost }),
      deleteAnnouncement: vi.fn<WorkflowDataClient['deleteAnnouncement']>().mockResolvedValue({ ok: true, persisted: true, source: 'fixture', message: 'Announcement deleted.' }),
    };
    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={client} />, ['/settings/organization?organizationId=robotics&tab=announcements']);

    expect(await screen.findByText('Managed post 14')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more announcements' }));
    expect(await screen.findByText('Later managed announcement')).toBeInTheDocument();
    const card = screen.getByText('Later managed announcement').closest('article') as HTMLElement;
    const cardContainer = card.parentElement as HTMLElement;
    await user.click(within(card).getByRole('button', { name: /Like announcement from Computer Engineering Department/ }));
    expect(within(card).getByRole('button', { name: /Unlike announcement from Computer Engineering Department; 4 likes/i })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(card).getByRole('button', { name: /Open comments/i }));
    expect(await within(card).findByText('Keep this thread open.')).toBeInTheDocument();

    await user.click(within(cardContainer).getByRole('button', { name: 'Edit announcement' }));
    const editor = screen.getByRole('textbox', { name: 'Announcement text' });
    await user.clear(editor);
    await user.type(editor, 'Updated later-page announcement');
    await user.click(screen.getByRole('button', { name: 'Save announcement' }));
    expect(await screen.findByText('Updated later-page announcement')).toBeInTheDocument();
    expect(within(card).getByText('Keep this thread open.')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Hide comments \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText('Surviving later announcement')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more announcements' })).toBeInTheDocument();
    expect(listAnnouncements).toHaveBeenCalledTimes(2);

    await user.click(within(cardContainer).getByRole('button', { name: 'Delete announcement' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete announcement' }));
    await waitFor(() => expect(screen.queryByText('Updated later-page announcement')).not.toBeInTheDocument());
    expect(screen.getByText('Surviving later announcement')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more announcements' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more announcements' }));
    expect(await screen.findByText('Managed third-page announcement')).toBeInTheDocument();
    expect(screen.getByText('Surviving later announcement')).toBeInTheDocument();
    expect(listAnnouncements).toHaveBeenNthCalledWith(3, multiOfficerSession, { limit: 15, pageToken: 'managed-cursor-three', organizationId: 'robotics' });
  });

  it('does not let a late managed announcement response cross organization scope', async () => {
    const user = userEvent.setup();
    const base = createFixtureWorkflowDataClient();
    const multiOfficerSession: UserSession = {
      ...officerSession,
      officerGrants: [
        ...officerSession.officerGrants,
        { organizationId: 'literary', organizationName: 'Architecture Department', status: 'approved' },
      ],
    };
    const roboticsPost: Announcement = { id: 'robotics-post', organizationId: 'robotics', organizationName: 'Computer Engineering Department', createdAt: '2026-10-10T00:00:00.000Z', body: 'Robotics scoped post.', likeCount: 2, viewerHasLiked: false, commentCount: 0, comments: [] };
    const literaryPost: Announcement = { id: 'literary-post', organizationId: 'literary', organizationName: 'Architecture Department', createdAt: '2026-10-10T00:00:00.000Z', body: 'Literary scoped post.', likeCount: 8, viewerHasLiked: false, commentCount: 0, comments: [] };
    const listAnnouncements = vi.fn<WorkflowDataClient['listAnnouncements']>()
      .mockResolvedValueOnce({ data: { items: [roboticsPost] }, source: 'fixture' })
      .mockResolvedValueOnce({ data: { items: [literaryPost] }, source: 'fixture' });
    let resolveLike!: (result: WorkflowMutationResult<Announcement>) => void;
    const client: WorkflowDataClient = {
      ...base,
      listAnnouncements,
      toggleAnnouncementLike: vi.fn<WorkflowDataClient['toggleAnnouncementLike']>(() => new Promise((resolve) => { resolveLike = resolve; })),
    };
    renderInRouter(<OrganizationSettingsView session={multiOfficerSession} client={client} />, ['/settings/organization?organizationId=robotics&tab=announcements']);

    expect(await screen.findByText('Robotics scoped post.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Like announcement from Computer Engineering Department; 2 likes/i }));
    await user.selectOptions(screen.getByLabelText('Organization'), 'literary');
    expect(await screen.findByText('Literary scoped post.')).toBeInTheDocument();
    await act(async () => {
      resolveLike({ ok: true, persisted: true, source: 'fixture', message: 'Liked.', data: { ...roboticsPost, likeCount: 99, viewerHasLiked: true } });
    });

    expect(screen.getByText('Literary scoped post.')).toBeInTheDocument();
    expect(screen.queryByText('Robotics scoped post.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Like announcement from Architecture Department; 8 likes/i })).toHaveAttribute('aria-pressed', 'false');
    expect(listAnnouncements).toHaveBeenLastCalledWith(multiOfficerSession, { limit: 15, organizationId: 'literary' });
  });

  it('keeps the draft pending until persistence confirms, then refreshes once', async () => {
    const client = createFixtureWorkflowDataClient();
    const dashboard = (await client.getOfficerDashboard('robotics', officerSession)).data;
    expect(dashboard).toBeDefined();
    let resolveSave!: (result: WorkflowMutationResult<DateEntry>) => void;
    const pendingSave = new Promise<WorkflowMutationResult<DateEntry>>((resolve) => { resolveSave = resolve; });
    const saveDateEntry = vi.fn<WorkflowDataClient['saveDateEntry']>(() => pendingSave);
    client.saveDateEntry = saveDateEntry;
    const onChanged = vi.fn();
    renderDatedEntrySection(dashboard!, client, onChanged);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add dated entry/i }));
    await enterDatedEntry(user);
    await user.click(screen.getByRole('button', { name: 'Save dated entry' }));

    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByLabelText(/^Title$/i)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Close Add dated entry/i }));
    expect(screen.getByRole('dialog', { name: /Add dated entry/i })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog', { name: /Discard unsaved changes/i })).not.toBeInTheDocument();
    const submitted = saveDateEntry.mock.calls[0]![0];
    resolveSave(saveDateEntryResult(submitted, client.mode));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Add dated entry/i })).not.toBeInTheDocument());
    expect(saveDateEntry).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Dated entry saved.');
  });

  it('keeps typed values after validation failure and safely retries the corrected draft', async () => {
    const client = createFixtureWorkflowDataClient();
    const dashboard = (await client.getOfficerDashboard('robotics', officerSession)).data;
    expect(dashboard).toBeDefined();
    const validationError = Object.assign(new Error('The date entry was invalid.'), { code: 'validation_problem' });
    const saveDateEntry = vi.fn<WorkflowDataClient['saveDateEntry']>();
    saveDateEntry.mockRejectedValueOnce(validationError);
    saveDateEntry.mockImplementationOnce(async (input) => saveDateEntryResult(input, client.mode));
    client.saveDateEntry = saveDateEntry;
    const onChanged = vi.fn();
    renderDatedEntrySection(dashboard!, client, onChanged);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add dated entry/i }));
    await enterDatedEntry(user);
    fireEvent.change(screen.getByLabelText(/Start time/i), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/End time/i), { target: { value: '14:00' } });
    await user.click(screen.getByRole('button', { name: 'Save dated entry' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Check the title, date, times, and details/i);
    expect(screen.getByLabelText(/^Title$/i)).toHaveValue('Portfolio orientation');
    expect(screen.getByLabelText(/^Date$/i)).toHaveValue('2026-12-20');
    expect(screen.getByLabelText(/Short details/i)).toHaveValue('Meet at the engineering hall.');
    expect(screen.getByLabelText(/Start time/i)).toHaveValue('16:00');
    expect(screen.getByLabelText(/End time/i)).toHaveValue('14:00');
    expect(screen.getByRole('button', { name: 'Save dated entry' })).toBeEnabled();

    const firstKey = saveDateEntry.mock.calls[0]![0].idempotencyKey;
    fireEvent.change(screen.getByLabelText(/End time/i), { target: { value: '17:00' } });
    await user.click(screen.getByRole('button', { name: 'Save dated entry' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Add dated entry/i })).not.toBeInTheDocument());
    expect(saveDateEntry).toHaveBeenCalledTimes(2);
    expect(saveDateEntry.mock.calls[1]![0].idempotencyKey).toBe(firstKey);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('checks saved state after a provider error and retries with the same idempotency key', async () => {
    const client = createFixtureWorkflowDataClient();
    const dashboard = (await client.getOfficerDashboard('robotics', officerSession)).data;
    expect(dashboard).toBeDefined();
    const error = Object.assign(new Error('private internal detail'), { code: 'internal', status: 500 });
    const saveDateEntry = vi.fn<WorkflowDataClient['saveDateEntry']>();
    saveDateEntry.mockRejectedValueOnce(error);
    saveDateEntry.mockImplementationOnce(async (input) => saveDateEntryResult(input, client.mode));
    client.saveDateEntry = saveDateEntry;
    const checkSavedState = vi.fn(async () => ({ data: { ...dashboard!, dateEntries: [] }, source: client.mode }));
    client.getOfficerDashboard = checkSavedState;
    const onChanged = vi.fn();
    renderDatedEntrySection(dashboard!, client, onChanged);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add dated entry/i }));
    await enterDatedEntry(user);
    await user.click(screen.getByRole('button', { name: 'Save dated entry' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/save status is unconfirmed/i);
    expect(screen.getByRole('status')).not.toHaveTextContent('private internal detail');
    expect(screen.getByLabelText(/^Title$/i)).toHaveValue('Portfolio orientation');
    expect(checkSavedState).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save dated entry' })).toBeEnabled();

    const firstKey = saveDateEntry.mock.calls[0]![0].idempotencyKey;
    await user.click(screen.getByRole('button', { name: 'Save dated entry' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Add dated entry/i })).not.toBeInTheDocument());
    expect(saveDateEntry).toHaveBeenCalledTimes(2);
    expect(saveDateEntry.mock.calls[1]![0].idempotencyKey).toBe(firstKey);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('confirms a persisted entry after a lost response without submitting it twice', async () => {
    const client = createFixtureWorkflowDataClient();
    const dashboard = (await client.getOfficerDashboard('robotics', officerSession)).data;
    expect(dashboard).toBeDefined();
    const saveDateEntry = vi.fn<WorkflowDataClient['saveDateEntry']>();
    saveDateEntry.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    client.saveDateEntry = saveDateEntry;
    const checkSavedState = vi.fn(async () => {
      const submitted = saveDateEntry.mock.calls[0]![0];
      const saved = saveDateEntryResult(submitted, client.mode).data!;
      return { data: { ...dashboard!, dateEntries: [...dashboard!.dateEntries, saved] }, source: client.mode };
    });
    client.getOfficerDashboard = checkSavedState;
    const onChanged = vi.fn();
    renderDatedEntrySection(dashboard!, client, onChanged);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add dated entry/i }));
    await enterDatedEntry(user);
    await user.click(screen.getByRole('button', { name: 'Save dated entry' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Add dated entry/i })).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent(/saved and confirmed/i);
    expect(checkSavedState).toHaveBeenCalledTimes(1);
    expect(saveDateEntry).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('bounds a stalled save, aborts the request and preserves a safe retry key', async () => {
    const client = createFixtureWorkflowDataClient();
    const dashboard = (await client.getOfficerDashboard('robotics', officerSession)).data;
    expect(dashboard).toBeDefined();
    const neverSettles = new Promise<WorkflowMutationResult<DateEntry>>(() => undefined);
    const saveDateEntry = vi.fn<WorkflowDataClient['saveDateEntry']>();
    saveDateEntry.mockImplementationOnce(() => neverSettles);
    saveDateEntry.mockImplementationOnce(async (input) => saveDateEntryResult(input, client.mode));
    client.saveDateEntry = saveDateEntry;
    const checkSavedState = vi.fn(async () => ({ data: { ...dashboard!, dateEntries: [] }, source: client.mode }));
    client.getOfficerDashboard = checkSavedState;
    const onChanged = vi.fn();
    renderDatedEntrySection(dashboard!, client, onChanged);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add dated entry/i }));
    await enterDatedEntry(user);
    vi.useFakeTimers();
    try {
      fireEvent.submit(screen.getByLabelText(/^Title$/i).closest('form')!);
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
      await act(async () => { await vi.advanceTimersByTimeAsync(DATE_ENTRY_SAVE_TIMEOUT_MS); });
      vi.useRealTimers();

      expect(saveDateEntry.mock.calls[0]![2]?.aborted).toBe(true);
      expect(checkSavedState).toHaveBeenCalledTimes(1);
      expect(await screen.findByRole('status')).toHaveTextContent(/save status is unconfirmed/i);
      expect(screen.getByLabelText(/^Title$/i)).toHaveValue('Portfolio orientation');
      expect(screen.getByLabelText(/Short details/i)).toHaveValue('Meet at the engineering hall.');
      expect(screen.getByRole('button', { name: 'Save dated entry' })).toBeEnabled();

      const firstKey = saveDateEntry.mock.calls[0]![0].idempotencyKey;
      await user.click(screen.getByRole('button', { name: 'Save dated entry' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Add dated entry/i })).not.toBeInTheDocument());
      expect(saveDateEntry).toHaveBeenCalledTimes(2);
      expect(saveDateEntry.mock.calls[1]![0].idempotencyKey).toBe(firstKey);
      expect(onChanged).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires transient password approval before one organization profile save', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const saveProfile = vi.fn(client.saveOrganizationProfile.bind(client));
    let completeReauthentication: (() => void) | undefined;
    const reauthenticate = vi.fn((_password: string, _expectedUid: string) => new Promise<void>((resolve) => { completeReauthentication = resolve; }));
    client.saveOrganizationProfile = saveProfile;
    renderInRouter(<OrganizationSettingsView session={officerSession} client={client} reauthenticate={reauthenticate} />, ['/settings/organization?organizationId=robotics']);

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

    const dialog = screen.getByRole('dialog', { name: /Approve organization changes/i });
    expect(saveProfile).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Password$/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/^Password$/i)).toHaveAttribute('autocomplete', 'current-password');

    await user.type(screen.getByLabelText(/^Password$/i), 'correct-demo-password');
    await user.click(within(dialog).getByRole('button', { name: /^Approve and save changes$/i }));
    expect(screen.getByLabelText(/^Password$/i)).toHaveValue('');
    expect(saveProfile).not.toHaveBeenCalled();
    completeReauthentication?.();
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    expect(reauthenticate).toHaveBeenCalledWith('correct-demo-password', officerSession.uid);
    expect(reauthenticate.mock.invocationCallOrder[0]).toBeLessThan(saveProfile.mock.invocationCallOrder[0]);
    expect(saveProfile.mock.calls[0]?.[0]).not.toHaveProperty('password');
    expect(screen.queryByLabelText(/^Password$/i)).not.toBeInTheDocument();
  });

  it('keeps profile drafts after rejected password approval and clears the transient input', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const saveProfile = vi.fn(client.saveOrganizationProfile.bind(client));
    const reauthenticate = vi.fn().mockRejectedValueOnce(Object.assign(new Error('invalid credential details'), { code: 'auth/invalid-credential' }));
    client.saveOrganizationProfile = saveProfile;
    renderInRouter(<OrganizationSettingsView session={officerSession} client={client} reauthenticate={reauthenticate} />, ['/settings/organization?organizationId=robotics']);

    const nameInput = await screen.findByLabelText(/^Organization name$/i);
    await user.type(nameInput, ' Draft');
    await user.click(screen.getByRole('button', { name: /^Save profile$/i }));
    await user.type(screen.getByLabelText(/^Password$/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^Approve and save changes$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/password could not be verified/i);
    expect(nameInput).toHaveValue('Computer Engineering Department Draft');
    expect(screen.getByLabelText(/^Password$/i)).toHaveValue('');
    expect(saveProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.queryByRole('dialog', { name: /Approve organization changes/i })).not.toBeInTheDocument();
    expect(nameInput).toHaveValue('Computer Engineering Department Draft');
  });

  it('uses password-free synthetic approval only for the labelled fixture build', async () => {
    const user = userEvent.setup();
    const client = createFixtureWorkflowDataClient();
    const saveProfile = vi.fn(client.saveOrganizationProfile.bind(client));
    const reauthenticate = vi.fn(async (_password: string, _expectedUid: string) => undefined);
    client.saveOrganizationProfile = saveProfile;
    vi.stubEnv('VITE_SOAR_USE_FIXTURES', 'true');
    try {
      renderInRouter(<OrganizationSettingsView session={officerSession} client={client} reauthenticate={reauthenticate} />, ['/settings/organization?organizationId=robotics']);
      const nameInput = await screen.findByLabelText(/^Organization name$/i);
      await user.type(nameInput, ' Preview');
      await user.click(screen.getByRole('button', { name: /^Save profile$/i }));

      const dialog = screen.getByRole('dialog', { name: /Approve organization changes/i });
      expect(dialog).toHaveTextContent(/This sample uses local approval only/i);
      expect(within(dialog).queryByLabelText(/^Password$/i)).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /^Approve simulated changes$/i }));

      await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
      expect(reauthenticate).not.toHaveBeenCalled();
      expect(saveProfile.mock.calls[0]?.[0]).not.toHaveProperty('password');
    } finally {
      vi.unstubAllEnvs();
    }
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

  it('publishes bounded announcement images and rejects unsupported videos', async () => {
    const user = userEvent.setup();
    renderInRouter(<FeedView session={officerSession} client={createFixtureWorkflowDataClient()} />);

    await user.click(await screen.findByRole('button', { name: /Post announcement/i }));
    await user.type(screen.getByLabelText(/Post text/i), 'Two image update for the build team.');
    const permissiveUser = userEvent.setup({ applyAccept: false });
    await permissiveUser.upload(screen.getByLabelText(/Optional media/i), new File(['not an image'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText(/Use a PNG, JPEG, GIF, or WebP image/i)).toBeInTheDocument();
    await permissiveUser.upload(screen.getByLabelText(/Optional media/i), [
      new File(['a'], 'robot-a.png', { type: 'image/png' }),
      new File(['video'], 'robot-demo.mp4', { type: 'video/mp4' }),
    ]);
    expect(await screen.findByText(/Use a PNG, JPEG, GIF, or WebP image/i)).toBeInTheDocument();
    expect(screen.queryByText('robot-a.png')).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText(/Optional media/i), new File(['a'], 'robot-a.png', { type: 'image/png' }));
    expect(screen.getByText(/Up to 4 images\. Use PNG, JPEG, GIF, or WebP, up to 30 MB combined\./i)).toBeInTheDocument();
    expect(screen.getByText('robot-a.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Publish announcement$/i }));
    expect(await screen.findByText(/Two image update for the build team/i)).toBeInTheDocument();
    expect(await screen.findByAltText('robot-a.png')).toBeInTheDocument();
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
