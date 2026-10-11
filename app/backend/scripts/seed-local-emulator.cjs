#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.SOAR_EMULATOR_PROJECT_ID || 'demo-soar-local';
const DEMO_PASSWORD = 'SoarDemo123!';
const ACCESS_MONTHS = 6;

function fail(message) {
  console.error(`Refusing to seed local SOAR data: ${message}`);
  process.exit(1);
}

function parseHostPort(value, label) {
  if (!value) fail(`${label} is required.`);
  const url = new URL(value.includes('://') ? value : `http://${value}`);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port);
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (!loopback) fail(`${label} must point at loopback, got ${value}.`);
  if (!Number.isInteger(port) || port <= 0) fail(`${label} must include a port, got ${value}.`);
  return { url: `${url.protocol}//${url.host}`, hostname, port };
}

function assertLocalOnly() {
  if (PROJECT_ID !== 'demo-soar-local') {
    fail(`GCLOUD_PROJECT/SOAR_EMULATOR_PROJECT_ID must be demo-soar-local, got ${PROJECT_ID}.`);
  }

  if (PROJECT_ID === 'soar-a711e') {
    fail('the production Firebase project is never a seed target.');
  }

  const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : undefined;
  if (firebaseConfig?.projectId && firebaseConfig.projectId !== PROJECT_ID) {
    fail(`FIREBASE_CONFIG projectId ${firebaseConfig.projectId} does not match ${PROJECT_ID}.`);
  }

  return {
    firestore: parseHostPort(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST'),
    auth: parseHostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'FIREBASE_AUTH_EMULATOR_HOST')
  };
}

async function probeEmulator(label, endpoint) {
  try {
    await fetch(endpoint, { method: 'GET' });
  } catch (error) {
    fail(`${label} emulator at ${endpoint} is not reachable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stableId(prefix, parts) {
  const hash = crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex').slice(0, 32);
  return `${prefix}_${hash}`;
}

function addCalendarMonths(date, months) {
  const copy = new Date(date.getTime());
  const day = copy.getUTCDate();
  const targetMonth = copy.getUTCMonth() + months;
  copy.setUTCDate(1);
  copy.setUTCMonth(targetMonth);
  copy.setUTCDate(Math.min(day, new Date(Date.UTC(copy.getUTCFullYear(), copy.getUTCMonth() + 1, 0)).getUTCDate()));
  return copy;
}

function nowAndExpiry() {
  const nowDate = new Date();
  const now = Timestamp.fromDate(nowDate);
  const expires = Timestamp.fromDate(addCalendarMonths(nowDate, ACCESS_MONTHS));
  return { now, expires };
}

async function upsertAuthUser(auth, user) {
  try {
    await auth.getUser(user.uid);
    await auth.updateUser(user.uid, {
      email: user.email,
      password: DEMO_PASSWORD,
      displayName: user.displayName,
      emailVerified: true,
      disabled: false
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: DEMO_PASSWORD,
      displayName: user.displayName,
      emailVerified: true,
      disabled: false
    });
  }
}

async function seedAccounts(db, auth, users) {
  const { now, expires } = nowAndExpiry();
  for (const user of users) {
    await upsertAuthUser(auth, user);
    await db.doc(`accounts/${user.uid}`).set({
      uid: user.uid,
      role: user.role,
      displayName: user.displayName,
      email: user.email,
      emailVerified: true,
      ...(user.studentId ? { studentId: user.studentId } : {}),
      ...(user.department ? { department: user.department, departmentKey: user.department.toLowerCase() } : {}),
      ...(user.companyName ? { companyName: user.companyName } : {}),
      createdAt: now,
      updatedAt: now
    }, { merge: true });

    await db.doc(`entitlements/${user.uid}`).set({
      uid: user.uid,
      status: 'active',
      accessExpiresAt: expires,
      provider: 'emulator-simulated',
      lastProviderEventId: `seed-${user.uid}`,
      history: [{
        provider: 'emulator-simulated',
        providerEventId: `seed-${user.uid}`,
        intentId: `seed-intent-${user.uid}`,
        accessExpiresAt: expires,
        amount: { currency: 'PHP', minor: 1000 },
        recordedAt: now,
        note: 'LOCAL EMULATOR ONLY: simulated paid six-month access; not valid for production.'
      }],
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  }
}

async function seedOrganizations(db) {
  const { now } = nowAndExpiry();
  const orgs = [
    {
      orgId: 'robotics',
      name: 'Robotics Guild',
      slug: 'robotics-guild',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Builds robots, runs workshops, and recruits student makers.',
      description: 'Robotics Guild helps students design practical builds, share lab time, and prepare for competitions through hands-on teams.',
      contactEmail: 'robotics@example.edu',
      contactPhone: '+63 2 8123 4567',
      recruitment: {
        opportunityId: 'robotics-build-team-2026',
        title: 'Build Team 2026',
        requirements: 'Interested students, weekly build availability, and a short external form response.',
        instructions: 'Open the external Google Form, submit it there, then return to SOAR and explicitly confirm the external submission.',
        applicationLink: 'https://forms.gle/example-robotics-build-team'
      }
    },
    {
      orgId: 'literary',
      name: 'Literary Circle',
      slug: 'literary-circle',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Hosts open mic nights, writing circles, and campus publications.',
      description: 'Literary Circle creates a welcoming space for writers, editors, performers, and students who want to publish or perform work.',
      contactEmail: 'literary@example.edu',
      contactPhone: '',
      recruitment: {
        opportunityId: 'literary-open-mic-crew',
        title: 'Open Mic Crew',
        requirements: 'Students available for event preparation, stage support, or publication editing.',
        instructions: 'Submit the external interest form, then confirm in SOAR so officers know to check the sheet.',
        applicationLink: 'https://forms.gle/example-literary-open-mic'
      }
    },
    {
      orgId: 'health',
      name: 'Campus Health Alliance',
      slug: 'campus-health-alliance',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Coordinates wellness campaigns and volunteer drives.',
      description: 'Campus Health Alliance organizes wellness information drives and service opportunities with allied campus partners.',
      contactEmail: 'health@example.edu',
      contactPhone: '+63 917 555 0101',
      recruitment: {
        opportunityId: 'health-wellness-volunteers',
        title: 'Wellness Volunteers',
        requirements: 'Students interested in campus wellness, service coordination, and briefing attendance.',
        instructions: 'Open the external volunteer form, submit it, then confirm the submission in SOAR.',
        applicationLink: 'https://forms.gle/example-health-volunteers'
      }
    }
  ];

  for (const org of orgs) {
    await db.doc(`organizations/${org.orgId}`).set({
      ...org,
      searchName: org.name.toLowerCase(),
      logoPath: '',
      createdAt: now,
      updatedAt: now,
      createdByUid: 'local-emulator-seed'
    }, { merge: true });

    await db.doc(`organizations/${org.orgId}/officerGrants/${org.ownerUid}`).set({
      uid: org.ownerUid,
      status: 'active',
      grantedByUid: 'local-emulator-seed',
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  }

  await db.doc('organizations/robotics/officerGrants/demo-officer-robotics').set({
    uid: 'demo-officer-robotics',
    status: 'active',
    grantedByUid: 'demo-owner-robotics',
    createdAt: now,
    updatedAt: now
  }, { merge: true });
}

async function seedContent(db) {
  const { now } = nowAndExpiry();
  const announcements = [
    ['post-robotics-tryouts', {
      announcementId: 'post-robotics-tryouts',
      orgId: 'robotics',
      organizationName: 'Robotics Guild',
      organizationLogoPath: '',
      authorUid: 'demo-officer-robotics',
      body: 'Tryouts and build night are scheduled this Friday. Open the profile for requirements and meeting availability.',
      image: null,
      likeCount: 0,
      commentCount: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }],
    ['post-health-briefing', {
      announcementId: 'post-health-briefing',
      orgId: 'health',
      organizationName: 'Campus Health Alliance',
      organizationLogoPath: '',
      authorUid: 'demo-owner-robotics',
      body: 'Volunteer briefing slots are posted. Pending meeting requests are not confirmed until an officer approves them.',
      image: null,
      likeCount: 0,
      commentCount: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }]
  ];

  for (const [id, data] of announcements) {
    await db.doc(`announcements/${id}`).set(data, { merge: true });
  }

  const entries = [
    ['date-robotics-build-night', { orgId: 'robotics', organizationName: 'Robotics Guild', kind: 'event', title: 'Build Night', date: '2026-11-09', startTime: '18:00', endTime: '', details: 'Open lab night for students interested in robotics projects.', createdByUid: 'demo-officer-robotics' }],
    ['date-robotics-interview', { orgId: 'robotics', organizationName: 'Robotics Guild', kind: 'availability', title: 'Build Team interview window', date: '2026-11-12', startTime: '14:00', endTime: '16:00', details: 'Request one time during this window after submitting the external form.', createdByUid: 'demo-officer-robotics' }],
    ['date-literary-open-mic', { orgId: 'literary', organizationName: 'Literary Circle', kind: 'event', title: 'Open Mic Night', date: '2026-11-10', startTime: '17:30', endTime: '', details: 'Campus reading night and publication interest session.', createdByUid: 'demo-owner-robotics' }],
    ['date-health-partner-meeting', { orgId: 'health', organizationName: 'Campus Health Alliance', kind: 'availability', title: 'Partner meeting slot', date: '2026-11-14', startTime: '09:00', endTime: '11:00', details: 'Sponsors and students can request this discussion slot.', createdByUid: 'demo-owner-robotics' }]
  ];

  for (const [entryId, data] of entries) {
    await db.doc(`calendarEntries/${entryId}`).set({
      entryId,
      ...data,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  }
}

async function seedRequests(db) {
  const { now } = nowAndExpiry();
  const applicationId = stableId('app', ['demo-student-1', 'robotics', 'robotics-build-team-2026']);
  await db.doc(`applications/${applicationId}`).set({
    applicationId,
    studentUid: 'demo-student-1',
    studentName: 'Mara Santos',
    orgId: 'robotics',
    organizationName: 'Robotics Guild',
    opportunityId: 'robotics-build-team-2026',
    opportunityTitle: 'Build Team 2026',
    status: 'Pending',
    externalFormOpenedAt: now,
    externalSubmissionConfirmedAt: now,
    createdAt: now,
    updatedAt: now
  }, { merge: true });

  const studentMeetingId = stableId('meeting', ['demo-student-1', 'robotics', 'date-robotics-interview', '2026-11-12', '14:00']);
  await db.doc(`meetingRequests/${studentMeetingId}`).set({
    meetingRequestId: studentMeetingId,
    requesterUid: 'demo-student-1',
    requesterName: 'Mara Santos',
    requesterRole: 'student',
    orgId: 'robotics',
    organizationName: 'Robotics Guild',
    dateEntryId: 'date-robotics-interview',
    meetingTitle: 'Build Team interview window',
    requestedDate: '2026-11-12',
    requestedTime: '14:00',
    status: 'Pending',
    note: 'Application submitted externally.',
    createdAt: now,
    updatedAt: now
  }, { merge: true });

  const sponsorMeetingId = stableId('meeting', ['demo-sponsor-1', 'health', 'date-health-partner-meeting', '2026-11-14', '09:30']);
  await db.doc(`meetingRequests/${sponsorMeetingId}`).set({
    meetingRequestId: sponsorMeetingId,
    requesterUid: 'demo-sponsor-1',
    requesterName: 'Ari Reyes',
    requesterRole: 'sponsor',
    orgId: 'health',
    organizationName: 'Campus Health Alliance',
    dateEntryId: 'date-health-partner-meeting',
    meetingTitle: 'Partner meeting slot',
    requestedDate: '2026-11-14',
    requestedTime: '09:30',
    status: 'Approved',
    note: 'Discuss possible support for wellness materials.',
    createdAt: now,
    updatedAt: now,
    decidedByUid: 'demo-owner-robotics',
    decidedAt: now
  }, { merge: true });
}

async function main() {
  const hosts = assertLocalOnly();
  await Promise.all([
    probeEmulator('Firestore', hosts.firestore.url),
    probeEmulator('Auth', hosts.auth.url)
  ]);

  admin.initializeApp({ projectId: PROJECT_ID, storageBucket: `${PROJECT_ID}.appspot.com` });
  const db = admin.firestore();
  const auth = admin.auth();

  const users = [
    { uid: 'demo-student-1', email: 'student@example.test', displayName: 'Mara Santos', role: 'student', studentId: 'S-1001', department: 'Computer Science' },
    { uid: 'demo-sponsor-1', email: 'sponsor@example.test', displayName: 'Ari Reyes', role: 'sponsor', companyName: 'Allied Demo Co.' },
    { uid: 'demo-owner-robotics', email: 'owner@example.test', displayName: 'Rina Cruz', role: 'student', studentId: 'S-2001', department: 'Engineering' },
    { uid: 'demo-officer-robotics', email: 'officer@example.test', displayName: 'Leo Tan', role: 'student', studentId: 'S-2002', department: 'Computer Science' }
  ];

  await seedAccounts(db, auth, users);
  await seedOrganizations(db);
  await seedContent(db);
  await seedRequests(db);

  console.log('Seeded demo-soar-local Auth and Firestore with emulator-only SOAR demo data.');
  console.log('These accounts use simulated six-month access records and are not valid production payment evidence.');
  for (const user of users) {
    console.log(`- ${user.email} / ${DEMO_PASSWORD} (${user.role}${user.uid.includes('officer') || user.uid.includes('owner') ? ', organization manager demo' : ''})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
