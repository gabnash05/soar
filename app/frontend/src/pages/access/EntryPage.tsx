import { Link } from 'react-router-dom';
import { SoarLogo } from '../../components/SoarLogo';
import { ButtonLink, Card, RoleBadge } from '../../components/ui';

export const EntryPage = () => (
  <main className="entry-page">
    <section className="entry-hero">
      <div className="entry-hero__copy">
        <div className="entry-brand">
          <SoarLogo />
          <span>SOAR</span>
        </div>
        <p className="eyebrow">Student Organizations and Allied Resources</p>
        <h1>Find your place. Keep things moving.</h1>
        <p>
          Discover campus organizations, follow announcements, manage application and meeting progress, and keep six-month access current from one role-aware workspace.
        </p>
        <div className="hero-actions">
          <ButtonLink to="/register" variant="primary">Start with PHP10 access</ButtonLink>
          <ButtonLink to="/login" variant="secondary">Sign in</ButtonLink>
        </div>
        <p className="entry-note">
          PHP10 six-month access is required before account creation. Expired accounts can still sign in to renew.
        </p>
      </div>
    </section>

    <section className="entry-grid" aria-label="SOAR capabilities">
      <Card>
        <RoleBadge kind="student">Student workspace</RoleBadge>
        <h2>Track applications honestly</h2>
        <p>Opening an external form never counts as a submission. Students explicitly confirm in SOAR after returning from the form.</p>
      </Card>
      <Card>
        <RoleBadge kind="sponsor">Sponsor workspace</RoleBadge>
        <h2>Browse and request meetings</h2>
        <p>Sponsors can view organization information and meeting status without unrelated application or officer tools.</p>
      </Card>
      <Card>
        <RoleBadge kind="officer">Approved officer grant</RoleBadge>
        <h2>Organization grants only</h2>
        <p>Officers manage only the organizations where they have access, with controls placed on the relevant pages.</p>
      </Card>
    </section>

    <footer className="entry-footer">
      <Link to="/recovery">Forgot password?</Link>
      <span>SOAR keeps organization discovery, applications, meetings, and access in one workspace.</span>
    </footer>
  </main>
);
