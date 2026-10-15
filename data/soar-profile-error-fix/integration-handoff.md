# Profile-save error fix: integration handoff

## Implementation

- Fix commit: `9d9796c` — `Fix profile save and safe error handling`
- Branch: `fm/soar-profile-error-fix`, based on the reconciled local `fm/soar-api-integration` commit `db51eae`.
- The fix commit changes:
  - `app/backend/src/errors.ts`
  - `app/backend/src/http/api.ts`
  - `app/backend/src/identity/accountSettings.ts`
  - `app/backend/test/http.routes.test.ts`
  - `app/frontend/src/context/AuthContext.tsx`
  - `app/frontend/src/lib/apiClient.ts`
  - `app/frontend/src/lib/apiClient.test.ts` (new)
  - `app/frontend/src/lib/backendGateway.test.ts`
  - `app/frontend/src/lib/backendGateway.ts`
  - `app/frontend/src/lib/contracts.ts`
  - `app/frontend/src/lib/fixtures.ts`
  - `app/frontend/src/lib/safeErrors.test.ts`
  - `app/frontend/src/lib/safeErrors.ts`
  - `app/frontend/src/lib/storageUploads.ts`
  - `app/frontend/src/pages/settings/AccountSettingsPage.test.tsx`
  - `app/frontend/src/pages/settings/AccountSettingsPage.tsx`
  - `app/frontend/src/test/createMockGateway.ts`

## Cause and counterfactual

The account settings form calls `AuthContext.updateDisplayName`, which calls the production gateway and `POST /account/display-name`. The backend service rejects a name change during the 30-day cooldown and built the error message by concatenating an ISO `nextChangeAllowedAt` timestamp. `safeErrorMessage` previously passed through `.message` for unknown non-Firebase codes, so the settings alert could display an unformatted serialized timestamp. The same helper also passed through arbitrary provider, backend, and unexpected exception messages. For invalid names the API returned a generic top-level message plus raw Zod field details; the settings alert did not translate the `displayName` field into useful correction guidance.

There was a separate confirmed success-contract defect in the same path: the API returns `{ displayName, nextChangeAllowedAt }`, but the gateway typed that partial DTO as `RawUserSession` and ran it through `mapSession`. That could replace the actual session with missing identity/access fields and default normalization. The gateway also called Firebase client `updateProfile` before asking the backend to save, so a backend rejection could leave Auth's profile name changed even though the canonical account save had failed.

Counterfactual regressions now keep the actual API response DTO as `NameChangeResult`, merge only its canonical `displayName` into the existing full session after the API succeeds, and assert no client Auth mutation occurs before or after a rejected request. Focused UI tests cover a successful save, name-field validation, cooldown display, provider failure, markup escaping, preserved retry input, and button recovery.

## Error and save contract

- `POST /account/display-name` continues to return its existing successful DTO: `{ displayName, nextChangeAllowedAt }`.
- A cooldown error uses a plain-language message and carries `nextChangeAllowedAt` as structured data. The frontend formats only a strictly shaped ISO value with the visitor's `Intl.DateTimeFormat` locale/time zone. Invalid/missing values fall back to the plain-language cooldown guidance; the raw timestamp and arbitrary error text are never rendered.
- `validation_problem` errors are mapped from allow-listed field names to static, useful instructions (including the name length limits); Zod issue text is not displayed.
- Known Firebase/application failures use fixed safe copy. Arbitrary or unknown coded/uncoded provider, API, and unexpected errors use the caller's recovery fallback. Only explicitly application-authored `UserFacingError` messages retain their text.
- On failure the settings form keeps the entered name for correction/retry, announces the safe error, and reenables its save button. On success it adopts the canonical saved name and retains the rest of the session.
- No registration, role, department, privilege, or editable-profile-field contract changed. No general date/time formatting redesign was made.

## Evidence and validation

- Traced the account settings form, AuthContext error handling, production gateway, API client, `POST /account/display-name`, Zod name schema, cooldown branch, and the API response DTO.
- Read-only local checks found the API-backed preview responding at `http://127.0.0.1:45656/`, the local API health route responding successfully, and the Auth emulator ready. A sign-in with the synthetic `officer@example.test` emulator account and protected `GET /session` succeeded. No account field was changed.
- Repeated a non-mutating invalid-name API probe twice with that active shared tester: both returned HTTP 400, `code: validation_problem`, and only the `displayName` field. This confirms the local API path and repeatability for the invalid-input case; it did not prove what input the original user typed.
- Inspected source and exercised the cooldown sanitizer counterfactual. The new UI/API/gateway tests cover the valid-save contract, error mapping, and recovery paths, but could not be run in this copy: `vitest` and `tsc` are not installed and no package/tool installation was performed. The parent pipeline owns full validation.
- A dependency-free Node 24 TypeScript-strip check ran six assertions for localized cooldown formatting, malformed-date fallback, Zod redaction, provider fallback, unexpected-error fallback, and preservation of trusted app copy: passed. An earlier manual check also confirmed the `internal` and `TypeError` recovery fallbacks.
- `git diff --check`: passed.
- Impeccable detector: `/home/gab/.pi/agent/skills/impeccable/scripts/impeccable detect --json app/frontend/src/pages/settings/AccountSettingsPage.tsx` returned `[]`.
- No rendered-browser E2E was run: the browser attachment is unavailable, and no browser framework was installed or introduced.

## Limits and handoff

The account's cooldown timestamp could not be safely inspected through the current worktree (the backend SDK dependency is absent here and the Firestore document read timed out). The active synthetic tester identities are being edited by others, so no valid production-client save was attempted; restoring after a successful save would itself be blocked by the 30-day cooldown. The existing seed command rewrites multiple shared fixtures and was not run. There is no task-scoped diagnostic identity helper in this copy. The literal time issue is present in the name cooldown source path; the user's exact input and account cooldown state remain unconfirmed, and the running API preview was not reloaded because only the API owner may do that.

API owner handoff: after combining this commit, verify one successful real production-client/API save using an isolated task-owned synthetic fixture if an approved scoped setup exists. Do not use the active shared tester names. The parent owns any Function reload/publication, combined tests, review, and final no-mistakes pipeline.
