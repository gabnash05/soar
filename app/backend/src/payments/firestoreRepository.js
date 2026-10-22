'use strict';

const PAYMENT_COLLECTION = 'payments';
const REGISTRATION_INTENT_COLLECTION = 'paymentRegistrationIntents';
const CHECKOUT_SESSION_INDEX_COLLECTION = 'paymentCheckoutSessions';
const PROCESSED_EVENT_COLLECTION = 'paymentProviderEvents';
const RATE_LIMIT_COLLECTION = 'paymentRateLimits';
const ACCOUNT_COLLECTION = 'accounts';
const ENTITLEMENT_COLLECTION = 'entitlements';

function docData(snapshot) {
  return snapshot && snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

function collection(db, name) {
  return db.collection(name);
}

class FirestorePaymentTransaction {
  constructor(db, transaction) {
    this.db = db;
    this.transaction = transaction;
  }

  doc(collectionName, id) {
    return collection(this.db, collectionName).doc(id);
  }

  async getDoc(collectionName, id) {
    return docData(await this.transaction.get(this.doc(collectionName, id)));
  }

  setDoc(collectionName, id, data, options = { merge: true }) {
    this.transaction.set(this.doc(collectionName, id), data, options);
  }

  updateDoc(collectionName, id, patch) {
    this.transaction.set(this.doc(collectionName, id), patch, { merge: true });
  }

  async getRegistrationIntent(id) { return this.getDoc(REGISTRATION_INTENT_COLLECTION, id); }
  async findRegistrationIntentsByTargetUid(uid) {
    const snapshot = await this.transaction.get(collection(this.db, REGISTRATION_INTENT_COLLECTION)
      .where('targetUid', '==', uid));
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  async saveRegistrationIntent(intent) { this.setDoc(REGISTRATION_INTENT_COLLECTION, intent.id, intent, { merge: false }); }
  async updateRegistrationIntent(id, patch) { this.updateDoc(REGISTRATION_INTENT_COLLECTION, id, patch); }

  async findPaidIncompleteRegistrationByEmailHash(emailHash, checkoutSessionId = null) {
    const query = collection(this.db, REGISTRATION_INTENT_COLLECTION)
      .where('emailHash', '==', emailHash)
      .where('status', 'in', ['paid', 'completing'])
      .limit(10);
    const snapshot = await this.transaction.get(query);
    for (const doc of snapshot.docs) {
      const intent = { id: doc.id, ...doc.data() };
      if (checkoutSessionId) {
        const paymentIds = intent.paymentIds || [];
        let found = false;
        for (const paymentId of paymentIds) {
          const payment = await this.getPayment(paymentId);
          if (payment && payment.providerCheckoutSessionId === checkoutSessionId) {
            found = true;
            break;
          }
        }
        if (!found) continue;
      }
      return intent;
    }
    return null;
  }

  async savePayment(payment) { this.setDoc(PAYMENT_COLLECTION, payment.id, payment, { merge: false }); }
  async getPayment(id) { return this.getDoc(PAYMENT_COLLECTION, id); }
  async updatePayment(id, patch) { this.updateDoc(PAYMENT_COLLECTION, id, patch); }

  async saveCheckoutSessionIndex(providerCheckoutSessionId, index) {
    this.setDoc(CHECKOUT_SESSION_INDEX_COLLECTION, providerCheckoutSessionId, { providerCheckoutSessionId, ...index }, { merge: false });
  }

  async getPaymentByCheckoutSession(providerCheckoutSessionId) {
    const indexed = await this.getDoc(CHECKOUT_SESSION_INDEX_COLLECTION, providerCheckoutSessionId);
    if (indexed && indexed.paymentId) return this.getPayment(indexed.paymentId);
    const snapshot = await this.transaction.get(collection(this.db, PAYMENT_COLLECTION).where('providerCheckoutSessionId', '==', providerCheckoutSessionId).limit(1));
    return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }

  async getProcessedEvent(id) { return this.getDoc(PROCESSED_EVENT_COLLECTION, id); }
  async saveProcessedEvent(event) { this.setDoc(PROCESSED_EVENT_COLLECTION, event.id, event, { merge: true }); }

  async getAccount(uid) { return this.getDoc(ACCOUNT_COLLECTION, uid); }
  async saveAccount(uid, account) { this.setDoc(ACCOUNT_COLLECTION, uid, account, { merge: true }); }

  async getEntitlement(uid) { return this.getDoc(ENTITLEMENT_COLLECTION, uid); }
  async saveEntitlement(uid, entitlement) { this.setDoc(ENTITLEMENT_COLLECTION, uid, entitlement, { merge: true }); }

  async getRateLimitBucket(key) { return this.getDoc(RATE_LIMIT_COLLECTION, key); }
  async saveRateLimitBucket(key, bucket) { this.setDoc(RATE_LIMIT_COLLECTION, key, { key, ...bucket }, { merge: true }); }
}

class FirestorePaymentRepository {
  constructor(db) {
    if (!db || typeof db.runTransaction !== 'function') throw new TypeError('Firestore db with runTransaction is required');
    this.db = db;
  }

  async runTransaction(callback) {
    return this.db.runTransaction(async (transaction) => callback(new FirestorePaymentTransaction(this.db, transaction)));
  }
}

module.exports = {
  FirestorePaymentRepository,
  FirestorePaymentTransaction,
  collections: {
    PAYMENT_COLLECTION,
    REGISTRATION_INTENT_COLLECTION,
    CHECKOUT_SESSION_INDEX_COLLECTION,
    PROCESSED_EVENT_COLLECTION,
    RATE_LIMIT_COLLECTION,
    ACCOUNT_COLLECTION,
    ENTITLEMENT_COLLECTION,
  },
};
