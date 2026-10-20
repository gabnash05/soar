import type { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const DEPARTMENT_LABELS = [
  'Civil Engineering Department',
  'Architecture Department',
  'Electrical Engineering Department',
  'Computer Engineering Department',
  'Mechanical Engineering Department',
  'Electronics Engineering Department',
  'Geodetic Engineering'
] as const;
export type DepartmentLabel = (typeof DEPARTMENT_LABELS)[number];

export const ACCOUNT_ROLES = ['student', 'sponsor'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];
export const PUBLIC_ACCOUNT_ROLES = ACCOUNT_ROLES;
export type PublicAccountRole = AccountRole;

export const ENTITLEMENT_STATUSES = ['active', 'expired', 'revoked'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export const OFFICER_GRANT_STATUSES = ['active', 'revoked'] as const;
export type OfficerGrantStatus = (typeof OFFICER_GRANT_STATUSES)[number];

export const APPLICATION_STATUSES = ['Pending', 'Under review', 'Accepted', 'Declined'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const MEETING_STATUSES = ['Pending', 'Approved', 'Declined'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface AccountDocument {
  uid: string;
  role: AccountRole;
  displayName: string;
  email: string;
  emailVerified: boolean;
  accessProvenance?: 'unpaid-preview';
  previewAccessGrantedAt?: Timestamp;
  studentId?: string;
  department?: string;
  departmentKey?: string;
  companyName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastNameChangedAt?: Timestamp;
}

export interface EntitlementHistoryEntry {
  provider: string;
  providerEventId: string;
  intentId: string;
  accessExpiresAt: Timestamp;
  amount: {
    currency: 'PHP';
    minor: 1000;
  };
  recordedAt: Timestamp | FieldValue;
}

export interface EntitlementDocument {
  uid: string;
  status: EntitlementStatus;
  accessExpiresAt: Timestamp;
  provider: string;
  lastProviderEventId: string;
  history: EntitlementHistoryEntry[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EntitlementProviderEventDocument {
  uid: string;
  provider: string;
  providerEventId: string;
  intentId: string;
  recordedAt: Timestamp;
}

export interface OrganizationRecruitment {
  opportunityId?: string;
  title?: string;
  requirements?: string;
  instructions?: string;
  applicationLink?: string;
}

export interface OrganizationDocument {
  orgId: string;
  name: string;
  slug: string;
  searchName?: string;
  ownerUid: string;
  shortDescription?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  department?: string;
  departmentKey?: string;
  logoPath?: string;
  applicationsOpen?: boolean;
  deletionStatus?: 'deleting';
  deletionProgress?: Record<string, unknown>;
  reportsUrl?: string;
  recruitment?: OrganizationRecruitment;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUid: string;
}

export type DateEntryKind = 'event' | 'availability';

export type AnnouncementImageContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export interface AnnouncementMedia {
  storagePath: string;
  contentType: AnnouncementImageContentType;
  sizeBytes: number;
  alt?: string;
}

export interface AnnouncementImage extends AnnouncementMedia {
  contentType: AnnouncementImageContentType;
}

export interface AnnouncementDocument {
  announcementId: string;
  orgId: string;
  organizationName: string;
  organizationLogoPath?: string;
  authorUid: string;
  body: string;
  image?: AnnouncementImage | null;
  media?: AnnouncementMedia[];
  likeCount: number;
  commentCount: number;
  deletedAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AnnouncementCommentDocument {
  commentId: string;
  announcementId: string;
  authorUid: string;
  authorName: string;
  body: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface CalendarEntryDocument {
  entryId: string;
  orgId: string;
  organizationName: string;
  kind: DateEntryKind;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  details: string;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OfficerGrantDocument {
  uid: string;
  status: OfficerGrantStatus;
  grantedByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  revokedByUid?: string;
  revokedAt?: Timestamp;
}

export interface PaidRegistrationCompletionInput {
  email: string;
  password: string;
  displayName: string;
  role: PublicAccountRole;
  studentId?: string;
  department?: string;
  departmentKey?: string;
  companyName?: string;
  entitlement: {
    provider: string;
    providerEventId: string;
    accessExpiresAt: Timestamp;
    amount: {
      currency: 'PHP';
      minor: 1000;
    };
    intentId: string;
  };
}

export interface PaidRegistrationCompletionResult {
  uid: string;
  alreadyProcessed: boolean;
}
