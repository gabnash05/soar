import { ButtonLink, LoadingBlock, StateBlock } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from './contracts';
import { EmptyState, ErrorState, RouteUnavailableState, SourceNotice, StageChip, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame, WorkflowTable } from './pageParts';
import { isSponsor } from './workflowUtils';

export function ApplicationsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.listMyApplications(session), [client, session.uid]);

  if (isSponsor(session)) {
    return (
      <WorkflowPageFrame
        eyebrow="Applications"
        title="Application tools are for students."
        description="Sponsors can browse organizations and request meetings, but the approved scope excludes sponsor application workflows."
        session={session}
        actions={<ButtonLink to="/app/meetings" variant="primary">Open meetings</ButtonLink>}
      >
        <SourceNotice client={client} message={sourceMessage} />
        <StateBlock title="No sponsor application tracker" symbol="—">
          Sponsor accounts do not show application tools, application counters, or sponsor-only workflows.
        </StateBlock>
      </WorkflowPageFrame>
    );
  }

  return (
    <WorkflowPageFrame
      eyebrow="Application tracker"
      title="Track each recruitment opportunity once."
      description="External forms remain outside SOAR. A row appears only after explicit submission confirmation, then officers update Pending, Under review, Accepted, or Declined."
      session={session}
      actions={<ButtonLink to="/app/directory" variant="primary">Find organizations</ButtonLink>}
    >
      <SourceNotice client={client} message={sourceMessage} />
      <div className="notice-card card">
        <p><strong>Unique opportunity rule:</strong> SOAR should prevent duplicate entries for the same student and recruitment opportunity/position.</p>
      </div>
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
