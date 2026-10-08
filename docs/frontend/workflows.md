# SOAR workflow frontend screens

This document maps the workflow page slice implemented under `app/frontend/src/pages/workflows`. It is not a second design system; styling follows the frontend foundation tokens/components and the customized SOAR Open Design v2 source.

## UX mapping

| Route/file | UX responsibility | Notes |
| --- | --- | --- |
| `FeedPage.tsx` | Main announcement feed | Newest-first cards, image-safe rendering, like/unlike and comments with validation and honest save messages. Posts link back to organization profiles. |
| `DirectoryPage.tsx` | Organization directory | Organization name search only, profile links, and a clear no-results state. No category filters or counters. |
| `OrganizationPage.tsx` | Organization profile | Description, contact, recruitment requirements/instructions, external form link, explicit SOAR confirmation, profile posts, and separate dated event vs meeting/interview availability lists. Confirmation is disabled until the external form link is activated, and copy states that SOAR cannot prove actual external submission. |
| `ApplicationsPage.tsx` | Student application tracker | Student-only tracker with `Pending`, `Under review`, `Accepted`, and `Declined` stages. Sponsors see an exclusion state. Duplicate entries are treated as one row per student/opportunity. |
| `MeetingsPage.tsx` | Meeting/interview requests | Uses posted availability, validates required date/time, shows duplicate-request feedback, and labels `Pending` requests as not confirmed bookings. |
| `OfficerPage.tsx` | Approved officer dashboard | Officers remain student accounts with organization-specific grants. Sections cover profile/recruitment, announcements, applicants, dated entries, and meeting decisions. Controls are hidden/locked without an approved grant. |

## Shared foundation contract alignment

- Pages are default exports with the file names agreed by the frontend foundation contract.
- Default pages consume `useAuth()`/`useBackendGateway()` from the foundation for trusted session, access, and backend mode.
- Workflow types import shared `UserSession`, `ApplicationStage`, and `MeetingStatus` from `src/lib/contracts.ts` rather than redefining account roles or tracker status labels.
- UI uses shared components from `src/components/ui` and class names expected by foundation styling. No workflow CSS/token system is imported.
- A compatibility check accepts the foundation fixture's early `active` officer-grant status while production remains based on the shared `approved` grant contract.
- The workflow fixture maps the current foundation `coding-society` officer sample grant to the Robotics Guild sample data so `officer@example.edu` can exercise the dashboard until shared seed data is finalized.
- Router/style wiring remains foundation-owned. The workflow PR supplies page exports and tests; replacing placeholder route imports with these default exports and any shared layout utility classes should happen in the foundation/integration lane.

## Data mode and pending services

Workflow persistence endpoints are not authorized/available yet. Production mode therefore returns unavailable states instead of pretending sample data is saved. `fixture` mode is local UI/demo state only when the shared backend gateway is running in fixture mode.

| Workflow area | UI behavior included | Production integration still pending |
| --- | --- | --- |
| Announcements | Feed/profile rendering, local like/comment/post/delete affordances, empty/error states, image preview validation for officer posts. | Backend announcement records, permissions, comments/likes consistency, storage-backed image upload. |
| Organizations | Directory/profile reads from local fixture data or unavailable state. Officer profile form validates required fields locally. | Organization read/update endpoints/rules limited to approved officers. |
| Applications | Confirmation gate, sponsor exclusion, stage labels, duplicate detection in fixture mode. | Server-side external-submission confirmation records and duplicate prevention per student/opportunity; officer stage update endpoint. |
| Meetings | Availability-based request form, required date/time validation, duplicate handling, Pending/Approved/Declined tracker. | Meeting availability/request persistence, officer decision endpoint, privacy rules for requester/officer visibility. |
| Officer dashboard | Grant-scoped rendering, local fixture actions and delete confirmations. | Trusted organization grant enforcement and workflow mutation endpoints. |
| Images | Safe display and local officer preview/type/size validation. | Firebase/project storage upload, permanent URLs, and rules limiting uploads to approved officers. |

## Explicit exclusions preserved

The workflow pages do not add separate officer signup, student organization-creation requests, broad admin UI, dashboard counters, category filters, monthly calendar, chat, sponsor-only tools, automatic Google Form/Sheet reading, or production payment/provider behavior.
