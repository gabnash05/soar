import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { accountPath, organizationPath, officerGrantPath } from '../contracts/paths';
import { createOfficerGrantSchema, createOrganizationSchema } from '../contracts/validation';
import { AppError } from '../errors';
import { db } from '../firebase';
import { requireActiveAccess } from '../identity/access';

async function assertOrganizationOwner(orgId: string, uid: string): Promise<void> {
  const orgSnap = await db.doc(organizationPath(orgId)).get();
  if (!orgSnap.exists) {
    throw new AppError('organization_missing', 'The organization was not found.', 404);
  }

  if (orgSnap.data()?.ownerUid !== uid) {
    throw new AppError('not_organization_owner', 'Only the assigned organization owner can manage officer grants.', 403);
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
      ownerUid: input.ownerUid,
      shortDescription: input.shortDescription ?? '',
      description: input.description ?? '',
      contactEmail: input.contactEmail ?? '',
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
