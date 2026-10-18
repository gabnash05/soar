import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './apiClient';
import { safeErrorMessage } from './safeErrors';

vi.mock('./firebase', () => ({
  getFirebaseConfigStatus: () => ({ configured: false }),
  getFirebaseRuntime: () => ({ auth: { currentUser: null } }),
}));

describe('apiFetch name-change errors', () => {
  const nextChangeAllowedAt = '2030-01-02T03:04:05.000Z';

  beforeEach(() => {
    vi.stubEnv('VITE_SOAR_API_BASE_URL', 'https://api.example.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: 'name_change_cooldown',
        message: 'Name changes are limited to once every 30 days. Please try again later.',
        nextChangeAllowedAt,
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('passes only the structured retry time to the safe localized message mapper', async () => {
    const error = await apiFetch('/account/display-name').then(
      () => undefined,
      (caught: unknown) => caught,
    );
    const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(nextChangeAllowedAt));

    expect(error).toMatchObject({ code: 'name_change_cooldown', nextChangeAllowedAt });
    expect(safeErrorMessage(error)).toBe(`Name changes are limited to once every 30 days. Try again after ${formatted}.`);
  });
});
