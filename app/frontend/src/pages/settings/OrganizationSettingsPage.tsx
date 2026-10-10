import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, StateBlock, StatusChip } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from '../workflows/contracts';
import {
  DateEntriesSection,
  OfficerDashboardBlock,
  OfficerOrganizationPicker,
  ProfileRecruitmentSection,
} from '../workflows/OfficerPage';
import {
  OrganizationAvatar,
  OrganizationIdentityArt,
  RouteUnavailableState,
  SourceNotice,
  useWorkflowSession,
  WorkflowPageFrame,
} from '../workflows/pageParts';
import { getApprovedOfficerGrants } from '../workflows/workflowUtils';

export function OrganizationSettingsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const grants = useMemo(() => getApprovedOfficerGrants(session), [session]);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOrganizationId = searchParams.get('organizationId') ?? '';
  const initialOrganizationId = useMemo(
    () => grants.find((grant) => grant.organizationId === requestedOrganizationId)?.organizationId ?? grants[0]?.organizationId ?? '',
    [grants, requestedOrganizationId],
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(initialOrganizationId);

  useEffect(() => {
    if (requestedOrganizationId && grants.some((grant) => grant.organizationId === requestedOrganizationId)) {
      if (selectedOrganizationId !== requestedOrganizationId) setSelectedOrganizationId(requestedOrganizationId);
      return;
    }
    if (initialOrganizationId) {
      if (selectedOrganizationId !== initialOrganizationId) setSelectedOrganizationId(initialOrganizationId);
      setSearchParams({ organizationId: initialOrganizationId }, { replace: true });
    }
  }, [grants, initialOrganizationId, requestedOrganizationId, selectedOrganizationId, setSearchParams]);

  const selectedGrant = grants.find((grant) => grant.organizationId === selectedOrganizationId);
  const profileFormId = selectedGrant ? `profile-recruitment-form-${selectedGrant.organizationId}` : undefined;

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
    setSelectedOrganizationId(organizationId);
    setSearchParams({ organizationId });
  };

  return (
    <WorkflowPageFrame
      eyebrow="Organization settings"
      title={selectedGrant ? `Manage ${selectedGrant.organizationName}.` : 'Manage organization details.'}
      description="Update public profile details, recruitment copy, organization image, and posted dates for organizations where your officer grant applies."
      session={session}
      actions={selectedGrant && profileFormId ? (
        <>
          <StatusChip tone="approved">Managing {selectedGrant.organizationName}</StatusChip>
          <Button type="submit" form={profileFormId} variant="primary">Save profile</Button>
          <ButtonLink to={`/app/organizations/${selectedGrant.organizationId}`} variant="secondary">View public profile</ButtonLink>
        </>
      ) : undefined}
    >
      <SourceNotice client={client} />
      <OfficerOrganizationPicker selectedOrganizationId={selectedOrganizationId} onChange={changeOrganization} session={session} />
      <OfficerDashboardBlock organizationId={selectedOrganizationId} session={session} client={client}>
        {(dashboard, reload) => (
          <section className="content-stack" aria-label="Managed organization settings">
            <section className="organization-management-hero">
              <OrganizationIdentityArt name={dashboard.organization.name} logoUrl={dashboard.organization.logoUrl} className="management-identity-art" />
              <div className="profile-hero-copy">
                <div className="org-head">
                  <OrganizationAvatar name={dashboard.organization.name} logoUrl={dashboard.organization.logoUrl} />
                  <div>
                    <h2>{dashboard.organization.name}</h2>
                    <p className="section-note">{dashboard.organization.shortDescription}</p>
                  </div>
                </div>
                <p>Selected management context is retained in the URL and enforced by your organization grant.</p>
                <div className="component-row">
                  <StatusChip tone="approved">Management access</StatusChip>
                </div>
              </div>
            </section>
            <ProfileRecruitmentSection dashboard={dashboard} session={session} client={client} onChanged={reload} formId={profileFormId} />
            <DateEntriesSection dashboard={dashboard} session={session} client={client} onChanged={reload} />
          </section>
        )}
      </OfficerDashboardBlock>
    </WorkflowPageFrame>
  );
}

export const OrganizationSettingsPage = () => {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <OrganizationSettingsView session={session} client={client} />;
};
