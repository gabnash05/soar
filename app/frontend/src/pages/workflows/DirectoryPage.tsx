import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink, Card, CardHeader, LoadingBlock } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from './contracts';
import { EmptyState, ErrorState, OrganizationAvatar, RouteUnavailableState, SourceNotice, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame } from './pageParts';
import { filterOrganizationsByName } from './workflowUtils';

export function DirectoryView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const [query, setQuery] = useState('');
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery(() => client.listOrganizations(session), [client, session.uid]);
  const filtered = useMemo(() => filterOrganizationsByName(data ?? [], query), [data, query]);

  return (
    <WorkflowPageFrame
      eyebrow="Directory"
      title="Find an organization by name."
      description="Search organization names, review quick details, and open a profile when you find a match."
      session={session}
    >
      <SourceNotice client={client} message={sourceMessage} />
      <Card>
        <CardHeader title="Organization name search">Search by organization name.</CardHeader>
        <div className="field">
          <label className="label-row" htmlFor="organization-search">Search by organization name</label>
          <input
            id="organization-search"
            className="control"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try Robotics Guild or a name that does not exist"
          />
        </div>
      </Card>
      {loading ? <LoadingBlock label="Loading organizations" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {!loading && !error && data?.length === 0 ? (
        <EmptyState title="Organizations are not available">Directory records will appear here when they are available.</EmptyState>
      ) : null}
      {!loading && !error && data && data.length > 0 && filtered.length === 0 ? (
        <EmptyState title="No organizations match this search">Clear the search or try a different organization name.</EmptyState>
      ) : null}
      <section className="grid grid-3" aria-label="Organization directory results">
        {filtered.map((organization) => {
          const organizationPath = `/app/organizations/${organization.id}`;
          return (
            <Card key={organization.id} className="org-card">
              <div className="org-head">
                <Link className="org-avatar-link" to={organizationPath} aria-label={`Open ${organization.name} profile`}>
                  <OrganizationAvatar name={organization.name} logoUrl={organization.logoUrl} />
                </Link>
                <div>
                  <h2><Link className="org-author-link" to={organizationPath}>{organization.name}</Link></h2>
                  <p className="card-note">Recruitment: {organization.recruitmentTitle}</p>
                </div>
              </div>
              <p>{organization.shortDescription}</p>
              <p className="card-note">Contact: {organization.contactEmail}</p>
              <ButtonLink to={organizationPath} variant="secondary">View profile</ButtonLink>
            </Card>
          );
        })}
      </section>
    </WorkflowPageFrame>
  );
}

export default function DirectoryPage() {
  const { session, client, loading } = useWorkflowSession();
  if (loading || !session || session.access.status !== 'active') return <RouteUnavailableState loading={loading} session={session} />;
  return <DirectoryView session={session} client={client} />;
}
