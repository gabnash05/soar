import type { DecodedIdToken } from 'firebase-admin/auth';
import type { DocumentData, Query } from 'firebase-admin/firestore';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, organizationLogoStoragePath, announcementImageStoragePath, organizationPath, officerGrantPath } from '../contracts/paths';
import type { OrganizationDocument } from '../contracts/schema';
import { canonicalDepartment, normalizeDepartmentKey } from '../contracts/validation';
import { AppError } from '../errors';
import { db } from '../firebase';
import { decodeCursor, encodeCursor } from '../pagination';
import { loadAccount, requireActiveAccess } from '../identity/access';
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_ANNOUNCEMENT_MEDIA_ITEMS,
  MAX_ANNOUNCEMENT_MEDIA_TOTAL_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  announcementCreateSchema,
  announcementImagePathMatch,
  announcementUpdateSchema,
  announcementQuerySchema,
  assertLogoPathForOrganization,
  commentCreateSchema,
  commentQuerySchema,
  commentUpdateSchema,
  dateEntryCreateSchema,
  dateEntryQuerySchema,
  dateEntryUpsertSchema,
  imageTargetRequestSchema,
  mediaTargetRequestSchema,
  normalizedName,
  organizationListQuerySchema,
  organizationProfileUpdateSchema
} from './validation';

interface Page<T> {
  items: T[];
  nextPageToken?: string;
}

interface ImageInfo {
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  alt?: string;
}

function iso(value: unknown): string | undefined {
  return typeof (value as Timestamp | undefined)?.toDate === 'function' ? (value as Timestamp).toDate().toISOString() : undefined;
}

function cursorMillis(value: string): Timestamp {
  if (!/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new AppError('invalid_page_token', 'The page token has an invalid timestamp boundary.', 400);
  }
  return Timestamp.fromMillis(Number(value));
}

function timestampBoundary(value: unknown): string {
  if (!value || typeof (value as Timestamp).toMillis !== 'function') {
    throw new AppError('invalid_page_boundary', 'The list item is missing its ordered timestamp.', 500);
  }
  return String((value as Timestamp).toMillis());
}

function routeOrgId(orgId: string): string {
  if (!/^[A-Za-z0-9_-]{2,128}$/.test(orgId)) {
    throw new AppError('invalid_organization_id', 'The organization id is invalid.', 400);
  }
  return orgId;
}

function routeDocumentId(id: string, label: string): string {
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(id)) {
    throw new AppError('invalid_id', `The ${label} id is invalid.`, 400);
  }
  return id;
}

async function assertCanManageOrganization(user: DecodedIdToken, orgId: string): Promise<OrganizationDocument> {
  const orgRef = db.doc(organizationPath(orgId));
  const [, orgSnap] = await Promise.all([requireActiveAccess(user), orgRef.get()]);
  if (!orgSnap.exists) {
    throw new AppError('organization_missing', 'The organization was not found.', 404);
  }

  const organization = orgSnap.data() as OrganizationDocument;
  if (organization.ownerUid === user.uid) {
    return organization;
  }

  const grantSnap = await db.doc(officerGrantPath(orgId, user.uid)).get();
  if (grantSnap.exists && grantSnap.data()?.status === 'active') {
    return organization;
  }

  throw new AppError('organization_management_required', 'Approved organization management access is required for this action.', 403);
}

async function requireReadableUser(user: DecodedIdToken): Promise<void> {
  await requireActiveAccess(user);
}

function summaryFromOrganization(data: DocumentData) {
  return {
    id: data.orgId,
    orgId: data.orgId,
    slug: data.slug,
    name: data.name,
    shortDescription: data.shortDescription ?? '',
    description: data.description ?? '',
    contactEmail: data.contactEmail ?? '',
    contactPhone: data.contactPhone ?? '',
    department: data.department ?? '',
    departmentKey: data.departmentKey ?? '',
    logoPath: data.logoPath ?? '',
    recruitmentTitle: data.recruitment?.title ?? '',
    updatedAt: iso(data.updatedAt)
  };
}

function recruitmentFromOrganization(data: DocumentData) {
  return {
    opportunityId: data.recruitment?.opportunityId ?? '',
    title: data.recruitment?.title ?? '',
    requirements: data.recruitment?.requirements ?? '',
    instructions: data.recruitment?.instructions ?? '',
    applicationLink: data.recruitment?.applicationLink ?? ''
  };
}

function mediaFromAnnouncement(data: DocumentData): ImageInfo[] {
  if (Array.isArray(data.media)) {
    return data.media.filter((item: unknown): item is ImageInfo => typeof item === 'object' && item !== null && typeof (item as ImageInfo).storagePath === 'string');
  }
  return data.image ? [data.image as ImageInfo] : [];
}

function announcementFromDoc(data: DocumentData, viewerHasLiked = false) {
  const media = mediaFromAnnouncement(data);
  const announcementId = data.announcementId ?? '';
  return {
    id: announcementId,
    announcementId,
    organizationId: data.orgId,
    orgId: data.orgId,
    organizationName: data.organizationName ?? '',
    organizationLogoPath: data.organizationLogoPath ?? '',
    authorUid: data.authorUid,
    body: data.body,
    image: media[0] ?? null,
    media,
    likeCount: data.likeCount ?? 0,
    commentCount: data.commentCount ?? 0,
    viewerHasLiked,
    deepLinkPath: announcementId ? `/app?announcementId=${encodeURIComponent(announcementId)}` : '',
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt)
  };
}

function dateEntryFromDoc(data: DocumentData) {
  return {
    id: data.entryId,
    entryId: data.entryId,
    organizationId: data.orgId,
    orgId: data.orgId,
    organizationName: data.organizationName ?? '',
    kind: data.kind,
    title: data.title,
    date: data.date,
    startTime: data.startTime ?? '',
    endTime: data.endTime ?? '',
    details: data.details,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt)
  };
}

async function commentFromDoc(data: DocumentData, viewerUid?: string, organizationId?: string) {
  const ownsComment = Boolean(viewerUid && data.authorUid === viewerUid);
  const authorUid = typeof data.authorUid === 'string' ? data.authorUid : '';
  const authorAccount = authorUid ? await db.doc(`accounts/${authorUid}`).get() : undefined;
  const authorProfile = authorAccount?.data();
  const authorAccountKind: 'student' | undefined = authorProfile?.role === 'student' && authorProfile?.emailVerified === true
    ? 'student'
    : undefined;
  const officerGrant = authorAccountKind === 'student' && organizationId
    ? await db.doc(officerGrantPath(organizationId, authorUid)).get()
    : undefined;
  const authorOrganizationRole: 'approved_officer' | undefined = officerGrant?.exists && officerGrant.data()?.status === 'active'
    ? 'approved_officer'
    : undefined;
  const createdAt = iso(data.createdAt);
  const updatedAt = iso(data.updatedAt);
  const hasActualEdit = Boolean(iso(data.editedAt) || (createdAt && updatedAt && updatedAt !== createdAt));
  return {
    id: data.commentId,
    commentId: data.commentId,
    announcementId: data.announcementId,
    authorName: data.authorName,
    ...(authorAccountKind ? { authorAccountKind } : {}),
    ...(authorOrganizationRole ? { authorOrganizationRole } : {}),
    body: data.body,
    viewerCanEdit: ownsComment,
    viewerCanDelete: ownsComment,
    createdAt,
    ...(hasActualEdit && updatedAt ? { updatedAt } : {})
  };
}

async function viewerLikeMap(announcementIds: string[], uid: string): Promise<Record<string, boolean>> {
  const entries = await Promise.all(announcementIds.map(async (id) => {
    const snap = await db.collection(COLLECTIONS.announcements).doc(id).collection('likes').doc(uid).get();
    return [id, snap.exists] as const;
  }));
  return Object.fromEntries(entries);
}

function validateLogoPath(orgId: string, path: string): void {
  try {
    assertLogoPathForOrganization(orgId, path);
  } catch (error) {
    throw new AppError('invalid_image_path', error instanceof Error ? error.message : 'Invalid image path.', 400);
  }
}

function validateAnnouncementMedia(orgId: string, announcementId: string, media: ImageInfo[]): void {
  for (const image of media) {
    const match = announcementImagePathMatch(image.storagePath);
    if (!match || match.orgId !== orgId || match.announcementId !== announcementId) {
      throw new AppError('invalid_image_path', 'Announcement images must stay under the matching organization and announcement folder.', 400);
    }
  }
}

function sanitizeTargetFileName(fileName: string): string {
  return `${Date.now()}-${fileName}`;
}

export async function listOrganizations(user: DecodedIdToken, rawQuery: unknown): Promise<Page<ReturnType<typeof summaryFromOrganization>>> {
  await requireReadableUser(user);
  const query = organizationListQuerySchema.parse(rawQuery);
  const search = normalizedName(query.q ?? '');
  const context = search;
  const boundary = decodeCursor(query.pageToken, 'organizations', context, 2);
  let ref: Query<DocumentData> = db.collection(COLLECTIONS.organizations).orderBy('name').orderBy(FieldPath.documentId());
  if (boundary) ref = ref.startAfter(boundary[0], boundary[1]);
  if (!search) {
    const snap = await ref.limit(query.limit + 1).get();
    const docs = snap.docs.slice(0, query.limit);
    const items = docs.map((doc) => summaryFromOrganization(doc.data()));
    const last = docs.at(-1);
    return {
      items,
      ...(snap.docs.length > query.limit && last ? { nextPageToken: encodeCursor('organizations', context, [String(last.get('name') ?? ''), last.id]) } : {})
    };
  }

  // Name substring search cannot be expressed by Firestore's ordered query, so scan a bounded batch and continue from its stable boundary.
  const snap = await ref.limit(101).get();
  const scanned = snap.docs.slice(0, 100);
  const matches = scanned.filter((doc) => normalizedName(doc.data().name ?? '').includes(search));
  const docs = matches.slice(0, query.limit);
  const items = docs.map((doc) => summaryFromOrganization(doc.data()));
  const nextBoundary = matches.length > query.limit
    ? docs.at(-1)
    : snap.docs.length > scanned.length
      ? scanned.at(-1)
      : undefined;
  return {
    items,
    ...(nextBoundary ? { nextPageToken: encodeCursor('organizations', context, [String(nextBoundary.get('name') ?? ''), nextBoundary.id]) } : {})
  };
}

export async function getOrganizationProfile(user: DecodedIdToken, orgIdParam: string) {
  await requireReadableUser(user);
  const orgId = routeOrgId(orgIdParam);
  const orgSnap = await db.doc(organizationPath(orgId)).get();
  if (!orgSnap.exists) {
    throw new AppError('organization_missing', 'The organization was not found.', 404);
  }

  const data = orgSnap.data() ?? {};
  const [posts, dateEntries] = await Promise.all([
    listAnnouncements(user, { orgId, limit: 10 }),
    listDateEntries(user, { organizationId: orgId, limit: 20 })
  ]);

  return {
    ...summaryFromOrganization(data),
    applicationsOpen: data.applicationsOpen !== false,
    recruitment: recruitmentFromOrganization(data),
    posts: posts.items,
    dateEntries: dateEntries.items,
    createdAt: iso(data.createdAt)
  };
}

export async function updateOrganizationProfile(user: DecodedIdToken, orgIdParam: string, rawBody: unknown) {
  const orgId = routeOrgId(orgIdParam);
  const organization = await assertCanManageOrganization(user, orgId);
  const input = organizationProfileUpdateSchema.parse(rawBody);
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  if (input.applicationsOpen !== undefined) update.applicationsOpen = input.applicationsOpen;
  if (input.name !== undefined) {
    update.name = input.name;
    update.searchName = normalizedName(input.name);
  }
  if (input.shortDescription !== undefined) update.shortDescription = input.shortDescription;
  if (input.description !== undefined) update.description = input.description;
  if (input.contactEmail !== undefined) update.contactEmail = input.contactEmail;
  if (input.contactPhone !== undefined) update.contactPhone = input.contactPhone;
  if (input.department !== undefined) {
    update.department = input.department;
    update.departmentKey = input.department ? normalizeDepartmentKey(input.department) : '';
  }
  const logoPath = input.logo?.storagePath ?? input.logoPath;
  if (logoPath !== undefined) {
    if (logoPath) validateLogoPath(orgId, logoPath);
    update.logoPath = logoPath;
  }
  if (input.recruitment !== undefined) {
    const previous = organization.recruitment ?? {};
    update.recruitment = {
      ...(previous.opportunityId ? { opportunityId: previous.opportunityId } : {}),
      title: input.recruitment.title ?? previous.title ?? '',
      requirements: input.recruitment.requirements ?? previous.requirements ?? '',
      instructions: input.recruitment.instructions ?? previous.instructions ?? '',
      applicationLink: input.recruitment.applicationLink ?? previous.applicationLink ?? ''
    };
  }

  await db.doc(organizationPath(orgId)).update(update);
  return getOrganizationProfile(user, orgId);
}

export async function getStudentDepartmentCounts(user: DecodedIdToken, orgIdParam: string) {
  const orgId = routeOrgId(orgIdParam);
  const organization = await assertCanManageOrganization(user, orgId);
  const savedDepartment = typeof organization.department === 'string' ? canonicalDepartment(organization.department) : undefined;
  const rawDepartmentKey = typeof organization.departmentKey === 'string' && organization.departmentKey.trim()
    ? normalizeDepartmentKey(organization.departmentKey)
    : '';
  const department = savedDepartment ?? (rawDepartmentKey ? canonicalDepartment(rawDepartmentKey) : undefined);
  const departmentKey = department ? normalizeDepartmentKey(department) : '';

  if (!department || !departmentKey) {
    throw new AppError('organization_department_missing', 'This organization is not linked to a supported department yet.', 409);
  }

  const snap = await db.collection(COLLECTIONS.accounts)
    .where('role', '==', 'student')
    .where('departmentKey', '==', departmentKey)
    .get();

  return {
    organizationId: orgId,
    department,
    departmentKey,
    registeredStudentCount: snap.size,
    scope: 'registered_students_in_organization_department',
    description: 'Registered student accounts whose saved department matches this organization department; not organization members or applicants.',
    generatedAt: new Date().toISOString()
  };
}

export async function createLogoImageTarget(user: DecodedIdToken, orgIdParam: string, rawBody: unknown) {
  const orgId = routeOrgId(orgIdParam);
  await assertCanManageOrganization(user, orgId);
  const input = imageTargetRequestSchema.omit({ announcementId: true }).parse(rawBody);
  return {
    storagePath: organizationLogoStoragePath(orgId, sanitizeTargetFileName(input.fileName)),
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    allowedContentTypes: ALLOWED_IMAGE_CONTENT_TYPES,
    maxSizeBytes: MAX_IMAGE_SIZE_BYTES
  };
}

export async function createAnnouncementImageTarget(user: DecodedIdToken, orgIdParam: string, rawBody: unknown) {
  const orgId = routeOrgId(orgIdParam);
  await assertCanManageOrganization(user, orgId);
  const input = imageTargetRequestSchema.parse(rawBody);
  const announcementId = input.announcementId ?? db.collection(COLLECTIONS.announcements).doc().id;
  return {
    announcementId,
    storagePath: announcementImageStoragePath(orgId, announcementId, sanitizeTargetFileName(input.fileName)),
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    allowedContentTypes: ALLOWED_IMAGE_CONTENT_TYPES,
    maxSizeBytes: MAX_IMAGE_SIZE_BYTES
  };
}

export async function createAnnouncementMediaTargets(user: DecodedIdToken, orgIdParam: string, rawBody: unknown) {
  const orgId = routeOrgId(orgIdParam);
  await assertCanManageOrganization(user, orgId);
  const input = mediaTargetRequestSchema.parse(rawBody);
  const announcementId = input.announcementId ?? db.collection(COLLECTIONS.announcements).doc().id;
  return {
    announcementId,
    items: input.files.map((file) => ({
      announcementId,
      storagePath: announcementImageStoragePath(orgId, announcementId, sanitizeTargetFileName(file.fileName)),
      contentType: file.contentType,
      sizeBytes: file.sizeBytes
    })),
    allowedContentTypes: ALLOWED_IMAGE_CONTENT_TYPES,
    maxItems: MAX_ANNOUNCEMENT_MEDIA_ITEMS,
    maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
    maxAggregateSizeBytes: MAX_ANNOUNCEMENT_MEDIA_TOTAL_BYTES
  };
}

export async function listAnnouncements(user: DecodedIdToken, rawQuery: unknown): Promise<Page<ReturnType<typeof announcementFromDoc>>> {
  await requireReadableUser(user);
  const query = announcementQuerySchema.parse(rawQuery);
  let ref: Query<DocumentData> = db.collection(COLLECTIONS.announcements).where('deletedAt', '==', null);
  if (query.orgId) {
    ref = ref.where('orgId', '==', query.orgId);
  }
  const context = query.orgId ?? '';
  const boundary = decodeCursor(query.pageToken, 'announcements', context, 2);
  ref = ref.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (boundary) ref = ref.startAfter(cursorMillis(boundary[0]), boundary[1]);
  const snap = await ref.limit(query.limit + 1).get();
  const docs = snap.docs.slice(0, query.limit);
  const likeMap = await viewerLikeMap(docs.map((doc) => doc.id), user.uid);
  const items = docs.map((doc) => announcementFromDoc(doc.data(), likeMap[doc.id] ?? false));
  const last = docs.at(-1);
  return {
    items,
    ...(snap.docs.length > query.limit && last ? { nextPageToken: encodeCursor('announcements', context, [timestampBoundary(last.get('createdAt')), last.id]) } : {})
  };
}

export async function getAnnouncement(user: DecodedIdToken, announcementIdParam: string) {
  await requireReadableUser(user);
  const announcementId = routeDocumentId(announcementIdParam, 'announcement');
  const ref = db.collection(COLLECTIONS.announcements).doc(announcementId);
  const [snap, likeSnap] = await Promise.all([ref.get(), ref.collection('likes').doc(user.uid).get()]);
  if (!snap.exists || snap.data()?.deletedAt) {
    throw new AppError('announcement_missing', 'The announcement was not found.', 404);
  }
  return announcementFromDoc(snap.data() ?? {}, likeSnap.exists);
}

export async function createAnnouncement(user: DecodedIdToken, orgIdParam: string, rawBody: unknown) {
  const orgId = routeOrgId(orgIdParam);
  const organization = await assertCanManageOrganization(user, orgId);
  const input = announcementCreateSchema.parse(rawBody);
  const media = input.media ?? (input.image ? [input.image] : []);
  const mediaAnnouncementId = media.map((item) => announcementImagePathMatch(item.storagePath)?.announcementId).find(Boolean);
  const announcementId = routeDocumentId(input.announcementId ?? mediaAnnouncementId ?? db.collection(COLLECTIONS.announcements).doc().id, 'announcement');
  validateAnnouncementMedia(orgId, announcementId, media);

  const now = Timestamp.now();
  const docRef = db.collection(COLLECTIONS.announcements).doc(announcementId);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(docRef);
    if (existing.exists) {
      throw new AppError('announcement_exists', 'That announcement id is already in use.', 409);
    }
    tx.create(docRef, {
      announcementId,
      orgId,
      organizationName: organization.name,
      organizationLogoPath: organization.logoPath ?? '',
      authorUid: user.uid,
      body: input.body,
      image: media[0] ?? null,
      media,
      likeCount: 0,
      commentCount: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });
  });

  const snap = await docRef.get();
  return announcementFromDoc(snap.data() ?? {}, false);
}

export async function updateAnnouncement(user: DecodedIdToken, orgIdParam: string, announcementIdParam: string, rawBody: unknown) {
  const orgId = routeOrgId(orgIdParam);
  await assertCanManageOrganization(user, orgId);
  const announcementId = routeDocumentId(announcementIdParam, 'announcement');
  const input = announcementUpdateSchema.parse(rawBody);
  const ref = db.collection(COLLECTIONS.announcements).doc(announcementId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.deletedAt) {
      throw new AppError('announcement_missing', 'The announcement was not found.', 404);
    }
    if (snap.data()?.orgId !== orgId) {
      throw new AppError('announcement_organization_mismatch', 'The announcement does not belong to this organization.', 400);
    }
    tx.update(ref, { body: input.body, updatedAt: FieldValue.serverTimestamp() });
  });
  return getAnnouncement(user, announcementId);
}

export async function deleteAnnouncement(user: DecodedIdToken, orgIdParam: string, announcementIdParam: string) {
  const orgId = routeOrgId(orgIdParam);
  await assertCanManageOrganization(user, orgId);
  const announcementId = routeDocumentId(announcementIdParam, 'announcement');
  const ref = db.collection(COLLECTIONS.announcements).doc(announcementId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.deletedAt) {
      throw new AppError('announcement_missing', 'The announcement was not found.', 404);
    }
    if (snap.data()?.orgId !== orgId) {
      throw new AppError('announcement_organization_mismatch', 'The announcement does not belong to this organization.', 400);
    }
    tx.delete(ref);
  });
  return { announcementId, deleted: true };
}

export async function setAnnouncementLike(user: DecodedIdToken, announcementIdParam: string, liked: boolean) {
  await requireReadableUser(user);
  const announcementId = routeDocumentId(announcementIdParam, 'announcement');
  const ref = db.collection(COLLECTIONS.announcements).doc(announcementId);
  const likeRef = ref.collection('likes').doc(user.uid);
  let nextLiked = liked;
  await db.runTransaction(async (tx) => {
    const [announcement, like] = await Promise.all([tx.get(ref), tx.get(likeRef)]);
    if (!announcement.exists || announcement.data()?.deletedAt) {
      throw new AppError('announcement_missing', 'The announcement was not found.', 404);
    }
    if (liked && !like.exists) {
      tx.create(likeRef, { uid: user.uid, announcementId, createdAt: Timestamp.now() });
      tx.update(ref, { likeCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    if (!liked && like.exists) {
      tx.delete(likeRef);
      tx.update(ref, { likeCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    nextLiked = like.exists;
  });
  const snap = await ref.get();
  return announcementFromDoc(snap.data() ?? {}, nextLiked);
}

export async function listAnnouncementComments(user: DecodedIdToken, announcementIdParam: string, rawQuery: unknown): Promise<Page<Awaited<ReturnType<typeof commentFromDoc>>>> {
  await requireReadableUser(user);
  const announcementId = routeDocumentId(announcementIdParam, 'announcement');
  const query = commentQuerySchema.parse(rawQuery);
  const announcement = await db.collection(COLLECTIONS.announcements).doc(announcementId).get();
  if (!announcement.exists || announcement.data()?.deletedAt) {
    throw new AppError('announcement_missing', 'The announcement was not found.', 404);
  }
  const boundary = decodeCursor(query.pageToken, 'announcement-comments', announcementId, 2);
  let ref = announcement.ref.collection('comments').orderBy('createdAt', 'asc').orderBy(FieldPath.documentId());
  if (boundary) ref = ref.startAfter(cursorMillis(boundary[0]), boundary[1]);
  const snap = await ref.limit(query.limit + 1).get();
  const docs = snap.docs.slice(0, query.limit);
  const organizationId = typeof announcement.data()?.orgId === 'string' ? announcement.data()?.orgId as string : undefined;
  const items = await Promise.all(docs.map((doc) => commentFromDoc(doc.data(), user.uid, organizationId)));
  const last = docs.at(-1);
  return {
    items,
    ...(snap.docs.length > query.limit && last ? { nextPageToken: encodeCursor('announcement-comments', announcementId, [timestampBoundary(last.get('createdAt')), last.id]) } : {})
  };
}

export async function addAnnouncementComment(user: DecodedIdToken, announcementIdParam: string, rawBody: unknown) {
  await requireReadableUser(user);
  const [account, input] = await Promise.all([loadAccount(user.uid), Promise.resolve(commentCreateSchema.parse(rawBody))]);
  const announcementId = routeDocumentId(announcementIdParam, 'announcement');
  const announcementRef = db.collection(COLLECTIONS.announcements).doc(announcementId);
  const commentRef = announcementRef.collection('comments').doc();
  const now = Timestamp.now();
  await db.runTransaction(async (tx) => {
    const announcement = await tx.get(announcementRef);
    if (!announcement.exists || announcement.data()?.deletedAt) {
      throw new AppError('announcement_missing', 'The announcement was not found.', 404);
    }
    tx.create(commentRef, {
      commentId: commentRef.id,
      announcementId,
      authorUid: user.uid,
      authorName: account.displayName,
      body: input.body,
      createdAt: now,
      updatedAt: now
    });
    tx.update(announcementRef, { commentCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  });
  const [snap, announcementSnap] = await Promise.all([commentRef.get(), announcementRef.get()]);
  const organizationId = typeof announcementSnap.data()?.orgId === 'string' ? announcementSnap.data()?.orgId as string : undefined;
  return commentFromDoc(snap.data() ?? {}, user.uid, organizationId);
}

export async function updateAnnouncementComment(user: DecodedIdToken, announcementIdParam: string, commentIdParam: string, rawBody: unknown) {
  await requireReadableUser(user);
  const input = commentUpdateSchema.parse(rawBody);
  const announcementId = routeDocumentId(announcementIdParam, 'announcement');
  const commentId = routeDocumentId(commentIdParam, 'comment');
  const announcementRef = db.collection(COLLECTIONS.announcements).doc(announcementId);
  const commentRef = announcementRef.collection('comments').doc(commentId);
  const now = Timestamp.now();

  await db.runTransaction(async (tx) => {
    const [announcement, comment] = await Promise.all([tx.get(announcementRef), tx.get(commentRef)]);
    if (!announcement.exists || announcement.data()?.deletedAt) {
      throw new AppError('announcement_missing', 'The announcement was not found.', 404);
    }
    if (!comment.exists) {
      throw new AppError('comment_missing', 'The comment was not found.', 404);
    }
    if (comment.data()?.authorUid !== user.uid) {
      throw new AppError('comment_owner_required', 'You can edit only your own comments.', 403);
    }
    tx.update(commentRef, { body: input.body, updatedAt: now, editedAt: now });
    tx.update(announcementRef, { updatedAt: FieldValue.serverTimestamp() });
  });

  const [snap, announcementSnap] = await Promise.all([commentRef.get(), announcementRef.get()]);
  const organizationId = typeof announcementSnap.data()?.orgId === 'string' ? announcementSnap.data()?.orgId as string : undefined;
  return commentFromDoc(snap.data() ?? {}, user.uid, organizationId);
}

export async function deleteAnnouncementComment(user: DecodedIdToken, announcementIdParam: string, commentIdParam: string) {
  await requireReadableUser(user);
  const announcementId = routeDocumentId(announcementIdParam, 'announcement');
  const commentId = routeDocumentId(commentIdParam, 'comment');
  const announcementRef = db.collection(COLLECTIONS.announcements).doc(announcementId);
  const commentRef = announcementRef.collection('comments').doc(commentId);

  await db.runTransaction(async (tx) => {
    const [announcement, comment, comments] = await Promise.all([
      tx.get(announcementRef),
      tx.get(commentRef),
      tx.get(announcementRef.collection('comments'))
    ]);
    if (!announcement.exists || announcement.data()?.deletedAt) {
      throw new AppError('announcement_missing', 'The announcement was not found.', 404);
    }
    if (!comment.exists) {
      throw new AppError('comment_missing', 'The comment was not found.', 404);
    }
    if (comment.data()?.authorUid !== user.uid) {
      throw new AppError('comment_owner_required', 'You can delete only your own comments.', 403);
    }
    tx.delete(commentRef);
    tx.update(announcementRef, {
      commentCount: Math.max(0, comments.size - 1),
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return { announcementId, commentId, deleted: true };
}

export async function listDateEntries(user: DecodedIdToken, rawQuery: unknown): Promise<Page<ReturnType<typeof dateEntryFromDoc>>> {
  await requireReadableUser(user);
  const query = dateEntryQuerySchema.parse(rawQuery);
  let ref: Query<DocumentData> = db.collection(COLLECTIONS.calendarEntries);
  if (query.organizationId) ref = ref.where('orgId', '==', query.organizationId);
  if (query.kind) ref = ref.where('kind', '==', query.kind);
  const context = JSON.stringify([query.organizationId ?? '', query.kind ?? '']);
  const boundary = decodeCursor(query.pageToken, 'date-entries', context, 3);
  ref = ref.orderBy('date', 'asc').orderBy('startTime', 'asc').orderBy(FieldPath.documentId());
  if (boundary) ref = ref.startAfter(boundary[0], boundary[1], boundary[2]);
  const snap = await ref.limit(query.limit + 1).get();
  const docs = snap.docs.slice(0, query.limit);
  const items = docs.map((doc) => dateEntryFromDoc(doc.data()));
  const last = docs.at(-1);
  return {
    items,
    ...(snap.docs.length > query.limit && last ? { nextPageToken: encodeCursor('date-entries', context, [String(last.get('date') ?? ''), String(last.get('startTime') ?? ''), last.id]) } : {})
  };
}

export async function createDateEntry(user: DecodedIdToken, orgIdParam: string, rawBody: unknown) {
  const orgId = routeOrgId(orgIdParam);
  const organization = await assertCanManageOrganization(user, orgId);
  const input = dateEntryCreateSchema.parse(rawBody);
  const ref = input.entryId
    ? db.collection(COLLECTIONS.calendarEntries).doc(input.entryId)
    : db.collection(COLLECTIONS.calendarEntries).doc();
  const now = Timestamp.now();
  const entry = {
    entryId: ref.id,
    orgId,
    organizationName: organization.name,
    kind: input.kind,
    title: input.title,
    date: input.date,
    startTime: input.startTime ?? '',
    endTime: input.endTime ?? '',
    details: input.details,
    createdByUid: user.uid,
    createdAt: now,
    updatedAt: now
  };

  if (input.entryId) {
    const saved = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        const savedEntry = existing.data() ?? {};
        const sameRequest = savedEntry.orgId === orgId && savedEntry.createdByUid === user.uid &&
          savedEntry.kind === input.kind && savedEntry.title === input.title && savedEntry.date === input.date &&
          (savedEntry.startTime ?? '') === (input.startTime ?? '') && (savedEntry.endTime ?? '') === (input.endTime ?? '') &&
          savedEntry.details === input.details;
        if (!sameRequest) {
          throw new AppError('date_entry_conflict', 'A dated entry with this save key already has different details. Refresh your organization dates before trying again.', 409);
        }
        return savedEntry;
      }
      tx.create(ref, entry);
      return entry;
    });
    return dateEntryFromDoc(saved);
  }

  await ref.create(entry);
  return dateEntryFromDoc(entry);
}

export async function updateDateEntry(user: DecodedIdToken, orgIdParam: string, entryIdParam: string, rawBody: unknown) {
  const orgId = routeOrgId(orgIdParam);
  const organization = await assertCanManageOrganization(user, orgId);
  const entryId = routeDocumentId(entryIdParam, 'date entry');
  const input = dateEntryUpsertSchema.parse(rawBody);
  const ref = db.collection(COLLECTIONS.calendarEntries).doc(entryId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new AppError('date_entry_missing', 'The date entry was not found.', 404);
    }
    if (snap.data()?.orgId !== orgId) {
      throw new AppError('date_entry_organization_mismatch', 'The date entry does not belong to this organization.', 400);
    }
    tx.update(ref, {
      organizationName: organization.name,
      kind: input.kind,
      title: input.title,
      date: input.date,
      startTime: input.startTime ?? '',
      endTime: input.endTime ?? '',
      details: input.details,
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  const snap = await ref.get();
  return dateEntryFromDoc(snap.data() ?? {});
}

export async function deleteDateEntry(user: DecodedIdToken, orgIdParam: string, entryIdParam: string) {
  const orgId = routeOrgId(orgIdParam);
  await assertCanManageOrganization(user, orgId);
  const entryId = routeDocumentId(entryIdParam, 'date entry');
  const ref = db.collection(COLLECTIONS.calendarEntries).doc(entryId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new AppError('date_entry_missing', 'The date entry was not found.', 404);
    }
    if (snap.data()?.orgId !== orgId) {
      throw new AppError('date_entry_organization_mismatch', 'The date entry does not belong to this organization.', 400);
    }
    tx.delete(ref);
  });
  return { entryId, deleted: true };
}

export function scopedDateEntryQuery(orgId: string, rawQuery: unknown): unknown {
  const query = typeof rawQuery === 'object' && rawQuery !== null && !Array.isArray(rawQuery)
    ? rawQuery as Record<string, unknown>
    : {};
  return { ...query, organizationId: routeOrgId(orgId) };
}
