import type { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ACCOUNT_ROLES, DEPARTMENT_LABELS } from './schema';

const trimmedString = z.string().trim();

export const displayNameSchema = trimmedString.min(2).max(120);
export const emailSchema = trimmedString.email().max(254).transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(8).max(1024);
export const studentIdSchema = trimmedString.min(2).max(64);

export function normalizeDepartment(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeDepartmentKey(value: string): string {
  return normalizeDepartment(value).toLocaleLowerCase();
}

const departmentByKey = new Map(DEPARTMENT_LABELS.map((department) => [normalizeDepartmentKey(department), department]));
const departmentKeys = new Set(DEPARTMENT_LABELS.map((department) => normalizeDepartmentKey(department)));

export function canonicalDepartment(value: string): string | undefined {
  return departmentByKey.get(normalizeDepartmentKey(value));
}

export function canonicalDepartmentKey(value: string): string | undefined {
  const key = normalizeDepartmentKey(value);
  return departmentKeys.has(key) ? key : undefined;
}

export const departmentSchema = trimmedString.min(2).max(100).transform((value, ctx) => {
  const canonical = canonicalDepartment(value);
  if (!canonical) {
    ctx.addIssue({ code: 'custom', message: 'Choose one of the supported departments.' });
    return z.NEVER;
  }
  return canonical;
});
export const departmentKeySchema = trimmedString.min(2).max(100).transform((value, ctx) => {
  const key = canonicalDepartmentKey(value);
  if (!key) {
    ctx.addIssue({ code: 'custom', message: 'Choose one of the supported departments.' });
    return z.NEVER;
  }
  return key;
});
export const companyNameSchema = trimmedString.min(2).max(140).optional();
export const uidSchema = trimmedString.min(1).max(128);
export const orgIdSchema = trimmedString.min(2).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const slugSchema = trimmedString.min(2).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const previewRegistrationSchema = z.object({
  role: z.enum(ACCOUNT_ROLES),
  displayName: displayNameSchema,
  studentId: studentIdSchema.optional(),
  department: departmentSchema.optional(),
  companyName: companyNameSchema,
}).strict().superRefine((value, ctx) => {
  if (value.role === 'student' && !value.studentId) {
    ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'studentId is required for student accounts.' });
  }

  if (value.role === 'student' && !value.department) {
    ctx.addIssue({ code: 'custom', path: ['department'], message: 'department is required for student accounts.' });
  }

  if (value.role === 'sponsor' && value.studentId) {
    ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'Sponsors must not include a studentId.' });
  }

  if (value.role === 'sponsor' && value.department) {
    ctx.addIssue({ code: 'custom', path: ['department'], message: 'Sponsors must not include a department.' });
  }
});

export const paidRegistrationCompletionSchema = z.object({
  email: emailSchema,
  uid: uidSchema.optional(),
  password: passwordSchema.optional(),
  displayName: displayNameSchema,
  role: z.enum(ACCOUNT_ROLES),
  studentId: studentIdSchema.optional(),
  department: departmentSchema.optional(),
  departmentKey: departmentKeySchema.optional(),
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
  if (!value.uid && !value.password) {
    ctx.addIssue({ code: 'custom', path: ['password'], message: 'password is required when no authenticated uid is supplied.' });
  }

  if (value.role === 'student' && !value.studentId) {
    ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'studentId is required for student accounts.' });
  }

  if (value.role === 'student' && !value.department) {
    ctx.addIssue({ code: 'custom', path: ['department'], message: 'department is required for student accounts.' });
  }

  if (value.role === 'student' && value.department && value.departmentKey && value.departmentKey !== normalizeDepartmentKey(value.department)) {
    ctx.addIssue({ code: 'custom', path: ['departmentKey'], message: 'departmentKey must match the selected department.' });
  }

  if (value.role === 'sponsor' && value.studentId) {
    ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'Sponsors must not include a studentId.' });
  }

  if (value.role === 'sponsor' && value.department) {
    ctx.addIssue({ code: 'custom', path: ['department'], message: 'Sponsors must not include a department.' });
  }

  if (value.role === 'sponsor' && value.departmentKey) {
    ctx.addIssue({ code: 'custom', path: ['departmentKey'], message: 'Sponsors must not include a departmentKey.' });
  }
});

export const organizationProfileSchema = z.object({
  name: trimmedString.min(2).max(140),
  slug: slugSchema,
  shortDescription: trimmedString.max(180).optional(),
  description: trimmedString.max(4000).optional(),
  contactEmail: emailSchema.optional(),
  contactPhone: z.string().trim().max(40).regex(/^$|^\+?[0-9][0-9\s().-]{5,30}(?:\s?(?:x|ext\.?|extension)\s?\d{1,6})?$/i, 'Use a valid contact phone number.').optional(),
  department: departmentSchema.optional(),
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
