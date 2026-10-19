import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { advanceOrganizationDeletion, type OrganizationDeletionStorage, type OrganizationStorageFamily } from './cascade';

type Data = Record<string, unknown>;

class FakeDocumentSnapshot {
  constructor(readonly ref: FakeDocumentReference, private readonly value: Data | undefined) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  data() { return this.value ? { ...this.value } : undefined; }
}

class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocumentSnapshot[]) {}
  get empty() { return this.docs.length === 0; }
  get size() { return this.docs.length; }
}

class FakeDocumentReference {
  constructor(readonly database: FakeFirestore, readonly path: string) {}
  get id() { return this.path.split('/').at(-1) ?? ''; }
  collection(name: string) { return new FakeCollectionReference(this.database, `${this.path}/${name}`); }
  async get() { return this.database.getDocument(this); }
  async delete() { this.database.documents.delete(this.path); }
  async listCollections() { return this.database.listCollections(this.path); }
}

class FakeCollectionReference {
  constructor(
    readonly database: FakeFirestore,
    readonly path: string,
    readonly filters: Array<[string, unknown]> = [],
    readonly maximum = Number.MAX_SAFE_INTEGER
  ) {}
  get id() { return this.path.split('/').at(-1) ?? ''; }
  doc(id?: string) { return new FakeDocumentReference(this.database, `${this.path}/${id ?? `generated-${++this.database.generated}`}`); }
  where(field: string, _operator: string, value: unknown) {
    return new FakeCollectionReference(this.database, this.path, [...this.filters, [field, value]], this.maximum);
  }
  orderBy() { return this; }
  limit(maximum: number) { return new FakeCollectionReference(this.database, this.path, this.filters, maximum); }
  async get() { return this.database.getCollection(this.path, this.filters, this.maximum); }
}

class FakeTransaction {
  constructor(private readonly database: FakeFirestore) {}
  async get(reference: FakeDocumentReference | FakeCollectionReference) {
    return reference instanceof FakeCollectionReference
      ? reference.get()
      : reference.get();
  }
  update(reference: FakeDocumentReference, patch: Data) {
    const current = this.database.documents.get(reference.path);
    if (!current) throw new Error(`Missing document ${reference.path}`);
    this.database.documents.set(reference.path, { ...current, ...patch });
  }
  delete(reference: FakeDocumentReference) { this.database.documents.delete(reference.path); }
  create(reference: FakeDocumentReference, data: Data) {
    if (this.database.documents.has(reference.path)) throw new Error(`Existing document ${reference.path}`);
    this.database.documents.set(reference.path, { ...data });
  }
}

class FakeFirestore {
  readonly documents = new Map<string, Data>();
  generated = 0;
  private transactionTail = Promise.resolve();

  doc(path: string) { return new FakeDocumentReference(this, path); }
  collection(path: string) { return new FakeCollectionReference(this, path); }

  getDocument(reference: FakeDocumentReference) {
    const value = this.documents.get(reference.path);
    return new FakeDocumentSnapshot(reference, value);
  }

  getCollection(path: string, filters: Array<[string, unknown]> = [], maximum = Number.MAX_SAFE_INTEGER) {
    const prefix = `${path}/`;
    const docs = [...this.documents.entries()]
      .filter(([documentPath]) => documentPath.startsWith(prefix) && !documentPath.slice(prefix.length).includes('/'))
      .filter(([, data]) => filters.every(([field, expected]) => data[field] === expected))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, maximum)
      .map(([documentPath, data]) => new FakeDocumentSnapshot(new FakeDocumentReference(this, documentPath), { ...data }));
    return new FakeQuerySnapshot(docs);
  }

  listCollections(documentPath: string) {
    const prefix = `${documentPath}/`;
    const names = new Set<string>();
    for (const path of this.documents.keys()) {
      if (!path.startsWith(prefix)) continue;
      const suffix = path.slice(prefix.length);
      const name = suffix.split('/')[0];
      if (name && suffix.includes('/')) names.add(name);
    }
    return [...names].sort().map((name) => new FakeCollectionReference(this, `${documentPath}/${name}`));
  }

  batch() {
    const refs: FakeDocumentReference[] = [];
    return {
      delete: (reference: FakeDocumentReference) => { refs.push(reference); },
      commit: async () => { for (const reference of refs) this.documents.delete(reference.path); }
    };
  }

  async runTransaction<T>(work: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await work(new FakeTransaction(this));
    } finally {
      release();
    }
  }
}

class FakeObjectStorage implements OrganizationDeletionStorage {
  readonly objects = new Set<string>();
  readonly deleted: string[] = [];
  failPath?: string;
  failuresRemaining = 0;

  async deleteStoredObject(storagePath: string) {
    if (storagePath === this.failPath && this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('private storage transient failure');
    }
    this.objects.delete(storagePath);
    this.deleted.push(storagePath);
  }

  async listOrganizationObjects(orgId: string, family: OrganizationStorageFamily, afterPath: string | undefined, limit: number) {
    const prefix = `${family}/${orgId}/`;
    const items = [...this.objects]
      .filter((path) => path.startsWith(prefix) && (!afterPath || path > afterPath))
      .sort()
      .slice(0, limit);
    return { items };
  }
}

const organizationId = 'cascade-org';
const nowAt = Timestamp.fromDate(new Date('2026-10-19T00:00:00.000Z'));
const logoPath = `organization-logos/${organizationId}/logo.png`;
const announcementPath = `announcement-images/${organizationId}/post-001/post.png`;
const meetingPath = `meeting-request-documents/${organizationId}/meeting_001/formal-request.pdf`;

function fixture() {
  const database = new FakeFirestore();
  const storage = new FakeObjectStorage();
  database.documents.set(`organizations/${organizationId}`, {
    orgId: organizationId,
    name: 'Synthetic Cascade Club',
    ownerUid: 'shared-student',
    logoPath,
    department: 'Computer Engineering Department',
    applicationsOpen: true
  });
  database.documents.set(`organizations/${organizationId}/officerGrants/shared-student`, { uid: 'shared-student', status: 'active' });
  database.documents.set(`organizations/${organizationId}/officerGrants/other-student`, { uid: 'other-student', status: 'revoked' });
  database.documents.set('organizations/unrelated-org', { orgId: 'unrelated-org', name: 'Unrelated Club', logoPath: 'organization-logos/unrelated-org/logo.png' });
  database.documents.set('organizations/unrelated-org/officerGrants/shared-student', { uid: 'shared-student', status: 'active' });
  database.documents.set('accounts/shared-student', { uid: 'shared-student', role: 'student', displayName: 'Student With Multiple Orgs' });
  database.documents.set('accounts/other-student', { uid: 'other-student', role: 'student', displayName: 'Another Student' });
  database.documents.set('announcements/post-001', {
    announcementId: 'post-001', orgId: organizationId, organizationName: 'Synthetic Cascade Club',
    organizationLogoPath: logoPath, authorUid: 'shared-student', body: 'Owned announcement', media: [
      { storagePath: announcementPath, contentType: 'image/png', sizeBytes: 10 }
    ], deletedAt: null
  });
  database.documents.set('announcements/post-001/likes/shared-student', { uid: 'shared-student', announcementId: 'post-001' });
  database.documents.set('announcements/post-001/comments/comment-001', { commentId: 'comment-001', announcementId: 'post-001', authorUid: 'shared-student', body: 'Owned discussion' });
  database.documents.set('announcements/unrelated-post', { announcementId: 'unrelated-post', orgId: 'unrelated-org', body: 'Keep me', media: [] });
  database.documents.set('calendarEntries/date-001', { entryId: 'date-001', orgId: organizationId, kind: 'availability', date: '2026-10-20' });
  database.documents.set('calendarEntries/unrelated-date', { entryId: 'unrelated-date', orgId: 'unrelated-org', kind: 'event', date: '2026-10-20' });
  database.documents.set('applications/application-001', { applicationId: 'application-001', orgId: organizationId, studentUid: 'shared-student', status: 'Pending' });
  database.documents.set('applications/unrelated-application', { applicationId: 'unrelated-application', orgId: 'unrelated-org', studentUid: 'shared-student', status: 'Pending' });
  database.documents.set('meetingRequests/meeting_001', {
    meetingRequestId: 'meeting_001', orgId: organizationId, requesterUid: 'shared-student', dateEntryId: 'date-001',
    document: { storagePath: meetingPath, fileName: 'formal-request.pdf', contentType: 'application/pdf', sizeBytes: 20 }
  });
  database.documents.set('meetingRequests/unrelated-meeting', { meetingRequestId: 'unrelated-meeting', orgId: 'unrelated-org', requesterUid: 'shared-student' });
  storage.objects.add(logoPath);
  storage.objects.add(announcementPath);
  storage.objects.add(meetingPath);
  storage.objects.add(`announcement-images/${organizationId}/orphan-001/upload.png`);
  storage.objects.add('organization-logos/unrelated-org/logo.png');
  return { database, storage };
}

async function runToCompletion(database: FakeFirestore, storage: FakeObjectStorage) {
  let now = nowAt;
  let result = await advanceOrganizationDeletion(organizationId, 'trusted-admin', {
    database: database as unknown as Firestore,
    storage,
    now: () => now
  });
  for (let attempt = 0; result.status !== 'complete' && attempt < 12; attempt += 1) {
    if (result.retryAfterAt) now = Timestamp.fromMillis(Date.parse(result.retryAfterAt) + 1);
    result = await advanceOrganizationDeletion(organizationId, 'trusted-admin', {
      database: database as unknown as Firestore,
      storage,
      now: () => now
    });
  }
  return result;
}

describe('confirmed organization cascade', () => {
  it('removes every actual organization-owned family and file while preserving accounts and unrelated organizations', async () => {
    const { database, storage } = fixture();
    const first = await advanceOrganizationDeletion(organizationId, 'trusted-admin', {
      database: database as unknown as Firestore,
      storage,
      now: () => nowAt
    });

    expect(first).toMatchObject({ orgId: organizationId, status: 'in_progress', phase: 'storedObjects' });
    expect(first.retryAfterAt).toBeDefined();
    expect(database.documents.has(`organizations/${organizationId}`)).toBe(true);
    expect(database.documents.has(`applications/application-001`)).toBe(false);
    expect(database.documents.has(`meetingRequests/meeting_001`)).toBe(false);
    expect(database.documents.has('announcements/post-001')).toBe(false);
    expect(database.documents.has('announcements/post-001/likes/shared-student')).toBe(false);
    expect(database.documents.has('announcements/post-001/comments/comment-001')).toBe(false);
    expect(database.documents.has('calendarEntries/date-001')).toBe(false);
    expect(database.documents.has(logoPath)).toBe(false);
    expect(database.documents.has('accounts/shared-student')).toBe(true);
    expect(database.documents.has('organizations/unrelated-org')).toBe(true);
    expect(database.documents.has('organizations/unrelated-org/officerGrants/shared-student')).toBe(true);
    expect(database.documents.has('applications/unrelated-application')).toBe(true);
    expect(database.documents.has('meetingRequests/unrelated-meeting')).toBe(true);

    await expect(runToCompletion(database, storage)).resolves.toMatchObject({ status: 'complete', orgId: organizationId });
    expect(database.documents.has(`organizations/${organizationId}`)).toBe(false);
    expect(database.documents.has('accounts/shared-student')).toBe(true);
    expect(database.documents.has('accounts/other-student')).toBe(true);
    expect(database.documents.has('organizations/unrelated-org/officerGrants/shared-student')).toBe(true);
    expect(database.documents.has('announcements/unrelated-post')).toBe(true);
    expect(database.documents.has('calendarEntries/unrelated-date')).toBe(true);
    expect(database.documents.has('applications/unrelated-application')).toBe(true);
    expect([...storage.objects]).toEqual(['organization-logos/unrelated-org/logo.png']);
  });

  it('keeps a durable deleting record on a mid-cleanup storage failure and resumes idempotently', async () => {
    const { database, storage } = fixture();
    storage.failPath = announcementPath;
    storage.failuresRemaining = 1;

    await expect(advanceOrganizationDeletion(organizationId, 'trusted-admin', {
      database: database as unknown as Firestore,
      storage,
      now: () => nowAt
    })).rejects.toMatchObject({ code: 'organization_deletion_incomplete', status: 503 });
    expect(database.documents.get(`organizations/${organizationId}`)?.deletionStatus).toBe('deleting');
    expect(database.documents.get('organizations/unrelated-org/officerGrants/shared-student')?.status).toBe('active');
    expect(database.documents.has('announcements/post-001')).toBe(true);

    const resumed = await advanceOrganizationDeletion(organizationId, 'trusted-admin', {
      database: database as unknown as Firestore,
      storage,
      now: () => nowAt
    });
    expect(resumed).toMatchObject({ status: 'in_progress', phase: 'storedObjects' });
    expect(database.documents.get(`organizations/${organizationId}`)?.deletionStatus).toBe('deleting');
    await expect(runToCompletion(database, storage)).resolves.toMatchObject({ status: 'complete' });
    expect(storage.objects.has(announcementPath)).toBe(false);
  });

  it('fails closed on an unknown nested dependency without deleting the parent or final progress record', async () => {
    const { database, storage } = fixture();
    database.documents.set('announcements/post-001/attachments/unmodeled-file', { owner: 'unknown' });

    await expect(advanceOrganizationDeletion(organizationId, 'trusted-admin', {
      database: database as unknown as Firestore,
      storage,
      now: () => nowAt
    })).rejects.toMatchObject({ code: 'organization_deletion_unknown_dependency', status: 409 });
    expect(database.documents.get(`organizations/${organizationId}`)?.deletionStatus).toBe('deleting');
    expect(database.documents.has(`organizations/${organizationId}`)).toBe(true);
    expect(database.documents.has('announcements/post-001')).toBe(true);
    expect(database.documents.has('announcements/post-001/attachments/unmodeled-file')).toBe(true);
  });

  it('bounds each request and safely handles concurrent delete attempts', async () => {
    const { database, storage } = fixture();
    for (let index = 0; index < 120; index += 1) {
      const id = `bulk-${String(index).padStart(3, '0')}`;
      database.documents.set(`applications/${id}`, { applicationId: id, orgId: organizationId, studentUid: 'shared-student' });
    }
    const run = () => advanceOrganizationDeletion(organizationId, 'trusted-admin', {
      database: database as unknown as Firestore,
      storage,
      now: () => nowAt
    });
    const [first, concurrent] = await Promise.all([run(), run()]);
    expect([first.status, concurrent.status]).toEqual(['in_progress', 'in_progress']);
    const remainingAfterConcurrentRequests = [...database.documents.keys()].filter((path) => path.startsWith('applications/bulk-')).length;
    expect(remainingAfterConcurrentRequests).toBeGreaterThanOrEqual(20);
    expect(remainingAfterConcurrentRequests).toBeLessThanOrEqual(25);
    expect(database.documents.has(`organizations/${organizationId}`)).toBe(true);

    await expect(runToCompletion(database, storage)).resolves.toMatchObject({ status: 'complete' });
    expect([...database.documents.keys()].some((path) => path.startsWith('applications/bulk-'))).toBe(false);
    expect(database.documents.has('accounts/shared-student')).toBe(true);
  });
});
