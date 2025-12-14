# Working Notes – Fast UI verification harness (no repeated Puppeteer reloads)

- 2025-12-13 — Session created via CLI.

- 2025-12-14 — Unblocked deterministic DB fixtures.
	- Root cause: `src/db/sqlite/v1/schema.js` expected `TABLE_DEFINITIONS` / `INDEX_DEFINITIONS` / `TRIGGER_DEFINITIONS`, but `src/db/sqlite/v1/schema-definitions.js` exports raw SQL arrays + `applySchema(...)`.
	- Symptom: creating a *fresh* SQLite DB failed schema init with `Cannot read properties of undefined (reading 'filter')`, leading to many `no such table: ...` errors.
	- Fix: add a fallback path in `schema.initializeSchema(...)` that calls `applySchema(db)` when the structured definitions are missing.

- 2025-12-14 — Validation (scenario suite)
	- Scenario 001:
		- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js --scenario=001 --timeout=45000`
	- Full suite (001–003):
		- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js --timeout=60000`
	- Quiet happy-path output (still writes artifacts on failure):
		- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js --scenario=001 --quiet`
	- Dump captured browser logs/errors/network to console on scenario failure:
		- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js --scenario=001 --quiet --print-logs-on-failure`
	- Result: all scenarios passed.
