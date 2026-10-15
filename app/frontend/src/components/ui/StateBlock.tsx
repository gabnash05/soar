import type { ReactNode } from 'react';

export const StateBlock = ({
  symbol = 'i',
  title,
  children,
  actions,
}: {
  symbol?: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="grid min-h-[260px] place-items-center rounded-[var(--radius-lg)] bg-[var(--color-white)] p-7 text-center shadow-[var(--shadow-soft)] [&_h2]:mb-2 [&_h2]:font-[var(--font-display)] [&_h2]:text-[var(--color-navy)] [&_p]:mx-auto [&_p]:max-w-[48ch] [&_p]:text-[var(--muted-foreground)]">
    <div>
      <div className="mx-auto mb-3.5 grid size-[54px] place-items-center rounded-full bg-[var(--color-gold-soft)] font-[var(--font-display)] text-xl font-extrabold leading-none text-[var(--color-navy)]" aria-hidden="true">
        {symbol}
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {actions ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">{actions}</div> : null}
    </div>
  </div>
);

export const LoadingBlock = ({ label = 'Loading' }: { label?: string }) => (
  <div className="grid min-h-[260px] place-items-center rounded-[var(--radius-lg)] bg-[var(--color-white)] p-7 text-center shadow-[var(--shadow-soft)] [&_h2]:mb-2 [&_h2]:font-[var(--font-display)] [&_h2]:text-[var(--color-navy)] [&_p]:mx-auto [&_p]:max-w-[48ch] [&_p]:text-[var(--muted-foreground)]" role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <div className="grid w-[min(460px,100%)] gap-3 [&_i]:block [&_i]:h-3.5 [&_i]:rounded-full [&_i]:bg-[var(--color-border)] [&_i:first-child]:h-5 [&_i:first-child]:w-[42%] [&_i:nth-child(2)]:w-[88%] [&_i:nth-child(3)]:w-[68%]" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  </div>
);
