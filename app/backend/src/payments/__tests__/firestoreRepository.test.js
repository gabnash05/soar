'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { FirestorePaymentRepository, collections } = require('../firestoreRepository');

function createFakeFirestore() {
  const documents = new Map();
  const keyFor = (collection, id) => `${collection}/${id}`;

  class Query {
    constructor(collection, filters = [], max = Infinity) {
      this.collection = collection;
      this.filters = filters;
      this.max = max;
    }

    where(field, operator, value) {
      return new Query(this.collection, [...this.filters, { field, operator, value }], this.max);
    }

    limit(max) {
      return new Query(this.collection, this.filters, max);
    }
  }

  const collection = (name) => ({
    doc(id) {
      return { kind: 'document', collection: name, id, key: keyFor(name, id) };
    },
    where(field, operator, value) {
      return new Query(name, [{ field, operator, value }]);
    },
  });

  const transaction = {
    async get(reference) {
      if (reference.kind === 'document') {
        const value = documents.get(reference.key);
        return {
          id: reference.id,
          exists: value !== undefined,
          data: () => structuredClone(value),
        };
      }

      const matching = [...documents.entries()]
        .filter(([key]) => key.startsWith(`${reference.collection}/`))
        .map(([key, value]) => {
          const id = key.slice(reference.collection.length + 1);
          return { id, value };
        })
        .filter(({ value }) => reference.filters.every(({ field, operator, value: expected }) => {
          const actual = value[field];
          return operator === '==' ? actual === expected
            : operator === 'in' ? expected.includes(actual)
              : false;
        }))
        .slice(0, reference.max);
      return {
        empty: matching.length === 0,
        docs: matching.map(({ id, value }) => ({ id, exists: true, data: () => structuredClone(value) })),
      };
    },
    set(reference, value, options = { merge: true }) {
      const current = documents.get(reference.key);
      documents.set(reference.key, options.merge === false ? structuredClone(value) : { ...(current || {}), ...structuredClone(value) });
    },
  };

  return {
    collection,
    async runTransaction(callback) {
      return callback(transaction);
    },
    documents,
  };
}

test('Firestore payment repository persists and resolves registration, payment, and checkout-session records', async () => {
  const db = createFakeFirestore();
  const repository = new FirestorePaymentRepository(db);
  const intent = {
    id: 'reg_1',
    emailHash: 'hashed-email',
    targetUid: 'firebase-uid-1',
    status: 'paid',
    paymentIds: ['pay_1'],
  };
  const payment = {
    id: 'pay_1',
    purpose: 'registration',
    status: 'pending',
    providerCheckoutSessionId: 'cs_1',
  };

  await repository.runTransaction(async (transaction) => {
    await transaction.saveRegistrationIntent(intent);
    await transaction.savePayment(payment);
    await transaction.saveCheckoutSessionIndex('cs_1', { paymentId: 'pay_1', registrationIntentId: 'reg_1' });
  });

  const stored = await repository.runTransaction(async (transaction) => ({
    intent: await transaction.getRegistrationIntent('reg_1'),
    payment: await transaction.getPaymentByCheckoutSession('cs_1'),
    paidIncomplete: await transaction.findPaidIncompleteRegistrationByEmailHash('hashed-email', 'cs_1'),
    byTargetUid: await transaction.findRegistrationIntentsByTargetUid('firebase-uid-1'),
  }));

  assert.equal(stored.intent.id, 'reg_1');
  assert.equal(stored.payment.id, 'pay_1');
  assert.equal(stored.paidIncomplete.id, 'reg_1');
  assert.deepEqual(stored.byTargetUid.map((registration) => registration.id), ['reg_1']);
  assert.equal(db.documents.has(`${collections.REGISTRATION_INTENT_COLLECTION}/reg_1`), true);
  assert.equal(db.documents.has(`${collections.CHECKOUT_SESSION_INDEX_COLLECTION}/cs_1`), true);
});
