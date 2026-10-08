import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, ButtonLink, Card, Field, LoadingBlock, StateBlock, TextInput, StatusChip } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import type { CheckoutStatus } from '../../lib/contracts';
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
        companyName: draft.companyName,
        password,
      });
      navigate('/access/verify-email', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (!intentId) {
    return (
      <main className="auth-page">
        <StateBlock symbol="!" title="Checkout intent missing" actions={<ButtonLink to="/register" variant="secondary">Start registration</ButtonLink>}>
          Start from registration so SOAR can link the payment intent to your future account.
        </StateBlock>
      </main>
    );
  }

  return (
    <main className="auth-page wide">
      <Card className="auth-card split-card">
        <div>
          <div className="auth-logo"><SoarLogo /><span>SOAR</span></div>
          <p className="eyebrow">Checkout status</p>
          <h1>Confirm annual access</h1>
          {loading ? <LoadingBlock label="Checking payment status" /> : null}
          {status ? (
            <div className="status-panel">
              <StatusChip tone={status.canCreateAccount ? 'approved' : status.status === 'pending' ? 'attention' : 'danger'}>{status.status}</StatusChip>
              <h2>{status.canCreateAccount ? 'Payment confirmed' : 'Account creation locked'}</h2>
              <p>{status.message}</p>
              <dl className="summary-list">
                <div><dt>Intent</dt><dd>{status.intentId}</dd></div>
                <div><dt>Amount</dt><dd>PHP{status.amountPhp}</dd></div>
                <div><dt>Reference</dt><dd>{status.providerReference || 'Not confirmed yet'}</dd></div>
              </dl>
            </div>
          ) : null}
          {gateway.mode === 'fixture' ? <div className="notice compact warning">Fixture mode confirms only the named local development URL. It is not production payment evidence.</div> : null}
          <div className="auth-links"><Link to="/register">Start over</Link><Link to="/login">Sign in instead</Link></div>
        </div>

        <form onSubmit={handleCreate} className="form-grid" aria-disabled={!status?.canCreateAccount}>
          <h2>Create account</h2>
          <p className="card-note">This step is enabled only after provider-confirmed payment. Email verification is still required before the main app.</p>
          {(localError || error) ? <div className="form-error" role="alert">{localError || error}</div> : null}
          <dl className="summary-list compact-summary">
            <div><dt>Name</dt><dd>{draft?.displayName || 'Missing draft'}</dd></div>
            <div><dt>Email</dt><dd>{draft?.email || 'Missing draft'}</dd></div>
            <div><dt>Account type</dt><dd>{draft?.role === 'sponsor' ? 'Sponsor' : 'Student'}</dd></div>
            {draft?.studentId ? <div><dt>Student ID</dt><dd>{draft.studentId}</dd></div> : null}
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
