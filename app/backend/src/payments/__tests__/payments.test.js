'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { PaymentAccessService } = require('../service');
const { MemoryPaymentRepository } = require('../repository');
const { FakePayMongoProvider, FakeIdentityFoundation } = require('../testing/fakes');
const { makeCheckoutPaidEvent, signPayMongoPayload } = require('../testing/paymongo-fixtures');
const { PAYMENT_STATUSES, REGISTRATION_STATUSES, ACCESS_PRICE_MINOR, ACCESS_CURRENCY } = require('../constants');
const { createPaymentsHttpHandlers } = require('../http');
const { addCalendarYearsUtc } = require('../time');

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
    appBaseUrl: 'http://localhost:5173',
    secretPepper: 'pepper_test',
    webhookSecret: WEBHOOK_SECRET,
    expectedLivemode: false,
    signatureToleranceSeconds: 0,
    now: () => options.now || NOW,
    recoverySender: options.recoverySender,
  });
  return { repository, provider, identity, service };
}

async function startRegistration(harness, input = {}) {
  return harness.service.createRegistrationCheckout({
    role: 'student',
    fullName: 'Ada Lovelace',
    email: 'ada@example.edu',
    studentId: '2026-0001',
    ...input,
  }, { ip: '203.0.113.10' });
}

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

test('registration stays locked until a valid signed PayMongo paid webhook confirms amount, currency, session and reference', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);

  let status = await harness.service.getRegistrationStatus({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret });
  assert.equal(status.canComplete, false);
  await assertRejectsCode(harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret, password: 'StrongPass123' }), 'registration_not_paid');

  const result = await deliverPaidWebhook(harness, registration);
  assert.equal(result.processed, true);

  status = await harness.service.getRegistrationStatus({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret });
  assert.equal(status.canComplete, true);

  const completion = await harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret, password: 'StrongPass123' });
  assert.equal(completion.completed, true);

  const snapshot = harness.repository.snapshot();
  assert.equal(Object.keys(snapshot.accounts).length, 1);
  assert.equal(Object.keys(snapshot.entitlements).length, 1);
  assert.equal(Object.values(snapshot.accounts)[0].email, 'ada@example.edu');
  assert.equal(Object.values(snapshot.entitlements)[0].status, 'active');
  assert.equal(Object.values(snapshot.payments)[0].amountMinor, ACCESS_PRICE_MINOR);
  assert.equal(Object.values(snapshot.payments)[0].currency, ACCESS_CURRENCY);
  assert.equal(Object.values(snapshot.registrationIntents)[0].status, REGISTRATION_STATUSES.COMPLETED);
  assert.equal(JSON.stringify(snapshot).includes('StrongPass123'), false, 'password must never be persisted');
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

test('wrong amount, wrong currency and wrong provider session are rejected without unlock', async () => {
  for (const [name, overrides, expectedCode] of [
    ['wrong amount', { amount: 999 }, 'payment_amount_mismatch'],
    ['wrong currency', { currency: 'USD' }, 'payment_amount_mismatch'],
    ['wrong session', { checkoutSessionId: 'cs_attacker' }, 'checkout_session_mismatch'],
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
  let status = await harness.service.getRegistrationStatus({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret });
  assert.equal(status.canComplete, false);

  await deliverPaidWebhook(harness, registration, { eventId: 'evt_paid_after_failed' });
  status = await harness.service.getRegistrationStatus({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret });
  assert.equal(status.canComplete, true);
});

test('registration intent binding rejects theft and safely handles reuse after completion', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  await deliverPaidWebhook(harness, registration);

  await assertRejectsCode(harness.service.getRegistrationStatus({ intentId: registration.intentId, registrationSecret: 'stolen' }), 'invalid_registration_secret');
  await assertRejectsCode(harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: 'stolen', password: 'StrongPass123' }), 'invalid_registration_secret');

  const first = await harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret, password: 'StrongPass123' });
  const second = await harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret, password: 'DifferentStrong123' });
  assert.equal(first.uid, second.uid);
  assert.equal(second.alreadyCompleted, true);
  assert.equal(Object.keys(harness.repository.snapshot().accounts).length, 1);
});

test('concurrent registration completion creates exactly one account and entitlement through identity helper idempotency', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  await deliverPaidWebhook(harness, registration);

  const results = await Promise.all([
    harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret, password: 'StrongPass123' }),
    harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret, password: 'StrongPass123' }),
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
  await assertRejectsCode(pendingHarness.service.completePaidRegistration({ intentId: pending.intentId, registrationSecret: pending.private.registrationSecret, password: 'StrongPass123' }), 'registration_not_paid');

  const cancelledHarness = createHarness();
  const cancelled = await startRegistration(cancelledHarness);
  const cancelledStatus = await cancelledHarness.service.recordCheckoutCancelled({ intentId: cancelled.intentId, registrationSecret: cancelled.private.registrationSecret });
  assert.equal(cancelledStatus.status, REGISTRATION_STATUSES.CANCELLED);
  await assertRejectsCode(cancelledHarness.service.completePaidRegistration({ intentId: cancelled.intentId, registrationSecret: cancelled.private.registrationSecret, password: 'StrongPass123' }), 'registration_not_paid');
  assert.equal(Object.keys(cancelledHarness.repository.snapshot().payments).length, 1);

  const expiredHarness = createHarness();
  const expired = await startRegistration(expiredHarness);
  const expiredStatus = await expiredHarness.service.expireRegistrationIntent({ intentId: expired.intentId });
  assert.equal(expiredStatus.status, REGISTRATION_STATUSES.EXPIRED);
  await assertRejectsCode(expiredHarness.service.completePaidRegistration({ intentId: expired.intentId, registrationSecret: expired.private.registrationSecret, password: 'StrongPass123' }), 'registration_not_paid');
  assert.equal(Object.keys(expiredHarness.repository.snapshot().registrationIntents).length, 1);
});

test('paid webhook after browser cancellation safely recovers the unfinished registration', async () => {
  const harness = createHarness();
  const registration = await startRegistration(harness);
  await harness.service.recordCheckoutCancelled({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret });
  await deliverPaidWebhook(harness, registration);
  const status = await harness.service.getRegistrationStatus({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret });
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

test('paid-but-unfinished registration can issue a recovery binding without exposing the original secret', async () => {
  const sent = [];
  const harness = createHarness({ recoverySender: { sendPaidRegistrationRecovery: async (message) => sent.push(message) } });
  const registration = await startRegistration(harness);
  await deliverPaidWebhook(harness, registration);

  const recovery = await harness.service.requestPaidRegistrationRecovery({ email: 'ADA@example.edu' });
  assert.equal(recovery.accepted, true);
  assert.equal(recovery.delivery, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].intentId, registration.intentId);

  await assertRejectsCode(harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: registration.private.registrationSecret, password: 'StrongPass123' }), 'invalid_registration_secret');
  const completion = await harness.service.completePaidRegistration({ intentId: registration.intentId, registrationSecret: sent[0].recoverySecret, password: 'StrongPass123' });
  assert.equal(completion.completed, true);
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
  const session = harness.provider.sessions[0];
  const event = makeCheckoutPaidEvent({
    checkoutSessionId: session.providerCheckoutSessionId,
    referenceNumber: session.referenceNumber,
    metadata: { paymentId: renewal.paymentId, uid: 'uid_2', purpose: 'renewal' },
    paidAt: PAID_AT_SECONDS,
  });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS });
  const result = await harness.service.handlePayMongoWebhook(signed);
  assert.equal(result.processed, true);

  const snapshot = harness.repository.snapshot();
  assert.equal(snapshot.entitlements.uid_1.status, 'active');
  assert.equal(snapshot.entitlements.uid_2, undefined);
});

test('manual renewal extends from current future expiry and calendar-year arithmetic is explicit', async () => {
  const currentExpiry = new Date('2027-01-31T10:30:00.000Z');
  const seed = {
    accounts: { uid_1: { uid: 'uid_1', email: 'one@example.edu', displayName: 'One', role: 'student' } },
    entitlements: { uid_1: { uid: 'uid_1', status: 'active', accessExpiresAt: currentExpiry, createdAt: new Date('2026-01-31T10:30:00.000Z') } },
  };
  const harness = createHarness({ seed });
  harness.identity.usersByUid.set('uid_1', { uid: 'uid_1', email: 'one@example.edu' });
  const renewal = await harness.service.createRenewalCheckout({ uid: 'uid_1' }, { auth: { uid: 'uid_1' } });
  const session = harness.provider.sessions[0];
  const event = makeCheckoutPaidEvent({ checkoutSessionId: session.providerCheckoutSessionId, referenceNumber: session.referenceNumber, metadata: { paymentId: renewal.paymentId }, paidAt: PAID_AT_SECONDS });
  const signed = signPayMongoPayload(event, { secret: WEBHOOK_SECRET, timestamp: PAID_AT_SECONDS });
  await harness.service.handlePayMongoWebhook(signed);

  const expiry = Object.values(harness.repository.snapshot().entitlements)[0].accessExpiresAt;
  assert.equal(expiry.toISOString(), '2028-01-31T10:30:00.000Z');
  assert.equal(addCalendarYearsUtc(new Date('2024-02-29T00:00:00.000Z')).toISOString(), '2025-02-28T00:00:00.000Z');
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

test('HTTP handler contract uses an HttpOnly registration binding cookie and never returns the secret in JSON', async () => {
  const harness = createHarness();
  const handlers = createPaymentsHttpHandlers(harness.service, { secureCookies: false });

  const started = await handlers.startRegistrationPayment({
    ip: '203.0.113.10',
    body: { role: 'student', email: 'ada@example.edu', displayName: 'Ada Lovelace', studentId: '2026-0001' },
  });
  assert.equal(started.status, 200);
  assert.equal(started.body.amountPhp, 10);
  assert.equal(started.body.providerLabel, 'PayMongo');
  assert.equal(JSON.stringify(started.body).includes('secret'), false);
  assert.match(started.headers['Set-Cookie'], /HttpOnly/);
  assert.match(started.headers['Set-Cookie'], /SameSite=Lax/);

  const unpaidStatus = await handlers.getCheckoutStatus({ headers: { cookie: started.headers['Set-Cookie'] }, query: { intentId: started.body.intentId } });
  assert.equal(unpaidStatus.status, 200);
  assert.equal(unpaidStatus.body.canCreateAccount, false);

  await deliverPaidWebhook(harness, { intentId: started.body.intentId }, { metadata: { intentId: started.body.intentId } });
  const paidStatus = await handlers.getCheckoutStatus({ headers: { cookie: started.headers['Set-Cookie'] }, query: { intentId: started.body.intentId } });
  assert.equal(paidStatus.body.canCreateAccount, true);

  const completed = await handlers.registerAccount({
    ip: '203.0.113.10',
    headers: { cookie: started.headers['Set-Cookie'] },
    body: { intentId: started.body.intentId, password: 'StrongPass123' },
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.completed, true);
  assert.match(completed.headers['Set-Cookie'], /Max-Age=0/);
});
