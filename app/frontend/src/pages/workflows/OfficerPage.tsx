import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button, ButtonLink, ConfirmDialog, LoadingBlock, ModalDialog, RoleBadge, StateBlock } from '../../components/ui';
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
  TabSectionHeader,
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
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmSaveError, setConfirmSaveError] = useState<string | null>(null);
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
    setConfirmSaveError(null);
    setConfirmSaveOpen(true);
  };

  const confirmSave = async () => {
    setBusy(true);
    setConfirmSaveError(null);
    const next = await client.saveOrganizationProfile(form, session);
    setResult(next);
    setBusy(false);
    if (next.ok) {
      setConfirmSaveOpen(false);
      onDirtyChange?.(false);
      onChanged();
    } else {
      setConfirmSaveError(next.message);
    }
  };

  return (
    <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0 first:pt-0">
      <TabSectionHeader
        title="Organization profile and recruitment"
        description="Update the public profile, recruitment copy, contact email, and logo shown to students and sponsors."
      />
      <form id={formId} className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="org-name">Organization name</label><input id="org-name" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="org-contact">Contact email</label><input id="org-contact" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" type="email" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} /></div>
        </div>
        <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="org-phone">Contact phone <span>Optional</span></label><input id="org-phone" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" type="tel" inputMode="tel" autoComplete="tel" value={form.contactPhone ?? ''} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder="+63 912 345 6789" maxLength={32} /><span className="text-xs text-[var(--muted-foreground)]">Shown on the public profile only when provided. Use digits, spaces, dashes, parentheses, or extension text.</span></div>
        <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="org-short">Short description</label><input id="org-short" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" value={form.shortDescription} onChange={(event) => setForm((current) => ({ ...current, shortDescription: event.target.value }))} /></div>
        <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="org-description">Profile description</label><textarea id="org-description" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)] min-h-[120px] resize-y" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid min-w-0 gap-1.5">
            <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="logo-file">Logo image <span>Optional</span></label>
            <input
              id="logo-file"
              className="min-h-[46px] w-full min-w-0 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]"
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
            {logoError ? <span className="text-xs text-[var(--muted-foreground)] border-[var(--color-orange-deep)] text-[var(--color-orange-deep)]" role="alert">{logoError}</span> : <span className="text-xs text-[var(--muted-foreground)]">PNG, JPEG, GIF, or WebP. Maximum 5 MB. Existing logo stays if no file is selected.</span>}
            {form.logoUrl ? <figure className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-off-white)] [&_img]:block [&_img]:max-h-[340px] [&_img]:w-full [&_img]:object-cover [&_video]:block [&_video]:max-h-[340px] [&_video]:w-full [&_video]:bg-[var(--color-ink)] [&_video]:object-cover [&_img]:bg-[var(--color-white)] [&_img]:object-contain [&_img]:p-3"><img src={form.logoUrl} alt={`${form.name} logo preview`} /></figure> : null}
          </div>
          <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="external-form">External form URL <span>Optional</span></label><input id="external-form" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" type="url" value={form.externalFormUrl ?? ''} onChange={(event) => setForm((current) => ({ ...current, externalFormUrl: event.target.value }))} /></div>
        </div>
        <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="recruitment-title">Recruitment title</label><input id="recruitment-title" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" value={form.recruitmentTitle} onChange={(event) => setForm((current) => ({ ...current, recruitmentTitle: event.target.value }))} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="recruitment-requirements">Requirements</label><textarea id="recruitment-requirements" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)] min-h-[120px] resize-y" value={form.recruitmentRequirements} onChange={(event) => setForm((current) => ({ ...current, recruitmentRequirements: event.target.value }))} /></div>
          <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="recruitment-instructions">Instructions</label><textarea id="recruitment-instructions" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)] min-h-[120px] resize-y" value={form.recruitmentInstructions} onChange={(event) => setForm((current) => ({ ...current, recruitmentInstructions: event.target.value }))} /></div>
        </div>
        <ResultMessage result={result} />
        <div className="flex justify-end max-sm:[&>button]:w-full">
          <Button type="submit" disabled={busy}>Save profile</Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmSaveOpen}
        title="Save profile changes?"
        description={`These changes update the public profile for ${dashboard.organization.name}. Review the fields before saving.`}
        confirmLabel="Save profile"
        cancelLabel="Review changes"
        busy={busy}
        error={confirmSaveError}
        onOpenChange={setConfirmSaveOpen}
        onConfirm={confirmSave}
      />
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
    <section id="announcement-composer" className="grid gap-3.5">
      <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
        <h2>{title}</h2>
        <p>Publish updates for {organizationName ?? 'your organization'} that appear on the announcements feed and the organization profile.</p>
      </header>
      {context}
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="announcement-body">Post text</label><textarea data-autofocus id="announcement-body" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)] min-h-[120px] resize-y" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write an announcement for students and sponsors." /></div>
        <div className="grid min-w-0 gap-1.5">
          <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="announcement-image">Optional media</label>
          <input
            id="announcement-image"
            className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]"
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
            <span className="text-xs text-[var(--muted-foreground)] border-[var(--color-orange-deep)] text-[var(--color-orange-deep)]" role="alert">{imageError}</span>
          ) : (
            <span className="text-xs text-[var(--muted-foreground)]">Up to {ANNOUNCEMENT_MEDIA_MAX_ITEMS} total images or videos. Images can be PNG, JPEG, GIF, or WebP; one MP4/WebM video may be attached up to {formatBytes(WORKFLOW_VIDEO_MAX_BYTES)}. {formatBytes(ANNOUNCEMENT_MEDIA_MAX_AGGREGATE_BYTES)} combined maximum.</span>
          )}
        </div>
        {media.length ? (
          <ul className="m-0 grid list-none gap-2.5 p-0 [&_li]:grid [&_li]:grid-cols-[96px_minmax(0,1fr)] [&_li]:items-center [&_li]:gap-3 [&_li]:rounded-[var(--radius-md)] [&_li]:border [&_li]:border-[var(--color-border)] [&_li]:bg-[var(--color-white)] [&_li]:p-2.5 max-sm:[&_li]:grid-cols-1 [&_img]:size-auto [&_img]:h-[76px] [&_img]:w-24 [&_img]:rounded-[var(--radius-sm)] [&_img]:bg-[var(--color-ink)] [&_img]:object-cover [&_video]:h-[76px] [&_video]:w-24 [&_video]:rounded-[var(--radius-sm)] [&_video]:bg-[var(--color-ink)] [&_video]:object-cover max-sm:[&_img]:h-[150px] max-sm:[&_img]:w-full max-sm:[&_video]:h-[150px] max-sm:[&_video]:w-full [&_strong]:block [&_span]:block [&_span]:text-xs [&_span]:text-[var(--muted-foreground)]" aria-label="Selected announcement images">
            {media.map((item, index) => (
              <li key={`${item.alt}-${index}`}>
                {item.contentType?.startsWith('video/') ? <video src={item.url} controls preload="metadata" aria-label={item.alt} /> : <img src={item.url} alt={item.alt} />}
                <div>
                  <strong>{item.alt}</strong>
                  <span>{item.sizeBytes ? formatBytes(item.sizeBytes) : 'Ready to upload'}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="quiet" disabled={index === 0} onClick={() => moveMedia(index, -1)}>Move up</Button>
                    <Button type="button" variant="quiet" disabled={index === media.length - 1} onClick={() => moveMedia(index, 1)}>Move down</Button>
                    <Button type="button" variant="danger" onClick={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2.5 max-sm:[&>a]:w-full max-sm:[&>button]:w-full"><Button type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish announcement'}</Button></div>
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
  const [deleteAnnouncementId, setDeleteAnnouncementId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDeleteAnnouncement = async () => {
    if (!deleteAnnouncementId) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const next = await client.deleteAnnouncement(deleteAnnouncementId, dashboard.organization.id, session);
    setResult(next);
    setDeleteBusy(false);
    if (next.ok) {
      setDeleteAnnouncementId(null);
      onChanged();
    } else {
      setDeleteError(next.message);
    }
  };

  return (
    <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0 first:pt-0">
      <TabSectionHeader
        title="Published announcements"
        description={allowPosting ? 'Create announcements for this organization.' : 'Review this organization\'s announcement history. Publish new posts from the Announcements feed.'}
        action={allowPosting ? <Button type="button" onClick={() => setComposerOpen(true)}>Post announcement</Button> : undefined}
      />
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
        <ul className="m-0 grid list-none gap-1 p-0 [&_li]:flex [&_li]:min-w-0 [&_li]:items-center [&_li]:gap-2.5 [&_li]:border-b [&_li]:border-[var(--color-border)] [&_li]:py-3 max-[820px]:[&_li]:items-start gap-0">
          {dashboard.announcements.map((announcement) => (
            <li key={announcement.id}>
              <div className="min-w-0 flex-1 [&_strong]:block [&_strong]:text-[var(--color-navy)] [&_span]:mt-0.5 [&_span]:block [&_span]:[overflow-wrap:anywhere] [&_span]:text-[0.88rem] [&_span]:text-[var(--muted-foreground)]"><strong>{announcement.body}</strong><span>{new Date(announcement.createdAt).toLocaleDateString()}</span></div>
              <Button type="button" variant="danger" onClick={() => { setDeleteError(null); setDeleteAnnouncementId(announcement.id); }}>Delete</Button>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">No announcements yet.</p>}
      <ResultMessage result={result} />
      <ConfirmDialog
        open={Boolean(deleteAnnouncementId)}
        title="Delete this announcement?"
        description="This removes the announcement from the feed and public organization profile. Comments and likes for the post will no longer be visible."
        confirmLabel="Delete announcement"
        cancelLabel="Keep announcement"
        destructive
        busy={deleteBusy}
        error={deleteError}
        onOpenChange={(open) => { if (!open) setDeleteAnnouncementId(null); }}
        onConfirm={confirmDeleteAnnouncement}
      />
    </section>
  );
}

export function ApplicantsSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  return (
    <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0 first:pt-0">
      <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
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
                  className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]"
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
      ) : <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">No applicants are waiting for this organization.</p>}
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
  const [deleteDateEntryId, setDeleteDateEntryId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const confirmDeleteDateEntry = async () => {
    if (!deleteDateEntryId) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const next = await client.deleteDateEntry(deleteDateEntryId, dashboard.organization.id, session);
    setResult(next);
    setDeleteBusy(false);
    if (next.ok) {
      setDeleteDateEntryId(null);
      onChanged();
    } else {
      setDeleteError(next.message);
    }
  };

  return (
    <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0 first:pt-0">
      <TabSectionHeader
        title="Events and availability"
        description="Post public events or meeting/interview availability for this organization."
        action={<Button type="button" onClick={openCreate}>Add dated entry</Button>}
      />
      <ModalDialog open={dialogOpen} title={form.id ? 'Edit dated entry' : 'Add dated entry'} dirty={dirty} onClose={() => {
        setDialogOpen(false);
        setDirty(false);
        setForm(createEmptyOfficerDateEntry(dashboard.organization.id));
      }}>
        <form className="grid gap-4 grid gap-3.5" onSubmit={submit}>
          <div className="grid md:grid-cols-2">
            <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="entry-kind">Entry type</label><select data-autofocus id="entry-kind" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" value={form.kind} onChange={(event) => patchForm({ kind: event.target.value as DateEntryInput['kind'] })}><option value="event">Public event</option><option value="availability">Meeting/interview availability</option></select></div>
            <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="entry-title">Title</label><input id="entry-title" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" value={form.title} onChange={(event) => patchForm({ title: event.target.value })} /></div>
          </div>
          <div className="grid md:grid-cols-3">
            <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="entry-date">Date</label><input id="entry-date" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" type="date" value={form.date} onChange={(event) => patchForm({ date: event.target.value })} /></div>
            <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="entry-start">Start time <span>Optional</span></label><input id="entry-start" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" type="time" value={form.startTime ?? ''} onChange={(event) => patchForm({ startTime: event.target.value })} /></div>
            <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="entry-end">End time <span>Optional</span></label><input id="entry-end" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" type="time" value={form.endTime ?? ''} onChange={(event) => patchForm({ endTime: event.target.value })} /></div>
          </div>
          <div className="grid min-w-0 gap-1.5"><label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="entry-details">Short details</label><textarea id="entry-details" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)] min-h-[120px] resize-y" value={form.details} onChange={(event) => patchForm({ details: event.target.value })} /></div>
          <div className="flex flex-wrap items-center gap-2.5 max-sm:[&>a]:w-full max-sm:[&>button]:w-full"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save dated entry'}</Button></div>
          <ResultMessage result={result} />
        </form>
      </ModalDialog>
      {dashboard.dateEntries.length ? (
        <ul className="m-0 grid list-none gap-1 p-0 [&_li]:flex [&_li]:min-w-0 [&_li]:items-center [&_li]:gap-2.5 [&_li]:border-b [&_li]:border-[var(--color-border)] [&_li]:py-3 max-[820px]:[&_li]:items-start gap-0">
          {dashboard.dateEntries.map((entry) => (
            <li key={entry.id}>
              <div className="min-w-0 flex-1 [&_strong]:block [&_strong]:text-[var(--color-navy)] [&_span]:mt-0.5 [&_span]:block [&_span]:[overflow-wrap:anywhere] [&_span]:text-[0.88rem] [&_span]:text-[var(--muted-foreground)]"><strong>{entry.title}</strong><span>{entry.kind === 'event' ? 'Public event' : 'Meeting/interview availability'} · {formatDateEntry(entry)} · {entry.details}</span></div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => openEdit(entry)}>Edit</Button>
                <Button type="button" variant="danger" onClick={() => { setDeleteError(null); setDeleteDateEntryId(entry.id); }}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">No dated entries yet.</p>}
      {!dialogOpen ? <ResultMessage result={result} /> : null}
      <ConfirmDialog
        open={Boolean(deleteDateEntryId)}
        title="Remove this dated entry?"
        description="This removes the event or availability slot from the public organization profile. Existing meeting requests keep their own status history."
        confirmLabel="Remove entry"
        cancelLabel="Keep entry"
        destructive
        busy={deleteBusy}
        error={deleteError}
        onOpenChange={(open) => { if (!open) setDeleteDateEntryId(null); }}
        onConfirm={confirmDeleteDateEntry}
      />
    </section>
  );
}

function FormalRequestDocumentButton({ request }: { request: OfficerDashboard['meetingRequests'][number] }) {
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

export function MeetingDecisionsSection({ dashboard, session, client, onChanged }: { dashboard: OfficerDashboard; session: UserSession; client: WorkflowDataClient; onChanged: () => void }) {
  const [result, setResult] = useState<WorkflowMutationResult<unknown> | null>(null);
  return (
    <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0 first:pt-0">
      <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
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
                <div className="flex flex-wrap items-center gap-2">
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
      ) : <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">No meeting requests for this organization.</p>}
      <ResultMessage result={result} />
    </section>
  );
}

export function OfficerOrganizationPicker({ selectedOrganizationId, onChange, session }: { selectedOrganizationId: string; onChange: (value: string) => void; session: UserSession }) {
  const grants = getApprovedOfficerGrants(session);
  if (grants.length <= 1) return null;
  return (
    <section className="max-w-[480px] py-3" aria-label="Managed organization">
      <div className="grid min-w-0 gap-1.5">
        <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="managed-organization">Organization</label>
        <select id="managed-organization" className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]" value={selectedOrganizationId} onChange={(event) => onChange(event.target.value)}>
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
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-blue)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] [&_p]:m-0" role="note">
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
    <section className="grid gap-4" aria-label="Applications to review">
      <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
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
    <section className="grid gap-4" aria-label="Meeting requests to review">
      <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)]">
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
      <section className="grid gap-4" aria-label="Management shortcuts">
        {grants.map((grant) => (
          <article key={grant.organizationId} className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)] py-4 first:border-t-0">
            <div className="flex min-w-0 items-center gap-3 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[1.05rem] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[var(--color-navy)] [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[1.05rem] [&_h3]:font-bold [&_h3]:leading-tight [&_h3]:text-[var(--color-navy)]">
              <OrganizationAvatar name={grant.organizationName} />
              <div>
                <h2>{grant.organizationName}</h2>
                <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]"><RoleBadge kind="officer">Approved officer access</RoleBadge></p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 max-sm:[&>a]:w-full max-sm:[&>button]:w-full">
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
