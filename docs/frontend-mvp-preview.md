# Frontend MVP preview checklist

This checklist covers the current React/Vite frontend preview and integration boundary.
Fixture mode is opt-in local sample data and is not production persistence.
Production mode requires configured Firebase public web config plus `VITE_SOAR_API_BASE_URL`.

## Local fixture preview

Start the UI-only preview from `app/frontend`:

```bash
VITE_SOAR_USE_FIXTURES=true npm run dev -- --host 127.0.0.1
```

Use these labelled fixture accounts with any password:

- `student@example.edu` shows active student browsing, applications and meeting tracker rows.
- `officer@example.edu` shows active student access plus a Robotics Guild officer grant.
- `sponsor@example.com` shows sponsor browsing and meeting requests without application tools.
- `expired@example.edu` shows the paid-access expiry lock and renewal entry point.
- `unverified@example.edu` shows the email-verification gate.

## Manual preview path

1. Sign in as `student@example.edu`.
2. Browse announcements, directory, a Robotics Guild profile, applications and meetings.
3. Confirm that the external-application button stays locked until the external form link is activated.
4. Sign out and sign in as `sponsor@example.com`.
5. Confirm sponsors can browse organizations and request meetings, but cannot access application tools.
6. Sign out and sign in as `officer@example.edu`.
7. Open the officer dashboard and review profile/recruitment, announcement, applicant, date-entry and meeting-decision sections.
8. Sign out and sign in as `expired@example.edu`.
9. Confirm main app routes lock while access/renewal settings remain reachable.

## Automated frontend checks

Run from the repository root:

```bash
npm --prefix app/frontend run typecheck
npm --prefix app/frontend test
npm --prefix app/frontend run build
```

## Remaining external prerequisites

- Content and request backend PRs must merge before production workflow calls can be exercised end to end.
- Firebase public web config and a local or deployed backend API base URL are required for production mode.
- Payment-provider onboarding, live PayMongo keys and real PHP10 charges remain out of scope for this preview.
- User-participating end-to-end testing should wait until the user is ready to inspect the integrated app.
