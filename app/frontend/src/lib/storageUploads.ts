import { getDownloadURL, ref, uploadBytes } from '@firebase/storage';
import { assertApiBase, authHeaders } from './apiClient';
import { getFirebaseRuntime } from './firebase';
import { UserFacingError } from './safeErrors';

export const WORKFLOW_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const WORKFLOW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const ANNOUNCEMENT_MEDIA_CONTENT_TYPES = WORKFLOW_IMAGE_CONTENT_TYPES;
export const ANNOUNCEMENT_MEDIA_MAX_ITEMS = 4;
export const ANNOUNCEMENT_MEDIA_MAX_AGGREGATE_BYTES = 30 * 1024 * 1024;

export const MEETING_DOCUMENT_CONTENT_TYPES = ['application/pdf'] as const;
export const MEETING_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const MEETING_DOCUMENT_FILE_NAME_MAX_LENGTH = 128;
const MEETING_DOCUMENT_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]*\.pdf$/i;

export interface ImageUploadTarget {
  storagePath: string;
  contentType: (typeof ANNOUNCEMENT_MEDIA_CONTENT_TYPES)[number];
  sizeBytes: number;
  announcementId?: string;
  signedUploadUrl?: string;
}

export interface UploadedImageReference {
  storagePath: string;
  contentType: ImageUploadTarget['contentType'];
  sizeBytes: number;
  url: string;
  alt: string;
}

export interface MeetingDocumentUploadTarget {
  meetingRequestId: string;
  organizationId?: string;
  dateEntryId?: string;
  meetingTitle?: string;
  requestedDate?: string;
  requestedTime?: string;
  storagePath: string;
  fileName: string;
  contentType: (typeof MEETING_DOCUMENT_CONTENT_TYPES)[number];
  sizeBytes: number;
  allowedContentTypes?: readonly string[];
  maxSizeBytes?: number;
  signedUploadUrl?: string;
}

export interface UploadedMeetingDocumentReference {
  storagePath: string;
  fileName: string;
  contentType: MeetingDocumentUploadTarget['contentType'];
  sizeBytes: number;
}

export const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

const isImageType = (contentType: string): contentType is (typeof WORKFLOW_IMAGE_CONTENT_TYPES)[number] =>
  WORKFLOW_IMAGE_CONTENT_TYPES.includes(contentType as (typeof WORKFLOW_IMAGE_CONTENT_TYPES)[number]);

export const validateWorkflowImageFile = (file: File): void => {
  if (!isImageType(file.type)) {
    throw new UserFacingError('Use a PNG, JPEG, GIF, or WebP image.');
  }

  if (file.size > WORKFLOW_IMAGE_MAX_BYTES) {
    throw new UserFacingError('Use an image smaller than 5 MB.');
  }
};

export const validateAnnouncementMediaFile = validateWorkflowImageFile;

export const validateAnnouncementMediaFiles = (files: File[]): void => {
  if (files.length > ANNOUNCEMENT_MEDIA_MAX_ITEMS) {
    throw new UserFacingError(`Choose up to ${ANNOUNCEMENT_MEDIA_MAX_ITEMS} media items.`);
  }

  const aggregateSize = files.reduce((sum, file) => sum + file.size, 0);
  if (aggregateSize > ANNOUNCEMENT_MEDIA_MAX_AGGREGATE_BYTES) {
    throw new UserFacingError('Choose images with a combined size of 30 MB or less.');
  }

  files.forEach(validateAnnouncementMediaFile);
};

export const validateMeetingDocumentFile = (file: File): void => {
  if (!MEETING_DOCUMENT_CONTENT_TYPES.includes(file.type as MeetingDocumentUploadTarget['contentType'])) {
    throw new UserFacingError('Attach a PDF document. Other file types are not allowed for formal requests.');
  }

  if (file.size > MEETING_DOCUMENT_MAX_BYTES) {
    throw new UserFacingError('Attach a PDF smaller than 10 MB.');
  }

  const fileName = file.name.trim();
  if (fileName.length > MEETING_DOCUMENT_FILE_NAME_MAX_LENGTH || !MEETING_DOCUMENT_FILE_NAME_PATTERN.test(fileName)) {
    throw new UserFacingError('Use a PDF file name of up to 128 characters, starting with a letter or number; letters, numbers, spaces, periods, hyphens, and underscores are allowed.');
  }
};

function getFirebaseStorage() {
  const storage = getFirebaseRuntime().storage;
  if (!storage) throw new UserFacingError('Private file storage is not configured.');
  return storage;
}

export const storageDownloadUrl = async (storagePath: string): Promise<string> => {
  if (!storagePath) return '';
  if (import.meta.env.VITE_SOAR_STORAGE_PROVIDER === 'supabase') {
    const response = await fetch(`${assertApiBase()}/storage/download-url?path=${encodeURIComponent(storagePath)}`, {
      headers: await authHeaders(),
      credentials: 'include',
    });
    if (!response.ok) throw new UserFacingError('This media is temporarily unavailable.');
    const result = await response.json() as { url?: unknown };
    if (typeof result.url !== 'string' || !result.url.startsWith('https://')) throw new UserFacingError('This media is temporarily unavailable.');
    return result.url;
  }
  return getDownloadURL(ref(getFirebaseStorage(), storagePath));
};

async function uploadToSignedUrl(url: string, file: File, contentType: string, metadata?: Record<string, string>): Promise<void> {
  let response: Response;
  try {
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'x-upsert': 'false',
    };
    if (metadata) {
      const bytes = new TextEncoder().encode(JSON.stringify(metadata));
      let binary = '';
      bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      headers['x-metadata'] = btoa(binary);
    }
    response = await fetch(url, {
      method: 'PUT',
      headers,
      body: file,
    });
  } catch {
    throw new UserFacingError('The file could not be uploaded. Check your connection and try again.');
  }
  if (!response.ok) throw new UserFacingError('The file could not be uploaded. Check your connection and try again.');
}

export const uploadToStorageTarget = async (target: ImageUploadTarget, file: File, alt = file.name): Promise<UploadedImageReference> => {
  validateAnnouncementMediaFile(file);
  if (file.type !== target.contentType || file.size !== target.sizeBytes) {
    throw new UserFacingError('The selected image changed before upload. Choose the file again.');
  }

  let url: string;
  if (target.signedUploadUrl) {
    await uploadToSignedUrl(target.signedUploadUrl, file, target.contentType);
    url = await storageDownloadUrl(target.storagePath);
  } else {
    const objectRef = ref(getFirebaseStorage(), target.storagePath);
    await uploadBytes(objectRef, file, { contentType: target.contentType });
    url = await getDownloadURL(objectRef);
  }

  return {
    storagePath: target.storagePath,
    contentType: target.contentType,
    sizeBytes: target.sizeBytes,
    url,
    alt,
  };
};

export const uploadMeetingDocumentToTarget = async (
  target: MeetingDocumentUploadTarget,
  file: File,
  metadata: { orgId: string; meetingRequestId: string; requesterUid: string },
): Promise<UploadedMeetingDocumentReference> => {
  validateMeetingDocumentFile(file);
  if (file.type !== target.contentType || file.size !== target.sizeBytes) {
    throw new UserFacingError('The selected document changed before upload. Choose the file again.');
  }
  if (metadata.meetingRequestId !== target.meetingRequestId) {
    throw new UserFacingError('The document target no longer matches this meeting request. Choose the file again.');
  }

  if (target.signedUploadUrl) {
    await uploadToSignedUrl(target.signedUploadUrl, file, target.contentType, metadata);
  } else {
    const objectRef = ref(getFirebaseStorage(), target.storagePath);
    await uploadBytes(objectRef, file, {
      contentType: target.contentType,
      customMetadata: metadata,
    });
  }

  return {
    storagePath: target.storagePath,
    fileName: target.fileName,
    contentType: target.contentType,
    sizeBytes: target.sizeBytes,
  };
};

export const openPrivateMeetingDocument = async (meetingRequestId: string, fileName = 'formal-request.pdf', contentType = 'application/pdf'): Promise<void> => {
  if (!meetingRequestId) throw new UserFacingError('Meeting request id is missing.');
  const response = await fetch(`${assertApiBase()}/requests/meetings/${encodeURIComponent(meetingRequestId)}/document`, {
    headers: await authHeaders(),
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Could not open this document (status ${response.status}).`;
    try {
      const problem = await response.json() as { message?: string };
      if (problem.message) message = problem.message;
    } catch {
      // Keep status message for non-JSON stream errors.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(new Blob([blob], { type: response.headers.get('Content-Type') || contentType }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};
