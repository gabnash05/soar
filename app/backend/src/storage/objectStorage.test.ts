import { beforeEach, describe, expect, it, vi } from 'vitest';

const { defaultStorageBucket } = vi.hoisted(() => ({ defaultStorageBucket: vi.fn() }));
vi.mock('../firebase', () => ({ defaultStorageBucket }));

import {
  createSignedObjectDownloadUrl,
  createSignedObjectUploadTarget,
  deleteStoredObject,
  downloadStoredObject,
  getStoredObjectMetadata,
  isSupabaseStorageEnabled,
  listOrganizationObjects,
  SUPABASE_SIGNED_UPLOAD_MAX_TTL_SECONDS,
} from './objectStorage';

const storageBase = 'https://project.supabase.co';
const bucket = 'soar-files';
const roleKey = 'service-role-test-secret';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.stubEnv('SOAR_STORAGE_PROVIDER', 'supabase');
  vi.stubEnv('SUPABASE_URL', storageBase);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', roleKey);
  vi.stubEnv('SOAR_FILES_BUCKET', bucket);
  defaultStorageBucket.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('private Supabase object storage adapter', () => {
  it('mints a bounded signed upload URL without returning the service-role key or a private download capability', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response({ url: '/object/upload/sign/soar-files/announcement-images/org-1/post-1/photo.png?token=upload-capability' }));

    const target = await createSignedObjectUploadTarget('announcement-images/org-1/post-1/photo.png');

    expect(target).toEqual({
      signedUploadUrl: `${storageBase}/storage/v1/object/upload/sign/soar-files/announcement-images/org-1/post-1/photo.png?token=upload-capability`,
    });
    expect(JSON.stringify(target)).not.toContain(roleKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${storageBase}/storage/v1/object/upload/sign/soar-files/announcement-images/org-1/post-1/photo.png`, expect.objectContaining({ method: 'POST' }));
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${roleKey}`);
  });

  it('keeps provider target errors safe for clients while logging allowlisted codes only', async () => {
    const fetchMock = vi.mocked(fetch);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storagePath = 'announcement-images/org-1/post-1/photo.png';
    fetchMock.mockResolvedValueOnce(response({ code: 'BucketNotFound', message: `private detail ${roleKey} ${storagePath}` }, 503));

    try {
      await expect(createSignedObjectUploadTarget(storagePath)).rejects.toMatchObject({
        code: 'storage_unavailable',
        status: 503,
      });
      expect(diagnostic).toHaveBeenCalledWith('Private storage operation failed', JSON.stringify({
        operation: 'create_signed_upload_target',
        phase: 'provider_http_error',
        providerStatus: 503,
        providerErrorCode: 'BucketNotFound',
      }));
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(roleKey);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(storagePath);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private detail');
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('logs newly recognized Supabase enum codes without provider details', async () => {
    const fetchMock = vi.mocked(fetch);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storagePath = 'announcement-images/org-1/post-1/photo.png';
    fetchMock.mockResolvedValueOnce(response({
      code: 'InvalidBucketName',
      message: `private detail ${roleKey} Bearer provider-bearer-token ${storagePath} https://project.supabase.co/storage/v1/object/upload/sign/private/path?token=signed-capability`,
    }, 400));

    try {
      await expect(createSignedObjectUploadTarget(storagePath)).rejects.toMatchObject({
        code: 'storage_unavailable',
        status: 503,
      });
      expect(diagnostic).toHaveBeenCalledWith('Private storage operation failed', JSON.stringify({
        operation: 'create_signed_upload_target',
        phase: 'provider_http_error',
        providerStatus: 400,
        providerErrorCode: 'InvalidBucketName',
      }));
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(roleKey);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(storagePath);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private detail');
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('provider-bearer-token');
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('signed-capability');
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('https://project.supabase.co/storage/v1/object/upload/sign/private/path');
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('omits unrecognized provider codes and messages from diagnostics', async () => {
    const fetchMock = vi.mocked(fetch);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(response({ code: `unknown-${roleKey}`, message: 'raw provider body' }, 502));

    try {
      await expect(createSignedObjectUploadTarget('announcement-images/org-1/post-1/photo.png')).rejects.toMatchObject({
        code: 'storage_unavailable',
        status: 503,
      });
      expect(diagnostic).toHaveBeenCalledWith('Private storage operation failed', JSON.stringify({
        operation: 'create_signed_upload_target',
        phase: 'provider_http_error',
        providerStatus: 502,
      }));
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(roleKey);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('raw provider body');
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('does not mint a private PDF download capability with its upload target', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response({ url: '/object/upload/sign/soar-files/meeting-request-documents/org-1/meeting-1/request.pdf?token=upload-capability' }));

    const target = await createSignedObjectUploadTarget('meeting-request-documents/org-1/meeting-1/request.pdf');

    expect(target?.signedUploadUrl).toContain('token=upload-capability');
    expect(target).not.toHaveProperty('signedDownloadUrl');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads exact object metadata and retains only the meeting binding metadata fields', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response([{
      name: 'formal-request.pdf',
      metadata: {
        size: 4096,
        mimetype: 'application/pdf',
        orgId: 'org-1',
        meetingRequestId: 'meeting-1',
        requesterUid: 'student-1',
        unrelated: 'not returned',
      },
    }]));

    await expect(getStoredObjectMetadata('meeting-request-documents/org-1/meeting-1/formal-request.pdf')).resolves.toEqual({
      contentType: 'application/pdf',
      sizeBytes: 4096,
      customMetadata: { orgId: 'org-1', meetingRequestId: 'meeting-1', requesterUid: 'student-1' },
    });
    expect(fetchMock).toHaveBeenCalledWith(`${storageBase}/storage/v1/object/list/${bucket}`, expect.objectContaining({ method: 'POST' }));
  });

  it('downloads a private object only through a short-lived signed URL', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(response({ signedURL: '/object/sign/soar-files/meeting-request-documents/org-1/meeting-1/request.pdf?token=read-capability' }))
      .mockResolvedValueOnce(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));

    await expect(downloadStoredObject('meeting-request-documents/org-1/meeting-1/request.pdf')).resolves.toEqual(Buffer.from('%PDF'));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${storageBase}/storage/v1/object/sign/soar-files/meeting-request-documents/org-1/meeting-1/request.pdf?token=read-capability`);
  });

  it('preserves provider failures as unavailable instead of misreporting them as missing files', async () => {
    const fetchMock = vi.mocked(fetch);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(response({ signedURL: '/object/sign/soar-files/announcement-images/org-1/post-1/photo.png?token=read-capability' }))
      .mockResolvedValueOnce(new Response('upstream failure', { status: 503 }));

    try {
      await expect(downloadStoredObject('announcement-images/org-1/post-1/photo.png')).rejects.toMatchObject({
        code: 'storage_unavailable',
        status: 503,
      });
      expect(diagnostic).toHaveBeenCalledWith('Private storage operation failed', JSON.stringify({
        operation: 'download_object',
        phase: 'signed_download_http_error',
        providerStatus: 503,
      }));
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('rejects unsafe paths and missing Supabase configuration without exposing provider details', async () => {
    await expect(createSignedObjectDownloadUrl('../secret')).rejects.toMatchObject({ code: 'invalid_storage_path' });
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await expect(createSignedObjectDownloadUrl('announcement-images/org-1/post-1/photo.png')).rejects.toMatchObject({ code: 'storage_not_configured' });
  });

  it('rejects a non-Supabase host before sending the service-role key', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://attacker.example.test');
    await expect(createSignedObjectDownloadUrl('announcement-images/org-1/post-1/photo.png')).rejects.toMatchObject({ code: 'storage_not_configured' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records the documented two-hour signed upload maximum without changing the existing upload endpoint', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response({ url: '/object/upload/sign/soar-files/organization-logos/org-1/photo.png?token=upload-capability' }));

    await createSignedObjectUploadTarget('organization-logos/org-1/photo.png');

    expect(SUPABASE_SIGNED_UPLOAD_MAX_TTL_SECONDS).toBe(7200);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST', body: '{}' }));
  });

  it('deletes one exact Supabase object and treats a missing object as idempotent success', async () => {
    const fetchMock = vi.mocked(fetch);
    const path = 'announcement-images/org-1/post-1/photo.png';
    fetchMock
      .mockResolvedValueOnce(response([{ name: 'photo.png' }]))
      .mockResolvedValueOnce(response({ code: 'NotFound' }, 404));

    await expect(deleteStoredObject(path)).resolves.toBeUndefined();
    await expect(deleteStoredObject(path)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, `${storageBase}/storage/v1/object/${bucket}`, expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ prefixes: [path] }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${storageBase}/storage/v1/object/${bucket}`, expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ prefixes: [path] }),
    }));
  });

  it('keeps Supabase deletion errors sanitized and rejects non-organization paths before access', async () => {
    const fetchMock = vi.mocked(fetch);
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = 'meeting-request-documents/org-1/meeting-1/request.pdf';
    fetchMock.mockResolvedValueOnce(response({ code: 'Unauthorized', message: `private ${roleKey} ${path}` }, 400));

    try {
      await expect(deleteStoredObject(path)).rejects.toMatchObject({ code: 'storage_unavailable', status: 503 });
      expect(diagnostic).toHaveBeenCalledWith('Private storage operation failed', JSON.stringify({
        operation: 'delete_object',
        phase: 'provider_http_error',
        providerStatus: 400,
        providerErrorCode: 'Unauthorized',
      }));
      await expect(deleteStoredObject('unrelated-bucket/path/file')).rejects.toMatchObject({ code: 'invalid_storage_path' });
      await expect(deleteStoredObject('organization-logos/org-1/folder/')).rejects.toMatchObject({ code: 'invalid_storage_path' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(roleKey);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(path);
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('lists nested Supabase files as exact lexicographic exclusive pages under one organization prefix', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(response([
        { name: 'post-2', id: null, metadata: null },
        { name: 'post-1', id: null, metadata: null },
        { name: 'logo.png', id: 'logo-object', metadata: { size: 10 } },
      ]))
      .mockResolvedValueOnce(response([
        { name: 'b.png', id: 'b-object', metadata: { size: 20 } },
        { name: 'a.png', id: 'a-object', metadata: { size: 10 } },
        { name: 'nested', id: null, metadata: null },
      ]))
      .mockResolvedValueOnce(response([{ name: 'last.webp', id: 'nested-object', metadata: { size: 30 } }]));

    const result = await listOrganizationObjects(
      'org-1',
      'announcement-images',
      'announcement-images/org-1/post-1/a.png',
      2,
    );

    expect(result.items).toEqual([
      'announcement-images/org-1/post-1/b.png',
      'announcement-images/org-1/post-1/nested/last.webp',
    ]);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as { prefix: string });
    expect(bodies.map((body) => body.prefix)).toEqual([
      'announcement-images/org-1',
      'announcement-images/org-1/post-1',
      'announcement-images/org-1/post-1/nested',
    ]);
    expect(bodies.every((body) => !body.prefix.startsWith('announcement-images/org-10'))).toBe(true);
  });

  it('orders Supabase files and nested-folder contents by full object path', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(response([
        { name: 'post-1', id: null, metadata: null },
        { name: 'post-1.txt', id: 'root-object', metadata: { size: 3 } },
      ]))
      .mockResolvedValueOnce(response([{ name: 'a.png', id: 'nested-object', metadata: { size: 10 } }]));

    const result = await listOrganizationObjects('org-1', 'announcement-images', undefined, 2);

    expect(result.items).toEqual([
      'announcement-images/org-1/post-1.txt',
      'announcement-images/org-1/post-1/a.png',
    ]);
  });

  it('paginates Supabase listings with stable exclusive cursors and a 25-object maximum', async () => {
    const fetchMock = vi.mocked(fetch);
    const entries = Array.from({ length: 102 }, (_, i) => ({
      name: `image-${String(i).padStart(3, '0')}.png`,
      id: `object-${i}`,
      metadata: { size: i + 1 },
    }));
    fetchMock
      .mockResolvedValueOnce(response(entries.slice(0, 100)))
      .mockResolvedValueOnce(response(entries.slice(100)))
      .mockResolvedValueOnce(response(entries.slice(0, 100)))
      .mockResolvedValueOnce(response(entries.slice(100)));

    const first = await listOrganizationObjects('org-1', 'organization-logos', undefined, 25);
    const cursor = first.items.at(-1);
    const second = await listOrganizationObjects('org-1', 'organization-logos', cursor, 25);

    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(25);
    expect(first.items.at(-1)).toBe('organization-logos/org-1/image-024.png');
    expect(second.items[0]).toBe('organization-logos/org-1/image-025.png');
    expect(second.items.every((item) => item > cursor!)).toBe(true);
    expect(new Set([...first.items, ...second.items]).size).toBe(50);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).offset)).toEqual([0, 100, 0, 100]);
    await expect(listOrganizationObjects('org-1', 'organization-logos', undefined, 26)).rejects.toMatchObject({ code: 'invalid_storage_list_limit' });
    await expect(listOrganizationObjects('org-1', 'organization-logos', 'organization-logos/org-10/photo.png', 25)).rejects.toMatchObject({ code: 'invalid_storage_path' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('lists Firebase Storage objects with an exact trailing-slash prefix and ignores directory markers', async () => {
    vi.stubEnv('SOAR_STORAGE_PROVIDER', 'firebase');
    const getFiles = vi.fn().mockResolvedValue([[
      { name: 'announcement-images/org-1/post-1/c.png' },
      { name: 'announcement-images/org-1/post-1/' },
      { name: 'announcement-images/org-1/post-1/b.png' },
      { name: 'announcement-images/org-1/post-1/a.png' },
    ], {}]);
    defaultStorageBucket.mockReturnValue({ getFiles });

    const result = await listOrganizationObjects(
      'org-1',
      'announcement-images',
      'announcement-images/org-1/post-1/a.png',
      2,
    );

    expect(result.items).toEqual([
      'announcement-images/org-1/post-1/b.png',
      'announcement-images/org-1/post-1/c.png',
    ]);
    expect(getFiles).toHaveBeenCalledWith(expect.objectContaining({
      prefix: 'announcement-images/org-1/',
      startOffset: 'announcement-images/org-1/post-1/a.png',
      maxResults: 100,
      autoPaginate: false,
    }));
  });

  it('deletes one exact Firebase object and distinguishes a missing object from a missing bucket', async () => {
    vi.stubEnv('SOAR_STORAGE_PROVIDER', 'firebase');
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const missingObject = Object.assign(new Error('do not log this provider detail'), { code: 404 });
    const fileDelete = vi.fn().mockRejectedValueOnce(missingObject).mockRejectedValueOnce(missingObject);
    const bucketExists = vi.fn().mockResolvedValueOnce([true]).mockResolvedValueOnce([false]);
    const file = vi.fn(() => ({ delete: fileDelete }));
    defaultStorageBucket.mockReturnValue({ file, exists: bucketExists });
    const path = 'organization-logos/org-1/photo.png';

    try {
      await expect(deleteStoredObject(path)).resolves.toBeUndefined();
      await expect(deleteStoredObject(path)).rejects.toMatchObject({ code: 'storage_not_configured', status: 503 });
      expect(file).toHaveBeenCalledWith(path);
      expect(fileDelete).toHaveBeenCalledTimes(2);
      expect(bucketExists).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(path);
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('do not log this provider detail');
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('uses Firebase Storage unchanged unless the explicit Supabase provider is selected', async () => {
    vi.stubEnv('SOAR_STORAGE_PROVIDER', 'firebase');
    const file = { getMetadata: vi.fn().mockResolvedValue([{ size: '12', contentType: 'image/png', metadata: { alt: 'photo' } }]) };
    defaultStorageBucket.mockReturnValue({ file: vi.fn(() => file) });

    expect(isSupabaseStorageEnabled()).toBe(false);
    await expect(getStoredObjectMetadata('announcement-images/org-1/post-1/photo.png')).resolves.toEqual({
      contentType: 'image/png',
      sizeBytes: 12,
      customMetadata: { alt: 'photo' },
    });
  });
});
