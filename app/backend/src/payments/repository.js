'use strict';

const { toDate } = require('./time');

function clone(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = clone(child);
    return out;
  }
  return value;
}

function mergeRecord(existing, patch) {
  return { ...(existing || {}), ...clone(patch) };
}

class MemoryPaymentTransaction {
  constructor(store) {
    this.store = store;
  }

  async getRegistrationIntent(id) { return clone(this.store.registrationIntents.get(id)); }
  async saveRegistrationIntent(intent) { this.store.registrationIntents.set(intent.id, clone(intent)); }
  async updateRegistrationIntent(id, patch) {
    const existing = this.store.registrationIntents.get(id);
    if (!existing) throw new Error(`registration intent not found: ${id}`);
    this.store.registrationIntents.set(id, mergeRecord(existing, patch));
  }

  async findPaidIncompleteRegistrationByEmailHash(emailHash, checkoutSessionId = null) {
    for (const intent of this.store.registrationIntents.values()) {
      if (intent.emailHash !== emailHash) continue;
      if (intent.status !== 'paid' && intent.status !== 'completing') continue;
      if (checkoutSessionId) {
        const paymentIds = intent.paymentIds || [];
        const hasSession = paymentIds.some((paymentId) => {
          const payment = this.store.payments.get(paymentId);
          return payment && payment.providerCheckoutSessionId === checkoutSessionId;
        });
        if (!hasSession) continue;
      }
      return clone(intent);
    }
    return null;
  }

  async savePayment(payment) { this.store.payments.set(payment.id, clone(payment)); }
  async getPayment(id) { return clone(this.store.payments.get(id)); }
  async updatePayment(id, patch) {
    const existing = this.store.payments.get(id);
    if (!existing) throw new Error(`payment not found: ${id}`);
    this.store.payments.set(id, mergeRecord(existing, patch));
  }

  async saveCheckoutSessionIndex(providerCheckoutSessionId, index) {
    this.store.checkoutSessions.set(providerCheckoutSessionId, clone(index));
  }

  async getPaymentByCheckoutSession(providerCheckoutSessionId) {
    const indexed = this.store.checkoutSessions.get(providerCheckoutSessionId);
    if (indexed && indexed.paymentId) return clone(this.store.payments.get(indexed.paymentId));
    for (const payment of this.store.payments.values()) {
      if (payment.providerCheckoutSessionId === providerCheckoutSessionId) return clone(payment);
    }
    return null;
  }

  async getProcessedEvent(id) { return clone(this.store.processedEvents.get(id)); }
  async saveProcessedEvent(event) {
    const existing = this.store.processedEvents.get(event.id);
    this.store.processedEvents.set(event.id, mergeRecord(existing, event));
  }

  async getAccount(uid) { return clone(this.store.accounts.get(uid)); }
  async saveAccount(uid, account) { this.store.accounts.set(uid, clone(account)); }
  async getAccountByEmail(email) {
    const normalized = String(email || '').toLowerCase();
    for (const account of this.store.accounts.values()) {
      if (String(account.email || '').toLowerCase() === normalized) return clone(account);
    }
    return null;
  }

  async getEntitlement(uid) { return clone(this.store.entitlements.get(uid)); }
  async saveEntitlement(uid, entitlement) { this.store.entitlements.set(uid, clone(entitlement)); }

  async getRateLimitBucket(key) { return clone(this.store.rateLimits.get(key)); }
  async saveRateLimitBucket(key, bucket) { this.store.rateLimits.set(key, clone(bucket)); }
}

class MemoryPaymentRepository {
  constructor(seed = {}) {
    this.store = {
      registrationIntents: new Map(Object.entries(seed.registrationIntents || {})),
      payments: new Map(Object.entries(seed.payments || {})),
      checkoutSessions: new Map(Object.entries(seed.checkoutSessions || {})),
      processedEvents: new Map(Object.entries(seed.processedEvents || {})),
      accounts: new Map(Object.entries(seed.accounts || {})),
      entitlements: new Map(Object.entries(seed.entitlements || {})),
      rateLimits: new Map(Object.entries(seed.rateLimits || {})),
    };
    this.lock = Promise.resolve();
  }

  async runTransaction(callback) {
    const previous = this.lock;
    let release;
    this.lock = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await callback(new MemoryPaymentTransaction(this.store));
    } finally {
      release();
    }
  }

  snapshot() {
    const objectFromMap = (map) => Object.fromEntries([...map.entries()].map(([key, value]) => [key, clone(value)]));
    return {
      registrationIntents: objectFromMap(this.store.registrationIntents),
      payments: objectFromMap(this.store.payments),
      checkoutSessions: objectFromMap(this.store.checkoutSessions),
      processedEvents: objectFromMap(this.store.processedEvents),
      accounts: objectFromMap(this.store.accounts),
      entitlements: objectFromMap(this.store.entitlements),
      rateLimits: objectFromMap(this.store.rateLimits),
    };
  }
}

class MemoryRateLimiter {
  constructor(repository) {
    this.repository = repository;
  }

  async check({ key, limit, windowMs, now = new Date() }) {
    await this.repository.runTransaction(async (tx) => {
      const current = await tx.getRateLimitBucket(key);
      const nowDate = toDate(now);
      const windowStartedAt = current && current.windowStartedAt ? toDate(current.windowStartedAt) : nowDate;
      const sameWindow = current && nowDate.getTime() - windowStartedAt.getTime() < windowMs;
      const next = sameWindow
        ? { windowStartedAt, count: current.count + 1 }
        : { windowStartedAt: nowDate, count: 1 };
      if (next.count > limit) {
        const retryAt = new Date(toDate(next.windowStartedAt).getTime() + windowMs);
        const error = new Error('Too many attempts. Please try again later.');
        error.name = 'PaymentAccessError';
        error.code = 'rate_limited';
        error.details = { key, retryAt: retryAt.toISOString() };
        throw error;
      }
      await tx.saveRateLimitBucket(key, next);
    });
  }
}

module.exports = {
  MemoryPaymentRepository,
  MemoryRateLimiter,
  clone,
};
