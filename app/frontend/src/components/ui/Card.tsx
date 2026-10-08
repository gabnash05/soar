import type { HTMLAttributes, ReactNode } from 'react';

export const Card = ({ className = '', ...props }: HTMLAttributes<HTMLElement>) => (
  <section className={`card ${className}`.trim()} {...props} />
);

export const CardHeader = ({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) => (
  <header className="card-header">
    {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
    <h2>{title}</h2>
    {children ? <p className="card-note">{children}</p> : null}
  </header>
);
