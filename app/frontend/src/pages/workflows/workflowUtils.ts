import type { AccessStatus, ApplicationStage, MeetingStatus, OrganizationGrant, UserSession } from '../../lib/contracts';
import type { ApplicationRecord, DateEntry, MeetingRequest, MeetingRequestInput, OrganizationSummary } from './contracts';

export const APPLICATION_STAGES: ApplicationStage[] = ['Pending', 'Under review', 'Accepted', 'Declined'];
export const MEETING_STATUSES: MeetingStatus[] = ['Pending', 'Approved', 'Declined'];

export function isSponsor(session: UserSession): boolean {
  return session.accountKind === 'sponsor';
}

export function isStudent(session: UserSession): boolean {
  return session.accountKind === 'student';
}

export function hasActiveWorkflowAccess(session: UserSession | null | undefined): boolean {
  return session?.access.status === 'active' && Boolean(session.access.expiresAt);
}

export function getApprovedOfficerGrants(session: UserSession | null | undefined): OrganizationGrant[] {
  // Shared contract says approved. The current foundation fixture emitted active during coordination;
  // accept both here so fixture demos do not break while production remains grant-status driven.
  return (session?.officerGrants ?? []).filter((grant) => {
    const status = String(grant.status);
    return status === 'approved' || status === 'active';
  });
}

const organizationIdAliases: Record<string, string[]> = {
  robotics: ['coding-society'],
  'coding-society': ['robotics'],
};

export function isApprovedOfficerFor(session: UserSession | null | undefined, organizationId: string): boolean {
  const equivalentIds = new Set([organizationId, ...(organizationIdAliases[organizationId] ?? [])]);
  return getApprovedOfficerGrants(session).some((grant) => equivalentIds.has(grant.organizationId));
}

export function filterOrganizationsByName(organizations: OrganizationSummary[], query: string): OrganizationSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return organizations;
  return organizations.filter((organization) => organization.name.toLocaleLowerCase().includes(normalized));
}

export function splitDateEntries(entries: DateEntry[]): { events: DateEntry[]; availability: DateEntry[] } {
  return {
    events: entries.filter((entry) => entry.kind === 'event').sort(compareDateEntries),
    availability: entries.filter((entry) => entry.kind === 'availability').sort(compareDateEntries),
  };
}

export function compareDateEntries(a: DateEntry, b: DateEntry): number {
  return `${a.date} ${a.startTime ?? ''}`.localeCompare(`${b.date} ${b.startTime ?? ''}`);
}

export function formatDateEntry(entry: DateEntry): string {
  const time = entry.startTime ? ` · ${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ''}` : '';
  return `${entry.date}${time}`;
}

export function validateMeetingRequest(input: MeetingRequestInput): string | undefined {
  if (!input.organizationId) return 'Choose an organization.';
  if (!input.dateEntryId) return 'Choose a posted meeting or interview availability.';
  if (!input.requestedDate) return 'Choose a requested date.';
  if (!input.requestedTime) return 'Choose a requested time.';
  return undefined;
}

export function hasDuplicateMeetingRequest(requests: MeetingRequest[], input: MeetingRequestInput, requesterUid: string): boolean {
  return requests.some(
    (request) =>
      request.requesterUid === requesterUid &&
      request.organizationId === input.organizationId &&
      request.dateEntryId === input.dateEntryId &&
      request.requestedDate === input.requestedDate &&
      request.requestedTime === input.requestedTime,
  );
}

export function hasDuplicateApplication(applications: ApplicationRecord[], studentUid: string, opportunityId: string): boolean {
  return applications.some((application) => application.studentUid === studentUid && application.opportunityId === opportunityId);
}

export function getSafeHttpUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

export function getStageTone(stage: ApplicationStage): 'neutral' | 'progress' | 'approved' | 'attention' {
  if (stage === 'Accepted') return 'approved';
  if (stage === 'Declined') return 'attention';
  if (stage === 'Under review') return 'progress';
  return 'neutral';
}

export function getMeetingTone(status: MeetingStatus): 'neutral' | 'progress' | 'approved' | 'attention' {
  if (status === 'Approved') return 'approved';
  if (status === 'Declined') return 'attention';
  return 'progress';
}

export function getAccessCopy(status: AccessStatus): string {
  if (status === 'active') return 'Active annual access';
  if (status === 'expired') return 'Expired access: main workflow data should remain locked until renewal.';
  if (status === 'pending') return 'Payment pending: workflow pages should remain gated.';
  if (status === 'failed' || status === 'cancelled') return 'Payment did not complete: workflow pages should remain gated.';
  return 'Paid access is missing: workflow pages should remain gated.';
}

export function getUnavailableCopy(): string {
  return 'Workflow services are not connected yet. This page will not claim that sample saves are live backend persistence.';
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
