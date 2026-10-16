import { apiFetch, authHeaders } from '../../lib/apiClient';
import type { ApplicationStage, MeetingStatus, UserSession } from '../../lib/contracts';
import {
  storageDownloadUrl,
  uploadMeetingDocumentToTarget,
  uploadToStorageTarget,
  validateAnnouncementMediaFiles,
  type ImageUploadTarget,
  type MeetingDocumentUploadTarget,
} from '../../lib/storageUploads';
import type {
  Announcement,
  AnnouncementComment,
  AnnouncementPage,
  AnnouncementInput,
  ApplicationConfirmationInput,
  ApplicationRecord,
  DateEntry,
  DateEntryInput,
  MeetingRequest,
  MeetingRequestDocument,
  MeetingRequestInput,
  OfficerDashboard,
  OrganizationPage,
  OrganizationProfile,
  OrganizationProfileInput,
  OrganizationSummary,
  OrganizationDepartmentStudentCount,
  WorkflowDataClient,
  WorkflowMutationResult,
  WorkflowQueryResult,
} from './contracts';

type AnyRecord = Record<string, unknown>;

interface ListEnvelope<T> {
  items?: T[];
  data?: T[];
  nextPageToken?: string;
}

const pickString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const pickNumber = (value: unknown, fallback = 0): number => (typeof value === 'number' ? value : fallback);
const pickBoolean = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);
const pickArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asRecord = (value: unknown): AnyRecord => (value && typeof value === 'object' ? (value as AnyRecord) : {});
const activeHeaders = async () => ({ headers: await authHeaders() });
const bodyInit = async (body: unknown, method = 'POST'): Promise<RequestInit> => ({ method, headers: await authHeaders(), body: JSON.stringify(body) });

async function safeStorageUrl(storagePath: string): Promise<string> {
  if (!storagePath) return '';
  try {
    return await storageDownloadUrl(storagePath);
  } catch {
    return '';
  }
}

function slugPart(value: string): string {
  const slug = value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'recruitment';
}

function recruitmentOpportunityId(organizationId: string, title: string, explicitId: string): string {
  return explicitId || `${organizationId}-${slugPart(title || 'Recruitment')}`;
}

function fileMetadata(file: File) {
  return {
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  };
}

const imageMetadata = fileMetadata;

function listItems<T>(value: T[] | ListEnvelope<T>): T[] {
  if (Array.isArray(value)) return value;
  return value.items ?? value.data ?? [];
}

function mapStage(stage: unknown): ApplicationStage {
  const text = pickString(stage).toLowerCase().replace(/[ -]/g, '_');
  if (text === 'under_review') return 'Under review';
  if (text === 'accepted') return 'Accepted';
  if (text === 'declined') return 'Declined';
  return 'Pending';
}

function toBackendStage(stage: ApplicationStage): ApplicationStage {
  return stage;
}

function mapMeetingStatus(status: unknown): MeetingStatus {
  const text = pickString(status).toLowerCase();
  if (text === 'approved') return 'Approved';
  if (text === 'declined') return 'Declined';
  return 'Pending';
}

function toBackendMeetingStatus(status: Exclude<MeetingStatus, 'Pending'>): Exclude<MeetingStatus, 'Pending'> {
  return status;
}

async function mapWorkflowImage(raw: unknown, fallbackAlt = 'Announcement image'): Promise<NonNullable<Announcement['media']>[number] | undefined> {
  const item = asRecord(raw);
  const storagePath = pickString(item.storagePath || item.imageStoragePath);
  const url = pickString(item.url || item.imageUrl) || await safeStorageUrl(storagePath);
  if (!url && !storagePath) return undefined;
  return {
    url,
    alt: pickString(item.alt || item.imageAlt, fallbackAlt),
    storagePath: storagePath || undefined,
    contentType: pickString(item.contentType) || undefined,
    sizeBytes: pickNumber(item.sizeBytes, 0) || undefined,
  };
}

async function mapAnnouncement(raw: unknown): Promise<Announcement> {
  const item = asRecord(raw);
  const legacyImage = asRecord(item.image);
  const mediaItems = await Promise.all(pickArray<unknown>(item.media).map((mediaItem) => mapWorkflowImage(mediaItem)));
  const legacyImageItem = await mapWorkflowImage(
    Object.keys(legacyImage).length ? legacyImage : { storagePath: item.imageStoragePath, url: item.imageUrl, alt: item.imageAlt },
  );
  const media = mediaItems.filter(Boolean) as NonNullable<Announcement['media']>;
  const normalizedMedia = media.length ? media : legacyImageItem ? [legacyImageItem] : [];
  const logoStoragePath = pickString(item.organizationLogoPath || item.logoPath);
  const organizationLogoUrl = pickString(item.organizationLogoUrl || item.logoUrl) || await safeStorageUrl(logoStoragePath);
  const comments = pickArray<unknown>(item.comments).map(mapComment);
  return {
    id: pickString(item.id || item.announcementId),
    organizationId: pickString(item.organizationId || item.orgId),
    organizationName: pickString(item.organizationName),
    organizationLogoUrl: organizationLogoUrl || undefined,
    createdAt: pickString(item.createdAt || item.publishedAt || item.updatedAt, new Date().toISOString()),
    body: pickString(item.body || item.text),
    image: normalizedMedia[0],
    media: normalizedMedia.length ? normalizedMedia : undefined,
    deepLinkPath: pickString(item.deepLinkPath) || undefined,
    likeCount: pickNumber(item.likeCount, 0),
    viewerHasLiked: pickBoolean(item.viewerHasLiked, false),
    commentCount: pickNumber(item.commentCount, comments.length),
    comments,
  };
}

function mapComment(raw: unknown): AnnouncementComment {
  const item = asRecord(raw);
  return {
    id: pickString(item.id || item.commentId),
    authorUid: pickString(item.authorUid || item.uid) || undefined,
    authorName: pickString(item.authorName || item.displayName, 'SOAR user'),
    body: pickString(item.body || item.text),
    createdAt: pickString(item.createdAt, new Date().toISOString()),
    updatedAt: pickString(item.updatedAt) || undefined,
    viewerCanEdit: pickBoolean(item.viewerCanEdit, false),
    viewerCanDelete: pickBoolean(item.viewerCanDelete, false),
  };
}

function mapDateEntry(raw: unknown): DateEntry {
  const item = asRecord(raw);
  const kind = pickString(item.kind) === 'event' ? 'event' : 'availability';
  return {
    id: pickString(item.id || item.entryId || item.dateEntryId),
    organizationId: pickString(item.organizationId || item.orgId),
    organizationName: pickString(item.organizationName),
    kind,
    title: pickString(item.title),
    date: pickString(item.date),
    startTime: pickString(item.startTime) || undefined,
    endTime: pickString(item.endTime) || undefined,
    details: pickString(item.details || item.description),
  };
}

async function mapOrganizationSummary(raw: unknown): Promise<OrganizationSummary> {
  const item = asRecord(raw);
  const recruitment = asRecord(item.recruitment);
  const logoPath = pickString(item.logoPath || asRecord(item.logo).storagePath);
  const logoUrl = pickString(item.logoUrl || item.logoDownloadUrl) || await safeStorageUrl(logoPath);
  return {
    id: pickString(item.id || item.orgId || item.organizationId),
    slug: pickString(item.slug),
    name: pickString(item.name),
    logoUrl: logoUrl || undefined,
    logoPath: logoPath || undefined,
    shortDescription: pickString(item.shortDescription),
    contactEmail: pickString(item.contactEmail),
    contactPhone: pickString(item.contactPhone) || undefined,
    recruitmentTitle: pickString(item.recruitmentTitle || recruitment.title),
    department: pickString(item.department) || undefined,
    departmentKey: pickString(item.departmentKey) || undefined,
  };
}

async function mapOrganizationProfile(raw: unknown): Promise<OrganizationProfile> {
  const item = asRecord(raw);
  const summary = await mapOrganizationSummary(item);
  const recruitment = asRecord(item.recruitment);
  const title = pickString(recruitment.title || item.recruitmentTitle);
  return {
    ...summary,
    description: pickString(item.description),
    applicationsOpen: item.applicationsOpen !== false,
    recruitment: {
      id: recruitmentOpportunityId(summary.id, title, pickString(recruitment.id || recruitment.opportunityId)),
      organizationId: summary.id,
      title,
      requirements: pickString(recruitment.requirements),
      instructions: pickString(recruitment.instructions),
      externalFormUrl: pickString(recruitment.externalFormUrl || recruitment.applicationLink) || undefined,
      audience: pickString(recruitment.audience) === 'meetings-only' ? 'meetings-only' : 'students',
    },
    posts: await Promise.all(pickArray<unknown>(item.posts || item.announcements).map(mapAnnouncement)),
    dateEntries: pickArray<unknown>(item.dateEntries || item.calendarEntries).map(mapDateEntry),
  };
}

function mapApplication(raw: unknown): ApplicationRecord {
  const item = asRecord(raw);
  return {
    id: pickString(item.id || item.applicationId),
    organizationId: pickString(item.organizationId || item.orgId),
    organizationName: pickString(item.organizationName),
    opportunityId: pickString(item.opportunityId || item.recruitmentId),
    opportunityTitle: pickString(item.opportunityTitle || item.recruitmentTitle),
    studentUid: pickString(item.studentUid || item.requesterUid),
    studentName: pickString(item.studentName || item.requesterName),
    stage: mapStage(item.stage || item.status),
    confirmedExternalSubmissionAt: pickString(item.confirmedExternalSubmissionAt || item.createdAt),
    updatedAt: pickString(item.updatedAt || item.createdAt, new Date().toISOString()),
  };
}

function mapMeetingDocument(raw: unknown): MeetingRequestDocument | undefined {
  const item = asRecord(raw);
  const storagePath = pickString(item.storagePath);
  const contentType = pickString(item.contentType);
  if (!storagePath || contentType !== 'application/pdf') return undefined;
  return {
    storagePath,
    fileName: pickString(item.fileName, 'formal-request.pdf'),
    contentType,
    sizeBytes: pickNumber(item.sizeBytes, 0),
  };
}

function mapMeetingRequest(raw: unknown): MeetingRequest {
  const item = asRecord(raw);
  return {
    id: pickString(item.id || item.meetingRequestId || item.requestId),
    organizationId: pickString(item.organizationId || item.orgId),
    organizationName: pickString(item.organizationName),
    dateEntryId: pickString(item.dateEntryId || item.availabilityId),
    meetingTitle: pickString(item.meetingTitle || item.dateEntryTitle || item.title),
    requesterUid: pickString(item.requesterUid || item.uid),
    requesterName: pickString(item.requesterName || item.displayName),
    requestedDate: pickString(item.requestedDate || item.date),
    requestedTime: pickString(item.requestedTime || item.time),
    status: mapMeetingStatus(item.status),
    note: pickString(item.note) || undefined,
    document: mapMeetingDocument(item.document),
    updatedAt: pickString(item.updatedAt || item.createdAt, new Date().toISOString()),
  };
}

function unwrapDepartmentCount(raw: unknown): unknown {
  const item = asRecord(raw);
  return item.item ?? item.data ?? raw;
}

function mapOrganizationDepartmentStudentCount(raw: unknown, organizationId: string): OrganizationDepartmentStudentCount {
  const item = asRecord(unwrapDepartmentCount(raw));
  const department = pickString(item.department);
  const departmentKey = pickString(item.departmentKey || item.department).toLowerCase();
  return {
    organizationId: pickString(item.organizationId, organizationId),
    department,
    departmentKey,
    registeredStudentCount: pickNumber(item.registeredStudentCount, pickNumber(item.count, 0)),
    scope: 'registered_students_in_organization_department',
    description: pickString(item.description, 'Registered student accounts whose saved department matches this organization department; not organization members or applicants.'),
    generatedAt: pickString(item.generatedAt, new Date().toISOString()),
  };
}

function queryResult<T>(data: T, message?: string): WorkflowQueryResult<T> {
  return { data, source: 'production', message };
}

function mutationResult<T>(message: string, data: T): WorkflowMutationResult<T> {
  return { ok: true, persisted: true, source: 'production', message, data };
}

async function createLogoUpload(input: OrganizationProfileInput): Promise<string | undefined> {
  if (!input.logoFile) return input.logoPath;
  const target = await apiFetch<ImageUploadTarget>(`/organizations/${encodeURIComponent(input.organizationId)}/logo-image-targets`, await bodyInit(imageMetadata(input.logoFile)));
  const uploaded = await uploadToStorageTarget(target, input.logoFile, input.logoFile.name);
  return uploaded.storagePath;
}

interface AnnouncementMediaTargetResponse {
  announcementId: string;
  items: ImageUploadTarget[];
  allowedContentTypes?: readonly string[];
  maxItems?: number;
  maxSizeBytes?: number;
  maxAggregateSizeBytes?: number;
}

async function createAnnouncementUpload(input: AnnouncementInput): Promise<{ announcementId?: string; media?: { storagePath: string; contentType: string; sizeBytes: number; alt?: string }[] }> {
  const media = input.media?.length ? input.media : input.image ? [input.image] : [];
  if (!media.length) return {};

  const files = media.filter((item) => item.file).map((item) => item.file as File);
  if (!files.length) {
    const existing = media
      .filter((item) => item.storagePath && item.contentType && item.sizeBytes)
      .map((item) => ({ storagePath: item.storagePath as string, contentType: item.contentType as string, sizeBytes: item.sizeBytes as number, alt: item.alt }));
    return existing.length ? { media: existing } : {};
  }

  validateAnnouncementMediaFiles(files);
  const response = await apiFetch<AnnouncementMediaTargetResponse>(`/organizations/${encodeURIComponent(input.organizationId)}/announcements/media-targets`, await bodyInit({ files: files.map(imageMetadata) }));
  const uploaded = await Promise.all(response.items.map((target, index) => uploadToStorageTarget(target, files[index], media[index]?.alt || files[index].name)));
  const uploadedMedia = uploaded.map((item) => ({
    storagePath: item.storagePath,
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    alt: item.alt,
  }));

  return {
    announcementId: response.announcementId,
    media: uploadedMedia,
  };
}

async function createMeetingDocumentUpload(input: MeetingRequestInput, session: UserSession): Promise<MeetingRequestDocument | undefined> {
  if (!input.document?.file) return undefined;
  const target = await apiFetch<MeetingDocumentUploadTarget>('/requests/meetings/document-targets', await bodyInit({
    organizationId: input.organizationId,
    dateEntryId: input.dateEntryId,
    requestedDate: input.requestedDate,
    requestedTime: input.requestedTime,
    ...fileMetadata(input.document.file),
  }));
  return uploadMeetingDocumentToTarget(target, input.document.file, {
    orgId: input.organizationId,
    meetingRequestId: target.meetingRequestId,
    requesterUid: session.uid,
  });
}

async function profileInputToBackend(input: OrganizationProfileInput) {
  const logoPath = await createLogoUpload(input);
  return {
    name: input.name,
    shortDescription: input.shortDescription,
    description: input.description,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone ?? '',
    ...(logoPath !== undefined ? { logoPath } : {}),
    recruitment: {
      title: input.recruitmentTitle,
      requirements: input.recruitmentRequirements,
      instructions: input.recruitmentInstructions,
      applicationLink: input.externalFormUrl,
    },
  };
}

function dateInputToBackend(input: DateEntryInput) {
  return {
    ...(input.id || !input.idempotencyKey ? {} : { entryId: input.idempotencyKey }),
    kind: input.kind,
    title: input.title,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    details: input.details,
  };
}

export function createProductionWorkflowDataClient(): WorkflowDataClient {
  return {
    mode: 'production',
    label: 'Configured workflow services',

    async listAnnouncements(_session, page = { limit: 15 }) {
      const params = new URLSearchParams({ limit: String(page.limit) });
      if (page.pageToken) params.set('pageToken', page.pageToken);
      if (page.organizationId) params.set('orgId', page.organizationId);
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>(`/announcements?${params.toString()}`, await activeHeaders());
      const envelope = Array.isArray(response) ? undefined : response;
      const items = await Promise.all(listItems(response).map(mapAnnouncement));
      return queryResult<AnnouncementPage>({ items, nextPageToken: envelope?.nextPageToken });
    },

    async getAnnouncement(announcementId) {
      try {
        const response = await apiFetch<unknown>(`/announcements/${encodeURIComponent(announcementId)}`, await activeHeaders());
        return queryResult(await mapAnnouncement(response));
      } catch (error) {
        if (error && typeof error === 'object' && (error as { status?: unknown }).status === 404) return queryResult<Announcement | undefined>(undefined);
        throw error;
      }
    },

    async listAnnouncementComments(announcementId) {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>(`/announcements/${encodeURIComponent(announcementId)}/comments?limit=50`, await activeHeaders());
      return queryResult(listItems(response).map(mapComment));
    },

    async toggleAnnouncementLike(announcementId, liked) {
      const response = await apiFetch<unknown>(`/announcements/${encodeURIComponent(announcementId)}/like`, await bodyInit(undefined, liked ? 'POST' : 'DELETE'));
      return mutationResult(liked ? 'Announcement liked.' : 'Announcement like removed.', await mapAnnouncement(response));
    },

    async addAnnouncementComment(announcementId, body) {
      const response = await apiFetch<unknown>(`/announcements/${encodeURIComponent(announcementId)}/comments`, await bodyInit({ body }));
      return mutationResult('Comment added.', mapComment(response));
    },

    async updateAnnouncementComment(announcementId, commentId, body) {
      const response = await apiFetch<unknown>(`/announcements/${encodeURIComponent(announcementId)}/comments/${encodeURIComponent(commentId)}`, await bodyInit({ body }, 'PATCH'));
      return mutationResult('Comment updated.', mapComment(response));
    },

    async deleteAnnouncementComment(announcementId, commentId) {
      await apiFetch<unknown>(`/announcements/${encodeURIComponent(announcementId)}/comments/${encodeURIComponent(commentId)}`, await bodyInit(undefined, 'DELETE'));
      return { ok: true, persisted: true, source: 'production', message: 'Comment deleted.' };
    },

    async listOrganizations(_session, page = {}) {
      const params = new URLSearchParams({ limit: String(page.limit ?? 20) });
      if (page.pageToken) params.set('pageToken', page.pageToken);
      if (page.query?.trim()) params.set('q', page.query.trim());
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>(`/organizations?${params.toString()}`, await activeHeaders());
      const envelope = Array.isArray(response) ? undefined : response;
      const items = await Promise.all(listItems(response).map(mapOrganizationSummary));
      return queryResult<OrganizationPage>({ items, nextPageToken: envelope?.nextPageToken });
    },

    async getOrganization(organizationId) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}`, await activeHeaders());
      return queryResult(response ? await mapOrganizationProfile(response) : undefined);
    },

    async confirmExternalApplication(input: ApplicationConfirmationInput) {
      const response = await apiFetch<unknown>('/requests/applications/confirm', await bodyInit({
        organizationId: input.organizationId,
        opportunityId: input.opportunityId,
        externalFormOpened: input.externalFormOpened,
        confirmedExternalSubmission: input.confirmedExternalSubmission,
      }));
      return mutationResult('External submission confirmation recorded.', mapApplication(response));
    },

    async listMyApplications() {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>('/requests/applications/mine', await activeHeaders());
      return queryResult(listItems(response).map(mapApplication));
    },

    async listMeetingOptions() {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>('/date-entries?kind=availability', await activeHeaders());
      return queryResult(listItems(response).map(mapDateEntry));
    },

    async listMyMeetingRequests() {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>('/requests/meetings/mine', await activeHeaders());
      return queryResult(listItems(response).map(mapMeetingRequest));
    },

    async requestMeeting(input: MeetingRequestInput, session: UserSession) {
      const document = await createMeetingDocumentUpload(input, session);
      const response = await apiFetch<unknown>('/requests/meetings', await bodyInit({
        organizationId: input.organizationId,
        dateEntryId: input.dateEntryId,
        requestedDate: input.requestedDate,
        requestedTime: input.requestedTime,
        note: input.note,
        ...(document ? { document } : {}),
      }));
      return mutationResult('Meeting request created as Pending.', mapMeetingRequest(response));
    },

    async getOfficerDashboard(organizationId, session: UserSession) {
      const [organization, announcements, applicants, dateEntries, meetingRequests] = await Promise.all([
        apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}`, await activeHeaders()),
        apiFetch<ListEnvelope<unknown> | unknown[]>(`/announcements?orgId=${encodeURIComponent(organizationId)}`, await activeHeaders()),
        apiFetch<ListEnvelope<unknown> | unknown[]>(`/requests/organizations/${encodeURIComponent(organizationId)}/applications`, await activeHeaders()),
        apiFetch<ListEnvelope<unknown> | unknown[]>(`/organizations/${encodeURIComponent(organizationId)}/date-entries`, await activeHeaders()),
        apiFetch<ListEnvelope<unknown> | unknown[]>(`/requests/organizations/${encodeURIComponent(organizationId)}/meetings`, await activeHeaders()),
      ]);
      return queryResult<OfficerDashboard>({
        organization: await mapOrganizationProfile(organization),
        announcements: await Promise.all(listItems(announcements).map(mapAnnouncement)),
        applicants: listItems(applicants).map(mapApplication),
        dateEntries: listItems(dateEntries).map(mapDateEntry),
        meetingRequests: listItems(meetingRequests).map(mapMeetingRequest),
      }, `Officer dashboard loaded for ${session.displayName}.`);
    },

    async saveOrganizationProfile(input: OrganizationProfileInput) {
      const payload = await profileInputToBackend(input);
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(input.organizationId)}`, await bodyInit(payload, 'PATCH'));
      return mutationResult('Organization profile saved.', await mapOrganizationProfile(response));
    },

    async setApplicationsOpen(organizationId, applicationsOpen, _session) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}`, await bodyInit({ applicationsOpen }, 'PATCH'));
      const savedValue = pickBoolean(asRecord(response).applicationsOpen, applicationsOpen);
      return mutationResult(savedValue ? 'Applications are open.' : 'Applications are closed.', { applicationsOpen: savedValue });
    },

    async publishAnnouncement(input: AnnouncementInput) {
      const upload = await createAnnouncementUpload(input);
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(input.organizationId)}/announcements`, await bodyInit({ body: input.body, ...upload }));
      return mutationResult('Announcement published.', await mapAnnouncement(response));
    },

    async updateAnnouncement(announcementId, organizationId, body) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}/announcements/${encodeURIComponent(announcementId)}`, await bodyInit({ body }, 'PATCH'));
      return mutationResult('Announcement updated.', await mapAnnouncement(response));
    },

    async deleteAnnouncement(announcementId, organizationId) {
      await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}/announcements/${encodeURIComponent(announcementId)}`, await bodyInit(undefined, 'DELETE'));
      return { ok: true, persisted: true, source: 'production', message: 'Announcement deleted.' };
    },

    async getOrganizationDepartmentStudentCount(organizationId) {
      try {
        const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}/student-department-counts`, await activeHeaders());
        return queryResult<OrganizationDepartmentStudentCount | undefined>(mapOrganizationDepartmentStudentCount(response, organizationId));
      } catch (error) {
        const problem = error as Error & { code?: string; status?: number };
        if (problem.code === 'organization_department_missing' || problem.status === 409) {
          return queryResult<OrganizationDepartmentStudentCount | undefined>(undefined, problem.message || 'This organization has no assigned department link yet.');
        }
        throw error;
      }
    },

    async updateApplicationStage(applicationId, stage: ApplicationStage, organizationId) {
      const response = await apiFetch<unknown>(`/requests/organizations/${encodeURIComponent(organizationId)}/applications/${encodeURIComponent(applicationId)}/stage`, await bodyInit({ status: toBackendStage(stage) }, 'PATCH'));
      return mutationResult(`Application moved to ${stage}.`, mapApplication(response));
    },

    async saveDateEntry(input: DateEntryInput, _session: UserSession, signal?: AbortSignal) {
      const path = input.id
        ? `/organizations/${encodeURIComponent(input.organizationId)}/date-entries/${encodeURIComponent(input.id)}`
        : `/organizations/${encodeURIComponent(input.organizationId)}/date-entries`;
      const request = await bodyInit(dateInputToBackend(input), input.id ? 'PATCH' : 'POST');
      const response = await apiFetch<unknown>(path, signal ? { ...request, signal } : request);
      return mutationResult(`${input.kind === 'event' ? 'Event' : 'Meeting availability'} saved.`, mapDateEntry(response));
    },

    async deleteDateEntry(dateEntryId, organizationId) {
      await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}/date-entries/${encodeURIComponent(dateEntryId)}`, await bodyInit(undefined, 'DELETE'));
      return { ok: true, persisted: true, source: 'production', message: 'Date entry removed.' };
    },

    async decideMeetingRequest(meetingRequestId, status: Exclude<MeetingStatus, 'Pending'>, organizationId) {
      const response = await apiFetch<unknown>(`/requests/organizations/${encodeURIComponent(organizationId)}/meetings/${encodeURIComponent(meetingRequestId)}/status`, await bodyInit({ status: toBackendMeetingStatus(status) }, 'PATCH'));
      return mutationResult(`Meeting request ${status.toLowerCase()}.`, mapMeetingRequest(response));
    },
  };
}
