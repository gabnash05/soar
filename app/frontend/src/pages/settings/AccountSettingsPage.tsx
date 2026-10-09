import { FormEvent, useState } from 'react';
import { Button, ButtonLink, Card, CardHeader, Field, StatusChip, TextInput } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

export const AccountSettingsPage = () => {
  const { session, updateDisplayName, requestEmailChange, error, clearError } = useAuth();
  const [displayName, setDisplayName] = useState(session?.displayName ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  if (!session) return null;

  const handleName = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setMessage(null);
    setSavingName(true);
    try {
      await updateDisplayName({ displayName });
      setMessage('Name saved. You may need to wait up to 30 days before changing it again.');
    } finally {
      setSavingName(false);
    }
  };

  const handleEmail = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setMessage(null);
    setSavingEmail(true);
    try {
      await requestEmailChange({ newEmail, currentPassword });
      setMessage('Verification sent to the new address. Your saved email changes after that address is verified.');
      setNewEmail('');
      setCurrentPassword('');
    } finally {
      setSavingEmail(false);
    }
  };

  const approvedGrants = session.officerGrants.filter((grant) => grant.status === 'active' || grant.status === 'approved');

  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="eyebrow">Personal settings</p>
        <h1>Account settings</h1>
        <p>Manage your profile, sign-in email, and organization permissions.</p>
      </header>

      {message ? <div className="form-success" role="status">{message}</div> : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <div className="settings-grid">
        <Card>
          <CardHeader title="Profile" eyebrow="Personal details">Name changes are available once every 30 days.</CardHeader>
          <form className="form-grid" onSubmit={handleName}>
            <Field id="displayName" label="Full name">
              <TextInput id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </Field>
            <Button type="submit" disabled={savingName}>{savingName ? 'Saving…' : 'Save name'}</Button>
          </form>
          <dl className="summary-list">
            <div><dt>Account type</dt><dd>{session.accountKind === 'student' ? 'Student' : 'Sponsor'}</dd></div>
            {session.studentId ? <div><dt>Student ID</dt><dd>{session.studentId}</dd></div> : null}
            {session.companyName ? <div><dt>Company / organization</dt><dd>{session.companyName}</dd></div> : null}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Sign-in email" eyebrow="Verification required">Enter your current password. Your email changes after the new address is verified.</CardHeader>
          <form className="form-grid" onSubmit={handleEmail}>
            <Field id="currentEmail" label="Current email">
              <TextInput id="currentEmail" value={session.email} disabled readOnly />
            </Field>
            <Field id="newEmail" label="New email">
              <TextInput id="newEmail" type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />
            </Field>
            <Field id="currentPassword" label="Current password">
              <TextInput id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
            </Field>
            <Button type="submit" disabled={savingEmail}>{savingEmail ? 'Sending verification…' : 'Send email verification'}</Button>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader title="Organization permissions" eyebrow="Account access">Officer access is granted per organization and cannot be self-assigned.</CardHeader>
        {approvedGrants.length ? (
          <div className="grant-list">
            {approvedGrants.map((grant) => (
              <div className="grant-row" key={grant.organizationId}>
                <div><strong>{grant.organizationName}</strong><span>Organization management access</span></div>
                <div className="component-row">
                  <StatusChip tone="approved">Active</StatusChip>
                  <ButtonLink to={`/settings/organization?organizationId=${grant.organizationId}`} variant="secondary">Manage organization</ButtonLink>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">No active officer grants.</p>
        )}
      </Card>
    </div>
  );
};
