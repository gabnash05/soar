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

type StorageOperation = 'create_signed_upload_target' | 'create_signed_download_url' | 'list_object_metadata' | 'download_object';
type StorageFailurePhase = 'network_error' | 'provider_http_error' | 'invalid_json_response' | 'invalid_response_shape' | 'invalid_signed_url' | 'object_not_found' | 'signed_download_http_error';

const SAFE_PROVIDER_ERROR_CODES = new Set([
  'BucketNotFound',
  'NoSuchBucket',
  'NotFound',
  'Unauthorized',
  'InvalidJWT',
  'InvalidKey',
  'InvalidRequest',
  'EntityTooLarge',
  'PayloadTooLarge',
  'KeyAlreadyExists',
]);

async function safeProviderErrorCode(response: Response): Promise<string | undefined> {
  try {
    const value: unknown = await response.clone().json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const code = record.code ?? record.errorCode ?? record.error;
    return typeof code === 'string' && SAFE_PROVIDER_ERROR_CODES.has(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function logStorageFailure(operation: StorageOperation, phase: StorageFailurePhase, providerStatus?: number, providerErrorCode?: string): void {
  console.error('Private storage operation failed', JSON.stringify({
    operation,
    phase,
    ...(providerStatus === undefined ? {} : { providerStatus }),
    ...(providerErrorCode && SAFE_PROVIDER_ERROR_CODES.has(providerErrorCode) ? { providerErrorCode } : {}),
  }));
}

async function requestStorage(path: string, init: RequestInit, operation: StorageOperation): Promise<Response> {
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
    logStorageFailure(operation, 'network_error');
    throw new AppError('storage_unavailable', 'The private file service is temporarily unavailable.', 503);
  }
}

async function readStorageResponse(response: Response, operation: StorageOperation): Promise<Record<string, unknown>> {
  if (!response.ok) {
    logStorageFailure(operation, 'provider_http_error', response.status, await safeProviderErrorCode(response));
    throw new AppError('storage_unavailable', 'The private file service could not complete the request.', 503);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    logStorageFailure(operation, 'invalid_json_response');
    throw new AppError('storage_unavailable', 'The private file service returned an invalid response.', 503);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  logStorageFailure(operation, 'invalid_response_shape');
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
  }, 'create_signed_upload_target');
  const result = await readStorageResponse(response, 'create_signed_upload_target');
  const signedUploadUrl = absoluteSignedUrl(result.url ?? result.signedUrl ?? result.signedURL, settings.baseUrl);
  if (!signedUploadUrl) {
    logStorageFailure('create_signed_upload_target', 'invalid_signed_url');
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
  }, 'create_signed_download_url');
  const result = await readStorageResponse(response, 'create_signed_download_url');
  const rawUrl = result.signedURL ?? result.signedUrl ?? result.url;
  const url = absoluteSignedUrl(rawUrl, settings.baseUrl);
  if (!url) {
    logStorageFailure('create_signed_download_url', 'invalid_signed_url');
    throw new AppError('storage_unavailable', 'The private file service returned an invalid download URL.', 503);
  }
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
  }, 'list_object_metadata');
  if (!response.ok) {
    logStorageFailure('list_object_metadata', 'provider_http_error', response.status, await safeProviderErrorCode(response));
    throw new AppError('storage_unavailable', 'The private file service could not verify the uploaded file.', 503);
  }
  let entries: unknown;
  try {
    entries = await response.json();
  } catch {
    logStorageFailure('list_object_metadata', 'invalid_json_response');
    throw new AppError('storage_unavailable', 'The private file service returned an invalid file record.', 503);
  }
  if (!Array.isArray(entries)) {
    logStorageFailure('list_object_metadata', 'invalid_response_shape');
    throw new AppError('storage_unavailable', 'The private file service returned an invalid file record.', 503);
  }
  const object = entries.find((entry) => typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>).name === encoded.name) as Record<string, unknown> | undefined;
  if (!object) {
    logStorageFailure('list_object_metadata', 'object_not_found');
    throw new AppError('storage_object_missing', 'The uploaded file was not found.', 404);
  }
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
    logStorageFailure('download_object', 'network_error');
    throw new AppError('storage_unavailable', 'The private file service is temporarily unavailable.', 503);
  }
  if (!response.ok) {
    logStorageFailure('download_object', 'signed_download_http_error', response.status, await safeProviderErrorCode(response));
    if (response.status === 404) throw new AppError('storage_object_missing', 'The uploaded file was not found.', 404);
    throw new AppError('storage_unavailable', 'The private file service could not download the file.', 503);
  }
  return Buffer.from(await response.arrayBuffer());
}
