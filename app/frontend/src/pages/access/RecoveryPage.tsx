import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, Card, Field, TextInput } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

export const RecoveryPage = () => {
  const { sendPasswordRecovery, error, clearError } = useAuth('password-recovery');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setSent(false);
    setSubmitting(true);
    try {
      await sendPasswordRecovery(email);
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5">
      <Card className="w-[min(520px,100%)]">
        <div className="mb-5 inline-flex items-center gap-2 font-[var(--font-display)] text-xl font-extrabold leading-none text-[var(--color-navy)]"><SoarLogo /><span>SOAR</span></div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Account recovery</p>
        <h1>Reset your password</h1>
        <p className="m-0 max-w-[64ch] text-[var(--muted-foreground)]">Password recovery remains available even when your six-month access has expired.</p>
        {sent ? <div className="rounded-[var(--radius-md)] border border-[var(--color-blue-deep)] bg-[var(--color-navy-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="status">If an account exists for this address, a recovery email has been sent.</div> : null}
        {error ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{error}</div> : null}
        <form onSubmit={handleSubmit} className="grid content-start gap-3.5">
          <Field id="email" label="Email address">
            <TextInput id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send recovery email'}</Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 font-bold text-[var(--color-blue-deep)] max-sm:flex-col max-sm:items-stretch"><Link to="/login">Back to sign in</Link></div>
      </Card>
    </main>
  );
};
