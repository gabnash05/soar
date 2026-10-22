import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Card, CardHeader, StatusChip } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { hasActiveAccess, type RenewalCheckoutStatus } from '../../lib/contracts';
import { isPaidFlowEnabled } from '../../lib/features';
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
  const { paymentPolicy, session, loading, requestManualRenewal, getRenewalStatus, reloadSession, error, clearError, gateway } = useAuth('access-settings');
  const paymentBuildEnabled = isPaidFlowEnabled();
  const paidFlowEnabled = paymentPolicy?.paymentsRequired === true
    && paymentPolicy.checkout.status === 'configured'
    && paymentBuildEnabled;
  const [searchParams] = useSearchParams();
  const renewalId = searchParams.get('renewalId');
  const checkoutNotice = searchParams.get('checkout');
  const [message, setMessage] = useState<string | null>(null);
  const [renewalStatus, setRenewalStatus] = useState<RenewalCheckoutStatus | null>(null);
  const [renewalChecking, setRenewalChecking] = useState(false);
  const [renewalPollCycle, setRenewalPollCycle] = useState(0);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  useEffect(() => {
    if (!paymentBuildEnabled) return;
    const fixtureStatus = searchParams.get('fixtureStatus');
    if (gateway.mode === 'fixture' && renewalId && fixtureStatus === 'confirmed') {
      markFixtureRenewalConfirmedFromUrl(renewalId, fixtureStatus);
      void reloadSession().then(() => setMessage('Demo renewal applied locally.')).catch(() => {});
    }
    if (loading || !session || !renewalId) return;

    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setRenewalStatus(null);
    const checkRenewal = async () => {
      if (!active) return;
      setRenewalChecking(true);
      try {
        const next = await getRenewalStatus(renewalId);
        if (!active) return;
        setRenewalStatus(next);
        attempts += 1;
        if (next.status === 'confirmed') void reloadSession().catch(() => {});
        if (next.status === 'pending' && attempts < 6) {
          timeout = setTimeout(() => void checkRenewal(), 5000);
        }
      } catch {
        // Keep the access settings screen available; the scoped safe error remains visible.
      } finally {
        if (active) setRenewalChecking(false);
      }
    };
    void checkRenewal();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [gateway.mode, getRenewalStatus, loading, paymentBuildEnabled, reloadSession, renewalId, renewalPollCycle, searchParams, session?.uid]);

  if (!session) return null;

  const active = hasActiveAccess(session);
  const previewAccess = session.access.provenance === 'unpaid-preview';
  const tone = active ? 'approved' : session.access.status === 'expired' ? 'attention' : 'danger';
  const feePhp = session.access.feePhp ?? session.access.annualFeePhp;
  const periodLabel = session.access.periodLabel ?? '6 months';

  const handleRenew = async () => {
    if (!paidFlowEnabled) return;
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
        <h1 className="mb-1.5 font-[var(--font-display)] text-[clamp(1.9rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.035em] text-white max-sm:text-[2.15rem]">{previewAccess ? 'Account access' : 'Six-month access status'}</h1>
        <p>{previewAccess
          ? 'This account has access without payment. No transaction or paid entitlement was created.'
          : paidFlowEnabled
            ? 'SOAR access costs PHP10 per account for six months through QR Ph (scan with GCash or another supported bank/e-wallet app). Users renew manually; there is no automatic recurring charge.'
            : paymentPolicy?.paymentsRequired
              ? 'Payment is required, but checkout is unavailable in this deployment. Existing access records are unchanged; contact an administrator for next steps.'
              : paymentPolicy?.paymentsRequired === false
                ? 'Payment is not required for new accounts right now. This account still follows its saved access record; no paid history or revocations are changed.'
                : 'Payment settings could not be loaded. Saved access status is shown here; renewal is unavailable.'}</p>
      </header>

      {message ? <div className="rounded-[var(--radius-md)] border border-[var(--color-blue-deep)] bg-[var(--color-navy-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="status">{message}</div> : null}
      {paymentBuildEnabled && renewalId ? (
        <section className="grid gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)] p-4" aria-live="polite">
          <StatusChip tone={renewalStatus?.status === 'confirmed' ? 'approved' : renewalStatus?.status === 'failed' ? 'danger' : 'attention'}>
            {renewalStatus?.status || 'checking'}
          </StatusChip>
          <h2>{renewalStatus?.status === 'confirmed' ? 'Renewal confirmed' : renewalStatus?.status === 'failed' ? 'Renewal not confirmed' : 'Checking renewal payment'}</h2>
          <p className="m-0 text-[var(--muted-foreground)]">
            {renewalStatus?.message || 'SOAR is checking the renewal record. Returning from checkout is not proof of payment.'}
          </p>
          {renewalStatus?.status !== 'confirmed' ? (
            <Button type="button" variant="secondary" disabled={renewalChecking} onClick={() => setRenewalPollCycle((cycle) => cycle + 1)}>
              {renewalChecking ? 'Checking payment…' : 'Check renewal status'}
            </Button>
          ) : null}
          {checkoutNotice === 'cancelled' && renewalStatus?.status !== 'confirmed' ? (
            <p className="m-0 text-sm text-[var(--color-navy)]" role="status">Checkout was closed. Access remains unchanged unless SOAR confirms payment.</p>
          ) : null}
          {checkoutNotice === 'success' && renewalStatus?.status === 'pending' ? (
            <p className="m-0 text-sm text-[var(--color-blue-deep)]" role="status">Checkout returned successfully; waiting for the signed provider confirmation.</p>
          ) : null}
        </section>
      ) : null}
      {error ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{error}</div> : null}

      <Card className="flex items-center justify-between gap-5 max-[820px]:flex-col max-[820px]:items-start [&_h2]:my-2.5">
        <div>
          <StatusChip tone={tone}>{previewAccess ? 'Active access' : session.access.status}</StatusChip>
          <h2>{active ? 'Main app access is active' : 'Main app access is locked'}</h2>
          <p>
            {previewAccess && active
              ? 'You can use role-appropriate SOAR pages while this access remains active.'
              : active
                ? 'You can use role-appropriate SOAR pages until your six-month access expires.'
                : paidFlowEnabled ? 'Your saved records are retained. Renew access to return to main workflow pages.' : paymentPolicy?.paymentsRequired === false ? 'Your saved records are retained. Payment is not required right now, but access still follows the saved account access record.' : 'Your saved records are retained; payment is required but checkout is unavailable.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 max-[820px]:justify-start">
          {paidFlowEnabled ? <Button type="button" disabled={working || (!session.access.renewalAvailable && active)} onClick={handleRenew}>
            {working ? 'Opening checkout…' : active ? 'Renew when available' : 'Renew PHP10 access'}
          </Button> : <span role="status">Renewal is unavailable.</span>}
          {active ? <ButtonLink to="/app" variant="secondary">Go to app</ButtonLink> : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
        <Card>
          <CardHeader title="Access details" eyebrow={previewAccess ? 'Account access' : 'Six-month plan'}>{previewAccess ? 'Access is granted to this account; no payment was recorded.' : 'These values come from your secure access record.'}</CardHeader>
          <dl className="mt-[18px] grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-border)] p-0 [&_div]:grid [&_div]:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] [&_div]:gap-3 [&_div]:bg-[var(--color-white)] [&_div]:p-3 max-[820px]:[&_div]:grid-cols-1 max-[820px]:[&_div]:gap-0.5 [&_dt]:text-[13px] [&_dt]:text-[var(--muted-foreground)] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:font-bold [&_dd]:text-[var(--color-navy)]">
            <div><dt>Fee</dt><dd>{previewAccess ? 'No payment' : `PHP${feePhp}`}</dd></div>
            <div><dt>Access period</dt><dd>{previewAccess ? 'While access remains active' : periodLabel}</dd></div>
            <div><dt>Status</dt><dd>{session.access.status}</dd></div>
            <div><dt>Started</dt><dd>{formatDate(session.access.startsAt)}</dd></div>
            <div><dt>Expires</dt><dd>{previewAccess ? 'While access remains active' : formatDate(session.access.expiresAt)}</dd></div>
            <div><dt>Payment reference</dt><dd>{previewAccess ? 'No payment recorded' : session.access.lastPaymentReference || 'No confirmed reference'}</dd></div>
          </dl>
        </Card>
        <Card>
          <CardHeader title={previewAccess ? 'While access is active' : 'When access expires'} eyebrow="Available actions">You can still sign in, recover your password, and manage personal settings.</CardHeader>
          <ul className="m-0 grid list-none gap-3 p-0 [&_li]:grid [&_li]:grid-cols-[auto_minmax(0,1fr)] [&_li]:items-start [&_li]:gap-2.5 [&_li]:border-t [&_li]:border-[var(--color-border)] [&_li]:py-3 [&_li]:before:mt-[7px] [&_li]:before:size-2.5 [&_li]:before:rounded-full [&_li]:before:bg-[var(--color-gold)] [&_li]:before:content-['']">
            <li>Entry and sign-in stay available.</li>
            <li>Password recovery stays available.</li>
            {paidFlowEnabled ? <li>Payment renewal stays available.</li> : <li>Payment renewal is unavailable.</li>}
            <li>Personal settings stay available for recovery and account management.</li>
            <li>Directory, applications, meetings, and organization management require active access.</li>
          </ul>
          {gateway.mode === 'fixture' ? <div className="rounded-[var(--radius-md)] bg-[var(--color-orange-soft)] px-3.5 py-3 text-sm text-[var(--color-navy)]">Demo renewals are simulated locally.</div> : null}
        </Card>
      </div>
    </div>
  );
};
