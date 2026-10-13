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
      <section className="min-w-0 border-t border-[var(--color-border)] py-[clamp(16px,3vw,24px)] first:border-t-0 first:pt-0 pb-[18px]" aria-label="Organization search">
        <header className="mb-3.5 grid gap-1 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[clamp(1.25rem,2.4vw,1.75rem)] [&_h2]:font-extrabold [&_h2]:leading-[1.14] [&_h2]:tracking-[-0.02em] [&_h2]:text-[var(--color-navy)] [&_p]:m-0 [&_p]:max-w-[68ch] [&_p]:text-[var(--muted-foreground)] flex items-end justify-between gap-4 max-[820px]:flex-col max-[820px]:items-start">
          <div>
            <h2>Search organizations</h2>
            <p>Search by organization name, then open the public profile that matches.</p>
          </div>
          <p className="font-extrabold text-[var(--color-blue-deep)]" aria-live="polite">{filtered.length} result{filtered.length === 1 ? '' : 's'}</p>
        </header>
        <div className="grid min-w-0 gap-1.5 max-w-[720px]">
          <label className="flex justify-between gap-3 text-[13px] font-bold text-[var(--color-navy)] [&_span:last-child:not(:first-child)]:font-normal [&_span:last-child:not(:first-child)]:text-[var(--muted-foreground)]" htmlFor="organization-search">Search by organization name</label>
          <input
            id="organization-search"
            className="min-h-[46px] w-full rounded-[7px] border border-[var(--color-border)] bg-[var(--color-white)] px-[13px] py-2.5 text-[var(--color-ink)] placeholder:text-[var(--muted-foreground)] disabled:bg-[var(--color-off-white)] disabled:text-[var(--muted-foreground)] hover:not-disabled:border-[var(--color-blue)] focus:border-[var(--color-blue-deep)] focus:outline-none focus:ring-3 focus:ring-[var(--color-blue-soft)]"
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
      <section className="grid grid-cols-3 gap-[18px] max-lg:grid-cols-2 max-[820px]:grid-cols-1" aria-label="Organization directory results">
        {filtered.map((organization) => {
          const organizationPath = `/app/organizations/${organization.id}`;
          return (
            <article key={organization.id} className="grid min-w-0 content-start overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-white)] shadow-[var(--shadow-soft)]">
              <Link className="block text-inherit no-underline" to={organizationPath} aria-label={`Open ${organization.name} profile`}>
                <OrganizationIdentityArt name={organization.name} logoUrl={organization.logoUrl} />
              </Link>
              <div className="grid gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3 [&_h2]:m-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[1.05rem] [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[var(--color-navy)] [&_h3]:m-0 [&_h3]:font-[var(--font-display)] [&_h3]:text-[1.05rem] [&_h3]:font-bold [&_h3]:leading-tight [&_h3]:text-[var(--color-navy)]">
                  <OrganizationAvatar name={organization.name} logoUrl={organization.logoUrl} />
                  <div>
                    <h2><Link className="text-[var(--color-navy)] underline decoration-transparent underline-offset-4 hover:text-[var(--color-blue-deep)] hover:decoration-current focus-visible:text-[var(--color-blue-deep)] focus-visible:decoration-current" to={organizationPath}>{organization.name}</Link></h2>
                    <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">Recruitment: {organization.recruitmentTitle}</p>
                  </div>
                </div>
                <p>{organization.shortDescription}</p>
                <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">Contact: {organization.contactEmail}</p>
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
