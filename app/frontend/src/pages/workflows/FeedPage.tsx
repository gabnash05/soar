import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, LoadingBlock, ModalDialog, StateBlock } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { Announcement, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import { AnnouncementComposer } from './OfficerPage';
import { AnnouncementCard, EmptyState, ErrorState, ResultMessage, RouteUnavailableState, SourceNotice, useWorkflowSession, WorkflowPageFrame } from './pageParts';
import { getApprovedOfficerGrants } from './workflowUtils';

const PAGE_SIZE = 15;

export function FeedView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const [data, setData] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [directLookup, setDirectLookup] = useState<{ key: string; status: 'loading' | 'found' | 'missing' | 'error'; announcement?: Announcement } | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const directAnnouncementId = searchParams.get('announcementId') ?? '';
  const directLookupKey = `${session.uid}:${directAnnouncementId}`;
  const officerGrants = useMemo(() => getApprovedOfficerGrants(session), [session]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDirty, setComposerDirty] = useState(false);
  const [composerResult, setComposerResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(officerGrants[0]?.organizationId ?? '');

  const loadFirstPage = useCallback(async () => {
    const requestGeneration = ++generation.current;
    busy.current = true;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setPageError(null);
    setDirectLookup(null);
    setData([]);
    setNextPageToken(undefined);
    try {
      const result = await client.listAnnouncements(session, { limit: PAGE_SIZE });
      if (generation.current !== requestGeneration) return;
      setData(result.data.items);
      setNextPageToken(result.data.nextPageToken);
      setSourceMessage(result.message ?? null);
    } catch (caught) {
      if (generation.current !== requestGeneration) return;
      setError(caught instanceof Error ? caught.message : 'Unable to load announcements.');
    } finally {
      if (generation.current === requestGeneration) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [client, session]);

  const loadNextPage = useCallback(async () => {
    if (!nextPageToken || busy.current || loading || loadingMore) return;
    const requestGeneration = generation.current;
    busy.current = true;
    setLoadingMore(true);
    setPageError(null);
    try {
      const result = await client.listAnnouncements(session, { limit: PAGE_SIZE, pageToken: nextPageToken });
      if (generation.current !== requestGeneration) return;
      setData((previous) => {
        const ids = new Set(previous.map((item) => item.id));
        return [...previous, ...result.data.items.filter((item) => !ids.has(item.id))];
      });
      setNextPageToken(result.data.nextPageToken);
      setSourceMessage(result.message ?? sourceMessage);
    } catch (caught) {
      if (generation.current !== requestGeneration) return;
      setPageError(caught instanceof Error ? caught.message : 'Unable to load more announcements.');
    } finally {
      if (generation.current === requestGeneration) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [client, loading, loadingMore, nextPageToken, session, sourceMessage]);

  useEffect(() => {
    void loadFirstPage();
    return () => { generation.current += 1; busy.current = false; };
  }, [loadFirstPage]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !nextPageToken || loading || loadingMore || pageError || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadNextPage();
    }, { root: null, rootMargin: '0px', threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadNextPage, loading, loadingMore, nextPageToken, pageError]);

  useEffect(() => {
    if (!officerGrants.length) {
      setComposerOpen(false);
      setSelectedOrganizationId('');
      return;
    }
    if (!officerGrants.some((grant) => grant.organizationId === selectedOrganizationId)) setSelectedOrganizationId(officerGrants[0].organizationId);
  }, [officerGrants, selectedOrganizationId]);

  const selectedGrant = officerGrants.find((grant) => grant.organizationId === selectedOrganizationId) ?? officerGrants[0];
  const canPostAnnouncement = Boolean(selectedGrant);
  const pageContainsDirectAnnouncement = data.some((announcement) => announcement.id === directAnnouncementId);
  const directAnnouncementMissing = Boolean(directAnnouncementId && !loading && !error && !pageContainsDirectAnnouncement && directLookup?.key === directLookupKey && directLookup.status === 'missing');
  const visibleAnnouncements = useMemo(() => {
    if (directLookup?.key !== directLookupKey || !directLookup.announcement || pageContainsDirectAnnouncement) return data;
    return [directLookup.announcement, ...data];
  }, [data, directLookup, pageContainsDirectAnnouncement]);

  useEffect(() => {
    if (!directAnnouncementId || loading || error || pageContainsDirectAnnouncement || directLookup?.key === directLookupKey) return;
    const requestGeneration = generation.current;
    setDirectLookup({ key: directLookupKey, status: 'loading' });
    void client.getAnnouncement(directAnnouncementId, session).then((result) => {
      if (generation.current !== requestGeneration) return;
      setDirectLookup({ key: directLookupKey, status: result.data ? 'found' : 'missing', announcement: result.data });
      setSourceMessage(result.message ?? sourceMessage);
    }).catch(() => {
      if (generation.current === requestGeneration) setDirectLookup({ key: directLookupKey, status: 'error' });
    });
  }, [client, data, directAnnouncementId, directLookup, directLookupKey, error, loading, pageContainsDirectAnnouncement, session, sourceMessage]);

  useEffect(() => {
    if (!directAnnouncementId || loading || !pageContainsDirectAnnouncement && (directLookup?.key !== directLookupKey || directLookup?.status !== 'found')) return;
    const target = document.getElementById(`announcement-${directAnnouncementId}`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.focus({ preventScroll: true });
  }, [directAnnouncementId, directLookup, directLookupKey, loading, pageContainsDirectAnnouncement]);

  return (
    <WorkflowPageFrame eyebrow="Announcements" title="Campus updates without the clutter." description="Newest organization posts appear here and on each organization profile." session={session}
      actions={<>
        {canPostAnnouncement ? <Button type="button" variant="primary" aria-controls="announcement-composer" onClick={() => { setComposerResult(null); setComposerOpen(true); }}>Post announcement</Button> : null}
        <ButtonLink to="/app/directory" variant={canPostAnnouncement ? 'secondary' : 'primary'}>Browse organizations</ButtonLink>
      </>}>
      <SourceNotice client={client} message={sourceMessage} />
      {!composerOpen ? <ResultMessage result={composerResult} /> : null}
      <ModalDialog open={composerOpen && Boolean(selectedGrant)} title="Post announcement" dirty={composerDirty} onClose={() => setComposerOpen(false)}>
        {composerOpen && selectedGrant ? <AnnouncementComposer organizationId={selectedGrant.organizationId} organizationName={selectedGrant.organizationName} session={session} client={client} onChanged={loadFirstPage} onDirtyChange={setComposerDirty} onResult={setComposerResult} onSubmitted={() => setComposerOpen(false)} context={officerGrants.length > 1 ? (
          <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)]" htmlFor="announcement-organization">Posting organization</label><select id="announcement-organization" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" value={selectedGrant.organizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>{officerGrants.map((grant) => <option key={grant.organizationId} value={grant.organizationId}>{grant.organizationName}</option>)}</select></div>
        ) : <p className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] text-sm">Posting as {selectedGrant.organizationName}.</p>} /> : null}
      </ModalDialog>
      {loading ? <LoadingBlock label="Loading announcements" /> : null}
      {error ? <ErrorState onRetry={loadFirstPage}>{error}</ErrorState> : null}
      {directLookup?.key === directLookupKey && directLookup.status === 'loading' ? <p role="status" className="text-center text-sm text-[var(--muted-foreground)]">Loading linked announcement…</p> : null}
      {directAnnouncementMissing ? <StateBlock title="Announcement unavailable" symbol="?">This direct announcement link may point to a deleted post or a post your account cannot access.</StateBlock> : null}
      {directLookup?.key === directLookupKey && directLookup.status === 'error' ? <div role="alert" className="text-center text-sm">Could not check this announcement link. <Button type="button" variant="secondary" onClick={() => setDirectLookup(null)}>Retry</Button></div> : null}
      {!loading && !error && data.length === 0 ? <EmptyState title="No announcements yet">When officers publish announcements, the newest posts will appear here.</EmptyState> : null}
      <section className="mx-auto grid w-[min(720px,100%)] min-w-0 gap-4" aria-label="Announcement feed">
        {visibleAnnouncements.map((announcement) => <AnnouncementCard key={announcement.id} announcement={announcement} session={session} client={client} onChanged={loadFirstPage} />)}
      </section>
      {pageError ? <div role="alert" className="mx-auto w-[min(720px,100%)] py-4 text-center text-sm text-[var(--color-ink)]">Could not load more announcements: {pageError} <Button type="button" variant="secondary" onClick={loadNextPage}>Retry loading announcements</Button></div> : null}
      {!loading && !error && data.length > 0 && !nextPageToken ? <p className="py-5 text-center text-sm text-[var(--muted-foreground)]" role="status">You’re all caught up.</p> : null}
      {nextPageToken && !pageError ? <div ref={sentinel} className="mx-auto flex min-h-12 w-[min(720px,100%)] items-center justify-center py-3" aria-live="polite">
        {loadingMore ? <span role="status">Loading more announcements…</span> : <Button type="button" variant="secondary" onClick={loadNextPage}>Load more announcements</Button>}
      </div> : null}
    </WorkflowPageFrame>
  );
}

export default function FeedPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <FeedView session={session} client={client} />;
}
