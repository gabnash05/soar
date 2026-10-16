#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.SOAR_EMULATOR_PROJECT_ID || 'demo-soar-local';
const DEMO_PASSWORD = 'SoarDemo123!';
const ACCESS_MONTHS = 6;
const FIXED_SEED_IDENTITIES = new Map([
  ['demo-student-1', { email: 'student@example.test', role: 'student' }],
  ['demo-sponsor-1', { email: 'sponsor@example.test', role: 'sponsor' }],
  ['demo-owner-robotics', { email: 'owner@example.test', role: 'student' }],
  ['demo-officer-robotics', { email: 'officer@example.test', role: 'student' }]
]);

function fail(message) {
  console.error(`Refusing to seed local SOAR data: ${message}`);
  process.exit(1);
}

function parseHostPort(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  let url;
  try {
    url = new URL(value.includes('://') ? value : `http://${value}`);
  } catch {
    throw new Error(`${label} must be a valid emulator host and port.`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = Number(url.port);
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (!loopback) throw new Error(`${label} must point at loopback.`);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`${label} must include a port.`);
  return { url: `${url.protocol}//${url.host}`, hostname, port };
}

function getLocalSeedEndpoints(env = process.env, projectId = PROJECT_ID) {
  if (projectId === 'soar-a711e') throw new Error('The production Firebase project is never a seed target.');
  if (projectId !== 'demo-soar-local') throw new Error('The seed project must be demo-soar-local.');

  let firebaseConfig;
  try {
    firebaseConfig = env.FIREBASE_CONFIG ? JSON.parse(env.FIREBASE_CONFIG) : undefined;
  } catch {
    throw new Error('FIREBASE_CONFIG must be valid JSON.');
  }
  if (firebaseConfig?.projectId && firebaseConfig.projectId !== projectId) {
    throw new Error('FIREBASE_CONFIG projectId must match the local demo project.');
  }

  return {
    firestore: parseHostPort(env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST'),
    auth: parseHostPort(env.FIREBASE_AUTH_EMULATOR_HOST, 'FIREBASE_AUTH_EMULATOR_HOST')
  };
}

function assertLocalOnly() {
  try {
    return getLocalSeedEndpoints(process.env, PROJECT_ID);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The local emulator target is invalid.');
  }
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

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function assertFixedSeedUsers(users) {
  if (!Array.isArray(users)) throw new Error('Refusing to seed a non-fixed synthetic account set.');
  const seen = new Set();
  for (const user of users) {
    const expected = user && FIXED_SEED_IDENTITIES.get(user.uid);
    if (!expected || normalizeEmail(user.email) !== expected.email || user.role !== expected.role || seen.has(user.uid)) {
      throw new Error('Refusing to seed an identity outside the fixed synthetic account set.');
    }
    seen.add(user.uid);
  }
}

function matchesSeedAccount(account, user) {
  return Boolean(account && account.uid === user.uid && normalizeEmail(account.email) === normalizeEmail(user.email) && account.role === user.role);
}

function matchesSeedEntitlement(entitlement, user) {
  const eventId = `seed-${user.uid}`;
  return Boolean(
    entitlement &&
    entitlement.uid === user.uid &&
    entitlement.provider === 'emulator-simulated' &&
    entitlement.lastProviderEventId === eventId &&
    Array.isArray(entitlement.history) &&
    entitlement.history.some((entry) => entry?.provider === 'emulator-simulated' && entry.providerEventId === eventId)
  );
}

async function createAuthFixtureIfMissing(auth, user) {
  let authUser;
  let created = false;
  try {
    authUser = await auth.getUser(user.uid);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'auth/user-not-found') throw error;
    authUser = await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: DEMO_PASSWORD,
      displayName: user.displayName,
      emailVerified: true,
      disabled: false
    });
    created = true;
  }

  const matches = authUser?.uid === user.uid && normalizeEmail(authUser.email) === normalizeEmail(user.email);
  return { matches, created: matches && created };
}

async function seedAccounts(db, auth, users) {
  assertFixedSeedUsers(users);
  const { now, expires } = nowAndExpiry();
  const createdUserIds = [];
  for (const user of users) {
    const accountRef = db.doc(`accounts/${user.uid}`);
    const entitlementRef = db.doc(`entitlements/${user.uid}`);
    const [accountSnapshot, entitlementSnapshot] = await Promise.all([accountRef.get(), entitlementRef.get()]);
    const existingAccount = accountSnapshot.exists ? accountSnapshot.data() : undefined;
    const existingEntitlement = entitlementSnapshot.exists ? entitlementSnapshot.data() : undefined;
    if (accountSnapshot.exists && !matchesSeedAccount(existingAccount, user)) continue;
    if (entitlementSnapshot.exists && !matchesSeedEntitlement(existingEntitlement, user)) continue;

    const authFixture = await createAuthFixtureIfMissing(auth, user);
    if (!authFixture.matches) continue;

    const account = {
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
    };
    const entitlement = {
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
    };

    const repair = await db.runTransaction(async (transaction) => {
      const [currentAccount, currentEntitlement] = await Promise.all([
        transaction.get(accountRef),
        transaction.get(entitlementRef)
      ]);
      const currentAccountData = currentAccount.exists ? currentAccount.data() : undefined;
      const currentEntitlementData = currentEntitlement.exists ? currentEntitlement.data() : undefined;
      if (currentAccount.exists && !matchesSeedAccount(currentAccountData, user)) return { eligible: false };
      if (currentEntitlement.exists && !matchesSeedEntitlement(currentEntitlementData, user)) return { eligible: false };

      const createAccount = !currentAccount.exists;
      const createEntitlement = !currentEntitlement.exists;
      if (createAccount) transaction.create(accountRef, account);
      if (createEntitlement) transaction.create(entitlementRef, entitlement);
      return { eligible: true, created: createAccount || createEntitlement };
    });

    if (!repair.eligible) continue;
    if (authFixture.created) createdUserIds.push(user.uid);
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
    await db.doc(`organizations/${org.orgId}`).set({
      ...org,
      searchName: org.name.toLowerCase(),
      departmentKey: org.department.toLowerCase(),
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

  await db.doc('organizations/computer-engineering/officerGrants/demo-officer-robotics').set({
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
    await db.doc(`announcements/${id}`).set(data, { merge: true });
  }

  const entries = [
    ['date-computer-engineering-build-night', { orgId: 'computer-engineering', organizationName: 'Computer Engineering Department', kind: 'event', title: 'Build Night', date: '2026-11-09', startTime: '18:00', endTime: '', details: 'Open lab night for students interested in computer engineering projects.', createdByUid: 'demo-officer-robotics' }],
    ['date-computer-engineering-interview', { orgId: 'computer-engineering', organizationName: 'Computer Engineering Department', kind: 'availability', title: 'Build Team interview window', date: '2026-11-12', startTime: '14:00', endTime: '16:00', details: 'Request one time during this window after submitting the external form.', createdByUid: 'demo-officer-robotics' }],
    ['date-architecture-open-studio', { orgId: 'architecture', organizationName: 'Architecture Department', kind: 'event', title: 'Open Studio Night', date: '2026-11-10', startTime: '17:30', endTime: '', details: 'Studio interest night and publication planning session.', createdByUid: 'demo-owner-robotics' }],
    ['date-civil-engineering-partner-meeting', { orgId: 'civil-engineering', organizationName: 'Civil Engineering Department', kind: 'availability', title: 'Department meeting slot', date: '2026-11-14', startTime: '09:00', endTime: '11:00', details: 'Sponsors and students can request this discussion slot.', createdByUid: 'demo-owner-robotics' }]
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
  const applicationId = stableId('app', ['demo-student-1', 'computer-engineering', 'computer-engineering-build-team-2026']);
  await db.doc(`applications/${applicationId}`).set({
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
  }, { merge: true });

  const studentMeetingId = stableId('meeting', ['demo-student-1', 'computer-engineering', 'date-computer-engineering-interview', '2026-11-12', '14:00']);
  await db.doc(`meetingRequests/${studentMeetingId}`).set({
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
  }, { merge: true });

  const sponsorMeetingId = stableId('meeting', ['demo-sponsor-1', 'civil-engineering', 'date-civil-engineering-partner-meeting', '2026-11-14', '09:30']);
  await db.doc(`meetingRequests/${sponsorMeetingId}`).set({
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

module.exports = { createAuthFixtureIfMissing, getLocalSeedEndpoints, seedAccounts };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
