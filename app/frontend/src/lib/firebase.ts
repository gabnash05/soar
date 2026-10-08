import { initializeApp, type FirebaseApp } from '@firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from '@firebase/auth';

interface FirebaseRuntime {
  app: FirebaseApp;
  auth: Auth;
}

let runtime: FirebaseRuntime | null = null;
let emulatorConnected = false;

const readConfig = () => {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  const missing = Object.entries(config)
    .filter(([key, value]) => key !== 'measurementId' && !value)
    .map(([key]) => key);

  return { config, missing };
};

export const isFirebaseConfigured = (): boolean => readConfig().missing.length === 0;

export const getFirebaseConfigStatus = () => {
  const { missing } = readConfig();
  return {
    configured: missing.length === 0,
    missing,
    usingAuthEmulator: Boolean(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST),
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
    runtime = { app, auth };
  }

  const emulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost && !emulatorConnected) {
    connectAuthEmulator(runtime.auth, `http://${emulatorHost}`, { disableWarnings: true });
    emulatorConnected = true;
  }

  return runtime;
};
