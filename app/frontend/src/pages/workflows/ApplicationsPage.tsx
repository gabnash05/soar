import { Link } from 'react-router-dom';
import { ButtonLink, LoadingBlock, StateBlock, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from './contracts';
import { OfficerApplicationsReview } from './OfficerPage';
import { EmptyState, ErrorState, RouteUnavailableState, SourceNotice, StageChip, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame, WorkflowTable } from './pageParts';
import { getApprovedOfficerGrants, isSponsor } from './workflowUtils';

export function ApplicationsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.listMyApplications(session), [client, session.uid]);
  const officerGrants = getApprovedOfficerGrants(session);
  const hasOfficerReview = officerGrants.length > 0;
  const tabItems = hasOfficerReview
    ? [
        { id: 'review', label: 'Review applicants', count: officerGrants.length },
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
              <td><Link className="org-author-link" to={`/app/organizations/${application.organizationId}`}>{application.organizationName}</Link></td>
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
      title={hasOfficerReview ? 'Review applicants, then check your own tracker.' : 'Track each recruitment opportunity once.'}
      description="Students confirm external submissions in SOAR; officers update stages only for organizations where their grant applies."
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
          <SubtabPanel baseId="applications" tabId="mine" activeId={activeId} className="content-stack">
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
