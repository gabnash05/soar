import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ButtonLink, ConfirmDialog, LoadingBlock, RoleBadge, StateBlock, StatusChip, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { OrganizationProfile, WorkflowDataClient } from '../workflows/contracts';
import {
  AnnouncementSection,
  DateEntriesSection,
  OfficerDashboardBlock,
  OfficerOrganizationPicker,
  ProfileRecruitmentSection,
} from '../workflows/OfficerPage';
import {
  OrganizationAvatar,
  RouteUnavailableState,
  SourceNotice,
  useWorkflowQuery,
  useWorkflowSession,
  WorkflowPageFrame,
} from '../workflows/pageParts';
import { getApprovedOfficerGrants } from '../workflows/workflowUtils';

const managementTabs = [
  { id: 'details', label: 'Details' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'dates', label: 'Dates & availability' },
];

function DepartmentStudentCountPanel({ organization, session, client }: { organization: OrganizationProfile; session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage } = useWorkflowQuery(
    () => client.getOrganizationDepartmentStudentCount(organization.id, session),
    [client, organization.id, session.uid],
  );

  if (loading) {
    return <LoadingBlock label="Loading department student count" />;
  }

  if (error) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)] p-4 shadow-[var(--shadow-soft)] [&_p]:m-0 [&_p]:max-w-[62ch] [&_p]:text-[var(--muted-foreground)] [&_span]:text-xs [&_span]:font-extrabold [&_span]:uppercase [&_span]:tracking-[0.06em] [&_span]:text-[var(--color-blue-deep)] [&_strong]:font-[var(--font-display)] [&_strong]:text-[clamp(2rem,4vw,3rem)] [&_strong]:font-black [&_strong]:leading-none [&_strong]:tracking-[-0.04em] [&_strong]:text-[var(--color-navy)]" aria-label="Registered students from this department">
        <div className="grid gap-1">
          <span>Department count unavailable</span>
          <strong>{organization.department ?? 'Department not assigned'}</strong>
        </div>
        <p>{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-off-white)] p-4 [&_p]:m-0 [&_p]:max-w-[62ch] [&_p]:text-[var(--muted-foreground)] [&_span]:text-xs [&_span]:font-extrabold [&_span]:uppercase [&_span]:tracking-[0.06em] [&_span]:text-[var(--color-blue-deep)] [&_strong]:font-[var(--font-display)] [&_strong]:text-[clamp(2rem,4vw,3rem)] [&_strong]:font-black [&_strong]:leading-none [&_strong]:tracking-[-0.04em] [&_strong]:text-[var(--color-navy)]" aria-label="Registered students from this department">
        <div className="grid gap-1">
          <span>Department not assigned</span>
          <strong>{organization.name}</strong>
        </div>
        <p>This organization does not have an authoritative department link yet, so SOAR does not show a registered-student count.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)] p-4 shadow-[var(--shadow-soft)] [&_p]:m-0 [&_p]:max-w-[62ch] [&_p]:text-[var(--muted-foreground)] [&_span]:text-xs [&_span]:font-extrabold [&_span]:uppercase [&_span]:tracking-[0.06em] [&_span]:text-[var(--color-blue-deep)] [&_strong]:font-[var(--font-display)] [&_strong]:text-[clamp(2rem,4vw,3rem)] [&_strong]:font-black [&_strong]:leading-none [&_strong]:tracking-[-0.04em] [&_strong]:text-[var(--color-navy)]" aria-label="Registered students from this department">
      <div className="grid gap-1">
        <span>{data.department}</span>
        <strong>{data.registeredStudentCount}</strong>
      </div>
      <div className="grid gap-2">
        <p>registered saved student accounts from this department. Officers with student accounts are included; sponsors, members, applicants, meetings, and legacy missing departments are not.</p>
        {sourceMessage ? <p>{sourceMessage}</p> : null}
        <p>Generated {new Date(data.generatedAt).toLocaleString()}.</p>
      </div>
    </section>
  );
}

export function OrganizationSettingsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const grants = useMemo(() => getApprovedOfficerGrants(session), [session]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeId, getTabTo } = useQueryTab(managementTabs.map((item) => item.id), 'details');
  const requestedOrganizationId = searchParams.get('organizationId') ?? '';
  const initialOrganizationId = useMemo(
    () => grants.find((grant) => grant.organizationId === requestedOrganizationId)?.organizationId ?? grants[0]?.organizationId ?? '',
    [grants, requestedOrganizationId],
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(initialOrganizationId);
  const [profileDirty, setProfileDirty] = useState(false);
  const [pendingOrganizationId, setPendingOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    if (requestedOrganizationId && grants.some((grant) => grant.organizationId === requestedOrganizationId)) {
      if (selectedOrganizationId !== requestedOrganizationId) setSelectedOrganizationId(requestedOrganizationId);
      return;
    }
    if (initialOrganizationId) {
      if (selectedOrganizationId !== initialOrganizationId) setSelectedOrganizationId(initialOrganizationId);
      const next = new URLSearchParams(searchParams);
      next.set('organizationId', initialOrganizationId);
      setSearchParams(next, { replace: true });
    }
  }, [grants, initialOrganizationId, requestedOrganizationId, searchParams, selectedOrganizationId, setSearchParams]);

  const selectedGrant = grants.find((grant) => grant.organizationId === selectedOrganizationId);
  const profileFormId = selectedGrant ? `profile-recruitment-form-${selectedGrant.organizationId}` : undefined;
  const handleProfileDirtyChange = useCallback((dirty: boolean) => setProfileDirty(dirty), []);

  if (!grants.length) {
    return (
      <WorkflowPageFrame
        eyebrow="Organization settings"
        title="No managed organization yet."
        description="This settings page appears only after an organization-specific officer grant is active."
        session={session}
      >
        <StateBlock title="No organization access" symbol="0">
          Your account does not currently manage an organization.
        </StateBlock>
      </WorkflowPageFrame>
    );
  }

  const switchOrganization = (organizationId: string) => {
    setProfileDirty(false);
    setSelectedOrganizationId(organizationId);
    const next = new URLSearchParams(searchParams);
    next.set('organizationId', organizationId);
    setSearchParams(next);
  };

  const changeOrganization = (organizationId: string) => {
    if (organizationId === selectedOrganizationId) return;
    if (profileDirty) {
      setPendingOrganizationId(organizationId);
      return;
    }
    switchOrganization(organizationId);
  };

  return (
    <WorkflowPageFrame
      eyebrow="Organization settings"
      title="Organization settings"
      description={selectedGrant ? `Selected organization: ${selectedGrant.organizationName}. Edit details first, then switch tabs for announcements and dates.` : 'Edit organization details first, then switch tabs for announcements and dates.'}
      session={session}
      actions={selectedGrant ? <ButtonLink to={`/app/organizations/${selectedGrant.organizationId}`} variant="secondary">View public profile</ButtonLink> : undefined}
    >
      <SourceNotice client={client} />
      <OfficerOrganizationPicker selectedOrganizationId={selectedOrganizationId} onChange={changeOrganization} session={session} />
      <OfficerDashboardBlock organizationId={selectedOrganizationId} session={session} client={client}>
        {(dashboard, reload) => {
          const tabsWithCounts = managementTabs.map((tab) => {
            if (tab.id === 'announcements') return { ...tab, count: dashboard.announcements.length };
            if (tab.id === 'dates') return { ...tab, count: dashboard.dateEntries.length };
            return tab;
          });
          return (
            <section className="grid gap-4" aria-label="Managed organization settings">
              <section className="flex flex-wrap items-center justify-between gap-3.5 border-b border-[var(--color-border)] pb-4 pt-2.5 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[1.15rem] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[var(--color-navy)]" aria-label="Selected managed organization">
                <div className="flex min-w-0 items-center gap-3 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[1.05rem] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[var(--color-navy)] [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[1.05rem] [&_h3]:font-bold [&_h3]:leading-tight [&_h3]:text-[var(--color-navy)]">
                  <OrganizationAvatar name={dashboard.organization.name} logoUrl={dashboard.organization.logoUrl} />
                  <div>
                    <h2>{dashboard.organization.name}</h2>
                    <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">{dashboard.organization.shortDescription}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge kind="officer">Approved officer access</RoleBadge>
                  {profileDirty ? <StatusChip tone="attention">Unsaved profile edits</StatusChip> : null}
                </div>
              </section>

              <DepartmentStudentCountPanel organization={dashboard.organization} session={session} client={client} />

              <SubtabNav label="Organization management tasks" baseId="organization-management" items={tabsWithCounts} activeId={activeId} getTabTo={getTabTo} />

              <SubtabPanel baseId="organization-management" tabId="details" activeId={activeId}>
                <ProfileRecruitmentSection dashboard={dashboard} session={session} client={client} onChanged={reload} formId={profileFormId} onDirtyChange={handleProfileDirtyChange} />
              </SubtabPanel>
              <SubtabPanel baseId="organization-management" tabId="announcements" activeId={activeId}>
                <AnnouncementSection dashboard={dashboard} session={session} client={client} onChanged={reload} allowPosting />
              </SubtabPanel>
              <SubtabPanel baseId="organization-management" tabId="dates" activeId={activeId}>
                <DateEntriesSection dashboard={dashboard} session={session} client={client} onChanged={reload} />
              </SubtabPanel>
            </section>
          );
        }}
      </OfficerDashboardBlock>
      <ConfirmDialog
        open={Boolean(pendingOrganizationId)}
        title="Switch organizations?"
        description="This will discard unsaved profile edits for the current organization before opening the next one."
        confirmLabel="Discard and switch"
        cancelLabel="Keep editing"
        destructive
        onOpenChange={(open) => { if (!open) setPendingOrganizationId(null); }}
        onConfirm={() => {
          if (pendingOrganizationId) switchOrganization(pendingOrganizationId);
          setPendingOrganizationId(null);
        }}
      />
    </WorkflowPageFrame>
  );
}

export const OrganizationSettingsPage = () => {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <OrganizationSettingsView session={session} client={client} />;
};
