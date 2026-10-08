'use strict';

const { ACCESS_PRICE_MINOR, ACCESS_CURRENCY } = require('../constants');

class FakePayMongoProvider {
  constructor({ fail = false } = {}) {
    this.fail = fail;
    this.sessions = [];
    this.counter = 0;
  }

  async createCheckoutSession(request) {
    if (this.fail) {
      const error = new Error('provider unavailable');
      error.name = 'PaymentAccessError';
      error.code = 'provider_checkout_failed';
      throw error;
    }
    this.counter += 1;
    const providerCheckoutSessionId = `cs_test_${this.counter}`;
    const checkoutUrl = `https://checkout.paymongo.test/${providerCheckoutSessionId}`;
    this.sessions.push({ ...request, providerCheckoutSessionId, checkoutUrl });
    return { provider: 'paymongo', providerCheckoutSessionId, checkoutUrl, livemode: false };
  }
}

class FakeIdentityFoundation {
  constructor(repository, { failCreate = false } = {}) {
    this.repository = repository;
    this.failCreate = failCreate;
    this.usersByEmail = new Map();
    this.usersByUid = new Map();
    this.completedByProviderEvent = new Map();
    this.createCalls = [];
  }

  async getUserByEmail(email) {
    return this.usersByEmail.get(String(email || '').toLowerCase()) || null;
  }

  async getUser(uid) {
    return this.usersByUid.get(uid) || null;
  }

  async createPaidAccountFromConfirmedRegistration(input) {
    this.createCalls.push({ ...input, password: '[redacted]' });
    if (this.failCreate) {
      const error = new Error('identity helper failed');
      error.code = 'identity_helper_failed';
      throw error;
    }
    const providerEventId = input.entitlement.providerEventId;
    const existingUid = this.completedByProviderEvent.get(providerEventId);
    if (existingUid) return { uid: existingUid };

    const email = String(input.email || '').toLowerCase();
    const existing = this.usersByEmail.get(email);
    if (existing) {
      const error = new Error('email already exists');
      error.code = 'email_already_exists';
      throw error;
    }

    const uid = `uid_${this.usersByUid.size + 1}`;
    const authUser = { uid, email, displayName: input.displayName, emailVerified: false };
    this.usersByUid.set(uid, authUser);
    this.usersByEmail.set(email, authUser);
    this.completedByProviderEvent.set(providerEventId, uid);

    await this.repository.runTransaction(async (tx) => {
      await tx.saveAccount(uid, {
        uid,
        role: input.role,
        displayName: input.displayName,
        fullName: input.displayName,
        email,
        emailVerified: false,
        studentId: input.studentId || null,
        companyName: input.companyName || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const entitlement = await tx.getEntitlement(uid);
      await tx.saveEntitlement(uid, {
        uid,
        status: 'active',
        provider: input.entitlement.provider,
        lastProviderEventId: providerEventId,
        accessExpiresAt: input.entitlement.accessExpiresAt,
        latestPaymentId: input.entitlement.intentId,
        amount: { currency: ACCESS_CURRENCY, minor: ACCESS_PRICE_MINOR },
        history: [input.entitlement],
        createdAt: entitlement && entitlement.createdAt ? entitlement.createdAt : new Date(),
        updatedAt: new Date(),
      });
    });

    return { uid };
  }
}

module.exports = {
  FakePayMongoProvider,
  FakeIdentityFoundation,
};
