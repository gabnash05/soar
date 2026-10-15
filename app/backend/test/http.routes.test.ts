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
  createAnnouncementMediaTargets: vi.fn(),
  createAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  deleteAnnouncementComment: vi.fn(),
  getAnnouncement: vi.fn(),
  getStudentDepartmentCounts: vi.fn(),
  setAnnouncementLike: vi.fn(),
  listAnnouncementComments: vi.fn(),
  addAnnouncementComment: vi.fn(),
  updateAnnouncementComment: vi.fn(),
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
    createMeetingDocumentTarget: vi.fn(),
    requestMeeting: vi.fn(),
    listMyMeetings: vi.fn(),
    getMeetingDocument: vi.fn(),
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
  createAnnouncementMediaTargets: mocks.createAnnouncementMediaTargets,
  createDateEntry: mocks.createDateEntry,
  createLogoImageTarget: mocks.createLogoImageTarget,
  deleteAnnouncement: mocks.deleteAnnouncement,
  deleteAnnouncementComment: mocks.deleteAnnouncementComment,
  deleteDateEntry: mocks.deleteDateEntry,
  getAnnouncement: mocks.getAnnouncement,
  getOrganizationProfile: mocks.getOrganizationProfile,
  getStudentDepartmentCounts: mocks.getStudentDepartmentCounts,
  listAnnouncementComments: mocks.listAnnouncementComments,
  listAnnouncements: mocks.listAnnouncements,
  listDateEntries: mocks.listDateEntries,
  listOrganizations: mocks.listOrganizations,
  scopedDateEntryQuery: mocks.scopedDateEntryQuery,
  setAnnouncementLike: mocks.setAnnouncementLike,
  updateAnnouncementComment: mocks.updateAnnouncementComment,
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

  it('allows credentialed browser requests only from the configured app origin', async () => {
    const previousAppUrl = process.env.SOAR_APP_BASE_URL;
    process.env.SOAR_APP_BASE_URL = 'http://127.0.0.1:45656';
    try {
      await withApiServer(async (baseUrl) => {
        const allowed = await fetch(`${baseUrl}/session`, {
          method: 'OPTIONS',
          headers: {
            origin: 'http://127.0.0.1:45656',
            'access-control-request-method': 'GET',
            'access-control-request-headers': 'authorization',
          },
        });
        expect(allowed.status).toBe(204);
        expect(allowed.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:45656');
        expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

        const untrusted = await fetch(`${baseUrl}/session`, {
          method: 'OPTIONS',
          headers: {
            origin: 'https://untrusted.example',
            'access-control-request-method': 'GET',
            'access-control-request-headers': 'authorization',
          },
        });
        expect(untrusted.status).toBe(404);
        expect(untrusted.headers.get('access-control-allow-origin')).toBeNull();
        expect(untrusted.headers.get('access-control-allow-credentials')).toBeNull();
      });
    } finally {
      if (previousAppUrl === undefined) delete process.env.SOAR_APP_BASE_URL;
      else process.env.SOAR_APP_BASE_URL = previousAppUrl;
    }
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

  it('mounts department counts and revised announcement routes without exposing student lists', async () => {
    mocks.getStudentDepartmentCounts.mockResolvedValue({ organizationId: 'computer-engineering', department: 'Computer Engineering Department', departmentKey: 'computer engineering department', registeredStudentCount: 2 });
    mocks.createAnnouncementMediaTargets.mockResolvedValue({ announcementId: 'post1', items: [] });
    mocks.updateAnnouncementComment.mockResolvedValue({ id: 'comment1', body: 'Updated', viewerCanEdit: true });
    mocks.deleteAnnouncementComment.mockResolvedValue({ announcementId: 'post1', commentId: 'comment1', deleted: true });
    mocks.getAnnouncement.mockResolvedValue({ id: 'post1', deepLinkPath: '/app?announcementId=post1' });

    await withApiServer(async (baseUrl) => {
      const departmentStats = await fetch(`${baseUrl}/api/organizations/computer-engineering/student-department-counts`, { headers: { authorization: 'Bearer test-token' } });
      expect(departmentStats.status).toBe(200);
      await expect(departmentStats.json()).resolves.toMatchObject({ department: 'Computer Engineering Department', registeredStudentCount: 2 });

      const removedAdminStats = await fetch(`${baseUrl}/api/admin/statistics`, { headers: { authorization: 'Bearer test-token' } });
      expect(removedAdminStats.status).toBe(404);

      await expect((await fetch(`${baseUrl}/api/announcements/post1`, { headers: { authorization: 'Bearer test-token' } })).json()).resolves.toMatchObject({ deepLinkPath: '/app?announcementId=post1' });
      expect((await fetch(`${baseUrl}/api/organizations/robotics/announcements/media-targets`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ files: [{ fileName: 'a.png', contentType: 'image/png', sizeBytes: 12 }] }),
      })).status).toBe(201);
      expect((await fetch(`${baseUrl}/api/announcements/post1/comments/comment1`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Updated' }),
      })).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/announcements/post1/comments/comment1`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer test-token' },
      })).status).toBe(200);
    });

    expect(mocks.getStudentDepartmentCounts).toHaveBeenCalledWith({ uid: 'user1', email_verified: true }, 'computer-engineering');
    expect(mocks.createAnnouncementMediaTargets).toHaveBeenCalled();
    expect(mocks.updateAnnouncementComment).toHaveBeenCalled();
    expect(mocks.deleteAnnouncementComment).toHaveBeenCalled();
  });

  it('mounts request workflow routes with explicit application confirmation', async () => {
    mocks.requestService.confirmExternalApplication.mockResolvedValue({ id: 'app1', stage: 'Pending' });
    mocks.requestService.createMeetingDocumentTarget.mockResolvedValue({ meetingRequestId: 'meeting1', storagePath: 'meeting-request-documents/robotics/meeting1/formal-request.pdf' });

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

      const target = await fetch(`${baseUrl}/api/requests/meetings/document-targets`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId: 'robotics', dateEntryId: 'date1', requestedDate: '2026-11-12', requestedTime: '14:00', fileName: 'formal-request.pdf', contentType: 'application/pdf', sizeBytes: 1024 }),
      });
      expect(target.status).toBe(201);
      await expect(target.json()).resolves.toMatchObject({ meetingRequestId: 'meeting1' });
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
    expect(mocks.requestService.createMeetingDocumentTarget).toHaveBeenCalled();
  });

  it('returns plain JSON problem responses for app errors and unknown routes', async () => {
    mocks.listOrganizations.mockRejectedValue(new AppError('access_inactive', 'Renew SOAR access before using the main app.', 403, 'renew_access'));

    await withApiServer(async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/api/organizations`, { headers: { authorization: 'Bearer test-token' } });
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toEqual({
        code: 'access_inactive',
        message: 'Renew SOAR access before using the main app.',
        action: 'renew_access',
      });

      const missing = await fetch(`${baseUrl}/api/nope`);
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toEqual({ code: 'not_found', message: 'Endpoint not found.' });
    });
  });
});
