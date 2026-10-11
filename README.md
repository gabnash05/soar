# SOAR Product Requirements Document

**SOAR** means **Student Organizations and Allied Resources**. This repository is currently the planning/intake repository for a client application revision. This README is the product requirements document (PRD) for alignment before any frontend, backend, framework migration, or deployment work starts.

## Document status and source authority

- **Status:** PRD v2 plus in-progress MVP implementation. React frontend and Firebase/Express backend foundations now live under `app/` while this README remains the product-requirements authority.
- **Primary agreement:** the client-approved `docs/client-scope/Project Scope and Acceptance — Final.pdf` defines the feature boundaries, acceptance checks, exclusions, required inputs, and handover expectations.
- **Confirmed amendments:** the later approved decisions recorded for this PRD supersede the PDF and supplied overview only where they conflict. Most notably, access is now **PHP10 per account for six months**, replacing earlier PHP2/annual references.
- **Supporting context:** `docs/client-scope/SOAR-project-overview.md` explains product direction, delivery context, and summarized workflows as originally supplied. The supplied `docs/client-scope/TECHNO/` source folder is evidence of the current draft, not the final requirement set.
- **Reference quality bar:** the classmate site at <https://unsaysud-antech-ustpcdocafeteria.ai.studio/> is a minimum UI/UX quality reference, not an expansion of SOAR scope. `chrome-devtools-axi` was available but could not attach to a live browser target in this environment, so no specific visual observations from that site are encoded here.

The supplied PDF, overview, and client source draft are now committed with explicit publication authorization. Do not commit account credentials, service-account keys, private secrets, cache/build artifacts, or Windows `:Zone.Identifier` metadata. Required secrets should be shared privately through service invitations or secure channels.

## Product purpose

SOAR is a hosted website that centralizes campus organization discovery, announcements, recruitment information, application progress, dated events, and meeting/interview requests.

The intended outcome is a working application that can be demonstrated and used with real users and paying accounts. Students, sponsors, and organization officers should be able to discover organizations and track the interactions appropriate to their roles. Organization officers should be able to keep their organization information current and manage the operational workflows described in the agreed scope.

## Success definition

SOAR is successful when the delivered hosted website:

1. Lets users register, sign in, recover passwords, manage allowed account settings, and access only role-appropriate pages.
2. Requires a confirmed **PHP10 six-month payment per account** before account creation or continued main-app access, while preserving records for renewal.
3. Shows a responsive, readable organization directory, organization profiles, announcements, application tracker, meeting tracker, settings, and officer dashboard on phones and computers.
4. Persists organization data, announcements, images, applications, meeting requests, payment/access status, and role permissions across refresh, sign-out, and another device.
5. Keeps private application, meeting, and payment records visible only to the correct accounts, with officers limited to the organization they are approved to manage.
6. Meets every acceptance check in the final scope as amended and is handed over with the hosted link, updated source files, and short setup/use instructions.

## Users and roles

| Role | Agreed purpose | Registration details | Core access |
| --- | --- | --- | --- |
| Student | Discover organizations, read announcements, follow application instructions, confirm external-form submission, track application stages, request meetings/interviews, and manage allowed personal settings. | Name, email, password, student ID number, optional department, email verification, and confirmed six-month payment before account creation. | Announcements, organization directory/profiles, application tracker, meeting tracker, personal account settings, payment/access status. |
| Organization officer | Manage an approved organization and its operational workflows. Officers are also students for account-identification purposes. | Name, email, password, student ID number, optional department, email verification, confirmed six-month payment before account creation, and officer access approved through the organization-owner process. | Officer dashboard, organization settings, recruitment settings, announcements, applicants, calendar/date entries, meeting requests, personal account settings, payment/access status. |
| Sponsor | Outside-user role with no special sponsor-only tools. Sponsors can view organization information and request meetings through an account. | Name, email, password, email verification, optional company/organization name, and confirmed six-month payment before account creation. No TIN or government ID is required by the confirmed scope. | Role-appropriate browsing, organization profiles, announcements, meeting requests/tracking, personal account settings, payment/access status. |

### Organization ownership and officer access

- A project administrator assigns each organization's initial owner.
- The initial owner approves officer access for that organization.
- This is a controlled setup/approval workflow only. It should not be expanded into a general admin dashboard, membership-management system, or sponsor tooling unless a later scope change approves that work.
- There is no initial proof-of-election/proof-upload requirement in the confirmed scope.

### Personal-account vs organization settings

- **Personal-account settings** manage the signed-in user's own allowed account details, such as name-change limits and verified email changes.
- **Organization settings** manage the organization's public profile, logo, contact email, recruitment information, application link, announcements, calendar/date entries, and meeting requests.
- Officers need both settings areas; students and sponsors need only personal-account settings plus payment/access status.

## Agreed product scope

### 1. Layout and design

- Redesign login, registration, directory, organization profiles, announcement feed, trackers, settings, and officer pages for phone and computer use.
- Use readable colors, consistent headings, clear buttons, deliberate spacing, properly sized images, and forms/tables that fit the screen.
- Wide tables must be usable on phones without cutting off actions.
- Include small button/page transitions and clear loading, empty, and error states.

### 2. Accounts, roles, and settings

- Keep student, organization-officer, and sponsor accounts.
- Registration collects only the confirmed details for each role:
  - students and officers: name, email, password, student ID number, optional department
  - sponsors: name, email, password, optional company/organization name
- Users can sign in, sign out, and recover passwords through email.
- Email verification is required as part of account creation.
- Name changes follow the existing 30-day limit.
- Email changes require the current password and verification of the new address; the saved email changes after verification.
- Pages and controls must match the signed-in account role.
- Officers manage only organizations for which they have approved officer access.

### 3. Organizations and profiles

- Show a directory with each organization name, logo, short description, and profile link.
- Keep name search with a clear no-results message.
- Each organization profile shows description, contact details including optional phone, recruitment information, posts, and available dates.
- Approved officers can update only their own organization's name, logo, description, contact email/phone, recruitment title, requirements, and application link.

### 4. Announcements

- Officers can publish text announcements with bounded optional media (images and one native MP4/WebM video) and can delete their own posts.
- Posts show newest first with organization name, logo, and posting date.
- Posts appear consistently in the main feed and on the organization profile.
- Users can like/unlike a post, open comments, add a comment, and edit/delete their own comments.
- Like counts and saved comment counts remain consistent across pages.
- Empty posts/comments and failed saves produce clear messages.

### 5. Applications

- Organization recruitment content includes title, requirements, instructions, and an external Google Form or other application link.
- Opening the link alone must **not** count as a completed submission.
- A student must explicitly confirm in SOAR that they submitted the external form before the entry is listed for officer checking.
- Officers check responses in the existing form or Google Sheet and update the stage to: **Pending**, **Under review**, **Accepted**, or **Declined**.
- Students see organization, position/recruitment opportunity, and stage in a simple progress tracker.
- Duplicate entries must be prevented per student and recruitment opportunity/position.

### 6. Calendar entries and available dates

- Officers can add, edit, and remove their organization's events and available interview/meeting dates.
- Entries include title, date, short details, and time where needed.
- Organization profiles show a simple dated event list.
- Event details and available meeting/interview dates must be easy to distinguish.
- Changed or removed entries remain consistent with saved records, and required dates are validated.

### 7. Meeting requests

- Students, sponsors, and officers can request meetings where the workflow is available to their role.
- Keep the existing request flow: choose an organization posted meeting/interview entry, optionally attach a formal PDF request document, enter a date and time, and send a request.
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
- Officers manage only organizations for which they have approved access.

### 9. Image uploads

- Keep uploads for organization logos and announcement images.
- Show a preview before saving.
- Check file type and size and explain when an image cannot be accepted.
- Store images in the project file storage so they display after refresh and sign-in.
- Display images without stretching or overflowing the page.
- Only an approved officer for the organization can replace its logo or upload images to its posts.

### 10. Six-month paid access

- Access costs **PHP10 per account for six calendar months** from confirmed payment. This is a confirmed amendment to the PDF's PHP2/annual amount.
- Payment must go through one payment provider that supports GCash and automatic provider-side confirmation.
- **PayMongo** is the intended provider, subject to merchant approval and a successful live PHP10 test. This is not a promise that PayMongo is free or the cheapest provider.
- New users must complete verified payment before creating an account and accessing main pages.
- Existing users need active paid access and renew manually when access expires; there is no automatic recurring charge.
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

The supplied `docs/client-scope/TECHNO/` folder is a static Firebase-hosted draft using HTML, CSS, and JavaScript. It demonstrates several desired workflows but does not yet satisfy the final agreement as amended.

| Area | Current draft evidence | Target alignment needed |
| --- | --- | --- |
| Hosting/setup | Firebase hosting config exists for `public/`; source imports Firebase Auth and Firestore. | Continue using the existing Firebase project, then inspect and configure Authentication, database/storage, security rules, hosting, and any required functions. |
| Framework | The supplied intake draft was plain HTML/CSS/JS with one large `script.js`; the active MVP implementation now uses React, TypeScript and Vite under `app/frontend`. | Continue the approved React/Vite MVP path without expanding product scope or redesigning agreed workflows. |
| Roles | Draft uses `student`, `organization`, and `sponsor`; login/register pages include role radios. | Keep sponsor as the outside-user label, remove sponsor-only tooling assumptions, remove TIN/government-ID collection, and add optional company/organization name. |
| Auth/settings | Registration, login, sign-out, password reset, name cooldown, and email verification flow are partially implemented. | Enforce verified payment before account creation, role-appropriate access, verified email-save timing, personal-account settings, and officer organization settings. |
| Organization officer onboarding | Draft includes organization proof upload and direct organization-account creation. | Replace with the confirmed project-administrator initial-owner assignment and owner-approved officer access. No initial proof upload is required. |
| Organizations | Directory, profile pages, search, officer profile fields, and organization logo input exist. | Add clear no-results states, requirements/instructions fields, robust validation, storage-backed image handling, and permission enforcement for approved officers only. |
| Announcements | Officers can create/delete posts; users can like/comment; optional image is handled as client-side data. | Validate empty posts/comments, save images to file storage, show preview/type/size checks, and ensure consistency across feed/profile after refresh/sign-in. |
| Applications | Student click currently logs an application and opens the external form; officer page can update statuses. | Require explicit external-submission confirmation, prevent duplicates per recruitment opportunity/position, include **Declined**, use the agreed status labels, and keep tracker updates consistent. |
| Calendar/date entries | Officers can add/delete simple title/date slots; profiles show available slots. | Add edit, short details, time where needed, valid-date checks, and visual distinction between events and interview/meeting availability. |
| Meeting requests | Users can request date/time from a profile slot; officers can approve/decline. | Allow the confirmed requesting roles, prevent repeated identical requests, clarify pending vs. confirmed, and ensure each user sees their own request history. |
| Payments | No six-month payment, GCash checkout, payment status, renewal, or access-expiry enforcement is present. | Implement the confirmed PHP10 six-month paid access flow with provider-side automatic confirmation before production use. |
| Images | Draft stores uploaded proof/logo/post images as base64-like data in saved records. | Use Firebase file storage or the agreed project file storage, with file validation and previews. |
| Security | Current behavior appears primarily client-side; database/security rules were not supplied for review. | Implement/verify Firebase-rule or server-side enforcement for roles, organization ownership/officer access, private records, and payment/access fields. |
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

| Acceptance check | Requirements covered |
| --- | --- |
| Included pages are readable on phones and computers; navigation, forms, images, and tables fit; loading/empty/error messages are clear. | Layout and design; UI/UX baseline. |
| Registration, sign-in, sign-out, email verification, and email password recovery work; role-specific registration details match the confirmed scope. | Accounts, roles, and settings. |
| Name changes follow the 30-day limit, and email changes take effect after verification of the new address. | Personal-account settings. |
| Organization owner/officer access is limited to approved organization management without adding a general admin dashboard or membership system. | Organization ownership and officer access; officer dashboard. |
| Name search finds organizations; profile changes, posts, images, likes, and comments appear correctly in directory, feed, and profile pages. | Organizations/profiles; announcements; image uploads. |
| Application links open; only explicit confirmed external submissions enter checking; officer stage changes appear in the student tracker without duplicate entries per recruitment opportunity/position. | Applications. |
| Officers can add, change, and remove calendar entries; permitted images save and display after refresh and sign-in. | Calendar/date entries; image uploads; saved data. |
| Meeting requests save with correct organization, date, and time; officers approve/decline; users see decisions; repeated requests are handled clearly. | Meeting requests. |
| A real successful **PHP10** payment unlocks account creation and six calendar months of access; pending/failed/cancelled payments and expired access stay restricted; renewal restores access without data loss. | Six-month paid access; saved data. |
| Users see only their private application, meeting, and payment records; officers manage only approved organizations; users cannot change paid status or access end date. | Permissions; saved data; officer dashboard; paid access. |
| Hosted link, complete updated source files, and short setup/use instructions are handed over after final review. | Hosting and handover. |

## Explicit exclusions

The following are outside the agreed scope unless separately approved:

- monthly calendar views
- warnings about overlapping meetings
- category filters
- dashboard counters
- elaborate animations
- financial or transparency reports
- dedicated sponsor tools beyond the sponsor outside-user role described above
- RSVP or attendance tracking
- forms built inside the site
- automatic reading of Google Form/Sheet responses
- post/application/meeting alerts by email, text, or push notification
- a native phone app
- automatic recurring charges
- a general admin dashboard or full membership-management system

Do not treat unanswered product questions or implementation convenience as permission to add any of these.

## Constraints and dependencies

### Client-provided inputs

The client must provide or confirm:

- complete project source, images/assets, editable designs, setup/deployment files, organization content, and application links
- service invitations for hosting, database, file storage, domain, code repository, and the existing Firebase project
- Firebase access covering Authentication, database/storage, security rules, hosting settings, and any existing server/function code
- Firebase billing setup required for live payment confirmation and image uploads
- an activated payment-provider account that supports a PHP10 GCash checkout with automatic confirmation
- any required secrets privately, not in committed files

The client group is responsible for finding users and paying customers. Provider transaction fees and hosting/storage charges are paid through the client service accounts.

### Payment-provider evidence

PayMongo is the intended provider because public documentation reviewed on 2026-10-06 showed that PayMongo supports GCash in hosted checkout, webhook confirmation, and payment amounts below PHP10. The current public evidence is time-sensitive and must be rechecked during implementation.

Official PayMongo sources reviewed:

- Pricing: <https://www.paymongo.com/en/pricing>
- Create PaymentIntent API: <https://docs.paymongo.com/reference/create-a-paymentintent.md>
- Create Checkout Session API: <https://docs.paymongo.com/reference/create-a-checkout.md>
- Hosted Checkout quick start: <https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start.md>
- Webhook events: <https://docs.paymongo.com/docs/developer-tools-webhooks-events.md>
- Testing: <https://docs.paymongo.com/docs/payment-acceptance-testing.md>
- Account setup: <https://docs.paymongo.com/docs/account-settings-account-setup.md>

Public pricing at retrieval time listed GCash e-wallet payments at **2.23% VAT-exclusive** and no Standard setup/monthly/hidden fees. A PHP10 payment would therefore have an estimated fee of about **PHP0.25** and estimated net of about **PHP9.75**, assuming VAT and centavo rounding consistent with PayMongo samples. This is an estimate only, not a fee-free promise or proof that PayMongo is cheapest.

### Delivery context

The supplied overview states a fixed development fee of **PHP3,000**, with first and final payments split around development start and handover, plus preview/final delivery dates from the current quote. Those business terms are context for planning; feature completion is judged against the final scope and confirmed amendments above.

### Technical direction

- **Agreed constraint:** use the existing Firebase project for accounts and saved records, with project file storage for images.
- **Known access context:** Firebase administrator access is available, but actual configuration still needs inspection before implementation claims can be made.
- **Active implementation:** the approved MVP foundation uses React, TypeScript and Vite for the frontend under `app/frontend`, with Firebase/Express backend code under `app/backend`.
- **Boundary:** this PRD does not define detailed frontend/backend architecture, database schema, payment webhook design, or deployment scripts.

### Repository intake guidance

Suggested repository structure remains:

- `app/` — future application source once implementation begins.
- `docs/client-scope/` — agreed scope, requirements, client notes, hosting context, and the supplied current-draft source for intake/reference.
- `docs/design-system/open-design/` — future Open Design outputs.
- `docs/agent-workflow/` — agent-facing workflow notes and implementation plans.

## High-level implementation phases

These are planning boundaries only, not a backend/frontend design.

1. **Alignment and design intake:** approve this PRD, review any Open Design output, and confirm current service access.
2. **Project foundation:** decide whether/when to migrate from the static draft to a framework; set up the approved project structure without changing agreed scope.
3. **Access foundation:** implement verified payment before account creation, manual six-month renewal/expiry behavior, roles, owner-approved officer access, payment status visibility, and permission enforcement.
4. **Core content workflows:** implement organization directory/profiles, announcements, image handling, personal and organization settings, and responsive UI states.
5. **Operational workflows:** implement applications, calendar/date entries, meeting requests, and officer dashboard sections.
6. **Hardening and handover:** validate acceptance checks, fix refresh/sign-out/another-device consistency, verify private-record access, test a real PHP10 payment, deploy, and write setup/use instructions.

## Remaining verification items

No product conflicts remain from the confirmed decisions above. The remaining items are implementation prerequisites and external validations, not permission to expand scope:

1. **PayMongo approval and live test:** PayMongo merchant approval and a successful live PHP10 GCash test must happen before production acceptance of paid access.
2. **Provider terms recheck:** PayMongo pricing, fees, VAT treatment, minimums, and webhook behavior must be rechecked against official sources during implementation.
3. **Firebase inspection:** existing Firebase Authentication, Firestore/database, Storage, Hosting, security rules, billing, and any function/server code still need inspection before implementation.
4. **Security enforcement:** roles, owner-approved officer access, private records, payment status, and access end dates must be enforced outside client-only UI logic.
5. **Reference-site review:** browser inspection of the classmate reference site could not be completed in this environment; perform a later visual review before final UI decisions.
