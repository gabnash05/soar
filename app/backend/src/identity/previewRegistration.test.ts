import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';

const mocks = vi.hoisted(() => ({
  accounts: new Map<string, any>(),
  getUser: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('../firebase', () => ({
  adminAuth: { getUser: mocks.getUser },
  db: {
    doc: (path: string) => ({ path, get: async () => ({ exists: mocks.accounts.has(path), data: () => mocks.accounts.get(path) }) }),
    runTransaction: mocks.runTransaction,
  },
}));

import { AppError } from '../errors';
import { paidRegistrationCompletionSchema, previewRegistrationSchema } from '../contracts/validation';
import { createUnpaidPreviewAccount } from './previewRegistration';

const user = { uid: 'student-uid', email: 'mara@example.edu', email_verified: false } as unknown as DecodedIdToken;
const student = {
  role: 'student',
  displayName: 'Mara Santos',
  studentId: '2026-0001',
  department: 'Computer Engineering Department',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts.clear();
  process.env.SOAR_DISABLE_PAYMENTS = 'true';
  mocks.getUser.mockResolvedValue({ uid: 'student-uid', email: 'Mara@Example.edu', emailVerified: false, disabled: false, customClaims: {} });
  mocks.runTransaction.mockImplementation(async (callback) => callback({
    get: async (ref: { path: string }) => ({ exists: mocks.accounts.has(ref.path), data: () => mocks.accounts.get(ref.path) }),
    create: (ref: { path: string }, value: unknown) => {
      if (mocks.accounts.has(ref.path)) throw new Error('document already exists');
      mocks.accounts.set(ref.path, value);
    },
  }));
});

describe('unpaid preview registration', () => {
  it('saves a real student profile with canonical department and explicit unpaid provenance only while preview payments are disabled', async () => {
    const result = await createUnpaidPreviewAccount(user, { ...student, department: '  computer   engineering department ' });
    const account = mocks.accounts.get('accounts/student-uid');

    expect(result).toMatchObject({ uid: 'student-uid', created: true, access: { status: 'active', provenance: 'unpaid-preview' } });
    expect(account).toMatchObject({
      uid: 'student-uid',
      role: 'student',
      displayName: 'Mara Santos',
      email: 'mara@example.edu',
      emailVerified: false,
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
      departmentKey: 'computer engineering department',
      accessProvenance: 'unpaid-preview',
    });
    expect(account).not.toHaveProperty('password');
    expect(mocks.accounts.has('entitlements/student-uid')).toBe(false);
  });

  it('recovers an interrupted profile save idempotently without creating a second account', async () => {
    await createUnpaidPreviewAccount(user, student);

    await expect(createUnpaidPreviewAccount(user, student)).resolves.toMatchObject({ created: false, uid: 'student-uid' });
    expect(mocks.accounts.size).toBe(1);
    expect(mocks.runTransaction).toHaveBeenCalledTimes(2);
  });

  it('rejects a mismatched retry instead of overwriting the saved profile', async () => {
    await createUnpaidPreviewAccount(user, student);

    await expect(createUnpaidPreviewAccount(user, { ...student, displayName: 'Different Name' }))
      .rejects.toMatchObject({ code: 'account_already_exists', status: 409 });
    expect(mocks.accounts.get('accounts/student-uid')).toMatchObject({ displayName: 'Mara Santos' });
  });

  it('rejects missing student ID, absent department, or unsupported department before writing an account', async () => {
    await expect(createUnpaidPreviewAccount(user, { ...student, studentId: undefined }))
      .rejects.toMatchObject({ name: 'ZodError' });
    await expect(createUnpaidPreviewAccount(user, { ...student, department: undefined }))
      .rejects.toMatchObject({ name: 'ZodError' });
    await expect(createUnpaidPreviewAccount(user, { ...student, department: 'Computer Science' }))
      .rejects.toMatchObject({ name: 'ZodError' });
    expect(mocks.accounts.size).toBe(0);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('allows sponsor profiles without student-only fields', async () => {
    const result = await createUnpaidPreviewAccount(user, { role: 'sponsor', displayName: 'Sam Sponsor', companyName: 'Community Partner' });
    expect(result.created).toBe(true);
    expect(mocks.accounts.get('accounts/student-uid')).toMatchObject({ role: 'sponsor', companyName: 'Community Partner', accessProvenance: 'unpaid-preview' });
    expect(mocks.accounts.get('accounts/student-uid')).not.toHaveProperty('department');
  });

  it('rejects public Admin role, privileged payload fields, and trusted Admin identities', async () => {
    await expect(createUnpaidPreviewAccount(user, { ...student, role: 'admin' })).rejects.toMatchObject({ name: 'ZodError' });
    await expect(createUnpaidPreviewAccount(user, { ...student, accessProvenance: 'unpaid-preview' })).rejects.toMatchObject({ name: 'ZodError' });
    await expect(createUnpaidPreviewAccount(user, { ...student, password: 'must-not-reach-api' })).rejects.toMatchObject({ name: 'ZodError' });
    await expect(createUnpaidPreviewAccount({ ...user, soarAdmin: true }, student))
      .rejects.toMatchObject({ code: 'public_registration_forbidden', status: 403 });

    mocks.getUser.mockResolvedValueOnce({ uid: 'student-uid', email: 'mara@example.edu', emailVerified: false, disabled: false, customClaims: { soarAdmin: true } });
    await expect(createUnpaidPreviewAccount(user, student)).rejects.toMatchObject({ code: 'public_registration_forbidden', status: 403 });
    expect(mocks.accounts.size).toBe(0);
  });

  it('allows authenticated paid completion without a password while keeping preview registration password-free and strict', () => {
    const completion = {
      email: 'mara@example.edu',
      displayName: 'Mara Santos',
      role: 'student',
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
      entitlement: {
        provider: 'paymongo',
        providerEventId: 'evt_paid',
        accessExpiresAt: { toMillis: () => 1_800_000_000_000 },
        amount: { currency: 'PHP', minor: 1000 },
        intentId: 'reg_paid',
      },
    };

    expect(paidRegistrationCompletionSchema.parse({ ...completion, uid: 'firebase-uid' })).toMatchObject({ uid: 'firebase-uid' });
    expect(paidRegistrationCompletionSchema.safeParse(completion).success).toBe(false);
    expect(paidRegistrationCompletionSchema.safeParse({ ...completion, uid: 'firebase-uid', password: 'StrongPass123' }).success).toBe(false);
    expect(previewRegistrationSchema.safeParse({ ...student, displayName: 'Mara Santos', password: 'StrongPass123' }).success).toBe(false);
  });

  it('fails closed when the saved policy requires payment even if the deployment also disables checkout', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'true';
    mocks.accounts.set('systemSettings/paymentPolicy', { paymentsRequired: true });

    await expect(createUnpaidPreviewAccount(user, student)).rejects.toMatchObject({ code: 'preview_registration_unavailable', status: 503 });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.accounts.has('accounts/student-uid')).toBe(false);
  });

  it('allows explicit unpaid registration when the persisted Admin policy does not require payment', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    mocks.accounts.set('systemSettings/paymentPolicy', { paymentsRequired: false });

    await expect(createUnpaidPreviewAccount(user, student)).resolves.toMatchObject({ created: true, access: { provenance: 'unpaid-preview' } });
    expect(mocks.accounts.get('accounts/student-uid')).toMatchObject({ accessProvenance: 'unpaid-preview' });
    expect(mocks.accounts.has('entitlements/student-uid')).toBe(false);
  });

  it('fails closed when the saved policy requires payment regardless of the deployment checkout setting', async () => {
    process.env.SOAR_DISABLE_PAYMENTS = 'false';
    mocks.accounts.set('systemSettings/paymentPolicy', { paymentsRequired: true });

    await expect(createUnpaidPreviewAccount(user, student)).rejects.toMatchObject({ code: 'preview_registration_unavailable', status: 503 });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.accounts.has('accounts/student-uid')).toBe(false);
  });

  it('rejects a Firebase identity whose verified token email no longer matches its account', async () => {
    mocks.getUser.mockResolvedValueOnce({ uid: 'student-uid', email: 'different@example.edu', emailVerified: false, disabled: false, customClaims: {} });

    await expect(createUnpaidPreviewAccount(user, student))
      .rejects.toBeInstanceOf(AppError);
    expect(mocks.accounts.size).toBe(0);
  });
});
