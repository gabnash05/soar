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
  const { session, requestManualRenewal, reloadSession, error, clearError, gateway } = useAuth('access-settings');
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  useEffect(() => {
    const renewalId = searchParams.get('renewalId');
    const fixtureStatus = searchParams.get('fixtureStatus');
    if (gateway.mode === 'fixture' && renewalId && fixtureStatus === 'confirmed') {
      markFixtureRenewalConfirmedFromUrl(renewalId, fixtureStatus);
      void reloadSession().then(() => setMessage('Demo renewal applied locally.')).catch(() => {});
    }
  }, [gateway.mode, reloadSession, searchParams]);

  if (!session) return null;

  const active = hasActiveAccess(session);
  const tone = active ? 'approved' : session.access.status === 'expired' ? 'attention' : 'danger';
  const feePhp = session.access.feePhp ?? session.access.annualFeePhp;
  const periodLabel = session.access.periodLabel ?? '6 months';

  const handleRenew = async () => {
    clearError();
    setMessage(null);
    setWorking(true);
    try {
      const renewal = await requestManualRenewal();
      navigateToHostedCheckout(renewal.checkoutUrl);
    } catch {
      // AuthContext exposes the safe operation-scoped message; keep the current page available.
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mx-auto grid w-[min(1120px,100%)] gap-[18px]">
      <header className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--color-navy)] bg-[image:var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80">
        <p className="eyebrow mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-gold)]">Payment & access</p>
        <h1 className="mb-1.5 font-[var(--font-display)] text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.035em] text-white max-sm:text-[2.15rem]">Six-month access status</h1>
        <p>SOAR access costs PHP10 per account for six months. Users renew manually; there is no automatic recurring charge.</p>
      </header>

      {message ? <div className="rounded-[var(--radius-md)] border border-[var(--color-blue-deep)] bg-[var(--color-navy-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="status">{message}</div> : null}
      {error ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{error}</div> : null}

      <Card className="flex items-center justify-between gap-5 max-[820px]:flex-col max-[820px]:items-start [&_h2]:my-2.5">
        <div>
          <StatusChip tone={tone}>{session.access.status}</StatusChip>
          <h2>{active ? 'Main app access is active' : 'Main app access is locked'}</h2>
          <p>
            {active
              ? 'You can use role-appropriate SOAR pages until your six-month access expires.'
              : 'Your saved records are retained. Renew access to return to main workflow pages.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 max-[820px]:justify-start">
          <Button type="button" disabled={working || (!session.access.renewalAvailable && active)} onClick={handleRenew}>
            {working ? 'Opening checkout…' : active ? 'Renew when available' : 'Renew PHP10 access'}
          </Button>
          {active ? <ButtonLink to="/app" variant="secondary">Go to app</ButtonLink> : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
        <Card>
          <CardHeader title="Access details" eyebrow="Six-month plan">These values come from your secure access record.</CardHeader>
          <dl className="mt-[18px] grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-border)] p-0 [&_div]:grid [&_div]:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] [&_div]:gap-3 [&_div]:bg-[var(--color-white)] [&_div]:p-3 max-[820px]:[&_div]:grid-cols-1 max-[820px]:[&_div]:gap-0.5 [&_dt]:text-[13px] [&_dt]:text-[var(--muted-foreground)] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:font-bold [&_dd]:text-[var(--color-navy)]">
            <div><dt>Fee</dt><dd>PHP{feePhp}</dd></div>
            <div><dt>Access period</dt><dd>{periodLabel}</dd></div>
            <div><dt>Status</dt><dd>{session.access.status}</dd></div>
            <div><dt>Started</dt><dd>{formatDate(session.access.startsAt)}</dd></div>
            <div><dt>Expires</dt><dd>{formatDate(session.access.expiresAt)}</dd></div>
            <div><dt>Payment reference</dt><dd>{session.access.lastPaymentReference || 'No confirmed reference'}</dd></div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="When access expires" eyebrow="Available actions">You can still sign in, recover your password, renew access, and manage settings.</CardHeader>
          <ul className="m-0 grid list-none gap-3 p-0 [&_li]:grid [&_li]:grid-cols-[auto_minmax(0,1fr)] [&_li]:items-start [&_li]:gap-2.5 [&_li]:border-t [&_li]:border-[var(--color-border)] [&_li]:py-3 [&_li]:before:mt-[7px] [&_li]:before:size-2.5 [&_li]:before:rounded-full [&_li]:before:bg-[var(--color-gold)] [&_li]:before:content-['']">
            <li>Entry and sign-in stay available.</li>
            <li>Password recovery stays available.</li>
            <li>Payment renewal stays available.</li>
            <li>Personal settings stay available for recovery and account management.</li>
            <li>Directory, applications, meetings, and organization management require active access.</li>
          </ul>
          {gateway.mode === 'fixture' ? <div className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] text-sm bg-[var(--color-orange-soft)] text-[var(--color-navy)]">Demo renewals are simulated locally.</div> : null}
        </Card>
      </div>
    </div>
  );
};
