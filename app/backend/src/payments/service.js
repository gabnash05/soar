'use strict';

const {
  ACCESS_PRICE_MINOR,
  ACCESS_CURRENCY,
  PAYMENT_PROVIDER,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  REGISTRATION_STATUSES,
} = require('./constants');
const { fail, isPaymentAccessError } = require('./errors');
const {
  randomToken,
  hashSecret,
  verifySecret,
  normalizeEmail,
  emailHash,
} = require('./security');
const {
  computeNextAccessExpiry,
  entitlementStatus,
  dateToIso,
  toDate,
} = require('./time');
const {
  verifyPayMongoSignature,
  parsePayMongoEvent,
  extractCheckoutSessionPayment,
  validatePaidCheckoutFacts,
} = require('./paymongo');

const DEFAULT_REGISTRATION_TTL_MS = 48 * 60 * 60 * 1000;
const DEFAULT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMITS = Object.freeze({
  checkoutPerEmailPerHour: 3,
  checkoutPerIpPerHour: 20,
  completionPerIpPerHour: 20,
  recoveryPerEmailPerHour: 3,
  recoveryPerIpPerHour: 20,
});

const DEPARTMENT_LABELS = Object.freeze([
  'Civil Engineering Department',
  'Architecture Department',
  'Electrical Engineering Department',
  'Computer Engineering Department',
  'Mechanical Engineering Department',
  'Electronics Engineering Department',
  'Geodetic Engineering',
]);

function assertNoPassword(input) {
  if (!input || typeof input !== 'object') return;
  for (const key of Object.keys(input)) {
    if (/password/i.test(key)) fail('password_not_allowed_here', 'Passwords are accepted only by the paid registration completion endpoint.');
  }
}

function requireString(value, code, message) {
  const text = String(value || '').trim();
  if (!text) fail(code, message);
  return text;
}

function validateEmail(email) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) fail('invalid_email', 'A valid email address is required.');
  return normalized;
}

function validateRole(role) {
  const normalized = String(role || 'student').trim().toLowerCase();
  if (normalized === 'officer' || normalized === 'organization') {
    fail('invalid_role', 'Officers use regular student accounts; organization/officer is not an account role.');
  }
  if (normalized !== 'student' && normalized !== 'sponsor') fail('invalid_role', 'Role must be student or sponsor.');
  return normalized;
}

function normalizeDepartment(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDepartmentKey(value) {
  return normalizeDepartment(value).toLowerCase();
}

const DEPARTMENT_BY_KEY = new Map(DEPARTMENT_LABELS.map((department) => [normalizeDepartmentKey(department), department]));

function validateDepartment(value, required = false) {
  const department = normalizeDepartment(value);
  if (!department) {
    if (required) fail('missing_department', 'Department is required for student accounts.');
    return null;
  }
  const canonical = DEPARTMENT_BY_KEY.get(normalizeDepartmentKey(department));
  if (!canonical) fail('invalid_department', 'Choose one of the supported departments.');
  return canonical;
}

function sanitizeRegistrationProfile(input) {
  assertNoPassword(input);
  const role = validateRole(input.role);
  const fullName = requireString(input.fullName || input.full_name || input.name, 'missing_name', 'Full name is required.');
  const email = validateEmail(input.email);
  const profile = {
    role,
    fullName,
    email,
  };
  if (role === 'student') {
    profile.studentId = requireString(input.studentId || input.student_id || input.identificationNumber, 'missing_student_id', 'Student ID is required for student accounts.');
    const department = validateDepartment(input.department || input.departmentName || input.department_name, true);
    if (department) {
      profile.department = department;
      profile.departmentKey = normalizeDepartmentKey(department);
    }
  } else {
    if (input.department || input.departmentName || input.department_name) fail('department_not_allowed', 'Sponsors must not include a department.');
    const companyName = String(input.companyName || input.company_name || '').trim();
    if (companyName) profile.companyName = companyName;
  }
  return profile;
}

function providerReference(paymentId) {
  return `SOAR-${paymentId}`;
}

function addMillis(date, millis) {
  return new Date(date.getTime() + millis);
}

function appReturnUrl(appBaseUrl, path) {
  let base;
  try {
    base = new URL(appBaseUrl);
  } catch (_) {
    fail('invalid_app_base_url', 'SOAR_APP_BASE_URL must be configured as the frontend HTTPS origin.');
  }
  const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !localHttp) {
    fail('invalid_app_base_url', 'SOAR_APP_BASE_URL must use HTTPS outside local development.');
  }
  return new URL(path, base.origin).toString();
}

function publicIntentStatus(intent, payment, now) {
  return {
    intentId: intent && intent.id,
    status: intent ? intent.status : 'missing',
    paymentStatus: payment ? payment.status : null,
    canComplete: Boolean(intent && [REGISTRATION_STATUSES.PAID, REGISTRATION_STATUSES.COMPLETING].includes(intent.status)),
    completed: Boolean(intent && intent.status === REGISTRATION_STATUSES.COMPLETED),
    registrationProfile: intent && intent.profile || null,
    amountMinor: ACCESS_PRICE_MINOR,
    currency: ACCESS_CURRENCY,
    checkoutExpiresAt: dateToIso(intent && intent.expiresAt),
    paidAt: dateToIso(intent && intent.paidAt),
    accessExpiresAt: dateToIso(intent && intent.accessExpiresAt),
    locked: !(intent && (intent.status === REGISTRATION_STATUSES.PAID || intent.status === REGISTRATION_STATUSES.COMPLETED)),
    serverTime: dateToIso(now),
  };
}

class PaymentAccessService {
  constructor({
    repository,
    provider,
    identity,
    appBaseUrl = '',
    secretPepper,
    webhookSecret,
    expectedLivemode = false,
    signatureToleranceSeconds = 300,
    now = () => new Date(),
    rateLimiter = null,
    recoverySender = null,
    registrationTtlMs = DEFAULT_REGISTRATION_TTL_MS,
    toIdentityTimestamp = (date) => date,
  } = {}) {
    if (!repository) fail('missing_repository', 'Payment repository is required.');
    if (!provider) fail('missing_provider', 'Payment provider is required.');
    if (!identity) fail('missing_identity_adapter', 'Identity adapter is required.');
    this.repository = repository;
    this.provider = provider;
    this.identity = identity;
    this.appBaseUrl = appBaseUrl.replace(/\/$/, '');
    this.secretPepper = secretPepper;
    this.webhookSecret = webhookSecret;
    this.expectedLivemode = Boolean(expectedLivemode);
    this.signatureToleranceSeconds = signatureToleranceSeconds;
    this.now = now;
    this.rateLimiter = rateLimiter;
    this.recoverySender = recoverySender;
    this.registrationTtlMs = registrationTtlMs;
    this.toIdentityTimestamp = toIdentityTimestamp;
  }

  async checkRateLimit(key, limit, windowMs) {
    if (!this.rateLimiter || !key) return;
    await this.rateLimiter.check({ key, limit, windowMs, now: this.now() });
  }

  async createRegistrationCheckout(input, context = {}) {
    const now = this.now();
    const profile = sanitizeRegistrationProfile(input || {});
    await this.checkRateLimit(`registration-email:${emailHash(profile.email, this.secretPepper)}`, DEFAULT_RATE_LIMITS.checkoutPerEmailPerHour, 60 * 60 * 1000);
    await this.checkRateLimit(context.ip ? `registration-ip:${context.ip}` : null, DEFAULT_RATE_LIMITS.checkoutPerIpPerHour, 60 * 60 * 1000);

    const existingUser = this.identity.getUserByEmail ? await this.identity.getUserByEmail(profile.email) : null;
    if (existingUser) fail('email_already_registered', 'This email already has a SOAR account. Sign in and renew access instead.');

    const intentId = `reg_${randomToken(18)}`;
    const registrationSecret = randomToken(32);
    const targetUid = `uid_${randomToken(18)}`;
    const paymentId = `pay_${randomToken(18)}`;
    const expiresAt = addMillis(now, this.registrationTtlMs);
    const hashedEmail = emailHash(profile.email, this.secretPepper);
    const referenceNumber = providerReference(paymentId);
    const successUrl = appReturnUrl(this.appBaseUrl, `/access/checkout?intentId=${encodeURIComponent(intentId)}`);
    const cancelUrl = appReturnUrl(this.appBaseUrl, `/access/checkout?intentId=${encodeURIComponent(intentId)}&checkout=cancelled`);

    const intent = {
      id: intentId,
      status: REGISTRATION_STATUSES.CHECKOUT_CREATED,
      purpose: PAYMENT_PURPOSES.REGISTRATION,
      targetUid,
      email: profile.email,
      emailHash: hashedEmail,
      secretHash: hashSecret(registrationSecret, this.secretPepper),
      profile,
      paymentIds: [paymentId],
      paidPaymentId: null,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };
    const payment = {
      id: paymentId,
      purpose: PAYMENT_PURPOSES.REGISTRATION,
      provider: PAYMENT_PROVIDER,
      status: PAYMENT_STATUSES.CREATED,
      registrationIntentId: intentId,
      targetUid,
      uid: null,
      emailHash: hashedEmail,
      amountMinor: ACCESS_PRICE_MINOR,
      currency: ACCESS_CURRENCY,
      referenceNumber,
      providerCheckoutSessionId: null,
      providerPaymentId: null,
      livemode: null,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    await this.repository.runTransaction(async (tx) => {
      await tx.saveRegistrationIntent(intent);
      await tx.savePayment(payment);
    });

    let session;
    try {
      session = await this.provider.createCheckoutSession({
        paymentId,
        referenceNumber,
        billingName: profile.fullName,
        billingEmail: profile.email,
        successUrl,
        cancelUrl,
        metadata: {
          paymentId,
          intentId,
          purpose: PAYMENT_PURPOSES.REGISTRATION,
          emailHash: hashedEmail,
          amountMinor: ACCESS_PRICE_MINOR,
          currency: ACCESS_CURRENCY,
        },
      });
    } catch (error) {
      await this.repository.runTransaction(async (tx) => {
        await tx.updatePayment(paymentId, {
          status: PAYMENT_STATUSES.FAILED,
          failureCode: error.code || 'provider_checkout_failed',
          updatedAt: this.now(),
        });
        await tx.updateRegistrationIntent(intentId, {
          status: REGISTRATION_STATUSES.CHECKOUT_FAILED,
          failureCode: error.code || 'provider_checkout_failed',
          updatedAt: this.now(),
        });
      });
      throw error;
    }

    await this.repository.runTransaction(async (tx) => {
      await tx.updatePayment(paymentId, {
        status: PAYMENT_STATUSES.PENDING,
        providerCheckoutSessionId: session.providerCheckoutSessionId,
        checkoutUrl: session.checkoutUrl,
        livemode: session.livemode,
        updatedAt: this.now(),
      });
      await tx.saveCheckoutSessionIndex(session.providerCheckoutSessionId, { paymentId, registrationIntentId: intentId });
      await tx.updateRegistrationIntent(intentId, {
        checkoutUrl: session.checkoutUrl,
        latestPaymentId: paymentId,
        updatedAt: this.now(),
      });
    });

    return {
      intentId,
      checkoutUrl: session.checkoutUrl,
      amountMinor: ACCESS_PRICE_MINOR,
      currency: ACCESS_CURRENCY,
      checkoutExpiresAt: expiresAt.toISOString(),
      private: {
        registrationSecret,
      },
    };
  }

  async createRenewalCheckout(input, context = {}) {
    const now = this.now();
    const uid = requireString((input && input.uid) || (context.auth && context.auth.uid), 'missing_uid', 'Authenticated uid is required for renewal.');
    if (!context.auth || context.auth.uid !== uid) fail('unauthorized_renewal', 'Renewal checkout must be created by the same authenticated account.');
    await this.checkRateLimit(context.ip ? `renewal-ip:${context.ip}` : null, DEFAULT_RATE_LIMITS.checkoutPerIpPerHour, 60 * 60 * 1000);

    const authUser = this.identity.getUser ? await this.identity.getUser(uid) : null;
    if (!authUser) fail('account_not_found', 'Cannot renew an account that does not exist.');

    const account = await this.repository.runTransaction(async (tx) => tx.getAccount(uid));
    if (!account) fail('account_record_missing', 'SOAR account record is missing; contact support before renewing.');

    const paymentId = `pay_${randomToken(18)}`;
    const referenceNumber = providerReference(paymentId);
    const successUrl = appReturnUrl(this.appBaseUrl, `/settings/access?renewalId=${encodeURIComponent(paymentId)}&checkout=success`);
    const cancelUrl = appReturnUrl(this.appBaseUrl, `/settings/access?renewalId=${encodeURIComponent(paymentId)}&checkout=cancelled`);
    const payment = {
      id: paymentId,
      purpose: PAYMENT_PURPOSES.RENEWAL,
      provider: PAYMENT_PROVIDER,
      status: PAYMENT_STATUSES.CREATED,
      uid,
      registrationIntentId: null,
      amountMinor: ACCESS_PRICE_MINOR,
      currency: ACCESS_CURRENCY,
      referenceNumber,
      providerCheckoutSessionId: null,
      providerPaymentId: null,
      livemode: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.runTransaction(async (tx) => {
      await tx.savePayment(payment);
    });

    let session;
    try {
      session = await this.provider.createCheckoutSession({
        paymentId,
        referenceNumber,
        billingName: account.fullName || authUser.displayName || account.email || uid,
        billingEmail: account.email || authUser.email,
        successUrl,
        cancelUrl,
        metadata: {
          paymentId,
          uid,
          purpose: PAYMENT_PURPOSES.RENEWAL,
          amountMinor: ACCESS_PRICE_MINOR,
          currency: ACCESS_CURRENCY,
        },
      });
    } catch (error) {
      await this.repository.runTransaction(async (tx) => {
        await tx.updatePayment(paymentId, {
          status: PAYMENT_STATUSES.FAILED,
          failureCode: error.code || 'provider_checkout_failed',
          updatedAt: this.now(),
        });
      });
      throw error;
    }

    await this.repository.runTransaction(async (tx) => {
      await tx.updatePayment(paymentId, {
        status: PAYMENT_STATUSES.PENDING,
        providerCheckoutSessionId: session.providerCheckoutSessionId,
        checkoutUrl: session.checkoutUrl,
        livemode: session.livemode,
        updatedAt: this.now(),
      });
      await tx.saveCheckoutSessionIndex(session.providerCheckoutSessionId, { paymentId, uid });
    });

    return {
      paymentId,
      checkoutUrl: session.checkoutUrl,
      amountMinor: ACCESS_PRICE_MINOR,
      currency: ACCESS_CURRENCY,
    };
  }

  async getRenewalStatus(input, context = {}) {
    const uid = requireString(context.auth && context.auth.uid, 'unauthorized_status', 'Renewal status requires an authenticated account.');
    const renewalId = requireString(input && input.renewalId, 'missing_renewal_id', 'Renewal id is required.');
    return this.repository.runTransaction(async (tx) => {
      const payment = await tx.getPayment(renewalId);
      if (!payment || payment.purpose !== PAYMENT_PURPOSES.RENEWAL || payment.uid !== uid) {
        fail('renewal_not_found', 'Renewal payment was not found.');
      }
      const status = payment.status === PAYMENT_STATUSES.PAID
        ? 'confirmed'
        : [PAYMENT_STATUSES.FAILED, PAYMENT_STATUSES.INVALID, PAYMENT_STATUSES.CANCELLED, PAYMENT_STATUSES.EXPIRED].includes(payment.status)
          ? 'failed'
          : 'pending';
      return {
        renewalId,
        status,
        accessExpiresAt: dateToIso(payment.accessExpiresAt),
        message: status === 'confirmed'
          ? 'Payment confirmed. Your access has been updated.'
          : status === 'failed'
            ? 'This renewal could not be confirmed. You can start a new checkout.'
            : 'Waiting for provider-confirmed payment. Access remains unchanged until confirmation.',
      };
    });
  }

  async handlePayMongoWebhook({ rawBody, signatureHeader }) {
    const now = this.now();
    verifyPayMongoSignature({
      rawBody,
      signatureHeader,
      webhookSecret: this.webhookSecret,
      expectedLivemode: this.expectedLivemode,
      toleranceSeconds: this.signatureToleranceSeconds,
      now,
    });

    const eventPayload = parsePayMongoEvent(rawBody);
    const facts = extractCheckoutSessionPayment(eventPayload);

    if (facts.eventLivemode !== this.expectedLivemode) {
      return { accepted: true, processed: false, reason: 'livemode_mismatch' };
    }
    if (facts.eventType !== 'checkout_session.payment.paid') {
      await this.repository.runTransaction(async (tx) => {
        if (facts.eventId && !(await tx.getProcessedEvent(facts.eventId))) {
          await tx.saveProcessedEvent({ id: facts.eventId, type: facts.eventType, status: 'ignored', reason: 'unhandled_event_type', createdAt: now, updatedAt: now });
        }
      });
      return { accepted: true, processed: false, reason: 'unhandled_event_type' };
    }

    let validationError = null;
    try {
      validatePaidCheckoutFacts(facts, { amount: ACCESS_PRICE_MINOR, currency: ACCESS_CURRENCY });
    } catch (error) {
      validationError = error;
    }

    return this.repository.runTransaction(async (tx) => {
      const existingEvent = facts.eventId ? await tx.getProcessedEvent(facts.eventId) : null;
      if (existingEvent && existingEvent.status === 'processed') return { accepted: true, processed: false, duplicate: true };
      if (existingEvent && existingEvent.status === 'rejected') return { accepted: true, processed: false, duplicate: true, rejected: true };

      let payment = facts.checkoutSessionId ? await tx.getPaymentByCheckoutSession(facts.checkoutSessionId) : null;
      if (!payment && facts.metadata && facts.metadata.paymentId) payment = await tx.getPayment(facts.metadata.paymentId);
      if (!payment) {
        if (facts.eventId) await tx.saveProcessedEvent({ id: facts.eventId, type: facts.eventType, status: 'ignored', reason: 'unknown_checkout_session', createdAt: now, updatedAt: now, facts });
        return { accepted: true, processed: false, reason: 'unknown_checkout_session' };
      }

      const rejectEvent = async (reason, code, details) => {
        if (payment.status !== PAYMENT_STATUSES.PAID) {
          await tx.updatePayment(payment.id, { status: PAYMENT_STATUSES.INVALID, invalidReason: reason, updatedAt: now });
        }
        if (facts.eventId) await tx.saveProcessedEvent({ id: facts.eventId, type: facts.eventType, status: 'rejected', reason, code, details, paymentId: payment.id, createdAt: now, updatedAt: now });
        return { accepted: true, processed: false, rejected: true, reason, code };
      };

      if (validationError) return rejectEvent('invalid_paid_event_facts', validationError.code, validationError.details);
      if (payment.providerCheckoutSessionId !== facts.checkoutSessionId) return rejectEvent('checkout_session_mismatch', 'checkout_session_mismatch');
      const metadata = facts.metadata || {};
      const metadataPaymentId = metadata.paymentId;
      if (!facts.referenceNumber || facts.referenceNumber !== payment.referenceNumber) return rejectEvent('provider_reference_mismatch', 'provider_reference_mismatch');
      if (metadataPaymentId && metadataPaymentId !== payment.id) return rejectEvent('payment_id_mismatch', 'payment_id_mismatch');
      if (![PAYMENT_PURPOSES.REGISTRATION, PAYMENT_PURPOSES.RENEWAL].includes(payment.purpose)) return rejectEvent('unknown_payment_purpose', 'unknown_payment_purpose');
      if (metadata.purpose && metadata.purpose !== payment.purpose) return rejectEvent('payment_purpose_mismatch', 'payment_purpose_mismatch');
      if (payment.purpose === PAYMENT_PURPOSES.REGISTRATION && metadata.intentId && metadata.intentId !== payment.registrationIntentId) {
        return rejectEvent('registration_intent_mismatch', 'registration_intent_mismatch');
      }
      if (payment.purpose === PAYMENT_PURPOSES.RENEWAL && metadata.uid && metadata.uid !== payment.uid) {
        return rejectEvent('renewal_uid_mismatch', 'renewal_uid_mismatch');
      }
      if (payment.amountMinor !== ACCESS_PRICE_MINOR || payment.currency !== ACCESS_CURRENCY) return rejectEvent('internal_amount_mismatch', 'internal_amount_mismatch');
      if (payment.livemode !== null && payment.livemode !== facts.livemode) return rejectEvent('livemode_mismatch', 'livemode_mismatch');

      if (payment.status === PAYMENT_STATUSES.PAID) {
        if (facts.eventId) await tx.saveProcessedEvent({ id: facts.eventId, type: facts.eventType, status: 'processed', reason: 'payment_already_paid', paymentId: payment.id, createdAt: now, updatedAt: now });
        return { accepted: true, processed: false, duplicatePayment: true, paymentId: payment.id };
      }

      const paidAt = facts.paidAtSeconds ? new Date(facts.paidAtSeconds * 1000) : now;
      await tx.updatePayment(payment.id, {
        status: PAYMENT_STATUSES.PAID,
        providerPaymentId: facts.paymentId || null,
        providerEventId: facts.eventId,
        paidAt,
        livemode: facts.livemode,
        facts,
        updatedAt: now,
      });

      if (payment.purpose === PAYMENT_PURPOSES.REGISTRATION) {
        const intent = await tx.getRegistrationIntent(payment.registrationIntentId);
        if (!intent) return rejectEvent('registration_intent_missing', 'registration_intent_missing');
        if (intent.status !== REGISTRATION_STATUSES.COMPLETED) {
          await tx.updateRegistrationIntent(intent.id, {
            status: REGISTRATION_STATUSES.PAID,
            paidPaymentId: payment.id,
            paidAt,
            updatedAt: now,
          });
        }
      } else if (payment.purpose === PAYMENT_PURPOSES.RENEWAL) {
        const account = await tx.getAccount(payment.uid);
        if (!account) return rejectEvent('renewal_account_missing', 'renewal_account_missing');
        const currentEntitlement = await tx.getEntitlement(payment.uid);
        const accessExpiresAt = computeNextAccessExpiry({
          currentAccessExpiresAt: currentEntitlement && currentEntitlement.accessExpiresAt,
          paidAt,
          now,
        });
        const history = Array.isArray(currentEntitlement && currentEntitlement.history) ? currentEntitlement.history : [];
        await tx.saveEntitlement(payment.uid, {
          uid: payment.uid,
          status: 'active',
          provider: PAYMENT_PROVIDER,
          accessExpiresAt,
          latestPaymentId: payment.id,
          lastProviderEventId: facts.eventId,
          updatedAt: now,
          createdAt: currentEntitlement && currentEntitlement.createdAt ? currentEntitlement.createdAt : now,
          history: history.concat({
            purpose: PAYMENT_PURPOSES.RENEWAL,
            paymentId: payment.id,
            provider: PAYMENT_PROVIDER,
            providerEventId: facts.eventId,
            providerPaymentId: facts.paymentId || null,
            amount: { currency: ACCESS_CURRENCY, minor: ACCESS_PRICE_MINOR },
            accessExpiresAt,
            grantedAt: now,
          }),
        });
        await tx.updatePayment(payment.id, { accessExpiresAt, updatedAt: now });
      } else {
        return rejectEvent('unknown_payment_purpose', 'unknown_payment_purpose');
      }

      if (facts.eventId) await tx.saveProcessedEvent({ id: facts.eventId, type: facts.eventType, status: 'processed', paymentId: payment.id, createdAt: now, updatedAt: now });
      return { accepted: true, processed: true, paymentId: payment.id, purpose: payment.purpose };
    });
  }

  async completePaidRegistration(input, context = {}) {
    const now = this.now();
    await this.checkRateLimit(context.ip ? `complete-ip:${context.ip}` : null, DEFAULT_RATE_LIMITS.completionPerIpPerHour, 60 * 60 * 1000);
    const intentId = requireString(input && input.intentId, 'missing_intent_id', 'Registration intent id is required.');
    const registrationSecret = requireString(input && input.registrationSecret, 'missing_registration_secret', 'Registration secret is required.');
    const password = String((input && input.password) || '');
    if (password.length < 8) fail('weak_password', 'Password must be at least 8 characters.');

    const reservation = await this.repository.runTransaction(async (tx) => {
      const intent = await tx.getRegistrationIntent(intentId);
      if (!intent) fail('registration_intent_not_found', 'Registration intent was not found.');
      if (!verifySecret({ secret: registrationSecret, expectedHash: intent.secretHash, pepper: this.secretPepper })) fail('invalid_registration_secret', 'Registration intent secret is invalid.');
      if (intent.status === REGISTRATION_STATUSES.COMPLETED) {
        return { alreadyCompleted: true, uid: intent.authUid, accessExpiresAt: intent.accessExpiresAt, profile: intent.profile };
      }
      if (intent.status !== REGISTRATION_STATUSES.PAID && intent.status !== REGISTRATION_STATUSES.COMPLETING) {
        fail('registration_not_paid', 'Registration cannot be completed until PayMongo confirms a paid checkout.');
      }
      await tx.updateRegistrationIntent(intentId, { status: REGISTRATION_STATUSES.COMPLETING, completionStartedAt: now, updatedAt: now });
      return { alreadyCompleted: false, uid: intent.targetUid, email: intent.email, profile: intent.profile, paidPaymentId: intent.paidPaymentId };
    });

    if (reservation.alreadyCompleted) {
      return { uid: reservation.uid, completed: true, alreadyCompleted: true, accessExpiresAt: dateToIso(reservation.accessExpiresAt) };
    }

    const completionInput = await this.repository.runTransaction(async (tx) => {
      const intent = await tx.getRegistrationIntent(intentId);
      if (!intent) fail('registration_intent_not_found', 'Registration intent was not found.');
      if (!verifySecret({ secret: registrationSecret, expectedHash: intent.secretHash, pepper: this.secretPepper })) fail('invalid_registration_secret', 'Registration intent secret is invalid.');
      if (intent.status === REGISTRATION_STATUSES.COMPLETED) {
        return { alreadyCompleted: true, uid: intent.authUid, accessExpiresAt: intent.accessExpiresAt };
      }
      const paidPayment = await tx.getPayment(intent.paidPaymentId || reservation.paidPaymentId);
      if (!paidPayment || paidPayment.status !== PAYMENT_STATUSES.PAID) fail('paid_payment_missing', 'A paid payment record is required to complete registration.');
      const accessExpiresAt = computeNextAccessExpiry({ paidAt: paidPayment.paidAt || now, now });
      return {
        alreadyCompleted: false,
        intent,
        paidPayment,
        accessExpiresAt,
        helperInput: {
          email: intent.profile.email,
          password,
          displayName: intent.profile.fullName,
          role: intent.profile.role,
          studentId: intent.profile.studentId,
          department: intent.profile.department,
          departmentKey: intent.profile.departmentKey,
          companyName: intent.profile.companyName,
          entitlement: {
            provider: PAYMENT_PROVIDER,
            providerEventId: paidPayment.providerEventId || paidPayment.providerPaymentId || paidPayment.id,
            accessExpiresAt: this.toIdentityTimestamp(accessExpiresAt),
            amount: { currency: ACCESS_CURRENCY, minor: ACCESS_PRICE_MINOR },
            intentId: intent.id,
          },
        },
      };
    });

    if (completionInput.alreadyCompleted) {
      return { uid: completionInput.uid, completed: true, alreadyCompleted: true, accessExpiresAt: dateToIso(completionInput.accessExpiresAt) };
    }
    if (!this.identity.createPaidAccountFromConfirmedRegistration) {
      fail('identity_helper_unavailable', 'Identity foundation helper createPaidAccountFromConfirmedRegistration is required for paid registration completion.');
    }

    let created;
    try {
      created = await this.identity.createPaidAccountFromConfirmedRegistration(completionInput.helperInput);
    } catch (error) {
      await this.repository.runTransaction(async (tx) => {
        await tx.updateRegistrationIntent(intentId, {
          status: REGISTRATION_STATUSES.PAID,
          completionErrorCode: error.code || 'paid_account_create_failed',
          updatedAt: this.now(),
        });
      });
      throw error;
    }

    const createdUid = created && created.uid;
    if (!createdUid) fail('identity_helper_malformed', 'Identity helper did not return a uid.');

    return this.repository.runTransaction(async (tx) => {
      const intent = await tx.getRegistrationIntent(intentId);
      if (!intent) fail('registration_intent_not_found', 'Registration intent was not found.');
      if (!verifySecret({ secret: registrationSecret, expectedHash: intent.secretHash, pepper: this.secretPepper })) fail('invalid_registration_secret', 'Registration intent secret is invalid.');
      if (intent.status === REGISTRATION_STATUSES.COMPLETED) {
        return { uid: intent.authUid, completed: true, alreadyCompleted: true, accessExpiresAt: dateToIso(intent.accessExpiresAt) };
      }
      const paidPayment = await tx.getPayment(intent.paidPaymentId || reservation.paidPaymentId);
      if (!paidPayment || paidPayment.status !== PAYMENT_STATUSES.PAID) fail('paid_payment_missing', 'A paid payment record is required to complete registration.');
      await tx.updateRegistrationIntent(intent.id, {
        status: REGISTRATION_STATUSES.COMPLETED,
        authUid: createdUid,
        accessExpiresAt: completionInput.accessExpiresAt,
        completedAt: now,
        updatedAt: now,
      });
      await tx.updatePayment(paidPayment.id, { completedRegistrationUid: createdUid, accessExpiresAt: completionInput.accessExpiresAt, updatedAt: now });
      return { uid: createdUid, completed: true, accessExpiresAt: completionInput.accessExpiresAt.toISOString() };
    });
  }

  async getRegistrationStatus(input) {
    const now = this.now();
    const intentId = requireString(input && input.intentId, 'missing_intent_id', 'Registration intent id is required.');
    const registrationSecret = requireString(input && input.registrationSecret, 'missing_registration_secret', 'Registration secret is required.');
    return this.repository.runTransaction(async (tx) => {
      const intent = await tx.getRegistrationIntent(intentId);
      if (!intent) fail('registration_intent_not_found', 'Registration intent was not found.');
      if (!verifySecret({ secret: registrationSecret, expectedHash: intent.secretHash, pepper: this.secretPepper })) fail('invalid_registration_secret', 'Registration intent secret is invalid.');
      const payment = intent.latestPaymentId ? await tx.getPayment(intent.latestPaymentId) : null;
      return publicIntentStatus(intent, payment, now);
    });
  }

  async recordCheckoutCancelled(input) {
    const now = this.now();
    const intentId = requireString(input && input.intentId, 'missing_intent_id', 'Registration intent id is required.');
    const registrationSecret = requireString(input && input.registrationSecret, 'missing_registration_secret', 'Registration secret is required.');
    return this.repository.runTransaction(async (tx) => {
      const intent = await tx.getRegistrationIntent(intentId);
      if (!intent) fail('registration_intent_not_found', 'Registration intent was not found.');
      if (!verifySecret({ secret: registrationSecret, expectedHash: intent.secretHash, pepper: this.secretPepper })) fail('invalid_registration_secret', 'Registration intent secret is invalid.');
      const payment = intent.latestPaymentId ? await tx.getPayment(intent.latestPaymentId) : null;
      if (payment && payment.status !== PAYMENT_STATUSES.PAID) await tx.updatePayment(payment.id, { status: PAYMENT_STATUSES.CANCELLED, cancelledAt: now, updatedAt: now });
      if (intent.status !== REGISTRATION_STATUSES.COMPLETED && intent.status !== REGISTRATION_STATUSES.PAID) await tx.updateRegistrationIntent(intent.id, { status: REGISTRATION_STATUSES.CANCELLED, cancelledAt: now, updatedAt: now });
      return publicIntentStatus({ ...intent, status: REGISTRATION_STATUSES.CANCELLED }, payment && payment.status !== PAYMENT_STATUSES.PAID ? { ...payment, status: PAYMENT_STATUSES.CANCELLED } : payment, now);
    });
  }

  async expireRegistrationIntent(input) {
    const now = this.now();
    const intentId = requireString(input && input.intentId, 'missing_intent_id', 'Registration intent id is required.');
    return this.repository.runTransaction(async (tx) => {
      const intent = await tx.getRegistrationIntent(intentId);
      if (!intent) fail('registration_intent_not_found', 'Registration intent was not found.');
      const payment = intent.latestPaymentId ? await tx.getPayment(intent.latestPaymentId) : null;
      if (payment && payment.status !== PAYMENT_STATUSES.PAID) await tx.updatePayment(payment.id, { status: PAYMENT_STATUSES.EXPIRED, expiredAt: now, updatedAt: now });
      if (intent.status !== REGISTRATION_STATUSES.PAID && intent.status !== REGISTRATION_STATUSES.COMPLETED) await tx.updateRegistrationIntent(intent.id, { status: REGISTRATION_STATUSES.EXPIRED, expiredAt: now, updatedAt: now });
      return publicIntentStatus({ ...intent, status: REGISTRATION_STATUSES.EXPIRED }, payment && payment.status !== PAYMENT_STATUSES.PAID ? { ...payment, status: PAYMENT_STATUSES.EXPIRED } : payment, now);
    });
  }

  async requestPaidRegistrationRecovery(input, context = {}) {
    const email = validateEmail(input && input.email);
    if (!this.recoverySender || typeof this.recoverySender.sendPaidRegistrationRecovery !== 'function') {
      return { accepted: true, delivery: 'not_configured' };
    }

    const now = this.now();
    const checkoutSessionId = String((input && input.checkoutSessionId) || '').trim() || null;
    const hashedEmail = emailHash(email, this.secretPepper);
    await this.checkRateLimit(`recovery-email:${hashedEmail}`, DEFAULT_RATE_LIMITS.recoveryPerEmailPerHour, 60 * 60 * 1000);
    await this.checkRateLimit(context.ip ? `recovery-ip:${context.ip}` : null, DEFAULT_RATE_LIMITS.recoveryPerIpPerHour, 60 * 60 * 1000);
    let recovery = null;
    await this.repository.runTransaction(async (tx) => {
      const intent = await tx.findPaidIncompleteRegistrationByEmailHash(hashedEmail, checkoutSessionId);
      if (!intent) return;
      const recoverySecret = randomToken(32);
      await tx.updateRegistrationIntent(intent.id, {
        recoverySecretHash: hashSecret(recoverySecret, this.secretPepper),
        recoveryExpiresAt: addMillis(now, DEFAULT_RECOVERY_TTL_MS),
        recoveryIssuedAt: now,
        recoveryCount: (intent.recoveryCount || 0) + 1,
        updatedAt: now,
      });
      recovery = { intentId: intent.id, email: intent.email, recoverySecret, expiresAt: addMillis(now, DEFAULT_RECOVERY_TTL_MS) };
    });

    if (recovery) {
      try {
        await this.recoverySender.sendPaidRegistrationRecovery(recovery);
      } catch (_) {
        // Do not reveal whether a paid registration matched or whether delivery succeeded.
      }
    }
    return { accepted: true, delivery: 'sent' };
  }

  async acceptPaidRegistrationRecovery(input, context = {}) {
    await this.checkRateLimit(context.ip ? `recovery-accept-ip:${context.ip}` : null, DEFAULT_RATE_LIMITS.completionPerIpPerHour, 60 * 60 * 1000);
    const intentId = requireString(input && input.intentId, 'missing_intent_id', 'Registration intent id is required.');
    const recoverySecret = requireString(input && input.recoverySecret, 'missing_recovery_code', 'Recovery code is required.');
    const now = this.now();
    const registrationSecret = randomToken(32);

    return this.repository.runTransaction(async (tx) => {
      const intent = await tx.getRegistrationIntent(intentId);
      if (!intent) fail('registration_intent_not_found', 'Registration intent was not found.');
      if (!verifySecret({ secret: recoverySecret, expectedHash: intent.recoverySecretHash, pepper: this.secretPepper })) {
        fail('invalid_recovery_code', 'Registration recovery code is invalid.');
      }
      if (intent.status !== REGISTRATION_STATUSES.PAID && intent.status !== REGISTRATION_STATUSES.COMPLETING) {
        fail('registration_not_paid', 'Registration cannot be recovered until payment is confirmed.');
      }
      const recoveryExpiresAt = toDate(intent.recoveryExpiresAt);
      if (!recoveryExpiresAt || recoveryExpiresAt.getTime() <= now.getTime()) {
        fail('recovery_code_expired', 'Registration recovery code has expired. Request another recovery email.');
      }
      await tx.updateRegistrationIntent(intent.id, {
        secretHash: hashSecret(registrationSecret, this.secretPepper),
        recoverySecretHash: null,
        recoveryExpiresAt: null,
        recoveryAcceptedAt: now,
        updatedAt: now,
      });
      return { intentId, private: { registrationSecret } };
    });
  }

  async getAccessStatus(input, context = {}) {
    const uid = requireString((input && input.uid) || (context.auth && context.auth.uid), 'missing_uid', 'Authenticated uid is required.');
    if (!context.auth || context.auth.uid !== uid) fail('unauthorized_status', 'Access status can only be read by the same authenticated account.');
    const now = this.now();
    return this.repository.runTransaction(async (tx) => {
      const entitlement = await tx.getEntitlement(uid);
      const status = entitlementStatus(entitlement, now);
      return {
        uid,
        status,
        active: status === 'active',
        accessExpiresAt: dateToIso(entitlement && entitlement.accessExpiresAt),
        latestPaymentId: entitlement && entitlement.latestPaymentId || null,
        feePhp: ACCESS_PRICE_MINOR / 100,
        periodMonths: 6,
        periodLabel: '6 months',
        serverTime: now.toISOString(),
      };
    });
  }
}

module.exports = {
  PaymentAccessService,
  DEFAULT_REGISTRATION_TTL_MS,
  DEFAULT_RATE_LIMITS,
  sanitizeRegistrationProfile,
  providerReference,
  isPaymentAccessError,
};
