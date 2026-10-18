import { z } from 'zod';
import { APPLICATION_STATUSES, MEETING_STATUSES } from '../contracts/schema';
import { orgIdSchema } from '../contracts/validation';

const trimmedString = z.string().trim();

export const opportunityIdSchema = trimmedString.min(2).max(160).regex(/^[A-Za-z0-9_-]+$/);
export const documentIdSchema = trimmedString.min(2).max(160).regex(/^[A-Za-z0-9_-]+$/);
export const MEETING_DOCUMENT_CONTENT_TYPES = ['application/pdf'] as const;
export const MAX_MEETING_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const applicationConfirmationSchema = z.object({
  organizationId: orgIdSchema,
  opportunityId: opportunityIdSchema,
  externalFormOpened: z.literal(true, { error: 'Open the external form before confirming in SOAR.' }),
  confirmedExternalSubmission: z.literal(true, { error: 'Confirm the external submission before SOAR can list it for officers.' })
});

export const applicationStageUpdateSchema = z.object({
  status: z.enum(APPLICATION_STATUSES)
});

export const isoDateStringSchema = trimmedString.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD for the requested date.').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, 'Use a real calendar date.');

export const timeStringSchema = trimmedString.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm 24-hour time.');

const meetingDocumentSchema = z.object({
  storagePath: trimmedString.max(512),
  fileName: trimmedString.min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._ -]*\.pdf$/i, 'Use a simple PDF file name.'),
  contentType: z.enum(MEETING_DOCUMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_MEETING_DOCUMENT_SIZE_BYTES)
}).strict();

export const meetingRequestSchema = z.object({
  organizationId: orgIdSchema,
  dateEntryId: documentIdSchema,
  requestedDate: isoDateStringSchema,
  requestedTime: timeStringSchema,
  note: trimmedString.max(1000).optional(),
  document: meetingDocumentSchema.optional()
});

export const meetingDocumentTargetSchema = z.object({
  organizationId: orgIdSchema,
  dateEntryId: documentIdSchema,
  requestedDate: isoDateStringSchema,
  requestedTime: timeStringSchema,
  fileName: trimmedString.min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._ -]*\.pdf$/i, 'Use a simple PDF file name.'),
  contentType: z.enum(MEETING_DOCUMENT_CONTENT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_MEETING_DOCUMENT_SIZE_BYTES)
}).strict();

export const meetingStatusUpdateSchema = z.object({
  status: z.enum(MEETING_STATUSES)
});
