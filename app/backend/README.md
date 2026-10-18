# SOAR backend local setup

This backend is the Firebase Functions/Express foundation for identity, paid access, organization/content APIs, applications, and meetings.

## Trusted Admin provisioning

The API derives the provisioning-only Admin session type from the server-verified Firebase Auth `soarAdmin: true` custom claim.
Public registration continues to accept only student and sponsor roles, and no account is promoted automatically.
The Admin UI is intentionally reached through separate, trusted local Admin setup rather than the general seed or public registration flow. A trusted operator must use Firebase Admin SDK credentials scoped to the Auth emulator at `127.0.0.1:19099` and project `demo-soar-local`, and must verify both endpoints before creating a synthetic tester identity and assigning `soarAdmin: true`. Refuse any non-loopback host, different project ID, or existing identity not specifically created for this local test; do not reset its password, change its claims, or elevate an unknown account. Hand the test credentials to the authorized tester privately; never put them in tracked files or frontend configuration. The general seed does not create, modify, or promote Admin identities.
Admin-only routes are `GET /admin/organizations`, `GET /admin/students`, `POST /admin/organizations`, and `POST /admin/organizations/:orgId/officer-grants`.
Student lookup searches saved student account names and the existing `studentId` field in bounded pages and returns only the account UID, name, and an honestly optional student ID.
Organization creation uses the existing organization schema and requires a saved student as the initial owner/officer, while later grants remain scoped to a single organization and are idempotent.
Admin sessions have no paid entitlement and do not bypass the existing student/sponsor access rules.

## Local emulator boundary

Use the demo emulator project `demo-soar-local` for local inspection. This keeps local data separate from the existing production Firebase project (`soar-a711e`) and avoids live Firebase, billing, payment-provider, or production data operations.

The repository keeps the production binding in `.env.example`/root scripts. For local MVP inspection, use the bounded backend helper instead of the plain Firebase CLI Firestore startup:

```bash
# Optional when Java 21 is not already on PATH:
# export JAVA_HOME=/path/to/jdk-21
# export PATH="$JAVA_HOME/bin:$PATH"

npm --workspace app/backend run emulators:start
```

Stop it with `Ctrl-C`. The helper starts only loopback listeners and tears down only its own direct Firestore child process when it exits.

Local service addresses:

- Backend API health: `http://127.0.0.1:15001/demo-soar-local/asia-southeast1/api/health`
- Backend API base URL for the frontend: `http://127.0.0.1:15001/demo-soar-local/asia-southeast1/api`
- Firebase Auth emulator: `127.0.0.1:19099`
- Firestore emulator: `127.0.0.1:18080`
- Firestore WebChannel port: `127.0.0.1:18081`
- Storage emulator: `127.0.0.1:19199`

Set the backend's `SOAR_APP_BASE_URL` to the exact frontend origin. The API permits credentialed browser requests only from that origin; the Functions wrapper CORS layer is disabled so Express handles preflight with the same allowlist. For the local API-backed static preview used here, the origin is `http://127.0.0.1:45656`.

The emulator command does not require Firebase CLI login for local demo resources. It is not evidence that production Firebase credentials are configured.

With the local emulators already running, seed deterministic demo accounts and workflow records in another terminal:

```bash
GCLOUD_PROJECT=demo-soar-local \
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099 \
npm --workspace app/backend run emulators:seed
```

The seed command refuses non-loopback hosts and refuses any project id other than `demo-soar-local`. It creates synthetic organizations, announcements, date entries, applications, meeting requests, officer grants and active entitlements labelled `emulator-simulated`. Those entitlements are a local MVP convenience only; they are not production payment evidence or a production bypass.

Newly created demo sign-ins use the credentials in the private local test-account handoff. Rerunning the seed does not reset existing Auth credentials or overwrite matching account and entitlement records; for fixed synthetic identities it repairs only missing records after validating their identity. Existing accounts may have a separately changed password:

- `student@example.test` — student tracker/request flows.
- `sponsor@example.test` — sponsor meeting request flows, no application tracker.
- `owner@example.test` — student account with owner access for seeded department organizations.
- `officer@example.test` — student account with Computer Engineering Department officer grant.

`app/backend/functions.yaml` is a generated Firebase Functions manifest for the current `api` export. It keeps local Functions discovery on a supported path in environments where the Firebase Functions discovery server is not reachable over IPv4 loopback.

## Why there is a small local helper

Keep emulator listeners loopback-only. In this WSL lane, the Firestore emulator started by Firebase CLI from `firebase-tools` 15.32.1 exits on `host: 127.0.0.1` with:

```text
java.lang.IllegalArgumentException: Failed to init the HTTP server.
Caused by: java.net.SocketException: Invalid argument
```

Binding Firestore to `0.0.0.0` avoids that emulator crash, but it is not used in the checked-in local config because it exposes the emulator beyond localhost. A direct Firestore emulator Java invocation with an explicit `--webchannel_port` stays alive on `127.0.0.1`, which narrows the failure to Firebase CLI startup not passing a separate WebChannel port. The helper uses that direct Java invocation for Firestore only, loads the checked-in `firestore.rules`, then starts the existing Firebase CLI emulators for Auth, Functions, and Storage on loopback. It also preloads a tiny Firebase CLI registry shim so Storage rules can resolve the independently started Firestore emulator while preserving the real Storage rules authorization checks.

This is a bounded local workaround for the reproduced Firestore loopback/WebChannel issue, not a production launcher or deployment path.

## Frontend environment handoff

For local emulator inspection, set the frontend to call the emulated backend and Auth emulator. Public Firebase web identifiers are not Admin secrets; for a pure emulator run, use the demo project boundary consistently:

```dotenv
VITE_SOAR_USE_FIXTURES=false
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

Do not add production payment-provider secrets or service-account keys to frontend env files.

## Render Free core preview (non-production only)

The standalone listener in `src/server.ts` starts the same Express API returned by the Firebase Functions export. For a Render web service, set the service root to `app/backend`, build with `npm ci && npm run build`, and start with `npm start`. The listener binds `0.0.0.0:$PORT`; `/health` is the health-check path. The package now pins Node 22, a maintained runtime supported by Render. Local validation has used Node 24.21.0; the Render-selected Node 22 patch release still requires deployment-side confirmation.

This path retains Firebase Hosting/Auth/Firestore and moves binary files to Supabase Storage. It is a sleeping, quota-limited preview, not a production or live-payment recommendation. Render Free sleeps after 15 minutes without inbound traffic and may take about one minute to wake; a workspace has 750 free instance-hours/month, shared with its other services. At quota, the service/build is suspended or disabled until reset. Do not attach a payment method when a hard `$0` ceiling is required; this means no paid overages, but quota exhaustion can interrupt the preview. Supabase Free provides 1 GB storage, 5 GB egress plus 5 GB cached egress, and a 50 MB provider maximum per file; projects may pause after a week of inactivity. The application itself limits images to 5 MiB each and meeting PDFs to 10 MiB. Current stored-object totals are unknown, so do not migrate or claim existing media is available until an authorized inventory is complete.

Configure these values in the service/build environment. Never place server secrets in frontend variables, tracked files, logs, or chat:

- Render service: `GCLOUD_PROJECT=soar-a711e`, `SOAR_APP_BASE_URL=https://soar-a711e.web.app`, `SOAR_FIREBASE_WEB_API_KEY` from the existing Firebase web app, `SOAR_STORAGE_PROVIDER=supabase`, `SOAR_FILES_BUCKET=soar-files`, and `SOAR_DISABLE_PAYMENTS=true`. Render supplies `PORT`; the service-account parser rejects a mismatched project ID.
- Supabase server secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), and the private bucket named by `SOAR_FILES_BUCKET`. Keep the bucket private, allow only the current image MIME types and `application/pdf`, and configure browser CORS for the Firebase app origin so signed uploads can complete. The API issues bounded upload/download capabilities; private PDFs are downloaded only through the authenticated API route after requester/officer authorization and metadata checks.
- Firebase Admin server identity: `FIREBASE_SERVICE_ACCOUNT_JSON` containing an existing, approved, least-privilege service identity for the same Firebase project’s Auth and Firestore operations, or another already-approved keyless identity mechanism. The Functions-managed identity does not automatically transfer to Render. Do not create keys, change IAM, or grant Owner as part of this source adaptation.
- Frontend build: `VITE_SOAR_USE_FIXTURES=false`, `VITE_SOAR_PAYMENTS_ENABLED=false`, `VITE_SOAR_STORAGE_PROVIDER=supabase`, `VITE_SOAR_API_BASE_URL=https://<render-service>.onrender.com`, and the existing public `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, and sender ID values. Do not set Auth/Storage emulator hosts in a hosted build.

Paid registration, checkout, renewal, and webhook routes are disabled by `SOAR_DISABLE_PAYMENTS=true`; no payment secrets or provider activation should be supplied. Authenticated `POST /accounts/preview-registration` (also `/api/accounts/preview-registration`) permits self-registration only for Student or Sponsor roles in this mode. The browser creates the Firebase Auth user; the server verifies that user's bearer token and saves a validated account profile. Student registration requires a canonical department. The server records `accessProvenance: 'unpaid-preview'` on the profile without creating an entitlement, payment record, or provider event. The API grants that preview access only while `SOAR_DISABLE_PAYMENTS=true`, and core API routes still require email verification and their existing authorization checks. The frontend sends the password only to Firebase Auth. The existing paid-registration cookie remains `HttpOnly; Secure; SameSite=Lax`; this preview signup does not use or weaken it. Firebase Hosting serves the static app, which calls the separate Render API directly; no same-origin `/api` proxy is selected. Render’s sleeping service and webhook startup time have not been validated against PayMongo delivery behavior.

Before deployment, the owner must arrange Render Free service deploy access, a Supabase Free project/private bucket and secure secret injection, an approved Firebase Admin runtime identity, confirmation that the existing Firebase Hosting site permits deployment, and an authorized inventory/migration plan for any existing Storage objects. No account, credential, IAM, DNS, service, project, or billing state is changed by this code.

## Checks

General backend checks:

```bash
npm run typecheck
npm --workspace app/backend run test
npm run build
```

With `npm --workspace app/backend run emulators:start` running in another terminal, focused rules checks can be run against the loopback emulators:

```bash
GCLOUD_PROJECT=demo-soar-local \
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 \
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:19199 \
npm --workspace app/backend run test:rules:firestore

GCLOUD_PROJECT=demo-soar-local \
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 \
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:19199 \
npm --workspace app/backend run test:rules:storage
```

Storage rules tests use the active emulator project id when one is supplied, so Storage rules can correctly evaluate Firestore-backed entitlement and organization documents. Preserve this project alignment if moving the tests to another emulator command.

Any seeded users, organizations, or entitlements for demos must be created only in the emulator and labelled as demo data. Do not use seeded data as a payment or authentication bypass in production.
