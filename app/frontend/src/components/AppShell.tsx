import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { SoarLogo } from './SoarLogo';
import { Button, ButtonLink, StatusChip } from './ui';
import { useAuth } from '../context/AuthContext';
import { hasActiveAccess, hasApprovedOfficerGrant, isStudentAccount } from '../lib/contracts';
import { appNavRoutes } from '../router/nav';

const firstApprovedGrant = (session: NonNullable<ReturnType<typeof useAuth>['session']>) =>
  session.officerGrants.find((grant) => grant.status === 'active' || grant.status === 'approved');

export const AppShell = ({ allowLockedMain = false }: { allowLockedMain?: boolean }) => {
  const { session, signOut, gateway } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const activeAccess = hasActiveAccess(session);
  const officer = hasApprovedOfficerGrant(session);
  const student = isStudentAccount(session);

  const navRoutes = useMemo(
    () =>
      appNavRoutes.filter((route) => {
        if (route.requiresStudent && !student) return false;
        if (route.requiresOfficerGrant && !officer) return false;
        if (route.requiresActiveAccess && !activeAccess) return false;
        if (!activeAccess && !allowLockedMain && route.to.startsWith('/app')) return false;
        return true;
      }),
    [activeAccess, allowLockedMain, officer, student],
  );

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
  const accessLabel = activeAccess ? 'Active access' : session.access.status === 'expired' ? 'Expired access' : 'Access locked';

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Button
          type="button"
          variant="quiet"
          className="mobile-menu-button"
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          onClick={() => setMobileOpen((open) => !open)}
        >
          Menu
        </Button>
        <NavLink className="brand-lockup" to={activeAccess ? '/app' : '/settings/access'}>
          <SoarLogo />
          <span>
            <strong>SOAR</strong>
            <small>Student Organizations and Allied Resources</small>
          </span>
        </NavLink>
        <div className="topbar-meta">
          {gateway.mode === 'fixture' ? <StatusChip tone="attention">Demo mode</StatusChip> : null}
          <StatusChip tone={accessTone}>{accessLabel}</StatusChip>
        </div>
      </header>

      <div className="app-layout">
        <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`} id="app-sidebar">
          <div className="sidebar-profile">
            <SoarLogo />
            <div>
              <strong>{session.displayName}</strong>
              <span>{session.accountKind === 'student' ? 'Student account' : 'Sponsor account'}</span>
            </div>
          </div>
          {!session.emailVerified ? (
            <div className="sidebar-alert">Verify your email before using the main app.</div>
          ) : null}
          {!activeAccess ? (
            <div className="sidebar-alert">Main SOAR pages are locked until PHP10 annual access is active.</div>
          ) : null}
          <nav className="app-nav" aria-label="SOAR sections">
            {navRoutes.map((route) => {
              const to = resolveRouteTo(route.to);
              return (
                <NavLink
                  key={route.to}
                  to={to}
                  end={route.to === '/app'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => (isActive ? 'active' : undefined)}
                >
                  {route.label}
                </NavLink>
              );
            })}
          </nav>
          {officer && defaultManagedGrant ? (
            <div className="grant-card">
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

        {mobileOpen ? <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}

        <main className="app-content" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile SOAR navigation">
        {navRoutes.slice(0, 5).map((route) => {
          const to = resolveRouteTo(route.to);
          return (
            <NavLink key={route.to} to={to} end={route.to === '/app'}>
              {route.shortLabel}
            </NavLink>
          );
        })}
        <ButtonLink to="/settings/account" variant="quiet">More</ButtonLink>
      </nav>
    </div>
  );
};
