import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

const mocks = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  get: vi.fn(),
  update: vi.fn(),
  getUser: vi.fn(),
  getAccessWindow: vi.fn(),
}));

vi.mock('./paymentPolicy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./paymentPolicy')>()),
  getExistingAccountAccessWindow: mocks.getAccessWindow,
}));

vi.mock('../firebase', () => ({
  adminAuth: { getUser: mocks.getUser },
  db: {
    doc: (path: string) => ({
      get: () => mocks.get(path),
      update: (...args: unknown[]) => mocks.update(path, ...args),
    }),
    collectionGroup: vi.fn(),
  },
}));

import { getAccessState, requireActiveAccess } from './access';

const snapshot = (path: string) => ({ exists: mocks.records.has(path), data: () => mocks.records.get(path) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.get.mockImplementation(async (path: string) => snapshot(path));
  mocks.getAccessWindow.mockResolvedValue(undefined);
  process.env.SOAR_DISABLE_PAYMENTS = 'true';
});

describe('access policy', () => {
  it('allows only explicitly marked unpaid-preview accounts under the existing preview switch', async () => {
    mocks.records.set('accounts/preview-user', {
      uid: 'preview-user',
      accessProvenance: 'unpaid-preview',
      previewAccessGrantedAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
    });

    await expect(getAccessState('preview-user')).resolves.toMatchObject({
      status: 'active',
      provenance: 'unpaid-preview',
      accessStartsAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
    });
    await expect(getAccessState('unmarked-user')).resolves.toEqual({ status: 'missing' });
  });

  it('does not grant unpaid-preview access when the persisted global policy requires payment', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    mocks.records.set('accounts/preview-user', { uid: 'preview-user', accessProvenance: 'unpaid-preview' });
    mocks.records.set('systemSettings/paymentPolicy', { paymentsRequired: true });

    await expect(getAccessState('preview-user')).resolves.toEqual({ status: 'missing' });
    expect(mocks.get).toHaveBeenCalledWith('entitlements/preview-user');
    expect(mocks.get).toHaveBeenCalledWith('accounts/preview-user');
    expect(mocks.get).toHaveBeenCalledWith('systemSettings/paymentPolicy');
  });

  it('honors an explicit Admin choice for unpaid-preview access independently of the deployment default', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    mocks.records.set('accounts/preview-user', { uid: 'preview-user', accessProvenance: 'unpaid-preview' });
    mocks.records.set('systemSettings/paymentPolicy', { paymentsRequired: false });

    await expect(getAccessState('preview-user')).resolves.toMatchObject({ status: 'active', provenance: 'unpaid-preview' });
  });

  it('keeps a verified paid entitlement authoritative over preview provenance', async () => {
    const expiry = Timestamp.fromDate(new Date(Date.now() + 60_000));
    mocks.records.set('accounts/preview-user', { uid: 'preview-user', accessProvenance: 'unpaid-preview' });
    mocks.records.set('entitlements/preview-user', { uid: 'preview-user', status: 'active', accessExpiresAt: expiry });

    await expect(getAccessState('preview-user')).resolves.toMatchObject({
      status: 'active',
      provenance: 'provider-confirmed-payment',
      accessExpiresAt: expiry,
    });
  });

  it('grants six UTC calendar months from first activation only to profiles created before the boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const activationAt = Timestamp.fromDate(new Date('2026-01-31T23:45:12.345Z'));
    const expiresAt = Timestamp.fromDate(new Date('2026-07-31T23:45:12.345Z'));
    mocks.getAccessWindow.mockResolvedValue({ activatedAt: activationAt, expiresAt });
    mocks.records.set('systemSettings/paymentPolicy', { paymentsRequired: true });
    mocks.records.set('accounts/existing', {
      uid: 'existing', role: 'student', createdAt: Timestamp.fromDate(new Date('2026-01-31T23:45:12.344Z')),
    });
    mocks.records.set('accounts/same-boundary', {
      uid: 'same-boundary', role: 'student', createdAt: activationAt,
    });
    mocks.records.set('accounts/new', {
      uid: 'new', role: 'student', createdAt: Timestamp.fromDate(new Date('2026-02-01T00:00:00.000Z')),
    });
    mocks.records.set('accounts/uncertain', { uid: 'uncertain', role: 'student' });

    try {
      await expect(getAccessState('existing')).resolves.toMatchObject({
        status: 'active',
        provenance: 'grandfathered-existing-account',
        accessStartsAt: activationAt,
        accessExpiresAt: Timestamp.fromDate(new Date('2026-07-31T23:45:12.345Z')),
      });
      await expect(getAccessState('same-boundary')).resolves.toEqual({ status: 'missing' });
      await expect(getAccessState('new')).resolves.toEqual({ status: 'missing' });
      await expect(getAccessState('uncertain')).resolves.toEqual({ status: 'missing' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps first-activation access stable across OFF/ON policy changes without writing account or payment records', async () => {
    const activationAt = Timestamp.fromDate(new Date(Date.now() + 60_000));
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000));
    mocks.getAccessWindow.mockResolvedValue({ activatedAt: activationAt, expiresAt });
    mocks.records.set('accounts/existing', {
      uid: 'existing', role: 'student', createdAt: Timestamp.fromDate(new Date(activationAt.toMillis() - 1)),
    });
    mocks.records.set('systemSettings/paymentPolicy', { paymentsRequired: false });

    const firstRead = await getAccessState('existing');
    mocks.records.set('systemSettings/paymentPolicy', { paymentsRequired: true });
    const secondRead = await getAccessState('existing');
    expect(secondRead).toEqual(firstRead);
    expect(secondRead).toMatchObject({ status: 'active', provenance: 'grandfathered-existing-account' });
    expect(mocks.records.has('entitlements/existing')).toBe(false);
    expect(mocks.records.has('paymentProviderEvents/existing')).toBe(false);
  });

  it('preserves a longer valid paid entitlement instead of replacing it with grandfathered provenance', async () => {
    const activationAt = Timestamp.fromDate(new Date(Date.now() - 60_000));
    const paidExpiry = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    const paidEntitlement = { uid: 'existing', status: 'active', accessExpiresAt: paidExpiry, latestPaymentId: 'real-payment' };
    mocks.getAccessWindow.mockResolvedValue({ activatedAt: activationAt, expiresAt: Timestamp.fromDate(new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)) });
    mocks.records.set('accounts/existing', {
      uid: 'existing', role: 'student', createdAt: Timestamp.fromDate(new Date(activationAt.toMillis() - 1)),
    });
    mocks.records.set('entitlements/existing', paidEntitlement);

    await expect(getAccessState('existing')).resolves.toMatchObject({
      status: 'active', provenance: 'provider-confirmed-payment', accessExpiresAt: paidExpiry,
    });
    expect(mocks.records.get('entitlements/existing')).toBe(paidEntitlement);
  });

  it('does not revive revoked access for an otherwise eligible account', async () => {
    const activationAt = Timestamp.fromDate(new Date(Date.now() - 60_000));
    mocks.getAccessWindow.mockResolvedValue({ activatedAt: activationAt, expiresAt: Timestamp.fromDate(new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)) });
    mocks.records.set('accounts/revoked', {
      uid: 'revoked', role: 'student', createdAt: Timestamp.fromDate(new Date(activationAt.toMillis() - 1)),
    });
    mocks.records.set('entitlements/revoked', {
      uid: 'revoked', status: 'revoked', accessExpiresAt: Timestamp.fromDate(new Date(Date.now() + 60_000)),
    });

    await expect(getAccessState('revoked')).resolves.toMatchObject({ status: 'revoked' });
  });

  it('keeps genuinely new free-mode profiles on explicit unpaid-preview provenance', async () => {
    const activationAt = Timestamp.fromDate(new Date(Date.now() - 60_000));
    mocks.getAccessWindow.mockResolvedValue({ activatedAt: activationAt, expiresAt: Timestamp.fromDate(new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)) });
    mocks.records.set('systemSettings/paymentPolicy', { paymentsRequired: false });
    mocks.records.set('accounts/new-preview', {
      uid: 'new-preview',
      role: 'student',
      createdAt: Timestamp.fromDate(new Date(activationAt.toMillis() + 1)),
      accessProvenance: 'unpaid-preview',
      previewAccessGrantedAt: Timestamp.fromDate(new Date(Date.now() - 1_000)),
    });

    await expect(getAccessState('new-preview')).resolves.toMatchObject({ status: 'active', provenance: 'unpaid-preview' });
    mocks.records.set('systemSettings/paymentPolicy', { paymentsRequired: true });
    await expect(getAccessState('new-preview')).resolves.toEqual({ status: 'missing' });
  });

  it('reports an expired grandfathered period without reviving or inventing payment history', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-08-01T00:00:00.000Z'));
    const activationAt = Timestamp.fromDate(new Date('2027-01-31T23:45:12.345Z'));
    const expiresAt = Timestamp.fromDate(new Date('2027-07-31T23:45:12.345Z'));
    mocks.getAccessWindow.mockResolvedValue({ activatedAt: activationAt, expiresAt });
    mocks.records.set('accounts/expired', {
      uid: 'expired', role: 'student', createdAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z')),
    });

    try {
      await expect(getAccessState('expired')).resolves.toMatchObject({
        status: 'expired',
        provenance: 'grandfathered-existing-account',
        accessExpiresAt: Timestamp.fromDate(new Date('2027-07-31T23:45:12.345Z')),
      });
      expect(mocks.records.has('entitlements/expired')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets verified preview users use guarded APIs, but still requires verified email', async () => {
    mocks.records.set('accounts/preview-user', { uid: 'preview-user', accessProvenance: 'unpaid-preview' });

    await expect(requireActiveAccess({ uid: 'preview-user', email_verified: true } as never)).resolves.toBeUndefined();
    await expect(requireActiveAccess({ uid: 'preview-user', email_verified: false } as never))
      .rejects.toMatchObject({ code: 'email_not_verified' });
    await expect(requireActiveAccess({ uid: 'unmarked-user', email_verified: true } as never))
      .rejects.toMatchObject({ code: 'access_inactive' });
  });

  it('does not let a preview marker override a revoked access record', async () => {
    mocks.records.set('accounts/preview-user', { uid: 'preview-user', accessProvenance: 'unpaid-preview' });
    mocks.records.set('entitlements/preview-user', { uid: 'preview-user', status: 'revoked', accessExpiresAt: Timestamp.fromDate(new Date(Date.now() + 60_000)) });

    await expect(getAccessState('preview-user')).resolves.toMatchObject({ status: 'revoked', provenance: 'provider-confirmed-payment' });
  });
});
