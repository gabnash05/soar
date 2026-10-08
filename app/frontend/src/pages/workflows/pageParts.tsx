import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonLink, Card, CardHeader, LoadingBlock, StateBlock, StatusChip } from '../../components/ui';
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
    <main className="workflow-page app-page" data-testid="workflow-page">
      <section className="hero workflow-hero">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          {session ? (
            <p className="hero-meta">
              <StatusChip tone={session.access.status === 'active' ? 'approved' : 'attention'}>{session.access.status}</StatusChip>{' '}
              <span>{session.displayName}</span>
            </p>
          ) : null}
        </div>
        {actions ? <div className="hero-actions">{actions}</div> : null}
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
        Workflow pages rely on the shared authenticated session and route guards from the frontend foundation.
      </StateBlock>
    );
  }
  if (session.access.status !== 'active') {
    return (
      <StateBlock title="Access is not active" symbol="₱" actions={<ButtonLink to="/settings/access" variant="primary">Review access</ButtonLink>}>
        Main workflow pages stay locked for pending, failed, cancelled, missing, or expired access. Saved records should be retained for renewal.
      </StateBlock>
    );
  }
  return null;
}

export function SourceNotice({ message, client }: { message?: string | null; client: WorkflowDataClient }) {
  const copy = message || (client.mode === 'fixture'
    ? 'Development fixture mode: sample workflow state is local only.'
    : client.mode === 'production'
      ? 'Configured backend services are in use. Failed saves or empty data are shown directly.'
      : getUnavailableCopy());
  return (
    <Card className="notice-card">
      <p>
        <strong>{client.label}:</strong> {copy}
      </p>
    </Card>
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

export function OrganizationAvatar({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return <span className="org-avatar">{logoUrl ? <img src={logoUrl} alt={`${name} logo`} /> : initials || 'SO'}</span>;
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
    <Card>
      <CardHeader title={title} />
      {entries.length ? (
        <ul className="feed-list">
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
        <p className="card-note">{emptyCopy}</p>
      )}
    </Card>
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

  return (
    <Card className="announcement-card">
      <div className="org-head">
        <OrganizationAvatar name={announcement.organizationName} logoUrl={announcement.organizationLogoUrl} />
        <div>
          <h2>{announcement.organizationName}</h2>
          <p className="card-note">{new Date(announcement.createdAt).toLocaleDateString()} · newest announcements first</p>
        </div>
      </div>
      {announcement.image ? (
        <figure className="image-frame">
          <img src={announcement.image.url} alt={announcement.image.alt} />
        </figure>
      ) : null}
      <p>{announcement.body}</p>
      <div className="component-row">
        <Button type="button" variant={announcement.viewerHasLiked ? 'primary' : 'secondary'} disabled={busy} onClick={toggleLike} aria-pressed={announcement.viewerHasLiked}>
          {announcement.viewerHasLiked ? '♥ Liked' : '♡ Like'} {announcement.likeCount}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setCommentsOpen((open) => !open)}>
          {commentsOpen ? 'Hide comments' : 'Open comments'} ({announcement.comments.length})
        </Button>
        <Link to={`/app/organizations/${announcement.organizationId}`}>Open organization profile</Link>
      </div>
      {commentsOpen ? (
        <form className="field" onSubmit={submitComment}>
          <label className="label-row" htmlFor={`comment-${announcement.id}`}>Add comment</label>
          <textarea id={`comment-${announcement.id}`} className="control textarea" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Keep comments respectful and specific." />
          <Button type="submit" variant="secondary" disabled={busy}>Add comment</Button>
          {announcement.comments.length ? (
            <ul>
              {announcement.comments.map((item) => (
                <li key={item.id}><strong>{item.authorName}:</strong> {item.body}</li>
              ))}
            </ul>
          ) : <p className="help">No comments yet.</p>}
        </form>
      ) : null}
      <ResultMessage result={result} />
    </Card>
  );
}
