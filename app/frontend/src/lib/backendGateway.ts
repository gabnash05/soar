import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from '@firebase/auth';
import {
  type AccessEntitlement,
  type CheckoutStatus,
  type EmailChangeInput,
  type NameChangeInput,
  type NameChangeResult,
  type RegisterAccountInput,
  type RegistrationPaymentInput,
  type RegistrationPaymentIntent,
  type RegistrationRecoveryResult,
  type RenewalCheckoutStatus,
  type RenewalRequest,
  type RenewalRequestInput,
  type SignInInput,
  type UserSession,
} from './contracts';
import { apiBaseUrl, apiFetch, authHeaders } from './apiClient';
import { UserFacingError } from './safeErrors';
import { getFirebaseConfigStatus, getFirebaseRuntime } from './firebase';
import { createFixtureGateway } from './fixtures';

export async function reauthenticateCurrentUser(password: string, expectedUid: string): Promise<void> {
  const { auth } = getFirebaseRuntime();
  const user = auth.currentUser;
  if (!user?.email || user.uid !== expectedUid) {
    throw new UserFacingError('Your sign-in session is unavailable. Sign in again before saving organization changes.');
  }
  if (!user.emailVerified) {
    throw new UserFacingError('Verify your email before approving organization changes.');
  }
  if (!user.providerData.some((provider) => provider.providerId === 'password')) {
    throw new UserFacingError('This account does not use email/password sign-in. Sign in with an email/password account to approve organization changes.');
  }

  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  // Force the next authenticated API request to carry the refreshed recent-auth claim.
  await user.getIdToken(true);
}

export interface BackendGateway {
  readonly mode: 'production' | 'fixture';
  readonly label: string;
  reloadSession(): Promise<UserSession | null>;
  signIn(input: SignInInput): Promise<UserSession>;
  signOut(): Promise<void>;
  sendPasswordRecovery(email: string): Promise<void>;
  startRegistrationPayment(input: RegistrationPaymentInput): Promise<RegistrationPaymentIntent>;
  getCheckoutStatus(intentId: string): Promise<CheckoutStatus>;
  requestPaidRegistrationRecovery(email: string): Promise<RegistrationRecoveryResult>;
  acceptPaidRegistrationRecovery(intentId: string, recoveryCode: string): Promise<void>;
  registerAccount(input: RegisterAccountInput): Promise<UserSession>;
  resendEmailVerification(): Promise<void>;
  requestManualRenewal(input: RenewalRequestInput): Promise<RenewalRequest>;
  getRenewalStatus(renewalId: string): Promise<RenewalCheckoutStatus>;
  getAccessStatus(): Promise<UserSession['access']>;
  updateDisplayName(input: NameChangeInput): Promise<NameChangeResult>;
  requestEmailChange(input: EmailChangeInput): Promise<void>;
}

type RawAccessStatus = AccessEntitlement['status'] | 'none';

type RawAccess = Omit<Partial<AccessEntitlement>, 'status'> & {
  status?: RawAccessStatus;
  active?: boolean;
  accessExpiresAt?: string;
  latestPaymentId?: string | null;
};

const normalizeAccess = (access: RawAccess): AccessEntitlement => {
  const status = access.status === 'none' ? 'missing' : access.status;
  const normalizedStatus = status ?? (access.active ? 'active' : 'missing');
  return {
    status: normalizedStatus,
    annualFeePhp: 10,
    feePhp: access.feePhp ?? 10,
    periodMonths: access.periodMonths ?? 6,
    periodLabel: access.periodLabel ?? '6 months',
    startsAt: access.startsAt,
    expiresAt: access.expiresAt ?? access.accessExpiresAt,
    lastPaymentReference: access.lastPaymentReference ?? access.latestPaymentId ?? undefined,
    renewalAvailable: access.renewalAvailable ?? normalizedStatus !== 'active',
  };
};

type RawUserSession = Omit<UserSession, 'accountKind'> & { accountKind?: string };

const normalizeAccountKind = (accountKind: string | undefined): UserSession['accountKind'] =>
  accountKind === 'admin' ? 'admin' : accountKind === 'sponsor' ? 'sponsor' : 'student';

const mapSession = (session: RawUserSession): UserSession => ({
  ...session,
  accountKind: normalizeAccountKind(session.accountKind),
  access: normalizeAccess(session.access),
  officerGrants: session.officerGrants ?? [],
});

const createProductionGateway = (): BackendGateway => ({
  mode: 'production',
  label: 'Configured services',

  async reloadSession() {
    const firebaseStatus = getFirebaseConfigStatus();
    if (!firebaseStatus.configured || !apiBaseUrl()) {
      return null;
    }

    const { auth } = getFirebaseRuntime();
    if (!auth.currentUser) return null;
    await reload(auth.currentUser);
    const session = await apiFetch<RawUserSession>('/session', { headers: await authHeaders() });
    return mapSession({ ...session, emailVerified: auth.currentUser.emailVerified });
  },

  async signIn(input) {
    const { auth } = getFirebaseRuntime();
    const credential = await signInWithEmailAndPassword(auth, input.email, input.password);
    const session = await apiFetch<RawUserSession>('/session', { headers: await authHeaders() });
    return mapSession({ ...session, emailVerified: credential.user.emailVerified });
  },

  async signOut() {
    const firebaseStatus = getFirebaseConfigStatus();
    if (firebaseStatus.configured) {
      await firebaseSignOut(getFirebaseRuntime().auth);
    }
  },

  async sendPasswordRecovery(email) {
    const { auth } = getFirebaseRuntime();
    await sendPasswordResetEmail(auth, email);
  },

  async startRegistrationPayment(input) {
    return apiFetch<RegistrationPaymentIntent>('/payments/registration/start', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getCheckoutStatus(intentId) {
    return apiFetch<CheckoutStatus>(`/payments/registration/status?intentId=${encodeURIComponent(intentId)}`);
  },

  async requestPaidRegistrationRecovery(email) {
    return apiFetch<RegistrationRecoveryResult>('/payments/registration/recover', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async acceptPaidRegistrationRecovery(intentId, recoveryCode) {
    await apiFetch('/payments/registration/recover/accept', {
      method: 'POST',
      body: JSON.stringify({ intentId, recoveryCode }),
    });
  },

  async registerAccount(input) {
    const checkout = await this.getCheckoutStatus(input.intentId);
    if (!checkout.canCreateAccount) {
      throw new UserFacingError('Payment is not confirmed yet. Account creation remains locked.');
    }

    await apiFetch<{ uid: string; completed: boolean; accessExpiresAt?: string }>('/payments/registration/complete', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    const { auth } = getFirebaseRuntime();
    const credential = await signInWithEmailAndPassword(auth, input.email, input.password);
    await sendEmailVerification(credential.user);
    const session = await apiFetch<RawUserSession>('/session', { headers: await authHeaders() });

    return mapSession({ ...session, emailVerified: credential.user.emailVerified });
  },

  async resendEmailVerification() {
    const { auth } = getFirebaseRuntime();
    if (!auth.currentUser) throw new UserFacingError('Sign in before requesting a verification email.');
    await sendEmailVerification(auth.currentUser);
  },

  async requestManualRenewal(input) {
    return apiFetch<RenewalRequest>('/payments/renewals/start', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
  },

  async getRenewalStatus(renewalId) {
    return apiFetch<RenewalCheckoutStatus>(`/payments/renewals/status?renewalId=${encodeURIComponent(renewalId)}`, {
      headers: await authHeaders(),
    });
  },

  async getAccessStatus() {
    const access = await apiFetch<RawAccess>('/payments/access/status', { headers: await authHeaders() });
    return normalizeAccess(access);
  },

  async updateDisplayName(input) {
    return apiFetch<NameChangeResult>('/account/display-name', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
  },

  async requestEmailChange(input) {
    const { auth } = getFirebaseRuntime();
    if (!auth.currentUser || !auth.currentUser.email) throw new UserFacingError('Sign in before changing email.');
    await apiFetch('/account/email-change', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        newEmail: input.newEmail,
        currentPassword: input.currentPassword,
        continueUrl: window.location.origin,
      }),
    });
  },
});

export const createBackendGateway = (): BackendGateway => {
  if (import.meta.env.VITE_SOAR_USE_FIXTURES === 'true') {
    return createFixtureGateway();
  }
  return createProductionGateway();
};
