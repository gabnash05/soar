# SOAR UX flow audit — current route/surface/role inventory

⚠️ DEGRADED: single-context (no sub-agent/Task tool is exposed in this harness; chrome-devtools-axi could not attach to a rendered target, returning `BRIDGE_NOT_READY` for isolated `pages`, `start`, and `newpage` attempts). Assessment A below is source-backed before any deterministic detector findings. Browser/overlay findings are intentionally not claimed.

## Scope, evidence, and method

- Code base: current `origin/main` at `e804bcf` with merged frontend UX and backend/API integration readiness.
- Primary target loaded through Impeccable context: `app/frontend/src/router/routes.tsx`.
- Project product authority: `README.md` PRD; there is no `PRODUCT.md` or `DESIGN.md`, so the incumbent implementation and PRD are the active product/design authority.
- Visual/browser evidence: preview host at `http://127.0.0.1:45655/` responded HTTP 200 and durable site files exist under `/home/gab/agent-workspace/firstmate/data/soar-preview-host/site/`, but chrome-devtools-axi browser attachment is unavailable (`BRIDGE_NOT_READY`). Rendered desktop/mobile inspection remains unverified until the browser bridge target is restored.
- Audit mode: Operate for authenticated app pages; Persuade only for the landing page.
- Roles/access states covered from source: unauthenticated, unverified signed-in, expired/locked access, active student, active sponsor, active officer grant, multiple officer grants, no officer grant, unknown route. A separate owner UI is not present in the current frontend; ownership is represented only as organization-specific officer grants.

## Assessment A — design critique before deterministic findings

### Design specificity verdict

SOAR has a recognizable navy/gold academic service brand, and the flows now encode several important product truths: PHP10 access before account creation, students explicitly confirm external submissions, sponsors do not use application tools, and officers are grant-scoped. The weakness is task topology. Several work pages still default to stacked cards and mixed-purpose pages, so the user has to infer where management, review, and public/member-facing tasks live. Public organization profiles expose manager shortcuts while the dedicated management page hides the daily officer tasks behind long forms and route memory. This creates a product-specific failure: SOAR knows the roles, but the UI makes role boundaries feel like scattered buttons rather than a predictable command model.

### Heuristic scores

| # | Heuristic | Score | Key issue |
|---|---:|---:|---|
| 1 | Visibility of system status | 3 | Loading, empty, success, and error states exist; selected managed organization context is weak outside forms. |
| 2 | Match system / real world | 3 | Terms generally match the PRD; `Manage Organization` vs `View public profile` vs inline review areas blur public vs operational tasks. |
| 3 | User control and freedom | 2 | Users can navigate back, but many primary tasks are buried below scroll or require round-trips to public profiles/settings. |
| 4 | Consistency and standards | 2 | Same card shell is reused for unrelated browsing, reviewing, and editing tasks; CTAs vary by page and sometimes duplicate. |
| 5 | Error prevention | 3 | Duplicate application/meeting prevention and validation exist; destructive deletes use `window.confirm`, and dirty long forms have no guard. |
| 6 | Recognition rather than recall | 2 | Sidebar has a management link in current source, but task surfaces still require remembering which page owns announcements, applicants, meetings, and profile settings. |
| 7 | Flexibility and efficiency | 2 | Multiple grants are supported but not persistently prominent; no compact task switcher or above-the-fold review queue. |
| 8 | Aesthetic and minimalist design | 1 | Repeated/nested card containers dominate app surfaces and make every task look equally important. |
| 9 | Error recovery | 3 | Errors are readable and retryable; recovery is mostly page-level rather than field-level in workflow forms. |
| 10 | Help and documentation | 2 | Empty states and notes explain concepts, but in-task guidance competes with controls instead of being distilled into action bars and summaries. |
| **Total** |  | **23/40** | **Acceptable foundation; major flow architecture correction needed.** |

### Cognitive load findings

- Failed checklist items: single focus, chunking, visual hierarchy, minimal choices, working-memory support, progressive disclosure.
- High-load decision points:
  - Public organization profile for an officer shows member tasks plus management/review navigation, asking the officer to decide among public reading, managing, reviewing applications, reviewing meetings, and directory navigation in one header.
  - Applications page mixes student tracker, officer review, directory navigation, and redundant management navigation.
  - Meetings page mixes request creation, availability browsing, personal statuses, officer decisions, and management navigation.
- Emotional journey:
  - Student/sponsor flows are reassuring once the user reaches the right page.
  - Officer flows start with uncertainty: the app acknowledges grants but does not make the active organization and direct management destination feel dependable.
  - The public profile becomes an emotional valley because officers see more prominent controls there than on the management surface they expected to use.

### Priority issues from source review

1. **[P1] Management route confidence is too fragile.** Officers need a direct, obviously selected organization-management destination from desktop sidebar and mobile nav, with multiple-grant context retained in the URL and UI. Current source has a sidebar link, but the flow still depends on query defaults, weak selected-organization visibility, and public-profile backdoors.
2. **[P1] Public profile acts like a control hub.** Manager-only CTAs (`Manage organization`, `Review applications`, `Review meetings`) are exposed in the public profile header, making the member-facing page appear more powerful than the management page.
3. **[P1] Organization imagery is underpowered.** Directory and profiles show a small avatar/logo; the PRD asks for properly sized images, and the user explicitly wants the organization picture/identity to be the bigger visual element. Existing assets are only logo URLs, so the fix must enlarge logo/identity treatment without inventing cover-photo fields.
4. **[P1] Applications page has unrelated navigation clutter.** `Find organizations` belongs for students, but `Manage organization` is redundant for officers and distracts from applicant review/tracker tasks. Officer review belongs there, but organization management does not.
5. **[P2] Card-heavy scaffolding hides primary actions.** Cards are used as the default container for search, profile summary, recruitment, forms, lists, notices, and review sections. This produces scroll-heavy pages where primary tasks are visually boxed like secondary content.
6. **[P2] Long inline forms force scroll-to-task.** Profile/recruitment editing, announcement creation, date entry editing, and meeting requests are long inline flows. Modal intent is unresolved, so this audit records the problem but holds modal-dependent interaction changes pending the captain answer.

### Persona red flags

- **Alex, officer power user:** Must remember whether profile settings, announcement posting, applicant review, and meeting decisions live on Settings, Announcements, Applications, Meetings, or the public profile. The fastest path is not obvious when multiple grants exist.
- **Jordan, first-time student/sponsor:** Public profile manager controls (when applicable) mix with member tasks. The distinction between applying, requesting a meeting, and officer review depends on reading explanatory notes.
- **Sam, accessibility-dependent user:** Core controls are semantic and labeled, but repeated card sections create a long heading/form/list sequence. Mobile bottom nav currently truncates to five links plus `More`, which can hide lower-priority settings from direct recognition.
- **Casey, mobile user:** Primary actions often sit at the top while long inline forms/lists push feedback down. Scrolling is required to find table/list results after taking actions.

## Current route and surface inventory

Legend for click/scroll cost: `0` = already visible at arrival, `1` = one primary click/tap, `2+` = multi-step/round-trip, `scroll` = primary task can require scrolling on typical laptop/mobile. "After" will be updated after implementation.

| Route / surface | Applicable roles and access states | Arrival / navigation path | Top task | Current available actions | Expected vs observed | Current cost | Meaningful states | Before evidence / defect | After evidence |
|---|---|---|---|---|---|---:|---|---|---|
| `/` Entry landing | Unauthenticated only; active/verified users redirect to `/app`; unverified to verify; locked to access settings | Direct URL, public-only guard | Understand SOAR and start/sign in | Start PHP10 access, sign in, password recovery link | Persuade surface is acceptable and brand-aligned; cards below hero are okay for marketing | 0-1 | Public redirect, static explanatory content | Clear role copy; no workflow defect found | Pending |
| `/login` | Unauthenticated; redirects active verified users; fixture demo hints | Public nav, recovery/register links, protected-route redirect | Sign in and return to intended page | Email/password submit, recovery, create account | Expected: entry/recovery available during access expiry. Observed: correct route branching after sign-in | 0-1 | Error alert, submitting disabled, demo mode notice | Fixture accounts exposed for demo; okay in fixture mode | Pending |
| `/recovery` | Public, including expired users | Landing/login links | Request password reset | Email submit, back to sign in | Expected and observed: simple recovery remains accessible | 0 | Sent status, error alert, submitting | No major issue | Pending |
| `/register` Registration intent | Public only | Landing CTA | Start payment before account creation | Account type, name, email, student ID or company, checkout | Expected: no officer signup role. Observed: correct explanatory notice | 0-1 | Local validation, backend error, demo checkout warning | Good role truth; card split acceptable for auth flow | Pending |
| `/access/checkout` | Public only, post-checkout; missing intent state | Hosted checkout return or direct URL | Confirm payment and create password/account | Status read, start over, sign in, password/confirm, create account | Expected and observed: account creation locked until provider/fixture confirmation | 0-1 | Loading, missing intent, pending/confirmed/failed, validation | No major flow issue | Pending |
| `/access/verify-email` | Signed-in only; unverified primary; verified routes forward by button reload | Post-registration or sign-in | Verify email, reload status, resend, sign out | Reload, resend, sign out | Expected and observed: email verification before app unlock | 0 | Waiting/verified chip, success/error | No major flow issue | Pending |
| `/settings/access` | Signed-in active/expired/pending; in shell with locked main allowed | Sidebar/topbar redirect from access guard | View annual access and renew if needed | Renew, go to app when active, view access details | Expected: renewal remains available while main app locked. Observed: correct | 0-1 | Success/error, active/locked, renewal disabled when unavailable | Cards okay but task page could use less boxed layout; lower priority | Pending |
| `/settings/account` | Signed-in active/expired/unverified; shell allowed | Sidebar Settings, `More`, direct | Manage personal profile/email and see org grants | Save name, send email verification, grant list with management links | Expected: account settings plus permission awareness. Observed: grant row has Manage Organization link; useful as secondary, not primary | 0-scroll | Success/error, disabled current email, no grants | Duplicate management entry acceptable as account permission context, but should not be only path | Pending |
| `/settings/organization` | Verified + active + approved/active officer grant only | Current desktop sidebar `Manage Organization`; mobile bottom nav if in first five; query `organizationId` can select grant | Manage public organization profile, recruitment, logo, and dated entries | Save profile, View public profile, org picker for multi-grants, profile/recruitment form, date entry form/list edit/remove | Expected: primary officer management destination. Observed: destination exists in source but arrival is a long card/form stack; active org context is small; public profile still offers management/review CTAs, making this page feel secondary | 0 then scroll | Loading, no grants, unavailable dashboard, source notice, logo validation, save/delete result | Key defect: management tasks are direct but not visually/directly dominant; selected organization not persistent enough; multiple grants depend on query and picker | Pending |
| `/app` Announcements feed | Active verified student/sponsor/officer | Sidebar/bottom nav/default app | Read posts; officers publish announcements | Browse orgs, Post announcement for officers, composer, like/comment | Expected: announcement creation belongs here. Observed: correct owner surface, but composer is an inline card and adds scroll | 0-1 + scroll | Loading, empty feed, error retry, comment validation, like status, source notice | Keep creation here; hold modal/open-form choice pending modal intent | Pending |
| `/app/directory` Directory | Active verified student/sponsor/officer | Sidebar/bottom nav, browse CTA | Find organizations and open profile | Search, result links, view profile | Expected: show name/logo/description. Observed: logo is tiny avatar in card; search is boxed; cards repeat | 0-1 | Loading, no organizations, no search results, error retry | Key defect: imagery/logo is not prominent; repeated cards make browsing feel generic | Pending |
| `/app/organizations/:organizationId` Public organization profile | Active verified student/sponsor/officer; manager sees extra CTAs in current source | Directory/result/profile links; feed author links; management `View public profile` | Read organization details, apply/request meetings/read dates/posts | Public/member: external application confirmation, sponsor meeting link, dates, posts; manager: Manage organization, Review applications, Review meetings, Back to directory | Expected: public/member-facing view with member tasks. Observed: manager's public profile header becomes a backdoor control center and offers more controls than management arrival | 0-scroll | Loading, not found, source notice, sponsor application hidden, application confirmation locked, empty posts/dates | Key defect: public profile should not expose fuller control panel; imagery only small avatar | Pending |
| `/app/applications` Student tracker + officer review | Route guard requires student account; sponsors get guard state before page; officers are student accounts with grants | Sidebar/bottom nav, organization profile apply guidance | Student: track application stages. Officer: review applicants for selected grant | Find organizations, Manage organization (if grant), officer review picker/table, tracker table | Expected: focused application/review hierarchy. Observed: redundant Manage Organization CTA; officer review injected before student tracker with cards; student/officer tasks compete | 0-scroll | Loading, no tracker rows, sponsor branch in component but route guard catches sponsors, stage update result | Key defect: remove Manage Organization CTA and focus on applicant review/tracker | Pending |
| `/app/meetings` Meeting request/tracker + officer review | Active verified student/sponsor/officer | Sidebar/bottom nav; sponsor public profile meeting CTA | Request meeting, track status; officers decide requests | Manage organization CTA if grant, officer review, request form, availability list, statuses table | Expected: meeting request/review belongs here. Observed: redundant management CTA; page mixes five sections, but core task is valid | 0-scroll | Loading, duplicate request error, no availability, no requests, status meanings, decision results | Remove unrelated management CTA; potentially add task anchor/action bar | Pending |
| `*` Not found | Any state, outside protected shell | Bad URL | Recover to SOAR | Return to `/app` | Expected: route recovery. Observed: simple state block | 0 | Static not-found | No issue | Pending |
| Sidebar shell | Signed-in states; filters by student/officer/access | App/settings shell | Navigate role-appropriate app/settings sections | Announcements, Organizations, Manage Organization (officer), Applications (student), Meetings, Payment & access, Settings, sign out | Expected: direct management access for officers. Observed in source: link exists; possible user symptom likely from stale build/viewport/query/context or because management page felt weaker than public profile. Needs regression coverage and stronger destination/context | 0 | Email/access alerts, active link, grant card, fixture chip | Diagnostic target for direct officer management | Pending |
| Mobile drawer/bottom nav | Same signed-in states, breakpoint CSS | Menu button and bottom nav first 5 links | Navigate on mobile | Drawer has all filtered links; bottom nav slices first five and adds More | Expected: equivalent discoverable mobile management destination. Observed: for officers current ordering places Manage in first five; settings/access can require More/drawer | 0-1 | Drawer open/scrim, active links | Need regression that Manage is in mobile/direct nav for officer; do not rely solely on desktop test | Pending |

## Current cross-flow defects, separated from hypotheses

### Observed from source

- Public profile header exposes manager-only management/review CTAs, creating a backdoor control center.
- Directory and profile identity treatment use `OrganizationAvatar` at 52-72px; no large logo/identity area exists despite real logo URL support.
- Applications header includes a `Manage organization` CTA for officers, unrelated to applicant review/tracker work.
- Meetings header similarly includes unrelated management navigation.
- Management page contains the right profile/recruitment/logo/date controls but is long, card-heavy, and less task-legible than the public profile header shortcuts.
- Repeated `Card` containers are the default architecture across workflow pages, creating flat importance and scroll cost.
- Officer multiple-grant selection exists but is local to each page; the chosen organization context is not communicated in the shell/top action model and is easy to lose when moving between tasks.

### Hypotheses to test / not yet visually verified

- The captain's "not on the sidebar" symptom may be from a stale preview/deploy, a cached build, a mobile viewport where the user relied on bottom nav instead of the drawer, a user without active/approved grant status, or the direct management page feeling hidden because the public profile had more visible controls. Source currently includes a sidebar link, so implementation must strengthen and test the real task path rather than only add another button.
- Visual density and image prominence need rendered desktop/mobile confirmation once chrome-devtools-axi is restored.
- Modal-dependent changes are held pending `soar-modal-intent`; long inline forms are recorded as a defect, but this audit does not assume every task should become a dialog.

## Diagnostic reasoning plan for the management complaint

1. Reproduce with fixture officer sign-in path in testable UI code: sign in as `officer@example.edu`, land in shell, inspect role-filtered sidebar and mobile nav for direct `/settings/organization` destination.
2. Compare direct navigation to `/settings/organization?organizationId=robotics` against arriving via `/app/organizations/robotics` → `View public profile`/manager controls.
3. Counterfactual grants: no grants, one approved/active grant, multiple grants, inactive/expired access, sponsor account.
4. Distinguish symptom causes: link hidden by role/access filters vs stale build vs viewport discovery vs management page not feeling like the primary control center.
5. Add regression coverage for direct desktop/mobile management discoverability, retained query-selected organization context, unauthorized/no-grant denial, and absence of public-profile control hub.

## Deterministic findings after implementation

- Impeccable detector: `/home/gab/.pi/agent/skills/impeccable/scripts/impeccable detect --json app/frontend/src` exited `0` with `[]` findings. Saved to `/home/gab/agent-workspace/firstmate/data/soar-ux-flows/impeccable-detect.json`.
- Source-level test reproduction before fixes showed the desktop sidebar link existed in source, but only as `/settings/organization` without retained organization query context; the public profile exposed the more prominent management/review controls, explaining why the user could experience public view as the richer control surface.
- Pertinent history: `1095056` introduced organization management/sidebar/profile changes; `203397e` adjusted organization settings. The user complaint likely reflects the combination of stale preview/user viewport plus weak management-page task hierarchy rather than a single missing route constant.

## Diagnostic-reasoning result for management navigation

- Initiating action/context: officer account with approved/active grant signs in and expects the desktop sidebar/mobile nav to contain the management destination.
- Masking conditions separated:
  - **Role/grant**: no-grant and sponsor accounts correctly do not see management.
  - **Access**: expired/locked access filters main app destinations; access settings remains available.
  - **Viewport**: mobile has drawer plus bottom nav; regression now checks the bottom `Manage` destination for officers.
  - **Stale build/browser**: source had a sidebar link, but the durable preview had older hashed assets before publication; the new fixture preview points to `index-B46xzNiU.js` and `index-jwqKumca.css`.
  - **Task topology**: public profiles formerly exposed `Manage organization`, `Review applications`, and `Review meetings`, making them feel more capable than `/settings/organization`.
- Smallest counterfactual test: an officer grant session now sees desktop `Manage Organization`, mobile `Manage`, and grant-card `Manage this organization` all linking directly to `/settings/organization?organizationId=<grant>`. Sponsors do not see the link. Public organization profiles for managers no longer show management/review links.
- Backend enforcement remains unchanged: `getOfficerDashboard` and mutations still require organization-specific approved/active grants through the workflow data client/API; UI navigation is discoverability, not authorization.

## After implementation evidence by surface

| Surface / flow | After change | Evidence |
|---|---|---|
| Desktop sidebar officer management | Direct `Manage Organization` link now resolves to `/settings/organization?organizationId=<first approved grant>` instead of a contextless settings route. Officer grant card adds a direct management link. | `AppShell.test.tsx` asserts sidebar, bottom nav, and grant-card hrefs. |
| Mobile management discovery | Bottom nav short `Manage` resolves to the same retained management route for officers; drawer uses the same resolver. | `AppShell.test.tsx` checks the mobile/bottom `Manage` href. |
| Multiple-grant management | Management page writes/retains `organizationId` in query params and shows `Managing <org>` in the hero action area. Switching organization updates query and form context. | `workflowPages.test.tsx` renders `/settings/organization?organizationId=robotics`, switches to Literary Circle, and verifies form data changes. |
| Public organization profile | Removed manager-only `Manage organization`, `Review applications`, and `Review meetings` CTAs. Kept member-facing actions: request meeting, external form confirmation, dates, announcements, and a small manager badge. | `workflowPages.test.tsx` asserts public manager profile lacks management/review links but keeps `Request meeting`. |
| Directory imagery | Directory results now include a large identity/logo area using `OrganizationIdentityArt` with real `logoUrl` when available and fallback initials otherwise. | `workflowPages.test.tsx` checks prominent `RG` identity fallback; CSS uses `object-fit: contain` for logos. |
| Public profile imagery | Public profile now has a large organization identity hero alongside summary/contact details; logos are not cropped. | `workflowPages.test.tsx` checks `.profile-identity-art`; CSS uses large responsive identity art. |
| Organization management imagery/context | Management page now starts with a large selected-organization identity hero and explicit management context before forms. | `OrganizationSettingsView` implementation and tests. |
| Applications page | Removed unrelated `Manage organization` CTA. Header focuses on `Find organizations`; officer review remains in-page and scoped to selected grant. | `workflowPages.test.tsx` asserts no Manage Organization link and stage update still works. |
| Meetings page | Removed unrelated management CTA. Meeting request creation moved to an accessible modal triggered from the first viewport/action bar; availability and statuses remain readable on page. | `workflowPages.test.tsx` opens request dialog, verifies duplicate handling and Pending status meanings. |
| Announcements page | Announcement creation moved to an accessible modal on the Announcements surface with organization selector for multi-grant officers; feed remains readable. | `workflowPages.test.tsx` posts announcement through modal and verifies success + new post. |
| Date entries | Organization-management date entry add/edit moved into an accessible modal; list remains visible with edit/remove actions. | Covered by typecheck/build and component structure; no separate interaction test beyond modal infrastructure due time. |
| Dialog interaction safety | Native `<dialog>` component provides labelled dialog, initial focus, Escape/cancel handling, dirty close confirmation, focus return, and mobile max-height. | `workflowPages.test.tsx` covers dirty announcement close and focus return. |
| Card-heavy scaffolding | Workflow pages now use `surface-section`, identity hero, unboxed feed items, focused action bars, and tables/lists instead of `Card`/`CardHeader` as default workflow architecture. Auth/settings utility pages still use cards where they are contained forms. | `rg "Card|CardHeader" app/frontend/src/pages/workflows` shows no Card component use in workflow surfaces besides the `AnnouncementCard` component name (now an unboxed article). |

## Rendered/browser verification limitations

- `chrome-devtools-axi` help was available, but task-owned sessions returned `BRIDGE_NOT_READY` for `pages`, `start`, and `newpage http://127.0.0.1:45655/`. No rendered desktop/mobile screenshots or visual overlays are claimed.
- HTTP preview verification succeeded: `http://127.0.0.1:45655/` returned 200 and references the new fixture assets; CSS and JS asset URLs returned 200.
- Source/HTTP tests are not a substitute for rendered visual inspection. A browser bridge restoration is still needed for visual sign-off.

## Verification run record

- `npm --prefix app/frontend run typecheck` — passed.
- `npm --prefix app/frontend test` — 5 files, 22 tests passed.
- `npm --prefix app/frontend run build` — passed with existing >500 kB chunk warning.
- `VITE_SOAR_USE_FIXTURES=true npm --prefix app/frontend run build` — passed and produced preview assets `index-B46xzNiU.js` / `index-jwqKumca.css`.
- Durable preview publication: copied new hashed assets first, atomically replaced `index.html` last, retained old assets, verified HTTP index/JS/CSS.

## Continuation preview restoration proof

- At continuation, `curl http://127.0.0.1:45655/` failed with connection refused and `ss -ltnp sport=:45655` showed no listener.
- Restored the task-owned durable preview host from `/home/gab/agent-workspace/firstmate/data/soar-preview-host/site` using a fully detached Python process with `stdin=DEVNULL`, `start_new_session=True`, loopback bind only.
- Restored host evidence: PID=17690, PGID=17690, SID=17690, cwd `/home/gab/agent-workspace/firstmate/data/soar-preview-host/site`, stop evidence `kill -- -17690`, log `/home/gab/agent-workspace/firstmate/data/soar-ux-flows/preview-45655.log`.
- Verified preview URL `http://127.0.0.1:45655/` returns HTTP 200 and references this revision's fixture assets: `/assets/index-B46xzNiU.js` and `/assets/index-jwqKumca.css`; both returned HTTP 200.
- Re-attempted chrome-devtools-axi after preview restoration with isolated session `soar-ux-flows-restored`; it still returned `BRIDGE_NOT_READY`. Required external action for rendered verification: restore/fix the Chrome DevTools target/bridge so chrome-devtools-axi can attach. The HTTP preview itself is working.

## Durable proof files

- Audit and flow inventory: `flow-audit.md` in repo and copy under `/home/gab/agent-workspace/firstmate/data/soar-ux-flows/` at handoff.
- Flow architecture and correction plan: `design-decisions.md` in repo and copy under `/home/gab/agent-workspace/firstmate/data/soar-ux-flows/` at handoff.
- Validation log: `/home/gab/agent-workspace/firstmate/data/soar-ux-flows/frontend-validation.log`.
- Impeccable detector JSON: `/home/gab/agent-workspace/firstmate/data/soar-ux-flows/impeccable-detect.json`.
- Browser attempt log: `/home/gab/agent-workspace/firstmate/data/soar-ux-flows/chrome-devtools-axi-restored-attempt.log`.
- Preview host PID/stop evidence: `/home/gab/agent-workspace/firstmate/data/soar-ux-flows/preview-45655.pid`.
