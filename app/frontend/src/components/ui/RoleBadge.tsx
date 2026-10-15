import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type RoleBadgeKind = 'student' | 'sponsor' | 'officer' | 'unknown';

const labels: Record<RoleBadgeKind, string> = {
  student: 'Student',
  sponsor: 'Sponsor',
  officer: 'Approved officer',
  unknown: 'Role unavailable',
};

const roleClasses: Record<RoleBadgeKind, { text: string; mark: string }> = {
  student: { text: 'text-[var(--color-blue-deep)]', mark: 'bg-[var(--color-blue)]' },
  sponsor: { text: 'text-[var(--color-orange-deep)]', mark: 'bg-[var(--color-gold)]' },
  officer: { text: 'text-[var(--color-navy)]', mark: 'bg-[var(--color-gold)]' },
  unknown: { text: 'text-[var(--muted-foreground)]', mark: 'bg-[var(--color-border)]' },
};

export const RoleBadge = ({ kind, children, className }: { kind: RoleBadgeKind; children?: ReactNode; className?: string }) => (
  <span className={cn('inline-flex min-h-7 items-center gap-2 text-xs font-extrabold tracking-[0.01em]', roleClasses[kind].text, className)}>
    <span className={cn('size-2.5 shrink-0 rounded-full border-2 border-current shadow-[0_0_0_3px_color-mix(in_oklch,currentColor_12%,transparent)]', roleClasses[kind].mark)} aria-hidden="true" />
    <span>{children ?? labels[kind]}</span>
  </span>
);
