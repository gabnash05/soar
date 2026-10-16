# SOAR content backend

This document is the backend contract for the MVP organization/content lane.
It extends the existing Firebase Functions Express API and uses the identity foundation's Firebase Auth bearer token, verified-email gate, active six-month entitlement gate, and organization owner/officer-grant management model.

## Scope implemented

Implemented content services:

- organization directory listing with name search;
- organization profile and recruitment reads, including optional public contact phone;
- approved organization-manager profile and recruitment updates;
- department-linked organization registered-student counts for approved managers;
- announcement feed and organization-scoped posts;
- announcement create/delete by approved organization managers;
- up to four bounded announcement images through the existing Storage design;
- direct announcement deep-link lookup by stable announcement id;
- persisted like/unlike with consistent counts;
- persisted comments with consistent counts, plus own-comment edit/delete;
- public dated event entries and requestable meeting/interview availability entries;
- storage path target helpers for organization logos and announcement media;
- focused Firestore/Storage rule coverage for direct SDK bypasses.

Not implemented in this lane:

- application tracker services;
- meeting request services and officer decisions;
- frontend integration changes;
- previews, because image previews remain frontend-owned before upload;
- payment-provider onboarding, production deploys, billing changes, live data migrations, notifications, analytics, broad dashboards beyond the approved department count, or CI setup.

## Shared security model

All content HTTP routes require `Authorization: Bearer <Firebase ID token>`.
Read routes require a verified email and active six-month entitlement.
Write routes that affect an organization require the caller to be either the assigned `organizations/{orgId}.ownerUid` or an active `organizations/{orgId}/officerGrants/{uid}` grantee.
Officer access is organization-specific and officers remain student accounts.
Sponsors and students with active verified access may read content, like posts, and comment.
Only approved managers for the organization may update profiles, recruitment, posts, images targets, and date entries.

Direct client Firestore writes to organizations, announcements, announcement likes/comments, and calendar entries are blocked by rules.
The backend owns those mutations so counts, ownership, and validation stay canonical.
Existing private application, meeting, account, entitlement, and officer-grant boundaries remain preserved.

## HTTP route conventions

The Firebase Functions export remains `api`.
Routes are available both as bare paths and with `/api` prefixes.
For example, `GET /organizations` and `GET /api/organizations` call the same handler.
Errors use the existing JSON shape:

```json
{
  "code": "validation_problem",
  "message": "The request contains invalid fields.",
  "problems": {
    "body": "Too small: expected string to have >=1 characters"
  }
}
```

Application errors return `{ "code", "message", "action?" }`.
Pagination is intentionally small and bounded.
`limit` defaults to `20` and cannot exceed `50`.
`pageToken` is an offset token returned by the previous response.

## Organizations

Department organization links use only these canonical labels: `Civil Engineering Department`, `Architecture Department`, `Electrical Engineering Department`, `Computer Engineering Department`, `Mechanical Engineering Department`, `Electronics Engineering Department`, and `Geodetic Engineering`.

### `GET /organizations?q=&limit=&pageToken=`

Lists organization summaries visible to active verified users.
`q` performs name-only search.

Response:

```json
{
  "items": [
    {
      "id": "computer-engineering",
      "orgId": "computer-engineering",
      "slug": "computer-engineering-department",
      "name": "Computer Engineering Department",
      "shortDescription": "Computer engineering department organization.",
      "description": "Computer Engineering Department posts opportunities and meeting availability.",
      "contactEmail": "computer.engineering@example.edu",
      "contactPhone": "+63 917 555 0101",
      "department": "Computer Engineering Department",
      "departmentKey": "computer engineering department",
      "logoPath": "organization-logos/computer-engineering/logo.png",
      "recruitmentTitle": "Build Team 2026",
      "updatedAt": "2026-10-08T00:00:00.000Z"
    }
  ],
  "nextPageToken": "20"
}
```

### `GET /organizations/:orgId`

Returns a profile with recruitment, recent posts, dated entries, and optional public `contactPhone`.

### `GET /organizations/:orgId/student-department-counts`

Returns the aggregate count of registered student accounts whose saved department matches the saved department link on `organizations/{orgId}`. This endpoint is currently limited to approved managers of `orgId` (owner or active officer grant) while product visibility is pending. It does not accept a department key from the client and returns no student identities, emails, account ids, applications, meetings, memberships, or global totals.

Response:

```json
{
  "organizationId": "computer-engineering",
  "department": "Computer Engineering Department",
  "departmentKey": "computer engineering department",
  "registeredStudentCount": 12,
  "scope": "registered_students_in_organization_department",
  "description": "Registered student accounts whose saved department matches this organization department; not organization members or applicants.",
  "generatedAt": "2026-10-13T00:00:00.000Z"
}
```

If the organization has no supported department link, the endpoint returns `409 organization_department_missing`.

### `PATCH /organizations/:orgId`

Approved managers update only public profile and recruitment fields.
`ownerUid`, officer grants, account roles, entitlements, and private records cannot be changed through this route.

Request fields:

```json
{
  "name": "Computer Engineering Department",
  "shortDescription": "Short directory text.",
  "description": "Long profile text.",
  "contactEmail": "computer.engineering@example.edu",
  "contactPhone": "+63 917 555 0101",
  "department": "Computer Engineering Department",
  "logoPath": "organization-logos/computer-engineering/logo.png",
  "recruitment": {
    "title": "Build Team 2026",
    "requirements": "Student makers welcome.",
    "instructions": "Open and submit the external form, then confirm in SOAR.",
    "applicationLink": "https://forms.gle/example"
  }
}
```

`applicationLink` must be an `http` or `https` URL.
`contactPhone` is optional and accepts bounded international-friendly phone text; an empty string clears it.
`department` must be one of the supported canonical department labels or an empty string to clear a legacy/mistaken link.
An empty string clears an optional text/link field.
Logo paths must stay under `organization-logos/{orgId}/...`.

## Announcements

### `GET /announcements?orgId=&limit=&pageToken=`

Returns newest-first posts.
If `orgId` is supplied, the feed is scoped to one organization.
Each post includes `likeCount`, `commentCount`, `viewerHasLiked`, `deepLinkPath`, legacy `image`, and `media[]` for the signed-in user.

### `GET /announcements/:announcementId`

Returns one accessible non-deleted announcement by stable id using the same DTO as the feed. The UI direct-copy link should target the existing route path in `deepLinkPath`, for example `/app?announcementId=post_abc123`; this does not bypass active-access checks.

### `POST /organizations/:orgId/announcements`

Approved managers publish a non-empty text post.
Media is optional and must reference validated Storage paths. Legacy `image` remains supported; new clients should use `media` for up to four images.
When media is used, either provide `announcementId` or use the `announcementId` returned by the image/media-target helper.

```json
{
  "announcementId": "post_abc123",
  "body": "Tryouts are scheduled this Friday.",
  "media": [
    {
      "storagePath": "announcement-images/robotics/post_abc123/photo.webp",
      "contentType": "image/webp",
      "sizeBytes": 123456,
      "alt": "Students working in the robotics lab"
    }
  ]
}
```

Image limits: JPEG/PNG/WebP/GIF, at most 5 MiB each, up to four images, and 30 MiB aggregate declared size.

### `DELETE /organizations/:orgId/announcements/:announcementId`

Approved managers delete their organization's post.
The route rejects posts belonging to another organization.

### `POST /announcements/:announcementId/like`

Likes once for the signed-in user and increments the stored count only when a like is newly created.

### `DELETE /announcements/:announcementId/like`

Removes the signed-in user's like and decrements the stored count only when a like existed.

### `GET /announcements/:announcementId/comments?limit=&pageToken=`

Lists comments oldest first. Comment DTOs include `viewerCanEdit` and `viewerCanDelete` for the signed-in author and do not include commenter email.

### `POST /announcements/:announcementId/comments`

Adds a non-empty comment for the signed-in user and increments the stored count transactionally.

```json
{
  "body": "Is this open to first-year students?"
}
```

### `PATCH /announcements/:announcementId/comments/:commentId`

Edits the signed-in author's own comment body only. The backend ignores any submitted author id and does not change `commentCount`.

### `DELETE /announcements/:announcementId/comments/:commentId`

Deletes the signed-in author's own comment and recomputes the announcement `commentCount` transactionally. Repeated deletion returns `404 comment_missing`.

## Dated entries

Date entries are stored in `calendarEntries/{entryId}`.
Every record has explicit organization linkage and an explicit `kind`.
The meeting-request lane should only create requests against records with `kind: "availability"`.

### `GET /date-entries?organizationId=&kind=&limit=&pageToken=`

Lists entries ordered by date and start time.
`kind` is optional and must be `event` or `availability` when supplied.

### `GET /organizations/:orgId/date-entries?kind=&limit=&pageToken=`

Organization-scoped equivalent.

### `POST /organizations/:orgId/date-entries`

Approved managers create a public event or requestable availability entry.

### `PATCH /organizations/:orgId/date-entries/:entryId`

Approved managers update a date entry owned by the same organization.

### `DELETE /organizations/:orgId/date-entries/:entryId`

Approved managers delete a date entry owned by the same organization.

Request body for create/update:

```json
{
  "kind": "availability",
  "title": "Build Team interview window",
  "date": "2026-11-12",
  "startTime": "14:00",
  "endTime": "16:00",
  "details": "Request one time during this window after submitting the external form."
}
```

`date` must be a real `YYYY-MM-DD` date.
Times, when present, must be `HH:mm`; `endTime` must be later than `startTime`.
`title` and `details` cannot be empty.

## Media handling

Organization logos and legacy announcement images are uploaded directly by the frontend to Firebase Storage after local preview.
The backend target endpoints validate metadata and return canonical Storage paths.
Storage rules independently enforce active verified access, organization management, allowed media types, and size limits.

Allowed content types:

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`

Maximum logo/image size: `5 MiB`.
Announcement images are limited to `5 MiB` each, four images total, and `30 MiB` aggregate.

### `POST /organizations/:orgId/logo-image-targets`

Request:

```json
{
  "fileName": "logo.png",
  "contentType": "image/png",
  "sizeBytes": 123456
}
```

Response:

```json
{
  "storagePath": "organization-logos/robotics/1760000000000-logo.png",
  "contentType": "image/png",
  "sizeBytes": 123456,
  "allowedContentTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"],
  "maxSizeBytes": 5242880
}
```

### `POST /organizations/:orgId/announcements/image-targets`

Legacy single-image target. Request is the same as logo targets and may include `announcementId`.
If `announcementId` is omitted, the backend returns one.
Use that id when publishing the post.

### `POST /organizations/:orgId/announcements/media-targets`

Request:

```json
{
  "announcementId": "post_abc123",
  "files": [
    { "fileName": "photo.webp", "contentType": "image/webp", "sizeBytes": 123456 }
  ]
}
```

Response includes `announcementId`, `items[]` with canonical Storage paths, `allowedContentTypes`, `maxItems`, `maxSizeBytes`, and `maxAggregateSizeBytes`.

## Local validation

Install dependencies from the repository root:

```bash
npm ci
```

Useful checks:

```bash
npm run typecheck
npm test
npm --workspace app/backend run test:content
npm --workspace app/backend run test:rules:firestore
npm --workspace app/backend run test:rules:storage
```

The standard combined emulator command remains:

```bash
firebase emulators:exec --project soar-a711e --only firestore,storage "npm --workspace app/backend run test:rules"
```

In this validation environment, the combined rule command could not start because the Firebase CLI could not spawn Java:

```text
Error: Could not spawn `java -version`. Please make sure Java is installed and on your system PATH.
```

The Firestore and Storage rule tests are updated in this branch but require a local Java runtime for Firebase emulators before they can execute.
Storage emulator discovery may also require the same pragmatic workaround described in `docs/backend/identity-foundation.md` once Java is available.
No production Firebase deploy, live billing change, data migration, or payment-provider action is performed by this lane.

## Local-only entitlement note

Tests and fixture data may seed local emulator `entitlements/{uid}` documents with active dates to exercise MVP content access.
Those records are test-only, run only against local emulators, and do not activate production access.
Production access remains owned by the payment foundation and provider-confirmed entitlement flow.
