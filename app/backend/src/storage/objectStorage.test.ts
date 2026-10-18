import { beforeEach, describe, expect, it, vi } from 'vitest';

const { defaultStorageBucket } = vi.hoisted(() => ({ defaultStorageBucket: vi.fn() }));
vi.mock('../firebase', () => ({ defaultStorageBucket }));

import {
  createSignedObjectDownloadUrl,
  createSignedObjectUploadTarget,
  downloadStoredObject,
  getStoredObjectMetadata,
  isSupabaseStorageEnabled,
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
