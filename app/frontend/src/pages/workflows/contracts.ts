import type { ApplicationStage, MeetingStatus, UserSession } from '../../lib/contracts';

export type WorkflowDataMode = 'fixture' | 'production' | 'unavailable';

export interface WorkflowQueryResult<T> {
  data: T;
  source: WorkflowDataMode;
  message?: string;
}

export interface WorkflowMutationResult<T = undefined> {
  ok: boolean;
  persisted: boolean | 'unconfirmed';
  source: WorkflowDataMode;
  message: string;
  data?: T;
  reason?: 'validation' | 'permission' | 'duplicate' | 'closed' | 'unavailable' | 'not-found' | 'error';
}

export interface WorkflowImage {
  url: string;
  alt: string;
  file?: File;
  storagePath?: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface AnnouncementComment {
  id: string;
  authorUid?: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  viewerCanEdit?: boolean;
  viewerCanDelete?: boolean;
}

export interface Announcement {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string;
  createdAt: string;
  body: string;
  image?: WorkflowImage;
  media?: WorkflowImage[];
  deepLinkPath?: string;
  likeCount: number;
  viewerHasLiked: boolean;
  commentCount?: number;
  comments: AnnouncementComment[];
}

export type RecruitmentAudience = 'students' | 'meetings-only';

export interface RecruitmentOpportunity {
  id: string;
  organizationId: string;
  title: string;
  requirements: string;
  instructions: string;
  externalFormUrl?: string;
  audience: RecruitmentAudience;
}

export type DateEntryKind = 'event' | 'availability';

export interface DateEntry {
  id: string;
  organizationId: string;
  organizationName: string;
  kind: DateEntryKind;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  details: string;
}

export interface OrganizationSummary {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string;
  logoPath?: string;
  shortDescription: string;
  contactEmail: string;
  contactPhone?: string;
  recruitmentTitle: string;
  department?: string;
  departmentKey?: string;
}

export interface OrganizationProfile extends OrganizationSummary {
  description: string;
  applicationsOpen?: boolean;
  recruitment: RecruitmentOpportunity;
  posts: Announcement[];
  dateEntries: DateEntry[];
}

export interface ApplicationRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  opportunityId: string;
  opportunityTitle: string;
  studentUid: string;
  studentName: string;
  stage: ApplicationStage;
  confirmedExternalSubmissionAt: string;
  updatedAt: string;
}

export interface MeetingRequestDocument {
  storagePath: string;
  fileName: string;
  contentType: 'application/pdf';
  sizeBytes: number;
}

export interface MeetingRequestDocumentInput {
  file: File;
  fileName: string;
  contentType: 'application/pdf';
  sizeBytes: number;
}

export interface MeetingRequest {
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
  document?: MeetingRequestDocument;
  updatedAt: string;
}

export interface ApplicationConfirmationInput {
  organizationId: string;
  opportunityId: string;
  externalFormOpened: boolean;
  confirmedExternalSubmission: boolean;
}

export interface MeetingRequestInput {
  organizationId: string;
  dateEntryId: string;
  requestedDate: string;
  requestedTime: string;
  note?: string;
  document?: MeetingRequestDocumentInput;
}

export interface OrganizationProfileInput {
  organizationId: string;
  name: string;
  logoUrl?: string;
  logoPath?: string;
  logoFile?: File;
  description: string;
  shortDescription: string;
  contactEmail: string;
  contactPhone?: string;
  recruitmentTitle: string;
  recruitmentRequirements: string;
  recruitmentInstructions: string;
  externalFormUrl?: string;
}

export interface AnnouncementInput {
  organizationId: string;
  body: string;
  image?: WorkflowImage;
  media?: WorkflowImage[];
}

export interface DateEntryInput {
  id?: string;
  idempotencyKey?: string;
  organizationId: string;
  kind: DateEntryKind;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  details: string;
}

export interface OfficerDashboard {
  organization: OrganizationProfile;
  announcements: Announcement[];
  applicants: ApplicationRecord[];
  dateEntries: DateEntry[];
  meetingRequests: MeetingRequest[];
}

export interface OrganizationDepartmentStudentCount {
  organizationId: string;
  department: string;
  departmentKey: string;
  registeredStudentCount: number;
  scope: 'registered_students_in_organization_department';
  description: string;
  generatedAt: string;
}

export interface AnnouncementPage {
  items: Announcement[];
  nextPageToken?: string;
}

export interface WorkflowDataClient {
  readonly mode: WorkflowDataMode;
  readonly label: string;
  listAnnouncements(session: UserSession, page?: { limit: number; pageToken?: string }): Promise<WorkflowQueryResult<AnnouncementPage>>;
  getAnnouncement(announcementId: string, session: UserSession): Promise<WorkflowQueryResult<Announcement | undefined>>;
  listAnnouncementComments(announcementId: string, session: UserSession): Promise<WorkflowQueryResult<AnnouncementComment[]>>;
  toggleAnnouncementLike(announcementId: string, liked: boolean, session: UserSession): Promise<WorkflowMutationResult<Announcement>>;
  addAnnouncementComment(announcementId: string, body: string, session: UserSession): Promise<WorkflowMutationResult<AnnouncementComment>>;
  updateAnnouncementComment(announcementId: string, commentId: string, body: string, session: UserSession): Promise<WorkflowMutationResult<AnnouncementComment>>;
  deleteAnnouncementComment(announcementId: string, commentId: string, session: UserSession): Promise<WorkflowMutationResult>;

  listOrganizations(session: UserSession): Promise<WorkflowQueryResult<OrganizationSummary[]>>;
  getOrganization(organizationId: string, session: UserSession): Promise<WorkflowQueryResult<OrganizationProfile | undefined>>;

  confirmExternalApplication(input: ApplicationConfirmationInput, session: UserSession): Promise<WorkflowMutationResult<ApplicationRecord>>;
  listMyApplications(session: UserSession): Promise<WorkflowQueryResult<ApplicationRecord[]>>;

  listMeetingOptions(session: UserSession): Promise<WorkflowQueryResult<DateEntry[]>>;
  listMyMeetingRequests(session: UserSession): Promise<WorkflowQueryResult<MeetingRequest[]>>;
  requestMeeting(input: MeetingRequestInput, session: UserSession): Promise<WorkflowMutationResult<MeetingRequest>>;

  getOfficerDashboard(organizationId: string, session: UserSession): Promise<WorkflowQueryResult<OfficerDashboard | undefined>>;
  saveOrganizationProfile(input: OrganizationProfileInput, session: UserSession): Promise<WorkflowMutationResult<OrganizationProfile>>;
  setApplicationsOpen(organizationId: string, applicationsOpen: boolean, session: UserSession): Promise<WorkflowMutationResult<{ applicationsOpen: boolean }>>;
  publishAnnouncement(input: AnnouncementInput, session: UserSession): Promise<WorkflowMutationResult<Announcement>>;
  deleteAnnouncement(announcementId: string, organizationId: string, session: UserSession): Promise<WorkflowMutationResult>;
  getOrganizationDepartmentStudentCount(organizationId: string, session: UserSession): Promise<WorkflowQueryResult<OrganizationDepartmentStudentCount | undefined>>;
  updateApplicationStage(applicationId: string, stage: ApplicationStage, organizationId: string, session: UserSession): Promise<WorkflowMutationResult<ApplicationRecord>>;
  saveDateEntry(input: DateEntryInput, session: UserSession, signal?: AbortSignal): Promise<WorkflowMutationResult<DateEntry>>;
  deleteDateEntry(dateEntryId: string, organizationId: string, session: UserSession): Promise<WorkflowMutationResult>;
  decideMeetingRequest(meetingRequestId: string, status: Exclude<MeetingStatus, 'Pending'>, organizationId: string, session: UserSession): Promise<WorkflowMutationResult<MeetingRequest>>;
}
