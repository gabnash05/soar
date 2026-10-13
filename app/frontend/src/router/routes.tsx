import type { ReactNode } from 'react';
import {
  Navigate,
  Outlet,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { LoadingBlock, StateBlock, ButtonLink } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { hasActiveAccess, hasApprovedOfficerGrant, isStatsAdminAccount, isStudentAccount } from '../lib/contracts';
import { CheckoutStatusPage } from '../pages/access/CheckoutStatusPage';
import { EmailVerificationPage } from '../pages/access/EmailVerificationPage';
import { EntryPage } from '../pages/access/EntryPage';
import { LoginPage } from '../pages/access/LoginPage';
import { RecoveryPage } from '../pages/access/RecoveryPage';
import { RegistrationIntentPage } from '../pages/access/RegistrationIntentPage';
import { AccessSettingsPage } from '../pages/settings/AccessSettingsPage';
import { AccountSettingsPage } from '../pages/settings/AccountSettingsPage';
import { OrganizationSettingsPage } from '../pages/settings/OrganizationSettingsPage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import {
  ApplicationsPage,
  DirectoryPage,
  FeedPage,
  MeetingsPage,
  OrganizationPage,
} from '../pages/workflows';

const GuardLayout = ({
  requireSession = false,
  requireVerified = false,
  requireActiveAccess = false,
  requireStudent = false,
  requireOfficerGrant = false,
  requireAdmin = false,
  allowExpired = false,
}: {
  requireSession?: boolean;
  requireVerified?: boolean;
  requireActiveAccess?: boolean;
  requireStudent?: boolean;
  requireOfficerGrant?: boolean;
  requireAdmin?: boolean;
  allowExpired?: boolean;
}) => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <main className="grid min-h-screen place-items-center p-6"><LoadingBlock label="Loading session" /></main>;

  if (requireSession && !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (session && requireVerified && !session.emailVerified) {
    return <Navigate to="/access/verify-email" replace />;
  }

  if (session && requireAdmin && !isStatsAdminAccount(session)) {
    return (
      <main className="mx-auto grid min-h-screen w-[min(760px,100%)] place-items-center p-6">
        <StateBlock symbol="!" title="Admin statistics unavailable">
          This dashboard is available only to provisioned aggregate-statistics admins.
        </StateBlock>
      </main>
    );
  }

  if (session && requireActiveAccess && !hasActiveAccess(session)) {
    return <Navigate to="/settings/access" replace state={{ lockedFrom: location.pathname }} />;
  }

  if (session && !allowExpired && requireActiveAccess && !hasActiveAccess(session)) {
    return <Navigate to="/settings/access" replace />;
  }

  if (session && requireStudent && !isStudentAccount(session)) {
    return (
      <main className="mx-auto grid min-h-screen w-[min(760px,100%)] place-items-center p-6">
        <StateBlock symbol="0" title="Student-only area">
          Sponsors can browse organizations and manage meeting requests, but application tools are for student accounts.
        </StateBlock>
      </main>
    );
  }

  if (session && requireOfficerGrant && !hasApprovedOfficerGrant(session)) {
    return (
      <main className="mx-auto grid min-h-screen w-[min(760px,100%)] place-items-center p-6">
        <StateBlock symbol="!" title="Officer access not active">
Organization management controls appear only where your account has access.
        </StateBlock>
      </main>
    );
  }

  return <Outlet />;
};

const PublicOnly = ({ children }: { children: ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return <main className="grid min-h-screen place-items-center p-6"><LoadingBlock label="Loading session" /></main>;
  if (session?.emailVerified && isStatsAdminAccount(session)) return <Navigate to="/admin" replace />;
  if (session?.emailVerified && hasActiveAccess(session)) return <Navigate to="/app" replace />;
  if (session && !session.emailVerified) return <Navigate to="/access/verify-email" replace />;
  if (session && !hasActiveAccess(session)) return <Navigate to="/settings/access" replace />;
  return <>{children}</>;
};

const NotFoundPage = () => (
  <main className="mx-auto grid min-h-screen w-[min(760px,100%)] place-items-center p-6">
    <StateBlock
      symbol="?"
      title="Page not found"
      actions={<ButtonLink to="/app" variant="secondary">Return to SOAR</ButtonLink>}
    >
      Check the address or return to the app.
    </StateBlock>
  </main>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <PublicOnly>
        <EntryPage />
      </PublicOnly>
    ),
  },
  {
    path: '/login',
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },
  {
    path: '/recovery',
    element: <RecoveryPage />,
  },
  {
    path: '/register',
    element: (
      <PublicOnly>
        <RegistrationIntentPage />
      </PublicOnly>
    ),
  },
  {
    path: '/access/checkout',
    element: (
      <PublicOnly>
        <CheckoutStatusPage />
      </PublicOnly>
    ),
  },
  {
    element: <GuardLayout requireSession />,
    children: [
      { path: '/access/verify-email', element: <EmailVerificationPage /> },
      {
        path: '/settings',
        element: <AppShell allowLockedMain />,
        children: [
          { index: true, element: <Navigate to="/settings/account" replace /> },
          { path: 'account', element: <AccountSettingsPage /> },
          { path: 'access', element: <AccessSettingsPage /> },
          { path: 'organization', element: <GuardLayout requireVerified requireActiveAccess requireOfficerGrant />, children: [{ index: true, element: <OrganizationSettingsPage /> }] },
        ],
      },
      {
        path: '/admin',
        element: <AppShell allowLockedMain />,
        children: [
          { element: <GuardLayout requireVerified requireAdmin />, children: [{ index: true, element: <AdminDashboardPage /> }] },
        ],
      },
    ],
  },
  {
    element: <GuardLayout requireSession requireVerified requireActiveAccess />,
    children: [
      {
        path: '/app',
        element: <AppShell />,
        children: [
          { index: true, element: <FeedPage /> },
          { path: 'directory', element: <DirectoryPage /> },
          { path: 'organizations/:organizationId', element: <OrganizationPage /> },
          { path: 'applications', element: <GuardLayout requireStudent />, children: [{ index: true, element: <ApplicationsPage /> }] },
          { path: 'meetings', element: <MeetingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
