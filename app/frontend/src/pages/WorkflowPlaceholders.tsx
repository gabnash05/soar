import { useParams } from 'react-router-dom';
import { ButtonLink, Card, CardHeader, StateBlock, StatusChip } from '../components/ui';

const UnavailableWorkflow = ({ title, children }: { title: string; children: string }) => (
  <StateBlock symbol="!" title={title} actions={<ButtonLink to="/settings/access" variant="secondary">View access status</ButtonLink>}>
    {children}
  </StateBlock>
);

export const FeedPlaceholderPage = () => (
    <div className="mx-auto grid w-[min(1120px,100%)] gap-[18px]">
      <header className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_h1]:mb-1.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(1.9rem,4vw,3rem)] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.035em] [&_h1]:text-white [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80 max-sm:[&_h1]:text-[2.15rem] flex items-center justify-between gap-[18px] rounded-[18px] bg-[var(--color-white)] p-[clamp(22px,4vw,40px)] shadow-[var(--shadow-soft)] max-[820px]:flex-col max-[820px]:items-start">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Announcements</p>
          <h1>Announcements</h1>
          <p>Newest organization updates appear here.</p>
        </div>
        <ButtonLink to="/app/directory">Browse organizations</ButtonLink>
      </header>
      <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
        <Card>
          <CardHeader title="Loading updates" eyebrow="Please wait">SOAR is preparing organization posts.</CardHeader>
        </Card>
        <Card>
          <CardHeader title="Announcements feed" eyebrow="Unavailable">No posts are available yet.</CardHeader>
          <div className="grid gap-3 [&_i]:block [&_i]:h-3.5 [&_i]:rounded-full [&_i]:bg-[var(--color-border)] [&_i:first-child]:h-5 [&_i:first-child]:w-[42%] [&_i:nth-child(2)]:w-[88%] [&_i:nth-child(3)]:w-[68%]"><i /><i /><i /></div>
        </Card>
      </div>
    </div>
);

export const DirectoryPlaceholderPage = () => (
  <div className="mx-auto grid w-[min(1120px,100%)] gap-[18px]">
    <header className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_h1]:mb-1.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(1.9rem,4vw,3rem)] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.035em] [&_h1]:text-white [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80 max-sm:[&_h1]:text-[2.15rem]">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Organizations</p>
      <h1>Directory</h1>
      <p>Search organizations and open profile cards.</p>
    </header>
    <UnavailableWorkflow title="Directory unavailable">Organization records are not available yet.</UnavailableWorkflow>
  </div>
);

export const OrganizationPlaceholderPage = () => {
  const { organizationId } = useParams();
  return (
    <div className="mx-auto grid w-[min(1120px,100%)] gap-[18px]">
      <header className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_h1]:mb-1.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(1.9rem,4vw,3rem)] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.035em] [&_h1]:text-white [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80 max-sm:[&_h1]:text-[2.15rem]">
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Organization profile</p>
        <h1>{organizationId || 'Organization'}</h1>
        <p>View profile details, recruitment, announcements, events, applications, and meetings.</p>
      </header>
      <Card>
        <CardHeader title="External application" eyebrow="Confirmation required">
          Confirm in SOAR only after submitting the external form.
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2.5 max-sm:[&>a]:w-full max-sm:[&>button]:w-full">
          <StatusChip tone="attention">Confirmation locked</StatusChip>
          <StatusChip tone="info">One tracker entry per opportunity</StatusChip>
        </div>
      </Card>
    </div>
  );
};

export const ApplicationsPlaceholderPage = () => (
  <div className="mx-auto grid w-[min(1120px,100%)] gap-[18px]">
    <header className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_h1]:mb-1.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(1.9rem,4vw,3rem)] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.035em] [&_h1]:text-white [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80 max-sm:[&_h1]:text-[2.15rem]">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Application tracker</p>
      <h1>Applications</h1>
      <p>Students see organization, recruitment opportunity, and stage: Pending, Under review, Accepted, or Declined.</p>
    </header>
    <UnavailableWorkflow title="Application tracker unavailable">Application records are not available yet.</UnavailableWorkflow>
  </div>
);

export const MeetingsPlaceholderPage = () => (
  <div className="mx-auto grid w-[min(1120px,100%)] gap-[18px]">
    <header className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_h1]:mb-1.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(1.9rem,4vw,3rem)] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.035em] [&_h1]:text-white [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80 max-sm:[&_h1]:text-[2.15rem]">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Meeting tracker</p>
      <h1>Meetings</h1>
      <p>Track pending, approved, and declined meeting requests where available to your role.</p>
    </header>
    <UnavailableWorkflow title="Meeting requests unavailable">Meeting requests are not available yet.</UnavailableWorkflow>
  </div>
);

export const OfficerPlaceholderPage = () => (
  <div className="mx-auto grid w-[min(1120px,100%)] gap-[18px]">
    <header className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-[var(--gradient-brand)] p-[clamp(16px,3vw,24px)] text-white [&_.eyebrow]:text-[var(--color-gold)] [&_h1]:mb-1.5 [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(1.9rem,4vw,3rem)] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.035em] [&_h1]:text-white [&_p:not(.eyebrow)]:m-0 [&_p:not(.eyebrow)]:max-w-[72ch] [&_p:not(.eyebrow)]:text-white/80 max-sm:[&_h1]:text-[2.15rem]">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-blue-deep)]">Organization management</p>
      <h1>Organization workspace</h1>
      <p>Management controls appear only for organizations where your account has access.</p>
    </header>
    <div className="grid grid-cols-2 gap-4 max-[820px]:grid-cols-1">
      {['Profile & recruitment', 'Announcements', 'Applicants', 'Calendar/date entries', 'Meeting requests'].map((title) => (
        <Card key={title}>
          <CardHeader title={title} eyebrow="Organization access">This control appears when it is available for your organization.</CardHeader>
        </Card>
      ))}
    </div>
  </div>
);
