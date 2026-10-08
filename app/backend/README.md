# SOAR backend local setup

This backend is the Firebase Functions/Express foundation for identity, paid access, organization/content APIs, applications, and meetings.

## Local emulator boundary

Use a demo emulator project for local inspection until the user completes interactive Firebase login. This keeps local data separate from the existing production Firebase project (`soar-a711e`) and avoids live Firebase, billing, payment-provider, or production data operations.

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

The emulator command does not require Firebase CLI login for local demo resources. It is not evidence that production Firebase credentials are configured. Production project/app SDK config should be inspected only after the user performs `firebase login` interactively.

The backend functions declare Node 20 in `app/backend/package.json`; run the Functions emulator with a Node 20 runtime available. If the host only has Node 24, Firebase may warn about the mismatch and fail function discovery before the health endpoint is registered.

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

Do not add production payment-provider secrets or service-account keys to frontend env files. Real Firebase web app values for `soar-a711e` still require authenticated, read-only Firebase project/app inspection.

## Checks

```bash
npm run typecheck
npm --workspace app/backend run test
npm run test:rules
```

`npm run test:rules` uses the existing production project id binding from the root package script. For isolated local port testing, the equivalent emulator boundary is:

```bash
export JAVA_HOME=/home/gab/agent-workspace/firstmate/data/soar-identity-foundation/java/jdk
export PATH="$JAVA_HOME/bin:$PATH"
npx firebase emulators:exec --config firebase.local.json --project demo-soar-local --only firestore,storage "npm --workspace app/backend run test:rules"
```

Any seeded users, organizations, or entitlements for demos must be created only in the emulator and labelled as demo data. Do not use seeded data as a payment or authentication bypass in production.
