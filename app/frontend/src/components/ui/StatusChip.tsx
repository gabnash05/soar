import type { ReactNode } from 'react';

type ChipTone = 'neutral' | 'info' | 'progress' | 'attention' | 'approved' | 'danger';

export const StatusChip = ({ tone = 'neutral', children }: { tone?: ChipTone; children: ReactNode }) => (
  <span className={`chip chip-${tone}`}>{children}</span>
);
