export interface NavRoute {
  to: string;
  label: string;
  shortLabel: string;
  requiresStudent?: boolean;
  requiresOfficerGrant?: boolean;
  requiresAdmin?: boolean;
  requiresActiveAccess?: boolean;
}

export const appNavRoutes: NavRoute[] = [
  { to: '/admin', label: 'Admin', shortLabel: 'Admin', requiresAdmin: true },
  { to: '/app', label: 'Announcements', shortLabel: 'Feed' },
  { to: '/app/directory', label: 'Organizations', shortLabel: 'Orgs' },
  { to: '/settings/organization', label: 'Manage Organization', shortLabel: 'Manage', requiresOfficerGrant: true, requiresActiveAccess: true },
  { to: '/app/applications', label: 'Applications', shortLabel: 'Apps', requiresStudent: true },
  { to: '/app/meetings', label: 'Meetings', shortLabel: 'Meet' },
  { to: '/settings/access', label: 'Payment & access', shortLabel: 'Access' },
  { to: '/settings/account', label: 'Settings', shortLabel: 'Settings' },
];
