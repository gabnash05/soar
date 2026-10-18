import { initializeApp, type FirebaseApp } from '@firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from '@firebase/auth';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from '@firebase/storage';

interface FirebaseRuntime {
  app: FirebaseApp;
  auth: Auth;
  storage?: FirebaseStorage;
}

let runtime: FirebaseRuntime | null = null;
let authEmulatorConnected = false;
let storageEmulatorConnected = false;

const hasAnyFirebaseEmulator = () => Boolean(
  import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST
    || import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST,
);

const demoConfigValue = (value: string | undefined, fallback: string): string => {
  if (value) return value;
  return hasAnyFirebaseEmulator() ? fallback : '';
};

const readConfig = () => {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const compactProjectId = (projectId || 'demo-soar-local').replace(/[^a-z0-9]/gi, '') || 'demosoarlocal';
  const config = {
    apiKey: demoConfigValue(import.meta.env.VITE_FIREBASE_API_KEY, 'demo-web-api-key'),
    authDomain: demoConfigValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, `${projectId || 'demo-soar-local'}.firebaseapp.com`),
    projectId,
    storageBucket: demoConfigValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, `${projectId || 'demo-soar-local'}.appspot.com`),
    messagingSenderId: demoConfigValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, '000000000000'),
    appId: demoConfigValue(import.meta.env.VITE_FIREBASE_APP_ID, `1:000000000000:web:${compactProjectId}`),
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  const missing = Object.entries(config)
    .filter(([key, value]) => key !== 'measurementId' && !value)
    .map(([key]) => key);

  return { config, missing };
};

const parseEmulatorHost = (host: string): { hostname: string; port: number } => {
  const url = new URL(host.includes('://') ? host : `http://${host}`);
  const port = Number(url.port);
  if (!url.hostname || !Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid Firebase emulator host: ${host}`);
  }
  return { hostname: url.hostname, port };
};

export const isFirebaseConfigured = (): boolean => readConfig().missing.length === 0;

export const getFirebaseConfigStatus = () => {
  const { missing } = readConfig();
  return {
    configured: missing.length === 0,
    missing,
    usingAuthEmulator: Boolean(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST),
    usingStorageEmulator: Boolean(import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST),
  };
};

export const getFirebaseRuntime = (): FirebaseRuntime => {
  const { config, missing } = readConfig();
  if (missing.length > 0) {
    throw new Error(`Missing public Firebase configuration: ${missing.join(', ')}`);
  }

  if (!runtime) {
    const app = initializeApp(config);
    const auth = getAuth(app);
    const storage = import.meta.env.VITE_SOAR_STORAGE_PROVIDER === 'supabase' ? undefined : getStorage(app);
    runtime = { app, auth, ...(storage ? { storage } : {}) };
  }

  const authEmulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
  if (authEmulatorHost && !authEmulatorConnected) {
    connectAuthEmulator(runtime.auth, `http://${authEmulatorHost}`, { disableWarnings: true });
    authEmulatorConnected = true;
  }

  const storageEmulatorHost = import.meta.env.VITE_FIREBASE_STORAGE_EMULATOR_HOST;
  if (storageEmulatorHost && runtime.storage && !storageEmulatorConnected) {
    const { hostname, port } = parseEmulatorHost(storageEmulatorHost);
    connectStorageEmulator(runtime.storage, hostname, port);
    storageEmulatorConnected = true;
  }

  return runtime;
};
