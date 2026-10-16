'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { seedAccounts } = require('./seed-local-emulator.cjs');

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
        async set(value) {
          assert.equal(stored.has(path), false, `refusing to overwrite existing ${path}`);
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
