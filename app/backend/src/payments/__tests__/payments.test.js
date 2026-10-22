'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PaymentAccessService } = require('../service');
const { PayMongoCheckoutProvider } = require('../paymongo');
const { MemoryPaymentRepository } = require('../repository');
const { FakePayMongoProvider, FakeIdentityFoundation } = require('../testing/fakes');
const { makeCheckoutPaidEvent, signPayMongoPayload } = require('../testing/paymongo-fixtures');
const { PAYMENT_STATUSES, REGISTRATION_STATUSES, ACCESS_PRICE_MINOR, ACCESS_CURRENCY } = require('../constants');
const { createPaymentsHttpHandlers, readRegistrationBinding } = require('../http');
const { addCalendarMonthsUtc } = require('../time');
const { loadPaymentConfigFromEnv } = require('../config');

const WEBHOOK_SECRET = 'whsec_test';
const NOW = new Date('2026-10-07T15:00:00.000Z');
const PAID_AT_SECONDS = Math.floor(NOW.getTime() / 1000);

function createHarness(options = {}) {
  const repository = new MemoryPaymentRepository(options.seed);
  const provider = options.provider || new FakePayMongoProvider(options.providerOptions);
  const identity = options.identity || new FakeIdentityFoundation(repository, options.identityOptions);
  const service = new PaymentAccessService({
    repository,
    provider,
    identity,
    appBaseUrl: options.appBaseUrl ?? 'http://localhost:5173',
    secretPepper: 'pepper_test',
    webhookSecret: options.webhookSecret === undefined ? WEBHOOK_SECRET : options.webhookSecret,
    expectedLivemode: options.expectedLivemode ?? false,
    signatureToleranceSeconds: options.signatureToleranceSeconds ?? 0,
    now: () => options.now || NOW,
    recoverySender: options.recoverySender,
  });
  return { repository, provider, identity, service };
}

async function startRegistration(harness, input = {}) {
  const profile = {
    role: 'student',
    fullName: 'Ada Lovelace',
    email: 'ada@example.edu',
    studentId: '2026-0001',
    department: 'Computer   Engineering   Department',
    ...input,
  };
  const email = profile.email.toLowerCase();
  const uid = `firebase-${email.replace(/[^a-z0-9]+/g, '-')}`;
  const authUser = { uid, email, emailVerified: false };
  const auth = { uid, email };
  harness.identity.usersByUid.set(uid, authUser);
  harness.identity.usersByEmail.set(email, authUser);
  const result = await harness.service.createRegistrationCheckout(profile, { auth, ip: '203.0.113.10' });
  return { ...result, auth };
}

const getRegistrationStatus = (harness, registration) => harness.service.getAuthenticatedRegistrationStatus(
  { intentId: registration.intentId },
  { auth: registration.auth },
);

const completeRegistration = (harness, registration) => harness.service.completePaidRegistration(
  { intentId: registration.intentId },
  { auth: registration.auth },
);

async function deliverPaidWebhook(harness, registration, overrides = {}) {
  const session = harness.provider.sessions[harness.provider.sessions.length - 1];
  const event = makeCheckoutPaidEvent({
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: session.paymentId, intentId: registration && registration.intentId, purpose: 'registration', ...(overrides.metadata || {}) },
    paidAt: PAID_AT_SECONDS,
    ...overrides,
  });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS, livemode: false });
  return harness.service.handlePayMongoWebhook(signed);
}

async function assertRejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error && error.code === code);
}

test('secure registration cookies default on even when PayMongo is configured for test mode', () => {
  assert.equal(loadPaymentConfigFromEnv({ PAYMONGO_EXPECTED_LIVEMODE: 'false' }).secureCookies, true);
  assert.equal(loadPaymentConfigFromEnv({ PAYMENT_SECURE_COOKIES: 'false' }).secureCookies, false);
  assert.equal(loadPaymentConfigFromEnv({}).appBaseUrl, '');
});

test('checkout creation fails closed when the deployment frontend origin is not configured', async () => {
  const harness = createHarness({ appBaseUrl: '' });
  await assertRejectsCode(startRegistration(harness), 'invalid_app_base_url');
  assert.equal(harness.provider.sessions.length, 0);
  assert.equal(Object.keys(harness.repository.snapshot().payments).length, 0);
});

test('anonymous or email-mismatched registration checkout is rejected before provider or identity side effects', async () => {
  const harness = createHarness();
  const profile = {
    role: 'student',
    fullName: 'Ada Lovelace',
    email: 'ada@example.edu',
    studentId: '2026-0001',
    department: 'Computer Engineering Department',
  };

  await assertRejectsCode(harness.service.createRegistrationCheckout(profile, { ip: '203.0.113.10' }), 'unauthorized_registration');
  const uid = 'firebase-ada';
  const authUser = { uid, email: profile.email, emailVerified: false };
  harness.identity.usersByUid.set(uid, authUser);
  harness.identity.usersByEmail.set(profile.email, authUser);
  await assertRejectsCode(harness.service.createRegistrationCheckout(profile, { auth: { uid: 'different-firebase-uid', email: profile.email } }), 'unauthorized_registration');
  await assertRejectsCode(harness.service.createRegistrationCheckout(profile, { auth: { uid, email: 'other@example.edu' } }), 'unauthorized_registration');

  assert.equal(harness.provider.sessions.length, 0);
  assert.equal(harness.identity.createCalls.length, 0);
  assert.equal(Object.keys(harness.repository.snapshot().registrationIntents).length, 0);
  assert.equal(Object.keys(harness.repository.snapshot().payments).length, 0);
});

test('registration stays locked until a valid signed PayMongo paid webhook confirms amount, currency, session and reference', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);

  let status = await getRegistrationStatus(harness, registration);
  assert.equal(status.canComplete, false);
  await assertRejectsCode(completeRegistration(harness, registration), 'registration_not_paid');

  const result = await deliverPaidWebhook(harness, registration);
  assert.equal(result.processed, true);

  status = await getRegistrationStatus(harness, registration);
  assert.equal(status.canComplete, true);
  assert.equal(status.checkoutUrl, null);

  const completion = await completeRegistration(harness, registration);
  assert.equal(completion.completed, true);

  const snapshot = harness.repository.snapshot();
  assert.equal(Object.keys(snapshot.accounts).length, 1);
  assert.equal(Object.keys(snapshot.entitlements).length, 1);
  assert.equal(Object.values(snapshot.accounts)[0].email, 'ada@example.edu');
  assert.equal(Object.values(snapshot.accounts)[0].department, 'Computer Engineering Department');
  assert.equal(Object.values(snapshot.accounts)[0].departmentKey, 'computer engineering department');
  assert.equal(Object.values(snapshot.entitlements)[0].status, 'active');
  assert.equal(Object.values(snapshot.payments)[0].amountMinor, ACCESS_PRICE_MINOR);
  assert.equal(Object.values(snapshot.payments)[0].currency, ACCESS_CURRENCY);
  assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.COMPLETED);
  assert.equal(JSON.stringify(snapshot).includes('StrongPass123'), false, 'password must never be persisted');
});

test('authenticated registration resumes by uid and only creates profile and entitlement after a signed payment', async () => {
  const harness = createHarness();
  const uid = 'firebase-auth-uid';
  const email = 'same-uid@example.edu';
  const authUser = { uid, email, emailVerified: false };
  harness.identity.usersByUid.set(uid, authUser);
  harness.identity.usersByEmail.set(email, authUser);
  const profile = {
    role: 'student',
    fullName: 'Ada Lovelace',
    email,
    studentId: '2026-0001',
    department: 'Computer Engineering Department',
  };
  const registration = await harness.service.createRegistrationCheckout(profile, { auth: { uid, email }, ip: '203.0.113.10' });
  assert.equal(registration.status, REGISTRATION_STATUSES.CHECKOUT_CREATED);
  assert.equal(registration.private, undefined, 'Auth-first checkout must not require a pre-auth cookie secret');

  let snapshot = harness.repository.snapshot();
  assert.equal(Object.values(snapshot.registrationIntents)[0].targetUid, uid);
  assert.equal(Object.values(snapshot.registrationIntents)[0].authFirst, true);
  assert.equal(Object.values(snapshot.accounts).length, 0);
  assert.equal(Object.values(snapshot.entitlements).length, 0);

  const resumedStart = await harness.service.createRegistrationCheckout(profile, { auth: { uid, email }, ip: '203.0.113.10' });
  assert.equal(resumedStart.intentId, registration.intentId);
  assert.equal(resumedStart.resumed, true);
  assert.equal(harness.provider.sessions.length, 1, 'retry reuses the existing open session');
  await assertRejectsCode(harness.service.getAuthenticatedRegistrationStatus({ intentId: registration.intentId }, { auth: { uid: 'other-uid', email } }), 'unauthorized_registration');
  await assertRejectsCode(harness.service.completePaidRegistration({ intentId: registration.intentId }, { auth: { uid: 'other-uid', email } }), 'unauthorized_registration');
  await assertRejectsCode(harness.service.completePaidRegistration({ intentId: registration.intentId }, { auth: { uid, email } }), 'registration_not_paid');

  const beforePaymentResume = await harness.service.getRegistrationResume({ auth: { uid, email } });
  assert.equal(beforePaymentResume.intentId, registration.intentId);
  assert.equal(beforePaymentResume.canComplete, false);
  await deliverPaidWebhook(harness, registration);

  const paidResume = await harness.service.getRegistrationResume({ auth: { uid, email } });
  assert.equal(paidResume.canComplete, true);
  const paidStatus = await harness.service.getAuthenticatedRegistrationStatus({ intentId: registration.intentId }, { auth: { uid, email } });
  assert.equal(paidStatus.checkoutUrl, null);
  const completion = await harness.service.completePaidRegistration({ intentId: registration.intentId }, { auth: { uid, email } });
  assert.equal(completion.uid, uid);
  assert.equal(completion.completed, true);
  assert.equal(harness.identity.createCalls[0].uid, uid);
  assert.equal(Object.hasOwn(harness.identity.createCalls[0], 'password'), false);

  snapshot = harness.repository.snapshot();
  assert.deepEqual(Object.keys(snapshot.accounts), [uid]);
  assert.deepEqual(Object.keys(snapshot.entitlements), [uid]);
  assert.equal(snapshot.accounts[uid].email, email);
  assert.equal(snapshot.entitlements[uid].history.length, 1);
});

test('hosted registration return URLs target the configured app route, never a fixture or an unmounted path', async () => {
  const harness = createHarness({ appBaseUrl: 'https://soar-a711e.web.app' });
  const registration = await startRegistration(harness);
  const checkout = harness.provider.sessions[0];
  assert.equal(checkout.successUrl, `https://soar-a711e.web.app/access/checkout?intentId=${encodeURIComponent(registration.intentId)}`);
  assert.equal(checkout.cancelUrl, `https://soar-a711e.web.app/access/checkout?intentId=${encodeURIComponent(registration.intentId)}&checkout=cancelled`);
  assert.equal(checkout.metadata.amountMinor, ACCESS_PRICE_MINOR);
  assert.equal(checkout.metadata.currency, ACCESS_CURRENCY);
});

test('registration department is student-only bounded profile data', async () => {
  const harness = createHarness();
  const sponsorEmail = 'sponsor@example.edu';
  const sponsorUid = 'firebase-sponsor';
  const sponsorUser = { uid: sponsorUid, email: sponsorEmail, emailVerified: false };
  harness.identity.usersByUid.set(sponsorUid, sponsorUser);
  harness.identity.usersByEmail.set(sponsorEmail, sponsorUser);
  await assertRejectsCode(harness.service.createRegistrationCheckout({
    role: 'sponsor',
    fullName: 'Sponsor User',
    email: sponsorEmail,
    companyName: 'Sponsor Co',
    department: 'Architecture Department'
  }, { auth: { uid: sponsorUid, email: sponsorEmail } }), 'department_not_allowed');
  await assertRejectsCode(startRegistration(harness, {
    email: 'ada2@example.edu',
    studentId: '2026-0002',
    department: '<script>alert(1)</script>'
  }), 'invalid_department');
  await assertRejectsCode(startRegistration(harness, {
    fullName: 'No Department',
    email: 'missing-department@example.edu',
    studentId: '2026-0003',
    department: undefined
  }), 'missing_department');
});

test('invalid webhook signatures are rejected before state changes', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  const session = harness.provider.sessions[0];
  const event = makeCheckoutPaidEvent({ checkoutSessionId: session.providerCheckoutSessionId, referenceNumber: session.referenceNumber, metadata: { paymentId: session.paymentId } });
  const signed = signPayMongoPayload(event, { secret: 'wrong_secret', timestamp: PAID_AT_SECONDS });

  await assertRejectsCode(harness.service.handlePayMongoWebhook(signed), 'invalid_signature');

  const snapshot = harness.repository.snapshot();
  assert.equal(Object.values(snapshot.payments)[0].status, PAYMENT_STATUSES.PENDING);
  assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.CHECKOUT_CREATED);
  assert.equal(registration.intentId, Object.keys(snapshot.registrationIntents)[0]);
});

test('missing webhook secret fails closed before any payment or registration state changes', async () => {
  const harness = createHarness({ webhookSecret: '' });
  const registration = await startRegistration(harness);

  await assertRejectsCode(deliverPaidWebhook(harness, registration), 'missing_webhook_secret');

  const snapshot = harness.repository.snapshot();
  assert.equal(Object.values(snapshot.payments)[0].status, PAYMENT_STATUSES.PENDING);
  assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.CHECKOUT_CREATED);
  assert.equal(Object.keys(snapshot.accounts).length, 0);
  assert.equal(Object.keys(snapshot.entitlements).length, 0);
});

test('stale signed webhooks are rejected before any payment or registration state changes', async () => {
  const harness = createHarness({ signatureToleranceSeconds: 300 });
  const registration = await startRegistration(harness);
  const session = harness.provider.sessions[0];
  const event = makeCheckoutPaidEvent({
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: session.paymentId, intentId: registration.intentId },
    paidAt: PAID_AT_SECONDS,
  });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS - 301 });

  await assertRejectsCode(harness.service.handlePayMongoWebhook(signed), 'stale_signature');

  const snapshot = harness.repository.snapshot();
  assert.equal(Object.values(snapshot.payments)[0].status, PAYMENT_STATUSES.PENDING);
  assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.CHECKOUT_CREATED);
  assert.equal(Object.keys(snapshot.processedEvents).length, 0);
});

test('live-mode signatures cannot be accepted by the test-mode webhook configuration', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  const session = harness.provider.sessions[0];
  const event = makeCheckoutPaidEvent({
    livemode: true,
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: session.paymentId, intentId: registration.intentId },
    paidAt: PAID_AT_SECONDS,
  });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS, livemode: true });

  await assertRejectsCode(harness.service.handlePayMongoWebhook(signed), 'invalid_signature');

  const snapshot = harness.repository.snapshot();
  assert.equal(Object.values(snapshot.payments)[0].status, PAYMENT_STATUSES.PENDING);
  assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.CHECKOUT_CREATED);
  assert.equal(Object.keys(snapshot.entitlements).length, 0);
});

test('new hosted checkout sessions request QR Ph only', async () => {
  let requestUrl;
  let requestInit;
  const provider = new PayMongoCheckoutProvider({
    secretKey: 'sk_test_unit',
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestInit = init;
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ data: { id: 'cs_qrph_unit', attributes: { checkout_url: 'https://checkout.paymongo.test/cs_qrph_unit', livemode: false } } }),
      };
    },
  });

  const session = await provider.createCheckoutSession({
    paymentId: 'pay_unit',
    referenceNumber: 'SOAR-pay_unit',
    billingName: 'Ada Lovelace',
    billingEmail: 'ada@example.edu',
    successUrl: 'https://soar.example/access/checkout',
    cancelUrl: 'https://soar.example/access/checkout?checkout=cancelled',
  });

  assert.equal(requestUrl, 'https://api.paymongo.com/v2/checkout_sessions');
  assert.deepEqual(JSON.parse(requestInit.body).data.attributes.payment_method_types, ['qrph']);
  assert.equal(requestInit.headers['Idempotency-Key'], 'pay_unit');
  assert.equal(session.providerCheckoutSessionId, 'cs_qrph_unit');
});

test('signed paid validation requires QR Ph for new sessions and preserves legacy GCash records', async () => {
  const qrphHarness = createHarness();
  const qrphRegistration = await startRegistration(qrphHarness);
  const qrphResult = await deliverPaidWebhook(qrphHarness, qrphRegistration, { sourceType: 'qrph' });
  assert.equal(qrphResult.processed, true);
  assert.equal(Object.values(qrphHarness.repository.snapshot().payments)[0].paymentMethod, 'qrph');
  assert.equal(Object.values(qrphHarness.repository.snapshot().payments)[0].status, PAYMENT_STATUSES.PAID);

  const legacyHarness = createHarness();
  const legacyRegistration = await startRegistration(legacyHarness);
  const legacyPayment = [...legacyHarness.repository.store.payments.values()][0];
  delete legacyPayment.paymentMethod; // Records created before the method switch are GCash sessions.
  const legacyResult = await deliverPaidWebhook(legacyHarness, legacyRegistration, { sourceType: 'gcash' });
  assert.equal(legacyResult.processed, true);
  assert.equal(Object.values(legacyHarness.repository.snapshot().payments)[0].status, PAYMENT_STATUSES.PAID);

  for (const [sourceType, expectedCode] of [['gcash', 'payment_method_mismatch'], ['card', 'payment_method_mismatch'], [null, 'payment_method_missing']]) {
    const harness = createHarness();
    const registration = await startRegistration(harness);
    const rejected = await deliverPaidWebhook(harness, registration, { sourceType });
    assert.equal(rejected.rejected, true);
    assert.equal(rejected.code, expectedCode);
    const snapshot = harness.repository.snapshot();
    assert.equal(Object.values(snapshot.payments)[0].status, PAYMENT_STATUSES.INVALID);
    assert.equal(Object.keys(snapshot.accounts).length, 0);
    assert.equal(Object.keys(snapshot.entitlements).length, 0);
  }
});

test('missing PayMongo API key never falls back to a fake checkout or makes a provider request', async () => {
  let providerCalls = 0;
  const provider = new PayMongoCheckoutProvider({
    secretKey: '',
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error('provider request should not be made without a key');
    },
  });
  const harness = createHarness({ provider });

  await assertRejectsCode(startRegistration(harness), 'missing_provider_secret');

  const snapshot = harness.repository.snapshot();
  assert.equal(providerCalls, 0);
  assert.equal(Object.values(snapshot.payments)[0].status, PAYMENT_STATUSES.FAILED);
  assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.CHECKOUT_FAILED);
  assert.equal(Object.keys(snapshot.accounts).length, 0);
  assert.equal(Object.keys(snapshot.entitlements).length, 0);
});

test('wrong amount, currency, session, reference or lane metadata is rejected without unlock', async () => {
  for (const [name, overrides, expectedCode] of [
    ['wrong amount', { amount: 999 }, 'payment_amount_mismatch'],
    ['wrong currency', { currency: 'USD' }, 'payment_amount_mismatch'],
    ['wrong session', { checkoutSessionId: 'cs_attacker' }, 'checkout_session_mismatch'],
    ['wrong reference', { referenceNumber: 'SOAR-wrong' }, 'provider_reference_mismatch'],
    ['wrong payment id metadata', { metadata: { paymentId: 'pay_attacker' } }, 'payment_id_mismatch'],
    ['wrong payment lane', { metadata: { purpose: 'renewal' } }, 'payment_purpose_mismatch'],
    ['wrong registration intent metadata', { metadata: { intentId: 'reg_attacker' } }, 'registration_intent_mismatch'],
  ]) {
    await test(name, async () => {
      const harness = createHarness();
      const registration = await startRegistration(harness);
      const result = await deliverPaidWebhook(harness, registration, overrides);
      assert.equal(result.rejected, true);
      assert.equal(result.code, expectedCode);
      const snapshot = harness.repository.snapshot();
      assert.equal(Object.values(snapshot.payments)[0].status, PAYMENT_STATUSES.INVALID);
      assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.CHECKOUT_CREATED);
    });
  }
});

test('duplicate and concurrent paid webhook deliveries are idempotent', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  const session = harness.provider.sessions[0];
  const event = makeCheckoutPaidEvent({
    eventId: 'evt_duplicate',
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: session.paymentId, intentId: registration.intentId },
    paidAt: PAID_AT_SECONDS,
  });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS });

  const results = await Promise.all([
    harness.service.handlePayMongoWebhook(signed),
    harness.service.handlePayMongoWebhook(signed),
  ]);

  assert.equal(results.filter((r) => r.processed).length, 1);
  const snapshot = harness.repository.snapshot();
  assert.equal(Object.values(snapshot.payments).filter((payment) => payment.status === PAYMENT_STATUSES.PAID).length, 1);
  assert.equal(Object.keys(snapshot.processedEvents).length, 1);
});

test('out-of-order failed events do not unlock, while the later signed paid event does', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  const session = harness.provider.sessions[0];
  const failedEvent = makeCheckoutPaidEvent({
    eventId: 'evt_failed_first',
    eventType: 'payment.failed',
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: session.paymentId },
    paymentStatus: 'failed',
  });
  const failedSigned = signPayMongoPayload(failedEvent, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS });

  const ignored = await harness.service.handlePayMongoWebhook(failedSigned);
  assert.equal(ignored.reason, 'unhandled_event_type');
  let status = await getRegistrationStatus(harness, registration);
  assert.equal(status.canComplete, false);

  await deliverPaidWebhook(harness, registration, { eventId: 'evt_paid_after_failed' });
  status = await getRegistrationStatus(harness, registration);
  assert.equal(status.canComplete, true);
});

test('registration status and completion reject a different Firebase UID and safely handle same-UID reuse', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  await deliverPaidWebhook(harness, registration);

  const otherAuth = { uid: 'different-firebase-uid', email: registration.auth.email };
  await assertRejectsCode(harness.service.getAuthenticatedRegistrationStatus({ intentId: registration.intentId }, { auth: otherAuth }), 'unauthorized_registration');
  await assertRejectsCode(harness.service.completePaidRegistration({ intentId: registration.intentId }, { auth: otherAuth }), 'unauthorized_registration');
  assert.equal(harness.identity.createCalls.length, 0);

  const first = await completeRegistration(harness, registration);
  const second = await completeRegistration(harness, registration);
  assert.equal(first.uid, second.uid);
  assert.equal(second.alreadyCompleted, true);
  assert.equal(Object.keys(harness.repository.snapshot().accounts).length, 1);
});

test('concurrent registration completion creates exactly one account and entitlement through identity helper idempotency', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  await deliverPaidWebhook(harness, registration);

  const results = await Promise.all([
    completeRegistration(harness, registration),
    completeRegistration(harness, registration),
  ]);

  assert.equal(results[0].uid, results[1].uid);
  const snapshot = harness.repository.snapshot();
  assert.equal(Object.keys(snapshot.accounts).length, 1);
  assert.equal(Object.keys(snapshot.entitlements).length, 1);
  assert.ok(harness.identity.createCalls.length >= 1);
});

test('pending, cancelled and expired registrations remain locked while records are preserved', async () => {
  const pendingHarness = createHarness();
  const pending = await startRegistration(pendingHarness);
  await assertRejectsCode(completeRegistration(pendingHarness, pending), 'registration_not_paid');

  const cancelledHarness = createHarness();
  const cancelled = await startRegistration(cancelledHarness);
  const cancelledStatus = await cancelledHarness.service.recordCheckoutCancelled({ intentId: cancelled.intentId }, { auth: cancelled.auth });
  assert.equal(cancelledStatus.status, REGISTRATION_STATUSES.CANCELLED);
  await assertRejectsCode(completeRegistration(cancelledHarness, cancelled), 'registration_not_paid');
  assert.equal(Object.keys(cancelledHarness.repository.snapshot().payments).length, 1);

  const expiredHarness = createHarness();
  const expired = await startRegistration(expiredHarness);
  const expiredStatus = await expiredHarness.service.expireRegistrationIntent({ intentId: expired.intentId });
  assert.equal(expiredStatus.status, REGISTRATION_STATUSES.EXPIRED);
  await assertRejectsCode(completeRegistration(expiredHarness, expired), 'registration_not_paid');
  assert.equal(Object.keys(expiredHarness.repository.snapshot().registrationIntents).length, 1);
});

test('paid webhook after browser cancellation safely recovers the unfinished registration', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  await harness.service.recordCheckoutCancelled({ intentId: registration.intentId }, { auth: registration.auth });
  await deliverPaidWebhook(harness, registration);
  const status = await getRegistrationStatus(harness, registration);
  assert.equal(status.canComplete, true);
});

test('provider checkout failures are recorded as failed and never create accounts', async () => {
  const harness = createHarness({ provider: new FakePayMongoProvider({ fail: true }) });
  await assertRejectsCode(startRegistration(harness), 'provider_checkout_failed');
  const snapshot = harness.repository.snapshot();
  assert.equal(Object.values(snapshot.payments)[0].status, PAYMENT_STATUSES.FAILED);
  assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.CHECKOUT_FAILED);
  assert.equal(Object.keys(snapshot.accounts).length, 0);
});







test('renewal requires same authenticated uid and malicious metadata cannot bind payment to another account', async () => {
  const seed = {
    accounts: {
      uid_1: { uid: 'uid_1', email: 'one@example.edu', displayName: 'One', role: 'student' },
      uid_2: { uid: 'uid_2', email: 'two@example.edu', displayName: 'Two', role: 'student' },
    },
  };
  const harness = createHarness({ seed });
  harness.identity.usersByUid.set('uid_1', { uid: 'uid_1', email: 'one@example.edu' });
  harness.identity.usersByUid.set('uid_2', { uid: 'uid_2', email: 'two@example.edu' });

  await assertRejectsCode(harness.service.createRenewalCheckout({ uid: 'uid_1' }, { auth: { uid: 'uid_2' }, ip: '198.51.100.4' }), 'unauthorized_renewal');

  const renewal = await harness.service.createRenewalCheckout({ uid: 'uid_1' }, { auth: { uid: 'uid_1' }, ip: '198.51.100.4' });
  const pendingStatus = await harness.service.getRenewalStatus({ renewalId: renewal.paymentId }, { auth: { uid: 'uid_1' } });
  assert.equal(pendingStatus.status, 'pending');
  await assertRejectsCode(harness.service.getRenewalStatus({ renewalId: renewal.paymentId }, { auth: { uid: 'uid_2' } }), 'renewal_not_found');
  const session = harness.provider.sessions[0];
  assert.match(session.successUrl, /^http:\/\/localhost:5173\/settings\/access\?renewalId=/);
  assert.match(session.successUrl, /checkout=success/);
  assert.match(session.cancelUrl, /checkout=cancelled/);
  const wrongLaneEvent = makeCheckoutPaidEvent({
    eventId: 'evt_renewal_wrong_uid',
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: renewal.paymentId, uid: 'uid_2', purpose: 'renewal' },
    paidAt: PAID_AT_SECONDS,
  });
  const wrongLaneResult = await harness.service.handlePayMongoWebhook(signPayMongoPayload(wrongLaneEvent, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS }));
  assert.equal(wrongLaneResult.rejected, true);
  assert.equal(wrongLaneResult.code, 'renewal_uid_mismatch');
  assert.equal(harness.repository.snapshot().entitlements.uid_1, undefined);
  assert.equal(harness.repository.snapshot().entitlements.uid_2, undefined);

  const event = makeCheckoutPaidEvent({
    eventId: 'evt_renewal_correct_uid',
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: renewal.paymentId, uid: 'uid_1', purpose: 'renewal' },
    paidAt: PAID_AT_SECONDS,
  });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS });
  const result = await harness.service.handlePayMongoWebhook(signed);
  assert.equal(result.processed, true);
  const confirmedStatus = await harness.service.getRenewalStatus({ renewalId: renewal.paymentId }, { auth: { uid: 'uid_1' } });
  assert.equal(confirmedStatus.status, 'confirmed');
  assert.equal(confirmedStatus.accessExpiresAt, '2027-04-07T15:00:00.000Z');

  const snapshot = harness.repository.snapshot();
  assert.equal(snapshot.entitlements.uid_1.status, 'active');
  assert.equal(snapshot.entitlements.uid_2, undefined);
});

test('manual renewal extends from current future expiry and six-calendar-month arithmetic is explicit', async () => {
  const currentExpiry = new Date('2027-01-31T10:30:00.000Z');
  const seed = {
    accounts: { uid_1: { uid: 'uid_1', email: 'one@example.edu', displayName: 'One', role: 'student', accessProvenance: 'unpaid-preview' } },
    entitlements: { uid_1: { uid: 'uid_1', status: 'active', accessExpiresAt: currentExpiry, createdAt: new Date('2026-01-31T10:30:00.000Z') } },
  };
  const harness = createHarness({ seed });
  harness.identity.usersByUid.set('uid_1', { uid: 'uid_1', email: 'one@example.edu' });
  const renewal = await harness.service.createRenewalCheckout({ uid: 'uid_1' }, { auth: { uid: 'uid_1' } });
  const session = harness.provider.sessions[0];
  const event = makeCheckoutPaidEvent({ checkoutSessionId: session.providerCheckoutSessionId, referenceNumber: session.referenceNumber, metadata: { paymentId: renewal.paymentId }, paidAt: PAID_AT_SECONDS });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS });
  await harness.service.handlePayMongoWebhook(signed);

  const snapshot = harness.repository.snapshot();
  const expiry = Object.values(snapshot.entitlements)[0].accessExpiresAt;
  assert.equal(expiry.toISOString(), '2027-07-31T10:30:00.000Z');
  assert.equal(snapshot.accounts.uid_1.accessProvenance, 'provider-confirmed-payment');
  assert.equal(addCalendarMonthsUtc(new Date('2023-08-31T00:00:00.000Z')).toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(addCalendarMonthsUtc(new Date('2024-08-31T00:00:00.000Z')).toISOString(), '2025-02-28T00:00:00.000Z');
});

test('replayed signed renewal webhook does not extend existing paid access twice', async () => {
  const seed = {
    accounts: { uid_1: { uid: 'uid_1', email: 'one@example.edu', displayName: 'One', role: 'student' } },
    entitlements: {
      uid_1: {
        uid: 'uid_1',
        status: 'active',
        accessExpiresAt: new Date('2027-01-31T10:30:00.000Z'),
        history: [],
      },
    },
  };
  const harness = createHarness({ seed });
  harness.identity.usersByUid.set('uid_1', { uid: 'uid_1', email: 'one@example.edu' });
  const renewal = await harness.service.createRenewalCheckout({ uid: 'uid_1' }, { auth: { uid: 'uid_1' } });
  const session = harness.provider.sessions[0];
  const event = makeCheckoutPaidEvent({
    eventId: 'evt_renewal_replay',
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: renewal.paymentId, uid: 'uid_1', purpose: 'renewal' },
    paidAt: PAID_AT_SECONDS,
  });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS });

  const first = await harness.service.handlePayMongoWebhook(signed);
  const replay = await harness.service.handlePayMongoWebhook(signed);

  assert.equal(first.processed, true);
  assert.equal(replay.duplicate, true);
  const snapshot = harness.repository.snapshot();
  assert.equal(snapshot.entitlements.uid_1.accessExpiresAt.toISOString(), '2027-07-31T10:30:00.000Z');
  assert.equal(snapshot.entitlements.uid_1.history.length, 1);
  assert.equal(snapshot.payments[renewal.paymentId].status, PAYMENT_STATUSES.PAID);
});

test('access status is visible only to the same authenticated uid', async () => {
  const seed = {
    accounts: { uid_1: { uid: 'uid_1', email: 'one@example.edu', displayName: 'One', role: 'student' } },
    entitlements: { uid_1: { uid: 'uid_1', status: 'active', accessExpiresAt: new Date('2027-10-07T15:00:00.000Z') } },
  };
  const harness = createHarness({ seed });
  const status = await harness.service.getAccessStatus({ uid: 'uid_1' }, { auth: { uid: 'uid_1' } });
  assert.equal(status.active, true);
  await assertRejectsCode(harness.service.getAccessStatus({ uid: 'uid_1' }, { auth: { uid: 'uid_2' } }), 'unauthorized_status');
});

test('dormant HttpOnly registration binding remains scoped to its exact intent', () => {
  const cookie = '__Host-soar_reg=intent-one.secret-value; Path=/; HttpOnly; Secure; SameSite=Lax';
  assert.deepEqual(readRegistrationBinding({ cookie }, 'intent-one'), { intentId: 'intent-one', registrationSecret: 'secret-value' });
  assert.equal(readRegistrationBinding({ cookie }, 'intent-two'), null);
});

test('HTTP registration handlers require and retain the same Firebase UID without using cookies or passwords', async () => {
  const harness = createHarness();
  const handlers = createPaymentsHttpHandlers(harness.service, { secureCookies: true });
  const auth = { uid: 'firebase-ada', email: 'ada@example.edu' };
  const authUser = { ...auth, emailVerified: false };
  harness.identity.usersByUid.set(auth.uid, authUser);
  harness.identity.usersByEmail.set(auth.email, authUser);
  const body = { role: 'student', email: auth.email, displayName: 'Ada Lovelace', studentId: '2026-0001', department: 'Computer Engineering Department' };

  const anonymous = await handlers.startRegistrationPayment({ ip: '203.0.113.10', body });
  assert.equal(anonymous.status, 403);
  assert.equal(anonymous.body.code, 'unauthorized_registration');
  assert.equal(harness.provider.sessions.length, 0);
  assert.equal(Object.keys(harness.repository.snapshot().payments).length, 0);

  const started = await handlers.startRegistrationPayment({ auth, ip: '203.0.113.10', body });
  assert.equal(started.status, 200);
  assert.equal(started.body.amountPhp, 10);
  assert.equal(started.body.providerLabel, 'PayMongo');
  assert.equal(started.headers['Set-Cookie'], undefined);
  assert.match(harness.provider.sessions[0].successUrl, /^http:\/\/localhost:5173\/access\/checkout\?intentId=/);
  assert.match(harness.provider.sessions[0].cancelUrl, /checkout=cancelled/);

  const unauthenticated = await handlers.getCheckoutStatus({ query: { intentId: started.body.intentId } });
  assert.equal(unauthenticated.status, 403);
  const pending = await handlers.getCheckoutStatus({ auth, query: { intentId: started.body.intentId } });
  assert.equal(pending.status, 200);
  assert.equal(pending.body.canCreateAccount, false);
  assert.equal(pending.body.authFirst, true);

  await deliverPaidWebhook(harness, { intentId: started.body.intentId }, { eventId: 'evt_http_valid_paid', metadata: { intentId: started.body.intentId } });
  const paidStatus = await handlers.getCheckoutStatus({ auth, query: { intentId: started.body.intentId } });
  assert.equal(paidStatus.body.canCreateAccount, true);
  assert.equal(paidStatus.body.status, 'pending');
  assert.equal(paidStatus.body.checkoutUrl, null);
  assert.equal(paidStatus.body.registrationProfile.department, 'Computer Engineering Department');

  const wrongUid = await handlers.registerAccount({ auth: { uid: 'different-uid', email: auth.email }, body: { intentId: started.body.intentId } });
  assert.equal(wrongUid.status, 403);
  assert.equal(harness.identity.createCalls.length, 0);
  const completed = await handlers.registerAccount({ auth, body: { intentId: started.body.intentId, password: 'ignored-and-not-forwarded' } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.uid, auth.uid);
  assert.equal(completed.body.completed, true);
  assert.equal(completed.headers['Set-Cookie'], undefined);
  assert.equal(Object.keys(harness.repository.snapshot().accounts)[0], auth.uid);
});
