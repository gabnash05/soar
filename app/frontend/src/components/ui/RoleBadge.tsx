import type { ReactNode } from 'react';

export type RoleBadgeKind = 'student' | 'sponsor' | 'officer' | 'admin';

const labels: Record<RoleBadgeKind, string> = {
  student: 'Student',
  sponsor: 'Sponsor',
  officer: 'Approved officer',
  admin: 'Stats admin',
};

export const RoleBadge = ({ kind, children }: { kind: RoleBadgeKind; children?: ReactNode }) => (
  <span className={`role-badge role-badge-${kind}`}>
    <span className="role-badge__mark" aria-hidden="true" />
    <span>{children ?? labels[kind]}</span>
  </span>
);
