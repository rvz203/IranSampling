# FaraCode Sampling Operations

A Persian-first operations workspace built from the six-page FaraCode Sampling Operations Proposal. Next.js, TypeScript and React provide the interface; Go provides the API and operational rules; PostgreSQL stores all records. The interface includes English labels and an LTR layout in workspace settings.

The Android and iOS field app connects samplers and supervisors to the same workspace. It includes username or email sign-in, shift-specific location sharing, a persistent location and photo queue, and the existing field and review workflows. Administrators manage credentials in **People & teams** and view shared locations in **Operations map**. [Field app setup and build instructions](mobile/README.md)

Open a campaign to see its shifts, team conversation, and operational history. Administrators and operations managers can access any campaign. Supervisors and samplers can message campaigns linked to their assigned shifts. Messages and operational events stay in PostgreSQL after a campaign is completed.

The panel and field app use the same self-hosted MapLibre map of Iran. OpenStreetMap vector tiles, fonts, icons and JavaScript are served by the Go API. See [Iran map setup](docs/iran-map.md) for the map data bundle and deployment.

The interface now uses a premium monochrome design, original FaraCode branding and imagery, and responsive operational workspaces. The requested Uber reference was inspected with the installed REA plugin. See [design decisions and visual verification](docs/premium-design.md) and the screenshots in `docs/screenshots`.

All nine operational pages now include dedicated artwork and custom SVG icons, with campaign/location/profile/catalog cards, a shift date agenda, inventory breakdown, issue board and report review cards. See [operational page details, assets and checks](docs/operational-pages.md).

## Run on this computer

The prepared workspace has an ignored `.env`, an isolated PostgreSQL cluster in `.local/pgdata` on **55432**, a Go API on **8080**, and a Next.js frontend on **3000**. It does not use or modify the pre-existing PostgreSQL service on 5432.

```powershell
.\scripts\start.ps1
```

Open **http://127.0.0.1:3000**. In development, the workspace opens using a clearly marked demo account. In settings, switch between administrator, supervisor, and sampler to inspect role-specific workflows. Alternatively, sign in manually:

| Role | Email | Local demo password |
| --- | --- | --- |
| Administrator | admin@faracode.local | Demo@12345! |
| Operations manager | manager@faracode.local | Demo@12345! |
| Coordinator | coordinator@faracode.local | Demo@12345! |
| Supervisor | supervisor@faracode.local | Demo@12345! |
| Sampler | sampler@faracode.local | Demo@12345! |

Demo records are inserted once, on an empty database, when `ENABLE_DEMO=true` and `APP_ENV` is not `production`. Seed dates are relative to the first startup. Records persist across restarts; the seed does not reset your work.

To stop, use Ctrl+C for the frontend, then `./scripts/stop.ps1` for the script-owned API and isolated database. A Go API started manually with `go run` should be stopped in its own terminal.

## Run elsewhere

Requirements: Go 1.25+, Node.js 20.9+ (Node 22 recommended), npm, PostgreSQL 16+.

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to an existing empty application database. Create the database first; the API applies its schema automatically in a transaction.
2. In `backend`, run `go run ./cmd/api`.
3. In `web`, run `npm ci`, then `npm run dev`.
4. Visit http://127.0.0.1:3000. All browser requests use the same-origin Next.js `/api` proxy. When the Go API is elsewhere, set `API_URL` in `web/.env.local` before starting/building Next.js.

## Containers

Copy `.env.example` to `.env`, replace `POSTGRES_PASSWORD` with a long URL-safe password, then:

```sh
docker compose up --build
```

Open http://127.0.0.1:3000. Only the frontend is published, bound to loopback. PostgreSQL and the API remain on an internal Docker network. Named volumes persist database records and uploaded evidence. Docker configuration is included; Docker is not installed on the development computer, so a container build has not been executed here.

For a real deployment use a **fresh database**, set `APP_ENV=production`, `ENABLE_DEMO=false`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` of at least 12 characters. Demo authentication is disabled in production. Put the frontend behind an HTTPS reverse proxy: production session cookies use `Secure`. Set the API proxy address at web build time. Back up both PostgreSQL and the evidence volume. Do not reuse the demonstration database or accounts for production.

## Implemented workflows

- Dashboard with database-derived metrics, interactive distribution chart, daily goal, point map, campaign progress, activity history, and notifications.
- Campaign creation, brand/product validation, campaign status changes, and campaign detail workspaces.
- Client, brand, product, location and staff creation. Administrator, manager, coordinator, supervisor and sampler permissions are enforced by Go.
- Shift scheduling, staffing requirements, supervisor selection, assignment capacity and overlapping-shift checks.
- Dedicated shift workspace for instructions, directions, team attendance, readiness, distribution, stock, photos, issues and reporting.
- Browser GPS check-in/out, server timestamps, geofence validation, and accuracy checks. Location denial and network failures are shown in the interface.
- Transactional inventory ledger: initial, added, distributed, damaged and returned. Row locks prevent concurrent overspending. Pending/approved reports freeze the ledger.
- Authenticated JPEG/PNG evidence upload and viewing, with file type, dimensions and size validation.
- Prioritized issues with owners and open/in-progress/resolved statuses.
- Report submission, supervisor approval or return with feedback, and resubmission. Final approval requires a zero closing balance and no unresolved urgent issues.
- Excel-compatible UTF-8 CSV export filtered by city and period, with spreadsheet-formula injection protection.
- Secure opaque database sessions, bcrypt passwords, write-request protection, and transactional audit events.
- Persian RTL and English LTR controls, self-hosted fonts, keyboard search (`Ctrl/Cmd + K`), native accessible dialogs, focus states, responsive layouts and reduced-motion support.

## Verification

Run the complete isolated platform suite on this computer:

```powershell
.\scripts\test-platform.ps1
```

It exercises the actual Next.js → Go → PostgreSQL workflows, checks the production build, validates database invariants and verifies persistence across an API restart. See [coverage, fixed defects and results](docs/platform-verification.md). Test records use a separate database/schema and are removed after the run.

```sh
# backend: unit checks and PostgreSQL integration workflow
cd backend
go test ./...
# Set TEST_DATABASE_URL to a database whose name ends in _test for the full integration test.
# It creates and removes only its own randomly named schema.
go vet ./...

# frontend
cd ../web
npm run typecheck
npm run build
```

The PostgreSQL integration test exercises login, session expiry/logout, access scoping, campaign/product consistency, GPS rejection and acceptance, check-in/out, concurrent inventory overdraw prevention, upload validation, report locking, return/resubmission, approval, audit persistence, and CSV export.

See [the requirement review](docs/requirements.md) for proposal mapping, assumptions, and the phase-one boundaries; [architecture](docs/architecture.md) documents the API and data model.
