'use strict';

const { Buffer } = require('node:buffer');
const {
  PAYMENT_PROVIDER,
  ACCESS_PRICE_MINOR,
  ACCESS_CURRENCY,
} = require('./constants');
const { fail } = require('./errors');
const { hmacSha256Hex, timingSafeEqualHex } = require('./security');

function rawBodyToString(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');
  if (rawBody instanceof Uint8Array) return Buffer.from(rawBody).toString('utf8');
  if (typeof rawBody === 'string') return rawBody;
  fail('invalid_raw_body', 'Webhook raw body must be a string or Buffer.');
}

function parseSignatureHeader(headerValue) {
  const value = Array.isArray(headerValue) ? headerValue.join(',') : String(headerValue || '');
  const parts = {};
  for (const part of value.split(',')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    parts[key] = rest.join('=');
  }
  return parts;
}

function verifyPayMongoSignature({ rawBody, signatureHeader, webhookSecret, expectedLivemode, toleranceSeconds = 300, now = new Date() }) {
  if (!webhookSecret) fail('missing_webhook_secret', 'PayMongo webhook secret is not configured.');
  const parts = parseSignatureHeader(signatureHeader);
  const timestamp = parts.t;
  const signature = expectedLivemode ? parts.li : parts.te;
  if (!timestamp || !signature) fail('invalid_signature', 'Missing PayMongo webhook signature.');

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) fail('invalid_signature', 'Invalid PayMongo webhook timestamp.');
  if (toleranceSeconds > 0) {
    const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - timestampNumber);
    if (ageSeconds > toleranceSeconds) fail('stale_signature', 'PayMongo webhook signature timestamp is outside tolerance.');
  }

  const payload = rawBodyToString(rawBody);
  const expected = hmacSha256Hex(webhookSecret, `${timestamp}.${payload}`);
  if (!timingSafeEqualHex(expected, signature)) fail('invalid_signature', 'Invalid PayMongo webhook signature.');
  return true;
}

function parsePayMongoEvent(rawBody) {
  const payload = rawBodyToString(rawBody);
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || !parsed.data || !parsed.data.attributes) fail('invalid_event', 'Invalid PayMongo event envelope.');
    return parsed;
  } catch (error) {
    if (error && error.code) throw error;
    fail('invalid_event_json', 'Webhook body is not valid JSON.');
  }
}

function asAttributes(resource) {
  return (resource && resource.attributes) || {};
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sumLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null;
  let total = 0;
  let currency = null;
  for (const item of lineItems) {
    const amount = numberOrNull(item && item.amount);
    const quantity = numberOrNull((item && item.quantity) || 1);
    const itemCurrency = String((item && item.currency) || '').toUpperCase();
    if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(quantity) || quantity <= 0 || !itemCurrency) return null;
    if (currency && currency !== itemCurrency) return null;
    currency = itemCurrency;
    total += amount * quantity;
  }
  return { amount: total, currency };
}

function findPaidPayment(resource) {
  const attrs = asAttributes(resource);
  const direct = Array.isArray(attrs.payments) ? attrs.payments : [];
  const intentPayments = attrs.payment_intent && attrs.payment_intent.attributes && Array.isArray(attrs.payment_intent.attributes.payments)
    ? attrs.payment_intent.attributes.payments
    : [];
  const payments = [...direct, ...intentPayments];
  return payments.find((payment) => {
    const paymentAttrs = asAttributes(payment);
    return paymentAttrs.status === 'paid';
  }) || payments[0] || null;
}

function extractCheckoutSessionPayment(eventPayload) {
  const event = eventPayload && eventPayload.data;
  const eventAttrs = asAttributes(event);
  const resource = eventAttrs.data;
  const resourceAttrs = asAttributes(resource);
  const paidPayment = findPaidPayment(resource);
  const paidAttrs = asAttributes(paidPayment);
  const lineTotal = sumLineItems(resourceAttrs.line_items);
  const paymentAmount = numberOrNull(paidAttrs.amount);
  const paymentCurrency = paidAttrs.currency ? String(paidAttrs.currency).toUpperCase() : null;
  const sourceType = paidAttrs.source && paidAttrs.source.type ? String(paidAttrs.source.type).toLowerCase() : null;
  const metadata = resourceAttrs.metadata || {};

  return {
    provider: PAYMENT_PROVIDER,
    eventId: event && event.id,
    eventType: eventAttrs.type,
    eventLivemode: Boolean(eventAttrs.livemode),
    eventCreatedAtSeconds: eventAttrs.created_at || null,
    checkoutSessionId: resource && resource.id,
    checkoutSessionType: resource && resource.type,
    checkoutSessionStatus: resourceAttrs.status || null,
    referenceNumber: resourceAttrs.reference_number || null,
    metadata,
    lineItemAmount: lineTotal && lineTotal.amount,
    lineItemCurrency: lineTotal && lineTotal.currency,
    paymentId: paidPayment && paidPayment.id,
    paymentAmount,
    paymentCurrency,
    paymentStatus: paidAttrs.status || null,
    paymentSourceType: sourceType,
    paidAtSeconds: paidAttrs.paid_at || eventAttrs.created_at || null,
    livemode: resourceAttrs.livemode !== undefined ? Boolean(resourceAttrs.livemode) : Boolean(eventAttrs.livemode),
  };
}

function validatePaidCheckoutFacts(facts, expected = {}) {
  const expectedAmount = expected.amount || ACCESS_PRICE_MINOR;
  const expectedCurrency = (expected.currency || ACCESS_CURRENCY).toUpperCase();
  if (!facts || facts.eventType !== 'checkout_session.payment.paid') fail('ignored_event_type', 'PayMongo event type is not handled.');
  if (!facts.eventId) fail('invalid_event', 'PayMongo event id is missing.');
  if (!facts.checkoutSessionId) fail('missing_checkout_session', 'PayMongo checkout session id is missing.');

  const amounts = [];
  if (facts.lineItemAmount !== null && facts.lineItemAmount !== undefined) amounts.push({ amount: facts.lineItemAmount, currency: facts.lineItemCurrency, source: 'line_items' });
  if (facts.paymentAmount !== null && facts.paymentAmount !== undefined) amounts.push({ amount: facts.paymentAmount, currency: facts.paymentCurrency, source: 'payment' });
  if (amounts.length === 0) fail('missing_amount', 'PayMongo event did not include verifiable amount facts.');
  for (const fact of amounts) {
    if (fact.amount !== expectedAmount || String(fact.currency || '').toUpperCase() !== expectedCurrency) {
      fail('payment_amount_mismatch', 'PayMongo payment amount or currency did not match SOAR annual access.', fact);
    }
  }

  if (facts.paymentStatus && facts.paymentStatus !== 'paid') fail('payment_not_paid', 'PayMongo payment is not paid.');
  if (facts.paymentSourceType && facts.paymentSourceType !== 'gcash') fail('payment_method_mismatch', 'PayMongo payment method is not GCash.');
  return true;
}

class PayMongoCheckoutProvider {
  constructor({ secretKey, baseUrl = 'https://api.paymongo.com', fetchImpl = globalThis.fetch } = {}) {
    this.secretKey = secretKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
  }

  async createCheckoutSession({
    paymentId,
    referenceNumber,
    billingName,
    billingEmail,
    successUrl,
    cancelUrl,
    metadata = {},
  }) {
    if (!this.secretKey) fail('missing_provider_secret', 'PayMongo secret key is not configured.');
    if (!this.fetchImpl) fail('missing_fetch', 'No fetch implementation is available for PayMongo checkout.');
    if (!paymentId || !referenceNumber || !successUrl || !cancelUrl) fail('invalid_checkout_request', 'Missing required checkout fields.');

    const stringMetadata = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null) stringMetadata[key] = String(value);
    }

    const body = {
      data: {
        attributes: {
          line_items: [{
            name: 'SOAR annual access',
            description: 'One year of SOAR account access',
            amount: ACCESS_PRICE_MINOR,
            currency: ACCESS_CURRENCY,
            quantity: 1,
          }],
          payment_method_types: ['gcash'],
          description: 'SOAR annual account access',
          reference_number: referenceNumber,
          success_url: successUrl,
          cancel_url: cancelUrl,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          billing: {
            name: billingName,
            email: billingEmail,
          },
          metadata: stringMetadata,
        },
      },
    };

    const response = await this.fetchImpl(`${this.baseUrl}/v2/checkout_sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.secretKey}:`, 'utf8').toString('base64')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': paymentId,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
    if (!response.ok) {
      fail('provider_checkout_failed', `PayMongo checkout creation failed with HTTP ${response.status}.`, {
        status: response.status,
        errors: parsed && parsed.errors,
      });
    }

    const session = parsed && parsed.data;
    const attrs = asAttributes(session);
    if (!session || !session.id || !attrs.checkout_url) {
      fail('provider_checkout_malformed', 'PayMongo checkout response did not include a session id and checkout URL.');
    }

    return {
      provider: PAYMENT_PROVIDER,
      providerCheckoutSessionId: session.id,
      checkoutUrl: attrs.checkout_url,
      livemode: Boolean(attrs.livemode),
      rawCreatedAtSeconds: attrs.created_at || null,
    };
  }
}

module.exports = {
  PayMongoCheckoutProvider,
  parseSignatureHeader,
  verifyPayMongoSignature,
  parsePayMongoEvent,
  extractCheckoutSessionPayment,
  validatePaidCheckoutFacts,
};
