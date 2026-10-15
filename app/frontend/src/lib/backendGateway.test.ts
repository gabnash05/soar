import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  authHeaders: vi.fn(),
  getFirebaseConfigStatus: vi.fn(),
  getFirebaseRuntime: vi.fn(),
  reload: vi.fn()
}));

vi.mock('@firebase/auth', () => ({
  reload: mocks.reload,
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn()
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
});
