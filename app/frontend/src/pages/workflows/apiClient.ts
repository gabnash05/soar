import { apiFetch, authHeaders } from '../../lib/apiClient';
import type { ApplicationStage, MeetingStatus, UserSession } from '../../lib/contracts';
import type {
  Announcement,
  AnnouncementComment,
  AnnouncementInput,
  ApplicationConfirmationInput,
  ApplicationRecord,
  DateEntry,
  DateEntryInput,
  MeetingRequest,
  MeetingRequestInput,
  OfficerDashboard,
  OrganizationProfile,
  OrganizationProfileInput,
  OrganizationSummary,
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

function toBackendStage(stage: ApplicationStage): string {
  return stage === 'Under review' ? 'under_review' : stage.toLowerCase();
}

function mapMeetingStatus(status: unknown): MeetingStatus {
  const text = pickString(status).toLowerCase();
  if (text === 'approved') return 'Approved';
  if (text === 'declined') return 'Declined';
  return 'Pending';
}

function toBackendMeetingStatus(status: Exclude<MeetingStatus, 'Pending'>): string {
  return status.toLowerCase();
}

function mapAnnouncement(raw: unknown): Announcement {
  const item = asRecord(raw);
  const image = asRecord(item.image);
  const imageUrl = pickString(item.imageUrl || image.url);
  const comments = pickArray<unknown>(item.comments).map(mapComment);
  return {
    id: pickString(item.id || item.announcementId),
    organizationId: pickString(item.organizationId || item.orgId),
    organizationName: pickString(item.organizationName),
    organizationLogoUrl: pickString(item.organizationLogoUrl || item.logoUrl) || undefined,
    createdAt: pickString(item.createdAt || item.publishedAt || item.updatedAt, new Date().toISOString()),
    body: pickString(item.body || item.text),
    image: imageUrl ? { url: imageUrl, alt: pickString(item.imageAlt || image.alt, 'Announcement image') } : undefined,
    likeCount: pickNumber(item.likeCount, 0),
    viewerHasLiked: pickBoolean(item.viewerHasLiked, false),
    comments,
  };
}

function mapComment(raw: unknown): AnnouncementComment {
  const item = asRecord(raw);
  return {
    id: pickString(item.id || item.commentId),
    authorName: pickString(item.authorName || item.displayName, 'SOAR user'),
    body: pickString(item.body || item.text),
    createdAt: pickString(item.createdAt, new Date().toISOString()),
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

function mapOrganizationSummary(raw: unknown): OrganizationSummary {
  const item = asRecord(raw);
  const recruitment = asRecord(item.recruitment);
  return {
    id: pickString(item.id || item.orgId || item.organizationId),
    slug: pickString(item.slug),
    name: pickString(item.name),
    logoUrl: pickString(item.logoUrl || item.logoDownloadUrl) || undefined,
    shortDescription: pickString(item.shortDescription),
    contactEmail: pickString(item.contactEmail),
    recruitmentTitle: pickString(item.recruitmentTitle || recruitment.title),
  };
}

function mapOrganizationProfile(raw: unknown): OrganizationProfile {
  const item = asRecord(raw);
  const summary = mapOrganizationSummary(item);
  const recruitment = asRecord(item.recruitment);
  return {
    ...summary,
    description: pickString(item.description),
    recruitment: {
      id: pickString(recruitment.id || recruitment.opportunityId, `${summary.id}-recruitment`),
      organizationId: summary.id,
      title: pickString(recruitment.title || item.recruitmentTitle),
      requirements: pickString(recruitment.requirements),
      instructions: pickString(recruitment.instructions),
      externalFormUrl: pickString(recruitment.externalFormUrl || recruitment.applicationLink) || undefined,
      audience: pickString(recruitment.audience) === 'meetings-only' ? 'meetings-only' : 'students',
    },
    posts: pickArray<unknown>(item.posts || item.announcements).map(mapAnnouncement),
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
    updatedAt: pickString(item.updatedAt || item.createdAt, new Date().toISOString()),
  };
}

function queryResult<T>(data: T, message?: string): WorkflowQueryResult<T> {
  return { data, source: 'production', message };
}

function mutationResult<T>(message: string, data: T): WorkflowMutationResult<T> {
  return { ok: true, persisted: true, source: 'production', message, data };
}

function profileInputToBackend(input: OrganizationProfileInput) {
  return {
    name: input.name,
    shortDescription: input.shortDescription,
    description: input.description,
    contactEmail: input.contactEmail,
    logoUrl: input.logoUrl,
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

    async listAnnouncements() {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>('/announcements', await activeHeaders());
      return queryResult(listItems(response).map(mapAnnouncement));
    },

    async toggleAnnouncementLike(announcementId, liked) {
      const response = await apiFetch<unknown>(`/announcements/${encodeURIComponent(announcementId)}/like`, await bodyInit(undefined, liked ? 'POST' : 'DELETE'));
      return mutationResult(liked ? 'Announcement liked.' : 'Announcement like removed.', mapAnnouncement(response));
    },

    async addAnnouncementComment(announcementId, body) {
      const response = await apiFetch<unknown>(`/announcements/${encodeURIComponent(announcementId)}/comments`, await bodyInit({ body }));
      return mutationResult('Comment added.', mapComment(response));
    },

    async listOrganizations() {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>('/organizations', await activeHeaders());
      return queryResult(listItems(response).map(mapOrganizationSummary));
    },

    async getOrganization(organizationId) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}`, await activeHeaders());
      return queryResult(response ? mapOrganizationProfile(response) : undefined);
    },

    async confirmExternalApplication(input: ApplicationConfirmationInput) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(input.organizationId)}/applications`, await bodyInit({
        opportunityId: input.opportunityId,
        externalFormOpened: input.externalFormOpened,
        confirmedExternalSubmission: input.confirmedExternalSubmission,
      }));
      return mutationResult('External submission confirmation recorded.', mapApplication(response));
    },

    async listMyApplications() {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>('/applications', await activeHeaders());
      return queryResult(listItems(response).map(mapApplication));
    },

    async listMeetingOptions() {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>('/date-entries?kind=availability', await activeHeaders());
      return queryResult(listItems(response).map(mapDateEntry));
    },

    async listMyMeetingRequests() {
      const response = await apiFetch<ListEnvelope<unknown> | unknown[]>('/meeting-requests', await activeHeaders());
      return queryResult(listItems(response).map(mapMeetingRequest));
    },

    async requestMeeting(input: MeetingRequestInput) {
      const response = await apiFetch<unknown>('/meeting-requests', await bodyInit(input));
      return mutationResult('Meeting request created as Pending.', mapMeetingRequest(response));
    },

    async getOfficerDashboard(organizationId, session: UserSession) {
      const [organization, announcements, applicants, dateEntries, meetingRequests] = await Promise.all([
        apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}`, await activeHeaders()),
        apiFetch<ListEnvelope<unknown> | unknown[]>(`/announcements?orgId=${encodeURIComponent(organizationId)}`, await activeHeaders()),
        apiFetch<ListEnvelope<unknown> | unknown[]>(`/organizations/${encodeURIComponent(organizationId)}/applications`, await activeHeaders()),
        apiFetch<ListEnvelope<unknown> | unknown[]>(`/organizations/${encodeURIComponent(organizationId)}/date-entries`, await activeHeaders()),
        apiFetch<ListEnvelope<unknown> | unknown[]>(`/organizations/${encodeURIComponent(organizationId)}/meeting-requests`, await activeHeaders()),
      ]);
      return queryResult<OfficerDashboard>({
        organization: mapOrganizationProfile(organization),
        announcements: listItems(announcements).map(mapAnnouncement),
        applicants: listItems(applicants).map(mapApplication),
        dateEntries: listItems(dateEntries).map(mapDateEntry),
        meetingRequests: listItems(meetingRequests).map(mapMeetingRequest),
      }, `Officer dashboard loaded for ${session.displayName}.`);
    },

    async saveOrganizationProfile(input: OrganizationProfileInput) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(input.organizationId)}`, await bodyInit(profileInputToBackend(input), 'PATCH'));
      return mutationResult('Organization profile saved.', mapOrganizationProfile(response));
    },

    async publishAnnouncement(input: AnnouncementInput) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(input.organizationId)}/announcements`, await bodyInit({ body: input.body, image: input.image }));
      return mutationResult('Announcement published.', mapAnnouncement(response));
    },

    async deleteAnnouncement(announcementId, organizationId) {
      await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}/announcements/${encodeURIComponent(announcementId)}`, await bodyInit(undefined, 'DELETE'));
      return { ok: true, persisted: true, source: 'production', message: 'Announcement deleted.' };
    },

    async updateApplicationStage(applicationId, stage: ApplicationStage, organizationId) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}/applications/${encodeURIComponent(applicationId)}/stage`, await bodyInit({ stage: toBackendStage(stage) }, 'PATCH'));
      return mutationResult(`Application moved to ${stage}.`, mapApplication(response));
    },

    async saveDateEntry(input: DateEntryInput) {
      const path = input.id
        ? `/organizations/${encodeURIComponent(input.organizationId)}/date-entries/${encodeURIComponent(input.id)}`
        : `/organizations/${encodeURIComponent(input.organizationId)}/date-entries`;
      const response = await apiFetch<unknown>(path, await bodyInit(dateInputToBackend(input), input.id ? 'PATCH' : 'POST'));
      return mutationResult(`${input.kind === 'event' ? 'Event' : 'Meeting availability'} saved.`, mapDateEntry(response));
    },

    async deleteDateEntry(dateEntryId, organizationId) {
      await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}/date-entries/${encodeURIComponent(dateEntryId)}`, await bodyInit(undefined, 'DELETE'));
      return { ok: true, persisted: true, source: 'production', message: 'Date entry removed.' };
    },

    async decideMeetingRequest(meetingRequestId, status: Exclude<MeetingStatus, 'Pending'>, organizationId) {
      const response = await apiFetch<unknown>(`/organizations/${encodeURIComponent(organizationId)}/meeting-requests/${encodeURIComponent(meetingRequestId)}/status`, await bodyInit({ status: toBackendMeetingStatus(status) }, 'PATCH'));
      return mutationResult(`Meeting request ${status.toLowerCase()}.`, mapMeetingRequest(response));
    },
  };
}
