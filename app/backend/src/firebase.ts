import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (getApps().length === 0) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    try {
      const serviceAccount: unknown = JSON.parse(serviceAccountJson);
      if (typeof serviceAccount !== 'object' || serviceAccount === null || Array.isArray(serviceAccount)) throw new Error();
      const accountProjectId = (serviceAccount as { project_id?: unknown }).project_id;
      const expectedProjectId = process.env.GCLOUD_PROJECT?.trim() || process.env.GOOGLE_CLOUD_PROJECT?.trim();
      if (typeof accountProjectId !== 'string' || (expectedProjectId && accountProjectId !== expectedProjectId)) throw new Error();
      initializeApp({
        credential: cert(serviceAccount as Parameters<typeof cert>[0]),
        projectId: expectedProjectId || accountProjectId,
      });
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain a valid Firebase Admin service account.');
    }
  } else {
    initializeApp();
  }
}

export const adminAuth = getAuth();
export const db = getFirestore();
export function defaultStorageBucket() {
  return getStorage().bucket();
}
