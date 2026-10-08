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
- Main workflow pages are placeholders until the workflows lane connects real backend data.
