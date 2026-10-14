import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';

type StoredDoc = Record<string, unknown>;

class FakeDocSnapshot {
  constructor(readonly ref: FakeDocRef, private readonly value: StoredDoc | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocSnapshot[]) {}
  get size() { return this.docs.length; }
}

class FakeCollectionRef {
  constructor(readonly db: FakeDb, readonly path: string, readonly filters: Array<[string, unknown]> = []) {}
  doc(id?: string) {
    const docId = id ?? `generated-${this.db.generated += 1}`;
    return new FakeDocRef(this.db, `${this.path}/${docId}`);
  }
  where(field: string, operator: string, value: unknown) {
    if (operator !== '==') throw new Error(`unsupported fake operator: ${operator}`);
    return new FakeCollectionRef(this.db, this.path, [...this.filters, [field, value]]);
  }
  orderBy() { return this; }
  offset() { return this; }
  limit() { return this; }
  async get() { return this.db.getCollection(this.path, this.filters); }
}

class FakeDocRef {
  constructor(readonly db: FakeDb, readonly path: string) {}
  get id() { return this.path.split('/').at(-1) ?? ''; }
  collection(name: string) { return new FakeCollectionRef(this.db, `${this.path}/${name}`); }
  async get() { return this.db.getDoc(this); }
}

class FakeTransaction {
  constructor(private readonly db: FakeDb) {}
  async get(ref: FakeDocRef | FakeCollectionRef) {
    return ref instanceof FakeCollectionRef ? this.db.getCollection(ref.path) : this.db.getDoc(ref);
  }
  create(ref: FakeDocRef, data: StoredDoc) { this.db.create(ref.path, data); }
  update(ref: FakeDocRef, patch: StoredDoc) { this.db.update(ref.path, patch); }
  delete(ref: FakeDocRef) { this.db.delete(ref.path); }
}

class FakeDb {
  readonly docs = new Map<string, StoredDoc>();
  generated = 0;

  collection(path: string) { return new FakeCollectionRef(this, path); }
  doc(path: string) { return new FakeDocRef(this, path); }

  async runTransaction<T>(callback: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return callback(new FakeTransaction(this));
  }

  getDoc(ref: FakeDocRef) {
    const value = this.docs.get(ref.path);
    return new FakeDocSnapshot(ref, value ? { ...value } : undefined);
  }

  getCollection(path: string, filters: Array<[string, unknown]> = []) {
    const prefix = `${path}/`;
    const docs = [...this.docs.entries()]
      .filter(([docPath]) => docPath.startsWith(prefix) && !docPath.slice(prefix.length).includes('/'))
      .filter(([, value]) => filters.every(([field, expected]) => value[field] === expected))
      .map(([docPath, value]) => new FakeDocSnapshot(new FakeDocRef(this, docPath), { ...value }));
    return new FakeQuerySnapshot(docs);
  }

  create(path: string, data: StoredDoc) {
    if (this.docs.has(path)) throw new Error(`already exists: ${path}`);
    this.docs.set(path, { ...data });
  }

  update(path: string, patch: StoredDoc) {
    const current = this.docs.get(path);
    if (!current) throw new Error(`missing: ${path}`);
    this.docs.set(path, { ...current, ...patch });
  }

  delete(path: string) {
    this.docs.delete(path);
  }
}

const fakeDb = new FakeDb();

vi.doMock('../../firebase', () => ({ db: fakeDb }));
vi.doMock('../../identity/access', () => ({
  requireActiveAccess: vi.fn(async () => undefined),
  loadAccount: vi.fn(async (uid: string) => ({ uid, role: 'student', displayName: uid === 'author' ? 'Author User' : 'Other User' }))
}));

function user(uid: string): DecodedIdToken {
  return { uid, email_verified: true } as DecodedIdToken;
}

function seedComments() {
  fakeDb.docs.clear();
  fakeDb.generated = 0;
  const now = Timestamp.fromDate(new Date('2026-10-11T00:00:00.000Z'));
  fakeDb.docs.set('organizations/org1', {
    orgId: 'org1',
    name: 'Computer Engineering Department',
    ownerUid: 'owner',
    department: 'Computer Engineering Department',
    departmentKey: 'computer engineering department',
    createdAt: now,
    updatedAt: now
  });
  fakeDb.docs.set('organizations/org1/officerGrants/officer', {
    uid: 'officer',
    status: 'active',
    createdAt: now,
    updatedAt: now
  });
  fakeDb.docs.set('accounts/student1', { uid: 'student1', role: 'student', displayName: 'Student One', department: 'Computer Engineering Department', departmentKey: 'computer engineering department' });
  fakeDb.docs.set('accounts/student2', { uid: 'student2', role: 'student', displayName: 'Student Two', department: 'Computer Engineering Department', departmentKey: 'computer engineering department' });
  fakeDb.docs.set('accounts/student3', { uid: 'student3', role: 'student', displayName: 'Student Three', department: 'Civil Engineering Department', departmentKey: 'civil engineering department' });
  fakeDb.docs.set('accounts/student4', { uid: 'student4', role: 'student', displayName: 'Legacy Student' });
  fakeDb.docs.set('accounts/sponsor1', { uid: 'sponsor1', role: 'sponsor', displayName: 'Sponsor', companyName: 'Sponsor Co' });
  fakeDb.docs.set('announcements/post1', {
    announcementId: 'post1',
    orgId: 'org1',
    body: 'Announcement',
    deletedAt: null,
    commentCount: 2,
    createdAt: now,
    updatedAt: now
  });
  fakeDb.docs.set('announcements/post1/comments/comment1', {
    commentId: 'comment1',
    announcementId: 'post1',
    authorUid: 'author',
    authorName: 'Author User',
    body: 'Original',
    createdAt: now,
    updatedAt: now
  });
  fakeDb.docs.set('announcements/post1/comments/comment2', {
    commentId: 'comment2',
    announcementId: 'post1',
    authorUid: 'other',
    authorName: 'Other User',
    body: 'Second',
    createdAt: now,
    updatedAt: now
  });
}

describe('announcement comment ownership service behavior', () => {
  beforeEach(() => {
    seedComments();
  });

  it('lets authors edit their own comments without changing the count', async () => {
    const { updateAnnouncementComment } = await import('../service');
    const updated = await updateAnnouncementComment(user('author'), 'post1', 'comment1', { body: 'Updated body' });

    expect(updated).toMatchObject({ id: 'comment1', body: 'Updated body', viewerCanEdit: true, viewerCanDelete: true });
    expect(fakeDb.docs.get('announcements/post1')?.commentCount).toBe(2);
  });

  it('blocks second-author edits and deletes', async () => {
    const { deleteAnnouncementComment, updateAnnouncementComment } = await import('../service');

    await expect(updateAnnouncementComment(user('other'), 'post1', 'comment1', { body: 'Nope' })).rejects.toMatchObject({ code: 'comment_owner_required' });
    await expect(deleteAnnouncementComment(user('other'), 'post1', 'comment1')).rejects.toMatchObject({ code: 'comment_owner_required' });
    expect(fakeDb.docs.get('announcements/post1')?.commentCount).toBe(2);
  });

  it('returns only the authorized organization department registered-student count', async () => {
    const { getStudentDepartmentCounts } = await import('../service');

    await expect(getStudentDepartmentCounts(user('officer'), 'org1')).resolves.toMatchObject({
      organizationId: 'org1',
      department: 'Computer Engineering Department',
      departmentKey: 'computer engineering department',
      registeredStudentCount: 2,
      scope: 'registered_students_in_organization_department'
    });
    await expect(getStudentDepartmentCounts(user('student1'), 'org1')).rejects.toMatchObject({ code: 'organization_management_required' });
    fakeDb.docs.set('organizations/org2', { orgId: 'org2', name: 'Legacy Org', ownerUid: 'officer', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    await expect(getStudentDepartmentCounts(user('officer'), 'org2')).rejects.toMatchObject({ code: 'organization_department_missing' });
    fakeDb.docs.set('organizations/org3', { orgId: 'org3', name: 'Civil Engineering Department', ownerUid: 'owner', department: 'Civil Engineering Department', departmentKey: 'civil engineering department', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    fakeDb.docs.set('organizations/org3/officerGrants/officer', { uid: 'officer', status: 'revoked', createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    await expect(getStudentDepartmentCounts(user('officer'), 'org3')).rejects.toMatchObject({ code: 'organization_management_required' });
  });

  it('deletes own comments once and keeps the stored count aligned with actual comments', async () => {
    const { deleteAnnouncementComment } = await import('../service');

    await expect(deleteAnnouncementComment(user('author'), 'post1', 'comment1')).resolves.toMatchObject({ deleted: true });
    expect(fakeDb.docs.has('announcements/post1/comments/comment1')).toBe(false);
    expect(fakeDb.docs.get('announcements/post1')?.commentCount).toBe(1);
    await expect(deleteAnnouncementComment(user('author'), 'post1', 'comment1')).rejects.toMatchObject({ code: 'comment_missing' });
  });
});
