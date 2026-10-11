import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

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
    <nav className="subtab-nav" aria-label={label}>
      <div className="subtab-list" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
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
              className={`subtab ${selected ? 'active' : ''}`.trim()}
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
      className={`subtab-panel ${className}`.trim()}
    >
      {children}
    </section>
  );
}
