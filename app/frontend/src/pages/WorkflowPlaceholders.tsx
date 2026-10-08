import { useParams } from 'react-router-dom';
import { ButtonLink, Card, CardHeader, StateBlock, StatusChip } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const UnavailableWorkflow = ({ title, children }: { title: string; children: string }) => (
  <StateBlock symbol="⌁" title={title} actions={<ButtonLink to="/settings/access" variant="secondary">View access status</ButtonLink>}>
    {children}
  </StateBlock>
);

export const FeedPlaceholderPage = () => {
  const { session } = useAuth();
  return (
    <div className="page-stack">
      <header className="page-header hero-panel">
        <div>
          <p className="eyebrow">Announcements</p>
          <h1>Good day, {session?.displayName.split(' ')[0] || 'there'}.</h1>
          <p>Workflow feed implementation is owned by the workflows lane. This foundation shell is ready for trusted data and role-aware navigation.</p>
        </div>
        <ButtonLink to="/app/directory">Browse organizations</ButtonLink>
      </header>
      <div className="placeholder-grid">
        <Card>
          <CardHeader title="Loading state contract" eyebrow="Shared UI">Use <code>LoadingBlock</code>, <code>StateBlock</code>, status chips, and the gateway hooks instead of duplicating component systems.</CardHeader>
        </Card>
        <Card>
          <CardHeader title="Announcements feed" eyebrow="Unavailable">No posts are shown until workflow data adapters are wired to the backend.</CardHeader>
          <div className="feed-skeleton"><i /><i /><i /></div>
        </Card>
      </div>
    </div>
  );
};

export const DirectoryPlaceholderPage = () => (
  <div className="page-stack">
    <header className="page-header">
      <p className="eyebrow">Organizations</p>
      <h1>Directory</h1>
      <p>Search and profile cards mount here. The shared shell already reserves responsive space and navigation.</p>
    </header>
    <UnavailableWorkflow title="Directory not connected yet">Organization records must come from the backend workflows contract before real cards, search results, or no-results states are shown.</UnavailableWorkflow>
  </div>
);

export const OrganizationPlaceholderPage = () => {
  const { organizationId } = useParams();
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="eyebrow">Organization profile</p>
        <h1>{organizationId || 'Organization'}</h1>
        <p>Profile, recruitment, announcements, events, application and meeting entry points should follow the approved wireframe.</p>
      </header>
      <Card>
        <CardHeader title="Workflow handoff reminder" eyebrow="External form rule">
          Opening an external application form cannot create an application record. The confirmation action stays locked until the form is opened and returned.
        </CardHeader>
        <div className="button-row">
          <StatusChip tone="attention">Confirmation locked</StatusChip>
          <StatusChip tone="info">Duplicate prevention required server-side</StatusChip>
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
    <UnavailableWorkflow title="Application tracker unavailable">Workflow data is intentionally not mocked as successful production state. Connect to backend application records before showing progress.</UnavailableWorkflow>
  </div>
);

export const MeetingsPlaceholderPage = () => (
  <div className="page-stack">
    <header className="page-header">
      <p className="eyebrow">Meeting tracker</p>
      <h1>Meetings</h1>
      <p>Students, sponsors, and approved officers can track pending, approved, and declined meeting requests where available to their role.</p>
    </header>
    <UnavailableWorkflow title="Meeting requests unavailable">Repeated requests and officer decisions need backend workflow support before this screen can save real records.</UnavailableWorkflow>
  </div>
);

export const OfficerPlaceholderPage = () => (
  <div className="page-stack">
    <header className="page-header">
      <p className="eyebrow">Officer tools</p>
      <h1>Organization workspace</h1>
      <p>Only trusted organization grants unlock these tools. No prototype role toggles are treated as permission.</p>
    </header>
    <div className="placeholder-grid">
      {['Profile & recruitment', 'Announcements', 'Applicants', 'Calendar/date entries', 'Meeting requests'].map((title) => (
        <Card key={title}>
          <CardHeader title={title} eyebrow="Granted organization only">Disabled until workflow backend and page implementation are merged.</CardHeader>
        </Card>
      ))}
    </div>
  </div>
);
