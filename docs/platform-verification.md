# Full platform verification

The suite tests the actual Next.js → Go → PostgreSQL stack. Each run uses a database ending in `_test` and a fresh random schema. Browser writes pass through the application's Next.js `/api` proxy. Successful responses and database persistence are not mocked.

Verified on **18 November 2026**: **15 Go test cases and 28 browser tests passed**, with no failures or skipped browser tests. `go vet`, TypeScript and the optimized Next.js build passed. After refining the arrival lock for compatibility with inventory/audit foreign keys, the full field lifecycle and restart/persistence checks passed again. Direct PostgreSQL checks found zero negative balances, duplicate open attendance, completed shifts with pending/returned reports, or unreconciled completed shifts. The full-suite API restart retained its session, nine campaigns, fourteen reports and one uploaded image. See [the machine-readable result summary](platform-verification-results.json).

The fixes are saved in source and verified on the isolated API. Automatic approval review blocked replacement/restart of the existing local API, returning only **“blocked by policy”**. The running API on port 8080 therefore still needs a restart to activate backend fixes and the demo reconciliation. Two final REA scenarios confirm that the public frontend remains available after the build; these are read-only UI observations, not a claim that the blocked API update occurred.

## Coverage

| Area | Checks |
| --- | --- |
| All ten workspace pages | Rendering, loaded artwork, active navigation, search/empty states, filters, card/table/board switches and horizontal overflow |
| Mobile and languages | Every operational route in Persian RTL, the complete field workflow at mobile size, English LTR, persisted language and a separate UTC browser timezone |
| Dashboard/utilities | Chart ranges, campaign tabs, service links, activity/audit history, search/keyboard shortcut, refresh, notifications, help and account |
| Authentication/access | Rejected and accepted password login, sign-out/reload, HttpOnly sessions, expiry, five role identities/scopes, three supported demo switch buttons and forbidden writes/exports |
| Base data/planning | Client → brand → product forms, person creation, campaign creation/status changes, locations, timed shifts, assignments and readiness |
| Attendance | Browser GPS arrival/departure, outside-geofence rejection, accuracy validation, exclusive concurrent arrivals, late checkout and date filters |
| Inventory | All five movement kinds, balance reconciliation, overdraw rejection, concurrent spending protection, ledger views and report locks |
| Evidence | Invalid files and truncated PNG rejection, valid PNG upload, authenticated image fetch, gallery display and retained files after API restart |
| Issues/reports | Urgent issue creation/resolution, submission rejection before checkout, pending locks, approval rejection with urgent issues, return/feedback/resubmission, final approval and completed controls |
| Export/persistence | Real UTF-8 CSV download and stored values; direct PostgreSQL audit/invariant queries; session, records and files retained across Go API restart |
| Validation/routing | Required fields, invalid dates, duplicate clients, oversized targets, strict JSON framing, unknown routes and production-disabled demo login |

GPS is emulated through the browser API, while Go still validates coordinates, distance, accuracy and server time. One explicitly labeled recovery test injects a 503 into the follow-up workspace GET after the real PostgreSQL write commits.

## Fixed defects

- Campaign day boundaries now use `Asia/Tehran`. Shift inputs explicitly use Tehran time and preserve their UTC instants even in a browser configured for another timezone.
- A person's row serializes concurrent check-ins across shifts, preventing two active arrivals. Its non-key lock remains compatible with inventory and audit foreign-key references, covered by a separate regression.
- Pending reports freeze staffing, new arrivals, readiness and inventory. Corresponding unavailable controls are disabled or hidden.
- Existing attendance can be checked out after the arrival window, with valid GPS at the point. A forgotten checkout no longer becomes impossible to close just because time elapsed.
- Shift locks serialize issue changes with review. Completed shifts reject new issues; urgent issues on approved shifts remain resolved.
- Full JPEG/PNG decoding rejects corrupt image contents before any file or evidence row is written.
- JSON followed by malformed trailing bytes is rejected. Excessive shift targets return a validation error and have matching form bounds.
- Login attempts are reserved atomically, preserving the ten-attempt limit under concurrent requests.
- Expired sessions clear authenticated content and remain signed out after reload. Session revisions prevent stale in-flight reads from restoring signed-out data.
- Committed writes remain successful when the subsequent refresh fails. A persistent notice confirms the save and offers refresh; uploads use the same mutation path.
- Idempotent demo-only reconciliation repairs identifiable original sample report states, historical demo attendance and duplicate open demo arrivals. User-created records are retained and covered by a regression test.

## Reproduce

With local PostgreSQL available and `.env` configured:

```powershell
.\scripts\test-platform.ps1
```

The default run performs Go tests and `go vet`, starts an isolated Go API on 8081, runs Playwright against Next.js on 3001, checks TypeScript, builds production output, verifies PostgreSQL invariants and restarts the test API to verify persistence. It stops its owned processes and drops only its generated schema in `finally`. Test uploads and logs remain under ignored `.local/qa`. The application on 3000/8080 is independent of these test records.

```powershell
# Backend only
.\scripts\test-platform.ps1 -BackendOnly
# Focused browser checks
.\scripts\test-platform.ps1 -SkipChecks -PlaywrightArgs auth.spec.ts,interactions.spec.ts
```

`TEST_DATABASE_URL` can select another prepared database whose name ends in `_test`. This computer uses PostgreSQL 16 CLI tools and installed Chrome; adjust their location/channel in the script/configuration if needed. `.next-e2e` and a separate TypeScript configuration isolate browser-test build output.

The latest browser run is in `web/test-results/platform-results.json`, with an HTML report in `web/playwright-report`; failure screenshots/traces are retained. The complete 28-case run is archived in `.local/qa/full-platform-browser-results.json`, and the later field-lifecycle recheck is identified separately in the compact checked-in `platform-verification-results.json`. Local PostgreSQL/restart evidence and console transcripts are retained under `.local/qa`.

These are local functional, integration, concurrency and recovery checks. Physical device GPS/camera, the external map provider, production infrastructure and production load are outside this automated run.
