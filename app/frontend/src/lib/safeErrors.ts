type CodedError = Error & { code?: unknown };

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

export function safeErrorMessage(error: unknown, fallback = 'We could not complete this action. Please try again.'): string {
  if (!error || typeof error !== 'object') return fallback;

  const codedError = error as CodedError;
  const code = typeof codedError.code === 'string' ? codedError.code : '';
  if (firebaseMessages[code]) return firebaseMessages[code];
  if (code === 'internal' || codedError.name === 'TypeError') return fallback;

  return codedError.message || fallback;
}
