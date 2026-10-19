import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, LoadingBlock, ModalDialog, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import { MEETING_DOCUMENT_MAX_BYTES, formatBytes, openPrivateMeetingDocument, validateMeetingDocumentFile } from '../../lib/storageUploads';
import { safeErrorMessage } from '../../lib/safeErrors';
import type { DateEntry, MeetingRequest, MeetingRequestInput, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import { OfficerMeetingReview } from './OfficerPage';
import { EmptyState, ErrorState, MeetingStatusChip, ResultMessage, RouteUnavailableState, SourceNotice, TabSectionHeader, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame, WorkflowTable } from './pageParts';
import { formatDateEntry, getApprovedOfficerGrants, todayIsoDate } from './workflowUtils';

const requestInputFromOption = (option?: DateEntry): MeetingRequestInput => ({
  organizationId: option?.organizationId ?? '',
  dateEntryId: option?.id ?? '',
  requestedDate: option?.date ?? todayIsoDate(),
  requestedTime: option?.startTime ?? '09:00',
  note: '',
});

function mergeMeetingRequests(serverRequests: MeetingRequest[], confirmedRequests: MeetingRequest[]) {
  const requestsById = new Map<string, MeetingRequest>();
  confirmedRequests.forEach((request) => requestsById.set(request.id, request));
  serverRequests.forEach((request) => requestsById.set(request.id, request));
  return Array.from(requestsById.values());
}

export function MeetingDocumentButton({ request }: { request: MeetingRequest }) {
  const [message, setMessage] = useState('');
  if (!request.document) return <span className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">No document</span>;
  return (
    <div className="grid items-start gap-1.5 [&_span]:text-xs [&_span]:text-[var(--muted-foreground)]">
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          setMessage('');
          try {
            await openPrivateMeetingDocument(request.id, request.document!.fileName, request.document!.contentType);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not open this document.');
          }
        }}
      >
        Open document
      </Button>
      <span>{request.document.fileName} · {formatBytes(request.document.sizeBytes)}</span>
      {message ? <span className="text-xs text-[var(--muted-foreground)] border-[var(--color-orange-deep)] text-[var(--color-orange-deep)]" role="alert">{message}</span> : null}
    </div>
  );
}

export function MeetingsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const [searchParams] = useSearchParams();
  const requestedOrganizationId = searchParams.get('organizationId') ?? '';
  const optionsQuery = useWorkflowQuery(() => client.listMeetingOptions(session), [client, session.uid]);
  const requestsQuery = useWorkflowQuery(() => client.listMyMeetingRequests(session), [client, session.uid]);
  const [confirmedRequestsBySession, setConfirmedRequestsBySession] = useState<{ sessionUid: string; items: MeetingRequest[] }>(() => ({ sessionUid: session.uid, items: [] }));
  const confirmedRequests = confirmedRequestsBySession.sessionUid === session.uid ? confirmedRequestsBySession.items : [];
  const options = optionsQuery.data ?? [];
  const requests = mergeMeetingRequests(requestsQuery.data ?? [], confirmedRequests);
  const preferredOption = options.find((option) => option.organizationId === requestedOrganizationId) ?? options[0];
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
  const [documentError, setDocumentError] = useState('');

  useEffect(() => {
    if (!form.dateEntryId && preferredOption) {
      setForm(requestInputFromOption(preferredOption));
    }
  }, [form.dateEntryId, preferredOption]);

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
    setDocumentError('');
    setRequestDirty(false);
    if (!form.dateEntryId && preferredOption) setForm(requestInputFromOption(preferredOption));
    setRequestOpen(true);
  };

  const closeRequestDialog = () => {
    setRequestOpen(false);
    setDocumentError('');
    setRequestDirty(false);
    setForm(requestInputFromOption(preferredOption));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (documentError) return;
    setBusy(true);
    try {
      const next = await client.requestMeeting(form, session);
      if (!next.ok) {
        setResult(next);
        return;
      }
      if (next.persisted !== true || !next.data || next.data.requesterUid !== session.uid || next.data.status !== 'Pending') {
        setResult({
          ...next,
          ok: false,
          persisted: 'unconfirmed',
          reason: 'error',
          message: 'We could not confirm that your meeting request was saved. Check My requests before trying again.',
        });
        await requestsQuery.reload();
        return;
      }

      setResult(next);
      const confirmedRequest = next.data;
      setConfirmedRequestsBySession((current) => {
        const previous = current.sessionUid === session.uid ? current.items : [];
        return {
          sessionUid: session.uid,
          items: [confirmedRequest, ...previous.filter((request) => request.id !== confirmedRequest.id)],
        };
      });
      setRequestOpen(false);
      setRequestDirty(false);
      setDocumentError('');
      setForm(requestInputFromOption(preferredOption));
      await requestsQuery.reload();
    } catch (error) {
      setResult({
        ok: false,
        persisted: false,
        source: client.mode,
        reason: 'error',
        message: safeErrorMessage(error, 'We could not send your meeting request. It was not confirmed. Please try again; if the problem continues, contact support.'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkflowPageFrame
      eyebrow="Meetings"
      title={hasOfficerReview ? 'Review meeting requests or switch to your own requests.' : 'Request meetings from posted availability.'}
      description="Pending requests are not confirmed bookings. Use tabs to separate posted availability, personal statuses, and officer decisions."
      session={session}
    >
      <SourceNotice client={client} message={optionsQuery.sourceMessage || requestsQuery.sourceMessage} />
      {!requestOpen ? <ResultMessage result={result} /> : null}
      {optionsQuery.loading || requestsQuery.loading ? <LoadingBlock label="Loading meeting data" /> : null}
      {optionsQuery.error ? <ErrorState onRetry={optionsQuery.reload}>{optionsQuery.error}</ErrorState> : null}
      {requestsQuery.error ? <ErrorState onRetry={requestsQuery.reload}>{requestsQuery.error}</ErrorState> : null}

      <SubtabNav label="Meeting tasks" baseId="meetings" items={tabItems} activeId={activeId} getTabTo={getTabTo} />

      <ModalDialog open={requestOpen} title="Request a meeting/interview" dirty={requestDirty} onClose={closeRequestDialog}>
        {requestOpen ? (
          <form className="grid gap-4 grid gap-3.5" onSubmit={submit}>
            <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">Public dated events are informational; only meeting/interview availability can be requested.</p>
            {options.length ? (
              <>
                <div className="grid min-w-0 gap-1.5">
                  <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="meeting-option">Posted availability</label>
                  <select
                    data-autofocus
                    id="meeting-option"
                    className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]"
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
                {selectedOption ? <p className="text-xs text-[var(--muted-foreground)]">{selectedOption.details}</p> : null}
                <div className="grid md:grid-cols-2">
                  <div className="grid min-w-0 gap-1.5">
                    <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="meeting-date">Requested date</label>
                    <input id="meeting-date" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" type="date" value={form.requestedDate} onChange={(event) => patchForm({ requestedDate: event.target.value })} />
                  </div>
                  <div className="grid min-w-0 gap-1.5">
                    <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="meeting-time">Requested time</label>
                    <input id="meeting-time" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" type="time" value={form.requestedTime} onChange={(event) => patchForm({ requestedTime: event.target.value })} />
                  </div>
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="meeting-note">Short note <span>Optional</span></label>
                  <textarea id="meeting-note" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)] min-h-[120px] resize-y" value={form.note} onChange={(event) => patchForm({ note: event.target.value })} placeholder="What do you want to discuss?" />
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="meeting-document">Formal request document <span>Optional</span></label>
                  <input
                    id="meeting-document"
                    className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]"
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setDocumentError('');
                      patchForm({ document: undefined });
                      if (!file) return;
                      try {
                        validateMeetingDocumentFile(file);
                        patchForm({ document: { file, fileName: file.name, contentType: 'application/pdf', sizeBytes: file.size } });
                      } catch (error) {
                        setDocumentError(error instanceof Error ? error.message : 'Attach a valid PDF document.');
                      }
                    }}
                  />
                  {documentError ? <span className="text-xs text-[var(--muted-foreground)] border-[var(--color-orange-deep)] text-[var(--color-orange-deep)]" role="alert">{documentError}</span> : <span className="text-xs text-[var(--muted-foreground)]">PDF only, up to {formatBytes(MEETING_DOCUMENT_MAX_BYTES)}. Private access is limited to you and approved officers for this organization.</span>}
                  {form.document ? <span className="text-xs text-[var(--muted-foreground)]">Selected {form.document.fileName} · {formatBytes(form.document.sizeBytes)}</span> : null}
                </div>
                <Button type="submit" variant="primary" disabled={busy || Boolean(documentError)}>{busy ? 'Sending…' : 'Send request as Pending'}</Button>
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
          <OfficerMeetingReview session={session} client={client} confirmedRequests={confirmedRequests} onRequestsChanged={requestsQuery.reload} />
        </SubtabPanel>
      ) : null}

      <SubtabPanel baseId="meetings" tabId="availability" activeId={activeId}>
        <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)]">
          <TabSectionHeader
            title="Available meeting/interview dates"
            description="Choose a posted availability window, then send a request."
            action={options.length ? <Button type="button" onClick={openRequestDialog}>Request meeting</Button> : undefined}
          />
          {options.length ? (
            <ul className="m-0 grid list-none gap-1 p-0 [&_li]:flex [&_li]:min-w-0 [&_li]:items-center [&_li]:gap-2.5 [&_li]:border-b [&_li]:border-[var(--color-border)] [&_li]:py-3 max-[820px]:[&_li]:items-start gap-0">
              {options.map((entry) => (
                <li key={entry.id}>
                  <div className="min-w-0 flex-1 [&_strong]:block [&_strong]:text-[var(--color-navy)] [&_span]:mt-0.5 [&_span]:block [&_span]:[overflow-wrap:anywhere] [&_span]:text-[0.88rem] [&_span]:text-[var(--muted-foreground)]">
                    <strong><Link className="text-[var(--color-navy)] underline decoration-transparent underline-offset-4 hover:text-[var(--color-blue-deep)] hover:decoration-current focus-visible:text-[var(--color-blue-deep)] focus-visible:decoration-current" to={`/app/organizations/${entry.organizationId}`}>{entry.organizationName}</Link> · {entry.title}</strong>
                    <span>{formatDateEntry(entry)} · {entry.details}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">No availability records are loaded.</p>}
        </section>
      </SubtabPanel>

      <SubtabPanel baseId="meetings" tabId="mine" activeId={activeId}>
        {requests.length ? (
          <WorkflowTable
            caption="My meeting request statuses"
            headers={['Organization', 'Meeting title', 'Requested date/time', 'Status', 'Document', 'Meaning']}
            rows={requests.map((request) => (
              <tr key={request.id}>
                <td><Link className="text-[var(--color-navy)] underline decoration-transparent underline-offset-4 hover:text-[var(--color-blue-deep)] hover:decoration-current focus-visible:text-[var(--color-blue-deep)] focus-visible:decoration-current" to={`/app/organizations/${request.organizationId}`}>{request.organizationName}</Link></td>
                <td>{request.meetingTitle}</td>
                <td>{request.requestedDate}, {request.requestedTime}</td>
                <td><MeetingStatusChip status={request.status} /></td>
                <td><MeetingDocumentButton request={request} /></td>
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
