# SOAR — High-level project overview

Read this overview alongside the Project Scope and Acceptance. It explains the purpose and direction of the application. The scope defines the included features, detailed rules and completion checks; the quote defines the fee, payment terms and schedule.

This overview is based on the current source documents listed below. Use the final scope and current quote for decisions that have become more specific since the client filled in the original brief.

## Application goal

**SOAR means Student Organizations and Allied Resources.** It is a hosted website that brings campus organization information, announcements, recruitment details and available meeting dates into one place.

Students should be able to find organizations, follow their updates, understand how to apply and track their application progress. Organization officers should be able to keep their information current, publish announcements, manage applicants and respond to meeting requests. Basic outside users should be able to view organization information and request meetings.

The client wants both a working demonstration and actual use, including real users and actual paying customers. The client group is responsible for finding those users and customers. The development work provides the functioning application and payment flow described in the scope.

## Users and access

- **Students:** browse organizations and announcements, interact with posts, follow application instructions, track their applications and meeting requests, and manage their account details.
- **Organization officers:** manage their own organization's profile, recruitment information, posts, applicants, dated events and meeting requests through clearly labelled dashboard sections.
- **Basic outside users:** access organization information, updates and meeting requests through an account.

Each account uses the pages and controls appropriate to its role. Private application, meeting and payment records must be visible only to the appropriate accounts. Officers manage only the organization linked to their account.

## Direction of the work

Improve the existing website and reuse its existing Firebase project for accounts and saved records, with file storage for images.

The included work covers:

- A consistent layout for phones and computers, with readable text, clear navigation, properly sized images, usable forms and tables, simple transitions, and loading, empty and error messages.
- Registration, sign-in, sign-out, email password recovery and existing account settings.
- Organization profiles and a directory searchable by name.
- Organization announcements with optional images, likes and comments.
- Recruitment requirements, external application links and a student progress tracker.
- A dated list of organization events and available interview or meeting dates.
- Meeting requests, officer decisions and request-status tracking.
- Officer controls for the organization's information and main tasks.
- Organization logo and announcement image uploads, with previews and file checks.
- Paid annual access, reliable saving, account permissions and hosted delivery.

The website should keep information correct after refresh, sign-out and use on another device. Updates should appear consistently wherever the same information is shown.

## Main workflows

**Organization updates:** officers update their organization's profile and publish announcements. Users see the posts in the main feed and on the organization's profile, and can like or comment on them.

**Applications:** an organization supplies its requirements, instructions and external form link. A student completes the external form and confirms submission in SOAR. Officers check the responses in the existing form or Google Sheet and update the application stage. The student sees the resulting progress in SOAR. Opening a form link alone does not count as a completed submission.

**Events and meetings:** officers maintain their organization's dated entries. A user chooses a posted meeting or interview entry and requests a date and time. The responsible officer approves or declines the request, and the user can see that decision. A pending request is not a confirmed booking.

## Paid access

Access costs **₱2 per account for one year from confirmed payment**, through one payment provider supporting GCash.

- New users pay before creating an account and accessing the main application pages.
- Payment confirmation is automatic and must be linked to the correct registration or renewal.
- Pending, failed or cancelled payments do not unlock registration or the main pages.
- Existing accounts require active paid access. Users make another payment themselves when their access expires; there is no automatic yearly charge.
- Expiry restricts access while retaining the account and saved records for renewal.
- Entry, sign-in, payment, renewal and password recovery remain available while the main pages are locked.

Users can see their payment status and access end date, but cannot change those values themselves. An actual successful payment is part of the completion checks.

## Commission and schedule

The fixed development fee is **₱3,000**:

- **₱1,500 first payment:** this week, before development starts.
- **₱1,500 final payment:** after the final review, before handover.

The current quote lists these dates:

- **First preview:** October 10, 2026.
- **Second preview:** October 14, 2026.
- **Final delivery:** October 17, 2026.

There are two small revision rounds, one at each preview. Corrections to agreed functionality are included for 14 days after handover. Preview dates may change depending on developer and client availability. Additional features require a separate agreement.

Work starts after the first payment and receipt of all project files and account access. Provider transaction and hosting/storage charges are paid through the client's service accounts.

## Client inputs and finished output

The client supplies the complete project ZIP or repository, source code, assets, editable designs, setup/deployment files, organization content and application links. The developer needs access to every service used for the project, including the existing Firebase project, and an activated payment-provider account supporting the ₱2 checkout. The required Firebase billing setup must also be available for live payment confirmation and image uploads.

Service access is provided through invitations. Required secrets are shared privately.

The finished output is the hosted website, complete updated source files and short instructions for setup, account roles, payments and the main tasks. Completion is assessed against the checks in the Project Scope and Acceptance, including phone/computer usability, saved records, appropriate access, application tracking, meeting decisions, image uploads and a real successful ₱2 payment.

## Source documents

- [Client project brief — Project SOAR](https://docs.google.com/document/d/1colzxbEjLxXXPmKEuWQNvB6pSFdPhxQKjXQubTfEi90/edit): the application's purpose, intended users and desired outcome.
- [Project Scope and Acceptance — Final](https://docs.google.com/document/d/1W52-l8XDTxLz9zhtbC_a3SUvyFGsMxK0G4ih42U8If0/edit): the current feature boundaries, detailed behavior, required inputs and completion checks.
- [Quote and Working Agreement](https://docs.google.com/document/d/1ACRZZn3jn9zYa98hRmNCAKlek5J0oU8axXJ409oXEjQ/edit): the current development fee, payments, schedule and correction terms.
