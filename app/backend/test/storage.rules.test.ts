import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT ?? `soar-storage-rules-${Date.now()}`;
const requestPath = 'meeting-request-documents/org1/meeting1/formal-request.pdf';
const metadata = { orgId: 'org1', meetingRequestId: 'meeting1', requesterUid: 'requester' };

function emulatorHostPort(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = new URL(`http://${value}`);
  return { host: parsed.hostname, port: Number(parsed.port) };
}

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

function pdfBlob(size = 16, type = 'application/pdf') {
  return new Blob([new Uint8Array(size).fill(2)], { type });
}

function unsupportedVideoBlob(size = 16, type = 'video/mp4') {
  return new Blob([new Uint8Array(size).fill(3)], { type });
}

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const uid of ['owner', 'officer', 'requester', 'foreign', 'expired', 'unverified']) {
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

    await setDoc(doc(db, 'meetingRequests', 'meeting1'), {
      meetingRequestId: 'meeting1',
      requesterUid: 'requester',
      requesterName: 'Requester User',
      requesterRole: 'student',
      orgId: 'org1',
      organizationName: 'Robotics Club',
      dateEntryId: 'date1',
      meetingTitle: 'Interview window',
      status: 'Pending',
      requestedDate: '2026-10-10',
      requestedTime: '10:00',
      createdAt: oldEnough,
      updatedAt: oldEnough
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), '../../firestore.rules'), 'utf8'),
      ...emulatorHostPort(process.env.FIRESTORE_EMULATOR_HOST)
    },
    storage: {
      rules: readFileSync(resolve(process.cwd(), '../../storage.rules'), 'utf8'),
      ...emulatorHostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST)
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
  it('allows organization-owned image uploads and rejects announcement videos' , async () => {
    await assertSucceeds(storageFor('owner').ref('organization-logos/org1/logo.png').put(imageBlob(), { contentType: 'image/png' }));
    await assertSucceeds(storageFor('officer').ref('announcement-images/org1/post1/image.webp').put(imageBlob(16, 'image/webp'), { contentType: 'image/webp' }));
    await assertFails(storageFor('officer').ref('announcement-images/org1/post1/clip.mp4').put(unsupportedVideoBlob(), { contentType: 'video/mp4' }));
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
    await assertFails(storageFor('officer').ref('announcement-images/org1/post1/clip.webm').put(unsupportedVideoBlob(16, 'video/webm'), { contentType: 'video/webm' }));
  });

  it('blocks all new organization image and private-request uploads after deletion starts', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'organizations', 'org1'), { deletionStatus: 'deleting' });
    });

    await assertFails(storageFor('owner').ref('organization-logos/org1/new-logo.png').put(imageBlob(), { contentType: 'image/png' }));
    await assertFails(storageFor('officer').ref('announcement-images/org1/new-post/photo.png').put(imageBlob(), { contentType: 'image/png' }));
    await assertFails(storageFor('requester').ref(requestPath).put(pdfBlob(), { contentType: 'application/pdf', customMetadata: metadata }));
  });

  it('allows only eligible activation-cohort accounts to read without entitlements and keeps revocation precedence', async () => {
    const activationAt = Timestamp.fromDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000));
    const newAccountAt = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'systemSettings', 'paymentPolicy'), {
        paymentsRequired: false,
        existingAccountAccessActivatedAt: activationAt,
        existingAccountAccessExpiresAt: future,
      });
      for (const [uid, createdAt] of [['grandfathered', oldEnough], ['registeredAfter', newAccountAt]] as const) {
        await setDoc(doc(db, 'accounts', uid), {
          uid,
          role: 'student',
          displayName: uid,
          email: `${uid}@example.test`,
          emailVerified: true,
          createdAt,
          updatedAt: createdAt,
        });
      }
      await setDoc(doc(db, 'accounts', 'revoked-grandfathered'), {
        uid: 'revoked-grandfathered', role: 'student', displayName: 'Revoked', email: 'revoked@example.test', emailVerified: true, createdAt: oldEnough,
      });
      await setDoc(doc(db, 'entitlements', 'revoked-grandfathered'), {
        uid: 'revoked-grandfathered', status: 'revoked', accessExpiresAt: future,
      });
      await context.storage().ref('organization-logos/org1/grandfathered.png').put(imageBlob(), { contentType: 'image/png' });
    });

    await assertSucceeds(storageFor('grandfathered').ref('organization-logos/org1/grandfathered.png').getDownloadURL());
    await assertFails(storageFor('registeredAfter').ref('organization-logos/org1/grandfathered.png').getDownloadURL());
    await assertFails(storageFor('revoked-grandfathered').ref('organization-logos/org1/grandfathered.png').getDownloadURL());
  });

  it('allows active users to read images while blocking expired users', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.storage().ref('organization-logos/org1/logo.png').put(imageBlob(), { contentType: 'image/png' });
    });

    await assertSucceeds(storageFor('foreign').ref('organization-logos/org1/logo.png').getDownloadURL());
    await assertFails(storageFor('expired').ref('organization-logos/org1/logo.png').getDownloadURL());
  });
});

describe('storage meeting request document boundaries', () => {
  it('allows requesters to upload PDFs with matching metadata only', async () => {
    await assertSucceeds(storageFor('requester').ref(requestPath).put(pdfBlob(), { contentType: 'application/pdf', customMetadata: metadata }));
    await assertFails(storageFor('requester').ref('meeting-request-documents/org1/meeting1/request.html').put(pdfBlob(16, 'text/html'), { contentType: 'text/html', customMetadata: metadata }));
    await assertFails(storageFor('requester').ref(requestPath).put(pdfBlob(10 * 1024 * 1024 + 1), { contentType: 'application/pdf', customMetadata: metadata }));
    await assertFails(storageFor('foreign').ref(requestPath).put(pdfBlob(), { contentType: 'application/pdf', customMetadata: { ...metadata, requesterUid: 'requester' } }));
  });

  it('blocks direct SDK reads so the authorized API can stream without public download tokens', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.storage().ref(requestPath).put(pdfBlob(), { contentType: 'application/pdf', customMetadata: metadata });
    });

    await assertFails(storageFor('requester').ref(requestPath).getDownloadURL());
    await assertFails(storageFor('officer').ref(requestPath).getDownloadURL());
    await assertFails(storageFor('owner').ref(requestPath).getDownloadURL());
    await assertFails(storageFor('foreign').ref(requestPath).getDownloadURL());
    await assertFails(storageFor('expired').ref(requestPath).getDownloadURL());

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'organizations', 'org1', 'officerGrants', 'officer'), { status: 'revoked' });
    });
    await assertFails(storageFor('officer').ref(requestPath).getDownloadURL());
  });
});
