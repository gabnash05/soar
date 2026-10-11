import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button, ButtonLink, LoadingBlock, ModalDialog, RoleBadge, StateBlock } from '../../components/ui';
import type { ApplicationStage, UserSession } from '../../lib/contracts';
import { ANNOUNCEMENT_MEDIA_MAX_AGGREGATE_BYTES, ANNOUNCEMENT_MEDIA_MAX_ITEMS, WORKFLOW_VIDEO_MAX_BYTES, formatBytes, openPrivateMeetingDocument, validateAnnouncementMediaFiles, validateWorkflowImageFile } from '../../lib/storageUploads';
import { createEmptyOfficerDateEntry } from './adapters';
import type { AnnouncementInput, DateEntry, DateEntryInput, OfficerDashboard, OrganizationProfileInput, WorkflowDataClient, WorkflowMutationResult } from './contracts';
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
    logoPath: dashboard.organization.logoPath,
    description: dashboard.organization.description,
    shortDescription: dashboard.organization.shortDescription,
    contactEmail: dashboard.organization.contactEmail,
    contactPhone: dashboard.organization.contactPhone,
    recruitmentTitle: dashboard.organization.recruitment.title,
    recruitmentRequirements: dashboard.organization.recruitment.requirements,
    recruitmentInstructions: dashboard.organization.recruitment.instructions,
    externalFormUrl: dashboard.organization.recruitment.externalFormUrl,
  };
}

function profileInputDirty(form: OrganizationProfileInput, dashboard: OfficerDashboard): boolean {
  const original = toProfileInput(dashboard);
  return Boolean(
    form.logoFile ||
    form.name !== original.name ||
    form.logoUrl !== original.logoUrl ||
    form.description !== original.description ||
    form.shortDescription !== original.shortDescription ||
    form.contactEmail !== original.contactEmail ||
    (form.contactPhone ?? '') !== (original.contactPhone ?? '') ||
    form.recruitmentTitle !== original.recruitmentTitle ||
    form.recruitmentRequirements !== original.recruitmentRequirements ||
    form.recruitmentInstructions !== original.recruitmentInstructions ||
    (form.externalFormUrl ?? '') !== (original.externalFormUrl ?? ''),
  );
}

export function ProfileRecruitmentSection({ dashboard, session, client, onChanged, formId = `profile-recruitment-form-${dashboard.organization.id}`, onDirtyChange }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void; formId?: string; onDirtyChange?: (dirty: boolean) => void }) {
  const [form, setForm] = useState<OrganizationProfileInput>(() => toProfileInput(dashboard));
  const [logoError, setLogoError] = useState('');
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = profileInputDirty(form, dashboard);

  useEffect(() => {
    setForm(toProfileInput(dashboard));
    setLogoError('');
    onDirtyChange?.(false);
  }, [dashboard, onDirtyChange]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.saveOrganizationProfile(form, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      onDirtyChange?.(false);
      onChanged();
    }
  };

  return (
    <section className="surface-section profile-form-section">
      <header className="section-heading inline-heading">
        <div>
          <h2>Organization profile and recruitment</h2>
          <p>Update the public profile, recruitment copy, contact email, and logo shown to students and sponsors.</p>
        </div>
        <Button type="submit" form={formId} disabled={busy}>Save profile</Button>
      </header>
      <form id={formId} className="content-stack" onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="org-name">Organization name</label><input id="org-name" className="control" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="field"><label className="label-row" htmlFor="org-contact">Contact email</label><input id="org-contact" className="control" type="email" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} /></div>
        </div>
        <div className="field"><label className="label-row" htmlFor="org-phone">Contact phone <span>Optional</span></label><input id="org-phone" className="control" type="tel" inputMode="tel" autoComplete="tel" value={form.contactPhone ?? ''} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder="+63 912 345 6789" maxLength={32} /><span className="help">Shown on the public profile only when provided. Use digits, spaces, dashes, parentheses, or extension text.</span></div>
        <div className="field"><label className="label-row" htmlFor="org-short">Short description</label><input id="org-short" className="control" value={form.shortDescription} onChange={(event) => setForm((current) => ({ ...current, shortDescription: event.target.value }))} /></div>
        <div className="field"><label className="label-row" htmlFor="org-description">Profile description</label><textarea id="org-description" className="control textarea" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
        <div className="grid grid-2">
          <div className="field">
            <label className="label-row" htmlFor="logo-file">Logo image <span>Optional</span></label>
            <input
              id="logo-file"
              className="control"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setLogoError('');
                if (!file) return;
                try {
                  validateWorkflowImageFile(file);
                  setForm((current) => ({ ...current, logoFile: file, logoUrl: URL.createObjectURL(file) }));
                } catch (error) {
                  setLogoError(error instanceof Error ? error.message : 'Choose a valid image.');
                }
              }}
            />
            {logoError ? <span className="help error" role="alert">{logoError}</span> : <span className="help">PNG, JPEG, GIF, or WebP. Maximum 5 MB. Existing logo stays if no file is selected.</span>}
            {form.logoUrl ? <figure className="image-frame logo-preview"><img src={form.logoUrl} alt={`${form.name} logo preview`} /></figure> : null}
          </div>
          <div className="field"><label className="label-row" htmlFor="external-form">External form URL <span>Optional</span></label><input id="external-form" className="control" type="url" value={form.externalFormUrl ?? ''} onChange={(event) => setForm((current) => ({ ...current, externalFormUrl: event.target.value }))} /></div>
        </div>
        <div className="field"><label className="label-row" htmlFor="recruitment-title">Recruitment title</label><input id="recruitment-title" className="control" value={form.recruitmentTitle} onChange={(event) => setForm((current) => ({ ...current, recruitmentTitle: event.target.value }))} /></div>
        <div className="grid grid-2">
          <div className="field"><label className="label-row" htmlFor="recruitment-requirements">Requirements</label><textarea id="recruitment-requirements" className="control textarea" value={form.recruitmentRequirements} onChange={(event) => setForm((current) => ({ ...current, recruitmentRequirements: event.target.value }))} /></div>
          <div className="field"><label className="label-row" htmlFor="recruitment-instructions">Instructions</label><textarea id="recruitment-instructions" className="control textarea" value={form.recruitmentInstructions} onChange={(event) => setForm((current) => ({ ...current, recruitmentInstructions: event.target.value }))} /></div>
        </div>
        <ResultMessage result={result} />
      </form>
    </section>
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
  onDirtyChange,
  onResult,
  onSubmitted,
}: {
  organizationId: string;
  organizationName?: string;
  session: UserSession;
  client: WorkflowDataClient;
  onChanged: () => void;
  context?: ReactNode;
  title?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onResult?: (result: WorkflowMutationResult<unknown>) => void;
  onSubmitted?: () => void;
}) {
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<NonNullable<AnnouncementInput['media']>>([]);
  const [imageError, setImageError] = useState('');
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = Boolean(body.trim() || media.length);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const chooseImages = (files: File[]) => {
    const nextMedia = [...media, ...files.map((file) => ({ url: URL.createObjectURL(file), alt: file.name, file, contentType: file.type, sizeBytes: file.size }))];
    const nextFiles = nextMedia.map((item) => item.file).filter(Boolean) as File[];
    validateAnnouncementMediaFiles(nextFiles);
    setMedia(nextMedia);
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= media.length) return;
    const nextMedia = [...media];
    [nextMedia[index], nextMedia[targetIndex]] = [nextMedia[targetIndex], nextMedia[index]];
    setMedia(nextMedia);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const next = await client.publishAnnouncement({ organizationId, body, media }, session);
      setResult(next);
      onResult?.(next);
      if (next.ok) {
        setBody('');
        setMedia([]);
        onChanged();
        onSubmitted?.();
      }
    } catch (error) {
      const failure: WorkflowMutationResult<unknown> = { ok: false, persisted: false, source: client.mode, reason: 'error', message: error instanceof Error ? error.message : 'Announcement upload failed.' };
      setResult(failure);
      onResult?.(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="announcement-composer" className="dialog-form">
      <header className="section-heading">
        <h2>{title}</h2>
        <p>Publish updates for {organizationName ?? 'your organization'} that appear on the announcements feed and the organization profile.</p>
      </header>
      {context}
      <form className="content-stack" onSubmit={submit}>
        <div className="field"><label className="label-row" htmlFor="announcement-body">Post text</label><textarea data-autofocus id="announcement-body" className="control textarea" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write an announcement for students and sponsors." /></div>
        <div className="field">
          <label className="label-row" htmlFor="announcement-image">Optional media</label>
          <input
            id="announcement-image"
            className="control"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              setImageError('');
              if (!files.length) return;
              try {
                chooseImages(files);
              } catch (error) {
                setImageError(error instanceof Error ? error.message : 'Choose valid images.');
              } finally {
                event.currentTarget.value = '';
              }
            }}
          />
          {imageError ? (
            <span className="help error" role="alert">{imageError}</span>
          ) : (
            <span className="help">Up to {ANNOUNCEMENT_MEDIA_MAX_ITEMS} total images or videos. Images can be PNG, JPEG, GIF, or WebP; one MP4/WebM video may be attached up to {formatBytes(WORKFLOW_VIDEO_MAX_BYTES)}. {formatBytes(ANNOUNCEMENT_MEDIA_MAX_AGGREGATE_BYTES)} combined maximum.</span>
          )}
        </div>
        {media.length ? (
          <ul className="media-preview-list" aria-label="Selected announcement images">
            {media.map((item, index) => (
              <li key={`${item.alt}-${index}`}>
                {item.contentType?.startsWith('video/') ? <video src={item.url} controls preload="metadata" aria-label={item.alt} /> : <img src={item.url} alt={item.alt} />}
                <div>
                  <strong>{item.alt}</strong>
                  <span>{item.sizeBytes ? formatBytes(item.sizeBytes) : 'Ready to upload'}</span>
                  <div className="component-row">
                    <Button type="button" variant="quiet" disabled={index === 0} onClick={() => moveMedia(index, -1)}>Move up</Button>
                    <Button type="button" variant="quiet" disabled={index === media.length - 1} onClick={() => moveMedia(index, 1)}>Move down</Button>
                    <Button type="button" variant="danger" onClick={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="button-row"><Button type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish announcement'}</Button></div>
        <ResultMessage result={result} />
      </form>
    </section>
  );
}

export function AnnouncementSection({ dashboard, session, client, onChanged, allowPosting = true }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void; allowPosting?: boolean }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [composerResult, setComposerResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDirty, setComposerDirty] = useState(false);

  return (
    <section className="surface-section">
      <header className="section-heading inline-heading">
        <div>
          <h2>Published announcements</h2>
          <p>{allowPosting ? 'Create announcements for this organization.' : 'Review this organization\'s announcement history. Publish new posts from the Announcements feed.'}</p>
        </div>
        {allowPosting ? <Button type="button" onClick={() => setComposerOpen(true)}>Post announcement</Button> : null}
      </header>
      {allowPosting ? (
        <>
          <ModalDialog open={composerOpen} title="Post announcement" dirty={composerDirty} onClose={() => setComposerOpen(false)}>
            {composerOpen ? (
              <AnnouncementComposer
                organizationId={dashboard.organization.id}
                organizationName={dashboard.organization.name}
                session={session}
                client={client}
                onChanged={onChanged}
                onDirtyChange={setComposerDirty}
                onResult={setComposerResult}
                onSubmitted={() => setComposerOpen(false)}
              />
            ) : null}
          </ModalDialog>
          <ResultMessage result={composerResult} />
        </>
      ) : null}
      {dashboard.announcements.length ? (
        <ul className="feed-list divided-list">
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
      ) : <p className="section-note">No announcements yet.</p>}
      <ResultMessage result={result} />
    </section>
  );
}

export function ApplicantsSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  return (
    <section className="surface-section">
      <header className="section-heading">
        <h2>Applications to review</h2>
        <p>Update a student's tracker after reviewing the external application materials your organization uses.</p>
      </header>
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
      ) : <p className="section-note">No applicants are waiting for this organization.</p>}
      <ResultMessage result={result} />
    </section>
  );
}

export function DateEntriesSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [form, setForm] = useState<DateEntryInput>(() => createEmptyOfficerDateEntry(dashboard.organization.id));
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(createEmptyOfficerDateEntry(dashboard.organization.id));
    setDialogOpen(false);
    setDirty(false);
  }, [dashboard.organization.id]);

  const patchForm = (patch: Partial<DateEntryInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const openCreate = () => {
    setForm(createEmptyOfficerDateEntry(dashboard.organization.id));
    setResult(null);
    setDirty(false);
    setDialogOpen(true);
  };

  const openEdit = (entry: DateEntry) => {
    setForm({ id: entry.id, organizationId: entry.organizationId, kind: entry.kind, title: entry.title, date: entry.date, startTime: entry.startTime, endTime: entry.endTime, details: entry.details });
    setResult(null);
    setDirty(false);
    setDialogOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const next = await client.saveDateEntry(form, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setForm(createEmptyOfficerDateEntry(dashboard.organization.id));
      setDirty(false);
      setDialogOpen(false);
      onChanged();
    }
  };

  return (
    <section className="surface-section">
      <header className="section-heading inline-heading">
        <div>
          <h2>Events and availability</h2>
          <p>Post public events or meeting/interview availability for this organization.</p>
        </div>
        <Button type="button" onClick={openCreate}>Add dated entry</Button>
      </header>
      <ModalDialog open={dialogOpen} title={form.id ? 'Edit dated entry' : 'Add dated entry'} dirty={dirty} onClose={() => {
        setDialogOpen(false);
        setDirty(false);
        setForm(createEmptyOfficerDateEntry(dashboard.organization.id));
      }}>
        <form className="content-stack dialog-form" onSubmit={submit}>
          <div className="grid grid-2">
            <div className="field"><label className="label-row" htmlFor="entry-kind">Entry type</label><select data-autofocus id="entry-kind" className="control" value={form.kind} onChange={(event) => patchForm({ kind: event.target.value as DateEntryInput['kind'] })}><option value="event">Public event</option><option value="availability">Meeting/interview availability</option></select></div>
            <div className="field"><label className="label-row" htmlFor="entry-title">Title</label><input id="entry-title" className="control" value={form.title} onChange={(event) => patchForm({ title: event.target.value })} /></div>
          </div>
          <div className="grid grid-3">
            <div className="field"><label className="label-row" htmlFor="entry-date">Date</label><input id="entry-date" className="control" type="date" value={form.date} onChange={(event) => patchForm({ date: event.target.value })} /></div>
            <div className="field"><label className="label-row" htmlFor="entry-start">Start time <span>Optional</span></label><input id="entry-start" className="control" type="time" value={form.startTime ?? ''} onChange={(event) => patchForm({ startTime: event.target.value })} /></div>
            <div className="field"><label className="label-row" htmlFor="entry-end">End time <span>Optional</span></label><input id="entry-end" className="control" type="time" value={form.endTime ?? ''} onChange={(event) => patchForm({ endTime: event.target.value })} /></div>
          </div>
          <div className="field"><label className="label-row" htmlFor="entry-details">Short details</label><textarea id="entry-details" className="control textarea" value={form.details} onChange={(event) => patchForm({ details: event.target.value })} /></div>
          <div className="button-row"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save dated entry'}</Button></div>
          <ResultMessage result={result} />
        </form>
      </ModalDialog>
      {dashboard.dateEntries.length ? (
        <ul className="feed-list divided-list">
          {dashboard.dateEntries.map((entry) => (
            <li key={entry.id}>
              <div className="feed-copy"><strong>{entry.title}</strong><span>{entry.kind === 'event' ? 'Public event' : 'Meeting/interview availability'} · {formatDateEntry(entry)} · {entry.details}</span></div>
              <div className="component-row">
                <Button type="button" variant="secondary" onClick={() => openEdit(entry)}>Edit</Button>
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
      ) : <p className="section-note">No dated entries yet.</p>}
      {!dialogOpen ? <ResultMessage result={result} /> : null}
    </section>
  );
}

function FormalRequestDocumentButton({ request }: { request: OfficerDashboard['meetingRequests'][number] }) {
  const [message, setMessage] = useState('');
  if (!request.document) return <span className="section-note">No document</span>;
  return (
    <div className="document-cell">
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
      {message ? <span className="help error" role="alert">{message}</span> : null}
    </div>
  );
}

export function MeetingDecisionsSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  return (
    <section className="surface-section">
      <header className="section-heading">
        <h2>Meeting requests to review</h2>
        <p>Approve or decline requests for this organization.</p>
      </header>
      {dashboard.meetingRequests.length ? (
        <WorkflowTable
          caption="Meeting requests for this organization"
          headers={['Requester', 'Meeting title', 'Requested date/time', 'Status', 'Document', 'Decision']}
          rows={dashboard.meetingRequests.map((request) => (
            <tr key={request.id}>
              <td>{request.requesterName}</td>
              <td>{request.meetingTitle}</td>
              <td>{request.requestedDate}, {request.requestedTime}</td>
              <td><MeetingStatusChip status={request.status} /></td>
              <td><FormalRequestDocumentButton request={request} /></td>
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
      ) : <p className="section-note">No meeting requests for this organization.</p>}
      <ResultMessage result={result} />
    </section>
  );
}

export function OfficerOrganizationPicker({ selectedOrganizationId, onChange, session }: { selectedOrganizationId: string; onChange: (value: string) => void; session: UserSession }) {
  const grants = getApprovedOfficerGrants(session);
  if (grants.length <= 1) return null;
  return (
    <section className="organization-switcher" aria-label="Managed organization">
      <div className="field">
        <label className="label-row" htmlFor="managed-organization">Organization</label>
        <select id="managed-organization" className="control" value={selectedOrganizationId} onChange={(event) => onChange(event.target.value)}>
          {grants.map((grant) => <option key={grant.organizationId} value={grant.organizationId}>{grant.organizationName}</option>)}
        </select>
      </div>
    </section>
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
    <aside className="surface-notice" role="note">
      <strong>Organization management</strong>
      <p>Edit profile details, announcements, and dated entries from the dedicated Manage Organization sidebar tab.</p>
      <ButtonLink to={`/settings/organization?organizationId=${encodeURIComponent(organizationId)}`} variant="primary">Manage organization</ButtonLink>
    </aside>
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
      <header className="section-heading">
        <h2>Officer applicant review</h2>
        <p>Review applicants only for organizations where your grant applies.</p>
      </header>
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
      <header className="section-heading">
        <h2>Officer meeting decisions</h2>
        <p>Approve or decline meeting requests for organizations where your grant applies.</p>
      </header>
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
      description="Use direct organization management for profile and dates, Applications for applicants, Meetings for requests, and Announcements for posts."
      session={session}
    >
      <SourceNotice client={client} />
      <section className="management-shortcuts" aria-label="Management shortcuts">
        {grants.map((grant) => (
          <article key={grant.organizationId} className="management-shortcut">
            <div className="org-head">
              <OrganizationAvatar name={grant.organizationName} />
              <div>
                <h2>{grant.organizationName}</h2>
                <p className="section-note"><RoleBadge kind="officer">Approved officer access</RoleBadge></p>
              </div>
            </div>
            <div className="button-row">
              <ButtonLink to={`/settings/organization?organizationId=${encodeURIComponent(grant.organizationId)}`} variant="primary">Manage profile and dates</ButtonLink>
              <ButtonLink to="/app/applications" variant="secondary">Applications</ButtonLink>
              <ButtonLink to="/app/meetings" variant="secondary">Meetings</ButtonLink>
            </div>
          </article>
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
