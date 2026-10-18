import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  authHeaders: vi.fn(),
  getFirebaseConfigStatus: vi.fn(),
  getFirebaseRuntime: vi.fn(),
  reload: vi.fn(),
  updateProfile: vi.fn(),
  signIn: vi.fn(),
  sendEmailVerification: vi.fn()
}));

vi.mock('@firebase/auth', () => ({
  reload: mocks.reload,
  sendEmailVerification: mocks.sendEmailVerification,
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: mocks.signIn,
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
    mocks.signIn.mockResolvedValue({ user: { emailVerified: false } });
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
