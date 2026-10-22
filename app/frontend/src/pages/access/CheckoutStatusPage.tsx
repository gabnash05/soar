import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, ButtonLink, Card, Field, LoadingBlock, StateBlock, TextInput, StatusChip } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import type { CheckoutStatus } from '../../lib/contracts';
import { isCanonicalDepartment } from '../../lib/departments';
import { isPaidFlowEnabled } from '../../lib/features';
import { markFixturePaymentConfirmedFromUrl } from '../../lib/fixtures';
import { navigateToHostedCheckout } from '../../lib/redirects';
import { readRegistrationDraft } from './RegistrationIntentPage';

export const CheckoutStatusPage = () => {
  const paidFlowEnabled = isPaidFlowEnabled();
  const {
    gateway,
    registerAccount,
    requestPaidRegistrationRecovery,
    acceptPaidRegistrationRecovery,
    error,
    clearError,
  } = useAuth('registration');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const intentId = searchParams.get('intentId') || searchParams.get('intent_id') || readRegistrationDraft()?.intentId || '';
  const fixtureStatus = searchParams.get('fixtureStatus');
  const checkoutNotice = searchParams.get('checkout');
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(intentId));
  const [checking, setChecking] = useState(false);
  const [pollCycle, setPollCycle] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState(() => readRegistrationDraft()?.email || '');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  const draft = useMemo(() => readRegistrationDraft(), []);
  const registrationProfile = status?.registrationProfile ?? draft;

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  useEffect(() => {
    if (!paidFlowEnabled || !intentId) return;
    if (gateway.mode === 'fixture') markFixturePaymentConfirmedFromUrl(intentId, fixtureStatus);
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const checkStatus = async () => {
      if (!active) return;
      setChecking(true);
      try {
        const next = await gateway.getCheckoutStatus(intentId);
        if (!active) return;
        setStatus(next);
        setLocalError(null);
        attempts += 1;
        if (!next.canCreateAccount && !next.completed && next.status === 'pending' && attempts < 6) {
          timeout = setTimeout(() => void checkStatus(), 5000);
        }
      } catch (caught) {
        if (active) setLocalError(caught instanceof Error ? caught.message : 'Could not read checkout status.');
      } finally {
        if (active) {
          setLoading(false);
          setChecking(false);
        }
      }
    };

    setLoading(true);
    void checkStatus();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [fixtureStatus, gateway, intentId, paidFlowEnabled, pollCycle]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!paidFlowEnabled) return;
    clearError();
    setLocalError(null);
    if (!registrationProfile?.email || !registrationProfile.displayName || !registrationProfile.role) {
      setLocalError('Registration details are unavailable. Restore the secure registration session or start registration again.');
      return;
    }
    if (registrationProfile.role === 'student' && !isCanonicalDepartment(registrationProfile.department)) {
      setLocalError('Department selection is missing or invalid. Start registration again and choose from the department list.');
      return;
    }
    if (!status?.authFirst && password.length < 8) {
      setLocalError('Use at least 8 characters for your password.');
      return;
    }
    if (!status?.authFirst && password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await registerAccount({
        intentId,
        email: registrationProfile.email,
        displayName: registrationProfile.displayName,
        role: registrationProfile.role,
        studentId: registrationProfile.studentId,
        department: registrationProfile.department,
        companyName: registrationProfile.companyName,
        ...(!status?.authFirst ? { password } : {}),
      });
      setPassword('');
      setConfirmPassword('');
      navigate('/access/verify-email', { replace: true });
    } catch {
      // AuthContext retains the safe error and the password fields stay available for retry.
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!paidFlowEnabled) return;
    clearError();
    setRecoveryMessage(null);
    setRecoverySubmitting(true);
    try {
      const result = await requestPaidRegistrationRecovery(recoveryEmail.trim());
      setRecoveryMessage(result.delivery === 'not_configured'
        ? 'Email recovery is not configured yet. Keep this checkout page open; if its secure browser session is still available, you can continue here.'
        : 'If a paid registration matches this email and delivery is available, follow the recovery-code instructions sent to you.');
    } catch {
      // AuthContext retains the safe operation-scoped error.
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handleRecoveryAccept = async (event: FormEvent) => {
    event.preventDefault();
    if (!paidFlowEnabled) return;
    clearError();
    setRecoveryMessage(null);
    setRecoverySubmitting(true);
    try {
      await acceptPaidRegistrationRecovery(intentId, recoveryCode.trim());
      setRecoveryCode('');
      setRecoveryMessage('Secure registration session restored. Checking provider-confirmed payment status…');
      setPollCycle((cycle) => cycle + 1);
    } catch {
      // Keep the code field available; AuthContext retains the safe operation-scoped error.
    } finally {
      setRecoverySubmitting(false);
    }
  };

  if (!paidFlowEnabled) {
    return (
      <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5">
        <StateBlock symbol="!" title="Checkout unavailable" actions={<ButtonLink to="/login" variant="secondary">Sign in</ButtonLink>}>
          Payment confirmation and account creation are unavailable here. No payment was made or account created.
        </StateBlock>
      </main>
    );
  }

  if (!intentId) {
    return (
      <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5">
        <StateBlock symbol="!" title="Checkout intent missing" actions={<ButtonLink to="/register" variant="secondary">Start registration</ButtonLink>}>
          Start from registration so SOAR can link the payment to the right person.
        </StateBlock>
      </main>
    );
  }

  const paymentConfirmed = Boolean(status?.canCreateAccount || status?.completed);
  const statusHeading = status?.completed
    ? 'Account setup complete'
    : status?.canCreateAccount
      ? 'Payment confirmed'
      : status?.status === 'failed'
        ? 'Checkout not confirmed'
        : status?.status === 'expired'
          ? 'Checkout expired'
          : 'Payment still pending';

  return (
    <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5 items-center">
      <Card className="w-[min(520px,100%)] grid w-[min(980px,100%)] gap-[clamp(20px,4vw,44px)] md:grid-cols-[minmax(0,0.9fr)_minmax(280px,1fr)]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 font-[var(--font-display)] text-xl font-extrabold leading-none text-[var(--color-navy)]"><SoarLogo /><span>SOAR</span></div>
          <h1>Confirm six-month access</h1>
          {loading ? <LoadingBlock label="Checking payment status" /> : null}
          {status ? (
            <section aria-live="polite" className="my-[18px] grid gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-off-white)] p-4">
              <StatusChip tone={paymentConfirmed ? 'approved' : status.status === 'pending' ? 'attention' : 'danger'}>
                {status.completed ? 'complete' : status.canCreateAccount ? 'confirmed' : status.status}
              </StatusChip>
              <h2>{statusHeading}</h2>
              <p>{status.message}</p>
              <dl className="mt-[18px] grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-border)] p-0 [&_div]:grid [&_div]:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] [&_div]:gap-3 [&_div]:bg-[var(--color-white)] [&_div]:p-3 max-[820px]:[&_div]:grid-cols-1 max-[820px]:[&_div]:gap-0.5 [&_dt]:text-[13px] [&_dt]:text-[var(--muted-foreground)] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:font-bold [&_dd]:text-[var(--color-navy)]">
                <div><dt>Intent</dt><dd>{status.intentId}</dd></div>
                <div><dt>Amount</dt><dd>PHP{status.amountPhp}</dd></div>
                <div><dt>Reference</dt><dd>{status.providerReference || 'Not confirmed yet'}</dd></div>
              </dl>
              {!status.completed ? (
                <Button type="button" variant="secondary" disabled={checking} onClick={() => setPollCycle((cycle) => cycle + 1)}>
                  {checking ? 'Checking payment…' : 'Check payment status'}
                </Button>
              ) : null}
            </section>
          ) : null}
          {checkoutNotice === 'cancelled' && !paymentConfirmed ? (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-orange-soft)] px-3.5 py-3 text-sm text-[var(--color-navy)]" role="status">
              Checkout was closed. This return does not confirm a payment; SOAR will unlock account creation only after the backend verifies a signed provider notification.
            </p>
          ) : null}
          {checkoutNotice === 'success' && !paymentConfirmed ? (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-sm text-[var(--color-blue-deep)]" role="status">
              You returned from hosted checkout. Payment is being checked with SOAR; this redirect alone does not confirm payment.
            </p>
          ) : null}
          {(localError || error) ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{localError || error}</div> : null}
          {!status && !loading ? (
            <Button type="button" variant="secondary" disabled={checking} onClick={() => setPollCycle((cycle) => cycle + 1)}>
              {checking ? 'Checking payment…' : 'Try checking again'}
            </Button>
          ) : null}
          {gateway.mode === 'fixture' ? <div className="rounded-[var(--radius-md)] bg-[var(--color-orange-soft)] px-3.5 py-3 text-sm text-[var(--color-navy)]">Demo payment confirmation is simulated locally.</div> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 font-bold text-[var(--color-blue-deep)] max-sm:flex-col max-sm:items-stretch"><Link to="/register">Start over</Link><Link to="/login">Sign in instead</Link></div>

          {status?.status === 'pending' && status.checkoutUrl ? (
            <Button type="button" variant="secondary" onClick={() => navigateToHostedCheckout(status.checkoutUrl!)}>
              Continue to hosted checkout
            </Button>
          ) : null}
          {status?.authFirst && !status.completed ? (
            <p className="mt-6 border-t border-[var(--color-border)] pt-5 text-sm text-[var(--muted-foreground)]">
              This registration is tied to your SOAR sign-in. To resume on another device, sign in with the same email and password; use <Link to="/recovery">password recovery</Link> if needed.
            </p>
          ) : null}
          {!status?.authFirst && !status?.canCreateAccount && !status?.completed ? (
            <section className="mt-6 grid gap-3 border-t border-[var(--color-border)] pt-5">
              <h2>Paid, but unable to continue?</h2>
              <p className="m-0 text-sm text-[var(--muted-foreground)]">Request a recovery code to restore this browser’s secure registration session. A code is accepted only for a payment-confirmed registration.</p>
              <form onSubmit={handleRecoveryRequest} className="grid gap-3">
                <Field id="recoveryEmail" label="Registration email">
                  <TextInput id="recoveryEmail" type="email" autoComplete="email" required value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} disabled={recoverySubmitting} />
                </Field>
                <Button type="submit" variant="secondary" disabled={recoverySubmitting || !recoveryEmail.trim()}>
                  {recoverySubmitting ? 'Requesting recovery…' : 'Email recovery instructions'}
                </Button>
              </form>
              <form onSubmit={handleRecoveryAccept} className="grid gap-3">
                <Field id="recoveryCode" label="Recovery code" hint="Enter the code from your recovery message. It is sent securely to SOAR and is never placed in a URL.">
                  <TextInput id="recoveryCode" type="password" autoComplete="off" required value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} disabled={recoverySubmitting} />
                </Field>
                <Button type="submit" variant="secondary" disabled={recoverySubmitting || !recoveryCode.trim()}>
                  {recoverySubmitting ? 'Restoring session…' : 'Restore secure session'}
                </Button>
              </form>
              {recoveryMessage ? <p className="m-0 text-sm text-[var(--color-blue-deep)]" role="status">{recoveryMessage}</p> : null}
            </section>
          ) : null}
        </div>

        <form onSubmit={handleCreate} className="grid content-start gap-3.5" aria-disabled={!status?.canCreateAccount || status.completed}>
          <h2>{status?.authFirst ? 'Finish account setup' : 'Create account'}</h2>
          <p className="m-0 max-w-[64ch] text-[var(--muted-foreground)]">{status?.authFirst ? 'This profile and all SOAR access are saved only after provider-confirmed payment. The same sign-in used to start checkout is required.' : 'This step is enabled only after provider-confirmed payment. Email verification is still required before the main app.'}</p>
          <dl className="mt-[18px] grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-border)] p-0 [&_div]:grid [&_div]:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] [&_div]:gap-3 [&_div]:bg-[var(--color-white)] [&_div]:p-3 max-[820px]:[&_div]:grid-cols-1 max-[820px]:[&_div]:gap-0.5 [&_dt]:text-[13px] [&_dt]:text-[var(--muted-foreground)] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:font-bold [&_dd]:text-[var(--color-navy)] mt-0">
            <div><dt>Name</dt><dd>{registrationProfile?.displayName || 'Unavailable'}</dd></div>
            <div><dt>Email</dt><dd>{registrationProfile?.email || 'Unavailable'}</dd></div>
            <div><dt>Account type</dt><dd>{registrationProfile?.role === 'sponsor' ? 'Sponsor' : registrationProfile?.role === 'student' ? 'Student' : 'Unavailable'}</dd></div>
            {registrationProfile?.studentId ? <div><dt>Student ID</dt><dd>{registrationProfile.studentId}</dd></div> : null}
            {registrationProfile?.role === 'student' ? <div><dt>Department</dt><dd>{registrationProfile.department || 'Missing department selection'}</dd></div> : null}
          </dl>
          {!status?.authFirst ? (
            <>
              <Field id="password" label="Password" hint="Use at least 8 characters.">
                <TextInput id="password" type="password" autoComplete="new-password" required disabled={!status?.canCreateAccount || status.completed || submitting} value={password} onChange={(event) => setPassword(event.target.value)} />
              </Field>
              <Field id="confirmPassword" label="Confirm password">
                <TextInput id="confirmPassword" type="password" autoComplete="new-password" required disabled={!status?.canCreateAccount || status.completed || submitting} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </Field>
            </>
          ) : null}
          <Button type="submit" disabled={!status?.canCreateAccount || status.completed || submitting}>
            {submitting ? 'Creating account…' : status?.authFirst ? 'Finish account setup' : 'Create account and send verification'}
          </Button>
        </form>
      </Card>
    </main>
  );
};
