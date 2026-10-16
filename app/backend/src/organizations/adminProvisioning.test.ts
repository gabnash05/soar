import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  adminUids: new Set<string>(),
  adminAuth: { getUser: vi.fn() },
  db: {
    doc: vi.fn(),
    collection: vi.fn(),
    runTransaction: vi.fn()
  }
}));

vi.mock('../firebase', () => ({ adminAuth: state.adminAuth, db: state.db }));

import {
  assignAdminOfficerGrant,
  assignInitialOrganizationOwner,
  listAdminOrganizations,
  searchAdminStudents
} from './service';

function documentSnapshot(path: string) {
  const data = state.docs.get(path);
  return {
    id: path.split('/').at(-1) ?? '',
    exists: data !== undefined,
    data: () => data
  };
}

function reference(path: string) {
  return {
    path,
    get: async () => documentSnapshot(path)
  };
}

function collectionQuery(collectionName: string) {
  let offset = 0;
  let cursor = '';
  let maxItems = Number.MAX_SAFE_INTEGER;
  const filters: Array<[string, string, unknown]> = [];
  const query: any = {
    where(field: string, operator: string, value: unknown) {
      filters.push([field, operator, value]);
      return query;
    },
    orderBy() {
      return query;
    },
    offset(value: number) {
      offset = value;
      return query;
    },
    startAfter(value: string) {
      cursor = value;
      return query;
    },
    limit(value: number) {
      maxItems = value;
      return query;
    },
    async get() {
      const prefix = `${collectionName}/`;
      let docs = [...state.docs.entries()]
        .filter(([path]) => path.startsWith(prefix) && path.slice(prefix.length).indexOf('/') === -1)
        .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
      for (const [field, operator, value] of filters) {
        if (operator === '==') docs = docs.filter((doc) => (doc.data() as Record<string, unknown>)[field] === value);
      }
      const orderField = collectionName === 'organizations' ? 'name' : undefined;
      docs.sort((left, right) => orderField
        ? String((left.data() as Record<string, unknown>)[orderField] ?? '').localeCompare(String((right.data() as Record<string, unknown>)[orderField] ?? ''))
        : left.id.localeCompare(right.id));
      if (cursor) docs = docs.filter((doc) => doc.id.localeCompare(cursor) > 0);
      return { docs: docs.slice(offset, offset + maxItems) };
    }
  };
  return query;
}

function configureFakeFirestore() {
  state.adminAuth.getUser.mockImplementation(async (uid: string) => ({
    customClaims: state.adminUids.has(uid) ? { soarAdmin: true } : {}
  }));
  state.db.doc.mockImplementation((path: string) => reference(path));
  state.db.collection.mockImplementation((collectionName: string) => collectionQuery(collectionName));
  state.db.runTransaction.mockImplementation(async (work: (transaction: any) => Promise<unknown>) => work({
    get: async (ref: { path: string }) => documentSnapshot(ref.path),
    create: (ref: { path: string }, data: Record<string, unknown>) => {
      if (state.docs.has(ref.path)) throw new Error(`Document already exists: ${ref.path}`);
      state.docs.set(ref.path, data as Record<string, any>);
    },
    set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      state.docs.set(ref.path, options?.merge
        ? { ...(state.docs.get(ref.path) ?? {}), ...data } as Record<string, any>
        : data as Record<string, any>);
    }
  }));
}

describe('admin organization provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.docs.clear();
    state.adminUids.clear();
    configureFakeFirestore();
  });

  it('creates an organization and its initial scoped officer grant using the supported schema', async () => {
    state.docs.set('accounts/sponsor-owner', { role: 'sponsor', displayName: 'Sam Sponsor' });
    await expect(assignInitialOrganizationOwner({
      orgId: 'robotics-club',
      slug: 'robotics-club',
      name: 'Robotics Club',
      ownerUid: 'sponsor-owner'
    }, 'trusted-admin')).rejects.toMatchObject({ code: 'target_not_student' });
    expect(state.docs.has('organizations/robotics-club')).toBe(false);

    state.docs.set('accounts/student-owner', { role: 'student', displayName: 'Mara Santos' });
    await expect(assignInitialOrganizationOwner({
      orgId: 'robotics-club',
      slug: 'robotics-club',
      name: 'Robotics Club',
      ownerUid: 'student-owner',
      department: 'Computer Engineering Department',
      shortDescription: 'Student robotics projects.'
    }, 'trusted-admin')).resolves.toEqual({ orgId: 'robotics-club' });

    expect(state.docs.get('organizations/robotics-club')).toMatchObject({
      ownerUid: 'student-owner',
      createdByUid: 'trusted-admin',
      department: 'Computer Engineering Department',
      departmentKey: 'computer engineering department'
    });
    expect(state.docs.get('organizations/robotics-club/officerGrants/student-owner')).toMatchObject({
      uid: 'student-owner',
      status: 'active',
      grantedByUid: 'trusted-admin'
    });
  });

  it('searches saved student names or canonical student IDs in bounded pages and preserves missing IDs', async () => {
    state.docs.set('accounts/student-01', { role: 'student', displayName: 'Mara Santos', studentId: '2026-0001' });
    state.docs.set('accounts/student-02', { role: 'student', displayName: 'Mara Legacy' });
    state.docs.set('accounts/sponsor-01', { role: 'sponsor', displayName: 'Mara Sponsor', studentId: '2026-0002' });
    state.docs.set('accounts/student-03', { role: 'student', displayName: 'Luis Reyes', studentId: 'STU-9031' });
    state.docs.set('accounts/student-admin', { role: 'student', displayName: 'Mara Admin', studentId: '2026-0003' });
    state.adminUids.add('student-admin');

    await expect(searchAdminStudents({ q: 'MARA' })).resolves.toEqual({
      items: [
        { uid: 'student-01', displayName: 'Mara Santos', studentId: '2026-0001' },
        { uid: 'student-02', displayName: 'Mara Legacy' }
      ]
    });
    await expect(searchAdminStudents({ q: '2026-0002' })).resolves.toEqual({ items: [] });
    await expect(searchAdminStudents({ q: 'Mara Admin' })).resolves.toEqual({ items: [] });
    await expect(searchAdminStudents({ q: 'stu-90' })).resolves.toEqual({
      items: [{ uid: 'student-03', displayName: 'Luis Reyes', studentId: 'STU-9031' }]
    });
  });

  it('continues scanning students with a cursor when a bounded page has no matching name', async () => {
    for (let index = 0; index < 100; index += 1) {
      state.docs.set(`accounts/student-${String(index).padStart(3, '0')}`, { role: 'student', displayName: `Student ${index}` });
    }
    state.docs.set('accounts/zz-last-student', { role: 'student', displayName: 'Mara Santos' });

    const firstPage = await searchAdminStudents({ q: 'Mara' });
    expect(firstPage.items).toEqual([]);
    expect(firstPage.nextPageToken).toBe('student-099');
    await expect(searchAdminStudents({ q: 'Mara', pageToken: firstPage.nextPageToken })).resolves.toEqual({
      items: [{ uid: 'zz-last-student', displayName: 'Mara Santos' }]
    });
  });

  it('does not rewrite an existing active grant when an admin repeats an assignment', async () => {
    state.docs.set('organizations/robotics', { orgId: 'robotics', name: 'Robotics Club' });
    state.docs.set('accounts/student-01', { role: 'student', displayName: 'Mara Santos' });
    state.docs.set('organizations/robotics/officerGrants/student-01', {
      uid: 'student-01', status: 'active', grantedByUid: 'first-admin', createdAt: 'original-time'
    });

    await expect(assignAdminOfficerGrant('robotics', { uid: 'student-01' }, 'second-admin')).resolves.toMatchObject({
      orgId: 'robotics', uid: 'student-01', status: 'approved', alreadyAssigned: true
    });
    expect(state.docs.get('organizations/robotics/officerGrants/student-01')).toEqual({
      uid: 'student-01', status: 'active', grantedByUid: 'first-admin', createdAt: 'original-time'
    });
  });

  it('reactivates a revoked grant while retaining revocation audit and unrelated scoped metadata', async () => {
    state.docs.set('organizations/robotics', { orgId: 'robotics', name: 'Robotics Club' });
    state.docs.set('accounts/student-01', { role: 'student', displayName: 'Mara Santos' });
    const revokedAt = { seconds: 1_800_000_000, nanoseconds: 0 };
    const existingGrant = {
      uid: 'student-01', status: 'revoked', grantedByUid: 'first-admin', createdAt: 'original-created-at',
      revokedByUid: 'revoking-admin', revokedAt, legacyMetadata: 'preserve me'
    };
    const otherOrganizationGrant = {
      uid: 'student-01', status: 'revoked', revokedByUid: 'other-admin', revokedAt: 'other-org-revocation'
    };
    state.docs.set('organizations/robotics/officerGrants/student-01', existingGrant);
    state.docs.set('organizations/civil/officerGrants/student-01', otherOrganizationGrant);

    await expect(assignAdminOfficerGrant('robotics', { uid: 'student-01' }, 'second-admin')).resolves.toEqual({
      orgId: 'robotics', uid: 'student-01', status: 'approved', alreadyAssigned: false
    });

    expect(state.docs.get('organizations/robotics/officerGrants/student-01')).toMatchObject({
      uid: 'student-01', status: 'active', grantedByUid: 'second-admin', createdAt: 'original-created-at',
      revokedByUid: 'revoking-admin', revokedAt, legacyMetadata: 'preserve me', updatedAt: expect.anything()
    });
    expect(state.docs.get('organizations/civil/officerGrants/student-01')).toEqual(otherOrganizationGrant);
  });

  it('assigns only existing student accounts to an existing organization', async () => {
    state.docs.set('organizations/robotics', { orgId: 'robotics', name: 'Robotics Club' });
    state.docs.set('accounts/sponsor-01', { role: 'sponsor', displayName: 'Sam Sponsor' });
    state.docs.set('accounts/admin-student', { role: 'student', displayName: 'Admin User' });
    state.adminUids.add('admin-student');

    await expect(assignAdminOfficerGrant('robotics', { uid: 'sponsor-01' }, 'trusted-admin')).rejects.toMatchObject({
      code: 'target_not_student', status: 409
    });
    expect(state.docs.has('organizations/robotics/officerGrants/sponsor-01')).toBe(false);
    await expect(assignAdminOfficerGrant('robotics', { uid: 'admin-student' }, 'trusted-admin')).rejects.toMatchObject({ code: 'target_not_student' });
    expect(state.docs.has('organizations/robotics/officerGrants/admin-student')).toBe(false);

    state.docs.set('accounts/student-01', { role: 'student', displayName: 'Mara Santos' });
    await expect(assignAdminOfficerGrant('robotics', { uid: 'student-01' }, 'trusted-admin')).resolves.toMatchObject({
      orgId: 'robotics', uid: 'student-01', status: 'approved', alreadyAssigned: false
    });
    expect(state.docs.get('organizations/robotics/officerGrants/student-01')).toMatchObject({
      uid: 'student-01', status: 'active', grantedByUid: 'trusted-admin'
    });

    await expect(assignAdminOfficerGrant('missing-org', { uid: 'student-01' }, 'trusted-admin')).rejects.toBeInstanceOf(AppError);
  });

  it('lists only the organization picker fields with bounded pagination', async () => {
    state.docs.set('organizations/a-club', { orgId: 'a-club', name: 'A Club', ownerUid: 'secret-owner' });
    state.docs.set('organizations/b-club', { orgId: 'b-club', name: 'B Club', ownerUid: 'secret-owner' });

    await expect(listAdminOrganizations({ limit: 1 })).resolves.toEqual({
      items: [{ id: 'a-club', name: 'A Club' }],
      nextPageToken: '1'
    });
  });
});
