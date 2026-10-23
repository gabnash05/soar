import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { paymentPolicyPath } from '../contracts/paths';
import { AppError } from '../errors';
import { addCalendarMonthsUtc } from '../payments/time';
import { db } from '../firebase';
const paymentPolicyInputSchema = z.object({ paymentsRequired: z.boolean() }).strict();

export type CheckoutReadiness = {
  status: 'disabled' | 'not_configured' | 'configured';
  mode: 'test' | 'live' | null;
};

export interface PaymentPolicyStatus {
  paymentsRequired: boolean;
  checkout: CheckoutReadiness;
}

export interface AdminPaymentPolicyStatus extends PaymentPolicyStatus {
  updatedByUid?: string;
  existingAccountAccessActivatedAt?: string;
}

export interface ExistingAccountAccessWindow {
  activatedAt: Timestamp;
  expiresAt: Timestamp;
}

function paymentsDisabledByDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SOAR_DISABLE_PAYMENTS?.trim().toLowerCase() === 'true';
}

function checkoutReadiness(env: NodeJS.ProcessEnv = process.env): CheckoutReadiness {
  if (paymentsDisabledByDeployment(env)) return { status: 'disabled', mode: null };

  const appBaseUrl = env.SOAR_APP_BASE_URL?.trim() ?? '';
  let validAppBaseUrl = false;
  try {
    const url = new URL(appBaseUrl);
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    validAppBaseUrl = url.protocol === 'https:' || (url.protocol === 'http:' && localHost);
  } catch {
    validAppBaseUrl = false;
  }

  const localHttp = (() => {
    try {
      const url = new URL(appBaseUrl);
      return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch {
      return false;
    }
  })();
  const secureCookiesDisabled = ['0', 'false', 'no'].includes(env.PAYMENT_SECURE_COOKIES?.trim().toLowerCase() ?? '');
  const safeCookieConfiguration = !secureCookiesDisabled || localHttp;
  const configured = Boolean(
    env.PAYMONGO_SECRET_KEY?.trim()
      && env.PAYMONGO_WEBHOOK_SECRET?.trim()
      && env.PAYMENT_SECRET_PEPPER?.trim()
      && validAppBaseUrl
      && safeCookieConfiguration,
  );
  if (!configured) return { status: 'not_configured', mode: null };

  const liveMode = ['1', 'true', 'yes', 'live'].includes(env.PAYMONGO_EXPECTED_LIVEMODE?.trim().toLowerCase() ?? '');
  return { status: 'configured', mode: liveMode ? 'live' : 'test' };
}

async function readStoredPaymentPolicy(): Promise<{
  paymentsRequired: boolean;
  updatedByUid?: string;
  existingAccountAccessActivatedAt?: Timestamp;
  existingAccountAccessExpiresAt?: Timestamp;
}> {
  const snapshot = await db.doc(paymentPolicyPath()).get();
  if (!snapshot.exists) {
    // Provider credentials and deployment settings never opt users into charging; the trusted Admin must persist that choice.
    return { paymentsRequired: false };
  }

  const data = snapshot.data();
  if (typeof data?.paymentsRequired !== 'boolean') {
    throw new AppError('payment_policy_invalid', 'The saved payment policy is invalid. Ask a trusted administrator to review it.', 503);
  }
  const activationAt = data.existingAccountAccessActivatedAt;
  const expiresAt = data.existingAccountAccessExpiresAt;
  if (activationAt !== undefined || expiresAt !== undefined) {
    if (!(activationAt instanceof Timestamp) || !(expiresAt instanceof Timestamp)) {
      throw new AppError('payment_policy_invalid', 'The saved existing-account activation window is invalid. Ask a trusted administrator to review it.', 503);
    }
    const expectedExpiresAt = Timestamp.fromDate(addCalendarMonthsUtc(activationAt.toDate(), 6));
    if (expectedExpiresAt.toMillis() !== expiresAt.toMillis()) {
      throw new AppError('payment_policy_invalid', 'The saved existing-account activation window is invalid. Ask a trusted administrator to review it.', 503);
    }
  }
  return {
    paymentsRequired: data.paymentsRequired,
    ...(typeof data.updatedByUid === 'string' ? { updatedByUid: data.updatedByUid } : {}),
    ...(activationAt instanceof Timestamp ? { existingAccountAccessActivatedAt: activationAt } : {}),
    ...(expiresAt instanceof Timestamp ? { existingAccountAccessExpiresAt: expiresAt } : {}),
  };
}

export async function getPaymentPolicyStatus(): Promise<PaymentPolicyStatus> {
  const policy = await readStoredPaymentPolicy();
  return { paymentsRequired: policy.paymentsRequired, checkout: checkoutReadiness() };
}

export async function getExistingAccountAccessWindow(): Promise<ExistingAccountAccessWindow | undefined> {
  const policy = await readStoredPaymentPolicy();
  if (!policy.existingAccountAccessActivatedAt || !policy.existingAccountAccessExpiresAt) return undefined;
  return { activatedAt: policy.existingAccountAccessActivatedAt, expiresAt: policy.existingAccountAccessExpiresAt };
}

export async function getAdminPaymentPolicyStatus(): Promise<AdminPaymentPolicyStatus> {
  const policy = await readStoredPaymentPolicy();
  return {
    paymentsRequired: policy.paymentsRequired,
    checkout: checkoutReadiness(),
    ...(policy.updatedByUid ? { updatedByUid: policy.updatedByUid } : {}),
    ...(policy.existingAccountAccessActivatedAt
      ? { existingAccountAccessActivatedAt: policy.existingAccountAccessActivatedAt.toDate().toISOString() }
      : {}),
  };
}

export async function setPaymentPolicy(rawInput: unknown, actorUid: string): Promise<AdminPaymentPolicyStatus & { updatedByUid: string }> {
  const input = paymentPolicyInputSchema.parse(rawInput);
  if (!actorUid.trim()) throw new AppError('admin_required', 'A trusted administrator is required to change the payment policy.', 403);

  const ref = db.doc(paymentPolicyPath());
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() : undefined;
    if (snapshot.exists && typeof existing?.paymentsRequired !== 'boolean') {
      throw new AppError('payment_policy_invalid', 'The saved payment policy is invalid. Ask a trusted administrator to review it.', 503);
    }

    const activationAt = existing?.existingAccountAccessActivatedAt;
    const startsExistingAccountAccess = input.paymentsRequired
      && activationAt === undefined
      && existing?.existingAccountAccessExpiresAt === undefined
      && !paymentsDisabledByDeployment()
      && checkoutReadiness().status === 'configured'
      && checkoutReadiness().mode === 'live';
    const activatedAt = startsExistingAccountAccess ? Timestamp.now() : undefined;
    transaction.set(ref, {
      paymentsRequired: input.paymentsRequired,
      updatedByUid: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(activatedAt ? {
        existingAccountAccessActivatedAt: activatedAt,
        existingAccountAccessExpiresAt: Timestamp.fromDate(addCalendarMonthsUtc(activatedAt.toDate(), 6)),
      } : {}),
    }, { merge: true });
  });

  const status = await getAdminPaymentPolicyStatus();
  return { ...status, updatedByUid: actorUid };
}

export async function requirePaymentsForCheckout(): Promise<void> {
  if (paymentsDisabledByDeployment()) {
    throw new AppError('payments_unavailable', 'Hosted checkout is disabled by the server deployment setting.', 503);
  }

  const status = await getPaymentPolicyStatus();
  if (!status.paymentsRequired) {
    throw new AppError('payments_not_required', 'Payment is not required for new SOAR accounts right now.', 409);
  }
  if (status.checkout.status !== 'configured') {
    throw new AppError('payments_not_ready', 'Hosted checkout is not configured in this deployment. No payment or account was created.', 503);
  }
}

export async function isUnpaidAccessEnabled(): Promise<boolean> {
  return !(await getPaymentPolicyStatus()).paymentsRequired;
}

export async function isUnpaidAccessEnabledInTransaction(transaction: Transaction): Promise<boolean> {
  const snapshot = await transaction.get(db.doc(paymentPolicyPath()));
  if (!snapshot.exists) return true;

  const data = snapshot.data();
  if (typeof data?.paymentsRequired !== 'boolean') {
    throw new AppError('payment_policy_invalid', 'The saved payment policy is invalid. Ask a trusted administrator to review it.', 503);
  }
  return !data.paymentsRequired;
}
