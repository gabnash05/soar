import { describe, expect, it } from 'vitest';
import { safeErrorMessage } from './safeErrors';

describe('safeErrorMessage', () => {
  it('uses a non-enumerating sign-in message for invalid credentials', () => {
    const error = Object.assign(new Error('Firebase raw details'), { code: 'auth/wrong-password' });
    expect(safeErrorMessage(error)).toBe('The email or password did not match. Check both and try again.');
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

  it('preserves known actionable application messages', () => {
    expect(safeErrorMessage(new Error('Choose a date before continuing.'))).toBe('Choose a date before continuing.');
  });
});
