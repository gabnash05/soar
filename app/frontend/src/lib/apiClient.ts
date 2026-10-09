import { ServiceUnavailableError } from './contracts';
import { getFirebaseConfigStatus, getFirebaseRuntime } from './firebase';

export interface ApiResponse<T> {
  data: T;
}

export const apiBaseUrl = () => (import.meta.env.VITE_SOAR_API_BASE_URL || '').replace(/\/$/, '');

export const assertApiBase = () => {
  const base = apiBaseUrl();
  if (!base) {
    throw new ServiceUnavailableError('SOAR services are temporarily unavailable. Please try again later.');
  }
  return base;
};

export const currentFirebaseIdToken = async () => {
  const firebaseStatus = getFirebaseConfigStatus();
  if (!firebaseStatus.configured) return null;
  const { auth } = getFirebaseRuntime();
  const user = auth.currentUser;
  return user ? user.getIdToken() : null;
};

export const authHeaders = async (): Promise<HeadersInit> => {
  const token = await currentFirebaseIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const base = assertApiBase();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string; code?: string };
      if (body.message) message = body.message;
    } catch {
      // Keep status-based message.
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;

  const body = (await response.json()) as ApiResponse<T> | T;
  return body && typeof body === 'object' && 'data' in body ? (body as ApiResponse<T>).data : (body as T);
};
