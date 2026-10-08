import { ButtonLink, LoadingBlock } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from './contracts';
import { AnnouncementCard, EmptyState, ErrorState, RouteUnavailableState, SourceNotice, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame } from './pageParts';

export function FeedView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.listAnnouncements(session), [client, session.uid]);

  return (
    <WorkflowPageFrame
      eyebrow="Announcements"
      title="Campus updates without the clutter."
      description="Newest organization posts appear here and on each organization profile. Images are cropped safely and interactions never hide failed saves."
      session={session}
      actions={<ButtonLink to="/app/directory" variant="primary">Browse organizations</ButtonLink>}
    >
      <SourceNotice client={client} message={sourceMessage} />
      {loading ? <LoadingBlock label="Loading announcements" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {!loading && !error && data?.length === 0 ? (
        <EmptyState title="No announcements yet">When officers publish announcements, the newest posts will appear here.</EmptyState>
      ) : null}
      <section className="content-stack" aria-label="Announcement feed">
        {data?.map((announcement) => (
          <AnnouncementCard key={announcement.id} announcement={announcement} session={session} client={client} onChanged={reload} />
        ))}
      </section>
    </WorkflowPageFrame>
  );
}

export default function FeedPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <FeedView session={session} client={client} />;
}
