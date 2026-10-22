import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

const mocks = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  get: vi.fn(),
  update: vi.fn(),
  getUser: vi.fn(),
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
