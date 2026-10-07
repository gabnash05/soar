'use strict';

const { ACCESS_PRICE_MINOR } = require('./constants');
const { isPaymentAccessError } = require('./errors');

const REGISTRATION_BINDING_COOKIE = '__Host-soar_reg';
const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60;

function parseCookies(header) {
  const cookies = {};
  const value = Array.isArray(header) ? header.join(';') : String(header || '');
  for (const part of value.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const val = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

function buildRegistrationBinding(intentId, registrationSecret) {
  return `${intentId}.${registrationSecret}`;
}

function readRegistrationBinding(headers, intentId) {
  const cookies = parseCookies(headers && (headers.cookie || headers.Cookie));
  const value = cookies[REGISTRATION_BINDING_COOKIE];
  if (!value) return null;
  const separator = value.indexOf('.');
  if (separator < 0) return null;
  const cookieIntentId = value.slice(0, separator);
  const registrationSecret = value.slice(separator + 1);
  if (cookieIntentId !== intentId) return null;
  return { intentId: cookieIntentId, registrationSecret };
}

function cookieHeader(value, { secure = true, maxAgeSeconds = TWO_DAYS_SECONDS } = {}) {
  const pieces = [`${REGISTRATION_BINDING_COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) pieces.push('Secure');
  return pieces.join('; ');
}

function clearCookieHeader({ secure = true } = {}) {
  return cookieHeader('', { secure, maxAgeSeconds: 0 });
}

function ok(body, headers = {}) {
  return { status: 200, headers: { 'Content-Type': 'application/json', ...headers }, body };
}

function problem(error) {
  if (isPaymentAccessError(error)) {
    const status = error.code === 'rate_limited' ? 429
      : error.code && (error.code.startsWith('invalid_') || error.code.startsWith('missing_') || error.code === 'weak_password') ? 400
      : error.code && error.code.startsWith('unauthorized') ? 403
      : 409;
    return { status, headers: { 'Content-Type': 'application/json' }, body: { code: error.code, message: error.message } };
  }
  return { status: 500, headers: { 'Content-Type': 'application/json' }, body: { code: 'internal_error', message: 'Unexpected payment service error.' } };
}

function bodyOf(request) {
  return request && request.body ? request.body : {};
}

function queryOf(request) {
  return request && request.query ? request.query : {};
}

function amountPhp() {
  return ACCESS_PRICE_MINOR / 100;
}

function mapCheckoutStatus(status) {
  if (!status) return 'missing';
  if (status.completed) return 'active';
  if (status.status === 'cancelled') return 'cancelled';
  if (status.status === 'expired') return 'expired';
  if (status.paymentStatus === 'failed' || status.status === 'checkout_failed') return 'failed';
  return 'pending';
}

function createPaymentsHttpHandlers(service, { secureCookies = true } = {}) {
  async function startRegistrationPayment(request) {
    try {
      const input = bodyOf(request);
      const result = await service.createRegistrationCheckout({
        role: input.role,
        email: input.email,
        fullName: input.displayName || input.fullName,
        studentId: input.studentId,
        companyName: input.companyName,
      }, { ip: request && request.ip });
      return ok({
        intentId: result.intentId,
        checkoutUrl: result.checkoutUrl,
        status: 'pending',
        amountPhp: amountPhp(),
        expiresAt: result.checkoutExpiresAt,
        providerLabel: 'PayMongo',
      }, {
        'Set-Cookie': cookieHeader(buildRegistrationBinding(result.intentId, result.private.registrationSecret), { secure: secureCookies }),
      });
    } catch (error) {
      return problem(error);
    }
  }

  async function getCheckoutStatus(request) {
    try {
      const intentId = String((queryOf(request).intentId || bodyOf(request).intentId || '')).trim();
      const binding = readRegistrationBinding(request && request.headers, intentId);
      if (!binding) {
        return problem({ name: 'PaymentAccessError', code: 'invalid_registration_binding', message: 'Registration binding cookie is missing or does not match this intent.' });
      }
      const status = await service.getRegistrationStatus(binding);
      return ok({
        intentId: status.intentId,
        status: mapCheckoutStatus(status),
        amountPhp: amountPhp(),
        message: status.canComplete ? 'Payment confirmed. You can create your SOAR account.' : 'Waiting for provider-confirmed payment.',
        canCreateAccount: status.canComplete,
      });
    } catch (error) {
      return problem(error);
    }
  }

  async function registerAccount(request) {
    try {
      const input = bodyOf(request);
      const intentId = String(input.intentId || '').trim();
      const binding = readRegistrationBinding(request && request.headers, intentId);
      if (!binding) {
        return problem({ name: 'PaymentAccessError', code: 'invalid_registration_binding', message: 'Registration binding cookie is missing or does not match this intent.' });
      }
      const result = await service.completePaidRegistration({
        intentId,
        registrationSecret: binding.registrationSecret,
        password: input.password,
      }, { ip: request && request.ip });
      return ok(result, { 'Set-Cookie': clearCookieHeader({ secure: secureCookies }) });
    } catch (error) {
      return problem(error);
    }
  }

  async function requestManualRenewal(request) {
    try {
      const result = await service.createRenewalCheckout({ uid: request && request.auth && request.auth.uid }, { auth: request && request.auth, ip: request && request.ip });
      return ok({
        renewalId: result.paymentId,
        checkoutUrl: result.checkoutUrl,
        status: 'pending',
        amountPhp: amountPhp(),
        providerLabel: 'PayMongo',
      });
    } catch (error) {
      return problem(error);
    }
  }

  async function getAccessStatus(request) {
    try {
      return ok(await service.getAccessStatus({ uid: request && request.auth && request.auth.uid }, { auth: request && request.auth }));
    } catch (error) {
      return problem(error);
    }
  }

  async function paymongoWebhook(request) {
    try {
      const result = await service.handlePayMongoWebhook({
        rawBody: request && (request.rawBody || request.body || ''),
        signatureHeader: request && request.headers && (request.headers['paymongo-signature'] || request.headers['Paymongo-Signature']),
      });
      return ok(result);
    } catch (error) {
      return problem(error);
    }
  }

  async function recoverPaidRegistration(request) {
    try {
      return ok(await service.requestPaidRegistrationRecovery(bodyOf(request)));
    } catch (error) {
      return problem(error);
    }
  }

  return {
    startRegistrationPayment,
    getCheckoutStatus,
    registerAccount,
    requestManualRenewal,
    getAccessStatus,
    paymongoWebhook,
    recoverPaidRegistration,
  };
}

module.exports = {
  REGISTRATION_BINDING_COOKIE,
  createPaymentsHttpHandlers,
  parseCookies,
  readRegistrationBinding,
};
