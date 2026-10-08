import type { ReactNode } from 'react';

export const StateBlock = ({
  symbol = '•',
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
  <div className="state-card" aria-label={label}>
    <div className="skeleton" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  </div>
);
