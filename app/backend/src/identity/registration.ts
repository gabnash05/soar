import { randomUUID, createHash } from 'node:crypto';
import type { UserRecord } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { accountPath, entitlementPath, entitlementProviderEventPath } from '../contracts/paths';
import { normalizeDepartmentKey, paidRegistrationCompletionSchema } from '../contracts/validation';
import type { PaidRegistrationCompletionInput, PaidRegistrationCompletionResult } from '../contracts/schema';
import { AppError } from '../errors';
import { adminAuth, db } from '../firebase';

const PROCESSING_LOCK_MS = 10 * 60 * 1000;

function eventKey(provider: string, providerEventId: string): string {
  return createHash('sha256').update(`${provider}:${providerEventId}`).digest('hex');
}

async function claimProviderEvent(input: PaidRegistrationCompletionInput): Promise<{ key: string; lockId: string; alreadyProcessedUid?: string }> {
  const key = eventKey(input.entitlement.provider, input.entitlement.providerEventId);
  const lockId = randomUUID();
  const ref = db.doc(entitlementProviderEventPath(key));

  const alreadyProcessedUid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    if (snap.exists) {
      const event = snap.data();
      if (event?.status === 'completed' && typeof event.uid === 'string') {
        return event.uid as string;
      }

      const lockedAt = event?.lockedAt;
      const lockedAtMs = lockedAt instanceof Timestamp ? lockedAt.toMillis() : 0;
      if (lockedAtMs > Date.now() - PROCESSING_LOCK_MS) {
        throw new AppError('registration_processing', 'This payment confirmation is already being processed. Retry shortly.', 409, 'retry');
      }

      tx.update(ref, {
        status: 'processing',
        lockId,
        lockedAt: now,
        updatedAt: now,
        attempts: FieldValue.increment(1)
      });
      return undefined;
    }

    tx.create(ref, {
      status: 'processing',
      lockId,
      provider: input.entitlement.provider,
      providerEventId: input.entitlement.providerEventId,
      intentId: input.entitlement.intentId,
      email: input.email,
      lockedAt: now,
      createdAt: now,
      updatedAt: now,
      attempts: 1
    });
    return undefined;
  });

  return { key, lockId, alreadyProcessedUid };
}

async function getOrCreateAuthUser(input: PaidRegistrationCompletionInput): Promise<UserRecord> {
  try {
    return await adminAuth.getUserByEmail(input.email);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code !== 'auth/user-not-found') {
      throw error;
    }
  }

  return adminAuth.createUser({
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    emailVerified: false,
    disabled: false
  });
}

export async function createPaidAccountFromConfirmedRegistration(rawInput: PaidRegistrationCompletionInput): Promise<PaidRegistrationCompletionResult> {
  const input = paidRegistrationCompletionSchema.parse(rawInput);
  const { key, lockId, alreadyProcessedUid } = await claimProviderEvent(input);
  if (alreadyProcessedUid) {
    return { uid: alreadyProcessedUid, alreadyProcessed: true };
  }

  const authUser = await getOrCreateAuthUser(input);
  const eventRef = db.doc(entitlementProviderEventPath(key));
  const accountRef = db.doc(accountPath(authUser.uid));
  const entitlementRef = db.doc(entitlementPath(authUser.uid));

  await db.runTransaction(async (tx) => {
    const [eventSnap, accountSnap] = await Promise.all([tx.get(eventRef), tx.get(accountRef)]);
    const event = eventSnap.data();
    if (event?.status === 'completed') {
      return;
    }

    if (event?.lockId !== lockId) {
      throw new AppError('registration_lock_lost', 'Payment confirmation processing was taken over. Retry shortly.', 409, 'retry');
    }

    if (accountSnap.exists) {
      const account = accountSnap.data();
      if (account?.email !== input.email || account?.role !== input.role) {
        throw new AppError('account_conflict', 'An existing account conflicts with this paid registration.', 409, 'contact_support');
      }
    }

    const now = Timestamp.now();
    tx.set(accountRef, {
      uid: authUser.uid,
      role: input.role,
      displayName: input.displayName,
      email: input.email,
      emailVerified: authUser.emailVerified,
      ...(input.role === 'student' ? {
        studentId: input.studentId,
        ...(input.department ? { department: input.department, departmentKey: input.departmentKey ?? normalizeDepartmentKey(input.department) } : {})
      } : {}),
      ...(input.role === 'sponsor' && input.companyName ? { companyName: input.companyName } : {}),
      createdAt: accountSnap.exists ? accountSnap.data()?.createdAt ?? now : now,
      updatedAt: now
    }, { merge: true });

    const historyEntry = {
      provider: input.entitlement.provider,
      providerEventId: input.entitlement.providerEventId,
      intentId: input.entitlement.intentId,
      accessExpiresAt: input.entitlement.accessExpiresAt,
      amount: input.entitlement.amount,
      recordedAt: now
    };

    tx.set(entitlementRef, {
      uid: authUser.uid,
      status: 'active',
      accessExpiresAt: input.entitlement.accessExpiresAt,
      provider: input.entitlement.provider,
      lastProviderEventId: input.entitlement.providerEventId,
      history: FieldValue.arrayUnion(historyEntry),
      createdAt: now,
      updatedAt: now
    }, { merge: true });

    tx.update(eventRef, {
      status: 'completed',
      uid: authUser.uid,
      completedAt: now,
      updatedAt: now
    });
  });

  return { uid: authUser.uid, alreadyProcessed: false };
}
