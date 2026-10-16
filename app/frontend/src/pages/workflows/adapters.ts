import type { ApplicationStage, MeetingStatus, UserSession } from '../../lib/contracts';
import { normalizeDepartmentKey } from '../../lib/departments';
import { readFixtureRegisteredAccounts } from '../../lib/fixtures';
import { validateAnnouncementMediaFiles, validateMeetingDocumentFile } from '../../lib/storageUploads';
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
  MeetingRequestInput,
  OfficerDashboard,
  OrganizationProfile,
  OrganizationProfileInput,
  OrganizationSummary,
  OrganizationDepartmentStudentCount,
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

const unavailableMessage = 'This section is temporarily unavailable. Please try again later.';

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
  listAnnouncements: () => unavailableQuery<AnnouncementPage>({ items: [] }),
  getAnnouncement: () => unavailableQuery<Announcement | undefined>(undefined),
  listAnnouncementComments: () => unavailableQuery<AnnouncementComment[]>([]),
  toggleAnnouncementLike: () => unavailableMutation<Announcement>(),
  addAnnouncementComment: () => unavailableMutation<AnnouncementComment>(),
  updateAnnouncementComment: () => unavailableMutation<AnnouncementComment>(),
  deleteAnnouncementComment: () => unavailableMutation(),
  listOrganizations: () => unavailableQuery<OrganizationSummary[]>([]),
  getOrganization: () => unavailableQuery<OrganizationProfile | undefined>(undefined),
  confirmExternalApplication: () => unavailableMutation<ApplicationRecord>(),
  listMyApplications: () => unavailableQuery<ApplicationRecord[]>([]),
  listMeetingOptions: () => unavailableQuery<DateEntry[]>([]),
  listMyMeetingRequests: () => unavailableQuery<MeetingRequest[]>([]),
  requestMeeting: () => unavailableMutation<MeetingRequest>(),
  getOfficerDashboard: () => unavailableQuery<OfficerDashboard | undefined>(undefined),
  saveOrganizationProfile: () => unavailableMutation<OrganizationProfile>(),
  setApplicationsOpen: () => unavailableMutation<{ applicationsOpen: boolean }>(),
  publishAnnouncement: () => unavailableMutation<Announcement>(),
  deleteAnnouncement: () => unavailableMutation(),
  getOrganizationDepartmentStudentCount: () => unavailableQuery<OrganizationDepartmentStudentCount | undefined>(undefined),
  updateApplicationStage: () => unavailableMutation<ApplicationRecord>(),
  saveDateEntry: () => unavailableMutation<DateEntry>(),
  deleteDateEntry: () => unavailableMutation(),
  decideMeetingRequest: () => unavailableMutation<MeetingRequest>(),
};

const initialDateEntries: DateEntry[] = [
  {
    id: 'date-robotics-build-night',
    organizationId: 'robotics',
    organizationName: 'Computer Engineering Department',
    kind: 'event',
    title: 'Computer Engineering project night',
    date: '2026-11-09',
    startTime: '18:00',
    details: 'Department-led lab night for student projects, prototypes, and officer consultation.',
  },
  {
    id: 'date-robotics-interview',
    organizationId: 'robotics',
    organizationName: 'Computer Engineering Department',
    kind: 'availability',
    title: 'Computer Engineering consultation window',
    date: '2026-11-12',
    startTime: '14:00',
    endTime: '16:00',
    details: 'Request one time during this department consultation window after submitting the external form.',
  },
  {
    id: 'date-literary-open-mic',
    organizationId: 'literary',
    organizationName: 'Architecture Department',
    kind: 'event',
    title: 'Architecture portfolio clinic',
    date: '2026-11-10',
    startTime: '17:30',
    details: 'Department portfolio review and studio interest session.',
  },
  {
    id: 'date-literary-crew-interview',
    organizationId: 'literary',
    organizationName: 'Architecture Department',
    kind: 'availability',
    title: 'Architecture studio consultation',
    date: '2026-11-13',
    startTime: '13:00',
    endTime: '15:00',
    details: 'Request a short meeting with Architecture Department officers.',
  },
  {
    id: 'date-health-briefing',
    organizationId: 'health',
    organizationName: 'Civil Engineering Department',
    kind: 'event',
    title: 'Civil Engineering field briefing',
    date: '2026-11-08',
    startTime: '10:00',
    details: 'Orientation for department fieldwork, safety reminders, and project coordination.',
  },
  {
    id: 'date-health-partner-meeting',
    organizationId: 'health',
    organizationName: 'Civil Engineering Department',
    kind: 'availability',
    title: 'Civil Engineering partner meeting slot',
    date: '2026-11-14',
    startTime: '09:00',
    endTime: '11:00',
    details: 'Sponsors and students can request this department discussion slot.',
  },
  {
    id: 'date-electrical-orientation',
    organizationId: 'electrical',
    organizationName: 'Electrical Engineering Department',
    kind: 'event',
    title: 'Electrical systems orientation',
    date: '2026-11-15',
    startTime: '10:30',
    details: 'Department orientation for circuits, power systems, and upcoming student activities.',
  },
  {
    id: 'date-mechanical-consultation',
    organizationId: 'mechanical',
    organizationName: 'Mechanical Engineering Department',
    kind: 'availability',
    title: 'Mechanical Engineering advising slot',
    date: '2026-11-16',
    startTime: '13:00',
    endTime: '15:00',
    details: 'Request a department advising time. Demo counts intentionally show no registered students yet.',
  },
  {
    id: 'date-electronics-lab',
    organizationId: 'electronics',
    organizationName: 'Electronics Engineering Department',
    kind: 'event',
    title: 'Electronics lab orientation',
    date: '2026-11-17',
    startTime: '09:00',
    details: 'Orientation for electronics lab practices and student support resources.',
  },
  {
    id: 'date-geodetic-fieldwork',
    organizationId: 'geodetic',
    organizationName: 'Geodetic Engineering',
    kind: 'event',
    title: 'Geodetic fieldwork briefing',
    date: '2026-11-18',
    startTime: '08:30',
    details: 'Briefing for survey fieldwork, equipment handling, and department announcements.',
  },
];

const departmentOrganizations = [
  {
    id: 'robotics',
    slug: 'computer-engineering-department',
    name: 'Computer Engineering Department',
    department: 'Computer Engineering Department',
    shortDescription: 'Department organization for Computer Engineering students, officers, announcements, and meeting requests.',
    description: 'Computer Engineering Department is represented in SOAR as the department organization for student announcements, recruitment instructions, consultation dates, and officer-managed requests.',
    contactEmail: 'computer.engineering@example.edu',
    contactPhone: '+63 912 345 6789',
    recruitmentTitle: 'Computer Engineering Department Updates',
    recruitmentRequirements: 'Registered Computer Engineering students and interested students following department instructions.',
    recruitmentInstructions: 'Open the linked department form when requested, submit it externally, then return to SOAR and explicitly confirm the external submission.',
    externalFormUrl: 'https://forms.gle/example-computer-engineering-department',
  },
  {
    id: 'literary',
    slug: 'architecture-department',
    name: 'Architecture Department',
    department: 'Architecture Department',
    shortDescription: 'Department organization for Architecture announcements, portfolio activities, and meeting windows.',
    description: 'Architecture Department uses SOAR as its department organization profile for studio updates, portfolio activities, public dates, and officer-managed student requests.',
    contactEmail: 'architecture@example.edu',
    contactPhone: '',
    recruitmentTitle: 'Architecture Department Portfolio Updates',
    recruitmentRequirements: 'Students following Architecture Department portfolio and studio instructions.',
    recruitmentInstructions: 'Submit the external interest or portfolio form when posted, then confirm in SOAR so officers know to review the response.',
    externalFormUrl: 'https://forms.gle/example-architecture-department',
  },
  {
    id: 'health',
    slug: 'civil-engineering-department',
    name: 'Civil Engineering Department',
    department: 'Civil Engineering Department',
    shortDescription: 'Department organization for Civil Engineering fieldwork notices, meetings, and student updates.',
    description: 'Civil Engineering Department is the client department organization for fieldwork notices, consultation slots, announcements, and student request handling.',
    contactEmail: 'civil.engineering@example.edu',
    contactPhone: '+63 (02) 555-0100',
    recruitmentTitle: 'Civil Engineering Department Fieldwork Updates',
    recruitmentRequirements: 'Students participating in Civil Engineering department activities, briefings, or project coordination.',
    recruitmentInstructions: 'Open the external department form when available, submit the required details, and confirm that submission in SOAR.',
    externalFormUrl: 'https://forms.gle/example-civil-engineering-department',
  },
  {
    id: 'electrical',
    slug: 'electrical-engineering-department',
    name: 'Electrical Engineering Department',
    department: 'Electrical Engineering Department',
    shortDescription: 'Department organization for Electrical Engineering activities, announcements, and student consultations.',
    description: 'Electrical Engineering Department posts power systems, circuits, and department consultation updates through this SOAR organization profile.',
    contactEmail: 'electrical.engineering@example.edu',
    contactPhone: '+63 915 222 0104',
    recruitmentTitle: 'Electrical Engineering Department Updates',
    recruitmentRequirements: 'Students following Electrical Engineering Department activities or consultation requirements.',
    recruitmentInstructions: 'Use the posted external form when instructed, then return to SOAR to confirm completion.',
    externalFormUrl: 'https://forms.gle/example-electrical-engineering-department',
  },
  {
    id: 'mechanical',
    slug: 'mechanical-engineering-department',
    name: 'Mechanical Engineering Department',
    department: 'Mechanical Engineering Department',
    shortDescription: 'Department organization for Mechanical Engineering advising and announcements.',
    description: 'Mechanical Engineering Department provides advising availability, department announcements, and student-facing updates through SOAR.',
    contactEmail: 'mechanical.engineering@example.edu',
    contactPhone: '+63 915 222 0105',
    recruitmentTitle: 'Mechanical Engineering Department Updates',
    recruitmentRequirements: 'Students following Mechanical Engineering Department advising and activity instructions.',
    recruitmentInstructions: 'Review posted instructions and confirm external submissions in SOAR only after completing the external step.',
    externalFormUrl: 'https://forms.gle/example-mechanical-engineering-department',
  },
  {
    id: 'electronics',
    slug: 'electronics-engineering-department',
    name: 'Electronics Engineering Department',
    department: 'Electronics Engineering Department',
    shortDescription: 'Department organization for Electronics Engineering lab notices and student support.',
    description: 'Electronics Engineering Department uses SOAR for lab orientation posts, officer-managed announcements, and student meeting requests.',
    contactEmail: 'electronics.engineering@example.edu',
    contactPhone: '+63 915 222 0106',
    recruitmentTitle: 'Electronics Engineering Department Updates',
    recruitmentRequirements: 'Students following Electronics Engineering Department lab and support instructions.',
    recruitmentInstructions: 'Complete any linked department form externally, then confirm the submission in SOAR.',
    externalFormUrl: 'https://forms.gle/example-electronics-engineering-department',
  },
  {
    id: 'geodetic',
    slug: 'geodetic-engineering',
    name: 'Geodetic Engineering',
    department: 'Geodetic Engineering',
    shortDescription: 'Department organization for Geodetic Engineering fieldwork and survey announcements.',
    description: 'Geodetic Engineering posts fieldwork briefings, survey coordination, and department consultation availability through SOAR.',
    contactEmail: 'geodetic.engineering@example.edu',
    contactPhone: '+63 915 222 0107',
    recruitmentTitle: 'Geodetic Engineering Updates',
    recruitmentRequirements: 'Students following Geodetic Engineering fieldwork, survey, and activity instructions.',
    recruitmentInstructions: 'Open linked department forms from SOAR, complete them externally, then return to confirm only after submission.',
    externalFormUrl: 'https://forms.gle/example-geodetic-engineering',
  },
];

const initialOrganizations: OrganizationProfile[] = departmentOrganizations.map((organization) => ({
  id: organization.id,
  slug: organization.slug,
  name: organization.name,
  logoUrl: '',
  shortDescription: organization.shortDescription,
  description: organization.description,
  contactEmail: organization.contactEmail,
  contactPhone: organization.contactPhone,
  recruitmentTitle: organization.recruitmentTitle,
  department: organization.department,
  departmentKey: normalizeDepartmentKey(organization.department),
  recruitment: {
    id: `${organization.id}-department-updates`,
    organizationId: organization.id,
    title: organization.recruitmentTitle,
    requirements: organization.recruitmentRequirements,
    instructions: organization.recruitmentInstructions,
    externalFormUrl: organization.externalFormUrl,
    audience: 'students',
  },
  posts: [],
  dateEntries: [],
}));

const initialAnnouncements: Announcement[] = [
  {
    id: 'post-robotics-tryouts',
    organizationId: 'robotics',
    organizationName: 'Computer Engineering Department',
    createdAt: '2026-10-07T08:00:00.000Z',
    body: 'Computer Engineering project night is scheduled this Friday. Open the department profile for requirements and meeting availability.',
    image: {
      url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
      alt: 'Electronics workbench with small robotics parts',
    },
    media: [
      {
        url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
        alt: 'Electronics workbench with small robotics parts',
      },
      {
        url: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&q=80',
        alt: 'Small robot prototype on a lab table',
      },
    ],
    deepLinkPath: '/app?announcementId=post-robotics-tryouts',
    likeCount: 12,
    viewerHasLiked: false,
    commentCount: 1,
    comments: [
      { id: 'comment-1', authorUid: 'student-1', authorName: 'Mara Santos', body: 'Is the consultation window open to first-year students?', createdAt: '2026-10-07T09:00:00.000Z' },
    ],
  },
  {
    id: 'post-literary-open-mic',
    organizationId: 'literary',
    organizationName: 'Architecture Department',
    createdAt: '2026-10-06T13:00:00.000Z',
    body: 'Architecture portfolio clinic signup is available now. Students can review the profile and external form instructions.',
    deepLinkPath: '/app?announcementId=post-literary-open-mic',
    likeCount: 7,
    viewerHasLiked: true,
    commentCount: 0,
    comments: [],
  },
  {
    id: 'post-health-briefing',
    organizationId: 'health',
    organizationName: 'Civil Engineering Department',
    createdAt: '2026-10-05T11:30:00.000Z',
    body: 'Civil Engineering field briefing slots are posted. Pending meeting requests are not confirmed until an officer approves them.',
    deepLinkPath: '/app?announcementId=post-health-briefing',
    likeCount: 4,
    viewerHasLiked: false,
    commentCount: 0,
    comments: [],
  },
];

const initialApplications: ApplicationRecord[] = [
  {
    id: 'app-student-1-robotics',
    organizationId: 'robotics',
    organizationName: 'Computer Engineering Department',
    opportunityId: 'robotics-department-updates',
    opportunityTitle: 'Computer Engineering Department Updates',
    studentUid: 'student-1',
    studentName: 'Mara Santos',
    stage: 'Pending',
    confirmedExternalSubmissionAt: '2026-10-07T08:40:00.000Z',
    updatedAt: '2026-10-07T08:40:00.000Z',
  },
  {
    id: 'app-student-1-literary',
    organizationId: 'literary',
    organizationName: 'Architecture Department',
    opportunityId: 'literary-department-updates',
    opportunityTitle: 'Architecture Department Portfolio Updates',
    studentUid: 'student-1',
    studentName: 'Mara Santos',
    stage: 'Under review',
    confirmedExternalSubmissionAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T14:00:00.000Z',
  },
  {
    id: 'app-student-4-robotics',
    organizationId: 'robotics',
    organizationName: 'Computer Engineering Department',
    opportunityId: 'robotics-department-updates',
    opportunityTitle: 'Computer Engineering Department Updates',
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
    organizationName: 'Civil Engineering Department',
    dateEntryId: 'date-health-partner-meeting',
    meetingTitle: 'Civil Engineering partner meeting slot',
    requesterUid: 'student-1',
    requesterName: 'Mara Santos',
    requestedDate: '2026-11-14',
    requestedTime: '09:30',
    status: 'Approved',
    note: 'Interested in the field briefing.',
    updatedAt: '2026-10-07T10:00:00.000Z',
  },
  {
    id: 'meeting-student-1-robotics',
    organizationId: 'robotics',
    organizationName: 'Computer Engineering Department',
    dateEntryId: 'date-robotics-interview',
    meetingTitle: 'Computer Engineering consultation window',
    requesterUid: 'student-1',
    requesterName: 'Mara Santos',
    requestedDate: '2026-11-12',
    requestedTime: '14:00',
    status: 'Pending',
    note: 'Department form submitted externally.',
    document: {
      storagePath: 'fixture/meeting-request-documents/robotics/meeting-student-1-robotics/formal-request.pdf',
      fileName: 'formal-request.pdf',
      contentType: 'application/pdf',
      sizeBytes: 245760,
    },
    updatedAt: '2026-10-07T10:15:00.000Z',
  },
  {
    id: 'meeting-sponsor-1-robotics',
    organizationId: 'robotics',
    organizationName: 'Computer Engineering Department',
    dateEntryId: 'date-robotics-interview',
    meetingTitle: 'Computer Engineering consultation window',
    requesterUid: 'sponsor-1',
    requesterName: 'Ari Reyes',
    requestedDate: '2026-11-12',
    requestedTime: '15:00',
    status: 'Pending',
    note: 'Discuss possible support for department workshop materials.',
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
    contactPhone: profile.contactPhone,
    recruitmentTitle: profile.recruitmentTitle,
    department: profile.department,
    departmentKey: profile.departmentKey,
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

  function hydrateAnnouncement(announcement: Announcement, session: UserSession): Announcement {
    const cloned = clone(announcement);
    const media = cloned.media?.length ? cloned.media : cloned.image ? [cloned.image] : [];
    cloned.media = media.length ? media : undefined;
    cloned.image = media[0];
    cloned.deepLinkPath = cloned.deepLinkPath ?? `/app?announcementId=${encodeURIComponent(cloned.id)}`;
    cloned.commentCount = cloned.comments.length;
    cloned.comments = cloned.comments.map((comment) => ({
      ...comment,
      viewerCanEdit: comment.authorUid === session.uid,
      viewerCanDelete: comment.authorUid === session.uid,
    }));
    return cloned;
  }

  function hydrateOrganization(profile: OrganizationProfile, session: UserSession): OrganizationProfile {
    return {
      ...clone(profile),
      applicationsOpen: profile.applicationsOpen !== false,
      posts: announcements.filter((announcement) => announcement.organizationId === profile.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((announcement) => hydrateAnnouncement(announcement, session)),
      dateEntries: dateEntries.filter((entry) => entry.organizationId === profile.id).sort(compareDateEntries),
    };
  }

  function assertOfficer<T = undefined>(organizationId: string, session: UserSession): WorkflowMutationResult<T> | undefined {
    if (!isApprovedOfficerFor(session, organizationId)) {
      return failure<T>('permission', 'Only approved officers for this organization can make this change.');
    }
    return undefined;
  }

  function departmentStudentCount(organization: OrganizationProfile): OrganizationDepartmentStudentCount | undefined {
    if (!organization.department || !organization.departmentKey) return undefined;
    const registeredStudentCount = readFixtureRegisteredAccounts().filter(
      (account) => account.accountKind === 'student' && account.departmentKey === organization.departmentKey,
    ).length;
    return {
      organizationId: organization.id,
      department: organization.department,
      departmentKey: organization.departmentKey,
      registeredStudentCount,
      scope: 'registered_students_in_organization_department',
      description: 'Demo aggregate: saved fixture student accounts whose selected department matches this department organization. Officers with student accounts are counted; sponsors, applications, members, meetings, and legacy missing departments are not.',
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    mode: 'fixture',
    label: 'Workflow fixture data',

    async listAnnouncements(session, page = { limit: 15 }) {
      const sorted = announcements.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const offset = Number(page.pageToken ?? 0);
      const selected = sorted.slice(offset, offset + page.limit);
      return {
        data: {
          items: selected.map((announcement) => hydrateAnnouncement(announcement, session)),
          nextPageToken: offset + selected.length < sorted.length ? String(offset + selected.length) : undefined,
        },
        source: 'fixture',
        message: 'Demo mode: sample workflow changes are simulated locally.',
      };
    },

    async getAnnouncement(announcementId, session) {
      const announcement = announcements.find((item) => item.id === announcementId);
      return {
        data: announcement ? hydrateAnnouncement(announcement, session) : undefined,
        source: 'fixture',
        message: 'Demo mode: sample workflow changes are simulated locally.',
      };
    },

    async listAnnouncementComments(announcementId) {
      const announcement = announcements.find((item) => item.id === announcementId);
      return {
        data: announcement ? clone(announcement.comments) : [],
        source: 'fixture',
        message: 'Demo mode: sample workflow changes are simulated locally.',
      };
    },

    async toggleAnnouncementLike(announcementId, liked, session) {
      const announcement = announcements.find((item) => item.id === announcementId);
      if (!announcement) return failure('not-found', 'Announcement not found.');
      const wasLiked = announcement.viewerHasLiked;
      announcement.viewerHasLiked = liked;
      if (liked && !wasLiked) announcement.likeCount += 1;
      if (!liked && wasLiked) announcement.likeCount = Math.max(0, announcement.likeCount - 1);
      return success(liked ? 'Liked in demo mode.' : 'Like removed in demo mode.', hydrateAnnouncement(announcement, session));
    },

    async addAnnouncementComment(announcementId, body, session) {
      const trimmed = body.trim();
      if (!trimmed) return failure('validation', 'Enter a comment before posting.');
      const announcement = announcements.find((item) => item.id === announcementId);
      if (!announcement) return failure('not-found', 'Announcement not found.');
      const comment: AnnouncementComment = {
        id: `comment-${nextId++}`,
        authorUid: session.uid,
        authorName: session.displayName,
        body: trimmed,
        createdAt: new Date().toISOString(),
        viewerCanEdit: true,
        viewerCanDelete: true,
      };
      announcement.comments.push(comment);
      announcement.commentCount = announcement.comments.length;
      return success('Comment added in demo mode.', clone(comment));
    },

    async updateAnnouncementComment(announcementId, commentId, body, session) {
      const trimmed = body.trim();
      if (!trimmed) return failure('validation', 'Enter a comment before saving.');
      const announcement = announcements.find((item) => item.id === announcementId);
      if (!announcement) return failure('not-found', 'Announcement not found.');
      const comment = announcement.comments.find((item) => item.id === commentId);
      if (!comment) return failure('not-found', 'Comment not found.');
      if (comment.authorUid !== session.uid) return failure('permission', 'You can edit only your own comments.');
      comment.body = trimmed;
      comment.updatedAt = new Date().toISOString();
      return success('Comment updated in demo mode.', { ...clone(comment), viewerCanEdit: true, viewerCanDelete: true });
    },

    async deleteAnnouncementComment(announcementId, commentId, session) {
      const announcement = announcements.find((item) => item.id === announcementId);
      if (!announcement) return failure('not-found', 'Announcement not found.');
      const comment = announcement.comments.find((item) => item.id === commentId);
      if (!comment) return failure('not-found', 'Comment not found.');
      if (comment.authorUid !== session.uid) return failure('permission', 'You can delete only your own comments.');
      announcement.comments = announcement.comments.filter((item) => item.id !== commentId);
      announcement.commentCount = announcement.comments.length;
      return { ok: true, persisted: true, source: 'fixture', message: 'Comment deleted in demo mode.' };
    },

    async listOrganizations() {
      return {
        data: clone(organizations.map(toSummary)),
        source: 'fixture',
        message: 'Demo mode: organization records are local samples.',
      };
    },

    async getOrganization(organizationId, session) {
      const organization = getOrganizationById(organizationId);
      return {
        data: organization ? hydrateOrganization(organization, session) : undefined,
        source: 'fixture',
        message: organization ? 'Demo mode: profile data is local.' : 'Organization not found in demo data.',
      };
    },

    async confirmExternalApplication(input, session) {
      if (isSponsor(session)) return failure('permission', 'Sponsors do not have application tools.');
      if (!input.externalFormOpened) return failure('validation', 'Open the external form link from SOAR before confirming. Opening still does not prove external submission.');
      if (!input.confirmedExternalSubmission) return failure('validation', 'Confirm the external form was submitted before adding a tracker entry.');
      const organization = getOrganizationById(input.organizationId);
      if (!organization || organization.recruitment.id !== input.opportunityId) return failure('not-found', 'Recruitment opportunity not found.');
      if (organization.applicationsOpen === false) return failure('closed', 'Applications are closed for this organization.');
      if (hasDuplicateApplication(applications, session.uid, input.organizationId)) {
        return failure('duplicate', 'You already have an application for this organization.');
      }
      const now = new Date().toISOString();
      const application: ApplicationRecord = {
        id: `app-${session.uid}-${input.organizationId}`,
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
      return success('External submission confirmation recorded as Pending in demo mode.', clone(application));
    },

    async listMyApplications(session) {
      const data = isSponsor(session) ? [] : applications.filter((application) => application.studentUid === session.uid);
      return {
        data: clone(data),
        source: 'fixture',
        message: isSponsor(session) ? 'Sponsors do not have application tracker data.' : 'Demo mode: tracker rows are local samples.',
      };
    },

    async listMeetingOptions() {
      return {
        data: clone(dateEntries.filter((entry) => entry.kind === 'availability').sort(compareDateEntries)),
        source: 'fixture',
        message: 'Demo mode: availability is local sample data.',
      };
    },

    async listMyMeetingRequests(session) {
      return {
        data: clone(meetingRequests.filter((request) => request.requesterUid === session.uid)),
        source: 'fixture',
        message: 'Demo mode: requests are local samples and Pending is not booked.',
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
      if (input.document?.file) {
        try {
          validateMeetingDocumentFile(input.document.file);
        } catch (error) {
          return failure('validation', error instanceof Error ? error.message : 'Attach a valid PDF document.');
        }
      }
      const requestId = `meeting-${session.uid}-${nextId++}`;
      const request: MeetingRequest = {
        id: requestId,
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
        document: input.document ? {
          storagePath: `fixture/meeting-request-documents/${organization.id}/${requestId}/${input.document.fileName}`,
          fileName: input.document.fileName,
          contentType: input.document.contentType,
          sizeBytes: input.document.sizeBytes,
        } : undefined,
        updatedAt: new Date().toISOString(),
      };
      meetingRequests.unshift(request);
      return success('Meeting request created as Pending in demo mode. It is not a confirmed booking.', clone(request));
    },

    async getOfficerDashboard(organizationId, session) {
      if (!isApprovedOfficerFor(session, organizationId)) {
        return { data: undefined, source: 'fixture', message: 'Approved organization-specific officer access is required.' };
      }
      const organization = getOrganizationById(organizationId);
      if (!organization) return { data: undefined, source: 'fixture', message: 'Organization not found.' };
      const dashboard: OfficerDashboard = {
        organization: hydrateOrganization(organization, session),
        announcements: announcements.filter((announcement) => announcement.organizationId === organization.id).map((announcement) => hydrateAnnouncement(announcement, session)),
        applicants: applications.filter((application) => application.organizationId === organization.id),
        dateEntries: dateEntries.filter((entry) => entry.organizationId === organization.id).sort(compareDateEntries),
        meetingRequests: meetingRequests.filter((request) => request.organizationId === organization.id),
      };
      return { data: clone(dashboard), source: 'fixture', message: 'Demo mode: officer actions are simulated locally.' };
    },

    async saveOrganizationProfile(input, session) {
      const permission = assertOfficer<OrganizationProfile>(input.organizationId, session);
      if (permission) return permission;
      if (!input.name.trim() || !input.description.trim() || !input.contactEmail.trim()) {
        return failure('validation', 'Organization name, description, and contact email are required.');
      }
      if (input.contactPhone && !/^[+0-9() .\-extEXT]{3,32}$/.test(input.contactPhone.trim())) {
        return failure('validation', 'Enter a valid phone number or leave it blank.');
      }
      const organization = getOrganizationById(input.organizationId);
      if (!organization) return failure('not-found', 'Organization not found.');
      organization.name = input.name.trim();
      organization.logoUrl = input.logoUrl?.trim();
      organization.description = input.description.trim();
      organization.shortDescription = input.shortDescription.trim();
      organization.contactEmail = input.contactEmail.trim();
      organization.contactPhone = input.contactPhone?.trim();
      organization.recruitmentTitle = input.recruitmentTitle.trim();
      organization.recruitment.title = input.recruitmentTitle.trim();
      organization.recruitment.requirements = input.recruitmentRequirements.trim();
      organization.recruitment.instructions = input.recruitmentInstructions.trim();
      organization.recruitment.externalFormUrl = input.externalFormUrl?.trim();
      return success('Organization profile saved in demo mode.', hydrateOrganization(organization, session));
    },

    async setApplicationsOpen(organizationId, applicationsOpen, session) {
      const permission = assertOfficer<{ applicationsOpen: boolean }>(organizationId, session);
      if (permission) return permission;
      const organization = getOrganizationById(organizationId);
      if (!organization) return failure('not-found', 'Organization not found.');
      organization.applicationsOpen = applicationsOpen;
      return success(applicationsOpen ? 'Applications are open in demo mode.' : 'Applications are closed in demo mode.', { applicationsOpen });
    },

    async publishAnnouncement(input, session) {
      const permission = assertOfficer<Announcement>(input.organizationId, session);
      if (permission) return permission;
      const body = input.body.trim();
      if (!body) return failure('validation', 'Announcement text is required.');
      const organization = getOrganizationById(input.organizationId);
      if (!organization) return failure('not-found', 'Organization not found.');
      const media = input.media?.length ? input.media : input.image ? [input.image] : [];
      const files = media.filter((item) => item.file).map((item) => item.file as File);
      try {
        if (files.length) validateAnnouncementMediaFiles(files);
      } catch (error) {
        return failure('validation', error instanceof Error ? error.message : 'Choose valid images.');
      }
      const announcementId = `post-${nextId++}`;
      const announcement: Announcement = {
        id: announcementId,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoUrl,
        createdAt: new Date().toISOString(),
        body,
        image: media[0],
        media: media.length ? media : undefined,
        deepLinkPath: `/app?announcementId=${encodeURIComponent(announcementId)}`,
        likeCount: 0,
        viewerHasLiked: false,
        commentCount: 0,
        comments: [],
      };
      announcements.unshift(announcement);
      return success('Announcement published in demo mode.', hydrateAnnouncement(announcement, session));
    },

    async deleteAnnouncement(announcementId, organizationId, session) {
      const permission = assertOfficer(organizationId, session);
      if (permission) return permission;
      const before = announcements.length;
      announcements = announcements.filter((announcement) => announcement.id !== announcementId || announcement.organizationId !== organizationId);
      if (announcements.length === before) return failure('not-found', 'Announcement not found.');
      return { ok: true, persisted: true, source: 'fixture', message: 'Announcement deleted in demo mode.' };
    },

    async getOrganizationDepartmentStudentCount(organizationId, session) {
      if (!isApprovedOfficerFor(session, organizationId)) {
        return { data: undefined, source: 'fixture', message: 'Approved organization-specific officer access is required.' };
      }
      const organization = getOrganizationById(organizationId);
      if (!organization) return { data: undefined, source: 'fixture', message: 'Organization not found.' };
      const data = departmentStudentCount(organization);
      return {
        data,
        source: 'fixture',
        message: data
          ? 'Demo mode: registered-student count is derived from saved fixture student records.'
          : 'Demo mode: this organization has no assigned department link, so no department count is shown.',
      };
    },


    async updateApplicationStage(applicationId, stage: ApplicationStage, organizationId, session) {
      const permission = assertOfficer<ApplicationRecord>(organizationId, session);
      if (permission) return permission;
      const application = applications.find((item) => item.id === applicationId && item.organizationId === organizationId);
      if (!application) return failure('not-found', 'Application not found.');
      application.stage = stage;
      application.updatedAt = new Date().toISOString();
      return success(`Application moved to ${stage} in demo mode.`, clone(application));
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
      return success(`${entry.kind === 'event' ? 'Event' : 'Meeting availability'} saved in demo mode.`, clone(entry));
    },

    async deleteDateEntry(dateEntryId, organizationId, session) {
      const permission = assertOfficer(organizationId, session);
      if (permission) return permission;
      const before = dateEntries.length;
      dateEntries = dateEntries.filter((entry) => entry.id !== dateEntryId || entry.organizationId !== organizationId);
      if (dateEntries.length === before) return failure('not-found', 'Date entry not found.');
      return { ok: true, persisted: true, source: 'fixture', message: 'Date entry removed in demo mode.' };
    },

    async decideMeetingRequest(meetingRequestId, status: Exclude<MeetingStatus, 'Pending'>, organizationId, session) {
      const permission = assertOfficer<MeetingRequest>(organizationId, session);
      if (permission) return permission;
      const request = meetingRequests.find((item) => item.id === meetingRequestId && item.organizationId === organizationId);
      if (!request) return failure('not-found', 'Meeting request not found.');
      request.status = status;
      request.updatedAt = new Date().toISOString();
      return success(`Meeting request ${status.toLocaleLowerCase()} in demo mode.`, clone(request));
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
