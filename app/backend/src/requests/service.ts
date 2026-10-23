import { createHash } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../firebase';
import { createSignedObjectUploadTarget, getStoredObjectMetadata } from '../storage/objectStorage';
import type { StoredObjectMetadata } from '../storage/objectStorage';
import { meetingRequestDocumentStoragePath } from '../contracts/paths';
import { requireActiveAccess } from '../identity/access';
import type { ApplicationStatus, MeetingStatus, OrganizationDocument } from '../contracts/schema';
import { AppError } from '../errors';
import { FirestoreRequestStore } from './firestoreStore';
import type {
  ApplicationDocument,
  ApplicationRecordResponse,
  CalendarEntryDocument,
  MeetingRequestDocument,
  MeetingRequestResponse,
  RecruitmentOpportunityRef,
  RequestStore
} from './contracts';
import {
  MAX_MEETING_DOCUMENT_SIZE_BYTES,
  MEETING_DOCUMENT_CONTENT_TYPES,
  applicationConfirmationSchema,
  applicationStageUpdateSchema,
  meetingDocumentTargetSchema,
  meetingRequestSchema,
  meetingStatusUpdateSchema
} from './validation';

export interface MeetingDocumentUploadCheck {
  document: {
    storagePath: string;
    fileName: string;
    contentType: 'application/pdf';
    sizeBytes: number;
  };
  requesterUid: string;
  orgId: string;
  meetingRequestId: string;
}

export interface RequestServiceDeps {
  store: RequestStore;
  ensureActiveAccess: (user: DecodedIdToken) => Promise<void>;
  now: () => Timestamp;
  verifyMeetingDocumentUpload: (check: MeetingDocumentUploadCheck) => Promise<void>;
}

export function verifyMeetingDocumentMetadata(check: MeetingDocumentUploadCheck, metadata: StoredObjectMetadata): void {
  const { document, requesterUid, orgId, meetingRequestId } = check;
  const custom = metadata.customMetadata;
  const actualSize = Number(metadata.sizeBytes ?? 0);
  if (metadata.contentType !== document.contentType || document.contentType !== 'application/pdf') {
    throw new AppError('meeting_document_type_mismatch', 'The uploaded formal request document must be a PDF.', 400);
  }
  if (!Number.isFinite(actualSize) || actualSize !== document.sizeBytes || actualSize <= 0 || actualSize > MAX_MEETING_DOCUMENT_SIZE_BYTES) {
    throw new AppError('meeting_document_size_mismatch', 'The uploaded formal request document size does not match the submitted metadata.', 400);
  }
  if (custom.orgId !== orgId || custom.meetingRequestId !== meetingRequestId || custom.requesterUid !== requesterUid) {
    const diagnostic = {
      event: 'meeting_document_metadata_binding_mismatch',
      metadataShape: metadata.metadataShape ?? 'unknown',
      contentTypeMatches: metadata.contentType === document.contentType,
      sizeMatches: actualSize === document.sizeBytes,
      organizationBindingPresent: typeof custom.orgId === 'string',
      organizationBindingMatches: custom.orgId === orgId,
      meetingBindingPresent: typeof custom.meetingRequestId === 'string',
      meetingBindingMatches: custom.meetingRequestId === meetingRequestId,
      requesterBindingPresent: typeof custom.requesterUid === 'string',
      requesterBindingMatches: custom.requesterUid === requesterUid,
    };
    console.error('Meeting document metadata verification failed', JSON.stringify(diagnostic));
    throw new AppError('meeting_document_metadata_mismatch', 'The uploaded formal request document is not linked to this requester and organization.', 400);
  }
}

async function verifyUploadedMeetingDocument(check: MeetingDocumentUploadCheck): Promise<void> {
  let metadata;
  try {
    metadata = await getStoredObjectMetadata(check.document.storagePath);
  } catch (error) {
    if (error instanceof AppError && error.code === 'storage_object_missing') {
      throw new AppError('meeting_document_missing', 'Upload the formal request PDF before submitting the meeting request.', 400);
    }
    throw error;
  }
  verifyMeetingDocumentMetadata(check, metadata);
}

const defaultDeps = (): RequestServiceDeps => ({
  store: new FirestoreRequestStore(db),
  ensureActiveAccess: requireActiveAccess,
  now: () => Timestamp.now(),
  verifyMeetingDocumentUpload: verifyUploadedMeetingDocument
});

function stableDocumentId(prefix: string, parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 32);
  return `${prefix}_${hash}`;
}

function meetingRequestIdFor(input: { organizationId: string; dateEntryId: string; requestedDate: string; requestedTime: string }, uid: string): string {
  return stableDocumentId('meeting', [uid, input.organizationId, input.dateEntryId, input.requestedDate, input.requestedTime]);
}

function sanitizeStorageFileName(fileName: string): string {
  return `${Date.now()}-${fileName.trim().replace(/\s+/g, '-')}`;
}

function assertMeetingDocumentPath(document: { storagePath: string }, orgId: string, meetingRequestId: string): void {
  const pattern = new RegExp(`^meeting-request-documents/${orgId}/${meetingRequestId}/[A-Za-z0-9][A-Za-z0-9._-]*\\.pdf$`, 'i');
  if (!pattern.test(document.storagePath)) {
    throw new AppError('invalid_meeting_document_path', 'Meeting request documents must stay under the matching organization and request folder.', 400);
  }
}

function slugPart(value: string): string {
  const slug = value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'recruitment';
}

function toIso(timestamp: Timestamp | undefined): string {
  return timestamp?.toDate().toISOString() ?? new Date(0).toISOString();
}

function applicationResponse(application: ApplicationDocument): ApplicationRecordResponse {
  return {
    id: application.applicationId,
    organizationId: application.orgId,
    organizationName: application.organizationName,
    opportunityId: application.opportunityId,
    opportunityTitle: application.opportunityTitle,
    studentUid: application.studentUid,
    studentName: application.studentName,
    stage: application.status,
    confirmedExternalSubmissionAt: toIso(application.externalSubmissionConfirmedAt),
    updatedAt: toIso(application.updatedAt)
  };
}

function meetingResponse(meeting: MeetingRequestDocument): MeetingRequestResponse {
  return {
    id: meeting.meetingRequestId,
    organizationId: meeting.orgId,
    organizationName: meeting.organizationName,
    dateEntryId: meeting.dateEntryId,
    meetingTitle: meeting.meetingTitle,
    requesterUid: meeting.requesterUid,
    requesterName: meeting.requesterName,
    requestedDate: meeting.requestedDate,
    requestedTime: meeting.requestedTime,
    status: meeting.status,
    note: meeting.note,
    document: meeting.document,
    updatedAt: toIso(meeting.updatedAt)
  };
}

function resolveRecruitmentOpportunity(organization: OrganizationDocument): RecruitmentOpportunityRef {
  const recruitment = organization.recruitment ?? {};
  const title = recruitment.title?.trim() || 'Recruitment';
  const opportunityId = recruitment.opportunityId?.trim() || `${organization.orgId}-${slugPart(title)}`;

  if (!recruitment.applicationLink) {
    throw new AppError('application_link_missing', 'This organization has not posted an external application form yet.', 409);
  }

  return {
    opportunityId,
    opportunityTitle: title,
    externalFormUrl: recruitment.applicationLink
  };
}

async function loadActorAccount(deps: RequestServiceDeps, user: DecodedIdToken) {
  const account = await deps.store.getAccount(user.uid);
  if (!account) {
    throw new AppError('account_missing', 'The account profile is missing.', 404, 'contact_support');
  }

  return account;
}

async function loadOrganization(deps: RequestServiceDeps, orgId: string): Promise<OrganizationDocument> {
  const organization = await deps.store.getOrganization(orgId);
  if (!organization) {
    throw new AppError('organization_missing', 'The organization was not found.', 404);
  }

  return organization;
}

function assertOrganizationWritable(organization: OrganizationDocument): void {
  if (organization.deletionStatus === 'deleting') {
    throw new AppError('organization_deleting', 'This organization is being deleted and cannot accept new requests or files.', 409);
  }
}

async function assertCanManageOrganization(deps: RequestServiceDeps, user: DecodedIdToken, orgId: string): Promise<OrganizationDocument> {
  const organization = await loadOrganization(deps, orgId);
  if (organization.ownerUid === user.uid) {
    return organization;
  }

  const grant = await deps.store.getOfficerGrant(orgId, user.uid);
  if (grant?.status === 'active') {
    return organization;
  }

  throw new AppError('not_organization_manager', 'Only approved officers for this organization can use this queue.', 403);
}

function assertAvailabilityEntry(entry: CalendarEntryDocument | undefined, organizationId: string): CalendarEntryDocument {
  if (!entry) {
    throw new AppError('date_entry_missing', 'The selected meeting or interview availability was not found.', 404);
  }

  if (entry.orgId !== organizationId) {
    throw new AppError('date_entry_organization_mismatch', 'The selected availability does not belong to that organization.', 409);
  }

  if (entry.kind !== 'availability') {
    throw new AppError('date_entry_not_availability', 'Choose a posted meeting or interview availability, not a general event.', 409);
  }

  return entry;
}

export function createRequestService(deps: RequestServiceDeps = defaultDeps()) {
  return {
    async confirmExternalApplication(user: DecodedIdToken, rawInput: unknown): Promise<ApplicationRecordResponse> {
      await deps.ensureActiveAccess(user);
      const input = applicationConfirmationSchema.parse(rawInput);
      const [account, organization] = await Promise.all([
        loadActorAccount(deps, user),
        loadOrganization(deps, input.organizationId)
      ]);

      if (account.role !== 'student') {
        throw new AppError('student_required', 'Only student accounts can confirm external application submissions.', 403);
      }

      assertOrganizationWritable(organization);
      if (organization.applicationsOpen === false) {
        throw new AppError('applications_closed', 'Applications are closed for this organization.', 409);
      }

      const opportunity = resolveRecruitmentOpportunity(organization);
      if (input.opportunityId !== opportunity.opportunityId) {
        throw new AppError('opportunity_mismatch', 'The selected recruitment opportunity is not currently posted by that organization.', 409);
      }

      const now = deps.now();
      const applicationId = stableDocumentId('app', [user.uid, input.organizationId]);
      const application: ApplicationDocument = {
        applicationId,
        studentUid: user.uid,
        studentName: account.displayName,
        orgId: organization.orgId,
        organizationName: organization.name,
        opportunityId: opportunity.opportunityId,
        opportunityTitle: opportunity.opportunityTitle,
        status: 'Pending',
        externalFormOpenedAt: now,
        externalSubmissionConfirmedAt: now,
        createdAt: now,
        updatedAt: now
      };

      const result = await deps.store.createApplicationIfAbsent(applicationId, application);
      if (result === 'organization_missing') {
        throw new AppError('organization_missing', 'The organization was not found.', 404);
      }
      if (result === 'organization_deleting') {
        throw new AppError('organization_deleting', 'This organization is being deleted and cannot accept new applications.', 409);
      }
      if (result === 'closed') {
        throw new AppError('applications_closed', 'Applications are closed for this organization.', 409);
      }
      if (result === 'exists') {
        throw new AppError('duplicate_application', 'You already have an application for this organization.', 409);
      }

      return applicationResponse(application);
    },

    async listMyApplications(user: DecodedIdToken): Promise<ApplicationRecordResponse[]> {
      await deps.ensureActiveAccess(user);
      const account = await loadActorAccount(deps, user);
      if (account.role !== 'student') {
        throw new AppError('student_required', 'Sponsors do not have an application tracker.', 403);
      }

      const applications = await deps.store.listApplicationsByStudent(user.uid);
      return applications.map(applicationResponse);
    },

    async listOrganizationApplications(user: DecodedIdToken, orgId: string): Promise<ApplicationRecordResponse[]> {
      await deps.ensureActiveAccess(user);
      await assertCanManageOrganization(deps, user, orgId);
      const applications = await deps.store.listApplicationsByOrganization(orgId);
      return applications.map(applicationResponse);
    },

    async updateApplicationStage(user: DecodedIdToken, applicationId: string, orgId: string, rawInput: unknown): Promise<ApplicationRecordResponse> {
      await deps.ensureActiveAccess(user);
      const input = applicationStageUpdateSchema.parse(rawInput);
      await assertCanManageOrganization(deps, user, orgId);
      const updated = await deps.store.updateApplicationStage(applicationId, orgId, input.status as ApplicationStatus, user.uid, deps.now());
      if (!updated) {
        throw new AppError('application_missing', 'The application record was not found for that organization.', 404);
      }

      return applicationResponse(updated);
    },

    async createMeetingDocumentTarget(user: DecodedIdToken, rawInput: unknown) {
      await deps.ensureActiveAccess(user);
      const input = meetingDocumentTargetSchema.parse(rawInput);
      await loadOrganization(deps, input.organizationId);
      const availability = assertAvailabilityEntry(await deps.store.getCalendarEntry(input.dateEntryId), input.organizationId);
      assertOrganizationWritable(await loadOrganization(deps, input.organizationId));
      const meetingRequestId = meetingRequestIdFor(input, user.uid);
      const storagePath = meetingRequestDocumentStoragePath(input.organizationId, meetingRequestId, sanitizeStorageFileName(input.fileName));
      const uploadTarget = await createSignedObjectUploadTarget(storagePath);
      assertOrganizationWritable(await loadOrganization(deps, input.organizationId));
      return {
        meetingRequestId,
        organizationId: input.organizationId,
        dateEntryId: input.dateEntryId,
        meetingTitle: availability.title,
        requestedDate: input.requestedDate,
        requestedTime: input.requestedTime,
        storagePath,
        ...(uploadTarget ?? {}),
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        allowedContentTypes: MEETING_DOCUMENT_CONTENT_TYPES,
        maxSizeBytes: MAX_MEETING_DOCUMENT_SIZE_BYTES
      };
    },

    async requestMeeting(user: DecodedIdToken, rawInput: unknown): Promise<MeetingRequestResponse> {
      await deps.ensureActiveAccess(user);
      const input = meetingRequestSchema.parse(rawInput);
      const [account, organization, entry] = await Promise.all([
        loadActorAccount(deps, user),
        loadOrganization(deps, input.organizationId),
        deps.store.getCalendarEntry(input.dateEntryId)
      ]);
      if (account.role !== 'student' && account.role !== 'sponsor') {
        throw new AppError('requester_role_not_supported', 'Only student and sponsor accounts can request meetings.', 403);
      }
      assertOrganizationWritable(organization);
      const availability = assertAvailabilityEntry(entry, input.organizationId);
      const now = deps.now();
      const meetingRequestId = meetingRequestIdFor(input, user.uid);
      if (input.document) {
        assertMeetingDocumentPath(input.document, input.organizationId, meetingRequestId);
        await deps.verifyMeetingDocumentUpload({
          document: input.document,
          requesterUid: user.uid,
          orgId: input.organizationId,
          meetingRequestId
        });
      }
      const meeting: MeetingRequestDocument = {
        meetingRequestId,
        requesterUid: user.uid,
        requesterName: account.displayName,
        requesterRole: account.role,
        orgId: organization.orgId,
        organizationName: organization.name,
        dateEntryId: input.dateEntryId,
        meetingTitle: availability.title,
        requestedDate: input.requestedDate,
        requestedTime: input.requestedTime,
        status: 'Pending',
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        createdAt: now,
        updatedAt: now
      };

      const result = await deps.store.createMeetingIfAbsent(meetingRequestId, meeting);
      if (result === 'organization_missing') {
        throw new AppError('organization_missing', 'The organization was not found.', 404);
      }
      if (result === 'organization_deleting') {
        throw new AppError('organization_deleting', 'This organization is being deleted and cannot accept new requests.', 409);
      }
      if (result === 'exists') {
        throw new AppError('duplicate_meeting_request', 'You already requested that exact meeting date and time.', 409);
      }

      return meetingResponse(meeting);
    },

    async listMyMeetings(user: DecodedIdToken): Promise<MeetingRequestResponse[]> {
      await deps.ensureActiveAccess(user);
      const meetings = await deps.store.listMeetingsByRequester(user.uid);
      return meetings.map(meetingResponse);
    },

    async getMeetingDocument(user: DecodedIdToken, meetingRequestId: string) {
      await deps.ensureActiveAccess(user);
      const meeting = await deps.store.getMeetingRequest(meetingRequestId);
      if (!meeting) {
        throw new AppError('meeting_request_missing', 'The meeting request was not found.', 404);
      }
      if (!meeting.document) {
        throw new AppError('meeting_document_missing', 'This meeting request does not have a formal request document.', 404);
      }
      if (meeting.requesterUid !== user.uid) {
        await assertCanManageOrganization(deps, user, meeting.orgId);
      }
      return {
        meetingRequestId: meeting.meetingRequestId,
        organizationId: meeting.orgId,
        requesterUid: meeting.requesterUid,
        document: meeting.document
      };
    },

    async listOrganizationMeetings(user: DecodedIdToken, orgId: string): Promise<MeetingRequestResponse[]> {
      await deps.ensureActiveAccess(user);
      await assertCanManageOrganization(deps, user, orgId);
      const meetings = await deps.store.listMeetingsByOrganization(orgId);
      return meetings.map(meetingResponse);
    },

    async updateMeetingStatus(user: DecodedIdToken, meetingRequestId: string, orgId: string, rawInput: unknown): Promise<MeetingRequestResponse> {
      await deps.ensureActiveAccess(user);
      const input = meetingStatusUpdateSchema.parse(rawInput);
      await assertCanManageOrganization(deps, user, orgId);
      const updated = await deps.store.updateMeetingStatus(meetingRequestId, orgId, input.status as MeetingStatus, user.uid, deps.now());
      if (!updated) {
        throw new AppError('meeting_request_missing', 'The meeting request was not found for that organization.', 404);
      }

      return meetingResponse(updated);
    }
  };
}

export const requestService = createRequestService();
