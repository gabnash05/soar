import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, db } from './firebase';
import { createPaidAccountFromConfirmedRegistration } from './identity/registration';
import { getAccessState } from './identity/access';

const payments = require('./payments') as any;

interface PaymentHandlerResult {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

interface PaymentRequest extends Request {
  auth?: { uid: string; email?: string };
  rawBody?: Buffer;
}

function createIdentityAdapter() {
  return {
    async getUserByEmail(email: string) {
      try {
        return await adminAuth.getUserByEmail(email);
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
        if (code === 'auth/user-not-found') {
          return null;
        }
        throw error;
      }
    },
    async getUser(uid: string) {
      try {
        return await adminAuth.getUser(uid);
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
        if (code === 'auth/user-not-found') {
          return null;
        }
        throw error;
      }
    },
    createPaidAccountFromConfirmedRegistration
  };
}

let cachedHandlers: ReturnType<typeof payments.createPaymentsHttpHandlers> | undefined;

function getPaymentHandlers() {
  if (cachedHandlers) {
    return cachedHandlers;
  }

  const config = payments.loadPaymentConfigFromEnv(process.env);
  const repository = new payments.FirestorePaymentRepository(db);
  const provider = new payments.PayMongoCheckoutProvider({ secretKey: config.paymongoSecretKey });
  const rateLimiter = new payments.MemoryRateLimiter(repository);
  const service = new payments.PaymentAccessService({
    repository,
    provider,
    identity: createIdentityAdapter(),
    appBaseUrl: config.appBaseUrl,
    secretPepper: config.secretPepper,
    webhookSecret: config.paymongoWebhookSecret,
    expectedLivemode: config.expectedLivemode,
    rateLimiter,
    toIdentityTimestamp: (date: Date) => Timestamp.fromDate(date)
  });

  cachedHandlers = payments.createPaymentsHttpHandlers(service, { secureCookies: config.secureCookies });
  return cachedHandlers;
}

export function attachAuthToPaymentRequest(req: Request, user: DecodedIdToken): PaymentRequest {
  const paymentRequest = req as PaymentRequest;
  paymentRequest.auth = { uid: user.uid, email: typeof user.email === 'string' ? user.email : undefined };
  return paymentRequest;
}

export async function mergeIdentityAccessStatus(uid: string, resultPromise: Promise<PaymentHandlerResult>): Promise<PaymentHandlerResult> {
  const result = await resultPromise;
  if (result.status < 200 || result.status >= 300 || !result.body || typeof result.body !== 'object') return result;

  const access = await getAccessState(uid);
  const noChargeAccess = access.provenance === 'unpaid-preview' || access.provenance === 'grandfathered-existing-account';
  return {
    ...result,
    body: {
      ...(result.body as Record<string, unknown>),
      status: access.status,
      active: access.status === 'active',
      provenance: access.provenance,
      accessExpiresAt: access.accessExpiresAt?.toDate().toISOString() ?? null,
      startsAt: access.accessStartsAt?.toDate().toISOString(),
      feePhp: noChargeAccess ? 0 : 10,
      periodMonths: access.provenance === 'unpaid-preview' ? undefined : 6,
      periodLabel: access.provenance === 'unpaid-preview'
        ? 'Unpaid preview'
        : access.provenance === 'grandfathered-existing-account' ? 'Existing account access' : '6 months',
    },
  };
}

export async function sendPaymentResult(res: Response, resultPromise: Promise<PaymentHandlerResult>): Promise<void> {
  const result = await resultPromise;
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    res.setHeader(name, value);
  }
  res.status(result.status).json(result.body ?? {});
}

export function paymentHandlers() {
  return getPaymentHandlers();
}
