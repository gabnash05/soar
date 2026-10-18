import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  authHeaders: vi.fn(),
  credential: vi.fn(),
  getFirebaseConfigStatus: vi.fn(),
  getFirebaseRuntime: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  reload: vi.fn(),
  updateProfile: vi.fn(),
  signIn: vi.fn(),
  createUser: vi.fn(),
  sendEmailVerification: vi.fn(),
}));

vi.mock('@firebase/auth', () => ({
  EmailAuthProvider: { credential: mocks.credential },
  reauthenticateWithCredential: mocks.reauthenticateWithCredential,
  reload: mocks.reload,
  sendEmailVerification: mocks.sendEmailVerification,
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: mocks.signIn,
  createUserWithEmailAndPassword: mocks.createUser,
  signOut: vi.fn(),
  updateProfile: mocks.updateProfile,
}));
vi.mock('./apiClient', () => ({
  apiBaseUrl: () => 'https://api.example.test',
  apiFetch: mocks.apiFetch,
  authHeaders: mocks.authHeaders,
}));
vi.mock('./firebase', () => ({
  getFirebaseConfigStatus: mocks.getFirebaseConfigStatus,
  getFirebaseRuntime: mocks.getFirebaseRuntime,
}));
vi.mock('./fixtures', () => ({ createFixtureGateway: vi.fn() }));

import { createBackendGateway, reauthenticateCurrentUser } from './backendGateway';

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
    mocks.credential.mockReturnValue({ providerId: 'password', secret: 'credential-object' });
    mocks.reauthenticateWithCredential.mockResolvedValue({ user });
    mocks.getFirebaseRuntime.mockReturnValue({ auth: { currentUser: user } });
  });

  it('reauthenticates with the current verified email and refreshes the recent-auth token', async () => {
    await reauthenticateCurrentUser('entered-password', 'officer-uid');

    expect(mocks.credential).toHaveBeenCalledWith('officer@example.edu', 'entered-password');
    expect(mocks.reauthenticateWithCredential).toHaveBeenCalledWith(user, { providerId: 'password', secret: 'credential-object' });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.reauthenticateWithCredential.mock.invocationCallOrder[0]).toBeLessThan(user.getIdToken.mock.invocationCallOrder[0]);
  });

  it('does not invent a password flow for a non-password sign-in provider', async () => {
    mocks.getFirebaseRuntime.mockReturnValue({ auth: { currentUser: { ...user, providerData: [{ providerId: 'google.com' }] } } });

    await expect(reauthenticateCurrentUser('unused', 'officer-uid')).rejects.toThrow(/does not use email\/password sign-in/i);
    expect(mocks.credential).not.toHaveBeenCalled();
    expect(mocks.reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it('refuses reauthentication without a current user email', async () => {
    mocks.getFirebaseRuntime.mockReturnValue({ auth: { currentUser: null } });

    await expect(reauthenticateCurrentUser('unused', 'officer-uid')).rejects.toThrow(/sign-in session is unavailable/i);
    expect(mocks.credential).not.toHaveBeenCalled();
  });

  it('does not approve changes for an identity that differs from the active session', async () => {
    mocks.getFirebaseRuntime.mockReturnValue({ auth: { currentUser: { ...user, uid: 'different-uid' } } });

    await expect(reauthenticateCurrentUser('unused', 'officer-uid')).rejects.toThrow(/sign-in session is unavailable/i);
    expect(mocks.credential).not.toHaveBeenCalled();
    expect(mocks.reauthenticateWithCredential).not.toHaveBeenCalled();
  });
});

describe('backend session normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirebaseConfigStatus.mockReturnValue({ configured: true });
    mocks.getFirebaseRuntime.mockReturnValue({ auth: { currentUser: { emailVerified: true, getIdToken: vi.fn(async () => 'fresh-token') } } });
    mocks.authHeaders.mockResolvedValue({ Authorization: 'Bearer trusted-token' });
    mocks.signIn.mockResolvedValue({ user: { emailVerified: false } });
    mocks.apiFetch.mockResolvedValue({
      uid: 'local-admin',
      email: 'admin@example.test',
      displayName: 'Local Admin',
      accountKind: 'admin',
      emailVerified: true,
      access: { status: 'missing', renewalAvailable: true },
      officerGrants: [],
    });
  });

  it('preserves the server-derived Admin session type instead of normalizing it to Student', async () => {
    const session = await createBackendGateway().reloadSession();

    expect(session).toMatchObject({
      uid: 'local-admin',
      displayName: 'Local Admin',
      accountKind: 'admin',
      access: { status: 'missing' },
      officerGrants: [],
    });
    expect(mocks.apiFetch).toHaveBeenCalledWith('/session', { headers: { Authorization: 'Bearer trusted-token' } });
  });

  it('refreshes Firebase ID-token claims after reload before requesting the session', async () => {
    const user = { emailVerified: true, getIdToken: vi.fn(async () => 'fresh-token') };
    mocks.getFirebaseRuntime.mockReturnValue({ auth: { currentUser: user } });

    await createBackendGateway().reloadSession();

    expect(mocks.reload).toHaveBeenCalledWith(user);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.reload.mock.invocationCallOrder[0]).toBeLessThan(user.getIdToken.mock.invocationCallOrder[0]);
    expect(user.getIdToken.mock.invocationCallOrder[0]).toBeLessThan(mocks.apiFetch.mock.invocationCallOrder[0]);
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

  it('allows account completion only from the server confirmation flag even while registration status remains pending', async () => {
    const input = {
      intentId: 'reg_123',
      email: 'ada@example.edu',
      password: 'StrongPass123',
      displayName: 'Ada Lovelace',
      role: 'student' as const,
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
    };
    const session = {
      uid: 'uid_123',
      email: input.email,
      displayName: input.displayName,
      accountKind: 'student',
      emailVerified: false,
      access: { status: 'active', annualFeePhp: 10, renewalAvailable: false },
      officerGrants: [],
    };
    mocks.apiFetch
      .mockResolvedValueOnce({ intentId: input.intentId, status: 'pending', canCreateAccount: true })
      .mockResolvedValueOnce({ uid: 'uid_123', completed: true })
      .mockResolvedValueOnce(session);

    await expect(createBackendGateway().registerAccount(input)).resolves.toMatchObject({ uid: 'uid_123' });
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(1, '/payments/registration/status?intentId=reg_123');
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(2, '/payments/registration/complete', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(input),
    }));
    expect(mocks.signIn).toHaveBeenCalledWith(expect.anything(), input.email, input.password);
    expect(mocks.sendEmailVerification).toHaveBeenCalled();
  });

  it('creates an unpaid preview profile through Firebase Auth and never sends the password to the API', async () => {
    const input = {
      role: 'student' as const,
      email: 'mara@example.edu',
      password: 'StrongPass123',
      displayName: 'Mara Santos',
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
    };
    const firebaseUser = { emailVerified: false };
    const session = {
      uid: 'uid_preview',
      email: input.email,
      displayName: input.displayName,
      accountKind: 'student',
      emailVerified: false,
      access: { status: 'active', provenance: 'unpaid-preview', feePhp: 0, annualFeePhp: 10, periodLabel: 'Unpaid preview', renewalAvailable: false },
      officerGrants: [],
    };
    mocks.createUser.mockResolvedValueOnce({ user: firebaseUser });
    mocks.apiFetch.mockResolvedValueOnce({ created: true }).mockResolvedValueOnce(session);

    await expect(createBackendGateway().registerPreviewAccount(input)).resolves.toMatchObject({
      uid: 'uid_preview',
      access: { status: 'active', provenance: 'unpaid-preview' },
    });

    expect(mocks.createUser).toHaveBeenCalledWith(expect.anything(), input.email, input.password);
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(1, '/accounts/preview-registration', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer trusted-token' },
      body: JSON.stringify({ role: 'student', displayName: 'Mara Santos', studentId: '2026-0001', department: 'Computer Engineering Department', companyName: undefined }),
    }));
    expect(JSON.stringify(mocks.apiFetch.mock.calls)).not.toContain(input.password);
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(firebaseUser);
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(2, '/session', { headers: { Authorization: 'Bearer trusted-token' } });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('resends verification through the supported Firebase Auth action for the signed-in preview user', async () => {
    const firebaseUser = { emailVerified: false };
    mocks.getFirebaseRuntime.mockReturnValue({ auth: { currentUser: firebaseUser } });

    await createBackendGateway().resendEmailVerification();

    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(firebaseUser);
  });

  it('recovers a prior Firebase Auth account when its profile write was interrupted', async () => {
    const input = {
      role: 'student' as const,
      email: 'mara@example.edu',
      password: 'StrongPass123',
      displayName: 'Mara Santos',
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
    };
    const firebaseUser = { emailVerified: false };
    mocks.createUser.mockRejectedValueOnce(Object.assign(new Error('already exists'), { code: 'auth/email-already-in-use' }));
    mocks.signIn.mockResolvedValueOnce({ user: firebaseUser });
    mocks.apiFetch.mockResolvedValueOnce({ created: false }).mockResolvedValueOnce({
      uid: 'uid_preview', email: input.email, displayName: input.displayName, accountKind: 'student', emailVerified: false,
      access: { status: 'active', provenance: 'unpaid-preview', annualFeePhp: 10, feePhp: 0, periodLabel: 'Unpaid preview', renewalAvailable: false },
      officerGrants: [],
    });

    await expect(createBackendGateway().registerPreviewAccount(input)).resolves.toMatchObject({ uid: 'uid_preview' });
    expect(mocks.signIn).toHaveBeenCalledWith(expect.anything(), input.email, input.password);
    expect(mocks.apiFetch).toHaveBeenCalledWith('/accounts/preview-registration', expect.anything());
  });

  it('connects recovery codes and renewal status to the server routes without placing codes in URLs', async () => {
    const gateway = createBackendGateway();
    mocks.apiFetch.mockResolvedValueOnce({ accepted: true, delivery: 'sent' });
    await expect(gateway.requestPaidRegistrationRecovery('ada@example.edu')).resolves.toEqual({ accepted: true, delivery: 'sent' });
    expect(mocks.apiFetch).toHaveBeenLastCalledWith('/payments/registration/recover', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.edu' }),
    });

    mocks.apiFetch.mockResolvedValueOnce({ accepted: true });
    await gateway.acceptPaidRegistrationRecovery('reg_123', 'one-time-code');
    expect(mocks.apiFetch).toHaveBeenLastCalledWith('/payments/registration/recover/accept', {
      method: 'POST',
      body: JSON.stringify({ intentId: 'reg_123', recoveryCode: 'one-time-code' }),
    });

    mocks.apiFetch.mockResolvedValueOnce({ renewalId: 'pay_123', status: 'confirmed', message: 'Payment confirmed.' });
    await expect(gateway.getRenewalStatus('pay/123')).resolves.toMatchObject({ status: 'confirmed' });
    expect(mocks.apiFetch).toHaveBeenLastCalledWith('/payments/renewals/status?renewalId=pay%2F123', {
      headers: { Authorization: 'Bearer trusted-token' },
    });
  });

  it('does not mutate Firebase Auth when the server rejects the name save', async () => {
    const failure = Object.assign(new Error('Backend path /accounts/private returned diagnostic JSON'), { code: 'name_change_cooldown' });
    mocks.apiFetch.mockRejectedValueOnce(failure);

    await expect(createBackendGateway().updateDisplayName({ displayName: 'New Name' })).rejects.toBe(failure);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
