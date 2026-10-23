import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  writes: [] as Array<{ path: string; data: Record<string, unknown>; options?: unknown }>,
  transactionQueue: Promise.resolve(),
  db: { doc: vi.fn(), runTransaction: vi.fn() },
}));

vi.mock('../firebase', () => ({ db: state.db }));

import { getAdminPaymentPolicyStatus, getExistingAccountAccessWindow, getPaymentPolicyStatus, isUnpaidAccessEnabled, requirePaymentsForCheckout, setPaymentPolicy } from './paymentPolicy';

function configureFirestore() {
  state.db.doc.mockImplementation((path: string) => ({
    path,
    get: async () => ({ exists: state.documents.has(path), data: () => state.documents.get(path) }),
  }));
  state.transactionQueue = Promise.resolve();
  state.db.runTransaction.mockImplementation((callback: (transaction: any) => Promise<unknown>) => {
    const result = state.transactionQueue.then(async () => {
      const writes: Array<{ path: string; data: Record<string, unknown>; options?: unknown }> = [];
      const transaction = {
        get: async (ref: { path: string }) => ({ exists: state.documents.has(ref.path), data: () => state.documents.get(ref.path) }),
        set: (ref: { path: string }, data: Record<string, unknown>, options?: unknown) => writes.push({ path: ref.path, data, options }),
      };
      const value = await callback(transaction);
      for (const write of writes) {
        state.writes.push(write);
        state.documents.set(write.path, { ...(state.documents.get(write.path) ?? {}), ...write.data });
      }
      return value;
    });
    state.transactionQueue = result.then(() => undefined, () => undefined);
    return result;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.documents.clear();
  state.writes.length = 0;
  configureFirestore();
  process.env.SOAR_DISABLE_PAYMENTS = 'true';
  delete process.env.SOAR_APP_BASE_URL;
  delete process.env.PAYMONGO_SECRET_KEY;
  delete process.env.PAYMONGO_WEBHOOK_SECRET;
  delete process.env.PAYMENT_SECRET_PEPPER;
  delete process.env.PAYMONGO_EXPECTED_LIVEMODE;
});

describe('global payment policy', () => {
  it('defaults to explicit unpaid preview and never infers payment requirement from credentials or deployment state', async () => {
    await expect(getPaymentPolicyStatus()).resolves.toEqual({
      paymentsRequired: false,
      checkout: { status: 'disabled', mode: null },
    });
    await expect(isUnpaidAccessEnabled()).resolves.toBe(true);

    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    process.env.SOAR_APP_BASE_URL = 'https://soar.example.test';
    process.env.PAYMONGO_SECRET_KEY = 'configured-only';
    process.env.PAYMONGO_WEBHOOK_SECRET = 'configured-only';
    process.env.PAYMENT_SECRET_PEPPER = 'configured-only';
    await expect(getPaymentPolicyStatus()).resolves.toEqual({
      paymentsRequired: false,
      checkout: { status: 'configured', mode: 'test' },
    });
    await expect(isUnpaidAccessEnabled()).resolves.toBe(true);
    await expect(requirePaymentsForCheckout()).rejects.toMatchObject({ code: 'payments_not_required', status: 409 });
  });

  it('lets an explicit saved Admin choice control preview independently of the deployment checkout boundary', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'true';
    state.documents.set('systemSettings/paymentPolicy', { paymentsRequired: true, updatedByUid: 'trusted-admin' });

    await expect(getPaymentPolicyStatus()).resolves.toEqual({
      paymentsRequired: true,
      checkout: { status: 'disabled', mode: null },
    });
    await expect(isUnpaidAccessEnabled()).resolves.toBe(false);
    await expect(requirePaymentsForCheckout()).rejects.toMatchObject({ code: 'payments_unavailable', status: 503 });
  });

  it('persists only the validated global choice with server audit metadata', async () => {
    const result = await setPaymentPolicy({ paymentsRequired: false }, 'trusted-admin');

    expect(result).toEqual({ paymentsRequired: false, checkout: { status: 'disabled', mode: null }, updatedByUid: 'trusted-admin' });
    expect(state.documents.get('systemSettings/paymentPolicy')).toMatchObject({
      paymentsRequired: false,
      updatedByUid: 'trusted-admin',
    });
    expect(state.documents.get('systemSettings/paymentPolicy')).toHaveProperty('updatedAt');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].path).toBe('systemSettings/paymentPolicy');
    expect(state.writes[0].options).toEqual({ merge: true });
  });

  it('starts the existing-account clock only on an explicit live-ready Admin save', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    process.env.SOAR_APP_BASE_URL = 'https://soar.example.test';
    process.env.PAYMONGO_SECRET_KEY = 'configured-only';
    process.env.PAYMONGO_WEBHOOK_SECRET = 'configured-only';
    process.env.PAYMENT_SECRET_PEPPER = 'configured-only';
    process.env.PAYMONGO_EXPECTED_LIVEMODE = 'false';
    state.documents.set('systemSettings/paymentPolicy', { paymentsRequired: true, updatedByUid: 'existing-admin' });

    await setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin');
    expect(state.documents.get('systemSettings/paymentPolicy')).not.toHaveProperty('existingAccountAccessActivatedAt');
    await expect(getExistingAccountAccessWindow()).resolves.toBeUndefined();

    process.env.PAYMONGO_EXPECTED_LIVEMODE = 'true';
    const saved = await setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin');
    const activationAt = state.documents.get('systemSettings/paymentPolicy')?.existingAccountAccessActivatedAt;
    expect(activationAt).toBeInstanceOf(Timestamp);
    expect(saved.existingAccountAccessActivatedAt).toBe((activationAt as Timestamp).toDate().toISOString());
    await expect(getExistingAccountAccessWindow()).resolves.toEqual({
      activatedAt: activationAt,
      expiresAt: state.documents.get('systemSettings/paymentPolicy')?.existingAccountAccessExpiresAt,
    });
  });

  it('keeps the activation timestamp out of the public payment-policy response', async () => {
    const activatedAt = Timestamp.fromDate(new Date('2026-10-23T01:02:03.000Z'));
    const expiresAt = Timestamp.fromDate(new Date('2027-04-23T01:02:03.000Z'));
    state.documents.set('systemSettings/paymentPolicy', {
      paymentsRequired: true,
      existingAccountAccessActivatedAt: activatedAt,
      existingAccountAccessExpiresAt: expiresAt,
    });

    await expect(getPaymentPolicyStatus()).resolves.toEqual({
      paymentsRequired: true,
      checkout: { status: 'disabled', mode: null },
    });
    await expect(getAdminPaymentPolicyStatus()).resolves.toMatchObject({
      existingAccountAccessActivatedAt: activatedAt.toDate().toISOString(),
    });
  });

  it('stores the end-of-month activation expiry using six UTC calendar months', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    process.env.SOAR_APP_BASE_URL = 'https://soar.example.test';
    process.env.PAYMONGO_SECRET_KEY = 'configured-only';
    process.env.PAYMONGO_WEBHOOK_SECRET = 'configured-only';
    process.env.PAYMENT_SECRET_PEPPER = 'configured-only';
    process.env.PAYMONGO_EXPECTED_LIVEMODE = 'true';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-31T23:45:12.345Z'));
    try {
      await setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin');
      const policy = state.documents.get('systemSettings/paymentPolicy');
      expect((policy?.existingAccountAccessActivatedAt as Timestamp).toDate().toISOString()).toBe('2026-01-31T23:45:12.345Z');
      expect((policy?.existingAccountAccessExpiresAt as Timestamp).toDate().toISOString()).toBe('2026-07-31T23:45:12.345Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start activation while the server hard stop is on or checkout is in test mode', async () => {
    state.documents.set('systemSettings/paymentPolicy', { paymentsRequired: true });
    await setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin');
    expect(state.documents.get('systemSettings/paymentPolicy')).not.toHaveProperty('existingAccountAccessActivatedAt');

    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    process.env.SOAR_APP_BASE_URL = 'https://soar.example.test';
    process.env.PAYMONGO_SECRET_KEY = 'configured-only';
    process.env.PAYMONGO_WEBHOOK_SECRET = 'configured-only';
    process.env.PAYMENT_SECRET_PEPPER = 'configured-only';
    process.env.PAYMONGO_EXPECTED_LIVEMODE = 'false';
    await setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin');
    expect(state.documents.get('systemSettings/paymentPolicy')).not.toHaveProperty('existingAccountAccessActivatedAt');
  });

  it('fails closed instead of overwriting a malformed pre-existing activation boundary', async () => {
    const existingExpiry = Timestamp.fromDate(new Date('2027-04-23T01:02:03.000Z'));
    state.documents.set('systemSettings/paymentPolicy', {
      paymentsRequired: true,
      existingAccountAccessExpiresAt: existingExpiry,
    });
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    process.env.SOAR_APP_BASE_URL = 'https://soar.example.test';
    process.env.PAYMONGO_SECRET_KEY = 'configured-only';
    process.env.PAYMONGO_WEBHOOK_SECRET = 'configured-only';
    process.env.PAYMENT_SECRET_PEPPER = 'configured-only';
    process.env.PAYMONGO_EXPECTED_LIVEMODE = 'true';

    await expect(setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin'))
      .rejects.toMatchObject({ code: 'payment_policy_invalid', status: 503 });
    expect(state.documents.get('systemSettings/paymentPolicy')?.existingAccountAccessExpiresAt).toBe(existingExpiry);
    expect(state.documents.get('systemSettings/paymentPolicy')).not.toHaveProperty('existingAccountAccessActivatedAt');
  });

  it('keeps the first activation timestamp stable across repeated saves and OFF/ON toggles', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    process.env.SOAR_APP_BASE_URL = 'https://soar.example.test';
    process.env.PAYMONGO_SECRET_KEY = 'configured-only';
    process.env.PAYMONGO_WEBHOOK_SECRET = 'configured-only';
    process.env.PAYMENT_SECRET_PEPPER = 'configured-only';
    process.env.PAYMONGO_EXPECTED_LIVEMODE = 'true';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T01:02:03.000Z'));
    try {
      await setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin');
      const firstActivation = state.documents.get('systemSettings/paymentPolicy')?.existingAccountAccessActivatedAt as Timestamp;
      vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
      await setPaymentPolicy({ paymentsRequired: false }, 'trusted-admin');
      await setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin');
      const finalActivation = state.documents.get('systemSettings/paymentPolicy')?.existingAccountAccessActivatedAt as Timestamp;
      expect(finalActivation.toMillis()).toBe(firstActivation.toMillis());
      expect((await getAdminPaymentPolicyStatus()).existingAccountAccessActivatedAt).toBe(firstActivation.toDate().toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('serializes concurrent first activation requests to one permanent server timestamp', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    process.env.SOAR_APP_BASE_URL = 'https://soar.example.test';
    process.env.PAYMONGO_SECRET_KEY = 'configured-only';
    process.env.PAYMONGO_WEBHOOK_SECRET = 'configured-only';
    process.env.PAYMENT_SECRET_PEPPER = 'configured-only';
    process.env.PAYMONGO_EXPECTED_LIVEMODE = 'true';

    await Promise.all(Array.from({ length: 8 }, () => setPaymentPolicy({ paymentsRequired: true }, 'trusted-admin')));
    const activationWrites = state.writes.filter((write) => 'existingAccountAccessActivatedAt' in write.data);
    expect(activationWrites).toHaveLength(1);
    expect(state.documents.get('systemSettings/paymentPolicy')?.existingAccountAccessActivatedAt).toBeInstanceOf(Timestamp);
  });

  it('rejects malformed stored policy and unknown write fields instead of silently enabling unpaid access', async () => {
    state.documents.set('systemSettings/paymentPolicy', { paymentsRequired: 'false' });
    await expect(getPaymentPolicyStatus()).rejects.toMatchObject({ code: 'payment_policy_invalid', status: 503 });
    await expect(setPaymentPolicy({ paymentsRequired: false, uid: 'target-user' }, 'trusted-admin')).rejects.toMatchObject({ name: 'ZodError' });
    expect(state.writes).toHaveLength(0);
  });

  it('reports configuration presence and test/live mode without returning any credential values', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    state.documents.set('systemSettings/paymentPolicy', { paymentsRequired: true });
    process.env.SOAR_APP_BASE_URL = 'https://soar.example.test';
    process.env.PAYMONGO_SECRET_KEY = 'configured-only';
    process.env.PAYMONGO_WEBHOOK_SECRET = 'configured-only';
    process.env.PAYMENT_SECRET_PEPPER = 'configured-only';

    await expect(getPaymentPolicyStatus()).resolves.toMatchObject({
      paymentsRequired: true,
      checkout: { status: 'configured', mode: 'test' },
    });

    process.env.PAYMENT_SECURE_COOKIES = 'false';
    await expect(getPaymentPolicyStatus()).resolves.toMatchObject({ checkout: { status: 'not_configured', mode: null } });
    delete process.env.PAYMENT_SECURE_COOKIES;
    process.env.PAYMONGO_EXPECTED_LIVEMODE = 'true';
    await expect(getPaymentPolicyStatus()).resolves.toMatchObject({ checkout: { status: 'configured', mode: 'live' } });
    const serialized = JSON.stringify(await getPaymentPolicyStatus());
    expect(serialized).not.toContain('configured-only');
  });
});
