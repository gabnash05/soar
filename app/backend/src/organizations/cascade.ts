import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import * as objectStorageModule from '../storage/objectStorage';
import { AppError } from '../errors';
import { db } from '../firebase';
import { COLLECTIONS, organizationPath } from '../contracts/paths';
import { announcementImagePathMatch, assertLogoPathForOrganization } from '../content/validation';

const MAX_FIRESTORE_DELETES_PER_REQUEST = 100;
const MAX_OBJECT_DELETES_PER_REQUEST = 25;
// Keep the persisted upload drain tied to the adapter's documented Supabase maximum; Firebase rules also block writes once deletion is marked.
const MAX_OUTSTANDING_UPLOAD_TOKEN_MS = objectStorageModule.SUPABASE_SIGNED_UPLOAD_MAX_TTL_SECONDS * 1000;

export const ORGANIZATION_DELETION_PHASES = [
  'officerGrants',
  'announcements',
  'applications',
  'meetingRequests',
  'calendarEntries',
  'organizationLogo',
  'storedObjects',
  'finalize'
] as const;

export type OrganizationDeletionPhase = (typeof ORGANIZATION_DELETION_PHASES)[number];
export type OrganizationStorageFamily = objectStorageModule.OrganizationStorageFamily;

interface StoredDeletionProgress {
  phase: OrganizationDeletionPhase;
  startedAt: Timestamp;
  uploadDrainUntil: Timestamp;
  startedByUid: string;
  storageFamily?: OrganizationStorageFamily;
  storageCursor?: string;
  lastError?: string;
}

export interface OrganizationObjectPage {
  items: string[];
}

export interface OrganizationDeletionStorage {
  deleteStoredObject(storagePath: string): Promise<void>;
  listOrganizationObjects(
    orgId: string,
    family: OrganizationStorageFamily,
    afterPath: string | undefined,
    limit: number
  ): Promise<OrganizationObjectPage>;
}

export interface OrganizationDeletionResult {
  orgId: string;
  status: 'in_progress' | 'complete';
  alreadyDeleted?: boolean;
  phase?: OrganizationDeletionPhase;
  retryAfterAt?: string;
}

const phaseOrder = new Map<OrganizationDeletionPhase, number>(ORGANIZATION_DELETION_PHASES.map((phase, index) => [phase, index]));
const storageFamilies: OrganizationStorageFamily[] = ['organization-logos', 'announcement-images', 'meeting-request-documents'];
const knownOrganizationCollections = new Set([COLLECTIONS.officerGrants]);
const knownAnnouncementCollections = new Set(['likes', 'comments']);

function routeOrgId(orgId: string): void {
  if (!/^[A-Za-z0-9_-]{2,128}$/.test(orgId)) {
    throw new AppError('invalid_organization_id', 'The organization id is invalid.', 400);
  }
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scopedCollectionPath(orgId: string, collection: string): string {
  return `${COLLECTIONS.organizations}/${orgId}/${collection}`;
}

function requireDeletingProgress(value: Record<string, unknown> | undefined): StoredDeletionProgress {
  const progress = value?.deletionProgress;
  if (value?.deletionStatus !== 'deleting' || typeof progress !== 'object' || progress === null || Array.isArray(progress)) {
    throw new AppError('organization_deletion_state_invalid', 'The saved deletion progress is incomplete and requires safe recovery.', 409);
  }
  const candidate = progress as Record<string, unknown>;
  const phases = ORGANIZATION_DELETION_PHASES as readonly string[];
  if (!phases.includes(String(candidate.phase)) ||
      !(candidate.startedAt instanceof Timestamp) ||
      !(candidate.uploadDrainUntil instanceof Timestamp) ||
      typeof candidate.startedByUid !== 'string' ||
      (candidate.storageFamily !== undefined && !storageFamilies.includes(candidate.storageFamily as OrganizationStorageFamily)) ||
      (candidate.storageCursor !== undefined && typeof candidate.storageCursor !== 'string')) {
    throw new AppError('organization_deletion_state_invalid', 'The saved deletion progress is incomplete and requires safe recovery.', 409);
  }
  return candidate as unknown as StoredDeletionProgress;
}

function failOnUnknownCollections(names: string[], allowed: Set<string>, parent: string): void {
  const unknown = names.filter((name) => !allowed.has(name));
  if (unknown.length) {
    throw new AppError('organization_deletion_unknown_dependency', `Cleanup stopped because ${parent} contains an unrecognized related record collection. The organization remains locked for safe recovery.`, 409);
  }
}

function validateOwnedObjectPath(orgId: string, family: OrganizationStorageFamily, path: string, announcementId?: string): void {
  const escapedOrgId = escaped(orgId);
  const isLogo = family === 'organization-logos' && new RegExp(`^organization-logos/${escapedOrgId}/[A-Za-z0-9][A-Za-z0-9._-]*$`).test(path);
  const imageMatch = family === 'announcement-images' ? announcementImagePathMatch(path) : null;
  const isImage = imageMatch?.orgId === orgId && (!announcementId || imageMatch.announcementId === announcementId);
  const isMeetingDocument = family === 'meeting-request-documents' && new RegExp(`^meeting-request-documents/${escapedOrgId}/[A-Za-z0-9_-]{2,128}/[A-Za-z0-9][A-Za-z0-9._-]*\\.pdf$`, 'i').test(path);
  if (!isLogo && !isImage && !isMeetingDocument) {
    throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because a stored file does not match the selected organization’s exact storage ownership path. The organization remains locked for safe recovery.', 409);
  }
}

function objectStorage(): OrganizationDeletionStorage {
  const adapter = objectStorageModule as unknown as Partial<OrganizationDeletionStorage>;
  if (typeof adapter.deleteStoredObject !== 'function' || typeof adapter.listOrganizationObjects !== 'function') {
    throw new AppError('organization_storage_cleanup_unavailable', 'Organization deletion is temporarily unavailable because safe private-file cleanup is not ready.', 503);
  }
  return adapter as OrganizationDeletionStorage;
}

function documentIdentity(data: Record<string, unknown>, field: string, id: string, label: string): void {
  if (data[field] !== id) {
    throw new AppError('organization_deletion_unknown_dependency', `Cleanup stopped because a related ${label} has an unexpected stored identity. The organization remains locked for safe recovery.`, 409);
  }
}

function announcementMediaPaths(data: Record<string, unknown>, orgId: string, announcementId: string): string[] {
  const values: unknown[] = [];
  if (Array.isArray(data.media)) values.push(...data.media);
  if (data.image !== undefined && data.image !== null) values.push(data.image);
  const paths: string[] = [];
  for (const item of values) {
    if (typeof item !== 'object' || item === null || Array.isArray(item) || typeof (item as Record<string, unknown>).storagePath !== 'string') {
      throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because an announcement has an unrecognized media reference. The organization remains locked for safe recovery.', 409);
    }
    const path = (item as Record<string, unknown>).storagePath as string;
    validateOwnedObjectPath(orgId, 'announcement-images', path, announcementId);
    paths.push(path);
  }
  return [...new Set(paths)];
}

function meetingDocumentPath(data: Record<string, unknown>, orgId: string, meetingRequestId: string): string | undefined {
  if (data.document === undefined || data.document === null) return undefined;
  if (typeof data.document !== 'object' || Array.isArray(data.document) || typeof (data.document as Record<string, unknown>).storagePath !== 'string') {
    throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because a meeting request has an unrecognized private-file reference. The organization remains locked for safe recovery.', 409);
  }
  const path = (data.document as Record<string, unknown>).storagePath as string;
  validateOwnedObjectPath(orgId, 'meeting-request-documents', path);
  if (!path.startsWith(`meeting-request-documents/${orgId}/${meetingRequestId}/`)) {
    throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because a private meeting file is not linked to its exact request. The organization remains locked for safe recovery.', 409);
  }
  return path;
}

function progressIso(value: Timestamp): string {
  return value.toDate().toISOString();
}

function withoutLastError(progress: StoredDeletionProgress): StoredDeletionProgress {
  const current = { ...progress };
  delete current.lastError;
  return current;
}

async function updateProgress(
  database: Firestore,
  orgId: string,
  update: (progress: StoredDeletionProgress) => StoredDeletionProgress
): Promise<StoredDeletionProgress | undefined> {
  const ref = database.doc(organizationPath(orgId));
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return undefined;
    const current = requireDeletingProgress(snapshot.data());
    const next = update(current);
    transaction.update(ref, { deletionProgress: next, updatedAt: Timestamp.now() });
    return next;
  });
}

async function advancePhase(database: Firestore, orgId: string, nextPhase: OrganizationDeletionPhase): Promise<StoredDeletionProgress | undefined> {
  return updateProgress(database, orgId, (progress) => {
    if ((phaseOrder.get(progress.phase) ?? -1) >= (phaseOrder.get(nextPhase) ?? -1)) return progress;
    const next = withoutLastError(progress);
    delete next.storageCursor;
    delete next.storageFamily;
    return {
      ...next,
      phase: nextPhase,
      ...(nextPhase === 'storedObjects' ? { storageFamily: storageFamilies[0] } : {})
    };
  });
}

async function beginDeletion(database: Firestore, orgId: string, actorUid: string, now: Timestamp): Promise<StoredDeletionProgress | undefined> {
  const ref = database.doc(organizationPath(orgId));
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return undefined;
    const organization = snapshot.data() ?? {};
    if (organization.deletionStatus === undefined) {
      const progress: StoredDeletionProgress = {
        phase: 'officerGrants',
        startedAt: now,
        uploadDrainUntil: Timestamp.fromMillis(now.toMillis() + MAX_OUTSTANDING_UPLOAD_TOKEN_MS),
        startedByUid: actorUid
      };
      transaction.update(ref, {
        deletionStatus: 'deleting',
        deletionProgress: progress,
        updatedAt: now
      });
      return progress;
    }
    if (organization.deletionStatus !== 'deleting') {
      throw new AppError('organization_deletion_state_invalid', 'The organization has an unsupported deletion state and requires safe recovery.', 409);
    }
    return requireDeletingProgress(organization);
  });
}

async function deleteBatch(database: Firestore, docs: QueryDocumentSnapshot[], maxCount: number): Promise<number> {
  const selected = docs.slice(0, maxCount);
  if (!selected.length) return 0;
  const batch = database.batch();
  for (const document of selected) batch.delete(document.ref);
  await batch.commit();
  return selected.length;
}

async function organizationCollections(database: Firestore, orgId: string): Promise<string[]> {
  const collections = await database.doc(organizationPath(orgId)).listCollections();
  const names = collections.map((collection) => collection.id);
  failOnUnknownCollections(names, knownOrganizationCollections, 'the organization');
  return names;
}

async function processOfficerGrants(database: Firestore, orgId: string, remaining: number): Promise<{ used: number; complete: boolean }> {
  const names = await organizationCollections(database, orgId);
  if (!names.includes(COLLECTIONS.officerGrants)) return { used: 0, complete: true };
  const query = database.collection(scopedCollectionPath(orgId, COLLECTIONS.officerGrants));
  const snapshot = await query.orderBy(FieldPath.documentId()).limit(Math.min(remaining, MAX_FIRESTORE_DELETES_PER_REQUEST) + 1).get();
  for (const doc of snapshot.docs) {
    const grant = doc.data();
    if (grant.uid !== doc.id || !['active', 'revoked'].includes(String(grant.status))) {
      throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because an officer grant has an unexpected organization-scoped identity. The organization remains locked for safe recovery.', 409);
    }
    const nested = await doc.ref.listCollections();
    if (nested.length) {
      throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because an officer grant contains an unrecognized nested collection. The organization remains locked for safe recovery.', 409);
    }
  }
  const used = await deleteBatch(database, snapshot.docs, Math.min(remaining, MAX_FIRESTORE_DELETES_PER_REQUEST));
  return { used, complete: snapshot.docs.length <= used };
}

async function processAnnouncement(database: Firestore, storage: OrganizationDeletionStorage, orgId: string, doc: QueryDocumentSnapshot, remaining: number): Promise<number> {
  const data = doc.data();
  if (data.orgId !== orgId) {
    throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because an announcement ownership query returned a mismatched organization. The organization remains locked for safe recovery.', 409);
  }
  documentIdentity(data, 'announcementId', doc.id, 'announcement');
  const subcollections = await doc.ref.listCollections();
  failOnUnknownCollections(subcollections.map((collection) => collection.id), knownAnnouncementCollections, 'an announcement');
  let used = 0;
  for (const name of ['likes', 'comments']) {
    const childCollection = subcollections.find((collection) => collection.id === name);
    if (!childCollection || used >= remaining) continue;
    const childDocs = await childCollection.orderBy(FieldPath.documentId()).limit(Math.min(remaining - used, MAX_FIRESTORE_DELETES_PER_REQUEST) + 1).get();
    for (const child of childDocs.docs) {
      const childData = child.data();
      const identityField = name === 'likes' ? 'uid' : 'commentId';
      if (childData[identityField] !== child.id || childData.announcementId !== doc.id) {
        throw new AppError('organization_deletion_unknown_dependency', `Cleanup stopped because an announcement ${name.slice(0, -1)} has an unexpected parent identity. The organization remains locked for safe recovery.`, 409);
      }
      if ((await child.ref.listCollections()).length) {
        throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because an announcement reaction or comment contains an unrecognized nested collection. The organization remains locked for safe recovery.', 409);
      }
    }
    used += await deleteBatch(database, childDocs.docs, Math.min(remaining - used, MAX_FIRESTORE_DELETES_PER_REQUEST));
    if (childDocs.docs.length > 0) return used;
  }
  if (used >= remaining) return used;

  for (const path of announcementMediaPaths(data, orgId, doc.id)) {
    if (used >= remaining) return used;
    await storage.deleteStoredObject(path);
    used += 1;
  }
  await database.doc(doc.ref.path).delete();
  return used + 1;
}

async function processAnnouncements(database: Firestore, storage: OrganizationDeletionStorage, orgId: string, remaining: number): Promise<{ used: number; complete: boolean }> {
  let used = 0;
  while (used < remaining) {
    const snapshot = await database.collection(COLLECTIONS.announcements).where('orgId', '==', orgId).orderBy(FieldPath.documentId()).limit(1).get();
    const doc = snapshot.docs[0];
    if (!doc) return { used, complete: true };
    const processed = await processAnnouncement(database, storage, orgId, doc, remaining - used);
    if (processed === 0) return { used, complete: false };
    used += processed;
    if (processed < remaining && (await database.collection(COLLECTIONS.announcements).where('orgId', '==', orgId).limit(1).get()).empty) {
      return { used, complete: true };
    }
  }
  return { used, complete: (await database.collection(COLLECTIONS.announcements).where('orgId', '==', orgId).limit(1).get()).empty };
}

async function verifyNoExternalLogoReferences(database: Firestore, orgId: string, storagePath: string): Promise<void> {
  const [organizationRefs, announcementRefs] = await Promise.all([
    database.collection(COLLECTIONS.organizations).where('logoPath', '==', storagePath).limit(101).get(),
    database.collection(COLLECTIONS.announcements).where('organizationLogoPath', '==', storagePath).limit(101).get()
  ]);
  if (organizationRefs.docs.length > 100 || announcementRefs.docs.length > 100 ||
      organizationRefs.docs.some((doc) => doc.id !== orgId) ||
      announcementRefs.docs.some((doc) => doc.data().orgId !== orgId)) {
    throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because the organization logo is referenced by unrelated organization data. The organization remains locked for safe recovery.', 409);
  }
  if (announcementRefs.docs.length) {
    throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because an announcement still references the organization logo after its owned announcements were processed. The organization remains locked for safe recovery.', 409);
  }
}

async function advanceStorageFamily(database: Firestore, orgId: string, current: OrganizationStorageFamily): Promise<StoredDeletionProgress | undefined> {
  const index = storageFamilies.indexOf(current);
  const next = storageFamilies[index + 1];
  if (next) {
    return updateProgress(database, orgId, (progress) => {
      if (progress.phase !== 'storedObjects' || progress.storageFamily !== current) return progress;
      const updated = withoutLastError(progress);
      delete updated.storageCursor;
      return { ...updated, storageFamily: next };
    });
  }
  return advancePhase(database, orgId, 'finalize');
}

function validateCursor(orgId: string, family: OrganizationStorageFamily, cursor: string | undefined): void {
  if (cursor !== undefined) validateOwnedObjectPath(orgId, family, cursor);
}

async function processStorageFamily(
  database: Firestore,
  storage: OrganizationDeletionStorage,
  orgId: string,
  progress: StoredDeletionProgress,
  remaining: number
): Promise<{ used: number; complete: boolean; progress?: StoredDeletionProgress }> {
  const family = progress.storageFamily;
  if (!family) {
    throw new AppError('organization_deletion_state_invalid', 'The saved file-cleanup progress is incomplete and requires safe recovery.', 409);
  }
  validateCursor(orgId, family, progress.storageCursor);
  const limit = Math.min(remaining, MAX_OBJECT_DELETES_PER_REQUEST);
  const page = await storage.listOrganizationObjects(orgId, family, progress.storageCursor, limit);
  if (!Array.isArray(page.items) || page.items.length > limit) {
    throw new AppError('organization_deletion_unknown_dependency', 'The private-file service returned an invalid bounded cleanup page. The organization remains locked for safe recovery.', 409);
  }
  if (!page.items.length) {
    return { used: 0, complete: true, progress: await advanceStorageFamily(database, orgId, family) };
  }
  let cursor = progress.storageCursor;
  for (const path of page.items) {
    validateOwnedObjectPath(orgId, family, path);
    if (cursor !== undefined && path <= cursor) {
      throw new AppError('organization_deletion_unknown_dependency', 'The private-file service returned an unstable cleanup cursor. The organization remains locked for safe recovery.', 409);
    }
    await storage.deleteStoredObject(path);
    cursor = path;
  }
  const saved = await updateProgress(database, orgId, (current) => {
    if (current.phase !== 'storedObjects' || current.storageFamily !== family) return current;
    if (current.storageCursor !== undefined && cursor !== undefined && cursor <= current.storageCursor) return current;
    return { ...current, storageCursor: cursor };
  });
  return { used: page.items.length, complete: false, progress: saved };
}

async function verifyNoOwnedRecords(database: Firestore, orgId: string): Promise<void> {
  const checks = [COLLECTIONS.announcements, COLLECTIONS.applications, COLLECTIONS.meetingRequests, COLLECTIONS.calendarEntries];
  for (const collection of checks) {
    const snapshot = await database.collection(collection).where('orgId', '==', orgId).limit(1).get();
    if (!snapshot.empty) {
      throw new AppError('organization_deletion_incomplete', 'Cleanup could not verify that every organization-owned record was removed. The organization remains locked; retry cleanup to continue safely.', 503);
    }
  }
  const grants = await database.collection(scopedCollectionPath(orgId, COLLECTIONS.officerGrants)).limit(1).get();
  if (!grants.empty) {
    throw new AppError('organization_deletion_incomplete', 'Cleanup could not verify that every officer grant was removed. The organization remains locked; retry cleanup to continue safely.', 503);
  }
  await organizationCollections(database, orgId);
}

async function verifyNoOwnedObjects(storage: OrganizationDeletionStorage, orgId: string): Promise<void> {
  for (const family of storageFamilies) {
    const page = await storage.listOrganizationObjects(orgId, family, undefined, 1);
    if (!Array.isArray(page.items) || page.items.length > 1) {
      throw new AppError('organization_deletion_unknown_dependency', 'The private-file service returned an invalid final ownership check. The organization remains locked for safe recovery.', 409);
    }
    if (page.items.length) {
      validateOwnedObjectPath(orgId, family, page.items[0]);
      throw new AppError('organization_deletion_incomplete', 'Cleanup found another organization-owned file before finalization. Retry cleanup to continue safely.', 503);
    }
  }
}

async function finishDeletion(database: Firestore, orgId: string): Promise<boolean> {
  const ref = database.doc(organizationPath(orgId));
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return true;
    const progress = requireDeletingProgress(snapshot.data());
    if (progress.phase !== 'finalize') return false;
    transaction.delete(ref);
    return true;
  });
}

async function safeForMissingOrganization(database: Firestore, storage: OrganizationDeletionStorage, orgId: string): Promise<void> {
  const nestedCollections = await database.doc(organizationPath(orgId)).listCollections();
  failOnUnknownCollections(nestedCollections.map((collection) => collection.id), knownOrganizationCollections, 'the organization');
  for (const collection of [COLLECTIONS.announcements, COLLECTIONS.applications, COLLECTIONS.meetingRequests, COLLECTIONS.calendarEntries]) {
    const records = await database.collection(collection).where('orgId', '==', orgId).limit(1).get();
    if (!records.empty) {
      throw new AppError('organization_deletion_state_missing', 'Organization progress is missing while related records remain; cleanup cannot safely claim completion.', 409);
    }
  }
  const grants = await database.collection(scopedCollectionPath(orgId, COLLECTIONS.officerGrants)).limit(1).get();
  if (!grants.empty) {
    throw new AppError('organization_deletion_state_missing', 'Organization progress is missing while officer grants remain; cleanup cannot safely claim completion.', 409);
  }
  for (const family of storageFamilies) {
    const objects = await storage.listOrganizationObjects(orgId, family, undefined, 1);
    if (!Array.isArray(objects.items) || objects.items.length) {
      throw new AppError('organization_deletion_state_missing', 'Organization progress is missing while owned files may remain; cleanup cannot safely claim completion.', 409);
    }
  }
}

export async function advanceOrganizationDeletion(
  orgId: string,
  actorUid: string,
  dependencies: { database?: Firestore; storage?: OrganizationDeletionStorage; now?: () => Timestamp } = {}
): Promise<OrganizationDeletionResult> {
  routeOrgId(orgId);
  const database = dependencies.database ?? db;
  const storage = dependencies.storage ?? objectStorage();
  const now = (dependencies.now ?? Timestamp.now)();
  let progress = await beginDeletion(database, orgId, actorUid, now);
  if (!progress) {
    await safeForMissingOrganization(database, storage, orgId);
    return { orgId, status: 'complete', alreadyDeleted: true };
  }

  let remaining = MAX_FIRESTORE_DELETES_PER_REQUEST;
  try {
    while (remaining > 0) {
      switch (progress.phase) {
        case 'officerGrants': {
          const result = await processOfficerGrants(database, orgId, remaining);
          remaining -= result.used;
          if (!result.complete) break;
          progress = (await advancePhase(database, orgId, 'announcements')) ?? progress;
          continue;
        }
        case 'announcements': {
          const result = await processAnnouncements(database, storage, orgId, remaining);
          remaining -= result.used;
          if (!result.complete) break;
          progress = (await advancePhase(database, orgId, 'applications')) ?? progress;
          continue;
        }
        case 'applications':
        case 'meetingRequests':
        case 'calendarEntries': {
          const collection = progress.phase === 'applications' ? COLLECTIONS.applications
            : progress.phase === 'meetingRequests' ? COLLECTIONS.meetingRequests : COLLECTIONS.calendarEntries;
          const idField = progress.phase === 'applications' ? 'applicationId'
            : progress.phase === 'meetingRequests' ? 'meetingRequestId' : 'entryId';
          const snapshot = await database.collection(collection).where('orgId', '==', orgId)
            .orderBy(FieldPath.documentId()).limit(Math.min(remaining, MAX_FIRESTORE_DELETES_PER_REQUEST) + 1).get();
          let meetingFileDeletes = 0;
          for (const doc of snapshot.docs.slice(0, Math.min(remaining, MAX_FIRESTORE_DELETES_PER_REQUEST))) {
            const data = doc.data();
            if (data.orgId !== orgId) {
              throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because an ownership query returned a mismatched organization. The organization remains locked for safe recovery.', 409);
            }
            documentIdentity(data, idField, doc.id, progress.phase === 'applications' ? 'application' : progress.phase === 'meetingRequests' ? 'meeting request' : 'dated entry');
            if ((await doc.ref.listCollections()).length) {
              throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because a related organization record contains an unrecognized nested collection. The organization remains locked for safe recovery.', 409);
            }
            if (progress.phase === 'meetingRequests') {
              const path = meetingDocumentPath(data, orgId, doc.id);
              if (path) {
                await storage.deleteStoredObject(path);
                meetingFileDeletes += 1;
              }
            }
          }
          const recordLimit = Math.max(0, Math.min(remaining - meetingFileDeletes, MAX_FIRESTORE_DELETES_PER_REQUEST));
          if (progress.phase === 'calendarEntries') {
            for (const entry of snapshot.docs.slice(0, recordLimit)) {
              const requests = await database.collection(COLLECTIONS.meetingRequests).where('dateEntryId', '==', entry.id).limit(101).get();
              if (requests.docs.length > 100 || requests.docs.some((request) => request.data().orgId !== orgId)) {
                throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because a dated entry is referenced by an unrelated meeting request. The organization remains locked for safe recovery.', 409);
              }
            }
          }
          const usedRecords = await deleteBatch(database, snapshot.docs, recordLimit);
          const used = meetingFileDeletes + usedRecords;
          remaining -= used;
          if (snapshot.docs.length > usedRecords) break;
          const nextPhase: OrganizationDeletionPhase = progress.phase === 'applications' ? 'meetingRequests'
            : progress.phase === 'meetingRequests' ? 'calendarEntries' : 'organizationLogo';
          progress = (await advancePhase(database, orgId, nextPhase)) ?? progress;
          continue;
        }
        case 'organizationLogo': {
          const organization = await database.doc(organizationPath(orgId)).get();
          const logoPath = organization.data()?.logoPath;
          if (typeof logoPath === 'string' && logoPath) {
            try {
              assertLogoPathForOrganization(orgId, logoPath);
            } catch {
              throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because the organization logo path is not scoped to this exact organization. The organization remains locked for safe recovery.', 409);
            }
            await verifyNoExternalLogoReferences(database, orgId, logoPath);
            await storage.deleteStoredObject(logoPath);
            remaining -= 1;
          } else if (logoPath !== undefined && logoPath !== '') {
            throw new AppError('organization_deletion_unknown_dependency', 'Cleanup stopped because the organization logo reference is invalid. The organization remains locked for safe recovery.', 409);
          }
          progress = (await advancePhase(database, orgId, 'storedObjects')) ?? progress;
          continue;
        }
        case 'storedObjects': {
          if (now.toMillis() < progress.uploadDrainUntil.toMillis()) {
            return { orgId, status: 'in_progress', phase: progress.phase, retryAfterAt: progressIso(progress.uploadDrainUntil) };
          }
          const result = await processStorageFamily(database, storage, orgId, progress, remaining);
          remaining -= result.used;
          if (result.progress) progress = result.progress;
          if (!result.complete) break;
          progress = (await updateProgress(database, orgId, (current) => current)) ?? progress;
          continue;
        }
        case 'finalize': {
          await verifyNoOwnedRecords(database, orgId);
          await verifyNoOwnedObjects(storage, orgId);
          const deleted = await finishDeletion(database, orgId);
          return { orgId, status: 'complete', alreadyDeleted: !deleted };
        }
      }
      break;
    }
  } catch (error) {
    if (error instanceof AppError && error.code.startsWith('organization_deletion_')) {
      await updateProgress(database, orgId, (current) => ({ ...current, lastError: error.code })).catch(() => undefined);
      throw error;
    }
    await updateProgress(database, orgId, (current) => ({ ...current, lastError: 'cleanup_failed' })).catch(() => undefined);
    throw new AppError('organization_deletion_incomplete', 'Cleanup could not finish. The organization remains locked; retry cleanup to continue safely.', 503);
  }

  const saved = await updateProgress(database, orgId, withoutLastError);
  const current = saved ?? progress;
  return {
    orgId,
    status: 'in_progress',
    phase: current.phase,
    ...(current.phase === 'storedObjects' && now.toMillis() < current.uploadDrainUntil.toMillis()
      ? { retryAfterAt: progressIso(current.uploadDrainUntil) }
      : {})
  };
}

export function deleteOrganizationCascade(orgId: string, actorUid: string): Promise<OrganizationDeletionResult> {
  return advanceOrganizationDeletion(orgId, actorUid);
}
