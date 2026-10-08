import type { ApplicationStage, MeetingStatus, UserSession } from '../../lib/contracts';

export type WorkflowDataMode = 'fixture' | 'unavailable';

export interface WorkflowQueryResult<T> {
  data: T;
  source: WorkflowDataMode;
  message?: string;
}

export interface WorkflowMutationResult<T = undefined> {
  ok: boolean;
  persisted: boolean;
  source: WorkflowDataMode;
  message: string;
  data?: T;
  reason?: 'validation' | 'permission' | 'duplicate' | 'unavailable' | 'not-found' | 'error';
}

export interface WorkflowImage {
  url: string;
  alt: string;
}

export interface AnnouncementComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string;
  createdAt: string;
  body: string;
  image?: WorkflowImage;
  likeCount: number;
  viewerHasLiked: boolean;
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
  shortDescription: string;
  contactEmail: string;
  recruitmentTitle: string;
}

export interface OrganizationProfile extends OrganizationSummary {
  description: string;
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
}

export interface OrganizationProfileInput {
  organizationId: string;
  name: string;
  logoUrl?: string;
  description: string;
  shortDescription: string;
  contactEmail: string;
  recruitmentTitle: string;
  recruitmentRequirements: string;
  recruitmentInstructions: string;
  externalFormUrl?: string;
}

export interface AnnouncementInput {
  organizationId: string;
  body: string;
  image?: WorkflowImage;
}

export interface DateEntryInput {
  id?: string;
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

export interface WorkflowDataClient {
  readonly mode: WorkflowDataMode;
  readonly label: string;
  listAnnouncements(session: UserSession): Promise<WorkflowQueryResult<Announcement[]>>;
  toggleAnnouncementLike(announcementId: string, liked: boolean, session: UserSession): Promise<WorkflowMutationResult<Announcement>>;
  addAnnouncementComment(announcementId: string, body: string, session: UserSession): Promise<WorkflowMutationResult<AnnouncementComment>>;

  listOrganizations(session: UserSession): Promise<WorkflowQueryResult<OrganizationSummary[]>>;
  getOrganization(organizationId: string, session: UserSession): Promise<WorkflowQueryResult<OrganizationProfile | undefined>>;

  confirmExternalApplication(input: ApplicationConfirmationInput, session: UserSession): Promise<WorkflowMutationResult<ApplicationRecord>>;
  listMyApplications(session: UserSession): Promise<WorkflowQueryResult<ApplicationRecord[]>>;

  listMeetingOptions(session: UserSession): Promise<WorkflowQueryResult<DateEntry[]>>;
  listMyMeetingRequests(session: UserSession): Promise<WorkflowQueryResult<MeetingRequest[]>>;
  requestMeeting(input: MeetingRequestInput, session: UserSession): Promise<WorkflowMutationResult<MeetingRequest>>;

  getOfficerDashboard(organizationId: string, session: UserSession): Promise<WorkflowQueryResult<OfficerDashboard | undefined>>;
  saveOrganizationProfile(input: OrganizationProfileInput, session: UserSession): Promise<WorkflowMutationResult<OrganizationProfile>>;
  publishAnnouncement(input: AnnouncementInput, session: UserSession): Promise<WorkflowMutationResult<Announcement>>;
  deleteAnnouncement(announcementId: string, organizationId: string, session: UserSession): Promise<WorkflowMutationResult>;
  updateApplicationStage(applicationId: string, stage: ApplicationStage, organizationId: string, session: UserSession): Promise<WorkflowMutationResult<ApplicationRecord>>;
  saveDateEntry(input: DateEntryInput, session: UserSession): Promise<WorkflowMutationResult<DateEntry>>;
  deleteDateEntry(dateEntryId: string, organizationId: string, session: UserSession): Promise<WorkflowMutationResult>;
  decideMeetingRequest(meetingRequestId: string, status: Exclude<MeetingStatus, 'Pending'>, organizationId: string, session: UserSession): Promise<WorkflowMutationResult<MeetingRequest>>;
}
