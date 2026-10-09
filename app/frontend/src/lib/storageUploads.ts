import { getDownloadURL, ref, uploadBytes } from '@firebase/storage';
import { getFirebaseRuntime } from './firebase';

export const WORKFLOW_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const WORKFLOW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface ImageUploadTarget {
  storagePath: string;
  contentType: (typeof WORKFLOW_IMAGE_CONTENT_TYPES)[number];
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

export const validateWorkflowImageFile = (file: File): void => {
  if (!WORKFLOW_IMAGE_CONTENT_TYPES.includes(file.type as ImageUploadTarget['contentType'])) {
    throw new Error('Use a PNG, JPEG, GIF, or WebP image.');
  }

  if (file.size > WORKFLOW_IMAGE_MAX_BYTES) {
    throw new Error('Use an image smaller than 5 MB.');
  }
};

export const storageDownloadUrl = async (storagePath: string): Promise<string> => {
  if (!storagePath) return '';
  const { storage } = getFirebaseRuntime();
  return getDownloadURL(ref(storage, storagePath));
};

export const uploadToStorageTarget = async (target: ImageUploadTarget, file: File, alt = file.name): Promise<UploadedImageReference> => {
  validateWorkflowImageFile(file);
  if (file.type !== target.contentType || file.size !== target.sizeBytes) {
    throw new Error('The selected image changed before upload. Choose the file again.');
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
