import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

const mocks = vi.hoisted(() => ({
  getAccessState: vi.fn(),
  listApprovedOfficerGrants: vi.fn(),
  syncVerifiedAuthEmail: vi.fn()
}));

vi.mock('./access', () => ({
  getAccessState: mocks.getAccessState,
  listApprovedOfficerGrants: mocks.listApprovedOfficerGrants,
  syncVerifiedAuthEmail: mocks.syncVerifiedAuthEmail
}));

import { getUserSession } from './session';

describe('server-derived Admin session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncVerifiedAuthEmail.mockResolvedValue({
      email: 'student@example.test',
      displayName: 'Saved Student',
      role: 'student',
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
      emailVerified: true
    });
    mocks.getAccessState.mockResolvedValue({ status: 'active' });
    mocks.listApprovedOfficerGrants.mockResolvedValue([]);
  });

  it('derives the provisioning-only Admin session from the verified soarAdmin claim', async () => {
    const session = await getUserSession({
      uid: 'local-admin',
      email: 'admin@example.test',
      name: 'Local SOAR Administrator',
      email_verified: true,
      soarAdmin: true
    } as never);

    expect(session).toMatchObject({
      uid: 'local-admin',
      email: 'admin@example.test',
      displayName: 'Local SOAR Administrator',
      accountKind: 'admin',
      emailVerified: true,
      access: { status: 'missing' },
      officerGrants: []
    });
    expect(mocks.syncVerifiedAuthEmail).not.toHaveBeenCalled();
    expect(mocks.getAccessState).not.toHaveBeenCalled();
    expect(mocks.listApprovedOfficerGrants).not.toHaveBeenCalled();
  });

  it('exposes activation-based access with explicit no-payment provenance', async () => {
    const activationAt = Timestamp.fromDate(new Date('2026-10-23T01:02:03.000Z'));
    const expiryAt = Timestamp.fromDate(new Date('2027-04-23T01:02:03.000Z'));
    mocks.getAccessState.mockResolvedValue({
      status: 'active',
      provenance: 'grandfathered-existing-account',
      accessStartsAt: activationAt,
      accessExpiresAt: expiryAt,
    });

    const session = await getUserSession({ uid: 'student-1', email_verified: true } as never);
    expect(session.access).toMatchObject({
      status: 'active',
      provenance: 'grandfathered-existing-account',
      feePhp: 0,
      periodMonths: 6,
      periodLabel: 'Existing account access',
      startsAt: '2026-10-23T01:02:03.000Z',
      expiresAt: '2027-04-23T01:02:03.000Z',
    });
  });

  it('preserves student identity and entitlement behavior without the trusted claim', async () => {
    const session = await getUserSession({
      uid: 'student-1',
      email: 'student@example.test',
      email_verified: true
    } as never);

    expect(session).toMatchObject({
      uid: 'student-1',
      accountKind: 'student',
      studentId: '2026-0001',
      access: { status: 'active' },
      officerGrants: []
    });
    expect(mocks.syncVerifiedAuthEmail).toHaveBeenCalledWith('student-1');
    expect(mocks.getAccessState).toHaveBeenCalledWith('student-1');
    expect(mocks.listApprovedOfficerGrants).toHaveBeenCalledWith('student-1');
  });
});
