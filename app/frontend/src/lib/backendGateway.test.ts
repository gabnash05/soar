import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  authHeaders: vi.fn(),
  getFirebaseConfigStatus: vi.fn(),
  getFirebaseRuntime: vi.fn(),
  reload: vi.fn(),
  updateProfile: vi.fn()
}));

vi.mock('@firebase/auth', () => ({
  reload: mocks.reload,
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile: mocks.updateProfile
}));
vi.mock('./apiClient', () => ({
  apiBaseUrl: () => 'https://api.example.test',
  apiFetch: mocks.apiFetch,
  authHeaders: mocks.authHeaders
}));
vi.mock('./firebase', () => ({
  getFirebaseConfigStatus: mocks.getFirebaseConfigStatus,
  getFirebaseRuntime: mocks.getFirebaseRuntime
}));
vi.mock('./fixtures', () => ({ createFixtureGateway: vi.fn() }));

import { createBackendGateway } from './backendGateway';

describe('backend session normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirebaseConfigStatus.mockReturnValue({ configured: true });
    mocks.getFirebaseRuntime.mockReturnValue({ auth: { currentUser: { emailVerified: true } } });
    mocks.authHeaders.mockResolvedValue({ Authorization: 'Bearer trusted-token' });
    mocks.apiFetch.mockResolvedValue({
      uid: 'local-admin',
      email: 'admin@example.test',
      displayName: 'Local Admin',
      accountKind: 'admin',
      emailVerified: true,
      access: { status: 'missing', renewalAvailable: true },
      officerGrants: []
    });
  });

  it('preserves the server-derived Admin session type instead of normalizing it to Student', async () => {
    const session = await createBackendGateway().reloadSession();

    expect(session).toMatchObject({
      uid: 'local-admin',
      displayName: 'Local Admin',
      accountKind: 'admin',
      access: { status: 'missing' },
      officerGrants: []
    });
    expect(mocks.apiFetch).toHaveBeenCalledWith('/session', { headers: { Authorization: 'Bearer trusted-token' } });
  });

  it('preserves the name-save DTO and waits for the server before changing local session state', async () => {
    const result = { displayName: 'New Name', nextChangeAllowedAt: '2030-01-01T00:00:00.000Z' };
    mocks.apiFetch.mockResolvedValueOnce(result);

    await expect(createBackendGateway().updateDisplayName({ displayName: 'New Name' })).resolves.toEqual(result);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.apiFetch).toHaveBeenCalledWith('/account/display-name', {
      method: 'POST',
      headers: { Authorization: 'Bearer trusted-token' },
      body: JSON.stringify({ displayName: 'New Name' }),
    });
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('does not mutate Firebase Auth when the server rejects the name save', async () => {
    const failure = Object.assign(new Error('Backend path /accounts/private returned diagnostic JSON'), { code: 'name_change_cooldown' });
    mocks.apiFetch.mockRejectedValueOnce(failure);

    await expect(createBackendGateway().updateDisplayName({ displayName: 'New Name' })).rejects.toBe(failure);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
