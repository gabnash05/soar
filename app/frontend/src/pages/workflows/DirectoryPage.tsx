import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink, LoadingBlock } from '../../components/ui';
import type { UserSession } from '../../lib/contracts';
import type { WorkflowDataClient } from './contracts';
import { EmptyState, ErrorState, OrganizationAvatar, OrganizationIdentityArt, RouteUnavailableState, SourceNotice, useWorkflowQuery, useWorkflowSession, WorkflowPageFrame } from './pageParts';
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
      <section className="surface-section search-section" aria-label="Organization search">
        <header className="section-heading inline-heading">
          <div>
            <h2>Search organizations</h2>
            <p>Search by organization name, then open the public profile that matches.</p>
          </div>
          <p className="result-count" aria-live="polite">{filtered.length} result{filtered.length === 1 ? '' : 's'}</p>
        </header>
        <div className="field search-field">
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
      </section>
      {loading ? <LoadingBlock label="Loading organizations" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {!loading && !error && data?.length === 0 ? (
        <EmptyState title="Organizations are not available">Directory records will appear here when they are available.</EmptyState>
      ) : null}
      {!loading && !error && data && data.length > 0 && filtered.length === 0 ? (
        <EmptyState title="No organizations match this search">Clear the search or try a different organization name.</EmptyState>
      ) : null}
      <section className="directory-grid" aria-label="Organization directory results">
        {filtered.map((organization) => {
          const organizationPath = `/app/organizations/${organization.id}`;
          return (
            <article key={organization.id} className="org-directory-card">
              <Link className="org-identity-link" to={organizationPath} aria-label={`Open ${organization.name} profile`}>
                <OrganizationIdentityArt name={organization.name} logoUrl={organization.logoUrl} />
              </Link>
              <div className="org-directory-card__body">
                <div className="org-head">
                  <OrganizationAvatar name={organization.name} logoUrl={organization.logoUrl} />
                  <div>
                    <h2><Link className="org-author-link" to={organizationPath}>{organization.name}</Link></h2>
                    <p className="section-note">Recruitment: {organization.recruitmentTitle}</p>
                  </div>
                </div>
                <p>{organization.shortDescription}</p>
                <p className="section-note">Contact: {organization.contactEmail}</p>
                <ButtonLink to={organizationPath} variant="secondary">View profile</ButtonLink>
              </div>
            </article>
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
