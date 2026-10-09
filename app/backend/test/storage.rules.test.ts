import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? `soar-storage-rules-${Date.now()}`;
let testEnv: RulesTestEnvironment;

const future = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
const expired = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
const oldEnough = Timestamp.fromDate(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000));

function storageFor(uid: string, emailVerified = true) {
  return testEnv.authenticatedContext(uid, { email_verified: emailVerified, email: `${uid}@example.test` }).storage();
}

function anonStorage() {
  return testEnv.unauthenticatedContext().storage();
}

function imageBlob(size = 16, type = 'image/png') {
  return new Blob([new Uint8Array(size).fill(1)], { type });
}

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const uid of ['owner', 'officer', 'foreign', 'expired', 'unverified']) {
      await setDoc(doc(db, 'accounts', uid), {
        uid,
        role: 'student',
        displayName: uid,
        email: `${uid}@example.test`,
        emailVerified: uid !== 'unverified',
        studentId: `S-${uid}`,
        createdAt: oldEnough,
        updatedAt: oldEnough
      });
      await setDoc(doc(db, 'entitlements', uid), {
        uid,
        status: 'active',
        accessExpiresAt: uid === 'expired' ? expired : future,
        provider: 'test',
        lastProviderEventId: `evt-${uid}`,
        history: [],
        createdAt: oldEnough,
        updatedAt: oldEnough
      });
    }

    await setDoc(doc(db, 'organizations', 'org1'), {
      orgId: 'org1',
      name: 'Robotics Club',
      slug: 'robotics-club',
      searchName: 'robotics club',
      ownerUid: 'owner',
      createdAt: oldEnough,
      updatedAt: oldEnough,
      createdByUid: 'admin'
    });
    await setDoc(doc(db, 'organizations', 'org1', 'officerGrants', 'officer'), {
      uid: 'officer',
      status: 'active',
      grantedByUid: 'owner',
      createdAt: oldEnough,
      updatedAt: oldEnough
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), '../../firestore.rules'), 'utf8')
    },
    storage: {
      rules: readFileSync(resolve(process.cwd(), '../../storage.rules'), 'utf8')
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await seedBaseData();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('storage organization image boundaries', () => {
  it('allows organization owners and active officers to upload organization images', async () => {
    await assertSucceeds(storageFor('owner').ref('organization-logos/org1/logo.png').put(imageBlob(), { contentType: 'image/png' }));
    await assertSucceeds(storageFor('officer').ref('announcement-images/org1/post1/image.webp').put(imageBlob(16, 'image/webp'), { contentType: 'image/webp' }));
  });

  it('blocks foreign, unverified, expired, and anonymous uploads', async () => {
    await assertFails(storageFor('foreign').ref('organization-logos/org1/logo.png').put(imageBlob(), { contentType: 'image/png' }));
    await assertFails(storageFor('unverified', false).ref('organization-logos/org1/logo.png').put(imageBlob(), { contentType: 'image/png' }));
    await assertFails(storageFor('expired').ref('organization-logos/org1/logo.png').put(imageBlob(), { contentType: 'image/png' }));
    await assertFails(anonStorage().ref('organization-logos/org1/logo.png').put(imageBlob(), { contentType: 'image/png' }));
  });

  it('blocks invalid image types and oversized files', async () => {
    await assertFails(storageFor('owner').ref('organization-logos/org1/readme.txt').put(imageBlob(16, 'text/plain'), { contentType: 'text/plain' }));
    await assertFails(storageFor('owner').ref('organization-logos/org1/huge.png').put(imageBlob(5 * 1024 * 1024 + 1), { contentType: 'image/png' }));
  });

  it('allows active users to read images while blocking expired users', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.storage().ref('organization-logos/org1/logo.png').put(imageBlob(), { contentType: 'image/png' });
    });

    await assertSucceeds(storageFor('foreign').ref('organization-logos/org1/logo.png').getDownloadURL());
    await assertFails(storageFor('expired').ref('organization-logos/org1/logo.png').getDownloadURL());
  });
});
