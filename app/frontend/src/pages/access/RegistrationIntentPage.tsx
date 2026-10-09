import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, ButtonLink, Card, Field, Select, TextInput } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import type { AccountKind, RegistrationPaymentInput } from '../../lib/contracts';
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

export const RegistrationIntentPage = () => {
  const { startRegistrationPayment, error, clearError, gateway } = useAuth();
  const [role, setRole] = useState<AccountKind>('student');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setLocalError(null);
    if (role === 'student' && !studentId.trim()) {
      setLocalError('Student ID is required for students and future officers.');
      return;
    }
    setSubmitting(true);
    try {
      const input: RegistrationPaymentInput = {
        role,
        displayName: displayName.trim(),
        email: email.trim(),
        studentId: role === 'student' ? studentId.trim() : undefined,
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
    <main className="auth-page wide">
      <Card className="auth-card split-card">
        <div>
          <div className="auth-logo"><SoarLogo /><span>SOAR</span></div>
          <p className="eyebrow">Payment before account creation</p>
          <h1>Start annual access</h1>
          <p className="card-note">
SOAR costs PHP10 per account for one year. Account creation unlocks after a successful checkout.
          </p>
          <div className="notice compact">
            Officers do not choose a separate signup. Register as a student with student ID; organization owners or admins grant officer access later.
          </div>
          {gateway.mode === 'fixture' ? <div className="notice compact warning">Demo checkout is simulated locally and does not create a real charge.</div> : null}
          <ol className="mini-steps">
            <li><strong>Account type</strong><span>Choose student or sponsor.</span></li>
            <li><strong>Checkout</strong><span>Pay the PHP10 annual access fee.</span></li>
            <li><strong>Create account</strong><span>Complete your details after payment is confirmed.</span></li>
          </ol>
        </div>
        <form onSubmit={handleSubmit} className="form-grid" noValidate>
          {(localError || error) ? <div className="form-error" role="alert">{localError || error}</div> : null}
          <Field id="role" label="Account type">
            <Select id="role" value={role} onChange={(event) => setRole(event.target.value as AccountKind)}>
              <option value="student">Student (also used for future officers)</option>
              <option value="sponsor">Sponsor / outside user</option>
            </Select>
          </Field>
          <Field id="displayName" label="Full name">
            <TextInput id="displayName" required autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </Field>
          <Field id="email" label="Email address">
            <TextInput id="email" required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          {role === 'student' ? (
            <Field id="studentId" label="Student ID" hint="Required for students and regular student accounts that may receive officer grants.">
              <TextInput id="studentId" required value={studentId} onChange={(event) => setStudentId(event.target.value)} />
            </Field>
          ) : (
            <Field id="companyName" label="Company or organization name" optional>
              <TextInput id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </Field>
          )}
          <Button type="submit" disabled={submitting}>{submitting ? 'Creating checkout…' : 'Continue to PHP10 checkout'}</Button>
          <div className="auth-links">
            <Link to="/login">Already have an account?</Link>
            <ButtonLink to="/" variant="quiet">Back</ButtonLink>
          </div>
        </form>
      </Card>
    </main>
  );
};
