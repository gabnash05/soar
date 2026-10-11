import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, LoadingBlock, ModalDialog, StateBlock } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient, WorkflowMutationResult } from './contracts';
import { AnnouncementComposer } from './OfficerPage';
import { AnnouncementCard, EmptyState, ErrorState, ResultMessage, RouteUnavailableState, SourceNotice, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame } from './pageParts';
import { getApprovedOfficerGrants } from './workflowUtils';

export function FeedView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.listAnnouncements(session), [client, session.uid]);
  const [searchParams] = useSearchParams();
  const directAnnouncementId = searchParams.get('announcementId') ?? '';
  const officerGrants = useMemo(() => getApprovedOfficerGrants(session), [session]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDirty, setComposerDirty] = useState(false);
  const [composerResult, setComposerResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(officerGrants[0]?.organizationId ?? '');

  useEffect(() => {
    if (!officerGrants.length) {
      setComposerOpen(false);
      setSelectedOrganizationId('');
      return;
    }
    if (!officerGrants.some((grant) => grant.organizationId === selectedOrganizationId)) {
      setSelectedOrganizationId(officerGrants[0].organizationId);
    }
  }, [officerGrants, selectedOrganizationId]);

  const selectedGrant = officerGrants.find((grant) => grant.organizationId === selectedOrganizationId) ?? officerGrants[0];
  const canPostAnnouncement = Boolean(selectedGrant);
  const directAnnouncementMissing = Boolean(directAnnouncementId && !loading && !error && data && !data.some((announcement) => announcement.id === directAnnouncementId));

  useEffect(() => {
    if (!directAnnouncementId || loading || !data?.length) return;
    const target = document.getElementById(`announcement-${directAnnouncementId}`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.focus({ preventScroll: true });
  }, [data, directAnnouncementId, loading]);

  return (
    <WorkflowPageFrame
      eyebrow="Announcements"
      title="Campus updates without the clutter."
      description="Newest organization posts appear here and on each organization profile."
      session={session}
      actions={(
        <>
          {canPostAnnouncement ? (
            <Button type="button" variant="primary" aria-controls="announcement-composer" onClick={() => {
              setComposerResult(null);
              setComposerOpen(true);
            }}>
              Post announcement
            </Button>
          ) : null}
          <ButtonLink to="/app/directory" variant={canPostAnnouncement ? 'secondary' : 'primary'}>Browse organizations</ButtonLink>
        </>
      )}
    >
      <SourceNotice client={client} message={sourceMessage} />
      {!composerOpen ? <ResultMessage result={composerResult} /> : null}
      <ModalDialog open={composerOpen && Boolean(selectedGrant)} title="Post announcement" dirty={composerDirty} onClose={() => setComposerOpen(false)}>
        {composerOpen && selectedGrant ? (
          <AnnouncementComposer
            organizationId={selectedGrant.organizationId}
            organizationName={selectedGrant.organizationName}
            session={session}
            client={client}
            onChanged={reload}
            onDirtyChange={setComposerDirty}
            onResult={setComposerResult}
            onSubmitted={() => setComposerOpen(false)}
            context={(
              officerGrants.length > 1 ? (
                <div className="field">
                  <label className="label-row" htmlFor="announcement-organization">Posting organization</label>
                  <select id="announcement-organization" className="control" value={selectedGrant.organizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
                    {officerGrants.map((grant) => <option key={grant.organizationId} value={grant.organizationId}>{grant.organizationName}</option>)}
                  </select>
                </div>
              ) : (
                <p className="notice compact">Posting as {selectedGrant.organizationName}.</p>
              )
            )}
          />
        ) : null}
      </ModalDialog>
      {loading ? <LoadingBlock label="Loading announcements" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {directAnnouncementMissing ? (
        <StateBlock title="Announcement unavailable" symbol="?">
          This direct announcement link may point to a deleted post or a post your account cannot access.
        </StateBlock>
      ) : null}
      {!loading && !error && data?.length === 0 ? (
        <EmptyState title="No announcements yet">When officers publish announcements, the newest posts will appear here.</EmptyState>
      ) : null}
      <section className="content-stack feed-column" aria-label="Announcement feed">
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
