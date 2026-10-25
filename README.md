# SOAR

SOAR (Student Organizations and Allied Resources) is a React/Vite application with a Firebase-backed Express API. This README is the starting point for source-code handoff, local setup, environment configuration, checks, and deployment. The product requirements are retained below the setup guide.

## Source code and provider access

- Repository: <https://github.com/gabnash05/soar>; use the latest approved `main` revision.
- Firebase / Google Cloud: project `soar-a711e`, for Hosting, Authentication, and Firestore.
- Render: the standalone backend web service for the hosted preview.
- Supabase: the private `soar-files` bucket used by that backend.
- PayMongo: the payment integration; the existing merchant account is personally linked to the developer. Record the receiving owner's payment-account arrangement separately before enabling payments.

The recipient needs repository access and appropriate project/service access for each provider. Account passwords, service-account JSON, Supabase service-role keys, PayMongo secrets, and recovery codes are supplied privately; they do not belong in GitHub or frontend configuration. Copying the code does not transfer provider ownership, billing, data, or a personal merchant account.

## Prerequisites and installation

For the sample-data frontend, install Git and Node.js 22 (npm is included with Node.js). Check them in a terminal with `git --version`, `node --version`, and `npm --version`; Node should report `v22.x`. Integrated local development additionally requires Bash (WSL is suitable on Windows), Java 21, and Firebase emulator downloads. You do not need Java or emulator downloads for the frontend-only setup.

Open a terminal in the folder where you keep projects, then clone the repository and install dependencies. `npm ci` installs the exact versions recorded in each lockfile; run it once at the repository root and once in `app/frontend`:

```bash
git clone https://github.com/gabnash05/soar.git
cd soar
npm ci
cd app/frontend
npm ci
```

Keep using the same terminal environment for installation and commands, especially when using WSL. The root npm workspace contains `app/backend`; frontend commands must be run from `app/frontend`. For an existing clone, first go to its repository root and check `git status`; preserve local changes before updating, then use `git switch main` and `git pull --ff-only origin main` only when the branch can fast-forward.

## Run the frontend with sample data

This is the quickest local option and uses built-in sample records; it does not start the API or contact provider services. In a terminal, change to the frontend folder (`cd app/frontend` from the repository root). Copy the checked-in example configuration to the ignored local file: use `cp .env.example .env.local` in Bash, or `Copy-Item .env.example .env.local` in PowerShell. Open `app/frontend/.env.local` in a text editor and set:

```dotenv
VITE_SOAR_USE_FIXTURES=true
VITE_SOAR_PAYMENTS_ENABLED=false
```

Save the file, then run this command in the same `app/frontend` terminal:

```bash
npm run dev -- --host 127.0.0.1
```

Leave the terminal running and open the local URL Vite prints (normally `http://127.0.0.1:5173`). The page should load with sample data. Stop the server with Ctrl-C.

## Run the integrated local application

This optional setup runs the frontend with local Firebase emulators instead of sample data. It requires Bash/WSL, Java 21, and emulator downloads. Emulator services are local substitutes for Firebase services; use the isolated project name `demo-soar-local`, not the hosted project. Do not use the root `test:rules` script for this local path because it explicitly names the hosted project.

In Bash/WSL, from the repository root:

```bash
npx firebase setup:emulators:firestore
export SOAR_APP_BASE_URL=http://localhost:5173
npm --workspace app/backend run emulators:start
```

Keep that terminal running. The helper requires Java 21 and uses Auth `127.0.0.1:19099`, Firestore `127.0.0.1:18080`, Storage `127.0.0.1:19199`, and Functions `127.0.0.1:15001`. Stop it with Ctrl-C.

In a second Bash/WSL terminal, from the repository root, seed the local demo:

```bash
GCLOUD_PROJECT=demo-soar-local \
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099 \
npm --workspace app/backend run emulators:seed
```

The seed creates synthetic student, sponsor, owner, and officer records with simulated access. Obtain test credentials privately. It does not provision an Admin; the trusted emulator-only Admin procedure is in [the backend README](app/backend/README.md#trusted-admin-provisioning).

Set `app/frontend/.env.local` to:

```dotenv
VITE_SOAR_USE_FIXTURES=false
VITE_SOAR_PAYMENTS_ENABLED=false
VITE_SOAR_STORAGE_PROVIDER=firebase
VITE_SOAR_API_BASE_URL=http://127.0.0.1:15001/demo-soar-local/asia-southeast1/api
VITE_FIREBASE_API_KEY=demo-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-soar-local.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-soar-local
VITE_FIREBASE_STORAGE_BUCKET=demo-soar-local.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:demosoarlocal
VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099
VITE_FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:19199
```

Start the frontend at the exact `SOAR_APP_BASE_URL` origin, or export a different origin before starting the helper and match it in the browser. The API uses an exact origin allowlist. Run `npm run dev -- --host 127.0.0.1` inside `app/frontend` and open `http://localhost:5173` with the configuration above. Health endpoint: `http://127.0.0.1:15001/demo-soar-local/asia-southeast1/api/health`.

## Hosted setup: Firebase + Render + Supabase

This section describes the checked-in hosted preview path. Confirm the actual service names, URLs, access, quotas, and existing media with the account owner. A local build does not verify a hosted deployment.

1. **Firebase:** obtain access to project `soar-a711e`, its existing web app configuration, Email/Password Authentication, Firestore, and Hosting site. Confirm the frontend host is permitted by Authentication's authorized domains. Arrange an approved Firebase Admin runtime identity for Render, scoped to this project. Never place it in a `VITE_` variable.
2. **Supabase:** obtain the project URL and backend-only service-role key. Use a private bucket named `soar-files` (or keep `SOAR_FILES_BUCKET` consistent with the selected private bucket). Permit the supported image types and `application/pdf`, and confirm browser upload/CORS behavior for the exact frontend origin. SOAR limits images to 5 MiB and meeting PDFs to 10 MiB. Existing Firebase Storage objects need a separate inventory/migration decision.
3. **Render:** connect the GitHub repository and select the approved branch. Set service root `app/backend`, build command `npm ci && npm run build`, start command `npm start`, and health-check path `/health`. The backend declares Node 22 and binds Render's `PORT`. Enter the server configuration below through the service environment settings.
4. **Frontend:** set the hosted build configuration below in the ignored `app/frontend/.env.local` or your private build environment. Remove Auth/Storage emulator hosts, build in `app/frontend`, then deploy from the repository root using the Hosting command below.
5. **Verify:** check API health, sign-in/email verification, role access, saved records after refresh, and authorized image/PDF upload and retrieval. Confirm the recipient can access the provider dashboards. Do not report handoff completion until those access checks are done.

### Render server configuration

| Variable | Required value or source |
| --- | --- |
| `GCLOUD_PROJECT` | `soar-a711e` |
| `SOAR_APP_BASE_URL` | Exact frontend origin, currently configured as `https://soar-a711e.web.app` in the preview guidance |
| `SOAR_FIREBASE_WEB_API_KEY` | Existing Firebase web app API key |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Approved Firebase Admin JSON, injected privately; its project must match |
| `SOAR_STORAGE_PROVIDER` | `supabase` |
| `SUPABASE_URL` | Supabase project's HTTPS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-only secret |
| `SOAR_FILES_BUCKET` | `soar-files` |
| `SOAR_DISABLE_PAYMENTS` | `true` for the unpaid preview |
| `PORT` | Supplied by Render |

Do not configure emulator hosts on Render. The standalone listener does not load a local `.env` file automatically; inject runtime variables through the host (or the process environment for a local standalone run).

### Hosted frontend build configuration

```dotenv
VITE_SOAR_USE_FIXTURES=false
VITE_SOAR_PAYMENTS_ENABLED=false
VITE_SOAR_STORAGE_PROVIDER=supabase
VITE_SOAR_API_BASE_URL=https://<render-service>.onrender.com
VITE_FIREBASE_API_KEY=<existing-public-web-config>
VITE_FIREBASE_AUTH_DOMAIN=<existing-public-web-config>
VITE_FIREBASE_PROJECT_ID=soar-a711e
VITE_FIREBASE_STORAGE_BUCKET=<existing-public-web-config>
VITE_FIREBASE_MESSAGING_SENDER_ID=<existing-public-web-config>
VITE_FIREBASE_APP_ID=<existing-public-web-config>
```

All `VITE_` values are included in the browser build. Firebase web identifiers are public configuration; Admin JSON, Supabase service-role keys, and payment secrets must remain on the server. Frontend environment changes require a rebuild.

```bash
# From app/frontend:
npm run build
# Then from the repository root, with authorized Firebase deployment access:
npx firebase login
npx firebase deploy --project soar-a711e --only hosting
```

`firebase.json` publishes `app/frontend/dist` with SPA rewrites. Firestore rules/index changes are separate deployments (`--only firestore:rules,firestore:indexes`) and require review before applying them to existing data. The Render/Supabase path does not require deploying Firebase Functions or migrating stored files. The optional Functions runtime remains in source; coordinate its billing, runtime secrets, and Storage configuration separately if choosing it instead of Render.

## Payment configuration and ownership

The PayMongo merchant-account arrangement is pending because the existing account is personal to the developer. Settle that arrangement before transferring secrets or enabling payments. New checkouts use Hosted Checkout Sessions v2 with QR Ph. The integration needs backend-only `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, and `PAYMENT_SECRET_PEPPER`, plus the correct `PAYMONGO_EXPECTED_LIVEMODE`. Use `PAYMENT_SECURE_COOKIES=true` for deployed HTTPS.

The webhook handler is `POST /api/webhooks/paymongo` on the API origin and expects signed `checkout_session.payment.paid` events. Confirm the route and test/live lane against [the payment integration guide](docs/backend/payments.md). Keep `SOAR_DISABLE_PAYMENTS=true` and `VITE_SOAR_PAYMENTS_ENABLED=false` for the unpaid preview. The authenticated Admin payment policy is an additional requirement; keys or deployment flags alone do not enable charging. A live-mode policy activation also records the one-time existing-account access window, so review that behavior before activating it.

Merchant activation, signed public webhook delivery, and live payment readiness are separate checks. Use only an approved test-mode `test_url` simulation; do not scan/pay a QR Ph test QR. Any live charge or activation requires the owner's separate authorization.

## Checks and maintenance

```bash
# Repository root (backend):
npm run typecheck
npm test
# Frontend:
cd app/frontend
npm run typecheck
npm test
npm run build
```

For emulator security-rules checks and detailed Admin setup, use [app/backend/README.md](app/backend/README.md). Component references: [frontend README](app/frontend/README.md), [payment integration](docs/backend/payments.md), [identity](docs/backend/identity-foundation.md), [content](docs/backend/content.md), and [requests](docs/backend/requests.md). The `.env.example` files enumerate configuration names; replace placeholders privately and use the explicit local/hosted values above for the selected runtime.

After code changes, run the relevant checks, deploy the backend through Render and rebuild/redeploy the frontend when affected, then verify the hosted workflow. Keep provider ownership, recipient access, secret locations, and the PayMongo arrangement in the private accounts-and-code handoff document.

---


# SOAR Product Requirements Document

**SOAR** means **Student Organizations and Allied Resources**. This repository is currently the planning/intake repository for a client application revision. This README is the product requirements document (PRD) for alignment before any frontend, backend, framework migration, or deployment work starts.

## Document status and source authority

- **Status:** PRD v2 plus in-progress MVP implementation. React frontend and Firebase/Express backend foundations now live under `app/` while this README remains the product-requirements authority.
- **Primary agreement:** the client-approved `docs/client-scope/Project Scope and Acceptance — Final.pdf` defines the feature boundaries, acceptance checks, exclusions, required inputs, and handover expectations.
- **Confirmed amendments:** the later approved decisions recorded for this PRD supersede the PDF and supplied overview only where they conflict. Most notably, access is now **PHP10 per account for six months**, replacing earlier PHP2/annual references. Payment implementation now uses PayMongo Hosted Checkout Sessions v2 with QR Ph only for new sessions and a persisted global trusted-Admin payment requirement switch; see `docs/backend/payments.md` and the current task handoff for operational status.
- **Supporting context:** `docs/client-scope/SOAR-project-overview.md` explains product direction, delivery context, and summarized workflows as originally supplied. The supplied `docs/client-scope/TECHNO/` source folder is evidence of the current draft, not the final requirement set.
- **Reference quality bar:** the classmate site at <https://unsaysud-antech-ustpcdocafeteria.ai.studio/> is a minimum UI/UX quality reference, not an expansion of SOAR scope. `chrome-devtools-axi` was available but could not attach to a live browser target in this environment, so no specific visual observations from that site are encoded here.

The supplied PDF, overview, and client source draft are now committed with explicit publication authorization. Do not commit account credentials, service-account keys, private secrets, cache/build artifacts, or Windows `:Zone.Identifier` metadata. Required secrets should be shared privately through service invitations or secure channels.

## Product purpose

SOAR is a hosted website that centralizes campus organization discovery, announcements, recruitment information, application progress, dated events, and meeting/interview requests.

The intended outcome is a working application that can be demonstrated and used with real users and paying accounts. Students, sponsors, and organization officers should be able to discover organizations and track the interactions appropriate to their roles. Organization officers should be able to keep their organization information current and manage the operational workflows described in the agreed scope.

## Success definition

SOAR is successful when the delivered hosted website:

1. Lets users register, sign in, recover passwords, manage allowed account settings, and access only role-appropriate pages.
2. Applies the trusted Admin’s global payment requirement to new registrations/manual renewals; when payment is required, only signed provider confirmation unlocks the paid account. Explicit unpaid-preview behavior remains a separate no-payment mode, and existing-account grandfathering is not inferred from fake provider history.
3. Shows a responsive, readable organization directory, organization profiles, announcements, application tracker, meeting tracker, settings, and officer dashboard on phones and computers.
4. Persists organization data, announcements, images, applications, meeting requests, payment/access status, and role permissions across refresh, sign-out, and another device.
5. Keeps private application, meeting, and payment records visible only to the correct accounts, with officers limited to the organization they are approved to manage.
6. Meets every acceptance check in the final scope as amended and is handed over with the hosted link, updated source files, and short setup/use instructions.

## Users and roles

| Role | Agreed purpose | Registration details | Core access |
| --- | --- | --- | --- |
| Student | Discover organizations, read announcements, follow application instructions, confirm external-form submission, track application stages, request meetings/interviews, and manage allowed personal settings. | Name, email, password, student ID number, and one supported department selected from the canonical list, plus email verification and confirmed six-month payment before account creation. | Announcements, organization directory/profiles, application tracker, meeting tracker, personal account settings, payment/access status. |
| Organization officer | Manage an approved organization and its operational workflows. Officers are also students for account-identification purposes. | Name, email, password, student ID number, and one supported department selected from the canonical list, plus email verification, confirmed six-month payment before account creation, and officer access approved through the organization-owner process. | Officer dashboard, organization settings, recruitment settings, announcements, applicants, calendar/date entries, meeting requests, personal account settings, payment/access status. |
| Sponsor | Outside-user role with no special sponsor-only tools. Sponsors can view organization information and request meetings through an account. | Name, email, password, email verification, optional company/organization name, and confirmed six-month payment before account creation. No TIN or government ID is required by the confirmed scope. | Role-appropriate browsing, organization profiles, announcements, meeting requests/tracking, personal account settings, payment/access status. |

### Organization ownership and officer access

- A project administrator assigns each organization's initial owner.
- The initial owner approves officer access for that organization.
- This is a controlled setup/approval workflow only. It is not a general admin dashboard, membership-management system, or sponsor tooling.
- There is no initial proof-of-election/proof-upload requirement in the confirmed scope.

### Personal-account vs organization settings

- **Personal-account settings** manage the signed-in user's own allowed account details, such as name-change limits and verified email changes.
- **Organization settings** manage the organization's public profile, logo, contact email, recruitment information, application link, announcements, calendar/date entries, and meeting requests.
- Officers need both settings areas; students and sponsors need only personal-account settings plus payment/access status.

## Agreed product scope

### 1. Layout and design

- Redesign login, registration, directory, organization profiles, announcement feed, trackers, settings, and officer pages for phone and computer use.
- Use readable colors, consistent headings, clear buttons, deliberate spacing, properly sized images, and forms/tables that fit the screen.
- Wide tables must be usable on phones without cutting off actions.
- Include small button/page transitions and clear loading, empty, and error states.

### 2. Accounts, roles, and settings

- Keep student, organization-officer, and sponsor accounts.
- Registration collects only the confirmed details for each role:
  - students and officers: name, email, password, student ID number, and one canonical department selected from the supported list
  - sponsors: name, email, password, optional company/organization name
- Users can sign in, sign out, and recover passwords through email.
- Email verification is required as part of account creation.
- Name changes follow the existing 30-day limit.
- Email changes require the current password and verification of the new address; the saved email changes after verification.
- Pages and controls must match the signed-in account role.
- Officers manage only organizations for which they have approved officer access.

### 3. Organizations and profiles

- Show a directory with each organization name, logo, short description, and profile link.
- Keep name search with a clear no-results message.
- Each organization profile shows description, contact details including an optional phone number when supplied, recruitment information, posts, and available dates.
- Approved officers can update only their own organization's name, logo, description, contact email/phone, recruitment title, requirements, and application link.

### 4. Announcements

- Officers can publish text announcements with up to four bounded images and can delete their own posts.
- Posts show newest first with organization name, logo, and posting date.
- Posts appear consistently in the main feed and on the organization profile.
- Users can like/unlike a post, use Share to copy a direct post link, open comments, add a comment, and edit/delete their own comments.
- Like counts and saved comment counts remain consistent across pages.
- Empty posts/comments and failed saves produce clear messages.

### 5. Applications

- Organization recruitment content includes title, requirements, instructions, and an external Google Form or other application link.
- Opening the link alone must **not** count as a completed submission.
- A student must explicitly confirm in SOAR that they submitted the external form before the entry is listed for officer checking.
- Officers check responses in the existing form or Google Sheet and update the stage to: **Pending**, **Under review**, **Accepted**, or **Declined**.
- Students see organization, position/recruitment opportunity, and stage in a simple progress tracker.
- Duplicate entries must be prevented per student and recruitment opportunity/position.

### 6. Calendar entries and available dates

- Officers can add, edit, and remove their organization's events and available interview/meeting dates.
- Entries include title, date, short details, and time where needed.
- Organization profiles show a simple dated event list.
- Event details and available meeting/interview dates must be easy to distinguish.
- Changed or removed entries remain consistent with saved records, and required dates are validated.

### 7. Meeting requests

- Students, sponsors, and officers can request meetings where the workflow is available to their role.
- Keep the existing request flow: choose an organization posted meeting/interview entry, enter a date and time, optionally attach one formal PDF request document, and send a request.
- Users see organization, meeting title, requested date/time, and status: **Pending**, **Approved**, or **Declined**.
- Officers see requests for their own organization and can approve or decline them.
- Required details are validated, repeated identical requests are prevented or handled clearly, and pending requests are not shown as confirmed bookings.

### 8. Officer dashboard

- Organize the officer workflow into clearly labelled sections:
  - profile and recruitment settings
  - announcement controls
  - applicants
  - calendar/date entries
  - meeting requests
- Organization management shows only an aggregate count of registered saved student accounts whose selected department matches that organization. It never lists student identities, emails, applicants, members, meetings, or payment data.
- Use readable status labels, clear save messages, and confirmation before deleting a post or calendar entry.
- Officers manage only organizations for which they have approved access.

### 9. Image uploads

- Keep uploads for organization logos and announcement images.
- Show a preview before saving.
- Check file type and size and explain when an image cannot be accepted.
- Store images in the project file storage so they display after refresh and sign-in.
- Display images without stretching or overflowing the page.
- Only an approved officer for the organization can replace its logo or upload images to its posts.
- Announcement attachments support up to four bounded images. Media bytes remain in Firebase Storage; announcement records retain Storage references.

### 10. Six-month paid access

- Access costs **PHP10 per account for six calendar months** from confirmed payment. This is a confirmed amendment to the PDF's PHP2 amount and earlier annual references.
- New paid checkouts use PayMongo Hosted Checkout Sessions v2 with **QR Ph only** and automatic signed provider-side confirmation. GCash may be used as a QR Ph scanning app; this is not direct GCash acceptance.
- **PayMongo** is the intended provider. Hosted merchant/channel activation and actual fees remain unverified; this is not a promise that PayMongo is free or the cheapest provider.
- When the trusted Admin setting requires payment, signed QR Ph payment is required before paid account/profile creation and before a manual renewal grants more time. When the setting does not require payment, new account access is explicitly marked unpaid-preview and is not represented as provider-paid.
- Existing payment history, active provider-confirmed entitlements and revoked states are preserved. Existing-account eligibility is approved, while the start/duration of any grandfathered grant remains a separate activation decision. There is no automatic recurring charge.
- Payment confirmation is automatic and linked to the correct registration or renewal.
- Pending, failed, cancelled, or expired access does not unlock registration or main pages.
- Expiry restricts access while retaining the account and saved records for renewal.
- Entry, sign-in, payment, renewal, and password recovery remain available while main pages are locked.
- Users can view payment status and access end date but cannot edit those values.

### 11. Saved data, permissions, hosting, and handover

- Use the existing Firebase project for accounts and saved records, with file storage for images.
- Fix loading, saving, and repeated-click issues so records remain correct after refresh, sign-out, and use on another device.
- Keep private application, meeting, and payment records visible only to the correct accounts.
- Deliver the hosted website, complete updated source files, and short instructions for setup, account roles, payments, and the main tasks.

## Current draft vs. target behavior

The supplied `docs/client-scope/TECHNO/` folder is a static Firebase-hosted draft using HTML, CSS, and JavaScript. It demonstrates several desired workflows but does not yet satisfy the final agreement as amended.

| Area | Current draft evidence | Target alignment needed |
| --- | --- | --- |
| Hosting/setup | Firebase hosting config exists for `public/`; source imports Firebase Auth and Firestore. | Continue using the existing Firebase project, then inspect and configure Authentication, database/storage, security rules, hosting, and any required functions. |
| Framework | The supplied intake draft was plain HTML/CSS/JS with one large `script.js`; the active MVP implementation now uses React, TypeScript and Vite under `app/frontend`. | Continue the approved React/Vite MVP path without expanding product scope or redesigning agreed workflows. |
| Roles | Draft uses `student`, `organization`, and `sponsor`; login/register pages include role radios. | Keep sponsor as the outside-user label, remove sponsor-only tooling assumptions, remove TIN/government-ID collection, and add optional company/organization name. |
| Auth/settings | Registration, login, sign-out, password reset, name cooldown, and email verification flow are partially implemented. | Enforce verified payment before account creation, role-appropriate access, verified email-save timing, personal-account settings, and officer organization settings. |
| Organization officer onboarding | Draft includes organization proof upload and direct organization-account creation. | Replace with the confirmed project-administrator initial-owner assignment and owner-approved officer access. No initial proof upload is required. |
| Organizations | Directory, profile pages, search, officer profile fields, and organization logo input exist. | Add clear no-results states, requirements/instructions fields, robust validation, storage-backed image handling, and permission enforcement for approved officers only. |
| Announcements | Officers can create/delete posts; users can like/comment; optional image is handled as client-side data. | Validate empty posts/comments, save images to file storage, show preview/type/size checks, and ensure consistency across feed/profile after refresh/sign-in. |
| Applications | Student click currently logs an application and opens the external form; officer page can update statuses. | Require explicit external-submission confirmation, prevent duplicates per recruitment opportunity/position, include **Declined**, use the agreed status labels, and keep tracker updates consistent. |
| Calendar/date entries | Officers can add/delete simple title/date slots; profiles show available slots. | Add edit, short details, time where needed, valid-date checks, and visual distinction between events and interview/meeting availability. |
| Meeting requests | Users can request date/time from a profile slot; officers can approve/decline. | Allow the confirmed requesting roles, prevent repeated identical requests, clarify pending vs. confirmed, and ensure each user sees their own request history. |
| Payments | Source now includes PayMongo Checkout Sessions v2 (QR Ph), signed payment status, six-month manual renewals, access enforcement and a persisted trusted-Admin global policy. Hosted activation is not verified. | Complete a separately approved provider test using `test_url`; activate live only after merchant QR Ph readiness and explicit owner approval. |
| Images | Draft stores uploaded proof/logo/post images as base64-like data in saved records. | Use Firebase file storage or the agreed project file storage, with file validation and previews. |
| Security | Current behavior appears primarily client-side; database/security rules were not supplied for review. | Implement/verify Firebase-rule or server-side enforcement for roles, organization ownership/officer access, private records, and payment/access fields. |
| Mixed dependencies | Some pages include a Supabase CDN script, but application logic uses Firebase. | Standardize on the agreed Firebase-backed implementation unless a later approved architecture changes this. |

## UI/UX baseline and design-system inputs

The agreed UI/UX baseline is functional and responsive rather than decorative scope expansion:

- clear navigation and page hierarchy
- readable typography and colors
- consistent buttons, headings, spacing, cards, forms, tables, and status chips
- phone and desktop layouts for every included page
- forms and tables that remain usable on small screens
- properly cropped/scaled images
- clear loading, empty, validation, success, and error states
- modest transitions for page and button feedback

The classmate site should be used later as a minimum quality comparison for polish and usability, but it does not add SOAR features. If Open Design is used later, put those outputs under `docs/design-system/open-design/` rather than treating Open Design as an installed integration.

## Acceptance criteria traceability

| Acceptance check | Requirements covered |
| --- | --- |
| Included pages are readable on phones and computers; navigation, forms, images, and tables fit; loading/empty/error messages are clear. | Layout and design; UI/UX baseline. |
| Registration, sign-in, sign-out, email verification, and email password recovery work; role-specific registration details match the confirmed scope. | Accounts, roles, and settings. |
| Name changes follow the 30-day limit, and email changes take effect after verification of the new address. | Personal-account settings. |
| Organization owner/officer access is limited to approved organization management; department registered-student counts remain aggregate-only and under the current manager-only boundary. | Organization ownership and officer access; officer dashboard; department student counts. |
| Name search finds organizations; profile changes, posts, images, likes, and comments appear correctly in directory, feed, and profile pages. | Organizations/profiles; announcements; image uploads. |
| Application links open; only explicit confirmed external submissions enter checking; officer stage changes appear in the student tracker without duplicate entries per recruitment opportunity/position. | Applications. |
| Officers can add, change, and remove calendar entries; permitted images save and display after refresh and sign-in. | Calendar/date entries; image uploads; saved data. |
| Meeting requests save with correct organization, date, and time; officers approve/decline; users see decisions; repeated requests are handled clearly. | Meeting requests. |
| Under payment-required policy, signed confirmation of a valid **PHP10** QR Ph payment unlocks paid account creation and six calendar months; browser return/pending/failed/cancelled payments do not. Renewal preserves saved data. | Six-month paid access; saved data. |
| Users see only their private application, meeting, and payment records; officers manage only approved organizations; users cannot change paid status or access end date. | Permissions; saved data; officer dashboard; paid access. |
| Hosted link, complete updated source files, and short setup/use instructions are handed over after final review. | Hosting and handover. |

## Explicit exclusions

The following are outside the agreed scope unless separately approved:

- monthly calendar views
- warnings about overlapping meetings
- category filters
- dashboard counters beyond the approved department registered-student count
- elaborate animations
- financial or transparency reports
- dedicated sponsor tools beyond the sponsor outside-user role described above
- RSVP or attendance tracking
- forms built inside the site
- automatic reading of Google Form/Sheet responses
- post/application/meeting alerts by email, text, or push notification
- a native phone app
- automatic recurring charges
- a general admin dashboard or full membership-management system

Do not treat unanswered product questions or implementation convenience as permission to add any of these.

## Constraints and dependencies

### Client-provided inputs

The client must provide or confirm:

- complete project source, images/assets, editable designs, setup/deployment files, organization content, and application links
- service invitations for hosting, database, file storage, domain, code repository, and the existing Firebase project
- Firebase access covering Authentication, database/storage, security rules, hosting settings, and any existing server/function code
- Firebase billing setup required for live payment confirmation and image uploads
- a PayMongo merchant account with QR Ph enabled for Checkout Sessions; actual activation and fee schedule must be confirmed by the account owner
- any required secrets privately, not in committed files

The client group is responsible for finding users and paying customers. Provider transaction fees and hosting/storage charges are paid through the client service accounts.

### Payment-provider evidence

PayMongo is the intended provider because current public documentation rechecked on 2026-10-22 lists QR Ph for Individual accounts and PHP1.00 as the QR Ph minimum. Merchant activation and Checkout behavior remain unverified; public facts are not account-state evidence.

Official PayMongo sources reviewed:

- Pricing: <https://www.paymongo.com/en/pricing>
- Create PaymentIntent API: <https://docs.paymongo.com/reference/create-a-paymentintent.md>
- Create Checkout Session API: <https://docs.paymongo.com/reference/create-a-checkout.md>
- Hosted Checkout quick start: <https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start.md>
- Webhook events: <https://docs.paymongo.com/docs/developer-tools-webhooks-events.md>
- Testing: <https://docs.paymongo.com/docs/payment-acceptance-testing.md>
- Account setup: <https://docs.paymongo.com/docs/account-settings-account-setup.md>

Current public Standard pricing lists QR Ph at **1.34% VAT-exclusive**. Actual merchant rate, VAT and settlement handling must be confirmed by the owner; this is not a fee-free promise or proof that PayMongo is cheapest. PayMongo test mode may generate a real/scannable QR Ph code; never scan/pay it, and simulate only through the response `test_url` after an approved bounded test window.

### Delivery context

The supplied overview states a fixed development fee of **PHP3,000**, with first and final payments split around development start and handover, plus preview/final delivery dates from the current quote. Those business terms are context for planning; feature completion is judged against the final scope and confirmed amendments above.

### Technical direction

- **Agreed constraint:** use the existing Firebase project for accounts and saved records, with project file storage for images.
- **Known access context:** Firebase administrator access is available, but actual configuration still needs inspection before implementation claims can be made.
- **Active implementation:** the approved MVP foundation uses React, TypeScript and Vite for the frontend under `app/frontend`, with Firebase/Express backend code under `app/backend`.
- **Boundary:** this PRD does not define detailed frontend/backend architecture, database schema, payment webhook design, or deployment scripts.

### Repository intake guidance

Suggested repository structure remains:

- `app/` — future application source once implementation begins.
- `docs/client-scope/` — agreed scope, requirements, client notes, hosting context, and the supplied current-draft source for intake/reference.
- `docs/design-system/open-design/` — future Open Design outputs.
- `docs/agent-workflow/` — agent-facing workflow notes and implementation plans.

## High-level implementation phases

These are planning boundaries only, not a backend/frontend design.

1. **Alignment and design intake:** approve this PRD, review any Open Design output, and confirm current service access.
2. **Project foundation:** decide whether/when to migrate from the static draft to a framework; set up the approved project structure without changing agreed scope.
3. **Access foundation:** implement verified payment before account creation, manual six-month renewal/expiry behavior, roles, owner-approved officer access, payment status visibility, and permission enforcement.
4. **Core content workflows:** implement organization directory/profiles, announcements, image handling, personal and organization settings, and responsive UI states.
5. **Operational workflows:** implement applications, calendar/date entries, meeting requests, and officer dashboard sections.
6. **Hardening and handover:** validate acceptance checks, fix refresh/sign-out/another-device consistency, verify private-record access, use an approved test-mode `test_url` simulation, separately authorize any live payment work, and write setup/use instructions.

## Remaining verification items

No product conflicts remain from the confirmed decisions above. The remaining items are implementation prerequisites and external validations, not permission to expand scope:

1. **PayMongo activation:** the owner must verify merchant QR Ph availability and approve a bounded test-mode window; simulate via `test_url` without scanning/paying a QR. Any live test or production activation requires separate explicit live authority.
2. **Provider terms recheck:** PayMongo pricing, fees, VAT treatment, minimums, and webhook behavior must be rechecked against official sources during implementation.
3. **Firebase inspection:** existing Firebase Authentication, Firestore/database, Storage, Hosting, security rules, billing, and any function/server code still need inspection before implementation.
4. **Security enforcement:** roles, owner-approved officer access, private records, payment status, and access end dates must be enforced outside client-only UI logic.
5. **Reference-site review:** browser inspection of the classmate reference site could not be completed in this environment; perform a later visual review before final UI decisions.
