import { type AccessEntitlement } from './contracts';
import type { BackendGateway } from './backendGateway';
import {
  type CheckoutStatus,
  type RegisterAccountInput,
  type RegistrationPaymentInput,
  type RegistrationPaymentIntent,
  type RenewalRequest,
  type UserSession,
  ValidationProblemError,
} from './contracts';

// Keep fixture storage names explicit so they cannot be mistaken for production data.
const SESSION_KEY = 'soar:development-fixture:session';
const PAYMENT_PREFIX = 'soar:development-fixture:payment:';
const NAME_CHANGE_PREFIX = 'soar:development-fixture:name-changed:';

const futureIso = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const pastIso = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const activeAccess = (reference = 'fixture-access-reference'): AccessEntitlement => ({
  status: 'active',
  annualFeePhp: 10,
  startsAt: pastIso(5),
  expiresAt: futureIso(360),
  lastPaymentReference: reference,
  renewalAvailable: false,
});

const expiredAccess = (): AccessEntitlement => ({
  status: 'expired',
  annualFeePhp: 10,
  startsAt: pastIso(390),
  expiresAt: pastIso(3),
  lastPaymentReference: 'fixture-expired-reference',
  renewalAvailable: true,
});

const makeFixtureSession = (email: string, overrides: Partial<UserSession> = {}): UserSession => {
  const lower = email.toLowerCase();
  const sponsor = lower.includes('sponsor');
  const officer = lower.includes('officer');
  const expired = lower.includes('expired');
  const unverified = lower.includes('unverified');
  const fixtureUid = lower.includes('sponsor')
    ? 'sponsor-1'
    : lower.includes('officer')
      ? 'officer-1'
      : lower.includes('student')
        ? 'student-1'
        : `fixture-${lower.replace(/[^a-z0-9]+/g, '-')}`;
  return {
    uid: fixtureUid,
    email,
    displayName: sponsor ? 'Sam Sponsor' : officer ? 'Mara Officer' : 'Mara Santos',
    accountKind: sponsor ? 'sponsor' : 'student',
    studentId: sponsor ? undefined : '2026-0001',
    companyName: sponsor ? 'Community Partner Co.' : undefined,
    emailVerified: !unverified,
    access: expired ? expiredAccess() : activeAccess(),
    officerGrants: officer
      ? [
          {
            organizationId: 'robotics',
            organizationName: 'Robotics Guild',
            status: 'active',
            grantedBy: 'project-admin',
            grantedAt: pastIso(20),
          },
        ]
      : [],
    ...overrides,
  };
};

const readSession = (): UserSession | null => {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? (JSON.parse(value) as UserSession) : null;
  } catch {
    return null;
  }
};

const writeSession = (session: UserSession | null) => {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const getPaymentStatus = (intentId: string): CheckoutStatus => {
  const value = sessionStorage.getItem(`${PAYMENT_PREFIX}${intentId}`);
  const active = value === 'active';
  return {
    intentId,
    status: active ? 'active' : 'pending',
    amountPhp: 10,
    providerReference: active ? `fixture-provider-${intentId}` : undefined,
    message: active
      ? 'Confirmed by the named development fixture. Production must use backend provider confirmation.'
      : 'Waiting for provider confirmation. Account creation stays locked until this is confirmed.',
    canCreateAccount: active,
    fixture: true,
  };
};

const validateRegistration = (input: RegisterAccountInput) => {
  const problems: Record<string, string> = {};
  if (!input.displayName.trim()) problems.displayName = 'Enter your full name.';
  if (!input.email.includes('@')) problems.email = 'Enter a valid email address.';
  if (input.password.length < 8) problems.password = 'Use at least 8 characters.';
  if (input.role === 'student' && !input.studentId?.trim()) problems.studentId = 'Student ID is required for students and future officers.';
  if (Object.keys(problems).length) {
    throw new ValidationProblemError('Fix the highlighted fields.', problems);
  }
};

export const markFixturePaymentConfirmedFromUrl = (intentId: string | null, fixtureStatus: string | null) => {
  if (intentId && fixtureStatus === 'confirmed') {
    sessionStorage.setItem(`${PAYMENT_PREFIX}${intentId}`, 'active');
  }
};

export const markFixtureRenewalConfirmedFromUrl = (renewalId: string | null, fixtureStatus: string | null) => {
  if (!renewalId || fixtureStatus !== 'confirmed') return;
  sessionStorage.setItem(`${PAYMENT_PREFIX}${renewalId}`, 'active');
  const session = readSession();
  if (session) {
    writeSession({ ...session, access: activeAccess(`fixture-provider-${renewalId}`) });
  }
};

export const createFixtureGateway = (): BackendGateway => ({
  mode: 'fixture',
  label: 'Development fixture mode',

  async reloadSession() {
    return readSession();
  },

  async signIn(input) {
    if (!input.email.includes('@')) {
      throw new ValidationProblemError('Use one of the named fixture emails.', {
        email: 'Try student@example.edu, officer@example.edu, sponsor@example.com, expired@example.edu, or unverified@example.edu.',
      });
    }
    const session = makeFixtureSession(input.email);
    writeSession(session);
    return session;
  },

  async signOut() {
    writeSession(null);
  },

  async sendPasswordRecovery(email) {
    if (!email.includes('@')) {
      throw new ValidationProblemError('Enter a valid email for the recovery fixture.', { email: 'Email is required.' });
    }
  },

  async startRegistrationPayment(input: RegistrationPaymentInput): Promise<RegistrationPaymentIntent> {
    const id = `fixture-${Date.now().toString(36)}`;
    sessionStorage.setItem(`${PAYMENT_PREFIX}${id}`, 'pending');
    sessionStorage.setItem(
      `${PAYMENT_PREFIX}${id}:intent`,
      JSON.stringify({ role: input.role, email: input.email, displayName: input.displayName, studentId: input.studentId, companyName: input.companyName }),
    );
    return {
      intentId: id,
      checkoutUrl: `/access/checkout?intentId=${encodeURIComponent(id)}&fixtureStatus=confirmed`,
      status: 'pending',
      amountPhp: 10,
      expiresAt: futureIso(1),
      providerLabel: 'Development fixture checkout',
      fixture: true,
    };
  },

  async getCheckoutStatus(intentId) {
    return getPaymentStatus(intentId);
  },

  async registerAccount(input) {
    validateRegistration(input);
    const checkout = getPaymentStatus(input.intentId);
    if (!checkout.canCreateAccount) {
      throw new Error('Fixture payment is still pending. Use the fixture checkout confirmation link before creating an account.');
    }
    const session = makeFixtureSession(input.email, {
      displayName: input.displayName,
      accountKind: input.role,
      studentId: input.role === 'student' ? input.studentId : undefined,
      companyName: input.role === 'sponsor' ? input.companyName : undefined,
      emailVerified: false,
      access: activeAccess(checkout.providerReference),
      officerGrants: [],
    });
    writeSession(session);
    return session;
  },

  async resendEmailVerification() {
    const session = readSession();
    if (!session) throw new Error('Sign in before requesting verification.');
  },

  async requestManualRenewal(): Promise<RenewalRequest> {
    const session = readSession();
    if (!session) throw new Error('Sign in before renewing access.');
    const renewalId = `fixture-renewal-${Date.now().toString(36)}`;
    sessionStorage.setItem(`${PAYMENT_PREFIX}${renewalId}`, 'pending');
    return {
      renewalId,
      checkoutUrl: `/settings/access?renewalId=${encodeURIComponent(renewalId)}&fixtureStatus=confirmed`,
      status: 'pending',
      amountPhp: 10,
      providerLabel: 'Development fixture renewal',
      fixture: true,
    };
  },

  async getAccessStatus() {
    const session = readSession();
    if (!session) throw new Error('Sign in before checking access.');
    return session.access;
  },

  async updateDisplayName(input) {
    const session = readSession();
    if (!session) throw new Error('Sign in before changing your name.');
    const changedAt = localStorage.getItem(`${NAME_CHANGE_PREFIX}${session.uid}`);
    if (changedAt && Date.now() - Number(changedAt) < 30 * 24 * 60 * 60 * 1000) {
      throw new Error('Name changes are limited to once every 30 days.');
    }
    const next = { ...session, displayName: input.displayName.trim() };
    localStorage.setItem(`${NAME_CHANGE_PREFIX}${session.uid}`, String(Date.now()));
    writeSession(next);
    return next;
  },

  async requestEmailChange(input) {
    const session = readSession();
    if (!session) throw new Error('Sign in before changing email.');
    if (!input.newEmail.includes('@')) {
      throw new ValidationProblemError('Enter a valid new email address.', { newEmail: 'Email is invalid.' });
    }
    if (!input.currentPassword) {
      throw new ValidationProblemError('Current password is required.', { currentPassword: 'Enter your current password.' });
    }
  },
});
