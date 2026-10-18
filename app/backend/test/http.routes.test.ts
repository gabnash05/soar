import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors';

const mocks = vi.hoisted(() => ({
  requireBearerToken: vi.fn(),
  getUserSession: vi.fn(),
  createUnpaidPreviewAccount: vi.fn(),
  updateDisplayName: vi.fn(),
  requestVerifiedEmailChange: vi.fn(),
  approveOfficerGrant: vi.fn(),
  assignAdminOfficerGrant: vi.fn(),
  assignInitialOrganizationOwner: vi.fn(),
  listAdminOfficerGrants: vi.fn(),
  listAdminOrganizations: vi.fn(),
  revokeAdminOfficerGrant: vi.fn(),
  searchAdminStudents: vi.fn(),
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
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  deleteAnnouncementComment: vi.fn(),
  getAnnouncement: vi.fn(),
  getMediaDownloadUrl: vi.fn(),
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
vi.mock('../src/identity/previewRegistration', () => ({ createUnpaidPreviewAccount: mocks.createUnpaidPreviewAccount }));
vi.mock('../src/identity/accountSettings', () => ({
  updateDisplayName: mocks.updateDisplayName,
  requestVerifiedEmailChange: mocks.requestVerifiedEmailChange,
}));
vi.mock('../src/organizations/service', () => ({
  approveOfficerGrant: mocks.approveOfficerGrant,
  assignAdminOfficerGrant: mocks.assignAdminOfficerGrant,
  assignInitialOrganizationOwner: mocks.assignInitialOrganizationOwner,
  listAdminOfficerGrants: mocks.listAdminOfficerGrants,
  listAdminOrganizations: mocks.listAdminOrganizations,
  revokeAdminOfficerGrant: mocks.revokeAdminOfficerGrant,
  revokeOfficerGrant: mocks.revokeOfficerGrant,
  searchAdminStudents: mocks.searchAdminStudents,
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
  getMediaDownloadUrl: mocks.getMediaDownloadUrl,
  getOrganizationProfile: mocks.getOrganizationProfile,
  getStudentDepartmentCounts: mocks.getStudentDepartmentCounts,
  listAnnouncementComments: mocks.listAnnouncementComments,
  listAnnouncements: mocks.listAnnouncements,
  listDateEntries: mocks.listDateEntries,
  listOrganizations: mocks.listOrganizations,
  scopedDateEntryQuery: mocks.scopedDateEntryQuery,
  setAnnouncementLike: mocks.setAnnouncementLike,
  updateAnnouncement: mocks.updateAnnouncement,
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
    mocks.createUnpaidPreviewAccount.mockResolvedValue({ uid: 'user1', created: true, access: { status: 'active', provenance: 'unpaid-preview' } });
    mocks.paymentHandlers.mockReturnValue({
      paymongoWebhook: vi.fn(async () => ({ status: 200, body: { received: true } })),
      startRegistrationPayment: vi.fn(async () => ({ status: 200, body: { intentId: 'intent1' } })),
      getCheckoutStatus: vi.fn(async () => ({ status: 200, body: { intentId: 'intent1', status: 'pending' } })),
      registerAccount: vi.fn(async () => ({ status: 201, body: { uid: 'user1' } })),
      recoverPaidRegistration: vi.fn(async () => ({ status: 200, body: { recovered: true } })),
      acceptPaidRegistrationRecovery: vi.fn(async () => ({ status: 200, body: { accepted: true } })),
      requestManualRenewal: vi.fn(async () => ({ status: 200, body: { renewalId: 'renewal1' } })),
      getRenewalStatus: vi.fn(async () => ({ status: 200, body: { renewalId: 'renewal1', status: 'pending' } })),
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

  it('returns an authenticated signed-media URL without exposing storage credentials', async () => {
    const user = { uid: 'user1', email_verified: true };
    const path = 'announcement-images/org-1/post-1/photo.png';
    mocks.requireBearerToken.mockResolvedValue(user);
    mocks.getMediaDownloadUrl.mockResolvedValue({ url: 'https://project.supabase.co/storage/v1/object/sign/private/photo.png?token=short-lived' });

    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/storage/download-url?path=${encodeURIComponent(path)}`, {
        headers: { authorization: 'Bearer test-token' },
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ url: 'https://project.supabase.co/storage/v1/object/sign/private/photo.png?token=short-lived' });
    });

    expect(mocks.getMediaDownloadUrl).toHaveBeenCalledWith(user, path);
  });

  it('disables payment and registration routes in an unpaid preview without invoking provider handlers', async () => {
    const previous = process.env.SOAR_DISABLE_PAYMENTS;
    process.env.SOAR_DISABLE_PAYMENTS = 'true';
    try {
      await withApiServer(async (baseUrl) => {
        const registration = await fetch(`${baseUrl}/payments/registration/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(registration.status).toBe(503);
        await expect(registration.json()).resolves.toMatchObject({ code: 'payments_unavailable' });

        const webhook = await fetch(`${baseUrl}/webhooks/paymongo`, { method: 'POST', body: '{}' });
        expect(webhook.status).toBe(503);
        await expect(webhook.json()).resolves.toMatchObject({ code: 'payments_unavailable' });
      });
      expect(mocks.paymentHandlers).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.SOAR_DISABLE_PAYMENTS;
      else process.env.SOAR_DISABLE_PAYMENTS = previous;
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

  it('saves a self-authenticated unpaid preview account without passing a password to the backend', async () => {
    const profile = {
      role: 'student',
      displayName: 'Mara Santos',
      studentId: '2026-0001',
      department: 'Computer Engineering Department',
    };
    mocks.requireBearerToken.mockResolvedValueOnce({ uid: 'user1', email: 'user@example.edu', email_verified: true });
    const previousPaymentsSetting = process.env.SOAR_DISABLE_PAYMENTS;
    process.env.SOAR_DISABLE_PAYMENTS = 'true';

    try {
      await withApiServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/accounts/preview-registration`, {
          method: 'POST',
          headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
          body: JSON.stringify(profile),
        });
        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
          uid: 'user1',
          created: true,
          access: { status: 'active', provenance: 'unpaid-preview' },
        });
      });
    } finally {
      if (previousPaymentsSetting === undefined) delete process.env.SOAR_DISABLE_PAYMENTS;
      else process.env.SOAR_DISABLE_PAYMENTS = previousPaymentsSetting;
    }

    expect(mocks.requireBearerToken).toHaveBeenCalled();
    expect(mocks.createUnpaidPreviewAccount).toHaveBeenCalledWith({ uid: 'user1', email: 'user@example.edu', email_verified: true }, profile);
    expect(JSON.stringify(mocks.createUnpaidPreviewAccount.mock.calls)).not.toContain('password');
  });

  it('preserves the name-save response DTO without claiming it is a complete session', async () => {
    const user = { uid: 'user1', email_verified: true };
    const result = { displayName: 'New Name', nextChangeAllowedAt: '2030-01-01T00:00:00.000Z' };
    mocks.requireBearerToken.mockResolvedValue(user);
    mocks.updateDisplayName.mockResolvedValue(result);

    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/account/display-name`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'New Name' }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(result);
    });

    expect(mocks.updateDisplayName).toHaveBeenCalledWith(user, { displayName: 'New Name' });
    expect(mocks.getUserSession).not.toHaveBeenCalled();
  });

  it('returns cooldown retry timing as structured data with a safe plain-language message', async () => {
    const nextChangeAllowedAt = '2030-01-02T03:04:05.000Z';
    mocks.updateDisplayName.mockRejectedValue(new AppError(
      'name_change_cooldown',
      'Name changes are limited to once every 30 days. Please try again later.',
      409,
      undefined,
      nextChangeAllowedAt,
    ));

    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/account/display-name`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'New Name' }),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        code: 'name_change_cooldown',
        message: 'Name changes are limited to once every 30 days. Please try again later.',
        nextChangeAllowedAt,
      });
    });
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

  it('uses the existing organization profile patch contract for intake changes', async () => {
    const user = { uid: 'approved-officer', email_verified: true };
    const updatedProfile = { id: 'robotics', applicationsOpen: false };
    mocks.requireBearerToken.mockResolvedValue(user);
    mocks.updateOrganizationProfile.mockResolvedValue(updatedProfile);

    await withApiServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/organizations/robotics`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ applicationsOpen: false }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(updatedProfile);
    });

    expect(mocks.updateOrganizationProfile).toHaveBeenCalledWith(user, 'robotics', { applicationsOpen: false });
  });

  it('mounts department counts and revised announcement routes without exposing student lists', async () => {
    mocks.getStudentDepartmentCounts.mockResolvedValue({ organizationId: 'computer-engineering', department: 'Computer Engineering Department', departmentKey: 'computer engineering department', registeredStudentCount: 2 });
    mocks.createAnnouncementMediaTargets.mockResolvedValue({ announcementId: 'post1', items: [] });
    mocks.updateAnnouncement.mockResolvedValue({ id: 'post1', body: 'Revised post' });
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
      expect((await fetch(`${baseUrl}/api/organizations/robotics/announcements/post1`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'Revised post' }),
      })).status).toBe(200);
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
    expect(mocks.updateAnnouncement).toHaveBeenCalledWith({ uid: 'user1', email_verified: true }, 'robotics', 'post1', { body: 'Revised post' });
    expect(mocks.updateAnnouncementComment).toHaveBeenCalled();
    expect(mocks.deleteAnnouncementComment).toHaveBeenCalled();
  });

  it('keeps admin provisioning routes behind the trusted soarAdmin claim', async () => {
    mocks.requireBearerToken.mockRejectedValueOnce(new AppError('unauthenticated', 'Sign in is required.', 401));

    await withApiServer(async (baseUrl) => {
      const publicSearch = await fetch(`${baseUrl}/api/admin/students?q=Mara`);
      expect(publicSearch.status).toBe(401);

      const ordinarySearch = await fetch(`${baseUrl}/api/admin/students?q=Mara`, { headers: { authorization: 'Bearer test-token' } });
      expect(ordinarySearch.status).toBe(403);
      const ordinaryOrganizations = await fetch(`${baseUrl}/api/admin/organizations`, { headers: { authorization: 'Bearer test-token' } });
      expect(ordinaryOrganizations.status).toBe(403);
      const ordinaryOfficerList = await fetch(`${baseUrl}/api/admin/organizations/robotics/officer-grants`, { headers: { authorization: 'Bearer test-token' } });
      expect(ordinaryOfficerList.status).toBe(403);
      const ordinaryOfficerRevoke = await fetch(`${baseUrl}/api/admin/organizations/robotics/officer-grants/student-1`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer test-token' },
      });
      expect(ordinaryOfficerRevoke.status).toBe(403);
      const ordinaryAssignment = await fetch(`${baseUrl}/api/admin/organizations/robotics/officer-grants`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ uid: 'student-1' }),
      });
      expect(ordinaryAssignment.status).toBe(403);
      const ordinaryCreate = await fetch(`${baseUrl}/api/admin/organizations`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(ordinaryCreate.status).toBe(403);
    });

    expect(mocks.searchAdminStudents).not.toHaveBeenCalled();
    expect(mocks.listAdminOrganizations).not.toHaveBeenCalled();
    expect(mocks.assignAdminOfficerGrant).not.toHaveBeenCalled();
    expect(mocks.assignInitialOrganizationOwner).not.toHaveBeenCalled();
    expect(mocks.listAdminOfficerGrants).not.toHaveBeenCalled();
    expect(mocks.revokeAdminOfficerGrant).not.toHaveBeenCalled();
  });

  it('serves bounded admin student and organization results and idempotent scoped grants', async () => {
    mocks.requireBearerToken.mockResolvedValue({ uid: 'trusted-admin', email_verified: true, soarAdmin: true });
    mocks.searchAdminStudents.mockResolvedValue({ items: [{ uid: 'student-1', displayName: 'Mara Santos' }] });
    mocks.listAdminOrganizations.mockResolvedValue({ items: [{ id: 'robotics', name: 'Robotics Club' }] });
    mocks.assignInitialOrganizationOwner.mockResolvedValue({ orgId: 'robotics' });
    mocks.assignAdminOfficerGrant.mockResolvedValue({ orgId: 'robotics', uid: 'student-1', status: 'approved', alreadyAssigned: true });
    mocks.listAdminOfficerGrants.mockResolvedValue({ items: [{ uid: 'student-1', displayName: 'Mara Santos', status: 'active', isOrganizationOwner: false }] });
    mocks.revokeAdminOfficerGrant.mockResolvedValue({ orgId: 'robotics', uid: 'student-1', status: 'revoked', alreadyRevoked: false });

    await withApiServer(async (baseUrl) => {
      const students = await fetch(`${baseUrl}/api/admin/students?q=Mara`, { headers: { authorization: 'Bearer test-token' } });
      expect(students.status).toBe(200);
      await expect(students.json()).resolves.toEqual({ items: [{ uid: 'student-1', displayName: 'Mara Santos' }] });

      const organizations = await fetch(`${baseUrl}/api/admin/organizations`, { headers: { authorization: 'Bearer test-token' } });
      expect(organizations.status).toBe(200);
      await expect(organizations.json()).resolves.toEqual({ items: [{ id: 'robotics', name: 'Robotics Club' }] });

      const created = await fetch(`${baseUrl}/api/admin/organizations`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ orgId: 'robotics', name: 'Robotics Club', slug: 'robotics', ownerUid: 'student-1' }),
      });
      expect(created.status).toBe(201);

      const officers = await fetch(`${baseUrl}/api/admin/organizations/robotics/officer-grants?limit=25`, { headers: { authorization: 'Bearer test-token' } });
      expect(officers.status).toBe(200);
      await expect(officers.json()).resolves.toMatchObject({ items: [{ uid: 'student-1', status: 'active' }] });

      const revoked = await fetch(`${baseUrl}/api/admin/organizations/robotics/officer-grants/student-1`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer test-token' },
      });
      expect(revoked.status).toBe(200);
      await expect(revoked.json()).resolves.toMatchObject({ status: 'revoked', alreadyRevoked: false });

      const assignment = await fetch(`${baseUrl}/api/admin/organizations/robotics/officer-grants`, {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ uid: 'student-1' }),
      });
      expect(assignment.status).toBe(200);
      await expect(assignment.json()).resolves.toMatchObject({ alreadyAssigned: true });
    });

    expect(mocks.searchAdminStudents).toHaveBeenCalledWith({ q: 'Mara' });
    expect(mocks.listAdminOrganizations).toHaveBeenCalledWith({});
    expect(mocks.assignInitialOrganizationOwner).toHaveBeenCalledWith(
      { orgId: 'robotics', name: 'Robotics Club', slug: 'robotics', ownerUid: 'student-1' },
      'trusted-admin',
    );
    expect(mocks.assignAdminOfficerGrant).toHaveBeenCalledWith('robotics', { uid: 'student-1' }, 'trusted-admin');
    expect(mocks.listAdminOfficerGrants).toHaveBeenCalledWith('robotics', { limit: '25' });
    expect(mocks.revokeAdminOfficerGrant).toHaveBeenCalledWith('robotics', 'student-1', 'trusted-admin');
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

  it('disables payment actions while preserving authenticated access-status reads in preview mode', async () => {
    const previous = process.env.SOAR_DISABLE_PAYMENTS;
    process.env.SOAR_DISABLE_PAYMENTS = 'true';
    try {
      const handlers = mocks.paymentHandlers();
      await withApiServer(async (baseUrl) => {
        const start = await fetch(`${baseUrl}/api/payments/registration/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        expect(start.status).toBe(503);

        const recovery = await fetch(`${baseUrl}/api/payments/registration/recover/accept`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ intentId: 'intent1', recoveryCode: 'code' }),
        });
        expect(recovery.status).toBe(503);

        const renewal = await fetch(`${baseUrl}/api/payments/renewals/status?renewalId=renewal1`, {
          headers: { authorization: 'Bearer test-token' },
        });
        expect(renewal.status).toBe(503);

        const access = await fetch(`${baseUrl}/api/payments/access/status`, {
          headers: { authorization: 'Bearer test-token' },
        });
        expect(access.status).toBe(200);
        await expect(access.json()).resolves.toMatchObject({ status: 'active' });
      });
      expect(handlers.startRegistrationPayment).not.toHaveBeenCalled();
      expect(handlers.acceptPaidRegistrationRecovery).not.toHaveBeenCalled();
      expect(handlers.getRenewalStatus).not.toHaveBeenCalled();
      expect(handlers.getAccessStatus).toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.SOAR_DISABLE_PAYMENTS;
      else process.env.SOAR_DISABLE_PAYMENTS = previous;
    }
  });

  it('mounts paid-registration recovery and same-user renewal status routes under /api', async () => {
    const handlers = mocks.paymentHandlers();

    await withApiServer(async (baseUrl) => {
      const accepted = await fetch(`${baseUrl}/api/payments/registration/recover/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intentId: 'intent1', recoveryCode: 'one-time-code' }),
      });
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toEqual({ accepted: true });

      const renewal = await fetch(`${baseUrl}/api/payments/renewals/status?renewalId=renewal1`, {
        headers: { authorization: 'Bearer test-token' },
      });
      expect(renewal.status).toBe(200);
      await expect(renewal.json()).resolves.toMatchObject({ renewalId: 'renewal1', status: 'pending' });
    });

    expect(handlers.acceptPaidRegistrationRecovery).toHaveBeenCalled();
    expect(mocks.requireBearerToken).toHaveBeenCalled();
    expect(handlers.getRenewalStatus).toHaveBeenCalled();
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
