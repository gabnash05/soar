import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, Card, Field, TextInput } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

export const RecoveryPage = () => {
  const { sendPasswordRecovery, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    <main className="auth-page">
      <Card className="auth-card">
        <div className="auth-logo"><SoarLogo /><span>SOAR</span></div>
        <p className="eyebrow">Account recovery</p>
        <h1>Reset your password</h1>
        <p className="card-note">Password recovery remains available even when your annual access has expired.</p>
        {sent ? <div className="form-success" role="status">If an account exists for this address, a recovery email has been sent.</div> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <form onSubmit={handleSubmit} className="form-grid">
          <Field id="email" label="Email address">
            <TextInput id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send recovery email'}</Button>
        </form>
        <div className="auth-links"><Link to="/login">Back to sign in</Link></div>
      </Card>
    </main>
  );
};
