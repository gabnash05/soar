import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { Button, Card, StatusChip } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { hasActiveAccess } from '../../lib/contracts';

export const EmailVerificationPage = () => {
  const { session, reloadSession, resendEmailVerification, signOut, error, clearError } = useAuth('email-verification');
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

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
    <main className="grid min-h-screen place-items-center p-[clamp(18px,4vw,48px)] max-sm:px-3.5">
      <Card className="w-[min(520px,100%)]">
        <div className="mb-5 inline-flex items-center gap-2 font-[var(--font-display)] text-xl font-extrabold leading-none text-[var(--color-navy)]"><SoarLogo /><span>SOAR</span></div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Email verification</p>
        <h1>Verify your email</h1>
        <p className="m-0 max-w-[64ch] text-[var(--muted-foreground)]">{session?.access.provenance === 'unpaid-preview' ? 'This account has access without a recorded payment. Verify your email before using core workflows.' : 'Your PHP10 access is tied to this account, but the main app unlocks only after email verification.'}</p>
        <div className="my-[18px] grid gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-off-white)] p-4 gap-1.5">
          <StatusChip tone={session?.emailVerified ? 'approved' : 'attention'}>{session?.emailVerified ? 'Verified' : 'Waiting for verification'}</StatusChip>
          <p>{session?.email}</p>
        </div>
        {message ? <div className="rounded-[var(--radius-md)] border border-[var(--color-blue-deep)] bg-[var(--color-navy-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="status">{message}</div> : null}
        {error ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{error}</div> : null}
        <div className="flex flex-wrap items-center gap-2.5 max-sm:[&>a]:w-full max-sm:[&>button]:w-full">
          <Button type="button" onClick={handleReload} disabled={working}>{working ? 'Checking…' : 'I verified, reload status'}</Button>
          <Button type="button" variant="secondary" onClick={handleResend} disabled={working}>Resend verification</Button>
          <Button type="button" variant="quiet" onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}>Sign out</Button>
        </div>
      </Card>
    </main>
  );
};
