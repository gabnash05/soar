import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (getApps().length === 0) {
  initializeApp();
}

export const adminAuth = getAuth();
export const db = getFirestore();
export function defaultStorageBucket() {
  return getStorage().bucket();
}
