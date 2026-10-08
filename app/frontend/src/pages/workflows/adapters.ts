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
import {
  compareDateEntries,
  hasDuplicateApplication,
  hasDuplicateMeetingRequest,
  isApprovedOfficerFor,
  isSponsor,
  todayIsoDate,
  validateMeetingRequest,
} from './workflowUtils';
import { createProductionWorkflowDataClient } from './apiClient';

const unavailableMessage = 'Workflow services for announcements, organizations, applications, meetings, and officer tools are not connected yet. No sample save is live backend persistence.';

type BackendGatewayMode = 'production' | 'fixture';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function unavailableQuery<T>(data: T): Promise<WorkflowQueryResult<T>> {
  return Promise.resolve({ data, source: 'unavailable', message: unavailableMessage });
}

function unavailableMutation<T = undefined>(): Promise<WorkflowMutationResult<T>> {
  return Promise.resolve({
    ok: false,
    persisted: false,
    source: 'unavailable',
    reason: 'unavailable',
    message: unavailableMessage,
  });
}

export const unavailableWorkflowDataClient: WorkflowDataClient = {
  mode: 'unavailable',
  label: 'Workflow services unavailable',
  listAnnouncements: () => unavailableQuery<Announcement[]>([]),
  toggleAnnouncementLike: () => unavailableMutation<Announcement>(),
  addAnnouncementComment: () => unavailableMutation<AnnouncementComment>(),
  listOrganizations: () => unavailableQuery<OrganizationSummary[]>([]),
  getOrganization: () => unavailableQuery<OrganizationProfile | undefined>(undefined),
  confirmExternalApplication: () => unavailableMutation<ApplicationRecord>(),
  listMyApplications: () => unavailableQuery<ApplicationRecord[]>([]),
  listMeetingOptions: () => unavailableQuery<DateEntry[]>([]),
  listMyMeetingRequests: () => unavailableQuery<MeetingRequest[]>([]),
  requestMeeting: () => unavailableMutation<MeetingRequest>(),
  getOfficerDashboard: () => unavailableQuery<OfficerDashboard | undefined>(undefined),
  saveOrganizationProfile: () => unavailableMutation<OrganizationProfile>(),
  publishAnnouncement: () => unavailableMutation<Announcement>(),
  deleteAnnouncement: () => unavailableMutation(),
  updateApplicationStage: () => unavailableMutation<ApplicationRecord>(),
  saveDateEntry: () => unavailableMutation<DateEntry>(),
  deleteDateEntry: () => unavailableMutation(),
  decideMeetingRequest: () => unavailableMutation<MeetingRequest>(),
};

const initialDateEntries: DateEntry[] = [
  {
    id: 'date-robotics-build-night',
    organizationId: 'robotics',
    organizationName: 'Robotics Guild',
    kind: 'event',
    title: 'Build Night',
    date: '2026-11-09',
    startTime: '18:00',
    details: 'Open lab night for students interested in robotics projects.',
  },
  {
    id: 'date-robotics-interview',
    organizationId: 'robotics',
    organizationName: 'Robotics Guild',
    kind: 'availability',
    title: 'Build Team interview window',
    date: '2026-11-12',
    startTime: '14:00',
    endTime: '16:00',
    details: 'Request one time during this window after submitting the external form.',
  },
  {
    id: 'date-literary-open-mic',
    organizationId: 'literary',
    organizationName: 'Literary Circle',
    kind: 'event',
    title: 'Open Mic Night',
    date: '2026-11-10',
    startTime: '17:30',
    details: 'Campus reading night and publication interest session.',
  },
  {
    id: 'date-literary-crew-interview',
    organizationId: 'literary',
    organizationName: 'Literary Circle',
    kind: 'availability',
    title: 'Open Mic crew interview',
    date: '2026-11-13',
    startTime: '13:00',
    endTime: '15:00',
    details: 'Request a short meeting with the Literary Circle officers.',
  },
  {
    id: 'date-health-briefing',
    organizationId: 'health',
    organizationName: 'Campus Health Alliance',
    kind: 'event',
    title: 'Volunteer briefing',
    date: '2026-11-08',
    startTime: '10:00',
    details: 'Orientation for the wellness campaign volunteer drive.',
  },
  {
    id: 'date-health-partner-meeting',
    organizationId: 'health',
    organizationName: 'Campus Health Alliance',
    kind: 'availability',
    title: 'Partner meeting slot',
    date: '2026-11-14',
    startTime: '09:00',
    endTime: '11:00',
    details: 'Sponsors and students can request this discussion slot.',
  },
];

const initialOrganizations: OrganizationProfile[] = [
  {
    id: 'robotics',
    slug: 'robotics-guild',
    name: 'Robotics Guild',
    logoUrl: '',
    shortDescription: 'Builds robots, runs workshops, and recruits student makers.',
    description: 'Robotics Guild helps students design practical builds, share lab time, and prepare for competitions through hands-on teams.',
    contactEmail: 'robotics@example.edu',
    recruitmentTitle: 'Build Team 2026',
    recruitment: {
      id: 'robotics-build-team-2026',
      organizationId: 'robotics',
      title: 'Build Team 2026',
      requirements: 'Interested students, weekly build availability, and a short external form response.',
      instructions: 'Open the external Google Form, submit it there, then return to SOAR and explicitly confirm the external submission.',
      externalFormUrl: 'https://forms.gle/example-robotics-build-team',
      audience: 'students',
    },
    posts: [],
    dateEntries: [],
  },
  {
    id: 'literary',
    slug: 'literary-circle',
    name: 'Literary Circle',
    logoUrl: '',
    shortDescription: 'Hosts open mic nights, writing circles, and campus publications.',
    description: 'Literary Circle creates a welcoming space for writers, editors, performers, and students who want to publish or perform work.',
    contactEmail: 'literary@example.edu',
    recruitmentTitle: 'Open Mic Crew',
    recruitment: {
      id: 'literary-open-mic-crew',
      organizationId: 'literary',
      title: 'Open Mic Crew',
      requirements: 'Students available for event preparation, stage support, or publication editing.',
      instructions: 'Submit the external interest form, then confirm in SOAR so officers know to check the sheet.',
      externalFormUrl: 'https://forms.gle/example-literary-open-mic',
      audience: 'students',
    },
    posts: [],
    dateEntries: [],
  },
  {
    id: 'health',
    slug: 'campus-health-alliance',
    name: 'Campus Health Alliance',
    logoUrl: '',
    shortDescription: 'Coordinates wellness campaigns and volunteer drives.',
    description: 'Campus Health Alliance organizes wellness information drives and service opportunities with allied campus partners.',
    contactEmail: 'health@example.edu',
    recruitmentTitle: 'Wellness Volunteers',
    recruitment: {
      id: 'health-wellness-volunteers',
      organizationId: 'health',
      title: 'Wellness Volunteers',
      requirements: 'Students interested in campus wellness, service coordination, and briefing attendance.',
      instructions: 'Open the external volunteer form, submit it, then confirm the submission in SOAR.',
      externalFormUrl: 'https://forms.gle/example-health-volunteers',
      audience: 'students',
    },
    posts: [],
    dateEntries: [],
  },
];

const initialAnnouncements: Announcement[] = [
  {
    id: 'post-robotics-tryouts',
    organizationId: 'robotics',
    organizationName: 'Robotics Guild',
    createdAt: '2026-10-07T08:00:00.000Z',
    body: 'Tryouts and build night are scheduled this Friday. Open the profile for requirements and meeting availability.',
    image: {
      url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
      alt: 'Electronics workbench with small robotics parts',
    },
    likeCount: 12,
    viewerHasLiked: false,
    comments: [
      { id: 'comment-1', authorName: 'Mara Santos', body: 'Is the interview window open to first-year students?', createdAt: '2026-10-07T09:00:00.000Z' },
    ],
  },
  {
    id: 'post-literary-open-mic',
    organizationId: 'literary',
    organizationName: 'Literary Circle',
    createdAt: '2026-10-06T13:00:00.000Z',
    body: 'Open mic signup is available now. New volunteers can review the profile and external form instructions.',
    likeCount: 7,
    viewerHasLiked: true,
    comments: [],
  },
  {
    id: 'post-health-briefing',
    organizationId: 'health',
    organizationName: 'Campus Health Alliance',
    createdAt: '2026-10-05T11:30:00.000Z',
    body: 'Volunteer briefing slots are posted. Pending meeting requests are not confirmed until an officer approves them.',
    likeCount: 4,
    viewerHasLiked: false,
    comments: [],
  },
];

const initialApplications: ApplicationRecord[] = [
  {
    id: 'app-student-1-robotics',
    organizationId: 'robotics',
    organizationName: 'Robotics Guild',
    opportunityId: 'robotics-build-team-2026',
    opportunityTitle: 'Build Team 2026',
    studentUid: 'student-1',
    studentName: 'Mara Santos',
    stage: 'Pending',
    confirmedExternalSubmissionAt: '2026-10-07T08:40:00.000Z',
    updatedAt: '2026-10-07T08:40:00.000Z',
  },
  {
    id: 'app-student-1-literary',
    organizationId: 'literary',
    organizationName: 'Literary Circle',
    opportunityId: 'literary-open-mic-crew',
    opportunityTitle: 'Open Mic Crew',
    studentUid: 'student-1',
    studentName: 'Mara Santos',
    stage: 'Under review',
    confirmedExternalSubmissionAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T14:00:00.000Z',
  },
  {
    id: 'app-student-4-robotics',
    organizationId: 'robotics',
    organizationName: 'Robotics Guild',
    opportunityId: 'robotics-build-team-2026',
    opportunityTitle: 'Build Team 2026',
    studentUid: 'student-4',
    studentName: 'Ben Garcia',
    stage: 'Accepted',
    confirmedExternalSubmissionAt: '2026-10-04T10:00:00.000Z',
    updatedAt: '2026-10-06T12:00:00.000Z',
  },
];

const initialMeetingRequests: MeetingRequest[] = [
  {
    id: 'meeting-student-1-health',
    organizationId: 'health',
    organizationName: 'Campus Health Alliance',
    dateEntryId: 'date-health-partner-meeting',
    meetingTitle: 'Partner meeting slot',
    requesterUid: 'student-1',
    requesterName: 'Mara Santos',
    requestedDate: '2026-11-14',
    requestedTime: '09:30',
    status: 'Approved',
    note: 'Interested in the volunteer drive.',
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
  {
    id: 'meeting-student-1-robotics',
    organizationId: 'robotics',
    organizationName: 'Robotics Guild',
    dateEntryId: 'date-robotics-interview',
    meetingTitle: 'Build Team interview window',
    requesterUid: 'student-1',
    requesterName: 'Mara Santos',
    requestedDate: '2026-11-12',
    requestedTime: '14:00',
    status: 'Pending',
    note: 'Application submitted externally.',
    updatedAt: '2026-10-07T10:15:00.000Z',
  },
  {
    id: 'meeting-sponsor-1-robotics',
    organizationId: 'robotics',
    organizationName: 'Robotics Guild',
    dateEntryId: 'date-robotics-interview',
    meetingTitle: 'Build Team interview window',
    requesterUid: 'sponsor-1',
    requesterName: 'Ari Reyes',
    requestedDate: '2026-11-12',
    requestedTime: '15:00',
    status: 'Pending',
    note: 'Discuss possible support for workshop materials.',
    updatedAt: '2026-10-07T11:00:00.000Z',
  },
];

function toSummary(profile: OrganizationProfile): OrganizationSummary {
  return {
    id: profile.id,
    slug: profile.slug,
    name: profile.name,
    logoUrl: profile.logoUrl,
    shortDescription: profile.shortDescription,
    contactEmail: profile.contactEmail,
    recruitmentTitle: profile.recruitmentTitle,
  };
}

function success<T>(message: string, data: T): WorkflowMutationResult<T> {
  return { ok: true, persisted: true, source: 'fixture', message, data };
}

function failure<T>(reason: WorkflowMutationResult<T>['reason'], message: string): WorkflowMutationResult<T> {
  return { ok: false, persisted: false, source: 'fixture', reason, message };
}

export function createFixtureWorkflowDataClient(): WorkflowDataClient {
  let organizations = clone(initialOrganizations);
  let dateEntries = clone(initialDateEntries);
  let announcements = clone(initialAnnouncements);
  let applications = clone(initialApplications);
  let meetingRequests = clone(initialMeetingRequests);
  let nextId = 1000;

  function getOrganizationById(idOrSlug: string): OrganizationProfile | undefined {
    const normalizedId = idOrSlug === 'coding-society' ? 'robotics' : idOrSlug;
    return organizations.find((organization) => organization.id === normalizedId || organization.slug === normalizedId);
  }

  function hydrateOrganization(profile: OrganizationProfile): OrganizationProfile {
    return {
      ...clone(profile),
      posts: announcements.filter((announcement) => announcement.organizationId === profile.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      dateEntries: dateEntries.filter((entry) => entry.organizationId === profile.id).sort(compareDateEntries),
    };
  }

  function assertOfficer<T = undefined>(organizationId: string, session: UserSession): WorkflowMutationResult<T> | undefined {
    if (!isApprovedOfficerFor(session, organizationId)) {
      return failure<T>('permission', 'Only approved officers for this organization can make this change.');
    }
    return undefined;
  }

  return {
    mode: 'fixture',
    label: 'Workflow fixture data',

    async listAnnouncements() {
      return {
        data: clone(announcements).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        source: 'fixture',
        message: 'Development fixture mode: visible UI state changes are local only.',
      };
    },

    async toggleAnnouncementLike(announcementId, liked) {
      const announcement = announcements.find((item) => item.id === announcementId);
      if (!announcement) return failure('not-found', 'Announcement not found.');
      const wasLiked = announcement.viewerHasLiked;
      announcement.viewerHasLiked = liked;
      if (liked && !wasLiked) announcement.likeCount += 1;
      if (!liked && wasLiked) announcement.likeCount = Math.max(0, announcement.likeCount - 1);
      return success(liked ? 'Liked in workflow fixture mode.' : 'Like removed in workflow fixture mode.', clone(announcement));
    },

    async addAnnouncementComment(announcementId, body, session) {
      const trimmed = body.trim();
      if (!trimmed) return failure('validation', 'Enter a comment before posting.');
      const announcement = announcements.find((item) => item.id === announcementId);
      if (!announcement) return failure('not-found', 'Announcement not found.');
      const comment: AnnouncementComment = {
        id: `comment-${nextId++}`,
        authorName: session.displayName,
        body: trimmed,
        createdAt: new Date().toISOString(),
      };
      announcement.comments.push(comment);
      return success('Comment added in workflow fixture mode only.', clone(comment));
    },

    async listOrganizations() {
      return {
        data: clone(organizations.map(toSummary)),
        source: 'fixture',
        message: 'Development fixture mode: organization records are local samples.',
      };
    },

    async getOrganization(organizationId) {
      const organization = getOrganizationById(organizationId);
      return {
        data: organization ? hydrateOrganization(organization) : undefined,
        source: 'fixture',
        message: organization ? 'Development fixture mode: profile data is local.' : 'Organization not found in fixture data.',
      };
    },

    async confirmExternalApplication(input, session) {
      if (isSponsor(session)) return failure('permission', 'Sponsors do not have application tools.');
      if (!input.externalFormOpened) return failure('validation', 'Open the external form link from SOAR before confirming. Opening still does not prove external submission.');
      if (!input.confirmedExternalSubmission) return failure('validation', 'Confirm the external form was submitted before adding a tracker entry.');
      const organization = getOrganizationById(input.organizationId);
      if (!organization || organization.recruitment.id !== input.opportunityId) return failure('not-found', 'Recruitment opportunity not found.');
      if (hasDuplicateApplication(applications, session.uid, input.opportunityId)) {
        return failure('duplicate', 'This student already has a tracker entry for this recruitment opportunity.');
      }
      const now = new Date().toISOString();
      const application: ApplicationRecord = {
        id: `app-${session.uid}-${input.opportunityId}`,
        organizationId: organization.id,
        organizationName: organization.name,
        opportunityId: organization.recruitment.id,
        opportunityTitle: organization.recruitment.title,
        studentUid: session.uid,
        studentName: session.displayName,
        stage: 'Pending',
        confirmedExternalSubmissionAt: now,
        updatedAt: now,
      };
      applications.unshift(application);
      return success('External submission confirmation recorded in fixture mode as Pending. Production must enforce duplicates server-side.', clone(application));
    },

    async listMyApplications(session) {
      const data = isSponsor(session) ? [] : applications.filter((application) => application.studentUid === session.uid);
      return {
        data: clone(data),
        source: 'fixture',
        message: isSponsor(session) ? 'Sponsors do not have application tracker data.' : 'Development fixture mode: tracker rows are local samples.',
      };
    },

    async listMeetingOptions() {
      return {
        data: clone(dateEntries.filter((entry) => entry.kind === 'availability').sort(compareDateEntries)),
        source: 'fixture',
        message: 'Development fixture mode: availability is local sample data.',
      };
    },

    async listMyMeetingRequests(session) {
      return {
        data: clone(meetingRequests.filter((request) => request.requesterUid === session.uid)),
        source: 'fixture',
        message: 'Development fixture mode: requests are local samples and Pending is not booked.',
      };
    },

    async requestMeeting(input, session) {
      const validation = validateMeetingRequest(input);
      if (validation) return failure('validation', validation);
      const entry = dateEntries.find((item) => item.id === input.dateEntryId && item.kind === 'availability');
      if (!entry) return failure('not-found', 'Choose a posted meeting or interview availability.');
      const organization = getOrganizationById(input.organizationId);
      if (!organization) return failure('not-found', 'Organization not found.');
      if (hasDuplicateMeetingRequest(meetingRequests, input, session.uid)) {
        return failure('duplicate', 'A repeated identical request already exists. Pending requests are not confirmed bookings.');
      }
      const request: MeetingRequest = {
        id: `meeting-${session.uid}-${nextId++}`,
        organizationId: organization.id,
        organizationName: organization.name,
        dateEntryId: entry.id,
        meetingTitle: entry.title,
        requesterUid: session.uid,
        requesterName: session.displayName,
        requestedDate: input.requestedDate,
        requestedTime: input.requestedTime,
        status: 'Pending',
        note: input.note?.trim(),
        updatedAt: new Date().toISOString(),
      };
      meetingRequests.unshift(request);
      return success('Meeting request created as Pending in fixture mode. It is not a confirmed booking.', clone(request));
    },

    async getOfficerDashboard(organizationId, session) {
      if (!isApprovedOfficerFor(session, organizationId)) {
        return { data: undefined, source: 'fixture', message: 'Approved organization-specific officer access is required.' };
      }
      const organization = getOrganizationById(organizationId);
      if (!organization) return { data: undefined, source: 'fixture', message: 'Organization not found.' };
      const dashboard: OfficerDashboard = {
        organization: hydrateOrganization(organization),
        announcements: announcements.filter((announcement) => announcement.organizationId === organization.id),
        applicants: applications.filter((application) => application.organizationId === organization.id),
        dateEntries: dateEntries.filter((entry) => entry.organizationId === organization.id).sort(compareDateEntries),
        meetingRequests: meetingRequests.filter((request) => request.organizationId === organization.id),
      };
      return { data: clone(dashboard), source: 'fixture', message: 'Development fixture mode: officer actions are local only.' };
    },

    async saveOrganizationProfile(input, session) {
      const permission = assertOfficer<OrganizationProfile>(input.organizationId, session);
      if (permission) return permission;
      if (!input.name.trim() || !input.description.trim() || !input.contactEmail.trim()) {
        return failure('validation', 'Organization name, description, and contact email are required.');
      }
      const organization = getOrganizationById(input.organizationId);
      if (!organization) return failure('not-found', 'Organization not found.');
      organization.name = input.name.trim();
      organization.logoUrl = input.logoUrl?.trim();
      organization.description = input.description.trim();
      organization.shortDescription = input.shortDescription.trim();
      organization.contactEmail = input.contactEmail.trim();
      organization.recruitmentTitle = input.recruitmentTitle.trim();
      organization.recruitment.title = input.recruitmentTitle.trim();
      organization.recruitment.requirements = input.recruitmentRequirements.trim();
      organization.recruitment.instructions = input.recruitmentInstructions.trim();
      organization.recruitment.externalFormUrl = input.externalFormUrl?.trim();
      return success('Organization profile saved in workflow fixture mode only.', hydrateOrganization(organization));
    },

    async publishAnnouncement(input, session) {
      const permission = assertOfficer<Announcement>(input.organizationId, session);
      if (permission) return permission;
      const body = input.body.trim();
      if (!body) return failure('validation', 'Announcement text is required.');
      const organization = getOrganizationById(input.organizationId);
      if (!organization) return failure('not-found', 'Organization not found.');
      const announcement: Announcement = {
        id: `post-${nextId++}`,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoUrl,
        createdAt: new Date().toISOString(),
        body,
        image: input.image,
        likeCount: 0,
        viewerHasLiked: false,
        comments: [],
      };
      announcements.unshift(announcement);
      return success('Announcement published in workflow fixture mode only.', clone(announcement));
    },

    async deleteAnnouncement(announcementId, organizationId, session) {
      const permission = assertOfficer(organizationId, session);
      if (permission) return permission;
      const before = announcements.length;
      announcements = announcements.filter((announcement) => announcement.id !== announcementId || announcement.organizationId !== organizationId);
      if (announcements.length === before) return failure('not-found', 'Announcement not found.');
      return { ok: true, persisted: true, source: 'fixture', message: 'Announcement deleted in workflow fixture mode only.' };
    },

    async updateApplicationStage(applicationId, stage: ApplicationStage, organizationId, session) {
      const permission = assertOfficer<ApplicationRecord>(organizationId, session);
      if (permission) return permission;
      const application = applications.find((item) => item.id === applicationId && item.organizationId === organizationId);
      if (!application) return failure('not-found', 'Application not found.');
      application.stage = stage;
      application.updatedAt = new Date().toISOString();
      return success(`Application moved to ${stage} in workflow fixture mode only.`, clone(application));
    },

    async saveDateEntry(input, session) {
      const permission = assertOfficer<DateEntry>(input.organizationId, session);
      if (permission) return permission;
      if (!input.title.trim() || !input.date || !input.details.trim()) {
        return failure('validation', 'Title, date, and details are required for date entries.');
      }
      const organization = getOrganizationById(input.organizationId);
      if (!organization) return failure('not-found', 'Organization not found.');
      const existing = input.id ? dateEntries.find((entry) => entry.id === input.id && entry.organizationId === input.organizationId) : undefined;
      const entry: DateEntry = existing ?? {
        id: `date-${nextId++}`,
        organizationId: input.organizationId,
        organizationName: organization.name,
        kind: input.kind,
        title: input.title,
        date: input.date,
        details: input.details,
      };
      entry.kind = input.kind;
      entry.title = input.title.trim();
      entry.date = input.date;
      entry.startTime = input.startTime;
      entry.endTime = input.endTime;
      entry.details = input.details.trim();
      if (!existing) dateEntries.push(entry);
      return success(`${entry.kind === 'event' ? 'Event' : 'Meeting availability'} saved in workflow fixture mode only.`, clone(entry));
    },

    async deleteDateEntry(dateEntryId, organizationId, session) {
      const permission = assertOfficer(organizationId, session);
      if (permission) return permission;
      const before = dateEntries.length;
      dateEntries = dateEntries.filter((entry) => entry.id !== dateEntryId || entry.organizationId !== organizationId);
      if (dateEntries.length === before) return failure('not-found', 'Date entry not found.');
      return { ok: true, persisted: true, source: 'fixture', message: 'Date entry removed in workflow fixture mode only.' };
    },

    async decideMeetingRequest(meetingRequestId, status: Exclude<MeetingStatus, 'Pending'>, organizationId, session) {
      const permission = assertOfficer<MeetingRequest>(organizationId, session);
      if (permission) return permission;
      const request = meetingRequests.find((item) => item.id === meetingRequestId && item.organizationId === organizationId);
      if (!request) return failure('not-found', 'Meeting request not found.');
      request.status = status;
      request.updatedAt = new Date().toISOString();
      return success(`Meeting request ${status.toLocaleLowerCase()} in workflow fixture mode only.`, clone(request));
    },
  };
}

export function getWorkflowDataClientForGatewayMode(mode: BackendGatewayMode): WorkflowDataClient {
  return mode === 'fixture' ? createFixtureWorkflowDataClient() : createProductionWorkflowDataClient();
}

export function createEmptyOfficerDateEntry(organizationId: string): DateEntryInput {
  return {
    organizationId,
    kind: 'availability',
    title: '',
    date: todayIsoDate(),
    startTime: '09:00',
    endTime: '10:00',
    details: '',
  };
}
