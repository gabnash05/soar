import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ButtonLink, LoadingBlock, StateBlock, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from './contracts';
import { OfficerApplicationsReview, OfficerOrganizationPicker } from './OfficerPage';
import { OrganizationApplicationIntakePanel } from './ApplicationIntakeControl';
import { EmptyState, ErrorState, RouteUnavailableState, SourceNotice, StageChip, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame, WorkflowTable } from './pageParts';
import { getApprovedOfficerGrants, isSponsor, isStudent } from './workflowUtils';

function OfficerApplicationIntake({ session, client, selectedOrganizationId, onOrganizationChange }: { session: UserSession; client: WorkflowDataClient; selectedOrganizationId: string; onOrganizationChange: (organizationId: string) => void }) {
  const grants = getApprovedOfficerGrants(session);
  const [saving, setSaving] = useState(false);
  const selectedGrant = grants.find((grant) => grant.organizationId === selectedOrganizationId) ?? grants[0];

  if (!selectedGrant) return null;

  return (
    <section className="grid gap-4" aria-label="Organization application intake">
      <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
        <h2>Application intake</h2>
        <p>Open or close new confirmations only for organizations covered by your approved officer grant.</p>
      </header>
      <OfficerOrganizationPicker
        id="application-intake-organization"
        selectedOrganizationId={selectedGrant.organizationId}
        onChange={onOrganizationChange}
        session={session}
        disabled={saving}
      />
      <OrganizationApplicationIntakePanel
        key={`${session.uid}:${selectedGrant.organizationId}`}
        organizationId={selectedGrant.organizationId}
        session={session}
        client={client}
        onSavingChange={setSaving}
      />
    </section>
  );
}

export function ApplicationsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.listMyApplications(session), [client, session.uid]);
  const [searchParams, setSearchParams] = useSearchParams();
  const officerGrants = getApprovedOfficerGrants(session);
  const hasOfficerReview = isStudent(session) && session.access.status === 'active' && officerGrants.length > 0;
  const requestedOrganizationId = searchParams.get('organizationId') ?? '';
  const requestedOrganizationIsGranted = officerGrants.some((grant) => grant.organizationId === requestedOrganizationId);
  const selectedOfficerGrant = officerGrants.find((grant) => grant.organizationId === requestedOrganizationId) ?? officerGrants[0];
  useEffect(() => {
    if (!hasOfficerReview || !requestedOrganizationId || requestedOrganizationIsGranted) return;
    const next = new URLSearchParams(searchParams);
    next.delete('organizationId');
    setSearchParams(next, { replace: true });
  }, [hasOfficerReview, requestedOrganizationId, requestedOrganizationIsGranted, searchParams, setSearchParams]);
  const selectOfficerOrganization = (organizationId: string) => {
    const next = new URLSearchParams(searchParams);
    if (organizationId === officerGrants[0]?.organizationId) next.delete('organizationId');
    else next.set('organizationId', organizationId);
    setSearchParams(next, { replace: true });
  };
  const tabItems = hasOfficerReview
    ? [
        { id: 'review', label: 'Review applicants', count: officerGrants.length },
        { id: 'intake', label: 'Application intake' },
        { id: 'mine', label: 'My applications', count: data?.length },
      ]
    : [{ id: 'mine', label: 'My applications', count: data?.length }];
  const { activeId, getTabTo } = useQueryTab(tabItems.map((item) => item.id), hasOfficerReview ? 'review' : 'mine');

  if (isSponsor(session)) {
    return (
      <WorkflowPageFrame
        eyebrow="Applications"
        title="Application tools are for students."
        description="Sponsors can browse organizations and request meetings."
        session={session}
        actions={<ButtonLink to="/app/meetings" variant="primary">Open meetings</ButtonLink>}
      >
        <SourceNotice client={client} message={sourceMessage} />
        <StateBlock title="No sponsor application tracker" symbol="0">
          Sponsor accounts do not use the student application tracker.
        </StateBlock>
      </WorkflowPageFrame>
    );
  }

  const trackerContent = (
    <>
      {loading ? <LoadingBlock label="Loading application tracker" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {!loading && !error && data?.length === 0 ? (
        <EmptyState title="No applications confirmed yet">Open an organization profile, submit its external form, then explicitly confirm the submission in SOAR.</EmptyState>
      ) : null}
      {data?.length ? (
        <WorkflowTable
          caption="My application stages"
          headers={['Organization', 'Opportunity', 'Stage', 'Last updated']}
          rows={data.map((application) => (
            <tr key={application.id}>
              <td><Link className="text-[var(--color-navy)] underline decoration-transparent underline-offset-4 hover:text-[var(--color-blue-deep)] hover:decoration-current focus-visible:text-[var(--color-blue-deep)] focus-visible:decoration-current" to={`/app/organizations/${application.organizationId}`}>{application.organizationName}</Link></td>
              <td>{application.opportunityTitle}</td>
              <td><StageChip stage={application.stage} /></td>
              <td>{new Date(application.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        />
      ) : null}
    </>
  );

  return (
    <WorkflowPageFrame
      eyebrow="Application tracker"
      title={hasOfficerReview ? 'Review applicants, manage intake, and check your own tracker.' : 'Track each recruitment opportunity once.'}
      description="Students confirm external submissions in SOAR; officers review stages and intake only for organizations where their approved grant applies."
      session={session}
      actions={<ButtonLink to="/app/directory" variant="primary">Find organizations</ButtonLink>}
    >
      <SourceNotice client={client} message={sourceMessage} />
      {hasOfficerReview ? (
        <>
          <SubtabNav label="Application tasks" baseId="applications" items={tabItems} activeId={activeId} getTabTo={getTabTo} />
          <SubtabPanel baseId="applications" tabId="review" activeId={activeId}>
            <OfficerApplicationsReview session={session} client={client} />
          </SubtabPanel>
          <SubtabPanel baseId="applications" tabId="intake" activeId={activeId}>
            {selectedOfficerGrant ? (
              <OfficerApplicationIntake
                session={session}
                client={client}
                selectedOrganizationId={selectedOfficerGrant.organizationId}
                onOrganizationChange={selectOfficerOrganization}
              />
            ) : null}
          </SubtabPanel>
          <SubtabPanel baseId="applications" tabId="mine" activeId={activeId} className="grid gap-4">
            {trackerContent}
          </SubtabPanel>
        </>
      ) : trackerContent}
    </WorkflowPageFrame>
  );
}

export default function ApplicationsPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <ApplicationsView session={session} client={client} />;
}
