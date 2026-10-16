import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { FirestoreRequestStore } from './firestoreStore';
import type { ApplicationDocument } from './contracts';

type StoredDocument = Record<string, unknown>;
type QueryFilter = readonly [string, unknown];

class FakeDocumentSnapshot {
  constructor(private readonly value: StoredDocument | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeQuerySnapshot {
  constructor(readonly docs: Array<{ id: string; data: StoredDocument }>) {}
  get empty() { return this.docs.length === 0; }
}

class FakeDocumentReference {
  constructor(readonly database: FakeFirestore, readonly path: string) {}
  get id() { return this.path.split('/').at(-1) ?? ''; }
}

class FakeQuery {
  constructor(readonly database: FakeFirestore, readonly collectionPath: string, readonly filters: QueryFilter[] = [], readonly maximum = Infinity) {}
  doc(id: string) { return new FakeDocumentReference(this.database, `${this.collectionPath}/${id}`); }
  where(field: string, _operator: string, value: unknown) {
    return new FakeQuery(this.database, this.collectionPath, [...this.filters, [field, value]], this.maximum);
  }
  limit(maximum: number) {
    return new FakeQuery(this.database, this.collectionPath, this.filters, maximum);
  }
}

class FakeTransaction {
  constructor(private readonly database: FakeFirestore) {}
  async get(reference: FakeDocumentReference | FakeQuery) {
    if (reference instanceof FakeQuery) {
      const prefix = `${reference.collectionPath}/`;
      const docs = [...this.database.documents.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .filter(([, value]) => reference.filters.every(([field, expected]) => value[field] === expected))
        .slice(0, reference.maximum)
        .map(([path, data]) => ({ id: path.slice(prefix.length), data: { ...data } }));
      return new FakeQuerySnapshot(docs);
    }
    const value = this.database.documents.get(reference.path);
    return new FakeDocumentSnapshot(value ? { ...value } : undefined);
  }
  create(reference: FakeDocumentReference, value: StoredDocument) {
    if (this.database.documents.has(reference.path)) throw new Error('document already exists');
    this.database.documents.set(reference.path, { ...value });
  }
}

class FakeFirestore {
  readonly documents = new Map<string, StoredDocument>();
  private transactionTail = Promise.resolve();

  doc(path: string) { return new FakeDocumentReference(this, path); }
  collection(path: string) { return new FakeQuery(this, path); }

  async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const previous = this.transactionTail;
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.transactionTail = previous.then(() => current);
    await previous;
    try {
      return await callback(new FakeTransaction(this));
    } finally {
      release();
    }
  }
}

const now = Timestamp.fromDate(new Date('2026-10-16T00:00:00.000Z'));

function application(overrides: Partial<ApplicationDocument> = {}): ApplicationDocument {
  return {
    applicationId: 'application-stable-id',
    studentUid: 'student-1',
    studentName: 'Student One',
    orgId: 'org-1',
    organizationName: 'Organization One',
    opportunityId: 'opportunity-current',
    opportunityTitle: 'Current opportunity',
    status: 'Pending',
    externalFormOpenedAt: now,
    externalSubmissionConfirmedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function storeFor(database: FakeFirestore): FirestoreRequestStore {
  return new FirestoreRequestStore(database as unknown as Firestore);
}

describe('Firestore application uniqueness transaction', () => {
  it('serializes concurrent submissions for one student and organization to one document', async () => {
    const database = new FakeFirestore();
    database.documents.set('organizations/org-1', { orgId: 'org-1' });
    const store = storeFor(database);
    const input = application();

    const results = await Promise.all([
      store.createApplicationIfAbsent('application-stable-id', input),
      store.createApplicationIfAbsent('application-stable-id', input),
    ]);

    expect(results.sort()).toEqual(['created', 'exists']);
    expect(database.documents.get('applications/application-stable-id')).toMatchObject({ studentUid: 'student-1', orgId: 'org-1' });
    expect([...database.documents.keys()].filter((path) => path.startsWith('applications/'))).toHaveLength(1);
  });

  it('treats an existing opportunity-keyed record as the same student and organization without migrating it', async () => {
    const database = new FakeFirestore();
    database.documents.set('organizations/org-1', { orgId: 'org-1' });
    database.documents.set('applications/legacy-opportunity-id', {
      ...application({ applicationId: 'legacy-opportunity-id', opportunityId: 'opportunity-previous', status: 'Declined' }),
    });

    const result = await storeFor(database).createApplicationIfAbsent('application-stable-id', application());

    expect(result).toBe('exists');
    expect(database.documents.has('applications/legacy-opportunity-id')).toBe(true);
    expect(database.documents.has('applications/application-stable-id')).toBe(false);
    expect(database.documents.get('applications/legacy-opportunity-id')?.status).toBe('Declined');
  });

  it('rejects creation when the organization closes intake before the transaction commits', async () => {
    const database = new FakeFirestore();
    database.documents.set('organizations/org-1', { orgId: 'org-1', applicationsOpen: false });

    const result = await storeFor(database).createApplicationIfAbsent('application-stable-id', application());

    expect(result).toBe('closed');
    expect(database.documents.has('applications/application-stable-id')).toBe(false);
  });
});
