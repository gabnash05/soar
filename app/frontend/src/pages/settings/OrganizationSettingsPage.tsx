import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ButtonLink, ConfirmDialog, LoadingBlock, RoleBadge, StateBlock, StatusChip, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { OrganizationProfile, WorkflowDataClient } from '../workflows/contracts';
import { OrganizationApplicationIntakePanel } from '../workflows/ApplicationIntakeControl';
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
import { getApprovedOfficerGrants, isStudent } from '../workflows/workflowUtils';

const managementTabs = [
  { id: 'details', label: 'Details' },
  { id: 'intake', label: 'Application intake' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'dates', label: 'Dates & availability' },
];

function DepartmentStudentCountPanel({ organization, session, client }: { organization: OrganizationProfile; session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage } = useWorkflowQuery(
    () => client.getOrganizationDepartmentStudentCount(organization.id, session),
    [client, organization.id, session.uid],
  );

  if (loading) return <LoadingBlock label="Loading department student count" />;

  const currentCount = error ? undefined : data?.registeredStudentCount;
  const departmentName = data?.department ?? organization.department;
  const statusCopy = error
    ? error
    : data
      ? 'Saved student accounts whose registered department matches this organization.'
      : 'This organization has no authoritative department link, so a count is not available.';

  return (
    <section className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-y border-[var(--color-border)] py-3" aria-label="Registered students from this department">
      <div className="grid min-w-0 gap-0.5">
        <h3 className="m-0 font-[var(--font-display)] text-sm font-bold text-[var(--color-navy)]">{departmentName ?? 'Department not assigned'}</h3>
        <p className="m-0 max-w-[68ch] text-sm text-[var(--muted-foreground)]">{statusCopy}</p>
        {sourceMessage ? <p className="m-0 text-xs text-[var(--muted-foreground)]">{sourceMessage}</p> : null}
      </div>
      <p className="m-0 flex shrink-0 items-baseline gap-2 text-sm text-[var(--muted-foreground)]" aria-live="polite">
        <strong className="font-[var(--font-display)] text-2xl font-bold tabular-nums text-[var(--color-navy)]">{currentCount ?? '—'}</strong>
        <span>registered students</span>
      </p>
    </section>
  );
}

export function OrganizationSettingsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const grants = useMemo(() => isStudent(session) ? getApprovedOfficerGrants(session) : [], [session]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeId, getTabTo } = useQueryTab(managementTabs.map((item) => item.id), 'details');
  const requestedOrganizationId = searchParams.get('organizationId') ?? '';
  const initialOrganizationId = useMemo(
    () => grants.find((grant) => grant.organizationId === requestedOrganizationId)?.organizationId ?? grants[0]?.organizationId ?? '',
    [grants, requestedOrganizationId],
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(initialOrganizationId);
  const [profileDirty, setProfileDirty] = useState(false);
  const [intakeSaving, setIntakeSaving] = useState(false);
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
      description={selectedGrant ? `Selected organization: ${selectedGrant.organizationName}. Control application intake, then manage profile details, announcements, and dates.` : 'Control application intake, then manage profile details, announcements, and dates.'}
      session={session}
      actions={selectedGrant ? <ButtonLink to={`/app/organizations/${selectedGrant.organizationId}`} variant="secondary">View public profile</ButtonLink> : undefined}
    >
      <SourceNotice client={client} />
      <OfficerOrganizationPicker selectedOrganizationId={selectedOrganizationId} onChange={changeOrganization} session={session} disabled={intakeSaving} />
      <OfficerDashboardBlock key={`${session.uid}:${selectedOrganizationId}`} organizationId={selectedOrganizationId} session={session} client={client}>
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

              <SubtabNav label="Organization management tasks" baseId="organization-management" items={tabsWithCounts} activeId={activeId} getTabTo={getTabTo} />

              <SubtabPanel baseId="organization-management" tabId="details" activeId={activeId}>
                <div className="grid min-w-0 gap-4">
                  <DepartmentStudentCountPanel organization={dashboard.organization} session={session} client={client} />
                  <ProfileRecruitmentSection dashboard={dashboard} session={session} client={client} onChanged={reload} formId={profileFormId} onDirtyChange={handleProfileDirtyChange} />
                </div>
              </SubtabPanel>
              <SubtabPanel baseId="organization-management" tabId="intake" activeId={activeId}>
                <OrganizationApplicationIntakePanel key={`${session.uid}:${selectedOrganizationId}`} organizationId={selectedOrganizationId} session={session} client={client} onSavingChange={setIntakeSaving} />
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
