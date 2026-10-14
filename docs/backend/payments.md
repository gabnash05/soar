# SOAR backend paid-access foundation

This document is the integration contract for the paid-access backend lane. It records the current provider facts, trusted flow, frontend API shape, identity handoff, emulator notes, and remaining operational dependencies.

## Current implementation status

Implemented under `app/backend/src/payments/**`:

- PayMongo hosted-checkout provider client with server-held secret key only.
- Registration checkout intents that store only hashes of browser-held binding secrets.
- PayMongo webhook signature verification against the raw body before JSON parsing.
- Provider-confirmed webhook processing for `checkout_session.payment.paid` only.
- Exact amount/currency enforcement: **PHP 10.00 = 1000 minor units**, `PHP`.
- Provider checkout-session/payment/reference association checks.
- Idempotent provider-event recording, duplicate/replay handling, and transactional state changes.
- Registration completion that calls the identity foundation helper after payment confirmation.
- Manual renewal checkout and entitlement extension.
- Paid-but-unfinished registration recovery by rotating the registration binding secret.
- Unit/mock tests for signatures, amount/currency, duplicate/concurrent/out-of-order webhooks, theft/reuse, renewal binding, failure/cancel/expiry, provider failure, recovery, and six-month calendar expiry arithmetic.

No production deploy, live payment, merchant activation, or shared Firebase manifest edit is included in this PR.

## Provider facts rechecked

Rechecked from official PayMongo sources at **2026-10-07T12:54:17Z UTC** and saved outside the repo under Firstmate task evidence.

| Fact | Current official source |
| --- | --- |
| Hosted Checkout is created from the backend with a secret key; never from the frontend. | PayMongo Hosted Checkout quick start, retrieved 2026-10-07: <https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start.md> |
| PayMongo's quick start tells merchants to subscribe to `checkout_session.payment.paid` and treat the webhook as the source of truth. | Same quick start source above. |
| New integrations should use `/v2/checkout_sessions`, save the Checkout Session ID, and use the `checkout_session.payment.paid` webhook. | Create checkout session V2, updated 2026-09-24 and retrieved 2026-10-07: <https://docs.paymongo.com/reference/create_checkout_sessions_2.md> |
| Checkout line-item amounts are in centavos/minor units and `PHP` is the only supported currency; `gcash` is an allowed checkout payment method. | Create Checkout Session and Checkout Session Resource, retrieved 2026-10-07: <https://docs.paymongo.com/reference/create-a-checkout.md>, <https://docs.paymongo.com/reference/checkout-session-resource.md> |
| Webhook signatures use the `Paymongo-Signature` header with `t`, `te`, and `li`; verification signs `timestamp.rawBody` with HMAC-SHA256 and the webhook secret, using `te` for test mode and `li` for live mode. | Webhook setup/management, retrieved 2026-10-07: <https://docs.paymongo.com/docs/developer-tools-webhook-setup-management.md> |
| Webhook production guidance requires raw body preservation, timing-safe signature comparison, duplicate event handling, 2xx for unrecognized events, and separate test/live endpoints. | Go-live checklist and webhook best practices, retrieved 2026-10-07: <https://docs.paymongo.com/docs/developer-tools-go-live-checklist.md>, <https://docs.paymongo.com/docs/developer-tools-best-practices.md> |
| Public pricing still describes Standard pay-as-you-go as no setup/monthly/hidden fees, prices VAT-exclusive, and GCash e-wallet payments at 2.23%. | PayMongo pricing, retrieved 2026-10-07: <https://www.paymongo.com/en/pricing> |
| Test mode uses test keys and does not move real money; live mode needs live keys and merchant readiness. | PayMongo testing docs, retrieved 2026-10-07: <https://docs.paymongo.com/docs/payment-acceptance-testing.md> |

PayMongo remains the intended GCash provider, but production acceptance still requires merchant approval, live keys, webhook registration, and one successful live PHP10 GCash test. PayMongo is not represented as free or cheapest.

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

Current implementation note: this PR is dependency-free JavaScript because the shared TypeScript backend build owned by identity foundation is not in `origin/main` yet. The runtime interface is intentionally narrow (`PaymentAccessService` plus `createPaymentsHttpHandlers`) so the identity lane can wire it into the shared TypeScript/Firebase Functions stack without payment code editing shared manifests. If the merged foundation requires `.ts` modules, convert these payment modules in-place and keep the helper input/output shape above unchanged. When wiring to Firebase Admin, pass `toIdentityTimestamp: (date) => FirebaseFirestore.Timestamp.fromDate(date)` so the helper receives the timestamp type shown in the shared contract.

## Firestore collections used by payment code

Payment-owned collections:

- `paymentRegistrationIntents/{intentId}`: pre-account checkout/registration state. Stores `secretHash`, never the plaintext browser binding secret or password.
- `payments/{paymentId}`: provider checkout/payment records for registration and renewal.
- `paymentCheckoutSessions/{providerCheckoutSessionId}`: checkout-session to internal payment index.
- `paymentProviderEvents/{providerEventId}`: webhook idempotency records.
- `paymentRateLimits/{key}`: backend abuse-control buckets when using the repository-backed rate limiter.

Shared identity collections read/written through approved boundaries:

- `accounts/{uid}`: identity-owned account profile.
- `entitlements/{uid}`: server-owned access state. Renewal writes include `status`, `provider`, `accessExpiresAt`, `lastProviderEventId`, `latestPaymentId`, and `history[]`.

## Frontend HTTP contract

The frontend foundation contract remains the public TypeScript shape in `app/frontend/src/lib/contracts.ts`. The browser does **not** receive or store payment-provider secrets and does **not** receive a completion token in JSON.

The secure registration binding is an **HttpOnly SameSite=Lax cookie** set by the backend when checkout starts:

- Cookie name: `__Host-soar_reg`
- Contents: opaque backend registration binding for one intent.
- Scope: `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` in deployed HTTPS environments.
- Purpose: lets `getCheckoutStatus` and `registerAccount` prove that the browser completing account creation is the same browser that started checkout, without adding a token field to frontend TypeScript contracts or putting secrets into redirect URLs.

### `POST /api/payments/registration/start`

Frontend method: `startRegistrationPayment(input)`.

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

Response header sets `__Host-soar_reg`.

### `GET /api/payments/registration/status?intentId=reg_...`

Frontend method: `getCheckoutStatus(intentId)`.

Requires the matching `__Host-soar_reg` cookie. Browser redirects from PayMongo are not trusted; this endpoint reports only server-side provider-confirmed state.

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

When the signed PayMongo webhook confirms payment, `canCreateAccount` becomes `true` and `message` changes. `status` remains `pending` until the account exists because frontend `AccessStatus` has no separate `paid_unfinished` value.

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

- Requires matching `__Host-soar_reg` cookie.
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

Response is intentionally non-enumerating:

```json
{ "accepted": true, "delivery": "sent" }
```

If a paid unfinished intent exists, the backend rotates the binding secret and uses a configured recovery sender to deliver a private recovery link/instructions. If no sender is configured in an emulator/local environment the result is `not_configured`; production needs email delivery from the identity/notifications lane before relying on this UX.

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
- Validate amount `1000`, currency `PHP`, GCash source when present, checkout session id, provider reference or metadata payment id, expected livemode, and internal payment amount/currency.
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
- renewal checkout by IP.

Production should back `paymentRateLimits` with Firestore so limits are shared across function instances. Frontend must still show friendly retry messages for `rate_limited` responses.

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
node --test app/backend/src/payments/__tests__/payments.test.js
```

For Firebase emulator integration after the identity foundation lands shared manifests:

- `PAYMONGO_SECRET_KEY=sk_test_...`
- `PAYMONGO_WEBHOOK_SECRET=...`
- `PAYMONGO_EXPECTED_LIVEMODE=false`
- `PAYMENT_SECRET_PEPPER=<random local secret>`
- `PAYMENT_SECURE_COOKIES=false` for local HTTP only; deployed HTTPS should use secure cookies
- `SOAR_APP_BASE_URL=http://localhost:5173`
- Firebase Auth and Firestore emulators running through the shared backend functions entrypoint.
- Webhook tests can use PayMongo dashboard test events or signed local fixtures; do not mark payment completed without a signed provider-shaped event.

Live prerequisites before production acceptance:

- PayMongo merchant approval/KYC/KYB.
- Live PayMongo secret key and webhook secret stored in Secret Manager or equivalent, never committed.
- Dashboard webhook registered for `checkout_session.payment.paid` against the production HTTPS endpoint.
- Separate test/live webhook endpoints and expected livemode settings.
- Successful live PHP10 GCash checkout and webhook confirmation.
- Firebase/Google Cloud billing and Identity Platform blocking-function decision for direct signup resistance.

## Verification evidence in this PR

Executed locally:

```bash
node --test app/backend/src/payments/__tests__/payments.test.js
find app/backend/src/payments -name '*.js' -print0 | xargs -0 -n1 node --check
```

Covered by mock/unit tests:

- valid and invalid signed PayMongo callbacks,
- wrong amount/currency/session/reference rejection,
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
- authenticated access-status visibility.

Not covered here because it needs shared infrastructure or external credentials:

- Firebase Auth/Firestore emulator integration through the final identity functions entrypoint.
- PayMongo sandbox/dashboard webhook delivery to a public emulator tunnel.
- Any live GCash charge.
