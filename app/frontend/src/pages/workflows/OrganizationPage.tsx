import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, ButtonLink, ExternalButtonLink, LoadingBlock, RoleBadge, StateBlock, StatusChip, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { OrganizationProfile, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import {
  AnnouncementCard,
  DateEntryList,
  EmptyState,
  ErrorState,
  OrganizationAvatar,
  OrganizationIdentityArt,
  ResultMessage,
  RouteUnavailableState,
  SourceNotice,
  useWorkflowQuery,
  useWorkflowSession,
  WorkflowPageFrame,
} from './pageParts';
import { getApprovedOfficerGrants, getSafeHttpUrl, isSponsor, splitDateEntries } from './workflowUtils';

const phoneHref = (phone: string) => `tel:${phone.replace(/[^+0-9]/g, '')}`;

function RecruitmentActions({ organization, session, client }: { organization: OrganizationProfile; session: UserSession; client: WorkflowDataClient }) {
  const safeUrl = getSafeHttpUrl(organization.recruitment.externalFormUrl);
  const [externalFormOpened, setExternalFormOpened] = useState(false);
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmSubmission = async () => {
    setBusy(true);
    const next = await client.confirmExternalApplication(
      {
        organizationId: organization.id,
        opportunityId: organization.recruitment.id,
        externalFormOpened,
        confirmedExternalSubmission: true,
      },
      session,
    );
    setResult(next);
    setBusy(false);
  };

  return (
    <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0 first:pt-0 grid gap-3" id="application-confirmation">
      <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
        <h2>External application confirmation</h2>
        <p>Opening the external form is not a SOAR submission. Confirm only after you personally submitted the external form.</p>
      </header>
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
                message: 'External form link activated. SOAR cannot prove what happened in that external form; confirm only after you submit it there.',
              });
            }}
          >
            1. Open external form
          </ExternalButtonLink>
        ) : (
          <Button type="button" disabled variant="secondary">External form unavailable</Button>
        )}
        <Button type="button" variant="primary" disabled={!externalFormOpened || busy} onClick={confirmSubmission}>
          2. I submitted the external form
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">Confirmation stays locked until you open the external link from SOAR.</p>
      <ResultMessage result={result} />
    </section>
  );
}

export function OrganizationView({ organizationId, session, client }: { organizationId: string; session: UserSession; client: WorkflowDataClient }) {
  const { data: organization, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.getOrganization(organizationId, session), [client, organizationId, session.uid]);
  const grants = getApprovedOfficerGrants(session);
  const canManage = organization ? grants.some((grant) => grant.organizationId === organization.id) : false;
  const split = organization ? splitDateEntries(organization.dateEntries) : { events: [], availability: [] };
  const canApply = !isSponsor(session);
  const tabItems = [
    { id: 'feed', label: 'Feed', count: organization?.posts.length },
    { id: 'about', label: 'About' },
    { id: 'dates', label: 'Dates & availability', count: organization?.dateEntries.length },
    ...(canApply ? [{ id: 'apply', label: 'Apply' }] : []),
  ];
  const { activeId, getTabTo } = useQueryTab(tabItems.map((item) => item.id), 'feed');

  const headerActions = <ButtonLink to="/app/directory" variant="secondary">Back to directory</ButtonLink>;

  return (
    <WorkflowPageFrame
      eyebrow="Organization profile"
      title={organization?.name ?? 'Organization'}
      description="Start with this organization's feed, then switch to details, dates, or role-appropriate actions."
      session={session}
      actions={headerActions}
    >
      <SourceNotice client={client} message={sourceMessage} />
      {loading ? <LoadingBlock label="Loading organization profile" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {!loading && !error && !organization ? (
        <StateBlock title="Organization not found" symbol="?" actions={<ButtonLink to="/app/directory" variant="secondary">Search directory</ButtonLink>}>
          This profile is unavailable. Use the directory name search to find another organization.
        </StateBlock>
      ) : null}
      {organization ? (
        <>
          <section className="grid items-stretch gap-[clamp(18px,4vw,34px)] rounded-[20px] bg-[var(--color-white)] p-[clamp(16px,3vw,24px)] shadow-[var(--shadow-soft)] md:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)] max-[820px]:grid-cols-1">
            <OrganizationIdentityArt name={organization.name} logoUrl={organization.logoUrl} className="profile-identity-art min-h-[260px] rounded-[18px] max-[820px]:min-h-[210px]" />
            <div className="grid content-center gap-3.5 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.5rem,3vw,2.35rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.08] [&_h2]:tracking-[-0.03em] [&_h2]:text-[var(--color-navy)]">
              <div className="flex min-w-0 items-center gap-3 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[1.05rem] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[var(--color-navy)] [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[1.05rem] [&_h3]:font-bold [&_h3]:leading-tight [&_h3]:text-[var(--color-navy)]">
                <OrganizationAvatar name={organization.name} logoUrl={organization.logoUrl} />
                <div>
                  <h2>{organization.name}</h2>
                  <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">{organization.shortDescription}</p>
                </div>
              </div>
              <p>{organization.description}</p>
              <div className="grid gap-1 [&_p]:m-0">
                <p><strong>Email:</strong> <a href={`mailto:${organization.contactEmail}`}>{organization.contactEmail}</a></p>
                {organization.contactPhone ? <p><strong>Phone:</strong> <a href={phoneHref(organization.contactPhone)}>{organization.contactPhone}</a></p> : null}
              </div>
              <p>
                {canManage ? <RoleBadge kind="officer">You manage this organization</RoleBadge> : <StatusChip tone="info">Public profile</StatusChip>}
              </p>
            </div>
          </section>

          <SubtabNav label={`${organization.name} profile sections`} baseId="organization-profile" items={tabItems} activeId={activeId} getTabTo={getTabTo} />

          <SubtabPanel baseId="organization-profile" tabId="feed" activeId={activeId} className="grid gap-4 mx-auto w-[min(720px,100%)]">
            {organization.posts.length ? (
              organization.posts.map((post) => (
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
              <p>{organization.description}</p>
              <div className="grid gap-1 [&_p]:m-0">
                <p><strong>Email:</strong> <a href={`mailto:${organization.contactEmail}`}>{organization.contactEmail}</a></p>
                {organization.contactPhone ? <p><strong>Phone:</strong> <a href={phoneHref(organization.contactPhone)}>{organization.contactPhone}</a></p> : null}
              </div>
              <p><strong>Recruitment:</strong> {organization.recruitment.title}</p>
              <p><strong>Requirements:</strong> {organization.recruitment.requirements}</p>
              <p><strong>Instructions:</strong> {organization.recruitment.instructions}</p>
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
                  action={<ButtonLink to={`/app/meetings?organizationId=${encodeURIComponent(organization.id)}&tab=availability`} variant="primary">Request meeting</ButtonLink>}
                />
              </div>
            </section>
          </SubtabPanel>

          {canApply ? (
            <SubtabPanel baseId="organization-profile" tabId="apply" activeId={activeId}>
              <RecruitmentActions organization={organization} session={session} client={client} />
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
