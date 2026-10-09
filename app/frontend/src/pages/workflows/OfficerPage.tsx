import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button, ButtonLink, Card, CardHeader, LoadingBlock, StateBlock } from '../../components/ui';
import type { ApplicationStage, UserSession } from '../../lib/contracts';
import { createEmptyOfficerDateEntry } from './adapters';
import type { AnnouncementInput, DateEntryInput, OfficerDashboard, OrganizationProfileInput, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import {
  ErrorState,
  MeetingStatusChip,
  OrganizationAvatar,
  ResultMessage,
  RouteUnavailableState,
  SourceNotice,
  StageChip,
  useWorkflowQuery,
  useWorkflowSession,
  WorkflowPageFrame,
  WorkflowTable,
} from './pageParts';
import { APPLICATION_STAGES, formatDateEntry, getApprovedOfficerGrants, isApprovedOfficerFor } from './workflowUtils';

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

export function ProfileRecruitmentSection({ dashboard, session, client, onChanged, formId = `profile-recruitment-form-${dashboard.organization.id}` }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void; formId?: string }) {
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
      <CardHeader title="Organization profile" eyebrow="Public details">
        Update the profile, recruitment copy, contact email, and logo shown to students and sponsors.
      </CardHeader>
      <form id={formId} className="content-stack" onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="org-name">Organization name</label><input id="org-name" className="control" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="field"><label className="label-row" htmlFor="org-contact">Contact email</label><input id="org-contact" className="control" type="email" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} /></div>
        </div>
        <div className="field"><label className="label-row" htmlFor="org-short">Short description</label><input id="org-short" className="control" value={form.shortDescription} onChange={(event) => setForm((current) => ({ ...current, shortDescription: event.target.value }))} /></div>
        <div className="field"><label className="label-row" htmlFor="org-description">Profile description</label><textarea id="org-description" className="control textarea" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="logo-url">Logo or profile image URL <span>Optional</span></label><input id="logo-url" className="control" value={form.logoUrl ?? ''} onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))} placeholder="https://…" /></div>
          <div className="field"><label className="label-row" htmlFor="external-form">External form URL <span>Optional</span></label><input id="external-form" className="control" type="url" value={form.externalFormUrl ?? ''} onChange={(event) => setForm((current) => ({ ...current, externalFormUrl: event.target.value }))} /></div>
        </div>
        <div className="field"><label className="label-row" htmlFor="recruitment-title">Recruitment title</label><input id="recruitment-title" className="control" value={form.recruitmentTitle} onChange={(event) => setForm((current) => ({ ...current, recruitmentTitle: event.target.value }))} /></div>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="recruitment-requirements">Requirements</label><textarea id="recruitment-requirements" className="control textarea" value={form.recruitmentRequirements} onChange={(event) => setForm((current) => ({ ...current, recruitmentRequirements: event.target.value }))} /></div>
          <div className="field"><label className="label-row" htmlFor="recruitment-instructions">Instructions</label><textarea id="recruitment-instructions" className="control textarea" value={form.recruitmentInstructions} onChange={(event) => setForm((current) => ({ ...current, recruitmentInstructions: event.target.value }))} /></div>
        </div>
        <div className="button-row"><Button type="submit" disabled={busy}>Save profile and recruitment</Button></div>
        <ResultMessage result={result} />
      </form>
    </Card>
  );
}

export function AnnouncementComposer({
  organizationId,
  organizationName,
  session,
  client,
  onChanged,
  context,
  title = 'Create announcement',
}: {
  organizationId: string;
  organizationName?: string;
  session: UserSession;
  client: WorkflowDataClient;
  onChanged: () => void;
  context?: ReactNode;
  title?: string;
}) {
  const [body, setBody] = useState('');
  const [image, setImage] = useState<AnnouncementInput['image']>();
  const [imageError, setImageError] = useState('');
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.publishAnnouncement({ organizationId, body, image }, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setBody('');
      setImage(undefined);
      onChanged();
    }
  };

  return (
    <Card id="announcement-composer">
      <CardHeader title={title} eyebrow="Organization content">
        Publish updates for {organizationName ?? 'your organization'} that appear on the announcements feed and the organization profile.
      </CardHeader>
      {context}
      <form className="content-stack" onSubmit={submit}>
        <div className="field"><label className="label-row" htmlFor="announcement-body">Post text</label><textarea id="announcement-body" className="control textarea" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write an announcement for students and sponsors." /></div>
        <div className="field">
          <label className="label-row" htmlFor="announcement-image">Optional image</label>
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
                setImageError('Use an image smaller than 2 MB.');
                return;
              }
              setImage({ url: URL.createObjectURL(file), alt: file.name });
            }}
          />
          {imageError ? <span className="help error" role="alert">{imageError}</span> : <span className="help">PNG, JPEG, GIF, or WebP. Maximum 2 MB.</span>}
        </div>
        {image ? <figure className="image-frame"><img src={image.url} alt={image.alt} /></figure> : null}
        <div className="button-row"><Button type="submit" disabled={busy}>Publish announcement</Button></div>
        <ResultMessage result={result} />
      </form>
    </Card>
  );
}

export function AnnouncementSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);

  return (
    <section className="content-stack">
      <AnnouncementComposer organizationId={dashboard.organization.id} organizationName={dashboard.organization.name} session={session} client={client} onChanged={onChanged} />
      <Card>
        <CardHeader title="Published announcements" />
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
        <ResultMessage result={result} />
      </Card>
    </section>
  );
}

export function ApplicantsSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  return (
    <Card>
      <CardHeader title="Applications to review" eyebrow="Recruitment">
        Update a student's tracker after reviewing the external application materials your organization uses.
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
      ) : <p className="card-note">No applicants are waiting for this organization.</p>}
      <ResultMessage result={result} />
    </Card>
  );
}

export function DateEntriesSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
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
      <CardHeader title="Events and availability" eyebrow="Dated entries">
        Post public events or meeting/interview availability for this organization.
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
        <div className="button-row"><Button type="submit" disabled={busy}>Add or save entry</Button></div>
        <ResultMessage result={result} />
      </form>
      {dashboard.dateEntries.length ? (
        <ul className="feed-list">
          {dashboard.dateEntries.map((entry) => (
            <li key={entry.id}>
              <div className="feed-copy"><strong>{entry.title}</strong><span>{entry.kind === 'event' ? 'Public event' : 'Meeting/interview availability'} · {formatDateEntry(entry)} · {entry.details}</span></div>
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

export function MeetingDecisionsSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  return (
    <Card>
      <CardHeader title="Meeting requests to review" eyebrow="Organization decisions">
        Approve or decline requests for this organization.
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

export function OfficerOrganizationPicker({ selectedOrganizationId, onChange, session }: { selectedOrganizationId: string; onChange: (value: string) => void; session: UserSession }) {
  const grants = getApprovedOfficerGrants(session);
  if (grants.length <= 1) return null;
  return (
    <Card>
      <CardHeader title="Managed organization" />
      <div className="field">
        <label className="label-row" htmlFor="managed-organization">Organization</label>
        <select id="managed-organization" className="control" value={selectedOrganizationId} onChange={(event) => onChange(event.target.value)}>
          {grants.map((grant) => <option key={grant.organizationId} value={grant.organizationId}>{grant.organizationName}</option>)}
        </select>
      </div>
    </Card>
  );
}

export function OfficerDashboardBlock({ organizationId, session, client, children }: { organizationId: string; session: UserSession; client: WorkflowDataClient; children: (dashboard: OfficerDashboard, reload: () => Promise<void>) => ReactNode }) {
  const dashboardQuery = useWorkflowQuery(
    () => organizationId ? client.getOfficerDashboard(organizationId, session) : Promise.resolve({ data: undefined, source: client.mode, message: 'Choose an organization.' }),
    [client, organizationId, session.uid],
  );
  const dashboard = dashboardQuery.data;

  return (
    <>
      {dashboardQuery.loading ? <LoadingBlock label="Loading organization management" /> : null}
      {dashboardQuery.error ? <ErrorState onRetry={dashboardQuery.reload}>{dashboardQuery.error}</ErrorState> : null}
      {!dashboardQuery.loading && !dashboardQuery.error && !dashboard ? (
        <StateBlock title="Organization data unavailable" symbol="!">
          We could not load management data for this organization.
        </StateBlock>
      ) : null}
      {dashboard ? children(dashboard, dashboardQuery.reload) : null}
    </>
  );
}

export function OfficerOrganizationManagement({ organizationId, session, client }: { organizationId: string; session: UserSession; client: WorkflowDataClient }) {
  if (!isApprovedOfficerFor(session, organizationId)) return null;

  return (
    <Card className="notice-card">
      <CardHeader title="Organization management" eyebrow="Your access">
        Edit profile details, announcements, and dated entries from the dedicated Manage Organization sidebar tab.
      </CardHeader>
      <div className="button-row">
        <ButtonLink to={`/settings/organization?organizationId=${encodeURIComponent(organizationId)}`} variant="primary">Manage organization</ButtonLink>
      </div>
    </Card>
  );
}

export function OfficerApplicationsReview({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const grants = getApprovedOfficerGrants(session);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(grants[0]?.organizationId ?? '');

  useEffect(() => {
    if (!selectedOrganizationId && grants[0]) setSelectedOrganizationId(grants[0].organizationId);
  }, [grants, selectedOrganizationId]);

  if (!grants.length) return null;

  return (
    <section className="content-stack" aria-label="Applications to review">
      <Card>
        <CardHeader title="Review applications" eyebrow="Officer access">
          Application review appears here for organizations you manage.
        </CardHeader>
      </Card>
      <OfficerOrganizationPicker selectedOrganizationId={selectedOrganizationId} onChange={setSelectedOrganizationId} session={session} />
      <OfficerDashboardBlock organizationId={selectedOrganizationId} session={session} client={client}>
        {(dashboard, reload) => <ApplicantsSection dashboard={dashboard} session={session} client={client} onChanged={reload} />}
      </OfficerDashboardBlock>
    </section>
  );
}

export function OfficerMeetingReview({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const grants = getApprovedOfficerGrants(session);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(grants[0]?.organizationId ?? '');

  useEffect(() => {
    if (!selectedOrganizationId && grants[0]) setSelectedOrganizationId(grants[0].organizationId);
  }, [grants, selectedOrganizationId]);

  if (!grants.length) return null;

  return (
    <section className="content-stack" aria-label="Meeting requests to review">
      <Card>
        <CardHeader title="Review meeting requests" eyebrow="Officer access">
          Meeting decisions appear here for organizations you manage.
        </CardHeader>
      </Card>
      <OfficerOrganizationPicker selectedOrganizationId={selectedOrganizationId} onChange={setSelectedOrganizationId} session={session} />
      <OfficerDashboardBlock organizationId={selectedOrganizationId} session={session} client={client}>
        {(dashboard, reload) => <MeetingDecisionsSection dashboard={dashboard} session={session} client={client} onChanged={reload} />}
      </OfficerDashboardBlock>
    </section>
  );
}

export function OfficerView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const grants = getApprovedOfficerGrants(session);

  if (!grants.length) {
    return (
      <WorkflowPageFrame
        eyebrow="Organization management"
        title="No management access yet."
        description="Controls appear on organization, application, and meeting pages when your account has access for that organization."
        session={session}
      >
        <StateBlock title="No organization access" symbol="0">
          Your account does not currently manage an organization.
        </StateBlock>
      </WorkflowPageFrame>
    );
  }

  return (
    <WorkflowPageFrame
      eyebrow="Organization management"
      title="Manage work where it happens."
      description="Use organization profiles for content, applications for applicant review, and meetings for request decisions."
      session={session}
    >
      <SourceNotice client={client} />
      <section className="grid grid-3" aria-label="Management shortcuts">
        {grants.map((grant) => (
          <Card key={grant.organizationId} className="org-card">
            <div className="org-head">
              <OrganizationAvatar name={grant.organizationName} />
              <div>
                <h2>{grant.organizationName}</h2>
                <p className="card-note">Management access</p>
              </div>
            </div>
            <div className="button-row">
              <ButtonLink to={`/app/organizations/${grant.organizationId}`} variant="secondary">Profile content</ButtonLink>
              <ButtonLink to="/app/applications" variant="secondary">Applications</ButtonLink>
              <ButtonLink to="/app/meetings" variant="secondary">Meetings</ButtonLink>
            </div>
          </Card>
        ))}
      </section>
    </WorkflowPageFrame>
  );
}

export default function OfficerPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <OfficerView session={session} client={client} />;
}
