import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, ButtonLink, ExternalButtonLink, LoadingBlock, StateBlock, StatusChip } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { OrganizationProfile, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import {
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

function RecruitmentActions({ organization, session, client }: { organization: OrganizationProfile; session: UserSession; client: WorkflowDataClient }) {
  const safeUrl = getSafeHttpUrl(organization.recruitment.externalFormUrl);
  const [externalFormOpened, setExternalFormOpened] = useState(false);
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  if (isSponsor(session)) {
    return (
      <section className="surface-section compact-section">
        <header className="section-heading">
          <h2>Applications hidden for sponsors</h2>
          <p>Sponsors can browse organization information and request meetings.</p>
        </header>
        <ButtonLink to="/app/meetings" variant="primary">Request a meeting</ButtonLink>
      </section>
    );
  }

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
    <section className="surface-section compact-section" id="application-confirmation">
      <header className="section-heading">
        <h2>External application confirmation</h2>
        <p>Opening the external form is not a SOAR submission. Confirm only after you personally submitted the external form.</p>
      </header>
      <div className="component-row">
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
      <p className="help">Confirmation stays locked until you open the external link from SOAR.</p>
      <ResultMessage result={result} />
    </section>
  );
}

export function OrganizationView({ organizationId, session, client }: { organizationId: string; session: UserSession; client: WorkflowDataClient }) {
  const { data: organization, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.getOrganization(organizationId, session), [client, organizationId, session.uid]);
  const grants = getApprovedOfficerGrants(session);
  const canManage = organization ? grants.some((grant) => grant.organizationId === organization.id) : false;
  const split = organization ? splitDateEntries(organization.dateEntries) : { events: [], availability: [] };

  const headerActions = (
    <>
      <ButtonLink to="/app/meetings" variant="primary">Request meeting</ButtonLink>
      <ButtonLink to="/app/directory" variant="secondary">Back to directory</ButtonLink>
    </>
  );

  return (
    <WorkflowPageFrame
      eyebrow="Organization profile"
      title={organization?.name ?? 'Organization'}
      description="View organization details, recruitment requirements, announcements, public events, and meeting/interview availability."
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
          <section className="organization-profile-hero">
            <OrganizationIdentityArt name={organization.name} logoUrl={organization.logoUrl} className="profile-identity-art" />
            <div className="profile-hero-copy">
              <div className="org-head">
                <OrganizationAvatar name={organization.name} logoUrl={organization.logoUrl} />
                <div>
                  <h2>{organization.name}</h2>
                  <p className="section-note">{organization.shortDescription}</p>
                </div>
              </div>
              <p>{organization.description}</p>
              <p><strong>Contact:</strong> <a href={`mailto:${organization.contactEmail}`}>{organization.contactEmail}</a></p>
              <p>
                {canManage ? <StatusChip tone="approved">You manage this organization</StatusChip> : <StatusChip tone="info">Public profile</StatusChip>}
              </p>
            </div>
          </section>

          <section className="surface-section compact-section" id="recruitment">
            <header className="section-heading">
              <h2>{organization.recruitment.title}</h2>
              <p>Recruitment opportunity</p>
            </header>
            <p><strong>Requirements:</strong> {organization.recruitment.requirements}</p>
            <p><strong>Instructions:</strong> {organization.recruitment.instructions}</p>
            <p className="help">Each student can track this opportunity once.</p>
          </section>

          <RecruitmentActions organization={organization} session={session} client={client} />

          <section className="grid grid-2">
            <DateEntryList title="Dated public events" entries={split.events} emptyCopy="No public event dates are posted for this organization yet." />
            <DateEntryList title="Meeting/interview availability" entries={split.availability} emptyCopy="No requestable meeting or interview availability is posted yet." />
          </section>

          {organization.posts.length ? (
            <section className="surface-section compact-section">
              <header className="section-heading">
                <h2>Organization announcements</h2>
              </header>
              <ul className="feed-list divided-list">
                {organization.posts.map((post) => (
                  <li key={post.id}>
                    <div className="feed-copy">
                      <strong>{post.body}</strong>
                      <span>{new Date(post.createdAt).toLocaleDateString()} · {post.likeCount} likes · {post.comments.length} comments</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <EmptyState title="No organization posts yet">Announcements published by approved officers will appear both here and in the main feed.</EmptyState>
          )}
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
