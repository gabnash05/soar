import { defaultStorageBucket } from '../firebase';
import { AppError } from '../errors';

export interface StoredObjectMetadata {
  contentType?: string;
  sizeBytes: number;
  customMetadata: Record<string, string>;
}

export interface SupabaseUploadTarget {
  signedUploadUrl: string;
}

interface SupabaseStorageConfig {
  baseUrl: string;
  serviceRoleKey: string;
  bucket: string;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export function isSupabaseStorageEnabled(): boolean {
  return (process.env.SOAR_STORAGE_PROVIDER ?? '').trim().toLowerCase() === 'supabase';
}

function config(): SupabaseStorageConfig {
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SOAR_FILES_BUCKET?.trim();
  if (!baseUrl || !serviceRoleKey || !bucket) {
    throw new AppError('storage_not_configured', 'Private file storage is not configured.', 503);
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new AppError('storage_not_configured', 'Private file storage is not configured.', 503);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.toLowerCase().endsWith('.supabase.co') || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password || !/^[A-Za-z0-9_-]{1,100}$/.test(bucket)) {
    throw new AppError('storage_not_configured', 'Private file storage is not configured.', 503);
  }
  return { baseUrl: parsed.origin, serviceRoleKey, bucket };
}

function encodeObjectPath(path: string): string {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new AppError('invalid_storage_path', 'The requested file path is invalid.', 400);
  }
  return path.split('/').map(encodeURIComponent).join('/');
}

function storageUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/storage/v1${path.startsWith('/') ? path : `/${path}`}`;
}

async function requestStorage(path: string, init: RequestInit = {}): Promise<Response> {
  const settings = config();
  try {
    return await fetch(storageUrl(settings.baseUrl, path), {
      ...init,
      headers: {
        apikey: settings.serviceRoleKey,
        Authorization: `Bearer ${settings.serviceRoleKey}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new AppError('storage_unavailable', 'The private file service is temporarily unavailable.', 503);
  }
}

async function readStorageResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new AppError('storage_unavailable', 'The private file service could not complete the request.', 503);
  }
  try {
    const value: unknown = await response.json();
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // Treat an unexpected provider response as unavailable without exposing provider details.
  }
  throw new AppError('storage_unavailable', 'The private file service returned an invalid response.', 503);
}

function absoluteSignedUrl(rawUrl: unknown, baseUrl: string): string | undefined {
  if (typeof rawUrl !== 'string' || !rawUrl) return undefined;
  try {
    const normalized = rawUrl.startsWith('/object/') ? `/storage/v1${rawUrl}` : rawUrl;
    const url = new URL(normalized, baseUrl);
    if (url.protocol !== 'https:' || url.origin !== baseUrl || !url.pathname.startsWith('/storage/v1/')) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function createSignedObjectUploadTarget(storagePath: string): Promise<SupabaseUploadTarget | undefined> {
  if (!isSupabaseStorageEnabled()) return undefined;
  const settings = config();
  const path = encodeObjectPath(storagePath);
  const response = await requestStorage(`/object/upload/sign/${encodeURIComponent(settings.bucket)}/${path}`, {
    method: 'POST',
    body: '{}',
  });
  const result = await readStorageResponse(response);
  const signedUploadUrl = absoluteSignedUrl(result.url ?? result.signedUrl ?? result.signedURL, settings.baseUrl);
  if (!signedUploadUrl) {
    throw new AppError('storage_unavailable', 'The private file service returned an invalid upload target.', 503);
  }
  return { signedUploadUrl };
}

export async function createSignedObjectDownloadUrl(storagePath: string): Promise<string | undefined> {
  if (!isSupabaseStorageEnabled()) return undefined;
  const settings = config();
  const path = encodeObjectPath(storagePath);
  const response = await requestStorage(`/object/sign/${encodeURIComponent(settings.bucket)}/${path}`, {
    method: 'POST',
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
  });
  const result = await readStorageResponse(response);
  const rawUrl = result.signedURL ?? result.signedUrl ?? result.url;
  const url = absoluteSignedUrl(rawUrl, settings.baseUrl);
  if (!url) throw new AppError('storage_unavailable', 'The private file service returned an invalid download URL.', 503);
  return url;
}

function parentPath(path: string): { directory: string; name: string } {
  const slash = path.lastIndexOf('/');
  return { directory: slash < 0 ? '' : path.slice(0, slash), name: path.slice(slash + 1) };
}

export async function getStoredObjectMetadata(storagePath: string): Promise<StoredObjectMetadata> {
  if (!isSupabaseStorageEnabled()) {
    try {
      const [metadata] = await defaultStorageBucket().file(storagePath).getMetadata();
      return {
        contentType: metadata.contentType,
        sizeBytes: Number(metadata.size ?? 0),
        customMetadata: Object.fromEntries(Object.entries(metadata.metadata ?? {}).map(([key, value]) => [key, String(value)])),
      };
    } catch {
      throw new AppError('storage_object_missing', 'The uploaded file was not found.', 404);
    }
  }

  const settings = config();
  const encoded = parentPath(encodeObjectPath(storagePath));
  const response = await requestStorage(`/object/list/${encodeURIComponent(settings.bucket)}`, {
    method: 'POST',
    body: JSON.stringify({ prefix: encoded.directory, search: encoded.name, limit: 100, offset: 0 }),
  });
  if (!response.ok) throw new AppError('storage_unavailable', 'The private file service could not verify the uploaded file.', 503);
  let entries: unknown;
  try {
    entries = await response.json();
  } catch {
    throw new AppError('storage_unavailable', 'The private file service returned an invalid file record.', 503);
  }
  if (!Array.isArray(entries)) throw new AppError('storage_unavailable', 'The private file service returned an invalid file record.', 503);
  const object = entries.find((entry) => typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>).name === encoded.name) as Record<string, unknown> | undefined;
  if (!object) throw new AppError('storage_object_missing', 'The uploaded file was not found.', 404);
  const metadata = typeof object.metadata === 'object' && object.metadata !== null ? object.metadata as Record<string, unknown> : {};
  const userMetadata = typeof metadata.userMetadata === 'object' && metadata.userMetadata !== null
    ? metadata.userMetadata as Record<string, unknown>
    : typeof metadata.user_metadata === 'object' && metadata.user_metadata !== null
      ? metadata.user_metadata as Record<string, unknown>
      : metadata;
  const customMetadata = Object.fromEntries(['orgId', 'meetingRequestId', 'requesterUid']
    .filter((key) => userMetadata[key] !== undefined)
    .map((key) => [key, String(userMetadata[key])]));
  return {
    contentType: typeof metadata.mimetype === 'string' ? metadata.mimetype : typeof metadata.contentType === 'string' ? metadata.contentType : undefined,
    sizeBytes: Number(metadata.size ?? metadata.contentLength ?? 0),
    customMetadata,
  };
}

export async function downloadStoredObject(storagePath: string): Promise<Buffer> {
  if (!isSupabaseStorageEnabled()) {
    try {
      const [contents] = await defaultStorageBucket().file(storagePath).download();
      return contents;
    } catch {
      throw new AppError('storage_object_missing', 'The uploaded file was not found.', 404);
    }
  }

  const url = await createSignedObjectDownloadUrl(storagePath);
  if (!url) throw new AppError('storage_unavailable', 'The private file service is not configured.', 503);
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new AppError('storage_unavailable', 'The private file service is temporarily unavailable.', 503);
  }
  if (!response.ok) throw new AppError('storage_object_missing', 'The uploaded file was not found.', 404);
  return Buffer.from(await response.arrayBuffer());
}
