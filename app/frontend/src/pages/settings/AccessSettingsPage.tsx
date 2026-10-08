import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Card, CardHeader, StatusChip } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { hasActiveAccess } from '../../lib/contracts';
import { markFixtureRenewalConfirmedFromUrl } from '../../lib/fixtures';
import { navigateToHostedCheckout } from '../../lib/redirects';

const formatDate = (value?: string) => {
  if (!value) return 'Not available';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

export const AccessSettingsPage = () => {
  const { session, requestManualRenewal, reloadSession, error, clearError, gateway } = useAuth();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const renewalId = searchParams.get('renewalId');
    const fixtureStatus = searchParams.get('fixtureStatus');
    if (gateway.mode === 'fixture' && renewalId && fixtureStatus === 'confirmed') {
      markFixtureRenewalConfirmedFromUrl(renewalId, fixtureStatus);
      void reloadSession().then(() => setMessage('Development fixture renewal applied. Production renewals require provider webhook confirmation.'));
    }
  }, [gateway.mode, reloadSession, searchParams]);

  if (!session) return null;

  const active = hasActiveAccess(session);
  const tone = active ? 'approved' : session.access.status === 'expired' ? 'attention' : 'danger';

  const handleRenew = async () => {
    clearError();
    setMessage(null);
    setWorking(true);
    try {
      const renewal = await requestManualRenewal();
      navigateToHostedCheckout(renewal.checkoutUrl);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="eyebrow">Payment & access</p>
        <h1>Annual access status</h1>
        <p>SOAR access costs PHP10 per account per year. Users renew manually; there is no automatic annual charge.</p>
      </header>

      {message ? <div className="form-success" role="status">{message}</div> : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <Card className="access-hero-card">
        <div>
          <StatusChip tone={tone}>{session.access.status}</StatusChip>
          <h2>{active ? 'Main app access is active' : 'Main app access is locked'}</h2>
          <p>
            {active
              ? 'You can use role-appropriate SOAR pages until your annual access expires.'
              : 'Your saved records are retained. Renew access to return to main workflow pages.'}
          </p>
        </div>
        <div className="access-actions">
          <Button type="button" disabled={working || (!session.access.renewalAvailable && active)} onClick={handleRenew}>
            {working ? 'Opening checkout…' : active ? 'Renew when available' : 'Renew PHP10 access'}
          </Button>
          {active ? <ButtonLink to="/app" variant="secondary">Go to app</ButtonLink> : null}
        </div>
      </Card>

      <div className="settings-grid">
        <Card>
          <CardHeader title="Access details" eyebrow="Read only">These values come from backend entitlement records and are not editable in the browser.</CardHeader>
          <dl className="summary-list">
            <div><dt>Annual fee</dt><dd>PHP{session.access.annualFeePhp}</dd></div>
            <div><dt>Status</dt><dd>{session.access.status}</dd></div>
            <div><dt>Started</dt><dd>{formatDate(session.access.startsAt)}</dd></div>
            <div><dt>Expires</dt><dd>{formatDate(session.access.expiresAt)}</dd></div>
            <div><dt>Payment reference</dt><dd>{session.access.lastPaymentReference || 'No confirmed reference'}</dd></div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Locked paths" eyebrow="Access boundary">Expired users can still use sign-in, password recovery, renewal, and settings. Main workflows remain locked.</CardHeader>
          <ul className="check-list">
            <li>Entry and sign-in stay available.</li>
            <li>Password recovery stays available.</li>
            <li>Payment renewal stays available.</li>
            <li>Personal settings stay available for recovery and account management.</li>
            <li>Directory, applications, meetings, and officer tools require active access.</li>
          </ul>
          {gateway.mode === 'fixture' ? <div className="notice compact warning">Fixture renewals are local development aids only and do not prove live billing readiness.</div> : null}
        </Card>
      </div>
    </div>
  );
};
