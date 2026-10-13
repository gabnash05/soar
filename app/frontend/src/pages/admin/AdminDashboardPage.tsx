import { Button, LoadingBlock, StateBlock } from '../../components/ui';
import { isStatsAdminAccount, type UserSession } from '../../lib/contracts';
import type { AdminStatistics, WorkflowDataClient } from '../workflows/contracts';
import {
  ErrorState,
  SourceNotice,
  useWorkflowQuery,
  useWorkflowSession,
  WorkflowPageFrame,
} from '../workflows/pageParts';

function DepartmentTable({ data }: { data: AdminStatistics }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)]" role="region" aria-label="Registered students by department">
      <table className="w-full min-w-[640px] border-collapse [&_caption]:px-3 [&_caption]:py-2.5 [&_caption]:text-left [&_caption]:text-[0.85rem] [&_caption]:font-bold [&_caption]:text-[var(--muted-foreground)] [&_th]:border-b [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-off-white)] [&_th]:p-3 [&_th]:text-left [&_th]:align-top [&_th]:text-[0.82rem] [&_th]:uppercase [&_th]:tracking-[0.04em] [&_th]:text-[var(--color-navy)] [&_td]:border-b [&_td]:border-[var(--color-border)] [&_td]:p-3 [&_td]:text-left [&_td]:align-top min-w-[420px]">
        <caption>Registered student accounts across SOAR grouped by saved department. No student identities, emails, applications, or organization membership data are included.</caption>
        <thead>
          <tr>
            <th>Department</th>
            <th>Registered students</th>
          </tr>
        </thead>
        <tbody>
          {data.students.departments.map((item) => (
            <tr key={item.departmentKey || item.department}>
              <td>{item.department || 'Unspecified'}</td>
              <td>{item.count}</td>
            </tr>
          ))}
          {data.students.missingDepartmentCount ? (
            <tr>
              <td>Unspecified legacy accounts</td>
              <td>{data.students.missingDepartmentCount}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function AdminDashboardView({ session, client }: { session: UserSession; client: WorkflowDataClient }) {
  const enabled = isStatsAdminAccount(session);
  const emptyStats: AdminStatistics = {
    generatedAt: new Date().toISOString(),
    scope: 'registered_soar_totals',
    students: { totalRegisteredStudents: 0, missingDepartmentCount: 0, departments: [] },
    organizations: { totalOrganizations: 0 },
  };
  const { data, loading, error, sourceMessage, reload } = useWorkflowQuery(
    () => enabled ? client.getAdminStatistics(session) : Promise.resolve({ data: emptyStats, source: client.mode }),
    [client, session.uid, enabled],
  );

  if (!enabled) {
    return (
      <StateBlock title="Admin statistics unavailable" symbol="!">
        This dashboard is available only to provisioned aggregate-statistics admins.
      </StateBlock>
    );
  }

  return (
    <WorkflowPageFrame
      eyebrow="Admin statistics"
      title="SOAR aggregate dashboard"
      description="Read-only totals for provisioned statistics admins. This page intentionally exposes no student identities, private documents, payment overrides, or organization controls."
      session={session}
      actions={<Button type="button" variant="secondary" onClick={reload}>Refresh totals</Button>}
    >
      <SourceNotice client={client} message={sourceMessage} />
      {loading ? <LoadingBlock label="Loading aggregate statistics" /> : null}
      {error ? <ErrorState onRetry={reload}>{error}</ErrorState> : null}
      {data && !loading && !error ? (
        <section className="grid gap-4" aria-label="Aggregate SOAR statistics">
          {client.mode === 'fixture' ? (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] text-sm">Demo mode: admin statistics are simulated aggregate data. Missing legacy department data is labelled honestly.</p>
          ) : sourceMessage ? (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-blue-soft)] px-3.5 py-3 text-[var(--color-blue-deep)] text-sm">{sourceMessage}</p>
          ) : null}
          <div className="grid md:grid-cols-3">
            <section className="grid w-[min(320px,100%)] gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)] p-4 [&_strong]:font-[var(--font-display)] [&_strong]:text-[2.4rem] [&_strong]:font-black [&_strong]:leading-none [&_strong]:tracking-[-0.04em] [&_strong]:text-[var(--color-navy)] [&_span]:text-[var(--muted-foreground)]">
              <strong>{data.students.totalRegisteredStudents}</strong>
              <span>registered student accounts</span>
            </section>
            <section className="grid w-[min(320px,100%)] gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)] p-4 [&_strong]:font-[var(--font-display)] [&_strong]:text-[2.4rem] [&_strong]:font-black [&_strong]:leading-none [&_strong]:tracking-[-0.04em] [&_strong]:text-[var(--color-navy)] [&_span]:text-[var(--muted-foreground)]">
              <strong>{data.students.departments.length}</strong>
              <span>saved department groups</span>
            </section>
            <section className="grid w-[min(320px,100%)] gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-white)] p-4 [&_strong]:font-[var(--font-display)] [&_strong]:text-[2.4rem] [&_strong]:font-black [&_strong]:leading-none [&_strong]:tracking-[-0.04em] [&_strong]:text-[var(--color-navy)] [&_span]:text-[var(--muted-foreground)]">
              <strong>{data.organizations.totalOrganizations}</strong>
              <span>registered organizations</span>
            </section>
          </div>
          <DepartmentTable data={data} />
          <p className="m-0 max-w-[68ch] text-[var(--muted-foreground)]">Generated {new Date(data.generatedAt).toLocaleString()}. Counts are registered SOAR accounts, not organization members or applicants.</p>
        </section>
      ) : null}
    </WorkflowPageFrame>
  );
}

export function AdminDashboardPage() {
  const { session, client, loading: sessionLoading } = useWorkflowSession();
  if (sessionLoading) return <LoadingBlock label="Loading admin session" />;
  if (!session) {
    return (
      <StateBlock title="Admin statistics unavailable" symbol="!">
        This dashboard is available only to provisioned aggregate-statistics admins.
      </StateBlock>
    );
  }
  return <AdminDashboardView session={session} client={client} />;
}
