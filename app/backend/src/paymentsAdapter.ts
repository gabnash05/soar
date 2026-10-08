import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, db } from './firebase';
import { createPaidAccountFromConfirmedRegistration } from './identity/registration';

const payments = require('./payments') as any;

interface PaymentHandlerResult {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

interface PaymentRequest extends Request {
  auth?: { uid: string };
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
  paymentRequest.auth = { uid: user.uid };
  return paymentRequest;
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
