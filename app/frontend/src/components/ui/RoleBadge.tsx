import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type RoleBadgeKind = 'student' | 'sponsor' | 'officer';

const labels: Record<RoleBadgeKind, string> = {
  student: 'Student',
  sponsor: 'Sponsor',
  officer: 'Approved officer',
};

const roleClasses: Record<RoleBadgeKind, { text: string; mark: string }> = {
  student: { text: 'text-[var(--color-blue-deep)]', mark: 'bg-[var(--color-blue)]' },
  sponsor: { text: 'text-[var(--color-orange-deep)]', mark: 'bg-[var(--color-gold)]' },
  officer: { text: 'text-[var(--color-navy)]', mark: 'bg-[var(--color-gold)]' },
};

export const RoleBadge = ({ kind, children }: { kind: RoleBadgeKind; children?: ReactNode }) => (
  <span className={cn('inline-flex min-h-7 items-center gap-2 text-xs font-extrabold tracking-[0.01em]', roleClasses[kind].text)}>
    <span className={cn('size-2.5 shrink-0 rounded-full border-2 border-current shadow-[0_0_0_3px_color-mix(in_oklch,currentColor_12%,transparent)]', roleClasses[kind].mark)} aria-hidden="true" />
    <span>{children ?? labels[kind]}</span>
  </span>
);
