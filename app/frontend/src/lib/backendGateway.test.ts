import { beforeEach, describe, expect, it, vi } from 'vitest';

const { credential, reauthenticateWithCredential, getFirebaseRuntime } = vi.hoisted(() => ({
  credential: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  getFirebaseRuntime: vi.fn(),
}));

vi.mock('@firebase/auth', () => ({
  EmailAuthProvider: { credential },
  reauthenticateWithCredential,
}));
vi.mock('./firebase', () => ({ getFirebaseRuntime }));

import { reauthenticateCurrentUser } from './backendGateway';

describe('reauthenticateCurrentUser', () => {
  const user = {
    uid: 'officer-uid',
    email: 'officer@example.edu',
    emailVerified: true,
    providerData: [{ providerId: 'password' }],
    getIdToken: vi.fn(async () => 'recent-token'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    credential.mockReturnValue({ providerId: 'password', secret: 'credential-object' });
    reauthenticateWithCredential.mockResolvedValue({ user });
    getFirebaseRuntime.mockReturnValue({ auth: { currentUser: user } });
  });

  it('reauthenticates with the current verified email and refreshes the recent-auth token', async () => {
    await reauthenticateCurrentUser('entered-password', 'officer-uid');

    expect(credential).toHaveBeenCalledWith('officer@example.edu', 'entered-password');
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(user, { providerId: 'password', secret: 'credential-object' });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(reauthenticateWithCredential.mock.invocationCallOrder[0]).toBeLessThan(user.getIdToken.mock.invocationCallOrder[0]);
  });

  it('does not invent a password flow for a non-password sign-in provider', async () => {
    getFirebaseRuntime.mockReturnValue({ auth: { currentUser: { ...user, providerData: [{ providerId: 'google.com' }] } } });

    await expect(reauthenticateCurrentUser('unused', 'officer-uid')).rejects.toThrow(/does not use email\/password sign-in/i);
    expect(credential).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it('refuses reauthentication without a current user email', async () => {
    getFirebaseRuntime.mockReturnValue({ auth: { currentUser: null } });

    await expect(reauthenticateCurrentUser('unused', 'officer-uid')).rejects.toThrow(/sign-in session is unavailable/i);
    expect(credential).not.toHaveBeenCalled();
  });

  it('does not approve changes for an identity that differs from the active session', async () => {
    getFirebaseRuntime.mockReturnValue({ auth: { currentUser: { ...user, uid: 'different-uid' } } });

    await expect(reauthenticateCurrentUser('unused', 'officer-uid')).rejects.toThrow(/sign-in session is unavailable/i);
    expect(credential).not.toHaveBeenCalled();
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
  });
});
