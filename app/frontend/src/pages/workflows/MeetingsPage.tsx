import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, LoadingBlock, ModalDialog, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { DateEntry, MeetingRequestInput, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import { OfficerMeetingReview } from './OfficerPage';
import { EmptyState, ErrorState, MeetingStatusChip, ResultMessage, RouteUnavailableState, SourceNotice, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame, WorkflowTable } from './pageParts';
import { formatDateEntry, getApprovedOfficerGrants, todayIsoDate } from './workflowUtils';

const requestInputFromOption = (option?: DateEntry): MeetingRequestInput => ({
  organizationId: option?.organizationId ?? '',
  dateEntryId: option?.id ?? '',
  requestedDate: option?.date ?? todayIsoDate(),
  requestedTime: option?.startTime ?? '09:00',
  note: '',
});

export function MeetingsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const optionsQuery = useWorkflowQuery(() => client.listMeetingOptions(session), [client, session.uid]);
  const requestsQuery = useWorkflowQuery(() => client.listMyMeetingRequests(session), [client, session.uid]);
  const options = optionsQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const officerGrants = getApprovedOfficerGrants(session);
  const hasOfficerReview = officerGrants.length > 0;
  const tabItems = [
    ...(hasOfficerReview ? [{ id: 'review', label: 'Review requests', count: officerGrants.length }] : []),
    { id: 'availability', label: 'Availability', count: options.length },
    { id: 'mine', label: 'My requests', count: requests.length },
  ];
  const { activeId, getTabTo } = useQueryTab(tabItems.map((item) => item.id), hasOfficerReview ? 'review' : 'availability');
  const [form, setForm] = useState<MeetingRequestInput>(() => requestInputFromOption());
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestDirty, setRequestDirty] = useState(false);

  useEffect(() => {
    if (!form.dateEntryId && options.length) {
      setForm(requestInputFromOption(options[0]));
    }
  }, [form.dateEntryId, options]);

  const groupedOptions = useMemo(() => options.reduce<Record<string, typeof options>>((groups, option) => {
    groups[option.organizationName] = [...(groups[option.organizationName] ?? []), option];
    return groups;
  }, {}), [options]);

  const selectedOption = options.find((option) => option.id === form.dateEntryId);

  const patchForm = (patch: Partial<MeetingRequestInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    setRequestDirty(true);
  };

  const openRequestDialog = () => {
    setResult(null);
    setRequestDirty(false);
    if (!form.dateEntryId && options[0]) setForm(requestInputFromOption(options[0]));
    setRequestOpen(true);
  };

  const closeRequestDialog = () => {
    setRequestOpen(false);
    setRequestDirty(false);
    setForm(requestInputFromOption(options[0]));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.requestMeeting(form, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setRequestOpen(false);
      setRequestDirty(false);
      setForm(requestInputFromOption(options[0]));
      await requestsQuery.reload();
    }
  };

  return (
    <WorkflowPageFrame
      eyebrow="Meetings"
      title={hasOfficerReview ? 'Review meeting requests or switch to your own requests.' : 'Request meetings from posted availability.'}
      description="Pending requests are not confirmed bookings. Use tabs to separate posted availability, personal statuses, and officer decisions."
      session={session}
      actions={activeId !== 'review' ? <Button type="button" variant="primary" disabled={!options.length} onClick={openRequestDialog}>Request meeting</Button> : undefined}
    >
      <SourceNotice client={client} message={optionsQuery.sourceMessage || requestsQuery.sourceMessage} />
      {!requestOpen ? <ResultMessage result={result} /> : null}
      {optionsQuery.loading || requestsQuery.loading ? <LoadingBlock label="Loading meeting data" /> : null}
      {optionsQuery.error ? <ErrorState onRetry={optionsQuery.reload}>{optionsQuery.error}</ErrorState> : null}
      {requestsQuery.error ? <ErrorState onRetry={requestsQuery.reload}>{requestsQuery.error}</ErrorState> : null}

      <SubtabNav label="Meeting tasks" baseId="meetings" items={tabItems} activeId={activeId} getTabTo={getTabTo} />

      <ModalDialog open={requestOpen} title="Request a meeting/interview" dirty={requestDirty} onClose={closeRequestDialog}>
        {requestOpen ? (
          <form className="content-stack dialog-form" onSubmit={submit}>
            <p className="section-note">Public dated events are informational; only meeting/interview availability can be requested.</p>
            {options.length ? (
              <>
                <div className="field">
                  <label className="label-row" htmlFor="meeting-option">Posted availability</label>
                  <select
                    data-autofocus
                    id="meeting-option"
                    className="control"
                    value={form.dateEntryId}
                    onChange={(event) => {
                      const next = options.find((option) => option.id === event.target.value);
                      patchForm({
                        organizationId: next?.organizationId ?? '',
                        dateEntryId: event.target.value,
                        requestedDate: next?.date ?? form.requestedDate,
                        requestedTime: next?.startTime ?? form.requestedTime,
                      });
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
                    <input id="meeting-date" className="control" type="date" value={form.requestedDate} onChange={(event) => patchForm({ requestedDate: event.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label-row" htmlFor="meeting-time">Requested time</label>
                    <input id="meeting-time" className="control" type="time" value={form.requestedTime} onChange={(event) => patchForm({ requestedTime: event.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label className="label-row" htmlFor="meeting-note">Short note <span>Optional</span></label>
                  <textarea id="meeting-note" className="control textarea" value={form.note} onChange={(event) => patchForm({ note: event.target.value })} placeholder="What do you want to discuss?" />
                </div>
                <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Sending…' : 'Send request as Pending'}</Button>
                <ResultMessage result={result} />
              </>
            ) : (
              <EmptyState title="No meeting availability posted">Organizations must post availability before users can request meetings or interviews.</EmptyState>
            )}
          </form>
        ) : null}
      </ModalDialog>

      {hasOfficerReview ? (
        <SubtabPanel baseId="meetings" tabId="review" activeId={activeId}>
          <OfficerMeetingReview session={session} client={client} />
        </SubtabPanel>
      ) : null}

      <SubtabPanel baseId="meetings" tabId="availability" activeId={activeId}>
        <section className="surface-section compact-section">
          <header className="section-heading inline-heading">
            <div>
              <h2>Available meeting/interview dates</h2>
              <p>Choose a posted availability window, then send a request from the action above.</p>
            </div>
            {options.length ? <Button type="button" variant="secondary" onClick={openRequestDialog}>Request from this list</Button> : null}
          </header>
          {options.length ? (
            <ul className="feed-list divided-list">
              {options.map((entry) => (
                <li key={entry.id}>
                  <div className="feed-copy">
                    <strong><Link className="org-author-link" to={`/app/organizations/${entry.organizationId}`}>{entry.organizationName}</Link> · {entry.title}</strong>
                    <span>{formatDateEntry(entry)} · {entry.details}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="section-note">No availability records are loaded.</p>}
        </section>
      </SubtabPanel>

      <SubtabPanel baseId="meetings" tabId="mine" activeId={activeId}>
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
      </SubtabPanel>
    </WorkflowPageFrame>
  );
}

export default function MeetingsPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <MeetingsView session={session} client={client} />;
}
