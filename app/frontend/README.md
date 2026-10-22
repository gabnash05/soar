# SOAR frontend

React + TypeScript + Vite frontend for SOAR.

## Local setup

```bash
cd app/frontend
npm install
cp .env.example .env.local
npm run dev
```

Set public Firebase web config and `VITE_SOAR_API_BASE_URL` for real auth/payment/settings integration. For UI-only development, set `VITE_SOAR_USE_FIXTURES=true`; fixture mode is clearly labelled in the app and is not production readiness evidence.

For emulator-only integrated inspection with the backend helper, use `demo-soar-local` and loopback services only:

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

Seeded emulator demo accounts are documented in `app/backend/README.md`. Their active access records are simulated local data, not production payment verification.

## Unpaid Firebase-hosted core preview

The non-production preview keeps the existing Firebase Hosting/Auth/Firestore project, uses the standalone API on Render Free, and moves private media to Supabase Storage. Build the frontend with the existing public Firebase app identifiers plus:

```dotenv
VITE_SOAR_USE_FIXTURES=false
VITE_SOAR_PAYMENTS_ENABLED=false
VITE_SOAR_STORAGE_PROVIDER=supabase
VITE_SOAR_API_BASE_URL=https://<render-service>.onrender.com
```

Do not set Firebase Auth/Storage emulator hosts for the hosted build. `VITE_SOAR_PAYMENTS_ENABLED=false` is a frontend UI/build safety gate, not authorization; the persisted server payment policy is authoritative. `SOAR_DISABLE_PAYMENTS=true` is the hard backend stop for hosted checkout/payment routes and cannot be overridden by the Admin switch. The trusted Admin can persist whether payment is required for new registrations/manual renewals; when it is not required, registration uses explicit unpaid-preview provenance and creates no paid entitlement. A saved policy or provider credentials alone do not bypass the server stop or verify merchant QR Ph activation. Keep both hosted flags off until the separate approved integration window. New paid checkout uses PayMongo Hosted Checkout Sessions v2 for QR Ph and same-UID signed-webhook completion. Do not change the legacy secure HttpOnly `SameSite=Lax` registration cookie or move secrets to URLs/storage.

Supabase service-role credentials are backend-only. The frontend receives only short-lived signed upload/download URLs minted by the authenticated API; it must never receive `SUPABASE_SERVICE_ROLE_KEY` or Firebase Admin credentials. Remote legacy Firebase Storage objects were not inventoried; existing Firestore media paths remain unchanged, but previously stored images/PDFs may be unavailable in this preview. This is disclosed, not a blocker to the core preview, and no legacy object migration is claimed.

## Scripts

- `npm run dev` — start Vite dev server.
- `npm run typecheck` — TypeScript build check.
- `npm test` — Vitest component/unit tests.
- `npm run build` — typecheck and production Vite build.
- `npm run preview` — serve the built app locally.

## Important boundaries

- Officers are student accounts with trusted organization grants, not a signup role.
- Sponsors have no application tools.
- PHP10 payment must be provider-confirmed before account creation.
- The browser never calls payment-provider secret APIs or includes Firebase Admin credentials.
- Main workflow pages provide opt-in fixture browsing and production API loading/error states; fixture data is never a production fallback.
