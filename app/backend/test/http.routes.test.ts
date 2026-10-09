import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors';

const mocks = vi.hoisted(() => ({
  requireBearerToken: vi.fn(),
  getUserSession: vi.fn(),
  updateDisplayName: vi.fn(),
  requestVerifiedEmailChange: vi.fn(),
  approveOfficerGrant: vi.fn(),
  assignInitialOrganizationOwner: vi.fn(),
  revokeOfficerGrant: vi.fn(),
  attachAuthToPaymentRequest: vi.fn((req: unknown) => req),
  sendPaymentResult: vi.fn(async (res: any, resultPromise: Promise<any>) => {
    const result = await resultPromise;
    res.status(result.status).json(result.body ?? {});
  }),
  paymentHandlers: vi.fn(),
  listOrganizations: vi.fn(),
  getOrganizationProfile: vi.fn(),
  updateOrganizationProfile: vi.fn(),
  createLogoImageTarget: vi.fn(),
  listAnnouncements: vi.fn(),
  createAnnouncementImageTarget: vi.fn(),
  createAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  setAnnouncementLike: vi.fn(),
  listAnnouncementComments: vi.fn(),
  addAnnouncementComment: vi.fn(),
  listDateEntries: vi.fn(),
  createDateEntry: vi.fn(),
  updateDateEntry: vi.fn(),
  deleteDateEntry: vi.fn(),
  scopedDateEntryQuery: vi.fn(),
  requestService: {
    confirmExternalApplication: vi.fn(),
    listMyApplications: vi.fn(),
    listOrganizationApplications: vi.fn(),
    updateApplicationStage: vi.fn(),
    requestMeeting: vi.fn(),
    listMyMeetings: vi.fn(),
    listOrganizationMeetings: vi.fn(),
    updateMeetingStatus: vi.fn(),
  },
}));

vi.mock('../src/http/auth', () => ({
  requireBearerToken: mocks.requireBearerToken,
  requireEmailVerified: vi.fn(),
  requireRecentAuth: vi.fn(),
}));

vi.mock('../src/identity/session', () => ({ getUserSession: mocks.getUserSession }));
vi.mock('../src/identity/accountSettings', () => ({
  updateDisplayName: mocks.updateDisplayName,
  requestVerifiedEmailChange: mocks.requestVerifiedEmailChange,
}));
vi.mock('../src/organizations/service', () => ({
  approveOfficerGrant: mocks.approveOfficerGrant,
  assignInitialOrganizationOwner: mocks.assignInitialOrganizationOwner,
  revokeOfficerGrant: mocks.revokeOfficerGrant,
}));
vi.mock('../src/paymentsAdapter', () => ({
  attachAuthToPaymentRequest: mocks.attachAuthToPaymentRequest,
  sendPaymentResult: mocks.sendPaymentResult,
  paymentHandlers: mocks.paymentHandlers,
}));
vi.mock('../src/content/service', () => ({
  addAnnouncementComment: mocks.addAnnouncementComment,
  createAnnouncement: mocks.createAnnouncement,
  createAnnouncementImageTarget: mocks.createAnnouncementImageTarget,
  createDateEntry: mocks.createDateEntry,
  createLogoImageTarget: mocks.createLogoImageTarget,
  deleteAnnouncement: mocks.deleteAnnouncement,
  deleteDateEntry: mocks.deleteDateEntry,
  getOrganizationProfile: mocks.getOrganizationProfile,
  listAnnouncementComments: mocks.listAnnouncementComments,
  listAnnouncements: mocks.listAnnouncements,
  listDateEntries: mocks.listDateEntries,
  listOrganizations: mocks.listOrganizations,
  scopedDateEntryQuery: mocks.scopedDateEntryQuery,
  setAnnouncementLike: mocks.setAnnouncementLike,
  updateDateEntry: mocks.updateDateEntry,
  updateOrganizationProfile: mocks.updateOrganizationProfile,
}));
vi.mock('../src/requests/service', () => ({ requestService: mocks.requestService }));

async function withApiServer(run: (baseUrl: string) => Promise<void>) {
  const { createApiApp } = await import('../src/http/api');
  const server = createServer(createApiApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP test server address.');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe('SOAR HTTP route contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireBearerToken.mockResolvedValue({ uid: 'user1', email_verified: true });
    mocks.paymentHandlers.mockReturnValue({
      paymongoWebhook: vi.fn(async () => ({ status: 200, body: { received: true } })),
      startRegistrationPayment: vi.fn(async () => ({ status: 200, body: { intentId: 'intent1' } })),
      getCheckoutStatus: vi.fn(async () => ({ status: 200, body: { intentId: 'intent1', status: 'pending' } })),
      registerAccount: vi.fn(async () => ({ status: 201, body: { uid: 'user1' } })),
      recoverPaidRegistration: vi.fn(async () => ({ status: 200, body: { recovered: true } })),
      requestManualRenewal: vi.fn(async () => ({ status: 200, body: { renewalId: 'renewal1' } })),
      getAccessStatus: vi.fn(async () => ({ status: 200, body: { status: 'active' } })),
    });
    mocks.scopedDateEntryQuery.mockImplementation((orgId: string, query: unknown) => ({ ...(query as object), organizationId: orgId }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves health without authentication on bare and /api paths', async () => {
    await withApiServer(async (baseUrl) => {
      for (const path of ['/health', '/api/health']) {
        const response = await fetch(`${baseUrl}${path}`);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ ok: true, service: 'soar-backend' });
      }
    });
  });

  it('returns authenticated session payloads through the /api prefix', async () => {
    mocks.getUserSession.mockResolvedValue({ uid: 'user1', email: 'user@example.test', access: { status: 'active' } });

    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/session`, { headers: { authorization: 'Bearer test-token' } });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ uid: 'user1' });
    });

    expect(mocks.requireBearerToken).toHaveBeenCalled();
    expect(mocks.getUserSession).toHaveBeenCalledWith({ uid: 'user1', email_verified: true });
  });

  it('keeps content mutations behind the established organization route contract', async () => {
    mocks.createDateEntry.mockResolvedValue({ id: 'date1', organizationId: 'robotics', kind: 'availability' });

    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/organizations/robotics/date-entries`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'availability', title: 'Interview', date: '2026-11-12', details: 'Request a slot.' }),
      });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ id: 'date1', kind: 'availability' });
    });

    expect(mocks.createDateEntry).toHaveBeenCalledWith(
      { uid: 'user1', email_verified: true },
      'robotics',
      { kind: 'availability', title: 'Interview', date: '2026-11-12', details: 'Request a slot.' },
    );
  });

  it('mounts request workflow routes with explicit application confirmation', async () => {
    mocks.requestService.confirmExternalApplication.mockResolvedValue({ id: 'app1', stage: 'Pending' });

    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/requests/applications/confirm`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId: 'robotics',
          opportunityId: 'robotics-build-team-2026',
          externalFormOpened: true,
          confirmedExternalSubmission: true,
        }),
      });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ id: 'app1', stage: 'Pending' });
    });

    expect(mocks.requestService.confirmExternalApplication).toHaveBeenCalledWith(
      { uid: 'user1', email_verified: true },
      {
        organizationId: 'robotics',
        opportunityId: 'robotics-build-team-2026',
        externalFormOpened: true,
        confirmedExternalSubmission: true,
      },
    );
  });

  it('returns plain JSON problem responses for app errors and unknown routes', async () => {
    mocks.listOrganizations.mockRejectedValue(new AppError('access_inactive', 'Renew annual access before using the main app.', 403, 'renew_access'));

    await withApiServer(async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/api/organizations`, { headers: { authorization: 'Bearer test-token' } });
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toEqual({
        code: 'access_inactive',
        message: 'Renew annual access before using the main app.',
        action: 'renew_access',
      });

      const missing = await fetch(`${baseUrl}/api/nope`);
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toEqual({ code: 'not_found', message: 'Endpoint not found.' });
    });
  });
});
