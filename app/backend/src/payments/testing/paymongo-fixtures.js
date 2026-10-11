'use strict';

const { hmacSha256Hex } = require('../security');
const { ACCESS_PRICE_MINOR, ACCESS_CURRENCY } = require('../constants');

function makeCheckoutPaidEvent({
  eventId = 'evt_test_paid',
  livemode = false,
  checkoutSessionId = 'cs_test_1',
  paymentId = 'pay_provider_1',
  amount = ACCESS_PRICE_MINOR,
  currency = ACCESS_CURRENCY,
  sourceType = 'gcash',
  referenceNumber,
  metadata = {},
  paymentStatus = 'paid',
  eventType = 'checkout_session.payment.paid',
  paidAt = 1791350000,
} = {}) {
  return {
    data: {
      id: eventId,
      type: 'event',
      attributes: {
        type: eventType,
        livemode,
        created_at: paidAt,
        data: {
          id: checkoutSessionId,
          type: 'checkout_session',
          attributes: {
            livemode,
            status: 'active',
            reference_number: referenceNumber,
            line_items: [{ name: 'SOAR six-month access', amount, currency, quantity: 1 }],
            payment_method_types: ['gcash'],
            metadata,
            payments: [{
              id: paymentId,
              type: 'payment',
              attributes: {
                amount,
                currency,
                status: paymentStatus,
                source: sourceType ? { id: `src_${sourceType}`, type: sourceType } : null,
                paid_at: paidAt,
                livemode,
              },
            }],
          },
        },
      },
    },
  };
}

function signPayMongoPayload(payload, { secret = 'whsec_test', livemode = false, timestamp = 1791350000 } = {}) {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  const signatureHeader = livemode ? `t=${timestamp},te=,li=${signature}` : `t=${timestamp},te=${signature},li=`;
  return { rawBody, signatureHeader };
}

module.exports = {
  makeCheckoutPaidEvent,
  signPayMongoPayload,
};
