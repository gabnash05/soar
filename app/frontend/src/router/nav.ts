export interface NavRoute {
  to: string;
  label: string;
  shortLabel: string;
  requiresStudent?: boolean;
  requiresOfficerGrant?: boolean;
}

export const appNavRoutes: NavRoute[] = [
  { to: '/app', label: 'Announcements', shortLabel: 'Feed' },
  { to: '/app/directory', label: 'Organizations', shortLabel: 'Orgs' },
  { to: '/app/applications', label: 'Applications', shortLabel: 'Apps', requiresStudent: true },
  { to: '/app/meetings', label: 'Meetings', shortLabel: 'Meet' },
  { to: '/app/officer', label: 'Officer tools', shortLabel: 'Officer', requiresStudent: true, requiresOfficerGrant: true },
  { to: '/settings/access', label: 'Payment & access', shortLabel: 'Access' },
  { to: '/settings/account', label: 'Settings', shortLabel: 'Settings' },
];
