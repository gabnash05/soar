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
  async create(data: StoredDoc) { this.db.create(this.path, data); }
  async update(patch: StoredDoc) { this.db.update(this.path, patch); }
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
  fakeDb.docs.set('accounts/student1', { uid: 'student1', role: 'student', displayName: 'Student One', emailVerified: true, department: 'Computer Engineering Department', departmentKey: 'computer engineering department' });
  fakeDb.docs.set('accounts/student2', { uid: 'student2', role: 'student', displayName: 'Student Two', department: 'Computer Engineering Department', departmentKey: 'computer engineering department' });
  fakeDb.docs.set('accounts/student3', { uid: 'student3', role: 'student', displayName: 'Student Three', department: 'Civil Engineering Department', departmentKey: 'civil engineering department' });
  fakeDb.docs.set('accounts/student4', { uid: 'student4', role: 'student', displayName: 'Legacy Student' });
  fakeDb.docs.set('accounts/sponsor1', { uid: 'sponsor1', role: 'sponsor', displayName: 'Sponsor', companyName: 'Sponsor Co' });
  fakeDb.docs.set('accounts/author', { uid: 'author', role: 'student', displayName: 'Author User', emailVerified: true, email: 'author@example.test' });
  fakeDb.docs.set('accounts/other', { uid: 'other', role: 'sponsor', displayName: 'Other User', emailVerified: true, email: 'other@example.test', companyName: 'Private Co' });
  fakeDb.docs.set('accounts/unverified-student', { uid: 'unverified-student', role: 'student', displayName: 'Unverified Student', emailVerified: false });
  fakeDb.docs.set('accounts/admin-author', { uid: 'admin-author', role: 'admin', displayName: 'Admin Author', emailVerified: true });
  fakeDb.docs.set('organizations/org1/officerGrants/author', { uid: 'author', status: 'active' });
  fakeDb.docs.set('organizations/org1/officerGrants/unverified-student', { uid: 'unverified-student', status: 'active' });
  fakeDb.docs.set('announcements/post1', {
    announcementId: 'post1',
    orgId: 'org1',
    body: 'Announcement',
    deletedAt: null,
    commentCount: 4,
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
  fakeDb.docs.set('announcements/post1/comments/comment4', {
    commentId: 'comment4',
    announcementId: 'post1',
    authorUid: 'unverified-student',
    authorName: 'Unverified Student',
    body: 'Unverified account',
    createdAt: now,
    updatedAt: now
  });
  fakeDb.docs.set('announcements/post1/comments/comment5', {
    commentId: 'comment5',
    announcementId: 'post1',
    authorUid: 'admin-author',
    authorName: 'Admin Author',
    body: 'Other account kind',
    createdAt: now,
    updatedAt: now
  });
}

describe('announcement comment ownership service behavior', () => {
  beforeEach(() => {
    seedComments();
  });

  it('lets an approved organization officer update only the post body', async () => {
    const { updateAnnouncement } = await import('../service');
    const createdAt = fakeDb.docs.get('announcements/post1')?.createdAt;
    Object.assign(fakeDb.docs.get('announcements/post1')!, {
      authorUid: 'author',
      image: { storagePath: 'announcement-images/org1/post1/photo.png', contentType: 'image/png', sizeBytes: 12 },
      likeCount: 7,
      commentCount: 2
    });

    await expect(updateAnnouncement(user('officer'), 'org1', 'post1', { body: 'Edited by officer' })).resolves.toMatchObject({
      id: 'post1', body: 'Edited by officer', likeCount: 7, commentCount: 2,
      image: { storagePath: 'announcement-images/org1/post1/photo.png' }
    });
    expect(fakeDb.docs.get('announcements/post1')).toMatchObject({ authorUid: 'author', likeCount: 7, commentCount: 2, createdAt });
  });

  it('rejects revoked officers, wrong organization, and immutable update fields', async () => {
    const { updateAnnouncement } = await import('../service');
    fakeDb.docs.set('announcements/post2', { announcementId: 'post2', orgId: 'org2', body: 'Other organization', deletedAt: null });
    fakeDb.docs.set('organizations/org2', { orgId: 'org2', name: 'Other Org', ownerUid: 'someone-else' });

    await expect(updateAnnouncement(user('officer'), 'org1', 'post2', { body: 'Cross-org edit' })).rejects.toMatchObject({ code: 'announcement_organization_mismatch' });
    await expect(updateAnnouncement(user('student1'), 'org1', 'post1', { body: 'Unapproved edit' })).rejects.toMatchObject({ code: 'organization_management_required' });
    await expect(updateAnnouncement(user('officer'), 'org1', 'post1', { body: 'Changed', authorUid: 'officer' })).rejects.toMatchObject({ name: 'ZodError' });
    fakeDb.docs.set('organizations/org1/officerGrants/officer', { uid: 'officer', status: 'revoked' });
    await expect(updateAnnouncement(user('officer'), 'org1', 'post1', { body: 'Revoked edit' })).rejects.toMatchObject({ code: 'organization_management_required' });
  });

  it('lets authors edit their own comments without changing the count', async () => {
    const { updateAnnouncementComment } = await import('../service');
    const updated = await updateAnnouncementComment(user('author'), 'post1', 'comment1', { body: 'Updated body' });

    expect(updated).toMatchObject({ id: 'comment1', body: 'Updated body', viewerCanEdit: true, viewerCanDelete: true });
    expect(updated.updatedAt).toBeDefined();
    expect(fakeDb.docs.get('announcements/post1/comments/comment1')?.editedAt).toBeDefined();
    expect(fakeDb.docs.get('announcements/post1')?.commentCount).toBe(4);
  });

  it('blocks second-author edits and deletes', async () => {
    const { deleteAnnouncementComment, updateAnnouncementComment } = await import('../service');

    await expect(updateAnnouncementComment(user('other'), 'post1', 'comment1', { body: 'Nope' })).rejects.toMatchObject({ code: 'comment_owner_required' });
    await expect(deleteAnnouncementComment(user('other'), 'post1', 'comment1')).rejects.toMatchObject({ code: 'comment_owner_required' });
    expect(fakeDb.docs.get('announcements/post1')?.commentCount).toBe(4);
  });

  it('returns trusted author roles from saved accounts and only the comment organization grant', async () => {
    const { listAnnouncementComments } = await import('../service');
    fakeDb.docs.set('announcements/post2', { announcementId: 'post2', orgId: 'org2', body: 'Other organization', deletedAt: null, commentCount: 1 });
    fakeDb.docs.set('announcements/post2/comments/comment3', {
      commentId: 'comment3',
      announcementId: 'post2',
      authorUid: 'author',
      authorName: 'Author User',
      body: 'Different organization',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    const comments = await listAnnouncementComments(user('viewer'), 'post1', {});
    expect(comments.items[0]).toMatchObject({ authorAccountKind: 'student', authorOrganizationRole: 'approved_officer' });
    expect(comments.items[0]).not.toHaveProperty('email');
    expect(comments.items[1]).not.toHaveProperty('authorAccountKind');
    expect(comments.items[1]).not.toHaveProperty('authorOrganizationRole');
    expect(comments.items[1]).not.toHaveProperty('companyName');
    const unverifiedStudent = comments.items.find((item) => item.id === 'comment4');
    expect(unverifiedStudent).not.toHaveProperty('authorAccountKind');
    expect(unverifiedStudent).not.toHaveProperty('authorOrganizationRole');
    const otherAccountKind = comments.items.find((item) => item.id === 'comment5');
    expect(otherAccountKind).not.toHaveProperty('authorAccountKind');
    expect(otherAccountKind).not.toHaveProperty('authorOrganizationRole');

    const otherOrganizationComments = await listAnnouncementComments(user('viewer'), 'post2', {});
    expect(otherOrganizationComments.items[0]).toMatchObject({ authorAccountKind: 'student' });
    expect(otherOrganizationComments.items[0]).not.toHaveProperty('authorOrganizationRole');

    fakeDb.docs.set('organizations/org1/officerGrants/author', { uid: 'author', status: 'revoked' });
    const revokedGrantComments = await listAnnouncementComments(user('viewer'), 'post1', {});
    expect(revokedGrantComments.items[0]).not.toHaveProperty('authorOrganizationRole');
  });

  it('returns trusted account kind on comment creation without exposing private account fields', async () => {
    const { addAnnouncementComment } = await import('../service');
    const created = await addAnnouncementComment(user('student1'), 'post1', { body: 'A saved-account comment.' });

    expect(created).toMatchObject({ authorAccountKind: 'student', viewerCanEdit: true, viewerCanDelete: true });
    expect(created).not.toHaveProperty('updatedAt');
    expect(created).not.toHaveProperty('email');
    expect(created).not.toHaveProperty('department');

    const listed = await (await import('../service')).listAnnouncementComments(user('student1'), 'post1', {});
    expect(listed.items.find((comment) => comment.id === created.id)).not.toHaveProperty('updatedAt');
  });

  it('keeps Edited absent for unchanged or missing legacy timestamps but preserves real legacy edits', async () => {
    const { listAnnouncementComments } = await import('../service');
    const createdAt = Timestamp.fromDate(new Date('2026-10-10T00:00:00.000Z'));
    const updatedAt = Timestamp.fromDate(new Date('2026-10-11T00:00:00.000Z'));
    fakeDb.docs.set('announcements/post1/comments/unchanged', {
      commentId: 'unchanged', announcementId: 'post1', authorUid: 'other', authorName: 'Other User', body: 'New comment', createdAt, updatedAt: createdAt
    });
    fakeDb.docs.set('announcements/post1/comments/missing-timestamps', {
      commentId: 'missing-timestamps', announcementId: 'post1', authorUid: 'other', authorName: 'Other User', body: 'Legacy comment'
    });
    fakeDb.docs.set('announcements/post1/comments/legacy-edited', {
      commentId: 'legacy-edited', announcementId: 'post1', authorUid: 'other', authorName: 'Other User', body: 'Edited legacy comment', createdAt, updatedAt
    });

    const listed = await listAnnouncementComments(user('student1'), 'post1', {});
    expect(listed.items.find((comment) => comment.id === 'unchanged')).not.toHaveProperty('updatedAt');
    expect(listed.items.find((comment) => comment.id === 'missing-timestamps')).not.toHaveProperty('updatedAt');
    expect(listed.items.find((comment) => comment.id === 'legacy-edited')?.updatedAt).toBe(updatedAt.toDate().toISOString());
  });

  it('keeps raw pagination values when scoping date-entry queries for the service parser', async () => {
    const { scopedDateEntryQuery } = await import('../service');
    const { dateEntryQuerySchema } = await import('../validation');
    const query = scopedDateEntryQuery('org1', { limit: '20', pageToken: '0' });

    expect(dateEntryQuerySchema.parse(query)).toMatchObject({ organizationId: 'org1', limit: 20, pageToken: 0 });
  });

  it('returns confirmed creates without a post-write read and safely replays the same entry key', async () => {
    const { createDateEntry } = await import('../service');
    const reads = vi.spyOn(fakeDb, 'getDoc');
    const plainEntry = await createDateEntry(user('officer'), 'org1', {
      kind: 'event', title: 'Synthetic event', date: '2026-12-20', details: 'Task-owned service test.'
    });
    expect(plainEntry).toMatchObject({ id: expect.any(String), kind: 'event', date: '2026-12-20' });
    expect(reads.mock.calls.some(([ref]) => ref.path === `calendarEntries/${plainEntry.id}`)).toBe(false);

    const input = {
      entryId: 'save-key-123', kind: 'availability' as const, title: 'Synthetic window',
      date: '2026-12-21', startTime: '14:00', endTime: '16:00', details: 'Task-owned idempotency test.'
    };
    const first = await createDateEntry(user('officer'), 'org1', input);
    const afterFirst = fakeDb.docs.get('calendarEntries/save-key-123');
    const replay = await createDateEntry(user('officer'), 'org1', input);
    expect(first).toMatchObject({ id: 'save-key-123', kind: 'availability', date: input.date, startTime: input.startTime, endTime: input.endTime });
    expect(replay).toEqual(first);
    expect(fakeDb.docs.get('calendarEntries/save-key-123')).toEqual(afterFirst);
    await expect(createDateEntry(user('officer'), 'org1', { ...input, title: 'Different payload' })).rejects.toMatchObject({ code: 'date_entry_conflict', status: 409 });
    await expect(createDateEntry(user('owner'), 'org1', input)).rejects.toMatchObject({ code: 'date_entry_conflict', status: 409 });
    await expect(createDateEntry(user('student1'), 'org1', { ...input, entryId: 'unprivileged-key-1' })).rejects.toMatchObject({ code: 'organization_management_required' });
    expect(fakeDb.docs.has('calendarEntries/unprivileged-key-1')).toBe(false);
    expect(fakeDb.docs.get('calendarEntries/save-key-123')).toEqual(afterFirst);
    reads.mockRestore();
  });

  it('defaults missing application intake to open and lets an approved scoped officer toggle it', async () => {
    const { getOrganizationProfile, updateOrganizationProfile } = await import('../service');

    await expect(getOrganizationProfile(user('student1'), 'org1')).resolves.toMatchObject({ applicationsOpen: true });
    const updated = await updateOrganizationProfile(user('officer'), 'org1', { applicationsOpen: false });

    expect(updated.applicationsOpen).toBe(false);
    expect(fakeDb.docs.get('organizations/org1')?.applicationsOpen).toBe(false);
  });

  it('denies application-intake changes by ungranted, cross-organization, and revoked officers', async () => {
    const { updateOrganizationProfile } = await import('../service');
    const now = Timestamp.fromDate(new Date('2026-10-11T00:00:00.000Z'));
    fakeDb.docs.set('organizations/org2', {
      orgId: 'org2', name: 'Other Organization', ownerUid: 'owner', createdAt: now, updatedAt: now
    });
    fakeDb.docs.set('organizations/org1/officerGrants/revoked', { uid: 'revoked', status: 'revoked' });

    await expect(updateOrganizationProfile(user('student1'), 'org1', { applicationsOpen: false })).rejects.toMatchObject({ code: 'organization_management_required' });
    await expect(updateOrganizationProfile(user('sponsor1'), 'org1', { applicationsOpen: false })).rejects.toMatchObject({ code: 'organization_management_required' });
    await expect(updateOrganizationProfile(user('officer'), 'org2', { applicationsOpen: false })).rejects.toMatchObject({ code: 'organization_management_required' });
    await expect(updateOrganizationProfile(user('revoked'), 'org1', { applicationsOpen: false })).rejects.toMatchObject({ code: 'organization_management_required' });
    expect(fakeDb.docs.get('organizations/org1')?.applicationsOpen).toBeUndefined();
    expect(fakeDb.docs.get('organizations/org2')?.applicationsOpen).toBeUndefined();
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
    expect(fakeDb.docs.get('announcements/post1')?.commentCount).toBe(3);
    await expect(deleteAnnouncementComment(user('author'), 'post1', 'comment1')).rejects.toMatchObject({ code: 'comment_missing' });
  });
});
