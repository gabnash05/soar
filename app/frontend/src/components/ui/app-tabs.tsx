import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { cn } from '../../lib/utils';

export interface SubtabItem {
  id: string;
  label: string;
  count?: ReactNode;
}

export function useQueryTab(validIds: string[], defaultId: string, param = 'tab') {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const requestedTab = searchParams.get(param);
  const activeId = requestedTab && validIds.includes(requestedTab) ? requestedTab : defaultId;

  useEffect(() => {
    if (!requestedTab || validIds.includes(requestedTab)) return;
    const next = new URLSearchParams(searchParams);
    if (defaultId) next.set(param, defaultId);
    else next.delete(param);
    setSearchParams(next, { replace: true });
  }, [defaultId, param, requestedTab, searchParams, setSearchParams, validIds]);

  const getTabTo = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === defaultId) next.delete(param);
    else next.set(param, id);
    const query = next.toString();
    return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  };

  return { activeId, getTabTo };
}

export function SubtabNav({
  label,
  baseId,
  items,
  activeId,
  getTabTo,
}: {
  label: string;
  baseId: string;
  items: SubtabItem[];
  activeId: string;
  getTabTo: (id: string) => string;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('[role="tab"]'));
    if (!tabs.length) return;
    const currentIndex = tabs.indexOf(event.target as HTMLAnchorElement);
    if (currentIndex === -1) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + tabs.length) % tabs.length;
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return (
    <nav className="min-w-0 border-b border-[var(--color-border)]" aria-label={label}>
      <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-px [scrollbar-width:thin]" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <Link
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-t-[10px] px-3.5 font-extrabold whitespace-nowrap text-[var(--muted-foreground)] no-underline hover:bg-[var(--color-navy-soft)] hover:text-[var(--color-navy)]',
                '[&_strong]:grid [&_strong]:min-h-[22px] [&_strong]:min-w-[22px] [&_strong]:place-items-center [&_strong]:rounded-full [&_strong]:bg-[var(--color-gold-soft)] [&_strong]:px-1.5 [&_strong]:text-xs [&_strong]:text-[var(--color-navy)]',
                selected && 'bg-[var(--color-white)] text-[var(--color-navy)] shadow-[inset_0_-3px_0_var(--color-gold)]',
              )}
              to={getTabTo(item.id)}
            >
              <span>{item.label}</span>
              {item.count !== undefined ? <strong aria-hidden="true">{item.count}</strong> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SubtabPanel({
  baseId,
  tabId,
  activeId,
  children,
  className = '',
}: {
  baseId: string;
  tabId: string;
  activeId: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={`${baseId}-panel-${tabId}`}
      role="tabpanel"
      aria-labelledby={`${baseId}-tab-${tabId}`}
      hidden={activeId !== tabId}
      className={cn('block min-w-0 max-w-full', className)}
    >
      {children}
    </section>
  );
}
