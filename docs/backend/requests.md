# SOAR application and meeting request services

This document is the backend contract for the bounded request-services lane.
It extends the Firebase Functions, Admin SDK, identity, entitlement, and organization-grant foundation without adding a general admin/member system.

## Scope

Implemented request services cover two workflows.

- Student external-application confirmation and officer application-stage tracking.
- Meeting/interview availability requests, optional formal request PDF documents, and officer approval tracking.

The services intentionally do not implement automatic Google Form or Google Sheet ingestion, an Interview application stage, monthly calendars, overlap warnings, attendance, RSVP, notifications, student organization-creation queues, or sponsor-only tools.

## Shared access requirements

Every request-service endpoint requires a Firebase Auth bearer token.
The backend then verifies email and active six-month access through the existing entitlement helper.
Expired, unverified, unauthenticated, and missing-entitlement users are rejected before private request data is read or written.

Organization queues and decisions require the caller to be the organization owner or to have an active `organizations/{orgId}/officerGrants/{uid}` grant.
Officers remain student accounts with approved organization-specific grants.

HTTP errors use the existing backend shape:

```json
{
  "code": "duplicate_application",
  "message": "You already confirmed this external application in SOAR.",
  "action": "optional_action"
}
```

Validation failures return:

```json
{
  "code": "validation_problem",
  "message": "The request contains invalid fields.",
  "problems": {
    "status": "Invalid option"
  }
}
```

## Application workflow

Opening an external application URL never creates an application record by itself.
A student must call the explicit confirmation endpoint after they opened and submitted the external form.
SOAR records only the student's acknowledgement, not independent proof that the external form was submitted.

### Application document

Records are stored in `applications/{applicationId}` with a deterministic backend id derived from `studentUid`, `orgId`, and `opportunityId`.
That deterministic id is the atomic duplicate-prevention boundary for one student per recruitment opportunity.

```ts
{
  applicationId: string;
  studentUid: string;
  studentName: string;
  orgId: string;
  organizationName: string;
  opportunityId: string;
  opportunityTitle: string;
  status: 'Pending' | 'Under review' | 'Accepted' | 'Declined';
  externalFormOpenedAt: Timestamp;
  externalSubmissionConfirmedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  reviewedByUid?: string;
  reviewedAt?: Timestamp;
}
```

The current organization recruitment block represents one posted opportunity.
If `organizations/{orgId}.recruitment.opportunityId` is present, frontend must send that exact value.
If it is absent, backend derives the stable id as `${orgId}-${slug(recruitment.title || 'Recruitment')}`.
Content integration should set `recruitment.opportunityId` explicitly once content services own recruitment updates.

### Application endpoints

Routes accept both unprefixed and `/api` prefixed paths.

#### `POST /requests/applications/confirm`

Request body:

```json
{
  "organizationId": "robotics",
  "opportunityId": "robotics-build-team-2026",
  "externalFormOpened": true,
  "confirmedExternalSubmission": true
}
```

Rules:

- Caller must be an active verified student account.
- `externalFormOpened` and `confirmedExternalSubmission` must both be `true`.
- Organization must exist and have a posted `recruitment.applicationLink`.
- `opportunityId` must match the current organization recruitment opportunity.
- Duplicate confirmations for the same student and opportunity return `409 duplicate_application`.

Response is an application tracker row:

```json
{
  "id": "app_...",
  "organizationId": "robotics",
  "organizationName": "Robotics Guild",
  "opportunityId": "robotics-build-team-2026",
  "opportunityTitle": "Build Team 2026",
  "studentUid": "studentUid",
  "studentName": "Mara Santos",
  "stage": "Pending",
  "confirmedExternalSubmissionAt": "2026-10-08T12:00:00.000Z",
  "updatedAt": "2026-10-08T12:00:00.000Z"
}
```

#### `GET /requests/applications/mine`

Returns the signed-in student's own application tracker rows ordered newest update first.
Sponsors receive `403 student_required`.

#### `GET /requests/organizations/:orgId/applications`

Returns applicant rows for the caller's approved organization.
This is a trusted backend query and is limited to the organization queue.

#### `PATCH /requests/organizations/:orgId/applications/:applicationId/stage`

Request body:

```json
{
  "status": "Under review"
}
```

Allowed statuses are exactly `Pending`, `Under review`, `Accepted`, and `Declined`.
`Interview` is not accepted.
The service records `reviewedByUid` and `reviewedAt`.

## Meeting request workflow

Students, sponsors, and officers may request posted meeting or interview availability.
A pending request is not a confirmed booking.
Officers can set request status to `Approved` or `Declined`, and the backend contract also accepts `Pending` if a future UI needs to restore the queue state.

### Meeting request document

Records are stored in `meetingRequests/{meetingRequestId}` with a deterministic backend id derived from `requesterUid`, `orgId`, `dateEntryId`, `requestedDate`, and `requestedTime`.
That deterministic id clearly prevents identical duplicate requests.

```ts
{
  meetingRequestId: string;
  requesterUid: string;
  requesterName: string;
  requesterRole: 'student' | 'sponsor';
  orgId: string;
  organizationName: string;
  dateEntryId: string;
  meetingTitle: string;
  requestedDate: string;
  requestedTime: string;
  status: 'Pending' | 'Approved' | 'Declined';
  note?: string;
  document?: {
    storagePath: string;
    fileName: string;
    contentType: 'application/pdf';
    sizeBytes: number;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  decidedByUid?: string;
  decidedAt?: Timestamp;
}
```

### Meeting endpoints

#### `POST /requests/meetings/document-targets`

Returns a canonical private Storage target for an optional formal request document. Documents are PDF-only and 10 MiB maximum.

Request body:

```json
{
  "organizationId": "robotics",
  "dateEntryId": "date-robotics-interview",
  "requestedDate": "2026-11-12",
  "requestedTime": "14:00",
  "fileName": "formal-request.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 123456
}
```

The endpoint uses the same organization/date validation and deterministic meeting request id as `POST /requests/meetings`.

Response:

```json
{
  "meetingRequestId": "meeting_...",
  "organizationId": "robotics",
  "dateEntryId": "date-robotics-interview",
  "meetingTitle": "Build Team interview window",
  "requestedDate": "2026-11-12",
  "requestedTime": "14:00",
  "storagePath": "meeting-request-documents/robotics/meeting_.../1760000000000-formal-request.pdf",
  "fileName": "formal-request.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 123456,
  "allowedContentTypes": ["application/pdf"],
  "maxSizeBytes": 10485760
}
```

Frontend upload requirements:

- Upload to the returned Storage path only.
- Use `contentType: application/pdf`.
- Include custom metadata `orgId`, `meetingRequestId`, and `requesterUid` matching the returned target and signed-in user.
- Do not call `getDownloadURL` or store/share a bearer URL for this private document.

Storage rules allow the requester to upload matching PDFs but deny direct SDK reads for `meeting-request-documents/**`. Downloads use the authenticated backend route below so access can be rechecked without public token URLs.

#### `POST /requests/meetings`

Request body:

```json
{
  "organizationId": "robotics",
  "dateEntryId": "date-robotics-interview",
  "requestedDate": "2026-11-12",
  "requestedTime": "14:00",
  "note": "Application submitted externally.",
  "document": {
    "storagePath": "meeting-request-documents/robotics/meeting_.../1760000000000-formal-request.pdf",
    "fileName": "formal-request.pdf",
    "contentType": "application/pdf",
    "sizeBytes": 123456
  }
}
```

Rules:

- Caller must be an active verified account.
- Caller may be a student, sponsor, or officer using their normal student account.
- Organization must exist.
- The referenced `calendarEntries/{dateEntryId}` document must belong to the organization and have `kind: 'availability'`.
- `requestedDate` must be a real `YYYY-MM-DD` date.
- `requestedTime` must be `HH:mm` 24-hour time.
- `document` is optional. When present, the backend validates the actual uploaded Storage object exists, is a PDF, matches the submitted size, and carries matching `orgId`, `meetingRequestId`, and `requesterUid` metadata before creating the meeting request.
- Identical duplicate requests return `409 duplicate_meeting_request`.

Response is a meeting tracker row with `status: 'Pending'`.

#### `GET /requests/meetings/mine`

Returns the signed-in requester's own meeting history ordered newest update first, with document metadata only when present.

#### `GET /requests/meetings/:meetingRequestId/document`

Streams the private PDF through the backend after rechecking active access and requester-or-current-approved-manager authorization. The response sets `Cache-Control: private, no-store` and does not create or return a public download URL. Revoked officers lose access immediately because the manager grant is checked at request time.

#### `GET /requests/organizations/:orgId/meetings`

Returns meeting requests for the caller's approved organization, with document metadata only when present.
This is a trusted backend query and is limited to the organization queue.

#### `PATCH /requests/organizations/:orgId/meetings/:meetingRequestId/status`

Request body:

```json
{
  "status": "Approved"
}
```

Allowed statuses are exactly `Pending`, `Approved`, and `Declined`.
The service records `decidedByUid` and `decidedAt`.

## Firestore rules and indexes

Client SDK collection scans remain denied for `applications` and `meetingRequests`.
Direct client creates, updates, and deletes for those private collections are also denied because duplicate prevention and organization/date validation are server-owned.
Document `get` remains available only to the requester or an approved manager for the record's organization.

Trusted backend queries require these composite indexes:

- `applications`: `studentUid ASC, updatedAt DESC`.
- `applications`: `orgId ASC, updatedAt DESC`.
- `meetingRequests`: `requesterUid ASC, updatedAt DESC`.
- `meetingRequests`: `orgId ASC, updatedAt DESC`.

The indexes are declared in `firestore.indexes.json`.

## Local validation

Useful focused commands:

```bash
npm --workspace app/backend run build
npm --workspace app/backend run test:requests
npm --workspace app/backend run test:payments
firebase emulators:exec --project soar-a711e --only firestore "npm --workspace app/backend run test:rules:firestore"
```

The Firestore emulator command requires Java on `PATH`.
No production deploy, live payment, billing, or account migration is part of this service lane.
