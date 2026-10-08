# SOAR content backend

This document is the backend contract for the MVP organization/content lane.
It extends the existing Firebase Functions Express API and uses the identity foundation's Firebase Auth bearer token, verified-email gate, active annual entitlement gate, and organization owner/officer-grant management model.

## Scope implemented

Implemented content services:

- organization directory listing with name search;
- organization profile and recruitment reads;
- approved organization-manager profile and recruitment updates;
- announcement feed and organization-scoped posts;
- announcement create/delete by approved organization managers;
- persisted like/unlike with consistent counts;
- persisted comments with consistent counts;
- public dated event entries and requestable meeting/interview availability entries;
- storage path target helpers for organization logos and announcement images;
- focused Firestore/Storage rule coverage for direct SDK bypasses.

Not implemented in this lane:

- application tracker services;
- meeting request services and officer decisions;
- frontend integration changes;
- previews, because image previews remain frontend-owned before upload;
- payment-provider onboarding, production deploys, billing changes, live data migrations, notifications, analytics, dashboard counters, or CI setup.

## Shared security model

All content HTTP routes require `Authorization: Bearer <Firebase ID token>`.
Read routes require a verified email and active annual entitlement.
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

### `GET /organizations?q=&limit=&pageToken=`

Lists organization summaries visible to active verified users.
`q` performs name-only search.

Response:

```json
{
  "items": [
    {
      "id": "robotics",
      "orgId": "robotics",
      "slug": "robotics-guild",
      "name": "Robotics Guild",
      "shortDescription": "Builds robots.",
      "description": "Builds robots and runs workshops.",
      "contactEmail": "robotics@example.edu",
      "logoPath": "organization-logos/robotics/logo.png",
      "recruitmentTitle": "Build Team 2026",
      "updatedAt": "2026-10-08T00:00:00.000Z"
    }
  ],
  "nextPageToken": "20"
}
```

### `GET /organizations/:orgId`

Returns a profile with recruitment, recent posts, and dated entries.

### `PATCH /organizations/:orgId`

Approved managers update only public profile and recruitment fields.
`ownerUid`, officer grants, account roles, entitlements, and private records cannot be changed through this route.

Request fields:

```json
{
  "name": "Robotics Guild",
  "shortDescription": "Short directory text.",
  "description": "Long profile text.",
  "contactEmail": "robotics@example.edu",
  "logoPath": "organization-logos/robotics/logo.png",
  "recruitment": {
    "title": "Build Team 2026",
    "requirements": "Student makers welcome.",
    "instructions": "Open and submit the external form, then confirm in SOAR.",
    "applicationLink": "https://forms.gle/example"
  }
}
```

`applicationLink` must be an `http` or `https` URL.
An empty string clears an optional text/link field.
Logo paths must stay under `organization-logos/{orgId}/...`.

## Announcements

### `GET /announcements?orgId=&limit=&pageToken=`

Returns newest-first posts.
If `orgId` is supplied, the feed is scoped to one organization.
Each post includes `likeCount`, `commentCount`, and `viewerHasLiked` for the signed-in user.

### `POST /organizations/:orgId/announcements`

Approved managers publish a non-empty text post.
Images are optional and must reference a validated Storage path.
When an image is used, either provide `announcementId` or use the `announcementId` returned by the image-target helper.

```json
{
  "announcementId": "post_abc123",
  "body": "Tryouts are scheduled this Friday.",
  "image": {
    "storagePath": "announcement-images/robotics/post_abc123/photo.webp",
    "contentType": "image/webp",
    "sizeBytes": 123456,
    "alt": "Students working in the robotics lab"
  }
}
```

### `DELETE /organizations/:orgId/announcements/:announcementId`

Approved managers delete their organization's post.
The route rejects posts belonging to another organization.

### `POST /announcements/:announcementId/like`

Likes once for the signed-in user and increments the stored count only when a like is newly created.

### `DELETE /announcements/:announcementId/like`

Removes the signed-in user's like and decrements the stored count only when a like existed.

### `GET /announcements/:announcementId/comments?limit=&pageToken=`

Lists comments oldest first.

### `POST /announcements/:announcementId/comments`

Adds a non-empty comment for the signed-in user and increments the stored count transactionally.

```json
{
  "body": "Is this open to first-year students?"
}
```

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

## Image handling

Images are uploaded directly by the frontend to Firebase Storage after local preview.
The backend target endpoints validate metadata and return canonical Storage paths.
Storage rules independently enforce active verified access, organization management, allowed image types, and the 5 MiB size limit.

Allowed content types:

- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`

Maximum size: `5 MiB`.

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

Request is the same as logo targets and may include `announcementId`.
If `announcementId` is omitted, the backend returns one.
Use that id when publishing the post.

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
