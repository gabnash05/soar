'use strict';

class PaymentAccessError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'PaymentAccessError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new PaymentAccessError(code, message, details);
}

function isPaymentAccessError(error) {
  return error instanceof PaymentAccessError || Boolean(error && error.name === 'PaymentAccessError' && error.code);
}

module.exports = {
  PaymentAccessError,
  fail,
  isPaymentAccessError,
};
