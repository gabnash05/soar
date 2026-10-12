# SOAR backend local setup

This backend is the Firebase Functions/Express foundation for identity, paid access, organization/content APIs, applications, and meetings.

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

The emulator command does not require Firebase CLI login for local demo resources. It is not evidence that production Firebase credentials are configured.

With the local emulators already running, seed deterministic demo accounts and workflow records in another terminal:

```bash
GCLOUD_PROJECT=demo-soar-local \
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099 \
npm --workspace app/backend run emulators:seed
```

The seed command refuses non-loopback hosts and refuses any project id other than `demo-soar-local`. It creates synthetic organizations, announcements, date entries, applications, meeting requests, officer grants and active entitlements labelled `emulator-simulated`. Those entitlements are a local MVP convenience only; they are not production payment evidence or a production bypass.

Seeded demo sign-ins all use password `SoarDemo123!`:

- `student@example.test` — student tracker/request flows.
- `sponsor@example.test` — sponsor meeting request flows, no application tracker.
- `owner@example.test` — student account with owner access for seeded organizations.
- `officer@example.test` — student account with Robotics Guild officer grant.
- `admin@example.test` — securely provisioned local stats-admin demo (`soarStatsAdmin: true`, `accounts/{uid}.role == "admin"`, `adminStatus: "active"`) for aggregate statistics only; no production admin is seeded or self-registered.

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
