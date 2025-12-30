# Session Summary – Single UI app cohesion  next steps

## Accomplishments
- Made `npm run schema:check` stable on Windows by normalizing CRLF/LF in drift hashing.
- Made `npm run diagram:check` deterministic and non-hanging by limiting the check artifact to the DB section.
- Hardened startup verification (`--check`) across key UI servers with port overrides:
	- Unified shell (`src/ui/server/unifiedApp/server.js`)
	- Ops Hub (`src/ui/server/opsHub/server.js`)
	- Quality Dashboard (`src/ui/server/qualityDashboard/server.js`)
- Added focused Jest coverage to prevent unified shell sub-app registry regressions.
- Added a durable workflow doc for “Single UI App Cohesion” and linked it from the docs index.

## Metrics / Evidence
- Validation ladder evidence is recorded in `WORKING_NOTES.md`.
- Commands:
	- `npm run schema:check`
	- `npm run diagram:check` (writes `diagram-atlas.check.html`)
	- `node src/ui/server/unifiedApp/server.js --check --port 3055`
	- `node src/ui/server/opsHub/server.js --check --port 3056`
	- `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path data/news.db`
	- `npm run test:by-path tests/tools/__tests__/schema-sync.line-endings.test.js tests/ui/unifiedApp.registry.test.js`

## Decisions
- See `DECISIONS.md` (2025-12-30 entries).

## Next Steps
- Consider adding a cheap invariant check for unified shell API output (`/api/apps`).
- Continue extracting router factories for embedded apps where feasible (without retiring standalone servers).
