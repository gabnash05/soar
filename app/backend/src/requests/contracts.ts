import type { Timestamp } from 'firebase-admin/firestore';
import type { AccountRole, ApplicationStatus, MeetingStatus, OrganizationDocument } from '../contracts/schema';

export interface ApplicationDocument {
  applicationId: string;
  studentUid: string;
  studentName: string;
  orgId: string;
  organizationName: string;
  opportunityId: string;
  opportunityTitle: string;
  status: ApplicationStatus;
  externalFormOpenedAt: Timestamp;
  externalSubmissionConfirmedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  reviewedByUid?: string;
  reviewedAt?: Timestamp;
}

export interface MeetingRequestDocumentFile {
  storagePath: string;
  fileName: string;
  contentType: 'application/pdf';
  sizeBytes: number;
}

export interface MeetingRequestDocument {
  meetingRequestId: string;
  requesterUid: string;
  requesterName: string;
  requesterRole: AccountRole;
  orgId: string;
  organizationName: string;
  dateEntryId: string;
  meetingTitle: string;
  requestedDate: string;
  requestedTime: string;
  status: MeetingStatus;
  note?: string;
  document?: MeetingRequestDocumentFile;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  decidedByUid?: string;
  decidedAt?: Timestamp;
}

export interface CalendarEntryDocument {
  orgId: string;
  organizationName?: string;
  kind: 'event' | 'availability';
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  details?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RecruitmentOpportunityRef {
  opportunityId: string;
  opportunityTitle: string;
  externalFormUrl?: string;
}

export interface ApplicationRecordResponse {
  id: string;
  organizationId: string;
  organizationName: string;
  opportunityId: string;
  opportunityTitle: string;
  studentUid: string;
  studentName: string;
  stage: ApplicationStatus;
  confirmedExternalSubmissionAt: string;
  updatedAt: string;
}

export interface MeetingRequestResponse {
  id: string;
  organizationId: string;
  organizationName: string;
  dateEntryId: string;
  meetingTitle: string;
  requesterUid: string;
  requesterName: string;
  requestedDate: string;
  requestedTime: string;
  status: MeetingStatus;
  note?: string;
  document?: MeetingRequestDocumentFile;
  updatedAt: string;
}

export interface RequestStore {
  getAccount(uid: string): Promise<{ uid: string; role: AccountRole; displayName: string } | undefined>;
  getOrganization(orgId: string): Promise<OrganizationDocument | undefined>;
  getOfficerGrant(orgId: string, uid: string): Promise<{ status?: string } | undefined>;
  getCalendarEntry(dateEntryId: string): Promise<CalendarEntryDocument | undefined>;
  createApplicationIfAbsent(applicationId: string, application: ApplicationDocument): Promise<'created' | 'exists' | 'closed' | 'organization_missing' | 'organization_deleting'>;
  getApplication(applicationId: string): Promise<ApplicationDocument | undefined>;
  listApplicationsByStudent(studentUid: string): Promise<ApplicationDocument[]>;
  listApplicationsByOrganization(orgId: string): Promise<ApplicationDocument[]>;
  updateApplicationStage(applicationId: string, orgId: string, status: ApplicationStatus, reviewerUid: string, reviewedAt: Timestamp): Promise<ApplicationDocument | undefined>;
  createMeetingIfAbsent(meetingRequestId: string, meeting: MeetingRequestDocument): Promise<'created' | 'exists' | 'organization_missing' | 'organization_deleting'>;
  getMeetingRequest(meetingRequestId: string): Promise<MeetingRequestDocument | undefined>;
  listMeetingsByRequester(requesterUid: string): Promise<MeetingRequestDocument[]>;
  listMeetingsByOrganization(orgId: string): Promise<MeetingRequestDocument[]>;
  updateMeetingStatus(meetingRequestId: string, orgId: string, status: MeetingStatus, decidedByUid: string, decidedAt: Timestamp): Promise<MeetingRequestDocument | undefined>;
}
