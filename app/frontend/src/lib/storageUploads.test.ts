import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assertApiBase, authHeaders, getFirebaseRuntime } = vi.hoisted(() => ({
  assertApiBase: vi.fn(() => 'https://api.example.test'),
  authHeaders: vi.fn(async () => ({ Authorization: 'Bearer firebase-id-token' })),
  getFirebaseRuntime: vi.fn(() => ({ storage: undefined })),
}));

vi.mock('./apiClient', () => ({ assertApiBase, authHeaders }));
vi.mock('./firebase', () => ({ getFirebaseRuntime }));
vi.mock('@firebase/storage', () => ({ getDownloadURL: vi.fn(), ref: vi.fn(), uploadBytes: vi.fn() }));

import { storageDownloadUrl, uploadMeetingDocumentToTarget, uploadToStorageTarget } from './storageUploads';

beforeEach(() => {
  vi.stubEnv('VITE_SOAR_STORAGE_PROVIDER', 'supabase');
  vi.stubGlobal('fetch', vi.fn());
});

describe('Supabase private-storage browser adapter', () => {
  it('uploads images through a bounded signed target and returns the signed preview URL', async () => {
    const file = new File(['image-bytes'], 'logo.png', { type: 'image/png' });
    const target = {
      storagePath: 'organization-logos/org-1/logo.png',
      contentType: 'image/png' as const,
      sizeBytes: file.size,
      signedUploadUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/soar-files/logo.png?token=upload',
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://project.supabase.co/storage/v1/object/sign/soar-files/logo.png?token=read' }), { status: 200 }));

    await expect(uploadToStorageTarget(target, file, 'Organization logo')).resolves.toEqual({
      storagePath: target.storagePath,
      contentType: 'image/png',
      sizeBytes: file.size,
      url: 'https://project.supabase.co/storage/v1/object/sign/soar-files/logo.png?token=read',
      alt: 'Organization logo',
    });
    expect(fetch).toHaveBeenCalledWith(target.signedUploadUrl, expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ 'Content-Type': 'image/png', 'x-upsert': 'false' }),
      body: file,
    }));
  });

  it('preserves requester, organization, and request binding metadata on private PDF uploads', async () => {
    const file = new File(['%PDF-1.7'], 'formal-request.pdf', { type: 'application/pdf' });
    const metadata = { orgId: 'org-1', meetingRequestId: 'meeting-1', requesterUid: 'student-1' };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(uploadMeetingDocumentToTarget({
      meetingRequestId: 'meeting-1',
      organizationId: 'org-1',
      storagePath: 'meeting-request-documents/org-1/meeting-1/formal-request.pdf',
      fileName: file.name,
      contentType: 'application/pdf',
      sizeBytes: file.size,
      signedUploadUrl: 'https://project.supabase.co/storage/v1/object/upload/sign/soar-files/request.pdf?token=upload',
    }, file, metadata)).resolves.toEqual({
      storagePath: 'meeting-request-documents/org-1/meeting-1/formal-request.pdf',
      fileName: file.name,
      contentType: 'application/pdf',
      sizeBytes: file.size,
    });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('token=upload'), expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        'Content-Type': 'application/pdf',
        'x-upsert': 'false',
        'x-metadata': btoa(JSON.stringify(metadata)),
      }),
      body: file,
    }));
  });

  it('requests signed private media URLs with the Firebase bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://project.supabase.co/storage/v1/object/sign/soar-files/image.png?token=read' }), { status: 200 }));

    await expect(storageDownloadUrl('announcement-images/org-1/post-1/image.png')).resolves.toContain('token=read');
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/storage/download-url?path=announcement-images%2Forg-1%2Fpost-1%2Fimage.png', expect.objectContaining({
      headers: { Authorization: 'Bearer firebase-id-token' },
      credentials: 'include',
    }));
    expect(getFirebaseRuntime).not.toHaveBeenCalled();
  });
});
