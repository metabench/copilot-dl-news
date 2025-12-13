# Working Notes – Architectural Contracts Docs

- 2025-12-13 — Session created via `node tools/dev/session-init.js`.

## Existing material discovered
- Contract-related guidance already exists across:
	- `docs/DATABASE_ACCESS_PATTERNS.md` (DB lifecycle + helper conventions)
	- `docs/SERVICE_LAYER_ARCHITECTURE.md` (routes ↔ services ↔ repos, DI)
	- `docs/CHANGE_PLAN.md` and `docs/CRAWL_REFACTORING_TASKS.md` (explicit service contracts + injection/seams)

## Work performed
- Created `docs/arch/` and added canonical contract docs:
	- `docs/arch/README.md`
	- `docs/arch/CONTRACTS_OVERVIEW.md`
	- `docs/arch/CONTRACTS_DB_ACCESS.md`
	- `docs/arch/CONTRACTS_UI_QUERY_MODULES.md`
	- `docs/arch/CONTRACTS_SERVICE_LAYER.md`
	- `docs/arch/CONTRACTS_SERVER_LIFECYCLE_CHECK_MODE.md`
	- `docs/arch/CONTRACTS_TELEMETRY_SERVER_STANDARD.md`
	- `docs/arch/CONTRACTS_TELEMETRY_CRAWLER_EVENTS.md`
- Wired the new section into `docs/INDEX.md`.
- Updated `.github/agents/🧭 Architecture Contract Keeper 🧭.agent.md` to point to `docs/arch/`.

## Enforcement added
- Added focused contract tests:
	- `tests/ui/server/serverStartupCheckUtility.test.js`
	- `tests/db/sqlite/ui/urlListingNormalized.contract.test.js`
- Added small fixture servers used by the startup-check test:
	- `tests/fixtures/servers/minimalExpressServer.js`
	- `tests/fixtures/servers/serverStartupCheckRunner.js`

## Validation executed
- `tests/ui/server/serverStartupCheckUtility.test.js`
- `tests/db/sqlite/ui/urlListingNormalized.contract.test.js`
- `tests/ui/server/serverTelemetryStandard.test.js`

## Notes
- PowerShell output redirection (`> file.json`) writes UTF-16LE by default. If capturing `--json` CLI output for later parsing, prefer:
	- `cmd /c "... --json > tmp\\out.json"`
	- or `Out-File -Encoding utf8`.
