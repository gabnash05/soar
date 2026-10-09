import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonLink, Card, CardHeader, LoadingBlock } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { MeetingRequestInput, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import { OfficerMeetingReview } from './OfficerPage';
import { EmptyState, ErrorState, MeetingStatusChip, ResultMessage, RouteUnavailableState, SourceNotice, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame, WorkflowTable } from './pageParts';
import { formatDateEntry, getApprovedOfficerGrants, todayIsoDate } from './workflowUtils';

export function MeetingsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const optionsQuery = useWorkflowQuery(() => client.listMeetingOptions(session), [client, session.uid]);
  const requestsQuery = useWorkflowQuery(() => client.listMyMeetingRequests(session), [client, session.uid]);
  const options = optionsQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const [form, setForm] = useState<MeetingRequestInput>({ organizationId: '', dateEntryId: '', requestedDate: todayIsoDate(), requestedTime: '09:00', note: '' });
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const managedOrganizationId = getApprovedOfficerGrants(session)[0]?.organizationId;

  useEffect(() => {
    if (!form.dateEntryId && options.length) {
      const first = options[0];
      setForm((current) => ({
        ...current,
        organizationId: first.organizationId,
        dateEntryId: first.id,
        requestedDate: first.date,
        requestedTime: first.startTime ?? '09:00',
      }));
    }
  }, [form.dateEntryId, options]);

  const groupedOptions = useMemo(() => options.reduce<Record<string, typeof options>>((groups, option) => {
    groups[option.organizationName] = [...(groups[option.organizationName] ?? []), option];
    return groups;
  }, {}), [options]);

  const selectedOption = options.find((option) => option.id === form.dateEntryId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.requestMeeting(form, session);
    setResult(next);
    setBusy(false);
    if (next.ok) await requestsQuery.reload();
  };

  return (
    <WorkflowPageFrame
      eyebrow="Meetings"
      title="Requests stay pending until an officer decides."
      description="Request posted meeting/interview availability and track the status. Pending requests are not confirmed bookings."
      session={session}
      actions={managedOrganizationId ? <ButtonLink to={`/settings/organization?organizationId=${managedOrganizationId}`} variant="secondary">Manage organization</ButtonLink> : undefined}
    >
      <SourceNotice client={client} message={optionsQuery.sourceMessage || requestsQuery.sourceMessage} />
      {optionsQuery.loading || requestsQuery.loading ? <LoadingBlock label="Loading meeting data" /> : null}
      {optionsQuery.error ? <ErrorState onRetry={optionsQuery.reload}>{optionsQuery.error}</ErrorState> : null}
      {requestsQuery.error ? <ErrorState onRetry={requestsQuery.reload}>{requestsQuery.error}</ErrorState> : null}
      <OfficerMeetingReview session={session} client={client} />

      <section className="grid grid-2">
        <Card>
          <CardHeader title="Request a meeting/interview" eyebrow="Posted availability only">
            Public dated events are informational; only meeting/interview availability can be requested.
          </CardHeader>
          {options.length ? (
            <form className="content-stack" onSubmit={submit}>
              <div className="field">
                <label className="label-row" htmlFor="meeting-option">Posted availability</label>
                <select
                  id="meeting-option"
                  className="control"
                  value={form.dateEntryId}
                  onChange={(event) => {
                    const next = options.find((option) => option.id === event.target.value);
                    setForm((current) => ({
                      ...current,
                      organizationId: next?.organizationId ?? '',
                      dateEntryId: event.target.value,
                      requestedDate: next?.date ?? current.requestedDate,
                      requestedTime: next?.startTime ?? current.requestedTime,
                    }));
                  }}
                >
                  {Object.entries(groupedOptions).map(([organizationName, entries]) => (
                    <optgroup key={organizationName} label={organizationName}>
                      {entries.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.title} · {formatDateEntry(entry)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {selectedOption ? <p className="help">{selectedOption.details}</p> : null}
              <div className="grid grid-2">
                <div className="field">
                  <label className="label-row" htmlFor="meeting-date">Requested date</label>
                  <input id="meeting-date" className="control" type="date" value={form.requestedDate} onChange={(event) => setForm((current) => ({ ...current, requestedDate: event.target.value }))} />
                </div>
                <div className="field">
                  <label className="label-row" htmlFor="meeting-time">Requested time</label>
                  <input id="meeting-time" className="control" type="time" value={form.requestedTime} onChange={(event) => setForm((current) => ({ ...current, requestedTime: event.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label className="label-row" htmlFor="meeting-note">Short note <span>Optional</span></label>
                <textarea id="meeting-note" className="control textarea" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="What do you want to discuss?" />
              </div>
              <Button type="submit" variant="primary" disabled={busy}>Send request as Pending</Button>
              <ResultMessage result={result} />
            </form>
          ) : (
            <EmptyState title="No meeting availability posted">Organizations must post availability before users can request meetings or interviews.</EmptyState>
          )}
        </Card>

        <Card>
          <CardHeader title="Available meeting/interview dates" />
          {options.length ? (
            <ul className="feed-list">
              {options.map((entry) => (
                <li key={entry.id}>
                  <div className="feed-copy">
                    <strong><Link className="org-author-link" to={`/app/organizations/${entry.organizationId}`}>{entry.organizationName}</Link> · {entry.title}</strong>
                    <span>{formatDateEntry(entry)} · {entry.details}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="card-note">No availability records are loaded.</p>}
        </Card>
      </section>

      {requests.length ? (
        <WorkflowTable
          caption="My meeting request statuses"
          headers={['Organization', 'Meeting title', 'Requested date/time', 'Status', 'Meaning']}
          rows={requests.map((request) => (
            <tr key={request.id}>
              <td><Link className="org-author-link" to={`/app/organizations/${request.organizationId}`}>{request.organizationName}</Link></td>
              <td>{request.meetingTitle}</td>
              <td>{request.requestedDate}, {request.requestedTime}</td>
              <td><MeetingStatusChip status={request.status} /></td>
              <td>{request.status === 'Pending' ? 'Not a confirmed booking' : request.status === 'Approved' ? 'Confirmed by officer' : 'Declined by officer'}</td>
            </tr>
          ))}
        />
      ) : !requestsQuery.loading && !requestsQuery.error ? (
        <EmptyState title="No meeting requests yet">Submitted requests will appear here as Pending until the organization approves or declines them.</EmptyState>
      ) : null}

    </WorkflowPageFrame>
  );
}

export default function MeetingsPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <MeetingsView session={session} client={client} />;
}
