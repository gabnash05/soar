import { getDownloadURL, ref, uploadBytes } from '@firebase/storage';
import { assertApiBase, authHeaders } from './apiClient';
import { getFirebaseRuntime } from './firebase';

export const WORKFLOW_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const WORKFLOW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const WORKFLOW_VIDEO_CONTENT_TYPES = ['video/mp4', 'video/webm'] as const;
export const WORKFLOW_VIDEO_MAX_BYTES = 25 * 1024 * 1024;

export const ANNOUNCEMENT_MEDIA_CONTENT_TYPES = [...WORKFLOW_IMAGE_CONTENT_TYPES, ...WORKFLOW_VIDEO_CONTENT_TYPES] as const;
export const ANNOUNCEMENT_MEDIA_MAX_ITEMS = 4;
export const ANNOUNCEMENT_MEDIA_MAX_VIDEO_ITEMS = 1;
export const ANNOUNCEMENT_MEDIA_MAX_AGGREGATE_BYTES = 30 * 1024 * 1024;

export const MEETING_DOCUMENT_CONTENT_TYPES = ['application/pdf'] as const;
export const MEETING_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export interface ImageUploadTarget {
  storagePath: string;
  contentType: (typeof ANNOUNCEMENT_MEDIA_CONTENT_TYPES)[number];
  sizeBytes: number;
  announcementId?: string;
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

const isVideoType = (contentType: string): contentType is (typeof WORKFLOW_VIDEO_CONTENT_TYPES)[number] =>
  WORKFLOW_VIDEO_CONTENT_TYPES.includes(contentType as (typeof WORKFLOW_VIDEO_CONTENT_TYPES)[number]);

export const validateWorkflowImageFile = (file: File): void => {
  if (!isImageType(file.type)) {
    throw new Error('Use a PNG, JPEG, GIF, or WebP image.');
  }

  if (file.size > WORKFLOW_IMAGE_MAX_BYTES) {
    throw new Error('Use an image smaller than 5 MB.');
  }
};

export const validateAnnouncementMediaFile = (file: File): void => {
  if (isImageType(file.type)) {
    validateWorkflowImageFile(file);
    return;
  }

  if (!isVideoType(file.type)) {
    throw new Error('Use a PNG, JPEG, GIF, WebP, MP4, or WebM file.');
  }

  if (file.size > WORKFLOW_VIDEO_MAX_BYTES) {
    throw new Error('Use a video smaller than 25 MB.');
  }
};

export const validateAnnouncementMediaFiles = (files: File[]): void => {
  if (files.length > ANNOUNCEMENT_MEDIA_MAX_ITEMS) {
    throw new Error(`Choose up to ${ANNOUNCEMENT_MEDIA_MAX_ITEMS} media items.`);
  }

  const videoCount = files.filter((file) => isVideoType(file.type)).length;
  if (videoCount > ANNOUNCEMENT_MEDIA_MAX_VIDEO_ITEMS) {
    throw new Error('Choose at most one video per announcement.');
  }

  const aggregateSize = files.reduce((sum, file) => sum + file.size, 0);
  if (aggregateSize > ANNOUNCEMENT_MEDIA_MAX_AGGREGATE_BYTES) {
    throw new Error('Choose media with a combined size of 30 MB or less.');
  }

  files.forEach(validateAnnouncementMediaFile);
};

export const validateMeetingDocumentFile = (file: File): void => {
  if (!MEETING_DOCUMENT_CONTENT_TYPES.includes(file.type as MeetingDocumentUploadTarget['contentType'])) {
    throw new Error('Attach a PDF document. Other file types are not allowed for formal requests.');
  }

  if (file.size > MEETING_DOCUMENT_MAX_BYTES) {
    throw new Error('Attach a PDF smaller than 10 MB.');
  }
};

export const storageDownloadUrl = async (storagePath: string): Promise<string> => {
  if (!storagePath) return '';
  const { storage } = getFirebaseRuntime();
  return getDownloadURL(ref(storage, storagePath));
};

export const uploadToStorageTarget = async (target: ImageUploadTarget, file: File, alt = file.name): Promise<UploadedImageReference> => {
  validateAnnouncementMediaFile(file);
  if (file.type !== target.contentType || file.size !== target.sizeBytes) {
    throw new Error('The selected media changed before upload. Choose the file again.');
  }

  const { storage } = getFirebaseRuntime();
  const objectRef = ref(storage, target.storagePath);
  await uploadBytes(objectRef, file, { contentType: target.contentType });
  const url = await getDownloadURL(objectRef);

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
    throw new Error('The selected document changed before upload. Choose the file again.');
  }
  if (metadata.meetingRequestId !== target.meetingRequestId) {
    throw new Error('The document target no longer matches this meeting request. Choose the file again.');
  }

  const { storage } = getFirebaseRuntime();
  const objectRef = ref(storage, target.storagePath);
  await uploadBytes(objectRef, file, {
    contentType: target.contentType,
    customMetadata: metadata,
  });

  return {
    storagePath: target.storagePath,
    fileName: target.fileName,
    contentType: target.contentType,
    sizeBytes: target.sizeBytes,
  };
};

export const openPrivateMeetingDocument = async (meetingRequestId: string, fileName = 'formal-request.pdf', contentType = 'application/pdf'): Promise<void> => {
  if (!meetingRequestId) throw new Error('Meeting request id is missing.');
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
