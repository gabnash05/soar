import type { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ACCOUNT_ROLES } from './schema';

const trimmedString = z.string().trim();

export const displayNameSchema = trimmedString.min(2).max(120);
export const emailSchema = trimmedString.email().max(254).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(8).max(1024);
export const studentIdSchema = trimmedString.min(2).max(64);
export const companyNameSchema = trimmedString.min(2).max(140).optional();
export const uidSchema = trimmedString.min(1).max(128);
export const orgIdSchema = trimmedString.min(2).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const slugSchema = trimmedString.min(2).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const paidRegistrationCompletionSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  role: z.enum(ACCOUNT_ROLES),
  studentId: studentIdSchema.optional(),
  companyName: companyNameSchema,
  entitlement: z.object({
    provider: trimmedString.min(2).max(64),
    providerEventId: trimmedString.min(2).max(256),
    accessExpiresAt: z.custom<Timestamp>((value) => {
      return typeof value === 'object' && value !== null && 'toMillis' in value;
    }, 'accessExpiresAt must be a Firestore Timestamp'),
    amount: z.object({
      currency: z.literal('PHP'),
      minor: z.literal(1000)
    }),
    intentId: trimmedString.min(2).max(256)
  })
}).superRefine((value, ctx) => {
  if (value.role === 'student' && !value.studentId) {
    ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'studentId is required for student accounts.' });
  }

  if (value.role === 'sponsor' && value.studentId) {
    ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'Sponsors must not include a studentId.' });
  }
});

export const organizationProfileSchema = z.object({
  name: trimmedString.min(2).max(140),
  slug: slugSchema,
  shortDescription: trimmedString.max(180).optional(),
  description: trimmedString.max(4000).optional(),
  contactEmail: emailSchema.optional(),
  logoPath: trimmedString.max(512).optional(),
  recruitment: z.object({
    opportunityId: trimmedString.min(2).max(160).regex(/^[A-Za-z0-9_-]+$/).optional(),
    title: trimmedString.max(140).optional(),
    requirements: trimmedString.max(4000).optional(),
    instructions: trimmedString.max(4000).optional(),
    applicationLink: trimmedString.url().max(2048).optional()
  }).optional()
});

export const createOrganizationSchema = organizationProfileSchema.extend({
  orgId: orgIdSchema,
  ownerUid: uidSchema
});

export const displayNameUpdateSchema = z.object({
  displayName: displayNameSchema
});

export const emailChangeSchema = z.object({
  newEmail: emailSchema,
  currentPassword: z.string().min(1).max(1024),
  continueUrl: z.string().url().max(2048).optional()
});

export const createOfficerGrantSchema = z.object({
  uid: uidSchema
});
