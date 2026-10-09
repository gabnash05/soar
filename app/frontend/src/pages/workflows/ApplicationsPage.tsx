import { ButtonLink, LoadingBlock, StateBlock } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from './contracts';
import { OfficerApplicationsReview } from './OfficerPage';
import { EmptyState, ErrorState, RouteUnavailableState, SourceNotice, StageChip, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame, WorkflowTable } from './pageParts';
import { getApprovedOfficerGrants, isSponsor } from './workflowUtils';

export function ApplicationsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.listMyApplications(session), [client, session.uid]);
  const managedOrganizationId = getApprovedOfficerGrants(session)[0]?.organizationId;

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
        <StateBlock title="No sponsor application tracker" symbol="—">
          Sponsor accounts do not use the student application tracker.
        </StateBlock>
      </WorkflowPageFrame>
    );
  }

  return (
    <WorkflowPageFrame
      eyebrow="Application tracker"
      title="Track each recruitment opportunity once."
      description="A row appears after you confirm an external form submission, then organization officers update Pending, Under review, Accepted, or Declined."
      session={session}
      actions={(
        <>
          <ButtonLink to="/app/directory" variant="primary">Find organizations</ButtonLink>
          {managedOrganizationId ? <ButtonLink to={`/settings/organization?organizationId=${managedOrganizationId}`} variant="secondary">Manage organization</ButtonLink> : null}
        </>
      )}
    >
      <SourceNotice client={client} message={sourceMessage} />
      <OfficerApplicationsReview session={session} client={client} />
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
              <td>{application.organizationName}</td>
              <td>{application.opportunityTitle}</td>
              <td><StageChip stage={application.stage} /></td>
              <td>{new Date(application.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        />
      ) : null}
    </WorkflowPageFrame>
  );
}

export default function ApplicationsPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <ApplicationsView session={session} client={client} />;
}
