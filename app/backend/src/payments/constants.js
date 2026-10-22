'use strict';

const PAYMENT_PROVIDER = 'paymongo';
const PAYMENT_METHOD = 'qrph';
const ACCESS_PRICE_MINOR = 1000;
const ACCESS_CURRENCY = 'PHP';
const ACCESS_MONTHS = 6;
const ALLOWED_ACCOUNT_ROLES = new Set(['student', 'sponsor']);
const PAYMENT_PURPOSES = Object.freeze({
  REGISTRATION: 'registration',
  RENEWAL: 'renewal',
});
const PAYMENT_STATUSES = Object.freeze({
  CREATED: 'created',
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  INVALID: 'invalid',
});
const REGISTRATION_STATUSES = Object.freeze({
  CHECKOUT_CREATED: 'checkout_created',
  CHECKOUT_FAILED: 'checkout_failed',
  PAID: 'paid',
  COMPLETING: 'completing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});
const ENTITLEMENT_STATUSES = Object.freeze({
  ACTIVE: 'active',
  EXPIRED: 'expired',
  NONE: 'none',
});

module.exports = {
  PAYMENT_PROVIDER,
  PAYMENT_METHOD,
  ACCESS_PRICE_MINOR,
  ACCESS_CURRENCY,
  ACCESS_MONTHS,
  ALLOWED_ACCOUNT_ROLES,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  REGISTRATION_STATUSES,
  ENTITLEMENT_STATUSES,
};
