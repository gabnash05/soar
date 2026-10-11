import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonLink, LoadingBlock, StateBlock, StatusChip } from '../../components/ui';
import { useAuth, useBackendGateway } from '../../context/AuthContext';
import type { ApplicationStage, MeetingStatus, UserSession } from '../../lib/contracts';
import { getWorkflowDataClientForGatewayMode, unavailableWorkflowDataClient } from './adapters';
import type { Announcement, DateEntry, WorkflowDataClient, WorkflowMutationResult, WorkflowQueryResult } from './contracts';
import { formatDateEntry, getMeetingTone, getStageTone, getUnavailableCopy } from './workflowUtils';

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
    <main className="workflow-page app-page page-stack" data-testid="workflow-page">
      <section className="workflow-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="section-actions">{actions}</div> : null}
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
        Main SOAR pages stay locked until annual access is active. Saved records remain available after renewal.
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
    <aside className="surface-notice" role="note">
      <p>{copy}</p>
    </aside>
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
  return <span className="org-avatar">{logoUrl ? <img src={logoUrl} alt={`${name} logo`} loading="lazy" decoding="async" /> : organizationInitials(name)}</span>;
}

export function OrganizationIdentityArt({ name, logoUrl, className = '' }: { name: string; logoUrl?: string; className?: string }) {
  return (
    <div className={`org-identity-art ${className}`.trim()}>
      {logoUrl ? <img src={logoUrl} alt={`${name} logo`} loading="lazy" decoding="async" /> : <span>{organizationInitials(name)}</span>}
    </div>
  );
}

export function ResultMessage({ result }: { result: WorkflowMutationResult<unknown> | string | null }) {
  if (!result) return null;
  const message = typeof result === 'string' ? result : result.message;
  const ok = typeof result === 'string' ? true : result.ok;
  return (
    <p role="status" className={`help ${ok ? '' : 'error'}`.trim()}>
      {message}
    </p>
  );
}

export function DateEntryList({ title, entries, emptyCopy }: { title: string; entries: DateEntry[]; emptyCopy: string }) {
  return (
    <section className="surface-section compact-section">
      <header className="section-heading">
        <h2>{title}</h2>
      </header>
      {entries.length ? (
        <ul className="feed-list divided-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="feed-date" aria-hidden="true">
                {entry.kind === 'event' ? 'EVT' : 'REQ'}
              </div>
              <div className="feed-copy">
                <strong>{entry.title}</strong>
                <span>{formatDateEntry(entry)} · {entry.details}</span>
              </div>
              <StatusChip tone={entry.kind === 'event' ? 'neutral' : 'info'}>{entry.kind === 'event' ? 'Dated event' : 'Meeting/interview availability'}</StatusChip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="section-note">{emptyCopy}</p>
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
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="data-table">
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

function LikeIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="like-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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
  const [comment, setComment] = useState('');
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleLike = async () => {
    setBusy(true);
    const next = await client.toggleAnnouncementLike(announcement.id, !announcement.viewerHasLiked, session);
    setResult(next);
    setBusy(false);
    if (next.ok) onChanged?.();
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.addAnnouncementComment(announcement.id, comment, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setComment('');
      onChanged?.();
    }
  };

  const organizationPath = `/app/organizations/${announcement.organizationId}`;

  return (
    <article className="announcement-card feed-item">
      <div className="org-head">
        <Link className="org-avatar-link" to={organizationPath} aria-label={`Open ${announcement.organizationName} profile`}>
          <OrganizationAvatar name={announcement.organizationName} logoUrl={announcement.organizationLogoUrl} />
        </Link>
        <div>
          <h2><Link className="org-author-link" to={organizationPath}>{announcement.organizationName}</Link></h2>
          <p className="section-note">{new Date(announcement.createdAt).toLocaleDateString()} · newest announcements first</p>
        </div>
      </div>
      {announcement.image ? (
        <figure className="image-frame">
          <img src={announcement.image.url} alt={announcement.image.alt} loading="lazy" decoding="async" />
        </figure>
      ) : null}
      <p>{announcement.body}</p>
      <div className="component-row social-action-row">
        <Button
          type="button"
          variant="quiet"
          className={`like-button ${announcement.viewerHasLiked ? 'liked' : 'unliked'}`}
          disabled={busy}
          onClick={toggleLike}
          aria-pressed={announcement.viewerHasLiked}
          aria-busy={busy || undefined}
          aria-label={`${announcement.viewerHasLiked ? 'Unlike' : 'Like'} announcement from ${announcement.organizationName}; ${announcement.likeCount} ${announcement.likeCount === 1 ? 'like' : 'likes'}`}
        >
          <LikeIcon filled={announcement.viewerHasLiked} />
          <span className="sr-only">{announcement.viewerHasLiked ? 'Liked' : 'Like'}</span>
          <span className="like-count" aria-hidden="true">{announcement.likeCount}</span>
        </Button>
        <Button type="button" variant="quiet" onClick={() => setCommentsOpen((open) => !open)}>
          {commentsOpen ? 'Hide comments' : 'Open comments'} ({announcement.comments.length})
        </Button>
      </div>
      {commentsOpen ? (
        <form className="field comment-form" onSubmit={submitComment}>
          <label className="label-row" htmlFor={`comment-${announcement.id}`}>Add comment</label>
          <textarea id={`comment-${announcement.id}`} className="control textarea" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Keep comments respectful and specific." />
          <Button type="submit" variant="secondary" disabled={busy}>Add comment</Button>
          {announcement.comments.length ? (
            <ul className="comment-list">
              {announcement.comments.map((item) => (
                <li key={item.id}><strong>{item.authorName}:</strong> {item.body}</li>
              ))}
            </ul>
          ) : <p className="help">No comments yet.</p>}
        </form>
      ) : null}
      <ResultMessage result={result} />
    </article>
  );
}
