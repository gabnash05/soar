import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';

const mocks = vi.hoisted(() => ({
  syncVerifiedAuthEmail: vi.fn(),
  getAccessState: vi.fn(),
  listApprovedOfficerGrants: vi.fn()
}));

vi.mock('../access', () => ({
  syncVerifiedAuthEmail: mocks.syncVerifiedAuthEmail,
  getAccessState: mocks.getAccessState,
  listApprovedOfficerGrants: mocks.listApprovedOfficerGrants
}));

function token(uid: string, claims: Record<string, unknown> = {}): DecodedIdToken {
  return { uid, email_verified: true, ...claims } as DecodedIdToken;
}

describe('getUserSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessState.mockResolvedValue({ status: 'missing' });
    mocks.listApprovedOfficerGrants.mockResolvedValue([]);
  });

  it('exposes bounded stats-admin session data without officer grants or renewal prompts', async () => {
    mocks.syncVerifiedAuthEmail.mockResolvedValue({
      uid: 'admin',
      role: 'admin',
      adminStatus: 'active',
      email: 'admin@example.test',
      displayName: 'Stats Admin',
      emailVerified: true
    });
    const { getUserSession } = await import('../session');

    const session = await getUserSession(token('admin', { soarStatsAdmin: true }));

    expect(session).toMatchObject({
      uid: 'admin',
      accountKind: 'admin',
      admin: { statistics: true },
      officerGrants: [],
      access: { status: 'missing', renewalAvailable: false, periodMonths: 6, periodLabel: '6 months' }
    });
    expect(session).not.toHaveProperty('studentId');
    expect(session).not.toHaveProperty('companyName');
    expect(mocks.listApprovedOfficerGrants).not.toHaveBeenCalled();
  });

  it('keeps student profile and officer grants driven by trusted backend data', async () => {
    mocks.syncVerifiedAuthEmail.mockResolvedValue({
      uid: 'student',
      role: 'student',
      email: 'student@example.test',
      displayName: 'Student User',
      emailVerified: true,
      studentId: 'S-001',
      department: 'Computer Science'
    });
    mocks.getAccessState.mockResolvedValue({ status: 'active' });
    mocks.listApprovedOfficerGrants.mockResolvedValue([{ organizationId: 'org1', organizationName: 'Robotics', status: 'approved' }]);
    const { getUserSession } = await import('../session');

    const session = await getUserSession(token('student'));

    expect(session).toMatchObject({
      accountKind: 'student',
      studentId: 'S-001',
      department: 'Computer Science',
      access: { status: 'active', renewalAvailable: false },
      officerGrants: [{ organizationId: 'org1', organizationName: 'Robotics', status: 'approved' }]
    });
    expect(session).not.toHaveProperty('admin');
    expect(mocks.listApprovedOfficerGrants).toHaveBeenCalledWith('student');
  });
});
