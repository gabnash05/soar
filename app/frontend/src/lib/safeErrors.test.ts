import { describe, expect, it } from 'vitest';
import { safeErrorMessage, UserFacingError } from './safeErrors';
import { ValidationProblemError } from './contracts';

describe('safeErrorMessage', () => {
  it('uses a non-enumerating sign-in message for invalid credentials', () => {
    const error = Object.assign(new Error('Firebase raw details'), { code: 'auth/wrong-password' });
    expect(safeErrorMessage(error)).toBe('The email or password did not match. Check both and try again.');
  });

  it('sanitizes unknown Firebase Auth codes instead of returning SDK text', () => {
    const error = Object.assign(new Error('Firebase internal account details'), { code: 'auth/email-already-in-use' });
    expect(safeErrorMessage(error)).toBe('We could not complete that account request. Check your details and try again.');
  });

  it('maps Firebase storage failures without displaying SDK messages', () => {
    const error = Object.assign(new Error('Firebase Storage: private path details'), { code: 'storage/unauthorized' });
    expect(safeErrorMessage(error)).toBe('You do not have permission to upload this file.');
  });

  it('uses the supplied recovery message for internal and network failures', () => {
    expect(safeErrorMessage(Object.assign(new Error('secret backend detail'), { code: 'internal' }), 'Try the meeting request again.'))
      .toBe('Try the meeting request again.');
    expect(safeErrorMessage(new TypeError('Failed to fetch'), 'Try again.')).toBe('Try again.');
  });

  it('formats the structured cooldown time and ignores raw serialized error text', () => {
    const nextChangeAllowedAt = '2030-01-02T03:04:05.000Z';
    const error = Object.assign(new Error('account path accounts/private-user; raw JSON with timestamp'), {
      code: 'name_change_cooldown',
      nextChangeAllowedAt,
    });
    const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(nextChangeAllowedAt));
    const message = safeErrorMessage(error);

    expect(message).toBe(`Name changes are limited to once every 30 days. Try again after ${formatted}.`);
    expect(message).not.toMatch(/2030-|accounts\/|03:04:05|raw JSON/);
    expect(safeErrorMessage(Object.assign(new Error('private'), { code: 'name_change_cooldown', nextChangeAllowedAt: 'private path' })))
      .toBe('Name changes are limited to once every 30 days. Please try again later.');
  });

  it('keeps useful name-field validation while discarding Zod details', () => {
    const error = new ValidationProblemError('The request contains invalid fields.', {
      displayName: 'Too small: expected string to have >=2 characters <script>private</script>',
    });

    expect(safeErrorMessage(error)).toBe('Enter a name between 2 and 120 characters.');
    expect(safeErrorMessage(new ValidationProblemError('private JSON', { displayName: 'Internal path and stack' })))
      .not.toMatch(/private|Internal|stack|<script>/);
  });

  it('does not expose provider, arbitrary API, object, or unexpected exception details', () => {
    const provider = Object.assign(new Error('provider token=secret path=/private/object'), { code: 'firebase_auth_rest_error' });
    const api = Object.assign(new Error('{"uid":"private","timestamp":"2030-01-02T03:04:05Z"}'), { code: 'unknown_server_code' });
    const unexpected = new Error('TypeError: private endpoint /users/123 and credential abc');
    const inheritedCode = Object.assign(new Error('prototype details'), { code: 'constructor' });

    expect(safeErrorMessage(provider)).toBe('We could not complete this account request. Please try again.');
    expect(safeErrorMessage(api)).toBe('We could not complete this action. Please try again.');
    expect(safeErrorMessage(unexpected)).toBe('We could not complete this action. Please try again.');
    expect(safeErrorMessage(inheritedCode)).toBe('We could not complete this action. Please try again.');
    expect(safeErrorMessage({ message: { private: 'object' } })).toBe('We could not complete this action. Please try again.');
  });

  it('preserves only explicitly trusted application-authored messages', () => {
    expect(safeErrorMessage(new UserFacingError('Choose a date before continuing.')))
      .toBe('Choose a date before continuing.');
  });
});
