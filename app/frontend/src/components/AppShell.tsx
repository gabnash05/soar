import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SoarLogo } from './SoarLogo';
import { Button, StatusChip } from './ui';
import { useAuth } from '../context/AuthContext';
import { hasActiveAccess, hasApprovedOfficerGrant, isStudentAccount } from '../lib/contracts';
import { appNavRoutes } from '../router/nav';
import { cn } from '../lib/utils';

const firstApprovedGrant = (session: NonNullable<ReturnType<typeof useAuth>['session']>) =>
  session.officerGrants.find((grant) => grant.status === 'active' || grant.status === 'approved');

export const AppShell = ({ allowLockedMain = false }: { allowLockedMain?: boolean }) => {
  const { session, signOut, gateway } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const wasMobileOpen = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  const activeAccess = hasActiveAccess(session);
  const officer = hasApprovedOfficerGrant(session);
  const student = isStudentAccount(session);
  const admin = session?.accountKind === 'admin';

  const navRoutes = useMemo(
    () =>
      appNavRoutes.filter((route) => {
        if (route.requiresAdmin) return admin;
        if (admin) return false;
        if (route.requiresStudent && !student) return false;
        if (route.requiresOfficerGrant && !officer) return false;
        if (route.requiresActiveAccess && !activeAccess) return false;
        if (!activeAccess && !allowLockedMain && route.to.startsWith('/app')) return false;
        return true;
      }),
    [activeAccess, admin, allowLockedMain, officer, student],
  );

  useEffect(() => {
    const menuButton = document.querySelector<HTMLButtonElement>('[aria-controls="app-sidebar"]');
    if (!mobileOpen) {
      if (wasMobileOpen.current) menuButton?.focus();
      wasMobileOpen.current = false;
      return;
    }

    sidebarRef.current?.querySelector<HTMLElement>('nav a[href]')?.focus();
    wasMobileOpen.current = true;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !sidebarRef.current) return;

      const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  if (!session) return <Outlet />;

  const defaultManagedGrant = firstApprovedGrant(session);
  const resolveRouteTo = (to: string) => {
    if (to === '/settings/organization' && defaultManagedGrant) {
      return `/settings/organization?organizationId=${encodeURIComponent(defaultManagedGrant.organizationId)}`;
    }
    return to;
  };

  const accessTone = activeAccess ? 'approved' : session.access.status === 'expired' ? 'attention' : 'danger';
  const accessLabel = activeAccess
    ? session.access.provenance === 'unpaid-preview' ? 'Unpaid preview' : 'Active access'
    : session.access.status === 'expired' ? 'Expired access' : 'Access locked';
  const sidebarRole = admin ? 'Admin' : session.accountKind === 'sponsor' ? 'Sponsor' : officer ? 'Officer' : 'Student';

  return (
    <div className="min-h-screen bg-[var(--color-off-white)] pb-0 text-[var(--color-ink)]">
      <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-3.5 border-b border-[var(--color-border)] bg-white/90 px-[clamp(16px,3vw,40px)] py-3 backdrop-blur max-sm:min-h-16 max-sm:px-3 max-sm:py-2.5">
        <Button
          type="button"
          variant="quiet"
          className="hidden max-lg:inline-flex"
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          onClick={() => setMobileOpen((open) => !open)}
        >
          Menu
        </Button>
        <NavLink className="inline-flex min-w-0 items-center gap-2.5 text-[var(--color-navy)] no-underline [&_strong]:block [&_strong]:font-[var(--font-display)] [&_strong]:text-lg [&_strong]:font-extrabold [&_strong]:leading-none [&_small]:mt-0.5 [&_small]:block [&_small]:text-xs [&_small]:text-[var(--muted-foreground)] max-[820px]:[&_small]:hidden" to={admin ? '/admin' : activeAccess ? '/app' : '/settings/access'}>
          <SoarLogo />
          <span>
            <strong>SOAR</strong>
            <small>Student Organizations and Allied Resources</small>
          </span>
        </NavLink>
        <div className="flex flex-wrap items-center justify-end gap-2 max-sm:max-w-[115px] max-sm:[&_.chip]:w-full max-sm:[&_.chip]:justify-center max-[820px]:[&_.chip:first-child]:hidden">
          {gateway.mode === 'fixture' ? <StatusChip tone="attention">Demo mode</StatusChip> : null}
          {!admin ? <StatusChip tone={accessTone}>{accessLabel}</StatusChip> : null}
        </div>
      </header>

      <div className="mx-auto grid w-[min(1480px,100%)] grid-cols-[248px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside
          className={cn(
            'flex min-h-0 flex-col gap-4 bg-[var(--color-navy)] bg-[image:var(--gradient-brand-quiet)] px-3.5 py-5.5 text-white',
            'lg:sticky lg:top-[72px] lg:min-h-[calc(100vh-72px)] lg:self-start',
            'max-lg:fixed max-lg:inset-0 max-lg:z-[35] max-lg:h-dvh max-lg:w-[min(300px,86vw)] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:pl-[max(0.875rem,env(safe-area-inset-left))] max-lg:pr-[max(0.875rem,env(safe-area-inset-right))] max-lg:pt-[max(1.25rem,env(safe-area-inset-top))] max-lg:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-lg:-translate-x-[105%] max-lg:shadow-[var(--shadow-floating)] max-lg:transition-transform max-lg:duration-200 max-lg:ease-out',
            mobileOpen && 'max-lg:translate-x-0',
          )}
          id="app-sidebar"
          ref={sidebarRef}
          role={mobileOpen ? 'dialog' : undefined}
          aria-modal={mobileOpen ? true : undefined}
          aria-label={mobileOpen ? 'SOAR navigation' : undefined}
        >
          <div className="flex items-center gap-2.5 px-2 pb-2 [&_.soar-logo]:size-[34px] [&_strong]:block [&_strong]:font-[var(--font-display)] [&_span]:mt-0.5 [&_span]:block [&_span]:text-xs [&_span]:text-white/70">
            <SoarLogo />
            <div>
              <strong>{session.displayName}</strong>
              <small className="mt-0.5 block text-xs text-white/70" aria-label={sidebarRole}>{sidebarRole}</small>
            </div>
          </div>
          {!admin && !session.emailVerified ? (
            <div className="rounded-[var(--radius-md)] bg-white/10 p-3 text-[13px] text-white/80">Verify your email before using the main app.</div>
          ) : null}
          {!admin && !activeAccess ? (
            <div className="rounded-[var(--radius-md)] bg-white/10 p-3 text-[13px] text-white/80">Main SOAR pages are locked until access is active.</div>
          ) : null}
          <nav className="grid gap-1 [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded-lg [&_a]:border-l-2 [&_a]:border-transparent [&_a]:px-3 [&_a]:font-bold [&_a]:text-white/70 [&_a]:no-underline" aria-label="SOAR sections">
            {navRoutes.map((route) => {
              const to = resolveRouteTo(route.to);
              return (
                <NavLink
                  key={route.to}
                  to={to}
                  end={route.to === '/app'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'hover:bg-white/10 hover:text-white',
                      isActive && 'active border-[var(--color-gold)] bg-white/15 text-white',
                    )
                  }
                >
                  {route.label}
                </NavLink>
              );
            })}
          </nav>
          {officer && defaultManagedGrant ? (
            <div className="rounded-[var(--radius-md)] bg-white/10 p-3 text-[13px] text-white/80 [&_span]:block [&_span]:text-xs [&_span]:text-white/70 [&_strong]:mt-0.5 [&_strong]:block [&_strong]:text-white [&_a]:mt-2.5 [&_a]:inline-flex [&_a]:font-extrabold [&_a]:text-[var(--color-gold)] [&_a]:no-underline hover:[&_a]:underline hover:[&_a]:underline-offset-4 focus-visible:[&_a]:underline">
              <span>Officer permission</span>
              <strong>{defaultManagedGrant.organizationName}</strong>
              <NavLink to={resolveRouteTo('/settings/organization')} onClick={() => setMobileOpen(false)}>
                Manage this organization
              </NavLink>
            </div>
          ) : null}
          <Button type="button" variant="secondary" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </aside>

        {mobileOpen ? <button className="fixed inset-0 z-[34] border-0 bg-black/25" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}

        <main className="min-w-0 w-full p-[clamp(18px,3vw,40px)] max-sm:px-3.5" key={location.pathname}>
          <Outlet />
        </main>
      </div>

    </div>
  );
};
