# SOAR backend paid-access foundation

This document records the paid-access backend contract. **Current as of 2026-10-22:** new Checkout Sessions v2 use QR Ph only, authenticated registration is bound to the same Firebase UID, and one trusted-Admin global `paymentsRequired` setting is persisted in `systemSettings/paymentPolicy`. The earlier GCash-only and cookie-only registration descriptions below are historical details where noted; use the current QR Ph/Admin policy section and `data/soar-payment-activation/integration-handoff.md` for activation status.

## Current implementation status

Implemented under `app/backend/src/payments/**`:

- PayMongo Hosted Checkout Sessions v2 provider client with server-held secret key only; new sessions request QR Ph (`qrph`) only.
- Registration checkout intents that store only hashes of browser-held binding secrets.
- PayMongo webhook signature verification against the raw body before JSON parsing.
- Provider-confirmed webhook processing for `checkout_session.payment.paid` only.
- Exact amount/currency enforcement: **PHP 10.00 = 1000 minor units**, `PHP`.
- Provider checkout-session/payment/reference association checks.
- Idempotent provider-event recording, duplicate/replay handling, and transactional state changes.
- Registration completion that calls the identity foundation helper after payment confirmation.
- Manual renewal checkout and entitlement extension.
- Paid-but-unfinished registration recovery code/binding logic; the optional `RecoverySender` remains unwired, so no email delivery is claimed.
- Same-UID authenticated registration start/status/resume/completion; account/profile and provider-confirmed entitlement creation remain gated on a valid signed paid event.
- Persisted Admin-only global payment policy with non-secret readiness status and server-side enforcement for unpaid registration, paid checkout starts and renewal starts.
- Unit/mock tests for QR Ph-only sessions, method/amount/currency, signature/mode, duplicate/concurrent/out-of-order webhooks, UID binding, theft/reuse, renewal, failure/cancel/expiry, provider failure, recovery behavior and six-month calendar expiry arithmetic.

No production deploy, live payment, merchant activation, or shared Firebase manifest edit is included in this PR.

## Provider facts rechecked

Rechecked from official PayMongo sources at **2026-10-07T12:54:17Z UTC** and saved outside the repo under Firstmate task evidence.

| Fact | Current official source |
| --- | --- |
| Hosted Checkout is created from the backend with a secret key; never from the frontend. | PayMongo Hosted Checkout quick start, retrieved 2026-10-07: <https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start.md> |
| PayMongo's quick start tells merchants to subscribe to `checkout_session.payment.paid` and treat the webhook as the source of truth. | Same quick start source above. |
| New integrations should use `/v2/checkout_sessions`, save the Checkout Session ID, and use the `checkout_session.payment.paid` webhook. | Create checkout session V2, updated 2026-09-24 and retrieved 2026-10-07: <https://docs.paymongo.com/reference/create_checkout_sessions_2.md> |
| Checkout line-item amounts are integer centavos in PHP. QR Ph is documented for Individual accounts; GCash is one issuer app for QR Ph and is not the same as accepting direct GCash checkout. Public QR Ph minimum is PHP1.00. | PayMongo QR Ph payment-channel, checkout and testing docs, read-only recheck 2026-10-22; links in the task handoff. |
| Webhook signatures use the `Paymongo-Signature` header with `t`, `te`, and `li`; verification signs `timestamp.rawBody` with HMAC-SHA256 and the webhook secret, using `te` for test mode and `li` for live mode. | Webhook setup/management, retrieved 2026-10-07: <https://docs.paymongo.com/docs/developer-tools-webhook-setup-management.md> |
| Webhook production guidance requires raw body preservation, timing-safe signature comparison, duplicate event handling, 2xx for unrecognized events, and separate test/live endpoints. | Go-live checklist and webhook best practices, retrieved 2026-10-07: <https://docs.paymongo.com/docs/developer-tools-go-live-checklist.md>, <https://docs.paymongo.com/docs/developer-tools-best-practices.md> |
| Public Standard pricing lists QR Ph at 1.34% exclusive of VAT; actual merchant fees/settlement are unverified. | PayMongo pricing, read-only recheck 2026-10-22: <https://www.paymongo.com/en/pricing> |
| QR Ph test mode can return a real/scannable QR; PayMongo directs test simulation through the Checkout response `test_url`. Never scan/pay a test QR. | PayMongo payment-channel testing docs, read-only recheck 2026-10-22: <https://docs.paymongo.com/docs/payment-channels-testing.md> |

The provider path is PayMongo Hosted Checkout Sessions v2 with QR Ph only for new sessions. Public docs show PHP10 is above the QR Ph PHP1.00 minimum, but the merchant’s actual QR Ph activation, account status, fees and payout setup remain unknown. Public readiness does not prove merchant activation. No provider call/session/QR or webhook setup was performed; do not scan/pay any QR Ph test QR. PayMongo fees are not zero.

## Shared identity boundary

The identity lane owns Firebase Auth lifecycle, account documents, organization ownership/grants, shared TypeScript build/contracts, Firebase rules/config, and CI/build manifests.

The paid-access lane owns checkout/registration intents, provider verification, provider-event idempotency, six-month entitlement calculations, recovery of paid unfinished registrations, and renewal payment confirmation.

Payment completion calls the identity helper shape agreed in `data/soar-identity-foundation/payment-coordination.md`:

```ts
createPaidAccountFromConfirmedRegistration(input: {
  email: string;
  password: string;
  displayName: string;
  role: 'student' | 'sponsor';
  studentId?: string;
  companyName?: string;
  entitlement: {
    provider: string;
    providerEventId: string;
    accessExpiresAt: FirebaseFirestore.Timestamp;
    amount: { currency: 'PHP'; minor: 1000 };
    intentId: string;
  };
}): Promise<{ uid: string }>;
```

Current implementation uses the existing TypeScript Firebase/Express API and Firebase Admin identity helper. The new same-UID registration route passes the authenticated UID to `createPaidAccountFromConfirmedRegistration` only after webhook verification; the legacy pre-auth route may still create Auth after paid completion. Payment code adapts expiry dates to Firestore `Timestamp` before writing identity-owned records.

## Firestore collections used by payment code

Payment-owned collections:

- `systemSettings/paymentPolicy`: singleton global payment requirement boolean and Admin audit metadata; user clients have no direct Firestore read/write grant. The API exposes only the non-secret policy/readiness response and trusted Admin writes.

- `paymentRegistrationIntents/{intentId}`: pre-account checkout/registration state. Stores `secretHash`, never the plaintext browser binding secret or password.
- `payments/{paymentId}`: provider checkout/payment records for registration and renewal.
- `paymentCheckoutSessions/{providerCheckoutSessionId}`: checkout-session to internal payment index.
- `paymentProviderEvents/{providerEventId}`: webhook idempotency records.
- `paymentRateLimits/{key}`: backend abuse-control buckets when using the repository-backed rate limiter.

Shared identity collections read/written through approved boundaries:

- `accounts/{uid}`: identity-owned account profile.
- `entitlements/{uid}`: server-owned access state. Renewal writes include `status`, `provider`, `accessExpiresAt`, `lastProviderEventId`, `latestPaymentId`, and `history[]`.

## Frontend HTTP contract

The frontend contract remains in `app/frontend/src/lib/contracts.ts`. The browser does **not** receive or store provider secrets or a payment completion token. New UI flow uses the authenticated same-UID routes described below; the cookie-bound routes that follow remain as the legacy pre-auth compatibility path.

The old anonymous/pre-auth registration binding remains an **HttpOnly SameSite=Lax cookie** set by the legacy checkout route. The current frontend flow uses the authenticated same-UID routes below and does not depend on that cross-site cookie. Do not weaken or remove the legacy cookie safeguards.

- Cookie name: `__Host-soar_reg`
- Contents: opaque backend registration binding for one intent.
- Scope: `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` in deployed HTTPS environments.
- Purpose: lets `getCheckoutStatus` and `registerAccount` prove that the browser completing account creation is the same browser that started checkout, without adding a token field to frontend TypeScript contracts or putting secrets into redirect URLs.

### Legacy `POST /api/payments/registration/start`

Frontend method: `startRegistrationPayment(input)`. New UI should use the authenticated same-UID route instead.

Request body:

```json
{
  "role": "student",
  "email": "ada@example.edu",
  "displayName": "Ada Lovelace",
  "studentId": "2026-0001",
  "department": "Computer Engineering Department",
  "companyName": null,
  "returnUrl": "https://soar.example/access/register"
}
```

Rules:

- `role` is `student` or `sponsor`. Officers are student accounts with organization grants, not an account role.
- Students require `studentId` and one supported canonical `department` label; sponsors may include `companyName` and must not include `department`.
- Password is not accepted here and must not be sent before provider payment confirmation.
- Backend checks for existing account/email through the identity adapter.
- Any client `returnUrl` value is ignored. The backend builds success and cancel URLs from its configured `SOAR_APP_BASE_URL` and the shipped `/access/checkout?intentId=...` route. `SOAR_APP_BASE_URL` is required for checkout; the code fails closed when it is missing or non-HTTPS outside localhost development instead of redirecting to a baked-in host.

Response body matches `RegistrationPaymentIntent`:

```json
{
  "intentId": "reg_...",
  "checkoutUrl": "https://checkout.paymongo.com/...",
  "status": "pending",
  "amountPhp": 10,
  "expiresAt": "2026-10-09T15:00:00.000Z",
  "providerLabel": "PayMongo"
}
```

Response header sets `__Host-soar_reg` for the legacy anonymous flow only.

### `GET /api/payments/registration/status?intentId=reg_...`

Frontend method: `getCheckoutStatus(intentId)`.

Legacy route requires the matching `__Host-soar_reg` cookie. Browser redirects from PayMongo are not trusted; this endpoint reports only server-side provider-confirmed state. The new same-UID route is `GET /api/payments/registration/auth-status?intentId=...`.

Response body matches `CheckoutStatus`:

```json
{
  "intentId": "reg_...",
  "status": "pending",
  "amountPhp": 10,
  "message": "Waiting for provider-confirmed payment.",
  "canCreateAccount": false
}
```

When the signed PayMongo webhook confirms payment, `canCreateAccount` becomes `true` and `message` changes. `status` remains `pending` until the account exists because frontend `AccessStatus` has no separate `paid_unfinished` value. The response also includes a password-free server-locked `registrationProfile`, so a recovered browser can resume without trusting editable client fields. The frontend must use only `canCreateAccount` from this cookie-bound endpoint as its completion gate; `pending` is not contradictory and browser redirects are never payment evidence.

### `POST /api/payments/registration/complete`

Frontend method: `registerAccount(input)`.

Request body follows current `RegisterAccountInput` but the backend only needs `intentId` and `password` because the profile was locked into the paid registration intent before checkout:

```json
{
  "intentId": "reg_...",
  "email": "ada@example.edu",
  "password": "user-entered-at-completion-only",
  "displayName": "Ada Lovelace",
  "role": "student",
  "studentId": "2026-0001"
}
```

Rules:

- Legacy route requires matching `__Host-soar_reg` cookie. The new same-UID completion route is `POST /api/payments/registration/auth-complete` and accepts only the bound intent id.
- Fails unless PayMongo webhook already marked the intent paid.
- Calls `createPaidAccountFromConfirmedRegistration` exactly once/idempotently through identity foundation.
- Password is passed only to identity helper and never persisted or logged by payment code.
- On success the backend clears `__Host-soar_reg`.

Response:

```json
{
  "uid": "firebase-auth-uid",
  "completed": true,
  "accessExpiresAt": "2027-04-07T15:00:00.000Z"
}
```

### `POST /api/payments/registration/recover`

Used for safe recovery when payment succeeded but account creation was not finished in the original browser/session.

Request:

```json
{
  "email": "ada@example.edu",
  "checkoutSessionId": "cs_optional_paymongo_session"
}
```

Response is intentionally non-enumerating when delivery is configured: `{ "accepted": true, "delivery": "sent" }` is returned whether or not a paid registration matched, and sender failures do not expose match state. If a paid unfinished intent exists, the backend creates a one-time recovery code and uses a configured recovery sender to deliver the intent id and code. The original browser binding remains valid until the code is accepted. If no sender is configured, the result is `{ "accepted": true, "delivery": "not_configured" }` without changing that binding; production needs email delivery from the identity/notifications lane before relying on cross-browser recovery.

### `POST /api/payments/registration/recover/accept`

Request:

```json
{ "intentId": "reg_...", "recoveryCode": "one-time-code-from-email" }
```

The backend accepts only an unexpired code for a payment-confirmed registration, rotates it into a fresh registration binding, and sets the same `__Host-soar_reg` HttpOnly cookie. The response is `{ "accepted": true }`; neither recovery nor registration binding secrets are returned in JSON or placed in a URL. Codes expire after 24 hours and are one-use.

### `POST /api/payments/renewals/start`

Frontend method: `requestManualRenewal(input)`.

Requires an authenticated Firebase session. The backend uses `context.auth.uid`; it rejects any attempt to renew a different uid.

Response body matches `RenewalRequest`:

```json
{
  "renewalId": "pay_...",
  "checkoutUrl": "https://checkout.paymongo.com/...",
  "status": "pending",
  "amountPhp": 10,
  "providerLabel": "PayMongo"
}
```

### `GET /api/payments/renewals/status?renewalId=pay_...`

Requires Firebase bearer authentication. The backend returns status only when the payment purpose is renewal and its uid matches the authenticated account. `status` is `pending`, `confirmed`, or `failed`; a confirmed response includes the server-issued expiry. Browser return parameters never change payment state.

### `GET /api/payments/access/status`

Frontend method: `getAccessStatus()`.

Requires the same authenticated uid. Returns server-owned access only:

```json
{
  "uid": "firebase-auth-uid",
  "status": "active",
  "active": true,
  "accessExpiresAt": "2027-04-07T15:00:00.000Z",
  "latestPaymentId": "pay_...",
  "feePhp": 10,
  "periodMonths": 6,
  "periodLabel": "6 months",
  "serverTime": "2026-10-07T15:00:00.000Z"
}
```

### `POST /api/webhooks/paymongo`

PayMongo webhook endpoint. It must receive the raw request body and the `Paymongo-Signature` header.

Processing rules:

- Verify signature before parsing JSON.
- Reject stale or bad signatures.
- Ignore and 2xx unhandled event types.
- Process only `checkout_session.payment.paid`.
- Validate amount `1000`, currency `PHP`, the exact payment method recorded on the payment (`qrph` for new checkouts; legacy missing-method records use their historical GCash behavior), checkout session id, provider reference or metadata payment id, expected livemode, and internal payment amount/currency.
- Deduplicate by provider event id and keep exactly-once state transitions in transactions.

## Six-month access and renewal policy

SOAR access is a **manual six-month purchase**, not an automatic subscription.

- The price remains **PHP 10.00 = 1000 minor units** unless separately changed.
- New registration access starts from provider-confirmed paid time and expires six UTC calendar months later.
- Renewal access starts from the later of current future expiry or provider-confirmed paid time.
- Early renewal therefore stacks exactly six additional calendar months onto the current future expiry.
- Expired renewal starts from the new confirmed payment time.
- Calendar-month arithmetic preserves day/time in UTC when possible. Month-end dates clamp to the last valid day of the target month, including leap-year February.
- Already-issued stored expiry dates are preserved; this code does not retroactively truncate paid rights or migrate live data.
- Pending, failed, cancelled, invalid, or expired checkout/payment records never unlock account creation or main app access.
- Expiry locks main workflow access but preserves account and product records for manual renewal.

## Abuse controls

Payment code exposes repository-backed rate-limit hooks for:

- unauthenticated registration checkout by email hash and IP,
- unauthenticated registration completion by IP,
- renewal checkout by IP,
- recovery-code acceptance by IP.

Recovery email requests are also rate-limited by email hash and IP. Production should back `paymentRateLimits` with Firestore so limits are shared across function instances. Frontend must still show friendly retry messages for `rate_limited` responses.

## QR Ph and global Admin policy (current)

- New provider requests use `payment_method_types: ['qrph']` only. The paid webhook validator binds the payment source to the method saved on the internal payment record. Legacy records without a method continue to validate as historical GCash; legitimate payment history is not rewritten.
- Public `GET /payment-policy` exposes only `{ paymentsRequired, checkout: { status, mode } }`; it returns no credential values. `GET/PUT /admin/payment-policy` require a server-verified Firebase token with `soarAdmin: true`. Writes accept only `{ paymentsRequired: boolean }` and store actor/timestamp audit metadata.
- No saved policy defaults to `paymentsRequired=false`; credentials and `SOAR_DISABLE_PAYMENTS=false` do not opt into charging. Free account registration uses only explicit `unpaid-preview` provenance and creates no paid entitlement/event. `paymentsRequired=true` prevents that preview path and permits new registration/renewal checkout only when `SOAR_DISABLE_PAYMENTS` is not true and required server configuration is present.
- `SOAR_DISABLE_PAYMENTS=true` remains a hard stop and Admin cannot override it. Readiness reports deployment-disabled, configuration-not-ready, or server-configured test/live mode; it does not claim merchant QR Ph activation. The existing frontend `VITE_SOAR_PAYMENTS_ENABLED=false` remains an additional UI/build stop.
- Turning payment requirements on stops access based only on the explicit unpaid-preview marker. Active provider-confirmed entitlements remain authoritative and revoked records remain revoked. The setting does not edit history, expiry, profiles, or entitlements, and does not implement the separately approved existing-account grandfather grant whose start/duration remains undecided.
- New registration route sequence: create/sign in to Firebase Auth, call authenticated `/payments/registration/auth-start`, redirect to hosted Checkout, then use authenticated `/payments/registration/auth-status`, `/payments/registration/resume` and `/payments/registration/auth-complete`. All are tied to the same UID. The server creates the SOAR profile and provider-confirmed entitlement only after a matching signed paid webhook.
- Test readiness must not be mistaken for a real integration test. QR Ph test mode may show a real/scannable QR; never scan/pay it. Use only PayMongo’s response `test_url` simulator after a separate bounded test window is approved.

## Firebase/Auth bypass constraints

Payment-first account creation cannot be fully guaranteed by frontend discipline alone if public Firebase email/password signup remains open: anyone with the web API key can call Firebase Auth signup REST endpoints outside the SOAR UI.

Required production hardening:

1. Use the identity helper for all legitimate paid account creation.
2. Firestore/Storage rules must require server-created `accounts/{uid}` and active `entitlements/{uid}` for main app data, so stray Auth users have no product access.
3. To prevent stray Auth users from existing at all, enable Firebase Identity Platform blocking functions (`beforeCreate`) to reject direct signup attempts that lack a server-approved paid registration context. This may require Google Cloud/Firebase billing and Identity Platform availability.
4. If blocking functions are not enabled, document the residual risk and add monitoring/cleanup for unprovisioned Auth users. Do not claim strict payment-before-Auth enforcement in that configuration.

This PR does not enable billing, deploy blocking functions, or change shared Auth configuration.

## Emulator and sandbox configuration

Payment unit tests are dependency-free and run without Firebase or PayMongo credentials:

```bash
npm --workspace app/backend run test:payments
```

The script runs the signed-webhook/service suite and the dependency-free Firestore payment repository contract test serially.

For Firebase emulator integration after the identity foundation lands shared manifests:

- `PAYMONGO_SECRET_KEY=sk_test_...`
- `PAYMONGO_WEBHOOK_SECRET=...`
- `PAYMONGO_EXPECTED_LIVEMODE=false`
- `PAYMENT_SECRET_PEPPER=<random local secret>`
- `PAYMENT_SECURE_COOKIES=false` for local HTTP only; deployed HTTPS should use secure cookies
- `SOAR_APP_BASE_URL=http://localhost:5173` for the local app; the deployed value must be the exact first-party frontend origin selected by the deployment owner. There is no hard-coded production-host fallback.
- `PAYMENT_SECURE_COOKIES=false` only for local plain-HTTP emulator work; the code defaults cookies to Secure and HTTPS deployments must keep it enabled.
- The frontend API base must point to the selected runtime. `/api` is appropriate only when the selected host actually routes that path to the API. For a separate API origin, verify credentialed CORS and browser cookie delivery before relying on the `__Host-`, `SameSite=Lax`, Secure binding; do not weaken HttpOnly/Secure/SameSite protections to compensate.
- Firebase Auth and Firestore emulators running through the shared backend functions entrypoint.
- Webhook tests can use PayMongo dashboard test events or signed local fixtures; do not mark payment completed without a signed provider-shaped event.

Live prerequisites before production acceptance:

- PayMongo merchant approval/KYC/KYB.
- Live PayMongo secret key and webhook secret stored in Secret Manager or equivalent, never committed.
- Dashboard webhook registered for `checkout_session.payment.paid` against the production HTTPS endpoint.
- Separate test/live webhook endpoints and expected livemode settings.
- Separately approved test-mode evidence through the PayMongo `test_url` simulator, then an independently authorized live QR Ph checkout/webhook confirmation if a live launch is approved. Never scan/pay a QR Ph test QR.
- Firebase/Google Cloud billing and Identity Platform blocking-function decision for direct signup resistance.

## Verification evidence in this PR

Executed locally:

```bash
npm --workspace app/backend run test:payments
find app/backend/src/payments -name '*.js' -print0 | xargs -0 -n1 node --check
```

Covered by mock/unit tests:

- valid and invalid signed PayMongo callbacks,
- wrong amount/currency/session/reference/payment-id/lane/intent-metadata rejection,
- duplicate and concurrent webhook deliveries,
- out-of-order failed-before-paid delivery,
- registration intent theft/reuse,
- pending/cancelled/expired locked states with records preserved,
- cancellation followed by valid paid webhook recovery,
- provider checkout failure recording,
- paid unfinished registration recovery,
- exactly one account/entitlement from completion through identity-helper idempotency,
- unauthorized renewal and malicious cross-account renewal metadata,
- manual six-month renewal expiry arithmetic,
- authenticated access-status visibility,
- Firestore repository persistence and checkout-session index lookups using an in-memory Firestore contract fake.

Not covered here because it needs shared infrastructure or external credentials:

- Firebase Auth/Firestore emulator integration through the final identity functions entrypoint.
- PayMongo test-mode webhook delivery to a public endpoint, only after a separately approved bounded test window. Until then, use local signed fixtures only.
- Any live QR Ph charge.
