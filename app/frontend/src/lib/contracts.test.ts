import { describe, expect, it } from 'vitest';
import { hasActiveAccess, hasApprovedOfficerGrant, isStudentAccount } from './contracts';
import { makeSession } from '../test/createMockGateway';

describe('trusted session helpers', () => {
  it('treats backend active grants as approved officer access', () => {
    const session = makeSession({
      officerGrants: [{ organizationId: 'robotics', organizationName: 'Computer Engineering Department', status: 'active' }],
    });

    expect(hasApprovedOfficerGrant(session)).toBe(true);
  });

  it('keeps sponsors out of student-only areas', () => {
    const session = makeSession({ accountKind: 'sponsor', studentId: undefined });

    expect(isStudentAccount(session)).toBe(false);
    expect(hasActiveAccess(session)).toBe(true);
  });

  it('does not treat expired entitlements as active access', () => {
    const session = makeSession({ access: { status: 'expired', annualFeePhp: 10, renewalAvailable: true } });

    expect(hasActiveAccess(session)).toBe(false);
  });
});
