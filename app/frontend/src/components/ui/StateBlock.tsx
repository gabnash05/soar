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
  <div className="state-card">
    <div>
      <div className="state-symbol" aria-hidden="true">
        {symbol}
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {actions ? <div className="state-actions">{actions}</div> : null}
    </div>
  </div>
);

export const LoadingBlock = ({ label = 'Loading' }: { label?: string }) => (
  <div className="state-card" role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <div className="skeleton" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  </div>
);
