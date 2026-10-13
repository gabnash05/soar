import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { SoarLogo } from './SoarLogo';
import { Button, RoleBadge, StatusChip } from './ui';
import { useAuth } from '../context/AuthContext';
import { hasActiveAccess, hasApprovedOfficerGrant, isStatsAdminAccount, isStudentAccount } from '../lib/contracts';
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
  const statsAdmin = isStatsAdminAccount(session);

  const navRoutes = useMemo(
    () =>
      appNavRoutes.filter((route) => {
        if (route.requiresAdmin && !statsAdmin) return false;
        if (!statsAdmin && route.requiresStudent && !student) return false;
        if (!statsAdmin && route.requiresOfficerGrant && !officer) return false;
        if (!statsAdmin && route.requiresActiveAccess && !activeAccess) return false;
        if (!statsAdmin && !activeAccess && !allowLockedMain && route.to.startsWith('/app')) return false;
        if (statsAdmin && route.to !== '/admin' && route.to !== '/settings/account') return false;
        return true;
      }),
    [activeAccess, allowLockedMain, officer, statsAdmin, student],
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

  const accessTone = statsAdmin ? 'info' : activeAccess ? 'approved' : session.access.status === 'expired' ? 'attention' : 'danger';
  const accessLabel = statsAdmin ? 'Admin statistics' : activeAccess ? 'Active access' : session.access.status === 'expired' ? 'Expired access' : 'Access locked';

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
        <NavLink className="brand-lockup" to={statsAdmin ? '/admin' : activeAccess ? '/app' : '/settings/access'}>
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
              {gateway.mode === 'fixture' ? (
                <div className="role-badge-row" aria-label="Demo persona roles">
                  <span className="sr-only">Demo persona</span>
                  <RoleBadge kind={session.accountKind}>{session.accountKind === 'admin' ? 'Stats admin' : session.accountKind === 'student' ? 'Student' : 'Sponsor'}</RoleBadge>
                  {officer ? <RoleBadge kind="officer">Approved officer</RoleBadge> : null}
                </div>
              ) : (
                <small>{statsAdmin ? 'Stats admin' : session.email}</small>
              )}
            </div>
          </div>
          {!session.emailVerified ? (
            <div className="sidebar-alert">Verify your email before using the main app.</div>
          ) : null}
          {!statsAdmin && !activeAccess ? (
            <div className="sidebar-alert">Main SOAR pages are locked until PHP10 six-month access is active.</div>
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
          {!statsAdmin && officer && defaultManagedGrant ? (
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

    </div>
  );
};
