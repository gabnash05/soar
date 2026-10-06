# SOAR Product Requirements Document

**SOAR** means **Student Organizations and Allied Resources**. This repository is currently the planning/intake repository for a client application revision. This README is the product requirements document (PRD) for alignment before any frontend, backend, framework migration, or deployment work starts.

## Document status and source authority

- **Status:** PRD v1, documentation-only. No implementation is included in this branch.
- **Authoritative scope:** the client-approved `Project Scope and Acceptance — Final.pdf` is the source of truth for agreed features, acceptance checks, exclusions, required client inputs, and handover expectations.
- **Supporting context:** `SOAR-project-overview.md` explains product direction, delivery context, and summarized workflows. The supplied `TECHNO/` source folder is evidence of the current draft, not the final requirement set.
- **Reference quality bar:** the classmate site at <https://unsaysud-antech-ustpcdocafeteria.ai.studio/> is a minimum UI/UX quality reference, not an expansion of SOAR scope. `chrome-devtools-axi` was available but could not attach to a live browser target in this environment, so no specific visual observations from that site are encoded here.
- **Reviewed input paths:**
  - `/home/gab/agent-workspace/firstmate/projects/soar/docs/client-scope/Project Scope and Acceptance — Final.pdf`
  - `/home/gab/agent-workspace/firstmate/projects/soar/docs/client-scope/SOAR-project-overview.md`
  - `/home/gab/agent-workspace/firstmate/projects/soar/docs/client-scope/TECHNO/`

Do not commit the supplied PDF, client source folder, account credentials, or secrets into this repository unless a later task explicitly authorizes specific files. Required secrets should be shared privately through service invitations or secure channels.

## Product purpose

SOAR is a hosted website that centralizes campus organization discovery, announcements, recruitment information, application progress, dated events, and meeting/interview requests.

The intended outcome is a working application that can be demonstrated and used with real users and paying accounts. Students and outside users should be able to discover organizations and request or track relevant interactions. Organization officers should be able to keep their own organization information current and manage the operational workflows described in the agreed scope.

## Success definition

SOAR is successful when the delivered hosted website:

1. Lets users register, sign in, recover passwords, manage allowed account settings, and access only role-appropriate pages.
2. Requires a confirmed **₱2 annual payment per account** before account creation or continued main-app access, while preserving records for renewal.
3. Shows a responsive, readable organization directory, organization profiles, announcements, application tracker, meeting tracker, settings, and officer dashboard on phones and computers.
4. Persists organization data, announcements, images, applications, meeting requests, payment/access status, and role permissions across refresh, sign-out, and another device.
5. Keeps private application, meeting, and payment records visible only to the correct accounts, with officers limited to the organization linked to their account.
6. Meets every acceptance check in the final scope and is handed over with the hosted link, updated source files, and short setup/use instructions.

## Users and roles

| Role | Agreed purpose | Core access |
| --- | --- | --- |
| Student | Discover organizations, read announcements, follow application instructions, confirm external-form submission, track application stages, request meetings/interviews, and manage allowed settings. | Announcements, organization directory/profiles, application tracker, meeting tracker, settings, payment/access status. |
| Organization officer | Manage the organization linked to the officer account. | Officer dashboard sections for profile/recruitment settings, announcements, applicants, calendar/date entries, meeting requests, and organization image uploads. |
| Basic outside user | View organization information and updates and request meetings through an account. | Role-appropriate browsing, meeting requests/tracking, settings, payment/access status. |

**Conflict to resolve before implementation:** the supplied draft code labels the outside-user role as `sponsor` and asks for a TIN. The final scope calls this role a **basic outside user** and explicitly excludes dedicated sponsor tools. Treat sponsor-specific features as out of scope unless the client approves a scope change.

## Agreed product scope

### 1. Layout and design

- Redesign login, registration, directory, organization profiles, announcement feed, trackers, settings, and officer pages for phone and computer use.
- Use readable colors, consistent headings, clear buttons, deliberate spacing, properly sized images, and forms/tables that fit the screen.
- Wide tables must be usable on phones without cutting off actions.
- Include small button/page transitions and clear loading, empty, and error states.

### 2. Accounts and settings

- Keep student, organization-officer, and basic outside-user accounts.
- Registration collects name, email, password, and relevant ID details.
- Users can sign in, sign out, and recover passwords through email.
- Name changes are allowed only within the existing 30-day limit.
- Email changes require the current password and verification of the new address; the saved email changes after verification.
- Pages and controls must match the signed-in account role.

### 3. Organizations and profiles

- Show a directory with each organization name, logo, short description, and profile link.
- Keep name search with a clear no-results message.
- Each organization profile shows description, contact details, recruitment information, posts, and available dates.
- Officers can update only their own organization name, logo, description, contact email, recruitment title, requirements, and application link.

### 4. Announcements

- Officers can publish text announcements with an optional image and can delete their own posts.
- Posts show newest first with organization name, logo, and posting date.
- Posts appear consistently in the main feed and on the organization profile.
- Users can like/unlike a post, open comments, and add a comment.
- Like counts and saved comments remain consistent across pages.
- Empty posts/comments and failed saves produce clear messages.

### 5. Applications

- Organization recruitment content includes title, requirements, instructions, and an external Google Form or other application link.
- Opening the link alone must **not** count as a completed submission.
- A student must confirm in SOAR that they submitted the external form before the entry is listed for officer checking.
- Officers check responses in the existing form or Google Sheet and update the stage to: **Pending**, **Under review**, **Accepted**, or **Declined**.
- Students see organization, position, and stage in a simple progress tracker.
- Duplicate entries for the same application must be prevented.

### 6. Calendar entries and available dates

- Officers can add, edit, and remove their organization events and available interview/meeting dates.
- Entries include title, date, short details, and time where needed.
- Organization profiles show a simple dated event list.
- Event details and available meeting/interview dates must be easy to distinguish.
- Changed or removed entries remain consistent with saved records, and required dates are validated.

### 7. Meeting requests

- Keep the existing request flow: choose an organization posted meeting/interview entry, enter a date and time, and send a request.
- Users see organization, meeting title, requested date/time, and status: **Pending**, **Approved**, or **Declined**.
- Officers see requests for their own organization and can approve or decline them.
- Required details are validated, repeated identical requests are prevented or handled clearly, and pending requests are not shown as confirmed bookings.

### 8. Officer dashboard

- Organize the officer workflow into clearly labelled sections:
  - profile and recruitment settings
  - announcement controls
  - applicants
  - calendar/date entries
  - meeting requests
- Use readable status labels, clear save messages, and confirmation before deleting a post or calendar entry.
- Officers manage only the organization linked to their account.

### 9. Image uploads

- Keep uploads for organization logos and announcement images.
- Show a preview before saving.
- Check file type and size and explain when an image cannot be accepted.
- Store images in the project file storage so they display after refresh and sign-in.
- Display images without stretching or overflowing the page.
- Only the responsible officer can replace their organization logo or upload images to its posts.

### 10. Annual paid access

- Access costs **₱2 per account for one year** from confirmed payment.
- Payment must go through one payment provider that supports GCash.
- New users pay before creating an account and accessing main pages.
- Existing users need active paid access and renew manually when access expires; there is no automatic yearly charge.
- Payment confirmation is automatic and linked to the correct registration or renewal.
- Pending, failed, cancelled, or expired access does not unlock registration or main pages.
- Expiry restricts access while retaining the account and saved records for renewal.
- Entry, sign-in, payment, renewal, and password recovery remain available while main pages are locked.
- Users can view payment status and access end date but cannot edit those values.

### 11. Saved data, permissions, hosting, and handover

- Use the existing Firebase project for accounts and saved records, with file storage for images.
- Fix loading, saving, and repeated-click issues so records remain correct after refresh, sign-out, and use on another device.
- Keep private application, meeting, and payment records visible only to the correct accounts.
- Deliver the hosted website, complete updated source files, and short instructions for setup, account roles, payments, and the main tasks.

## Current draft vs. target behavior

The supplied `TECHNO/` folder is a static Firebase-hosted draft using HTML, CSS, and JavaScript. It demonstrates several desired workflows but does not yet satisfy the final agreement.

| Area | Current draft evidence | Target alignment needed |
| --- | --- | --- |
| Hosting/setup | Firebase hosting config exists for `public/`; source imports Firebase Auth and Firestore. | Continue using the client-provided existing Firebase project, but add/verify required storage, security rules, payment confirmation flow, and handover instructions. |
| Framework | Plain HTML/CSS/JS pages with one large `script.js`; no build framework. | Framework migration is a later-phase proposal only. Do not treat React/Vue/Next/etc. as agreed scope until approved. |
| Roles | Draft uses `student`, `organization`, and `sponsor`; login/register pages include role radios. | Align labels and behavior with agreed roles: student, organization officer, and basic outside user. Resolve whether any `sponsor` naming remains. |
| Auth/settings | Registration, login, sign-out, password reset, name cooldown, and email verification flow are partially implemented. | Enforce payment gating, role-appropriate access, verified email-save timing, and agreed account-setting rules. |
| Organizations | Directory, profile pages, search, officer profile fields, and organization logo input exist. | Add clear no-results states, requirements/instructions fields, robust validation, storage-backed image handling, and privacy/permission enforcement. |
| Announcements | Officers can create/delete posts; users can like/comment; optional image is handled as client-side data. | Validate empty posts/comments, save images to file storage, show preview/type/size checks, and ensure consistency across feed/profile after refresh/sign-in. |
| Applications | Student click logs an application and opens the external form; officer page can update statuses. | Require student confirmation after external-form submission, prevent duplicates, include **Declined**, use the agreed status labels, and keep tracker updates consistent. |
| Calendar/date entries | Officers can add/delete simple title/date slots; profiles show available slots. | Add edit, short details, time where needed, valid-date checks, and visual distinction between events and interview/meeting availability. |
| Meeting requests | Users can request date/time from a profile slot; officers can approve/decline. | Prevent repeated identical requests, clarify pending vs. confirmed, fix role-specific tracker rendering, and ensure all permitted user roles can see their own request history. |
| Payments | No annual payment, GCash checkout, payment status, renewal, or access-expiry enforcement is present. | Implement the agreed ₱2 annual paid access flow before production use. |
| Images | Draft stores uploaded proof/logo/post images as base64-like data in saved records. | Use Firebase file storage or the agreed project file storage, with file validation and previews. |
| Security | Current behavior appears primarily client-side; database/security rules were not supplied for review. | Implement/verify server-side or Firebase-rule enforcement for roles, organization ownership, private records, and payment/access fields. |
| Mixed dependencies | Some pages include a Supabase CDN script, but application logic uses Firebase. | Standardize on the agreed Firebase-backed implementation unless a later approved architecture changes this. |

## UI/UX baseline and design-system inputs

The agreed UI/UX baseline is functional and responsive rather than decorative scope expansion:

- clear navigation and page hierarchy
- readable typography and colors
- consistent buttons, headings, spacing, cards, forms, tables, and status chips
- phone and desktop layouts for every included page
- forms and tables that remain usable on small screens
- properly cropped/scaled images
- clear loading, empty, validation, success, and error states
- modest transitions for page and button feedback

The classmate site should be used later as a minimum quality comparison for polish and usability, but it does not add SOAR features. If Open Design is used later, put those outputs under `docs/design-system/open-design/` rather than treating Open Design as an installed integration.

## Acceptance criteria traceability

| Acceptance check from agreement | Requirements covered |
| --- | --- |
| Included pages are readable on phones and computers; navigation, forms, images, and tables fit; loading/empty/error messages are clear. | Layout and design; UI/UX baseline. |
| Registration, sign-in, sign-out, and email password recovery work; name changes follow the limit; email changes take effect after verification. | Accounts and settings. |
| Name search finds organizations; profile changes, posts, images, likes, and comments appear correctly in directory, feed, and profile pages. | Organizations/profiles; announcements; image uploads. |
| Application links open; only confirmed submissions enter checking; officer stage changes appear in the student tracker without duplicates. | Applications. |
| Officers can add, change, and remove calendar entries; permitted images save and display after refresh and sign-in. | Calendar/date entries; image uploads; saved data. |
| Meeting requests save with correct organization, date, and time; officers approve/decline; users see decisions; repeated requests are handled clearly. | Meeting requests. |
| A real successful ₱2 payment unlocks account creation and one year of access; pending/failed/cancelled payments and expired access stay restricted; renewal restores access without data loss. | Annual paid access; saved data. |
| Users see only their private application, meeting, and payment records; officers manage only their organization; users cannot change paid status or access end date. | Permissions; saved data; officer dashboard; paid access. |
| Hosted link, complete updated source files, and short setup/use instructions are handed over after final review. | Hosting and handover. |

## Explicit exclusions

The following are outside the agreed scope unless separately approved:

- monthly calendar views
- warnings about overlapping meetings
- category filters
- dashboard counters
- elaborate animations
- financial or transparency reports
- dedicated sponsor tools
- RSVP or attendance tracking
- forms built inside the site
- automatic reading of Google Form/Sheet responses
- post/application/meeting alerts by email, text, or push notification
- a native phone app
- automatic yearly charges

Do not treat unanswered product questions as permission to add any of these.

## Constraints and dependencies

### Client-provided inputs

The client must provide or confirm:

- complete project source, images/assets, editable designs, setup/deployment files, organization content, and application links
- service invitations for hosting, database, file storage, domain, code repository, and the existing Firebase project
- Firebase access covering Authentication, database/storage, security rules, hosting settings, and any existing server/function code
- Firebase billing setup required for live payment confirmation and image uploads
- an activated payment-provider account that supports the ₱2 GCash checkout
- any required secrets privately, not in committed files

The client group is responsible for finding users and paying customers. Provider transaction fees and hosting/storage charges are paid through the client service accounts.

### Delivery context

The supplied overview states a fixed development fee of **₱3,000**, with first and final payments split around development start and handover, plus preview/final delivery dates from the current quote. Those business terms are context for planning; feature completion is judged against the final scope and acceptance checks above.

### Technical direction

- **Agreed constraint:** use the existing Firebase project for accounts and saved records, with project file storage for images.
- **Proposal, not agreed requirement:** migrate the draft from plain HTML/CSS/JS to a maintainable frontend framework in a later phase so future agent work is safer and easier. A likely direction is a typed component-based frontend with Firebase integrations and minimal server/cloud-function logic where required for payment confirmation and security-sensitive operations. This must be approved before implementation.
- **Boundary:** this PRD does not define detailed frontend/backend architecture, database schema, payment webhook design, or deployment scripts.

### Repository intake guidance

Suggested repository structure remains:

- `app/` — future application source once implementation begins.
- `docs/client-scope/` — agreed scope, requirements, client notes, and hosting context if specific files are approved for repository intake.
- `docs/design-system/open-design/` — future Open Design outputs.
- `docs/agent-workflow/` — agent-facing workflow notes and implementation plans.

## High-level implementation phases

These are planning boundaries only, not a backend/frontend design.

1. **Alignment and design intake:** approve this PRD, resolve open questions, review any Open Design output, and confirm current service access.
2. **Project foundation:** decide whether/when to migrate from the static draft to a framework; set up the approved project structure without changing agreed scope.
3. **Access foundation:** implement auth, roles, paid access, renewal/expiry behavior, payment status visibility, and permission enforcement.
4. **Core content workflows:** implement organization directory/profiles, announcements, image handling, and responsive UI states.
5. **Operational workflows:** implement applications, calendar/date entries, meeting requests, and officer dashboard sections.
6. **Hardening and handover:** validate acceptance checks, fix refresh/sign-out/another-device consistency, verify private-record access, test real payment, deploy, and write setup/use instructions.

## Unresolved conflicts and questions

These must be answered or deliberately deferred before implementation choices expand scope:

1. **Outside-user naming:** should the final UI/database use “basic outside user,” “sponsor,” or another client-approved label? Sponsor-specific tools are excluded by the final scope.
2. **Outside-user ID details:** if the role is not “sponsor,” should registration still collect a TIN or a different relevant ID?
3. **Organization officer proof:** the draft collects proof of election/appointment, but the final scope only says relevant ID details. Confirm whether this proof upload remains required.
4. **Payment provider:** which provider will support automatic ₱2 GCash confirmation, and what test/live account access will be supplied?
5. **Pre-account payment link:** because new users must pay before creating an account, confirm the exact approved user experience for linking a payment to a registration attempt without exposing payment status editing to users.
6. **Firebase security rules:** current rules and any server/function code were not supplied for review. They are required to validate role, organization ownership, private records, and payment/access fields.
7. **Application confirmation:** define the exact UI language and timing for “I submitted the external form” so opening the link alone never creates a checkable submission.
8. **Application statuses:** final status set is Pending, Under review, Accepted, Declined. The draft also shows `review` and a static `Interview` example; confirm whether Interview is excluded or a future change request.
9. **Meeting requester roles:** confirm whether both students and basic outside users can request meetings, as the overview implies, and whether officers can request meetings with other organizations.
10. **Account settings for officers:** clarify whether officers also get personal account settings, or only organization-profile settings.
11. **Reference-site review:** browser inspection of the classmate reference site could not be completed in this environment; perform a later visual review before final UI decisions.
