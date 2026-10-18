import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { accountPath } from '../contracts/paths';
import { displayNameUpdateSchema, emailChangeSchema } from '../contracts/validation';
import { AppError } from '../errors';
import { adminAuth, db } from '../firebase';
import { requireActiveAccess } from './access';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_LOGIN_SECONDS = 5 * 60;

export async function updateDisplayName(user: DecodedIdToken, body: unknown): Promise<{ displayName: string; nextChangeAllowedAt: string }> {
  await requireActiveAccess(user);
  const { displayName } = displayNameUpdateSchema.parse(body);
  const accountRef = db.doc(accountPath(user.uid));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(accountRef);
    if (!snap.exists) {
      throw new AppError('account_missing', 'The account profile is missing.', 404, 'contact_support');
    }

    const account = snap.data();
    const lastChanged = account?.lastNameChangedAt;
    if (lastChanged instanceof Timestamp) {
      const elapsed = Date.now() - lastChanged.toMillis();
      if (elapsed < THIRTY_DAYS_MS) {
        const nextChangeAllowedAt = new Date(lastChanged.toMillis() + THIRTY_DAYS_MS).toISOString();
        throw new AppError(
          'name_change_cooldown',
          'Name changes are limited to once every 30 days. Please try again later.',
          409,
          undefined,
          nextChangeAllowedAt
        );
      }
    }

    tx.update(accountRef, {
      displayName,
      lastNameChangedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  try {
    await adminAuth.updateUser(user.uid, { displayName });
  } catch (error) {
    console.warn('Account display name changed but Auth profile update failed', { uid: user.uid, error });
  }

  return {
    displayName,
    nextChangeAllowedAt: new Date(Date.now() + THIRTY_DAYS_MS).toISOString()
  };
}

interface FirebaseRestError {
  error?: {
    message?: string;
  };
}

function firebaseRestBaseUrl(): string {
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost) {
    return `http://${emulatorHost}/identitytoolkit.googleapis.com/v1`;
  }

  return 'https://identitytoolkit.googleapis.com/v1';
}

async function callFirebaseAuthRest<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.SOAR_FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    throw new AppError('firebase_web_api_key_missing', 'Email changes require SOAR_FIREBASE_WEB_API_KEY on the backend.', 503, 'configure_backend');
  }

  const response = await fetch(`${firebaseRestBaseUrl()}/${method}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({})) as T & FirebaseRestError;
  if (!response.ok) {
    const message = payload.error?.message ?? 'UNKNOWN_ERROR';
    if (message.includes('INVALID_PASSWORD')) {
      throw new AppError('invalid_current_password', 'The current password is incorrect.', 403);
    }
    if (message.includes('EMAIL_EXISTS')) {
      throw new AppError('email_already_in_use', 'That email address is already in use.', 409);
    }
    if (message.includes('INVALID_ID_TOKEN')) {
      throw new AppError('recent_login_required', 'Confirm your current password and try again.', 403, 'reauthenticate');
    }

    throw new AppError('firebase_auth_rest_error', `Firebase Auth rejected the request: ${message}.`, 502);
  }

  return payload;
}

export async function requestVerifiedEmailChange(user: DecodedIdToken, body: unknown): Promise<{ newEmail: string; verificationSent: true }> {
  await requireActiveAccess(user);
  const { newEmail, currentPassword, continueUrl } = emailChangeSchema.parse(body);
  const authUser = await adminAuth.getUser(user.uid);
  if (!authUser.email) {
    throw new AppError('email_missing', 'The current account email is missing.', 409, 'contact_support');
  }

  if (authUser.email.toLowerCase() === newEmail) {
    throw new AppError('email_unchanged', 'That is already your account email.', 409);
  }

  const signIn = await callFirebaseAuthRest<{ idToken: string }>('accounts:signInWithPassword', {
    email: authUser.email,
    password: currentPassword,
    returnSecureToken: true
  });

  await callFirebaseAuthRest('accounts:sendOobCode', {
    requestType: 'VERIFY_AND_CHANGE_EMAIL',
    idToken: signIn.idToken,
    newEmail,
    continueUrl
  });

  return { newEmail, verificationSent: true };
}

export function assertRecentlyAuthenticated(user: DecodedIdToken): void {
  const authTime = typeof user.auth_time === 'number' ? user.auth_time : 0;
  const ageSeconds = Math.floor(Date.now() / 1000) - authTime;
  if (ageSeconds > RECENT_LOGIN_SECONDS) {
    throw new AppError('recent_login_required', 'Confirm your current password and try again.', 403, 'reauthenticate');
  }
}
