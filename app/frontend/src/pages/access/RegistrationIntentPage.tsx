import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, ButtonLink, Card, Field, Select as NativeSelect, TextInput } from '../../components/ui';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useAuth } from '../../context/AuthContext';
import type { RegistrationPaymentInput, RegistrationRoleIntent } from '../../lib/contracts';
import { CANONICAL_DEPARTMENTS, isCanonicalDepartment } from '../../lib/departments';
import { navigateToHostedCheckout } from '../../lib/redirects';

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
  const { startRegistrationPayment, error, clearError, gateway } = useAuth('registration');
  const [role, setRole] = useState<RegistrationRoleIntent>('student');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [department, setDepartment] = useState('');
  const [companyName, setCompanyName] = useState('');
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
    if (role === 'student' && !studentId.trim()) {
      setLocalError('Student ID is required for students and future officers.');
      return;
    }
    if (role === 'student' && !isCanonicalDepartment(department)) {
      setLocalError('Choose your department from the list before continuing.');
      return;
    }
    setSubmitting(true);
    try {
      const input: RegistrationPaymentInput = {
        role,
        displayName: displayName.trim(),
        email: email.trim(),
        studentId: role === 'student' ? studentId.trim() : undefined,
        department: role === 'student' ? department : undefined,
        companyName: role === 'sponsor' ? companyName.trim() || undefined : undefined,
        returnUrl: `${window.location.origin}/access/checkout`,
      };
      const intent = await startRegistrationPayment(input);
      writeRegistrationDraft({ ...input, intentId: intent.intentId });
      navigateToHostedCheckout(intent.checkoutUrl);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5 items-center">
      <Card className="w-[min(520px,100%)] grid w-[min(980px,100%)] gap-[clamp(20px,4vw,44px)] md:grid-cols-[minmax(0,0.9fr)_minmax(280px,1fr)]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 font-[var(--font-display)] text-xl font-extrabold leading-none text-[var(--color-navy)]"><SoarLogo /><span>SOAR</span></div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Payment before account creation</p>
          <h1>Start six-month access</h1>
          <p className="m-0 max-w-[64ch] text-[var(--muted-foreground)]">
SOAR costs PHP10 per account for six months. Account creation unlocks after a successful checkout.
          </p>
          <div className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-sm text-[var(--color-blue-deep)]">
            Officers do not choose a separate signup. Register as a student with student ID; authorized organization staff grant officer access later.
          </div>
          {gateway.mode === 'fixture' ? <div className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] text-sm bg-[var(--color-orange-soft)] text-[var(--color-navy)]">Demo checkout is simulated locally and does not create a real charge.</div> : null}
          <ol className="m-0 grid list-none gap-3 p-0 [&_li]:grid [&_li]:grid-cols-[minmax(0,0.35fr)_minmax(0,1fr)] [&_li]:items-start [&_li]:gap-2.5 [&_li]:border-t [&_li]:border-[var(--color-border)] [&_li]:py-3 [&_strong]:block [&_strong]:text-[var(--color-navy)] [&_span]:block [&_span]:text-[13px] [&_span]:text-[var(--muted-foreground)]">
            <li><strong>Account type</strong><span>Choose student or sponsor.</span></li>
            <li><strong>Checkout</strong><span>Pay the PHP10 six-month access fee.</span></li>
            <li><strong>Create account</strong><span>Complete your details after payment is confirmed.</span></li>
          </ol>
        </div>
        <form onSubmit={handleSubmit} className="grid content-start gap-3.5" noValidate>
          {(localError || error) ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{localError || error}</div> : null}
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
          <Button type="submit" disabled={submitting}>{submitting ? 'Creating checkout…' : 'Continue to PHP10 checkout'}</Button>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 font-bold text-[var(--color-blue-deep)] max-sm:flex-col max-sm:items-stretch">
            <Link to="/login">Already have an account?</Link>
            <ButtonLink to="/" variant="quiet">Back</ButtonLink>
          </div>
        </form>
      </Card>
    </main>
  );
};
