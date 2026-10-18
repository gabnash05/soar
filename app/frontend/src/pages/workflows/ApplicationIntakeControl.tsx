import { useEffect, useId, useState } from 'react';
import { Button, LoadingBlock, StateBlock, StatusChip } from '../../components/ui';
import { safeErrorMessage } from '../../lib/safeErrors';
import type { UserSession } from '../../lib/contracts';
import type { OrganizationProfile, WorkflowDataClient, WorkflowMutationResult } from './contracts';
import { ErrorState, OrganizationAvatar, ResultMessage, useWorkflowQuery } from './pageParts';
import { isApprovedOfficerFor, isStudent } from './workflowUtils';

export function ApplicationIntakeControl({
  organization,
  session,
  client,
  onSavingChange,
}: {
  organization: OrganizationProfile;
  session: UserSession;
  client: WorkflowDataClient;
  onSavingChange?: (saving: boolean) => void;
}) {
  const headingId = useId();
  const [applicationsOpen, setApplicationsOpen] = useState(organization.applicationsOpen !== false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<WorkflowMutationResult<{ applicationsOpen: boolean }> | null>(null);

  useEffect(() => {
    setApplicationsOpen(organization.applicationsOpen !== false);
    setResult(null);
  }, [organization.id, organization.applicationsOpen]);

  const toggleIntake = async () => {
    if (saving) return;
    setSaving(true);
    onSavingChange?.(true);
    try {
      const next = await client.setApplicationsOpen(organization.id, !applicationsOpen, session);
      setResult(next);
      if (next.ok) setApplicationsOpen(next.data?.applicationsOpen ?? !applicationsOpen);
    } catch (error) {
      setResult({
        ok: false,
        persisted: false,
        source: client.mode,
        reason: 'error',
        message: safeErrorMessage(error, 'SOAR could not update application intake. Check your connection and try again.'),
      });
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  };

  return (
    <section className="grid min-w-0 gap-3 border-y border-[var(--color-border)] py-4" role="group" aria-labelledby={headingId} aria-busy={saving}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h3 id={headingId} className="m-0 font-[var(--font-display)] text-base font-bold text-[var(--color-navy)]">Application intake</h3>
          <p className="m-0 max-w-[68ch] text-sm text-[var(--muted-foreground)]" aria-live="polite">
            {applicationsOpen ? 'Students can confirm one application for this organization.' : 'New confirmations are paused. Existing applications remain available for review.'}
          </p>
        </div>
        <StatusChip tone={applicationsOpen ? 'approved' : 'attention'}>{applicationsOpen ? 'Open' : 'Closed'}</StatusChip>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button type="button" variant={applicationsOpen ? 'danger' : 'primary'} disabled={saving} onClick={toggleIntake}>
          {saving ? 'Saving intake…' : applicationsOpen ? 'Close applications' : 'Open applications'}
        </Button>
        <p className="m-0 max-w-[68ch] text-xs text-[var(--muted-foreground)]">Closing intake blocks confirmations, even if a student already opened the external form.</p>
      </div>
      <ResultMessage result={result} />
    </section>
  );
}

export function OrganizationApplicationIntakePanel({
  organizationId,
  session,
  client,
  onSavingChange,
}: {
  organizationId: string;
  session: UserSession;
  client: WorkflowDataClient;
  onSavingChange?: (saving: boolean) => void;
}) {
  const isApprovedOfficer = isStudent(session) && session.access.status === 'active' && isApprovedOfficerFor(session, organizationId);
  const organizationQuery = useWorkflowQuery(
    () => isApprovedOfficer
      ? client.getOrganization(organizationId, session)
      : Promise.resolve({ data: undefined, source: client.mode }),
    [client, organizationId, session.uid, isApprovedOfficer],
  );
  const organization = organizationQuery.data?.id === organizationId ? organizationQuery.data : undefined;

  if (!isApprovedOfficer) {
    return <StateBlock title="No organization access" symbol="!">An active organization-specific officer grant is required to manage application intake.</StateBlock>;
  }
  if (organizationQuery.loading) return <LoadingBlock label="Loading organization application intake" />;
  if (organizationQuery.error) {
    return <ErrorState title="We could not load this organization's intake settings" onRetry={organizationQuery.reload}>{safeErrorMessage(organizationQuery.error, 'SOAR could not load the selected organization. Check your connection and try again.')}</ErrorState>;
  }
  if (!organization) {
    return <StateBlock title="Organization data unavailable" symbol="!">We could not load the selected organization's application intake settings.</StateBlock>;
  }

  return (
    <div className="grid min-w-0 gap-3" role="group" aria-label={`Application intake for ${organization.name}`}>
      <div className="flex min-w-0 items-center gap-3 border-b border-[var(--color-border)] pb-3">
        <OrganizationAvatar name={organization.name} logoUrl={organization.logoUrl} />
        <div className="grid min-w-0 gap-0.5">
          <h3 className="m-0 font-[var(--font-display)] text-base font-bold text-[var(--color-navy)]">{organization.name}</h3>
          <p className="m-0 max-w-[68ch] text-sm text-[var(--muted-foreground)]">Intake changes apply only to this organization.</p>
        </div>
      </div>
      <ApplicationIntakeControl key={`${session.uid}:${organization.id}`} organization={organization} session={session} client={client} onSavingChange={onSavingChange} />
    </div>
  );
}
