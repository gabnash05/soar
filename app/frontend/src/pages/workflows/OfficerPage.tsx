import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Card, CardHeader, LoadingBlock, StateBlock } from '../../components/ui';
import type { ApplicationStage, UserSession } from '../../lib/contracts';
import { createEmptyOfficerDateEntry } from './adapters';
import type { AnnouncementInput, DateEntryInput, OfficerDashboard, OrganizationProfileInput, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import {
  ErrorState,
  MeetingStatusChip,
  ResultMessage,
  RouteUnavailableState,
  SourceNotice,
  StageChip,
  useWorkflowQuery,
  useWorkflowSession,
  WorkflowPageFrame,
  WorkflowTable,
} from './pageParts';
import { APPLICATION_STAGES, formatDateEntry, getApprovedOfficerGrants } from './workflowUtils';

function toProfileInput(dashboard: OfficerDashboard): OrganizationProfileInput {
  return {
    organizationId: dashboard.organization.id,
    name: dashboard.organization.name,
    logoUrl: dashboard.organization.logoUrl,
    description: dashboard.organization.description,
    shortDescription: dashboard.organization.shortDescription,
    contactEmail: dashboard.organization.contactEmail,
    recruitmentTitle: dashboard.organization.recruitment.title,
    recruitmentRequirements: dashboard.organization.recruitment.requirements,
    recruitmentInstructions: dashboard.organization.recruitment.instructions,
    externalFormUrl: dashboard.organization.recruitment.externalFormUrl,
  };
}

function ProfileRecruitmentSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [form, setForm] = useState<OrganizationProfileInput>(() => toProfileInput(dashboard));
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(toProfileInput(dashboard)), [dashboard]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.saveOrganizationProfile(form, session);
    setResult(next);
    setBusy(false);
    if (next.ok) onChanged();
  };

  return (
    <Card>
      <CardHeader title="Profile + recruitment settings" eyebrow="Approved organization only">
        Officers can manage public organization content only for organizations where they have approved grants.
      </CardHeader>
      <form className="content-stack" onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="org-name">Organization name</label><input id="org-name" className="control" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="field"><label className="label-row" htmlFor="org-contact">Contact email</label><input id="org-contact" className="control" type="email" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} /></div>
        </div>
        <div className="field"><label className="label-row" htmlFor="org-short">Short description</label><input id="org-short" className="control" value={form.shortDescription} onChange={(event) => setForm((current) => ({ ...current, shortDescription: event.target.value }))} /></div>
        <div className="field"><label className="label-row" htmlFor="org-description">Profile description</label><textarea id="org-description" className="control textarea" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="logo-url">Logo URL <span>Temporary fixture</span></label><input id="logo-url" className="control" value={form.logoUrl ?? ''} onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))} placeholder="Storage-backed upload will replace this." /></div>
          <div className="field"><label className="label-row" htmlFor="external-form">External form URL</label><input id="external-form" className="control" type="url" value={form.externalFormUrl ?? ''} onChange={(event) => setForm((current) => ({ ...current, externalFormUrl: event.target.value }))} /></div>
        </div>
        <div className="field"><label className="label-row" htmlFor="recruitment-title">Recruitment title</label><input id="recruitment-title" className="control" value={form.recruitmentTitle} onChange={(event) => setForm((current) => ({ ...current, recruitmentTitle: event.target.value }))} /></div>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="recruitment-requirements">Requirements</label><textarea id="recruitment-requirements" className="control textarea" value={form.recruitmentRequirements} onChange={(event) => setForm((current) => ({ ...current, recruitmentRequirements: event.target.value }))} /></div>
          <div className="field"><label className="label-row" htmlFor="recruitment-instructions">Instructions</label><textarea id="recruitment-instructions" className="control textarea" value={form.recruitmentInstructions} onChange={(event) => setForm((current) => ({ ...current, recruitmentInstructions: event.target.value }))} /></div>
        </div>
        <Button type="submit" disabled={busy}>Save profile and recruitment</Button>
        <ResultMessage result={result} />
      </form>
    </Card>
  );
}

function AnnouncementSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [body, setBody] = useState('');
  const [image, setImage] = useState<AnnouncementInput['image']>();
  const [imageError, setImageError] = useState('');
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.publishAnnouncement({ organizationId: dashboard.organization.id, body, image }, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setBody('');
      setImage(undefined);
      onChanged();
    }
  };

  return (
    <Card>
      <CardHeader title="Announcement controls" eyebrow="Text with optional image">
        Empty posts and invalid image files should show clear validation messages.
      </CardHeader>
      <form className="content-stack" onSubmit={submit}>
        <div className="field"><label className="label-row" htmlFor="announcement-body">Post text</label><textarea id="announcement-body" className="control textarea" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write an announcement for students and sponsors." /></div>
        <div className="field">
          <label className="label-row" htmlFor="announcement-image">Optional image <span>Preview only</span></label>
          <input
            id="announcement-image"
            className="control"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setImageError('');
              setImage(undefined);
              if (!file) return;
              if (!file.type.startsWith('image/')) {
                setImageError('Use a PNG, JPEG, GIF, or WebP image.');
                return;
              }
              if (file.size > 2 * 1024 * 1024) {
                setImageError('Use an image smaller than 2 MB for this preview.');
                return;
              }
              setImage({ url: URL.createObjectURL(file), alt: file.name });
            }}
          />
          {imageError ? <span className="help error" role="alert">{imageError}</span> : <span className="help">Production must upload to project file storage before persistence.</span>}
        </div>
        {image ? <figure className="image-frame"><img src={image.url} alt={image.alt} /></figure> : null}
        <Button type="submit" disabled={busy}>Publish announcement</Button>
        <ResultMessage result={result} />
      </form>
      {dashboard.announcements.length ? (
        <ul className="feed-list">
          {dashboard.announcements.map((announcement) => (
            <li key={announcement.id}>
              <div className="feed-copy"><strong>{announcement.body}</strong><span>{new Date(announcement.createdAt).toLocaleDateString()}</span></div>
              <Button type="button" variant="danger" onClick={async () => {
                if (!window.confirm('Delete this announcement?')) return;
                const next = await client.deleteAnnouncement(announcement.id, dashboard.organization.id, session);
                setResult(next);
                if (next.ok) onChanged();
              }}>Delete</Button>
            </li>
          ))}
        </ul>
      ) : <p className="card-note">No announcements yet.</p>}
    </Card>
  );
}

function ApplicantsSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  return (
    <Card>
      <CardHeader title="Applicants" eyebrow="External forms checked outside SOAR">
        Officers update only the tracker stage after checking existing external form or sheet responses.
      </CardHeader>
      {dashboard.applicants.length ? (
        <WorkflowTable
          caption="Applicants for this organization"
          headers={['Applicant', 'Opportunity', 'Stage', 'Change stage']}
          rows={dashboard.applicants.map((application) => (
            <tr key={application.id}>
              <td>{application.studentName}</td>
              <td>{application.opportunityTitle}</td>
              <td><StageChip stage={application.stage} /></td>
              <td>
                <select
                  className="control"
                  aria-label={`Stage for ${application.studentName}`}
                  value={application.stage}
                  onChange={async (event) => {
                    const next = await client.updateApplicationStage(application.id, event.target.value as ApplicationStage, dashboard.organization.id, session);
                    setResult(next);
                    if (next.ok) onChanged();
                  }}
                >
                  {APPLICATION_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </td>
            </tr>
          ))}
        />
      ) : <p className="card-note">No applicants are waiting for this organization's opportunity.</p>}
      <ResultMessage result={result} />
    </Card>
  );
}

function DateEntriesSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [form, setForm] = useState<DateEntryInput>(() => createEmptyOfficerDateEntry(dashboard.organization.id));
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(createEmptyOfficerDateEntry(dashboard.organization.id)), [dashboard.organization.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.saveDateEntry(form, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setForm(createEmptyOfficerDateEntry(dashboard.organization.id));
      onChanged();
    }
  };

  return (
    <Card>
      <CardHeader title="Dated entries" eyebrow="Events vs availability">
        This is a simple dated list, not a monthly calendar. Public events are informational; availability can be requested.
      </CardHeader>
      <form className="content-stack" onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="entry-kind">Entry type</label><select id="entry-kind" className="control" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as DateEntryInput['kind'] }))}><option value="event">Public event</option><option value="availability">Meeting/interview availability</option></select></div>
          <div className="field"><label className="label-row" htmlFor="entry-title">Title</label><input id="entry-title" className="control" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
        </div>
        <div className="grid grid-3">
          <div className="field"><label className="label-row" htmlFor="entry-date">Date</label><input id="entry-date" className="control" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div>
          <div className="field"><label className="label-row" htmlFor="entry-start">Start time <span>Optional</span></label><input id="entry-start" className="control" type="time" value={form.startTime ?? ''} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} /></div>
          <div className="field"><label className="label-row" htmlFor="entry-end">End time <span>Optional</span></label><input id="entry-end" className="control" type="time" value={form.endTime ?? ''} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} /></div>
        </div>
        <div className="field"><label className="label-row" htmlFor="entry-details">Short details</label><textarea id="entry-details" className="control textarea" value={form.details} onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))} /></div>
        <Button type="submit" disabled={busy}>Add or save entry</Button>
        <ResultMessage result={result} />
      </form>
      {dashboard.dateEntries.length ? (
        <ul className="feed-list">
          {dashboard.dateEntries.map((entry) => (
            <li key={entry.id}>
              <div className="feed-copy"><strong>{entry.title}</strong><span>{entry.kind === 'event' ? 'Dated event' : 'Meeting/interview availability'} · {formatDateEntry(entry)} · {entry.details}</span></div>
              <div className="component-row">
                <Button type="button" variant="secondary" onClick={() => setForm({ id: entry.id, organizationId: entry.organizationId, kind: entry.kind, title: entry.title, date: entry.date, startTime: entry.startTime, endTime: entry.endTime, details: entry.details })}>Edit</Button>
                <Button type="button" variant="danger" onClick={async () => {
                  if (!window.confirm('Remove this dated entry?')) return;
                  const next = await client.deleteDateEntry(entry.id, dashboard.organization.id, session);
                  setResult(next);
                  if (next.ok) onChanged();
                }}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="card-note">No dated entries yet.</p>}
    </Card>
  );
}

function MeetingDecisionsSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  return (
    <Card>
      <CardHeader title="Meeting requests" eyebrow="Approve or decline">
        Pending requests are not bookings. Officers decide only for their approved organization.
      </CardHeader>
      {dashboard.meetingRequests.length ? (
        <WorkflowTable
          caption="Meeting requests for this organization"
          headers={['Requester', 'Meeting title', 'Requested date/time', 'Status', 'Decision']}
          rows={dashboard.meetingRequests.map((request) => (
            <tr key={request.id}>
              <td>{request.requesterName}</td>
              <td>{request.meetingTitle}</td>
              <td>{request.requestedDate}, {request.requestedTime}</td>
              <td><MeetingStatusChip status={request.status} /></td>
              <td>
                <div className="component-row">
                  <Button type="button" variant="secondary" disabled={request.status === 'Approved'} onClick={async () => {
                    const next = await client.decideMeetingRequest(request.id, 'Approved', dashboard.organization.id, session);
                    setResult(next);
                    if (next.ok) onChanged();
                  }}>Approve</Button>
                  <Button type="button" variant="danger" disabled={request.status === 'Declined'} onClick={async () => {
                    const next = await client.decideMeetingRequest(request.id, 'Declined', dashboard.organization.id, session);
                    setResult(next);
                    if (next.ok) onChanged();
                  }}>Decline</Button>
                </div>
              </td>
            </tr>
          ))}
        />
      ) : <p className="card-note">No meeting requests for this organization.</p>}
      <ResultMessage result={result} />
    </Card>
  );
}

export function OfficerView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const grants = getApprovedOfficerGrants(session);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(grants[0]?.organizationId ?? '');

  useEffect(() => {
    if (!selectedOrganizationId && grants[0]) setSelectedOrganizationId(grants[0].organizationId);
  }, [grants, selectedOrganizationId]);

  const dashboardQuery = useWorkflowQuery(
    () => selectedOrganizationId ? client.getOfficerDashboard(selectedOrganizationId, session) : Promise.resolve({ data: undefined, source: client.mode, message: 'No approved officer organization selected.' }),
    [client, selectedOrganizationId, session.uid],
  );
  const dashboard = dashboardQuery.data;

  if (!grants.length) {
    return (
      <WorkflowPageFrame
        eyebrow="Officer dashboard"
        title="Officer tools require an approved organization grant."
        description="Officers are regular student accounts with organization-specific grants. There is no separate officer signup or broad admin UI."
        session={session}
      >
        <StateBlock title="Officer controls locked" symbol="🔒">
          This student account has no approved organization grant. The project administrator assigns initial owners; owners approve additional officers outside this workflow page.
        </StateBlock>
      </WorkflowPageFrame>
    );
  }

  return (
    <WorkflowPageFrame
      eyebrow="Officer dashboard"
      title="Manage only approved organizations."
      description="Approved officers remain students and can manage profile, recruitment, announcements, applicants, dated entries, and meeting decisions for their own organizations only."
      session={session}
    >
      <SourceNotice client={client} message={dashboardQuery.sourceMessage} />
      <Card>
        <CardHeader title="Approved organization grant" />
        <div className="field">
          <label className="label-row" htmlFor="officer-organization">Organization</label>
          <select id="officer-organization" className="control" value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
            {grants.map((grant) => <option key={grant.organizationId} value={grant.organizationId}>{grant.organizationName}</option>)}
          </select>
        </div>
      </Card>
      {dashboardQuery.loading ? <LoadingBlock label="Loading officer dashboard" /> : null}
      {dashboardQuery.error ? <ErrorState onRetry={dashboardQuery.reload}>{dashboardQuery.error}</ErrorState> : null}
      {!dashboardQuery.loading && !dashboardQuery.error && !dashboard ? (
        <StateBlock title="Organization workflow data unavailable" symbol="!">
          The approved grant exists, but the workflow service has not returned a matching organization dashboard.
        </StateBlock>
      ) : null}
      {dashboard ? (
        <section className="content-stack">
          <ProfileRecruitmentSection dashboard={dashboard} session={session} client={client} onChanged={dashboardQuery.reload} />
          <AnnouncementSection dashboard={dashboard} session={session} client={client} onChanged={dashboardQuery.reload} />
          <ApplicantsSection dashboard={dashboard} session={session} client={client} onChanged={dashboardQuery.reload} />
          <DateEntriesSection dashboard={dashboard} session={session} client={client} onChanged={dashboardQuery.reload} />
          <MeetingDecisionsSection dashboard={dashboard} session={session} client={client} onChanged={dashboardQuery.reload} />
          <Card>
            <CardHeader title="Access boundary" />
            <p>No general admin dashboard, owner creation request queue, membership management system, monthly calendar, chat, counters, or sponsor-only tooling is included here.</p>
          </Card>
        </section>
      ) : null}
    </WorkflowPageFrame>
  );
}

export default function OfficerPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <OfficerView session={session} client={client} />;
}
