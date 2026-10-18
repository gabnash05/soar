import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { safeErrorMessage } from '../../lib/safeErrors';
import { Button, ButtonLink, ExternalButtonLink, LoadingBlock, RoleBadge, StateBlock, StatusChip, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { ApplicationRecord, OrganizationProfile, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import {
  AnnouncementCard,
  DateEntryList,
  EmptyState,
  ErrorState,
  OrganizationAvatar,
  OrganizationIdentityArt,
  ResultMessage,
  RouteUnavailableState,
  StageChip,
  SourceNotice,
  useWorkflowQuery,
  useWorkflowSession,
  WorkflowPageFrame,
} from './pageParts';
import { getApprovedOfficerGrants, getSafeHttpUrl, isSponsor, splitDateEntries } from './workflowUtils';

const phoneHref = (phone: string) => `tel:${phone.replace(/[^+0-9]/g, '')}`;

export function RecruitmentActions({ organization, session, client }: { organization: OrganizationProfile; session: UserSession; client: WorkflowDataClient }) {
  const safeUrl = getSafeHttpUrl(organization.recruitment.externalFormUrl);
  const applicationsQuery = useWorkflowQuery(() => client.listMyApplications(session), [client, session.uid]);
  const [externalFormOpened, setExternalFormOpened] = useState(false);
  const [confirmedApplication, setConfirmedApplication] = useState<WorkflowMutationResult<ApplicationRecord>['data']>(undefined);
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverClosed, setServerClosed] = useState(false);
  const existingApplications = applicationsQuery.data?.filter((application) => application.organizationId === organization.id) ?? [];
  const applications = confirmedApplication && !existingApplications.some((application) => application.id === confirmedApplication.id)
    ? [...existingApplications, confirmedApplication]
    : existingApplications;
  const applicationsClosed = serverClosed || organization.applicationsOpen === false;

  const confirmSubmission = async () => {
    if (!externalFormOpened || busy || applicationsClosed || applications.length) return;
    setBusy(true);
    try {
      const next = await client.confirmExternalApplication(
        {
          organizationId: organization.id,
          opportunityId: organization.recruitment.id,
          externalFormOpened: true,
          confirmedExternalSubmission: true,
        },
        session,
      );
      setResult(next);
      if (next.ok && next.data) setConfirmedApplication(next.data);
      if (!next.ok && next.reason === 'closed') setServerClosed(true);
      if (!next.ok && next.reason === 'duplicate') void applicationsQuery.reload();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const closed = code === 'applications_closed';
      const duplicate = code === 'duplicate_application';
      if (closed) setServerClosed(true);
      setResult({
        ok: false,
        persisted: false,
        source: client.mode,
        reason: closed ? 'closed' : duplicate ? 'duplicate' : 'error',
        message: closed
          ? 'Applications closed before SOAR recorded your confirmation. Your existing tracker records were not changed.'
          : duplicate
            ? 'You already have an application for this organization.'
            : safeErrorMessage(error, 'SOAR could not confirm this application. Check your connection and try again.'),
      });
      if (duplicate) void applicationsQuery.reload();
    } finally {
      setBusy(false);
    }
  };

  let applicationState;
  if (applicationsQuery.loading) {
    applicationState = <LoadingBlock label="Checking your applications" />;
  } else if (applicationsQuery.error) {
    applicationState = <ErrorState title="We could not check your applications" onRetry={applicationsQuery.reload}>{applicationsQuery.error}</ErrorState>;
  } else if (applications.length) {
    applicationState = (
      <div className="grid min-w-0 gap-2 border-t border-[var(--color-border)] py-4" role="status">
        <h3 className="m-0 font-[var(--font-display)] text-base font-bold text-[var(--color-navy)]">Application already on file</h3>
        <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">An organization accepts one application per student. Reopening intake will not start another application.</p>
        <ul className="m-0 grid list-none gap-2 p-0">
          {applications.map((application) => (
            <li key={application.id} className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0">{application.opportunityTitle}</span>
              <StageChip stage={application.stage} />
            </li>
          ))}
        </ul>
        <ButtonLink to="/app/applications?tab=mine" variant="secondary" className="w-fit max-w-full whitespace-normal">View application tracker</ButtonLink>
      </div>
    );
  } else if (applicationsClosed) {
    applicationState = (
      <div className="grid min-w-0 gap-2 border-t border-[var(--color-border)] py-4" role="status">
        <StatusChip tone="attention" className="w-fit">Closed</StatusChip>
        <h3 className="m-0 font-[var(--font-display)] text-base font-bold text-[var(--color-navy)]">Applications are closed</h3>
        <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">This organization is not accepting new applications right now. Check back later.</p>
      </div>
    );
  } else {
    applicationState = (
      <>
        <div className="flex flex-wrap items-center gap-2">
          {safeUrl ? (
            <ExternalButtonLink
              href={safeUrl}
              target="_blank"
              variant="secondary"
              onClick={() => {
                setExternalFormOpened(true);
                setResult({
                  ok: true,
                  persisted: false,
                  source: client.mode,
                  message: 'External form link activated. SOAR cannot verify external submissions; confirm here only after you submit it there.',
                });
              }}
            >
              1. Open external form
            </ExternalButtonLink>
          ) : (
            <Button type="button" disabled variant="secondary">External form unavailable</Button>
          )}
          <Button type="button" variant="primary" disabled={!externalFormOpened || busy} onClick={confirmSubmission}>
            {busy ? 'Saving confirmation…' : '2. I submitted the external form'}
          </Button>
        </div>
        <p className="m-0 text-xs text-[var(--muted-foreground)]">Confirmation stays locked until you open the external link from SOAR.</p>
      </>
    );
  }

  return (
    <section className="grid min-w-0 gap-3 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0" id="application-confirmation">
      <header className="mb-1 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
        <h2>External application confirmation</h2>
        <p>Opening the external form is not a SOAR submission. Confirm only after you personally submit it.</p>
      </header>
      {applicationState}
      <ResultMessage result={result} />
    </section>
  );
}

export function OrganizationView({ organizationId, session, client }: { organizationId: string; session: UserSession; client: WorkflowDataClient }) {
  const { data: organization, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.getOrganization(organizationId, session), [client, organizationId, session.uid]);
  const profile = organization?.id === organizationId ? organization : undefined;
  const grants = getApprovedOfficerGrants(session);
  const canManage = profile ? grants.some((grant) => grant.organizationId === profile.id) : false;
  const split = profile ? splitDateEntries(profile.dateEntries) : { events: [], availability: [] };
  const canApply = !isSponsor(session);
  const tabItems = [
    { id: 'feed', label: 'Feed', count: profile?.posts.length },
    { id: 'about', label: 'About' },
    { id: 'dates', label: 'Dates & availability', count: profile?.dateEntries.length },
    ...(canApply ? [{ id: 'apply', label: 'Apply' }] : []),
  ];
  const { activeId, getTabTo } = useQueryTab(tabItems.map((item) => item.id), 'feed');

  const headerActions = <ButtonLink to="/app/directory" variant="secondary">Back to directory</ButtonLink>;

  return (
    <WorkflowPageFrame
      eyebrow="Organization profile"
      title={profile?.name ?? 'Organization'}
      description="Start with this organization's feed, then switch to details, dates, or role-appropriate actions."
      session={session}
      actions={headerActions}
    >
      <SourceNotice client={client} message={sourceMessage} />
      {loading ? <LoadingBlock label="Loading organization profile" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {!loading && !error && !profile ? (
        <StateBlock title="Organization not found" symbol="?" actions={<ButtonLink to="/app/directory" variant="secondary">Search directory</ButtonLink>}>
          This profile is unavailable. Use the directory name search to find another organization.
        </StateBlock>
      ) : null}
      {profile ? (
        <>
          <section className="grid items-stretch gap-[clamp(18px,4vw,34px)] rounded-[20px] bg-[var(--color-white)] p-[clamp(16px,3vw,24px)] shadow-[var(--shadow-soft)] md:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)] max-[820px]:grid-cols-1">
            <OrganizationIdentityArt name={profile.name} logoUrl={profile.logoUrl} className="profile-identity-art min-h-[260px] rounded-[18px] max-[820px]:min-h-[210px]" />
            <div className="grid content-center gap-3.5 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.5rem,3vw,2.35rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.08] [&_h2]:tracking-[-0.03em] [&_h2]:text-[var(--color-navy)]">
              <div className="flex min-w-0 items-center gap-3 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[1.05rem] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[var(--color-navy)] [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[1.05rem] [&_h3]:font-bold [&_h3]:leading-tight [&_h3]:text-[var(--color-navy)]">
                <OrganizationAvatar name={profile.name} logoUrl={profile.logoUrl} />
                <div>
                  <h2>{profile.name}</h2>
                  <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">{profile.shortDescription}</p>
                </div>
              </div>
              <p>{profile.description}</p>
              <div className="grid gap-1 [&_p]:m-0">
                <p><strong>Email:</strong> <a href={`mailto:${profile.contactEmail}`}>{profile.contactEmail}</a></p>
                {profile.contactPhone ? <p><strong>Phone:</strong> <a href={phoneHref(profile.contactPhone)}>{profile.contactPhone}</a></p> : null}
              </div>
              <p>
                {canManage ? <RoleBadge kind="officer">You manage this organization</RoleBadge> : <StatusChip tone="info">Public profile</StatusChip>}
              </p>
            </div>
          </section>

          <SubtabNav label={`${profile.name} profile sections`} baseId="organization-profile" items={tabItems} activeId={activeId} getTabTo={getTabTo} />

          <SubtabPanel baseId="organization-profile" tabId="feed" activeId={activeId} className="grid gap-4 mx-auto w-[min(720px,100%)]">
            {profile.posts.length ? (
              profile.posts.map((post) => (
                <AnnouncementCard key={post.id} announcement={post} session={session} client={client} onChanged={reload} />
              ))
            ) : (
              <EmptyState title="No organization posts yet">Announcements published by approved officers will appear both here and in the main feed.</EmptyState>
            )}
          </SubtabPanel>

          <SubtabPanel baseId="organization-profile" tabId="about" activeId={activeId}>
            <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0 first:pt-0 grid gap-3" id="recruitment">
              <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
                <h2>About and recruitment details</h2>
                <p>Read the public description and current recruitment opportunity before taking action.</p>
              </header>
              <p>{profile.description}</p>
              <div className="grid gap-1 [&_p]:m-0">
                <p><strong>Email:</strong> <a href={`mailto:${profile.contactEmail}`}>{profile.contactEmail}</a></p>
                {profile.contactPhone ? <p><strong>Phone:</strong> <a href={phoneHref(profile.contactPhone)}>{profile.contactPhone}</a></p> : null}
              </div>
              <p><strong>Recruitment:</strong> {profile.recruitment.title}</p>
              <p><strong>Requirements:</strong> {profile.recruitment.requirements}</p>
              <p><strong>Instructions:</strong> {profile.recruitment.instructions}</p>
            </section>
          </SubtabPanel>

          <SubtabPanel baseId="organization-profile" tabId="dates" activeId={activeId}>
            <section className="grid gap-4">
              <div className="grid gap-x-6 gap-y-8 md:grid-cols-2 profile-date-grid">
                <DateEntryList title="Dated public events" entries={split.events} emptyCopy="No public event dates are posted for this organization yet." />
                <DateEntryList
                  title="Meeting/interview availability"
                  entries={split.availability}
                  emptyCopy="No requestable meeting or interview availability is posted yet."
                  action={<ButtonLink to={`/app/meetings?organizationId=${encodeURIComponent(profile.id)}&tab=availability`} variant="primary">Request meeting</ButtonLink>}
                />
              </div>
            </section>
          </SubtabPanel>

          {canApply ? (
            <SubtabPanel baseId="organization-profile" tabId="apply" activeId={activeId}>
              <RecruitmentActions key={`${profile.id}:${session.uid}`} organization={profile} session={session} client={client} />
            </SubtabPanel>
          ) : null}
        </>
      ) : null}
    </WorkflowPageFrame>
  );
}

export default function OrganizationPage() {
  const { organizationId = '' } = useParams();
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <OrganizationView organizationId={organizationId} session={session} client={client} />;
}
