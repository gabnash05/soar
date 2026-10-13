import type { HTMLAttributes, ReactNode } from 'react';
import { Card as ShadCard, CardContent, CardDescription, CardHeader as ShadCardHeader, CardTitle } from './card';
import { cn } from '../../lib/utils';

export const Card = ({ className = '', ...props }: HTMLAttributes<HTMLElement>) => (
  <ShadCard
    className={cn(
      'min-w-0 rounded-[var(--radius-lg)] border-0 bg-[var(--color-white)] p-[clamp(18px,3vw,24px)] text-[var(--color-ink)] shadow-[var(--shadow-soft)] max-sm:p-[18px]',
      '[&_h1]:mb-2.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(2.15rem,6vw,4.5rem)] [&_h1]:leading-[1.04] [&_h1]:tracking-[-0.02em] [&_h1]:text-[var(--color-navy)]',
      '[&_h2]:mb-2 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.35rem,3vw,2rem)] [&_h2]:leading-[1.14] [&_h2]:text-[var(--color-navy)]',
      '[&_p]:text-[var(--muted-foreground)]',
      className,
    )}
    {...props}
  />
);

export const CardHeader = ({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) => (
  <ShadCardHeader className="mb-4 gap-1 px-0 pt-0">
    {eyebrow ? <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">{eyebrow}</p> : null}
    <CardTitle className="text-2xl font-extrabold tracking-[-0.02em] text-[var(--color-navy)]">{title}</CardTitle>
    {children ? <CardDescription className="m-0 max-w-[64ch] text-[var(--muted-foreground)]">{children}</CardDescription> : null}
  </ShadCardHeader>
);

export const CardBody = CardContent;
