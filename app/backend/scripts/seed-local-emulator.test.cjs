'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createFixtureIfAbsent, seedAccounts, seedOrganizations, seedContent, seedRequests } = require('./seed-local-emulator.cjs');

function createFakeServices({ authUsers = [], documents = {} } = {}) {
  const users = new Map(authUsers.map((user) => [user.uid, structuredClone(user)]));
  const stored = new Map(Object.entries(documents).map(([path, value]) => [path, structuredClone(value)]));
  const writes = [];
  const auth = {
    async getUser(uid) {
      const user = users.get(uid);
      if (!user) {
        const error = new Error('User not found');
        error.code = 'auth/user-not-found';
        throw error;
      }
      return user;
    },
    async createUser(user) {
      users.set(user.uid, structuredClone(user));
      return user;
    }
  };
  const db = {
    doc(path) {
      return {
        async get() {
          return { exists: stored.has(path), data: () => stored.get(path) };
        },
        async set(value, options) {
          if (options?.merge) {
            stored.set(path, { ...(stored.get(path) ?? {}), ...structuredClone(value) });
          } else {
            assert.equal(stored.has(path), false, `refusing to overwrite existing ${path}`);
            stored.set(path, structuredClone(value));
          }
          writes.push(path);
        },
        async create(value) {
          if (stored.has(path)) {
            const error = new Error(`already exists: ${path}`);
            error.code = 6;
            throw error;
          }
          stored.set(path, structuredClone(value));
          writes.push(path);
        }
      };
    }
  };
  return { auth, db, users, stored, writes };
}

const fixture = {
  uid: 'demo-student-1',
  email: 'student@example.test',
  displayName: 'Mara Santos',
  role: 'student',
  studentId: 'S-1001',
  department: 'Computer Engineering Department'
};

test('seeds defaults for a new fixture once and preserves existing Auth claims and profile records on rerun', async () => {
  const services = createFakeServices();
  await seedAccounts(services.db, services.auth, [fixture]);

  const accountPath = `accounts/${fixture.uid}`;
  const entitlementPath = `entitlements/${fixture.uid}`;
  const initialAccount = structuredClone(services.stored.get(accountPath));
  const initialEntitlement = structuredClone(services.stored.get(entitlementPath));
  assert.equal(initialAccount.department, fixture.department);
  assert.equal(initialAccount.departmentKey, 'computer engineering department');
  assert.equal(initialEntitlement.provider, 'emulator-simulated');
  assert.equal(services.users.get(fixture.uid).password, 'SoarDemo123!');

  services.users.get(fixture.uid).customClaims = { soarAdmin: true, retained: 'claim' };
  services.stored.get(accountPath).department = 'Architecture Department';
  services.stored.get(accountPath).departmentKey = 'architecture department';
  services.stored.get(accountPath).displayName = 'Tester-edited profile';
  services.stored.get(entitlementPath).accessExpiresAt = { seconds: 1234567890, nanoseconds: 0 };
  const savedAccount = structuredClone(services.stored.get(accountPath));
  const savedEntitlement = structuredClone(services.stored.get(entitlementPath));
  const writesBeforeRerun = [...services.writes];

  await seedAccounts(services.db, services.auth, [fixture]);

  assert.deepEqual(services.users.get(fixture.uid).customClaims, { soarAdmin: true, retained: 'claim' });
  assert.deepEqual(services.stored.get(accountPath), savedAccount);
  assert.deepEqual(services.stored.get(entitlementPath), savedEntitlement);
  assert.deepEqual(services.writes, writesBeforeRerun);
});

test('creates missing fixtures once, then preserves fixture edits, statuses, counters, and subcollections on rerun', async () => {
  const services = createFakeServices();
  await seedOrganizations(services.db);
  await seedContent(services.db);
  await seedRequests(services.db);

  const fixturePaths = [...services.stored.keys()];
  assert.ok(fixturePaths.some((path) => path === 'organizations/computer-engineering'));
  assert.ok(fixturePaths.some((path) => path === 'announcements/post-robotics-tryouts'));
  assert.ok(fixturePaths.some((path) => path === 'calendarEntries/date-computer-engineering-build-night'));
  assert.ok(fixturePaths.some((path) => path.startsWith('applications/')));
  assert.ok(fixturePaths.some((path) => path.startsWith('meetingRequests/')));
  assert.equal(services.stored.get('announcements/post-robotics-tryouts').likeCount, 0);

  for (const path of fixturePaths) {
    const current = services.stored.get(path);
    const edited = { ...current, testerEdit: `preserve:${path}` };
    if (path.startsWith('organizations/') && !path.includes('/officerGrants/')) edited.name = `Tester-edited ${current.name}`;
    if (path.startsWith('announcements/')) {
      edited.likeCount = 9;
      edited.commentCount = 6;
      edited.body = 'Tester-edited announcement';
    }
    if (path.startsWith('calendarEntries/')) edited.date = '2099-12-31';
    if (path.startsWith('applications/')) edited.status = 'Reviewed';
    if (path.startsWith('meetingRequests/')) edited.status = 'Cancelled';
    if (path.includes('/officerGrants/')) {
      edited.status = 'revoked';
      edited.revokedByUid = 'tester-admin';
      edited.revokedAt = { seconds: 1_800_000_000, nanoseconds: 0 };
    }
    services.stored.set(path, edited);
  }
  services.stored.set('announcements/post-robotics-tryouts/likes/tester', { uid: 'tester', announcementId: 'post-robotics-tryouts' });
  services.stored.set('announcements/post-robotics-tryouts/comments/tester', { commentId: 'tester', body: 'Keep this child.' });
  const beforeRerun = new Map(services.stored);

  await seedOrganizations(services.db);
  await seedContent(services.db);
  await seedRequests(services.db);

  assert.deepEqual(services.stored, beforeRerun);
});

test('treats only already-exists as a no-op when creating a fixture', async () => {
  const services = createFakeServices();
  assert.equal(await createFixtureIfAbsent(services.db, 'fixtures/item', { value: 'initial' }), true);
  assert.equal(await createFixtureIfAbsent(services.db, 'fixtures/item', { value: 'replacement' }), false);
  assert.deepEqual(services.stored.get('fixtures/item'), { value: 'initial' });

  const failure = Object.assign(new Error('permission denied'), { code: 7 });
  const failingDb = { doc: () => ({ create: async () => { throw failure; } }) };
  await assert.rejects(createFixtureIfAbsent(failingDb, 'fixtures/blocked', {}), (error) => error === failure);
});

test('does not create an Auth fixture for an existing Firestore profile', async () => {
  const uid = fixture.uid;
  const account = { uid, role: 'student', displayName: 'Preserved student' };
  const services = createFakeServices({ documents: { [`accounts/${uid}`]: account } });

  await seedAccounts(services.db, services.auth, [fixture]);

  assert.equal(services.users.has(uid), false);
  assert.deepEqual(services.stored.get(`accounts/${uid}`), account);
  assert.deepEqual(services.writes, []);
});

test('does not initialize Firestore fixtures over records for an existing Auth identity', async () => {
  const uid = fixture.uid;
  const account = { uid, displayName: 'Existing profile', department: 'Geodetic Engineering', departmentKey: 'geodetic engineering' };
  const expiry = { seconds: 1234567890, nanoseconds: 0 };
  const entitlement = { uid, status: 'active', accessExpiresAt: expiry, history: [{ accessExpiresAt: expiry }] };
  const services = createFakeServices({
    authUsers: [{ uid, email: 'existing@example.test', customClaims: { soarAdmin: true } }],
    documents: { [`accounts/${uid}`]: account, [`entitlements/${uid}`]: entitlement }
  });

  await seedAccounts(services.db, services.auth, [fixture]);

  assert.deepEqual(services.stored.get(`accounts/${uid}`), account);
  assert.deepEqual(services.stored.get(`entitlements/${uid}`), entitlement);
  assert.deepEqual(services.users.get(uid).customClaims, { soarAdmin: true });
  assert.deepEqual(services.writes, []);
});
