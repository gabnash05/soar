import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from '@firebase/auth';
import {
  type AccessEntitlement,
  type CheckoutStatus,
  type EmailChangeInput,
  type NameChangeInput,
  type NameChangeResult,
  type PaymentPolicy,
  type PreviewRegistrationInput,
  type RegisterAccountInput,
  type RegistrationPaymentInput,
  type RegistrationPaymentIntent,
  type RegistrationRecoveryResult,
  type RegistrationResume,
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
  getPaymentPolicy(): Promise<PaymentPolicy>;
  reloadSession(): Promise<UserSession | null>;
  signIn(input: SignInInput): Promise<UserSession>;
  signOut(): Promise<void>;
  sendPasswordRecovery(email: string): Promise<void>;
  startRegistrationPayment(input: RegistrationPaymentInput): Promise<RegistrationPaymentIntent>;
  createRegistrationIdentity(input: { email: string; password: string }): Promise<void>;
  startAuthenticatedRegistrationPayment(input: RegistrationPaymentInput): Promise<RegistrationPaymentIntent>;
  resumePendingRegistration(): Promise<RegistrationResume | null>;
  registerPreviewAccount(input: PreviewRegistrationInput): Promise<UserSession>;
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
  const previewAccess = access.provenance === 'unpaid-preview';
  return {
    status: normalizedStatus,
    provenance: access.provenance,
    annualFeePhp: 10,
    feePhp: access.feePhp ?? (previewAccess ? 0 : 10),
    periodMonths: access.periodMonths ?? (previewAccess ? undefined : 6),
    periodLabel: access.periodLabel ?? (previewAccess ? 'Unpaid preview' : '6 months'),
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

const getCurrentAuthUser = async () => {
  if (!getFirebaseConfigStatus().configured) return null;
  const auth = getFirebaseRuntime().auth;
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
  return auth.currentUser;
};

const createProductionGateway = (): BackendGateway => ({
  mode: 'production',
  label: 'Configured services',

  async getPaymentPolicy() {
    return apiFetch<PaymentPolicy>('/payment-policy');
  },

  async reloadSession() {
    const firebaseStatus = getFirebaseConfigStatus();
    if (!firebaseStatus.configured || !apiBaseUrl()) {
      return null;
    }

    const { auth } = getFirebaseRuntime();
    const user = auth.currentUser;
    if (!user) return null;
    await reload(user);
    await user.getIdToken(true);
    const session = await apiFetch<RawUserSession>('/session', { headers: await authHeaders() });
    return mapSession({ ...session, emailVerified: user.emailVerified });
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

  async createRegistrationIdentity(input) {
    const email = input.email.trim();
    let credential: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>;
    try {
      credential = await createUserWithEmailAndPassword(getFirebaseRuntime().auth, email, input.password);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (code !== 'auth/email-already-in-use') throw error;
      credential = await signInWithEmailAndPassword(getFirebaseRuntime().auth, email, input.password);
    }

    if (credential.user.email?.trim().toLowerCase() !== email.toLowerCase()) {
      throw new UserFacingError('The signed-in email does not match this registration. Sign in with the registration email to continue.');
    }
    if (!credential.user.emailVerified) await sendEmailVerification(credential.user);
  },

  async startAuthenticatedRegistrationPayment(input) {
    return apiFetch<RegistrationPaymentIntent>('/payments/registration/auth-start', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
  },

  async resumePendingRegistration() {
    const result = await apiFetch<{ registration: RegistrationResume | null }>('/payments/registration/resume', {
      headers: await authHeaders(),
    });
    return result.registration;
  },

  async registerPreviewAccount(input: PreviewRegistrationInput) {
    const { auth } = getFirebaseRuntime();
    let credential: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>;
    try {
      credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (code !== 'auth/email-already-in-use') throw error;
      // The Auth user may exist from a previous attempt whose profile write did not finish.
      credential = await signInWithEmailAndPassword(auth, input.email.trim(), input.password);
    }

    await apiFetch('/accounts/preview-registration', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        role: input.role,
        displayName: input.displayName.trim(),
        studentId: input.role === 'student' ? input.studentId?.trim() : undefined,
        department: input.role === 'student' ? input.department : undefined,
        companyName: input.role === 'sponsor' ? input.companyName?.trim() || undefined : undefined,
      }),
    });

    if (!credential.user.emailVerified) await sendEmailVerification(credential.user);
    const session = await apiFetch<RawUserSession>('/session', { headers: await authHeaders() });
    return mapSession({ ...session, emailVerified: credential.user.emailVerified });
  },

  async getCheckoutStatus(intentId) {
    const user = await getCurrentAuthUser();
    if (user?.uid && user.email) {
      try {
        return await apiFetch<CheckoutStatus>(`/payments/registration/auth-status?intentId=${encodeURIComponent(intentId)}`, {
          headers: await authHeaders(),
        });
      } catch (error) {
        if (!(error instanceof Error) || (error as Error & { code?: string }).code !== 'unauthorized_registration') throw error;
      }
    }
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

    if (checkout.authFirst) {
      const user = await getCurrentAuthUser();
      if (!user?.uid || user.email?.trim().toLowerCase() !== input.email.trim().toLowerCase()) {
        throw new UserFacingError('Sign in with the same email used to start this registration before continuing.');
      }
      await apiFetch('/payments/registration/auth-complete', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ intentId: input.intentId }),
      });
      await reload(user);
      await user.getIdToken(true);
      if (!user.emailVerified) await sendEmailVerification(user);
      const session = await apiFetch<RawUserSession>('/session', { headers: await authHeaders() });
      return mapSession({ ...session, emailVerified: user.emailVerified });
    }

    await apiFetch<{ uid: string; completed: boolean; accessExpiresAt?: string }>('/payments/registration/complete', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    const { auth } = getFirebaseRuntime();
    if (!input.password) throw new UserFacingError('Enter a password to finish creating your account.');
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
