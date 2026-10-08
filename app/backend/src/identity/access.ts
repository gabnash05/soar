import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Timestamp } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from '../firebase';
import { AppError } from '../errors';
import { accountPath, COLLECTIONS, entitlementPath } from '../contracts/paths';
import type { AccountDocument, EntitlementDocument } from '../contracts/schema';

export interface AccessState {
  status: 'active' | 'expired' | 'missing' | 'revoked';
  accessExpiresAt?: Timestamp;
}

export async function getAccessState(uid: string): Promise<AccessState> {
  const snap = await db.doc(entitlementPath(uid)).get();
  if (!snap.exists) {
    return { status: 'missing' };
  }

  const entitlement = snap.data() as EntitlementDocument;
  if (entitlement.status !== 'active') {
    return { status: entitlement.status };
  }

  if (entitlement.accessExpiresAt.toMillis() <= Date.now()) {
    return { status: 'expired', accessExpiresAt: entitlement.accessExpiresAt };
  }

  return { status: 'active', accessExpiresAt: entitlement.accessExpiresAt };
}

export async function requireActiveAccess(user: DecodedIdToken): Promise<void> {
  if (user.email_verified !== true) {
    throw new AppError('email_not_verified', 'Verify your email before using the main app.', 403, 'verify_email');
  }

  const access = await getAccessState(user.uid);
  if (access.status !== 'active') {
    throw new AppError('access_inactive', 'Renew annual access before using the main app.', 403, 'renew_access');
  }
}

export async function loadAccount(uid: string): Promise<AccountDocument> {
  const snap = await db.doc(accountPath(uid)).get();
  if (!snap.exists) {
    throw new AppError('account_missing', 'The account profile is missing.', 404, 'contact_support');
  }

  return snap.data() as AccountDocument;
}

export async function syncVerifiedAuthEmail(uid: string): Promise<AccountDocument> {
  const [authUser, account] = await Promise.all([adminAuth.getUser(uid), loadAccount(uid)]);
  if (authUser.emailVerified && authUser.email && authUser.email !== account.email) {
    await db.doc(accountPath(uid)).update({
      email: authUser.email.toLowerCase(),
      emailVerified: true,
      updatedAt: FieldValue.serverTimestamp()
    });

    return {
      ...account,
      email: authUser.email.toLowerCase(),
      emailVerified: true
    };
  }

  if (authUser.emailVerified !== account.emailVerified) {
    await db.doc(accountPath(uid)).update({
      emailVerified: authUser.emailVerified,
      updatedAt: FieldValue.serverTimestamp()
    });

    return {
      ...account,
      emailVerified: authUser.emailVerified
    };
  }

  return account;
}

export async function listApprovedOfficerGrants(uid: string): Promise<Array<{ organizationId: string; organizationName: string; status: 'approved'; grantedBy?: string; grantedAt?: string }>> {
  const grants = await db.collectionGroup(COLLECTIONS.officerGrants)
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .get();

  const results = await Promise.all(grants.docs.map(async (grantDoc) => {
    const orgRef = grantDoc.ref.parent.parent;
    const orgSnap = orgRef ? await orgRef.get() : undefined;
    const grant = grantDoc.data();
    const organization = orgSnap?.data();

    return {
      organizationId: orgRef?.id ?? '',
      organizationName: organization?.name ?? 'Organization',
      status: 'approved' as const,
      grantedBy: grant.grantedByUid,
      grantedAt: typeof grant.createdAt?.toDate === 'function' ? grant.createdAt.toDate().toISOString() : undefined
    };
  }));

  return results.filter((grant) => grant.organizationId.length > 0);
}
