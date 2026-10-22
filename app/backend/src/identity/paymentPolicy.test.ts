import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  writes: [] as Array<{ path: string; data: Record<string, unknown>; options?: unknown }>,
  db: { doc: vi.fn() },
}));

vi.mock('../firebase', () => ({ db: state.db }));

import { getPaymentPolicyStatus, isUnpaidAccessEnabled, requirePaymentsForCheckout, setPaymentPolicy } from './paymentPolicy';

function configureFirestore() {
  state.db.doc.mockImplementation((path: string) => ({
    get: async () => ({ exists: state.documents.has(path), data: () => state.documents.get(path) }),
    set: async (data: Record<string, unknown>, options?: unknown) => {
      state.writes.push({ path, data, options });
      state.documents.set(path, { ...(state.documents.get(path) ?? {}), ...data });
    },
  }));
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
