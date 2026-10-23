import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

const mocks = vi.hoisted(() => ({
  getAccessState: vi.fn(),
}));

vi.mock('./identity/access', () => ({ getAccessState: mocks.getAccessState }));
vi.mock('./identity/registration', () => ({ createPaidAccountFromConfirmedRegistration: vi.fn() }));
vi.mock('./firebase', () => ({ adminAuth: {}, db: {} }));

import { mergeIdentityAccessStatus } from './paymentsAdapter';

beforeEach(() => vi.clearAllMocks());

describe('authenticated access-status adapter', () => {
  it('returns explicit grandfathered provenance without fabricating a payment reference', async () => {
    const startsAt = Timestamp.fromDate(new Date('2026-10-23T01:02:03.000Z'));
    const expiresAt = Timestamp.fromDate(new Date('2027-04-23T01:02:03.000Z'));
    mocks.getAccessState.mockResolvedValue({
      status: 'active',
      provenance: 'grandfathered-existing-account',
      accessStartsAt: startsAt,
      accessExpiresAt: expiresAt,
    });

    const result = await mergeIdentityAccessStatus('existing-user', Promise.resolve({
      status: 200,
      body: { uid: 'existing-user', latestPaymentId: null, serverTime: '2026-10-23T01:02:03.000Z' },
    }));

    expect(result.body).toMatchObject({
      uid: 'existing-user',
      status: 'active',
      active: true,
      provenance: 'grandfathered-existing-account',
      startsAt: startsAt.toDate().toISOString(),
      accessExpiresAt: expiresAt.toDate().toISOString(),
      latestPaymentId: null,
      feePhp: 0,
      periodMonths: 6,
      periodLabel: 'Existing account access',
    });
    expect(mocks.getAccessState).toHaveBeenCalledWith('existing-user');
  });

  it('does not resolve identity access for a failed payment-status response', async () => {
    const result = await mergeIdentityAccessStatus('existing-user', Promise.resolve({ status: 503, body: { code: 'unavailable' } }));

    expect(result).toEqual({ status: 503, body: { code: 'unavailable' } });
    expect(mocks.getAccessState).not.toHaveBeenCalled();
  });
});
