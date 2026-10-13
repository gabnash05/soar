import type { HTMLAttributes, ReactNode } from 'react';
import { Card as ShadCard, CardContent, CardDescription, CardHeader as ShadCardHeader, CardTitle } from './card';
import { cn } from '../../lib/utils';

export const Card = ({ className = '', ...props }: HTMLAttributes<HTMLElement>) => (
  <ShadCard className={cn('card min-w-0 rounded-2xl border-0 bg-[var(--color-white)] p-0 text-[var(--color-ink)] shadow-[var(--shadow-soft)]', className)} {...props} />
);

export const CardHeader = ({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) => (
  <ShadCardHeader className="card-header gap-1 px-0 pt-0">
    {eyebrow ? <p className="eyebrow mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">{eyebrow}</p> : null}
    <CardTitle className="text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-navy)]">{title}</CardTitle>
    {children ? <CardDescription className="card-note max-w-[64ch] text-[var(--color-muted)]">{children}</CardDescription> : null}
  </ShadCardHeader>
);

export const CardBody = CardContent;
