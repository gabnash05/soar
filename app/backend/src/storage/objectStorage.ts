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

export type OrganizationStorageFamily = 'organization-logos' | 'announcement-images' | 'meeting-request-documents';

// Supabase documents createSignedUploadUrl tokens as valid for two hours; see the task-scoped evidence receipt.
export const SUPABASE_SIGNED_UPLOAD_MAX_TTL_SECONDS = 2 * 60 * 60;

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const STORAGE_LIST_PAGE_SIZE = 100;
const MAX_STORAGE_LIST_ENTRIES_SCANNED = 10_000;
const MAX_STORAGE_LIST_REQUESTS = 200;
const MAX_STORAGE_DIRECTORY_DEPTH = 16;
const MAX_ORGANIZATION_OBJECT_PAGE_SIZE = 25;
const ORGANIZATION_STORAGE_FAMILIES = new Set<OrganizationStorageFamily>([
  'organization-logos',
  'announcement-images',
  'meeting-request-documents',
]);

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

type StorageOperation = 'create_signed_upload_target' | 'create_signed_download_url' | 'list_object_metadata' | 'download_object' | 'delete_object' | 'list_organization_objects';
type StorageFailurePhase = 'network_error' | 'provider_http_error' | 'invalid_json_response' | 'invalid_response_shape' | 'invalid_signed_url' | 'object_not_found' | 'signed_download_http_error' | 'firebase_error' | 'listing_limit_exceeded';

// Keep this allowlist in sync with Supabase Storage's public ErrorCode enum.
// Source: supabase/storage/src/internal/errors/codes.ts at c826a70ac6e6f56d3e6033ccb164fb1ff5282570.
const SAFE_PROVIDER_ERROR_CODES = new Set([
  'NoSuchBucket',
  'NoSuchLifecycleConfiguration',
  'NoSuchKey',
  'NoSuchUpload',
  'InvalidJWT',
  'InvalidRequest',
  'InvalidArgument',
  'MalformedXML',
  'TenantNotFound',
  'EntityTooLarge',
  'EntityTooSmall',
  'InternalError',
  'ResourceAlreadyExists',
  'ResourceNotEmpty',
  'BucketNotEmpty',
  'InvalidBucketName',
  'InvalidKey',
  'InvalidRange',
  'InvalidMimeType',
  'InvalidUploadId',
  'KeyAlreadyExists',
  'BucketAlreadyExists',
  'DatabaseTimeout',
  'DatabaseReadOnly',
  'DatabaseTransactionAborted',
  'DatabaseInvalidObjectDefinition',
  'DatabaseSchemaMismatch',
  'InvalidSignature',
  'ExpiredToken',
  'SignatureDoesNotMatch',
  'AccessDenied',
  'ResourceLocked',
  'ResourceReferenced',
  'DatabaseError',
  'TransactionError',
  'MissingContentLength',
  'MissingParameter',
  'InvalidParameter',
  'InvalidUploadSignature',
  'LockTimeout',
  'S3Error',
  'PreconditionFailed',
  'InvalidAccessKeyId',
  'MaximumCredentialsLimit',
  'InvalidChecksum',
  'MissingPart',
  'InvalidPartOrder',
  'SlowDown',
  'TusError',
  'Aborted',
  'AbortedTerminate',
  'FeatureNotEnabled',
  'NotSupported',
  'IcebergMaximumResourceLimit',
  'IcebergResourceNotEmpty',
  'NoSuchCatalog',
  'UnknownError',
  'ConflictException',
  'NotFoundException',
  'VectorBucketNotEmpty',
  'S3VectorMaxBucketsExceeded',
  'S3VectorMaxIndexesExceeded',
  'NoAvailableShard',
  'ShardNotFound',
  // Legacy error-field aliases retained for compatible provider response shapes.
  'BucketNotFound',
  'NotFound',
  'Unauthorized',
  'PayloadTooLarge',
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

interface SupabaseListEntry {
  name: string;
  id: string | null;
}

function compareStoragePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalidStoragePath(): AppError {
  return new AppError('invalid_storage_path', 'The requested file path is invalid.', 400);
}

function validateOrganizationStorageScope(orgId: string, family: OrganizationStorageFamily): string {
  if (!ORGANIZATION_STORAGE_FAMILIES.has(family) || !/^[A-Za-z0-9_-]{2,128}$/.test(orgId)) {
    throw invalidStoragePath();
  }
  return `${family}/${orgId}`;
}

function validateOwnedObjectPath(prefix: string, path: string): void {
  encodeObjectPath(path);
  if (!path.startsWith(`${prefix}/`) || path.endsWith('/')) throw invalidStoragePath();
}

function validateDeletableObjectPath(path: string): void {
  encodeObjectPath(path);
  const [family, orgId, ...objectSegments] = path.split('/');
  if (!ORGANIZATION_STORAGE_FAMILIES.has(family as OrganizationStorageFamily)
    || !/^[A-Za-z0-9_-]{2,128}$/.test(orgId ?? '')
    || objectSegments.length === 0) {
    throw invalidStoragePath();
  }
}

function isSafeStorageSegment(value: string): boolean {
  return Boolean(value)
    && value !== '.'
    && value !== '..'
    && !value.includes('/')
    && !value.includes('\\')
    && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function statusFromError(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as Record<string, unknown>;
  const status = Number(record.code ?? record.statusCode ?? record.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
}

function listingLimitExceeded(): never {
  logStorageFailure('list_organization_objects', 'listing_limit_exceeded');
  throw new AppError('storage_unavailable', 'The private file service could not safely list all organization files.', 503);
}

function invalidStorageListResponse(): never {
  logStorageFailure('list_organization_objects', 'invalid_response_shape');
  throw new AppError('storage_unavailable', 'The private file service returned an invalid file listing.', 503);
}

async function readStorageListResponse(response: Response): Promise<unknown[]> {
  if (!response.ok) {
    logStorageFailure('list_organization_objects', 'provider_http_error', response.status, await safeProviderErrorCode(response));
    throw new AppError('storage_unavailable', 'The private file service could not list organization files.', 503);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    logStorageFailure('list_organization_objects', 'invalid_json_response');
    throw new AppError('storage_unavailable', 'The private file service returned an invalid file listing.', 503);
  }
  if (!Array.isArray(value)) return invalidStorageListResponse();
  return value;
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

async function listSupabaseOrganizationObjects(prefix: string, afterPath: string | undefined, limit: number): Promise<string[]> {
  const settings = config();
  const state = { entries: 0, requests: 0, directories: new Set<string>() };

  const walk = async (directory: string, depth: number): Promise<string[]> => {
    if (depth > MAX_STORAGE_DIRECTORY_DEPTH) listingLimitExceeded();
    if (state.directories.has(directory)) return [];
    state.directories.add(directory);

    const tasks: Array<{ path: string; sortKey: string; isDirectory: boolean }> = [];
    let offset = 0;
    while (true) {
      if (++state.requests > MAX_STORAGE_LIST_REQUESTS) listingLimitExceeded();
      const response = await requestStorage(`/object/list/${encodeURIComponent(settings.bucket)}`, {
        method: 'POST',
        body: JSON.stringify({
          prefix: directory,
          limit: STORAGE_LIST_PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        }),
      }, 'list_organization_objects');
      const rawEntries = await readStorageListResponse(response);
      if (rawEntries.length === 0) break;
      state.entries += rawEntries.length;
      if (state.entries > MAX_STORAGE_LIST_ENTRIES_SCANNED) listingLimitExceeded();

      const entries: SupabaseListEntry[] = rawEntries.map((entry) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return invalidStorageListResponse();
        const record = entry as Record<string, unknown>;
        if (typeof record.name !== 'string' || !isSafeStorageSegment(record.name)
          || !(record.id === null || (typeof record.id === 'string' && record.id.length > 0))) {
          return invalidStorageListResponse();
        }
        return { name: record.name, id: record.id as string | null };
      });

      for (const entry of entries) {
        const childPath = `${directory}/${entry.name}`;
        if (!childPath.startsWith(`${prefix}/`)) return invalidStorageListResponse();
        try {
          encodeObjectPath(childPath);
        } catch {
          return invalidStorageListResponse();
        }
        tasks.push({
          path: childPath,
          sortKey: entry.id === null ? `${childPath}/` : childPath,
          isDirectory: entry.id === null,
        });
      }

      offset += rawEntries.length;
      if (rawEntries.length < STORAGE_LIST_PAGE_SIZE) break;
    }

    tasks.sort((left, right) => compareStoragePaths(left.sortKey, right.sortKey));
    const found = new Set<string>();
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!;
      if (task.isDirectory) {
        if (afterPath !== undefined && compareStoragePaths(task.sortKey, afterPath) <= 0 && !afterPath.startsWith(task.sortKey)) continue;
        for (const path of await walk(task.path, depth + 1)) found.add(path);
      } else if (afterPath === undefined || compareStoragePaths(task.path, afterPath) > 0) {
        if (!task.path.endsWith('/')) found.add(task.path);
      }

      const sorted = [...found].sort(compareStoragePaths);
      if (sorted.length >= limit) {
        const boundary = sorted[limit - 1]!;
        const nextTask = tasks[i + 1];
        if (!nextTask || compareStoragePaths(nextTask.sortKey, boundary) >= 0) return sorted.slice(0, limit);
      }
    }
    return [...found].sort(compareStoragePaths).slice(0, limit);
  };

  return walk(prefix, 0);
}

async function listFirebaseOrganizationObjects(prefix: string, afterPath: string | undefined, limit: number): Promise<string[]> {
  let bucket: ReturnType<typeof defaultStorageBucket>;
  try {
    bucket = defaultStorageBucket();
  } catch (error) {
    const status = statusFromError(error);
    logStorageFailure('list_organization_objects', status === undefined ? 'network_error' : 'firebase_error', status);
    throw new AppError('storage_unavailable', 'Private file storage could not list organization files.', 503);
  }

  const paths = new Set<string>();
  let pageToken: string | undefined;
  let entriesScanned = 0;
  let requests = 0;

  while (true) {
    if (++requests > MAX_STORAGE_LIST_REQUESTS) listingLimitExceeded();
    let files: Array<{ name: string }>;
    let nextQuery: { pageToken?: unknown };
    try {
      const [pageFiles, pageQuery] = await bucket.getFiles({
        prefix: `${prefix}/`,
        ...(afterPath ? { startOffset: afterPath } : {}),
        maxResults: STORAGE_LIST_PAGE_SIZE,
        autoPaginate: false,
        ...(pageToken ? { pageToken } : {}),
      });
      files = pageFiles;
      nextQuery = pageQuery;
    } catch (error) {
      const status = statusFromError(error);
      logStorageFailure('list_organization_objects', status === undefined ? 'network_error' : 'firebase_error', status);
      throw new AppError(status === 404 ? 'storage_not_configured' : 'storage_unavailable', 'Private file storage could not list organization files.', 503);
    }

    entriesScanned += files.length;
    if (entriesScanned > MAX_STORAGE_LIST_ENTRIES_SCANNED) listingLimitExceeded();
    const pagePaths = files.map((file) => file.name).sort(compareStoragePaths);
    for (const path of pagePaths) {
      if (typeof path !== 'string' || !path.startsWith(`${prefix}/`)) return invalidStorageListResponse();
      if (path.endsWith('/') || (afterPath !== undefined && compareStoragePaths(path, afterPath) <= 0)) continue;
      try {
        encodeObjectPath(path);
      } catch {
        return invalidStorageListResponse();
      }
      paths.add(path);
    }

    const nextPageToken = typeof nextQuery.pageToken === 'string' ? nextQuery.pageToken : undefined;
    if (paths.size >= limit || !nextPageToken) break;
    pageToken = nextPageToken;
  }

  return [...paths].sort(compareStoragePaths).slice(0, limit);
}

export async function deleteStoredObject(storagePath: string): Promise<void> {
  validateDeletableObjectPath(storagePath);

  if (isSupabaseStorageEnabled()) {
    const settings = config();
    const response = await requestStorage(`/object/${encodeURIComponent(settings.bucket)}`, {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: [storagePath] }),
    }, 'delete_object');
    if (!response.ok) {
      const providerErrorCode = await safeProviderErrorCode(response);
      if (response.status === 404 && providerErrorCode === 'NotFound') return;
      logStorageFailure('delete_object', 'provider_http_error', response.status, providerErrorCode);
      throw new AppError('storage_unavailable', 'The private file service could not remove the organization file.', 503);
    }
    await response.arrayBuffer();
    return;
  }

  let bucket: ReturnType<typeof defaultStorageBucket>;
  try {
    bucket = defaultStorageBucket();
  } catch (error) {
    const status = statusFromError(error);
    logStorageFailure('delete_object', status === undefined ? 'network_error' : 'firebase_error', status);
    throw new AppError('storage_unavailable', 'Private file storage could not remove the organization file.', 503);
  }
  try {
    await bucket.file(storagePath).delete();
  } catch (error) {
    const status = statusFromError(error);
    if (status === 404) {
      try {
        const [bucketExists] = await bucket.exists();
        if (bucketExists) return;
        logStorageFailure('delete_object', 'firebase_error', 404);
        throw new AppError('storage_not_configured', 'Private file storage is not configured.', 503);
      } catch (bucketError) {
        if (bucketError instanceof AppError) throw bucketError;
        const bucketStatus = statusFromError(bucketError);
        logStorageFailure('delete_object', bucketStatus === undefined ? 'network_error' : 'firebase_error', bucketStatus);
        throw new AppError('storage_unavailable', 'Private file storage could not remove the organization file.', 503);
      }
    }
    logStorageFailure('delete_object', status === undefined ? 'network_error' : 'firebase_error', status);
    throw new AppError('storage_unavailable', 'Private file storage could not remove the organization file.', 503);
  }
}

export async function listOrganizationObjects(
  orgId: string,
  family: OrganizationStorageFamily,
  afterPath: string | undefined,
  limit: number,
): Promise<{ items: string[] }> {
  const prefix = validateOrganizationStorageScope(orgId, family);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ORGANIZATION_OBJECT_PAGE_SIZE) {
    throw new AppError('invalid_storage_list_limit', 'The organization file page size is invalid.', 400);
  }
  if (afterPath !== undefined) validateOwnedObjectPath(prefix, afterPath);

  const items = isSupabaseStorageEnabled()
    ? await listSupabaseOrganizationObjects(prefix, afterPath, limit)
    : await listFirebaseOrganizationObjects(prefix, afterPath, limit);
  return { items };
}
