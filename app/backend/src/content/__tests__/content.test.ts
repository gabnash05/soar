import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_SIZE_BYTES,
  announcementCreateSchema,
  announcementImagePathMatch,
  assertLogoPathForOrganization,
  dateEntryUpsertSchema,
  imageTargetRequestSchema,
  normalizedName,
  organizationProfileUpdateSchema
} from '../validation';

function expectParseFailure(fn: () => unknown) {
  expect(fn).toThrow();
}

describe('content validation', () => {
  it('normalizes names for bounded directory search', () => {
    expect(normalizedName('  Robotics   Guild  ')).toBe('robotics guild');
  });

  it('accepts only http and https recruitment application links', () => {
    expect(organizationProfileUpdateSchema.parse({ recruitment: { applicationLink: 'https://forms.gle/example' } }).recruitment?.applicationLink).toBe('https://forms.gle/example');
    expectParseFailure(() => organizationProfileUpdateSchema.parse({ recruitment: { applicationLink: 'javascript:alert(1)' } }));
  });

  it('rejects empty announcements and comments through schemas', () => {
    expect(announcementCreateSchema.parse({ body: '  Tryouts Friday  ' }).body).toBe('Tryouts Friday');
    expectParseFailure(() => announcementCreateSchema.parse({ body: '   ' }));
  });

  it('validates image metadata before Storage writes are referenced', () => {
    expect(imageTargetRequestSchema.parse({ fileName: 'logo.png', contentType: 'image/png', sizeBytes: 1024 }).contentType).toBe('image/png');
    expectParseFailure(() => imageTargetRequestSchema.parse({ fileName: '../logo.png', contentType: 'image/png', sizeBytes: 1024 }));
    expectParseFailure(() => imageTargetRequestSchema.parse({ fileName: 'logo.svg', contentType: 'image/svg+xml', sizeBytes: 1024 }));
    expectParseFailure(() => imageTargetRequestSchema.parse({ fileName: 'logo.png', contentType: 'image/png', sizeBytes: MAX_IMAGE_SIZE_BYTES + 1 }));
  });

  it('keeps image paths inside canonical organization-owned folders', () => {
    expect(() => assertLogoPathForOrganization('org1', 'organization-logos/org1/logo.png')).not.toThrow();
    expect(() => assertLogoPathForOrganization('org1', 'organization-logos/org2/logo.png')).toThrow();
    expect(announcementImagePathMatch('announcement-images/org1/post1/photo.webp')).toEqual({ orgId: 'org1', announcementId: 'post1' });
    expect(announcementImagePathMatch('announcement-images/org2/post1/photo.webp')).toEqual({ orgId: 'org2', announcementId: 'post1' });
    expect(announcementImagePathMatch('announcement-images/org1/post1/../photo.webp')).toBeNull();
  });

  it('distinguishes public events from requestable availability with validated dates and times', () => {
    expect(dateEntryUpsertSchema.parse({ kind: 'event', title: 'Build Night', date: '2026-11-09', details: 'Open lab.' }).kind).toBe('event');
    expect(dateEntryUpsertSchema.parse({ kind: 'availability', title: 'Interview window', date: '2026-11-12', startTime: '14:00', endTime: '16:00', details: 'Request a slot.' }).kind).toBe('availability');
    expectParseFailure(() => dateEntryUpsertSchema.parse({ kind: 'availability', title: 'Bad', date: '2026-13-12', details: 'Invalid.' }));
    expectParseFailure(() => dateEntryUpsertSchema.parse({ kind: 'availability', title: 'Bad', date: '2026-11-12', startTime: '16:00', endTime: '14:00', details: 'Invalid.' }));
  });
});
