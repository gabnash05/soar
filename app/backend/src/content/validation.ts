import { z } from 'zod';
import { departmentSchema, orgIdSchema } from '../contracts/validation';

export const ALLOWED_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_ANNOUNCEMENT_MEDIA_ITEMS = 4;
export const MAX_ANNOUNCEMENT_MEDIA_TOTAL_BYTES = 30 * 1024 * 1024;

const trimmedString = z.string().trim();
const optionalText = (max: number) => trimmedString.max(max).optional();
const blankableText = (max: number) => z.string().trim().max(max).optional();
const organizationDepartmentUpdateSchema = z.union([departmentSchema, z.literal('')]);

const httpsUrl = trimmedString.url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'URL must be a valid HTTPS URL without embedded credentials.');

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  pageToken: z.string().min(1).max(2048).optional()
});

export const organizationListQuerySchema = paginationSchema.extend({
  q: optionalText(80)
});

export const organizationProfileUpdateSchema = z.object({
  applicationsOpen: z.boolean().optional(),
  reportsUrl: z.union([httpsUrl, z.literal('')]).optional(),
  name: optionalText(140),
  shortDescription: blankableText(180),
  description: blankableText(4000),
  contactEmail: z.union([trimmedString.email().max(254), z.literal('')]).optional(),
  contactPhone: z.string().trim().max(40).regex(/^$|^\+?[0-9][0-9\s().-]{5,30}(?:\s?(?:x|ext\.?|extension)\s?\d{1,6})?$/i, 'Use a valid contact phone number.').optional(),
  department: organizationDepartmentUpdateSchema.optional(),
  logoPath: z.string().trim().max(512).optional(),
  logo: z.object({
    storagePath: z.string().trim().max(512),
    contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
    sizeBytes: z.number().int().min(1).max(MAX_IMAGE_SIZE_BYTES)
  }).optional(),
  recruitment: z.object({
    title: blankableText(140),
    requirements: blankableText(4000),
    instructions: blankableText(4000),
    applicationLink: z.union([trimmedString.url().max(2048).refine((value) => { try { const url = new URL(value); return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password; } catch { return false; } }, 'URL must use http or https without embedded credentials.'), z.literal('')]).optional()
  }).optional()
}).strict();

export const imageTargetRequestSchema = z.object({
  fileName: trimmedString.min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use a simple file name without folders.'),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_IMAGE_SIZE_BYTES),
  announcementId: z.string().trim().min(4).max(128).regex(/^[A-Za-z0-9_-]+$/).optional()
}).strict();

const announcementMediaTargetFileSchema = z.object({
  fileName: trimmedString.min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use a simple file name without folders.'),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_IMAGE_SIZE_BYTES)
}).strict();

export const mediaTargetRequestSchema = z.object({
  announcementId: z.string().trim().min(4).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
  files: z.array(announcementMediaTargetFileSchema).min(1).max(MAX_ANNOUNCEMENT_MEDIA_ITEMS)
}).strict().superRefine((value, ctx) => {
  const total = value.files.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (total > MAX_ANNOUNCEMENT_MEDIA_TOTAL_BYTES) {
    ctx.addIssue({ code: 'custom', path: ['files'], message: 'Announcement images exceed the total upload limit.' });
  }
});

export const announcementQuerySchema = paginationSchema.extend({
  orgId: orgIdSchema.optional()
});

const announcementMediaItemSchema = z.object({
  storagePath: z.string().trim().max(512),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_IMAGE_SIZE_BYTES),
  alt: z.string().trim().max(180).optional().default('')
}).strict();

export const announcementUpdateSchema = z.object({
  body: trimmedString.min(1).max(4000)
}).strict();

export const announcementCreateSchema = z.object({
  announcementId: z.string().trim().min(4).max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
  body: trimmedString.min(1).max(4000),
  image: announcementMediaItemSchema.optional(),
  media: z.array(announcementMediaItemSchema).min(1).max(MAX_ANNOUNCEMENT_MEDIA_ITEMS).optional()
}).strict().superRefine((value, ctx) => {
  if (value.image && value.media) {
    ctx.addIssue({ code: 'custom', path: ['media'], message: 'Use either legacy image or media, not both.' });
  }
  const media = value.media ?? (value.image ? [value.image] : []);
  const total = media.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (total > MAX_ANNOUNCEMENT_MEDIA_TOTAL_BYTES) {
    ctx.addIssue({ code: 'custom', path: ['media'], message: 'Announcement images exceed the total upload limit.' });
  }
});

export const commentQuerySchema = paginationSchema;

export const commentCreateSchema = z.object({
  body: trimmedString.min(1).max(1200)
}).strict();

export const commentUpdateSchema = commentCreateSchema;

export const dateEntryKinds = ['event', 'availability'] as const;

export const dateEntryQuerySchema = paginationSchema.extend({
  organizationId: orgIdSchema.optional(),
  kind: z.enum(dateEntryKinds).optional()
});

const isoDate = trimmedString.regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Date must be a valid YYYY-MM-DD date.');
const timeOfDay = trimmedString.regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const dateEntryUpsertSchema = z.object({
  kind: z.enum(dateEntryKinds),
  title: trimmedString.min(1).max(160),
  date: isoDate,
  startTime: timeOfDay.optional(),
  endTime: timeOfDay.optional(),
  details: trimmedString.min(1).max(2000)
}).strict().superRefine((value, ctx) => {
  if (value.startTime && value.endTime && value.endTime <= value.startTime) {
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time.' });
  }
});

const dateEntryIdSchema = z.string().trim().min(4).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const dateEntryCreateSchema = dateEntryUpsertSchema.safeExtend({ entryId: dateEntryIdSchema.optional() });

export function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function assertLogoPathForOrganization(orgId: string, path: string): void {
  if (!new RegExp(`^organization-logos/${orgId}/[A-Za-z0-9][A-Za-z0-9._-]*$`).test(path)) {
    throw new Error('Logo path must stay under this organization logo folder.');
  }
}

export function announcementImagePathMatch(path: string): { orgId: string; announcementId: string } | null {
  const match = /^announcement-images\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/[A-Za-z0-9][A-Za-z0-9._-]*$/.exec(path);
  return match ? { orgId: match[1], announcementId: match[2] } : null;
}
