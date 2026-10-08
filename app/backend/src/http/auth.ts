import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Request } from 'express';
import { adminAuth } from '../firebase';
import { AppError } from '../errors';

export interface AuthenticatedRequest extends Request {
  user: DecodedIdToken;
}

export async function requireBearerToken(req: Request): Promise<DecodedIdToken> {
  const header = req.header('authorization') ?? req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('unauthenticated', 'Sign in is required for this action.', 401, 'sign_in');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError('unauthenticated', 'Sign in is required for this action.', 401, 'sign_in');
  }

  try {
    return await adminAuth.verifyIdToken(token, true);
  } catch (error) {
    throw new AppError('invalid_token', 'Your session could not be verified. Sign in again.', 401, 'sign_in');
  }
}

export function requireEmailVerified(user: DecodedIdToken): void {
  if (user.email_verified !== true) {
    throw new AppError('email_not_verified', 'Verify your email before using the main app.', 403, 'verify_email');
  }
}

export function requireRecentAuth(user: DecodedIdToken, maxAgeSeconds: number): void {
  const authTime = typeof user.auth_time === 'number' ? user.auth_time : 0;
  const ageSeconds = Math.floor(Date.now() / 1000) - authTime;
  if (ageSeconds > maxAgeSeconds) {
    throw new AppError('recent_login_required', 'Confirm your current password and try again.', 403, 'reauthenticate');
  }
}
