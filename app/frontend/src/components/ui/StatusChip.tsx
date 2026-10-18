import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type ChipTone = 'neutral' | 'info' | 'progress' | 'attention' | 'approved' | 'danger';

const toneClasses: Record<ChipTone, string> = {
  neutral: 'bg-[var(--color-off-white)] text-[var(--muted-foreground)]',
  info: 'bg-[var(--color-blue-soft)] text-[var(--color-blue-deep)]',
  progress: 'bg-[var(--color-gold-soft)] text-[var(--color-navy)]',
  attention: 'bg-[var(--color-orange-soft)] text-[var(--color-navy)]',
  approved: 'bg-[var(--color-navy-soft)] text-[var(--color-navy)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-orange-deep)]',
};

export const StatusChip = ({ tone = 'neutral', children, className }: { tone?: ChipTone; children: ReactNode; className?: string }) => (
  <span className={cn('chip inline-flex min-h-7 items-center rounded-md px-2.5 text-xs font-bold capitalize', toneClasses[tone], className)}>{children}</span>
);
