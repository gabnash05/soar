import type { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const ACCOUNT_ROLES = ['student', 'sponsor'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ENTITLEMENT_STATUSES = ['active', 'expired', 'revoked'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export const OFFICER_GRANT_STATUSES = ['active', 'revoked'] as const;
export type OfficerGrantStatus = (typeof OFFICER_GRANT_STATUSES)[number];

export const APPLICATION_STATUSES = ['pending', 'under_review', 'accepted', 'declined'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const MEETING_STATUSES = ['pending', 'approved', 'declined'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface AccountDocument {
  uid: string;
  role: AccountRole;
  displayName: string;
  email: string;
  emailVerified: boolean;
  studentId?: string;
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
  title?: string;
  requirements?: string;
  instructions?: string;
  applicationLink?: string;
}

export interface OrganizationDocument {
  orgId: string;
  name: string;
  slug: string;
  ownerUid: string;
  shortDescription?: string;
  description?: string;
  contactEmail?: string;
  logoPath?: string;
  recruitment?: OrganizationRecruitment;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUid: string;
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
  role: AccountRole;
  studentId?: string;
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
