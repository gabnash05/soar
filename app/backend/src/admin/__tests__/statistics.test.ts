import { describe, expect, it } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createAdminStatisticsService, type AdminStatisticsStore, adminSessionInfo } from '../statistics';

function user(uid: string, claims: Record<string, unknown> = {}): DecodedIdToken {
  return { uid, email_verified: true, ...claims } as DecodedIdToken;
}

class FakeAdminStatsStore implements AdminStatisticsStore {
  accounts = new Map<string, any>();
  students: Array<{ department?: string; departmentKey?: string }> = [];
  organizationCount = 0;

  async getAccount(uid: string) {
    return this.accounts.get(uid);
  }

  async listStudentAccounts() {
    return this.students;
  }

  async countOrganizations() {
    return this.organizationCount;
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('admin statistics authorization and aggregation', () => {
  it('requires both trusted claim and active admin account document', async () => {
    const store = new FakeAdminStatsStore();
    store.accounts.set('admin', { uid: 'admin', role: 'admin', adminStatus: 'active', emailVerified: true });
    store.accounts.set('revoked', { uid: 'revoked', role: 'admin', adminStatus: 'revoked', emailVerified: true });
    store.accounts.set('student', { uid: 'student', role: 'student', emailVerified: true });
    store.accounts.set('stale', { uid: 'stale', role: 'admin', adminStatus: 'active', emailVerified: false });
    const service = createAdminStatisticsService({ store, now: () => new Date('2026-10-12T00:00:00.000Z') });

    await expect(service.getStatistics(user('admin', { soarStatsAdmin: true }))).resolves.toMatchObject({ scope: 'registered_soar_totals' });
    await expectCode(service.getStatistics(user('admin')), 'admin_required');
    await expectCode(service.getStatistics(user('student', { soarStatsAdmin: true })), 'admin_inactive');
    await expectCode(service.getStatistics(user('revoked', { soarStatsAdmin: true })), 'admin_inactive');
    await expectCode(service.getStatistics(user('stale', { soarStatsAdmin: true })), 'admin_email_not_verified');
    await expectCode(service.getStatistics(user('admin', { email_verified: false, soarStatsAdmin: true })), 'admin_email_not_verified');
    expect(adminSessionInfo(user('admin', { soarStatsAdmin: true }), store.accounts.get('admin'))).toEqual({ statistics: true });
    expect(adminSessionInfo(user('revoked', { soarStatsAdmin: true }), store.accounts.get('revoked'))).toBeUndefined();
  });

  it('returns only aggregate student department and organization counts', async () => {
    const store = new FakeAdminStatsStore();
    store.accounts.set('admin', { uid: 'admin', role: 'admin', adminStatus: 'active', emailVerified: true });
    store.students = [
      { department: 'Computer   Science', departmentKey: 'computer science' },
      { department: 'Computer Science', departmentKey: 'computer science' },
      { department: 'Engineering' },
      {}
    ];
    store.organizationCount = 3;
    const service = createAdminStatisticsService({ store, now: () => new Date('2026-10-12T00:00:00.000Z') });

    const stats = await service.getStatistics(user('admin', { soarStatsAdmin: true }));
    expect(stats).toEqual({
      generatedAt: '2026-10-12T00:00:00.000Z',
      scope: 'registered_soar_totals',
      students: {
        totalRegisteredStudents: 4,
        missingDepartmentCount: 1,
        departments: [
          { departmentKey: 'computer science', department: 'Computer Science', count: 2 },
          { departmentKey: 'engineering', department: 'Engineering', count: 1 }
        ]
      },
      organizations: { totalOrganizations: 3 }
    });
    expect(JSON.stringify(stats)).not.toContain('admin');
    expect(JSON.stringify(stats)).not.toContain('student@example');
  });
});
