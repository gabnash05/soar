# SOAR backend local setup

This backend is the Firebase Functions/Express foundation for identity, paid access, organization/content APIs, applications, and meetings.

## Local emulator boundary

Use a demo emulator project for local inspection. This keeps local data separate from the existing production Firebase project (`soar-a711e`) and avoids live Firebase, billing, payment-provider, or production data operations.

The repository keeps the production binding in `.env.example`/root scripts, but local MVP inspection should use `firebase.local.json` and `--project demo-soar-local`:

```bash
export JAVA_HOME=/home/gab/agent-workspace/firstmate/data/soar-identity-foundation/java/jdk
export PATH="$JAVA_HOME/bin:$PATH"
npx firebase emulators:start --config firebase.local.json --project demo-soar-local --only auth,functions,firestore,storage
```

Local service addresses:

- Backend API health: `http://127.0.0.1:15001/demo-soar-local/asia-southeast1/api/health`
- Backend API base URL for the frontend: `http://127.0.0.1:15001/demo-soar-local/asia-southeast1/api`
- Firebase Auth emulator: `127.0.0.1:19099`
- Firestore emulator: `127.0.0.1:18080`
- Storage emulator: `127.0.0.1:19199`

The emulator command does not require Firebase CLI login for local demo resources. It is not evidence that production Firebase credentials are configured.

`app/backend/functions.yaml` is a generated Firebase Functions manifest for the current `api` export. It keeps local Functions discovery on a supported path in environments where the Firebase Functions discovery server is not reachable over IPv4 loopback.

## Current local blocker

Keep emulator listeners loopback-only. In this WSL lane, the Firestore emulator from `firebase-tools` 15.32.1 / Firestore emulator 1.22.0 starts with `host: 127.0.0.1` and then exits with:

```text
java.lang.IllegalArgumentException: Failed to init the HTTP server.
Caused by: java.net.SocketException: Invalid argument
```

Binding Firestore to `0.0.0.0` avoids that emulator crash, but it is not used in the checked-in local config because it exposes the emulator beyond localhost. Until the Firestore emulator loopback crash is resolved in the local environment, only bounded Auth/Functions health checks are local-ready; Firestore/Storage-backed MVP inspection is blocked.

## Frontend environment handoff

For local emulator inspection, set the frontend to call the emulated backend and Auth emulator. Public Firebase web identifiers are not Admin secrets; for a pure emulator run, use the demo project boundary consistently:

```dotenv
VITE_SOAR_USE_FIXTURES=false
VITE_SOAR_API_BASE_URL=http://127.0.0.1:15001/demo-soar-local/asia-southeast1/api
VITE_FIREBASE_PROJECT_ID=demo-soar-local
VITE_FIREBASE_AUTH_DOMAIN=demo-soar-local.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=demo-soar-local.appspot.com
VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099
```

Do not add production payment-provider secrets or service-account keys to frontend env files.

## Checks

```bash
npm run typecheck
npm --workspace app/backend run test
npm run build
```

Storage rules tests use the active emulator project id when one is supplied by `firebase emulators:exec`, so Storage rules can correctly evaluate Firestore-backed entitlement and organization documents during cross-service tests. Preserve this project alignment if moving the tests to another emulator command.

Any seeded users, organizations, or entitlements for demos must be created only in the emulator and labelled as demo data. Do not use seeded data as a payment or authentication bypass in production.
