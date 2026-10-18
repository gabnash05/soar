'use strict';

const { ACCESS_MONTHS, ENTITLEMENT_STATUSES } = require('./constants');

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
  return new Date(value);
}

function dateToIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function daysInUtcMonth(year, monthZeroBased) {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

function addCalendarMonthsUtc(value, months = ACCESS_MONTHS) {
  const source = toDate(value);
  if (!source || Number.isNaN(source.getTime())) throw new TypeError('valid date required');

  const totalMonths = source.getUTCMonth() + months;
  const targetYear = source.getUTCFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const targetDay = Math.min(source.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  ));
}

function computeNextAccessExpiry({ currentAccessExpiresAt, paidAt, now = new Date() }) {
  const paidDate = toDate(paidAt) || toDate(now);
  const currentExpiry = toDate(currentAccessExpiresAt);
  const base = currentExpiry && currentExpiry.getTime() > paidDate.getTime() ? currentExpiry : paidDate;
  return addCalendarMonthsUtc(base, ACCESS_MONTHS);
}

function entitlementStatus(entitlement, now = new Date()) {
  if (!entitlement || !entitlement.accessExpiresAt) return ENTITLEMENT_STATUSES.NONE;
  const expiresAt = toDate(entitlement.accessExpiresAt);
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return ENTITLEMENT_STATUSES.NONE;
  if (entitlement.status && entitlement.status !== ENTITLEMENT_STATUSES.ACTIVE) return ENTITLEMENT_STATUSES.EXPIRED;
  return expiresAt.getTime() > toDate(now).getTime() ? ENTITLEMENT_STATUSES.ACTIVE : ENTITLEMENT_STATUSES.EXPIRED;
}

module.exports = {
  toDate,
  dateToIso,
  addCalendarMonthsUtc,
  computeNextAccessExpiry,
  entitlementStatus,
};
