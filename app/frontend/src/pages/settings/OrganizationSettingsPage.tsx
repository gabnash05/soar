import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, LoadingBlock, RoleBadge, StateBlock, StatusChip, SubtabNav, SubtabPanel, useQueryTab } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { StudentDepartmentCounts, WorkflowDataClient } from '../workflows/contracts';
import {
  AnnouncementSection,
  DateEntriesSection,
  OfficerDashboardBlock,
  OfficerOrganizationPicker,
  ProfileRecruitmentSection,
} from '../workflows/OfficerPage';
import {
  ErrorState,
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
  { id: 'students', label: 'Student stats' },
];

function StudentDepartmentCountsSection({ organizationId, session, client }: { organizationId: string; session: UserSession; client: WorkflowDataClient }) {
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery<StudentDepartmentCounts>(() => client.getStudentDepartmentCounts(organizationId, session), [client, organizationId, session.uid]);

  return (
    <section className="surface-section compact-section">
      <header className="section-heading">
        <h2>Registered students by department</h2>
        <p>Aggregate counts come from saved student account data across SOAR. They are not organization membership or applicant counts, and no identities, emails, or raw account records are shown.</p>
      </header>
      {client.mode === 'fixture' ? <p className="notice compact">Demo mode: department counts are simulated aggregate data. Missing legacy data is labelled honestly.</p> : sourceMessage ? <p className="notice compact">{sourceMessage}</p> : null}
      {loading ? <LoadingBlock label="Loading department counts" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {data && !loading && !error ? (
        <div className="department-stats-grid">
          <div className="department-stat-summary">
            <strong>{data.totalRegisteredStudents}</strong>
            <span>registered student accounts across SOAR</span>
          </div>
          <div className="table-scroll" role="region" aria-label="Registered students by saved department">
            <table className="data-table department-table">
              <caption>{data.description}</caption>
              <thead><tr><th>Department</th><th>Registered students</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.departmentKey || item.department}><td>{item.department || 'Unspecified'}</td><td>{item.count}</td></tr>
                ))}
                {data.missingDepartmentCount ? <tr><td>Unspecified legacy accounts</td><td>{data.missingDepartmentCount}</td></tr> : null}
              </tbody>
            </table>
          </div>
          <p className="section-note">Generated {new Date(data.generatedAt).toLocaleString()}. Missing legacy data is shown as unspecified rather than guessed.</p>
        </div>
      ) : null}
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

  const changeOrganization = (organizationId: string) => {
    if (organizationId === selectedOrganizationId) return;
    if (profileDirty && !window.confirm('Switch organizations and discard unsaved profile changes?')) return;
    setProfileDirty(false);
    setSelectedOrganizationId(organizationId);
    const next = new URLSearchParams(searchParams);
    next.set('organizationId', organizationId);
    setSearchParams(next);
  };

  return (
    <WorkflowPageFrame
      eyebrow="Organization settings"
      title="Organization settings"
      description={selectedGrant ? `Selected organization: ${selectedGrant.organizationName}. Edit details first, then switch tabs for announcements, dates, and aggregate student statistics.` : 'Edit organization details first, then switch tabs for announcements, dates, and aggregate student statistics.'}
      session={session}
      actions={selectedGrant && profileFormId ? (
        <>
          {activeId === 'details' ? <Button type="submit" form={profileFormId} variant="primary">Save profile</Button> : null}
          <ButtonLink to={`/app/organizations/${selectedGrant.organizationId}`} variant="secondary">View public profile</ButtonLink>
        </>
      ) : undefined}
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
            <section className="content-stack" aria-label="Managed organization settings">
              <section className="management-context-bar" aria-label="Selected managed organization">
                <div className="org-head">
                  <OrganizationAvatar name={dashboard.organization.name} logoUrl={dashboard.organization.logoUrl} />
                  <div>
                    <h2>{dashboard.organization.name}</h2>
                    <p className="section-note">{dashboard.organization.shortDescription}</p>
                  </div>
                </div>
                <div className="component-row">
                  <RoleBadge kind="officer">Approved officer access</RoleBadge>
                  {profileDirty ? <StatusChip tone="attention">Unsaved profile edits</StatusChip> : null}
                </div>
              </section>

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
              <SubtabPanel baseId="organization-management" tabId="students" activeId={activeId}>
                <StudentDepartmentCountsSection organizationId={dashboard.organization.id} session={session} client={client} />
              </SubtabPanel>
            </section>
          );
        }}
      </OfficerDashboardBlock>
    </WorkflowPageFrame>
  );
}

export const OrganizationSettingsPage = () => {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <OrganizationSettingsView session={session} client={client} />;
};
