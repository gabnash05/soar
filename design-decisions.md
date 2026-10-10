# SOAR UX flow architecture and correction plan

## Resolved product decision

- `models` means **modal dialogs** for bounded create/edit/review tasks. This permits accessible dialogs where they reduce scrolling and round-trip navigation. It does **not** mean turning every reading page, list item, or long discovery surface into a popup.

## Shared flow architecture

### 1. Three distinct surfaces, not one public-profile control hub

- **Public/member surface**: `/app/organizations/:organizationId`
  - Audience: students, sponsors, non-managing officers when browsing.
  - Jobs: understand the organization, view real logo/identity, read recruitment requirements, apply/confirm external submission, view events, request meetings via Meetings page, read announcements.
  - Management controls: no applicant review, meeting review, or profile-edit command center. A manager may see a small contextual badge that they manage the organization, but operational work moves to management/task pages.

- **Organization management surface**: `/settings/organization?organizationId=<id>`
  - Audience: officers with approved/active organization grants.
  - Jobs: select retained managed organization, edit profile/recruitment/logo, manage dated events/availability.
  - Arrival: direct desktop sidebar link and discoverable mobile link/drawer/bottom nav; no requirement to go through `View organization`.
  - Context: selected grant is always visible in the management hero/action bar and reflected in the query string for predictable refresh/back/share behavior. Backend/data client permission checks remain the authority.

- **Task review surfaces**:
  - Announcements: `/app` owns announcement creation and feed comments/likes.
  - Applications: `/app/applications` owns student tracker and officer applicant review.
  - Meetings: `/app/meetings` owns meeting requests, personal statuses, and officer meeting decisions.
  - These pages keep organization selection when needed but do not include unrelated `Manage organization` CTAs.

### 2. Navigation model

- Desktop sidebar: officers see a direct **Manage Organization** item that resolves to the selected/first approved grant's management route. The sidebar also shows a compact officer context block with the active/default grant and a direct management link.
- Mobile: officers get equivalent access through the bottom nav (short `Manage`) and the drawer. Tests must assert the destination exists for officer grants and not for sponsors/no-grant accounts.
- Multiple grants: pages with officer tasks expose one organization selector at the top of the task area. Changing it updates local task data and, for management, the URL query.

### 3. Layout model replacing card-heavy scaffolding

- Use **unboxed sections, action bars, hero identity blocks, tables/lists, and lightweight panels** as the default task architecture.
- Keep cards only where they are true contained forms/auth surfaces or exceptional state blocks.
- Public profiles and directory results use large logo/identity frames that preserve logo legibility (`object-fit: contain`) rather than tiny cropped avatars.
- Primary relevant actions appear in the first viewport: search at directory arrival, public member actions at profile arrival, applicant review at applications arrival for officers, request form/review queues at meetings arrival.

### 4. Modal model now authorized

Use accessible native `<dialog>` through a small reusable component for bounded tasks that otherwise create long inline scroll sections:

- Announcement create/edit flow from the Announcements page.
- Date-entry create/edit flow from Organization Management.
- Meeting request creation from Meetings can be dialog-triggered from an action bar when availability exists, while the status list remains readable on-page.
- Profile/recruitment/logo editing can remain an on-page form for now because it is a larger, high-context edit; do not hide the entire management page in a modal.

Dialog requirements:

- Native/maintained accessible semantics (`<dialog>`), `aria-labelledby`, clear close/cancel buttons.
- Initial focus on dialog open, focus return to trigger on close, Escape/cancel handling, scroll locking via native modal behavior, mobile max-height fit.
- Save/loading/disabled states, validation messages, and no fake custom overlay.
- Dirty input safety for cancel/close when the user has typed content.

## Prioritized correction plan

1. **Direct management navigation and retained organization context**
   - Make officer management nav route compute `/settings/organization?organizationId=<firstApprovedGrant>` where possible.
   - Strengthen sidebar officer context and bottom/drawer availability.
   - Add tests for officer, sponsor, no-grant, multiple-grant, and direct query selection.

2. **Public profile becomes public/member-facing**
   - Remove manager header buttons for Manage organization / Review applications / Review meetings from public profile.
   - Keep member actions: application confirmation, meeting request entry point, announcements/events.
   - Add tests that managers do not get a public-profile control hub.

3. **Prominent organization imagery**
   - Add large identity/logo components for directory cards and profile hero using current `logoUrl` only.
   - Preserve uncropped logo legibility with `object-fit: contain`, fallback initials/brand mark, alt text, and responsive sizing.
   - Add tests that prominent logo images use meaningful alt text and appear in directory/profile.

4. **Applications and Meetings task hierarchy**
   - Remove redundant management CTAs from Applications/Meetings headers.
   - Make officer review/task selectors focused and unboxed; keep student tracker/request statuses clear.
   - Add tests that Applications has `Find organizations` but not `Manage organization`, while officer applicant review still works.

5. **Modal-enabled scroll reduction**
   - Introduce reusable accessible dialog.
   - Move announcement composer and date entry create/edit into dialogs. If time allows, add meeting request dialog; otherwise keep request form above statuses and document remaining work.
   - Add focused tests for open, cancel/dirty safety, save, and focus return where practical under JSDOM.

6. **Verification and publication**
   - Run Impeccable detector once on changed UI targets after edits.
   - Run frontend tests/typecheck/build and fixture production build.
   - Publish hashed built assets to the existing durable preview site atomically, without restarting the host.

## Actionable pointer for firstmate

During work, explain the revision as: **SOAR will stop using the public organization page as an officer control room; officers get a direct retained Manage Organization route, while Applications/Meetings/Announcements own their own review/create tasks and prominent organization identity replaces tiny avatars.**

## Implementation outcome

- Implemented direct retained officer management navigation in desktop sidebar, mobile bottom nav, and officer grant block.
- Removed public-profile manager control hub; public profiles now keep member-facing actions and show management status only as a badge.
- Replaced workflow card scaffolding with unboxed sections, identity heroes, focused action bars, lists, and tables.
- Added prominent organization identity/logo areas for directory, public profile, and management surfaces while preserving current `logoUrl` storage behavior and legible `object-fit: contain` rendering.
- Removed redundant Manage Organization CTAs from Applications and Meetings.
- Added native accessible modal dialogs for announcement creation, meeting requests, and date-entry create/edit tasks, including dirty-close protection and focus return coverage.
- Backend/API work is already merged and not duplicated here; this revision preserves backend-enforced grant checks.
