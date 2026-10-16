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

async function createAuthFixtureIfMissing(auth, user) {
  try {
    await auth.getUser(user.uid);
    return false;
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
    return true;
  }
}

async function createFixtureIfAbsent(db, path, data) {
  try {
    await db.doc(path).create(data);
    return true;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 6 || code === '6' || code === 'already-exists' || code === 'firestore/already-exists') return false;
    throw error;
  }
}

async function seedAccounts(db, auth, users) {
  const { now, expires } = nowAndExpiry();
  const createdUserIds = [];
  for (const user of users) {
    const accountRef = db.doc(`accounts/${user.uid}`);
    const entitlementRef = db.doc(`entitlements/${user.uid}`);
    const [account, entitlement] = await Promise.all([accountRef.get(), entitlementRef.get()]);
    if (account.exists || entitlement.exists) continue;
    const isNewFixture = await createAuthFixtureIfMissing(auth, user);
    if (!isNewFixture) continue;
    createdUserIds.push(user.uid);

    await accountRef.set({
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
    });

    await entitlementRef.set({
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
      }]
    });
  }
  return createdUserIds;
}

async function seedOrganizations(db) {
  const { now } = nowAndExpiry();
  const orgs = [
    {
      orgId: 'civil-engineering',
      name: 'Civil Engineering Department',
      slug: 'civil-engineering-department',
      department: 'Civil Engineering Department',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Civil engineering department organization for student updates and requests.',
      description: 'Civil Engineering Department shares announcements, opportunities, and meeting availability for SOAR users.',
      contactEmail: 'civil.engineering@example.edu',
      contactPhone: '+63 2 8123 4567',
      recruitment: {
        opportunityId: 'civil-engineering-2026',
        title: 'Civil Engineering Opportunities 2026',
        requirements: 'Students interested in civil engineering activities and department opportunities.',
        instructions: 'Open the external form, submit it there, then return to SOAR and explicitly confirm the external submission.',
        applicationLink: 'https://forms.gle/example-civil-engineering'
      }
    },
    {
      orgId: 'architecture',
      name: 'Architecture Department',
      slug: 'architecture-department',
      department: 'Architecture Department',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Architecture department organization for studio announcements and requests.',
      description: 'Architecture Department posts studio opportunities, events, and meeting availability for SOAR users.',
      contactEmail: 'architecture@example.edu',
      contactPhone: '',
      recruitment: {
        opportunityId: 'architecture-2026',
        title: 'Architecture Studio Opportunities',
        requirements: 'Students available for studio events, exhibits, or publication support.',
        instructions: 'Submit the external interest form, then confirm in SOAR so officers know to check the sheet.',
        applicationLink: 'https://forms.gle/example-architecture'
      }
    },
    {
      orgId: 'electrical-engineering',
      name: 'Electrical Engineering Department',
      slug: 'electrical-engineering-department',
      department: 'Electrical Engineering Department',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Electrical engineering department organization for announcements and requests.',
      description: 'Electrical Engineering Department coordinates department opportunities and meeting availability.',
      contactEmail: 'electrical.engineering@example.edu',
      contactPhone: '',
      recruitment: {}
    },
    {
      orgId: 'computer-engineering',
      name: 'Computer Engineering Department',
      slug: 'computer-engineering-department',
      department: 'Computer Engineering Department',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Computer engineering department organization for student makers and builders.',
      description: 'Computer Engineering Department helps students coordinate practical builds, workshops, and department opportunities.',
      contactEmail: 'computer.engineering@example.edu',
      contactPhone: '+63 917 555 0101',
      recruitment: {
        opportunityId: 'computer-engineering-build-team-2026',
        title: 'Build Team 2026',
        requirements: 'Interested students, weekly build availability, and a short external form response.',
        instructions: 'Open the external Google Form, submit it there, then return to SOAR and explicitly confirm the external submission.',
        applicationLink: 'https://forms.gle/example-computer-engineering-build-team'
      }
    },
    {
      orgId: 'mechanical-engineering',
      name: 'Mechanical Engineering Department',
      slug: 'mechanical-engineering-department',
      department: 'Mechanical Engineering Department',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Mechanical engineering department organization for announcements and requests.',
      description: 'Mechanical Engineering Department coordinates department opportunities and meeting availability.',
      contactEmail: 'mechanical.engineering@example.edu',
      contactPhone: '',
      recruitment: {}
    },
    {
      orgId: 'electronics-engineering',
      name: 'Electronics Engineering Department',
      slug: 'electronics-engineering-department',
      department: 'Electronics Engineering Department',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Electronics engineering department organization for announcements and requests.',
      description: 'Electronics Engineering Department coordinates department opportunities and meeting availability.',
      contactEmail: 'electronics.engineering@example.edu',
      contactPhone: '',
      recruitment: {}
    },
    {
      orgId: 'geodetic-engineering',
      name: 'Geodetic Engineering',
      slug: 'geodetic-engineering',
      department: 'Geodetic Engineering',
      ownerUid: 'demo-owner-robotics',
      shortDescription: 'Geodetic Engineering organization for announcements and requests.',
      description: 'Geodetic Engineering coordinates department opportunities and meeting availability.',
      contactEmail: 'geodetic.engineering@example.edu',
      contactPhone: '',
      recruitment: {}
    }
  ];

  for (const org of orgs) {
    await createFixtureIfAbsent(db, `organizations/${org.orgId}`, {
      ...org,
      searchName: org.name.toLowerCase(),
      departmentKey: org.department.toLowerCase(),
      logoPath: '',
      createdAt: now,
      updatedAt: now,
      createdByUid: 'local-emulator-seed'
    });

    await createFixtureIfAbsent(db, `organizations/${org.orgId}/officerGrants/${org.ownerUid}`, {
      uid: org.ownerUid,
      status: 'active',
      grantedByUid: 'local-emulator-seed',
      createdAt: now,
      updatedAt: now
    });
  }

  await createFixtureIfAbsent(db, 'organizations/computer-engineering/officerGrants/demo-officer-robotics', {
    uid: 'demo-officer-robotics',
    status: 'active',
    grantedByUid: 'demo-owner-robotics',
    createdAt: now,
    updatedAt: now
  });
}

async function seedContent(db) {
  const { now } = nowAndExpiry();
  const announcements = [
    ['post-robotics-tryouts', {
      announcementId: 'post-robotics-tryouts',
      orgId: 'computer-engineering',
      organizationName: 'Computer Engineering Department',
      organizationLogoPath: '',
      authorUid: 'demo-officer-robotics',
      body: 'Build team tryouts and lab night are scheduled this Friday. Open the profile for requirements and meeting availability.',
      image: null,
      likeCount: 0,
      commentCount: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }],
    ['post-health-briefing', {
      announcementId: 'post-health-briefing',
      orgId: 'civil-engineering',
      organizationName: 'Civil Engineering Department',
      organizationLogoPath: '',
      authorUid: 'demo-owner-robotics',
      body: 'Department briefing slots are posted. Pending meeting requests are not confirmed until an officer approves them.',
      image: null,
      likeCount: 0,
      commentCount: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    }]
  ];

  for (const [id, data] of announcements) {
    await createFixtureIfAbsent(db, `announcements/${id}`, data);
  }

  const entries = [
    ['date-computer-engineering-build-night', { orgId: 'computer-engineering', organizationName: 'Computer Engineering Department', kind: 'event', title: 'Build Night', date: '2026-11-09', startTime: '18:00', endTime: '', details: 'Open lab night for students interested in computer engineering projects.', createdByUid: 'demo-officer-robotics' }],
    ['date-computer-engineering-interview', { orgId: 'computer-engineering', organizationName: 'Computer Engineering Department', kind: 'availability', title: 'Build Team interview window', date: '2026-11-12', startTime: '14:00', endTime: '16:00', details: 'Request one time during this window after submitting the external form.', createdByUid: 'demo-officer-robotics' }],
    ['date-architecture-open-studio', { orgId: 'architecture', organizationName: 'Architecture Department', kind: 'event', title: 'Open Studio Night', date: '2026-11-10', startTime: '17:30', endTime: '', details: 'Studio interest night and publication planning session.', createdByUid: 'demo-owner-robotics' }],
    ['date-civil-engineering-partner-meeting', { orgId: 'civil-engineering', organizationName: 'Civil Engineering Department', kind: 'availability', title: 'Department meeting slot', date: '2026-11-14', startTime: '09:00', endTime: '11:00', details: 'Sponsors and students can request this discussion slot.', createdByUid: 'demo-owner-robotics' }]
  ];

  for (const [entryId, data] of entries) {
    await createFixtureIfAbsent(db, `calendarEntries/${entryId}`, {
      entryId,
      ...data,
      createdAt: now,
      updatedAt: now
    });
  }
}

async function seedRequests(db) {
  const { now } = nowAndExpiry();
  const applicationId = stableId('app', ['demo-student-1', 'computer-engineering', 'computer-engineering-build-team-2026']);
  await createFixtureIfAbsent(db, `applications/${applicationId}`, {
    applicationId,
    studentUid: 'demo-student-1',
    studentName: 'Mara Santos',
    orgId: 'computer-engineering',
    organizationName: 'Computer Engineering Department',
    opportunityId: 'computer-engineering-build-team-2026',
    opportunityTitle: 'Build Team 2026',
    status: 'Pending',
    externalFormOpenedAt: now,
    externalSubmissionConfirmedAt: now,
    createdAt: now,
    updatedAt: now
  });

  const studentMeetingId = stableId('meeting', ['demo-student-1', 'computer-engineering', 'date-computer-engineering-interview', '2026-11-12', '14:00']);
  await createFixtureIfAbsent(db, `meetingRequests/${studentMeetingId}`, {
    meetingRequestId: studentMeetingId,
    requesterUid: 'demo-student-1',
    requesterName: 'Mara Santos',
    requesterRole: 'student',
    orgId: 'computer-engineering',
    organizationName: 'Computer Engineering Department',
    dateEntryId: 'date-computer-engineering-interview',
    meetingTitle: 'Build Team interview window',
    requestedDate: '2026-11-12',
    requestedTime: '14:00',
    status: 'Pending',
    note: 'Application submitted externally.',
    createdAt: now,
    updatedAt: now
  });

  const sponsorMeetingId = stableId('meeting', ['demo-sponsor-1', 'civil-engineering', 'date-civil-engineering-partner-meeting', '2026-11-14', '09:30']);
  await createFixtureIfAbsent(db, `meetingRequests/${sponsorMeetingId}`, {
    meetingRequestId: sponsorMeetingId,
    requesterUid: 'demo-sponsor-1',
    requesterName: 'Ari Reyes',
    requesterRole: 'sponsor',
    orgId: 'civil-engineering',
    organizationName: 'Civil Engineering Department',
    dateEntryId: 'date-civil-engineering-partner-meeting',
    meetingTitle: 'Department meeting slot',
    requestedDate: '2026-11-14',
    requestedTime: '09:30',
    status: 'Approved',
    note: 'Discuss possible support for wellness materials.',
    createdAt: now,
    updatedAt: now,
    decidedByUid: 'demo-owner-robotics',
    decidedAt: now
  });
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
    { uid: 'demo-student-1', email: 'student@example.test', displayName: 'Mara Santos', role: 'student', studentId: 'S-1001', department: 'Computer Engineering Department' },
    { uid: 'demo-sponsor-1', email: 'sponsor@example.test', displayName: 'Ari Reyes', role: 'sponsor', companyName: 'Allied Demo Co.' },
    { uid: 'demo-owner-robotics', email: 'owner@example.test', displayName: 'Rina Cruz', role: 'student', studentId: 'S-2001', department: 'Civil Engineering Department' },
    { uid: 'demo-officer-robotics', email: 'officer@example.test', displayName: 'Leo Tan', role: 'student', studentId: 'S-2002', department: 'Computer Engineering Department' }
  ];

  const createdUserIds = new Set(await seedAccounts(db, auth, users));
  await seedOrganizations(db);
  await seedContent(db);
  await seedRequests(db);

  console.log('Seeded demo-soar-local Auth and Firestore with emulator-only SOAR demo data.');
  console.log('New fixture accounts use simulated six-month access records, not valid production payment evidence.');
  for (const user of users) {
    const label = `${user.role}${user.uid.includes('officer') || user.uid.includes('owner') ? ', organization manager demo' : ''}`;
    console.log(createdUserIds.has(user.uid)
      ? `- ${user.email} / ${DEMO_PASSWORD} (${label}; newly created)`
      : `- ${user.email} (${label}; existing account preserved, password unchanged)`);
  }
}

module.exports = { createAuthFixtureIfMissing, createFixtureIfAbsent, seedAccounts, seedOrganizations, seedContent, seedRequests };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
