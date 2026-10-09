import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Card, StateBlock, StatusChip } from '../../components/ui';
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
    if (!grants.some((grant) => grant.organizationId === selectedOrganizationId)) {
      setSelectedOrganizationId(initialOrganizationId);
    }
  }, [grants, initialOrganizationId, requestedOrganizationId, selectedOrganizationId]);

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
        <StateBlock title="No organization access" symbol="🔒">
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
      title="Manage organization details."
      description="Update public profile details, recruitment copy, organization image, and posted dates for organizations where your officer grant applies."
      session={session}
      actions={selectedGrant && profileFormId ? (
        <>
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
            <Card className="org-settings-summary">
              <div className="org-head">
                <OrganizationAvatar name={dashboard.organization.name} logoUrl={dashboard.organization.logoUrl} />
                <div>
                  <h2>{dashboard.organization.name}</h2>
                  <p className="card-note">{dashboard.organization.shortDescription}</p>
                </div>
              </div>
              <div className="component-row">
                <StatusChip tone="approved">Management access</StatusChip>
              </div>
            </Card>
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
