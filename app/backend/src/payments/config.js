'use strict';

function boolFromEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'live'].includes(String(value).trim().toLowerCase());
}

function loadPaymentConfigFromEnv(env = process.env) {
  return {
    appBaseUrl: env.SOAR_APP_BASE_URL || 'http://localhost:5173',
    paymongoSecretKey: env.PAYMONGO_SECRET_KEY || '',
    paymongoWebhookSecret: env.PAYMONGO_WEBHOOK_SECRET || '',
    expectedLivemode: boolFromEnv(env.PAYMONGO_EXPECTED_LIVEMODE, false),
    secretPepper: env.PAYMENT_SECRET_PEPPER || '',
    secureCookies: boolFromEnv(env.PAYMENT_SECURE_COOKIES, boolFromEnv(env.PAYMONGO_EXPECTED_LIVEMODE, false)),
  };
}

function assertPaymentConfig(config) {
  const missing = [];
  if (!config.paymongoSecretKey) missing.push('PAYMONGO_SECRET_KEY');
  if (!config.paymongoWebhookSecret) missing.push('PAYMONGO_WEBHOOK_SECRET');
  if (!config.secretPepper) missing.push('PAYMENT_SECRET_PEPPER');
  if (missing.length) {
    const error = new Error(`Missing payment configuration: ${missing.join(', ')}`);
    error.code = 'missing_payment_config';
    error.missing = missing;
    throw error;
  }
  return config;
}

module.exports = {
  loadPaymentConfigFromEnv,
  assertPaymentConfig,
};
