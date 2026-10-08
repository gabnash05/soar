import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';

const projectId = `soar-rules-${Date.now()}`;
let testEnv: RulesTestEnvironment;

const future = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
const expired = Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
const oldEnough = Timestamp.fromDate(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000));
const tooRecent = Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));

function dbFor(uid: string, emailVerified = true) {
  return testEnv.authenticatedContext(uid, { email_verified: emailVerified, email: `${uid}@example.test` }).firestore();
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const accounts = [
      { uid: 'student', role: 'student', displayName: 'Student User', email: 'student@example.test', emailVerified: true, studentId: 'S-001', lastNameChangedAt: oldEnough },
      { uid: 'recentStudent', role: 'student', displayName: 'Recent Student', email: 'recent@example.test', emailVerified: true, studentId: 'S-002', lastNameChangedAt: tooRecent },
      { uid: 'sponsor', role: 'sponsor', displayName: 'Sponsor User', email: 'sponsor@example.test', emailVerified: true, companyName: 'Sponsor Co' },
      { uid: 'owner', role: 'student', displayName: 'Owner User', email: 'owner@example.test', emailVerified: true, studentId: 'S-003' },
      { uid: 'officer', role: 'student', displayName: 'Officer User', email: 'officer@example.test', emailVerified: true, studentId: 'S-004' },
      { uid: 'foreign', role: 'student', displayName: 'Foreign User', email: 'foreign@example.test', emailVerified: true, studentId: 'S-005' },
      { uid: 'expired', role: 'student', displayName: 'Expired User', email: 'expired@example.test', emailVerified: true, studentId: 'S-006' },
      { uid: 'unverified', role: 'student', displayName: 'Unverified User', email: 'unverified@example.test', emailVerified: false, studentId: 'S-007' }
    ];

    for (const account of accounts) {
      await setDoc(doc(db, 'accounts', account.uid), {
        ...account,
        createdAt: oldEnough,
        updatedAt: oldEnough
      });
    }

    for (const uid of accounts.map((account) => account.uid)) {
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
      ownerUid: 'owner',
      shortDescription: 'Robotics',
      description: 'Builds robots.',
      contactEmail: 'robotics@example.test',
      logoPath: 'organization-logos/org1/logo.png',
      recruitment: { title: 'Member', applicationLink: 'https://forms.example.test/apply' },
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

    await setDoc(doc(db, 'applications', 'app1'), {
      studentUid: 'student',
      orgId: 'org1',
      status: 'pending',
      position: 'Member',
      externalFormOpenedAt: oldEnough,
      externalSubmissionConfirmedAt: oldEnough,
      createdAt: oldEnough,
      updatedAt: oldEnough
    });

    await setDoc(doc(db, 'meetingRequests', 'meeting1'), {
      requesterUid: 'student',
      orgId: 'org1',
      status: 'pending',
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
      rules: readFileSync(resolve(process.cwd(), '../../firestore.rules'), 'utf8')
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseData();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('account and entitlement boundaries', () => {
  it('preserves expired accounts for renewal while blocking main app reads', async () => {
    const expiredDb = dbFor('expired');
    await assertSucceeds(getDoc(doc(expiredDb, 'accounts', 'expired')));
    await assertSucceeds(getDoc(doc(expiredDb, 'entitlements', 'expired')));
    await assertFails(getDoc(doc(expiredDb, 'organizations', 'org1')));
  });

  it('blocks unauthenticated, unverified, and expired users from organization data', async () => {
    await assertFails(getDoc(doc(anonDb(), 'organizations', 'org1')));
    await assertFails(getDoc(doc(dbFor('unverified', false), 'organizations', 'org1')));
    await assertFails(getDoc(doc(dbFor('expired'), 'organizations', 'org1')));
    await assertSucceeds(getDoc(doc(dbFor('student'), 'organizations', 'org1')));
  });

  it('allows only cooldown-compliant self display name updates', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('student'), 'accounts', 'student'), {
      displayName: 'Updated Student',
      lastNameChangedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));

    await assertFails(updateDoc(doc(dbFor('recentStudent'), 'accounts', 'recentStudent'), {
      displayName: 'Too Soon',
      lastNameChangedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  });

  it('prevents client edits to identity-sensitive account and entitlement fields', async () => {
    await assertFails(updateDoc(doc(dbFor('student'), 'accounts', 'student'), { role: 'sponsor' }));
    await assertFails(updateDoc(doc(dbFor('student'), 'accounts', 'student'), { email: 'attacker@example.test' }));
    await assertFails(updateDoc(doc(dbFor('student'), 'entitlements', 'student'), { accessExpiresAt: future }));
    await assertFails(setDoc(doc(dbFor('student'), 'entitlements', 'new-user'), { status: 'active', accessExpiresAt: future }));
  });
});

describe('organization permissions', () => {
  it('allows owners and approved officers to update profile fields only', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('owner'), 'organizations', 'org1'), {
      name: 'Robotics Guild',
      updatedAt: serverTimestamp()
    }));
    await assertSucceeds(updateDoc(doc(dbFor('officer'), 'organizations', 'org1'), {
      shortDescription: 'Updated by officer',
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(dbFor('foreign'), 'organizations', 'org1'), {
      shortDescription: 'Owned by me now',
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(dbFor('owner'), 'organizations', 'org1'), {
      ownerUid: 'foreign',
      updatedAt: serverTimestamp()
    }));
  });

  it('does not allow direct client writes to officer grants', async () => {
    await assertFails(setDoc(doc(dbFor('owner'), 'organizations', 'org1', 'officerGrants', 'foreign'), {
      uid: 'foreign',
      status: 'active',
      grantedByUid: 'owner',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(dbFor('owner'), 'organizations', 'org1', 'officerGrants', 'officer'), { status: 'revoked' }));
    await assertSucceeds(getDoc(doc(dbFor('officer'), 'organizations', 'org1', 'officerGrants', 'officer')));
    await assertFails(getDoc(doc(dbFor('foreign'), 'organizations', 'org1', 'officerGrants', 'officer')));
  });
});

describe('workflow record boundaries enforced by rules', () => {
  it('blocks collection scans for private application and meeting data', async () => {
    await assertFails(getDocs(query(collection(dbFor('student'), 'applications'), where('studentUid', '==', 'student'))));
    await assertFails(getDocs(query(collection(dbFor('student'), 'meetingRequests'), where('requesterUid', '==', 'student'))));
  });

  it('allows only the applicant or organization managers to read application records', async () => {
    await assertSucceeds(getDoc(doc(dbFor('student'), 'applications', 'app1')));
    await assertSucceeds(getDoc(doc(dbFor('owner'), 'applications', 'app1')));
    await assertSucceeds(getDoc(doc(dbFor('officer'), 'applications', 'app1')));
    await assertFails(getDoc(doc(dbFor('foreign'), 'applications', 'app1')));
  });

  it('requires student self-ownership and explicit external submission confirmation for applications', async () => {
    await assertSucceeds(setDoc(doc(dbFor('student'), 'applications', 'app2'), {
      studentUid: 'student',
      orgId: 'org1',
      status: 'pending',
      position: 'Member',
      externalFormOpenedAt: oldEnough,
      externalSubmissionConfirmedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));

    await assertFails(setDoc(doc(dbFor('sponsor'), 'applications', 'sponsor-app'), {
      studentUid: 'sponsor',
      orgId: 'org1',
      status: 'pending',
      position: 'Member',
      externalFormOpenedAt: oldEnough,
      externalSubmissionConfirmedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));

    await assertFails(setDoc(doc(dbFor('student'), 'applications', 'foreign-app'), {
      studentUid: 'foreign',
      orgId: 'org1',
      status: 'pending',
      position: 'Member',
      externalFormOpenedAt: oldEnough,
      externalSubmissionConfirmedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  });

  it('allows organization managers, not foreign users, to decide applications and meetings', async () => {
    await assertSucceeds(updateDoc(doc(dbFor('owner'), 'applications', 'app1'), {
      status: 'under_review',
      reviewedByUid: 'owner',
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(dbFor('foreign'), 'applications', 'app1'), {
      status: 'accepted',
      reviewedByUid: 'foreign',
      updatedAt: serverTimestamp()
    }));

    await assertSucceeds(updateDoc(doc(dbFor('officer'), 'meetingRequests', 'meeting1'), {
      status: 'approved',
      decidedByUid: 'officer',
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(dbFor('foreign'), 'meetingRequests', 'meeting1'), {
      status: 'declined',
      decidedByUid: 'foreign',
      updatedAt: serverTimestamp()
    }));
  });

  it('allows active students and sponsors to create their own pending meeting requests', async () => {
    await assertSucceeds(setDoc(doc(dbFor('sponsor'), 'meetingRequests', 'sponsor-meeting'), {
      requesterUid: 'sponsor',
      orgId: 'org1',
      status: 'pending',
      requestedDate: '2026-10-10',
      requestedTime: '11:00',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));

    await assertFails(setDoc(doc(dbFor('student'), 'meetingRequests', 'bad-meeting'), {
      requesterUid: 'foreign',
      orgId: 'org1',
      status: 'pending',
      requestedDate: '2026-10-10',
      requestedTime: '11:00',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  });
});
