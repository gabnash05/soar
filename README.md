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

## Run the connected local application (optional)

Choose this path when you want the browser interface to call the local API and Firebase emulators instead of using fixtures. The API is the server-side part of SOAR; the frontend is the browser interface. You need Node.js 22 with npm, Bash (or WSL), Java 21, and Firebase emulator downloads. Keep the API/emulator terminal and frontend terminal open at the same time. This setup uses the isolated demo project `demo-soar-local`, not the hosted Firebase project; its records are synthetic and local. Do not use the root `test:rules` command here because it explicitly targets the hosted project.

In a Bash/WSL terminal at the repository root, download the Firestore emulator once, set the exact frontend origin the API will allow, then start the API and emulators:

```bash
npx firebase setup:emulators:firestore
export SOAR_APP_BASE_URL=http://127.0.0.1:5173
npm --workspace app/backend run emulators:start
```

Leave this terminal running. The helper starts Auth at `127.0.0.1:19099`, Firestore at `127.0.0.1:18080`, Storage at `127.0.0.1:19199`, and the API at `127.0.0.1:15001`. The API health address is `http://127.0.0.1:15001/demo-soar-local/asia-southeast1/api/health`. Stop the services with Ctrl-C.

Open a second Bash/WSL terminal at the repository root and seed the emulators with synthetic sample records:

```bash
GCLOUD_PROJECT=demo-soar-local \
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099 \
npm --workspace app/backend run emulators:seed
```

The seed creates demo student, sponsor, owner, and officer records; a successful run exits without an error. These records and simulated access are for local demonstration, not real accounts or payment evidence. The seed does not create an Admin. Demo credentials are provided privately; do not guess them or save them in the repository.

From the repository root, create the local frontend config by copying the checked-in example (`cp app/frontend/.env.example app/frontend/.env.local` in Bash/WSL, or `Copy-Item app/frontend/.env.example app/frontend/.env.local` in PowerShell). Open `app/frontend/.env.local`, replace its contents with the following emulator configuration, then save it. These are safe demo identifiers, not hosted-project credentials:

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

Save the configuration, then open a third terminal in `app/frontend` and start the frontend:

```bash
cd app/frontend
npm run dev -- --host 127.0.0.1
```

Vite prints the local address; open `http://127.0.0.1:5173`, which must match `SOAR_APP_BASE_URL` exactly. A successful connection shows the SOAR interface; the API health address above should return a successful response. Use the private demo-account handoff for sign-in details. Stop the frontend with Ctrl-C.

## Hosted setup: Firebase + Render + Supabase

This is an optional hosted-preview setup; it is not needed to run the fixtures or local emulator walkthrough above. It requires authorized access to the existing Firebase, Render, and Supabase projects. A local build does not create or configure those services and does not verify deployment. Use the checked-in examples as templates: copy `app/backend/.env.example` only for a private standalone backend run, and `app/frontend/.env.example` to `app/frontend/.env.local` for local frontend configuration. Never commit either populated file. For Render, enter backend values in its private environment settings and frontend values in the private build environment.

1. **Firebase:** obtain access to project `soar-a711e`, its existing web app configuration, Email/Password Authentication, Firestore, and Hosting site. Confirm the frontend host is permitted by Authentication's authorized domains. Arrange an approved Firebase Admin runtime identity for Render, scoped to this project. Never place it in a `VITE_` variable.
2. **Supabase:** obtain the project URL and backend-only service-role key. Use a private bucket named `soar-files` (or keep `SOAR_FILES_BUCKET` consistent with the selected private bucket). Permit the supported image types and `application/pdf`, and confirm browser upload/CORS behavior for the exact frontend origin. SOAR limits images to 5 MiB and meeting PDFs to 10 MiB. Existing Firebase Storage objects need a separate inventory/migration decision.
3. **Render:** connect the GitHub repository and select the approved branch. Set service root `app/backend`, build command `npm ci && npm run build`, start command `npm start`, and health-check path `/health`. The backend declares Node 22 and binds Render's `PORT`. Enter the server configuration below through the service environment settings.
4. **Frontend:** set the hosted build configuration below in the ignored `app/frontend/.env.local` or your private build environment. Remove Auth/Storage emulator hosts, build in `app/frontend`, then deploy from the repository root using the Hosting command below.
5. **Verify:** check API health, sign-in/email verification, role access, saved records after refresh, and authorized image/PDF upload and retrieval. Confirm the recipient can access the provider dashboards. Do not report handoff completion until those access checks are done.

### Render server configuration

The frontend uses public Firebase web-app identifiers; obtain the existing values from the authorized Firebase project web-app configuration. The backend additionally needs an approved Firebase Admin identity and private Supabase service-role key, supplied only to Render's server environment. Do not copy these server secrets into `app/frontend/.env.local`: every `VITE_` variable is compiled into browser-visible code.

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

The webhook handler is `POST /api/webhooks/paymongo` on the API origin and expects signed `checkout_session.payment.paid` events. Confirm the route and test/live lane against [the payment integration guide](docs/backend/payments.md). For a no-payment preview, keep backend `SOAR_DISABLE_PAYMENTS=true` and frontend `VITE_SOAR_PAYMENTS_ENABLED=false`. The frontend flag only enables payment UI paths; the backend flag is a server-side stop. For an approved provider test, use test credentials and `PAYMONGO_EXPECTED_LIVEMODE=false`; this setting checks the expected credential/session mode, it does not itself enable checkout or create a transaction. A live setup requires separately approved live credentials, `PAYMONGO_EXPECTED_LIVEMODE=true`, safe server configuration, and explicit owner authorization; do not enable live mode as part of ordinary setup. The authenticated Admin payment policy is an additional requirement; keys or deployment flags alone do not enable charging. A live-mode policy activation also records the one-time existing-account access window, so review that behavior before activating it.

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

The detailed product requirements, scope, acceptance criteria, and planning context are maintained separately in the [SOAR Product Requirements Document](docs/PRD.md).
