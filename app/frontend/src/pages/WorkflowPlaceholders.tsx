import { useParams } from 'react-router-dom';
import { ButtonLink, Card, CardHeader, StateBlock, StatusChip } from '../components/ui';

const UnavailableWorkflow = ({ title, children }: { title: string; children: string }) => (
  <StateBlock symbol="⌁" title={title} actions={<ButtonLink to="/settings/access" variant="secondary">View access status</ButtonLink>}>
    {children}
  </StateBlock>
);

export const FeedPlaceholderPage = () => (
    <div className="page-stack">
      <header className="page-header hero-panel">
        <div>
          <p className="eyebrow">Announcements</p>
          <h1>Announcements</h1>
          <p>Newest organization updates appear here.</p>
        </div>
        <ButtonLink to="/app/directory">Browse organizations</ButtonLink>
      </header>
      <div className="placeholder-grid">
        <Card>
          <CardHeader title="Loading updates" eyebrow="Please wait">SOAR is preparing organization posts.</CardHeader>
        </Card>
        <Card>
          <CardHeader title="Announcements feed" eyebrow="Unavailable">No posts are available yet.</CardHeader>
          <div className="feed-skeleton"><i /><i /><i /></div>
        </Card>
      </div>
    </div>
);

export const DirectoryPlaceholderPage = () => (
  <div className="page-stack">
    <header className="page-header">
      <p className="eyebrow">Organizations</p>
      <h1>Directory</h1>
      <p>Search organizations and open profile cards.</p>
    </header>
    <UnavailableWorkflow title="Directory unavailable">Organization records are not available yet.</UnavailableWorkflow>
  </div>
);

export const OrganizationPlaceholderPage = () => {
  const { organizationId } = useParams();
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="eyebrow">Organization profile</p>
        <h1>{organizationId || 'Organization'}</h1>
        <p>View profile details, recruitment, announcements, events, applications, and meetings.</p>
      </header>
      <Card>
        <CardHeader title="External application" eyebrow="Confirmation required">
          Confirm in SOAR only after submitting the external form.
        </CardHeader>
        <div className="button-row">
          <StatusChip tone="attention">Confirmation locked</StatusChip>
          <StatusChip tone="info">One tracker entry per opportunity</StatusChip>
        </div>
      </Card>
    </div>
  );
};

export const ApplicationsPlaceholderPage = () => (
  <div className="page-stack">
    <header className="page-header">
      <p className="eyebrow">Application tracker</p>
      <h1>Applications</h1>
      <p>Students see organization, recruitment opportunity, and stage: Pending, Under review, Accepted, or Declined.</p>
    </header>
    <UnavailableWorkflow title="Application tracker unavailable">Application records are not available yet.</UnavailableWorkflow>
  </div>
);

export const MeetingsPlaceholderPage = () => (
  <div className="page-stack">
    <header className="page-header">
      <p className="eyebrow">Meeting tracker</p>
      <h1>Meetings</h1>
      <p>Track pending, approved, and declined meeting requests where available to your role.</p>
    </header>
    <UnavailableWorkflow title="Meeting requests unavailable">Meeting requests are not available yet.</UnavailableWorkflow>
  </div>
);

export const OfficerPlaceholderPage = () => (
  <div className="page-stack">
    <header className="page-header">
      <p className="eyebrow">Organization management</p>
      <h1>Organization workspace</h1>
      <p>Management controls appear only for organizations where your account has access.</p>
    </header>
    <div className="placeholder-grid">
      {['Profile & recruitment', 'Announcements', 'Applicants', 'Calendar/date entries', 'Meeting requests'].map((title) => (
        <Card key={title}>
          <CardHeader title={title} eyebrow="Organization access">This control appears when it is available for your organization.</CardHeader>
        </Card>
      ))}
    </div>
  </div>
);
