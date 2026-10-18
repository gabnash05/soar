# Admin priority handoff

## Ready batch: officer revocation

- Commit: `69f7dbc` (`feat(admin): revoke organization officer grants`).
- PR: https://github.com/gabnash05/soar/pull/28, against `main`, ready for review, `draft: no`.
- Backend adds Admin-claim-gated listing and idempotent revocation addressed by the exact `organizationId` and officer UID.
- Revocation records `status: revoked`, preserves the student profile/Auth identity and other organization grants, denies organization-owner revocation, and is immediately observed by existing protected-operation checks.
- Admin UI confirms the named student and organization, describes the scoped effect, and refreshes that organization’s grant list after mutation.
- `cd app/backend && npm run typecheck` passed.
- `cd app/backend && npm run test:organizations` passed, 10 tests.
- `cd app/backend && npm run test:http` passed, 17 tests.
- `cd app/frontend && npx vitest run src/pages/admin/AdminProvisioningPage.test.tsx` passed, 7 tests.
- `cd app/frontend && npm run build` passed; Vite emitted its existing large-chunk advisory.

## Cascade dependency inventory and integration boundary

- The current Firestore model stores organization profiles at `organizations/{orgId}` and grants at `organizations/{orgId}/officerGrants/{uid}`.
- Organization-owned announcements are top-level `announcements/{announcementId}` documents keyed by exact `orgId`, with nested `likes` and `comments` subcollections.
- Dated events and availability are `calendarEntries` documents keyed by exact `orgId`.
- Application relationships are `applications` documents keyed by exact `orgId`; no separate organization-membership collection exists in the inspected model.
- Meeting relationships and private attachments are `meetingRequests` documents keyed by exact `orgId`, with an optional `document.storagePath`.
- The profile logo is `organizations.logoPath`; announcement files are represented by `media` or legacy `image` references, and announcements can retain an `organizationLogoPath` snapshot.
- The three storage path families in the current contracts are `organization-logos/{orgId}/{fileName}`, `announcement-images/{orgId}/{announcementId}/{fileName}`, and `meeting-request-documents/{orgId}/{meetingRequestId}/{fileName}`.
- Cascade implementation and hosted mutable tests are not included in this ready revocation batch.
- The cascade needs a provider-aware, root-owned storage adapter that lists a bounded page of objects for one exact organization and deletes individual validated object paths idempotently; it must not issue a bucket or prefix-wide delete.
- Organization-write guards must also reject new content, request, and upload writes after deletion begins; coordinate cross-service guard changes with the existing request and central-upload owners before claiming cleanup is race-safe.
- No hosted organization, grant, account, or file was mutated by this worker; hosted destructive verification belongs to the root on a new synthetic organization only.
