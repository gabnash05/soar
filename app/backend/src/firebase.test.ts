import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminMocks = vi.hoisted(() => ({
  cert: vi.fn((value: unknown) => ({ credentialFor: value })),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(),
  getAuth: vi.fn(() => ({ auth: true })),
  getFirestore: vi.fn(() => ({ firestore: true })),
  getStorage: vi.fn(() => ({ bucket: vi.fn() })),
}));

vi.mock('firebase-admin/app', () => ({ cert: adminMocks.cert, getApps: adminMocks.getApps, initializeApp: adminMocks.initializeApp }));
vi.mock('firebase-admin/auth', () => ({ getAuth: adminMocks.getAuth }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: adminMocks.getFirestore }));
vi.mock('firebase-admin/storage', () => ({ getStorage: adminMocks.getStorage }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_JSON', '');
  vi.stubEnv('GCLOUD_PROJECT', 'soar-a711e');
});

afterEach(() => vi.unstubAllEnvs());

describe('Firebase Admin runtime identity binding', () => {
  it('binds the supplied runtime identity to the existing Firebase project', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_JSON', JSON.stringify({ project_id: 'soar-a711e', client_email: 'runtime@example.test', private_key: 'private-test-value' }));

    await import('./firebase');

    expect(adminMocks.initializeApp).toHaveBeenCalledWith({
      credential: { credentialFor: expect.objectContaining({ project_id: 'soar-a711e' }) },
      projectId: 'soar-a711e',
    });
  });

  it('refuses a runtime identity for another project without exposing its value', async () => {
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_JSON', JSON.stringify({ project_id: 'other-project', client_email: 'runtime@example.test', private_key: 'private-test-value' }));

    await expect(import('./firebase')).rejects.toThrow('FIREBASE_SERVICE_ACCOUNT_JSON must contain a valid Firebase Admin service account.');
    expect(adminMocks.initializeApp).not.toHaveBeenCalled();
    expect(adminMocks.cert).not.toHaveBeenCalled();
  });

  it('keeps the existing application-default credential path when no JSON identity is configured', async () => {
    await import('./firebase');

    expect(adminMocks.initializeApp).toHaveBeenCalledWith();
    expect(adminMocks.cert).not.toHaveBeenCalled();
  });
});
