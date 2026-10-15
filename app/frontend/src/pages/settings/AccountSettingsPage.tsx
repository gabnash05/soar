import { FormEvent, useEffect, useState } from 'react';
import { Button, ButtonLink, Card, CardHeader, Field, RoleBadge, StatusChip, SubtabNav, SubtabPanel, TextInput, useQueryTab } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const accountTabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'email', label: 'Sign-in email' },
  { id: 'access', label: 'Organization access' },
];

export const AccountSettingsPage = () => {
  const { session, updateDisplayName, requestEmailChange, error, clearError } = useAuth();
  const [displayName, setDisplayName] = useState(session?.displayName ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const { activeId, getTabTo } = useQueryTab(accountTabs.map((item) => item.id), 'profile');

  useEffect(() => {
    if (activeId !== 'email') setCurrentPassword('');
    return () => setCurrentPassword('');
  }, [activeId]);

  if (!session) return null;

  const handleName = async (event: FormEvent) => {
    event.preventDefault();
    clearError();
    setMessage(null);
    setSavingName(true);
    try {
      const updatedSession = await updateDisplayName({ displayName });
      setDisplayName(updatedSession.displayName);
      setMessage('Name saved. You may need to wait up to 30 days before changing it again.');
    } catch {
      // AuthContext exposes the safe error message; leave the entered name ready to retry.
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
  const tabsWithCounts = accountTabs.map((tab) => tab.id === 'access' ? { ...tab, count: approvedGrants.length } : tab);

  return (
    <div className="mx-auto grid w-[min(1120px,100%)] gap-[18px]">
      <header className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--color-navy)] bg-[image:var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_h1]:mb-1.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(1.9rem,4vw,3rem)] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.035em] [&_h1]:text-white [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80 max-sm:[&_h1]:text-[2.15rem]">
        <p className="eyebrow mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-gold)]">Personal settings</p>
        <h1>Account settings</h1>
        <p>Start with your profile, then switch to sign-in email or organization permissions.</p>
      </header>

      {message ? <div className="rounded-[var(--radius-md)] border border-[var(--color-blue-deep)] bg-[var(--color-navy-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="status">{message}</div> : null}
      {error ? <div className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{error}</div> : null}

      <SubtabNav label="Account settings sections" baseId="account-settings" items={tabsWithCounts} activeId={activeId} getTabTo={getTabTo} />

      <SubtabPanel baseId="account-settings" tabId="profile" activeId={activeId}>
        <Card>
          <CardHeader title="Profile" eyebrow="Personal details">Name changes are available once every 30 days.</CardHeader>
          <form className="grid content-start gap-3.5" onSubmit={handleName}>
            <Field id="displayName" label="Full name">
              <TextInput id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </Field>
            <Button type="submit" disabled={savingName}>{savingName ? 'Saving…' : 'Save name'}</Button>
          </form>
          <dl className="mt-[18px] grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-border)] p-0 [&_div]:grid [&_div]:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] [&_div]:gap-3 [&_div]:bg-[var(--color-white)] [&_div]:p-3 max-[820px]:[&_div]:grid-cols-1 max-[820px]:[&_div]:gap-0.5 [&_dt]:text-[13px] [&_dt]:text-[var(--muted-foreground)] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:font-bold [&_dd]:text-[var(--color-navy)]">
            <div><dt>Account type</dt><dd><RoleBadge kind={session.accountKind}>{session.accountKind === 'student' ? 'Student' : 'Sponsor'}</RoleBadge></dd></div>
            {session.studentId ? <div><dt>Student ID</dt><dd>{session.studentId}</dd></div> : null}
            {session.department ? <div><dt>Department</dt><dd>{session.department}</dd></div> : null}
            {session.companyName ? <div><dt>Company / organization</dt><dd>{session.companyName}</dd></div> : null}
          </dl>
        </Card>
      </SubtabPanel>

      <SubtabPanel baseId="account-settings" tabId="email" activeId={activeId}>
        <Card>
          <CardHeader title="Sign-in email" eyebrow="Verification required">Enter your current password. Your email changes after the new address is verified.</CardHeader>
          <form className="grid content-start gap-3.5" onSubmit={handleEmail}>
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
      </SubtabPanel>

      <SubtabPanel baseId="account-settings" tabId="access" activeId={activeId}>
        <Card>
          <CardHeader title="Organization permissions" eyebrow="Account access">Officer access is granted per organization and cannot be self-assigned.</CardHeader>
          {approvedGrants.length ? (
            <div className="grid gap-2.5">
              {approvedGrants.map((grant) => (
                <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" key={grant.organizationId}>
                  <div>
                    <strong className="block text-[var(--color-navy)]">{grant.organizationName}</strong>
                    <span className="mt-1 block text-[13px] text-[var(--muted-foreground)]">Scoped organization management grant</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <RoleBadge kind="officer">Approved officer</RoleBadge>
                    <StatusChip tone="approved">Active</StatusChip>
                    <ButtonLink to={`/settings/organization?organizationId=${grant.organizationId}`} variant="secondary">Manage organization</ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-0">No active officer grants.</p>
          )}
        </Card>
      </SubtabPanel>
    </div>
  );
};
