import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ButtonLink, Card, StateBlock, StatusChip } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from '../workflows/contracts';
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
  useWorkflowSession,
  WorkflowPageFrame,
} from '../workflows/pageParts';
import { getApprovedOfficerGrants } from '../workflows/workflowUtils';

export function OrganizationSettingsView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const grants = getApprovedOfficerGrants(session);
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
      description="Update public profile details, recruitment copy, organization image, announcements, and posted dates for organizations where your officer grant applies."
      session={session}
      actions={selectedGrant ? <ButtonLink to={`/app/organizations/${selectedGrant.organizationId}`} variant="secondary">View public profile</ButtonLink> : undefined}
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
                <ButtonLink to={`/app/organizations/${dashboard.organization.id}`} variant="secondary">View public profile</ButtonLink>
              </div>
            </Card>
            <ProfileRecruitmentSection dashboard={dashboard} session={session} client={client} onChanged={reload} />
            <AnnouncementSection dashboard={dashboard} session={session} client={client} onChanged={reload} />
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
