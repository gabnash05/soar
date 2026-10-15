# SOAR frontend foundation contract

## Implementation choices

- App root: `app/frontend`.
- Framework: React + TypeScript + Vite. This repo had no existing frontend framework, so the lightweight Vite client is the foundation path.
- Routing: `react-router-dom` browser routes with explicit guards.
- Styling: Tailwind CSS v4 plus official shadcn/ui source components. SOAR brand tokens remain in `src/styles/tokens.css`; `src/styles/app.css` is the Tailwind/shadcn entry plus the remaining transition bridge for existing semantic class names while the app finishes utility conversion.
- Runtime services: environment-driven Firebase client initialization plus typed backend gateway interfaces. The browser never stores provider secrets and never calls payment-provider secret APIs.
- Fixture mode: `VITE_SOAR_USE_FIXTURES=true` enables named development fixtures. Fixture mode is opt-in and should not be used as production readiness evidence.

## Shared route contract

Frontend owns public/access/settings routes, the app shell, and workflow route components under `src/pages/workflows` with default exports and no duplicate style system.

| Route | Workflow file | Export | Guard | Purpose |
| --- | --- | --- | --- | --- |
| `/app` | `src/pages/workflows/FeedPage.tsx` | `default function FeedPage()` | active access | announcements/home feed |
| `/app/directory` | `src/pages/workflows/DirectoryPage.tsx` | `default function DirectoryPage()` | active access | searchable organization directory |
| `/app/organizations/:organizationId` | `src/pages/workflows/OrganizationPage.tsx` | `default function OrganizationPage()` | active access | organization profile, recruitment, events, meeting/application entry points |
| `/app/applications` | `src/pages/workflows/ApplicationsPage.tsx` | `default function ApplicationsPage()` | active student access | student application tracker |
| `/app/meetings` | `src/pages/workflows/MeetingsPage.tsx` | `default function MeetingsPage()` | active access | requester meeting tracker |
| `/settings/organization` | `src/pages/settings/OrganizationSettingsPage.tsx` | `default function OrganizationSettingsPage()` | active access + approved organization grant | organization management for approved grants only, including department registered-student aggregate |

Workflow pages now render complete fixture-mode screens and production API loading/error states. Fixture mode is opt-in local sample data; production mode calls configured backend services and does not fall back to fixture success.

## Shared data contracts

Use the shared domain types from `src/lib/contracts.ts`:

- `AccountKind = 'student' | 'sponsor'` (officer is an organization grant on a student account, not an account kind; the temporary aggregate-statistics admin product role has been removed).
- `AccessStatus = 'active' | 'pending' | 'failed' | 'cancelled' | 'expired' | 'revoked' | 'missing'`. Backend entitlement documents use `active | expired | revoked`; checkout-intent responses may additionally use pending/failed/cancelled/missing before an entitlement exists.
- `ApplicationStage = 'Pending' | 'Under review' | 'Accepted' | 'Declined'`.
- `MeetingStatus = 'Pending' | 'Approved' | 'Declined'`.
- `UserSession` includes trusted `access`, optional student `department` / `departmentKey`, and `officerGrants` from backend/auth claims/account docs, not UI toggles. Backend grant status `active` is presented as an approved officer grant in the UI. Access copy uses `periodMonths: 6` / `periodLabel: "6 months"`; any `annualFeePhp` field is only a legacy PHP10 alias.

Workflow pages should consume foundation hooks/components instead of creating a parallel adapter:

- `useAuth()` for trusted session, access, email verification and sign out.
- `useBackendGateway()` for backend calls.
- Shared UI from `src/components/ui`.
- Navigation metadata from `src/router/nav.ts`; route guards/bootstrap live in `src/router/routes.tsx`.

## Backend gateway contract

Shared backend coordination read: `/home/gab/agent-workspace/firstmate/data/soar-identity-foundation/payment-coordination.md` and current revisions contract `/home/gab/agent-workspace/firstmate/data/soar-revisions-api/coordination.md`. Frontend expects backend responses to map identity-owned Firestore records into the `UserSession` shape above: `accounts/{uid}` -> profile fields (including optional student `department`), `entitlements/{uid}` -> `access`, and `organizations/{orgId}/officerGrants/{uid}` -> `officerGrants`. Backend `officerGrants.status: "active"` is rendered as approved officer access.

`src/lib/backendGateway.ts` defines these frontend-facing methods:

- `startRegistrationPayment(input)` creates a payment-before-account registration intent and hosted checkout URL.
- `getCheckoutStatus(intentId)` returns provider-confirmed status from the backend; the client never marks payment successful by itself.
- `registerAccount(input)` calls the backend after confirmed payment; backend/paid-access lanes own idempotent provider-intent handling, Firebase Auth user creation, `accounts/{uid}`, and `entitlements/{uid}` initialization. The frontend may sign in afterward to send/reload email verification, but it does not create production Auth users client-side. This aligns with the backend helper shape `createPaidAccountFromConfirmedRegistration({ email, password, displayName, role, studentId?, department?, companyName?, entitlement }) -> { uid }`; account creation must be recoverable/idempotent across provider and Firebase services, not assumed atomic from a Firestore transaction alone.
- `signIn`, `sendPasswordRecovery`, `reloadSession`, `signOut` manage auth.
- `requestManualRenewal`, `getAccessStatus`, `updateDisplayName`, `requestEmailChange` power access/settings screens.

Production mode requires `VITE_SOAR_API_BASE_URL` and public Firebase config. Missing backend/Firebase configuration surfaces as an unavailable state rather than a false successful login/payment.

Current HTTP paths used by the production identity/payment gateway match the merged backend Express app's bare route mounts. The backend also mounts `/api`-prefixed equivalents; set `VITE_SOAR_API_BASE_URL` accordingly instead of changing client method names.

| Method | Path | Frontend expectation |
| --- | --- | --- |
| `GET` | `/session` | Returns trusted `UserSession` for the current Firebase ID token. |
| `POST` | `/payments/registration/start` | Creates provider checkout for PHP10 six-month registration payment and returns `RegistrationPaymentIntent`; passwords are not sent here. Student registrations must include one canonical `department` from the supported list (`Civil Engineering Department`, `Architecture Department`, `Electrical Engineering Department`, `Computer Engineering Department`, `Mechanical Engineering Department`, `Electronics Engineering Department`, `Geodetic Engineering`); sponsor registrations must not include department. |
| `GET` | `/payments/registration/status?intentId=:intentId` | Returns `CheckoutStatus`; only `status: active` with `canCreateAccount: true` unlocks account creation, and the backend validates its registration-binding cookie. |
| `POST` | `/payments/registration/complete` | Server creates the paid Firebase account from a confirmed registration intent. The merged paid-access handler returns completion metadata (`uid`, `completed`, `accessExpiresAt`); the frontend then signs in and reloads `/session` for trusted profile/access/grant details. |
| `POST` | `/payments/renewals/start` | Creates manual renewal checkout for the signed-in account. |
| `GET` | `/payments/access/status` | Returns signed-in account entitlement/access details. New entitlements use six calendar months; existing stored expiry timestamps are displayed as returned. |
| `POST` | `/account/display-name` | Applies the 30-day display-name cooldown and returns updated `UserSession`. |
| `POST` | `/account/email-change` | Records verified-email-change intent after client reauthentication and verification email dispatch. |

## Workflow backend contract

The production workflow client reads and writes through `VITE_SOAR_API_BASE_URL` using Firebase bearer auth.
It consumes the content lane's organization, announcement, comment, like, media-target and dated-entry paths (`/organizations`, `/announcements`, and `/date-entries`) and the request lane's application and meeting paths under `/requests` (`/requests/applications/confirm`, `/requests/applications/mine`, `/requests/meetings`, `/requests/meetings/document-targets`, `/requests/meetings/:meetingRequestId/document`, `/requests/meetings/mine`, and `/requests/organizations/:orgId/...` officer subroutes).
List responses may be arrays or `{ items, nextPageToken? }`; the UI currently renders the first page with clear loading, empty, error and save-result states.
Application stages preserve the request-service labels `Pending | Under review | Accepted | Declined` and still tolerate older snake/lowercase response values when reading.
Meeting statuses preserve the request-service labels `Pending | Approved | Declined` and still tolerate older lowercase response values when reading. Optional meeting documents are PDF-only metadata in meeting DTOs; download/preview uses the authenticated backend document route, never a Storage `getDownloadURL` bearer link.
Sponsors are excluded from application actions; officer actions are visible only to students with trusted organization grants; expired accounts are locked by the shared route guard. Organization profiles include optional public `contactPhone`, `department`, and `departmentKey`; approved managers can call `/organizations/:orgId/student-department-counts` for the saved organization's registered-student count only. That count is derived from saved student account departments and returns no identities. Announcement DTOs include `deepLinkPath`, `media[]` plus legacy `image`; the media targets support up to four bounded media items, including images and at most one MP4/WebM video, with a 30 MB aggregate limit. Comment DTOs include `viewerCanEdit`/`viewerCanDelete`; own-comment edit/delete use `PATCH`/`DELETE /announcements/:announcementId/comments/:commentId`. Meeting documents are uploaded with authenticated Storage targets and downloaded by authenticated backend streaming; no public bearer URL or direct SDK read is used. Department counts stay aggregate-only within the current manager-only boundary.

## Design-system precedence

Imported source export: `docs/design-system/Soar-Design-System/` excluding Windows `:Zone.Identifier` files.

Canonical visual source precedence for product UI:

1. Approved UX wireframe behavior and final backend decisions for flows/copy/permissions.
2. Customized `soar-design-system-v2.html` and `brand-spec.md` for SOAR colors, typography, spacing, radii, shadows, focus/validation states and responsive breakpoints.
3. Generated token files (`system/tokens.*.json`, `system/variables*.css`) only when they agree with the customized v2 source.
4. Generic `DESIGN.md`, `brand.json`, and `theme.json` Slack purple/branding are retained as export provenance, not product truth.

Canonical tokens extracted for implementation:

- Navy `#1A1851` for hierarchy and shell.
- Campus gold `#FCB315` for the primary action in a decision area.
- Deep blue `#0D4A77` and sky blue `#329DEA` for links, informational status and focus.
- Bright/warm orange `#FF9718` / `#FF6418` for progress, warning and validation attention.
- Surfaces: white cards on off-white `#f8f9fc`, ink `#16162a`, muted `#5d6275`, border `#dfe2ea`.
- Type: display `Avenir Next`, `Segoe UI Variable Display`, `Segoe UI`, sans-serif; body `Segoe UI Variable Text`, `Segoe UI`, Arial, sans-serif.
- Spacing: 8px rhythm, 44px minimum targets, compact 4-8px title/detail gaps, 12-16px control gaps.
- Radii: 6px small, 10px card, 16px feature, pill `999px`.
- Shadows/motion: soft elevation and 160ms state transitions; reduced-motion media query disables transitions.

## Wireframe/export UX conflicts resolved

- Export preview showed generic product examples and some Slack-derived source material; implementation follows SOAR wireframe flows and product copy, not Slack marketing or Open Design preview chrome.
- Officers are not a separate signup persona. UI exposes officer tools only after trusted organization grants on a student account.
- Students/officers require student ID. Sponsors use optional company/organization name and have no application tools.
- PHP10 payment is required before account creation; pending/failed/cancelled states never unlock registration.
- Email verification gates the main app after account creation.
- Expired access locks main workflow routes while keeping recovery, payment/renewal and settings paths available.
- External-form opening is separate from explicit SOAR submission confirmation; workflows must keep confirmation locked until the form is opened/returned and still rely on backend duplicate prevention.
