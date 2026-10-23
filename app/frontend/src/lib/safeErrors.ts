type CodedError = Error & {
  code?: unknown;
  problems?: unknown;
  nextChangeAllowedAt?: unknown;
};

const firebaseMessages: Record<string, string> = {
  'auth/invalid-credential': 'The email or password did not match. Check both and try again.',
  'auth/wrong-password': 'The email or password did not match. Check both and try again.',
  'auth/user-not-found': 'The email or password did not match. Check both and try again.',
  'auth/invalid-email': 'Enter a valid email address and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a little, then try again.',
  'auth/network-request-failed': 'We could not reach the sign-in service. Check your connection and try again.',
  'storage/unauthorized': 'You do not have permission to upload this file.',
  'storage/canceled': 'The upload was canceled. Choose the file again to retry.',
  'storage/retry-limit-exceeded': 'The upload did not finish. Check your connection and try again.',
};

const applicationMessages: Record<string, string> = {
  account_missing: 'We could not find your account profile. Sign out and sign in again. If this continues, contact support.',
  account_already_exists: 'This account already has a profile. Sign in to continue.',
  preview_registration_unavailable: 'Free account creation is currently unavailable.',
  public_registration_forbidden: 'This account cannot use public registration.',
  registration_identity_mismatch: 'Sign in again with the email address for this account.',
  access_inactive: 'Renew your SOAR access before changing account settings.',
  email_not_verified: 'Verify your email address before changing account settings.',
  invalid_token: 'Your session could not be verified. Sign in again.',
  unauthenticated: 'Your session has ended. Sign in again to continue.',
  name_change_cooldown: 'Name changes are limited to once every 30 days. Please try again later.',
  recent_login_required: 'Confirm your current password and try again.',
  invalid_current_password: 'The current password is incorrect.',
  email_already_in_use: 'That email address is already in use.',
  email_unchanged: 'That is already your account email.',
  email_missing: 'We could not find an email address for this account. Contact support.',
  firebase_auth_rest_error: 'We could not complete this account request. Please try again.',
  firebase_web_api_key_missing: 'We could not complete this account request. Please try again.',
  service_unavailable: 'SOAR services are temporarily unavailable. Please try again later.',
  date_entry_missing: 'That availability is no longer available. Refresh the page and try again.',
  date_entry_organization_mismatch: 'The selected availability does not match this organization.',
  date_entry_not_availability: 'Choose a posted meeting or interview availability.',
  meeting_document_missing: 'Upload the formal request PDF before submitting.',
  meeting_document_type_mismatch: 'The formal request document must be a PDF.',
  meeting_document_size_mismatch: 'Choose a formal request PDF under 10 MB.',
  meeting_document_metadata_mismatch: 'The selected document no longer matches this request. Choose it again.',
  invalid_meeting_document_path: 'We could not use that document. Choose it again.',
  not_organization_manager: 'Only approved officers for this organization can manage requests.',
  application_link_missing: 'This organization has not posted an application form yet.',
  organization_missing: 'This organization is no longer available. Refresh the page and try again.',
  announcement_missing: 'This announcement is no longer available. Refresh the page and try again.',
  comment_missing: 'This comment is no longer available. Refresh the page and try again.',
  comment_owner_required: 'You can edit or delete only your own comments.',
};

const validationMessages: Record<string, string> = {
  displayName: 'Enter a name between 2 and 120 characters.',
  newEmail: 'Enter a valid new email address.',
  currentPassword: 'Enter your current password.',
  email: 'Enter a valid email address.',
  password: 'Use a password with at least 8 characters.',
  studentId: 'Enter your student ID.',
  department: 'Choose a supported department.',
  fileName: 'Use a PDF file name of up to 128 characters, starting with a letter or number; letters, numbers, spaces, periods, hyphens, and underscores are allowed.',
};

/** Marks a static, application-authored message as safe to show to the user. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

function cooldownMessage(nextChangeAllowedAt: unknown): string {
  const fallback = applicationMessages.name_change_cooldown;
  if (typeof nextChangeAllowedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(nextChangeAllowedAt)) return fallback;

  const date = new Date(nextChangeAllowedAt);
  if (Number.isNaN(date.getTime())) return fallback;
  const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  return `Name changes are limited to once every 30 days. Try again after ${formatted}.`;
}

function validationMessage(problems: unknown): string | undefined {
  if (!problems || typeof problems !== 'object' || Array.isArray(problems)) return undefined;

  const safeMessages = Object.keys(problems)
    .map((field) => (Object.prototype.hasOwnProperty.call(validationMessages, field) ? validationMessages[field] : undefined))
    .filter((message): message is string => Boolean(message));

  if (safeMessages.length === 1) return safeMessages[0];
  if (safeMessages.length > 1) return 'Some details need attention. Review the form and try again.';
  return undefined;
}

export function safeErrorMessage(error: unknown, fallback = 'We could not complete this action. Please try again.'): string {
  if (!error || typeof error !== 'object') return fallback;

  const codedError = error as CodedError;
  const code = typeof codedError.code === 'string' ? codedError.code : '';
  if (Object.prototype.hasOwnProperty.call(firebaseMessages, code)) return firebaseMessages[code];
  if (code.startsWith('auth/')) return 'We could not complete that account request. Check your details and try again.';
  if (code.startsWith('storage/')) return 'We could not complete the file operation. Please try again.';
  if (code === 'validation_problem') return validationMessage(codedError.problems) ?? fallback;
  if (code === 'name_change_cooldown') return cooldownMessage(codedError.nextChangeAllowedAt);
  if (Object.prototype.hasOwnProperty.call(applicationMessages, code)) return applicationMessages[code];
  if (code === 'internal' || codedError.name === 'TypeError') return fallback;
  if (code) return fallback;
  if (error instanceof UserFacingError) return error.message;

  return fallback;
}
