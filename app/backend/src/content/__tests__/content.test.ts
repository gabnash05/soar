import { describe, expect, it } from 'vitest';
import {
  MAX_ANNOUNCEMENT_MEDIA_TOTAL_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  announcementCreateSchema,
  announcementImagePathMatch,
  assertLogoPathForOrganization,
  dateEntryUpsertSchema,
  imageTargetRequestSchema,
  mediaTargetRequestSchema,
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

  it('accepts only http and https recruitment application links, bounded contact phone numbers, and canonical departments', () => {
    expect(organizationProfileUpdateSchema.parse({ recruitment: { applicationLink: 'https://forms.gle/example' } }).recruitment?.applicationLink).toBe('https://forms.gle/example');
    expect(organizationProfileUpdateSchema.parse({ contactPhone: '+63 917 555 0101' }).contactPhone).toBe('+63 917 555 0101');
    expect(organizationProfileUpdateSchema.parse({ department: 'Computer Engineering Department' }).department).toBe('Computer Engineering Department');
    expect(organizationProfileUpdateSchema.parse({ department: '' }).department).toBe('');
    expectParseFailure(() => organizationProfileUpdateSchema.parse({ recruitment: { applicationLink: 'javascript:alert(1)' } }));
    expectParseFailure(() => organizationProfileUpdateSchema.parse({ contactPhone: '<script>alert(1)</script>' }));
    expectParseFailure(() => organizationProfileUpdateSchema.parse({ department: 'Computer Science' }));
  });

  it('rejects empty announcements and comments through schemas', () => {
    expect(announcementCreateSchema.parse({ body: '  Tryouts Friday  ' }).body).toBe('Tryouts Friday');
    expectParseFailure(() => announcementCreateSchema.parse({ body: '   ' }));
  });

  it('accepts media-only announcement payloads and rejects the legacy-image plus media combination', () => {
    const image = { storagePath: 'announcement-images/org1/post1/photo.png', contentType: 'image/png', sizeBytes: 64, alt: 'photo.png' } as const;
    expect(announcementCreateSchema.parse({ body: 'Photo update', media: [image] }).media).toHaveLength(1);
    const invalid = announcementCreateSchema.safeParse({ body: 'Photo update', image, media: [image] });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues).toContainEqual(expect.objectContaining({ path: ['media'], message: 'Use either legacy image or media, not both.' }));
    }
  });

  it('validates image metadata before Storage writes are referenced', () => {
    expect(imageTargetRequestSchema.parse({ fileName: 'logo.png', contentType: 'image/png', sizeBytes: 1024 }).contentType).toBe('image/png');
    expect(mediaTargetRequestSchema.parse({ files: [{ fileName: 'a.png', contentType: 'image/png', sizeBytes: 1024 }, { fileName: 'b.mp4', contentType: 'video/mp4', sizeBytes: 2048 }] }).files).toHaveLength(2);
    expectParseFailure(() => imageTargetRequestSchema.parse({ fileName: '../logo.png', contentType: 'image/png', sizeBytes: 1024 }));
    expectParseFailure(() => imageTargetRequestSchema.parse({ fileName: 'logo.svg', contentType: 'image/svg+xml', sizeBytes: 1024 }));
    expectParseFailure(() => imageTargetRequestSchema.parse({ fileName: 'logo.png', contentType: 'image/png', sizeBytes: MAX_IMAGE_SIZE_BYTES + 1 }));
    expectParseFailure(() => mediaTargetRequestSchema.parse({ files: Array.from({ length: 5 }, (_, index) => ({ fileName: `image-${index}.png`, contentType: 'image/png', sizeBytes: 1024 })) }));
    expectParseFailure(() => mediaTargetRequestSchema.parse({ files: [{ fileName: 'a.mp4', contentType: 'video/mp4', sizeBytes: MAX_VIDEO_SIZE_BYTES }, { fileName: 'b.webm', contentType: 'video/webm', sizeBytes: 1024 }] }));
    expectParseFailure(() => announcementCreateSchema.parse({ body: 'Too large', media: [{ storagePath: 'announcement-images/org1/post1/a.mp4', contentType: 'video/mp4', sizeBytes: MAX_ANNOUNCEMENT_MEDIA_TOTAL_BYTES + 1 }] }));
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
