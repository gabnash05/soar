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

const projectId = process.env.GCLOUD_PROJECT ?? `soar-rules-${Date.now()}`;

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
      searchName: 'robotics club',
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

    await setDoc(doc(db, 'announcements', 'post1'), {
      announcementId: 'post1',
      orgId: 'org1',
      organizationName: 'Robotics Club',
      organizationLogoPath: 'organization-logos/org1/logo.png',
      authorUid: 'owner',
      body: 'Tryouts Friday.',
      image: null,
      likeCount: 0,
      commentCount: 0,
      deletedAt: null,
      createdAt: oldEnough,
      updatedAt: oldEnough
    });

    await setDoc(doc(db, 'calendarEntries', 'date1'), {
      entryId: 'date1',
      orgId: 'org1',
      organizationName: 'Robotics Club',
      kind: 'availability',
      title: 'Interview window',
      date: '2026-11-12',
      startTime: '14:00',
      endTime: '16:00',
      details: 'Request one time during this window.',
      createdByUid: 'owner',
      createdAt: oldEnough,
      updatedAt: oldEnough
    });

    await setDoc(doc(db, 'applications', 'app1'), {
      applicationId: 'app1',
      studentUid: 'student',
      studentName: 'Student User',
      orgId: 'org1',
      organizationName: 'Robotics Club',
      opportunityId: 'org1-member',
      opportunityTitle: 'Member',
      status: 'Pending',
      externalFormOpenedAt: oldEnough,
      externalSubmissionConfirmedAt: oldEnough,
      createdAt: oldEnough,
      updatedAt: oldEnough
    });

    await setDoc(doc(db, 'meetingRequests', 'meeting1'), {
      meetingRequestId: 'meeting1',
      requesterUid: 'student',
      requesterName: 'Student User',
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
    await assertFails(updateDoc(doc(dbFor('student'), 'accounts', 'student'), { department: 'Attacker Department' }));
    await assertFails(updateDoc(doc(dbFor('student'), 'entitlements', 'student'), { accessExpiresAt: future }));
    await assertFails(setDoc(doc(dbFor('student'), 'entitlements', 'new-user'), { status: 'active', accessExpiresAt: future }));
  });
});

describe('organization permissions', () => {
  it('allows active users to read organizations but blocks direct SDK organization writes', async () => {
    await assertSucceeds(getDoc(doc(dbFor('student'), 'organizations', 'org1')));
    await assertFails(updateDoc(doc(dbFor('owner'), 'organizations', 'org1'), {
      name: 'Robotics Guild',
      updatedAt: serverTimestamp()
    }));
    await assertFails(updateDoc(doc(dbFor('officer'), 'organizations', 'org1'), {
      shortDescription: 'Updated by officer',
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
  it('allows active users to read content but blocks direct SDK content writes owned by backend services', async () => {
    await assertSucceeds(getDoc(doc(dbFor('student'), 'announcements', 'post1')));
    await assertSucceeds(getDoc(doc(dbFor('student'), 'calendarEntries', 'date1')));
    await assertFails(setDoc(doc(dbFor('owner'), 'announcements', 'post2'), {
      announcementId: 'post2',
      orgId: 'org1',
      authorUid: 'owner',
      body: 'Direct post.',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(dbFor('student'), 'announcements', 'post1', 'likes', 'student'), {
      uid: 'student',
      announcementId: 'post1',
      createdAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(dbFor('student'), 'announcements', 'post1', 'comments', 'comment1'), {
      commentId: 'comment1',
      announcementId: 'post1',
      authorUid: 'student',
      body: 'Direct comment.',
      createdAt: serverTimestamp()
    }));
    await assertFails(setDoc(doc(dbFor('owner'), 'calendarEntries', 'date2'), {
      entryId: 'date2',
      orgId: 'org1',
      kind: 'event',
      title: 'Direct date',
      date: '2026-11-15',
      details: 'Blocked.',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));
  });

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

  it('allows only the requester or organization managers to read meeting records', async () => {
    await assertSucceeds(getDoc(doc(dbFor('student'), 'meetingRequests', 'meeting1')));
    await assertSucceeds(getDoc(doc(dbFor('owner'), 'meetingRequests', 'meeting1')));
    await assertSucceeds(getDoc(doc(dbFor('officer'), 'meetingRequests', 'meeting1')));
    await assertFails(getDoc(doc(dbFor('foreign'), 'meetingRequests', 'meeting1')));
  });

  it('requires trusted backend writes for application confirmations and stage changes', async () => {
    await assertFails(setDoc(doc(dbFor('student'), 'applications', 'app2'), {
      applicationId: 'app2',
      studentUid: 'student',
      studentName: 'Student User',
      orgId: 'org1',
      organizationName: 'Robotics Club',
      opportunityId: 'org1-member',
      opportunityTitle: 'Member',
      status: 'Pending',
      externalFormOpenedAt: oldEnough,
      externalSubmissionConfirmedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));

    await assertFails(updateDoc(doc(dbFor('owner'), 'applications', 'app1'), {
      status: 'Under review',
      reviewedByUid: 'owner',
      updatedAt: serverTimestamp()
    }));
  });

  it('requires trusted backend writes for meeting requests and decisions', async () => {
    await assertFails(setDoc(doc(dbFor('sponsor'), 'meetingRequests', 'sponsor-meeting'), {
      meetingRequestId: 'sponsor-meeting',
      requesterUid: 'sponsor',
      requesterName: 'Sponsor User',
      requesterRole: 'sponsor',
      orgId: 'org1',
      organizationName: 'Robotics Club',
      dateEntryId: 'date1',
      meetingTitle: 'Interview window',
      status: 'Pending',
      requestedDate: '2026-10-10',
      requestedTime: '11:00',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }));

    await assertFails(updateDoc(doc(dbFor('officer'), 'meetingRequests', 'meeting1'), {
      status: 'Approved',
      decidedByUid: 'officer',
      updatedAt: serverTimestamp()
    }));
  });
});
