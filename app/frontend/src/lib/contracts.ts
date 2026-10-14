export type AccountKind = 'student' | 'sponsor';

export type AccessStatus = 'active' | 'pending' | 'failed' | 'cancelled' | 'expired' | 'revoked' | 'missing';

export type ApplicationStage = 'Pending' | 'Under review' | 'Accepted' | 'Declined';

export type MeetingStatus = 'Pending' | 'Approved' | 'Declined';

export type OfficerGrantStatus = 'active' | 'approved' | 'pending' | 'revoked';

export interface OrganizationGrant {
  organizationId: string;
  organizationName: string;
  status: OfficerGrantStatus;
  grantedBy?: string;
  grantedAt?: string;
}

export interface AccessEntitlement {
  status: AccessStatus;
  /** @deprecated Kept for backend compatibility while UI copy uses feePhp/periodLabel. */
  annualFeePhp: 10;
  feePhp?: 10;
  periodMonths?: 6;
  periodLabel?: string;
  startsAt?: string;
  expiresAt?: string;
  lastPaymentReference?: string;
  renewalAvailable: boolean;
}

export interface UserSession {
  uid: string;
  email: string;
  displayName: string;
  accountKind: AccountKind;
  studentId?: string;
  department?: string;
  companyName?: string;
  departmentKey?: string;
  emailVerified: boolean;
  access: AccessEntitlement;
  officerGrants: OrganizationGrant[];
}

export type RegistrationRoleIntent = AccountKind;

export interface RegistrationPaymentInput {
  role: RegistrationRoleIntent;
  email: string;
  displayName: string;
  studentId?: string;
  department?: string;
  companyName?: string;
  returnUrl: string;
}

export interface RegistrationPaymentIntent {
  intentId: string;
  checkoutUrl: string;
  status: Exclude<AccessStatus, 'active' | 'expired' | 'missing'>;
  amountPhp: 10;
  expiresAt: string;
  providerLabel: string;
  fixture?: boolean;
}

export interface CheckoutStatus {
  intentId: string;
  status: AccessStatus;
  amountPhp: 10;
  providerReference?: string;
  message: string;
  canCreateAccount: boolean;
  fixture?: boolean;
}

export interface RegisterAccountInput {
  intentId: string;
  email: string;
  password: string;
  displayName: string;
  role: RegistrationRoleIntent;
  studentId?: string;
  department?: string;
  companyName?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface NameChangeInput {
  displayName: string;
}

export interface EmailChangeInput {
  newEmail: string;
  currentPassword: string;
}

export interface RenewalRequestInput {
  returnUrl: string;
}

export interface RenewalRequest {
  renewalId: string;
  checkoutUrl: string;
  status: 'pending';
  amountPhp: 10;
  providerLabel: string;
  fixture?: boolean;
}

export interface ApiProblem {
  code: string;
  message: string;
  action?: string;
}

export class ServiceUnavailableError extends Error {
  code = 'service_unavailable';

  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

export class ValidationProblemError extends Error {
  code = 'validation_problem';
  problems: Record<string, string>;

  constructor(message: string, problems: Record<string, string>) {
    super(message);
    this.name = 'ValidationProblemError';
    this.problems = problems;
  }
}

export const hasActiveAccess = (session: UserSession | null | undefined): boolean =>
  session?.access.status === 'active' && Boolean(session.access.expiresAt);

export const hasApprovedOfficerGrant = (session: UserSession | null | undefined): boolean =>
  Boolean(session?.officerGrants.some((grant) => grant.status === 'approved' || grant.status === 'active'));

export const isStudentAccount = (session: UserSession | null | undefined): boolean =>
  session?.accountKind === 'student';
