import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../../../lib/contracts';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  authHeaders: vi.fn(async () => ({ Authorization: 'Bearer synthetic-test-token' })),
  storageDownloadUrl: vi.fn(async () => 'https://storage.test/announcement.png'),
  uploadMeetingDocumentToTarget: vi.fn(),
  uploadToStorageTarget: vi.fn(),
}));

vi.mock('../../../lib/apiClient', () => ({
  apiFetch: mocks.apiFetch,
  authHeaders: mocks.authHeaders,
}));

vi.mock('../../../lib/storageUploads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/storageUploads')>();
  return {
    ...actual,
    storageDownloadUrl: mocks.storageDownloadUrl,
    uploadMeetingDocumentToTarget: mocks.uploadMeetingDocumentToTarget,
    uploadToStorageTarget: mocks.uploadToStorageTarget,
  };
});

import { createProductionWorkflowDataClient } from '../apiClient';

const session: UserSession = {
  uid: 'synthetic-student',
  email: 'student@example.test',
  displayName: 'Demo Student',
  accountKind: 'student',
  emailVerified: true,
  access: {
    status: 'active',
    annualFeePhp: 10,
    feePhp: 10,
    periodMonths: 6,
    periodLabel: '6 months',
    renewalAvailable: false,
  },
  officerGrants: [],
};

function mockAnnouncementApi() {
  mocks.apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/announcements/media-targets')) {
      return {
        announcementId: 'post-image-test',
        items: [{
          announcementId: 'post-image-test',
          storagePath: 'announcement-images/org-test/post-image-test/photo.png',
          contentType: 'image/png',
          sizeBytes: 4,
        }],
      };
    }

    if (path.endsWith('/announcements')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return {
        id: body.announcementId ?? 'post-image-test',
        announcementId: body.announcementId ?? 'post-image-test',
        orgId: 'org-test',
        organizationName: 'Test Organization',
        body: body.body,
        image: null,
        media: body.media ?? [],
        likeCount: 0,
        commentCount: 0,
        createdAt: '2026-10-15T00:00:00.000Z',
      };
    }

    throw new Error(`Unexpected API request: ${path}`);
  });
}

describe('production comment author role projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authHeaders.mockResolvedValue({ Authorization: 'Bearer synthetic-test-token' });
  });

  it('maps only supported student and parent-organization officer projections', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ items: [
      { id: 'student-comment', authorName: 'Student One', authorAccountKind: 'student', body: 'Student comment', createdAt: '2026-10-15T00:00:00.000Z' },
      { id: 'officer-comment', authorName: 'Officer One', authorAccountKind: 'student', authorOrganizationRole: 'approved_officer', body: 'Officer comment', createdAt: '2026-10-15T00:01:00.000Z' },
      { id: 'sponsor-comment', authorName: 'Sponsor One', authorAccountKind: 'sponsor', authorOrganizationRole: 'approved_officer', companyName: 'Private Co', body: 'Sponsor comment', createdAt: '2026-10-15T00:02:00.000Z' },
      { id: 'unknown-comment', authorName: 'Unknown One', authorAccountKind: 'admin', authorOrganizationRole: 'global_officer', email: 'private@example.test', body: 'Unknown account comment', createdAt: '2026-10-15T00:03:00.000Z' },
    ] });
    const client = createProductionWorkflowDataClient();

    const { data } = await client.listAnnouncementComments('role-post', session);

    expect(data[0]).toMatchObject({ authorAccountKind: 'student' });
    expect(data[0]).not.toHaveProperty('authorOrganizationRole');
    expect(data[1]).toMatchObject({ authorAccountKind: 'student', authorOrganizationRole: 'approved_officer' });
    expect(data[2]).not.toHaveProperty('authorAccountKind');
    expect(data[2]).not.toHaveProperty('authorOrganizationRole');
    expect(data[3]).not.toHaveProperty('authorAccountKind');
    expect(data[3]).not.toHaveProperty('authorOrganizationRole');
    expect(data[3]).not.toHaveProperty('email');
    expect(data[3]).not.toHaveProperty('companyName');
  });
});

describe('production announcement media payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authHeaders.mockResolvedValue({ Authorization: 'Bearer synthetic-test-token' });
    mocks.storageDownloadUrl.mockResolvedValue('https://storage.test/announcement.png');
  });

  it('requests announcement pages with a bounded size and forwards the server cursor', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce({
        items: [{ id: 'page-one', orgId: 'org-test', organizationName: 'Test Organization', body: 'First page', createdAt: '2026-10-15T00:00:00.000Z' }],
        nextPageToken: 'cursor-15',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'page-two', orgId: 'org-test', organizationName: 'Test Organization', body: 'Second page', createdAt: '2026-10-14T00:00:00.000Z' }],
      });
    const client = createProductionWorkflowDataClient();

    const first = await client.listAnnouncements(session, { limit: 15 });
    const second = await client.listAnnouncements(session, { limit: 15, pageToken: first.data.nextPageToken });

    expect(first.data.items.map((item) => item.id)).toEqual(['page-one']);
    expect(first.data.nextPageToken).toBe('cursor-15');
    expect(second.data.items.map((item) => item.id)).toEqual(['page-two']);
    expect(mocks.apiFetch.mock.calls.map(([path]) => path)).toEqual([
      '/announcements?limit=15',
      '/announcements?limit=15&pageToken=cursor-15',
    ]);
  });

  it('loads one announcement by id for a direct link and treats a server 404 as missing', async () => {
    const client = createProductionWorkflowDataClient();
    mocks.apiFetch.mockResolvedValueOnce({ id: 'linked-id', orgId: 'org-test', organizationName: 'Test Organization', body: 'Linked post', createdAt: '2026-10-15T00:00:00.000Z' });

    const found = await client.getAnnouncement('linked-id', session);

    expect(found.data?.id).toBe('linked-id');
    expect(found.data?.body).toBe('Linked post');
    expect(mocks.apiFetch).toHaveBeenCalledWith('/announcements/linked-id', expect.anything());

    const missingError = Object.assign(new Error('not found'), { status: 404 });
    mocks.apiFetch.mockRejectedValueOnce(missingError);
    await expect(client.getAnnouncement('missing-id', session)).resolves.toMatchObject({ data: undefined });
    expect(mocks.apiFetch).toHaveBeenLastCalledWith('/announcements/missing-id', expect.anything());
  });

  it('sends the uploaded Storage references once under media, not as both media and legacy image', async () => {
    mockAnnouncementApi();
    mocks.uploadToStorageTarget.mockImplementation(async (
      target: { storagePath: string; contentType: string; sizeBytes: number },
      file: File,
      alt: string,
    ) => ({
      storagePath: target.storagePath,
      contentType: target.contentType,
      sizeBytes: file.size,
      url: 'https://storage.test/announcement.png',
      alt,
    }));

    const file = new File(['png!'], 'photo.png', { type: 'image/png' });
    const client = createProductionWorkflowDataClient();
    const result = await client.publishAnnouncement({
      organizationId: 'org-test',
      body: 'A supported image announcement.',
      media: [{ url: 'blob:local-preview', alt: file.name, file, contentType: file.type, sizeBytes: file.size }],
    }, session);

    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(true);
    expect(result.data?.media?.[0]).toMatchObject({
      storagePath: 'announcement-images/org-test/post-image-test/photo.png',
      contentType: 'image/png',
      url: 'https://storage.test/announcement.png',
    });

    const createCall = mocks.apiFetch.mock.calls.find(([path]) => String(path).endsWith('/announcements'));
    expect(createCall).toBeDefined();
    const payload = JSON.parse(String(createCall?.[1]?.body)) as Record<string, unknown>;
    expect(payload).toEqual({
      body: 'A supported image announcement.',
      announcementId: 'post-image-test',
      media: [{
        storagePath: 'announcement-images/org-test/post-image-test/photo.png',
        contentType: 'image/png',
        sizeBytes: file.size,
        alt: 'photo.png',
      }],
    });
    expect(payload).not.toHaveProperty('image');
  });

  it('keeps existing media references under media without adding the legacy image field', async () => {
    mockAnnouncementApi();
    const client = createProductionWorkflowDataClient();
    await client.publishAnnouncement({
      organizationId: 'org-test',
      body: 'An existing image reference.',
      media: [{
        url: 'https://storage.test/announcement.png',
        alt: 'existing.png',
        storagePath: 'announcement-images/org-test/existing/photo.png',
        contentType: 'image/png',
        sizeBytes: 4,
      }],
    }, session);

    const createCall = mocks.apiFetch.mock.calls.find(([path]) => String(path).endsWith('/announcements'));
    const payload = JSON.parse(String(createCall?.[1]?.body)) as Record<string, unknown>;
    expect(payload).toEqual({
      body: 'An existing image reference.',
      media: [{
        storagePath: 'announcement-images/org-test/existing/photo.png',
        contentType: 'image/png',
        sizeBytes: 4,
        alt: 'existing.png',
      }],
    });
    expect(payload).not.toHaveProperty('image');
    expect(mocks.uploadToStorageTarget).not.toHaveBeenCalled();
  });

  it('rejects unsupported files before requesting an upload target', async () => {
    const client = createProductionWorkflowDataClient();
    const file = new File(['not an image'], 'notes.txt', { type: 'text/plain' });

    await expect(client.publishAnnouncement({
      organizationId: 'org-test',
      body: 'Unsupported media must not upload.',
      media: [{ url: 'blob:local-preview', alt: file.name, file, contentType: file.type, sizeBytes: file.size }],
    }, session)).rejects.toThrow('Use a PNG, JPEG, GIF, or WebP image.');

    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(mocks.uploadToStorageTarget).not.toHaveBeenCalled();
  });
});

describe('production dated-entry saves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authHeaders.mockResolvedValue({ Authorization: 'Bearer synthetic-test-token' });
  });

  it('sends the stable create id with POST and forwards cancellation, but keeps edits on PATCH', async () => {
    const client = createProductionWorkflowDataClient();
    const controller = new AbortController();
    const saved = {
      id: 'entry-save-key-123', organizationId: 'org-test', organizationName: 'Test Organization',
      kind: 'event', title: 'Design night', date: '2026-12-20', details: 'Synthetic test entry.',
    };
    mocks.apiFetch.mockResolvedValue(saved);

    const created = await client.saveDateEntry({
      organizationId: 'org-test', idempotencyKey: 'entry-save-key-123', kind: 'event',
      title: 'Design night', date: '2026-12-20', details: 'Synthetic test entry.',
    }, session, controller.signal);
    expect(created.ok).toBe(true);
    const createCall = mocks.apiFetch.mock.calls[0];
    expect(createCall?.[0]).toBe('/organizations/org-test/date-entries');
    expect(createCall?.[1]?.method).toBe('POST');
    expect(createCall?.[1]?.signal).toBe(controller.signal);
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      entryId: 'entry-save-key-123', kind: 'event', title: 'Design night',
      date: '2026-12-20', details: 'Synthetic test entry.',
    });

    mocks.apiFetch.mockClear();
    const updated = await client.saveDateEntry({
      organizationId: 'org-test', id: 'entry-save-key-123', idempotencyKey: 'unused-for-edits', kind: 'event',
      title: 'Design night updated', date: '2026-12-20', details: 'Synthetic edited entry.',
    }, session, controller.signal);
    expect(updated.ok).toBe(true);
    const updateCall = mocks.apiFetch.mock.calls[0];
    expect(updateCall?.[0]).toBe('/organizations/org-test/date-entries/entry-save-key-123');
    expect(updateCall?.[1]?.method).toBe('PATCH');
    expect(updateCall?.[1]?.signal).toBe(controller.signal);
    expect(JSON.parse(String(updateCall?.[1]?.body))).not.toHaveProperty('entryId');
  });
});
