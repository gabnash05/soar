import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, ButtonLink, Card, Field, LoadingBlock, StateBlock, TextInput, StatusChip } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import type { CheckoutStatus } from '../../lib/contracts';
import { isCanonicalDepartment } from '../../lib/departments';
import { markFixturePaymentConfirmedFromUrl } from '../../lib/fixtures';
import { readRegistrationDraft } from './RegistrationIntentPage';

export const CheckoutStatusPage = () => {
  const { gateway, registerAccount, error, clearError } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const intentId = searchParams.get('intentId') || searchParams.get('intent_id') || readRegistrationDraft()?.intentId || '';
  const fixtureStatus = searchParams.get('fixtureStatus');
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(intentId));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const draft = useMemo(() => readRegistrationDraft(), []);

  useEffect(() => {
    if (!intentId) return;
    if (gateway.mode === 'fixture') markFixturePaymentConfirmedFromUrl(intentId, fixtureStatus);
    let active = true;
    setLoading(true);
    gateway
      .getCheckoutStatus(intentId)
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch((caught) => {
        if (active) setLocalError(caught instanceof Error ? caught.message : 'Could not read checkout status.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fixtureStatus, gateway, intentId]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setLocalError(null);
    if (!draft?.email || !draft.displayName || !draft.role) {
      setLocalError('Registration details were not found. Start the payment flow again so the account can be tied to the right person.');
      return;
    }
    if (draft.role === 'student' && !isCanonicalDepartment(draft.department)) {
      setLocalError('Department selection is required for student registration. Start the registration flow again and choose from the department list.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Use at least 8 characters for your password.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await registerAccount({
        intentId,
        email: draft.email,
        displayName: draft.displayName,
        role: draft.role,
        studentId: draft.studentId,
        department: draft.department,
        companyName: draft.companyName,
        password,
      });
      setPassword('');
      setConfirmPassword('');
      navigate('/access/verify-email', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (!intentId) {
    return (
      <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5">
        <StateBlock symbol="!" title="Checkout intent missing" actions={<ButtonLink to="/register" variant="secondary">Start registration</ButtonLink>}>
          Start from registration so SOAR can link the payment intent to your future account.
        </StateBlock>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5 items-center">
      <Card className="w-[min(520px,100%)] grid w-[min(980px,100%)] gap-[clamp(20px,4vw,44px)] md:grid-cols-[minmax(0,0.9fr)_minmax(280px,1fr)]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 font-[var(--font-display)] text-xl font-extrabold leading-none text-[var(--color-navy)]"><SoarLogo /><span>SOAR</span></div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Checkout status</p>
          <h1>Confirm six-month access</h1>
          {loading ? <LoadingBlock label="Checking payment status" /> : null}
          {status ? (
            <div className="my-[18px] grid gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-off-white)] p-4">
              <StatusChip tone={status.canCreateAccount ? 'approved' : status.status === 'pending' ? 'attention' : 'danger'}>{status.status}</StatusChip>
              <h2>{status.canCreateAccount ? 'Payment confirmed' : 'Account creation locked'}</h2>
              <p>{status.message}</p>
              <dl className="mt-[18px] grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-border)] p-0 [&_div]:grid [&_div]:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] [&_div]:gap-3 [&_div]:bg-[var(--color-white)] [&_div]:p-3 max-[820px]:[&_div]:grid-cols-1 max-[820px]:[&_div]:gap-0.5 [&_dt]:text-[13px] [&_dt]:text-[var(--muted-foreground)] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:font-bold [&_dd]:text-[var(--color-navy)]">
                <div><dt>Intent</dt><dd>{status.intentId}</dd></div>
                <div><dt>Amount</dt><dd>PHP{status.amountPhp}</dd></div>
                <div><dt>Reference</dt><dd>{status.providerReference || 'Not confirmed yet'}</dd></div>
              </dl>
            </div>
          ) : null}
          {gateway.mode === 'fixture' ? <div className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] text-sm bg-[var(--color-orange-soft)] text-[var(--color-navy)]">Demo payment confirmation is simulated locally.</div> : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 font-bold text-[var(--color-blue-deep)] max-sm:flex-col max-sm:items-stretch"><Link to="/register">Start over</Link><Link to="/login">Sign in instead</Link></div>
        </div>

        <form onSubmit={handleCreate} className="grid content-start gap-3.5" aria-disabled={!status?.canCreateAccount}>
          <h2>Create account</h2>
          <p className="m-0 max-w-[64ch] text-[var(--muted-foreground)]">This step is enabled only after provider-confirmed payment. Email verification is still required before the main app.</p>
          {(localError || error) ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{localError || error}</div> : null}
          <dl className="mt-[18px] grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-border)] p-0 [&_div]:grid [&_div]:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] [&_div]:gap-3 [&_div]:bg-[var(--color-white)] [&_div]:p-3 max-[820px]:[&_div]:grid-cols-1 max-[820px]:[&_div]:gap-0.5 [&_dt]:text-[13px] [&_dt]:text-[var(--muted-foreground)] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:font-bold [&_dd]:text-[var(--color-navy)] mt-0">
            <div><dt>Name</dt><dd>{draft?.displayName || 'Missing draft'}</dd></div>
            <div><dt>Email</dt><dd>{draft?.email || 'Missing draft'}</dd></div>
            <div><dt>Account type</dt><dd>{draft?.role === 'sponsor' ? 'Sponsor' : 'Student'}</dd></div>
            {draft?.studentId ? <div><dt>Student ID</dt><dd>{draft.studentId}</dd></div> : null}
            {draft?.role === 'student' ? <div><dt>Department</dt><dd>{draft.department || 'Missing department selection'}</dd></div> : null}
          </dl>
          <Field id="password" label="Password" hint="Use at least 8 characters.">
            <TextInput id="password" type="password" autoComplete="new-password" required disabled={!status?.canCreateAccount || submitting} value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Field id="confirmPassword" label="Confirm password">
            <TextInput id="confirmPassword" type="password" autoComplete="new-password" required disabled={!status?.canCreateAccount || submitting} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </Field>
          <Button type="submit" disabled={!status?.canCreateAccount || submitting}>{submitting ? 'Creating account…' : 'Create account and send verification'}</Button>
        </form>
      </Card>
    </main>
  );
};
