import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, ButtonLink, Card, Field, TextInput } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { hasActiveAccess } from '../../lib/contracts';

type LocationState = { from?: string } | null;

export const LoginPage = () => {
  const { signIn, error, clearError, gateway } = useAuth('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState)?.from;

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      const session = await signIn({ email, password });
      if (!session.emailVerified) navigate('/access/verify-email', { replace: true });
      else if (!hasActiveAccess(session)) navigate('/settings/access', { replace: true });
      else navigate(from && from.startsWith('/') ? from : '/app', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5">
      <Card className="w-[min(520px,100%)]">
        <div className="mb-5 inline-flex items-center gap-2 font-[var(--font-display)] text-xl font-extrabold leading-none text-[var(--color-navy)]"><SoarLogo /><span>SOAR</span></div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Welcome back</p>
        <h1>Sign in to your account</h1>
        <p className="m-0 max-w-[64ch] text-[var(--muted-foreground)]">Entry, renewal, recovery, and settings remain available even when six-month access expires.</p>
        {gateway.mode === 'fixture' ? (
          <div className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] text-sm">
Demo accounts: student@example.edu, officer@example.edu, sponsor@example.com, expired@example.edu, unverified@example.edu.
          </div>
        ) : null}
        {error ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{error}</div> : null}
        <form onSubmit={handleSubmit} className="grid content-start gap-3.5">
          <Field id="email" label="Email address">
            <TextInput id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field id="password" label="Password">
            <TextInput id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 font-bold text-[var(--color-blue-deep)] max-sm:flex-col max-sm:items-stretch">
          <Link to="/recovery">Forgot password?</Link>
          <ButtonLink to="/register" variant="quiet">Create a new account</ButtonLink>
        </div>
      </Card>
    </main>
  );
};
