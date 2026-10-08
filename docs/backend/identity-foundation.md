# SOAR identity, organization, and access foundation

This document is the backend contract for the identity-foundation lane.
It is intended for frontend and payment integration work after the paid-access foundation merged.

## Current implementation status

Implemented in this PR:

- Root Firebase configuration for the supplied existing project id `soar-a711e`.
- TypeScript Firebase Functions backend under `app/backend`.
- Shared domain contracts in `app/backend/src/contracts`.
- Firebase Admin initialization and Express API entrypoint exported as function `api`.
- Server-side paid-registration completion helper for the payment lane.
- Account settings endpoints for display-name changes and verified email-change requests.
- Organization initial-owner setup and owner-managed officer grant endpoints.
- Firestore rules for account, entitlement, organization, officer-grant, application, meeting, announcement, and calendar-entry boundaries.
- Storage rules for organization logos and announcement images.
- Firestore emulator rule tests covering direct SDK bypasses for identity, access, organization grants, applications, and meetings.

Not implemented here:

- Full frontend migration.
- Full announcements, applications, calendar, or meeting service APIs.
- A general admin dashboard.
- A student organization-creation request queue.
- Production deploys, live payment charges, Firebase billing changes, or account migrations.

## Firebase project evidence and limits

The supplied draft already referenced Firebase project `soar-a711e` in `docs/client-scope/TECHNO/.firebaserc` and `docs/client-scope/TECHNO/public/script.js`.
The root `.firebaserc` uses that same project id.
The supplied public draft config also referenced storage bucket `soar-a711e.firebasestorage.app`.

Live Firebase inspection was not completed because `firebase projects:list --json` returned `Failed to authenticate, have you run firebase login?` in this environment.
Therefore this PR records source-config evidence only and does not claim any live Auth, Firestore, Storage, Hosting, billing, or Functions setting.

## Firestore schema

### `accounts/{uid}`

Server-owned account profile keyed by Firebase Auth uid.

Required fields:

```ts
{
  uid: string;
  role: 'student' | 'sponsor';
  displayName: string;
  email: string;
  emailVerified: boolean;
  studentId?: string;
  companyName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastNameChangedAt?: Timestamp;
}
```

Officers are not an account role.
Officer access is an organization-specific grant on a student account.

Client permissions:

- The signed-in user may read only their own account document.
- The signed-in active verified user may update only `displayName`, `lastNameChangedAt`, and `updatedAt` after the 30-day cooldown.
- Clients cannot create accounts or edit role, email, verification state, student id, company name, created time, or entitlement fields.

### `entitlements/{uid}`

Server-owned annual access state keyed by Firebase Auth uid.

Required fields:

```ts
{
  uid: string;
  status: 'active' | 'expired' | 'revoked';
  accessExpiresAt: Timestamp;
  provider: string;
  lastProviderEventId: string;
  history: Array<object>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Active access means `status == 'active'` and `accessExpiresAt > request.time`.
Clients can read only their own entitlement and cannot create, update, or delete entitlement documents.
Expired users can still read their own account and entitlement so renewal and recovery screens can work.

### `organizations/{orgId}`

Server-created organization record.

Required fields:

```ts
{
  orgId: string;
  name: string;
  slug: string;
  ownerUid: string;
  shortDescription?: string;
  description?: string;
  contactEmail?: string;
  logoPath?: string;
  recruitment?: {
    title?: string;
    requirements?: string;
    instructions?: string;
    applicationLink?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUid: string;
}
```

Only a project administrator can create the initial organization record through the backend setup endpoint.
Clients cannot change `ownerUid`.
Owners and approved active officers can update public profile and recruitment fields only for their organization.

### `organizations/{orgId}/officerGrants/{uid}`

Organization-specific officer grant keyed by Firebase Auth uid.

Required fields:

```ts
{
  uid: string;
  status: 'active' | 'revoked';
  grantedByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  revokedByUid?: string;
  revokedAt?: Timestamp;
}
```

Rules intentionally block direct client writes to officer grants.
Owners approve and revoke officers through backend endpoints.
The assigned owner cannot revoke their own owner access through the officer-grant endpoint.

## HTTP endpoint contract

The Firebase Functions export is `api`.
Routes accept both `/...` and `/api/...` prefixes so the frontend can either point `VITE_SOAR_API_BASE_URL` directly at the function URL or use a hosting rewrite under `/api`.

### Health and session

- `GET /health`
- `GET /session`

`GET /session` requires a Firebase Auth bearer token and returns the frontend `UserSession` shape:

```ts
{
  uid: string;
  email: string;
  displayName: string;
  accountKind: 'student' | 'sponsor';
  studentId?: string;
  companyName?: string;
  emailVerified: boolean;
  access: {
    status: 'active' | 'expired' | 'missing';
    annualFeePhp: 10;
    expiresAt?: string;
    renewalAvailable: boolean;
  };
  officerGrants: Array<{
    organizationId: string;
    organizationName: string;
    status: 'approved';
    grantedBy?: string;
    grantedAt?: string;
  }>;
}
```

### Account settings

- `POST /account/display-name`
- `POST /account/email-change`

`POST /account/display-name` requires a verified email and active access.
The request body is `{ "displayName": "New Name" }`.
The backend and rules enforce the 30-day cooldown and update Firebase Auth display name best-effort after the Firestore profile change.

`POST /account/email-change` requires a verified email, active access, the current password, and `SOAR_FIREBASE_WEB_API_KEY` on the backend.
The request body is `{ "newEmail": "new@example.com", "currentPassword": "...", "continueUrl": "https://..." }`.
The endpoint reauthenticates through Firebase Auth REST and sends Firebase's verify-before-change email.
The account document email is not changed immediately.
It is synchronized after Firebase Auth reports the new verified email in a later session reload.

### Organization owner and officer setup

- `POST /admin/organizations`
- `POST /organizations/:orgId/officer-grants`
- `DELETE /organizations/:orgId/officer-grants/:uid`

`POST /admin/organizations` requires a Firebase custom claim `soarAdmin: true`.
This endpoint is for setup only, not a general admin UI.
It creates the organization, assigns the initial owner, and creates the owner's active officer grant.

`POST /organizations/:orgId/officer-grants` requires the caller to be the current owner of `orgId` with verified email and active access.
The body is `{ "uid": "student-auth-uid" }`.
Only student accounts can receive officer grants.

`DELETE /organizations/:orgId/officer-grants/:uid` requires the current owner and marks the grant as revoked.

### Payment endpoints wired from the merged payment foundation

The merged payment module remains under `app/backend/src/payments/**`.
This lane wires it into the shared Firebase Functions app without duplicating payment-owned code.

- `POST /payments/registration/start`
- `GET /payments/registration/status?intentId=...`
- `POST /payments/registration/complete`
- `POST /payments/registration/recover`
- `POST /payments/renewals/start`
- `GET /payments/access/status`
- `POST /webhooks/paymongo`

The payment module owns checkout intents, PayMongo webhook verification, exactly-once entitlement grants, renewal math, paid-unfinished registration recovery, and payment-specific docs/tests.
The identity helper boundary remains `createPaidAccountFromConfirmedRegistration(input): Promise<{ uid: string; alreadyProcessed: boolean }>`.
Auth user creation is not treated as Firestore-transaction-atomic; idempotent provider-event locks and recoverable cross-service handling are used.

## Firestore and Storage rules summary

Firestore rules require authenticated verified email and active server entitlement for main app records.
The narrow exceptions are self account/entitlement reads needed for setup, renewal, and recovery.

Rules block these direct SDK bypasses:

- unauthenticated main-app access;
- unverified main-app access;
- expired main-app access;
- reading another user's account or entitlement;
- client role/email/verification/expiry edits;
- client entitlement writes;
- client officer-grant writes;
- organization profile updates by non-owners/non-officers;
- owner reassignment by clients;
- private application or meeting reads by unrelated users;
- collection scans for private application and meeting collections.

Storage rules allow active verified users to read organization images.
Only an organization owner or active officer grant can write images under that organization's logo or announcement image paths.
Allowed upload content types are JPEG, PNG, WebP, and GIF, with a 5 MiB size limit.

Storage paths:

- `organization-logos/{orgId}/{fileName}`
- `announcement-images/{orgId}/{announcementId}/{fileName}`

## Local setup

Install dependencies from the repository root:

```bash
npm ci
```

Copy `app/backend/.env.example` to a private local environment file or configure equivalent Firebase/Cloud secrets.
Do not commit real PayMongo keys, service-account keys, or webhook secrets.

Useful commands:

```bash
npm run build
npm run typecheck
npm test
npm --workspace app/backend run test:payments
npm run test:rules
```

The Firebase emulator config uses these default ports:

- Auth: `127.0.0.1:9099`
- Functions: `127.0.0.1:5001`
- Firestore: `127.0.0.1:8080`
- Firestore websocket: `127.0.0.1:9151`
- Storage: `127.0.0.1:9199`

`firebase emulators:exec --project soar-a711e --only firestore,storage "npm --workspace app/backend run test:rules"` is the standard rules-test command.
In this WSL-like environment, Firebase CLI could not pass the Firestore `webchannel_port` needed by the local Java runtime, so the combined storage test did not complete here.
A manual Firestore emulator run with explicit `--webchannel_port=18081` did run the Firestore rule tests successfully.

Manual Firestore command used for local validation:

```bash
java -Djdk.net.usePlainSocketImpl=true -Djava.net.preferIPv4Stack=true -Duser.language=en \
  -jar ~/.cache/firebase/emulators/cloud-firestore-emulator-v1.19.8.jar \
  --host=127.0.0.1 \
  --port=18080 \
  --websocket_port=19151 \
  --webchannel_port=18081 \
  --project_id=soar-a711e \
  --rules=firestore.rules
```

Then run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 npm --workspace app/backend exec -- vitest run test/firestore.rules.test.ts
```

## Production prerequisites

Before production acceptance:

- Authenticate with the existing Firebase project and verify live Auth, Firestore, Storage, Hosting, Functions, and billing settings.
- Configure Firebase web API key for the email-change endpoint.
- Decide whether to enable Identity Platform blocking functions to reject direct public Firebase Auth signups that bypass paid registration.
- Store PayMongo secrets outside the repository.
- Register the PayMongo webhook endpoint.
- Complete merchant approval and one real PHP10 GCash live test.
- Deploy rules and functions only after explicit production authorization.
