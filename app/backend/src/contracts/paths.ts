export const COLLECTIONS = {
  accounts: 'accounts',
  entitlements: 'entitlements',
  entitlementProviderEvents: 'entitlementProviderEvents',
  organizations: 'organizations',
  officerGrants: 'officerGrants',
  announcements: 'announcements',
  calendarEntries: 'calendarEntries',
  applications: 'applications',
  meetingRequests: 'meetingRequests'
} as const;

export function accountPath(uid: string): string {
  return `${COLLECTIONS.accounts}/${uid}`;
}

export function entitlementPath(uid: string): string {
  return `${COLLECTIONS.entitlements}/${uid}`;
}

export function entitlementProviderEventPath(eventKey: string): string {
  return `${COLLECTIONS.entitlementProviderEvents}/${eventKey}`;
}

export function organizationPath(orgId: string): string {
  return `${COLLECTIONS.organizations}/${orgId}`;
}

export function officerGrantPath(orgId: string, uid: string): string {
  return `${organizationPath(orgId)}/${COLLECTIONS.officerGrants}/${uid}`;
}

export function organizationLogoStoragePath(orgId: string, fileName: string): string {
  return `organization-logos/${orgId}/${fileName}`;
}

export function announcementImageStoragePath(orgId: string, announcementId: string, fileName: string): string {
  return `announcement-images/${orgId}/${announcementId}/${fileName}`;
}
