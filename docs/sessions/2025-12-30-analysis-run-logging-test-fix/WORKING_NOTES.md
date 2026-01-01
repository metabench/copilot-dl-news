# Working Notes – Fix analysis-run.logging test: FTS shadow tables in schema

- 2025-12-30 — Session created via CLI.

## Failure reproduced

- Command:
	- `npm run test:by-path src/tools/__tests__/analysis-run.logging.test.js`
- Initial failure:
	- `SqliteError: object name reserved for internal use: articles_fts_config`
	- Root cause: `src/db/sqlite/v1/schema-definitions.js` included explicit `CREATE TABLE articles_fts_config/_data/_docsize/_idx` statements (FTS shadow tables).

## Fix 1 — Filter FTS shadow tables during schema sync

- Updated `tools/schema-sync.js`:
	- Filter out `<virtual_fts>_(config|data|docsize|idx)` rows from `sqlite_master` extraction.
	- Normalize `CREATE VIRTUAL TABLE` → `CREATE VIRTUAL TABLE IF NOT EXISTS`.
- Regenerated schema:
	- `npm run schema:sync`
	- `npm run schema:check` ✅

## Failure 2 — Schema init rerun not fully idempotent

- After fix 1, analysis-run still exited non-zero during domain analysis due to schema init being re-run from a feature module.
- Observed error (manual repro via `node src/tools/analysis-run.js --verbose`):
	- `index idx_article_xpath_patterns_domain_xpath already exists`
	- Root cause: schema sync didn’t normalize `CREATE UNIQUE INDEX ...` to include `IF NOT EXISTS`, and triggers were emitted without `IF NOT EXISTS`.

## Fix 2 — Normalize UNIQUE indexes + triggers

- Updated `tools/schema-sync.js`:
	- Normalize `CREATE UNIQUE INDEX` → `CREATE UNIQUE INDEX IF NOT EXISTS`.
	- Normalize `CREATE TRIGGER` / `CREATE TEMP TRIGGER` → include `IF NOT EXISTS`.
	- Apply trigger normalization during schema generation.
- Regenerated schema:
	- `npm run schema:sync`
	- `npm run schema:check` ✅

## Failure 3 — Domain analysis crash (real bug)

- Observed runtime error while running `analysis-run`:
	- `TypeError: Cannot read properties of undefined (reading 'normalizeHostVariants')`
	- Root cause: `src/db/sqlite/v1/SQLiteNewsDatabase.js` imported utilities as `const { UtilityFunctions } = require('./UtilityFunctions')` but the module exports a plain object.

## Fix 3 — Correct UtilityFunctions import

- Updated `src/db/sqlite/v1/SQLiteNewsDatabase.js`:
	- `const UtilityFunctions = require('./UtilityFunctions');`

## Test update — Seed via normalized API

- Updated `src/tools/__tests__/analysis-run.logging.test.js`:
	- Use `db.upsertArticle({ ... }, { compress: false })` instead of writing legacy `articles/fetches` rows.

## Validation

- Commands:
	- `npm run schema:sync`
	- `npm run schema:check`
	- `npm run test:by-path src/tools/__tests__/analysis-run.logging.test.js`
- Result:
	- analysis-run logging test ✅ PASS
