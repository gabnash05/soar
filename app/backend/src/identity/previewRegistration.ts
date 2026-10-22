import type { DecodedIdToken } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { accountPath } from '../contracts/paths';
import { normalizeDepartmentKey, previewRegistrationSchema } from '../contracts/validation';
import type { AccountDocument } from '../contracts/schema';
import { AppError } from '../errors';
import { adminAuth, db } from '../firebase';
import { isUnpaidAccessEnabled } from './paymentPolicy';

export interface PreviewRegistrationResult {
  uid: string;
  created: boolean;
  access: {
    status: 'active';
    provenance: 'unpaid-preview';
  };
}

function samePreviewProfile(existing: AccountDocument, input: ReturnType<typeof previewRegistrationSchema.parse>, email: string): boolean {
  return existing.accessProvenance === 'unpaid-preview'
    && existing.uid.length > 0
    && existing.email.toLowerCase() === email
    && existing.role === input.role
    && existing.displayName === input.displayName
    && (existing.studentId ?? undefined) === (input.studentId ?? undefined)
    && (existing.department ?? undefined) === (input.department ?? undefined)
    && (existing.departmentKey ?? undefined) === (input.department ? normalizeDepartmentKey(input.department) : undefined)
    && (existing.companyName ?? undefined) === (input.companyName ?? undefined);
}

export async function createUnpaidPreviewAccount(user: DecodedIdToken, rawInput: unknown): Promise<PreviewRegistrationResult> {
  if (!(await isUnpaidAccessEnabled())) {
    throw new AppError('preview_registration_unavailable', 'Free account creation is unavailable while SOAR requires payment.', 503);
  }
  if (user.soarAdmin === true) {
    throw new AppError('public_registration_forbidden', 'This account cannot use public registration.', 403);
  }

  const input = previewRegistrationSchema.parse(rawInput);
  const authUser = await adminAuth.getUser(user.uid);
  if (authUser.disabled || authUser.customClaims?.soarAdmin === true) {
    throw new AppError('public_registration_forbidden', 'This account cannot use public registration.', 403);
  }

  const email = authUser.email?.trim().toLowerCase();
  if (!email || !user.email || user.email.trim().toLowerCase() !== email) {
    throw new AppError('registration_identity_mismatch', 'Sign in again with the email address for this account.', 403);
  }

  const ref = db.doc(accountPath(user.uid));
  const now = Timestamp.now();
  const account: Omit<AccountDocument, 'lastNameChangedAt'> = {
    uid: user.uid,
    role: input.role,
    displayName: input.displayName,
    email,
    emailVerified: authUser.emailVerified,
    ...(input.role === 'student' ? {
      studentId: input.studentId,
      ...(input.department ? {
        department: input.department,
        departmentKey: normalizeDepartmentKey(input.department),
      } : {}),
    } : {}),
    ...(input.role === 'sponsor' && input.companyName ? { companyName: input.companyName } : {}),
    accessProvenance: 'unpaid-preview',
    previewAccessGrantedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const created = await db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(ref);
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() as AccountDocument;
      if (existing.uid === user.uid && samePreviewProfile(existing, input, email)) return false;
      throw new AppError('account_already_exists', 'This account already has a profile. Sign in to continue.', 409);
    }

    transaction.create(ref, account);
    return true;
  });

  return {
    uid: user.uid,
    created,
    access: {
      status: 'active',
      provenance: 'unpaid-preview',
    },
  };
}
