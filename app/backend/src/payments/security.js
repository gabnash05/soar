'use strict';

const crypto = require('node:crypto');
const { fail } = require('./errors');

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomId(prefix = '') {
  return `${prefix}${crypto.randomUUID ? crypto.randomUUID() : randomToken(18)}`;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function hmacSha256Hex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function timingSafeEqualHex(expectedHex, actualHex) {
  if (typeof expectedHex !== 'string' || typeof actualHex !== 'string') return false;
  const normalizedExpected = expectedHex.toLowerCase();
  const normalizedActual = actualHex.toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalizedExpected) || !/^[0-9a-f]+$/.test(normalizedActual)) return false;
  const expected = Buffer.from(normalizedExpected, 'hex');
  const actual = Buffer.from(normalizedActual, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function hashSecret(secret, pepper) {
  if (!secret) fail('missing_secret', 'A registration secret is required.');
  if (!pepper) fail('missing_secret_pepper', 'Registration secret pepper is not configured.');
  return hmacSha256Hex(pepper, String(secret));
}

function verifySecret({ secret, expectedHash, pepper }) {
  const actual = hashSecret(secret, pepper);
  return timingSafeEqualHex(expectedHash, actual);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function redactEmail(email) {
  const normalized = normalizeEmail(email);
  const [name, domain] = normalized.split('@');
  if (!name || !domain) return '';
  return `${name.slice(0, 2)}***@${domain}`;
}

function emailHash(email, pepper) {
  return hashSecret(normalizeEmail(email), pepper);
}

module.exports = {
  randomToken,
  randomId,
  sha256Hex,
  hmacSha256Hex,
  timingSafeEqualHex,
  hashSecret,
  verifySecret,
  normalizeEmail,
  redactEmail,
  emailHash,
};
