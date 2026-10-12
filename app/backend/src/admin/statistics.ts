import type { DecodedIdToken } from 'firebase-admin/auth';
import type { DocumentData } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../contracts/paths';
import { normalizeDepartmentKey } from '../contracts/validation';
import type { AccountDocument } from '../contracts/schema';
import { AppError } from '../errors';
import { db } from '../firebase';

export interface AdminStatisticsAccount {
  uid: string;
  role?: string;
  displayName?: string;
  email?: string;
  emailVerified?: boolean;
  adminStatus?: string;
  disabled?: boolean;
}

export interface AdminStatisticsStore {
  getAccount(uid: string): Promise<AdminStatisticsAccount | undefined>;
  listStudentAccounts(): Promise<Array<Pick<AccountDocument, 'department' | 'departmentKey'>>>;
  countOrganizations(): Promise<number>;
}

export interface AdminStatisticsDeps {
  store: AdminStatisticsStore;
  now: () => Date;
}

export interface AdminSessionInfo {
  statistics: true;
}

export class FirestoreAdminStatisticsStore implements AdminStatisticsStore {
  async getAccount(uid: string): Promise<AdminStatisticsAccount | undefined> {
    const snap = await db.collection(COLLECTIONS.accounts).doc(uid).get();
    return snap.exists ? snap.data() as AdminStatisticsAccount : undefined;
  }

  async listStudentAccounts(): Promise<Array<Pick<AccountDocument, 'department' | 'departmentKey'>>> {
    const snap = await db.collection(COLLECTIONS.accounts).where('role', '==', 'student').get();
    return snap.docs.map((doc) => doc.data() as Pick<AccountDocument, 'department' | 'departmentKey'>);
  }

  async countOrganizations(): Promise<number> {
    const snap = await db.collection(COLLECTIONS.organizations).get();
    return snap.docs.filter((doc) => !isDeleted(doc.data())).length;
  }
}

function isDeleted(data: DocumentData): boolean {
  const deletedAt = data.deletedAt;
  return deletedAt instanceof Timestamp || Boolean(deletedAt);
}

function hasStatsAdminClaim(user: DecodedIdToken): boolean {
  return user.soarStatsAdmin === true;
}

export function assertStatsAdmin(user: DecodedIdToken, account: AdminStatisticsAccount | undefined): AdminStatisticsAccount {
  if (!hasStatsAdminClaim(user)) {
    throw new AppError('admin_required', 'Statistics administrator access is required.', 403);
  }
  if (user.email_verified !== true) {
    throw new AppError('admin_email_not_verified', 'Verify the admin email before using statistics.', 403, 'verify_email');
  }
  if (!account) {
    throw new AppError('admin_account_missing', 'The statistics admin account is not provisioned.', 403, 'contact_support');
  }
  if (account.emailVerified !== true) {
    throw new AppError('admin_email_not_verified', 'Verify the admin email before using statistics.', 403, 'verify_email');
  }
  if (account.role !== 'admin' || account.adminStatus !== 'active' || account.disabled === true) {
    throw new AppError('admin_inactive', 'The statistics admin account is not active.', 403, 'contact_support');
  }

  return account;
}

export function adminSessionInfo(user: DecodedIdToken, account: AdminStatisticsAccount): AdminSessionInfo | undefined {
  try {
    assertStatsAdmin(user, account);
    return { statistics: true };
  } catch {
    return undefined;
  }
}

export function createAdminStatisticsService(deps: AdminStatisticsDeps = {
  store: new FirestoreAdminStatisticsStore(),
  now: () => new Date()
}) {
  return {
    async getStatistics(user: DecodedIdToken) {
      const account = await deps.store.getAccount(user.uid);
      assertStatsAdmin(user, account);

      const [students, organizationCount] = await Promise.all([
        deps.store.listStudentAccounts(),
        deps.store.countOrganizations()
      ]);

      const groups = new Map<string, { departmentKey: string; department: string; count: number }>();
      let missingDepartmentCount = 0;
      for (const student of students) {
        const department = typeof student.department === 'string' ? student.department.trim().replace(/\s+/g, ' ') : '';
        if (!department) {
          missingDepartmentCount += 1;
          continue;
        }
        const key = typeof student.departmentKey === 'string' && student.departmentKey.trim()
          ? student.departmentKey.trim().toLocaleLowerCase()
          : normalizeDepartmentKey(department);
        const current = groups.get(key);
        if (current) {
          current.count += 1;
        } else {
          groups.set(key, { departmentKey: key, department, count: 1 });
        }
      }

      return {
        generatedAt: deps.now().toISOString(),
        scope: 'registered_soar_totals',
        students: {
          totalRegisteredStudents: students.length,
          missingDepartmentCount,
          departments: [...groups.values()].sort((a, b) => a.department.localeCompare(b.department))
        },
        organizations: {
          totalOrganizations: organizationCount
        }
      };
    }
  };
}

export const adminStatisticsService = createAdminStatisticsService();
