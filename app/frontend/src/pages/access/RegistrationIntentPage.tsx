import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, ButtonLink, Card, Field, Select as NativeSelect, TextInput } from '../../components/ui';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useAuth } from '../../context/AuthContext';
import { hasActiveAccess, type PreviewRegistrationInput, type RegistrationPaymentInput, type RegistrationRoleIntent } from '../../lib/contracts';
import { CANONICAL_DEPARTMENTS, isCanonicalDepartment } from '../../lib/departments';
import { navigateToHostedCheckout } from '../../lib/redirects';
import { isPaidFlowEnabled } from '../../lib/features';

const DRAFT_KEY = 'soar:registration-draft';

export type RegistrationDraft = Partial<RegistrationPaymentInput> & { intentId?: string };

export const readRegistrationDraft = (): RegistrationDraft | null => {
  try {
    const value = sessionStorage.getItem(DRAFT_KEY);
    return value ? (JSON.parse(value) as RegistrationDraft) : null;
  } catch {
    return null;
  }
};

const writeRegistrationDraft = (draft: RegistrationPaymentInput & { intentId?: string }) => {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
};

function DepartmentSelect({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  return (
    <Field id="department" label="Department" error={error} hint="Required for student accounts. Choose the department exactly as it appears in the school list.">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id="department"
          aria-invalid={Boolean(error) || undefined}
          className="control min-h-11 w-full justify-between border-[var(--color-border)] bg-[var(--color-white)] px-3 py-2 text-[var(--color-ink)] focus-visible:border-[var(--color-blue-deep)] focus-visible:ring-[var(--color-blue-soft)] data-placeholder:text-[var(--color-muted)]"
        >
          <SelectValue placeholder="Choose your department" />
        </SelectTrigger>
        <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
          <SelectGroup>
            {CANONICAL_DEPARTMENTS.map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export const RegistrationIntentPage = () => {
  const { paymentPolicy, paymentPolicyLoading, paymentPolicyError, startAuthenticatedRegistrationPayment, createRegistrationIdentity, registerPreviewAccount, error, clearError, gateway } = useAuth('registration');
  const paymentsRequired = paymentPolicy?.paymentsRequired === true;
  const freeSignupEnabled = paymentPolicy?.paymentsRequired === false;
  const paidFlowEnabled = paymentsRequired && paymentPolicy?.checkout.status === 'configured' && isPaidFlowEnabled();
  const registrationAvailable = freeSignupEnabled || paidFlowEnabled;
  const navigate = useNavigate();
  const [role, setRole] = useState<RegistrationRoleIntent>('student');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [department, setDepartment] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setLocalError(null);
    if (displayName.trim().length < 2 || displayName.trim().length > 120) {
      setLocalError('Enter a name between 2 and 120 characters.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) {
      setLocalError('Enter a valid email address.');
      return;
    }
    if (password.length < 8 || password.length > 1024) {
      setLocalError('Use a password with at least 8 characters.');
      return;
    }
    if (role === 'student' && (studentId.trim().length < 2 || studentId.trim().length > 64)) {
      setLocalError('Enter a student ID between 2 and 64 characters.');
      return;
    }
    if (role === 'student' && !isCanonicalDepartment(department)) {
      setLocalError('Choose your department from the list before continuing.');
      return;
    }
    if (role === 'sponsor' && companyName.trim() && (companyName.trim().length < 2 || companyName.trim().length > 140)) {
      setLocalError('Enter a company or organization name between 2 and 140 characters, or leave it blank.');
      return;
    }
    if (!paymentPolicy) {
      setLocalError('SOAR could not load the registration payment policy. No account was created; try again or contact an administrator.');
      return;
    }
    if (paymentsRequired && !paidFlowEnabled) {
      setLocalError('Payment is required, but checkout is unavailable in this deployment. No account was created.');
      return;
    }
    setSubmitting(true);
    try {
      const profile = {
        role,
        displayName: displayName.trim(),
        email: email.trim(),
        studentId: role === 'student' ? studentId.trim() : undefined,
        department: role === 'student' ? department : undefined,
        companyName: role === 'sponsor' ? companyName.trim() || undefined : undefined,
      };
      if (freeSignupEnabled) {
        const input: PreviewRegistrationInput = { ...profile, password };
        const session = await registerPreviewAccount(input);
        if (!session.emailVerified) navigate('/access/verify-email', { replace: true });
        else navigate(hasActiveAccess(session) ? '/app' : '/settings/access', { replace: true });
        return;
      }

      const input: RegistrationPaymentInput = {
        ...profile,
        returnUrl: `${window.location.origin}/access/checkout`,
      };
      await createRegistrationIdentity({ email: input.email, password });
      const intent = await startAuthenticatedRegistrationPayment(input);
      writeRegistrationDraft({ ...input, intentId: intent.intentId });
      if (intent.resumed || !intent.checkoutUrl) navigate(`/access/checkout?intentId=${encodeURIComponent(intent.intentId)}`, { replace: true });
      else navigateToHostedCheckout(intent.checkoutUrl);
    } catch {
      // AuthContext exposes the safe operation-scoped error; keep the entered registration details.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5 items-center">
      <Card className="w-[min(520px,100%)] grid w-[min(980px,100%)] gap-[clamp(20px,4vw,44px)] md:grid-cols-[minmax(0,0.9fr)_minmax(280px,1fr)]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 font-[var(--font-display)] text-xl font-extrabold leading-none text-[var(--color-navy)]"><SoarLogo /><span>SOAR</span></div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">{paidFlowEnabled ? 'Payment before account creation' : freeSignupEnabled ? 'Payment not required' : paymentsRequired ? 'Payment required' : 'Registration policy'}</p>
          <h1>{paidFlowEnabled ? 'Start six-month access' : freeSignupEnabled ? 'Create a free account' : paymentsRequired ? 'Checkout unavailable' : 'Registration options'}</h1>
          <p className="m-0 max-w-[64ch] text-[var(--muted-foreground)]">
            {paidFlowEnabled
              ? 'SOAR costs PHP10 per account for six months. Sign-in is set up first; the SOAR profile and access unlock only after payment is confirmed.'
              : freeSignupEnabled
                ? 'Payment is not required right now. Create a student or sponsor account and verify your email before using core workflows; access is explicitly recorded as unpaid, not as a provider payment.'
                : paymentsRequired
                  ? `Payment is required, but checkout is unavailable${!isPaidFlowEnabled() ? ' in this frontend build' : paymentPolicy?.checkout.status === 'disabled' ? ' in this server deployment' : ' in the server configuration'}. No account can be created until checkout is ready.`
                  : paymentPolicyLoading ? 'Loading the current SOAR registration policy…' : 'Registration is paused because the current payment policy could not be loaded.'}
          </p>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-sm text-[var(--color-blue-deep)]">
            Officers do not choose a separate signup. Register as a student with student ID; authorized organization staff grant organization-scoped officer access later.
          </div>
          {freeSignupEnabled ? (
            <aside className="grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-off-white)] px-3.5 py-3 text-sm" role="note" aria-label="Payment information">
              <strong className="text-[var(--color-navy)]">Payment is not required right now</strong>
              <span className="text-[var(--muted-foreground)]">No provider transaction or paid entitlement is created. {gateway.mode === 'fixture' ? 'Fixture registration stays in this browser.' : 'New account access is recorded explicitly as unpaid.'}</span>
            </aside>
          ) : paidFlowEnabled && gateway.mode === 'fixture' ? (
            <div className="rounded-[var(--radius-md)] bg-[var(--color-orange-soft)] px-3.5 py-3 text-sm text-[var(--color-navy)]" role="note">Fixture checkout is simulated locally and does not create a real charge.</div>
          ) : null}
          <ol className="m-0 grid list-none gap-3 p-0 [&_li]:grid [&_li]:grid-cols-[minmax(0,0.35fr)_minmax(0,1fr)] [&_li]:items-start [&_li]:gap-2.5 [&_li]:border-t [&_li]:border-[var(--color-border)] [&_li]:py-3 [&_strong]:block [&_strong]:text-[var(--color-navy)] [&_span]:block [&_span]:text-[13px] [&_span]:text-[var(--muted-foreground)]">
            <li><strong>Account type</strong><span>Choose student or sponsor.</span></li>
            {paymentsRequired ? (
              <>
                <li><strong>Checkout</strong><span>Pay PHP10 through QR Ph using GCash or another supported bank/e-wallet app.</span></li>
                <li><strong>SOAR profile</strong><span>Complete your details after signed payment confirmation. Browser return alone does not unlock access.</span></li>
              </>
            ) : freeSignupEnabled ? (
              <>
                <li><strong>Profile</strong><span>Students choose one approved department.</span></li>
                <li><strong>Verify email</strong><span>Verify your email to use workflows; no provider payment is recorded.</span></li>
              </>
            ) : <li><strong>Registration</strong><span>The current payment policy is unavailable; account creation is paused.</span></li>}
          </ol>
        </div>
        <form onSubmit={handleSubmit} className="grid content-start gap-3.5" noValidate>
          {(localError || error || paymentPolicyError) ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{localError || error || paymentPolicyError}</div> : null}
          <Field id="role" label="Account type">
            <NativeSelect id="role" value={role} onChange={(event) => setRole(event.target.value as RegistrationRoleIntent)}>
              <option value="student">Student (also used for future officers)</option>
              <option value="sponsor">Sponsor / outside user</option>
            </NativeSelect>
          </Field>
          <Field id="displayName" label="Full name">
            <TextInput id="displayName" required autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </Field>
          <Field id="email" label="Email address">
            <TextInput id="email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field id="password" label="Create password" hint={paymentsRequired ? 'Use at least 8 characters. SOAR sends it directly to Firebase Authentication; you will use this sign-in to resume registration.' : 'Use at least 8 characters. The password is sent directly to Firebase Authentication, not the SOAR API.'}>
            <TextInput id="password" required type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          {role === 'student' ? (
            <>
              <Field id="studentId" label="Student ID" hint="Required for students and regular student accounts that may receive officer grants.">
                <TextInput id="studentId" required value={studentId} onChange={(event) => setStudentId(event.target.value)} />
              </Field>
              <DepartmentSelect value={department} onChange={(value) => { setDepartment(value); if (localError?.toLowerCase().includes('department')) setLocalError(null); }} error={localError?.toLowerCase().includes('department') ? localError : undefined} />
            </>
          ) : (
            <Field id="companyName" label="Company or organization name" optional>
              <TextInput id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </Field>
          )}
          <Button type="submit" disabled={submitting || paymentPolicyLoading || !registrationAvailable}>
            {submitting
              ? (paidFlowEnabled ? 'Creating checkout…' : 'Creating account…')
              : paymentPolicyLoading
                ? 'Checking payment policy…'
                : paidFlowEnabled
                  ? 'Continue to PHP10 checkout'
                  : freeSignupEnabled
                    ? 'Create free account'
                    : 'Registration unavailable'}
          </Button>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 font-bold text-[var(--color-blue-deep)] max-sm:flex-col max-sm:items-stretch">
            <Link to="/login">Already have an account?</Link>
            <ButtonLink to="/" variant="quiet">Back</ButtonLink>
          </div>
        </form>
      </Card>
    </main>
  );
};
