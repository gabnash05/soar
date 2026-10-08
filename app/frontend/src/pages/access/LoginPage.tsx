import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, ButtonLink, Card, Field, TextInput } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { hasActiveAccess } from '../../lib/contracts';

type LocationState = { from?: string } | null;

export const LoginPage = () => {
  const { signIn, error, clearError, gateway } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState)?.from;

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
    <main className="auth-page">
      <Card className="auth-card">
        <div className="auth-logo"><SoarLogo /><span>SOAR</span></div>
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to your account</h1>
        <p className="card-note">Entry, renewal, recovery, and settings remain available even when annual access expires.</p>
        {gateway.mode === 'fixture' ? (
          <div className="notice compact">
            Fixture emails: student@example.edu, officer@example.edu, sponsor@example.com, expired@example.edu, unverified@example.edu.
          </div>
        ) : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <form onSubmit={handleSubmit} className="form-grid">
          <Field id="email" label="Email address">
            <TextInput id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field id="password" label="Password">
            <TextInput id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <div className="auth-links">
          <Link to="/recovery">Forgot password?</Link>
          <ButtonLink to="/register" variant="quiet">Create a new account</ButtonLink>
        </div>
      </Card>
    </main>
  );
};
