import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, Card, StatusChip } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { hasActiveAccess } from '../../lib/contracts';

export const EmailVerificationPage = () => {
  const { session, reloadSession, resendEmailVerification, signOut, error, clearError } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const navigate = useNavigate();

  const handleReload = async () => {
    clearError();
    setMessage(null);
    setWorking(true);
    try {
      const next = await reloadSession();
      if (next?.emailVerified && hasActiveAccess(next)) navigate('/app', { replace: true });
      else if (next?.emailVerified) navigate('/settings/access', { replace: true });
      else setMessage('Email is still unverified. Use the verification link, then check again.');
    } finally {
      setWorking(false);
    }
  };

  const handleResend = async () => {
    clearError();
    setMessage(null);
    setWorking(true);
    try {
      await resendEmailVerification();
      setMessage('Verification email requested. Check your inbox before reloading status.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <div className="auth-logo"><SoarLogo /><span>SOAR</span></div>
        <p className="eyebrow">Email verification</p>
        <h1>Verify your email</h1>
        <p className="card-note">Your PHP10 access is tied to this account, but the main app unlocks only after email verification.</p>
        <div className="status-panel compact-panel">
          <StatusChip tone={session?.emailVerified ? 'approved' : 'attention'}>{session?.emailVerified ? 'Verified' : 'Waiting for verification'}</StatusChip>
          <p>{session?.email}</p>
        </div>
        {message ? <div className="form-success" role="status">{message}</div> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="button-row">
          <Button type="button" onClick={handleReload} disabled={working}>{working ? 'Checking…' : 'I verified, reload status'}</Button>
          <Button type="button" variant="secondary" onClick={handleResend} disabled={working}>Resend verification</Button>
          <Button type="button" variant="quiet" onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}>Sign out</Button>
        </div>
      </Card>
    </main>
  );
};
