import { SoarLogo } from '../../components/SoarLogo';
import { ButtonLink, Card, RoleBadge } from '../../components/ui';
import { isPaidFlowEnabled } from '../../lib/features';

export const EntryPage = () => {
  const paidFlowEnabled = isPaidFlowEnabled();
  return (
  <main className="relative isolate mx-auto w-[min(1200px,100%)] p-[clamp(18px,4vw,56px)] max-sm:px-3.5">
    {import.meta.env.VITE_SOAR_USE_FIXTURES === 'true' ? (
      <aside className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-y border-[var(--color-border)] py-2 text-sm text-[var(--muted-foreground)]" role="note" aria-label="Simulated preview">
        <strong className="font-bold text-[var(--color-navy)]">Simulated preview</strong>
        <span>Sample accounts and local workflow data only; no live payments or backend records.</span>
      </aside>
    ) : null}
    <section className="grid items-stretch gap-[clamp(20px,4vw,56px)] max-lg:grid-cols-1">
      <div className="relative flex min-h-[min(560px,calc(100vh-112px))] flex-col justify-center gap-[clamp(24px,4vw,40px)] overflow-hidden rounded-[22px] bg-[var(--color-navy)] bg-[image:var(--gradient-brand)] p-[clamp(28px,5vw,64px)] text-white shadow-[var(--shadow-floating)] max-lg:min-h-0 max-sm:rounded-[18px] max-sm:px-6 [&_h1]:mb-0 [&_h1]:max-w-[12ch] [&_h1]:font-[var(--font-display)] [&_h1]:text-[clamp(3rem,7vw,5.6rem)] [&_h1]:font-semibold [&_h1]:leading-[1.02] [&_h1]:tracking-[-0.04em] [&_h1]:text-white max-sm:[&_h1]:text-[2.65rem] [&_p:not(.eyebrow):not(.hero-note)]:max-w-[60ch] [&_p:not(.eyebrow):not(.hero-note)]:text-lg [&_p:not(.eyebrow):not(.hero-note)]:text-white/80">
        <svg className="pointer-events-none absolute -right-8 -top-[72px] z-0 h-[300px] w-[min(420px,52vw)] opacity-[0.18]" viewBox="0 0 420 300" fill="none" aria-hidden="true" focusable="false">
          <path d="M28 220c58 52 160 68 230 30 62-34 58-87 0-106-47-15-112 8-152-22-50-37-21-111 52-125 65-13 134 17 178 73" stroke="white" strokeWidth="14" strokeLinecap="round" opacity=".62" />
          <path d="M302 25h68v68M366 31l-88 88" stroke="var(--color-gold)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" opacity=".78" />
        </svg>
        <div className="relative z-[1] inline-flex items-center gap-2 font-[var(--font-display)] text-xl font-extrabold leading-none text-white">
          <SoarLogo />
          <span>SOAR</span>
        </div>
        <div className="relative z-[1] grid min-w-0 max-w-full gap-5 [&_h1]:mb-0 [&_.eyebrow]:mb-0 [&_.hero-note]:mt-0">
          <div className="grid gap-2">
            <p className="eyebrow text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--color-gold)]">Student Organizations and Allied Resources</p>
            <h1>Find your place. Keep things moving.</h1>
          </div>
          <p>
            Discover campus organizations, follow announcements, manage application and meeting progress, and keep six-month access current from one role-aware workspace.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 max-sm:[&>a]:w-full max-sm:[&>button]:w-full">
            <ButtonLink to="/register" variant="primary">{paidFlowEnabled ? 'Start with PHP10 access' : 'Create a free preview account'}</ButtonLink>
            <ButtonLink to="/login" variant="secondary">Sign in</ButtonLink>
          </div>
          <p className="hero-note text-sm text-white/80" role={paidFlowEnabled ? undefined : 'status'}>
            {paidFlowEnabled
              ? 'PHP10 six-month access is required before account creation. Expired accounts can still sign in to renew.'
              : 'Create a free account for this pitch preview. Payment screens are demonstration-only; no checkout or charge is available.'}
          </p>
        </div>
      </div>
    </section>

    <section className="mt-[18px] grid grid-cols-3 items-stretch gap-4 max-lg:grid-cols-1" aria-label="SOAR capabilities">
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
        <RoleBadge kind="officer">Officer workspace</RoleBadge>
        <h2>Keep your organization moving</h2>
        <p>Share updates, coordinate meetings and activities, and handle student requests in one place.</p>
      </Card>
    </section>

    <footer className="mt-6 border-t border-[var(--color-border)] pt-[18px] text-[var(--muted-foreground)]">
      SOAR keeps organization discovery, applications, meetings, and access in one workspace.
    </footer>
  </main>
  );
};
