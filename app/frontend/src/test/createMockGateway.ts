import type { BackendGateway } from '../lib/backendGateway';
import type { CheckoutStatus, RegistrationPaymentIntent, RenewalRequest, UserSession } from '../lib/contracts';

export const makeSession = (overrides: Partial<UserSession> = {}): UserSession => ({
  uid: 'test-uid',
  email: 'mara@example.edu',
  displayName: 'Mara Santos',
  accountKind: 'student',
  studentId: '2026-0001',
  department: 'Computer Engineering Department',
  departmentKey: 'computer engineering department',
  emailVerified: true,
  access: {
    status: 'active',
    annualFeePhp: 10,
    feePhp: 10,
    periodMonths: 6,
    periodLabel: '6 months',
    startsAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    renewalAvailable: false,
  },
  officerGrants: [],
  ...overrides,
});

export const createMockGateway = (session: UserSession | null = makeSession()): BackendGateway => ({
  mode: 'fixture',
  label: 'Test gateway',
  reloadSession: vi.fn(async () => session),
  signIn: vi.fn(async () => session ?? makeSession()),
  signOut: vi.fn(async () => undefined),
  sendPasswordRecovery: vi.fn(async () => undefined),
  startRegistrationPayment: vi.fn(async (): Promise<RegistrationPaymentIntent> => ({
    intentId: 'test-intent',
    checkoutUrl: '/access/checkout?intentId=test-intent',
    status: 'pending',
    amountPhp: 10,
    expiresAt: '2026-01-02T00:00:00.000Z',
    providerLabel: 'Test checkout',
    fixture: true,
  })),
  getCheckoutStatus: vi.fn(async (): Promise<CheckoutStatus> => ({
    intentId: 'test-intent',
    status: 'active',
    amountPhp: 10,
    message: 'Confirmed',
    canCreateAccount: true,
    fixture: true,
  })),
  registerAccount: vi.fn(async () => session ?? makeSession({ emailVerified: false })),
  resendEmailVerification: vi.fn(async () => undefined),
  requestManualRenewal: vi.fn(async (): Promise<RenewalRequest> => ({
    renewalId: 'test-renewal',
    checkoutUrl: '/settings/access?renewalId=test-renewal',
    status: 'pending',
    amountPhp: 10,
    providerLabel: 'Test renewal',
    fixture: true,
  })),
  getAccessStatus: vi.fn(async () => (session ?? makeSession()).access),
  updateDisplayName: vi.fn(async (input: { displayName: string }) => ({ displayName: input.displayName.trim(), nextChangeAllowedAt: '2026-02-01T00:00:00.000Z' })),
  requestEmailChange: vi.fn(async () => undefined),
});
