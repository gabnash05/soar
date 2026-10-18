import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { accountPath, COLLECTIONS, organizationPath, officerGrantPath } from '../contracts/paths';
import { z } from 'zod';
import { createOfficerGrantSchema, createOrganizationSchema, normalizeDepartmentKey } from '../contracts/validation';
import { normalizedName, organizationListQuerySchema } from '../content/validation';
import { AppError } from '../errors';
import { adminAuth, db } from '../firebase';
import { requireActiveAccess } from '../identity/access';
import { decodeCursor, encodeCursor } from '../pagination';

async function assertOrganizationOwner(orgId: string, uid: string): Promise<void> {
  const orgSnap = await db.doc(organizationPath(orgId)).get();
  if (!orgSnap.exists) {
    throw new AppError('organization_missing', 'The organization was not found.', 404);
  }

  if (orgSnap.data()?.ownerUid !== uid) {
    throw new AppError('not_organization_owner', 'Only the assigned organization owner can manage officer grants.', 403);
  }
}

async function getAuthUser(uid: string) {
  try {
    return await adminAuth.getUser(uid);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code === 'auth/user-not-found') return undefined;
    throw error;
  }
}

async function assertStudentAccount(uid: string): Promise<void> {
  const accountSnap = await db.doc(accountPath(uid)).get();
  if (!accountSnap.exists) {
    throw new AppError('target_account_missing', 'The selected account was not found.', 404);
  }

  if (accountSnap.data()?.role !== 'student') {
    throw new AppError('target_not_student', 'Only student accounts can receive organization officer access.', 409);
  }

  const authUser = await getAuthUser(uid);
  if (!authUser) {
    throw new AppError('target_account_missing', 'The selected account was not found.', 404);
  }
  if (authUser.customClaims?.soarAdmin === true) {
    throw new AppError('target_not_student', 'Admin accounts cannot receive student officer access.', 409);
  }
}

export async function assignInitialOrganizationOwner(rawInput: unknown, actorUid: string): Promise<{ orgId: string }> {
  const input = createOrganizationSchema.parse(rawInput);
  await assertStudentAccount(input.ownerUid);
  const orgRef = db.doc(organizationPath(input.orgId));
  const grantRef = db.doc(officerGrantPath(input.orgId, input.ownerUid));

  await db.runTransaction(async (tx) => {
    const orgSnap = await tx.get(orgRef);
    if (orgSnap.exists) {
      throw new AppError('organization_exists', 'That organization already exists.', 409);
    }

    const now = Timestamp.now();
    tx.create(orgRef, {
      orgId: input.orgId,
      name: input.name,
      slug: input.slug,
      searchName: normalizedName(input.name),
      ownerUid: input.ownerUid,
      shortDescription: input.shortDescription ?? '',
      description: input.description ?? '',
      contactEmail: input.contactEmail ?? '',
      contactPhone: input.contactPhone ?? '',
      department: input.department ?? '',
      departmentKey: input.department ? normalizeDepartmentKey(input.department) : '',
      logoPath: input.logoPath ?? '',
      recruitment: input.recruitment ?? {},
      createdAt: now,
      updatedAt: now,
      createdByUid: actorUid
    });

    tx.create(grantRef, {
      uid: input.ownerUid,
      status: 'active',
      grantedByUid: actorUid,
      createdAt: now,
      updatedAt: now
    });
  });

  return { orgId: input.orgId };
}

export async function approveOfficerGrant(actor: DecodedIdToken, orgId: string, body: unknown): Promise<{ orgId: string; uid: string; status: 'approved' }> {
  await requireActiveAccess(actor);
  await assertOrganizationOwner(orgId, actor.uid);
  const input = createOfficerGrantSchema.parse(body);
  await assertStudentAccount(input.uid);
  if (input.uid === actor.uid) {
    throw new AppError('owner_already_granted', 'The organization owner already has access.', 409);
  }

  await db.doc(officerGrantPath(orgId, input.uid)).set({
    uid: input.uid,
    status: 'active',
    grantedByUid: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { orgId, uid: input.uid, status: 'approved' };
}

const adminStudentSearchSchema = z.object({
  q: z.string().trim().min(2).max(80),
  pageToken: z.string().min(1).max(128).refine((value) => !value.includes('/')).optional()
});

export async function listAdminOrganizations(rawQuery: unknown): Promise<{
  items: Array<{ id: string; name: string }>;
  nextPageToken?: string;
}> {
  const query = organizationListQuerySchema.parse(rawQuery);
  const boundary = decodeCursor(query.pageToken, 'admin-organizations', '', 2);
  let ref = db.collection(COLLECTIONS.organizations).orderBy('name').orderBy(FieldPath.documentId());
  if (boundary) ref = ref.startAfter(boundary[0], boundary[1]);
  const snap = await ref.limit(query.limit + 1).get();
  const docs = snap.docs.slice(0, query.limit);
  const last = docs.at(-1);
  return {
    items: docs.map((doc) => ({
      id: typeof doc.data().orgId === 'string' ? doc.data().orgId : doc.id,
      name: typeof doc.data().name === 'string' ? doc.data().name : 'Organization'
    })),
    ...(snap.docs.length > query.limit && last ? { nextPageToken: encodeCursor('admin-organizations', '', [String(last.data().name ?? ''), last.id]) } : {})
  };
}

const adminOfficerListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
  pageToken: z.string().min(1).max(128).refine((value) => !value.includes('/')).optional()
});

export async function listAdminOfficerGrants(orgId: string, rawQuery: unknown): Promise<{
  items: Array<{ uid: string; displayName: string; status: 'active' | 'revoked'; isOrganizationOwner: boolean }>;
  nextPageToken?: string;
}> {
  if (!/^[A-Za-z0-9_-]{2,128}$/.test(orgId)) {
    throw new AppError('invalid_organization_id', 'The organization id is invalid.', 400);
  }
  const query = adminOfficerListSchema.parse(rawQuery);
  const organization = await db.doc(organizationPath(orgId)).get();
  if (!organization.exists) throw new AppError('organization_missing', 'The organization was not found.', 404);
  const boundary = decodeCursor(query.pageToken, 'admin-officers', orgId, 1);
  let ref = db.collection(`${organizationPath(orgId)}/${COLLECTIONS.officerGrants}`).orderBy(FieldPath.documentId());
  if (boundary) ref = ref.startAfter(boundary[0]);
  const snap = await ref.limit(query.limit + 1).get();
  const docs = snap.docs.slice(0, query.limit);
  const orgOwnerUid = organization.data()?.ownerUid;
  const items = await Promise.all(docs.map(async (doc) => {
    const grant = doc.data();
    if (grant.uid !== doc.id || (grant.status !== 'active' && grant.status !== 'revoked')) {
      throw new AppError('invalid_officer_grant', 'An officer grant has an invalid organization-scoped identity.', 409);
    }
    const account = await db.doc(accountPath(doc.id)).get();
    const displayName = typeof account.data()?.displayName === 'string' ? account.data()?.displayName as string : 'Unknown student';
    return { uid: doc.id, displayName, status: grant.status, isOrganizationOwner: doc.id === orgOwnerUid };
  }));
  const last = docs.at(-1);
  return {
    items,
    ...(snap.docs.length > query.limit && last ? { nextPageToken: encodeCursor('admin-officers', orgId, [last.id]) } : {})
  };
}

export async function revokeAdminOfficerGrant(orgId: string, uid: string, actorUid: string): Promise<{
  orgId: string;
  uid: string;
  status: 'revoked';
  alreadyRevoked: boolean;
}> {
  if (!/^[A-Za-z0-9_-]{2,128}$/.test(orgId) || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new AppError('invalid_officer_identity', 'The organization or officer identity is invalid.', 400);
  }
  const orgRef = db.doc(organizationPath(orgId));
  const grantRef = db.doc(officerGrantPath(orgId, uid));
  let alreadyRevoked = false;
  await db.runTransaction(async (tx) => {
    alreadyRevoked = false;
    const [organization, grant] = await Promise.all([tx.get(orgRef), tx.get(grantRef)]);
    if (!organization.exists) throw new AppError('organization_missing', 'The organization was not found.', 404);
    if (organization.data()?.deletionStatus === 'deleting') {
      throw new AppError('organization_deleting', 'This organization is being deleted and its grants cannot be changed.', 409);
    }
    if (organization.data()?.ownerUid === uid) {
      throw new AppError('organization_owner_cannot_be_revoked', 'The organization owner cannot be revoked as an officer grant.', 409);
    }
    if (!grant.exists) {
      alreadyRevoked = true;
      return;
    }
    const grantData = grant.data();
    if (grantData?.uid !== uid) {
      throw new AppError('invalid_officer_grant', 'The officer grant identity does not match this organization and account.', 409);
    }
    if (grantData.status === 'revoked') {
      alreadyRevoked = true;
      return;
    }
    if (grantData.status !== 'active') {
      throw new AppError('invalid_officer_grant', 'The officer grant has an unsupported status.', 409);
    }
    tx.update(grantRef, {
      status: 'revoked',
      revokedByUid: actorUid,
      revokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { orgId, uid, status: 'revoked', alreadyRevoked };
}

export async function searchAdminStudents(rawQuery: unknown): Promise<{
  items: Array<{ uid: string; displayName: string; studentId?: string }>;
  nextPageToken?: string;
}> {
  const query = adminStudentSearchSchema.parse(rawQuery);
  const search = normalizedName(query.q);
  let accountQuery = db.collection(COLLECTIONS.accounts)
    .where('role', '==', 'student')
    .orderBy(FieldPath.documentId());
  if (query.pageToken) accountQuery = accountQuery.startAfter(query.pageToken);
  const snap = await accountQuery.limit(101).get();
  const scannedDocs = snap.docs.slice(0, 100);
  const matchingAccounts: Array<{ uid: string; displayName: string; studentId?: string }> = [];
  for (const doc of scannedDocs) {
    const account = doc.data();
    const displayName = typeof account.displayName === 'string' ? account.displayName : '';
    const studentId = typeof account.studentId === 'string' && account.studentId.trim() ? account.studentId.trim() : undefined;
    const matchesName = normalizedName(displayName).includes(search);
    const matchesStudentId = studentId?.toLocaleLowerCase().includes(search) ?? false;
    if (!matchesName && !matchesStudentId) continue;

    const authUser = await getAuthUser(doc.id);
    if (!authUser || authUser.customClaims?.soarAdmin === true) continue;
    matchingAccounts.push({ uid: doc.id, displayName, ...(studentId ? { studentId } : {}) });
    if (matchingAccounts.length > 20) break;
  }
  const items = matchingAccounts.slice(0, 20);
  const nextCursor = matchingAccounts.length > 20
    ? items[items.length - 1]?.uid
    : snap.docs.length > 100
      ? scannedDocs[scannedDocs.length - 1]?.id
      : undefined;

  return { items, ...(nextCursor ? { nextPageToken: nextCursor } : {}) };
}

export async function assignAdminOfficerGrant(orgId: string, rawBody: unknown, actorUid: string): Promise<{
  orgId: string;
  uid: string;
  status: 'approved';
  alreadyAssigned: boolean;
}> {
  if (!/^[A-Za-z0-9_-]{2,128}$/.test(orgId)) {
    throw new AppError('invalid_organization_id', 'The organization id is invalid.', 400);
  }
  const input = createOfficerGrantSchema.parse(rawBody);
  const authUser = await getAuthUser(input.uid);
  if (!authUser) {
    throw new AppError('target_account_missing', 'The selected account was not found.', 404);
  }
  if (authUser.customClaims?.soarAdmin === true) {
    throw new AppError('target_not_student', 'Admin accounts cannot receive student officer access.', 409);
  }
  const orgRef = db.doc(organizationPath(orgId));
  const accountRef = db.doc(accountPath(input.uid));
  const grantRef = db.doc(officerGrantPath(orgId, input.uid));
  const now = Timestamp.now();
  let alreadyAssigned = false;

  await db.runTransaction(async (tx) => {
    alreadyAssigned = false;
    const [organization, account, grant] = await Promise.all([
      tx.get(orgRef),
      tx.get(accountRef),
      tx.get(grantRef)
    ]);
    if (!organization.exists) {
      throw new AppError('organization_missing', 'The organization was not found.', 404);
    }
    if (!account.exists) {
      throw new AppError('target_account_missing', 'The selected account was not found.', 404);
    }
    if (account.data()?.role !== 'student') {
      throw new AppError('target_not_student', 'Only student accounts can receive organization officer access.', 409);
    }
    if (grant.exists && grant.data()?.status === 'active') {
      alreadyAssigned = true;
      return;
    }

    tx.set(grantRef, {
      uid: input.uid,
      status: 'active',
      grantedByUid: actorUid,
      ...(!grant.exists ? { createdAt: now } : {}),
      updatedAt: now
    }, { merge: true });
  });

  return { orgId, uid: input.uid, status: 'approved', alreadyAssigned };
}

export async function revokeOfficerGrant(actor: DecodedIdToken, orgId: string, uid: string): Promise<{ orgId: string; uid: string; status: 'revoked' }> {
  await requireActiveAccess(actor);
  await assertOrganizationOwner(orgId, actor.uid);
  if (uid === actor.uid) {
    throw new AppError('cannot_revoke_owner', 'The assigned owner cannot revoke their own owner access.', 409);
  }

  const grantRef = db.doc(officerGrantPath(orgId, uid));
  const grantSnap = await grantRef.get();
  if (!grantSnap.exists) {
    throw new AppError('grant_missing', 'The officer grant was not found.', 404);
  }

  await grantRef.update({
    status: 'revoked',
    revokedByUid: actor.uid,
    revokedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return { orgId, uid, status: 'revoked' };
}
