import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Share2 } from 'lucide-react';
import { Button, ButtonLink, ConfirmDialog, LoadingBlock, RoleBadge, StateBlock, StatusChip } from '../../components/ui';
import { useAuth, useBackendGateway } from '../../context/AuthContext';
import type { ApplicationStage, MeetingStatus, UserSession } from '../../lib/contracts';
import { getWorkflowDataClientForGatewayMode, unavailableWorkflowDataClient } from './adapters';
import type { Announcement, AnnouncementComment, DateEntry, WorkflowDataClient, WorkflowMutationResult, WorkflowQueryResult } from './contracts';
import { formatDateEntry, getMeetingTone, getStageTone, getUnavailableCopy } from './workflowUtils';
import { cn } from '../../lib/utils';
import { safeErrorMessage } from '../../lib/safeErrors';

export function useWorkflowDataClient(): WorkflowDataClient {
  const gateway = useBackendGateway();
  return useMemo(() => getWorkflowDataClientForGatewayMode(gateway.mode), [gateway.mode]);
}

export function useWorkflowSession(): { session: UserSession | null; client: WorkflowDataClient; loading: boolean } {
  const { session, loading } = useAuth();
  const client = useWorkflowDataClient();
  return { session, client, loading };
}

export function useWorkflowQuery<T>(load: () => Promise<WorkflowQueryResult<T>>, deps: unknown[]): {
  data: T | null;
  loading: boolean;
  error: string | null;
  sourceMessage: string | null;
  reload(): Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceMessage, setSourceMessage] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await load();
      setData(result.data);
      setSourceMessage(result.message ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load workflow data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (!active) return;
        setData(result.data);
        setSourceMessage(result.message ?? null);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Unable to load workflow data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, sourceMessage, reload };
}

export function WorkflowPageFrame({
  eyebrow,
  title,
  description,
  session,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  session?: UserSession | null;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto grid w-[min(1120px,100%)] min-w-0 gap-[18px]" data-testid="workflow-page">
      <section className="relative flex min-h-0 items-end justify-between gap-4 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--color-navy)] bg-[image:var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_h1]:mb-1.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(1.85rem,4vw,3rem)] [&_h1]:font-bold [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.035em] [&_h1]:text-white [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80 max-[820px]:flex-col max-[820px]:items-start max-[820px]:[&_h1]:max-w-none max-[820px]:[&_h1]:text-[2.15rem]">
        <div>
          <p className="eyebrow mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-gold)]">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 max-[820px]:w-full max-[820px]:justify-start">{actions}</div> : null}
      </section>
      {children}
    </main>
  );
}

export function RouteUnavailableState({ loading, session }: { loading: boolean; session: UserSession | null }) {
  if (loading) return <LoadingBlock label="Loading workflow route" />;
  if (!session) {
    return (
      <StateBlock title="Sign in required" symbol="!" actions={<ButtonLink to="/login" variant="secondary">Sign in</ButtonLink>}>
        Sign in to continue to this SOAR section.
      </StateBlock>
    );
  }
  if (session.access.status !== 'active') {
    return (
      <StateBlock title="Access is not active" symbol="PHP" actions={<ButtonLink to="/settings/access" variant="primary">Review access</ButtonLink>}>
        Main SOAR pages stay locked until six-month access is active. Saved records remain available after renewal.
      </StateBlock>
    );
  }
  return null;
}

export function SourceNotice({ client }: { message?: string | null; client: WorkflowDataClient }) {
  if (client.mode === 'production') return null;
  const copy = client.mode === 'fixture'
    ? 'Demo mode: sample accounts, payments, and workflow changes are simulated locally.'
    : getUnavailableCopy();
  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-blue)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] [&_p]:m-0" role="note">
      <p>{copy}</p>
    </aside>
  );
}

export function TabSectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-3.5 flex min-w-0 items-start justify-between gap-4 max-[820px]:flex-col max-[820px]:items-stretch">
      <div className="grid min-w-0 gap-1">
        <h2 className="m-0 font-[var(--font-display)] text-[clamp(1.25rem,2.4vw,1.75rem)] font-extrabold leading-[1.14] tracking-[-0.02em] text-[var(--color-navy)]">{title}</h2>
        {description ? <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2 max-[820px]:w-full max-[820px]:[&_a]:w-full max-[820px]:[&_button]:w-full">{action}</div> : null}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <StateBlock title={title} symbol="0">
      {children}
    </StateBlock>
  );
}

export function ErrorState({ title = 'We could not load this', children, onRetry }: { title?: string; children: ReactNode; onRetry?: () => void }) {
  return (
    <StateBlock title={title} symbol="!" actions={onRetry ? <Button type="button" variant="secondary" onClick={onRetry}>Try again</Button> : undefined}>
      {children}
    </StateBlock>
  );
}

function organizationInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SO';
}

export function OrganizationAvatar({ name, logoUrl }: { name: string; logoUrl?: string }) {
  return <span className="grid size-[52px] shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[var(--color-navy-soft)] font-[var(--font-display)] text-sm font-extrabold leading-none text-[var(--color-navy)] [&_img]:h-full [&_img]:w-full [&_img]:bg-[var(--color-white)] [&_img]:object-contain [&_img]:p-[5px]">{logoUrl ? <img src={logoUrl} alt={`${name} logo`} loading="lazy" decoding="async" /> : organizationInitials(name)}</span>;
}

export function OrganizationIdentityArt({ name, logoUrl, className = '' }: { name: string; logoUrl?: string; className?: string }) {
  return (
    <div
      className={cn(
        'org-identity-art grid min-h-[170px] place-items-center bg-[linear-gradient(135deg,var(--color-navy-soft),var(--color-blue-soft))] p-5.5 text-[var(--color-navy)] max-sm:min-h-[140px]',
        '[&_img]:h-full [&_img]:max-h-[180px] [&_img]:w-full [&_img]:object-contain',
        '[&_span]:grid [&_span]:aspect-square [&_span]:w-[min(126px,48vw)] [&_span]:place-items-center [&_span]:rounded-[28px] [&_span]:bg-[var(--color-white)] [&_span]:font-[var(--font-display)] [&_span]:text-[clamp(2rem,6vw,3.3rem)] [&_span]:font-black [&_span]:leading-none [&_span]:text-[var(--color-navy)] [&_span]:shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      {logoUrl ? <img src={logoUrl} alt={`${name} logo`} loading="lazy" decoding="async" /> : <span>{organizationInitials(name)}</span>}
    </div>
  );
}

export function ResultMessage({ result }: { result: WorkflowMutationResult<unknown> | string | null }) {
  if (!result) return null;
  const message = typeof result === 'string' ? result : result.message;
  const ok = typeof result === 'string' ? true : result.ok;
  return (
    <p role="status" className={cn('text-xs text-[var(--muted-foreground)]', !ok && 'font-bold text-[var(--color-orange-deep)]')}>
      {message}
    </p>
  );
}

export function DateEntryList({ title, entries, emptyCopy, action }: { title: string; entries: DateEntry[]; emptyCopy: string; action?: ReactNode }) {
  return (
    <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)]">
      <TabSectionHeader title={title} action={action} />
      {entries.length ? (
        <ul className="m-0 grid list-none gap-0 p-0">
          {entries.map((entry) => (
            <li key={entry.id} className="flex min-w-0 items-center gap-2.5 border-b border-[var(--color-border)] py-3 max-[820px]:items-start">
              <div className="min-w-0 flex-1 [&_strong]:block [&_strong]:text-[var(--color-navy)] [&_span]:mt-0.5 [&_span]:block [&_span]:[overflow-wrap:anywhere] [&_span]:text-[0.88rem] [&_span]:text-[var(--muted-foreground)]">
                <strong>{entry.title}</strong>
                <span>{formatDateEntry(entry)} · {entry.details}</span>
              </div>
              <StatusChip className="min-h-6 shrink-0 whitespace-nowrap px-2 text-[0.7rem]" tone={entry.kind === 'event' ? 'neutral' : 'info'}>
                <span aria-label={entry.kind === 'event' ? 'Dated event' : 'Meeting/interview availability'}>{entry.kind === 'event' ? 'Event' : 'Availability'}</span>
              </StatusChip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">{emptyCopy}</p>
      )}
    </section>
  );
}

export function WorkflowTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[];
}) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)]" role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full min-w-[640px] border-collapse [&_caption]:px-3 [&_caption]:py-2.5 [&_caption]:text-left [&_caption]:text-[0.85rem] [&_caption]:font-bold [&_caption]:text-[var(--muted-foreground)] [&_th]:border-b [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-off-white)] [&_th]:p-3 [&_th]:text-left [&_th]:align-top [&_th]:text-[0.82rem] [&_th]:uppercase [&_th]:tracking-[0.04em] [&_th]:text-[var(--color-navy)] [&_td]:border-b [&_td]:border-[var(--color-border)] [&_td]:p-3 [&_td]:text-left [&_td]:align-top">
        <caption>{caption}</caption>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export function StageChip({ stage }: { stage: ApplicationStage }) {
  return <StatusChip tone={getStageTone(stage)}>{stage}</StatusChip>;
}

export function MeetingStatusChip({ status }: { status: MeetingStatus }) {
  return <StatusChip tone={getMeetingTone(status)}>{status}</StatusChip>;
}

function CommentAuthorBadge({ comment }: { comment: AnnouncementComment }) {
  if (comment.authorAccountKind !== 'student') return null;
  const isOfficer = comment.authorOrganizationRole === 'approved_officer';
  return <RoleBadge kind={isOfficer ? 'officer' : 'student'}>{isOfficer ? 'Officer' : 'Student'}</RoleBadge>;
}

function LikeIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="like-icon size-[21px] shrink-0" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M7.3 10.4 11 4.7c.5-.8 1.7-.5 1.7.5v3.9h4.5c1.3 0 2.3 1.1 2 2.4l-1.2 6.2a2.4 2.4 0 0 1-2.4 1.9H7.3V10.4Zm0 0H4.8c-.9 0-1.6.7-1.6 1.6v6c0 .9.7 1.6 1.6 1.6h2.5"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AnnouncementCard({
  announcement,
  session,
  client = unavailableWorkflowDataClient,
  onChanged,
}: {
  announcement: Announcement;
  session: UserSession;
  client?: WorkflowDataClient;
  onChanged?: () => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState(announcement.comments);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const media = announcement.media?.length ? announcement.media : announcement.image ? [announcement.image] : [];
  const commentCount = announcement.commentCount ?? announcement.comments.length;

  const loadComments = async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const result = await client.listAnnouncementComments(announcement.id, session);
      setComments(result.data);
    } catch (error) {
      setCommentsError(safeErrorMessage(error, 'Comments could not be loaded. Please try again.'));
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleLike = async () => {
    setBusy(true);
    const next = await client.toggleAnnouncementLike(announcement.id, !announcement.viewerHasLiked, session);
    setResult(next);
    setBusy(false);
    if (next.ok) onChanged?.();
  };

  const copyLink = async () => {
    const path = announcement.deepLinkPath || `/app?announcementId=${encodeURIComponent(announcement.id)}`;
    const url = `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable.');
      await navigator.clipboard.writeText(url);
      setResult({ ok: true, persisted: false, source: client.mode, message: 'Announcement link copied.' });
    } catch {
      setResult({ ok: true, persisted: false, source: client.mode, message: `Copy this link manually: ${url}` });
    }
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.addAnnouncementComment(announcement.id, comment, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setComment('');
      await loadComments();
      onChanged?.();
    }
  };

  const startEditing = (commentId: string, body: string) => {
    setEditingCommentId(commentId);
    setEditingBody(body);
    setResult(null);
  };

  const saveComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCommentId) return;
    setBusy(true);
    const next = await client.updateAnnouncementComment(announcement.id, editingCommentId, editingBody, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setEditingCommentId(null);
      setEditingBody('');
      await loadComments();
      onChanged?.();
    }
  };

  const deleteComment = async () => {
    if (!deleteCommentId) return;
    setBusy(true);
    setDeleteError(null);
    const next = await client.deleteAnnouncementComment(announcement.id, deleteCommentId, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setDeleteCommentId(null);
      await loadComments();
      onChanged?.();
    } else {
      setDeleteError(next.message);
    }
  };

  const organizationPath = `/app/organizations/${announcement.organizationId}`;

  return (
    <article id={`announcement-${announcement.id}`} className="grid w-full gap-3.5 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-white)] p-[clamp(16px,3vw,24px)] shadow-[var(--shadow-soft)] target:outline target:outline-3 target:outline-offset-4 target:outline-[var(--color-blue)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-blue)] grid gap-3.5" tabIndex={-1}>
      <div className="flex min-w-0 items-center gap-3 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[1.05rem] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[var(--color-navy)] [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[1.05rem] [&_h3]:font-bold [&_h3]:leading-tight [&_h3]:text-[var(--color-navy)] items-start [&>div]:min-w-0 [&>div]:flex-1">
        <Link className="inline-grid rounded-[14px] text-inherit no-underline" to={organizationPath} aria-label={`Open ${announcement.organizationName} profile`}>
          <OrganizationAvatar name={announcement.organizationName} logoUrl={announcement.organizationLogoUrl} />
        </Link>
        <div>
          <h2><Link className="text-[var(--color-navy)] underline decoration-transparent underline-offset-4 hover:text-[var(--color-blue-deep)] hover:decoration-current focus-visible:text-[var(--color-blue-deep)] focus-visible:decoration-current" to={organizationPath}>{announcement.organizationName}</Link></h2>
          <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">{new Date(announcement.createdAt).toLocaleDateString()} · newest announcements first</p>
        </div>
      </div>
      {media.length ? (
        <div className={cn('grid gap-2 [&_img]:min-h-[180px] [&_img]:max-h-[420px]', media.length > 1 && 'md:grid-cols-2')>
          {media.map((item, index) => (
            <figure className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-off-white)] [&_img]:block [&_img]:max-h-[340px] [&_img]:w-full [&_img]:object-cover" key={`${item.url}-${index}`}>
              <img src={item.url} alt={item.alt} loading="lazy" decoding="async" />
            </figure>
          ))}
        </div>
      ) : null}
      <p>{announcement.body}</p>
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-1">
        <Button
          type="button"
          variant="quiet"
          className={cn(
            'min-w-[52px] rounded-full border border-[var(--color-border)] bg-[var(--color-white)] px-3 text-[var(--color-blue-deep)] hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-soft)] disabled:opacity-60',
            announcement.viewerHasLiked && 'border-[var(--color-gold)] bg-[var(--color-gold-soft)] text-[var(--color-navy)]',
          )}
          disabled={busy}
          onClick={toggleLike}
          aria-pressed={announcement.viewerHasLiked}
          aria-busy={busy || undefined}
          aria-label={`${announcement.viewerHasLiked ? 'Unlike' : 'Like'} announcement from ${announcement.organizationName}; ${announcement.likeCount} ${announcement.likeCount === 1 ? 'like' : 'likes'}`}
        >
          <LikeIcon filled={announcement.viewerHasLiked} />
          <span className="sr-only">{announcement.viewerHasLiked ? 'Liked' : 'Like'}</span>
          <span className="like-count min-w-[1.2em] tabular-nums" aria-hidden="true">{announcement.likeCount}</span>
        </Button>
        <Button type="button" variant="quiet" onClick={() => {
          const opening = !commentsOpen;
          setCommentsOpen(opening);
          if (opening) void loadComments();
        }}>
          <MessageCircle aria-hidden="true" className="size-4" />
          {commentsOpen ? 'Hide comments' : 'Open comments'} ({commentCount})
        </Button>
        <Button type="button" variant="quiet" onClick={copyLink} aria-label={`Share direct link to announcement from ${announcement.organizationName}`}>
          <Share2 aria-hidden="true" className="size-4" />
          Share
        </Button>
      </div>
      {commentsOpen ? (
        <section className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-off-white)] p-3.5" aria-label={`Comments for ${announcement.organizationName} announcement`}>
          <form className="grid min-w-0 gap-1.5 border-b border-[var(--color-border)] pb-3" onSubmit={submitComment}>
            <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor={`comment-${announcement.id}`}>Add comment</label>
            <textarea id={`comment-${announcement.id}`} className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)] min-h-[120px] resize-y" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Keep comments respectful and specific." />
            <Button type="submit" variant="secondary" disabled={busy}>Add comment</Button>
          </form>
          {commentsLoading ? <p role="status">Loading comments…</p> : null}
          {commentsError ? <div className="grid gap-2" role="alert"><p>{commentsError}</p><Button type="button" variant="secondary" onClick={() => void loadComments()}>Try again</Button></div> : null}
          {!commentsLoading && !commentsError && comments.length ? (
            <ul className="m-0 grid list-none gap-2.5 p-0 text-[var(--muted-foreground)] [&_li]:flex [&_li]:items-start [&_li]:justify-between [&_li]:gap-3 [&_li]:border-t [&_li]:border-[color-mix(in_oklch,var(--color-border)_72%,transparent)] [&_li]:py-2.5 [&_li:first-child]:border-t-0 max-sm:[&_li]:flex-col">
              {comments.map((item) => {
                const canEdit = item.viewerCanEdit || item.authorUid === session.uid;
                const canDelete = item.viewerCanDelete || item.authorUid === session.uid;
                return (
                  <li key={item.id}>
                    {editingCommentId === item.id ? (
                      <form className="grid w-full gap-2" onSubmit={saveComment}>
                        <label className="sr-only" htmlFor={`edit-comment-${item.id}`}>Edit comment by {item.authorName}</label>
                        <textarea id={`edit-comment-${item.id}`} className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)] min-h-[120px] resize-y" value={editingBody} onChange={(event) => setEditingBody(event.target.value)} />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="submit" variant="secondary" disabled={busy}>Save comment</Button>
                          <Button type="button" variant="quiet" onClick={() => { setEditingCommentId(null); setEditingBody(''); }}>Cancel</Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="min-w-0 [&_p]:mt-0.5 [&_p]:mb-0 [&_p]:[overflow-wrap:anywhere] [&_p]:text-[var(--color-ink)]">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="block text-[var(--color-navy)]">{item.authorName}</strong>
                            <CommentAuthorBadge comment={item} />
                          </div>
                          <p>{item.body}</p>
                          {item.updatedAt ? <span className="mt-1 inline-block text-xs text-[var(--muted-foreground)]">Edited</span> : null}
                        </div>
                        {(canEdit || canDelete) ? (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {canEdit ? <Button type="button" variant="quiet" onClick={() => startEditing(item.id, item.body)}>Edit</Button> : null}
                            {canDelete ? <Button type="button" variant="danger" onClick={() => { setDeleteError(null); setDeleteCommentId(item.id); }}>Delete</Button> : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : !commentsLoading && !commentsError ? <p className="text-xs text-[var(--muted-foreground)]">No comments yet.</p> : null}
        </section>
      ) : null}
      <ResultMessage result={result} />
      <ConfirmDialog
        open={Boolean(deleteCommentId)}
        title="Delete your comment?"
        description="This removes your comment from the post and refreshes the comment count. The announcement itself stays unchanged."
        confirmLabel="Delete comment"
        cancelLabel="Keep comment"
        destructive
        busy={busy}
        error={deleteError}
        onOpenChange={(open) => { if (!open) setDeleteCommentId(null); }}
        onConfirm={deleteComment}
      />
    </article>
  );
}
